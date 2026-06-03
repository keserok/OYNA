import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Check, Mail, Smartphone, ArrowRight, Loader2, KeyRound } from 'lucide-react';
import { UserRole } from '../types';
import { sendEmailOtp, verifyEmailOtp, sendPhoneOtp, verifyPhoneOtp } from '../supabaseAuth';
import { setRememberMe } from '../supabaseClient';

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


// ─── Yasal Metin Modal Bileşeni ───────────────────────────────────────────────
const KVKK_TEXT = `OYNA, kullanıcıların e-posta veya telefon numarasını 6379 sayılı KVKK kapsamında yalnızca kimlik doğrulama, hesap güvenliği ve hizmet bilgilendirmesi amacıyla işlemekte; üçüncü taraflarla paylaşmamakta ve kullanıcının talebi üzerine verilerini kalıcı olarak silmektedir. Kişisel verilerinize ilişkin haklarınızı destek@oyna.app adresine yazılı başvuru yoluyla kullanabilirsiniz.`;

const SOZLESME_TEXT = `OYNA platformunu kullanan her kişi, uygulamanın yalnızca yasal spor organizasyonları amacıyla kullanılacağını, başkalarının haklarını ihlal eden içerik paylaşmayacağını ve hesabının güvenliğinden bizzat sorumlu olduğunu kabul etmektedir. Kullanım koşullarını ihlal eden hesaplar bildirim yapılmaksızın askıya alınabilir.`;

interface LegalModalsProps {
  openModal: 'kvkk' | 'sozlesme' | null;
  setOpenModal: (v: 'kvkk' | 'sozlesme' | null) => void;
}

const LegalModal: React.FC<LegalModalsProps> = ({ openModal, setOpenModal }) => {
  if (!openModal) return null;
  const isKvkk = openModal === 'kvkk';
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
      onClick={() => setOpenModal(null)}
    >
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 80, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-t-[32px] p-6 pb-10"
        style={{
          background: 'linear-gradient(180deg, #161B22 0%, #0A0E14 100%)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderBottom: 'none',
        }}
      >
        <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-5" />
        <h3 className="text-base font-black text-white uppercase tracking-wider mb-4">
          {isKvkk ? 'KVKK Aydınlatma Metni' : 'Kullanıcı Sözleşmesi'}
        </h3>
        <p className="text-xs text-gray-300 leading-relaxed font-medium">
          {isKvkk ? KVKK_TEXT : SOZLESME_TEXT}
        </p>
        <button
          onClick={() => setOpenModal(null)}
          className="mt-6 w-full h-12 rounded-2xl font-black text-xs bg-[#FFFF00] text-black"
        >
          ANLADIM, KAPAT
        </button>
      </motion.div>
    </motion.div>
  );
};

const PHONE_PREFIX = '+90';

const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

const formatPhoneDisplay = (digits: string) => {
  const d = digits.slice(0, 10);
  return [d.slice(0, 3), d.slice(3, 6), d.slice(6, 8), d.slice(8, 10)].filter(Boolean).join(' ');
};

const AuthScreen: React.FC<AuthScreenProps> = ({ onSuccess, onBack, role }) => {
  const theme = getTheme(role);
  const { color, orb1, orb2, tagline, badge } = theme;

  const [method, setMethod] = React.useState<'email' | 'phone'>('email');
  const [stage, setStage] = React.useState<'input' | 'otp'>('input');
  const [email, setEmail] = React.useState('');
  const [phoneDigits, setPhoneDigits] = React.useState('');
  const [otp, setOtp] = React.useState('');
  const [agreed, setAgreed] = React.useState(false);
  const [remember, setRemember] = React.useState(true);
  const [isLoading, setIsLoading] = React.useState<'send' | 'verify' | 'guest' | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [resendIn, setResendIn] = React.useState(0);
  const [openModal, setOpenModal] = React.useState<'kvkk' | 'sozlesme' | null>(null);

  const phoneE164 = `${PHONE_PREFIX}${phoneDigits}`;
  const contactValid = method === 'email' ? isValidEmail(email) : phoneDigits.length === 10;
  const contactLabel = method === 'email' ? email.trim() : `${PHONE_PREFIX} ${formatPhoneDisplay(phoneDigits)}`;

  // "Beni hatırla" tercihini oturum deposuna yansıt (giriş öncesi ayarlanmalı)
  React.useEffect(() => {
    setRememberMe(remember);
  }, [remember]);

  // Tekrar gönderme geri sayımı
  React.useEffect(() => {
    if (resendIn <= 0) return;
    const t = setInterval(() => setResendIn((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(t);
  }, [resendIn]);

  const requestOtp = async () => {
    if (method === 'email') await sendEmailOtp(email.trim());
    else await sendPhoneOtp(phoneE164);
  };

  const handleSendOtp = async () => {
    if (!agreed || !contactValid || isLoading) return;
    setError(null);
    setIsLoading('send');
    try {
      setRememberMe(remember);
      await requestOtp();
      setStage('otp');
      setOtp('');
      setResendIn(60);
    } catch (err: any) {
      console.error('OTP gönderim hatası:', err);
      setError(err?.message || 'Doğrulama kodu gönderilemedi. Lütfen tekrar deneyin.');
    } finally {
      setIsLoading(null);
    }
  };

  const handleResend = async () => {
    if (resendIn > 0 || isLoading) return;
    setError(null);
    setIsLoading('send');
    try {
      await requestOtp();
      setResendIn(60);
    } catch (err: any) {
      setError(err?.message || 'Kod tekrar gönderilemedi.');
    } finally {
      setIsLoading(null);
    }
  };

  const handleVerify = async () => {
    if (otp.length < 6 || isLoading) return;
    setError(null);
    setIsLoading('verify');
    try {
      if (method === 'email') await verifyEmailOtp(email.trim(), otp);
      else await verifyPhoneOtp(phoneE164, otp);
      // Başarılı: oturum açıldı, rol bazlı yönlendirme
      onSuccess();
    } catch (err: any) {
      console.error('OTP doğrulama hatası:', err);
      setError(err?.message || 'Kod hatalı veya süresi dolmuş.');
    } finally {
      setIsLoading(null);
    }
  };

  const handleGuestLogin = () => {
    if (!agreed || isLoading) return;
    setIsLoading('guest');
    onSuccess();
  };

  const handleHeaderBack = () => {
    if (stage === 'otp') {
      setStage('input');
      setOtp('');
      setError(null);
    } else {
      onBack();
    }
  };

  const sendDisabled = !agreed || !contactValid || isLoading !== null;
  const guestDisabled = !agreed || isLoading !== null;

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
        onClick={handleHeaderBack}
        className="absolute top-12 left-6 z-30 p-2.5 rounded-full border border-white/10 text-white bg-black/40 backdrop-blur-md hover:bg-white/10 transition-colors"
      >
        <ArrowLeft size={18} />
      </motion.button>

      {/* ─── HERO TAGLINE ────────────────────────────────────────── */}
      <div className="relative z-10 pt-24 pb-4 px-6 flex flex-col justify-end">
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
        className="relative z-10 flex-1 mx-4 mb-8 rounded-[36px] border border-white/5 p-6 flex flex-col"
        style={{
          background: 'linear-gradient(180deg, rgba(22,27,34,0.8) 0%, rgba(10,14,20,0.95) 100%)',
          backdropFilter: 'blur(30px)',
          boxShadow: '0 24px 60px -12px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.05)',
        }}
      >
        <div className="text-center mb-5">
          <h2 className="text-lg font-black text-white uppercase tracking-wider italic">OYNA</h2>
          <p className="text-xs text-gray-500 mt-1">
            {stage === 'input'
              ? 'E-posta veya telefonunla doğrulama kodu al'
              : `${contactLabel} adresine gönderilen kodu gir`}
          </p>

        </div>

        <AnimatePresence mode="wait">
          {stage === 'input' ? (
            <motion.div
              key="input"
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.25 }}
              className="flex-1 flex flex-col"
            >
              {/* Yöntem seçimi */}
              <div className="flex p-1 rounded-2xl bg-black/40 border border-white/10 mb-5">
                {([['email', 'E-POSTA', Mail], ['phone', 'TELEFON', Smartphone]] as const).map(([m, label, Icon]) => (
                  <button
                    key={m}
                    onClick={() => { setMethod(m); setError(null); }}
                    className="flex-1 h-11 rounded-xl text-[11px] font-black tracking-wider flex items-center justify-center gap-2 transition-all"
                    style={{
                      background: method === m ? '#FFFF00' : 'transparent',
                      color: method === m ? '#000' : 'rgba(255,255,255,0.5)',
                    }}
                  >
                    <Icon size={15} /> {label}
                  </button>
                ))}
              </div>

              {/* Giriş alanı */}
              {method === 'email' ? (
                <div className="bg-[#0A0E14] border border-gray-800 p-4 rounded-2xl flex items-center gap-3 focus-within:border-white/40 transition-colors">
                  <Mail size={20} className="text-gray-500 shrink-0" />
                  <input
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError(null); }}
                    className="bg-transparent w-full outline-none text-white font-bold placeholder:text-gray-700"
                    placeholder="ornek@oyna.app"
                  />
                </div>
              ) : (
                <div className="bg-[#0A0E14] border border-gray-800 p-4 rounded-2xl flex items-center gap-3 focus-within:border-white/40 transition-colors">
                  <Smartphone size={20} className="text-gray-500 shrink-0" />
                  <span className="text-white font-bold shrink-0">{PHONE_PREFIX}</span>
                  <input
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    value={formatPhoneDisplay(phoneDigits)}
                    onChange={(e) => { setPhoneDigits(e.target.value.replace(/\D/g, '').slice(0, 10)); setError(null); }}
                    className="bg-transparent w-full outline-none text-white font-bold placeholder:text-gray-700 tracking-wide"
                    placeholder="5XX XXX XX XX"
                  />
                </div>
              )}

              {/* Beni Hatırla */}
              <button
                onClick={() => setRemember((v) => !v)}
                className="flex items-center justify-between w-full mt-4 px-1 group"
              >
                <span className="text-xs font-bold text-gray-300">Beni Hatırla</span>
                <span
                  className="relative w-11 h-6 rounded-full transition-colors shrink-0"
                  style={{ background: remember ? '#FFFF00' : 'rgba(255,255,255,0.12)' }}
                >
                  <span
                    className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-black transition-transform"
                    style={{ transform: remember ? 'translateX(20px)' : 'translateX(0)' }}
                  />
                </span>
              </button>
              <p className="text-[10px] text-gray-600 mt-1 px-1">
                Açık olduğunda çıkış yapana kadar bu cihazda kimliğinle oturumun açık kalır.
              </p>

              {error && (
                <p className="text-[11px] text-red-400 font-bold mt-3 px-1">{error}</p>
              )}

              {/* KVKK + Sözleşme onayı */}
              <LegalModal openModal={openModal} setOpenModal={setOpenModal} />
              <div className="flex items-start gap-3 mt-3 px-1">
                <button
                  onClick={() => setAgreed(!agreed)}
                  className="mt-0.5 w-5 h-5 rounded-md border shrink-0 flex items-center justify-center transition-all"
                  style={{ background: agreed ? '#FFFF00' : 'transparent', borderColor: agreed ? '#FFFF00' : 'rgba(255,255,255,0.2)' }}
                >
                  {agreed && <Check size={12} className="text-black" />}
                </button>
                <p className="text-[10px] text-gray-400 leading-relaxed font-bold tracking-wide">
                  <button onClick={() => setOpenModal('kvkk')} className="text-[#FFFF00] underline">KVKK Aydınlatma Metni</button>'ni ve <button onClick={() => setOpenModal('sozlesme')} className="text-[#FFFF00] underline">Kullanıcı Sözleşmesi</button>'ni okudum, kişisel verilerimin işlenmesini onaylıyorum.
                </p>
              </div>

              <div className="mt-auto pt-5 space-y-3">
                <motion.button
                  whileHover={sendDisabled ? undefined : { scale: 1.02 }}
                  whileTap={sendDisabled ? undefined : { scale: 0.98 }}
                  onClick={handleSendOtp}
                  disabled={sendDisabled}
                  className="w-full h-14 rounded-2xl font-black text-sm flex items-center justify-center gap-3 bg-[#FFFF00] text-black transition-all shadow-2xl disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isLoading === 'send'
                    ? <><Loader2 size={18} className="animate-spin" /> KOD GÖNDERİLİYOR...</>
                    : <>DOĞRULAMA KODU GÖNDER <ArrowRight size={18} /></>}
                </motion.button>

                {/* Misafir girişi — altta */}
                <button
                  onClick={handleGuestLogin}
                  disabled={guestDisabled}
                  className="w-full h-12 rounded-2xl font-black text-xs flex items-center justify-center gap-2 bg-transparent text-gray-400 border border-white/10 hover:bg-white/5 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isLoading === 'guest' ? 'DEVAM EDİLİYOR...' : 'MİSAFİR OLARAK GİR'}
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="otp"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 16 }}
              transition={{ duration: 0.25 }}
              className="flex-1 flex flex-col"
            >
              <div className="flex items-center justify-center mb-5">
                <div className="w-14 h-14 rounded-2xl bg-[#FFFF00]/10 border border-[#FFFF00]/20 flex items-center justify-center">
                  <KeyRound size={24} className="text-[#FFFF00]" />
                </div>
              </div>

              <label className="text-[10px] text-gray-500 font-bold uppercase mb-2 block text-center tracking-widest">
                Doğrulama Kodu
              </label>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={otp}
                onChange={(e) => { setOtp(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(null); }}
                className="bg-[#0A0E14] border border-gray-800 rounded-2xl w-full h-16 text-center text-white font-black text-3xl tracking-[0.5em] outline-none focus:border-white/40 transition-colors placeholder:text-gray-800"
                placeholder="••••••"
                autoFocus
              />

              {error && (
                <p className="text-[11px] text-red-400 font-bold mt-3 text-center">{error}</p>
              )}

              <div className="text-center mt-4">
                {resendIn > 0 ? (
                  <span className="text-[11px] text-gray-500 font-bold">
                    Kodu tekrar gönder ({resendIn}s)
                  </span>
                ) : (
                  <button
                    onClick={handleResend}
                    disabled={isLoading !== null}
                    className="text-[11px] text-[#FFFF00] font-black underline disabled:opacity-50"
                  >
                    Kodu tekrar gönder
                  </button>
                )}
              </div>

              <div className="mt-auto pt-5 space-y-3">
                <motion.button
                  whileHover={otp.length < 6 || isLoading ? undefined : { scale: 1.02 }}
                  whileTap={otp.length < 6 || isLoading ? undefined : { scale: 0.98 }}
                  onClick={handleVerify}
                  disabled={otp.length < 6 || isLoading !== null}
                  className="w-full h-14 rounded-2xl font-black text-sm flex items-center justify-center gap-3 bg-[#FFFF00] text-black transition-all shadow-2xl disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isLoading === 'verify'
                    ? <><Loader2 size={18} className="animate-spin" /> DOĞRULANIYOR...</>
                    : <>DOĞRULA VE GİRİŞ YAP <ArrowRight size={18} /></>}
                </motion.button>

                <button
                  onClick={handleHeaderBack}
                  disabled={isLoading !== null}
                  className="w-full h-12 rounded-2xl font-black text-xs flex items-center justify-center gap-2 bg-transparent text-gray-400 border border-white/10 hover:bg-white/5 hover:text-white transition-colors disabled:opacity-40"
                >
                  {method === 'email' ? 'E-POSTAYI DEĞİŞTİR' : 'NUMARAYI DEĞİŞTİR'}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};

export default AuthScreen;
