import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, Clock, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../../supabaseClient';

interface PendingVerification {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  primary_role: string | null;
  roles: string[] | null;
  verification_status: string;
  created_at: string;
  gk_profile_id: string | null;
  gk_bio: string | null;
  gk_fee: number | null;
  ref_profile_id: string | null;
  ref_bio: string | null;
  ref_fee: number | null;
}

const useToastLocal = () => {
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const show = useCallback((text: string, ok = true) => {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 2500);
  }, []);
  const Toast = () => (
    <AnimatePresence>
      {msg && (
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className={`fixed top-4 right-4 z-[300] px-4 py-2.5 rounded-xl text-xs font-black shadow-2xl border backdrop-blur-sm flex items-center gap-2 ${msg.ok ? 'bg-green-900/90 border-green-500/30 text-green-300' : 'bg-red-900/90 border-red-500/30 text-red-300'}`}
        >
          {msg.text}
        </motion.div>
      )}
    </AnimatePresence>
  );
  return { show, Toast };
};

// ─── Reddetme modal ────────────────────────────────────────────────────────────
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
        initial={{ scale: 0.88, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.88, y: 20 }}
        className="w-full max-w-sm bg-[#0D1117] border border-red-500/20 rounded-3xl p-6"
      >
        <h3 className="text-lg font-black text-white mb-1">Reddetme Notu</h3>
        <p className="text-xs text-gray-400 mb-4">{userName} için reddetme sebebi</p>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Kullanıcıya iletilecek açıklama..."
          rows={3}
          className="w-full bg-black/50 border border-white/10 rounded-xl p-3 text-sm text-white outline-none focus:border-red-500/50 resize-none mb-4"
        />
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 h-10 rounded-xl text-xs font-black text-gray-400 border border-white/10"
          >
            İptal
          </button>
          <button
            onClick={() => onConfirm(notes)}
            className="flex-1 h-10 rounded-xl text-xs font-black bg-red-600/80 text-white"
          >
            Reddet
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

export const PendingVerificationsTab: React.FC<{ onBadgeCount?: (n: number) => void }> = ({ onBadgeCount }) => {
  const [verifications, setVerifications] = useState<PendingVerification[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<PendingVerification | null>(null);
  const { show: toast, Toast } = useToastLocal();

  const fetchPending = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('pending_provider_verifications')
      .select('*')
      .order('created_at', { ascending: true });

    if (!error && data) {
      setVerifications(data as PendingVerification[]);
      onBadgeCount?.(data.length);
    }
    setLoading(false);
  }, [onBadgeCount]);

  useEffect(() => {
    fetchPending();

    // Realtime: yeni pending gelince badge güncellenir
    const channel = supabase
      .channel('pending-verifications-admin')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles', filter: "verification_status=eq.pending" },
        () => { fetchPending(); },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchPending]);

  const handleApprove = async (userId: string, userName: string) => {
    setProcessingId(userId);
    try {
      const { error } = await supabase.rpc('approve_provider_verification', {
        p_user_id: userId,
        p_approved: true,
      });
      if (error) throw error;
      toast(`✅ ${userName} onaylandı`);
      setVerifications(prev => prev.filter(v => v.id !== userId));
      onBadgeCount?.(verifications.length - 1);
    } catch (err) {
      toast(`❌ Hata: ${(err as Error).message}`, false);
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (userId: string, notes: string, userName: string) => {
    setRejectTarget(null);
    setProcessingId(userId);
    try {
      const { error } = await supabase.rpc('approve_provider_verification', {
        p_user_id: userId,
        p_approved: false,
        p_notes: notes || null,
      });
      if (error) throw error;
      toast(`🚫 ${userName} reddedildi`);
      setVerifications(prev => prev.filter(v => v.id !== userId));
      onBadgeCount?.(verifications.length - 1);
    } catch (err) {
      toast(`❌ Hata: ${(err as Error).message}`, false);
    } finally {
      setProcessingId(null);
    }
  };

  const roleLabel = (v: PendingVerification) => {
    if (v.gk_profile_id) return 'KALECİ';
    if (v.ref_profile_id) return 'HAKEM';
    return v.primary_role ?? 'BİLİNMİYOR';
  };

  const roleBio = (v: PendingVerification) => {
    if (v.gk_bio) return v.gk_bio;
    if (v.ref_bio) return v.ref_bio;
    return null;
  };

  const roleFee = (v: PendingVerification) => {
    if (v.gk_fee != null) return v.gk_fee;
    if (v.ref_fee != null) return v.ref_fee;
    return null;
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
      <Toast />
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-black uppercase tracking-tighter">
          Onay Bekleyenler
          {verifications.length > 0 && (
            <span className="ml-2 px-2 py-0.5 text-xs bg-red-500/20 text-red-400 border border-red-500/30 rounded-full font-black">
              {verifications.length}
            </span>
          )}
        </h2>
        <button
          onClick={fetchPending}
          className="h-9 px-3 bg-white/5 border border-white/10 rounded-xl text-gray-300 text-xs font-bold flex items-center gap-2 hover:bg-white/10 transition-colors"
        >
          <RefreshCw size={12} /> Yenile
        </button>
      </div>

      {verifications.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-3 border border-green-500/20">
            <Check size={28} className="text-green-400" />
          </div>
          <p className="text-gray-400 font-bold">Onay bekleyen profil yok</p>
          <p className="text-xs text-gray-600 mt-1">Tüm başvurular işlendi</p>
        </div>
      ) : (
        <div className="space-y-3">
          {verifications.map(v => {
            const isProcessing = processingId === v.id;
            const bio = roleBio(v);
            const fee = roleFee(v);
            const joinDate = new Date(v.created_at).toLocaleDateString('tr-TR');

            return (
              <motion.div
                key={v.id}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -30 }}
                className="bg-[#161B22] border border-white/5 rounded-2xl p-4"
              >
                <div className="flex items-start gap-3">
                  {/* Avatar */}
                  <div className="w-12 h-12 rounded-xl overflow-hidden bg-gray-800 shrink-0">
                    {v.avatar_url ? (
                      <img src={v.avatar_url} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-600 font-black text-lg">
                        {(v.full_name ?? '?')[0]}
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className="text-sm font-black text-white">{v.full_name ?? 'İsimsiz'}</span>
                      <span className="px-1.5 py-0.5 text-[8px] font-black rounded uppercase bg-yellow-500/15 text-yellow-400 border border-yellow-500/20">
                        {roleLabel(v)}
                      </span>
                      <span className="flex items-center gap-0.5 px-1.5 py-0.5 text-[8px] font-black rounded bg-orange-500/15 text-orange-400 border border-orange-500/20">
                        <Clock size={8} /> Bekliyor
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-500">{v.email ?? '-'} · {joinDate}</p>
                    {bio && <p className="text-[11px] text-gray-400 mt-1 line-clamp-2">{bio}</p>}
                    {fee != null && (
                      <p className="text-[11px] text-green-400 font-bold mt-1">Maç başı ücret: ₺{fee}</p>
                    )}
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => handleApprove(v.id, v.full_name ?? 'Kullanıcı')}
                    disabled={isProcessing}
                    className="flex-1 h-9 rounded-xl text-xs font-black bg-green-500/15 text-green-400 border border-green-500/20 hover:bg-green-500/25 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    {isProcessing ? <RefreshCw size={11} className="animate-spin" /> : <Check size={11} />}
                    Onayla
                  </button>
                  <button
                    onClick={() => setRejectTarget(v)}
                    disabled={isProcessing}
                    className="flex-1 h-9 rounded-xl text-xs font-black bg-red-500/15 text-red-400 border border-red-500/20 hover:bg-red-500/25 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    <X size={11} />
                    Reddet
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Reddetme modal */}
      <AnimatePresence>
        {rejectTarget && (
          <RejectModal
            userName={rejectTarget.full_name ?? 'Kullanıcı'}
            onConfirm={notes => handleReject(rejectTarget.id, notes, rejectTarget.full_name ?? 'Kullanıcı')}
            onCancel={() => setRejectTarget(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default PendingVerificationsTab;
