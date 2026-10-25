import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowLeft } from 'lucide-react';
import pitchBg from '../assets/onboarding/pitch-bg.webp';
import StepLocation, { type LocState } from './onboarding/StepLocation';
import StepName from './onboarding/StepName';
import StepStyle from './onboarding/StepStyle';
import StepSkill from './onboarding/StepSkill';
import { isValidSelfSkill } from '../utils/skillBand';
import PlayerCardReveal from './onboarding/PlayerCardReveal';
import {
  OnboardingPosition, PlayStyle, OnboardingDraft,
  POSITION_CODE, splitFullName, clearOnboardingSkipped,
} from './onboarding/onboardingShared';
import { applyOnboarding } from '../services/onboardingService';
import { useAppStore } from '../store';
import { auth, logout } from '../supabaseAuth';
import { getFullUserProfile } from '../services/userService';
import { fbUpdateUserLocation } from '../supabaseMutations';
// IP-16: konum TEK yoldan istenir. Tarayıcının ham konum API'sini doğrudan
// çağırmak, services/locationService.ts:6'daki sözleşmeyi ihlal ediyor ve
// native izin akışını (Capacitor) atlıyordu; ayrıca red / kalıcı engel /
// zaman aşımı ayrımı kayboluyordu.
import { detectRegion, getLocationPermission, LocationError, openAppSettings, canOpenAppSettings } from '../services/locationService';
import { showToast } from '../components/common/GlobalToast';

interface OnboardingProps {
  /** Onboarding TAMAMLANDI → çağıran uygulamaya/profile döner. Atlama yolu yoktur. */
  onComplete: () => void;
}

const KICKERS = ['ADIM 1 · KONUM', 'ADIM 2 · MEVKİ', 'ADIM 3 · STİL', 'ADIM 4 · SEVİYE'];
const TITLES = ['Konumunu ayarla.', 'Sahne senin.', 'Nasıl oynarsın?', 'Kendini nasıl değerlendirirsin?'];
// Her adım verinin NİYE istendiğini açıkça söyler.
// Apple Guideline 4 & 5.1.1(v) uyumu: yaş, cinsiyet ve tekrar ad/soyad zorunluluğu kaldırıldı.
const SUBTITLES = [
  'Sana en yakın sahaları ve maçları gösterebilmemiz için.',
  'Maç kadrosunda tercih ettiğin mevkide görünürsün. İstersen doğrudan devam edebilirsin.',
  'Sahada nasıl oynadığını bilen takım arkadaşları bulmak için.',
  'Kadroda dengeli takımlar kurulsun diye. Ham puanın değil, yalnız seviye aralığın görünür.',
];
const AURAS = [
  { top: 'rgba(57,255,20,0.28)', bottom: 'rgba(0,176,255,0.22)' },
  { top: 'rgba(255,193,7,0.22)', bottom: 'rgba(57,255,20,0.22)' },
  { top: 'rgba(57,255,20,0.28)', bottom: 'rgba(255,193,7,0.20)' },
  { top: 'rgba(250,204,21,0.24)', bottom: 'rgba(16,185,129,0.22)' },
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

const Onboarding: React.FC<OnboardingProps> = ({ onComplete }) => {
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState<LocState>('idle');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  // Pozisyon OPSİYONEL: kullanıcı seçmeden varsayılan yazılmaz.
  const [position, setPosition] = useState<OnboardingPosition>('');
  const [playStyle, setPlayStyle] = useState<PlayStyle>('');
  // Beyan edilen seviye (1-10). ZORUNLU: seçilmeden profil tamamlanamaz.
  const [selfSkill, setSelfSkill] = useState<number | null>(null);
  const [locationGranted, setLocationGranted] = useState(false);
  // Özet ekranındaki kayıt hatası KALICI olmalı — 4 saniyelik bildirim yetmiyordu.
  const [completeError, setCompleteError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cikiliyor, setCikiliyor] = useState(false);
  const timers = useRef<number[]>([]);
  const { setUserLocation, setLocationPermissionStatus, setActiveRegion, activeRegion } = useAppStore();

  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);

  // ─── Ön-dolum: kayıtta / Apple Sign-In'de gelen ad soyad + daha önce doldurulmuş alanlar.
  useEffect(() => {
    let cancelled = false;
    const meta = splitFullName(auth.currentUser?.displayName);
    if (meta.firstName) setFirstName(meta.firstName);
    if (meta.lastName) setLastName(meta.lastName);

    const uid = auth.currentUser?.uid;
    if (!uid) return;
    (async () => {
      try {
        const p = await getFullUserProfile(uid);
        if (cancelled || !p) return;
        const split = splitFullName(p.full_name || auth.currentUser?.displayName || '');
        setFirstName((prev) => (p.firstName?.trim() || split.firstName || prev));
        setLastName((prev) => (p.lastName?.trim() || split.lastName || prev));
        if (p.playStyle === 'ciddi' || p.playStyle === 'taktiksel' || p.playStyle === 'rahat') setPlayStyle(p.playStyle);
        if (p.position && POSITION_CODE[p.position]) setPosition(POSITION_CODE[p.position]);
        if (isValidSelfSkill(p.selfSkill)) setSelfSkill(p.selfSkill as number);
      } catch {
        /* ön-dolum best-effort — hata akışı bozmaz */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ─── Konum: TEK yol (services/locationService) ────────────────────────────
  const startScan = useCallback(async () => {
    if (phase === 'scanning' || phase === 'found') return;
    setPhase('scanning');
    try {
      const loc = await detectRegion();
      if (loc.coordinates) setUserLocation(loc.coordinates);
      setLocationPermissionStatus('GRANTED');
      setActiveRegion(loc);          // ← kapsamı KALICI yapan satır
      setLocationGranted(true);
      const uid = auth.currentUser?.uid;
      if (uid && loc.coordinates) {
        fbUpdateUserLocation(uid, loc.coordinates.lat, loc.coordinates.lng)
          .catch((err) => console.error('[onboarding] konum DB kaydı başarısız:', err));
      }
      setPhase('found');
      timers.current.push(window.setTimeout(() => setStep((s) => (s === 0 ? 1 : s)), 1000));
    } catch (err) {
      setLocationGranted(false);
      setLocationPermissionStatus('DENIED');
      const kod = err instanceof LocationError ? err.code : 'unavailable';
      if (kod === 'denied') {
        const izin = await getLocationPermission().catch(() => 'denied' as const);
        setPhase(izin === 'blocked' ? 'blocked' : 'denied');
        timers.current.push(window.setTimeout(() => setStep((s) => (s === 0 ? 1 : s)), 650));
      } else if (kod === 'timeout') setPhase('timeout');
      else setPhase('unavailable');
    }
  }, [phase, setUserLocation, setLocationPermissionStatus, setActiveRegion]);

  const goStep1FromSkip = useCallback(() => setStep(1), []);

  const ctaEnabled = (() => {
    switch (step) {
      case 0: return phase !== 'scanning';
      case 1: return true;
      case 2: return playStyle !== '';
      case 3: return isValidSelfSkill(selfSkill);
      default: return false;
    }
  })();

  // Apple Guideline 5.1.1(iv): izin öncesi ekranda yönlendirici ("Konumu Aç")
  // ifade yerine nötr "Devam Et" kullanılır.
  const ctaLabel = (() => {
    switch (step) {
      case 0: return phase === 'scanning' ? 'Taranıyor…' : 'Devam Et';
      case 1: return 'Devam Et';
      case 2: return 'Devam Et';
      case 3: return 'Profili Tamamla';
      default: return '';
    }
  })();

  const handleCta = () => {
    if (!ctaEnabled) return;
    if (step === 0) {
      if (phase === 'idle') {
        startScan();
      } else {
        setStep(1);
      }
      return;
    }
    if (step === 3) { setDone(true); return; }
    setStep((s) => Math.min(3, s + 1));
  };

  const handleBack = () => {
    if (step === 0) return;
    setPhase('idle');
    setStep((s) => Math.max(0, s - 1));
  };

  const buildDraft = (): OnboardingDraft => ({
    ageRange: '',
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    gender: '',
    position,
    playStyle,
    selfSkill,
    locationGranted,
    completedAt: Date.now(),
  });

  // ─── TAMAMLA: özet ekranındaki "Başla" — veriyi profile yazar (completed=true) ───
  const handleComplete = async () => {
    if (saving) return;
    setSaving(true);
    setCompleteError(null);
    try {
      await applyOnboarding(buildDraft(), true);
      const uid = auth.currentUser?.uid;
      if (uid) clearOnboardingSkipped(uid);
      onComplete();
    } catch (e) {
      console.error('[onboarding] tamamlama kaydı başarısız:', e);
      setCompleteError('Profilin kaydedilemedi. Bağlantını kontrol edip tekrar dene.');
      setSaving(false);
    }
  };

  const cikisYap = async () => {
    if (saving || cikiliyor) return;
    setCikiliyor(true);
    try {
      await logout();
    } catch (e) {
      console.error('[onboarding] çıkış başarısız:', e);
      showToast('Çıkış yapılamadı. Bağlantını kontrol edip tekrar dene.');
      setCikiliyor(false);
    }
  };

  const aura = AURAS[step] || AURAS[0];

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
                width: 36, height: 5, borderRadius: 3, transition: 'background 0.35s ease, box-shadow 0.35s ease',
                background: seg === step ? '#39FF14' : seg < step ? 'rgba(57,255,20,0.55)' : 'rgba(255,255,255,0.12)',
                boxShadow: seg === step ? '0 0 12px rgba(57,255,20,0.6)' : 'none',
              }} />
            ))}
          </div>
          {/* ÇIKIŞ — kullanıcının her zaman oturumu kapatıp çıkabileceği açık kapı (Apple 5.1.1(v)). */}
          <button
            onClick={cikisYap}
            disabled={saving || cikiliyor}
            aria-label="Çıkış yap"
            style={{
              width: 44, textAlign: 'right', fontSize: 12, fontWeight: 800,
              color: 'rgba(255,255,255,0.55)', background: 'none', border: 'none',
              cursor: (saving || cikiliyor) ? 'default' : 'pointer', padding: 0,
              minHeight: 38,
            }}
          >
            {cikiliyor ? '…' : 'Çıkış'}
          </button>
        </div>

        {/* Kicker + başlık */}
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.22em', color: '#39FF14', marginBottom: 8 }}>{KICKERS[step]}</div>
          <h1 style={{ fontSize: 27, fontWeight: 900, color: '#fff', letterSpacing: '-0.02em', lineHeight: 1.15, margin: 0, textShadow: '0 0 26px rgba(57,255,20,0.2)' }}>{TITLES[step]}</h1>
          <p style={{ fontSize: 12.5, lineHeight: 1.5, color: 'rgba(255,255,255,0.55)', margin: '8px auto 0', maxWidth: 290 }}>
            {SUBTITLES[step]}
          </p>
        </div>

        {/* Adım içeriği */}
        <div style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', flexDirection: 'column' }}>
          {step === 0 && (
            <StepLocation
              state={phase}
              onScan={startScan}
              onSkip={goStep1FromSkip}
              hatirlananBolge={activeRegion?.label ?? null}
              onOpenSettings={canOpenAppSettings() ? () => { void openAppSettings(); } : undefined}
            />
          )}
          {step === 1 && <StepName firstName={firstName} lastName={lastName} position={position} onPosition={setPosition} />}
          {step === 2 && <StepStyle style={playStyle} onChange={setPlayStyle} />}
          {step === 3 && <StepSkill value={selfSkill} onChange={setSelfSkill} />}
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
      </div>

      {/* Final özet (kartsız, "havada") */}
      {done && (
        <PlayerCardReveal
          firstName={firstName}
          lastName={lastName}
          ageRange=""
          gender=""
          position={position}
          playStyle={playStyle}
          locationGranted={locationGranted}
          busy={saving}
          onStart={handleComplete}
          onBack={() => setDone(false)}
          error={completeError}
        />
      )}

    </div>
  );
};

export default Onboarding;
