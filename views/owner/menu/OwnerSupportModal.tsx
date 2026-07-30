/**
 * Saha sahibi Destek Merkezi (F5.2).
 * Eskiden yalnız bir e-posta linki + var olmayan bir WhatsApp numarası vardı;
 * oysa destek altyapısı (support_tickets + 7 RPC, rate-limit, admin kuyruğu,
 * bildirim) DB'de tamamen hazırdı ve hiçbir owner arayüzü onu çağırmıyordu.
 * Bu ekran talebi OWNER kanalıyla açar — admin tarafı Destek Merkezi'nde görür.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { HelpCircle, Loader2, Mail, MessageSquarePlus, Send, ChevronLeft } from 'lucide-react';
import { OwnerCenteredModal } from './OwnerModalFrame';
import {
  listMySupportTickets,
  createSupportTicket,
  addSupportMessage,
  SUPPORT_CATEGORIES,
  SUPPORT_STATUS_LABEL,
  type MySupportTicket,
} from '../../../services/supportService';

interface Props {
  onClose: () => void;
}

const SUPPORT_EMAIL = 'destek@oyna.app';

/** Sunucunun anlamlı Türkçe mesajını ("En fazla 5 açık talebin olabilir" vb.)
 *  jenerik metinle ezme; yalnız kod-benzeri mesajlarda fallback kullan. */
const serverMessage = (err: unknown, fallback: string): string => {
  const msg = (err as { message?: string })?.message;
  return msg && msg !== 'UNAUTHORIZED' && !/^[A-Z0-9_]+$/.test(msg) ? msg : fallback;
};

export const OwnerSupportModal: React.FC<Props> = ({ onClose }) => {
  const [tickets, setTickets] = useState<MySupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<'list' | 'new' | 'thread'>('list');
  const [activeId, setActiveId] = useState<string | null>(null);

  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('GENERAL');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [reply, setReply] = useState('');
  const [replyError, setReplyError] = useState<string | null>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setTickets(await listMySupportTickets('OWNER'));
    } catch (err) {
      console.error('[Owner Destek] Talepler yüklenemedi:', err);
      setLoadError('Talepler yüklenemedi. Bağlantını kontrol edip tekrar dene.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (mode === 'thread') threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mode, activeId, tickets]);

  const active = tickets.find((t) => t.id === activeId) ?? null;

  const submitNew = async () => {
    if (subject.trim().length < 3) { setFormError('Konu en az 3 karakter olmalı.'); return; }
    if (body.trim().length < 5) { setFormError('Mesajını biraz daha açıklar mısın?'); return; }
    setSending(true);
    setFormError(null);
    try {
      const id = await createSupportTicket(subject, body, category, 'OWNER');
      setSubject(''); setBody(''); setCategory('GENERAL');
      await load();
      setActiveId(id);
      setMode('thread');
    } catch (err) {
      setFormError(serverMessage(err, 'Talep gönderilemedi. Lütfen tekrar dene.'));
    } finally {
      setSending(false);
    }
  };

  const submitReply = async () => {
    if (!activeId || reply.trim().length < 2) return;
    setSending(true);
    setReplyError(null);
    try {
      await addSupportMessage(activeId, reply);
      setReply('');
      await load();
    } catch (err) {
      setReplyError(serverMessage(err, 'Yanıt gönderilemedi.'));
    } finally {
      setSending(false);
    }
  };

  return (
    <OwnerCenteredModal
      title={mode === 'new' ? 'Yeni Destek Talebi' : mode === 'thread' ? 'Destek Talebi' : 'Destek Merkezi'}
      onClose={onClose}
    >
      <div className="space-y-4">
        {mode === 'list' && (
          <>
            <p className="text-sm text-gray-400 leading-relaxed">
              Tesis paneli, ödeme veya rezervasyon konularında talep aç; ekibimiz uygulama
              içinden yanıtlar. Yanıt geldiğinde bildirim alırsın.
            </p>

            <button
              type="button"
              onClick={() => { setFormError(null); setMode('new'); }}
              className="w-full flex items-center gap-3 p-4 bg-emerald-500/10 border border-emerald-500/25 rounded-2xl hover:bg-emerald-500/15 transition-colors"
            >
              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-400">
                <MessageSquarePlus size={20} />
              </div>
              <div className="flex-1 text-left">
                <h4 className="text-sm font-bold text-white">Yeni Talep Aç</h4>
                <p className="text-xs text-gray-500">Konuyu yaz, ekibimiz yanıtlasın</p>
              </div>
            </button>

            {loading ? (
              <div className="flex items-center justify-center py-10 text-gray-500">
                <Loader2 size={20} className="animate-spin" />
              </div>
            ) : loadError ? (
              <p className="text-xs text-red-400 px-1">{loadError}</p>
            ) : tickets.length === 0 ? (
              <p className="text-xs text-gray-600 px-1">Henüz destek talebin yok.</p>
            ) : (
              <div className="space-y-2">
                {tickets.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => { setReplyError(null); setActiveId(t.id); setMode('thread'); }}
                    className="w-full p-3 bg-[#0A0E14] border border-white/5 rounded-2xl text-left hover:border-white/15 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-white truncate">{t.subject}</span>
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-gray-500 shrink-0">
                        {SUPPORT_STATUS_LABEL[t.status] ?? t.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      {new Date(t.last_message_at ?? t.created_at).toLocaleString('tr-TR')}
                      {t.unread_for_user ? ' · yeni yanıt' : ''}
                    </p>
                  </button>
                ))}
              </div>
            )}

            <a
              href={`mailto:${SUPPORT_EMAIL}?subject=OYNA%20İşletme%20Paneli%20Destek`}
              className="flex items-center gap-4 p-4 bg-[#0A0E14] border border-white/5 rounded-2xl hover:border-blue-500/30 transition-colors"
            >
              <div className="w-10 h-10 rounded-xl bg-blue-500/15 flex items-center justify-center text-blue-400">
                <Mail size={20} />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-bold text-white">E-posta ile yaz</h4>
                <p className="text-xs text-gray-500">{SUPPORT_EMAIL}</p>
              </div>
            </a>

            <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-start gap-3">
              <HelpCircle size={18} className="text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-200">
                Acil teknik sorunlarda tesis adını ve ekran görüntüsünü ekle; öncelikli yanıt alırsın.
              </p>
            </div>
          </>
        )}

        {mode === 'new' && (
          <>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-extrabold uppercase tracking-widest text-gray-500 block mb-1.5">Konu</label>
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Örn. Rezervasyon onayı görünmüyor"
                  className="w-full bg-[#0A0E14] border border-white/10 rounded-2xl px-4 py-3 text-white text-sm outline-none focus:border-emerald-500/50"
                />
              </div>
              <div>
                <label className="text-[10px] font-extrabold uppercase tracking-widest text-gray-500 block mb-1.5">Kategori</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full bg-[#0A0E14] border border-white/10 rounded-2xl px-4 py-3 text-white text-sm outline-none focus:border-emerald-500/50"
                >
                  {SUPPORT_CATEGORIES.map((c) => (
                    <option key={c.key} value={c.key}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-extrabold uppercase tracking-widest text-gray-500 block mb-1.5">Mesaj</label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={5}
                  placeholder="Sorunu olabildiğince ayrıntılı anlat."
                  className="w-full bg-[#0A0E14] border border-white/10 rounded-2xl px-4 py-3 text-white text-sm outline-none focus:border-emerald-500/50"
                />
              </div>
              {formError && <p className="text-xs text-red-400">{formError}</p>}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setMode('list'); setFormError(null); }}
                className="flex-1 py-3 bg-white/5 text-white font-bold rounded-2xl hover:bg-white/10"
              >
                Vazgeç
              </button>
              <button
                type="button"
                disabled={sending}
                onClick={() => void submitNew()}
                className="flex-1 py-3 bg-emerald-500 text-black font-extrabold rounded-2xl hover:bg-emerald-400 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Gönder
              </button>
            </div>
          </>
        )}

        {mode === 'thread' && active && (
          <>
            <button
              type="button"
              onClick={() => { setMode('list'); setReplyError(null); }}
              className="flex items-center gap-1 text-xs font-bold text-gray-400 hover:text-white"
            >
              <ChevronLeft size={14} /> Taleplerim
            </button>

            <div className="bg-[#0A0E14] border border-white/5 rounded-2xl p-3">
              <p className="text-sm font-bold text-white">{active.subject}</p>
              <p className="text-[11px] text-gray-500">{SUPPORT_STATUS_LABEL[active.status] ?? active.status}</p>
            </div>

            <div className="space-y-2 max-h-[46vh] overflow-y-auto pr-1">
              {(active.messages ?? []).map((m) => (
                <div
                  key={m.id}
                  className={`p-3 rounded-2xl text-sm ${
                    m.sender_role === 'ADMIN'
                      ? 'bg-blue-500/10 border border-blue-500/20 text-blue-100'
                      : 'bg-white/[0.04] border border-white/10 text-white'
                  }`}
                >
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-gray-500 mb-1">
                    {m.sender_role === 'ADMIN' ? 'OYNA Destek' : 'Sen'} · {new Date(m.created_at).toLocaleString('tr-TR')}
                  </p>
                  <p className="whitespace-pre-wrap leading-relaxed">{m.body}</p>
                </div>
              ))}
              <div ref={threadEndRef} />
            </div>

            {active.status !== 'CLOSED' && (
              <div className="space-y-2">
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  rows={3}
                  placeholder="Yanıt yaz…"
                  className="w-full bg-[#0A0E14] border border-white/10 rounded-2xl px-4 py-3 text-white text-sm outline-none focus:border-emerald-500/50"
                />
                {replyError && <p className="text-xs text-red-400">{replyError}</p>}
                <button
                  type="button"
                  disabled={sending || reply.trim().length < 2}
                  onClick={() => void submitReply()}
                  className="w-full py-3 bg-emerald-500 text-black font-extrabold rounded-2xl hover:bg-emerald-400 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Gönder
                </button>
              </div>
            )}
          </>
        )}

        <button
          type="button"
          onClick={onClose}
          className="w-full py-3 bg-white/5 text-white font-bold rounded-2xl hover:bg-white/10"
        >
          Kapat
        </button>
      </div>
    </OwnerCenteredModal>
  );
};
