import React, { useCallback, useEffect, useState } from 'react';
import { AdminSearchBar } from '../components/AdminSearchBar';
import {
  fetchSupportTicketsAdmin,
  fetchSupportTicketThreadAdmin,
  replySupportTicketAdmin,
  setSupportTicketStatusAdmin,
  toTurkishAdminError,
  type SupportChannel,
  type SupportStatus,
  type SupportTicketRow,
  type SupportTicketThread,
} from '../../services/adminService';
import { PageShell } from '../components/PageShell';
import { StatusBadge } from '../components/StatusBadge';
import { useAdminToast } from '../context/AdminToastContext';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { LifeBuoy, RefreshCw, Loader2, Send, CheckCheck, Inbox, MessageSquare } from 'lucide-react';

const CHANNELS: { value: SupportChannel; label: string }[] = [
  { value: 'PLAYER', label: 'Oyuncular' },
  { value: 'OWNER', label: 'Tesisler' },
];

const STATUS_LABELS: Record<SupportStatus, string> = {
  OPEN: 'Açık',
  PENDING: 'Yanıtlandı',
  RESOLVED: 'Çözüldü',
  CLOSED: 'Kapalı',
};

const STATUS_TONES: Record<SupportStatus, 'warning' | 'info' | 'success' | 'neutral'> = {
  OPEN: 'warning',
  PENDING: 'info',
  RESOLVED: 'success',
  CLOSED: 'neutral',
};

const STATUS_ORDER: SupportStatus[] = ['OPEN', 'PENDING', 'RESOLVED', 'CLOSED'];

const isHighPriority = (priority: string): boolean => priority === 'HIGH' || priority === 'URGENT';
const priorityLabel = (priority: string): string => (priority === 'URGENT' ? 'Acil' : 'Yüksek');

const formatDateTime = (iso: string): string => {
  const d = new Date(iso);
  return `${d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })} ${d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;
};

export const SupportTicketsPage: React.FC = () => {
  const [channel, setChannel] = useState<SupportChannel>('PLAYER');
  const [statusFilter, setStatusFilter] = useState<SupportStatus | null>(null);
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 300);

  const [rows, setRows] = useState<SupportTicketRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [thread, setThread] = useState<SupportTicketThread | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);

  const [reply, setReply] = useState('');
  const [sending, setSending] = useState<'REPLY' | 'RESOLVE' | null>(null);
  const [statusSaving, setStatusSaving] = useState<SupportStatus | null>(null);

  const { success, error: toastError } = useAdminToast();

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      setRows(await fetchSupportTicketsAdmin(channel, {
        status: statusFilter,
        search: debouncedQuery || undefined,
        limit: 100,
      }));
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [channel, statusFilter, debouncedQuery, toastError]);

  useEffect(() => { void load(); }, [load]);

  // Kanal değişince seçili talep diğer kanala ait olur — seçimi sıfırla.
  useEffect(() => {
    setSelectedId(null);
    setThread(null);
    setReply('');
  }, [channel]);

  // Dizi açılınca sunucu unread_for_admin bayrağını temizler → listede de yerel olarak temizle.
  useEffect(() => {
    if (!selectedId) {
      setThread(null);
      return;
    }
    let cancelled = false;
    setThreadLoading(true);
    fetchSupportTicketThreadAdmin(selectedId)
      .then((t) => {
        if (cancelled) return;
        setThread(t);
        setRows((prev) => prev.map((r) => (r.id === selectedId ? { ...r, unread_for_admin: false } : r)));
      })
      .catch((err) => {
        if (!cancelled) toastError(toTurkishAdminError(err));
      })
      .finally(() => {
        if (!cancelled) setThreadLoading(false);
      });
    return () => { cancelled = true; };
  }, [selectedId, toastError]);

  const changeStatus = async (status: SupportStatus) => {
    if (!thread || thread.status === status || statusSaving) return;
    setStatusSaving(status);
    try {
      await setSupportTicketStatusAdmin(thread.id, status);
      setThread((prev) => (prev ? { ...prev, status } : prev));
      setRows((prev) => prev.map((r) => (r.id === thread.id ? { ...r, status } : r)));
      success(`Durum güncellendi: ${STATUS_LABELS[status]}`);
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setStatusSaving(null);
    }
  };

  const sendReply = async (resolve: boolean) => {
    const body = reply.trim();
    if (!selectedId || !body || sending) return;
    setSending(resolve ? 'RESOLVE' : 'REPLY');
    try {
      // Durum verilmezse sunucu PENDING'e çeker.
      await replySupportTicketAdmin(selectedId, body, resolve ? 'RESOLVED' : undefined);
      success(resolve ? 'Yanıt gönderildi, talep çözüldü' : 'Yanıt gönderildi');
      setReply('');
      const t = await fetchSupportTicketThreadAdmin(selectedId);
      setThread(t);
      await load({ silent: true });
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setSending(null);
    }
  };

  return (
    <PageShell
      route="SUPPORT_TICKETS"
      icon={<LifeBuoy size={20} />}
      actions={
        <button onClick={() => void load()} disabled={loading} className="flex items-center gap-2 h-9 px-4 text-xs font-bold text-gray-400 hover:text-white rounded-xl bg-white/5 border border-white/10 disabled:opacity-50">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Yenile
        </button>
      }
    >
      {/* Üst bar: kanal sekmeleri + durum filtreleri + arama */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 bg-black/40 border border-white/10 rounded-xl p-1">
            {CHANNELS.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setChannel(c.value)}
                className={`h-8 px-4 rounded-lg text-[11px] font-black uppercase tracking-wider transition-colors ${
                  channel === c.value ? 'bg-[#39FF14]/10 text-[#39FF14]' : 'text-gray-500 hover:text-white'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setStatusFilter(null)}
              className={`h-8 px-3 rounded-lg text-[10px] font-black uppercase tracking-wider border transition-colors ${
                statusFilter === null ? 'bg-white/10 text-white border-white/20' : 'text-gray-500 border-white/10 hover:text-white'
              }`}
            >
              Tümü
            </button>
            {STATUS_ORDER.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`h-8 px-3 rounded-lg text-[10px] font-black uppercase tracking-wider border transition-colors ${
                  statusFilter === s ? 'bg-white/10 text-white border-white/20' : 'text-gray-500 border-white/10 hover:text-white'
                }`}
              >
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </div>
        <AdminSearchBar
          value={query}
          onChange={setQuery}
          placeholder="Konu, kullanıcı adı veya e-posta ara..."
          resultCount={rows.length}
          totalCount={rows.length}
        />
      </div>

      {/* Master-detail */}
      <div className="grid gap-4 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] items-start">
        {/* Sol: talep listesi */}
        <div className="space-y-2 max-h-[70vh] overflow-y-auto custom-scrollbar pr-1">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-500">
              <Loader2 size={20} className="animate-spin" />
            </div>
          ) : rows.length === 0 ? (
            <div className="bg-[#161B22]/60 border border-white/10 rounded-2xl p-8 text-center">
              <Inbox size={24} className="mx-auto text-gray-600 mb-3" />
              <p className="text-sm font-black text-white">Bu kanalda talep yok</p>
              <p className="text-[11px] text-gray-500 mt-2 leading-relaxed">
                Kullanıcılar Ayarlar → Yardım Merkezi üzerinden destek talebi açar (Oyuncular kanalı). Yeni talepler burada listelenir.
              </p>
            </div>
          ) : (
            rows.map((t) => {
              const selected = t.id === selectedId;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedId(t.id)}
                  className={`relative w-full text-left bg-[#161B22]/60 border rounded-2xl px-4 py-3 transition-colors ${
                    selected ? 'border-[#39FF14]/40 bg-[#161B22]' : 'border-white/10 hover:border-white/20'
                  }`}
                >
                  {t.unread_for_admin && (
                    <span className="absolute left-1.5 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-[#39FF14] animate-pulse" aria-label="Okunmamış" />
                  )}
                  <div className="flex items-start justify-between gap-2 pl-1.5">
                    <p className="text-sm font-bold text-white truncate">{t.subject || 'Konu yok'}</p>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {isHighPriority(t.priority) && (
                        <StatusBadge tone="danger">{priorityLabel(t.priority)}</StatusBadge>
                      )}
                      <StatusBadge tone={STATUS_TONES[t.status]}>{STATUS_LABELS[t.status]}</StatusBadge>
                    </div>
                  </div>
                  <p className="text-[11px] text-gray-500 truncate pl-1.5 mt-0.5">
                    {t.user_name ?? '—'}{t.user_email ? ` · ${t.user_email}` : ''}
                  </p>
                  {t.last_preview && (
                    <p className="text-xs text-gray-400 truncate pl-1.5 mt-1.5">{t.last_preview}</p>
                  )}
                  <div className="flex items-center gap-3 pl-1.5 mt-2 text-[10px] font-mono text-gray-600 tabular-nums">
                    <span className="flex items-center gap-1"><MessageSquare size={10} /> {t.message_count}</span>
                    <span>{formatDateTime(t.last_message_at)}</span>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Sağ: seçili talep dizisi */}
        <div className="bg-[#161B22]/60 border border-white/10 rounded-2xl flex flex-col min-h-[420px] max-h-[70vh]">
          {!selectedId ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <LifeBuoy size={24} className="text-gray-600 mb-3" />
              <p className="text-sm font-black text-white">Soldan talep seç</p>
              <p className="text-[11px] text-gray-500 mt-1">Diziyi görüntülemek ve yanıtlamak için listeden bir talep seçin.</p>
            </div>
          ) : threadLoading || !thread ? (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              <Loader2 size={20} className="animate-spin" />
            </div>
          ) : (
            <>
              {/* Başlık */}
              <div className="px-4 py-3 border-b border-white/10">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <h3 className="text-sm font-black text-white truncate">{thread.subject || 'Konu yok'}</h3>
                      {isHighPriority(thread.priority) && (
                        <StatusBadge tone="danger">{priorityLabel(thread.priority)}</StatusBadge>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-500 truncate mt-0.5">
                      {thread.user_name ?? '—'}{thread.user_email ? ` · ${thread.user_email}` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-gray-600 mr-1">Durum</span>
                  {STATUS_ORDER.map((s) => {
                    const active = thread.status === s;
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => void changeStatus(s)}
                        disabled={statusSaving !== null}
                        className={`h-7 px-2.5 rounded-lg text-[10px] font-black uppercase tracking-wider border transition-colors disabled:opacity-50 ${
                          active ? 'bg-white/10 text-white border-white/25' : 'text-gray-500 border-white/10 hover:text-white'
                        }`}
                      >
                        {statusSaving === s ? <Loader2 size={10} className="animate-spin inline" /> : STATUS_LABELS[s]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Mesajlar */}
              <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-4 space-y-3">
                {thread.messages.map((m) => {
                  const isAdmin = m.sender_role === 'ADMIN';
                  return (
                    <div key={m.id} className={`flex ${isAdmin ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[85%] rounded-2xl border px-3.5 py-2.5 ${
                          isAdmin
                            ? 'bg-purple-500/10 border-purple-500/25 rounded-tr-md'
                            : 'bg-[#161B22] border-white/10 rounded-tl-md'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[10px] font-black uppercase tracking-wider ${isAdmin ? 'text-purple-400' : 'text-gray-400'}`}>
                            {m.sender_name ?? (isAdmin ? 'Yönetici' : 'Kullanıcı')}
                          </span>
                          <span className="text-[10px] font-mono text-gray-600 tabular-nums">{formatDateTime(m.created_at)}</span>
                        </div>
                        <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap break-words">{m.body}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Yanıt kutusu */}
              <div className="border-t border-white/10 px-4 py-3">
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  rows={3}
                  disabled={sending !== null}
                  placeholder="Yanıtınızı yazın..."
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white resize-none focus:outline-none focus:border-white/20 disabled:opacity-50"
                />
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <button
                    onClick={() => void sendReply(false)}
                    disabled={!reply.trim() || sending !== null}
                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-black rounded-xl text-white bg-purple-600 hover:bg-purple-500 disabled:opacity-50"
                  >
                    {sending === 'REPLY' ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Yanıtla
                  </button>
                  <button
                    onClick={() => void sendReply(true)}
                    disabled={!reply.trim() || sending !== null}
                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-black rounded-xl text-green-400 border border-green-500/30 hover:bg-green-500/10 disabled:opacity-50"
                  >
                    {sending === 'RESOLVE' ? <Loader2 size={12} className="animate-spin" /> : <CheckCheck size={12} />} Yanıtla &amp; Çöz
                  </button>
                </div>
                <p className="text-[10px] text-gray-600 mt-2">Yanıt, kullanıcıya uygulama bildirimi olarak gider.</p>
              </div>
            </>
          )}
        </div>
      </div>
    </PageShell>
  );
};
