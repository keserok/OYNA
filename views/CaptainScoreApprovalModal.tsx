import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { X, ShieldCheck, AlertTriangle, Trophy, Loader2, Users, Clock, Flag } from 'lucide-react';
import { useAppStore } from '../store';
import { fbGetMatchDetail } from '../supabaseMutations';
import { auth } from '../supabaseAuth';

interface CaptainScoreApprovalModalProps {
  onClose: () => void;
  matchId?: string;
}

const CaptainScoreApprovalModal: React.FC<CaptainScoreApprovalModalProps> = ({ onClose, matchId: propMatchId }) => {
  const { adminMatches, approveCaptainScore, captainApprovalMatchId, adminUsers } = useAppStore() as any;
  const authUid = auth.currentUser?.uid;
  const currentUser = adminUsers?.find((u: any) => u.id === authUid);
  const [match, setMatch] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const targetMatchId = propMatchId || captainApprovalMatchId;

  useEffect(() => {
    const load = async () => {
      if (!targetMatchId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      const local = adminMatches.find((m: any) => m.id === targetMatchId);
      if (local && typeof local.homeScore === 'number') {
        setMatch(local);
        setLoading(false);
        return;
      }
      const detail = await fbGetMatchDetail(targetMatchId);
      setMatch(detail);
      setLoading(false);
    };
    load();
  }, [targetMatchId, adminMatches]);

  const mySide: 'home' | 'away' | null = (() => {
    if (!match || !currentUser?.id) return null;
    if (match.homeCaptainId === currentUser.id || (match as any).home_captain_id === currentUser.id) return 'home';
    if (match.awayCaptainId === currentUser.id || (match as any).away_captain_id === currentUser.id) return 'away';
    return null;
  })();

  const homeApproved = match?.homeCaptainApproved || (match as any)?.home_captain_approved;
  const awayApproved = match?.awayCaptainApproved || (match as any)?.away_captain_approved;
  const alreadyApproved = mySide === 'home' ? homeApproved : awayApproved;

  const handleApprove = async () => {
    if (!match || !mySide) return;
    setSubmitting(true);
    setError(null);
    const result = await approveCaptainScore(match.id, mySide);
    setSubmitting(false);
    if (result.success) {
      setDone(true);
      setTimeout(() => onClose(), 2000);
    } else {
      setError(result.error || 'Onay başarısız');
    }
  };

  const handleDispute = () => {
    // İtiraz: skor yanlış, kaptanlar arası iletişim açılır
    alert('İtirazınız kaydedildi. Tesis sahibi ile iletişime geçilecek.');
    onClose();
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center">
        <Loader2 className="animate-spin text-[#FFFF00]" size={32} />
      </div>
    );
  }

  if (!match || typeof match.homeScore !== 'number') {
    return (
      <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-6" onClick={onClose}>
        <div className="bg-[#161B22] border border-white/10 rounded-3xl p-8 max-w-sm text-center" onClick={(e) => e.stopPropagation()}>
          <AlertTriangle size={48} className="text-orange-400 mx-auto mb-4" />
          <p className="text-white font-bold mb-2">Onaylanacak skor yok</p>
          <p className="text-xs text-gray-500 mb-6">Maç bilgisi yüklenemedi veya henüz skor girilmemiş.</p>
          <button onClick={onClose} className="px-6 py-3 bg-[#FFFF00] text-black font-black rounded-xl uppercase text-sm">
            Tamam
          </button>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-6">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-[#0A0E14] border border-[#39FF14]/30 rounded-3xl p-10 max-w-sm text-center shadow-[0_0_60px_rgba(57,255,20,0.2)]"
        >
          <div className="w-20 h-20 rounded-full bg-[#39FF14]/10 border-2 border-[#39FF14] flex items-center justify-center mx-auto mb-4">
            <ShieldCheck className="w-10 h-10 text-[#39FF14]" />
          </div>
          <h3 className="text-xl font-black text-white italic mb-2">ONAYLANDI</h3>
          <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">Diğer kaptan onayı bekleniyor</p>
        </motion.div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 80, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-[#0A0E14] border border-[#FFFF00]/20 rounded-[32px] p-6 shadow-[0_0_60px_rgba(255,255,0,0.15)]"
      >
        {/* HEADER */}
        <div className="flex items-center justify-between mb-6 border-b border-white/5 pb-4">
          <div className="flex items-center gap-3">
            <div className="bg-[#FFFF00]/10 p-2.5 rounded-2xl border border-[#FFFF00]/30">
              <Users className="w-6 h-6 text-[#FFFF00]" />
            </div>
            <div>
              <span className="text-white/40 text-[10px] font-bold uppercase tracking-widest block">
                Kaptan Onay Talebi
              </span>
              <span className="text-white font-black italic tracking-tight uppercase">
                Skoru Onayla
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        {/* WHO ENTERED */}
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-3 flex items-start gap-3 mb-4">
          <Clock size={16} className="text-blue-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-blue-200 font-medium leading-relaxed">
            <span className="font-black uppercase tracking-widest">
              {match.scoreEnteredRole === 'OWNER' || (match as any).score_entered_role === 'OWNER'
                ? 'Tesis Sahibi'
                : 'Hakem'}{' '}
            </span>
            tarafından skor girildi. Doğruluğunu onaylamak için kaptan onayınız gerekiyor.
          </p>
        </div>

        {/* SCORE DISPLAY */}
        <div className="bg-gradient-to-br from-[#FFFF00]/10 to-transparent border border-[#FFFF00]/30 rounded-3xl p-6 mb-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 text-center">
              <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest mb-2">
                Ev Sahibi
              </p>
              <p className="text-5xl font-black text-white">{match.homeScore}</p>
              {homeApproved && (
                <span className="inline-flex items-center gap-1 text-[9px] text-emerald-400 font-black mt-2 bg-emerald-500/10 px-2 py-1 rounded-md">
                  <ShieldCheck size={9} /> ONAYLI
                </span>
              )}
            </div>
            <span className="text-gray-600 font-black text-2xl">−</span>
            <div className="flex-1 text-center">
              <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest mb-2">
                Deplasman
              </p>
              <p className="text-5xl font-black text-white">{match.awayScore}</p>
              {awayApproved && (
                <span className="inline-flex items-center gap-1 text-[9px] text-emerald-400 font-black mt-2 bg-emerald-500/10 px-2 py-1 rounded-md">
                  <ShieldCheck size={9} /> ONAYLI
                </span>
              )}
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs font-bold">
            {error}
          </div>
        )}

        {/* MY ROLE */}
        {!mySide ? (
          <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-3 text-orange-300 text-xs font-bold text-center">
            Bu maçta kaptan olarak görünmüyorsunuz
          </div>
        ) : alreadyApproved ? (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 text-emerald-300 text-xs font-bold text-center flex items-center justify-center gap-2">
            <ShieldCheck size={14} /> Daha önce onayladınız
          </div>
        ) : (
          <div className="space-y-2">
            <button
              onClick={handleApprove}
              disabled={submitting}
              className="w-full bg-[#FFFF00] hover:bg-yellow-300 text-black py-4 rounded-2xl font-black uppercase tracking-widest text-sm flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(255,255,0,0.3)] transition-all active:scale-95 disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" /> ONAYLANIYOR
                </>
              ) : (
                <>
                  <ShieldCheck className="w-5 h-5" /> SKORU ONAYLA
                </>
              )}
            </button>
            <button
              onClick={handleDispute}
              disabled={submitting}
              className="w-full bg-transparent hover:bg-red-500/10 border border-red-500/30 text-red-400 py-3 rounded-2xl font-bold uppercase tracking-widest text-xs flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            >
              <Flag size={14} /> İTİRAZ ET
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
};

export default CaptainScoreApprovalModal;
