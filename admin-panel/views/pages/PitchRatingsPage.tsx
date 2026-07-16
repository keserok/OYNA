import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Star, RefreshCw, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { DataTable } from '../components/DataTable';
import { AdminSearchBar } from '../components/AdminSearchBar';
import { PageShell } from '../components/PageShell';
import { useAdminToast } from '../context/AdminToastContext';
import {
  fetchPitchRatings,
  deletePitchRating,
  toTurkishAdminError,
  type AdminPitchRatingRow,
} from '../../services/adminService';

const Stars: React.FC<{ score: number }> = ({ score }) => (
  <span className="inline-flex items-center gap-0.5" title={`${score}/5`}>
    {[1, 2, 3, 4, 5].map((i) => (
      <Star key={i} size={12} className={i <= score ? 'text-yellow-400 fill-yellow-400' : 'text-gray-700'} />
    ))}
  </span>
);

interface PitchRatingsPageProps {
  onRefresh?: () => Promise<void>;
}

export const PitchRatingsPage: React.FC<PitchRatingsPageProps> = ({ onRefresh }) => {
  const [rows, setRows] = useState<AdminPitchRatingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<AdminPitchRatingRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { success, error: toastError } = useAdminToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchPitchRatings());
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setLoading(false);
    }
  }, [toastError]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      (r.pitchName || '').toLowerCase().includes(q) ||
      (r.raterName || '').toLowerCase().includes(q) ||
      (r.comment || '').toLowerCase().includes(q),
    );
  }, [rows, query]);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deletePitchRating(deleteTarget.id);
      success('Yorum silindi — saha puanı otomatik güncellendi');
      setDeleteTarget(null);
      await load();
      if (onRefresh) await onRefresh();
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <PageShell
        route="PITCH_RATINGS"
        icon={<Star size={20} />}
        actions={
          <button onClick={() => void load()} disabled={loading} className="flex items-center gap-2 h-9 px-4 text-xs font-bold text-gray-400 hover:text-white rounded-xl bg-white/5 border border-white/10 disabled:opacity-50">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Yenile
          </button>
        }
      >
        <AdminSearchBar value={query} onChange={setQuery} placeholder="Saha, kullanıcı veya yorum ara..." resultCount={filtered.length} totalCount={rows.length} className="mb-4" />
        <DataTable
          columns={[
            { header: 'SAHA', render: (r: AdminPitchRatingRow) => (
              <span className="text-sm text-white font-medium">{r.pitchName || r.pitch_id.slice(0, 8) + '…'}</span>
            )},
            { header: 'PUANLAYAN', render: (r: AdminPitchRatingRow) => (
              <span className="text-[11px] text-gray-400">{r.raterName || r.rater_id.slice(0, 8)}</span>
            )},
            { header: 'PUAN', render: (r: AdminPitchRatingRow) => <Stars score={r.score} /> },
            { header: 'YORUM', render: (r: AdminPitchRatingRow) => (
              <div className="max-w-[280px]">
                <p className="text-[11px] text-gray-300 line-clamp-2" title={r.comment || ''}>{r.comment || <span className="text-gray-600">— (yalnız puan)</span>}</p>
                {r.tags && r.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {r.tags.slice(0, 4).map((t, i) => (
                      <span key={i} className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-white/5 text-gray-400 border border-white/10">{t}</span>
                    ))}
                  </div>
                )}
              </div>
            )},
            { header: 'TARİH', render: (r: AdminPitchRatingRow) => (
              <span className="text-[10px] text-gray-500 font-mono">{new Date(r.created_at).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })}</span>
            )},
            { header: '', render: (r: AdminPitchRatingRow) => (
              <button onClick={() => setDeleteTarget(r)} className="p-1.5 text-gray-500 hover:text-red-400 rounded-lg hover:bg-red-500/10" title="Uygunsuz yorumu sil">
                <Trash2 size={14} />
              </button>
            )},
          ]}
          data={filtered}
          loading={loading}
          emptyMessage="Henüz saha yorumu yok"
        />
      </PageShell>

      <AnimatePresence>
        {deleteTarget && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setDeleteTarget(null)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md bg-[#161B22] border border-white/10 rounded-2xl p-6 shadow-2xl"
            >
              <h3 className="text-sm font-black text-white mb-1">Saha yorumunu sil</h3>
              <p className="text-xs text-gray-500 mb-3">
                <span className="text-white font-bold">{deleteTarget.pitchName || 'Saha'}</span> için {deleteTarget.raterName || 'kullanıcı'} tarafından verilen yorum kalıcı olarak silinecek. Sahanın ortalama puanı otomatik güncellenir.
              </p>
              {deleteTarget.comment && (
                <p className="text-[11px] text-gray-400 bg-black/40 border border-white/10 rounded-xl px-3 py-2 mb-4 italic">“{deleteTarget.comment}”</p>
              )}
              <div className="flex gap-2 justify-end">
                <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 text-xs font-bold text-gray-400 hover:text-white rounded-xl border border-white/10">İptal</button>
                <button onClick={() => void confirmDelete()} disabled={deleting} className="px-4 py-2 text-xs font-black rounded-xl text-white bg-red-600 hover:bg-red-500 disabled:opacity-50">
                  {deleting ? 'Siliniyor...' : 'Sil'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
