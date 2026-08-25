import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { recordUserConsents } from '../services/consentService';
import { AnimatePresence } from 'framer-motion';
import { Check, ArrowRight, ChevronLeft, MailCheck } from 'lucide-react';
import { UserRole } from '../types';
import {
  loginWithGoogle, loginWithApple, oauthDonusunuOku,
  loginWithPassword, signUpWithPassword,
} from '../supabaseAuth';
import { getSonEposta, getBeniHatirla, getHasAccount } from '../supabaseClient';
import SifreFormu, { type FormKipi, type SifreFormDegerleri } from './auth/SifreFormu';
import BeniHatirlaAnahtari from './auth/BeniHatirlaAnahtari';
import YasalOnayKarti from './auth/YasalOnayKarti';
import { useKlavyeOrtusu } from '../components/common/Toast';
import { useAppStore } from '../store';
// Şifre sıfırlama yalnız "Şifremi unuttum"a dokununca yüklenir: giriş
// paketine iki uç fonksiyon çağrısı ve ikinci bir form için yer açmaya gerek yok.
const SifremiUnuttum = lazy(() => import('./auth/SifremiUnuttum'));
// IP-15: yasal belgeler artık ÖZET değil TAM metin (karar 7b) — 39 KB. Statik
// import edilirse giriş paketine girer ve belgeyi hiç açmayan kullanıcı da
// indirir. Modal yalnız bağlantıya dokununca yüklenir; tip import'u derlemede
// silindiği için paketi etkilemez.
const LegalModal = lazy(() =>
  import('../components/common/LegalModal').then((m) => ({ default: m.LegalModal })));
import type { LegalModalKind } from '../components/common/LegalModal';
// KLAVYE PAYI GERİ GELDİ (24 Ağu 2026): şifre yoluyla birlikte yazı alanları
// da döndü. Ölçüm `useKlavyeOrtusu` ile yapılır — gerekçe bileşenin içinde.
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
// SPLASH (ilk animasyon) → [intro → input] → ONBOARDING
//   intro : cam amblem perdesi + "İSTEDİĞİN ZAMAN oyna!" tanıtımı
//   input : GİRİŞ YAP / KAYIT OL sekmeleri · e-posta + şifre · Apple · Google
//
// ═════════════════════════════════════════════════════════════════════════════
// E-POSTA + ŞİFRE GERİ GELDİ (24 Ağustos 2026, kurucu kararı)
// ═════════════════════════════════════════════════════════════════════════════
//
// NEDEN: Apple App Review "Sign-In Information → User name / Password" istiyor.
// Google ve Apple ile Giriş bu talebi KARŞILAMAZ: incelemeci kendi kimliğiyle
// girdiğinde bizim hazırladığımız hesaba değil, bomboş yeni bir hesaba düşer;
// kaleci, hakem ve tesis panellerini hiç göremez.
//
// BU BİR "İNCELEMECİ KAPISI" DEĞİLDİR — 5.6'nın dersi tam olarak buydu.
// 21 Ağustos'taki ret, inceleme paketinde olup indirilen pakette OLMAYAN gizli
// bir demo yolundan geldi. Buradaki yol HERKESE AÇIK ve HERKESLE AYNI: her
// kullanıcı aynı sekmede e-postasıyla kaydolur ve girer. İncelemeciye verilen
// şey ayrıcalıklı bir kapı değil, sıradan bir hesabın e-postası ve şifresidir.
//
// SİLİNENLER GERİ GELMEDİ: telefon/SMS yolu ve demo hesap seçici bu ekranda
// hâlâ YOKTUR ve olmayacaktır. O yol, altyapısı (SMS sağlayıcısı) hiç
// kurulmadığı için ölü bir düğmeydi; şifre yolunun altyapısı ise sunucuda
// zaten çalışıyor. tests/unit/tekGirisYolu.test.ts bu ayrımı kilitler.
//
// KAYITTA ROL SEÇİMİ YOKTUR (kurucu kararı, 24 Ağu 2026): kaydolan HERKES
// oyuncudur. Kaleci ve hakem, Ayarlar → Sahada Rolün'den BAŞVURUR; tesis
// sahibi, müdür ve personel YALNIZ yönetici panelinden atanır. Atanmış roller
// girişte kendi paneline düşer (shared/roles · pickLandingRole).
//
// APPLE ÜSTTE KALIR (App Store Kural 4.8): üçüncü taraf girişi sunan uygulama
// Apple ile Giriş'i en az o kadar öne çıkarmak zorundadır.
// ═════════════════════════════════════════════════════════════════════════════
type Stage = 'intro' | 'input';

/** Onay eksikken ertelenen eylem: onaylanınca bu iş yapılır. */
type BekleyenEylem = 'google' | 'apple' | 'kayit';

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

// Pendulum: aynı logonun üç kopyası — iki kırınım hayaleti + asıl top.
const PENDULUM = [
  { delay: '-.26s', opacity: 0.28, filter: 'blur(7px) hue-rotate(-55deg) saturate(2.4)' },
  { delay: '-.13s', opacity: 0.4, filter: 'blur(3.5px) hue-rotate(60deg) saturate(2.2)' },
  { delay: '0s', opacity: 1, filter: 'drop-shadow(0 0 14px rgba(250,204,21,.5))' },
];

const AuthScreen: React.FC<AuthScreenProps> = ({ onBack, role }) => {
  const { color, light } = getTheme(role);

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
  // ─── KAYIT / GİRİŞ AYRIMI GERİ GELDİ ──────────────────────────────────────
  // Telefon yolunda tek akış doğruydu: numarayı yazan kişinin hesabı yoksa
  // ilk kodda açılıyordu, yani "kayıt" ile "giriş" GERÇEKTEN aynı işti.
  // Şifreyle aynı şey mümkün değil — kayıt ad ister, giriş istemez; ve
  // "şifre yanlış" ile "bu e-postayla hesap yok" farkını kullanıcıya
  // söylemek gerekir. Bu yüzden iki sekme var ve hangisinde olduğu görünür.
  //
  // İLK SEKME `authStartMode`tan gelir (kayıt kapısı "kaydol"a mı "giriş"e mi
  // bastığını yazar); o yoksa cihazda daha önce oturum açılmış mı diye
  // bakılır — açılmışsa GİRİŞ, açılmamışsa KAYIT. Yeni kullanıcıya "giriş yap"
  // demek, olmayan bir şifreyi sormaktır.
  const [kip, setKip] = useState<FormKipi>(() => {
    const niyet = useAppStore.getState().authStartMode;
    if (niyet === 'register') return 'kayit';
    if (niyet === 'login') return 'giris';
    return getHasAccount() ? 'giris' : 'kayit';
  });
  // Niyet okundu → temizlenir ki bir sonraki açılış eski bir niyetle karşılaşmasın.
  useEffect(() => { useAppStore.getState().setAuthStartMode(null); }, []);

  const [form, setForm] = useState<SifreFormDegerleri>(() => ({
    adSoyad: '',
    // "Beni hatırla" açıkken saklanan adres — kullanıcı e-postasını yeniden
    // yazmasın. Şifre ASLA saklanmaz.
    eposta: getSonEposta(),
    sifre: '',
  }));
  const [hatirla, setHatirla] = useState<boolean>(() => getBeniHatirla());
  const [unuttumAcik, setUnuttumAcik] = useState(false);
  // Sunucuda e-posta doğrulaması AÇIKSA kayıt oturum döndürmez. O durumu
  // sessiz geçmek, kullanıcıyı "kaydoldum ama hiçbir şey olmadı" ekranında
  // bırakır — bu perde onu açıkça söyler.
  const [onayBekleyenEposta, setOnayBekleyenEposta] = useState<string | null>(null);

  // Yasal onay OPT-IN olmalı: kutu önceden işaretli gelemez (KVKK/mağaza incelemesi)
  const [agreed, setAgreed] = useState(false);
  const [isLoading, setIsLoading] = useState<'google' | 'apple' | 'sifre' | null>(null);
  const [error, setError] = useState<string | null>(
    oauthDonusu ? mapOAuthDonusu(oauthDonusu.saglayici, oauthDonusu.kod, oauthDonusu.aciklama) : null);
  // Kırmızı OLMAYAN durum satırı: "pencereyi kapattın" gibi şeyler hata
  // değildir ama SESSİZ de kalmamalı (bkz. saglayiciHatasi).
  const [bilgi, setBilgi] = useState<string | null>(null);
  // Onay verilmemişken hesap AÇABİLECEK bir eyleme dokunulduğunda açılan sayfa.
  // `null` = kapalı. Girişte (mevcut hesap) onay istenmez — kullanıcı o rızayı
  // kaydolurken zaten verdi; her girişte yeniden sormak ne hukuken gerekli ne
  // de kullanıcıya saygılıdır.
  const [onayIstenen, setOnayIstenen] = useState<BekleyenEylem | null>(null);
  // IP-15: anahtarlar artık resmi belge anahtarları — modal tam metni
  // shared/legalDocs.ts'ten okur, Ayarlar → Yasal ile birebir aynı.
  const [openModal, setOpenModal] = useState<LegalModalKind | null>(null);

  // ─── KLAVYE PAYI GERİ GELDİ (24 Ağustos 2026) ─────────────────────────────
  // 23 Ağustos'ta bu ekranda hiç yazı alanı kalmadığı için klavye ölçümü
  // sökülmüştü. Şifre yolu geri gelince alanlar da geri geldi ve ölçüm ŞART:
  // ekranın kökü `fixed inset-0`, yani PENCEREYE tutunur — görsel görünüm
  // alanına değil. Klavye açıldığında pencere küçülmez, dolayısıyla şifre
  // alanı ve altındaki düğme klavyenin ARKASINDA kalırdı.
  // Ölçüm TEK kaynaktan gelir: components/common/Toast · useKlavyeOrtusu.
  // Bu ekran ölçümü KENDİSİ yapmaz — iki ölçüm olsaydı biri doğru, öteki
  // yanlış davranırdı (tests/unit/girisKlavyesiVeSuzgecDelikleri · A4).
  const klavyeOrtusu = useKlavyeOrtusu();

  // Tanıtım bir kez görüldü: aynı oturumda AUTH'a tekrar düşülürse atlanır.
  useEffect(() => { introShownThisSession = true; }, []);

  /**
   * İLK DOKUNUŞ ARTIK BOŞA GİTMİYOR (23 Ağustos 2026).
   *
   * KURUCU BİLDİRİMİ: "Tek seferde giremiyorum."
   *
   * Eski akış şuydu: kullanıcı Apple'a dokunur → onay kutusu işaretli
   * olmadığı için KIRMIZI hata basılır ve İŞLEM İPTAL EDİLİR → kullanıcı
   * kutuyu bulup işaretler → tekrar dokunur. Yani HER kullanıcının ilk
   * dokunuşu başarısızdı; "tek seferde giremiyorum"un birinci ve kesin
   * sebebi buydu. Kutu ekranın altında, düğmelerin ÇOK aşağısındaydı;
   * telefonun küçük ekranında çoğu zaman görüş alanının dışında kalıyordu.
   *
   * Yeni akış: dokunuş İPTAL EDİLMEZ, ONAYA DÖNÜŞÜR. Küçük bir sayfa açılır,
   * iki belge orada yazılıdır ve tek düğme hem onayı verir hem girişi
   * başlatır. Onay hâlâ AÇIK ve İSTEĞE BAĞLIDIR (kutu önceden işaretli
   * gelmez, "devam ederek kabul etmiş sayılırsın" demiyoruz): kullanıcı
   * üzerinde "Onaylıyorum" yazan bir düğmeye basar.
   *
   * Kutuyu önceden işaretleyen kullanıcı için hiçbir şey değişmez: sayfa
   * açılmaz, dokunuş doğrudan girişi başlatır.
   *
   * KRİTİK: onay düğmesi girişi AYNI DOKUNUŞTA başlatır. Araya bir adım daha
   * girseydi tarayıcı, açılır pencereyi "kullanıcı istemedi" sayıp engellerdi.
   */
  const girisBaslat = async (saglayici: 'google' | 'apple') => {
    if (isLoading) return;
    setError(null);
    setBilgi(null);
    setIsLoading(saglayici);
    try {
      // "Beni hatırla" sağlayıcı yolunda da geçerlidir: kullanıcı anahtarı
      // kapatıp Google'a bastığında oturumun kalıcı olması, kapattığı şeyin
      // sessizce çalışması olurdu.
      if (saglayici === 'google') await loginWithGoogle(hatirla);
      else await loginWithApple(hatirla);
      // Sağlayıcı yolunda da rıza kaydı: bu düğmeye onay kutusu işaretli
      // olmadan basılamıyor (yukarıdaki `saglayiciyaDokun` kapısı), dolayısıyla
      // buraya ulaşan her oturum gerçekten onay verilmiş bir oturumdur.
      // Native'de akış buraya DÖNER (SocialLogin.login satır içi tamamlanır);
      // web'de yönlendirme olursa kayıt atlanır — mağaza paketi native'dir.
      void recordUserConsents(['TERMS', 'KVKK', 'PRIVACY']);
      // Yönlendirmeyi App'teki auth dinleyicisi yapar (profildeki GERÇEK role
      // göre). Buradan onSuccess() çağrılırsa çifte yönlendirme/flaş olur.
    } catch (err: any) {
      console.error(`[Auth] ${saglayici} hatası:`, err);
      const sonuc = saglayiciHatasi(err, saglayici === 'google' ? 'Google' : 'Apple');
      if (sonuc.kirmizi) setError(sonuc.metin);
      else setBilgi(sonuc.metin);
    } finally {
      setIsLoading(null);
    }
  };

  /**
   * E-POSTA + ŞİFRE — giriş ya da kayıt.
   *
   * Yönlendirme YAPILMAZ: başarıda App'teki auth dinleyicisi profildeki GERÇEK
   * role göre yönlendirir (kaleci/hakem/tesis kendi paneline düşer). Buradan
   * onSuccess() çağrılsaydı hepsi oyuncu paneline giderdi.
   */
  const sifreyleDevam = async () => {
    if (isLoading) return;
    setError(null);
    setBilgi(null);
    setIsLoading('sifre');
    try {
      if (kip === 'kayit') {
        const sonuc = await signUpWithPassword(form.eposta, form.sifre, form.adSoyad, hatirla);
        // KVKK RIZA KAYDI — açık rızanın İSPAT YÜKÜ veri sorumlusundadır
        // (KVKK m.3/1-a, m.12). 24 Ağu 2026 denetiminde çıktı: ekran
        // kullanıcıya üç belgeyi onaylatıyordu ama sunucudaki `user_consents`
        // tablosu 41 kullanıcıya karşılık BOŞTU — bir şikâyette elimizde
        // hiçbir kanıt yoktu.
        //
        // Kayıt best-effort: sunucu yazamazsa kullanıcı içeri girmeye devam
        // eder. Kaydı bloke etmek, çözdüğünden büyük bir sorun yaratır.
        if (sonuc === 'GIRILDI') void recordUserConsents(['TERMS', 'KVKK', 'PRIVACY']);
        if (sonuc === 'ONAY_BEKLIYOR') {
          // Hesap açıldı ama oturum yok (sunucuda e-posta doğrulaması açık).
          // Kullanıcı bunu BİLMELİ; sessiz kalırsak ekran hiçbir şey olmamış
          // gibi durur ve kullanıcı aynı e-postayla tekrar tekrar dener.
          setOnayBekleyenEposta(form.eposta.trim().toLowerCase());
        }
      } else {
        await loginWithPassword(form.eposta, form.sifre, hatirla);
      }
    } catch (err: any) {
      console.error(`[Auth] ${kip} hatası:`, err);
      setError(mapAuthError(err, kip === 'kayit'
        ? 'Hesap oluşturulamadı. Tekrar dene.'
        : 'Giriş yapılamadı. Tekrar dene.'));
    } finally {
      setIsLoading(null);
    }
  };

  /** Sağlayıcı düğmesi: onay varsa doğrudan gir, yoksa onay sayfasını aç. */
  const saglayiciyaDokun = (saglayici: 'google' | 'apple') => {
    if (isLoading) return;
    if (!agreed) { setError(null); setOnayIstenen(saglayici); return; }
    void girisBaslat(saglayici);
  };

  /**
   * Form gönderimi. KAYIT hesap açar → onay şarttır, eksikse dokunuş iptal
   * EDİLMEZ, onaya dönüşür (sağlayıcı düğmeleriyle aynı desen). GİRİŞ mevcut
   * bir hesaba oturur → onay istenmez.
   */
  const formGonderildi = () => {
    if (isLoading) return;
    if (kip === 'kayit' && !agreed) { setError(null); setOnayIstenen('kayit'); return; }
    void sifreyleDevam();
  };

  /** Onay sayfasındaki tek düğme: onayı verir ve bekleyen işi AYNI dokunuşta başlatır. */
  const onaylaVeDevamEt = () => {
    const eylem = onayIstenen;
    setAgreed(true);
    setOnayIstenen(null);
    if (eylem === 'kayit') void sifreyleDevam();
    else if (eylem) void girisBaslat(eylem);
  };

  /** Sekme değişimi: alanlar korunur ama hata/bilgi satırı temizlenir. */
  const kipDegistir = (yeni: FormKipi) => {
    if (yeni === kip) return;
    setKip(yeni);
    setError(null);
    setBilgi(null);
  };

  // Açılır pencere yolunun iki özel sonucu (supabaseAuth · webOAuthAc):
  //   OAUTH_PENCERE_KAPANDI → kullanıcı vazgeçti. Bu bir HATA DEĞİLDİR;
  //     kırmızı uyarı basmak, yaptığı şeyi yanlışmış gibi sunmak olur.
  //   OAUTH_ZAMAN_ASIMI     → pencere açık kaldı ama oturum gelmedi.
  // Ham kodu ekrana taşımayız; kullanıcı ne yapacağını okur.
  const saglayiciHatasi = (err: any, saglayici: string): { metin: string; kirmizi: boolean } => {
    const m = String(err?.message ?? err);
    // SESSİZ KALMA (23 Ağu 2026): bu dal eskiden `null` döndürüyor, ekrana
    // HİÇBİR ŞEY yazılmıyordu. Pencereyi kullanıcı kapattıysa doğruydu; ama
    // pencereyi TARAYICI da kapatıyor (mobilde arka plan sekmesi tahliye
    // edilir). O zaman kullanıcı "dokundum, hiçbir şey olmadı" görüyor ve
    // tekrar deniyor — "tek seferde giremiyorum"un sessiz ayağı buydu.
    // Vazgeçmek hata değildir, o yüzden KIRMIZI değil: sakin bir durum satırı.
    if (m.includes('OAUTH_PENCERE_KAPANDI')) {
      return { metin: `Giriş penceresi kapandı. ${saglayici} ile tekrar deneyebilirsin.`, kirmizi: false };
    }
    if (m.includes('OAUTH_ZAMAN_ASIMI')) {
      return { metin: 'Giriş tamamlanmadı. Pencereyi kapatıp tekrar dener misin?', kirmizi: true };
    }
    return { metin: mapAuthError(err, `${saglayici} ile giriş başarısız.`), kirmizi: true };
  };

  const handleGoogleLogin = () => saglayiciyaDokun('google');
  const handleAppleLogin = () => saglayiciyaDokun('apple');

  // MİSAFİR MODU KALDIRILDI (kurucu kararı, 17 Ağu 2026): "önce göz at" yolu
  // kapatıldı. Uygulamaya girmek için hesap gerekiyor.

  const clearFeedback = () => { setError(null); setBilgi(null); };

  const handleHeaderBack = () => {
    if (stage === 'input') {
      // Giriş ekranından tanıtıma dön (tasarımdaki geri davranışı).
      setStage('intro');
      clearFeedback();
    } else {
      onBack();
    }
  };

  // TEK GİRİŞ YOLU: Apple · Google. Başka bir "hazır mı" ölçütü yok — onay
  // kutusu işaretli değilse düğme yine CANLI durur ve dokununca eksik olan
  // TEK şeyi söyler (sessizce pasif buton "bozuk" hissettiriyordu).
  const busy = isLoading !== null;

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
                // Klavye açıkken alt dolgu klavye kadar büyür: odaklanılan alan
                // ve altındaki düğme klavyenin arkasında kalmaz. Klavye kapalıyken
                // ölçü 0 döner ve dolgu 26px'e iner (görsel değişiklik yok).
                paddingBottom: klavyeOrtusu > 0 ? klavyeOrtusu + 26 : 26,
                transition: 'padding-bottom .18s ease-out',
              }}
            >
              {/* Başlık — sola hizalı ve sakin. Ortalanmış italik-versal
                  başlık "kampanya afişi" hissi veriyordu; giriş ekranında
                  güven veren şey sadelik. */}
              <div style={{ marginBottom: 20 }}>
                <h1 style={{
                  margin: 0, fontSize: 32, lineHeight: 1.1, fontWeight: 800,
                  letterSpacing: '-.035em', color: '#fff',
                }}>
                  {kip === 'kayit' ? 'Aramıza katıl' : 'Tekrar hoş geldin'}
                </h1>
                <p style={{ margin: '10px 0 0', fontSize: 14, lineHeight: 1.5, fontWeight: 500, color: '#8B949E', letterSpacing: '-.01em' }}>
                  {kip === 'kayit'
                    ? 'Hesabını aç, sahaya çık. Kayıt olan herkes oyuncu olarak başlar.'
                    : 'E-postan ve şifrenle gir ya da Apple/Google hesabını kullan.'}
                </p>
              </div>

              {/* ─── GİRİŞ YAP · KAYIT OL ─────────────────────────────────── */}
              <div className="au-tabs" role="tablist" aria-label="Giriş ya da kayıt" style={{ marginBottom: 20 }}>
                <button
                  type="button" role="tab" id="auth-tab-giris"
                  aria-selected={kip === 'giris'}
                  className="au-tab"
                  onClick={() => kipDegistir('giris')}
                  disabled={busy}
                >
                  GİRİŞ YAP
                </button>
                <button
                  type="button" role="tab" id="auth-tab-kayit"
                  aria-selected={kip === 'kayit'}
                  className="au-tab"
                  onClick={() => kipDegistir('kayit')}
                  disabled={busy}
                >
                  KAYIT OL
                </button>
              </div>

              {/* ─── E-posta + şifre formu ─────────────────────────────────── */}
              <SifreFormu
                kip={kip}
                degerler={form}
                onChange={setForm}
                onSubmit={formGonderildi}
                onSifremiUnuttum={() => { setError(null); setUnuttumAcik(true); }}
                busy={busy}
                renk={color}
                light={light}
                /* ── BENİ HATIRLA + YASAL ONAY — ana düğmenin HEMEN ÜSTÜNDE ──
                   Ölçtük: 390×844'lük telefonda bu kartlar düğmenin ALTINDAYKEN
                   görüş alanına hiç girmiyordu. Kurucu isteği "büyük ve görünür
                   olsun" idi; ekranın altında kalan kart, ne kadar büyük olursa
                   olsun görünmez. Rıza da gerektirdiği EYLEMİN yanında durmalı. */
                formAlti={(
                  <>
                    <BeniHatirlaAnahtari acik={hatirla} onChange={setHatirla} disabled={busy} />
                    {/* KAYITTA onay şart (hesap açılıyor); GİRİŞTE istenmez —
                        kullanıcı o rızayı kaydolurken verdi. Belgeler her iki
                        kipte de ekranın altındaki satırdan açılabilir. */}
                    {kip === 'kayit' && (
                      <YasalOnayKarti
                        onayli={agreed}
                        onChange={(v) => { setAgreed(v); setError(null); }}
                        onBelgeAc={setOpenModal}
                        renk={color}
                        disabled={busy}
                      />
                    )}
                  </>
                )}
              />

              {error && (
                <p role="alert" aria-live="assertive" style={{ margin: '14px 2px 0', fontSize: 12, fontWeight: 700, lineHeight: 1.5, color: '#FF4D4D' }}>{error}</p>
              )}

              {/* DURUM SATIRI — hata değil. "Pencereyi kapattın" gibi şeyler
                  kırmızıyla yazılırsa kullanıcı yanlış bir şey yapmış hisseder;
                  sessiz bırakılırsa "dokundum, bir şey olmadı" der. */}
              {!error && bilgi && (
                <p role="status" aria-live="polite" style={{ margin: '14px 2px 0', fontSize: 12, fontWeight: 700, lineHeight: 1.5, color: '#8B949E' }}>{bilgi}</p>
              )}

              <div className="au-ayirici"><span>YA DA</span></div>

              {/* ─── Apple · Google ────────────────────────────────────────
                  APPLE ÜSTTE: iOS'ta üçüncü taraf girişi sunan uygulama Apple
                  ile Giriş'i de en az o kadar öne çıkarmak zorunda (Kural 4.8);
                  `column-reverse` ile Apple üste, Google alta gelir. */}
              <div style={{ display: 'flex', flexDirection: 'column-reverse', gap: 10 }}>
                  <button
                    type="button" className="au-social" onClick={handleGoogleLogin} disabled={busy}
                    style={{ flex: 'none', width: '100%', height: 56 }}
                  >
                    {isLoading === 'google' ? spinner : (
                      <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true">
                        <path fill="#EA4335" d="M12.24 10.285V14.4h6.887c-.648 2.41-2.519 4.114-5.186 4.114-3.478 0-6.3-2.822-6.3-6.3 0-3.478 2.822-6.3 6.3-6.3 1.636 0 3.109.633 4.2 1.66l3.205-3.205C19.232 2.378 15.932 1 12.24 1 5.86 1 .7 6.16.7 12.54s5.16 11.54 11.54 11.54c6.645 0 11.755-4.664 11.755-11.755 0-.745-.067-1.462-.2-2.04H12.24z" />
                      </svg>
                    )}
                    <span>Google ile devam et</span>
                  </button>
                  <button
                    type="button" className="au-social" onClick={handleAppleLogin} disabled={busy}
                    style={{ flex: 'none', width: '100%', height: 56 }}
                  >
                    {isLoading === 'apple' ? spinner : (
                      <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 4.17c.66-.81 1.11-1.93.99-3.06-1 .04-2.22.67-2.94 1.5-.64.73-1.2 1.87-1.05 2.99 1.12.09 2.26-.56 3-1.43z" />
                      </svg>
                    )}
                    <span>Apple ile devam et</span>
                  </button>
                </div>

                <p style={{ margin: '18px 2px 0', fontSize: 11.5, lineHeight: 1.6, color: '#59636e' }}>
                  {hatirla
                    ? 'Çıkış yapana kadar oturumun bu cihazda açık kalır.'
                    : 'Uygulamayı kapattığında oturumun kapanır.'}
                </p>

                {/* ─── Yasal belgeler — her iki kipte de erişilebilir ───────
                    Kurucu isteği gereği eski 10px soluk satır büyütüldü:
                    12px, okunur renk, üç belge birden. Apple da gizlilik
                    politikasının uygulama İÇİNDEN açılmasını şart koşar. */}
                <div style={{ marginTop: 'auto', paddingTop: 22, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    gap: 8, flexWrap: 'wrap', paddingTop: 2,
                  }}>
                    <button type="button" className="au-footlink" onClick={() => setOpenModal('KVKK')}>KVKK Aydınlatma Metni</button>
                    <span style={{ fontSize: 11, color: '#3a434e' }}>·</span>
                    <button type="button" className="au-footlink" onClick={() => setOpenModal('PRIVACY')}>Gizlilik Politikası</button>
                    <span style={{ fontSize: 11, color: '#3a434e' }}>·</span>
                    <button type="button" className="au-footlink" onClick={() => setOpenModal('TERMS')}>Kullanım Şartları</button>
                  </div>
                </div>
            </div>
          </div>
        )}

        {/* ═══ ONAY SAYFASI ═══
            Sağlayıcıya dokunulduğunda onay yoksa açılır. Tek düğme hem onayı
            verir hem girişi AYNI DOKUNUŞTA başlatır — araya bir adım daha
            girseydi tarayıcı açılır pencereyi engellerdi. */}
        {onayIstenen && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Yasal onay"
            style={{
              // zIndex 80: yasal belge modalı da 80'de ve DOM'da BUNDAN SONRA
              // geliyor, yani belgeye dokunulduğunda üste biner. Bu sayfa
              // 80'in üstüne çıkarılırsa kullanıcı belgeyi okuyamadan sıkışır.
              position: 'absolute', inset: 0, zIndex: 80, display: 'flex',
              alignItems: 'flex-end', background: 'rgba(4,7,12,.62)',
              backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
            }}
            onClick={() => setOnayIstenen(null)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '100%', padding: '22px 24px calc(var(--safe-bottom, 0px) + 26px)',
                borderRadius: '28px 28px 0 0', background: '#0D121A',
                border: '1px solid rgba(255,255,255,.08)', borderBottom: 'none',
                boxShadow: '0 -12px 44px rgba(0,0,0,.5)',
                animation: 'auSheet .42s cubic-bezier(.22,1,.36,1) both',
              }}
            >
              <div style={{ width: 40, height: 4, borderRadius: 999, background: 'rgba(255,255,255,.18)', margin: '0 auto 18px' }} />
              <h2 style={{ margin: 0, fontSize: 19, fontWeight: 900, letterSpacing: '-.02em', color: '#fff' }}>
                Son bir adım
              </h2>
              <p style={{ margin: '10px 0 0', fontSize: 12.5, lineHeight: 1.65, fontWeight: 600, color: '#8B949E' }}>
                Devam etmek için{' '}
                <button type="button" className="au-link" style={{ color }} onClick={() => setOpenModal('KVKK')}>KVKK Aydınlatma Metni</button>
                {', '}
                <button type="button" className="au-link" style={{ color }} onClick={() => setOpenModal('PRIVACY')}>Gizlilik Politikası</button>
                {' ve '}
                <button type="button" className="au-link" style={{ color }} onClick={() => setOpenModal('TERMS')}>Kullanım Şartları</button>
                'nı onayla. Üçünü de okuyabilir, sonra devam edebilirsin.
              </p>
              <button
                type="button"
                className="au-cta"
                style={{
                  marginTop: 20, background: `linear-gradient(120deg, ${color} 0%, ${light} 100%)`,
                  color: '#0A0E14', boxShadow: `0 0 20px 0 ${color}57, inset 0 1px 0 rgba(255,255,255,.28)`,
                }}
                /* Onay ile eylem arasına ADIM GİRMEZ: araya setTimeout/await
                   girseydi tarayıcı kullanıcı jestini tükenmiş sayar ve
                   Google/Apple açılır penceresini engellerdi. */
                onClick={onaylaVeDevamEt}
              >
                <Check size={16} strokeWidth={3} />
                <span>ONAYLIYORUM VE DEVAM ET</span>
              </button>
              <button
                type="button"
                className="au-ghost"
                style={{ marginTop: 10 }}
                onClick={() => setOnayIstenen(null)}
              >
                VAZGEÇ
              </button>
            </div>
          </div>
        )}

        {/* ═══ ŞİFREMİ UNUTTUM ═══ */}
        {unuttumAcik && (
          <Suspense fallback={null}>
            <SifremiUnuttum
              baslangicEpostasi={form.eposta}
              renk={color}
              light={light}
              onKapat={() => setUnuttumAcik(false)}
              onBasarili={(eposta) => {
                // Şifre değişti: kullanıcıyı giriş kipine, e-postası dolu ve
                // şifre alanı boş olarak bırak. Otomatik giriş YAPILMAZ —
                // yeni şifresini bir kez kendi eliyle yazması, onu hatırladığını
                // hem kendisine hem bize gösterir.
                setUnuttumAcik(false);
                setKip('giris');
                setForm({ adSoyad: '', eposta, sifre: '' });
                setError(null);
                setBilgi('Şifren değişti. Yeni şifrenle giriş yapabilirsin.');
              }}
            />
          </Suspense>
        )}

        {/* ═══ E-POSTA ONAYI BEKLENİYOR ═══
            Sunucuda e-posta doğrulaması AÇIKSA kayıt oturum döndürmez. Bu
            perde olmasaydı kullanıcı "kaydoldum ama hiçbir şey olmadı" ekranında
            kalır ve aynı e-postayla tekrar tekrar denerdi (ikinci denemede de
            "bu e-posta zaten kayıtlı" hatası alırdı — çıkışsız bir döngü). */}
        {onayBekleyenEposta && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="E-posta onayı bekleniyor"
            style={{
              position: 'absolute', inset: 0, zIndex: 82, display: 'flex', alignItems: 'flex-end',
              background: 'rgba(4,7,12,.72)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
            }}
          >
            <div style={{
              width: '100%', padding: '24px 24px calc(var(--safe-bottom, 0px) + 26px)',
              borderRadius: '28px 28px 0 0', background: '#0D121A',
              border: '1px solid rgba(255,255,255,.08)', borderBottom: 'none',
              animation: 'auSheet .42s cubic-bezier(.22,1,.36,1) both',
            }}>
              <div style={{ width: 40, height: 4, borderRadius: 999, background: 'rgba(255,255,255,.18)', margin: '0 auto 18px' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <MailCheck size={22} color={color} />
                <h2 style={{ margin: 0, fontSize: 19, fontWeight: 900, letterSpacing: '-.02em', color: '#fff' }}>
                  Hesabın açıldı
                </h2>
              </div>
              <p style={{ margin: '12px 0 0', fontSize: 13, lineHeight: 1.65, fontWeight: 600, color: '#8B949E' }}>
                <strong style={{ color: '#fff' }}>{onayBekleyenEposta}</strong> adresine bir doğrulama
                bağlantısı gönderdik. Bağlantıya dokunduktan sonra buradan giriş yapabilirsin.
              </p>
              <button
                type="button"
                className="au-cta"
                style={{
                  marginTop: 20, background: `linear-gradient(120deg, ${color} 0%, ${light} 100%)`,
                  color: '#0A0E14',
                }}
                onClick={() => {
                  // Giriş kipine geç: kullanıcı postayı onayladıktan sonra
                  // aynı ekrandan devam edebilsin.
                  setOnayBekleyenEposta(null);
                  setKip('giris');
                  setForm((f) => ({ ...f, adSoyad: '', sifre: '' }));
                }}
              >
                <Check size={16} strokeWidth={3} />
                <span>ONAYLADIM, GİRİŞ YAP</span>
              </button>
              {/* HER ZAMAN ÇALIŞAN ÇIKIŞ: posta gelmezse kullanıcı sıkışmasın.
                  Sağlayıcı girişi sunucudaki e-posta ayarına bağlı değildir. */}
              <p style={{ margin: '14px 2px 0', fontSize: 11.5, lineHeight: 1.6, color: '#59636e', textAlign: 'center' }}>
                Posta gelmezse Google ya da Apple hesabınla da girebilirsin —
                aynı e-postaysa aynı hesaba düşersin.
              </p>
            </div>
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
