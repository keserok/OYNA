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

/** Alan ile klavyenin üst kenarı arasında bırakılan nefes payı (px). */
export const KLAVYE_PAYI = 20;

/**
 * Odaklanan alanı klavyenin hemen üstüne getirmek için kapsayıcının NE KADAR
 * kaydırılması gerektiğini hesaplar. Saf fonksiyon — DOM'a dokunmaz, bu yüzden
 * test edilebilir (bkz. tests/unit/klavyeKonumu.test.ts).
 *
 * @param alanUst     alanın ekrandaki üst kenarı (getBoundingClientRect().top)
 * @param alanAlt     alanın ekrandaki alt kenarı
 * @param gorunurYuk  klavyenin ÜSTÜNDE kalan görünür yükseklik
 * @returns kaydırma miktarı (+ aşağı, − yukarı) ya da gerek yoksa `null`
 */
export function kaydirmaMiktari(
  alanUst: number,
  alanAlt: number,
  gorunurYuk: number,
  pay: number = KLAVYE_PAYI,
): number | null {
  const hedefAlt = gorunurYuk - pay;
  // Alan tamamen görünüyorsa dokunma — gereksiz kaydırma titreme yaratır.
  if (alanAlt <= hedefAlt && alanUst >= pay) return null;
  // Üst kenarın dışına taşmışsa yukarı çek; değilse klavyenin üstüne al.
  return alanUst < pay ? alanUst - pay : alanAlt - hedefAlt;
}

/**
 * En yakın GERÇEKTEN kaydırılabilir atayı bulur.
 * `overflow-y` uygun olsa bile içerik sığıyorsa o eleman kaymaz; bu yüzden
 * scrollHeight/clientHeight karşılaştırması da yapılır. Aksi hâlde yanlış
 * kapsayıcı seçilip hiçbir şey kaymıyordu.
 */
const kaydirilabilirAta = (el: HTMLElement): HTMLElement | null => {
  let p: HTMLElement | null = el.parentElement;
  while (p) {
    const s = getComputedStyle(p);
    if (/(auto|scroll|overlay)/.test(s.overflowY) && p.scrollHeight > p.clientHeight + 1) return p;
    p = p.parentElement;
  }
  return null;
};

/**
 * Odaklanan alanı klavyenin HEMEN ÜSTÜNE taşır.
 *
 * Eskiden `scrollIntoView({ block: 'center' })` çağrılıyordu: alan kaydırma
 * kabının ORTASINA gidiyordu. Kap tüm ekran yüksekliğinde olduğu için "orta"
 * ekranın %50'sidir — klavye ekranın %45-55'ini kapladığında alan klavyenin
 * ARKASINDA kalabiliyordu. Artık görünür yüksekliğe göre hesaplanıyor.
 */
const scrollFocusedIntoView = () => {
  const el = document.activeElement;
  if (!isEditable(el)) return;

  // Klavyenin üstünde kalan görünür yükseklik.
  // visualViewport en güvenilir kaynaktır (klavye açılınca kendisi küçülür);
  // desteklenmiyorsa --kb-height'tan hesaplanır.
  const kb = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--kb-height'),
  ) || 0;
  const gorunurYukseklik = window.visualViewport?.height ?? window.innerHeight - kb;

  const r = el.getBoundingClientRect();
  const fark = kaydirmaMiktari(r.top, r.bottom, gorunurYukseklik);
  if (fark === null) return; // zaten görünür

  const kapsayici = kaydirilabilirAta(el);
  if (kapsayici) {
    kapsayici.scrollTo({ top: kapsayici.scrollTop + fark, behavior: 'smooth' });
    return;
  }
  try {
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
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

  // Emniyet katmanı: bazı Android klavyeleri (ve tahmin/emoji şeridi açılıp
  // kapandığında) Capacitor'ün keyboardWillShow olayını tetiklemez ya da
  // yüksekliği sonradan değiştirir. visualViewport küçüldüğünde alanı yeniden
  // konumlandırırız — eklenti olayı gelmese de alan klavyenin altında kalmaz.
  const vv = window.visualViewport;
  const onViewportResize = () => { later(scrollFocusedIntoView, 60); };
  vv?.addEventListener('resize', onViewportResize);

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
    vv?.removeEventListener('resize', onViewportResize);
    timers.forEach(clearTimeout);
    cleanupListeners?.();
    root.style.setProperty('--kb-height', '0px');
    document.body.classList.remove('kb-open');
  };
};
