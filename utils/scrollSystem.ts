// ════════════════════════════════════════════════════════════════════════
// OYNA KAYDIRMA SİSTEMİ — TEK KAYNAK (SSOT)
// ------------------------------------------------------------------------
// Uygulamada kaydırma davranışını TEK yerden kuran motor. Kurulum bir kez
// (index.tsx) yapılır; bundan sonra açılan HER ekran otomatik olarak doğru
// davranır — ekran başına kod yazmak gerekmez.
//
// Ne yapar:
//   1) LASTİKLENME (yaylanma): bir kaydırıcının ucundayken parmağını daha
//      ileri çekersen içerik giderek AZALAN bir oranla esner; bırakınca
//      yerine yaylanarak döner. iOS ve Android'de birebir aynı hisseder,
//      çünkü hareketi tarayıcıya değil bu dosyaya yaptırıyoruz.
//   2) ATIŞ (fling) DEVAMI: uçtan içeri doğru sürükleyip bıraktığında liste
//      ölmez, sürtünmeyle yavaşlayarak devam eder; öbür uca çarparsa kısa
//      bir tokuşma yaylanması oynar.
//   3) HARİTA İPUCU: Leaflet haritasında tek parmakla sürüklemeye çalışan
//      kullanıcıya "iki parmak kullan" ipucunu gösterir (harita artık tek
//      parmağı sayfaya bırakıyor — bkz. components/map/mapBase.ts).
//
// NEDEN JS ile? Tarayıcının kendi yaylanması iOS'ta yumuşak, Android'de
// "gerilme parıltısı" olarak çıkar; ayrıca belge seviyesinde iOS'ta altta
// beyaz native şerit görünüyordu (bu yüzden index.css'te html/body
// `overflow:hidden` + `overscroll-behavior:none` ile KAPALI). Yaylanmayı
// belgeye değil, ekranların KENDİ kaydırıcılarına çizersek o hata geri
// gelmez ve iki platform aynı hisseder.
//
// NASIL çakışmaz? Kaymayı `transform` ile değil `translate` CSS özelliğiyle
// yazıyoruz. App.tsx'teki görünüm kaydırıcısı aynı zamanda bir Framer Motion
// öğesidir ve sayfa geçişinde `transform` yazar; `translate` ayrı bir özellik
// olduğu için ikisi birbirini EZMEZ, üst üste uygulanır.
// ════════════════════════════════════════════════════════════════════════

/** Uç sayılma toleransı — alt piksel yuvarlamaları "uçta değil" sanılmasın. */
const EDGE_EPS = 1.5;

/** Yön kilidi: parmağın niyeti (dikey mi yatay mı) bu kadar px sonra belli olur. */
const DIR_LOCK_PX = 6;

/** Esneme tavanı: kaydırıcı yüksekliğinin oranı VE mutlak sınır (ikisinin küçüğü).
 *  Kullanıcı kararı 5(c): esneme sınırlı olsun — yaklaşık bir parmak boyu. */
const STRETCH_RATIO = 0.28;
const STRETCH_MAX_PX = 132;

/** Geri yaylanma süresi (ms). */
const SPRING_MS = 380;

/** Atış eşiği ve sürtünme (60 fps kare başına çarpan). */
const FLING_MIN_V = 0.08;
const FRICTION = 0.94;

/** Harita ipucunun ekranda kalma süresi (ms). */
const MAP_HINT_MS = 1600;

/** Leaflet haritasında ipucu için açılan sınıf (CSS: mapBase.ts → OYNA_MAP_CSS). */
const MAP_HINT_CLASS = 'oyna-hint-on';

type Grab = {
  el: HTMLElement;
  startX: number;
  startY: number;
  /** Yön kilidi: null = henüz belli değil. 'h' → bu hareketi biz yönetmeyiz. */
  dir: null | 'v' | 'h';
  /** Kaydırmayı biz mi sürüyoruz (uçtan taşan bir çekiş başladı mı). */
  owned: boolean;
  /** Devralma anındaki scrollTop ve parmak Y'si — sıçramasız devir için. */
  pinned: number;
  anchorY: number;
  maxScroll: number;
  stretch: number;
  /** O anki esneme miktarı (px, +aşağı). */
  offset: number;
  lastY: number;
  lastT: number;
  /** Parmak hızı (px/ms, + aşağı). */
  v: number;
};

let grab: Grab | null = null;
let raf = 0;
/** O an yaylanma animasyonu oynayan kaydırıcı — yarıda kesilirse temizlenir. */
let animEl: HTMLElement | null = null;
let installed = false;

// ── Yardımcılar ──────────────────────────────────────────────────────────

const now = (): number =>
  typeof performance !== 'undefined' ? performance.now() : Date.now();

/**
 * Sönümleme eğrisi: küçük çekişlerde parmakla 1:1, uzadıkça `max`a asimptotik
 * yaklaşır — yani "kenara gelince iyice yavaşlar" ve tavanı asla aşmaz.
 */
export const damp = (pull: number, max: number): number => (max * pull) / (pull + max);

/**
 * Devralınmış bir hareketin TEK karesi: parmak şu an nerede → kaydırıcı nereye
 * gitmeli ve ne kadar esnemeli.
 *
 * Saf fonksiyon (DOM'a dokunmaz) — davranışın sözü burada kilitlenir:
 *  • İçeride kalıyorsak esneme YOK, kaydırma parmakla birebir.
 *  • Uçtan taşıyorsak kaydırma UÇTA ÇAKILI kalır (5a: içerik boşluğa kaymaz),
 *    taşan miktar sönümlenerek esnemeye çevrilir ve `stretch` tavanını aşmaz.
 */
export function scrollStep(
  pinned: number,
  anchorY: number,
  y: number,
  maxScroll: number,
  stretch: number,
): { scrollTop: number; offset: number } {
  const desired = pinned - (y - anchorY);
  if (desired < 0) return { scrollTop: 0, offset: damp(-desired, stretch) };
  if (desired > maxScroll) return { scrollTop: maxScroll, offset: -damp(desired - maxScroll, stretch) };
  return { scrollTop: desired, offset: 0 };
}

/** Esnemeyi yaz/sil. 0'da özelliği TAMAMEN temizleriz: kalıcı bir `translate`
 *  değeri, içindeki `position:fixed` öğeler için kapsayıcı blok kurardı. */
function setOffset(el: HTMLElement, px: number): void {
  if (Math.abs(px) < 0.05) el.style.translate = '';
  else el.style.translate = `0 ${px.toFixed(2)}px`;
}

function cancelAnim(): void {
  if (raf) { cancelAnimationFrame(raf); raf = 0; }
}

/** Yarım kalmış bir yaylanmayı kes VE bıraktığı kaymayı sil. */
function stopAnim(): void {
  cancelAnim();
  if (animEl) { setOffset(animEl, 0); animEl = null; }
}

/**
 * Dokunulan noktadan yukarı çıkarak hareketi ALACAK dikey kaydırıcıyı bulur.
 *
 * İki bilinçli duruş:
 *  • `position:fixed` bir katmana çarparsak DURUR ve null döneriz. Üstte açık
 *    bir modal/alt sayfa varken arkadaki sayfa kaydırılmamalı; ayrıca kayma
 *    o sabit katmanı da sürüklerdi.
 *  • Yalnız YATAY kaydıran şeritleri (gün seçici, saha kartları) atlarız —
 *    onların üstünde dikey sürüklemek sayfayı kaydırmalı (kullanıcı kararı 6).
 */
export function findScroller(start: EventTarget | null): HTMLElement | null {
  let el: Element | null = start instanceof Element ? start : null;
  while (el && el !== document.body && el !== document.documentElement) {
    if (el instanceof HTMLElement) {
      if (el.hasAttribute('data-oyna-no-bounce')) return null;
      const cs = getComputedStyle(el);
      if (cs.position === 'fixed') return null;
      const oy = cs.overflowY;
      if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight - el.clientHeight > EDGE_EPS) {
        return el;
      }
    }
    el = el.parentElement;
  }
  return null;
}

// ── Animasyonlar ─────────────────────────────────────────────────────────

/** Esnemeyi yumuşakça 0'a döndür (parmak kalkınca). */
function springBack(el: HTMLElement, from: number): void {
  cancelAnim();
  if (Math.abs(from) < 0.5) { setOffset(el, 0); animEl = null; return; }
  animEl = el;
  const t0 = now();
  const step = (): void => {
    const t = Math.min(1, (now() - t0) / SPRING_MS);
    const eased = 1 - Math.pow(1 - t, 3);
    setOffset(el, from * (1 - eased));
    if (t < 1) raf = requestAnimationFrame(step);
    else { setOffset(el, 0); animEl = null; raf = 0; }
  };
  raf = requestAnimationFrame(step);
}

/** Uca hızlı çarpma: kısa bir dışa-içe tokuşma. */
function impact(el: HTMLElement, speed: number, sign: 1 | -1, stretch: number): void {
  cancelAnim();
  const amp = Math.min(stretch * 0.5, speed * 9);
  if (amp < 2) { setOffset(el, 0); animEl = null; raf = 0; return; }
  animEl = el;
  const dur = 300;
  const t0 = now();
  const step = (): void => {
    const t = Math.min(1, (now() - t0) / dur);
    setOffset(el, sign * amp * Math.sin(Math.PI * t) * (1 - t * 0.35));
    if (t < 1) raf = requestAnimationFrame(step);
    else { setOffset(el, 0); animEl = null; raf = 0; }
  };
  raf = requestAnimationFrame(step);
}

/** Parmak kalkınca kaydırmayı sürtünmeyle sürdür; uca çarparsa tokuş. */
function fling(el: HTMLElement, v0: number, maxScroll: number, stretch: number): void {
  cancelAnim();
  animEl = el;
  let v = v0;
  let last = now();
  const step = (): void => {
    const t = now();
    const dt = Math.min(32, t - last);
    last = t;
    const next = el.scrollTop - v * dt;
    if (next <= 0) { el.scrollTop = 0; impact(el, Math.abs(v), 1, stretch); return; }
    if (next >= maxScroll) { el.scrollTop = maxScroll; impact(el, Math.abs(v), -1, stretch); return; }
    el.scrollTop = next;
    v *= Math.pow(FRICTION, dt / 16.667);
    if (Math.abs(v) < 0.02) { animEl = null; raf = 0; return; }
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}

// ── Harita ipucu ─────────────────────────────────────────────────────────

const hintTimers = new WeakMap<HTMLElement, number>();

/** Leaflet haritasında tek parmakla sürüklendiyse "iki parmak" ipucunu göster.
 *  MapLibre (keşif haritası) kendi `cooperativeGestures` ipucunu gösterir. */
function showMapHint(target: EventTarget | null): void {
  const node = target instanceof Element ? target : null;
  const map = node?.closest('.leaflet-container');
  if (!(map instanceof HTMLElement)) return;
  map.classList.add(MAP_HINT_CLASS);
  const prev = hintTimers.get(map);
  if (prev) window.clearTimeout(prev);
  hintTimers.set(
    map,
    window.setTimeout(() => map.classList.remove(MAP_HINT_CLASS), MAP_HINT_MS),
  );
}

// ── Dokunma akışı ────────────────────────────────────────────────────────

function release(): void {
  grab = null;
}

function onTouchStart(e: TouchEvent): void {
  // İki parmak = harita/tahta gezdirme. Sayfa kaydırmasına karışmayız.
  if (e.touches.length !== 1) {
    if (grab) { setOffset(grab.el, 0); release(); }
    return;
  }
  // Yarım kalmış yaylanma varsa kes ve izini sil — yeni hareket taze başlar.
  stopAnim();
  const el = findScroller(e.target);
  if (!el) { release(); return; }
  setOffset(el, 0);
  const t = e.touches[0];
  const h = el.clientHeight || 1;
  grab = {
    el,
    startX: t.clientX,
    startY: t.clientY,
    dir: null,
    owned: false,
    pinned: el.scrollTop,
    anchorY: t.clientY,
    maxScroll: Math.max(0, el.scrollHeight - el.clientHeight),
    stretch: stretchLimit(h),
    offset: 0,
    lastY: t.clientY,
    lastT: now(),
    v: 0,
  };
}

function onTouchMove(e: TouchEvent): void {
  const g = grab;
  if (!g || e.touches.length !== 1) return;

  const t = e.touches[0];
  const y = t.clientY;
  const x = t.clientX;

  // 1) Yön kilidi — yatay hareket bize ait değil (şeritler kendi işini yapsın).
  if (g.dir === null) {
    const dx = Math.abs(x - g.startX);
    const dy = Math.abs(y - g.startY);
    if (dx < DIR_LOCK_PX && dy < DIR_LOCK_PX) return;
    g.dir = dy > dx ? 'v' : 'h';
    if (g.dir === 'h') { showMapHint(e.target); release(); return; }
    showMapHint(e.target);
  }
  if (g.dir !== 'v') return;

  // 2) Hız ölçümü (bırakınca atış için) + ANLIK yön.
  //    Yön için hareketin başlangıcı değil SON adımı bakılır: kullanıcı önce
  //    aşağı kaydırıp sonra tepeye dönmüş olabilir; çekişin yönü o andakidir.
  const tNow = now();
  const dt = tNow - g.lastT;
  const stepDy = y - g.lastY;
  if (dt > 0) g.v = stepDy / dt;
  g.lastY = y;
  g.lastT = tNow;

  // 3) Henüz devralmadıysak: yalnız UÇTAN TAŞAN bir çekişte devralırız.
  //    Uç dışındaki normal kaydırma tarayıcıda kalır → kendi akıcılığı bozulmaz.
  if (!g.owned) {
    const st = g.el.scrollTop;
    const atTop = st <= EDGE_EPS;
    const atBottom = st >= g.maxScroll - EDGE_EPS;
    const pullsOut = (atTop && stepDy > 0) || (atBottom && stepDy < 0);
    if (!pullsOut) return;
    // Tarayıcı bu hareketi çoktan kaydırmaya başladıysa iptal edemeyiz;
    // bu hareketi tarayıcıya bırakırız (bir sonrakinde yaylanma çalışır).
    if (!e.cancelable) { release(); return; }
    g.owned = true;
    g.pinned = st;
    g.anchorY = y;
    // Liste dokunuştan sonra büyümüş olabilir (geç yüklenen kartlar) — sınırı
    // devralma anında tazele, yoksa alt uç yanlış yerde sanılır.
    g.maxScroll = Math.max(0, g.el.scrollHeight - g.el.clientHeight);
  }

  // 4) Devraldık: hem kaydırmayı hem esnemeyi biz sürüyoruz.
  if (e.cancelable) e.preventDefault();
  const next = scrollStep(g.pinned, g.anchorY, y, g.maxScroll, g.stretch);
  g.el.scrollTop = next.scrollTop;
  g.offset = next.offset;
  setOffset(g.el, g.offset);
}

function onTouchEnd(): void {
  const g = grab;
  release();
  if (!g || !g.owned) return;
  if (Math.abs(g.offset) > 0.5) {
    springBack(g.el, g.offset);
  } else if (Math.abs(g.v) > FLING_MIN_V) {
    fling(g.el, g.v, g.maxScroll, g.stretch);
  } else {
    setOffset(g.el, 0);
  }
}

// ── Kurulum ──────────────────────────────────────────────────────────────

/**
 * Kaydırma sistemini kurar. index.tsx'te BİR KEZ çağrılır; ekran başına
 * bir şey yapmak gerekmez.
 *
 * `prefers-reduced-motion` açıksa yaylanma kurulmaz — hareket duyarlılığı
 * olan kullanıcı için bu bir süs değil, rahatsızlık kaynağıdır. Haritanın
 * "tek parmak sayfayı kaydırır" davranışı bundan bağımsızdır (CSS/harita
 * ayarı), yani o kullanıcı da her yerden kaydırabilir.
 */
export function installOynaScrollSystem(): void {
  if (installed || typeof window === 'undefined' || typeof document === 'undefined') return;
  installed = true;
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  if (reduced) return;
  // Dokunmatik olmayan cihazda (masaüstü tarayıcı, admin paneli) kurmayız:
  // yaylanacak bir parmak yok, ama `passive:false` dinleyici tarayıcının hızlı
  // kaydırma yolunu gereksiz yere yavaşlatırdı.
  const touchVar = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  if (!touchVar) return;
  document.addEventListener('touchstart', onTouchStart, { passive: true, capture: true });
  document.addEventListener('touchmove', onTouchMove, { passive: false, capture: true });
  document.addEventListener('touchend', onTouchEnd, { passive: true, capture: true });
  document.addEventListener('touchcancel', onTouchEnd, { passive: true, capture: true });
}

/** Esneme tavanı: kaydırıcı yüksekliğine göre hesaplanır (testte de kullanılır). */
export const stretchLimit = (clientHeight: number): number =>
  Math.min(STRETCH_MAX_PX, clientHeight * STRETCH_RATIO);
