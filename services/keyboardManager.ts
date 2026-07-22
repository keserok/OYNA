import { Capacitor } from '@capacitor/core';

// ─── Global klavye yöneticisi (MOB-S2) ───────────────────────────────────────
// Sorun: native klavye açılınca alttaki form alanları (kayıt: Ad Soyad /
// E-posta / Şifre, maç adı, takım adları...) klavyenin ARKASINDA kalıyordu.
// Çözüm üç parça:
//   1. Klavye yüksekliği --kb-height CSS değişkenine yazılır; index.css'teki
//      body.kb-open kuralları kaydırılabilir gövdelere o kadar alt boşluk verir.
//   2. Odaklanan alan, klavye yerleştikten sonra scrollIntoView(center) ile
//      görünür bölgeye taşınır (en yakın kaydırılabilir atası kayar).
//   3. iOS'un odak anında belgeyi zorla kaydırma huyu window.scrollTo(0,0)
//      ile geri alınır (sabit kabuk MOB-S1 belge kaydırmasını zaten kilitler).
// Yalnız native platformda dinleyici kurar; web'de sessiz no-op.

const EDITABLE = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

const isEditable = (el: Element | null): el is HTMLElement =>
  !!el && (EDITABLE.has(el.tagName) || (el as HTMLElement).isContentEditable);

const scrollFocusedIntoView = () => {
  const el = document.activeElement;
  if (!isEditable(el)) return;
  try {
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  } catch {
    el.scrollIntoView();
  }
};

export const initKeyboardManager = (): (() => void) => {
  if (!Capacitor.isNativePlatform()) return () => {};

  const root = document.documentElement;
  const timers: number[] = [];
  const later = (fn: () => void, ms: number) => { timers.push(window.setTimeout(fn, ms)); };
  let cleanupListeners: (() => void) | null = null;
  let cancelled = false;

  // Odak: klavye animasyonu (~250ms) yerleşince alanı ortala. Klavye kapalıyken
  // odaklanmada da çalışır (show olayı ayrıca tetikler — çift çağrı zararsız).
  const onFocusIn = (e: FocusEvent) => {
    if (!isEditable(e.target as Element)) return;
    later(scrollFocusedIntoView, 300);
  };
  document.addEventListener('focusin', onFocusIn);

  void (async () => {
    try {
      const { Keyboard } = await import('@capacitor/keyboard');
      if (cancelled) return;
      const show = await Keyboard.addListener('keyboardWillShow', (info) => {
        root.style.setProperty('--kb-height', `${info.keyboardHeight || 0}px`);
        document.body.classList.add('kb-open');
        // iOS bazı durumlarda odak alanını göstermek için belgeyi kaydırır;
        // sabit kabukta bu görsel kaymayı geri al ve alanı biz konumlandıralım.
        window.scrollTo(0, 0);
        later(scrollFocusedIntoView, 120);
        later(scrollFocusedIntoView, 360);
      });
      const hide = await Keyboard.addListener('keyboardWillHide', () => {
        root.style.setProperty('--kb-height', '0px');
        document.body.classList.remove('kb-open');
        window.scrollTo(0, 0);
      });
      cleanupListeners = () => { void show.remove(); void hide.remove(); };
    } catch (err) {
      console.warn('[keyboardManager] Keyboard eklentisi kurulamadı:', err);
    }
  })();

  return () => {
    cancelled = true;
    document.removeEventListener('focusin', onFocusIn);
    timers.forEach(clearTimeout);
    cleanupListeners?.();
    root.style.setProperty('--kb-height', '0px');
    document.body.classList.remove('kb-open');
  };
};
