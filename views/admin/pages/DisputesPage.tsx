import React, { useCallback, useEffect, useState } from 'react';
import { DataTable } from '../components/DataTable';
import { fetchMatchDisputes, resolveDispute, toTurkishAdminError, type MatchDisputeRow } from '../../../services/adminService';
import { PageShell } from '../components/PageShell';
import { StatusBadge } from '../components/StatusBadge';
import { useAdminToast } from '../context/AdminToastContext';
import { Scale, RefreshCw, Check, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export const DisputesPage: React.FC = () => {
  const [rows, setRows] = useState<MatchDisputeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [resolveTarget, setResolveTarget] = useState<{ id: string; status: 'RESOLVED' | 'DISMISSED' } | null>(null);
  const [notes, setNotes] = useState('');
  const { success, error: toastError } = useAdminToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchMatchDisputes());
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setLoading(false);
    }
  }, [toastError]);

  useEffect(() => { void load(); }, [load]);

  const openResolve = (id: string, status: 'RESOLVED' | 'DISMISSED') => {
    setResolveTarget({ id, status });
    setNotes('');
  };

  const confirmResolve = async () => {
    if (!resolveTarget || !notes.trim()) return;
    setActioningId(resolveTarget.id);
    try {
      await resolveDispute(resolveTarget.id, resolveTarget.status, notes.trim());
      success(resolveTarget.status === 'RESOLVED' ? 'İhtilaf çözüldü' : 'İhtilaf reddedildi');
      setResolveTarget(null);
      await load();
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setActioningId(null);
    }
  };

  return (
    <>
      <PageShell
        route="DISPUTES"
        icon={<Scale size={20} />}
        actions={
          <button onClick={() => void load()} disabled={loading} className="flex items-center gap-2 h-9 px-4 text-xs font-bold text-gray-400 hover:text-white rounded-xl bg-white/5 border border-white/10 disabled:opacity-50">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Yenile
          </button>
        }
      >
        <DataTable
          columns={[
            { header: 'Maç', render: (r: MatchDisputeRow) => <span className="font-mono text-[11px] text-gray-400">{r.match_id.slice(0, 8)}…</span> },
            { header: 'Skorlar', render: (r: MatchDisputeRow) => (
              <span className="text-sm text-white">{r.home_claimed_score ?? '?'} — {r.away_claimed_score ?? '?'}</span>
            )},
            { header: 'Durum', render: (r: MatchDisputeRow) => (
              <StatusBadge tone={r.status === 'OPEN' ? 'warning' : 'neutral'}>{r.status}</StatusBadge>
            )},
            { header: 'Aksiyon', render: (r: MatchDisputeRow) => r.status !== 'RESOLVED' && r.status !== 'DISMISSED' ? (
              <div className="flex gap-2">
                <button onClick={() => openResolve(r.id, 'RESOLVED')} disabled={actioningId === r.id} className="flex items-center gap-1 text-[10px] font-bold text-green-400 border border-green-500/30 px-2.5 py-1.5 rounded-lg hover:bg-green-500/10">
                  <Check size={12} /> Çöz
                </button>
                <button onClick={() => openResolve(r.id, 'DISMISSED')} disabled={actioningId === r.id} className="flex items-center gap-1 text-[10px] font-bold text-red-400 border border-red-500/30 px-2.5 py-1.5 rounded-lg hover:bg-red-500/10">
                  <X size={12} /> Reddet
                </button>
              </div>
            ) : <span className="text-[11px] text-gray-500">{r.resolution_notes || '—'}</span> },
          ]}
          data={rows}
          loading={loading}
          emptyMessage="Açık ihtilaf yok"
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
                {resolveTarget.status === 'RESOLVED' ? 'İhtilafı çöz' : 'İhtilafı reddet'}
              </h3>
              <p className="text-xs text-gray-500 mb-4">Karar notu zorunludur — denetim kaydına yazılır.</p>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder={resolveTarget.status === 'RESOLVED' ? 'Çözüm notu...' : 'Red sebebi...'}
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
