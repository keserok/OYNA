// Kaydırma sistemi bekçisi — "her yerden kaydırılabilsin, uçta yaylansın,
// boşluğa kaymasın".
//
// NEDEN VAR (2026-07-31):
//   Uygulamada kaydırma üç ayrı sebepten bozuktu: haritalar ve bazı kontroller
//   parmağı kendilerine alıyordu, uçta yaylanma hiç yoktu ve bazı ekranlarda
//   sayfa içerik bittikten sonra boşluğa doğru sürüklenebiliyordu.
//
//   `utils/scrollSystem.ts` bu üçünü tek yerden çözer. Bu dosya o motorun
//   KARAR mantığını kilitler: hangi kaydırıcı hareketi alır, uçtan taşan
//   çekiş ne kadar esner, kaydırma nerede durur.
//
// Kapsam notu: burada saf mantık doğrulanır. Gerçek parmak hareketi (TouchEvent
// zinciri, tarayıcının kaydırmayı ne zaman devraldığı) jsdom'da taklit
// edilemez — o taraf cihaz üstünde/Playwright ile doğrulanır.

import { describe, it, expect, afterEach } from 'vitest';
import { damp, scrollStep, stretchLimit, findScroller, findScrollerX } from '../../utils/scrollSystem';

// ── Yardımcı: jsdom düzen hesaplamadığı için ölçüleri elle veriyoruz ────────
function kutu(
  ozellikler: {
    style?: string;
    scrollHeight?: number; clientHeight?: number;
    scrollWidth?: number; clientWidth?: number;
    noBounce?: boolean;
  } = {},
): HTMLElement {
  const el = document.createElement('div');
  if (ozellikler.style) el.setAttribute('style', ozellikler.style);
  if (ozellikler.noBounce) el.setAttribute('data-oyna-no-bounce', '');
  Object.defineProperty(el, 'scrollHeight', { value: ozellikler.scrollHeight ?? 0, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: ozellikler.clientHeight ?? 0, configurable: true });
  Object.defineProperty(el, 'scrollWidth', { value: ozellikler.scrollWidth ?? 0, configurable: true });
  Object.defineProperty(el, 'clientWidth', { value: ozellikler.clientWidth ?? 0, configurable: true });
  return el;
}

afterEach(() => {
  document.body.innerHTML = '';
});

// ═══════════════════════════════════════════════════════════════════════════
describe('esneme eğrisi — kenara gelince yavaşlar ama tavanı aşmaz', () => {
  const TAVAN = 120;

  it('küçük çekişte parmakla neredeyse birebir hareket eder', () => {
    // İlk anda direnç hissedilmemeli; yoksa "takılıyor" gibi durur.
    expect(damp(4, TAVAN)).toBeGreaterThan(3.8);
    expect(damp(4, TAVAN)).toBeLessThanOrEqual(4);
  });

  it('çekiş uzadıkça oran düşer — "iyice yavaşlar"', () => {
    const ilk = damp(20, TAVAN) / 20;
    const orta = damp(120, TAVAN) / 120;
    const uzak = damp(600, TAVAN) / 600;
    expect(ilk).toBeGreaterThan(orta);
    expect(orta).toBeGreaterThan(uzak);
  });

  it('ne kadar çekilirse çekilsin tavanı ASLA aşmaz (kullanıcı kararı 5c)', () => {
    for (const cekis of [50, 200, 1000, 10_000, 1e6]) {
      expect(damp(cekis, TAVAN)).toBeLessThan(TAVAN);
    }
  });

  it('her zaman artar — geri çekilirken esneme büyümez', () => {
    let onceki = 0;
    for (let cekis = 1; cekis <= 400; cekis += 7) {
      const simdi = damp(cekis, TAVAN);
      expect(simdi).toBeGreaterThan(onceki);
      onceki = simdi;
    }
  });

  it('esneme tavanı kısa kutuda küçülür, uzun kutuda bir parmak boyunda kalır', () => {
    expect(stretchLimit(200)).toBeCloseTo(56, 5);   // kısa liste → az esner
    expect(stretchLimit(4000)).toBe(132);            // uzun sayfa → mutlak sınır
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('kaydırma adımı — içeride birebir, uçta çakılı', () => {
  const MAX = 1000;   // kaydırılabilir mesafe
  const TAVAN = 120;

  it('içerideyken parmakla birebir kayar, esneme olmaz', () => {
    // 500'den başladık, parmak 60px yukarı → 560'a inmeli.
    const s = scrollStep(500, 300, 240, MAX, TAVAN);
    expect(s.scrollTop).toBe(560);
    expect(s.offset).toBe(0);
  });

  it('üst uçta: kaydırma 0da ÇAKILI kalır, fazlası esnemeye döner', () => {
    // Tepedeyiz (0) ve parmak 80px aşağı çekiyor.
    const s = scrollStep(0, 300, 380, MAX, TAVAN);
    expect(s.scrollTop).toBe(0);          // içerik boşluğa KAYMAZ (5a)
    expect(s.offset).toBeGreaterThan(0);  // aşağı doğru esner
    expect(s.offset).toBeLessThan(TAVAN);
  });

  it('alt uçta: kaydırma sonda ÇAKILI kalır, fazlası ters yöne esner', () => {
    const s = scrollStep(MAX, 300, 220, MAX, TAVAN);
    expect(s.scrollTop).toBe(MAX);
    expect(s.offset).toBeLessThan(0);
    expect(Math.abs(s.offset)).toBeLessThan(TAVAN);
  });

  it('uçtan içeri dönünce esneme biter ve normal kaydırma sürer', () => {
    // Tepede 80px esnetip parmağı 30px yukarı geri getiriyoruz → hâlâ esneme.
    expect(scrollStep(0, 300, 350, MAX, TAVAN).offset).toBeGreaterThan(0);
    // Başlangıcın da yukarısına geçince esneme sıfırlanır, liste kaymaya başlar.
    const geri = scrollStep(0, 300, 280, MAX, TAVAN);
    expect(geri.offset).toBe(0);
    expect(geri.scrollTop).toBe(20);
  });

  it('kaydırılamayan kutuda (maxScroll 0) her iki yön de esner, kayma olmaz', () => {
    const asagi = scrollStep(0, 300, 360, 0, TAVAN);
    const yukari = scrollStep(0, 300, 240, 0, TAVAN);
    expect(asagi.scrollTop).toBe(0);
    expect(yukari.scrollTop).toBe(0);
    expect(asagi.offset).toBeGreaterThan(0);
    expect(yukari.offset).toBeLessThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('hareketi hangi kaydırıcı alır', () => {
  it('en yakın DİKEY kaydırıcıyı bulur', () => {
    const sayfa = kutu({ style: 'overflow-y: auto', scrollHeight: 2000, clientHeight: 800 });
    const hedef = document.createElement('span');
    sayfa.appendChild(hedef);
    document.body.appendChild(sayfa);
    expect(findScroller(hedef)).toBe(sayfa);
  });

  it('içteki kaydırıcı dıştakinden önce gelir', () => {
    const dis = kutu({ style: 'overflow-y: auto', scrollHeight: 2000, clientHeight: 800 });
    const ic = kutu({ style: 'overflow-y: auto', scrollHeight: 900, clientHeight: 300 });
    const hedef = document.createElement('span');
    ic.appendChild(hedef);
    dis.appendChild(ic);
    document.body.appendChild(dis);
    expect(findScroller(hedef)).toBe(ic);
  });

  it('YATAY şerit atlanır — üstünde dikey sürükleme sayfayı kaydırır (karar 6)', () => {
    // Gün seçici gibi bir şerit: yatayda kayar, dikeyde taşma yok.
    const sayfa = kutu({ style: 'overflow-y: auto', scrollHeight: 2000, clientHeight: 800 });
    const serit = kutu({ style: 'overflow-x: auto; overflow-y: auto', scrollHeight: 64, clientHeight: 64 });
    const hedef = document.createElement('span');
    serit.appendChild(hedef);
    sayfa.appendChild(serit);
    document.body.appendChild(sayfa);
    expect(findScroller(hedef)).toBe(sayfa);
  });

  it('üstte açık bir sabit katman (modal) varsa arkadaki sayfa kaydırılmaz', () => {
    const sayfa = kutu({ style: 'overflow-y: auto', scrollHeight: 2000, clientHeight: 800 });
    const modal = kutu({ style: 'position: fixed' });
    const hedef = document.createElement('span');
    modal.appendChild(hedef);
    sayfa.appendChild(modal);
    document.body.appendChild(sayfa);
    expect(findScroller(hedef)).toBeNull();
  });

  it('sabit katmanın KENDİ listesi varsa o çalışır', () => {
    const sayfa = kutu({ style: 'overflow-y: auto', scrollHeight: 2000, clientHeight: 800 });
    const modal = kutu({ style: 'position: fixed' });
    const liste = kutu({ style: 'overflow-y: auto', scrollHeight: 1200, clientHeight: 400 });
    const hedef = document.createElement('span');
    liste.appendChild(hedef);
    modal.appendChild(liste);
    sayfa.appendChild(modal);
    document.body.appendChild(sayfa);
    expect(findScroller(hedef)).toBe(liste);
  });

  it('`data-oyna-no-bounce` işaretli bölgede yaylanma devre dışı kalır', () => {
    const sayfa = kutu({ style: 'overflow-y: auto', scrollHeight: 2000, clientHeight: 800 });
    const muaf = kutu({ noBounce: true });
    const hedef = document.createElement('span');
    muaf.appendChild(hedef);
    sayfa.appendChild(muaf);
    document.body.appendChild(sayfa);
    expect(findScroller(hedef)).toBeNull();
  });

  it('kaydırılacak bir şey yoksa null döner', () => {
    const duz = kutu({ style: 'overflow-y: auto', scrollHeight: 300, clientHeight: 300 });
    const hedef = document.createElement('span');
    duz.appendChild(hedef);
    document.body.appendChild(duz);
    expect(findScroller(hedef)).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Yatay şeritler de yaylanır (kullanıcı kararı: uygulamanın her yeri aynı
// hissetsin). Aynı motor, yön kilitlendikten sonra o eksenin kaydırıcısını
// arar; dikey davranış bundan etkilenmez.
describe('yatay hareket hangi şeridi alır', () => {
  it('en yakın YATAY şeridi bulur', () => {
    const serit = kutu({ style: 'overflow-x: auto', scrollWidth: 1200, clientWidth: 390 });
    const hedef = document.createElement('span');
    serit.appendChild(hedef);
    document.body.appendChild(serit);
    expect(findScrollerX(hedef)).toBe(serit);
  });

  it('taşma yoksa (kartlar ekrana sığıyorsa) null döner — yaylanacak bir şey yok', () => {
    const serit = kutu({ style: 'overflow-x: auto', scrollWidth: 390, clientWidth: 390 });
    const hedef = document.createElement('span');
    serit.appendChild(hedef);
    document.body.appendChild(serit);
    expect(findScrollerX(hedef)).toBeNull();
  });

  it('içteki şerit dıştakinden önce gelir', () => {
    const dis = kutu({ style: 'overflow-x: auto', scrollWidth: 2000, clientWidth: 390 });
    const ic = kutu({ style: 'overflow-x: auto', scrollWidth: 900, clientWidth: 300 });
    const hedef = document.createElement('span');
    ic.appendChild(hedef);
    dis.appendChild(ic);
    document.body.appendChild(dis);
    expect(findScrollerX(hedef)).toBe(ic);
  });

  it('yalnız DİKEY kaydıran listede yatay çekiş kimseyi seçmez', () => {
    const liste = kutu({ style: 'overflow-y: auto', scrollHeight: 2000, clientHeight: 800 });
    const hedef = document.createElement('span');
    liste.appendChild(hedef);
    document.body.appendChild(liste);
    expect(findScrollerX(hedef)).toBeNull();
  });

  it('sabit katmanın (modal) KENDİ şeridi çalışır; arkadaki şerit çalışmaz', () => {
    const arkaSerit = kutu({ style: 'overflow-x: auto', scrollWidth: 1200, clientWidth: 390 });
    const modal = kutu({ style: 'position: fixed' });
    const modalSerit = kutu({ style: 'overflow-x: auto', scrollWidth: 800, clientWidth: 300 });
    const hedef = document.createElement('span');
    modalSerit.appendChild(hedef);
    modal.appendChild(modalSerit);
    arkaSerit.appendChild(modal);
    document.body.appendChild(arkaSerit);
    // Şerit modalin içinde → bulunur.
    expect(findScrollerX(hedef)).toBe(modalSerit);

    // Modalin kendi şeridi yoksa arkadaki şeride UZANILMAZ.
    const bosModal = kutu({ style: 'position: fixed' });
    const hedef2 = document.createElement('span');
    bosModal.appendChild(hedef2);
    arkaSerit.appendChild(bosModal);
    expect(findScrollerX(hedef2)).toBeNull();
  });

  it('kart kart duran (snap) karusel devralınmaz — kendi snap davranışı korunur', () => {
    // Ölçüldü: snap'li şeritte kaydırmayı devralmak kart atlatıyordu
    // (konum 0'dan 308'e sıçrıyordu). Bu şeritler tarayıcıya bırakılır.
    const karusel = kutu({
      style: 'overflow-x: auto; scroll-snap-type: x mandatory',
      scrollWidth: 2000, clientWidth: 390,
    });
    const hedef = document.createElement('span');
    karusel.appendChild(hedef);
    document.body.appendChild(karusel);
    expect(findScrollerX(hedef)).toBeNull();
  });

  it('`data-oyna-no-bounce` işaretli bölgede yatay yaylanma da devre dışı kalır', () => {
    const serit = kutu({ style: 'overflow-x: auto', scrollWidth: 1200, clientWidth: 390 });
    const muaf = kutu({ noBounce: true });
    const hedef = document.createElement('span');
    muaf.appendChild(hedef);
    serit.appendChild(muaf);
    document.body.appendChild(serit);
    expect(findScrollerX(hedef)).toBeNull();
  });
});
