import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  GK_STYLES,
  REF_STYLES,
  MAX_PROVIDER_STYLES,
  normalizeStyles,
  providerStyles,
  stylesFor,
} from '../../shared/providerStyles';

// ════════════════════════════════════════════════════════════════════════════
// KALECİ VE HAKEM TARZLARI — kurucu kararı (2026-08-06)
// ════════════════════════════════════════════════════════════════════════════
//
// "Kalecilerin arayüzünde sweeper keeper gibi hiçbir yerden ayarlanamayan
//  verilerin olduğu kısmı sil ... istenirse biri veya ikisi seçilebilir olsun,
//  veritabanı bağlantısını sağlam kur. Aynısını hakemler için de yap."
//
// BU TESTLERİN KORUDUĞU ÜÇ ŞEY:
//   1) Liste kurucunun verdiği liste — kelimesi kelimesine, sırasıyla.
//   2) Koddaki liste ile VERİTABANI KISITI birebir aynı. Ayrışırlarsa
//      kullanıcı ekranda seçtiği tarzı kaydedemez; hata da butona basınca
//      çıkar, yani en geç anda. Burada erken yakalanır.
//   3) Ölçülmeyen "yetenek" sayıları hiçbir ekranda geri gelmez.
// ════════════════════════════════════════════════════════════════════════════

const KOK = join(__dirname, '..', '..');
const oku = (p: string) => readFileSync(join(KOK, p), 'utf8');
const MIGRATION = 'supabase/migrations/20260905000000_kaleci_hakem_tarzlari.sql';

describe('tarz listeleri — kurucunun verdiği liste', () => {
  it('kaleci tarzları birebir ve sırasıyla', () => {
    expect([...GK_STYLES]).toEqual([
      'Çizgi Kalecisi',
      'Gezici Kaleci',
      'Oyun Kurucu Kaleci',
      'Hava Hakimiyeti Yüksek Kaleci',
      'Birebir Uzmanı',
      'Savunma Komutanı',
      'Soğukkanlı Kaleci',
    ]);
  });

  it('hakem tarzları birebir ve sırasıyla', () => {
    expect([...REF_STYLES]).toEqual([
      'Disiplinci',
      'Oyunu Akıtan',
      'VAR Uzmanı',
      'Kuralcı',
      'İletişimci',
      'Soğukkanlı',
    ]);
  });

  it('en fazla iki tarz ("istenirse biri veya ikisi")', () => {
    expect(MAX_PROVIDER_STYLES).toBe(2);
  });

  it('stylesFor doğru listeyi verir', () => {
    expect(stylesFor('GK')).toBe(GK_STYLES);
    expect(stylesFor('REF')).toBe(REF_STYLES);
  });
});

describe('kod ↔ veritabanı kısıtı hizası', () => {
  const sql = oku(MIGRATION);

  it('kaleci listesinin her değeri veritabanı kısıtında var', () => {
    for (const tarz of GK_STYLES) {
      expect(sql, `${tarz} kısıtta yok`).toContain(`'${tarz}'`);
    }
  });

  it('hakem listesinin her değeri veritabanı kısıtında var', () => {
    for (const tarz of REF_STYLES) {
      expect(sql, `${tarz} kısıtta yok`).toContain(`'${tarz}'`);
    }
  });

  it('adet sınırı veritabanında da zorlanıyor', () => {
    // İstemci kapısı yeterli değil: uygulama dışından (panel, betik, doğrudan
    // API) gelen bir yazma da iki tarzla sınırlı kalmalı.
    expect(sql).toContain('cardinality(styles) <= 2');
  });

  it('iki tablo da kolonu ve kısıtı alıyor', () => {
    expect(sql).toContain('ALTER TABLE public.goalkeepers');
    expect(sql).toContain('ALTER TABLE public.referees');
    expect(sql).toContain('goalkeepers_styles_check');
    expect(sql).toContain('referees_styles_check');
  });

  it('misafir görünümleri de tarzları taşıyor', () => {
    // `public_goalkeepers` / `public_referees` maskeli view'lerdir; yeni kolon
    // otomatik eklenmez. Yazılmazsa misafir vitrinde tarz HİÇ görünmez ve
    // hiçbir hata da çıkmaz — sessiz kayıp.
    expect(sql).toContain('CREATE OR REPLACE VIEW public.public_goalkeepers');
    expect(sql).toContain('CREATE OR REPLACE VIEW public.public_referees');
  });

  it('gece denetimi eski dilde takılı kalanı sayıyor (K-TARZ-1)', () => {
    // P-0: "peki bu koruma bozulursa kim söyleyecek?" Tarzını hiç seçmemiş bir
    // sağlayıcı vitrinde tarzsız görünür — sessiz bir kayıp. Gece sayılır.
    expect(sql).toContain('k_tarz_1_eski_tarz_dili');
    expect(sql).toContain("'K-TARZ-1'");
  });
});

describe('normalizeStyles — ekrana tanınmayan etiket düşmez', () => {
  it('geçerli değerleri sırasıyla geçirir', () => {
    expect(normalizeStyles('GK', ['Gezici Kaleci', 'Birebir Uzmanı']))
      .toEqual(['Gezici Kaleci', 'Birebir Uzmanı']);
  });

  it('eski serbest metinleri atar ("Panter", "Klasik Kaleci")', () => {
    // Canlıda bugün tam olarak bu değerler var; hiçbiri yeni listede yok.
    expect(normalizeStyles('GK', ['Panter'])).toEqual([]);
    expect(normalizeStyles('GK', ['Klasik Kaleci'])).toEqual([]);
  });

  it('hakem tarzı kaleciye, kaleci tarzı hakeme geçmez', () => {
    expect(normalizeStyles('GK', ['Disiplinci'])).toEqual([]);
    expect(normalizeStyles('REF', ['Çizgi Kalecisi'])).toEqual([]);
  });

  it('yinelenenleri eler', () => {
    expect(normalizeStyles('GK', ['Kuralcı', 'Gezici Kaleci', 'Gezici Kaleci']))
      .toEqual(['Gezici Kaleci']);
  });

  it('ikiden fazlasını kırpar', () => {
    expect(normalizeStyles('GK', ['Çizgi Kalecisi', 'Gezici Kaleci', 'Birebir Uzmanı']))
      .toEqual(['Çizgi Kalecisi', 'Gezici Kaleci']);
  });

  it('bozuk girdi patlatmaz', () => {
    expect(normalizeStyles('GK', null)).toEqual([]);
    expect(normalizeStyles('GK', undefined)).toEqual([]);
    expect(normalizeStyles('GK', 42 as any)).toEqual([]);
    expect(normalizeStyles('GK', [null, 7, {}] as any)).toEqual([]);
  });

  it('tek metin de kabul edilir (eski kolonun biçimi)', () => {
    expect(normalizeStyles('REF', 'Kuralcı')).toEqual(['Kuralcı']);
  });
});

describe('providerStyles — yeni alan önce, eski metin yedek', () => {
  it('yeni çoklu alan varsa o okunur', () => {
    const gk = { styles: ['Savunma Komutanı'], style: 'Panter' };
    expect(providerStyles('GK', gk)).toEqual(['Savunma Komutanı']);
  });

  it('yeni alan boşsa eski metne düşer — ama YALNIZ kanonikse', () => {
    expect(providerStyles('GK', { styles: [], style: 'Gezici Kaleci' })).toEqual(['Gezici Kaleci']);
    expect(providerStyles('GK', { styles: [], style: 'Panter' })).toEqual([]);
  });

  it('hiçbiri yoksa boş — uydurma varsayılan atanmaz', () => {
    expect(providerStyles('GK', {})).toEqual([]);
    expect(providerStyles('REF', null)).toEqual([]);
  });
});

// ─── Ölçülmeyen sayılar geri gelmesin ────────────────────────────────────────

describe('ölçülmeyen "yetenek" sayıları ekranlara geri dönmedi', () => {
  const ATLA = new Set(['node_modules', 'dist', '.git', 'coverage', 'tests', 'supabase', 'docs', 'scripts']);

  function ekranlar(dizin = KOK, biriktir: string[] = []): string[] {
    for (const ad of readdirSync(dizin)) {
      if (ATLA.has(ad)) continue;
      const yol = join(dizin, ad);
      if (statSync(yol).isDirectory()) ekranlar(yol, biriktir);
      else if (/\.tsx$/.test(ad)) biriktir.push(yol);
    }
    return biriktir;
  }

  it('hiçbir ekranda refleks/dalış/hava hâkimiyeti ÇUBUĞU çizilmiyor', () => {
    // Bu sayılar `stats`/`skills` JSON'unda duruyor (eski kayıtlar için tip de
    // korundu) ama HİÇBİR EKRANDA gösterilmemeli: kimse ölçmüyor, kaleci de
    // giremiyordu. Kurucu kararı: kaldırıldı, yerine tarz geldi.
    const yasakli = ['aerialReach', 'oneOnOne', 'stats?.reflexes', 'stats?.diving', 'skills.reflexes'];
    const ihlal: string[] = [];
    for (const yol of ekranlar()) {
      const metin = readFileSync(yol, 'utf8');
      for (const anahtar of yasakli) {
        if (metin.includes(anahtar)) ihlal.push(`${yol.slice(KOK.length + 1)} → ${anahtar}`);
      }
    }
    expect(ihlal, `ölçülmeyen sayı ekrana geri gelmiş:\n${ihlal.join('\n')}`).toEqual([]);
  });

  it('yeni sağlayıcı uydurma yetenek sayısıyla doğmuyor', () => {
    // Panelden kaleci eklerken `reflexes: 85, diving: 80…` tohumlanıyordu.
    const s = oku('admin-panel/views/components/AddUserModal.tsx');
    expect(s).not.toContain('reflexes: 85');
    expect(s).not.toContain('authority: 85');
    expect(s).not.toContain("style: 'PANTER'");
  });
});
