import React, { useCallback, useEffect, useRef, useState } from 'react';
import { HelpCircle, Loader2, Mail, Plus, RefreshCw, Send } from 'lucide-react';
import SettingsSubPage from '../common/SettingsSubPage';
import {
    addSupportMessage, createSupportTicket, listMySupportTickets,
    SUPPORT_CATEGORIES, SUPPORT_STATUS_LABEL,
    type MySupportTicket, type SupportStatus,
} from '../../services/supportService';

// ─── Destek Merkezi (kullanıcı) ───────────────────────────────────────────────
// Ayarlar → Destek → Yardım Merkezi. Eskiden mailto açılıyordu; artık uygulama
// içi talep akışı: talep aç → admin panel Destek Merkezi'nden yanıtlanır →
// yanıt burada dizide görünür (unread bayrağını sunucu temizler).

const STATUS_TONE: Record<SupportStatus, string> = {
    OPEN: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
    PENDING: 'text-amber-300 bg-amber-500/10 border-amber-500/30',
    RESOLVED: 'text-blue-300 bg-blue-500/10 border-blue-500/30',
    CLOSED: 'text-gray-400 bg-white/5 border-white/15',
};

const CONTACT_EMAIL = 'destek@oyna.app';

interface Props {
    open: boolean;
    onClose: () => void;
}

const SupportPage: React.FC<Props> = ({ open, onClose }) => {
    const [tickets, setTickets] = useState<MySupportTicket[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [mode, setMode] = useState<'list' | 'new'>('list');
    const [activeId, setActiveId] = useState<string | null>(null);
    // Yeni talep formu
    const [subject, setSubject] = useState('');
    const [category, setCategory] = useState('GENERAL');
    const [body, setBody] = useState('');
    const [sending, setSending] = useState(false);
    // Form/yanıt hataları KENDİ görünümlerinde gösterilir — loadError yalnız
    // liste dalında render edildiğinden oraya yazılan oluşturma hatası
    // kullanıcıya hiç görünmüyordu.
    const [formError, setFormError] = useState<string | null>(null);
    const [replyError, setReplyError] = useState<string | null>(null);
    // Dizide yanıt
    const [reply, setReply] = useState('');
    const threadEndRef = useRef<HTMLDivElement>(null);

    // Sunucunun anlamlı Türkçe mesajlarını ("En fazla 5 açık talebiniz olabilir",
    // hız limiti vb.) jenerik metinle ezme — varsa aynen göster.
    const serverMessage = (err: unknown, fallback: string): string => {
        const msg = (err as { message?: string })?.message;
        return msg && msg !== 'UNAUTHORIZED' && !/^[A-Z0-9_]+$/.test(msg) ? msg : fallback;
    };

    const load = useCallback(async () => {
        setLoading(true);
        setLoadError(null);
        try {
            setTickets(await listMySupportTickets('PLAYER'));
        } catch (err) {
            console.error('[Destek] Talepler yüklenemedi:', err);
            setLoadError('Talepler yüklenemedi. Bağlantını kontrol edip tekrar dene.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!open) return;
        setMode('list');
        setActiveId(null);
        void load();
    }, [open, load]);

    const active = tickets.find((t) => t.id === activeId) || null;

    useEffect(() => {
        threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [activeId, tickets]);

    const submitNew = async () => {
        if (subject.trim().length < 3 || body.trim().length < 10) return;
        setSending(true);
        setFormError(null);
        try {
            const id = await createSupportTicket(subject, body, category, 'PLAYER');
            setSubject('');
            setBody('');
            setCategory('GENERAL');
            await load();
            setMode('list');
            setActiveId(id);
        } catch (err) {
            console.error('[Destek] Talep açılamadı:', err);
            setFormError(serverMessage(err, 'Talep oluşturulamadı. Lütfen tekrar dene.'));
        } finally {
            setSending(false);
        }
    };

    const submitReply = async () => {
        if (!active || reply.trim().length === 0) return;
        setSending(true);
        setReplyError(null);
        try {
            await addSupportMessage(active.id, reply);
            setReply('');
            await load();
        } catch (err) {
            console.error('[Destek] Yanıt gönderilemedi:', err);
            setReplyError(serverMessage(err, 'Yanıt gönderilemedi. Lütfen tekrar dene.'));
        } finally {
            setSending(false);
        }
    };

    const fmtDate = (iso: string) => new Date(iso).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

    return (
        <SettingsSubPage
            open={open}
            onClose={activeId ? () => setActiveId(null) : mode === 'new' ? () => setMode('list') : onClose}
            title={active ? (active.subject || 'Destek Talebi') : mode === 'new' ? 'Yeni Destek Talebi' : 'Yardım Merkezi'}
            subtitle={active ? SUPPORT_STATUS_LABEL[active.status] : 'Sorununu yaz, ekibimiz uygulama içinden yanıtlasın'}
        >
            {loading ? (
                <div className="py-16 flex flex-col items-center gap-3 text-ink-4">
                    <Loader2 size={20} className="animate-spin" />
                    <p className="text-xs">Talepler yükleniyor…</p>
                </div>
            ) : active ? (
                /* ── Talep dizisi ── */
                <div className="flex flex-col min-h-full">
                    <div className="flex-1 space-y-3 pb-4">
                        <div className="flex items-center justify-between gap-2">
                            <span className={`text-[0.6875rem] font-extrabold uppercase px-2 py-1 rounded-lg border ${STATUS_TONE[active.status]}`}>
                                {SUPPORT_STATUS_LABEL[active.status]}
                            </span>
                            <span className="text-[0.6875rem] text-ink-4">{fmtDate(active.created_at)}</span>
                        </div>
                        {active.messages.map((m) => (
                            <div key={m.id} className={`flex ${m.sender_role === 'USER' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[85%] rounded-2xl px-4 py-3 border ${
                                    m.sender_role === 'USER'
                                        ? 'bg-primary/10 border-primary/25 rounded-br-md'
                                        : 'bg-surface-1 border-white/10 rounded-bl-md'
                                }`}>
                                    <p className="text-[0.625rem] font-extrabold uppercase tracking-wider mb-1 text-ink-4">
                                        {m.sender_role === 'USER' ? 'Sen' : (m.sender_name || 'OYNA Destek')}
                                    </p>
                                    <p className="text-[0.8125rem] text-white leading-relaxed whitespace-pre-wrap break-words">{m.body}</p>
                                    <p className="text-[0.6875rem] text-ink-4 mt-1.5 text-right">{fmtDate(m.created_at)}</p>
                                </div>
                            </div>
                        ))}
                        <div ref={threadEndRef} />
                    </div>

                    {active.status === 'CLOSED' ? (
                        <p className="text-[0.6875rem] text-ink-4 text-center py-3 bg-white/[0.03] border border-white/10 rounded-2xl">
                            Bu talep kapatıldı. Yeni bir sorun için yeni talep açabilirsin.
                        </p>
                    ) : (
                        <div className="sticky bottom-0 bg-bg pt-2 space-y-2">
                        {replyError && (
                            <p className="text-[0.6875rem] font-bold text-red-400 bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-2.5">
                                {replyError}
                            </p>
                        )}
                        <div className="flex items-end gap-2">
                            <textarea
                                value={reply}
                                onChange={(e) => setReply(e.target.value)}
                                rows={2}
                                placeholder="Yanıtını yaz…"
                                className="flex-1 bg-surface-1 border border-white/10 rounded-2xl px-4 py-3 text-white text-sm outline-none focus:border-primary/40 resize-none"
                            />
                            <button
                                type="button"
                                disabled={sending || reply.trim().length === 0}
                                onClick={() => void submitReply()}
                                aria-label="Gönder"
                                className="w-12 h-12 rounded-2xl bg-primary text-black flex items-center justify-center active:scale-95 transition-all disabled:opacity-40 shrink-0"
                            >
                                {sending ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}
                            </button>
                        </div>
                        </div>
                    )}
                </div>
            ) : mode === 'new' ? (
                /* ── Yeni talep formu ── */
                <div className="space-y-4">
                    <div>
                        <label className="text-[0.625rem] text-ink-4 font-bold uppercase tracking-wider ml-1">Konu</label>
                        <input
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                            maxLength={120}
                            placeholder="Örn. İade hesabıma geçmedi"
                            className="mt-1.5 w-full bg-surface-1 border border-white/10 rounded-2xl px-4 py-3 text-white text-sm outline-none focus:border-primary/40"
                        />
                    </div>
                    <div>
                        <label className="text-[0.625rem] text-ink-4 font-bold uppercase tracking-wider ml-1">Kategori</label>
                        <div className="mt-1.5 flex flex-wrap gap-2">
                            {SUPPORT_CATEGORIES.map((c) => (
                                <button
                                    key={c.key}
                                    type="button"
                                    onClick={() => setCategory(c.key)}
                                    className={`px-3 py-2 rounded-2xl text-[0.6875rem] font-extrabold border transition-all active:scale-95 ${
                                        category === c.key
                                            ? 'bg-primary text-black border-primary'
                                            : 'bg-surface-1 text-white/60 border-white/10 hover:bg-white/5'
                                    }`}
                                >
                                    {c.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <label className="text-[0.625rem] text-ink-4 font-bold uppercase tracking-wider ml-1">Sorunun</label>
                        <textarea
                            value={body}
                            onChange={(e) => setBody(e.target.value)}
                            rows={5}
                            maxLength={2000}
                            placeholder="Sorununu olabildiğince ayrıntılı anlat — maç adı, tarih, tutar gibi bilgiler çözümü hızlandırır."
                            className="mt-1.5 w-full bg-surface-1 border border-white/10 rounded-2xl px-4 py-3 text-white text-sm outline-none focus:border-primary/40 resize-none"
                        />
                    </div>
                    {formError && (
                        <p className="text-[0.6875rem] font-bold text-red-400 bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-3 leading-relaxed">
                            {formError}
                        </p>
                    )}
                    <button
                        type="button"
                        disabled={sending || subject.trim().length < 3 || body.trim().length < 10}
                        onClick={() => void submitNew()}
                        className="w-full h-12 rounded-2xl bg-primary text-black font-extrabold text-xs uppercase tracking-widest active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Talebi Gönder
                    </button>
                </div>
            ) : (
                /* ── Talep listesi ── */
                <div className="space-y-3">
                    <button
                        type="button"
                        onClick={() => setMode('new')}
                        className="w-full h-12 rounded-2xl bg-primary text-black font-extrabold text-xs uppercase tracking-widest active:scale-95 transition-all flex items-center justify-center gap-2"
                    >
                        <Plus size={16} /> Yeni Destek Talebi
                    </button>

                    {loadError && (
                        <button type="button" onClick={() => void load()} className="w-full flex items-center justify-center gap-2 text-[0.6875rem] font-bold text-red-400 bg-red-500/10 border border-red-500/20 rounded-2xl px-3 py-3">
                            <RefreshCw size={12} /> {loadError}
                        </button>
                    )}

                    {tickets.length === 0 && !loadError ? (
                        <div className="py-12 flex flex-col items-center gap-3 text-center">
                            <HelpCircle size={28} className="text-ink-4" />
                            <p className="text-sm font-bold text-gray-400">Henüz destek talebin yok</p>
                            <p className="text-[0.6875rem] text-ink-4 max-w-[240px] leading-relaxed">
                                Bir sorun yaşarsan buradan talep aç — ekibimiz uygulama içinden yanıtlar.
                            </p>
                        </div>
                    ) : (
                        tickets.map((t) => (
                            <button
                                key={t.id}
                                type="button"
                                onClick={() => setActiveId(t.id)}
                                className="w-full text-left bg-surface-1 border border-white/10 rounded-2xl p-4 hover:bg-white/5 active:scale-[0.99] transition-all"
                            >
                                <div className="flex items-center justify-between gap-2 mb-1.5">
                                    <p className="text-[0.8125rem] font-bold text-white truncate flex items-center gap-2 min-w-0">
                                        {t.unread_for_user && <span className="w-2 h-2 rounded-full bg-primary shrink-0 animate-pulse" />}
                                        <span className="truncate">{t.subject || 'Destek Talebi'}</span>
                                    </p>
                                    <span className={`text-[0.6875rem] font-extrabold uppercase px-1.5 py-0.5 rounded-md border shrink-0 ${STATUS_TONE[t.status]}`}>
                                        {SUPPORT_STATUS_LABEL[t.status]}
                                    </span>
                                </div>
                                {t.messages.length > 0 && (
                                    <p className="text-[0.6875rem] text-ink-4 truncate">
                                        {t.messages[t.messages.length - 1].sender_role === 'ADMIN' ? 'Destek: ' : 'Sen: '}
                                        {t.messages[t.messages.length - 1].body}
                                    </p>
                                )}
                                <p className="text-[0.6875rem] text-ink-4 mt-1.5">{fmtDate(t.last_message_at)}</p>
                            </button>
                        ))
                    )}

                    <a
                        href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('OYNA — Yardım Talebi')}`}
                        className="w-full flex items-center justify-center gap-2 text-[0.6875rem] font-bold text-ink-4 hover:text-white py-3"
                    >
                        <Mail size={12} /> E-posta ile yazmayı tercih edersen: {CONTACT_EMAIL}
                    </a>
                </div>
            )}
        </SettingsSubPage>
    );
};

export default SupportPage;
