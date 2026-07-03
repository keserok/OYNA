import React from 'react';
import { motion } from 'framer-motion';
import { UserPlus, X, Zap } from 'lucide-react';
import { useAppStore } from '../../store';

// Değer kapısı: misafir bir yazma aksiyonu denediğinde (maça katıl, rezervasyon
// vb.) açılır. Amaç ceza değil davet — tek dokunuşla kayıt ekranına götürür.
const SignupGate: React.FC = () => {
  const isOpen = useAppStore(s => s.isSignupGateOpen);
  const setOpen = useAppStore(s => s.setIsSignupGateOpen);
  const setIsGuest = useAppStore(s => s.setIsGuest);
  const resetNavigation = useAppStore(s => s.resetNavigation);

  if (!isOpen) return null;

  const goSignup = () => {
    setOpen(false);
    setIsGuest(false);
    resetNavigation('AUTH');
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <motion.div
        initial={{ opacity: 0, y: 60 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full sm:max-w-md bg-[#161B22] border border-[#FACC15]/25 rounded-t-[28px] sm:rounded-[28px] p-6 pb-10 sm:pb-6"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 2.5rem)' }}
      >
        <button
          onClick={() => setOpen(false)}
          aria-label="Kapat"
          className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/5 flex items-center justify-center text-gray-400 hover:text-white"
        >
          <X size={18} />
        </button>
        <div className="w-14 h-14 rounded-2xl bg-[#FACC15]/15 flex items-center justify-center mb-4">
          <Zap size={26} className="text-[#FACC15]" />
        </div>
        <h3 className="text-white font-black text-xl mb-2">Sahaya çıkmaya hazır mısın?</h3>
        <p className="text-sm text-gray-400 leading-relaxed mb-6">
          Maça katılmak, saha kiralamak ve oyuncu kartını oluşturmak için ücretsiz bir hesap yeterli. 30 saniyeni alır.
        </p>
        <button
          onClick={goSignup}
          className="w-full py-4 bg-[#FACC15] text-black font-black text-base rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-all"
        >
          <UserPlus size={18} /> ÜCRETSİZ KAYDOL / GİRİŞ YAP
        </button>
        <button
          onClick={() => setOpen(false)}
          className="w-full py-3 mt-2 text-gray-500 font-bold text-sm"
        >
          Şimdilik gezinmeye devam et
        </button>
      </motion.div>
    </div>
  );
};

export default SignupGate;
