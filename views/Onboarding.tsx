import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowLeft } from 'lucide-react';
import pitchBg from '../assets/onboarding/pitch-bg.webp';
import StepLocation from './onboarding/StepLocation';
import StepAge from './onboarding/StepAge';
import StepName from './onboarding/StepName';
import StepStyle from './onboarding/StepStyle';
import StepSkill from './onboarding/StepSkill';
import { isValidSelfSkill } from '../utils/skillBand';
import PlayerCardReveal from './onboarding/PlayerCardReveal';
import {
  AGE_RANGES, AgeRange, Gender, OnboardingPosition, PlayStyle, OnboardingDraft,
  POSITION_CODE, splitFullName,
} from './onboarding/onboardingShared';
import { applyOnboarding } from '../services/onboardingService';
import { useAppStore } from '../store';
import { auth } from '../supabaseAuth';
import { getFullUserProfile } from '../services/userService';
import { fbUpdateUserLocation } from '../supabaseMutations';
import { showToast } from '../components/common/GlobalToast';
import { validateFirstLast } from '../shared/personName';

interface OnboardingProps {
  /** Onboarding bitti (TAMAMLANDI veya ATLANDI) → çağıran uygulamaya/profile döner. */
  onComplete: () => void;
}

type Phase = 'idle' | 'scanning' | 'found';

const KICKERS = ['ADIM 1 · KONUM', 'ADIM 2 · YAŞ', 'ADIM 3 · İSİM', 'ADIM 4 · STİL', 'ADIM 5 · SEVİYE'];
const TITLES = ['Konumunu ayarla.', 'Yaşını seç.', 'Sahne senin.', 'Nasıl oynarsın?', 'Kendini nasıl değerlendirirsin?'];
const AURAS = [
  { top: 'rgba(57,255,20,0.28)', bottom: 'rgba(0,176,255,0.22)' },
  { top: 'rgba(0,176,255,0.26)', bottom: 'rgba(57,255,20,0.20)' },
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
  const [phase, setPhase] = useState<Phase>('idle');
  const [ageIndex, setAgeIndex] = useState(2); // 24-30
  const [ageTouched, setAgeTouched] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  // Cinsiyet ve pozisyon OPSİYONEL: kullanıcı seçmeden varsayılan yazma
  // (atlama durumunda sahte "erkek/orta saha" verisi kaydını önler).
  const [gender, setGender] = useState<Gender>('');
  const [position, setPosition] = useState<OnboardingPosition>('');
  const [playStyle, setPlayStyle] = useState<PlayStyle>('');
  // Beyan edilen seviye (1-10). ZORUNLU: seçilmeden profil tamamlanamaz.
  const [selfSkill, setSelfSkill] = useState<number | null>(null);
  const [locationGranted, setLocationGranted] = useState(false);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const timers = useRef<number[]>([]);
  const { setUserLocation, setLocationPermissionStatus } = useAppStore();

  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);

  // ─── Ön-dolum: kayıtta girilen ad soyad + (varsa) daha önce doldurulmuş
  // alanlar. Önce oturum metadata'sından anında isim; sonra profilden düzeltme.
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
        if (p.ageRange && (AGE_RANGES as readonly string[]).includes(p.ageRange)) {
          setAgeIndex(AGE_RANGES.indexOf(p.ageRange as AgeRange));
          setAgeTouched(true);
        }
        if (p.gender === 'kadin' || p.gender === 'erkek') setGender(p.gender);
        if (p.playStyle === 'ciddi' || p.playStyle === 'taktiksel' || p.playStyle === 'rahat') setPlayStyle(p.playStyle);
        if (p.position && POSITION_CODE[p.position]) setPosition(POSITION_CODE[p.position]);
        if (isValidSelfSkill(p.selfSkill)) setSelfSkill(p.selfSkill as number);
      } catch {
        /* ön-dolum best-effort — hata akışı bozmaz */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ─── Konum: GERÇEK izin isteği (kayıt sonrası kullanıcı girişli) ───
  const startScan = useCallback(() => {
    if (phase !== 'idle') return;
    setPhase('scanning');
    const finish = (granted: boolean) => {
      setLocationGranted(granted);
      if (granted) {
        setPhase('found');
        timers.current.push(window.setTimeout(() => {
          setPhase('idle');
          setStep((s) => (s === 0 ? 1 : s));
        }, 1000));
      } else {
        setPhase('idle');
      }
    };
    if (!navigator.geolocation) { finish(false); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocationPermissionStatus('GRANTED');
        const uid = auth.currentUser?.uid;
        if (uid) {
          fbUpdateUserLocation(uid, pos.coords.latitude, pos.coords.longitude).catch((err) => {
            console.error('[onboarding] konum DB kaydı başarısız:', err);
          });
        }
        finish(true);
      },
      (err) => {
        console.warn('[onboarding] konum alınamadı:', err?.message);
        setLocationPermissionStatus('DENIED');
        showToast('Konum izni verilmedi. Dilersen sonra Ayarlar’dan açabilirsin.');
        finish(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }, [phase, setUserLocation, setLocationPermissionStatus]);

  const goStep1FromSkip = useCallback(() => setStep(1), []);

  // S8: ad soyad zorunlu. Kural shared/personName.ts'te tek kaynaktan gelir;
  // aynı kural kayıt formunda ve sunucudaki apply_onboarding'de de uygulanır.
  const nameCheck = validateFirstLast(firstName, lastName);

  const ctaEnabled = (() => {
    switch (step) {
      case 0: return phase === 'idle';
      case 1: return ageTouched;
      case 2: return nameCheck.valid;
      case 3: return playStyle !== '';
      case 4: return isValidSelfSkill(selfSkill);
      default: return false;
    }
  })();

  const ctaLabel = (() => {
    switch (step) {
      case 0: return phase === 'scanning' ? 'Taranıyor…' : 'Konumu Aç';
      case 1: return 'Devam Et';
      case 2: return 'Devam Et';
      case 3: return 'Devam Et';
      case 4: return 'Profili Tamamla';
      default: return '';
    }
  })();

  const handleCta = () => {
    if (!ctaEnabled) return;
    if (step === 0) { startScan(); return; }
    if (step === 4) { setDone(true); return; }
    setStep((s) => Math.min(4, s + 1));
  };

  const handleBack = () => {
    if (step === 0) return;
    setPhase('idle');
    setStep((s) => Math.max(0, s - 1));
  };

  // Yalnızca kullanıcının GERÇEKTEN onayladığı alanları taşır. Yaş yalnızca
  // seçici gerçekten dokunulduysa gönderilir → atlamada varsayılan yaş
  // yazılmaz. RPC forward-only olduğundan boş alanlar mevcut değeri silmez.
  const buildDraft = (): OnboardingDraft => ({
    ageRange: ageTouched ? AGE_RANGES[ageIndex] : '',
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    gender,
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
    try {
      await applyOnboarding(buildDraft(), true);
      onComplete();
    } catch (e) {
      console.error('[onboarding] tamamlama kaydı başarısız:', e);
      showToast('Profilin kaydedilemedi. Lütfen tekrar dene.');
      setSaving(false);
    }
  };

  // ─── ATLA: girilen kısmi veriyi yazar ama "tamamlandı" işaretlemez ───
  // S8 istisnası: ad soyad atlanamaz. Geçerli ad soyad yoksa "Atla" kullanıcıyı
  // uygulamaya sokmaz, ad/soyad adımına götürür. Diğer adımlar (yaş, cinsiyet,
  // pozisyon, oyun stili, konum) opsiyonel kalır.
  const handleSkip = async () => {
    if (saving) return;
    if (!nameCheck.valid) {
      setStep(2);
      showToast(nameCheck.reason ?? 'Devam etmek için ad ve soyadını gir.');
      return;
    }
    // Seviye beyanı da atlanamaz (ad-soyad kapısının ikizi). Sunucu ikizi
    // apply_onboarding'de SELF_SKILL_REQUIRED olarak durur; burada kullanıcıyı
    // hata yerine doğru adıma göndeririz.
    if (!isValidSelfSkill(selfSkill)) {
      setStep(4);
      showToast('Devam etmek için seviyeni seç.');
      return;
    }
    setSaving(true);
    try {
      // best-effort kısmi kayıt: boş alanlar sunucuda mevcut değeri silmez.
      await applyOnboarding(buildDraft(), false);
    } catch (e) {
      console.error('[onboarding] atlama kısmi kaydı başarısız:', e);
      // atlama kullanıcıyı bloke etmez — yine de devam ederiz
    } finally {
      onComplete();
    }
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
            {[0, 1, 2, 3, 4].map((seg) => (
              <span key={seg} style={{
                width: 30, height: 5, borderRadius: 3, transition: 'background 0.35s ease, box-shadow 0.35s ease',
                background: seg === step ? '#39FF14' : seg < step ? 'rgba(57,255,20,0.55)' : 'rgba(255,255,255,0.12)',
                boxShadow: seg === step ? '0 0 12px rgba(57,255,20,0.6)' : 'none',
              }} />
            ))}
          </div>
          {/* Atla — TÜM onboarding'i atlar: kısmi veri yazılır, profil "tamamlanmadı" kalır */}
          <button onClick={handleSkip} disabled={saving} style={{ width: 44, textAlign: 'right', fontSize: 12, fontWeight: 800, color: 'rgba(255,255,255,0.55)', background: 'none', border: 'none', cursor: saving ? 'default' : 'pointer' }}>
            Atla
          </button>
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
          {step === 2 && <StepName firstName={firstName} lastName={lastName} gender={gender} position={position} onFirst={setFirstName} onLast={setLastName} onGender={setGender} onPosition={setPosition} error={(firstName.trim() || lastName.trim()) && !nameCheck.valid ? nameCheck.reason ?? null : null} />}
          {step === 3 && <StepStyle style={playStyle} onChange={setPlayStyle} />}
          {step === 4 && <StepSkill value={selfSkill} onChange={setSelfSkill} />}
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
          ageRange={AGE_RANGES[ageIndex]}
          gender={gender}
          position={position}
          playStyle={playStyle}
          locationGranted={locationGranted}
          busy={saving}
          onStart={handleComplete}
          onBack={() => setDone(false)}
        />
      )}
    </div>
  );
};

export default Onboarding;
