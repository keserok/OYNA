import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ShieldAlert, RefreshCw, Check, X, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { DataTable } from '../components/DataTable';
import { AdminSearchBar } from '../components/AdminSearchBar';
import { AdminFilterChips } from '../components/AdminFilterChips';
import { PageShell } from '../components/PageShell';
import { StatusBadge } from '../components/StatusBadge';
import { useAdminToast } from '../context/AdminToastContext';
import {
  fetchUserReports,
  resolveUserReport,
  toTurkishAdminError,
  type UserReportRow,
  type UserReportStatus,
} from '../../services/adminService';

const REASON_LABELS: Record<string, string> = {
  SPAM: 'Spam',
  HARASSMENT: 'Taciz',
  FAKE_PROFILE: 'Sahte Profil',
  CHEATING: 'Hile',
  OTHER: 'Diğer',
};
const CONTEXT_LABELS: Record<string, string> = {
  CHAT: 'Sohbet',
  PROFILE: 'Profil',
  MATCH: 'Maç',
};
const STATUS_FILTERS: Array<{ id: 'ALL' | UserReportStatus; label: string }> = [
  { id: 'OPEN', label: 'Açık' },
  { id: 'REVIEWED', label: 'İncelendi' },
  { id: 'DISMISSED', label: 'Reddedildi' },
  { id: 'ALL', label: 'Tümü' },
];

const statusTone = (s: UserReportStatus) =>
  s === 'OPEN' ? ('warning' as const) : s === 'REVIEWED' ? ('info' as const) : ('neutral' as const);

interface UserReportsPageProps {
  onRefresh?: () => Promise<void>;
}

export const UserReportsPage: React.FC<UserReportsPageProps> = ({ onRefresh }) => {
  const [rows, setRows] = useState<UserReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | UserReportStatus>('OPEN');
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [resolveTarget, setResolveTarget] = useState<{ id: string; status: 'REVIEWED' | 'DISMISSED' } | null>(null);
  const [notes, setNotes] = useState('');
  const { success, error: toastError } = useAdminToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchUserReports(statusFilter === 'ALL' ? undefined : statusFilter));
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, toastError]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      (r.reporterName || '').toLowerCase().includes(q) ||
      (r.reportedName || '').toLowerCase().includes(q) ||
      (REASON_LABELS[r.reason] || r.reason).toLowerCase().includes(q) ||
      (r.note || '').toLowerCase().includes(q),
    );
  }, [rows, query]);

  const chips = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) counts.set(r.status, (counts.get(r.status) || 0) + 1);
    return STATUS_FILTERS.map((f) => ({
      id: f.id,
      label: f.label,
      count: f.id === 'ALL' ? rows.length : counts.get(f.id) ?? undefined,
    }));
  }, [rows]);

  const openResolve = (id: string, status: 'REVIEWED' | 'DISMISSED') => {
    setResolveTarget({ id, status });
    setNotes('');
  };

  const confirmResolve = async () => {
    if (!resolveTarget || !notes.trim()) return;
    setActioningId(resolveTarget.id);
    try {
      await resolveUserReport(resolveTarget.id, resolveTarget.status, notes.trim());
      success(resolveTarget.status === 'REVIEWED' ? 'Şikayet incelendi olarak işaretlendi' : 'Şikayet reddedildi');
      setResolveTarget(null);
      await load();
      if (onRefresh) await onRefresh();
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setActioningId(null);
    }
  };

  return (
    <>
      <PageShell
        route="USER_REPORTS"
        icon={<ShieldAlert size={20} />}
        actions={
          <button onClick={() => void load()} disabled={loading} className="flex items-center gap-2 h-9 px-4 text-xs font-bold text-gray-400 hover:text-white rounded-xl bg-white/5 border border-white/10 disabled:opacity-50">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Yenile
          </button>
        }
      >
        <div className="space-y-4 mb-4">
          <AdminSearchBar value={query} onChange={setQuery} placeholder="Kullanıcı, sebep veya not ara..." resultCount={filtered.length} totalCount={rows.length} />
          <AdminFilterChips chips={chips} active={statusFilter} onChange={(id) => setStatusFilter(id as 'ALL' | UserReportStatus)} />
        </div>

        <DataTable
          columns={[
            { header: 'ŞİKAYET EDEN → EDİLEN', render: (r: UserReportRow) => (
              <div className="flex items-center gap-2 text-[11px] min-w-[200px]">
                <span className="text-gray-300 font-medium truncate max-w-[90px]" title={r.reporterName}>{r.reporterName || r.reporter_id.slice(0, 8)}</span>
                <ArrowRight size={11} className="text-gray-600 shrink-0" />
                <span className="text-white font-bold truncate max-w-[90px]" title={r.reportedName}>{r.reportedName || r.reported_id.slice(0, 8)}</span>
              </div>
            )},
            { header: 'SEBEP', render: (r: UserReportRow) => (
              <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-red-500/10 text-red-300 border border-red-500/20 uppercase tracking-wide">
                {REASON_LABELS[r.reason] || r.reason}
              </span>
            )},
            { header: 'BAĞLAM', render: (r: UserReportRow) => (
              <span className="text-[11px] text-gray-400">{CONTEXT_LABELS[r.context_type] || r.context_type}</span>
            )},
            { header: 'NOT', render: (r: UserReportRow) => (
              <span className="text-[11px] text-gray-400 line-clamp-2 max-w-[220px] block" title={r.note || ''}>{r.note || '—'}</span>
            )},
            { header: 'DURUM', render: (r: UserReportRow) => (
              <StatusBadge tone={statusTone(r.status)}>{r.status}</StatusBadge>
            )},
            { header: 'TARİH', render: (r: UserReportRow) => (
              <span className="text-[10px] text-gray-500 font-mono">{new Date(r.created_at).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })}</span>
            )},
            { header: 'AKSİYON', render: (r: UserReportRow) => r.status === 'OPEN' ? (
              <div className="flex gap-2">
                <button onClick={() => openResolve(r.id, 'REVIEWED')} disabled={actioningId === r.id} className="flex items-center gap-1 text-[10px] font-bold text-green-400 border border-green-500/30 px-2.5 py-1.5 rounded-lg hover:bg-green-500/10">
                  <Check size={12} /> İncele
                </button>
                <button onClick={() => openResolve(r.id, 'DISMISSED')} disabled={actioningId === r.id} className="flex items-center gap-1 text-[10px] font-bold text-red-400 border border-red-500/30 px-2.5 py-1.5 rounded-lg hover:bg-red-500/10">
                  <X size={12} /> Reddet
                </button>
              </div>
            ) : <span className="text-[11px] text-gray-500" title={r.resolution_notes || ''}>{r.resolution_notes || '—'}</span> },
          ]}
          data={filtered}
          loading={loading}
          emptyMessage={statusFilter === 'OPEN' ? 'Açık şikayet yok' : 'Kayıt yok'}
        />
      </PageShell>

      <AnimatePresence>
        {resolveTarget && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setResolveTarget(null)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md bg-[#161B22] border border-white/10 rounded-2xl p-6 shadow-2xl"
            >
              <h3 className="text-sm font-black text-white mb-1">
                {resolveTarget.status === 'REVIEWED' ? 'Şikayeti incele & kapat' : 'Şikayeti reddet'}
              </h3>
              <p className="text-xs text-gray-500 mb-4">Karar notu zorunludur — denetim kaydına yazılır.</p>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder={resolveTarget.status === 'REVIEWED' ? 'Alınan aksiyon / inceleme notu...' : 'Red sebebi...'}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white resize-none focus:outline-none focus:border-white/20"
              />
              <div className="flex gap-2 justify-end mt-4">
                <button onClick={() => setResolveTarget(null)} className="px-4 py-2 text-xs font-bold text-gray-400 hover:text-white rounded-xl border border-white/10">İptal</button>
                <button
                  onClick={() => void confirmResolve()}
                  disabled={!notes.trim() || actioningId === resolveTarget.id}
                  className="px-4 py-2 text-xs font-black rounded-xl text-white bg-red-600 hover:bg-red-500 disabled:opacity-50"
                >
                  Onayla
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
