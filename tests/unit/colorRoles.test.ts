// IP-09 — Renk-rol tablosu ve marka kimliği.
//
// Bu test, IP-08'in tipografi için yaptığını renk için yapar: tasarım
// sisteminin SÖZÜNÜ kilitler. Bir sonraki oturum "buraya da bir sarı buton
// koyayım" ya da "bu kartı da parlatayım" dediğinde burası kırmızıya döner.
//
// Kilitlenen dört söz:
//   1. Dört ayrı "birincil" renk yoktu artık tek tane var. #FFFF00 ve #FFC107
//      kod tabanından tamamen kalktı (yeşille kontrastları 1.26:1 ve 1.20:1 —
//      yani güneş altında hepsi tek parlak lekeye iniyordu).
//   2. #FACC15 "bekliyor" demektir ve ASLA buton dolgusu olmaz (yeşille 1.13:1).
//   3. Mentalite paleti TEK dosyada tanımlıdır; kategori rengi aksiyon (#39FF14)
//      ve "bekliyor" (#FACC15) renklerini kullanamaz.
//   4. Marka logosu renk sabiti taşımaz — temadan beslenir.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PLAY_STYLE_META } from '../../views/onboarding/onboardingShared';

const oku = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const css = oku('index.css');

// WCAG 2.1 bağıl parlaklık — IP-08 testiyle aynı hesap.
const kontrast = (fg: string, bg: string): number => {
  const parse = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const L = (c: number[]) => {
    const f = (v: number) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  };
  const [a, b] = [L(parse(fg)), L(parse(bg))].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
};

const ZEMIN = '#0A0E14';
const BIRINCIL = '#39FF14';

/** index.css @theme bloğundaki bir renk tokenının değeri. */
const token = (ad: string): string | undefined =>
  css.match(new RegExp(`--color-${ad}:\\s*(#[0-9A-Fa-f]{6}|rgba\\([^)]*\\))`))?.[1];

// Renk kararının uygulandığı yüzeyler. İki yer KAPSAM DIŞI:
//
//   1. `views/owner/**` — tesis paneli kendi temasını korur (karar E7).
//   2. `views/Dashboard.tsx` — ⚠️ KULLANICI KARARI, REGRESYON DEĞİL.
//      IP-09 ana sayfadaki altı kahraman kartı nötr yüzeye indirmişti
//      (BULGU-034: altı kart eşit görsel ağırlıkta yarışıyor, hiçbiri "önce
//      buraya bak" demiyor). Kullanıcı bu kararı GERİ ALDI ve kartların
//      önceki doygun/parıltılı hâlini istedi. Dolayısıyla ana sayfada
//      #FFC107, çift katmanlı parıltı ve dış CDN dokusu BİLEREK duruyor.
//      Bir sonraki oturum burayı "eksik kalmış" sanıp düzeltmesin —
//      düzeltmeden önce kullanıcıya sor. Ayrıntı: DEVIR-PROMPTU.md.
const OYUNCU_DOSYALARI = [
  'views/MatchJoin.tsx',
  'views/MatchDiscovery.tsx',
  'views/PitchDiscovery.tsx',
  'views/SplashScreen.tsx',
  'views/ProfileScreen.tsx',
  'views/onboarding/StepStyle.tsx',
  'views/onboarding/PlayerCardReveal.tsx',
  'views/onboarding/onboardingShared.ts',
  'components/OynaLogo.tsx',
  'components/ui/FilterDropdown.tsx',
  'components/map/mapBase.ts',
  'components/pitch-showcase/PitchShowcaseCard.tsx',
  'components/pitch-editor/ShowcasePreview.tsx',
  'components/pitch-editor/PhotoManager.tsx',
];

describe('renk-rol tablosu — tokenlar', () => {
  it('birincil ve üzerindeki metin tanımlı ve birbirini okutuyor', () => {
    expect(token('primary')).toBe(BIRINCIL);
    expect(token('on-primary')).toBe('#0A0E14');
    expect(kontrast(token('on-primary')!, token('primary')!)).toBeGreaterThanOrEqual(4.5);
  });

  it('yüzey ölçeği üç basamak ve yükseldikçe AÇILIYOR', () => {
    const bg = token('bg')!, s1 = token('surface-1')!, s2 = token('surface-2')!;
    const L = (h: string) => kontrast(h, '#000000');
    expect(L(bg)).toBeLessThan(L(s1));
    expect(L(s1)).toBeLessThan(L(s2));
  });

  it('çizgi ölçeği iki basamak — üçüncüsü yok', () => {
    expect(token('line')).toBeDefined();
    expect(token('line-strong')).toBeDefined();
    expect(css).not.toMatch(/--color-line-(subtle|weak|3)/);
  });

  it('dolgu tokenları üzerindeki beyaz metni okutuyor', () => {
    expect(kontrast('#FFFFFF', token('error-fill')!)).toBeGreaterThanOrEqual(4.5);
    expect(kontrast('#FFFFFF', token('info-fill')!)).toBeGreaterThanOrEqual(4.5);
  });

  it('metin rolleri (hata/bilgi/uyarı) uygulama zemininde AA geçiyor', () => {
    for (const ad of ['error', 'info', 'warning', 'success']) {
      expect(kontrast(token(ad)!, ZEMIN), `${ad}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('kullanılmayan ölü tokenlar silindi', () => {
    expect(css).not.toMatch(/--color-primary-dark/);
    expect(css).not.toMatch(/--color-primary-light/);
    expect(css).not.toMatch(/--color-bg-card/);
  });

  it('karar kaynağı koda yazıldı — okuyan kuralı dosyada bulur', () => {
    expect(css).toContain('RENK-ROL TABLOSU');
  });
});

describe('yasaklanan renkler', () => {
  // Bu dörtlü, birincil yeşille ayırt edilemediği için tabloda YOK.
  const YASAK: Record<string, string> = {
    '#FFFF00': 'yeşille 1.26:1',
    '#FFC107': 'yeşille 1.20:1',
    '#00E676': 'yeşille 1.23:1',
    '#FFAA00': 'tabloda karşılığı yok',
  };

  it('ölçüm doğru: yasak renkler birincilden ayrışmıyor', () => {
    for (const hex of ['#FFFF00', '#FFC107', '#00E676']) {
      expect(kontrast(hex, BIRINCIL), hex).toBeLessThan(1.5);
    }
  });

  it.each(Object.entries(YASAK))('%s oyuncu ekranlarında hiç geçmiyor (%s)', (hex) => {
    for (const dosya of OYUNCU_DOSYALARI) {
      expect(oku(dosya).includes(hex), `${dosya} içinde ${hex}`).toBe(false);
    }
  });

  it('#FFFF00 tüm views/ + components/ genelinde sıfır', () => {
    // Owner teması dahil — o dosyadaki tek geçiş de yorum satırındaydı, temizlendi.
    for (const dosya of OYUNCU_DOSYALARI) {
      expect(oku(dosya)).not.toContain('#FFFF00');
    }
  });
});

describe('#FACC15 — "bekliyor" rengi asla buton dolgusu değil', () => {
  it('yeşille kontrastı dolgu ayrımı için yetersiz (ölçüm)', () => {
    expect(kontrast('#FACC15', BIRINCIL)).toBeLessThan(1.5);
  });

  // Tint (`bg-[#FACC15]/10`) MEŞRUDUR — yasak olan DOLU blok. Tek istisna,
  // 2×2px durum noktası: buton değil, rozetin kendisi.
  const DOLU_SARI = /bg-\[#FACC15\](?!\/)/g;
  const NOKTA = /w-2 h-2[^"]*bg-\[#FACC15\]|bg-\[#FACC15\][^"]*w-2 h-2|w-2 h-2 rounded-full bg-\[#FACC15\]/;

  it('hiçbir oyuncu ekranında dolu sarı buton/rozet kalmadı', () => {
    for (const dosya of OYUNCU_DOSYALARI) {
      const src = oku(dosya);
      for (const satir of src.split('\n')) {
        if (!DOLU_SARI.test(satir)) { DOLU_SARI.lastIndex = 0; continue; }
        DOLU_SARI.lastIndex = 0;
        expect(NOKTA.test(satir), `${dosya}: dolu sarı blok → ${satir.trim().slice(0, 100)}`).toBe(true);
      }
    }
  });

  it('sarı→yeşil gradyan CTA kalmadı (iki durak arası 1.13:1)', () => {
    for (const dosya of OYUNCU_DOSYALARI) {
      expect(oku(dosya), dosya).not.toMatch(/linear-gradient\([^)]*#FACC15[^)]*#39FF14/);
      expect(oku(dosya), dosya).not.toMatch(/linear-gradient\([^)]*#39FF14[^)]*#FACC15/);
    }
  });
});

describe('mentalite paleti — tek kaynak', () => {
  it('üç mentalite de tanımlı ve 6 haneli hex taşıyor', () => {
    expect(Object.keys(PLAY_STYLE_META).sort()).toEqual(['ciddi', 'rahat', 'taktiksel']);
    for (const [k, v] of Object.entries(PLAY_STYLE_META)) {
      expect(v.color, k).toMatch(/^#[0-9A-F]{6}$/i);
      expect(v.label, k).toBeTruthy();
    }
  });

  it('kategori rengi aksiyon ya da "bekliyor" rengi OLAMAZ', () => {
    for (const [k, v] of Object.entries(PLAY_STYLE_META)) {
      expect(v.color.toUpperCase(), `${k} birincil renk kullanıyor`).not.toBe(BIRINCIL);
      expect(v.color.toUpperCase(), `${k} uyarı rengi kullanıyor`).not.toBe('#FACC15');
    }
  });

  it('üç kategori de uygulama zemininde AA geçiyor', () => {
    for (const [k, v] of Object.entries(PLAY_STYLE_META)) {
      expect(kontrast(v.color, ZEMIN), k).toBeGreaterThanOrEqual(4.5);
    }
  });

  // NOT: Ciddi (#F87171) ile Taktiksel (#60A5FA) arasındaki WCAG kontrastı
  // 1.09:1'dir — çünkü WCAG PARLAKLIK ölçer, TON değil. Kırmızı ile mavi
  // parlaklıkça yakın ama tonca apayrıdır. Bu yüzden burada kontrast
  // aranmaz; asıl güvence renk DIŞINDA da bir sinyal olmasıdır:
  it('üç kategorinin de renk dışında Türkçe etiketi var (renk tek başına anlam taşımaz)', () => {
    for (const [k, v] of Object.entries(PLAY_STYLE_META)) {
      expect(v.label.trim().length, `${k} etiketi`).toBeGreaterThan(0);
    }
    expect(new Set(Object.values(PLAY_STYLE_META).map(v => v.label)).size).toBe(3);
  });

  it('StepStyle her mentaliteyi ikon + ad ile birlikte çiziyor', () => {
    const src = oku('views/onboarding/StepStyle.tsx');
    // Kuralın özü: renk TEK BAŞINA anlam taşımaz — her mentalite ikon + ad ile
    // birlikte çizilir. Hangi ikonun kullanıldığı ürün kararıdır (Rahat'ın
    // ikonu kullanıcı kararıyla gülümseme yerine yaprak oldu), bu yüzden
    // burada ikon ADLARI değil, ÜÇ AYRI ikonun var olduğu sabitlenir.
    const ikonlar = src.match(/import \{([^}]*)\} from 'lucide-react'/)?.[1] ?? '';
    const adet = ikonlar.split(',').map(s => s.trim()).filter(Boolean).length;
    expect(adet, `üç mentalite için üç ikon bekleniyor: ${ikonlar}`).toBe(3);
    expect(src).toContain('<Icon');
    expect(src).toContain('{s.name}');
  });

  it('kategori renkleri birbirinin AYNISI değil', () => {
    const renkler = Object.values(PLAY_STYLE_META).map(v => v.color.toUpperCase());
    expect(new Set(renkler).size, 'iki kategori aynı rengi kullanıyor').toBe(3);
  });

  it('StepStyle kendi paletini TUTMUYOR — tek kaynaktan besleniyor', () => {
    const src = oku('views/onboarding/StepStyle.tsx');
    expect(src).toContain('PLAY_STYLE_META');
    expect(src, 'elle yazılmış renk alanı geri gelmiş').not.toMatch(/color:\s*'#/);
  });

  it('MatchJoin ve MatchDiscovery de aynı kaynaktan besleniyor', () => {
    for (const dosya of ['views/MatchJoin.tsx', 'views/MatchDiscovery.tsx']) {
      expect(oku(dosya), dosya).toContain('PLAY_STYLE_META');
    }
  });
});

describe('marka logosu', () => {
  const logo = oku('components/OynaLogo.tsx');

  it('renk sabiti taşımıyor — temadan besleniyor', () => {
    expect(logo).toMatch(/color\?:\s*string/);
    expect(logo, 'SVG içinde sabit hex kalmış').not.toMatch(/(stroke|fill)="#[0-9A-Fa-f]{3,6}"/);
  });

  it('splash ve profil logoyu marka rengine bağlıyor', () => {
    for (const dosya of ['views/SplashScreen.tsx', 'views/ProfileScreen.tsx']) {
      const src = oku(dosya);
      const blok = src.slice(src.indexOf('<OynaLogo'));
      expect(blok.slice(0, 400), `${dosya} logoya text-primary vermiyor`).toContain('text-primary');
    }
  });

  // Ana sayfa, onaylı tasarımla birlikte `OynaLogo` yerine tasarımın kendi
  // amblemini (components/dashboard/OynaMarks · OynaMark) kullanıyor. KURAL
  // AYNI KALDI ve bu testin koruduğu şey odur: renk kararı ÇAĞRI YERİNDE
  // görünür olsun, bileşenin içine sabitlenip kaçmasın.
  it('ana sayfa amblemi rengini açıkça çağrı yerinden veriyor', () => {
    const src = oku('views/Dashboard.tsx');
    const blok = src.slice(src.indexOf('<OynaMark'), src.indexOf('<OynaMark') + 600);
    expect(blok, 'ana sayfa amblemi renk vermiyor').toContain('color:');
  });

  it('tasarım amblemleri renk SABİTLEMİYOR — rengi üst öğeden alır', () => {
    // `fill="currentColor"` olmazsa amblem kendi rengini dayatır ve kart
    // kimliği (kategori aksanı) çağrı yerinden yönetilemez hâle gelir.
    const src = oku('components/dashboard/OynaMarks.tsx');
    expect(src).toContain('fill="currentColor"');
    // Dosyada renk sabiti (#RRGGBB) hiç olmamalı — yol verisi dışında.
    const kod = src.split('\n').filter((l) => !l.trim().startsWith("'M")).join('\n');
    expect(kod, 'amblem dosyasında sabit renk var').not.toMatch(/#[0-9A-Fa-f]{6}/);
  });
});

describe('filtre aksanı — yan yana duran aynı bileşen aynı rengi kullanır', () => {
  it('FilterDropdown dışarıdan renk almıyor', () => {
    const src = oku('components/ui/FilterDropdown.tsx');
    expect(src).not.toMatch(/accent\?:\s*string/);
    expect(src).toContain("const ACCENT = '#39FF14'");
  });

  it('MatchDiscovery üç filtreye ayrı renk geçmiyor', () => {
    expect(oku('views/MatchDiscovery.tsx')).not.toMatch(/accent=/);
  });
});

describe('dekoratif katmanlar', () => {
  it('maç lobisinde dış CDN dokusu kalmadı — çevrimdışıyken yüklenmiyordu', () => {
    // Ana sayfa hariç (kullanıcı kararı, yukarıdaki nota bak).
    expect(oku('views/MatchJoin.tsx')).not.toContain('transparenttextures.com');
  });

  it('harita seçimi yalnız renge yaslanmıyor — boyut da değişiyor', () => {
    // Keşif haritası MapLibre'den Leaflet'e taşınınca pin sınıfı
    // `.oyna-mldot` → `.oyna-ddot` oldu ("ml" = maplibre, artık yok).
    // Kural aynı: seçili pin renkle BİRLİKTE boyutça da ayrışmalı.
    const src = oku('components/map/mapBase.ts');
    const baslangic = src.indexOf('.oyna-ddot.selected .dot-core');
    expect(baslangic, 'seçili nokta pini kuralı bulunamadı').toBeGreaterThan(-1);
    expect(src.slice(baslangic, baslangic + 300)).toMatch(/transform:\s*scale/);
  });
});
