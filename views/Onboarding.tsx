import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowLeft } from 'lucide-react';
import pitchBg from '../assets/onboarding/pitch-bg.webp';
import StepLocation from './onboarding/StepLocation';
import StepAge from './onboarding/StepAge';
import StepName from './onboarding/StepName';
import StepStyle from './onboarding/StepStyle';
import PlayerCardReveal from './onboarding/PlayerCardReveal';
import {
  AGE_RANGES, Gender, OnboardingPosition, PlayStyle, OnboardingDraft,
  saveOnboardingDraft, clearOnboardingDraft,
} from './onboarding/onboardingShared';

interface OnboardingProps {
  /** "Kayıt Ol": taslağı kaydeder ve kayıt (AUTH) ekranına yönlendirir. */
  onComplete: () => void;
  /** "Giriş yap": taslağı temizler ve giriş (AUTH) ekranına yönlendirir. */
  onLogin: () => void;
}

type Phase = 'idle' | 'scanning' | 'found';

const KICKERS = ['ADIM 1 · KONUM', 'ADIM 2 · YAŞ', 'ADIM 3 · İSİM', 'ADIM 4 · STİL'];
const TITLES = ['Konumunu ayarla.', 'Yaşını seç.', 'Sahne senin.', 'Nasıl oynarsın?'];
const AURAS = [
  { top: 'rgba(57,255,20,0.28)', bottom: 'rgba(0,176,255,0.22)' },
  { top: 'rgba(0,176,255,0.26)', bottom: 'rgba(57,255,20,0.20)' },
  { top: 'rgba(255,193,7,0.22)', bottom: 'rgba(57,255,20,0.22)' },
  { top: 'rgba(57,255,20,0.28)', bottom: 'rgba(255,193,7,0.20)' },
];

const KEYFRAMES = `
@keyframes obStepIn { 0% { opacity: 0; transform: translateY(26px) scale(0.98); filter: blur(6px); } 100% { opacity: 1; transform: none; filter: none; } }
@keyframes obRadarSweep { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@keyframes obPulseRing { 0% { transform: scale(0.75); opacity: 0.9; } 100% { transform: scale(1.35); opacity: 0; } }
@keyframes obSpinY { from { transform: rotateY(0deg); } to { transform: rotateY(360deg); } }
@keyframes obHoloMove { 0% { background-position: 0% 50%; } 100% { background-position: 100% 50%; } }
@keyframes obTwinkle { 0% { opacity: 0.12; transform: translate(0,0); } 100% { opacity: 0.7; transform: translate(4px,-14px); } }
@keyframes obGradMove { 0% { background-position: 0% 50%; } 100% { background-position: 100% 50%; } }
@keyframes obKenBurns { 0% { transform: scale(1.06) translate(0,0); } 100% { transform: scale(1.2) translate(-2%,-2%); } }
`;

const Onboarding: React.FC<OnboardingProps> = ({ onComplete, onLogin }) => {
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState<Phase>('idle');
  const [ageIndex, setAgeIndex] = useState(2); // 24-30
  const [ageTouched, setAgeTouched] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [gender, setGender] = useState<Gender>('erkek');
  const [position, setPosition] = useState<OnboardingPosition>('orta');
  const [playStyle, setPlayStyle] = useState<PlayStyle>('');
  const [locationGranted, setLocationGranted] = useState(false);
  const [done, setDone] = useState(false);
  const timers = useRef<number[]>([]);

  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);

  const startScan = useCallback(() => {
    if (phase !== 'idle') return;
    setPhase('scanning');
    timers.current.push(window.setTimeout(() => {
      setPhase('found');
      setLocationGranted(true);
      timers.current.push(window.setTimeout(() => {
        setPhase('idle');
        setStep((s) => (s === 0 ? 1 : s));
      }, 1000));
    }, 1600));
  }, [phase]);

  const goStep1FromSkip = useCallback(() => setStep(1), []);

  const ctaEnabled = (() => {
    switch (step) {
      case 0: return phase === 'idle';
      case 1: return ageTouched;
      case 2: return firstName.trim().length > 0 && lastName.trim().length > 0;
      case 3: return playStyle !== '';
      default: return false;
    }
  })();

  const ctaLabel = (() => {
    switch (step) {
      case 0: return phase === 'scanning' ? 'Taranıyor…' : 'Konumu Aç';
      case 1: return 'Devam Et';
      case 2: return 'Devam Et';
      case 3: return 'Profili Tamamla';
      default: return '';
    }
  })();

  const handleCta = () => {
    if (!ctaEnabled) return;
    if (step === 0) { startScan(); return; }
    if (step === 3) { setDone(true); return; }
    setStep((s) => Math.min(3, s + 1));
  };

  const handleBack = () => {
    if (step === 0) return;
    setPhase('idle');
    setStep((s) => Math.max(0, s - 1));
  };

  const handleRegister = () => {
    const draft: OnboardingDraft = {
      ageRange: AGE_RANGES[ageIndex],
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      gender,
      position,
      playStyle,
      locationGranted,
      completedAt: Date.now(),
    };
    saveOnboardingDraft(draft);
    onComplete();
  };

  const handleLogin = () => {
    clearOnboardingDraft();
    onLogin();
  };

  const aura = AURAS[step];

  return (
    <div className="fixed inset-0 overflow-hidden select-none" style={{ background: '#0A0E14' }}>
      <style>{KEYFRAMES}</style>

      {/* Kalıcı arka plan (tüm adımlarda sabit) */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
        <img src={pitchBg} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(0.22) saturate(0.8) contrast(1.05)', animation: 'obKenBurns 16s ease-in-out infinite alternate' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(10,14,20,0.94) 0%, rgba(10,14,20,0.55) 27%, rgba(10,14,20,0.5) 55%, rgba(10,14,20,0.75) 74%, rgba(10,14,20,0.98) 100%)' }} />
      </div>
      <div style={{ position: 'absolute', top: -70, right: -70, width: 300, height: 300, borderRadius: '50%', filter: 'blur(70px)', pointerEvents: 'none', transition: 'background 1s ease', background: aura.top }} />
      <div style={{ position: 'absolute', bottom: -90, left: -90, width: 320, height: 320, borderRadius: '50%', filter: 'blur(80px)', pointerEvents: 'none', transition: 'background 1s ease', background: aura.bottom }} />

      {/* İçerik */}
      <div className="relative z-[1] flex flex-col h-full max-w-md mx-auto" style={{ padding: '30px 24px 26px' }}>
        {/* Üst bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 22 }}>
          <button onClick={handleBack} aria-label="Geri" style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: step > 0 ? 'pointer' : 'default', opacity: step > 0 ? 1 : 0, pointerEvents: step > 0 ? 'auto' : 'none', transition: 'opacity 0.3s ease' }}>
            <ArrowLeft size={18} color="#fff" />
          </button>
          <div style={{ display: 'flex', gap: 6 }}>
            {[0, 1, 2, 3].map((seg) => (
              <span key={seg} style={{
                width: 30, height: 5, borderRadius: 3, transition: 'background 0.35s ease, box-shadow 0.35s ease',
                background: seg === step ? '#39FF14' : seg < step ? 'rgba(57,255,20,0.55)' : 'rgba(255,255,255,0.12)',
                boxShadow: seg === step ? '0 0 12px rgba(57,255,20,0.6)' : 'none',
              }} />
            ))}
          </div>
          <div style={{ width: 38, textAlign: 'right', fontSize: 11, fontWeight: 800, color: 'rgba(255,255,255,0.55)' }}>{step + 1}/4</div>
        </div>

        {/* Kicker + başlık */}
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.22em', color: '#39FF14', marginBottom: 8 }}>{KICKERS[step]}</div>
          <h1 style={{ fontSize: 27, fontWeight: 900, color: '#fff', letterSpacing: '-0.02em', lineHeight: 1.15, margin: 0, textShadow: '0 0 26px rgba(57,255,20,0.2)' }}>{TITLES[step]}</h1>
        </div>

        {/* Adım içeriği */}
        <div style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', flexDirection: 'column' }}>
          {step === 0 && <StepLocation phase={phase} onScan={startScan} onSkip={goStep1FromSkip} />}
          {step === 1 && <StepAge index={ageIndex} onChange={setAgeIndex} onFirstTouch={() => setAgeTouched(true)} />}
          {step === 2 && <StepName firstName={firstName} lastName={lastName} gender={gender} position={position} onFirst={setFirstName} onLast={setLastName} onGender={setGender} onPosition={setPosition} />}
          {step === 3 && <StepStyle style={playStyle} onChange={setPlayStyle} />}
        </div>

        {/* CTA */}
        <button
          onClick={handleCta}
          disabled={!ctaEnabled}
          style={{
            height: 58, borderRadius: 18, border: 'none', marginTop: 16, width: '100%',
            fontSize: 16, fontWeight: 900, letterSpacing: '0.02em',
            cursor: ctaEnabled ? 'pointer' : 'default',
            ...(phase === 'scanning'
              ? { background: 'rgba(57,255,20,0.14)', color: '#39FF14' }
              : ctaEnabled
                ? { background: 'linear-gradient(90deg,#39FF14,#00E676,#39FF14)', backgroundSize: '220% 100%', color: '#06210A', boxShadow: '0 0 26px rgba(57,255,20,0.45)', animation: 'obGradMove 3s ease-in-out infinite alternate' }
                : { background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.32)' }),
          }}
        >
          {ctaLabel}
        </button>

        <button onClick={handleLogin} style={{ marginTop: 12, background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: 12, cursor: 'pointer', alignSelf: 'center' }}>
          Zaten hesabın var mı? <span style={{ color: '#39FF14', fontWeight: 700 }}>Giriş yap</span>
        </button>
      </div>

      {/* Final oyuncu kartı */}
      {done && (
        <PlayerCardReveal
          firstName={firstName}
          lastName={lastName}
          ageRange={AGE_RANGES[ageIndex]}
          gender={gender}
          position={position}
          playStyle={playStyle}
          locationGranted={locationGranted}
          onRegister={handleRegister}
          onLogin={handleLogin}
          onBack={() => setDone(false)}
        />
      )}
    </div>
  );
};

export default Onboarding;
