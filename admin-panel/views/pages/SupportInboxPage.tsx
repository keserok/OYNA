/**
 * Destek Merkezi kuyruğu (Eksiklik #1/#2). Tek bileşen iki kanalı taşır:
 *   channel='PLAYER' → Destek Talepleri (oyuncu şikayet/talebi)
 *   channel='OWNER'  → Tesis Sahibi Mesajları
 * Sol: kuyruk (durum filtresi + arama). Sağ: seçili talebin yazışması, admin
 * yanıtı ve durum değişimi. Her yanıt kullanıcıya bildirim + audit üretir.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { LifeBuoy, Inbox, RefreshCw, X, Send, Loader2, CheckCircle2, RotateCcw, Mail } from 'lucide-react';
import { PageShell } from '../components/PageShell';
import { DataTable } from '../components/DataTable';
import { AdminSearchBar } from '../components/AdminSearchBar';
import { StatusBadge } from '../components/StatusBadge';
import { useAdminToast } from '../context/AdminToastContext';
import {
  fetchSupportTickets, fetchSupportTicketThread, replySupportTicket, setSupportTicketStatus,
  toTurkishAdminError,
  type SupportChannel, type SupportStatus, type SupportTicketRow, type SupportTicketThread,
} from '../../services/adminService';

const STATUS_LABEL: Record<SupportStatus, string> = {
  OPEN: 'Açık', PENDING: 'Beklemede', RESOLVED: 'Çözüldü', CLOSED: 'Kapalı',
};
const STATUS_TONE: Record<SupportStatus, 'warning' | 'info' | 'success' | 'neutral'> = {
  OPEN: 'warning', PENDING: 'info', RESOLVED: 'success', CLOSED: 'neutral',
};
const CATEGORY_LABEL: Record<string, string> = {
  GENERAL: 'Genel', REFUND: 'İade', BAN: 'Ban/İtiraz', PAYMENT: 'Ödeme',
  BUG: 'Hata', ACCOUNT: 'Hesap', FACILITY: 'Tesis', OTHER: 'Diğer',
};

const FILTERS: Array<{ id: SupportStatus | 'ALL'; label: string }> = [
  { id: 'ALL', label: 'Tümü' },
  { id: 'OPEN', label: 'Açık' },
  { id: 'PENDING', label: 'Beklemede' },
  { id: 'RESOLVED', label: 'Çözüldü' },
  { id: 'CLOSED', label: 'Kapalı' },
];

const catLabel = (c: string) => CATEGORY_LABEL[c?.toUpperCase()] ?? c ?? 'Genel';

// ─── Yazışma çekmecesi ───────────────────────────────────────────────────────
const ThreadDrawer: React.FC<{
  ticketId: string;
  channel: SupportChannel;
  onClose: () => void;
  onChanged: () => void;
}> = ({ ticketId, channel, onClose, onChanged }) => {
  const { success, error: toastError } = useAdminToast();
  const [thread, setThread] = useState<SupportTicketThread | null>(null);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setThread(await fetchSupportTicketThread(ticketId));
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setLoading(false);
    }
  }, [ticketId, toastError]);

  useEffect(() => { void load(); }, [load]);

  const sendReply = async (newStatus?: SupportStatus) => {
    if (reply.trim().length < 1) { toastError('Yanıt boş olamaz.'); return; }
    setBusy(true);
    try {
      await replySupportTicket(ticketId, reply.trim(), newStatus ?? null);
      success(newStatus ? `Yanıt gönderildi · ${STATUS_LABEL[newStatus]}` : 'Yanıt gönderildi');
      setReply('');
      await load();
      onChanged();
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (status: SupportStatus) => {
    setBusy(true);
    try {
      await setSupportTicketStatus(ticketId, status);
      success(`Durum: ${STATUS_LABEL[status]}`);
      await load();
      onChanged();
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setBusy(false);
    }
  };

  const status = thread?.status;
  const isClosed = status === 'RESOLVED' || status === 'CLOSED';

  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-[220] flex justify-end">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/60" onClick={onClose} />
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 320 }}
          className="relative w-full max-w-xl h-full bg-[#0D1117] border-l border-white/10 flex flex-col shadow-2xl"
        >
          {/* Başlık */}
          <div className="flex items-start justify-between px-5 py-4 border-b border-white/10 shrink-0 gap-3">
            <div className="min-w-0">
              <p className="text-[10px] text-gray-500 font-mono uppercase">
                {channel === 'OWNER' ? 'Tesis Sahibi Mesajı' : 'Destek Talebi'}
              </p>
              <h2 className="text-sm font-black text-white truncate">{thread?.subject ?? '—'}</h2>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {status && <StatusBadge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</StatusBadge>}
                {thread?.category && <span className="text-[9px] text-gray-500 border border-white/10 rounded px-1.5 py-0.5">{catLabel(thread.category)}</span>}
              </div>
              {thread && (
                <p className="text-[10px] text-gray-500 mt-1.5 flex items-center gap-1.5 min-w-0">
                  <Mail size={10} className="shrink-0" />
                  <span className="truncate">{thread.user_name || 'Kullanıcı'}{thread.user_email ? ` · ${thread.user_email}` : ''}</span>
                </p>
              )}
            </div>
            <button type="button" onClick={onClose} aria-label="Kapat" className="w-8 h-8 rounded-lg bg-white/5 text-gray-400 hover:text-white flex items-center justify-center shrink-0">
              <X size={16} />
            </button>
          </div>

          {/* Mesajlar */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-3">
            {loading ? (
              <p className="text-[11px] text-gray-600 py-8 text-center flex items-center justify-center gap-2"><Loader2 size={12} className="animate-spin" /> Yükleniyor…</p>
            ) : !thread || thread.messages.length === 0 ? (
              <p className="text-[11px] text-gray-600 py-8 text-center">Mesaj yok.</p>
            ) : thread.messages.map((m) => {
              const admin = m.sender_role === 'ADMIN';
              return (
                <div key={m.id} className={`flex flex-col ${admin ? 'items-end' : 'items-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 border ${admin ? 'bg-red-500/10 border-red-500/20' : 'bg-white/[0.04] border-white/[0.08]'}`}>
                    <p className="text-[9px] font-black uppercase tracking-wider mb-1 text-gray-500">
                      {admin ? (m.sender_name || 'OYNA Destek') : (m.sender_name || 'Kullanıcı')}
                    </p>
                    <p className="text-[13px] text-gray-200 whitespace-pre-wrap break-words">{m.body}</p>
                  </div>
                  <span className="text-[9px] text-gray-600 font-mono mt-1 px-1">{new Date(m.created_at).toLocaleString('tr-TR')}</span>
                </div>
              );
            })}
          </div>

          {/* Yanıt + durum */}
          <div className="shrink-0 border-t border-white/10 p-4 space-y-3">
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="Yanıtınızı yazın… (kullanıcıya bildirim gönderilir)"
              rows={3}
              disabled={busy}
              className="w-full bg-black/40 border border-white/15 rounded-xl px-3 py-2 text-sm text-white focus:border-red-500/40 focus:outline-none resize-none"
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={busy || reply.trim().length < 1}
                onClick={() => void sendReply()}
                className="flex items-center gap-1.5 px-4 py-2 text-[11px] font-black rounded-xl bg-red-600 hover:bg-red-500 text-white disabled:opacity-40"
              >
                <Send size={13} /> Gönder
              </button>
              <button
                type="button"
                disabled={busy || reply.trim().length < 1}
                onClick={() => void sendReply('RESOLVED')}
                className="flex items-center gap-1.5 px-3 py-2 text-[11px] font-bold rounded-xl border border-green-500/30 text-green-300 hover:bg-green-500/10 disabled:opacity-40"
              >
                <CheckCircle2 size={13} /> Gönder & Çöz
              </button>
              <div className="ml-auto flex items-center gap-1.5">
                {!isClosed ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void changeStatus('CLOSED')}
                    className="px-3 py-2 text-[11px] font-bold rounded-xl border border-white/10 text-gray-400 hover:text-white disabled:opacity-40"
                  >
                    Kapat
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void changeStatus('OPEN')}
                    className="flex items-center gap-1.5 px-3 py-2 text-[11px] font-bold rounded-xl border border-white/10 text-gray-400 hover:text-white disabled:opacity-40"
                  >
                    <RotateCcw size={12} /> Yeniden Aç
                  </button>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body,
  );
};

// ─── Kuyruk sayfası ──────────────────────────────────────────────────────────
export const SupportInboxPage: React.FC<{ channel: SupportChannel }> = ({ channel }) => {
  const route = channel === 'OWNER' ? 'OWNER_MESSAGES' : 'SUPPORT_TICKETS';
  const { error: toastError } = useAdminToast();
  const [rows, setRows] = useState<SupportTicketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<SupportStatus | 'ALL'>('ALL');
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchSupportTickets(channel, {
        status: filter === 'ALL' ? null : filter,
        search: query.trim() || undefined,
        limit: 200,
      }));
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setLoading(false);
    }
  }, [channel, filter, query, toastError]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [load]);

  const openCount = useMemo(
    () => rows.filter((r) => r.status === 'OPEN' || r.status === 'PENDING').length,
    [rows],
  );

  return (
    <>
      <PageShell
        route={route}
        icon={channel === 'OWNER' ? <Inbox size={20} /> : <LifeBuoy size={20} />}
        actions={
          <button onClick={() => void load()} disabled={loading} className="flex items-center gap-2 h-9 px-4 text-xs font-bold text-gray-400 hover:text-white rounded-xl bg-white/5 border border-white/10 disabled:opacity-50">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Yenile
          </button>
        }
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div className="flex gap-2 p-1 bg-black/30 border border-white/[0.06] rounded-xl w-fit flex-wrap">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={`px-3.5 py-2 text-xs font-bold rounded-lg transition-all ${filter === f.id ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'}`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <AdminSearchBar
            value={query}
            onChange={setQuery}
            placeholder="Konu veya kullanıcı ara..."
            resultCount={rows.length}
            totalCount={rows.length}
            className="sm:max-w-xs"
          />
        </div>

        {openCount > 0 && (
          <div className="mb-4 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-[11px] text-yellow-200">
            <LifeBuoy size={14} className="shrink-0" />
            {openCount} açık/bekleyen {channel === 'OWNER' ? 'mesaj' : 'talep'} yanıt bekliyor.
          </div>
        )}

        <DataTable
          columns={[
            { header: '', className: 'w-6', render: (r: SupportTicketRow) => (
              r.unread_for_admin ? <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" title="Yeni" /> : null
            )},
            { header: 'Konu', render: (r: SupportTicketRow) => (
              <div className="min-w-0 max-w-[280px]">
                <p className={`text-sm truncate ${r.unread_for_admin ? 'text-white font-bold' : 'text-gray-300'}`}>{r.subject}</p>
                {r.last_preview && <p className="text-[11px] text-gray-600 truncate">{r.last_sender_role === 'ADMIN' ? 'Siz: ' : ''}{r.last_preview}</p>}
              </div>
            )},
            { header: 'Kullanıcı', render: (r: SupportTicketRow) => (
              <div className="min-w-0">
                <p className="text-[13px] text-white truncate">{r.user_name || '—'}</p>
                <p className="text-[10px] text-gray-600">{catLabel(r.category)} · {r.message_count} mesaj</p>
              </div>
            )},
            { header: 'Son Mesaj', render: (r: SupportTicketRow) => (
              <span className="text-[11px] font-mono text-gray-400">{new Date(r.last_message_at).toLocaleString('tr-TR')}</span>
            )},
            { header: 'Durum', render: (r: SupportTicketRow) => (
              <StatusBadge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</StatusBadge>
            )},
            { header: '', render: (r: SupportTicketRow) => (
              <button
                type="button"
                onClick={() => setOpenId(r.id)}
                className="text-[11px] font-bold text-red-400 border border-red-500/30 px-3 py-1.5 rounded-lg hover:bg-red-500/10"
              >
                Aç
              </button>
            )},
          ]}
          data={rows}
          loading={loading}
          emptyMessage={channel === 'OWNER' ? 'Tesis sahibi mesajı yok' : 'Destek talebi yok'}
          emptyDescription={channel === 'OWNER'
            ? 'Saha sahipleri Owner panelinden mesaj gönderince burada belirir.'
            : 'Kullanıcılar uygulamadan destek talebi açınca burada belirir.'}
        />
      </PageShell>

      {openId && (
        <ThreadDrawer
          ticketId={openId}
          channel={channel}
          onClose={() => setOpenId(null)}
          onChanged={() => void load()}
        />
      )}
    </>
  );
};
