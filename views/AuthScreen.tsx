import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Check, ChevronDown } from 'lucide-react';
import { UserRole } from '../types';
import { loginWithGoogle, loginWithApple, loginWithPhone, verifyOtp } from '../supabaseAuth';

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
    label: 'Oyuncu', badge: 'OYUNCU',
    color: '#FFFF00', glow: 'rgba(255,255,0,0.35)',
    tagline: 'SAHAYA ÇIKMA VAKTİ.',
    orb1: 'rgba(255,255,0,0.3)', orb2: 'rgba(255,255,0,0.18)',
  },
};

function getTheme(role?: UserRole | null) {
  if (role && THEMES[role]) return THEMES[role];
  return THEMES.default;
}

// ─── Ülke kodları (sık kullanılanlar) ─────────────────────────────────────────
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

// ─── OTP giriş kutucukları (6 hane) ──────────────────────────────────────────
const OtpInput: React.FC<{
  value: string;
  onChange: (v: string) => void;
  accentColor: string;
}> = ({ value, onChange, accentColor }) => {
  const digits = value.split('').concat(Array(6).fill('')).slice(0, 6);
  const inputRefs = React.useRef<(HTMLInputElement | null)[]>([]);

  const handleKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      inputRefs.current[i - 1]?.focus();
    }
  };

  const handleChange = (i: number, v: string) => {
    if (!/^\d*$/.test(v)) return;
    const newDigits = [...digits];
    newDigits[i] = v.slice(-1);
    onChange(newDigits.join(''));
    if (v && i < 5) inputRefs.current[i + 1]?.focus();
  };

  return (
    <div className="flex gap-2 justify-center">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={el => { inputRefs.current[i] = el; }}
          type="tel"
          inputMode="numeric"
          maxLength={1}
          value={d}
          onChange={e => handleChange(i, e.target.value)}
          onKeyDown={e => handleKey(i, e)}
          className="w-11 h-14 rounded-xl text-center text-xl font-black text-white bg-black/40 border outline-none transition-all"
          style={{
            borderColor: d ? accentColor : 'rgba(255,255,255,0.12)',
            boxShadow: d ? `0 0 10px ${accentColor}40` : 'none',
          }}
        />
      ))}
    </div>
  );
};

// ─── Telefon giriş akışı (2 adımlı) ──────────────────────────────────────────
const PhoneAuthFlow: React.FC<{
  color: string;
  onSuccess: () => void;
  onCancel: () => void;
}> = ({ color, onSuccess, onCancel }) => {
  const [step, setStep] = React.useState<'phone' | 'otp'>('phone');
  const [countryCode, setCountryCode] = React.useState('+90');
  const [showCodes, setShowCodes] = React.useState(false);
  const [phone, setPhone] = React.useState('');
  const [otp, setOtp] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [resendCountdown, setResendCountdown] = React.useState(0);

  const startCountdown = () => {
    setResendCountdown(45);
    const iv = setInterval(() => {
      setResendCountdown(prev => {
        if (prev <= 1) { clearInterval(iv); return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  const handleSendOtp = async () => {
    if (!phone.trim()) return;
    setError(null);
    setLoading(true);
    try {
      const fullPhone = `${countryCode}${phone.replace(/\D/g, '')}`;
      await loginWithPhone(fullPhone);
      setStep('otp');
      startCountdown();
    } catch (err: any) {
      if (err.message === 'rate_limit') {
        setError('Çok fazla deneme. Lütfen birkaç dakika bekleyin.');
      } else {
        setError('Geçersiz telefon numarası. Lütfen kontrol edin.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (otp.length !== 6) return;
    setError(null);
    setLoading(true);
    try {
      const fullPhone = `${countryCode}${phone.replace(/\D/g, '')}`;
      await verifyOtp(fullPhone, otp);
      onSuccess();
    } catch (err: any) {
      if (err.message === 'expired_token') {
        setError('Kodun süresi doldu. Yeni kod isteyin.');
      } else {
        setError('Hatalı kod. Lütfen tekrar deneyin.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCountdown > 0) return;
    setOtp('');
    setError(null);
    setLoading(true);
    try {
      const fullPhone = `${countryCode}${phone.replace(/\D/g, '')}`;
      await loginWithPhone(fullPhone);
      startCountdown();
    } catch {
      setError('SMS gönderilemedi. Lütfen tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-4"
    >
      {step === 'phone' ? (
        <>
          <p className="text-xs text-gray-400 text-center font-bold uppercase tracking-wider">
            Telefon ile Giriş
          </p>

          {/* Ülke kodu + numara */}
          <div className="flex gap-2">
            <div className="relative">
              <button
                onClick={() => setShowCodes(!showCodes)}
                className="flex items-center gap-1.5 h-14 px-3 rounded-2xl bg-black/40 border border-white/10 text-white text-sm font-bold whitespace-nowrap"
              >
                {COUNTRY_CODES.find(c => c.code === countryCode)?.flag} {countryCode}
                <ChevronDown size={12} />
              </button>
              <AnimatePresence>
                {showCodes && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="absolute top-full mt-1 left-0 z-50 rounded-2xl overflow-hidden border border-white/10 shadow-2xl"
                    style={{ background: '#161B22', minWidth: 180 }}
                  >
                    {COUNTRY_CODES.map(c => (
                      <button
                        key={c.code}
                        onClick={() => { setCountryCode(c.code); setShowCodes(false); }}
                        className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-white hover:bg-white/10 transition-colors"
                      >
                        <span>{c.flag}</span>
                        <span className="font-bold">{c.code}</span>
                        <span className="text-gray-400 text-xs">{c.name}</span>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value.replace(/[^\d\s]/g, ''))}
              placeholder="5XX XXX XX XX"
              className="flex-1 h-14 rounded-2xl bg-black/40 border border-white/10 px-4 text-white font-bold text-sm outline-none focus:border-white/30"
              onKeyDown={e => e.key === 'Enter' && handleSendOtp()}
            />
          </div>

          {error && <p className="text-xs text-red-400 text-center font-bold">{error}</p>}

          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleSendOtp}
            disabled={!phone.trim() || loading}
            className="w-full h-12 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-40"
            style={{ background: color === '#FFFF00' ? '#FFFF00' : color, color: color === '#FFFF00' ? '#000' : '#fff' }}
          >
            {loading ? 'GÖNDERİLİYOR...' : 'SMS GÖNDER'}
          </motion.button>
        </>
      ) : (
        <>
          <p className="text-xs text-gray-400 text-center font-bold">
            <span className="text-white">{countryCode} {phone}</span> numarasına gönderilen kodu girin
          </p>

          <OtpInput value={otp} onChange={setOtp} accentColor={color} />

          {error && <p className="text-xs text-red-400 text-center font-bold">{error}</p>}

          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleVerify}
            disabled={otp.length !== 6 || loading}
            className="w-full h-12 rounded-2xl font-black text-sm flex items-center justify-center transition-all disabled:opacity-40"
            style={{ background: color === '#FFFF00' ? '#FFFF00' : color, color: color === '#FFFF00' ? '#000' : '#fff' }}
          >
            {loading ? 'DOĞRULANIYYOR...' : 'DOĞRULA'}
          </motion.button>

          <button
            onClick={handleResend}
            disabled={resendCountdown > 0}
            className="w-full text-center text-xs text-gray-400 py-2 disabled:opacity-50 transition-opacity"
          >
            {resendCountdown > 0
              ? `Kodu tekrar gönder (${resendCountdown}s)`
              : 'Kodu tekrar gönder'}
          </button>
        </>
      )}

      <button
        onClick={onCancel}
        className="w-full text-center text-xs text-gray-500 hover:text-gray-300 py-1 transition-colors"
      >
        ← Diğer giriş yöntemleri
      </button>
    </motion.div>
  );
};

// ─── Ana AuthScreen ───────────────────────────────────────────────────────────
const AuthScreen: React.FC<AuthScreenProps> = ({ onSuccess, onBack, role }) => {
  const theme = getTheme(role);
  const { color, orb1, orb2, tagline, badge } = theme;
  const [agreed, setAgreed] = React.useState(true);
  const [isLoading, setIsLoading] = React.useState<'google' | 'apple' | null>(null);
  const [showPhoneFlow, setShowPhoneFlow] = React.useState(false);

  const handleGoogleLogin = async () => {
    if (!agreed || isLoading) return;
    setIsLoading('google');
    try {
      await loginWithGoogle();
      // OAuth redirect — onSuccess auth listener'dan tetiklenir
    } catch (err) {
      console.error('[Auth] Google hatası:', err);
      setIsLoading(null);
    }
  };

  const handleAppleLogin = async () => {
    if (!agreed || isLoading) return;
    setIsLoading('apple');
    try {
      await loginWithApple();
      onSuccess();
    } catch (err) {
      console.error('[Auth] Apple hatası:', err);
    } finally {
      setIsLoading(null);
    }
  };

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden" style={{ background: '#0A0E14' }}>

      {/* ─── Animated Background ─── */}
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
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg,rgba(255,255,255,1) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />
      </div>

      {/* ─── Back button ─── */}
      <motion.button
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.3 }}
        onClick={onBack}
        className="absolute top-12 left-6 z-30 p-2.5 rounded-full border border-white/10 text-white bg-black/40 backdrop-blur-md hover:bg-white/10 transition-colors"
      >
        <ArrowLeft size={18} />
      </motion.button>

      {/* ─── Hero tagline ─── */}
      <div className="relative z-10 pt-32 pb-4 px-6 flex flex-col justify-end">
        <span className="px-3.5 py-1 bg-white/5 border border-white/10 rounded-full text-[10px] font-black tracking-widest text-[#FFFF00] uppercase self-start mb-4 shadow-[0_0_15px_rgba(255,255,0,0.1)]">
          {badge} GİRİŞİ
        </span>
        <AnimatedTagline text={tagline} color={color} />
      </div>

      {/* ─── Auth card ─── */}
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

          <AnimatePresence mode="wait">
            {showPhoneFlow ? (
              <PhoneAuthFlow
                key="phone"
                color={color}
                onSuccess={onSuccess}
                onCancel={() => setShowPhoneFlow(false)}
              />
            ) : (
              <motion.div
                key="social"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                <div className="text-center mb-4">
                  <h2 className="text-lg font-black text-white uppercase tracking-wider italic">OYNA ECOSYSTEM</h2>
                  <p className="text-xs text-gray-500 mt-1">Giriş yönteminizi seçerek anında sahaya katılın</p>
                </div>

                <div className="space-y-3">
                  {/* Google Sign In */}
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleGoogleLogin}
                    disabled={!agreed || isLoading !== null}
                    className="w-full h-14 rounded-2xl font-black text-sm flex items-center justify-center gap-3 bg-white text-black hover:bg-gray-100 transition-colors shadow-2xl disabled:opacity-50"
                  >
                    <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                      <path fill="#EA4335" d="M12.24 10.285V14.4h6.887c-.648 2.41-2.519 4.114-5.186 4.114-3.478 0-6.3-2.822-6.3-6.3 0-3.478 2.822-6.3 6.3-6.3 1.636 0 3.109.633 4.2 1.66l3.205-3.205C19.232 2.378 15.932 1 12.24 1 5.86 1 .7 6.16.7 12.54s5.16 11.54 11.54 11.54c6.645 0 11.755-4.664 11.755-11.755 0-.745-.067-1.462-.2-2.04H12.24z" />
                    </svg>
                    <span>{isLoading === 'google' ? 'YÖNLENDİRİLİYOR...' : 'GOOGLE İLE DEVAM ET'}</span>
                  </motion.button>

                  {/* Apple Sign In */}
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleAppleLogin}
                    disabled={!agreed || isLoading !== null}
                    className="w-full h-14 rounded-2xl font-black text-sm flex items-center justify-center gap-3 bg-black text-white hover:bg-black/80 border border-white/10 transition-colors shadow-2xl disabled:opacity-50"
                  >
                    <svg className="w-5 h-5 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 4.17c.66-.81 1.11-1.93.99-3.06-1 .04-2.22.67-2.94 1.5-.64.73-1.2 1.87-1.05 2.99 1.12.09 2.26-.56 3-1.43z" />
                    </svg>
                    <span>{isLoading === 'apple' ? 'GİRİŞ YAPILIYOR...' : 'APPLE İLE DEVAM ET'}</span>
                  </motion.button>

                  {/* Divider */}
                  <div className="flex items-center gap-3 my-2">
                    <div className="flex-1 h-px bg-white/8" />
                    <span className="text-[10px] text-gray-600 font-bold uppercase tracking-widest">veya</span>
                    <div className="flex-1 h-px bg-white/8" />
                  </div>

                  {/* Phone link */}
                  <button
                    onClick={() => setShowPhoneFlow(true)}
                    disabled={!agreed}
                    className="w-full text-center text-xs font-bold text-gray-400 hover:text-white py-2 transition-colors disabled:opacity-50"
                  >
                    📱 Telefon numarasıyla giriş yap
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* KVKK onay checkbox */}
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
