import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Mail, Smartphone, ArrowRight, KeyRound, ChevronDown } from 'lucide-react';
import { UserRole } from '../types';
import { loginWithGoogle, loginWithApple, sendEmailOtp, verifyEmailOtp, sendPhoneOtp, verifyPhoneOtp } from '../supabaseAuth';
import { setRememberMe } from '../supabaseClient';
import { PageLayout } from '../components/common/PageLayout';
import { AnimatedButton } from '../components/AnimatedButton';

interface AuthScreenProps {
  onSuccess: () => void;
  onBack: () => void;
  role?: UserRole | null;
}

const THEMES: Record<string, {
  label: string; badge: string; color: string; glow: string;
  tagline: string; orb1: string; orb2: string;
}> = {
  [UserRole.GOALKEEPER]: {
    label: 'Kaleci', badge: 'KALECİ',
    color: '#39FF14', glow: 'rgba(57,255,20,0.35)',
    tagline: 'SON KALE\nSENSİN.',
    orb1: 'rgba(57,255,20,0.3)', orb2: 'rgba(57,255,20,0.18)',
  },
  [UserRole.REFEREE]: {
    label: 'Hakem', badge: 'HAKEM',
    color: '#FF3333', glow: 'rgba(255,51,51,0.35)',
    tagline: 'ADALETİ\nSAĞLA.',
    orb1: 'rgba(255,51,51,0.3)', orb2: 'rgba(255,51,51,0.18)',
  },
  [UserRole.OWNER]: {
    label: 'Tesis', badge: 'TESİS',
    color: '#3388FF', glow: 'rgba(51,136,255,0.35)',
    tagline: 'İŞLETMENİ\nSAHAYA TAŞI.',
    orb1: 'rgba(51,136,255,0.3)', orb2: 'rgba(51,136,255,0.18)',
  },
  default: {
    label: 'Oyuncu', badge: 'OYNCU',
    color: '#FFFF00', glow: 'rgba(255,255,0,0.35)',
    tagline: 'SAHAYA ÇIKMA VAKTİ.',
    orb1: 'rgba(255,255,0,0.3)', orb2: 'rgba(255,255,0,0.18)',
  },
};

function getTheme(role?: UserRole | null) {
  if (role && THEMES[role]) return THEMES[role];
  return THEMES.default;
}

const COUNTRY_CODES = [
  { code: '+90', flag: '🇹🇷', name: 'Türkiye' },
  { code: '+49', flag: '🇩🇪', name: 'Almanya' },
  { code: '+31', flag: '🇳🇱', name: 'Hollanda' },
  { code: '+43', flag: '🇦🇹', name: 'Avusturya' },
  { code: '+33', flag: '🇫🇷', name: 'Fransa' },
  { code: '+44', flag: '🇬🇧', name: 'Birleşik Krallık' },
  { code: '+1',  flag: '🇺🇸', name: 'ABD' },
];

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

const AnimatedTagline = ({ text, color }: { text: string; color: string }) => {
  const lines = text.split('\n');
  return (
    <div className="overflow-visible">
      {lines.map((line, li) => {
        const isColored = (lines.length > 1 && li === 1) || (lines.length === 1);
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
          type="button"
          onClick={() => setOpenModal(null)}
          className="mt-6 w-full h-12 rounded-2xl font-black text-xs bg-[#FFFF00] text-black active:scale-95 transition-all outline-none"
        >
          ANLADIM, KAPAT
        </button>
      </motion.div>
    </motion.div>
  );
};

const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

const formatPhoneDisplay = (digits: string) => {
  const d = digits.slice(0, 10);
  return [d.slice(0, 3), d.slice(3, 6), d.slice(6, 8), d.slice(8, 10)].filter(Boolean).join(' ');
};

const AuthScreen: React.FC<AuthScreenProps> = ({ onSuccess, onBack, role }) => {
  const theme = getTheme(role);
  const { color, orb1, orb2, tagline, badge } = theme;

  const [method, setMethod] = useState<'email' | 'phone'>('email');
  const [stage, setStage] = useState<'input' | 'otp'>('input');
  const [email, setEmail] = useState('');
  const [phoneDigits, setPhoneDigits] = useState('');
  const [otp, setOtp] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [remember, setRemember] = useState(true);
  const [isLoading, setIsLoading] = useState<'send' | 'verify' | 'guest' | 'google' | 'apple' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [openModal, setOpenModal] = useState<'kvkk' | 'sozlesme' | null>(null);
  const [countryCode, setCountryCode] = useState('+90');
  const [showCodes, setShowCodes] = useState(false);

  const phoneE164 = `${countryCode}${phoneDigits}`;
  const contactValid = method === 'email' ? isValidEmail(email) : phoneDigits.length === 10;
  const contactLabel = method === 'email' ? email.trim() : `${countryCode} ${formatPhoneDisplay(phoneDigits)}`;

  useEffect(() => {
    setRememberMe(remember);
  }, [remember]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setInterval(() => setResendIn((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(t);
  }, [resendIn]);

  const requestOtp = async () => {
    if (method === 'email') {
      await sendEmailOtp(email.trim());
    } else {
      await sendPhoneOtp(phoneE164);
    }
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
      if (method === 'email') {
        await verifyEmailOtp(email.trim(), otp);
      } else {
        await verifyPhoneOtp(phoneE164, otp);
      }
      onSuccess();
    } catch (err: any) {
      console.error('OTP doğrulama hatası:', err);
      setError(err?.message || 'Kod hatalı veya süresi dolmuş.');
    } finally {
      setIsLoading(null);
    }
  };

  const handleGoogleLogin = async () => {
    if (!agreed || isLoading) return;
    setError(null);
    setIsLoading('google');
    try {
      setRememberMe(remember);
      await loginWithGoogle();
    } catch (err: any) {
      console.error('[Auth] Google hatası:', err);
      setError(err?.message || 'Google ile giriş başarısız.');
    } finally {
      setIsLoading(null);
    }
  };

  const handleAppleLogin = async () => {
    if (!agreed || isLoading) return;
    setError(null);
    setIsLoading('apple');
    try {
      setRememberMe(remember);
      await loginWithApple();
      onSuccess();
    } catch (err: any) {
      console.error('[Auth] Apple hatası:', err);
      setError(err?.message || 'Apple ile giriş başarısız.');
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
    <PageLayout
      showSafeBottom={false}
      onBack={handleHeaderBack}
      className="relative z-10"
    >
      {/* ─── ANIMATED BACKGROUND ─── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
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
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg,rgba(255,255,255,1) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />
      </div>

      <div className="flex flex-col min-h-screen relative z-10 px-4 pt-16">
        {/* ─── HERO TAGLINE ─── */}
        <div className="pt-8 pb-4 flex flex-col justify-end">
          <span 
            className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-[10px] font-black tracking-widest uppercase self-start mb-4 shadow-lg"
            style={{ color, borderColor: `${color}33` }}
          >
            {badge} GİRİŞİ
          </span>
          <AnimatedTagline text={tagline} color={color} />
        </div>

        {/* ─── Auth card ─── */}
        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 26, delay: 0.2 }}
          className="flex-1 rounded-[32px] border border-white/5 p-6 flex flex-col mb-6 bg-[#161B22]/80 backdrop-blur-3xl shadow-2xl"
        >
          <div className="text-center mb-5">
            <h2 className="text-lg font-black text-white uppercase tracking-wider italic">OYNA</h2>
            <p className="text-xs text-gray-400 mt-1 leading-relaxed">
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
                transition={{ duration: 0.2 }}
                className="flex-1 flex flex-col"
              >
                {/* Yöntem seçimi */}
                <div className="flex p-1 rounded-2xl bg-black/40 border border-white/10 mb-5">
                  {([['email', 'E-POSTA', Mail], ['phone', 'TELEFON', Smartphone]] as const).map(([m, label, Icon]) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => { setMethod(m); setError(null); }}
                      className="flex-1 h-11 rounded-xl text-[11px] font-black tracking-wider flex items-center justify-center gap-2 transition-all outline-none focus-visible:ring-2 focus-visible:ring-white/20"
                      style={{
                        background: method === m ? color : 'transparent',
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
                      className="bg-transparent w-full outline-none text-white font-bold placeholder:text-gray-700 text-sm"
                      placeholder="ornek@oyna.app"
                      aria-label="E-posta adresi"
                    />
                  </div>
                ) : (
                  <div className="bg-[#0A0E14] border border-gray-800 p-4 rounded-2xl flex items-center gap-3 focus-within:border-white/40 transition-colors">
                    <Smartphone size={20} className="text-gray-500 shrink-0" />
                    {/* Ülke kodu seçici */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowCodes(!showCodes)}
                        className="flex items-center gap-1 text-white font-bold shrink-0 border-r border-white/10 pr-2 mr-1 text-sm outline-none"
                      >
                        {COUNTRY_CODES.find(c => c.code === countryCode)?.flag} {countryCode}
                        <ChevronDown size={10} />
                      </button>
                      <AnimatePresence>
                        {showCodes && (
                          <motion.div
                            initial={{ opacity: 0, y: -8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            className="absolute bottom-full mb-2 left-0 z-50 rounded-2xl overflow-hidden border border-white/10 shadow-2xl"
                            style={{ background: '#161B22', minWidth: 160 }}
                          >
                            {COUNTRY_CODES.map(c => (
                              <button
                                key={c.code}
                                type="button"
                                onClick={() => { setCountryCode(c.code); setShowCodes(false); }}
                                className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-white hover:bg-white/10 transition-colors outline-none"
                              >
                                <span>{c.flag}</span>
                                <span className="font-bold">{c.code}</span>
                                <span className="text-gray-400 text-[10px]">{c.name}</span>
                              </button>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                    <input
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel-national"
                      value={formatPhoneDisplay(phoneDigits)}
                      onChange={(e) => { setPhoneDigits(e.target.value.replace(/\D/g, '').slice(0, 10)); setError(null); }}
                      className="bg-transparent w-full outline-none text-white font-bold placeholder:text-gray-700 tracking-wide text-sm"
                      placeholder="5XX XXX XX XX"
                      aria-label="Telefon numarası"
                    />
                  </div>
                )}

                {/* Beni Hatırla */}
                <button
                  type="button"
                  onClick={() => setRemember((v) => !v)}
                  className="flex items-center justify-between w-full mt-4 px-1 group outline-none"
                >
                  <span className="text-xs font-bold text-gray-300">Beni Hatırla</span>
                  <span
                    className="relative w-11 h-6 rounded-full transition-colors shrink-0"
                    style={{ background: remember ? color : 'rgba(255,255,255,0.12)' }}
                  >
                    <span
                      className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-black transition-transform"
                      style={{ transform: remember ? 'translateX(20px)' : 'translateX(0)' }}
                    />
                  </span>
                </button>
                <p className="text-[10px] text-gray-500 mt-1 px-1">
                  Açık olduğunda çıkış yapana kadar bu cihazda kimliğinle oturumun açık kalır.
                </p>

                {error && (
                  <p className="text-[11px] text-red-400 font-bold mt-3 px-1">{error}</p>
                )}

                {/* KVKK + Sözleşme onayı */}
                <LegalModal openModal={openModal} setOpenModal={setOpenModal} />
                <div className="flex items-start gap-3 mt-4 px-1">
                  <button
                    type="button"
                    onClick={() => setAgreed(!agreed)}
                    className="mt-0.5 w-5 h-5 rounded-md border shrink-0 flex items-center justify-center transition-all outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#161B22]"
                    style={{ 
                      background: agreed ? color : 'transparent', 
                      borderColor: agreed ? color : 'rgba(255,255,255,0.2)',
                      boxShadow: agreed ? `0 0 10px ${color}40` : 'none'
                    }}
                  >
                    {agreed && <Check size={12} className="text-black" />}
                  </button>
                  <p className="text-[10px] text-gray-400 leading-relaxed font-bold tracking-wide">
                    <button type="button" onClick={() => setOpenModal('kvkk')} className="underline" style={{ color }}>KVKK Aydınlatma Metni</button>'ni ve <button type="button" onClick={() => setOpenModal('sozlesme')} className="underline" style={{ color }}>Kullanıcı Sözleşmesi</button>'ni okudum, kişisel verilerimin işlenmesini onaylıyorum.
                  </p>
                </div>

                <div className="mt-auto pt-6 space-y-3">
                  <AnimatedButton
                    onClick={handleSendOtp}
                    disabled={sendDisabled}
                    isLoading={isLoading === 'send'}
                    size="lg"
                    className="w-full h-14"
                    style={{ 
                      background: sendDisabled ? 'rgba(255,255,255,0.05)' : color,
                      color: sendDisabled ? 'rgba(255,255,255,0.2)' : '#000',
                      boxShadow: sendDisabled ? 'none' : `0 0 20px ${color}33`
                    }}
                  >
                    DOĞRULAMA KODU GÖNDER <ArrowRight size={16} className="ml-1" />
                  </AnimatedButton>

                  {/* Divider */}
                  <div className="flex items-center gap-3 my-2">
                    <div className="flex-1 h-px bg-white/5" />
                    <span className="text-[10px] text-gray-600 font-bold uppercase tracking-widest">veya</span>
                    <div className="flex-1 h-px bg-white/5" />
                  </div>

                  {/* Google Sign In */}
                  <AnimatedButton
                    onClick={handleGoogleLogin}
                    disabled={!agreed || isLoading !== null}
                    isLoading={isLoading === 'google'}
                    variant="secondary"
                    size="lg"
                    className="w-full h-14 bg-white text-black hover:bg-gray-100 border-none"
                  >
                    <svg className="w-5 h-5 shrink-0 mr-2" viewBox="0 0 24 24">
                      <path fill="#EA4335" d="M12.24 10.285V14.4h6.887c-.648 2.41-2.519 4.114-5.186 4.114-3.478 0-6.3-2.822-6.3-6.3 0-3.478 2.822-6.3 6.3-6.3 1.636 0 3.109.633 4.2 1.66l3.205-3.205C19.232 2.378 15.932 1 12.24 1 5.86 1 .7 6.16.7 12.54s5.16 11.54 11.54 11.54c6.645 0 11.755-4.664 11.755-11.755 0-.745-.067-1.462-.2-2.04H12.24z" />
                    </svg>
                    <span>GOOGLE İLE GİRİŞ YAP</span>
                  </AnimatedButton>

                  {/* Apple Sign In */}
                  <AnimatedButton
                    onClick={handleAppleLogin}
                    disabled={!agreed || isLoading !== null}
                    isLoading={isLoading === 'apple'}
                    variant="secondary"
                    size="lg"
                    className="w-full h-14 bg-black text-white hover:bg-black/90 border border-white/10"
                  >
                    <svg className="w-5 h-5 shrink-0 mr-2" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 4.17c.66-.81 1.11-1.93.99-3.06-1 .04-2.22.67-2.94 1.5-.64.73-1.2 1.87-1.05 2.99 1.12.09 2.26-.56 3-1.43z" />
                    </svg>
                    <span>APPLE İLE GİRİŞ YAP</span>
                  </AnimatedButton>

                  {/* Misafir girişi */}
                  <AnimatedButton
                    onClick={handleGuestLogin}
                    disabled={guestDisabled}
                    isLoading={isLoading === 'guest'}
                    variant="ghost"
                    size="sm"
                    className="w-full h-12 text-gray-400 border border-white/10 hover:bg-white/5 hover:text-white"
                  >
                    MİSAFİR OLARAK GİR
                  </AnimatedButton>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="otp"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 16 }}
                transition={{ duration: 0.2 }}
                className="flex-1 flex flex-col"
              >
                <div className="flex items-center justify-center mb-5">
                  <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center" style={{ boxShadow: `0 0 20px ${color}20` }}>
                    <KeyRound size={24} style={{ color }} />
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
                  aria-label="6 haneli doğrulama kodu"
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
                      type="button"
                      onClick={handleResend}
                      disabled={isLoading !== null}
                      className="text-[11px] font-black underline disabled:opacity-50 outline-none"
                      style={{ color }}
                    >
                      Kodu tekrar gönder
                    </button>
                  )}
                </div>

                <div className="mt-auto pt-6 space-y-3">
                  <AnimatedButton
                    onClick={handleVerify}
                    disabled={otp.length < 6 || isLoading !== null}
                    isLoading={isLoading === 'verify'}
                    size="lg"
                    className="w-full h-14"
                    style={{ 
                      background: otp.length < 6 ? 'rgba(255,255,255,0.05)' : color,
                      color: otp.length < 6 ? 'rgba(255,255,255,0.2)' : '#000',
                      boxShadow: otp.length < 6 ? 'none' : `0 0 20px ${color}33`
                    }}
                  >
                    DOĞRULA VE GİRİŞ YAP <ArrowRight size={16} className="ml-1" />
                  </AnimatedButton>

                  <AnimatedButton
                    onClick={handleHeaderBack}
                    disabled={isLoading !== null}
                    variant="ghost"
                    size="sm"
                    className="w-full h-12 text-gray-400 border border-white/10"
                  >
                    {method === 'email' ? 'E-POSTAYI DEĞİŞTİR' : 'NUMARAYI DEĞİŞTİR'}
                  </AnimatedButton>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </PageLayout>
  );
};

export default AuthScreen;
