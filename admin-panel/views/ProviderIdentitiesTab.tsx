import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, X, Clock, RefreshCw, ShieldCheck } from 'lucide-react';
import {
  fetchPendingProviderIdentities,
  verifyProviderIdentity,
  toTurkishAdminError,
  type ProviderIdentityRow,
} from '../services/adminService';
import { useAdminToast } from './context/AdminToastContext';

const RejectModal: React.FC<{
  userName: string;
  onConfirm: (notes: string) => void;
  onCancel: () => void;
}> = ({ userName, onConfirm, onCancel }) => {
  const [notes, setNotes] = useState('');
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-6"
    >
      <motion.div
        initial={{ scale: 0.95, y: 12 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 12 }}
        className="w-full max-w-sm bg-[#0D1117] border border-red-500/20 rounded-3xl p-6"
      >
        <h3 className="text-lg font-black text-white mb-1">Kimlik Reddi</h3>
        <p className="text-xs text-gray-400 mb-4">{userName} için reddetme sebebi</p>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Kullanıcıya iletilecek açıklama..."
          rows={3}
          className="w-full bg-black/50 border border-white/10 rounded-xl p-3 text-sm text-white outline-none focus:border-red-500/50 resize-none mb-4"
        />
        <div className="flex gap-3">
          <button type="button" onClick={onCancel} className="flex-1 h-10 rounded-xl text-xs font-black text-gray-400 border border-white/10">İptal</button>
          <button type="button" onClick={() => onConfirm(notes)} className="flex-1 h-10 rounded-xl text-xs font-black bg-red-600/80 text-white">Reddet</button>
        </div>
      </motion.div>
    </motion.div>
  );
};

const IdentityCard = memo<{
  v: ProviderIdentityRow;
  isProcessing: boolean;
  onApprove: () => void;
  onReject: () => void;
}>(({ v, isProcessing, onApprove, onReject }) => {
  const joinDate = new Date(v.created_at).toLocaleDateString('tr-TR');

  return (
    <div className="bg-[#161B22] border border-white/5 rounded-2xl p-4">
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-xl overflow-hidden bg-gray-800 shrink-0">
          {v.avatar_url ? (
            <img src={v.avatar_url} className="w-full h-full object-cover" referrerPolicy="no-referrer" alt="" loading="lazy" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-600 font-black text-lg">
              {(v.full_name ?? '?')[0]}
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span className="text-sm font-black text-white">{v.full_name ?? 'İsimsiz'}</span>
            <span className="flex items-center gap-0.5 px-1.5 py-0.5 text-[8px] font-black rounded bg-orange-500/15 text-orange-400 border border-orange-500/20">
              <Clock size={8} /> Bekliyor
            </span>
          </div>
          <p className="text-[10px] text-gray-500">{v.email ?? '-'} · {joinDate}</p>
          {v.birth_year != null && (
            <p className="text-[11px] text-gray-400 mt-1">Doğum yılı: {v.birth_year}</p>
          )}
        </div>
      </div>

      <div className="flex gap-2 mt-3">
        <button
          type="button"
          onClick={onApprove}
          disabled={isProcessing}
          className="flex-1 h-9 rounded-xl text-xs font-black bg-green-500/15 text-green-400 border border-green-500/20 hover:bg-green-500/25 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
          {isProcessing ? <RefreshCw size={11} className="animate-spin" /> : <Check size={11} />}
          Onayla
        </button>
        <button
          type="button"
          onClick={onReject}
          disabled={isProcessing}
          className="flex-1 h-9 rounded-xl text-xs font-black bg-red-500/15 text-red-400 border border-red-500/20 hover:bg-red-500/25 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
          <X size={11} />
          Reddet
        </button>
      </div>
    </div>
  );
});
IdentityCard.displayName = 'IdentityCard';

interface ProviderIdentitiesTabProps {
  onBadgeCount?: (n: number) => void;
  refreshToken?: number;
}

export const ProviderIdentitiesTab: React.FC<ProviderIdentitiesTabProps> = ({ onBadgeCount, refreshToken = 0 }) => {
  const [identities, setIdentities] = useState<ProviderIdentityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<ProviderIdentityRow | null>(null);
  const { success, error: toastError } = useAdminToast();
  const onBadgeCountRef = useRef(onBadgeCount);
  onBadgeCountRef.current = onBadgeCount;
  const hasLoadedOnce = useRef(false);

  const fetchPending = useCallback(async () => {
    if (!hasLoadedOnce.current) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const data = await fetchPendingProviderIdentities();
      setIdentities(data);
      onBadgeCountRef.current?.(data.length);
    } catch (err) {
      setError(toTurkishAdminError(err));
      onBadgeCountRef.current?.(0);
    } finally {
      hasLoadedOnce.current = true;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchPending();
  }, [fetchPending]);

  useEffect(() => {
    if (refreshToken > 0) void fetchPending();
  }, [refreshToken, fetchPending]);

  const handleApprove = async (userId: string, userName: string) => {
    setProcessingId(userId);
    try {
      await verifyProviderIdentity(userId, true);
      success(`${userName} kimliği doğrulandı`);
      setIdentities((prev) => {
        const next = prev.filter((v) => v.user_id !== userId);
        onBadgeCountRef.current?.(next.length);
        return next;
      });
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (userId: string, notes: string, userName: string) => {
    setProcessingId(userId);
    try {
      await verifyProviderIdentity(userId, false, notes || undefined);
      success(`${userName} kimliği reddedildi`);
      setIdentities((prev) => {
        const next = prev.filter((v) => v.user_id !== userId);
        onBadgeCountRef.current?.(next.length);
        return next;
      });
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setProcessingId(null);
      setRejectTarget(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <RefreshCw size={20} className="animate-spin text-gray-500" />
      </div>
    );
  }

  return (
    <div>
      {error && <p className="text-red-400 text-xs mb-3">{error}</p>}
      <div className="bg-blue-500/5 border border-blue-500/15 rounded-xl px-4 py-3 mb-4 flex items-start gap-2">
        <ShieldCheck size={14} className="text-blue-400 shrink-0 mt-0.5" />
        <p className="text-[11px] text-gray-400 leading-relaxed">
          Sağlayıcı ödemelerini almadan önce kimlik doğrulaması gerekir. TC kimlik numarası açık saklanmaz; yalnızca ad ve durum görünür.
        </p>
      </div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-black uppercase tracking-tighter">
          Kimlik Doğrulama
          {identities.length > 0 && (
            <span className="ml-2 px-2 py-0.5 text-xs bg-red-500/20 text-red-400 border border-red-500/30 rounded-full font-black">
              {identities.length}
            </span>
          )}
        </h2>
        <button
          type="button"
          onClick={() => void fetchPending()}
          disabled={refreshing}
          className="h-9 px-3 bg-white/5 border border-white/10 rounded-xl text-gray-300 text-xs font-bold flex items-center gap-2 hover:bg-white/10 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} /> Yenile
        </button>
      </div>

      {identities.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-3 border border-green-500/20">
            <Check size={28} className="text-green-400" />
          </div>
          <p className="text-gray-400 font-bold">Doğrulama bekleyen kimlik yok</p>
          <p className="text-xs text-gray-600 mt-1">Tüm kimlik talepleri işlendi</p>
        </div>
      ) : (
        <div className="space-y-3">
          {identities.map((v) => (
            <IdentityCard
              key={v.user_id}
              v={v}
              isProcessing={processingId === v.user_id}
              onApprove={() => void handleApprove(v.user_id, v.full_name ?? 'Kullanıcı')}
              onReject={() => setRejectTarget(v)}
            />
          ))}
        </div>
      )}

      <AnimatePresence>
        {rejectTarget && (
          <RejectModal
            userName={rejectTarget.full_name ?? 'Kullanıcı'}
            onConfirm={(notes) => void handleReject(rejectTarget.user_id, notes, rejectTarget.full_name ?? 'Kullanıcı')}
            onCancel={() => setRejectTarget(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default ProviderIdentitiesTab;
