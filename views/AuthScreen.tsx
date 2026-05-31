import React from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Check } from 'lucide-react';
import { UserRole } from '../types';
import { loginWithGoogle } from '../supabaseAuth';

interface AuthScreenProps {
  onSuccess: () => void;
  onBack: () => void;
  role?: UserRole | null;
}

const THEMES: Record<string, {
  label: string; badge: string; color: string; dim: string; glow: string;
  tagline: string; sub: string; orb1: string; orb2: string;
}> = {
  [UserRole.GOALKEEPER]: {
    label: 'Kaleci', badge: 'KALECİ',
    color: '#39FF14', dim: 'rgba(57,255,20,0.12)', glow: 'rgba(57,255,20,0.35)',
    tagline: 'SON KALE\nSENSİN.', sub: 'Elit Kaleci Girişi',
    orb1: 'rgba(57,255,20,0.3)', orb2: 'rgba(57,255,20,0.18)',
  },
  [UserRole.REFEREE]: {
    label: 'Hakem', badge: 'HAKEM',
    color: '#FF3333', dim: 'rgba(255,51,51,0.12)', glow: 'rgba(255,51,51,0.35)',
    tagline: 'ADALETİ\nSAĞLA.', sub: 'Hakem Girişi',
    orb1: 'rgba(255,51,51,0.3)', orb2: 'rgba(255,51,51,0.18)',
  },
  [UserRole.OWNER]: {
    label: 'Tesis', badge: 'TESİS',
    color: '#3388FF', dim: 'rgba(51,136,255,0.12)', glow: 'rgba(51,136,255,0.35)',
    tagline: 'İŞLETMENİ\nSAHAYA TAŞI.', sub: 'Tesis Girişi',
    orb1: 'rgba(51,136,255,0.3)', orb2: 'rgba(51,136,255,0.18)',
  },
  default: {
    label: 'Oyuncu', badge: 'OYUNCU',
    color: '#FFFF00', dim: 'rgba(255,255,0,0.12)', glow: 'rgba(255,255,0,0.35)',
    tagline: 'SAHAYA ÇIKMA VAKTİ.', sub: 'Oyuncu Girişi',
    orb1: 'rgba(255,255,0,0.3)', orb2: 'rgba(255,255,0,0.18)',
  },
};

function getTheme(role?: UserRole | null) {
  if (role && THEMES[role]) return THEMES[role];
  return THEMES.default;
}

const BgParticle: React.FC<{ color: string; delay: number }> = ({ color, delay }) => {
  const size = Math.random() * 3 + 1;
  const x = Math.random() * 100;
  return (
    <motion.div
      className="absolute rounded-full pointer-events-none"
      style={{ width: size, height: size, left: `${x}%`, background: color, bottom: -10 }}
      animate={{ y: [0, -(300 + Math.random() * 400)], opacity: [0, 0.6, 0] }}
      transition={{ duration: 4 + Math.random() * 4, delay, repeat: Infinity, ease: 'easeOut' }}
    />
  );
};

const PlayerUltraEffects = () => {
  return (
    <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden mix-blend-screen">
      <motion.div
        className="absolute top-[-10%] left-[20%] w-[120%] h-[120%] rounded-[100%]"
        style={{
          background: 'conic-gradient(from 180deg at 50% 50%, rgba(255,255,0,0) 0deg, rgba(255,255,0,0.08) 180deg, rgba(255,255,0,0) 360deg)',
          transformOrigin: 'center center',
        }}
        animate={{ rotate: [0, 360] }}
        transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
      />
      {Array.from({ length: 25 }).map((_, i) => {
        const size = Math.random() * 4 + 1;
        const x = Math.random() * 100;
        const duration = Math.random() * 3 + 2;
        const delay = Math.random() * 5;
        return (
          <motion.div
            key={i}
            className="absolute rounded-full pointer-events-none"
            style={{
              width: size, height: size, left: `${x}%`, bottom: -20,
              background: '#FFFF00',
              boxShadow: `0 0 ${size * 3}px #FFFF00, 0 0 ${size * 6}px #d97706`,
            }}
            animate={{ 
              y: [0, -(400 + Math.random() * 400)], 
              x: Math.random() > 0.5 ? [0, 50, -50] : [0, -50, 50],
              opacity: [0, 1, 0],
              scale: [0, 1.5, 0]
            }}
            transition={{ duration, delay, repeat: Infinity, ease: 'easeInOut' }}
          />
        );
      })}
    </div>
  );
};

const AnimatedTagline = ({ text, color }: { text: string; color: string }) => {
  const lines = text.split('\n');
  return (
    <div className="overflow-visible">
      {lines.map((line, li) => {
        const isColored = (lines.length > 1 && li === 1) || (lines.length === 1 && text !== 'SAHAYA ÇIKMA VAKTİ.');
        return (
          <div key={li} className="overflow-hidden pt-6 -mt-6 pb-4 -mb-4 relative">
            <motion.div
              initial={{ y: '100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 90, damping: 20, delay: 0.1 + li * 0.1 }}
              className="font-black leading-[1.0] tracking-tighter relative z-10 uppercase italic"
              style={{
                fontSize: lines.length === 1 ? 'clamp(2.1rem, 9vw, 3.5rem)' : 'clamp(2.8rem, 12vw, 4.5rem)',
                color: isColored ? color : '#fff',
                textShadow: isColored ? `0 0 20px ${color}80` : 'none',
              }}
            >
              {line}
            </motion.div>
          </div>
        );
      })}
    </div>
  );
};

const AuthScreen: React.FC<AuthScreenProps> = ({ onSuccess, onBack, role }) => {
  const theme = getTheme(role);
  const { color, orb1, orb2, tagline, badge } = theme;
  const [agreed, setAgreed] = React.useState(true);

  const [isLoading, setIsLoading] = React.useState<'google' | 'apple' | 'guest' | null>(null);

  const handleGoogleLogin = async () => {
    if (!agreed || isLoading) return;
    setIsLoading('google');
    try {
      await loginWithGoogle();
      // OAuth yönlendirmesi başlar — onSuccess auth listener'dan tetiklenir
    } catch (err) {
      console.error('Authentication error:', err);
      setIsLoading(null);
    }
  };

  const handleAppleLogin = async () => {
    if (!agreed || isLoading) return;
    setIsLoading('apple');
    try {
      // Apple Sign In henüz bağlı değil — misafir akışıyla devam
      onSuccess();
    } catch (err) {
      console.error('Authentication error:', err);
    } finally {
      setIsLoading(null);
    }
  };

  const handleGuestLogin = () => {
    if (!agreed || isLoading) return;
    setIsLoading('guest');
    onSuccess();
  };

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden" style={{ background: '#0A0E14' }}>
      
      {/* ─── ANIMATED BACKGROUND ─────────────────────────────────── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <motion.div
          className="absolute rounded-full blur-[120px]"
          style={{ width: 400, height: 400, top: '-20%', left: '-15%', background: orb1 }}
          animate={{ scale: [1, 1.2, 1], opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute rounded-full blur-[90px]"
          style={{ width: 300, height: 300, bottom: '0%', right: '-10%', background: orb2 }}
          animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.8, 0.5] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut', delay: 1.5 }}
        />
        {Array.from({ length: 20 }).map((_, i) => (
          <BgParticle key={i} color={color} delay={i * 0.4} />
        ))}
        {(!role || role === UserRole.PLAYER) && <PlayerUltraEffects />}
        <div className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg,rgba(255,255,255,1) 1px, transparent 1px)',
            backgroundSize: '40px 40px'
          }}
        />
      </div>

      {/* ─── BACK BUTTON ─────────────────────────────────────────── */}
      <motion.button
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.3 }}
        onClick={onBack}
        className="absolute top-12 left-6 z-30 p-2.5 rounded-full border border-white/10 text-white bg-black/40 backdrop-blur-md hover:bg-white/10 transition-colors"
      >
        <ArrowLeft size={18} />
      </motion.button>

      {/* ─── HERO TAGLINE ────────────────────────────────────────── */}
      <div className="relative z-10 pt-32 pb-4 px-6 flex flex-col justify-end">
        <span className="px-3.5 py-1 bg-white/5 border border-white/10 rounded-full text-[10px] font-black tracking-widest text-[#FFFF00] uppercase self-start mb-4 shadow-[0_0_15px_rgba(255,255,0,0.1)]">
          {badge} GİRİŞİ
        </span>
        <AnimatedTagline text={tagline} color={color} />
      </div>

      {/* ─── AUTHENTICATION CARD ─────────────────────────────────── */}
      <motion.div
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 26, delay: 0.25 }}
        className="relative z-10 flex-1 mx-4 mb-8 rounded-[36px] border border-white/5 p-6 flex flex-col justify-between"
        style={{
          background: 'linear-gradient(180deg, rgba(22,27,34,0.8) 0%, rgba(10,14,20,0.95) 100%)',
          backdropFilter: 'blur(30px)',
          boxShadow: '0 24px 60px -12px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.05)',
        }}
      >
        <div className="space-y-6 flex-1 flex flex-col justify-center">
          <div className="text-center mb-4">
            <h2 className="text-lg font-black text-white uppercase tracking-wider italic">OYNA ECOSYSTEM</h2>
            <p className="text-xs text-gray-500 mt-1">Giriş yönteminizi seçerek anında sahaya katılın</p>
          </div>

          <div className="space-y-4">
            {/* Google Sign In */}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleGoogleLogin}
              disabled={!agreed || isLoading !== null}
              className="w-full h-15 rounded-2xl font-black text-sm flex items-center justify-center gap-3 bg-white text-black hover:bg-gray-100 transition-colors shadow-2xl disabled:opacity-50"
            >
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                <path fill="#EA4335" d="M12.24 10.285V14.4h6.887c-.648 2.41-2.519 4.114-5.186 4.114-3.478 0-6.3-2.822-6.3-6.3 0-3.478 2.822-6.3 6.3-6.3 1.636 0 3.109.633 4.2 1.66l3.205-3.205C19.232 2.378 15.932 1 12.24 1 5.86 1 .7 6.16.7 12.54s5.16 11.54 11.54 11.54c6.645 0 11.755-4.664 11.755-11.755 0-.745-.067-1.462-.2-2.04H12.24z"/>
              </svg>
              <span>{isLoading === 'google' ? 'YÖNLENDİRİLİYOR...' : 'GOOGLE İLE DEVAM ET'}</span>
            </motion.button>

            {/* Apple Sign In */}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleAppleLogin}
              disabled={!agreed || isLoading !== null}
              className="w-full h-15 rounded-2xl font-black text-sm flex items-center justify-center gap-3 bg-black text-white hover:bg-black/80 border border-white/10 transition-colors shadow-2xl disabled:opacity-50"
            >
              <svg className="w-5 h-5 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 4.17c.66-.81 1.11-1.93.99-3.06-1 .04-2.22.67-2.94 1.5-.64.73-1.2 1.87-1.05 2.99 1.12.09 2.26-.56 3-1.43z"/>
              </svg>
              <span>{isLoading === 'apple' ? 'GİRİŞ YAPILIYOR...' : 'APPLE İLE DEVAM ET'}</span>
            </motion.button>

            {/* Guest Sign In */}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleGuestLogin}
              disabled={!agreed || isLoading !== null}
              className="w-full h-15 rounded-2xl font-black text-sm flex items-center justify-center gap-3 bg-[#FFFF00]/10 text-[#FFFF00] border border-[#FFFF00]/20 hover:bg-[#FFFF00]/20 transition-colors shadow-2xl disabled:opacity-50 mt-2"
            >
              <span>{isLoading === 'guest' ? 'DEVAM EDİLİYOR...' : 'MİSAFİR OLARAK TEST ET'}</span>
            </motion.button>
          </div>
        </div>

        {/* Agreement checkbox */}
        <div className="flex items-start gap-3.5 mt-6 px-1 border-t border-white/5 pt-5 shrink-0">
          <button
            onClick={() => setAgreed(!agreed)}
            className="mt-0.5 w-5 h-5 rounded-md border shrink-0 flex items-center justify-center transition-all"
            style={{ background: agreed ? '#FFFF00' : 'transparent', borderColor: agreed ? '#FFFF00' : 'rgba(255,255,255,0.2)' }}
          >
            {agreed && <Check size={12} className="text-black" />}
          </button>
          <p className="text-[10px] text-gray-400 leading-relaxed font-bold tracking-wide uppercase">
            Devam ederek <span className="text-[#FFFF00] underline cursor-pointer">Kullanım Koşulları</span> ve <span className="text-[#FFFF00] underline cursor-pointer">Gizlilik Politikası</span> metinlerini okuduğumu ve onayladığımı kabul ediyorum.
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default AuthScreen;
