import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Check, Phone, ArrowRight, ChevronLeft, KeyRound, Users, ChevronDown, CheckCircle2 } from 'lucide-react';
import { UserRole } from '../types';
import {
  loginWithGoogle, loginWithApple, sendPhoneOtp, verifyPhoneOtp, demoLogin,
  isDemoLoginEnabled, isDemoLoginInput, isDemoAccountPickerEnabled, loginDemoAccount,
  oauthDonusunuOku,
} from '../supabaseAuth';
import { DEMO_ACCOUNT_GROUPS } from '../data/demoAccounts';
import { useAppStore } from '../store';
import { makeManualLocation } from '../utils/regionResolver';
import {
  DEFAULT_DIAL_CODE, checkPhone, formatPhoneInput, formatPhoneDisplay,
  canSendOtpTo, otpKapaliSebebi, TELEFON_GIRISI_ACIK,
} from '../shared/phone';
// IP-15: yasal belgeler artık ÖZET değil TAM metin (karar 7b) — 39 KB. Statik
// import edilirse giriş paketine girer ve belgeyi hiç açmayan kullanıcı da
// indirir. Modal yalnız bağlantıya dokununca yüklenir; tip import'u derlemede
// silindiği için paketi etkilemez.
const LegalModal = lazy(() =>
  import('../components/common/LegalModal').then((m) => ({ default: m.LegalModal })));
import type { LegalModalKind } from '../components/common/LegalModal';
// Klavye örtüşmesinin TEK kaynağı: ölçüm de kural da orada yazılı, burada
// ikinci bir ölçüm yapılmaz (bkz. components/common/Toast.tsx).
import { useKlavyeOrtusu, klavyeliAltDolgu } from '../components/common/Toast';
import heroEmblem from '../assets/auth/hero-emblem.webp';
import oynaLogo from '../assets/onboarding/oyna-logo.webp';
import { mapAuthError, mapOAuthDonusu } from '../utils/errorMap';
// Alan/buton dili PhoneLinkScreen ile ORTAK — tek kaynak.
import { AUTH_FIELD_CSS } from './authFieldStyles';

interface AuthScreenProps {
  /** App tarafından geçilir ama BİLEREK çağrılmaz: başarı sonrası yönlendirmeyi
      App'teki onAuthStateChanged dinleyicisi yapar (profildeki GERÇEK role göre).
      Buradan çağrılırsa kaleci/hakem/tesis yanlışlıkla oyuncu paneline düşerdi. */
  onSuccess: () => void;
  onBack: () => void;
  role?: UserRole | null;
}

// ─── Akış ────────────────────────────────────────────────────────────────────
// SPLASH (ilk animasyon) → [intro → input → otp] → ONBOARDING
//   intro : cam amblem perdesi + "İSTEDİĞİN ZAMAN oyna!" tanıtımı
//   input : TELEFON NUMARASI (+ ikincil yollar: Google · Apple)
//   otp   : numaraya gelen 6 haneli kod
//
// TEK YOL (kurucu kararı, 17 Ağustos 2026): telefon ANA giriş yöntemidir.
// "Giriş yap / Kayıt ol" ayrımı KALDIRILDI — numarası olmayan biri kod
// isteyince hesabı zaten açılır; kullanıcıya iki sekme göstermek yapay bir
// seçim yaratıyordu. Şifre, e-posta ile giriş ve "şifremi unuttum" akışları da
// kaldırıldı; ad soyad artık onboarding'in kendi adımında sorulur.
// Misafir gezinme ("önce göz at") de kapatıldı — kurucu kararı.
type Stage = 'intro' | 'input' | 'otp';

// Tanıtım, giriş akışının GİRİŞ KAPISI: uygulama oturumunda AUTH ilk kez
// göründüğünde (splash'ten hemen sonra) açılır. Aynı oturumda AUTH'a yeniden
// düşülürse (çıkış, süresi dolmuş oturum) doğrudan forma gelinir — kullanıcı
// tanıtımı ikinci kez izlemez. Geri tuşuyla her zaman tanıtıma dönülebilir.
let introShownThisSession = false;

// Vurgu rengi role göre uyarlanır (sağlayıcı çıkış yapıp geri geldiğinde kendi
// rengiyle karşılanır); yeni kayıt akışının varsayılanı tasarımdaki sarıdır.
const THEMES: Record<string, { color: string; light: string }> = {
  [UserRole.GOALKEEPER]: { color: '#39FF14', light: '#7CFF5A' },
  [UserRole.REFEREE]: { color: '#FF3333', light: '#FF6B6B' },
  [UserRole.OWNER]: { color: '#3388FF', light: '#6BA8FF' },
  default: { color: '#FACC15', light: '#FFD700' },
};

const getTheme = (role?: UserRole | null) => (role && THEMES[role]) || THEMES.default;

// Perde yüksekliği: tasarımdaki 448/874 ≈ %52 oranı. `100% - 322px` terimi kısa
// ekranlarda (iPhone SE 320×568) perdenin tanıtım metnine/oka yer bırakmasını
// garanti eder — aksi hâlde alttaki ok düğmesi ekran dışına taşıyordu.
const CURTAIN = 'clamp(200px, min(52%, 100% - 322px), 460px)';
// Sarkaç şeridi: uzun ekranda tasarımdaki 82px, kısa ekranda daralır.
const PENDULUM_H = 'clamp(60px, 11vh, 82px)';
// Tanıtım başlığı — iki satır TEK parça kalsın diye genişlikle ölçekler (bkz. aşağıdaki not).
const INTRO_TITLE_SIZE = 'clamp(24px, 8.5vw, 38px)';

const KEYFRAMES = `
@keyframes auFloat { 0% { transform: translate(0,0) scale(1); } 33% { transform: translate(5%,10%) scale(1.1); } 66% { transform: translate(-5%,5%) scale(.9); } 100% { transform: translate(0,-5%) scale(1.05); } }
@keyframes auFadeBlur { from { opacity: 0; filter: blur(8px); } to { opacity: 1; filter: blur(0); } }
@keyframes auScaleIn { from { opacity: 0; transform: scale(1.04); filter: blur(10px); } to { opacity: 1; transform: scale(1); filter: blur(0); } }
@keyframes auSheet { from { transform: translateY(76%); } to { transform: translateY(0); } }
/* Tanıtımdan giriş ekranına "itme" (push) geçişi — iOS'taki gibi: gelen ekran
   sağdan tam ekran girer, giden ekran sola kayıp söner. Süre ve eğri iOS'un
   kendi navigasyon geçişiyle aynı his verecek şekilde seçildi. */
@keyframes auPushIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
@keyframes auPushOut { from { transform: translateX(0); opacity: 1; } to { transform: translateX(-26%); opacity: 0; } }
@keyframes auSweep { 0%, 52% { opacity: 0; transform: translateX(-140px) skewX(-14deg); } 66% { opacity: 1; } 100% { opacity: 0; transform: translateX(100%) skewX(-14deg); } }
@keyframes auSwing { from { transform: translateX(0); } to { transform: translateX(calc(100% - 56px)); } }
@keyframes auSpinLogo { from { transform: rotate(0deg); } to { transform: rotate(342deg); } }
@keyframes auToast { from { opacity: 0; transform: translateY(-18px) scale(.94); } to { opacity: 1; transform: translateY(0) scale(1); } }

/* Alanlar: yükseklik 58px (rahat dokunma), yumuşak köşe, odakta marka rengiyle
   ince bir halka. Odak halkası kenarlığı kalınlaştırmaz — kutu titremesin. */
/* Metin 16px: iOS'ta bundan küçük yazı alanına dokununca Safari sayfayı
   otomatik yakınlaştırır ve düzen bozulur. Güven veren okunaklılık da bu boyutta. */
/* Alan başlığı — küçük, harf aralıklı, sakin. Formu "okunur" hâle getirir. */
.au-social { flex: 1; height: 54px; border-radius: 999px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 9px; background: rgba(22,27,34,.55); border: 1px solid rgba(255,255,255,.08); color: #fff; font-size: 13px; font-weight: 700; transition: background .3s cubic-bezier(.16,1,.3,1), border-color .3s, transform .3s cubic-bezier(.16,1,.3,1); }
.au-social:hover:not(:disabled) { background: rgba(30,36,45,.8); border-color: rgba(255,255,255,.15); transform: translateY(-2px); }
.au-social:active:not(:disabled) { transform: scale(.97); }
.au-social:disabled { opacity: .55; cursor: default; }
.au-iconbtn { width: 40px; height: 40px; border-radius: 50%; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,.07); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); color: #fff; transition: background .2s, transform .2s; }
.au-iconbtn:hover { background: rgba(255,255,255,.14); }
.au-iconbtn:active { transform: scale(.95); }
.au-next { width: 64px; height: 64px; border-radius: 50%; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; color: #0A0E14; transition: box-shadow .35s cubic-bezier(.16,1,.3,1), transform .35s cubic-bezier(.16,1,.3,1); }
.au-next:hover { transform: translateY(-2px); }
.au-next:active { transform: scale(.96); }
.au-footlink { background: none; border: none; padding: 0; cursor: pointer; font-size: 10px; font-weight: 600; color: #59636e; text-decoration: underline; text-underline-offset: 3px; }
.au-footlink:hover { color: #8B949E; }
`;

const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

// Pendulum: aynı logonun üç kopyası — iki kırınım hayaleti + asıl top.
const PENDULUM = [
  { delay: '-.26s', opacity: 0.28, filter: 'blur(7px) hue-rotate(-55deg) saturate(2.4)' },
  { delay: '-.13s', opacity: 0.4, filter: 'blur(3.5px) hue-rotate(60deg) saturate(2.2)' },
  { delay: '0s', opacity: 1, filter: 'drop-shadow(0 0 14px rgba(250,204,21,.5))' },
];

const AuthScreen: React.FC<AuthScreenProps> = ({ onBack, role }) => {
  const { color, light } = getTheme(role);
  const ctaGradient = `linear-gradient(120deg, ${color} 0%, ${light} 100%)`;

  // ── Sağlayıcı dönüşü İLK RENDER'DAN ÖNCE okunur ───────────────────────────
  // Web'de Google/Apple girişi tam sayfa yönlendirmesidir; dönüş oturumsuzsa
  // uygulama sıfırdan açılır. O açılışta tanıtım ekranı gösterilirse kullanıcı
  // "uygulama beni attı, başka bir ekrana düştüm" diye okur. Bu yüzden dönüş
  // varsa TANITIM ATLANIR: aynı telefon ekranına, sebebi yazılı olarak dönülür.
  // useState'in tembel biçimi kullanılır — okuma (ve adres temizliği) bir kez.
  const [oauthDonusu] = useState(() => oauthDonusunuOku());

  const [stage, setStage] = useState<Stage>(
    (oauthDonusu || introShownThisSession) ? 'input' : 'intro');
  // Tanıtım → giriş "itme" geçişi: iki ekran kısa süre BİRLİKTE durur; gelen
  // sağdan girerken giden sola kayar. Tek ekran anında değişseydi hareket
  // kesik görünürdü. Süre CSS'teki .42sn ile aynı tutulur.
  const [pushing, setPushing] = useState(false);
  const gecisSure = 420;
  // Sayaç ref'te tutulur ve ekran kapanırsa temizlenir: aksi hâlde kullanıcı
  // geçiş sürerken geri giderse, kapanmış bileşende durum güncellenmeye çalışılır.
  const gecisSayaci = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (gecisSayaci.current) clearTimeout(gecisSayaci.current); }, []);
  const introdanDevamEt = () => {
    setPushing(true);
    setStage('input');
    if (gecisSayaci.current) clearTimeout(gecisSayaci.current);
    gecisSayaci.current = setTimeout(() => setPushing(false), gecisSure);
  };
  // Kayıt/giriş ayrımı KALDIRILDI: telefonla tek akış var. `authStartMode`
  // bayrağı (kayıt kapısından "kaydol"a mı "giriş"e mi basıldığı) artık ekranın
  // görünümünü değiştirmiyor, ama kapı onu hâlâ yazıyor — okunup TEMİZLENİR ki
  // bir sonraki açılış eski bir niyetle karşılaşmasın.
  useEffect(() => { useAppStore.getState().setAuthStartMode(null); }, []);
  // Ülke kodu ayrı tutulur: Türkiye varsayılan, diğer ülkeler elle yazılabilir
  // (bayrak listesi YOK — kurucu kararı: sade kalsın).
  const [dial, setDial] = useState(DEFAULT_DIAL_CODE);
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  // Yasal onay OPT-IN olmalı: kutu önceden işaretli gelemez (KVKK/mağaza incelemesi)
  const [agreed, setAgreed] = useState(false);
  const [isLoading, setIsLoading] = useState<
    'send' | 'verify' | 'google' | 'apple' | null
  >(null);
  const [error, setError] = useState<string | null>(
    oauthDonusu ? mapOAuthDonusu(oauthDonusu.saglayici, oauthDonusu.kod, oauthDonusu.aciklama) : null);
  const [info, setInfo] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  // IP-15: anahtarlar artık resmi belge anahtarları — modal tam metni
  // shared/legalDocs.ts'ten okur, Ayarlar → Yasal ile birebir aynı.
  const [openModal, setOpenModal] = useState<LegalModalKind | null>(null);
  // Demo hesap seçici (main'de aktif): açık/kapalı + o an giriş yapılan hesap
  const [demoPickerOpen, setDemoPickerOpen] = useState(false);
  const [demoLoggingIn, setDemoLoggingIn] = useState<string | null>(null);

  // Bu ekranın kökü `fixed inset-0` — yani PENCEREYE tutunur, kabuğa (body) DEĞİL.
  // iOS'ta klavye açılınca body kısalır ve `--kb-height` haklı olarak 0 olur;
  // pencere kısalmadığı için form alanları klavyenin ARKASINDA kalıyordu.
  // Doğru pay, --kb-height ile pencereye göre ÖLÇÜLEN örtüşmenin büyüğüdür.
  const klavyeOrtusu = useKlavyeOrtusu();

  // Dev/demo modunda numara alanına demo hesabın kısa adı ("mirackerem")
  // yazılabilir; prod pakette bu yol kapalıdır (isDemoLoginEnabled).
  const demoMode = isDemoLoginEnabled();
  // DERLEME ZAMANI KAPISI (22 Ağu 2026 — Apple 5.6).
  // `isDemoAccountPickerEnabled()` bir FONKSİYON çağrısıdır; paketleyici onu
  // katlayamaz ve seçicinin tüm arayüzü — "DEMO HESABIYLA GİR" yazısı dahil —
  // ölü kod olarak yayın paketine giriyordu. Bir incelemeci paketi açtığında
  // orada duran bu düğme, 5.6'da "gizlenmiş özellik" iddiasını haklı çıkarır.
  // `import.meta.env.X` ise derlemede HARFİ HARFİNE değere çevrilir; aşağıdaki
  // karşılaştırma yayın paketinde `false` sabitine düşer ve Rollup blokla
  // birlikte katalogu da atar. Ölçüsü: `npm run magaza:denetim` artık pakette
  // "DEMO HESABIYLA GİR" görürse ENGEL veriyor.
  const DEMO_SECICI_DERLENSIN = import.meta.env.VITE_DEMO_ACCOUNTS === 'true';
  const showDemoPicker = DEMO_SECICI_DERLENSIN
    && isDemoAccountPickerEnabled() && DEMO_ACCOUNT_GROUPS.length > 0;
  const phoneCheck = checkPhone(phone, dial);
  const demoInput = demoMode && isDemoLoginInput(phone);
  const contactValid = phoneCheck.valid || demoInput;
  const contactLabel = phoneCheck.e164 ? formatPhoneDisplay(phoneCheck.e164) : 'numaran';
  // Yurt dışı numara: WhatsApp kanalı açılana dek kod gönderemiyoruz.
  const kanalKapali = !demoInput && !!dial && !canSendOtpTo(dial);

  // Tanıtım bir kez görüldü: aynı oturumda AUTH'a tekrar düşülürse atlanır.
  useEffect(() => { introShownThisSession = true; }, []);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setInterval(() => setResendIn((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(t);
  }, [resendIn]);

  const requestOtp = async () => {
    // Numara E.164'e çevrilmiş hâlde gider (+905321234567). Doğrulama kuralı
    // shared/phone.ts'te; sunucudaki ikizi de aynı biçimi bekler.
    await sendPhoneOtp(phoneCheck.e164!);
  };

  const handleSendOtp = async () => {
    // Buton form eksikken de CANLI durur; dokununca eksik olan TEK şeyi söyler.
    // (Sessizce pasif buton, kullanıcıya "bozuk" hissettiriyordu.)
    if (isLoading) return;
    if (!contactValid) { setError(phoneCheck.reason ?? 'Telefon numaranı gir.'); return; }
    if (!requireAgreement()) return;
    setError(null);
    // Dev/demo modu: numara alanına demo kısayolu ("mirackerem") yazılırsa
    // kodsuz anında giriş. onSuccess() ÇAĞIRMA: o anda yerel `role` hâlâ eski
    // (PLAYER) olduğundan tesis sahibini yanlışlıkla oyuncu ekranına atar.
    // Navigasyonu App'teki onAuthStateChanged dinleyicisi yapar (gerçek role göre).
    if (demoInput) {
      setIsLoading('send');
      try {
        await demoLogin(phone.trim());
        // navigasyonu auth dinleyicisine bırak (rol-doğru yönlendirme)
      } catch (err: any) {
        console.error('Demo giriş hatası:', err);
        setError(mapAuthError(err, 'Demo giriş başarısız.'));
        setIsLoading(null);
      }
      return;
    }
    // Yurt dışı numara: WhatsApp kanalı açılana dek kod gönderilemiyor.
    // Ölü uç bırakma — ne yapabileceğini söyle: Google/Apple ile giren
    // kullanıcı numarasız da uygulamayı gezebilir (telefon adımı atlanabilir).
    if (kanalKapali) {
      setError(otpKapaliSebebi(dial) ?? 'Şu an bu numaraya kod gönderemiyoruz. Google veya Apple ile devam edebilirsin.');
      return;
    }
    setIsLoading('send');
    try {
      await requestOtp();
      setStage('otp');
      setOtp('');
      setResendIn(60);
    } catch (err: any) {
      console.error('OTP gönderim hatası:', err);
      setError(mapAuthError(err, 'Doğrulama kodu gönderilemedi. Lütfen tekrar deneyin.'));
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
      setInfo('Yeni kod gönderildi.');
    } catch (err: any) {
      setError(mapAuthError(err, 'Kod tekrar gönderilemedi.'));
    } finally {
      setIsLoading(null);
    }
  };

  const handleVerify = async () => {
    if (otp.length < 6 || isLoading) return;
    setError(null);
    setIsLoading('verify');
    try {
      await verifyPhoneOtp(phoneCheck.e164!, otp);
      // onSuccess() ÇAĞIRMA: yerel `role` hâlâ eski (PLAYER) olduğundan kaleci/
      // hakem/tesis'i yanlışlıkla oyuncu Dashboard'ına düşürür. Navigasyonu App'teki
      // onAuthStateChanged dinleyicisine bırak (profildeki GERÇEK role göre yönlendirir).
      // Spinner, dinleyici doğru panele yönlendirip bu ekranı kaldırana dek döner.
    } catch (err: any) {
      console.error('OTP doğrulama hatası:', err);
      setError(mapAuthError(err, 'Kod hatalı veya süresi dolmuş.'));
      setIsLoading(null);
    }
  };

  // KVKK/Sözleşme onayı işaretli değilken butonlar SESSİZCE pasif kalmasın:
  // dokununca ne yapılması gerektiği açıkça söylenir ("hiçbir şey olmuyor" hissi biter).
  function requireAgreement(): boolean {
    if (agreed) return true;
    setError("Devam etmek için KVKK Aydınlatma Metni'ni ve Kullanım Şartları'nı onayla.");
    return false;
  }

  // Açılır pencere yolunun iki özel sonucu (supabaseAuth · webOAuthAc):
  //   OAUTH_PENCERE_KAPANDI → kullanıcı vazgeçti. Bu bir HATA DEĞİLDİR;
  //     kırmızı uyarı basmak, yaptığı şeyi yanlışmış gibi sunmak olur.
  //   OAUTH_ZAMAN_ASIMI     → pencere açık kaldı ama oturum gelmedi.
  // Ham kodu ekrana taşımayız; kullanıcı ne yapacağını okur.
  const saglayiciHatasi = (err: any, saglayici: string): string | null => {
    const m = String(err?.message ?? err);
    if (m.includes('OAUTH_PENCERE_KAPANDI')) return null;
    if (m.includes('OAUTH_ZAMAN_ASIMI')) {
      return 'Giriş tamamlanmadı. Pencereyi kapatıp tekrar dener misin?';
    }
    return mapAuthError(err, `${saglayici} ile giriş başarısız.`);
  };

  const handleGoogleLogin = async () => {
    if (isLoading) return;
    if (!requireAgreement()) return;
    setError(null);
    setIsLoading('google');
    try {
      await loginWithGoogle();
      // Native'de sistem tarayıcısı açıldı; oturum deep link dönüşünde açılır ve
      // navigasyonu global auth dinleyicisi yapar. Web'de sayfa yönlenir.
    } catch (err: any) {
      console.error('[Auth] Google hatası:', err);
      setError(saglayiciHatasi(err, 'Google'));
    } finally {
      setIsLoading(null);
    }
  };

  const handleAppleLogin = async () => {
    if (isLoading) return;
    if (!requireAgreement()) return;
    setError(null);
    setIsLoading('apple');
    try {
      await loginWithApple();
      // Navigasyonu global auth listener'a bırak (Google ile aynı yol);
      // onSuccess() burada da çağrılırsa çifte yönlendirme/flaş oluşur.
    } catch (err: any) {
      console.error('[Auth] Apple hatası:', err);
      setError(saglayiciHatasi(err, 'Apple'));
    } finally {
      setIsLoading(null);
    }
  };

  // ─── Demo hesabıyla tek-dokunuşla giriş ────────────────────────────────────
  // Navigasyonu (Google/e-posta girişinde olduğu gibi) App'teki
  // onAuthStateChanged dinleyicisine bırakırız: profildeki GERÇEK role göre
  // doğru panele (oyuncu/tesis/kaleci/hakem) yönlendirir.
  // DEMO GİRİŞTE BÖLGE HAZIR GELİR (kurucu kararı, 20 Ağu 2026).
  //
  // NEDEN: keşif kapsamı (maçlar/sahalar) seçili bölgeden ya da GPS'ten gelir;
  // ikisi de yoksa ana sayfa "ÖNCE BÖLGENİ SEÇ" der ve ekran BOŞ görünür.
  // Demo hesapla giren biri — özellikle mağaza incelemecisi — konum iznini
  // reddederse uygulamayı "içi boş" sanır. Demo ekosistemin tamamı Ordu'da
  // olduğundan, demo girişinde kapsamı Ordu/Altınordu'ya kurmak ekranı ilk
  // saniyede dolduruyor.
  //
  // YALNIZ BOŞSA yazar: kullanıcı kendi bölgesini seçtiyse ona dokunulmaz.
  const demoBolgesiniHazirla = () => {
    const store = useAppStore.getState();
    if (store.selectedRegions.length > 0) return;
    const bolge = makeManualLocation('Ordu', 'Altınordu', Date.now());
    store.addSelectedRegion(bolge);
    if (bolge.coordinates && !store.userLocation) store.setUserLocation(bolge.coordinates);
  };

  const handleDemoAccountLogin = async (emailAddr: string, pass: string) => {
    if (isLoading || demoLoggingIn) return;
    if (!requireAgreement()) return;
    setError(null);
    setInfo(null);
    setDemoLoggingIn(emailAddr);
    try {
      demoBolgesiniHazirla();
      await loginDemoAccount(emailAddr, pass);
      // navigasyon auth dinleyicisinde
    } catch (err: any) {
      console.error('[Auth] Demo hesap girişi hatası:', err);
      setError(mapAuthError(err, 'Demo hesabıyla giriş başarısız.'));
      setDemoLoggingIn(null);
    }
  };

  // MİSAFİR MODU KALDIRILDI (kurucu kararı, 17 Ağu 2026): "önce göz at" yolu
  // kapatıldı. Uygulamaya girmek için hesap gerekiyor; kayıt zaten tek ekranda
  // ve numarayla bitiyor, o yüzden ayrı bir "vitrin" moduna gerek kalmadı.

  const clearFeedback = () => { setError(null); setInfo(null); };

  const handleHeaderBack = () => {
    if (stage === 'otp') {
      setStage('input');
      setOtp('');
      clearFeedback();
    } else if (stage === 'input') {
      // Alt sayfadan tanıtıma dön (tasarımdaki geri davranışı).
      setStage('intro');
      clearFeedback();
    } else {
      onBack();
    }
  };

  // ─── TELEFON ALANI: TEK ÖLÇÜ, İSTİSNASIZ (22 Ağustos 2026, ikinci tur) ────
  // Kapı önce `TELEFON_GIRISI_ACIK || demoMode` idi. Hata buydu: `demoMode`
  // bir GELİŞTİRİCİ bayrağıdır (VITE_DEV_MODE) ve Vercel önizlemesinde açık.
  // Sonuç, kurucunun bildirdiği hata: önizlemede giriş ekranı hâlâ numara
  // istiyordu — üstelik o numaraya kod GÖNDERİLEMİYOR (SMS sağlayıcısı yok).
  //
  // KURAL: çalışamayacak bir giriş yolu HİÇBİR bayrakla ekrana gelmez.
  // Geliştirme kolaylığı, kullanıcıya ölü bir alan göstermeyi haklı çıkarmaz.
  // Demo erişimi ayrı ve doğru kapıdan olur: `VITE_DEMO_ACCOUNTS` ile açılan
  // demo hesap seçicisi (aşağıda). O seçici gerçek bir yolla giriş yapar.
  const telefonYoluVar = TELEFON_GIRISI_ACIK;
  const authReady = agreed && contactValid && !kanalKapali;
  const otpReady = otp.length === 6;
  const busy = isLoading !== null || demoLoggingIn !== null;
  const ctaLabel = 'KOD GÖNDER';
  const ctaBusy = isLoading === 'send';
  const codeBusy = isLoading === 'verify';

  // Devre dışı görünüm: onay/alanlar eksikken buton sönük ama TIKLANABİLİR kalır
  // (dokununca eksik olanı söyler). Yükleme sırasında gerçekten kilitlenir.
  // IP-15: buton SESSİZCE pasif kalmaz. Eskiden form eksikken grileşiyordu ve
  // dokunulduğunda hiçbir şey söylemiyordu; kullanıcı hangi alanın eksik
  // olduğunu tahmin etmek zorundaydı. Artık buton canlı görünür, dokununca
  // handler eksik olan TEK şeyi söyler. `ready` yalnız hafif bir vurgu farkı.
  const ctaStyle = (ready: boolean): React.CSSProperties => ({
    background: ctaGradient,
    color: '#0A0E14',
    boxShadow: ready
      ? `0 0 20px 0 ${color}57, inset 0 1px 0 rgba(255,255,255,.28)`
      : 'inset 0 1px 0 rgba(255,255,255,.28)',
    opacity: ready ? 1 : 0.72,
  });

  const spinner = <span className="au-spin" aria-hidden="true" />;

  // ─── Ortak alt sayfa başlığı (geri + OYNA amblemi) ──────────────────────────
  // `marka=false` → yalnız geri tuşu. Giriş/kayıt ekranında amblem+OYNA yazısı
  // hemen altındaki büyük başlıkla yineleme yaratıyordu; kaldırılınca ekran
  // sakinleşti. Kod doğrulama / şifre sıfırlama ekranlarında marka DURUYOR:
  // oralarda büyük başlık yok, kullanıcı hangi uygulamada olduğunu görmeli.
  const sayfaBasligi = (marka: boolean) => (
    <div style={{
      position: 'absolute', top: 'calc(var(--safe-top, 0px) + 18px)', left: 0, right: 0,
      display: 'flex', alignItems: 'center', padding: '0 22px', zIndex: 5,
    }}>
      <button type="button" className="au-iconbtn" onClick={handleHeaderBack} aria-label="Geri git">
        <ChevronLeft size={20} strokeWidth={2.4} />
      </button>
      {marka && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, marginRight: 40 }}>
          <img src={oynaLogo} alt="" style={{ width: 30, height: 30, filter: 'brightness(1.15) drop-shadow(0 0 9px rgba(250,204,21,.55))' }} />
          <span style={{ fontSize: 19, fontWeight: 900, fontStyle: 'italic', color: '#fff' }}>OYNA</span>
        </div>
      )}
    </div>
  );
  const sheetHeader = sayfaBasligi(true);

  return (
    // Odak halkası ve seçici, rolün marka rengini CSS değişkeninden okur —
    // renk tek yerden gelir, her alana tek tek yazılmaz.
    <div
      className="fixed inset-0 overflow-hidden select-none"
      style={{
        background: '#0A0E14',
        ['--au-accent' as string]: color,
        ['--au-accent-soft' as string]: `${color}24`,
      } as React.CSSProperties}
    >
      <style>{AUTH_FIELD_CSS}{KEYFRAMES}</style>

      <div style={{
        position: 'relative', height: '100%', width: '100%', maxWidth: 448, margin: '0 auto',
        overflow: 'hidden', fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
      }}>
        {/* ── Ambient mesh ──
            Taşan küreler KENDİ kırpma kutusunda durur: aksi hâlde dış sarmalayıcının
            scrollHeight'ini büyütüp (overflow:hidden bile olsa programatik olarak
            kaydırılabilir) alana odaklanınca tüm katmanı yukarı kaydırıyorlardı. */}
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
          <div style={{
            position: 'absolute', top: '-14%', left: '-22%', width: 300, height: 300, borderRadius: '50%',
            background: `radial-gradient(circle, ${color}24 0%, rgba(10,14,20,0) 70%)`,
            filter: 'blur(30px)', animation: 'auFloat 20s ease-in-out infinite alternate',
          }} />
          <div style={{
            position: 'absolute', bottom: '-12%', right: '-24%', width: 340, height: 340, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(10,60,40,.55) 0%, rgba(10,14,20,0) 70%)',
            filter: 'blur(44px)', animation: 'auFloat 27s ease-in-out infinite alternate-reverse',
          }} />
        </div>

        {/* ── Kalıcı hero perdesi: cam amblem + karartma geçişi ── */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: CURTAIN, overflow: 'hidden', pointerEvents: 'none' }}>
          <img
            src={heroEmblem}
            alt=""
            aria-hidden="true"
            style={{
              position: 'absolute', top: '6%', left: '50%', height: '96%', width: 'auto', maxWidth: 'none',
              transform: 'translateX(-58%)', mixBlendMode: 'screen',
            }}
          />
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(180deg,rgba(10,14,20,.6) 0%,rgba(10,14,20,0) 22%,rgba(10,14,20,0) 46%,rgba(10,14,20,.06) 55%,rgba(10,14,20,.18) 63%,rgba(10,14,20,.36) 71%,rgba(10,14,20,.57) 78%,rgba(10,14,20,.76) 85%,rgba(10,14,20,.9) 91%,rgba(10,14,20,.98) 97%,#0A0E14 100%)',
          }} />
        </div>

        {/* ═══ TANITIM ═══ */}
        {(stage === 'intro' || pushing) && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            // Geçiş sırasında tanıtım ekranı sola kayarak çıkar; o an dokunuşa
            // kapatılır ki kullanıcı çıkmakta olan ekranın tuşuna basamasın.
            animation: pushing
              ? `auPushOut ${gecisSure}ms cubic-bezier(.32,.72,0,1) both`
              : 'auScaleIn .6s cubic-bezier(.22,1,.36,1) both',
            pointerEvents: pushing ? 'none' : undefined,
          }}>
            <div style={{ height: CURTAIN, flexShrink: 0 }} />

            {/* Perde üzerinde gezen ışık süpürmesi */}
            <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
              <div style={{
                position: 'absolute', inset: 0,
                animation: 'auSweep 5.4s linear infinite',
                maskImage: 'linear-gradient(to bottom,transparent 0,#000 9%,#000 93%,transparent 100%)',
                WebkitMaskImage: 'linear-gradient(to bottom,transparent 0,#000 9%,#000 93%,transparent 100%)',
              }}>
                <div style={{
                  position: 'absolute', left: 0, top: 0, bottom: 0, width: 130,
                  background: 'linear-gradient(to right,transparent 0%,rgba(255,255,255,.05) 30%,rgba(255,255,255,.17) 50%,rgba(255,255,255,.05) 70%,transparent 100%)',
                }} />
              </div>
            </div>

            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 22,
              padding: '0 26px calc(var(--safe-bottom, 0px) + 40px)', position: 'relative',
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 26, flexShrink: 0, animation: 'auFadeBlur .6s cubic-bezier(.22,1,.36,1) .08s both' }}>
                <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.3em', textTransform: 'uppercase', color: '#8B949E' }}>
                  ANINDA MAÇ BUL!
                </span>
                {/* Ölçüm: "İSTEDİĞİN ZAMAN" genişliği ≈ 9.69 × font-size; kullanılabilir
                    alan = ekran − 52px yatay dolgu. 8.5vw her telefon genişliğinde tek
                    satıra sığar, 38px tavanı da geniş ekranda kapsayıcıyı taşırmaz. */}
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: INTRO_TITLE_SIZE, lineHeight: 1.02, fontWeight: 900, fontStyle: 'italic', textTransform: 'uppercase', letterSpacing: '-.03em', color: '#fff', whiteSpace: 'nowrap' }}>
                    İSTEDİĞİN ZAMAN
                  </span>
                  <span style={{ fontSize: INTRO_TITLE_SIZE, lineHeight: 1.02, fontWeight: 900, fontStyle: 'italic', textTransform: 'uppercase', letterSpacing: '-.03em', color, textShadow: `0 0 22px ${color}80`, whiteSpace: 'nowrap' }}>
                    oyna!
                  </span>
                </div>
              </div>

              {/* Kırınımlı sarkaç — top ipin üzerinde gider gelir */}
              <div style={{ position: 'relative', height: PENDULUM_H, flexShrink: 0, overflow: 'hidden', animation: 'auFadeBlur .6s cubic-bezier(.22,1,.36,1) .2s both' }}>
                <div style={{ position: 'absolute', left: 6, right: 6, top: '50%', height: 1, background: 'linear-gradient(90deg,transparent,rgba(255,255,255,.12) 20%,rgba(255,255,255,.12) 80%,transparent)' }} />
                {PENDULUM.map((p, i) => (
                  <div key={i} style={{ position: 'absolute', inset: 0, animation: `auSwing 5.4s cubic-bezier(.45,0,.55,1) ${p.delay} infinite alternate` }}>
                    <img
                      src={oynaLogo}
                      alt=""
                      aria-hidden="true"
                      style={{
                        position: 'absolute', left: 0, top: '50%', width: 56, height: 56, marginTop: -28,
                        opacity: p.opacity, filter: p.filter,
                        animation: `auSpinLogo 5.4s cubic-bezier(.45,0,.55,1) ${p.delay} infinite alternate`,
                      }}
                    />
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', flexShrink: 0, animation: 'auFadeBlur .6s cubic-bezier(.22,1,.36,1) .32s both' }}>
                <button
                  id="intro-continue-button"
                  type="button"
                  className="au-next"
                  onClick={introdanDevamEt}
                  aria-label="Devam et"
                  style={{
                    background: `linear-gradient(135deg, ${color} 0%, ${light} 60%, ${color} 100%)`,
                    boxShadow: `0 0 22px 0 ${color}57, inset 0 1px 0 rgba(255,255,255,.3)`,
                  }}
                >
                  <ArrowRight size={24} strokeWidth={2.6} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ═══ GİRİŞ / KAYIT ═══ */}
        {stage === 'input' && (
          // TAM EKRAN + SAĞDAN İTME: eskiden alttan açılan yarım paneldi
          // (ekranın %19'undan başlayan yuvarlak köşeli sayfa). Tanıtımdan
          // gelen hareketi sürdürmesi ve formun tam alanı kullanması için
          // tam ekrana alındı.
          <div style={{
            position: 'absolute', inset: 0, background: '#0A0E14',
            display: 'flex', flexDirection: 'column',
            animation: `auPushIn ${gecisSure}ms cubic-bezier(.32,.72,0,1) both`,
          }}>
            {sayfaBasligi(false)}

            <div
              className="custom-scrollbar"
              style={{
                flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden',
                display: 'flex', flexDirection: 'column',
                padding: '0 24px',
                // Üst şerit (geri + amblem) mutlak konumlu ve içeriğin ÜSTÜNDE
                // durur. Panel tam ekran olduğu için içerik artık en tepeden
                // başlıyor; bu dolgu olmazsa başlık şeridin altında kalır.
                // Hesap: güvenli alan + şeridin 18px üst boşluğu + 40px yüksekliği + nefes payı.
                paddingTop: 'calc(var(--safe-top, 0px) + 82px)',
                paddingBottom: klavyeliAltDolgu(klavyeOrtusu, 26),
              }}
            >
              {/* Başlık — sola hizalı ve sakin. Ortalanmış italik-versal
                  başlık "kampanya afişi" hissi veriyordu; giriş ekranında
                  güven veren şey sadelik.

                  TEK CÜMLE: "giriş" ile "kayıt" ayrımı yok. Numarası olmayan
                  kişinin hesabı ilk kodda açılır; kullanıcıya iki sekme
                  göstermek olmayan bir seçim yaratıyordu. */}
              <div style={{ marginBottom: 26 }}>
                <h1 style={{
                  margin: 0, fontSize: 32, lineHeight: 1.1, fontWeight: 800,
                  letterSpacing: '-.035em', color: '#fff',
                }}>
                  {telefonYoluVar ? 'Numaranla gir' : 'Sahaya çık'}
                </h1>
                <p style={{ margin: '10px 0 0', fontSize: 14, lineHeight: 1.5, fontWeight: 500, color: '#8B949E', letterSpacing: '-.01em' }}>
                  {telefonYoluVar
                    ? 'Sana bir kod göndereceğiz. Şifre yok, uğraş yok.'
                    : 'Apple ya da Google hesabınla tek dokunuşta gir. Şifre yok, uğraş yok.'}
                </p>
              </div>

              {/* ─── Sosyal giriş — BİRİNCİL (§3.1: Google + Apple) ───────
                  YERLEŞİM TELEFON YOLUNA GÖRE DEĞİŞİR (22 Ağu 2026):
                  · telefon açıkken → iki düğme YAN YANA, altında numara alanı;
                  · telefon kapalıyken → tek giriş yolu bunlar olduğu için ALT
                    ALTA ve tam genişlikte. Yan yana bırakılınca ekranın
                    ortasında telefon alanından kalan kocaman bir boşluk
                    kalıyor, ekran "yarım kalmış" görünüyordu.
                  APPLE ÜSTTE: iOS'ta üçüncü taraf girişi sunan uygulama Apple
                  ile Giriş'i de en az o kadar öne çıkarmak zorunda (Kural 4.8);
                  `column-reverse` ile Apple üste, Google alta gelir. */}
              <div style={{
                display: 'flex',
                flexDirection: telefonYoluVar ? 'row' : 'column-reverse',
                gap: telefonYoluVar ? 12 : 10,
              }}>
                  <button
                    type="button" className="au-social" onClick={handleGoogleLogin} disabled={busy}
                    style={telefonYoluVar ? undefined : { flex: 'none', width: '100%', height: 56 }}
                  >
                    {isLoading === 'google' ? spinner : (
                      <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true">
                        <path fill="#EA4335" d="M12.24 10.285V14.4h6.887c-.648 2.41-2.519 4.114-5.186 4.114-3.478 0-6.3-2.822-6.3-6.3 0-3.478 2.822-6.3 6.3-6.3 1.636 0 3.109.633 4.2 1.66l3.205-3.205C19.232 2.378 15.932 1 12.24 1 5.86 1 .7 6.16.7 12.54s5.16 11.54 11.54 11.54c6.645 0 11.755-4.664 11.755-11.755 0-.745-.067-1.462-.2-2.04H12.24z" />
                      </svg>
                    )}
                    <span>Google</span>
                  </button>
                  <button
                    type="button" className="au-social" onClick={handleAppleLogin} disabled={busy}
                    style={telefonYoluVar ? undefined : { flex: 'none', width: '100%', height: 56 }}
                  >
                    {isLoading === 'apple' ? spinner : (
                      <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 4.17c.66-.81 1.11-1.93.99-3.06-1 .04-2.22.67-2.94 1.5-.64.73-1.2 1.87-1.05 2.99 1.12.09 2.26-.56 3-1.43z" />
                      </svg>
                    )}
                    <span>Apple</span>
                  </button>
                </div>

                {/* AYRAÇ — yazısız (kurucu kararı, 21 Ağu 2026): "veya telefon
                    numaranla" cümlesi kaldırıldı; hemen altındaki "TELEFON
                    NUMARAN" alan başlığı zaten aynı şeyi söylüyor. Geriye
                    sosyal girişle telefon alanını ayıran kısa bir çizgi kalır.
                    Dekoratif olduğu için ekran okuyucudan gizli.
                    Telefon yolu kapalıyken ayıracak bir şey de yok → çizilmez. */}
                {telefonYoluVar && (
                <div style={{ display: 'flex', justifyContent: 'center', margin: '22px 0' }}>
                  <div aria-hidden="true" style={{ width: 32, height: 1, background: 'rgba(255,255,255,.10)' }} />
                </div>
                )}

                {telefonYoluVar && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
                  <div>
                    <label className="au-label" htmlFor="au-phone">Telefon numaran</label>
                    {/* Ülke kodu + numara TEK kutuda durur: iki ayrı kutu,
                        "hangisine yazacağım?" sorusu doğuruyordu. Türkiye
                        varsayılan seçilidir; başka ülke için kodu elle
                        değiştirmek yeter (bayrak listesi yok — kurucu kararı). */}
                    <div className="au-field">
                      <Phone size={19} color="#6b7280" style={{ flexShrink: 0 }} />
                      <span style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                        <span style={{ color: '#6b7280', fontSize: 16, fontWeight: 600 }}>+</span>
                        <input
                          id="au-dial"
                          type="text"
                          inputMode="numeric"
                          aria-label="Ülke kodu"
                          value={dial}
                          onChange={(e) => { setDial(e.target.value.replace(/\D/g, '').slice(0, 4)); clearFeedback(); }}
                          style={{
                            width: `${Math.max(dial.length, 2)}ch`, minWidth: '2ch', background: 'transparent',
                            border: 'none', outline: 'none', color: '#fff', fontSize: 16, fontWeight: 600,
                          }}
                        />
                      </span>
                      <span aria-hidden="true" style={{ width: 1, height: 22, background: 'rgba(255,255,255,.1)', flexShrink: 0 }} />
                      <input
                        id="au-phone"
                        type="tel"
                        inputMode={demoMode ? 'text' : 'numeric'}
                        autoComplete="tel-national"
                        className="au-input"
                        placeholder={demoMode ? '532 123 45 67 · veya "mirackerem"' : '532 123 45 67'}
                        aria-label="Telefon numarası"
                        value={phone}
                        onChange={(e) => {
                          const ham = e.target.value;
                          // Demo kısayolu harf içerir; onu bozmadan geçir.
                          setPhone(demoMode && /[a-zA-Z@]/.test(ham) ? ham : formatPhoneInput(ham, dial));
                          clearFeedback();
                        }}
                        onKeyDown={(e) => { if (e.key === 'Enter') void handleSendOtp(); }}
                      />
                    </div>
                    {/* Yazarken beliren tek satırlık yardım — hata satırıyla
                        aynı şeyi iki kez söylemez. */}
                    {phone.trim().length > 0 && !contactValid && error !== phoneCheck.reason && (
                      <p style={{ margin: '6px 2px 0', fontSize: 10, fontWeight: 700, color: '#FBBF24' }}>
                        {phoneCheck.reason}
                      </p>
                    )}
                    {kanalKapali && (
                      <p style={{ margin: '6px 2px 0', fontSize: 10, fontWeight: 700, color: '#FBBF24' }}>
                        {otpKapaliSebebi(dial)}
                      </p>
                    )}
                  </div>
                </div>
                )}

                {/* Bu ipucu TELEFON ALANINI anlatır ("numara yerine kısayolu
                    yaz"). Kapısı yalnız `demoMode` idi ve blok telefon
                    bloğunun İÇİNDE değil KARDEŞİYDİ: alan çizilmese bile afiş
                    çiziliyordu. `demoMode` çalışma zamanında `?demo=1` ile de
                    açıldığından, canlı web adresinde herkese görünebiliyordu —
                    anlattığı alan ekranda yokken. Kapı artık alanın kapısıyla
                    aynı: alan yoksa ipucu da yok. */}
                {DEMO_SECICI_DERLENSIN && telefonYoluVar && demoMode && (
                  <p style={{ margin: '10px 2px 0', fontSize: 10, fontWeight: 700, color: '#39FF14' }}>
                    🧪 DEMO MODU: numara yerine demo kısayolunu yaz, kod gerekmez. Sahip için "mirackerem".
                  </p>
                )}

                {error && (
                  <p role="alert" aria-live="assertive" style={{ margin: '11px 2px 0', fontSize: 11.5, fontWeight: 700, lineHeight: 1.5, color: '#FF4D4D' }}>{error}</p>
                )}

                {/* KVKK + Sözleşme onayı */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginTop: telefonYoluVar ? 15 : 22, padding: '0 2px' }}>
                  <button
                    id="agreement-checkbox"
                    type="button"
                    onClick={() => { setAgreed((v) => !v); setError(null); }}
                    aria-label="Yasal onay"
                    aria-pressed={agreed}
                    /* dokunma-hedefi: görünen kutu 20px kalır, dokunma alanı
                       48px'e (--oy-tap-min) genişler — index.css */
                    className="dokunma-hedefi"
                    style={{
                      marginTop: 1, width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                      transition: 'all .2s', background: agreed ? color : 'transparent',
                      border: `1px solid ${agreed ? color : 'rgba(255,255,255,0.2)'}`,
                      boxShadow: agreed ? `0 0 10px ${color}59` : 'none',
                    }}
                  >
                    {agreed && <Check size={12} color="#0A0E14" strokeWidth={3.4} />}
                  </button>
                  <p style={{ margin: 0, fontSize: 10, lineHeight: 1.7, fontWeight: 700, letterSpacing: '.01em', color: '#8B949E' }}>
                    <button type="button" className="au-link" onClick={() => setOpenModal('KVKK')} style={{ color }}>KVKK Aydınlatma Metni</button>
                    'ni ve{' '}
                    <button type="button" className="au-link" onClick={() => setOpenModal('TERMS')} style={{ color }}>Kullanım Şartları</button>
                    'ni okudum, kişisel verilerimin işlenmesini onaylıyorum.
                  </p>
                </div>

                <p style={{ margin: '10px 2px 0', fontSize: 10, color: '#59636e' }}>
                  Çıkış yapana kadar oturumun bu cihazda açık kalır.
                </p>

                {/* ─── Demo hesap seçici — YALNIZ GELİŞTİRME ─────────────
                    `VITE_DEMO_ACCOUNTS=true` ile derlenen yerel/önizleme
                    paketinde açılır; mağazaya giden pakette bu blok DERLEMEYE
                    HİÇ GİRMEZ (isDemoAccountPickerEnabled native'de daima
                    false, bayrak yoksa parola boş). İncelemeciye özel paket
                    YOK: gönderilen paket ile kullanıcının indirdiği paket
                    aynıdır (Apple 5.6, 22 Ağu 2026). */}
                {DEMO_SECICI_DERLENSIN && showDemoPicker && (
                  <div style={{ marginTop: 16 }}>
                    <button
                      type="button"
                      onClick={() => setDemoPickerOpen((v) => !v)}
                      style={{
                        width: '100%', height: 48, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        gap: 8, padding: '0 16px', borderRadius: 999, cursor: 'pointer',
                        border: '1px solid rgba(57,255,20,.3)', background: 'rgba(57,255,20,.05)', color: '#39FF14',
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 900, letterSpacing: '.08em' }}>
                        <Users size={16} /> DEMO HESABIYLA GİR
                      </span>
                      <ChevronDown size={18} style={{ transition: 'transform .25s', transform: demoPickerOpen ? 'rotate(180deg)' : 'none' }} />
                    </button>

                    {demoPickerOpen && (
                      <div style={{ marginTop: 12, maxHeight: 320, overflowY: 'auto', paddingRight: 4, display: 'flex', flexDirection: 'column', gap: 16 }} className="custom-scrollbar">
                        {!agreed && (
                          <p style={{ margin: 0, padding: '0 2px', fontSize: 10, fontWeight: 700, color: 'rgba(250,204,21,.9)' }}>
                            Giriş için yukarıdaki KVKK ve Kullanım Şartları kutusunu onayla.
                          </p>
                        )}
                        {DEMO_ACCOUNT_GROUPS.map((group) => (
                          <div key={group.role}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 2px', marginBottom: 8 }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: group.color }} />
                              <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '.18em', textTransform: 'uppercase', color: group.color }}>{group.label}</span>
                              <span style={{ fontSize: 10, fontWeight: 700, color: '#3a434e' }}>{group.accounts.length}</span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {group.accounts.map((acc) => (
                                <button
                                  key={acc.email}
                                  type="button"
                                  disabled={busy}
                                  onClick={() => handleDemoAccountLogin(acc.email, acc.password)}
                                  style={{
                                    width: '100%', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
                                    padding: '10px 12px', borderRadius: 14, background: '#0A0E14',
                                    border: '1px solid #1f2937', cursor: busy ? 'default' : 'pointer',
                                    opacity: busy && demoLoggingIn !== acc.email ? 0.5 : 1,
                                  }}
                                >
                                  <span style={{
                                    width: 32, height: 32, borderRadius: '50%', flexShrink: 0, display: 'flex',
                                    alignItems: 'center', justifyContent: 'center', background: group.color,
                                    color: '#0A0E14', fontWeight: 900, fontSize: 12, textTransform: 'uppercase',
                                  }}>{acc.name.charAt(0)}</span>
                                  <span style={{ flex: 1, minWidth: 0 }}>
                                    <span style={{ display: 'block', fontSize: 12, fontWeight: 900, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{acc.name}</span>
                                    <span style={{ display: 'block', fontSize: 10, color: '#59636e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {acc.email}{acc.note ? ` · ${acc.note}` : ''}
                                    </span>
                                  </span>
                                  {demoLoggingIn === acc.email
                                    ? <span className="au-spin" style={{ color: '#fff' }} aria-hidden="true" />
                                    : <ArrowRight size={15} color="#3a434e" style={{ flexShrink: 0 }} />}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                        <p style={{ margin: 0, padding: '0 2px', fontSize: 10, lineHeight: 1.6, color: '#3a434e' }}>
                          Tüm demo hesapların şifresi ortaktır; bir hesaba dokununca otomatik giriş yapılır.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* ─── Aksiyonlar ─── */}
                {/* TEK BUTON: "kod gönder". Eskiden burada KAYIT OL / GİRİŞ YAP /
                    KOD İLE GİRİŞ / mod değiştir / MİSAFİR olmak üzere beş yol
                    vardı; hepsi tek yola indi. Misafir modu kurucu kararıyla
                    kapatıldı, kayıt/giriş ayrımı da kalktı. */}
                <div style={{ marginTop: 'auto', paddingTop: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {telefonYoluVar && (
                  <button
                    type="button"
                    className="au-cta"
                    onClick={handleSendOtp}
                    disabled={busy}
                    style={ctaStyle(authReady)}
                  >
                    {ctaBusy ? spinner : (
                      <>
                        <span>{ctaLabel}</span>
                        <ArrowRight size={16} strokeWidth={2.8} />
                      </>
                    )}
                  </button>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, paddingTop: 2 }}>
                    <button type="button" className="au-footlink" onClick={() => setOpenModal('TERMS')}>Kullanım Şartları</button>
                    <span style={{ fontSize: 10, color: '#3a434e' }}>|</span>
                    <button type="button" className="au-footlink" onClick={() => setOpenModal('KVKK')}>KVKK Aydınlatma Metni</button>
                  </div>
                </div>
            </div>
          </div>
        )}

        {/* ═══ KOD DOĞRULAMA ═══ */}
        {stage === 'otp' && (
          <div style={{ position: 'absolute', inset: 0 }}>
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: CURTAIN,
              backdropFilter: 'blur(7px) saturate(.95)', WebkitBackdropFilter: 'blur(7px) saturate(.95)',
              background: 'rgba(10,14,20,.5)', animation: 'auFadeBlur .5s ease-out both', pointerEvents: 'none',
            }} />
            {sheetHeader}

            <div style={{
              position: 'absolute', left: 0, right: 0, bottom: 0,
              top: 'max(23%, calc(var(--safe-top, 0px) + 128px))',
              borderRadius: '34px 34px 0 0', background: 'rgba(13,18,26,.9)',
              backdropFilter: 'blur(28px) saturate(180%)', WebkitBackdropFilter: 'blur(28px) saturate(180%)',
              border: '1px solid rgba(255,255,255,.08)', borderBottom: 'none',
              boxShadow: '0 -12px 44px rgba(0,0,0,.5)', display: 'flex', flexDirection: 'column',
              overflow: 'hidden', animation: 'auSheet .6s cubic-bezier(.22,1,.36,1) both',
            }}>
              <div style={{ width: 40, height: 4, borderRadius: 999, background: 'rgba(255,255,255,.18)', margin: '14px auto 16px', flexShrink: 0 }} />

              <div
                className="custom-scrollbar"
                style={{
                  flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden',
                  display: 'flex', flexDirection: 'column', padding: '0 26px',
                  paddingBottom: klavyeliAltDolgu(klavyeOrtusu, 30),
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
                  <div style={{
                    width: 60, height: 60, borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)',
                    boxShadow: `0 0 22px ${color}2e`, color,
                  }}>
                    <KeyRound size={26} />
                  </div>
                </div>

                <div style={{ textAlign: 'center', marginBottom: 22 }}>
                  <div style={{ fontSize: 26, lineHeight: 1.1, fontWeight: 900, fontStyle: 'italic', textTransform: 'uppercase', letterSpacing: '-.02em', color: '#fff' }}>
                    Numaranı doğrula
                  </div>
                  <p style={{ margin: '9px 0 0', fontSize: 12.5, lineHeight: 1.55, color: '#8B949E' }}>
                    {contactLabel} numarasına gönderdiğimiz 6 haneli kodu gir.
                  </p>
                </div>

                <label htmlFor="auth-otp-input" style={{ display: 'block', textAlign: 'center', fontSize: 10, fontWeight: 800, letterSpacing: '.22em', textTransform: 'uppercase', color: '#6b7280', marginBottom: 10 }}>
                  Doğrulama kodu
                </label>
                <input
                  id="auth-otp-input"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="••••••"
                  aria-label="6 haneli doğrulama kodu"
                  value={otp}
                  autoFocus
                  onChange={(e) => { setOtp(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(null); }}
                  style={{
                    width: '100%', height: 64, boxSizing: 'border-box', borderRadius: 20,
                    background: '#0A0E14', border: '1px solid #1f2937', outline: 'none', textAlign: 'center',
                    color: '#fff', fontSize: 30, fontWeight: 900, letterSpacing: '.5em', textIndent: '.5em',
                  }}
                />

                {error && (
                  <p role="alert" aria-live="assertive" style={{ margin: '13px 2px 0', fontSize: 11.5, fontWeight: 700, lineHeight: 1.5, textAlign: 'center', color: '#FF4D4D' }}>{error}</p>
                )}

                <div style={{ textAlign: 'center', marginTop: 16 }}>
                  {resendIn > 0 ? (
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: '#8B949E' }}>Kodu tekrar gönder ({resendIn}s)</span>
                  ) : (
                    <button type="button" className="au-link" onClick={handleResend} disabled={busy} style={{ fontSize: 11.5, fontWeight: 900, color }}>
                      Kodu tekrar gönder
                    </button>
                  )}
                </div>

                <div style={{ marginTop: 'auto', paddingTop: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <button
                    type="button"
                    className="au-cta"
                    onClick={handleVerify}
                    disabled={busy || !otpReady}
                    style={ctaStyle(otpReady)}
                  >
                    {codeBusy ? spinner : (
                      <>
                        <span>DOĞRULA VE GİRİŞ YAP</span>
                        <ArrowRight size={16} strokeWidth={2.8} />
                      </>
                    )}
                  </button>
                  <button type="button" className="au-ghost" onClick={handleHeaderBack} disabled={busy}>
                    NUMARAYI DEĞİŞTİR
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── Bilgi bildirimi (tasarımdaki üst toast) ───
            Kendiliğinden kapanmaz: "e-postandaki bağlantıyı onayla" gibi mesajlar
            okunmadan kaybolmasın. Sonraki yazma/aksiyon temizler; dokunmak da kapatır. */}
        {info && (
          <div
            role="status"
            onClick={() => setInfo(null)}
            style={{
              cursor: 'pointer',
              position: 'absolute', top: 'calc(var(--safe-top, 0px) + 28px)', left: 22, right: 22, zIndex: 70,
              display: 'flex', alignItems: 'center', gap: 11, padding: '14px 16px', borderRadius: 18,
              background: 'rgba(22,27,34,.94)', backdropFilter: 'blur(24px) saturate(180%)',
              WebkitBackdropFilter: 'blur(24px) saturate(180%)', border: '1px solid rgba(57,255,20,.3)',
              boxShadow: '0 8px 32px rgba(0,0,0,.45)', animation: 'auToast .45s cubic-bezier(.34,1.56,.64,1) both',
            }}
          >
            <CheckCircle2 size={20} color="#39FF14" style={{ flexShrink: 0 }} />
            <span style={{ fontSize: 12.5, fontWeight: 700, lineHeight: 1.45, color: '#fff' }}>{info}</span>
          </div>
        )}

        <AnimatePresence>
          {openModal && (
            <Suspense fallback={null}>
              <LegalModal openModal={openModal} setOpenModal={setOpenModal} />
            </Suspense>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default AuthScreen;
