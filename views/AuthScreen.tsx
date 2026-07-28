import React, { useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Check, Mail, ArrowRight, ChevronLeft, KeyRound, Lock, User, Eye, EyeOff, Users, ChevronDown, CheckCircle2 } from 'lucide-react';
import { UserRole } from '../types';
import {
  loginWithGoogle, loginWithApple, sendEmailOtp, verifyEmailOtp, demoLogin,
  isDemoLoginEnabled, isDemoLoginInput, isDemoAccountPickerEnabled, loginDemoAccount,
  signInWithEmailPassword, signUpWithPassword, requestPasswordReset, confirmPasswordReset,
} from '../supabaseAuth';
import { DEMO_ACCOUNT_GROUPS } from '../data/demoAccounts';
import { getHasAccount } from '../supabaseClient';
import { useAppStore } from '../store';
import { LegalModal } from '../components/common/LegalModal';
import heroEmblem from '../assets/auth/hero-emblem.webp';
import oynaLogo from '../assets/onboarding/oyna-logo.webp';

interface AuthScreenProps {
  /** App tarafından geçilir ama BİLEREK çağrılmaz: başarı sonrası yönlendirmeyi
      App'teki onAuthStateChanged dinleyicisi yapar (profildeki GERÇEK role göre).
      Buradan çağrılırsa kaleci/hakem/tesis yanlışlıkla oyuncu paneline düşerdi. */
  onSuccess: () => void;
  onBack: () => void;
  role?: UserRole | null;
}

// ─── Akış ────────────────────────────────────────────────────────────────────
// SPLASH (ilk animasyon) → [intro → input → (otp | reset)] → ONBOARDING
//   intro : cam amblem perdesi + "İSTEDİĞİN ZAMAN oyna!" tanıtımı
//   input : giriş/kayıt alt sayfası (Google/Apple + e-posta & şifre)
//   otp   : "kod ile giriş" — 6 haneli e-posta kodu
//   reset : şifremi unuttum — kod + yeni şifre (tek ekran)
type Stage = 'intro' | 'input' | 'otp' | 'reset';

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
@keyframes auSweep { 0%, 52% { opacity: 0; transform: translateX(-140px) skewX(-14deg); } 66% { opacity: 1; } 100% { opacity: 0; transform: translateX(100%) skewX(-14deg); } }
@keyframes auSwing { from { transform: translateX(0); } to { transform: translateX(calc(100% - 56px)); } }
@keyframes auSpinLogo { from { transform: rotate(0deg); } to { transform: rotate(342deg); } }
@keyframes auToast { from { opacity: 0; transform: translateY(-18px) scale(.94); } to { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes auRing { to { transform: rotate(360deg); } }

.au-field { height: 56px; padding: 0 18px; border-radius: 20px; background: #0A0E14; border: 1px solid #1f2937; display: flex; align-items: center; gap: 12px; transition: border-color .2s ease; }
.au-field:focus-within { border-color: rgba(255,255,255,.4); }
.au-input { flex: 1; min-width: 0; background: transparent; border: none; outline: none; color: #fff; font-size: 14px; font-weight: 700; }
.au-input::placeholder { color: #4b5563; font-weight: 600; }
.au-social { flex: 1; height: 54px; border-radius: 999px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 9px; background: rgba(22,27,34,.55); border: 1px solid rgba(255,255,255,.08); color: #fff; font-size: 13px; font-weight: 700; transition: background .3s cubic-bezier(.16,1,.3,1), border-color .3s, transform .3s cubic-bezier(.16,1,.3,1); }
.au-social:hover:not(:disabled) { background: rgba(30,36,45,.8); border-color: rgba(255,255,255,.15); transform: translateY(-2px); }
.au-social:active:not(:disabled) { transform: scale(.97); }
.au-social:disabled { opacity: .55; cursor: default; }
.au-cta { width: 100%; height: 58px; border-radius: 999px; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 9px; font-size: 13px; font-weight: 900; letter-spacing: .1em; transition: box-shadow .35s cubic-bezier(.16,1,.3,1), transform .35s cubic-bezier(.16,1,.3,1); }
.au-cta:not(:disabled):hover { transform: translateY(-2px) scale(1.01); }
.au-cta:not(:disabled):active { transform: scale(.98); }
.au-cta:disabled { cursor: default; }
.au-ghost { width: 100%; height: 50px; border-radius: 999px; cursor: pointer; background: transparent; border: 1px solid rgba(255,255,255,.1); color: #8B949E; font-size: 11px; font-weight: 900; letter-spacing: .12em; display: flex; align-items: center; justify-content: center; gap: 8px; transition: background .25s, color .25s; }
.au-ghost:hover:not(:disabled) { background: rgba(255,255,255,.05); color: #fff; }
.au-ghost:disabled { opacity: .45; cursor: default; }
.au-link { background: none; border: none; padding: 2px; cursor: pointer; font: inherit; font-weight: 700; text-decoration: underline; text-underline-offset: 3px; }
.au-iconbtn { width: 40px; height: 40px; border-radius: 50%; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,.07); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); color: #fff; transition: background .2s, transform .2s; }
.au-iconbtn:hover { background: rgba(255,255,255,.14); }
.au-iconbtn:active { transform: scale(.95); }
.au-next { width: 64px; height: 64px; border-radius: 50%; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; color: #0A0E14; transition: box-shadow .35s cubic-bezier(.16,1,.3,1), transform .35s cubic-bezier(.16,1,.3,1); }
.au-next:hover { transform: translateY(-2px); }
.au-next:active { transform: scale(.96); }
.au-spin { width: 15px; height: 15px; border-radius: 50%; border: 2px solid currentColor; border-top-color: transparent; animation: auRing .7s linear infinite; flex-shrink: 0; }
.au-switch { width: 100%; background: none; border: none; padding: 4px; cursor: pointer; font-size: 11.5px; font-weight: 700; color: #8B949E; transition: color .2s; }
.au-switch:hover { color: #fff; }
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

  const [stage, setStage] = useState<Stage>(introShownThisSession ? 'input' : 'intro');
  // Kayıt-öncelikli akış: bu cihazda daha önce hiç oturum açılmadıysa KAYIT,
  // açıldıysa (çıkış yapmış kullanıcı) GİRİŞ ekranıyla başla.
  const [isRegister, setIsRegister] = useState(() => !getHasAccount());
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [otp, setOtp] = useState('');
  // Yasal onay OPT-IN olmalı: kutu önceden işaretli gelemez (KVKK/mağaza incelemesi)
  const [agreed, setAgreed] = useState(false);
  const [isLoading, setIsLoading] = useState<
    'send' | 'verify' | 'guest' | 'google' | 'apple' | 'password' | 'register' | 'forgot' | 'reset' | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [openModal, setOpenModal] = useState<'kvkk' | 'sozlesme' | null>(null);
  // Demo hesap seçici (main'de aktif): açık/kapalı + o an giriş yapılan hesap
  const [demoPickerOpen, setDemoPickerOpen] = useState(false);
  const [demoLoggingIn, setDemoLoggingIn] = useState<string | null>(null);

  // Dev/demo modunda "mirackerem" gibi @ içermeyen kısayollar da geçerli sayılır
  const demoMode = isDemoLoginEnabled();
  const showDemoPicker = isDemoAccountPickerEnabled() && DEMO_ACCOUNT_GROUPS.length > 0;
  const contactValid = isValidEmail(email) || isDemoLoginInput(email);
  const contactLabel = email.trim() || 'E-posta';

  // Tanıtım bir kez görüldü: aynı oturumda AUTH'a tekrar düşülürse atlanır.
  useEffect(() => { introShownThisSession = true; }, []);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setInterval(() => setResendIn((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(t);
  }, [resendIn]);

  const requestOtp = async () => {
    await sendEmailOtp(email.trim());
  };

  const handleSendOtp = async () => {
    if (!agreed || !contactValid || isLoading) return;
    setError(null);
    // Dev/demo modu: demo hesabı (veya "mirackerem") → OTP'siz anında giriş.
    // onSuccess() ÇAĞIRMA: o anda yerel `role` hâlâ eski (PLAYER) olduğundan owner'ı
    // yanlışlıkla DASHBOARD'a yönlendirir. Bunun yerine App'teki onAuthStateChanged
    // dinleyicisi profildeki GERÇEK rolü (OWNER/PLAYER) okuyup doğru panele yönlendirir.
    if (demoMode && isDemoLoginInput(email)) {
      setIsLoading('send');
      try {
        await demoLogin(email.trim());
        // navigasyonu auth dinleyicisine bırak (rol-doğru yönlendirme)
      } catch (err: any) {
        console.error('Demo giriş hatası:', err);
        setError(err?.message || 'Demo giriş başarısız.');
        setIsLoading(null);
      }
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
      setError(err?.message || 'Doğrulama kodu gönderilemedi. Lütfen tekrar deneyin.');
    } finally {
      setIsLoading(null);
    }
  };

  const handleResend = async () => {
    if (resendIn > 0 || isLoading) return;
    setError(null);
    setIsLoading(stage === 'reset' ? 'forgot' : 'send');
    try {
      // reset aşamasında "tekrar gönder" şifre sıfırlama kodunu yeniden yollar.
      if (stage === 'reset') await requestPasswordReset(email.trim());
      else await requestOtp();
      setResendIn(60);
      setInfo('Yeni kod gönderildi.');
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
      await verifyEmailOtp(email.trim(), otp);
      // onSuccess() ÇAĞIRMA: yerel `role` hâlâ eski (PLAYER) olduğundan kaleci/
      // hakem/tesis'i yanlışlıkla oyuncu Dashboard'ına düşürür. Navigasyonu App'teki
      // onAuthStateChanged dinleyicisine bırak (profildeki GERÇEK role göre yönlendirir).
      // Spinner, dinleyici doğru panele yönlendirip bu ekranı kaldırana dek döner.
    } catch (err: any) {
      console.error('OTP doğrulama hatası:', err);
      setError(err?.message || 'Kod hatalı veya süresi dolmuş.');
      setIsLoading(null);
    }
  };

  // ─── E-posta + Şifre ile giriş ─────────────────────────────────────────────
  const handlePasswordLogin = async () => {
    if (!requireAgreement()) return;
    if (!contactValid) { setError('Geçerli bir e-posta adresi gir.'); return; }
    if (!password) { setError('Şifreni gir.'); return; }
    if (isLoading) return;
    setError(null);
    setInfo(null);
    // Dev/demo modu: demo hesabı (veya "mirackerem") → şifre kontrolü olmadan
    // sabit demo şifresiyle anında giriş. Prod'da isDemoLoginEnabled=false.
    if (demoMode && isDemoLoginInput(email)) {
      setIsLoading('password');
      try {
        await demoLogin(email.trim());
        // navigasyonu auth dinleyicisine bırak (rol-doğru yönlendirme)
      } catch (err: any) {
        console.error('Demo giriş hatası:', err);
        setError(err?.message || 'Demo giriş başarısız.');
        setIsLoading(null);
      }
      return;
    }
    setIsLoading('password');
    try {
      await signInWithEmailPassword(email.trim(), password);
      // onSuccess() ÇAĞIRMA: yerel `role` hâlâ eski (PLAYER) olduğundan kaleci/
      // hakem/tesis'i yanlışlıkla oyuncu Dashboard'ına düşürür (dinleyici sonra
      // gerçek rolü okusa da view artık allowlist'te olmadığından düzeltemez).
      // Navigasyonu App'teki onAuthStateChanged dinleyicisine bırak. Spinner,
      // dinleyici doğru panele yönlendirip bu ekranı kaldırana dek döner.
    } catch (err: any) {
      console.error('[Auth] Şifreli giriş hatası:', err);
      setError('E-posta veya şifre hatalı. Şifreni unuttuysan sıfırlayabilir ya da kod ile girebilirsin.');
      setIsLoading(null);
    }
  };

  // ─── E-posta + Şifre ile kayıt ─────────────────────────────────────────────
  const handleRegister = async () => {
    if (!requireAgreement()) return;
    if (!isValidEmail(email)) { setError('Geçerli bir e-posta adresi gir.'); return; }
    if (name.trim().length < 2) { setError('Ad Soyad alanını doldur.'); return; }
    if (password.length < 6) { setError('Şifre en az 6 karakter olmalı.'); return; }
    if (isLoading) return;
    setError(null);
    setInfo(null);
    setIsLoading('register');
    try {
      const res = await signUpWithPassword(email.trim(), password, name.trim());
      if (res?.session) {
        // Oturum açıldı → navigasyonu App'teki onAuthStateChanged dinleyicisine bırak:
        // yeni kullanıcıda profili oluşturup ONBOARDING'e yönlendirir. onSuccess()
        // burada DASHBOARD'a zorlarsa hem onboarding atlanır hem stale-role sorunu
        // yaşanır. Spinner, dinleyici yönlendirene dek döner.
      } else {
        // E-posta onayı açık: oturum yok → doğrulama beklenir.
        setInfo('Hesabın oluşturuldu. Giriş yapmak için e-postana gönderilen bağlantıyı onayla.');
        setIsRegister(false);
        setIsLoading(null);
      }
    } catch (err: any) {
      const m = String(err?.message || '').toLowerCase();
      if (m.includes('already') || m.includes('registered') || m.includes('exists')) {
        // Ölü uç bırakma: e-postası korunmuş hâlde giriş moduna geçir.
        setIsRegister(false);
        setInfo('Bu e-posta zaten kayıtlı — şifrenle giriş yapabilirsin.');
      } else {
        setError(err?.message || 'Kayıt başarısız. Lütfen tekrar dene.');
      }
      setIsLoading(null);
    }
  };

  // ─── Şifremi unuttum — kodu iste ve tek ekranda sıfırlamaya geç ────────────
  const handleForgot = async () => {
    if (isLoading) return;
    if (!isValidEmail(email)) {
      setError('Sıfırlama kodu gönderebilmemiz için önce e-posta adresini gir.');
      return;
    }
    setError(null);
    setInfo(null);
    setIsLoading('forgot');
    try {
      await requestPasswordReset(email.trim());
      setStage('reset');
      setOtp('');
      setNewPassword('');
      setResendIn(60);
      setInfo('Bu e-posta kayıtlıysa, 6 haneli sıfırlama kodu gönderildi.');
    } catch {
      setError('Kod gönderilemedi. Lütfen tekrar dene.');
    } finally {
      setIsLoading(null);
    }
  };

  // ─── Şifremi unuttum — kodu doğrula + yeni şifreyi yaz ─────────────────────
  const handleResetConfirm = async () => {
    if (otp.length < 6 || newPassword.length < 6 || isLoading) return;
    setError(null);
    setInfo(null);
    setIsLoading('reset');
    try {
      await confirmPasswordReset(email.trim(), otp, newPassword);
      setStage('input');
      setIsRegister(false);
      setPassword('');
      setOtp('');
      setNewPassword('');
      setInfo('Şifren güncellendi. Yeni şifrenle giriş yapabilirsin.');
    } catch (err: any) {
      const m = String(err?.message || '');
      if (m === 'invalid_or_expired') setError('Kod hatalı veya süresi dolmuş.');
      else if (m === 'too_many_attempts') setError('Çok fazla hatalı deneme. Yeni kod iste.');
      else if (m === 'weak_password') setError('Yeni şifre en az 6 karakter olmalı.');
      else setError('Şifre güncellenemedi. Lütfen tekrar dene.');
    } finally {
      setIsLoading(null);
    }
  };

  // KVKK/Sözleşme onayı işaretli değilken butonlar SESSİZCE pasif kalmasın:
  // dokununca ne yapılması gerektiği açıkça söylenir ("hiçbir şey olmuyor" hissi biter).
  function requireAgreement(): boolean {
    if (agreed) return true;
    setError("Devam etmek için önce KVKK Aydınlatma Metni'ni ve Kullanıcı Sözleşmesi'ni onayla.");
    return false;
  }

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
      setError(err?.message || 'Google ile giriş başarısız.');
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
      setError(err?.message || 'Apple ile giriş başarısız.');
    } finally {
      setIsLoading(null);
    }
  };

  // ─── Demo hesabıyla tek-dokunuşla giriş ────────────────────────────────────
  // Navigasyonu (Google/e-posta girişinde olduğu gibi) App'teki
  // onAuthStateChanged dinleyicisine bırakırız: profildeki GERÇEK role göre
  // doğru panele (oyuncu/tesis/kaleci/hakem) yönlendirir.
  const handleDemoAccountLogin = async (emailAddr: string, pass: string) => {
    if (isLoading || demoLoggingIn) return;
    if (!requireAgreement()) return;
    setError(null);
    setInfo(null);
    setDemoLoggingIn(emailAddr);
    try {
      await loginDemoAccount(emailAddr, pass);
      // navigasyon auth dinleyicisinde
    } catch (err: any) {
      console.error('[Auth] Demo hesap girişi hatası:', err);
      setError(err?.message || 'Demo hesabıyla giriş başarısız.');
      setDemoLoggingIn(null);
    }
  };

  const handleGuestLogin = () => {
    if (isLoading) return;
    setIsLoading('guest');
    // Misafir modu: oturum yok, salt-okur gezinme. Buton vaadiyle tutarlı
    // şekilde MAÇLARA götür; yazma aksiyonlarında kayıt kapısı açılır.
    const { setIsGuest, resetNavigation } = useAppStore.getState();
    setIsGuest(true);
    resetNavigation('MATCH_DISCOVERY');
  };

  const clearFeedback = () => { setError(null); setInfo(null); };

  const handleHeaderBack = () => {
    if (stage === 'otp' || stage === 'reset') {
      setStage('input');
      setOtp('');
      setNewPassword('');
      clearFeedback();
    } else if (stage === 'input') {
      // Alt sayfadan tanıtıma dön (tasarımdaki geri davranışı).
      setStage('intro');
      clearFeedback();
    } else {
      onBack();
    }
  };

  const isReset = stage === 'reset';
  const authReady = agreed && contactValid && password.length >= (isRegister ? 6 : 1)
    && (!isRegister || name.trim().length > 1);
  const otpReady = otp.length === 6 && (!isReset || newPassword.length >= 6);
  const busy = isLoading !== null || demoLoggingIn !== null;
  const ctaLabel = isRegister ? 'KAYIT OL' : 'GİRİŞ YAP';
  const ctaBusy = isLoading === (isRegister ? 'register' : 'password');
  const codeBusy = isLoading === (isReset ? 'reset' : 'verify');

  // Devre dışı görünüm: onay/alanlar eksikken buton sönük ama TIKLANABİLİR kalır
  // (dokununca eksik olanı söyler). Yükleme sırasında gerçekten kilitlenir.
  const ctaStyle = (ready: boolean): React.CSSProperties => ready
    ? { background: ctaGradient, color: '#0A0E14', boxShadow: `0 0 20px 0 ${color}57, inset 0 1px 0 rgba(255,255,255,.28)` }
    : { background: 'rgba(255,255,255,.05)', color: 'rgba(255,255,255,.32)' };

  const spinner = <span className="au-spin" aria-hidden="true" />;

  // ─── Ortak alt sayfa başlığı (geri + OYNA amblemi) ──────────────────────────
  const sheetHeader = (
    <div style={{
      position: 'absolute', top: 'calc(var(--safe-top, 0px) + 18px)', left: 0, right: 0,
      display: 'flex', alignItems: 'center', padding: '0 22px', zIndex: 5,
    }}>
      <button type="button" className="au-iconbtn" onClick={handleHeaderBack} aria-label="Geri git">
        <ChevronLeft size={20} strokeWidth={2.4} />
      </button>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, marginRight: 40 }}>
        <img src={oynaLogo} alt="" style={{ width: 30, height: 30, filter: 'brightness(1.15) drop-shadow(0 0 9px rgba(250,204,21,.55))' }} />
        <span style={{ fontSize: 19, fontWeight: 900, fontStyle: 'italic', color: '#fff' }}>OYNA</span>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 overflow-hidden select-none" style={{ background: '#0A0E14' }}>
      <style>{KEYFRAMES}</style>

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
        {stage === 'intro' && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', animation: 'auScaleIn .6s cubic-bezier(.22,1,.36,1) both' }}>
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
                  onClick={() => setStage('input')}
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
          <div style={{ position: 'absolute', inset: 0 }}>
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: CURTAIN,
              backdropFilter: 'blur(7px) saturate(.95)', WebkitBackdropFilter: 'blur(7px) saturate(.95)',
              background: 'rgba(10,14,20,.5)', animation: 'auFadeBlur .5s ease-out both', pointerEvents: 'none',
            }} />
            {sheetHeader}

            <div style={{
              position: 'absolute', left: 0, right: 0, bottom: 0,
              top: 'max(19%, calc(var(--safe-top, 0px) + 108px))',
              borderRadius: '34px 34px 0 0', background: 'rgba(13,18,26,.9)',
              backdropFilter: 'blur(28px) saturate(180%)', WebkitBackdropFilter: 'blur(28px) saturate(180%)',
              border: '1px solid rgba(255,255,255,.08)', borderBottom: 'none',
              boxShadow: '0 -12px 44px rgba(0,0,0,.5)', display: 'flex', flexDirection: 'column',
              overflow: 'hidden', animation: 'auSheet .6s cubic-bezier(.22,1,.36,1) both',
            }}>
              <div style={{ width: 40, height: 4, borderRadius: 999, background: 'rgba(255,255,255,.18)', margin: '14px auto 18px', flexShrink: 0 }} />

              <div
                className="custom-scrollbar"
                style={{
                  flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden',
                  display: 'flex', flexDirection: 'column', padding: '0 26px',
                  paddingBottom: 'calc(var(--safe-bottom, 0px) + var(--kb-height, 0px) + 26px)',
                }}
              >
                <div style={{ textAlign: 'center', marginBottom: 24 }}>
                  <div style={{ fontSize: 30, lineHeight: 1.06, fontWeight: 900, fontStyle: 'italic', textTransform: 'uppercase', letterSpacing: '-.02em', color: '#fff' }}>
                    {isRegister ? 'Hesap oluştur' : 'Hoş geldin!'}
                  </div>
                  <p style={{ margin: '9px 0 0', fontSize: 12.5, lineHeight: 1.55, color: '#8B949E' }}>
                    {isRegister
                      ? 'Bilgilerini gir, saniyeler içinde sahaya çık.'
                      : 'Devam etmek için hesabına giriş yap.'}
                  </p>
                </div>

                {/* Sosyal giriş — BİRİNCİL (§3.1: Google + Apple) */}
                <div style={{ display: 'flex', gap: 12 }}>
                  <button type="button" className="au-social" onClick={handleGoogleLogin} disabled={busy}>
                    {isLoading === 'google' ? spinner : (
                      <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true">
                        <path fill="#EA4335" d="M12.24 10.285V14.4h6.887c-.648 2.41-2.519 4.114-5.186 4.114-3.478 0-6.3-2.822-6.3-6.3 0-3.478 2.822-6.3 6.3-6.3 1.636 0 3.109.633 4.2 1.66l3.205-3.205C19.232 2.378 15.932 1 12.24 1 5.86 1 .7 6.16.7 12.54s5.16 11.54 11.54 11.54c6.645 0 11.755-4.664 11.755-11.755 0-.745-.067-1.462-.2-2.04H12.24z" />
                      </svg>
                    )}
                    <span>Google</span>
                  </button>
                  <button type="button" className="au-social" onClick={handleAppleLogin} disabled={busy}>
                    {isLoading === 'apple' ? spinner : (
                      <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 4.17c.66-.81 1.11-1.93.99-3.06-1 .04-2.22.67-2.94 1.5-.64.73-1.2 1.87-1.05 2.99 1.12.09 2.26-.56 3-1.43z" />
                      </svg>
                    )}
                    <span>Apple</span>
                  </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '22px 0' }}>
                  <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,.07)' }} />
                  <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.18em', textTransform: 'uppercase', color: '#59636e' }}>
                    {isRegister ? 'veya e-posta ile kayıt' : 'veya e-posta ile'}
                  </span>
                  <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,.07)' }} />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
                  {isRegister && (
                    <div className="au-field">
                      <User size={19} color="#6b7280" style={{ flexShrink: 0 }} />
                      <input
                        type="text"
                        autoComplete="name"
                        className="au-input"
                        placeholder="Ad Soyad"
                        aria-label="Ad Soyad"
                        value={name}
                        onChange={(e) => { setName(e.target.value); clearFeedback(); }}
                      />
                    </div>
                  )}
                  <div className="au-field">
                    <Mail size={19} color="#6b7280" style={{ flexShrink: 0 }} />
                    <input
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      className="au-input"
                      placeholder={demoMode ? 'demo e-postası veya "mirackerem"' : 'ornek@oyna.app'}
                      aria-label="E-posta adresi"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); clearFeedback(); }}
                    />
                  </div>
                  <div className="au-field">
                    <Lock size={19} color="#6b7280" style={{ flexShrink: 0 }} />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      autoComplete={isRegister ? 'new-password' : 'current-password'}
                      className="au-input"
                      placeholder={isRegister ? 'Şifre (en az 6 karakter)' : 'Şifre'}
                      aria-label="Şifre"
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); clearFeedback(); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { void (isRegister ? handleRegister() : handlePasswordLogin()); } }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
                      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#6b7280', display: 'flex', flexShrink: 0 }}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                {!isRegister && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 9 }}>
                    <button type="button" className="au-link" onClick={handleForgot} disabled={busy} style={{ fontSize: 11, color }}>
                      {isLoading === 'forgot' ? 'Kod gönderiliyor…' : 'Şifremi unuttum'}
                    </button>
                  </div>
                )}

                {demoMode && !isRegister && (
                  <p style={{ margin: '10px 2px 0', fontSize: 10, fontWeight: 700, color: '#39FF14' }}>
                    🧪 DEMO MODU: demo e-postasını yaz, şifre gerekmez. Sahip için "mirackerem".
                  </p>
                )}

                {error && (
                  <p style={{ margin: '11px 2px 0', fontSize: 11.5, fontWeight: 700, lineHeight: 1.5, color: '#FF4D4D' }}>{error}</p>
                )}

                {/* KVKK + Sözleşme onayı */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginTop: 15, padding: '0 2px' }}>
                  <button
                    id="agreement-checkbox"
                    type="button"
                    onClick={() => { setAgreed((v) => !v); setError(null); }}
                    aria-label="Yasal onay"
                    aria-pressed={agreed}
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
                    <button type="button" className="au-link" onClick={() => setOpenModal('kvkk')} style={{ color }}>KVKK Aydınlatma Metni</button>
                    'ni ve{' '}
                    <button type="button" className="au-link" onClick={() => setOpenModal('sozlesme')} style={{ color }}>Kullanıcı Sözleşmesi</button>
                    'ni okudum, kişisel verilerimin işlenmesini onaylıyorum.
                  </p>
                </div>

                <p style={{ margin: '10px 2px 0', fontSize: 10, color: '#59636e' }}>
                  Çıkış yapana kadar oturumun bu cihazda açık kalır.
                </p>

                {/* ─── Demo hesap seçici — GEÇİCİ (sonra kaldırılacak) ─── */}
                {showDemoPicker && (
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
                            Giriş için önce yukarıdaki KVKK/Sözleşme kutusunu onayla.
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
                <div style={{ marginTop: 'auto', paddingTop: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <button
                    type="button"
                    className="au-cta"
                    onClick={isRegister ? handleRegister : handlePasswordLogin}
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

                  {/* Kod ile giriş — ikincil (yalnız giriş modunda) */}
                  {!isRegister && (
                    <button type="button" className="au-ghost" onClick={handleSendOtp} disabled={busy || !agreed || !contactValid}>
                      {isLoading === 'send' ? spinner : 'KOD İLE GİRİŞ YAP'}
                    </button>
                  )}

                  <button type="button" className="au-switch" onClick={() => { setIsRegister((v) => !v); clearFeedback(); }}>
                    {isRegister ? 'Zaten hesabın var mı? Giriş yap' : 'Hesabın yok mu? Kayıt ol'}
                  </button>

                  {/* Önce göz at — kayıt olmadan keşfet (değer-kapısı modeli) */}
                  <button
                    id="guest-login-button"
                    type="button"
                    className="au-ghost"
                    onClick={handleGuestLogin}
                    disabled={busy || !agreed}
                  >
                    {isLoading === 'guest' ? spinner : 'ÖNCE MAÇLARA GÖZ AT'}
                  </button>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, paddingTop: 2 }}>
                    <button type="button" className="au-footlink" onClick={() => setOpenModal('sozlesme')}>Kullanıcı Sözleşmesi</button>
                    <span style={{ fontSize: 10, color: '#3a434e' }}>|</span>
                    <button type="button" className="au-footlink" onClick={() => setOpenModal('kvkk')}>KVKK Aydınlatma Metni</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══ KOD DOĞRULAMA / ŞİFRE SIFIRLAMA ═══ */}
        {(stage === 'otp' || stage === 'reset') && (
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
                  paddingBottom: 'calc(var(--safe-bottom, 0px) + var(--kb-height, 0px) + 30px)',
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
                    {isReset ? 'Şifreyi sıfırla' : 'E-postanı doğrula'}
                  </div>
                  <p style={{ margin: '9px 0 0', fontSize: 12.5, lineHeight: 1.55, color: '#8B949E' }}>
                    {isReset
                      ? `${contactLabel} adresine gelen kodu gir ve yeni şifreni belirle.`
                      : `${contactLabel} adresine gönderdiğimiz 6 haneli kodu gir.`}
                  </p>
                </div>

                <label htmlFor="auth-otp-input" style={{ display: 'block', textAlign: 'center', fontSize: 10, fontWeight: 800, letterSpacing: '.22em', textTransform: 'uppercase', color: '#6b7280', marginBottom: 10 }}>
                  {isReset ? 'Sıfırlama kodu' : 'Doğrulama kodu'}
                </label>
                <input
                  id="auth-otp-input"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="••••••"
                  aria-label={isReset ? '6 haneli sıfırlama kodu' : '6 haneli doğrulama kodu'}
                  value={otp}
                  autoFocus
                  onChange={(e) => { setOtp(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(null); }}
                  style={{
                    width: '100%', height: 64, boxSizing: 'border-box', borderRadius: 20,
                    background: '#0A0E14', border: '1px solid #1f2937', outline: 'none', textAlign: 'center',
                    color: '#fff', fontSize: 30, fontWeight: 900, letterSpacing: '.5em', textIndent: '.5em',
                  }}
                />

                {isReset && (
                  <div style={{ marginTop: 16 }}>
                    <label htmlFor="auth-newpass-input" style={{ display: 'block', fontSize: 10, fontWeight: 800, letterSpacing: '.22em', textTransform: 'uppercase', color: '#6b7280', margin: '0 2px 9px' }}>
                      Yeni Şifre
                    </label>
                    <div className="au-field">
                      <Lock size={19} color="#6b7280" style={{ flexShrink: 0 }} />
                      <input
                        id="auth-newpass-input"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        className="au-input"
                        placeholder="En az 6 karakter"
                        aria-label="Yeni şifre"
                        value={newPassword}
                        onChange={(e) => { setNewPassword(e.target.value); setError(null); }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
                        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#6b7280', display: 'flex', flexShrink: 0 }}
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>
                )}

                {error && (
                  <p style={{ margin: '13px 2px 0', fontSize: 11.5, fontWeight: 700, lineHeight: 1.5, textAlign: 'center', color: '#FF4D4D' }}>{error}</p>
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
                    onClick={isReset ? handleResetConfirm : handleVerify}
                    disabled={busy || !otpReady}
                    style={ctaStyle(otpReady)}
                  >
                    {codeBusy ? spinner : (
                      <>
                        <span>{isReset ? 'ŞİFREYİ GÜNCELLE' : 'DOĞRULA VE GİRİŞ YAP'}</span>
                        <ArrowRight size={16} strokeWidth={2.8} />
                      </>
                    )}
                  </button>
                  <button type="button" className="au-ghost" onClick={handleHeaderBack} disabled={busy}>
                    E-POSTAYI DEĞİŞTİR
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
          {openModal && <LegalModal openModal={openModal} setOpenModal={setOpenModal} />}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default AuthScreen;
