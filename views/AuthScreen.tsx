import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Check, ArrowRight, ChevronLeft } from 'lucide-react';
import { UserRole } from '../types';
import { loginWithGoogle, loginWithApple, oauthDonusunuOku } from '../supabaseAuth';
import { useAppStore } from '../store';
// IP-15: yasal belgeler artık ÖZET değil TAM metin (karar 7b) — 39 KB. Statik
// import edilirse giriş paketine girer ve belgeyi hiç açmayan kullanıcı da
// indirir. Modal yalnız bağlantıya dokununca yüklenir; tip import'u derlemede
// silindiği için paketi etkilemez.
const LegalModal = lazy(() =>
  import('../components/common/LegalModal').then((m) => ({ default: m.LegalModal })));
import type { LegalModalKind } from '../components/common/LegalModal';
// KLAVYE PAYI KALDIRILDI (23 Ağu 2026): bu ekranda artık hiçbir yazı alanı
// yok — yalnız Apple/Google düğmeleri ve onay kutusu var. Klavye hiç açılmaz.
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
//   input : Apple · Google — BAŞKA GİRİŞ YOLU YOK
//
// ─────────────────────────────────────────────────────────────────────────────
// TELEFON VE DEMO YOLLARI BU EKRANDAN SİLİNDİ (23 Ağustos 2026, kurucu kararı:
// "Bu ekranın tüm uygulamadan yok etmelisin ve yalnızca Apple ve Google
// girişinin kalmasını sağlamalısın.")
//
// NEDEN BAYRAK YETMEDİ: telefon alanı, kod ekranı ve demo hesap seçici
// bayraklarla (TELEFON_GIRISI_ACIK, VITE_DEMO_ACCOUNTS, VITE_DEV_MODE)
// karartılmıştı — kod yerinde duruyordu. Bir bayrak yanlış ortama yazıldığında
// ekran geri geliyordu ve kurucu aynı ekranı üç kez bildirdi. Bayrak
// silinemeyen bir şeyi gizler; burada silinmesi gereken bir şey vardı.
//
// SMS ALTYAPISI ZATEN YOK: Supabase projesinde SMS sağlayıcısı yapılandırılmamış
// (hook_send_sms_enabled=false). Yani "KOD GÖNDER" düğmesi hiçbir zaman
// çalışmadı; ekranda duran ölü bir yoldu. Apple'ın 5.6 reddinin kökü de buydu.
// Telefon YENİDEN gerekirse tarih: git history · views/AuthScreen.tsx@974402d.
//
// Numara BAĞLAMA ekranı (PhoneLinkScreen) ayrı bir şeydir ve durur: ileride
// ödeme için numara istenirse oradan istenir. Ama GİRİŞ yolu değildir.
// ─────────────────────────────────────────────────────────────────────────────
type Stage = 'intro' | 'input';

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
  // Kayıt/giriş ayrımı KALDIRILDI: telefonla tek akış var. `authStartMode`
  // bayrağı (kayıt kapısından "kaydol"a mı "giriş"e mi basıldığı) artık ekranın
  // görünümünü değiştirmiyor, ama kapı onu hâlâ yazıyor — okunup TEMİZLENİR ki
  // bir sonraki açılış eski bir niyetle karşılaşmasın.
  useEffect(() => { useAppStore.getState().setAuthStartMode(null); }, []);
  // Yasal onay OPT-IN olmalı: kutu önceden işaretli gelemez (KVKK/mağaza incelemesi)
  const [agreed, setAgreed] = useState(false);
  const [isLoading, setIsLoading] = useState<'google' | 'apple' | null>(null);
  const [error, setError] = useState<string | null>(
    oauthDonusu ? mapOAuthDonusu(oauthDonusu.saglayici, oauthDonusu.kod, oauthDonusu.aciklama) : null);
  // IP-15: anahtarlar artık resmi belge anahtarları — modal tam metni
  // shared/legalDocs.ts'ten okur, Ayarlar → Yasal ile birebir aynı.
  const [openModal, setOpenModal] = useState<LegalModalKind | null>(null);

  // Tanıtım bir kez görüldü: aynı oturumda AUTH'a tekrar düşülürse atlanır.
  useEffect(() => { introShownThisSession = true; }, []);

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

  // MİSAFİR MODU KALDIRILDI (kurucu kararı, 17 Ağu 2026): "önce göz at" yolu
  // kapatıldı. Uygulamaya girmek için hesap gerekiyor.

  const clearFeedback = () => setError(null);

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
                paddingBottom: 26,
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
                  Sahaya çık
                </h1>
                <p style={{ margin: '10px 0 0', fontSize: 14, lineHeight: 1.5, fontWeight: 500, color: '#8B949E', letterSpacing: '-.01em' }}>
                  Apple ya da Google hesabınla tek dokunuşta gir. Şifre yok, uğraş yok.
                </p>
              </div>

              {/* ─── UYGULAMANIN TEK GİRİŞ YOLU: Apple · Google ───────────
                  Alt alta ve tam genişlikte: başka yol olmadığı için bunlar
                  ekranın ana eylemidir, ikincil bir şerit değil.
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
                    <span>Google</span>
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
                    <span>Apple</span>
                  </button>
                </div>

                {error && (
                  <p role="alert" aria-live="assertive" style={{ margin: '11px 2px 0', fontSize: 11.5, fontWeight: 700, lineHeight: 1.5, color: '#FF4D4D' }}>{error}</p>
                )}

                {/* KVKK + Sözleşme onayı */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginTop: 22, padding: '0 2px' }}>
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

                {/* ─── Yasal bağlantılar ───
                    Eskiden burada kod gönderme düğmesi vardı; telefon yolu
                    silindiği için giriş eylemi yukarıdaki Apple/Google
                    düğmeleridir. Ekranın altında yalnız yasal bağlantılar
                    kalır. */}
                <div style={{ marginTop: 'auto', paddingTop: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, paddingTop: 2 }}>
                    <button type="button" className="au-footlink" onClick={() => setOpenModal('TERMS')}>Kullanım Şartları</button>
                    <span style={{ fontSize: 10, color: '#3a434e' }}>|</span>
                    <button type="button" className="au-footlink" onClick={() => setOpenModal('KVKK')}>KVKK Aydınlatma Metni</button>
                  </div>
                </div>
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
