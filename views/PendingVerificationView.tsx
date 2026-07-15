import React, { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, LogOut, CheckCircle2, XCircle, Camera, FileText, MapPin, RefreshCw } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { auth, logout } from '../supabaseAuth';

interface PendingVerificationViewProps {
  onApproved: () => void;
  onLogout: () => void;
  /** Reddedilen kullanıcı "Tekrar Başvur" dediğinde başvuru formuna yönlendirir */
  onReapply?: (rejectionNote: string | null) => void;
}

// Basit confetti patlaması — sadece CSS animasyonu, bağımlılık gerektirmez
const ConfettiPiece: React.FC<{ x: number; color: string; delay: number }> = ({ x, color, delay }) => (
  <motion.div
    className="absolute top-0 w-2 h-4 rounded-sm pointer-events-none"
    style={{ left: `${x}%`, background: color }}
    initial={{ y: -20, opacity: 1, rotate: 0, scale: 1 }}
    animate={{ y: 600, opacity: 0, rotate: Math.random() * 720 - 360, scale: 0.5 }}
    transition={{ duration: 2 + Math.random(), delay, ease: 'easeIn' }}
  />
);

const CONFETTI_COLORS = ['#FACC15', '#39FF14', '#FF3333', '#3388FF', '#FF69B4', '#FFA500'];

const PendingVerificationView: React.FC<PendingVerificationViewProps> = ({ onApproved, onLogout, onReapply }) => {
  const [status, setStatus] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [rejectionNotes, setRejectionNotes] = useState<string | null>(null);
  const [showRejectedModal, setShowRejectedModal] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [showApprovedBanner, setShowApprovedBanner] = useState(false);
  const [checking, setChecking] = useState(false);
  const appliedRef = useRef(false); // approved akışı bir kez tetiklensin

  // A3: durumu tek yerden uygula — hem realtime hem fetch/poll buraya düşer.
  const applyStatus = useCallback((newStatus?: string | null, notes?: string | null) => {
    if (newStatus === 'approved') {
      if (appliedRef.current) return;
      appliedRef.current = true;
      setStatus('approved');
      setShowConfetti(true);
      setShowApprovedBanner(true);
      setTimeout(() => { onApproved(); }, 2500);
    } else if (newStatus === 'rejected') {
      setStatus('rejected');
      setRejectionNotes(notes ?? null);
      setShowRejectedModal(true);
    }
  }, [onApproved]);

  // A3: durumu SUNUCUDAN çek (realtime tek yol değil — kaçan event / offline /
  // geç mount edilen singleton durumunda kullanıcı sonsuza dek beklemesin).
  const checkStatus = useCallback(async (manual = false) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    if (manual) setChecking(true);
    try {
      const { data } = await supabase
        .from('profiles')
        .select('verification_status, verification_notes')
        .eq('id', uid)
        .maybeSingle();
      if (data) applyStatus(data.verification_status, data.verification_notes);
    } finally {
      if (manual) setChecking(false);
    }
  }, [applyStatus]);

  useEffect(() => {
    // (1) mount'ta anlık durum, (2) 30sn poll — realtime'ı tamamlar.
    checkStatus();
    const poll = setInterval(() => checkStatus(), 30000);

    // (3) Realtime — anında yakalar (bağlıysa).
    const uid = auth.currentUser?.uid;
    const channel = uid
      ? supabase
          .channel(`verification:${uid}`)
          .on('postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${uid}` },
            (payload) => applyStatus(payload.new?.verification_status, payload.new?.verification_notes),
          )
          .subscribe()
      : null;

    return () => {
      clearInterval(poll);
      if (channel) supabase.removeChannel(channel);
    };
  }, [checkStatus, applyStatus]);

  const handleLogout = async () => {
    await logout();
    onLogout();
  };

  const confettiPieces = Array.from({ length: 40 }).map((_, i) => ({
    x: Math.random() * 100,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    delay: Math.random() * 0.8,
  }));

  return (
    <div className="min-h-screen bg-[#0A0E14] flex flex-col items-center justify-center relative overflow-hidden px-6 py-12">

      {/* Arka plan ambient glow */}
      <div className="absolute inset-0 pointer-events-none">
        <motion.div
          className="absolute top-[-20%] left-[-10%] w-[400px] h-[400px] rounded-full blur-[140px]"
          style={{ background: 'rgba(250,204,21,0.08)' }}
          animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.8, 0.5] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute bottom-[-10%] right-[-10%] w-[300px] h-[300px] rounded-full blur-[120px]"
          style={{ background: 'rgba(57,255,20,0.06)' }}
          animate={{ scale: [1, 1.2, 1], opacity: [0.4, 0.7, 0.4] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
        />
        {/* Grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />
      </div>

      {/* Confetti katmanı */}
      <AnimatePresence>
        {showConfetti && (
          <div className="absolute inset-0 pointer-events-none z-50 overflow-hidden">
            {confettiPieces.map((p, i) => (
              <ConfettiPiece key={i} {...p} />
            ))}
          </div>
        )}
      </AnimatePresence>

      {/* Onaylandı banner */}
      <AnimatePresence>
        {showApprovedBanner && (
          <motion.div
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.7 }}
            className="absolute inset-0 flex items-center justify-center z-40 bg-black/60 backdrop-blur-sm"
          >
            <div className="text-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: [0, 1.3, 1] }}
                transition={{ type: 'spring', stiffness: 260, damping: 18 }}
                className="text-6xl mb-4"
              >
                🎉
              </motion.div>
              <h2 className="text-3xl font-black text-white italic">Profilin Onaylandı!</h2>
              <p className="text-gray-300 mt-2">Yönlendiriliyorsun...</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Ana içerik */}
      <div className="relative z-10 w-full max-w-md">

        {/* Animasyonlu saat ikonu */}
        <div className="flex justify-center mb-8">
          <motion.div
            animate={{ scale: [1, 1.08, 1], opacity: [0.85, 1, 0.85] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
            className="w-24 h-24 rounded-full flex items-center justify-center"
            style={{
              background: 'rgba(250,204,21,0.1)',
              border: '2px solid rgba(250,204,21,0.25)',
              boxShadow: '0 0 40px rgba(250,204,21,0.15)',
            }}
          >
            <Clock size={48} className="text-[#FACC15]" />
          </motion.div>
        </div>

        {/* Başlık */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.5 }}
          className="text-center mb-2"
        >
          <p className="text-[10px] font-black tracking-[0.3em] text-gray-500 uppercase mb-3">
            Kaleci / Hakem
          </p>
          <h1
            className="text-3xl font-black text-white italic tracking-tight"
            style={{ textShadow: '0 0 20px rgba(250,204,21,0.2)' }}
          >
            PROFİLİN İNCELENİYOR
          </h1>
        </motion.div>

        {/* Durum badge */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="flex justify-center mt-4 mb-8"
        >
          <span
            className="flex items-center gap-2 px-5 py-2 rounded-full text-sm font-black uppercase tracking-wider"
            style={{
              background: 'rgba(250,204,21,0.1)',
              border: '1px solid rgba(250,204,21,0.3)',
              color: '#FACC15',
            }}
          >
            <Clock size={14} /> Onay Bekleniyor
          </span>
        </motion.div>

        {/* A3: manuel durum yenileme — kaçan realtime event'te sonsuz bekleme yok */}
        <div className="flex justify-center -mt-4 mb-6">
          <button
            onClick={() => checkStatus(true)}
            disabled={checking}
            className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-gray-400 hover:text-white transition-colors disabled:opacity-50 py-1"
          >
            <RefreshCw size={13} className={checking ? 'animate-spin' : ''} />
            {checking ? 'Kontrol ediliyor…' : 'Durumu Yenile'}
          </button>
        </div>

        {/* Ana kart */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, type: 'spring', stiffness: 180, damping: 22 }}
          className="rounded-[28px] p-6 mb-6"
          style={{
            background: 'linear-gradient(180deg, rgba(22,27,34,0.85) 0%, rgba(10,14,20,0.95) 100%)',
            border: '1px solid rgba(255,255,255,0.06)',
            backdropFilter: 'blur(20px)',
          }}
        >
          <p className="text-gray-300 text-sm leading-relaxed text-center">
            Platform güvenliği için profilin ekibimiz tarafından inceleniyor.
            Bu işlem genellikle <span className="text-[#FACC15] font-bold">24 saat</span> sürer.
            Onaylandığında sana bildirim göndereceğiz.
          </p>
        </motion.div>

        {/* Profili tamamla section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="rounded-[24px] p-5 mb-6"
          style={{
            background: 'rgba(250,204,21,0.04)',
            border: '1px solid rgba(250,204,21,0.1)',
          }}
        >
          <p className="text-[10px] font-black uppercase tracking-widest text-[#FACC15] mb-4">
            Onayı Hızlandır
          </p>
          <div className="space-y-3">
            {[
              { icon: <Camera size={16} />, text: 'Profil fotoğrafı yükle' },
              { icon: <FileText size={16} />, text: 'Biyografi ekle' },
              { icon: <MapPin size={16} />, text: 'Tercih ettiğin bölgeleri seç' },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3 text-gray-300 text-sm">
                <span className="text-[#FACC15] opacity-70">{item.icon}</span>
                <span>{item.text}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Çıkış linki */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.55 }}
          className="text-center"
        >
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 mx-auto text-sm text-gray-500 hover:text-gray-300 transition-colors py-2"
          >
            <LogOut size={14} />
            Başka bir hesapla giriş yap
          </button>
        </motion.div>
      </div>

      {/* Reddedildi modal */}
      <AnimatePresence>
        {showRejectedModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-50 p-6"
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.85, opacity: 0, y: 30 }}
              transition={{ type: 'spring', stiffness: 260, damping: 22 }}
              className="w-full max-w-sm rounded-[28px] p-6"
              style={{
                background: 'linear-gradient(180deg, #1a0a0a 0%, #0A0E14 100%)',
                border: '1px solid rgba(239,68,68,0.25)',
              }}
            >
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 rounded-full bg-red-500/15 flex items-center justify-center border border-red-500/25">
                  <XCircle size={32} className="text-red-400" />
                </div>
              </div>
              <h3 className="text-xl font-black text-white text-center mb-2">Profil Onaylanamadı</h3>
              {rejectionNotes && (
                <p className="text-sm text-gray-300 text-center leading-relaxed mb-4 bg-white/5 rounded-xl p-3">
                  {rejectionNotes}
                </p>
              )}
              <p className="text-xs text-gray-500 text-center mb-6">
                Profilini güncelleyerek tekrar başvurabilirsin.
              </p>
              <div className="space-y-3">
                <button
                  onClick={() => {
                    setShowRejectedModal(false);
                    if (onReapply) onReapply(rejectionNotes);
                  }}
                  className="w-full h-12 rounded-2xl font-black text-sm bg-[#FACC15] text-black"
                >
                  Tekrar Başvur
                </button>
                <button
                  onClick={handleLogout}
                  className="w-full h-12 rounded-2xl font-black text-sm text-gray-400 border border-white/10"
                >
                  Çıkış Yap
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default PendingVerificationView;
