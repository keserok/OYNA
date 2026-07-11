/**
 * Uygulama içi Destek Merkezi (Eksiklik #1/#2).
 * Kullanıcı/tesis sahibi buradan talep açar, admin yanıtını görür ve mesaj ekler.
 * Aynı bileşen iki kanala hizmet eder (channel='PLAYER' | 'OWNER').
 */
import React, { useCallback, useEffect, useState } from 'react';
import { X, Plus, ChevronLeft, Send, Loader2, LifeBuoy, MessageSquarePlus } from 'lucide-react';
import {
  listMySupportTickets, createSupportTicket, addSupportMessage,
  type SupportChannel, type SupportStatus, type SupportTicket,
} from '../../services/supportService';

interface Props {
  channel?: SupportChannel;
  onClose: () => void;
}

const STATUS_LABEL: Record<SupportStatus, string> = {
  OPEN: 'Açık', PENDING: 'Yanıtlandı', RESOLVED: 'Çözüldü', CLOSED: 'Kapalı',
};
const STATUS_CLASS: Record<SupportStatus, string> = {
  OPEN: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/25',
  PENDING: 'bg-blue-500/15 text-blue-300 border-blue-500/25',
  RESOLVED: 'bg-green-500/15 text-green-300 border-green-500/25',
  CLOSED: 'bg-white/10 text-gray-400 border-white/10',
};

const PLAYER_CATEGORIES = [
  ['GENERAL', 'Genel'], ['REFUND', 'İade Talebi'], ['BAN', 'Ban / İtiraz'],
  ['PAYMENT', 'Ödeme Sorunu'], ['BUG', 'Hata Bildirimi'], ['ACCOUNT', 'Hesap'], ['OTHER', 'Diğer'],
] as const;
const OWNER_CATEGORIES = [
  ['GENERAL', 'Genel'], ['FACILITY', 'Tesis Bilgisi'], ['PAYMENT', 'Ödeme / Tahsilat'],
  ['BILLING', 'Fatura / Abonelik'], ['BUG', 'Teknik Sorun'], ['OTHER', 'Diğer'],
] as const;

export const SupportCenterModal: React.FC<Props> = ({ channel = 'PLAYER', onClose }) => {
  const categories = channel === 'OWNER' ? OWNER_CATEGORIES : PLAYER_CATEGORIES;
  const [view, setView] = useState<'list' | 'new'>('list');
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Yeni talep formu
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState<string>('GENERAL');
  const [body, setBody] = useState('');
  // Thread yanıtı
  const [reply, setReply] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTickets(await listMySupportTickets(channel));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Talepler yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, [channel]);

  useEffect(() => { void load(); }, [load]);

  const submitNew = async () => {
    if (subject.trim().length < 3) { setError('Konu en az 3 karakter olmalı.'); return; }
    if (body.trim().length < 1) { setError('Mesaj boş olamaz.'); return; }
    setBusy(true);
    setError(null);
    try {
      const id = await createSupportTicket({ subject: subject.trim(), body: body.trim(), category, channel });
      setSubject(''); setBody(''); setCategory('GENERAL');
      setView('list');
      await load();
      setOpenId(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Talep oluşturulamadı.');
    } finally {
      setBusy(false);
    }
  };

  const submitReply = async () => {
    if (!openId || reply.trim().length < 1) return;
    setBusy(true);
    setError(null);
    try {
      await addSupportMessage(openId, reply.trim());
      setReply('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Mesaj gönderilemedi.');
    } finally {
      setBusy(false);
    }
  };

  const openTicket = openId ? tickets.find((t) => t.id === openId) ?? null : null;

  return (
    <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4" onClick={onClose}>
      <div
        className="w-full sm:max-w-md h-[88vh] sm:h-[80vh] bg-[#0D1117] border border-white/10 rounded-t-3xl sm:rounded-3xl flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Başlık */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {openTicket ? (
              <button type="button" onClick={() => setOpenId(null)} className="w-8 h-8 rounded-lg bg-white/5 text-gray-400 hover:text-white flex items-center justify-center">
                <ChevronLeft size={16} />
              </button>
            ) : (
              <div className="w-8 h-8 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
                <LifeBuoy size={16} />
              </div>
            )}
            <div className="min-w-0">
              <h2 className="text-sm font-black text-white truncate">
                {openTicket ? openTicket.subject : channel === 'OWNER' ? 'Destek & Mesaj' : 'Destek Talepleri'}
              </h2>
              <p className="text-[10px] text-gray-500">
                {openTicket ? STATUS_LABEL[openTicket.status] : 'OYNA ekibiyle iletişim'}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Kapat" className="w-8 h-8 rounded-lg bg-white/5 text-gray-400 hover:text-white flex items-center justify-center shrink-0">
            <X size={16} />
          </button>
        </div>

        {error && (
          <div className="mx-4 mt-3 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/25 text-[11px] text-red-300">
            {error}
          </div>
        )}

        {/* ── Thread görünümü ── */}
        {openTicket ? (
          <>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {openTicket.messages.map((m) => {
                const admin = m.sender_role === 'ADMIN';
                return (
                  <div key={m.id} className={`flex flex-col ${admin ? 'items-start' : 'items-end'}`}>
                    <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 border ${admin ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-white/[0.05] border-white/[0.08]'}`}>
                      <p className="text-[9px] font-black uppercase tracking-wider mb-1 text-gray-500">
                        {admin ? (m.sender_name || 'OYNA Destek') : 'Siz'}
                      </p>
                      <p className="text-[13px] text-gray-200 whitespace-pre-wrap break-words">{m.body}</p>
                    </div>
                    <span className="text-[9px] text-gray-600 font-mono mt-1 px-1">{new Date(m.created_at).toLocaleString('tr-TR')}</span>
                  </div>
                );
              })}
            </div>
            {openTicket.status !== 'CLOSED' ? (
              <div className="shrink-0 border-t border-white/10 p-3 flex items-end gap-2">
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="Mesaj yazın…"
                  rows={1}
                  disabled={busy}
                  className="flex-1 bg-black/40 border border-white/15 rounded-xl px-3 py-2.5 text-sm text-white focus:border-emerald-500/40 focus:outline-none resize-none max-h-28"
                />
                <button
                  type="button"
                  onClick={() => void submitReply()}
                  disabled={busy || reply.trim().length < 1}
                  className="w-11 h-11 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center disabled:opacity-40 shrink-0"
                >
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                </button>
              </div>
            ) : (
              <div className="shrink-0 border-t border-white/10 p-3 text-center text-[11px] text-gray-500">
                Bu talep kapatıldı. Yeni bir konu için talep açabilirsiniz.
              </div>
            )}
          </>
        ) : view === 'new' ? (
          /* ── Yeni talep formu ── */
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Konu</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Örn. Rezervasyon iadesi"
                className="w-full h-11 bg-black/40 border border-white/15 rounded-xl px-3 text-sm text-white focus:border-emerald-500/40 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Kategori</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full h-11 bg-black/40 border border-white/15 rounded-xl px-3 text-sm text-white focus:border-emerald-500/40 focus:outline-none"
              >
                {categories.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Mesaj</label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Sorununuzu veya talebinizi anlatın…"
                rows={5}
                className="w-full bg-black/40 border border-white/15 rounded-xl px-3 py-2.5 text-sm text-white focus:border-emerald-500/40 focus:outline-none resize-none"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => { setView('list'); setError(null); }} disabled={busy} className="flex-1 py-3 rounded-xl border border-white/10 text-gray-400 hover:text-white text-sm font-bold disabled:opacity-40">
                Vazgeç
              </button>
              <button type="button" onClick={() => void submitNew()} disabled={busy} className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-black disabled:opacity-40">
                {busy ? 'Gönderiliyor…' : 'Talebi Gönder'}
              </button>
            </div>
          </div>
        ) : (
          /* ── Talep listesi ── */
          <>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {loading ? (
                <p className="text-[12px] text-gray-600 py-10 text-center flex items-center justify-center gap-2"><Loader2 size={14} className="animate-spin" /> Yükleniyor…</p>
              ) : tickets.length === 0 ? (
                <div className="py-12 text-center">
                  <LifeBuoy size={32} className="text-gray-700 mx-auto mb-3" />
                  <p className="text-sm text-gray-400 font-bold">Henüz talebiniz yok</p>
                  <p className="text-[12px] text-gray-600 mt-1">Bir sorun veya talebiniz için yeni talep açın.</p>
                </div>
              ) : tickets.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setOpenId(t.id)}
                  className="w-full text-left p-3.5 bg-[#161B22] border border-white/[0.06] rounded-2xl hover:border-white/15 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold text-white truncate flex items-center gap-2">
                      {t.unread_for_user && <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />}
                      {t.subject}
                    </p>
                    <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md border shrink-0 ${STATUS_CLASS[t.status]}`}>
                      {STATUS_LABEL[t.status]}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-1 truncate">
                    {t.messages[t.messages.length - 1]?.body ?? ''}
                  </p>
                  <p className="text-[10px] text-gray-600 font-mono mt-1">{new Date(t.last_message_at).toLocaleString('tr-TR')}</p>
                </button>
              ))}
            </div>
            <div className="shrink-0 border-t border-white/10 p-3">
              <button
                type="button"
                onClick={() => { setView('new'); setError(null); }}
                className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-black flex items-center justify-center gap-2"
              >
                {tickets.length === 0 ? <MessageSquarePlus size={16} /> : <Plus size={16} />} Yeni Talep Aç
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default SupportCenterModal;
