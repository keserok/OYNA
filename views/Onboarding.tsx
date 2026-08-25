import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowLeft } from 'lucide-react';
import pitchBg from '../assets/onboarding/pitch-bg.webp';
import StepLocation, { type LocState } from './onboarding/StepLocation';
import StepAge from './onboarding/StepAge';
import StepName from './onboarding/StepName';
import StepStyle from './onboarding/StepStyle';
import StepSkill from './onboarding/StepSkill';
import { isValidSelfSkill } from '../utils/skillBand';
import PlayerCardReveal from './onboarding/PlayerCardReveal';
import {
  AGE_RANGES, AgeRange, Gender, OnboardingPosition, PlayStyle, OnboardingDraft,
  POSITION_CODE, splitFullName, isMinorAgeRange, clearOnboardingSkipped,
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
import { validateFirstLast } from '../shared/personName';

interface OnboardingProps {
  /** Onboarding TAMAMLANDI → çağıran uygulamaya/profile döner. Atlama yolu yoktur. */
  onComplete: () => void;
}



const KICKERS = ['ADIM 1 · KONUM', 'ADIM 2 · YAŞ', 'ADIM 3 · İSİM', 'ADIM 4 · STİL', 'ADIM 5 · SEVİYE'];
const TITLES = ['Konumunu ayarla.', 'Yaşını seç.', 'Sahne senin.', 'Nasıl oynarsın?', 'Kendini nasıl değerlendirirsin?'];
// IP-16 — her adım verinin NİYE istendiğini söyler. Eskiden yalnız konum
// adımında gerekçe vardı; kullanıcı yaşını ve adını niye verdiğini bilmiyordu.
// 5. adım (seviye) bu dalda eklendi; gerekçesi de aynı dille yazıldı.
const SUBTITLES = [
  'Sana en yakın sahaları ve maçları gösterebilmemiz için.',
  'Yaşına uygun maçlara denk gelmen için. Kimseye yaşın değil, yaş aralığın görünür.',
  'Maç kadrosunda bu adla ve bu mevkide görünürsün.',
  'Sahada nasıl oynadığını bilen takım arkadaşları bulmak için.',
  'Kadroda dengeli takımlar kurulsun diye. Ham puanın değil, yalnız seviye aralığın görünür.',
];
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
  const [phase, setPhase] = useState<LocState>('idle');
  // YAŞ KAPISI (17 Ağu 2026 — mağaza öncesi denetim).
  //
  // Eskiden çark "24-30"da başlıyor ve DOKUNULMADAN seçili sayılıyordu
  // (IP-16 · karar 4b). Gerekçesi UX'ti: "Devam Et ölü kalıyor, kullanıcı
  // neyi eksik yaptığını anlamıyor". Sonucu ise şuydu: 15 yaşındaki bir
  // kullanıcı hiçbir şeye dokunmadan YETİŞKİN olarak kaydediliyor; sunucudaki
  // reşit-olmayan kuralı yalnız '13-17' seçimine baktığı için `is_minor` ve
  // veli onayı akışı HİÇ tetiklenmiyordu. Yaş beyanı, uygulamanın kendi
  // koruma mekanizmasının tek girdisi — varsayılan kabul edilemez.
  //
  // Yeni kural: seçim NÖTR başlar, kullanıcı seçmeden ilerlenemez. 4b'nin UX
  // kaygısı korunur: çarkta hiçbir aralık "seçili" görünmez ve altındaki
  // satır Devam Et'in neden pasif olduğunu SÖYLER — yani kullanıcı sessiz bir
  // ölü düğmeyle değil, açık bir istekle karşılaşır.
  const [ageIndex, setAgeIndex] = useState<number | null>(null);
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
  // Özet ekranındaki kayıt hatası KALICI olmalı — 4 saniyelik bildirim yetmiyordu.
  const [completeError, setCompleteError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cikiliyor, setCikiliyor] = useState(false);
  const timers = useRef<number[]>([]);
  const { setUserLocation, setLocationPermissionStatus, setActiveRegion, activeRegion } = useAppStore();


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

  // ─── Konum: TEK yol (services/locationService) ────────────────────────────
  // Ayarlar ekranındaki (SettingsScreen.handleUpdateLocation) desenin aynısı.
  // Fark: burada başarısızlık ekranda KALICI olarak gösterilir ve bölge
  // `setActiveRegion` ile KAYDEDİLİR — eskiden izin verilse bile kapsam
  // uygulama kapanınca kayboluyor, "yakınındaki maçlar" bir daha açılmıyordu.
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
        // Kalıcı engel mi, bu seferlik ret mi? İkisi farklı çıkış gerektirir.
        const izin = await getLocationPermission().catch(() => 'denied' as const);
        setPhase(izin === 'blocked' ? 'blocked' : 'denied');
      } else if (kod === 'timeout') setPhase('timeout');
      else setPhase('unavailable');
      // Bildirim YOK: metin artık ekranda kalıcı duruyor, 4 saniyede kaybolan
      // bir uyarıyla aynı şeyi iki kez söylemeye gerek yok.
    }
  }, [phase, setUserLocation, setLocationPermissionStatus, setActiveRegion]);

  const goStep1FromSkip = useCallback(() => setStep(1), []);

  // S8: ad soyad zorunlu. Kural shared/personName.ts'te tek kaynaktan gelir;
  // aynı kural kayıt formunda ve sunucudaki apply_onboarding'de de uygulanır.
  const nameCheck = validateFirstLast(firstName, lastName);

  const ctaEnabled = (() => {
    switch (step) {
      case 0: return phase === 'idle';
      case 1: return ageIndex !== null;   // yaş beyanı ZORUNLU (varsayılan yok)
      case 2: return nameCheck.valid;
      case 3: return playStyle !== '';
      case 4: return isValidSelfSkill(selfSkill);
      default: return false;
    }
  })();

  // IP-16 · karar 5a: '13-17' seçimi sunucuda `is_minor` + veli onayı bekleyen
  // durum yazıyor; kullanıcı bunu ekranda hiçbir yerde görmüyordu.
  const recitDegil = ageIndex !== null && isMinorAgeRange(AGE_RANGES[ageIndex]);

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
    ageRange: ageIndex === null ? '' : AGE_RANGES[ageIndex],
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
    setCompleteError(null);
    try {
      await applyOnboarding(buildDraft(), true);
      // Tamamlandı: "atladım" bayrağı düşer, açılışta bir daha zorlanmaz.
      const uid = auth.currentUser?.uid;
      if (uid) clearOnboardingSkipped(uid);
      onComplete();
    } catch (e) {
      console.error('[onboarding] tamamlama kaydı başarısız:', e);
      // Hata ekranda KALIR. Eskiden tek geri bildirim 4 saniyede kaybolan bir
      // bildirimdi. Kullanıcının çıkışı iki tanedir ve ikisi de kalıcı:
      // "Tekrar Dene" ve geri okuyla son adıma dönmek. Kayıt tutmadan
      // uygulamaya giriş YOKTUR — profil eksik kalamaz (24 Ağu 2026).
      setCompleteError('Profilin kaydedilemedi. Bağlantını kontrol edip tekrar dene.');
      setSaving(false);
    }
  };

  // ─── ATLAMA YOLU YOK (kurucu kararı, 24 Ağustos 2026) ────────────────────
  // Eskiden üst barda bir "Atla" tuşu vardı ve TÜM kurulumu geçiyordu: profil
  // "tamamlanmadı" kalıyor, oyuncu kartı eksik açılıyordu. Tuş, zorunlu
  // alanlara (ad soyad · yaş · seviye) takıldığında kullanıcıyı ilgili adıma
  // geri gönderiyordu — yani ekranda "Atla" yazıyor ama çoğu zaman atlamıyordu.
  // Görünen söz ile yapılan iş birbirini tutmuyordu.
  //
  // Yeni kural: her adım doldurulur. Tercihe bağlı alanlar (cinsiyet, pozisyon)
  // ekranda "OPSİYONEL" etiketiyle durur ve boş bırakılabilir; konum ise bir
  // cihaz iznidir, adımın kendi "Konumsuz devam et" çıkışıyla geçilebilir
  // (mağaza kuralı: izin reddedilince uygulama çalışmaya devam etmeli).
  //
  // Zorunlu alanların kapısı TEK yerde: `ctaEnabled`. İkinci bir yol
  // açılmadığı sürece yaş beyanı da atlanamaz — mağazaların yaş
  // derecelendirmesi beyanı bu tek girdiye dayanıyor.

  // Kurulumu yarıda bırakıp çıkmak. Profil "tamamlanmadı" kalır; kullanıcı
  // tekrar girdiğinde buraya döner — ama artık uygulamanın dışına da,
  // Ayarlar'daki hesap silmeye de ulaşabilir.
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
          {/* ÇIKIŞ — "Atla"nın yerinde duran şey bu (24 Ağu 2026 denetimi).
              "Atla" kaldırılınca yerine hiçbir şey konmamıştı ve kurulum
              KAPANA dönüşmüştü: hesap kayıtta zaten açılıyor, kullanıcı her
              açılışta bu ekrana düşüyor, ama yaşını/adını vermek istemiyorsa
              uygulamadan çıkmanın ya da hesabını silmenin hiçbir yolu yoktu.
              Apple 5.1.1(v) hesabın uygulama İÇİNDEN silinebilmesini şart
              koşar; silme ekranına giden tek yol ise Ayarlar'dır.
              Çıkış, zorunlu alanları GEVŞETMEZ — yalnız kapıyı açık tutar. */}
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
          {/* IP-16: dört adımın yalnız konum adımında gerekçe vardı; kullanıcı
              yaşını/adını niye verdiğini bilmiyordu. */}
          <p style={{ fontSize: 12.5, lineHeight: 1.5, color: 'rgba(255,255,255,0.55)', margin: '8px auto 0', maxWidth: 290 }}>
            {SUBTITLES[step]}
          </p>
          {step === 1 && recitDegil && (
            <p role="status" style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.5, color: '#FACC15', margin: '10px auto 0', maxWidth: 290 }}>
              18 yaşından küçüksen maçlara katılabilmen için veli onayı gerekiyor.
              Kurulumdan sonra bunu isteyeceğiz.
            </p>
          )}
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
          ageRange={ageIndex === null ? '' : AGE_RANGES[ageIndex]}
          gender={gender}
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
