import React from 'react';
import { motion } from 'framer-motion';
import { UserPlus, X, Zap } from 'lucide-react';
import { useAppStore } from '../../store';
import { useBackDismiss } from '../../hooks/useBackDismiss';

// Değer kapısı: misafir bir yazma aksiyonu denediğinde (maça katıl, rezervasyon
// vb.) açılır. Amaç ceza değil davet — tek dokunuşla kayıt ekranına götürür.
const SignupGate: React.FC = () => {
  const isOpen = useAppStore(s => s.isSignupGateOpen);
  const setOpen = useAppStore(s => s.setIsSignupGateOpen);
  const setIsGuest = useAppStore(s => s.setIsGuest);
  const resetNavigation = useAppStore(s => s.resetNavigation);

  // Hook, erken dönüşten ÖNCE çağrılmalı — koşullu hook React kuralını bozar.
  useBackDismiss(isOpen, () => setOpen(false), 'signup-gate');

  if (!isOpen) return null;

  // IP-15: kapı iki yol sunar. Niyeti kapıyı AÇAN ekran yazdı; burada yalnız
  // AuthScreen'in hangi modda açılacağı söylenir. Eskiden tek buton hem
  // "kaydol" hem "giriş yap" diyordu; hesabı olan kullanıcı kayıt formuna
  // düşüp geri dönmek zorunda kalıyordu.
  const go = (mode: 'register' | 'login') => {
    const s = useAppStore.getState();
    s.setAuthStartMode(mode);
    setOpen(false);
    setIsGuest(false);
    resetNavigation('AUTH');
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <motion.div
        initial={{ opacity: 0, y: 60 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full bg-surface-1 border border-white/[0.08] rounded-t-[28px] p-6 pb-10"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 2.5rem)' }}
      >
        <button
          onClick={() => setOpen(false)}
          aria-label="Kapat"
          className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/5 flex items-center justify-center text-gray-400 hover:text-white"
        >
          <X size={18} />
        </button>
        <div className="w-14 h-14 rounded-2xl bg-primary/12 flex items-center justify-center mb-4">
          <Zap size={26} className="text-primary" />
        </div>
        <h3 className="text-white font-extrabold text-xl mb-2">Sahaya çıkmaya hazır mısın?</h3>
        <p className="text-sm text-gray-400 leading-relaxed mb-6">
          Maça katılmak, saha kiralamak ve oyuncu kartını oluşturmak için ücretsiz bir hesap yeterli. Hesabını aç, kaldığın yerden devam et.
        </p>
        <button
          onClick={() => go('register')}
          className="w-full py-4 bg-primary text-on-primary font-extrabold text-base rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-all"
        >
          <UserPlus size={18} /> ÜCRETSİZ HESAP AÇ
        </button>
        <button
          onClick={() => go('login')}
          className="w-full min-h-11 py-3 mt-1 text-gray-400 font-bold text-sm"
        >
          Zaten hesabım var — giriş yap
        </button>
        <button
          onClick={() => setOpen(false)}
          className="w-full min-h-11 py-3 text-ink-4 font-bold text-sm"
        >
          Şimdilik gezinmeye devam et
        </button>
      </motion.div>
    </div>
  );
};

export default SignupGate;
