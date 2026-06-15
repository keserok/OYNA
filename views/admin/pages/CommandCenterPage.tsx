import React, { useCallback, useEffect, useState } from 'react';
import { useAppStore } from '../../../store';
import {
  fetchOpsQueue, processAccountDeletion, toTurkishAdminError,
  type OpsQueue,
} from '../../../services/adminService';
import { openGhostInConsumerApp } from '../../../utils/ghostDeepLink';
import { PageShell } from '../components/PageShell';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useAdminToast } from '../context/AdminToastContext';
import { Zap, RefreshCw, Trash2, ExternalLink, PlayCircle } from 'lucide-react';

interface CommandCenterPageProps {
  mode?: 'embedded' | 'standalone';
  onNavigate?: (route: string) => void;
}

export const CommandCenterPage: React.FC<CommandCenterPageProps> = ({ mode = 'embedded', onNavigate }) => {
  const { adminUsers } = useAppStore();
  const [queue, setQueue] = useState<OpsQueue | null>(null);
  const [loading, setLoading] = useState(true);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [ghostQuery, setGhostQuery] = useState('');
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
  const { success, error: toastError } = useAdminToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setQueue(await fetchOpsQueue());
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setLoading(false);
    }
  }, [toastError]);

  useEffect(() => { void load(); }, [load]);

  const confirmDeletion = async () => {
    if (!deleteUserId) return;
    setActioningId(deleteUserId);
    try {
      await processAccountDeletion(deleteUserId, true);
      success('Hesap anonimleştirildi');
      await load();
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setActioningId(null);
      setDeleteUserId(null);
    }
  };

  const ghostResults = ghostQuery.trim().length >= 2
    ? adminUsers.filter((u) =>
        u.name.toLowerCase().includes(ghostQuery.toLowerCase())
        || u.email.toLowerCase().includes(ghostQuery.toLowerCase()),
      ).slice(0, 8)
    : [];

  const QueueSection: React.FC<{ title: string; count: number; children: React.ReactNode; route?: string }> = ({
    title, count, children, route,
  }) => (
    <div className="bg-[#161B22]/60 border border-white/[0.06] rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-bold text-white">{title} <span className="text-gray-500">({count})</span></h3>
        {route && onNavigate && (
          <button onClick={() => onNavigate(route)} className="text-[10px] text-red-400 font-semibold hover:underline">Detay →</button>
        )}
      </div>
      {children}
    </div>
  );

  return (
    <>
      <PageShell
        route="CONTROL"
        icon={<Zap size={20} />}
        actions={
          <button onClick={() => void load()} disabled={loading} className="flex items-center gap-2 h-9 px-4 text-xs font-bold text-gray-400 hover:text-white rounded-xl bg-white/5 border border-white/10 disabled:opacity-50">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Yenile
          </button>
        }
      >
        <div className="bg-gradient-to-r from-red-950/40 to-purple-950/40 border border-red-500/20 rounded-2xl p-5">
          <h3 className="text-xs font-bold text-red-400 mb-3 flex items-center gap-2">
            <PlayCircle size={14} /> Ghost Mode — Kullanıcı Taklidi
          </h3>
          <input
            value={ghostQuery}
            onChange={(e) => setGhostQuery(e.target.value)}
            placeholder="İsim veya e-posta ile ara..."
            className="w-full h-11 bg-black/40 border border-white/10 rounded-xl px-4 text-sm text-white focus:border-red-500/40 outline-none"
          />
          {ghostResults.length > 0 && (
            <div className="mt-3 space-y-1">
              {ghostResults.map((u) => (
                <div key={u.id} className="flex items-center justify-between bg-black/30 rounded-lg px-3 py-2">
                  <div>
                    <p className="text-sm font-semibold text-white">{u.name}</p>
                    <p className="text-[10px] text-gray-500 font-mono">{u.email}</p>
                  </div>
                  {mode === 'standalone' ? (
                    <button
                      onClick={() => openGhostInConsumerApp(u.id, u.name)}
                      className="flex items-center gap-1 text-[10px] font-bold text-red-400 border border-red-500/30 px-2 py-1 rounded-lg hover:bg-red-500/10"
                    >
                      <ExternalLink size={10} /> Uygulamada Aç
                    </button>
                  ) : (
                    <button
                      onClick={() => onNavigate?.('KULLANICILAR')}
                      className="text-[10px] font-semibold text-gray-400 hover:text-white"
                    >
                      Kullanıcılar →
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {loading && !queue ? (
          <div className="text-center text-gray-500 text-sm py-12">Kuyruk yükleniyor...</div>
        ) : queue && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <QueueSection title="GK/Ref Onay" count={queue.pending_verifications?.length ?? 0} route="PENDING_VERIFICATIONS">
              {(queue.pending_verifications ?? []).slice(0, 5).map((v) => (
                <p key={v.id} className="text-[11px] text-gray-400 py-1 border-b border-white/[0.06]">{v.name} — {v.email}</p>
              ))}
              {(queue.pending_verifications ?? []).length === 0 && <p className="text-[11px] text-gray-600">Boş</p>}
            </QueueSection>

            <QueueSection title="Tesis Onay" count={queue.pending_pitches?.length ?? 0} route="MODERATION">
              {(queue.pending_pitches ?? []).slice(0, 5).map((p) => (
                <p key={p.id} className="text-[11px] text-gray-400 py-1 border-b border-white/[0.06]">{p.name}</p>
              ))}
            </QueueSection>

            <QueueSection title="Para Çekme" count={queue.pending_withdrawals?.length ?? 0} route="MODERATION">
              {(queue.pending_withdrawals ?? []).slice(0, 5).map((w) => (
                <p key={w.id} className="text-[11px] text-[#39FF14] py-1 border-b border-white/[0.06]">{Number(w.amount).toLocaleString('tr')}₺</p>
              ))}
            </QueueSection>

            <QueueSection title="Skor İhtilafları" count={queue.open_disputes?.length ?? 0} route="DISPUTES">
              {(queue.open_disputes ?? []).slice(0, 5).map((d) => (
                <p key={d.id} className="text-[11px] text-yellow-400 py-1 border-b border-white/[0.06]">Maç {d.match_id.slice(0, 8)}… — {d.status}</p>
              ))}
            </QueueSection>

            <QueueSection title="KVKK Silme Talepleri" count={queue.deletion_requests?.length ?? 0}>
              {(queue.deletion_requests ?? []).map((d) => (
                <div key={d.id} className="flex items-center justify-between py-1 border-b border-white/[0.06]">
                  <div>
                    <p className="text-[11px] text-white font-semibold">{d.name}</p>
                    <p className="text-[10px] text-gray-600">{d.email}</p>
                  </div>
                  <button
                    onClick={() => setDeleteUserId(d.id)}
                    disabled={actioningId === d.id}
                    className="flex items-center gap-1 text-[10px] font-bold text-red-400 border border-red-500/30 px-2 py-1 rounded-lg hover:bg-red-500/10 disabled:opacity-50"
                  >
                    <Trash2 size={10} /> İşle
                  </button>
                </div>
              ))}
            </QueueSection>

            <QueueSection title="Topluluk Talepleri" count={queue.community_requests?.length ?? 0} route="TOPLULUKLAR">
              {(queue.community_requests ?? []).slice(0, 5).map((c) => (
                <p key={c.id} className="text-[11px] text-blue-400 py-1 border-b border-white/[0.06]">{c.name}</p>
              ))}
            </QueueSection>
          </div>
        )}
      </PageShell>

      <ConfirmDialog
        open={!!deleteUserId}
        title="Hesap silme talebi"
        description="Hesabı anonimleştirerek silme işlemini onaylıyor musunuz? Bu işlem geri alınamaz."
        confirmLabel="Anonimleştir"
        destructive
        onConfirm={() => void confirmDeletion()}
        onCancel={() => setDeleteUserId(null)}
      />
    </>
  );
};
