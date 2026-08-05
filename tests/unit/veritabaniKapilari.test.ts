// ════════════════════════════════════════════════════════════════════════════
// VERİTABANI KAPILARI — SÖZLEŞMELER
// ════════════════════════════════════════════════════════════════════════════
//
// PostgreSQL'de bir fonksiyon yazıldığında, aksi söylenmedikçe onu giriş yapmış
// HERKES çağırabilir. Bu yüzden zamanla 424 fonksiyon dışarıya açık kalmıştı.
// 5 Ağustos 2026'da 71 tanesi kapatıldı ve yeni fonksiyonların "kapalı doğması"
// sağlandı.
//
// Bu dosya o temizliğin sessizce geri alınmasını engeller. Üç sessiz bozulma
// yolu var ve her biri burada kilitli:
//
//   1. Kapatılan bir fonksiyon uygulamadan çağrılmaya başlanır → ekran
//      "yetkiniz yok" hatası verir ama kimse sebebini bilmez.
//   2. Erişim kurallarının (RLS) içinde kullanılan bir fonksiyon kapatılır →
//      o tablo HİÇ okunamaz hâle gelir. (Canlıda deneyle ölçüldü: 42501.)
//   3. Gece denetimi (K-KAPI-4) haritadan düşer → kapılar açılır, kimse görmez.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const oku = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

const KAPATMA_MIGRATIONLARI = [
  'supabase/migrations/20260805203555_kapilar_1_ic_yardimcilar_kapatildi.sql',
  'supabase/migrations/20260805203651_kapilar_2_kullanilmayan_fonksiyonlar_kapatildi.sql',
  'supabase/migrations/20260805203938_kapilar_3_oksuz_kalan_yardimcilar_kapatildi.sql',
];
const KALICILIK_MIGRATION = 'supabase/migrations/20260805204225_kapi_denetimi_ve_varsayilan_kapali.sql';

/**
 * Erişim kurallarının (RLS) içinde kullanılan fonksiyonlar. Bunlardan birinin
 * yetkisi alınırsa ilgili TABLO tamamen okunamaz hâle gelir — kural ifadesi
 * sorguyu yapan kullanıcının yetkisiyle çalışır.
 * (Canlıda ölçüldü: `_is_team_member` kapatılınca `team_members` 42501 verdi.)
 */
const RLS_ICINDE_KULLANILANLAR = [
  '_hire_side_for', '_is_match_participant', '_is_team_admin', '_is_team_member',
  'is_admin', 'is_platform_admin', 'is_super_admin', 'can_manage_pitch',
  'can_staff_pitch', 'can_manage_pitch_content', 'get_config_bool', 'has_role',
  'profile_privileges_unchanged', 'try_uuid',
];

/** Kapatılan fonksiyon adlarını migration dosyalarından çıkar. */
const kapatilanlar = (): string[] => {
  const adlar = new Set<string>();
  for (const dosya of KAPATMA_MIGRATIONLARI) {
    for (const m of oku(dosya).matchAll(/REVOKE ALL ON FUNCTION public\.([a-z0-9_]+)\s*\(/gi)) {
      adlar.add(m[1]);
    }
  }
  return [...adlar].sort();
};

/** Uygulama ve panel kaynağındaki `.rpc('ad')` çağrılarını topla. */
const uygulamaninCagirdiklari = (): Set<string> => {
  const kokler = ['views', 'services', 'components', 'hooks', 'utils', 'shared', 'admin-panel', 'supabase/functions'];
  const tekDosyalar = ['supabaseMutations.ts', 'supabaseAuth.ts', 'supabaseClient.ts', 'store.ts'];
  const bulunan = new Set<string>();

  const tara = (yol: string) => {
    let girdiler: ReturnType<typeof readdirSync>;
    try {
      girdiler = readdirSync(join(process.cwd(), yol), { withFileTypes: true });
    } catch {
      return;
    }
    for (const g of girdiler) {
      const alt = `${yol}/${g.name}`;
      if (g.isDirectory()) { tara(alt); continue; }
      if (!/\.(ts|tsx|js|mjs)$/.test(g.name)) continue;
      for (const m of oku(alt).matchAll(/\.rpc\(\s*['"`]([a-zA-Z0-9_]+)['"`]/g)) bulunan.add(m[1]);
    }
  };

  kokler.forEach(tara);
  for (const d of tekDosyalar) {
    try {
      for (const m of oku(d).matchAll(/\.rpc\(\s*['"`]([a-zA-Z0-9_]+)['"`]/g)) bulunan.add(m[1]);
    } catch { /* dosya yoksa gec */ }
  }
  return bulunan;
};

describe('kapatılan fonksiyonlar uygulamadan ÇAĞRILMIYOR', () => {
  it('kapatma listesi boş değil (dosyalar yerinde ve okunuyor)', () => {
    expect(kapatilanlar().length).toBeGreaterThanOrEqual(71);
  });

  it('kapatılan hiçbir fonksiyon uygulama/panel kodundan rpc ile çağrılmıyor', () => {
    const kapali = new Set(kapatilanlar());
    const cagrilan = [...uygulamaninCagirdiklari()].filter((ad) => kapali.has(ad));
    expect(
      cagrilan,
      'Bu fonksiyonların veritabanı kapısı KAPALI ama kod onları çağırıyor — ekran ' +
      '"yetkiniz yok" hatası verir. Ya çağrıyı kaldır ya da yeni bir migration ile ' +
      'GRANT EXECUTE ... TO authenticated yaz:\n' + cagrilan.join('\n'),
    ).toEqual([]);
  });
});

describe('erişim kurallarında kullanılan fonksiyonlara DOKUNULMADI', () => {
  const kapali = new Set(kapatilanlar());

  it.each(RLS_ICINDE_KULLANILANLAR)('%s kapatılmamış', (ad) => {
    expect(
      kapali.has(ad),
      `${ad} erişim kurallarının (RLS) içinde kullanılıyor. Kapatılırsa o kuralı ` +
      'kullanan TABLO tamamen okunamaz hâle gelir (canlıda ölçüldü: 42501).',
    ).toBe(false);
  });
});

describe('kapatma güvenli desende yapıldı', () => {
  it('uç fonksiyonların anahtarı (service_role) hiçbir yerde geri alınmıyor', () => {
    // REVOKE ... FROM PUBLIC, anon, authenticated — service_role ASLA listede olmamalı,
    // yoksa supabase/functions altındaki ödeme akışları durur.
    for (const dosya of [...KAPATMA_MIGRATIONLARI, KALICILIK_MIGRATION]) {
      const satirlar = oku(dosya).split('\n').filter((s) => /^\s*(REVOKE|ALTER DEFAULT PRIVILEGES)/i.test(s));
      const suclu = satirlar.filter((s) => /service_role/i.test(s));
      expect(suclu, `${dosya} service_role yetkisini alıyor:\n${suclu.join('\n')}`).toEqual([]);
    }
  });

  it('her kapatma dosyasında GERİ ALMA komutu yazılı', () => {
    for (const dosya of [...KAPATMA_MIGRATIONLARI, KALICILIK_MIGRATION]) {
      expect(oku(dosya), `${dosya} içinde geri alma komutu yok`).toMatch(/GERİ ALMA/);
    }
  });

  it('her kapatma dosyası kendi sonucunu DOĞRULUYOR', () => {
    for (const dosya of KAPATMA_MIGRATIONLARI) {
      expect(oku(dosya), `${dosya} doğrulama bloğu içermiyor`).toContain('RAISE EXCEPTION');
    }
  });
});

describe('kalıcı koruma: yeni fonksiyonlar KAPALI doğar', () => {
  const sql = oku(KALICILIK_MIGRATION);

  it('varsayılan yetki authenticated için geri alınmış', () => {
    expect(sql).toMatch(
      /ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public\s*\n?\s*REVOKE EXECUTE ON FUNCTIONS FROM authenticated/,
    );
  });

  it('onaylanmış kapı listesi tablosu RLS ile korunuyor', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.kapi_kayitli_durum');
    expect(sql).toContain('ALTER TABLE public.kapi_kayitli_durum ENABLE ROW LEVEL SECURITY');
    expect(sql).toMatch(/kapi durumunu sadece yonetici okur[\s\S]{0,200}is_admin\(\)/);
  });

  it('gece denetimi kendini de sınıyor (liste boşsa KIRMIZI)', () => {
    // P-0: koruma bozulursa kim söyleyecek? Temel liste silinirse denetim
    // sessizce yeşil dönmemeli.
    expect(sql).toMatch(/v_temel_adet = 0 THEN[\s\S]{0,200}'KIRMIZI'/);
  });

  it('kendiliğinden açılan kapı KIRMIZI, yeni fonksiyon SARI', () => {
    expect(sql).toMatch(/KENDILIGINDEN ACILMIS/);
    expect(sql).toMatch(/v_durum := 'SARI'/);
  });

  it('denetimin kendisi dışarıya kapalı', () => {
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.kapi_denetimi() FROM PUBLIC, anon, authenticated');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.kapi_temeli_guncelle(text) FROM PUBLIC, anon, authenticated');
  });

  it('K-KAPI-4 gece sağlık turuna bağlı (panel bunu gösterir)', () => {
    expect(sql).toContain("'K-KAPI-4','B05 KAPILAR'");
    expect(sql).toContain('public.kapi_denetimi()');
    // Aynı tura ikinci kez yazmayi onleyen DELETE listesinde de olmali.
    expect(sql).toMatch(/kontrol_id IN \([^)]*'K-KAPI-4'\)/);
  });

  it('kontrol mekanizma haritasına kayıtlı', () => {
    const kontroller = JSON.parse(oku('docs/sistem/KONTROLLER.json'));
    const k = kontroller.kontroller.find((x: { id: string }) => x.id === 'K-KAPI-4');
    expect(k, 'K-KAPI-4 docs/sistem/KONTROLLER.json içinde yok').toBeTruthy();
    expect(k.nasil).toContain('kapi_denetimi');

    const taslar = JSON.parse(oku('docs/sistem/YAPI-TASLARI.json'));
    const b05 = taslar.yapi_taslari.find((x: { id: string }) => x.id === 'B05');
    expect(b05.kontroller, 'K-KAPI-4 B05 KAPILAR yapı taşına bağlanmamış').toContain('K-KAPI-4');
  });
});
