import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DataTable } from '../components/DataTable';
import { AdminSearchBar } from '../components/AdminSearchBar';
import {
  fetchServiceDisputes,
  releaseServicePayout,
  resolveNoShowDispute,
  toTurkishAdminError,
  type ServiceDisputeRow,
} from '../../services/adminService';
import { PageShell } from '../components/PageShell';
import { StatusBadge } from '../components/StatusBadge';
import { useAdminToast } from '../context/AdminToastContext';
import { AlertOctagon, RefreshCw, Check, ShieldAlert } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const providerTypeLabel = (t: string | null): string => {
  if (!t) return 'Sağlayıcı';
  const upper = t.toUpperCase();
  if (upper.includes('GK') || upper.includes('KALEC')) return 'Kaleci';
  if (upper.includes('REF') || upper.includes('HAKEM')) return 'Hakem';
  return t;
};

export const ServiceDisputesPage: React.FC = () => {
  const [rows, setRows] = useState<ServiceDisputeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [releaseTarget, setReleaseTarget] = useState<ServiceDisputeRow | null>(null);
  // F1.4: no-show/itiraz kararı — uphold=true kaptan haklı (ceza kesinleşir),
  // uphold=false sağlayıcı haklı (ceza iadesi + payout geri açılır).
  const [resolveTarget, setResolveTarget] = useState<{ row: ServiceDisputeRow; uphold: boolean } | null>(null);
  const [resolveNote, setResolveNote] = useState('');
  const { success, error: toastError } = useAdminToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchServiceDisputes());
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
      r.match_id.toLowerCase().includes(q) ||
      (r.provider_name ?? '').toLowerCase().includes(q) ||
      (r.provider_type ?? '').toLowerCase().includes(q),
    );
  }, [rows, query]);

  const confirmResolve = async () => {
    if (!resolveTarget) return;
    setActioningId(resolveTarget.row.id);
    try {
      await resolveNoShowDispute(resolveTarget.row.id, resolveTarget.uphold, resolveNote || undefined);
      success(resolveTarget.uphold ? 'Ceza kesinleşti — kaptan haklı bulundu' : 'İtiraz kabul edildi — sağlayıcı haklı bulundu');
      setResolveTarget(null);
      setResolveNote('');
      await load();
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setActioningId(null);
    }
  };

  const confirmRelease = async () => {
    if (!releaseTarget) return;
    setActioningId(releaseTarget.id);
    try {
      await releaseServicePayout(releaseTarget.id);
      success('Ödeme serbest bırakıldı');
      setReleaseTarget(null);
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
        route="SERVICE_DISPUTES"
        icon={<AlertOctagon size={20} />}
        actions={
          <button onClick={() => void load()} disabled={loading} className="flex items-center gap-2 h-9 px-4 text-xs font-bold text-gray-400 hover:text-white rounded-xl bg-white/5 border border-white/10 disabled:opacity-50">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Yenile
          </button>
        }
      >
        <div className="bg-orange-500/5 border border-orange-500/15 rounded-xl px-4 py-3 mb-4 flex items-start gap-2">
          <ShieldAlert size={14} className="text-orange-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-gray-400 leading-relaxed">
            İki tür kayıt: <span className="text-orange-300 font-bold">No-show / İtiraz</span> — kaptan gelmedi bildirdi
            (sağlayıcı itiraz etmiş olabilir); kararı burada verin, para hareketleri ve bildirimler otomatik.
            <span className="text-gray-300 font-bold"> Değerlendirme bekliyor</span> — sağlayıcı katılım bildirdi;
            inceleme sonrası ödemeyi serbest bırakabilirsiniz.
          </p>
        </div>
        <AdminSearchBar value={query} onChange={setQuery} placeholder="Maç ID, sağlayıcı veya tür ara..." resultCount={filtered.length} totalCount={rows.length} className="mb-4" />
        <DataTable
          columns={[
            { header: 'Maç', render: (r: ServiceDisputeRow) => (
              <span className="font-mono text-[11px] text-cyan-400" title={r.match_id}>{r.match_id.slice(0, 8)}…</span>
            )},
            { header: 'Sağlayıcı', render: (r: ServiceDisputeRow) => (
              <div className="flex flex-col">
                <span className="text-sm text-white">{r.provider_name ?? '—'}</span>
                <span className="text-[10px] text-gray-500">{providerTypeLabel(r.provider_type)}</span>
              </div>
            )},
            { header: 'Ücret', render: (r: ServiceDisputeRow) => (
              <span className="text-sm text-green-400 font-bold">₺{r.provider_amount ?? r.fee ?? 0}</span>
            )},
            { header: 'Bildirim', render: (r: ServiceDisputeRow) => (
              <span className="text-[11px] text-gray-400">{new Date(r.reported_at).toLocaleDateString('tr-TR')}</span>
            )},
            { header: 'Durum', render: (r: ServiceDisputeRow) => (
              r.status === 'DISPUTED' ? (
                <div className="flex flex-col gap-0.5">
                  <StatusBadge tone="danger">Sağlayıcı itiraz etti</StatusBadge>
                  {r.dispute_deadline && <span className="text-[9px] text-gray-500">Son: {new Date(r.dispute_deadline).toLocaleString('tr-TR')}</span>}
                </div>
              ) : r.status === 'NOSHOW_REPORTED' ? (
                <div className="flex flex-col gap-0.5">
                  <StatusBadge tone="warning">No-show bildirildi</StatusBadge>
                  {r.dispute_deadline && <span className="text-[9px] text-gray-500">İtiraz sonu: {new Date(r.dispute_deadline).toLocaleString('tr-TR')}</span>}
                </div>
              ) : (
                <StatusBadge tone="neutral">Değerlendirme bekliyor</StatusBadge>
              )
            )},
            { header: 'Aksiyon', render: (r: ServiceDisputeRow) => (
              (r.status === 'NOSHOW_REPORTED' || r.status === 'DISPUTED') ? (
                <div className="flex flex-col gap-1.5">
                  <button
                    onClick={() => { setResolveNote(''); setResolveTarget({ row: r, uphold: false }); }}
                    disabled={actioningId === r.id}
                    className="flex items-center gap-1 text-[10px] font-bold text-green-400 border border-green-500/30 px-2.5 py-1.5 rounded-lg hover:bg-green-500/10 disabled:opacity-50"
                  >
                    <Check size={12} /> Sağlayıcı Haklı
                  </button>
                  <button
                    onClick={() => { setResolveNote(''); setResolveTarget({ row: r, uphold: true }); }}
                    disabled={actioningId === r.id}
                    className="flex items-center gap-1 text-[10px] font-bold text-red-400 border border-red-500/30 px-2.5 py-1.5 rounded-lg hover:bg-red-500/10 disabled:opacity-50"
                  >
                    <ShieldAlert size={12} /> Cezayı Onayla
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setReleaseTarget(r)}
                  disabled={actioningId === r.id}
                  className="flex items-center gap-1 text-[10px] font-bold text-green-400 border border-green-500/30 px-2.5 py-1.5 rounded-lg hover:bg-green-500/10 disabled:opacity-50"
                >
                  <Check size={12} /> Ödemeyi Serbest Bırak
                </button>
              )
            )},
          ]}
          data={filtered}
          loading={loading}
          emptyMessage="Açık hizmet itirazı yok"
          emptyDescription="Sorun bildirilen ve henüz çözülmemiş hizmet ödemesi bulunmuyor."
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
              className="w-full max-w-md bg-surface-1 border border-white/10 rounded-2xl p-6 shadow-2xl"
            >
              <h3 className="text-sm font-extrabold text-white mb-1">
                {resolveTarget.uphold ? 'Cezayı onayla (kaptan haklı)' : 'İtirazı kabul et (sağlayıcı haklı)'}
              </h3>
              <p className="text-xs text-gray-500 mb-3">
                {resolveTarget.uphold ? (
                  <>Ceza (₺{resolveTarget.row.penalty_amount ?? 0}) kesinleşecek, kayıt kapanacak (NOSHOW_FINALIZED).
                  Her iki tarafa bildirim gider.</>
                ) : (
                  <>Sağlayıcıya kesilen ceza iade edilir, kaptanın no-show tazminatı ve ücret iadesi geri alınır,
                  ₺{resolveTarget.row.provider_amount ?? resolveTarget.row.fee ?? 0} kazanç sağlayıcıya serbest bırakılır.
                  Tüm hareketler denetim kaydına yazılır.</>
                )}
              </p>
              <textarea
                value={resolveNote}
                onChange={(e) => setResolveNote(e.target.value)}
                placeholder="Karar notu (taraflara giden bildirime eklenir, opsiyonel)"
                rows={2}
                className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder:text-gray-600 mb-3"
              />
              <div className="flex gap-2 justify-end">
                <button onClick={() => setResolveTarget(null)} className="px-4 py-2 text-xs font-bold text-gray-400 hover:text-white rounded-xl border border-white/10">İptal</button>
                <button
                  onClick={() => void confirmResolve()}
                  disabled={actioningId === resolveTarget.row.id}
                  className={`px-4 py-2 text-xs font-extrabold rounded-xl text-white disabled:opacity-50 ${resolveTarget.uphold ? 'bg-red-600 hover:bg-red-500' : 'bg-green-600 hover:bg-green-500'}`}
                >
                  {resolveTarget.uphold ? 'Cezayı Onayla' : 'İtirazı Kabul Et'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
        {releaseTarget && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setReleaseTarget(null)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md bg-surface-1 border border-white/10 rounded-2xl p-6 shadow-2xl"
            >
              <h3 className="text-sm font-extrabold text-white mb-1">Ödemeyi serbest bırak</h3>
              <p className="text-xs text-gray-500 mb-4">
                {releaseTarget.provider_name ?? 'Sağlayıcı'} için <span className="text-green-400 font-bold">₺{releaseTarget.provider_amount ?? releaseTarget.fee ?? 0}</span> tutarındaki ödeme serbest bırakılacak. Bu işlem denetim kaydına yazılır.
              </p>
              <div className="flex gap-2 justify-end mt-4">
                <button onClick={() => setReleaseTarget(null)} className="px-4 py-2 text-xs font-bold text-gray-400 hover:text-white rounded-xl border border-white/10">İptal</button>
                <button
                  onClick={() => void confirmRelease()}
                  disabled={actioningId === releaseTarget.id}
                  className="px-4 py-2 text-xs font-extrabold rounded-xl text-white bg-green-600 hover:bg-green-500 disabled:opacity-50"
                >
                  Serbest Bırak
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
