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
// İKİ EKSEN DE AYNI: yaylanma ve atış yalnız dikey listelerde değil, YATAY
// şeritlerde de (gün seçici, saha kartları, kategori çipleri) çalışır. Önceden
// yatay şeritler ucuna gelince sertçe duruyordu; uygulamanın bir yerinde
// yaylanıp başka yerinde durması tutarsız hissettiriyordu. Motor tek; hareketin
// yönü kilitlendikten sonra o eksenin kaydırıcısı bulunur ve aynı fizik uygulanır.
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

/** AŞAĞI ÇEKİP YENİLE eşiği — esneme TAVANININ oranı olarak.
 *
 *  SABİT PİKSEL OLAMAZ: Tavan `stretchLimit()` ile kaydırıcının boyuna göre
 *  hesaplanır (kısa kutuda küçülür). Önce 78px sabit denendi ve KISA
 *  kaydırıcılarda jest hiç tetiklenmedi — ölçüldü: tavanı 84px olan bir kutuda
 *  364px'lik çekiş sönümlenip yalnız 68px esneme üretiyor, yani eşiğe ulaşmak
 *  FİZİKSEL OLARAK imkânsızdı. Oran, her boyda aynı "kararlı çekiş" hissini verir.
 *
 *  ORAN NEDEN 0.5: Sönümleme asimptotik — tavana yaklaşmak sonsuz yol ister.
 *  Gereken parmak yolu = tavan·oran/(1−oran). Hesaplandı:
 *      oran 0.72 → 132px tavanda 339px yol (bir ekran boyundan uzun, imkânsız)
 *      oran 0.60 → 198px yol (hâlâ yorucu)
 *      oran 0.50 → 132px yol  ✔ doğal bir "aşağı çek" hareketi
 *  0.72 önce denendi ve JESTİ TÜMDEN ÖLDÜRDÜ (dokuz ekranın dokuzunda da
 *  tetiklenmedi) — bu yorum o hatanın kaydıdır. */
const REFRESH_PULL_RATIO = 0.5;
/** Çok kısa kutularda eşiğin kazara aşılmaması için mutlak taban. */
const REFRESH_PULL_MIN_PX = 32;

/** Leaflet haritasında ipucu için açılan sınıf (CSS: mapBase.ts → OYNA_MAP_CSS). */
const MAP_HINT_CLASS = 'oyna-hint-on';

/** Hareketin kilitlendiği eksen: 'v' dikey, 'h' yatay. */
type Eksen = 'v' | 'h';

type Grab = {
  /** Dokunulan öğe — kaydırıcı ancak yön kilitlenince aranır. */
  target: EventTarget | null;
  /** Hareketi alan kaydırıcı; yön belli olana dek null. */
  el: HTMLElement | null;
  startX: number;
  startY: number;
  /** Yön kilidi: null = henüz belli değil. Kilitlenince o eksenin kaydırıcısı aranır. */
  dir: null | Eksen;
  /** Kaydırmayı biz mi sürüyoruz (uçtan taşan bir çekiş başladı mı). */
  owned: boolean;
  /** Devralma anındaki kaydırma konumu ve parmak yeri — sıçramasız devir için. */
  pinned: number;
  anchor: number;
  maxScroll: number;
  stretch: number;
  /** O anki esneme miktarı (px; dikeyde +aşağı, yatayda +sağa). */
  offset: number;
  last: number;
  lastT: number;
  /** Parmak hızı (px/ms; eksenin artı yönünde). */
  v: number;
};

// ── AŞAĞI ÇEKİP YENİLE kaydı ────────────────────────────────────────────────
// Jesti AYRI bir dinleyiciyle kurmuyoruz: bu motor zaten uçtaki çekişi
// devralıyor ve esnemeyi ölçüyor. İkinci bir dinleyici aynı parmağı iki kez
// yorumlar ve ikisi de yarım çalışır. Ekran yalnız "ben yenilenebilirim" diye
// kaydolur; ölçüm ve karar burada kalır.
//
// KAYIT ELEMANA DEĞİL EKRANA AİT. İlk tasarımda ekran kendi kaydırıcısını
// seçiciyle bulup kaydediyordu; bu KIRILGANDI çünkü uygulamada iki yerleşim
// modeli bir arada yaşıyor:
//   • sayfa-akışı ekranları  → App'in görünüm kaydırıcısında akar
//   • `h-full` + kendi listesi olan ekranlar (Cüzdan, Sosyal, Maçlarım, Profil)
// Yanlış seçici veren ekran sessizce jestsiz kalırdı — hata görünmezdi.
//
// Şimdi: ekran yalnız "ben yenilenebilirim" der. Motor zaten hangi kaydırıcıyı
// devraldığını BİLİYOR; üstten aşağı çekiş eşiği aşarsa onu çalıştırır.
// Modal/alt sayfa içinde tetiklenmez: `findScroller` `position:fixed` katmanda
// durup null döner, yani motor orada hareketi hiç devralmaz.
//
// Tek kayıt yeter — aynı anda tek ekran monte olur.
let yenileKaydi: (() => void) | null = null;

/** Ekranı "aşağı çekilince yenilenir" yap. Dönen işlev kaydı siler. */
export function asagiCekYenileKaydet(calistir: () => void): () => void {
  yenileKaydi = calistir;
  return () => { if (yenileKaydi === calistir) yenileKaydi = null; };
}

let grab: Grab | null = null;
let raf = 0;
/** O an yaylanma animasyonu oynayan kaydırıcı — yarıda kesilirse temizlenir. */
let animEl: HTMLElement | null = null;
/** Animasyonun ekseni — yarıda kesilince doğru özelliği silebilmek için. */
let animEksen: Eksen = 'v';
let installed = false;
/**
 * Sistemin "hareketi azalt" tercihi AÇIK mı?
 *
 * Eskiden bu tercih açıkken kaydırma sistemi HİÇ kurulmuyordu. Yaylanma
 * gerçekten kalkıyordu — ama aşağı çekip yenileme de aynı motorda olduğu için
 * 9 ekranda YENİLEME ÖZELLİĞİ birlikte ölüyordu. Yenileme bir süs değil,
 * işlevdir: hareket duyarlılığı olan kullanıcı da listesini tazeleyebilmeli.
 * Artık motor kurulur, yalnız ANİMASYON kısmı (esneme + yaylanma + atış)
 * atlanır.
 */
let hareketAzalt = false;

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
function setOffset(el: HTMLElement, px: number, eksen: Eksen): void {
  if (Math.abs(px) < 0.05) el.style.translate = '';
  else el.style.translate = eksen === 'v' ? `0 ${px.toFixed(2)}px` : `${px.toFixed(2)}px 0`;
}

function cancelAnim(): void {
  if (raf) { cancelAnimationFrame(raf); raf = 0; }
}

/** Yarım kalmış bir yaylanmayı kes VE bıraktığı kaymayı sil. */
function stopAnim(): void {
  cancelAnim();
  if (animEl) { setOffset(animEl, 0, animEksen); animEl = null; }
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
      // GÖRÜNÜM KAYDIRICISI İSTİSNASI (kullanıcı kararı, 4 Ağustos 2026):
      // İçerik ekrana sığıyorsa (taşma yok) yukarıdaki koşul onu atlar ve
      // parmak sürüklemesi HİÇBİR karşılık bulmaz — kullanıcı bunu "ekran
      // kaydırılamıyor/donuk" olarak yaşıyordu (üç kez bildirildi). Ana görünüm
      // kaydırıcısı taşma olmasa da yakalanır: maxScroll 0 olduğundan her çekiş
      // "uçtan taşan çekiş" sayılır, esner ve yaylanarak döner. Yani KISA
      // içerikli ekran da parmağa cevap verir — iOS'un doğal hissiyle aynı.
      if (el.hasAttribute('data-oyna-view-scroller')) return el;
    }
    el = el.parentElement;
  }
  return null;
}

/**
 * Dokunulan noktadan yukarı çıkarak hareketi ALACAK YATAY kaydırıcıyı bulur.
 *
 * `findScroller` ile aynı iki duruş: `data-oyna-no-bounce` bölgesi ve üstteki
 * `position:fixed` katman hareketi keser. Şerit sabit katmanın KENDİ içindeyse
 * (ör. alt sayfadaki kategori çipleri) yukarı çıkmadan bulunur, o yüzden
 * modal içindeki şeritler yaylanmaya devam eder.
 *
 * ÜÇÜNCÜ DURUŞ — KART KART DURAN (snap) KARUSELLER HARİÇ:
 * `scroll-snap-type` mandatory/proximity olan şeritlerde (saha vitrini
 * karuselleri) kaydırmayı devralmak ZIPLAMA yaratıyor: biz `scrollLeft`
 * yazdıkça tarayıcı her yazımda en yakın karta kilitliyor. Ölçüldü — parmak
 * düzgün sürüklenirken konum 0'dan 308'e sıçrıyordu, yani kart atlıyordu.
 * Bu şeritleri tamamen tarayıcıya bırakırız: kendi snap'leri bozulmaz.
 * (Yaylanmayı kazanmak için çalışan bir davranışı bozmaya değmez.)
 */
export function findScrollerX(start: EventTarget | null): HTMLElement | null {
  let el: Element | null = start instanceof Element ? start : null;
  while (el && el !== document.body && el !== document.documentElement) {
    if (el instanceof HTMLElement) {
      if (el.hasAttribute('data-oyna-no-bounce')) return null;
      const cs = getComputedStyle(el);
      const ox = cs.overflowX;
      if ((ox === 'auto' || ox === 'scroll') && el.scrollWidth - el.clientWidth > EDGE_EPS) {
        const snap = cs.scrollSnapType;
        if (snap && snap !== 'none') return null;
        return el;
      }
      if (cs.position === 'fixed') return null;
    }
    el = el.parentElement;
  }
  return null;
}

// ── Eksen yardımcıları ───────────────────────────────────────────────────
// Kaydırma konumunu ve sınırını eksene göre okur/yazar. Fizik tek yerde kalsın
// diye motorun geri kalanı "hangi eksen" bilmez, yalnız bu üç işlevi kullanır.

const konumOku = (el: HTMLElement, eksen: Eksen): number =>
  eksen === 'v' ? el.scrollTop : el.scrollLeft;

const konumYaz = (el: HTMLElement, eksen: Eksen, px: number): void => {
  if (eksen === 'v') el.scrollTop = px; else el.scrollLeft = px;
};

const sinirOku = (el: HTMLElement, eksen: Eksen): number =>
  eksen === 'v'
    ? Math.max(0, el.scrollHeight - el.clientHeight)
    : Math.max(0, el.scrollWidth - el.clientWidth);

/** Esneme tavanının dayandığı ölçü: dikeyde yükseklik, yatayda genişlik. */
const olcuOku = (el: HTMLElement, eksen: Eksen): number =>
  (eksen === 'v' ? el.clientHeight : el.clientWidth) || 1;

// ── Animasyonlar ─────────────────────────────────────────────────────────

/** Esnemeyi yumuşakça 0'a döndür (parmak kalkınca). */
function springBack(el: HTMLElement, from: number, eksen: Eksen): void {
  cancelAnim();
  if (Math.abs(from) < 0.5) { setOffset(el, 0, eksen); animEl = null; return; }
  animEl = el;
  animEksen = eksen;
  const t0 = now();
  const step = (): void => {
    const t = Math.min(1, (now() - t0) / SPRING_MS);
    const eased = 1 - Math.pow(1 - t, 3);
    setOffset(el, from * (1 - eased), eksen);
    if (t < 1) raf = requestAnimationFrame(step);
    else { setOffset(el, 0, eksen); animEl = null; raf = 0; }
  };
  raf = requestAnimationFrame(step);
}

/** Uca hızlı çarpma: kısa bir dışa-içe tokuşma. */
function impact(el: HTMLElement, speed: number, sign: 1 | -1, stretch: number, eksen: Eksen): void {
  cancelAnim();
  const amp = Math.min(stretch * 0.5, speed * 9);
  if (amp < 2) { setOffset(el, 0, eksen); animEl = null; raf = 0; return; }
  animEl = el;
  animEksen = eksen;
  const dur = 300;
  const t0 = now();
  const step = (): void => {
    const t = Math.min(1, (now() - t0) / dur);
    setOffset(el, sign * amp * Math.sin(Math.PI * t) * (1 - t * 0.35), eksen);
    if (t < 1) raf = requestAnimationFrame(step);
    else { setOffset(el, 0, eksen); animEl = null; raf = 0; }
  };
  raf = requestAnimationFrame(step);
}

/** Parmak kalkınca kaydırmayı sürtünmeyle sürdür; uca çarparsa tokuş. */
function fling(el: HTMLElement, v0: number, maxScroll: number, stretch: number, eksen: Eksen): void {
  cancelAnim();
  animEl = el;
  animEksen = eksen;
  let v = v0;
  let last = now();
  const step = (): void => {
    const t = now();
    const dt = Math.min(32, t - last);
    last = t;
    const next = konumOku(el, eksen) - v * dt;
    if (next <= 0) { konumYaz(el, eksen, 0); impact(el, Math.abs(v), 1, stretch, eksen); return; }
    if (next >= maxScroll) { konumYaz(el, eksen, maxScroll); impact(el, Math.abs(v), -1, stretch, eksen); return; }
    konumYaz(el, eksen, next);
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
    if (grab?.el) setOffset(grab.el, 0, grab.dir ?? 'v');
    if (grab) release();
    return;
  }
  // Yarım kalmış yaylanma varsa kes ve izini sil — yeni hareket taze başlar.
  stopAnim();
  const t = e.touches[0];
  // Kaydırıcı BURADA aranmaz: hangi eksende sürükleneceği daha belli değil.
  // Yön kilitlenince (onTouchMove) o eksenin kaydırıcısı aranır.
  grab = {
    target: e.target,
    el: null,
    startX: t.clientX,
    startY: t.clientY,
    dir: null,
    owned: false,
    pinned: 0,
    anchor: 0,
    maxScroll: 0,
    stretch: 0,
    offset: 0,
    last: 0,
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

  // 1) Yön kilidi. Kilitlenen eksenin kaydırıcısı aranır: dikeyde sayfa/liste,
  //    yatayda şerit. İlgili eksende kaydırılacak bir şey yoksa hareketi
  //    tarayıcıya bırakırız.
  if (g.dir === null) {
    const dx = Math.abs(x - g.startX);
    const dy = Math.abs(y - g.startY);
    if (dx < DIR_LOCK_PX && dy < DIR_LOCK_PX) return;
    const dir: Eksen = dy > dx ? 'v' : 'h';
    g.dir = dir;
    showMapHint(e.target);

    const bulunan = dir === 'v' ? findScroller(g.target) : findScrollerX(g.target);
    if (!bulunan) { release(); return; }
    setOffset(bulunan, 0, dir);
    g.el = bulunan;
    g.pinned = konumOku(bulunan, dir);
    g.anchor = dir === 'v' ? y : x;
    g.maxScroll = sinirOku(bulunan, dir);
    g.stretch = stretchLimit(olcuOku(bulunan, dir));
    g.last = g.anchor;
  }

  const el = g.el;
  const eksen = g.dir;
  if (!el || !eksen) return;
  // Eksenin "artı" yönündeki parmak konumu: dikeyde Y, yatayda X.
  const p = eksen === 'v' ? y : x;

  // 2) Hız ölçümü (bırakınca atış için) + ANLIK yön.
  //    Yön için hareketin başlangıcı değil SON adımı bakılır: kullanıcı önce
  //    ileri kaydırıp sonra başa dönmüş olabilir; çekişin yönü o andakidir.
  const tNow = now();
  const dt = tNow - g.lastT;
  const stepD = p - g.last;
  if (dt > 0) g.v = stepD / dt;
  g.last = p;
  g.lastT = tNow;

  // 3) Henüz devralmadıysak: yalnız UÇTAN TAŞAN bir çekişte devralırız.
  //    Uç dışındaki normal kaydırma tarayıcıda kalır → kendi akıcılığı bozulmaz.
  if (!g.owned) {
    const st = konumOku(el, eksen);
    const atStart = st <= EDGE_EPS;
    const atEnd = st >= g.maxScroll - EDGE_EPS;
    const pullsOut = (atStart && stepD > 0) || (atEnd && stepD < 0);
    if (!pullsOut) return;
    // Tarayıcı bu hareketi çoktan kaydırmaya başladıysa iptal edemeyiz;
    // bu hareketi tarayıcıya bırakırız (bir sonrakinde yaylanma çalışır).
    if (!e.cancelable) { release(); return; }
    g.owned = true;
    g.pinned = st;
    g.anchor = p;
    // İçerik dokunuştan sonra büyümüş olabilir (geç yüklenen kartlar) — sınırı
    // devralma anında tazele, yoksa uç yanlış yerde sanılır.
    g.maxScroll = sinirOku(el, eksen);
  }

  // 4) Devraldık: hem kaydırmayı hem esnemeyi biz sürüyoruz.
  if (e.cancelable) e.preventDefault();
  const next = scrollStep(g.pinned, g.anchor, p, g.maxScroll, g.stretch);
  konumYaz(el, eksen, next.scrollTop);
  g.offset = next.offset;
  // Hareket azaltmada esneme ÇİZİLMEZ; ölçüm sürer (yenileme eşiği için).
  if (!hareketAzalt) setOffset(el, g.offset, eksen);
}

function onTouchEnd(): void {
  const g = grab;
  release();
  if (!g || !g.owned || !g.el || !g.dir) return;

  // AŞAĞI ÇEKİP YENİLE: yalnız DİKEY eksende, ÜSTTEN aşağı çekişte (offset > 0)
  // ve eşik aşıldıysa. Yaylanma normal akışında devam eder — kullanıcı parmağını
  // bıraktığında içerik yerine döner, üstte "YENİLENİYOR" şeridi açılır.
  const yenileEsigi = Math.max(REFRESH_PULL_MIN_PX, g.stretch * REFRESH_PULL_RATIO);
  if (g.dir === 'v' && g.offset >= yenileEsigi && yenileKaydi) {
    try { yenileKaydi(); } catch { /* yenileme hatası jesti bozmasın */ }
  }

  if (hareketAzalt) {
    // Animasyon yok: içerik anında yerine oturur (çizilmiş esneme de yoktu).
    setOffset(g.el, 0, g.dir);
  } else if (Math.abs(g.offset) > 0.5) {
    springBack(g.el, g.offset, g.dir);
  } else if (Math.abs(g.v) > FLING_MIN_V) {
    fling(g.el, g.v, g.maxScroll, g.stretch, g.dir);
  } else {
    setOffset(g.el, 0, g.dir);
  }
}

// ── Kurulum ──────────────────────────────────────────────────────────────

/**
 * Kaydırma sistemini kurar. index.tsx'te BİR KEZ çağrılır; ekran başına
 * bir şey yapmak gerekmez.
 *
 * `prefers-reduced-motion` açıksa YAYLANMA çizilmez — hareket duyarlılığı olan
 * kullanıcı için esneme bir süs değil, rahatsızlık kaynağıdır. Ama motorun
 * kendisi yine kurulur: aşağı çekip yenileme aynı jest üzerinden çalışır ve
 * o kullanıcıdan alınamaz. Haritanın "tek parmak sayfayı kaydırır" davranışı
 * bundan bağımsızdır (CSS/harita ayarı).
 */
export function installOynaScrollSystem(): void {
  if (installed || typeof window === 'undefined' || typeof document === 'undefined') return;
  installed = true;
  hareketAzalt = !!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
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

/** Esneme tavanı: kaydırıcının o eksendeki ölçüsüne göre hesaplanır — dikeyde
 *  yükseklik, yatayda genişlik. (Testte de kullanılır.) */
export const stretchLimit = (olcu: number): number =>
  Math.min(STRETCH_MAX_PX, olcu * STRETCH_RATIO);
