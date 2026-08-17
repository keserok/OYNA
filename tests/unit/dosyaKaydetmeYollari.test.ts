/**
 * DOSYA KAYDETME YOLLARI (denetim B1 — 17 Ağustos 2026)
 *
 * KUSUR: Android'de hiçbir "kaydet/indir" düğmesi çalışmıyordu, ÜSTELİK
 * ekranlar "kaydedildi" diyordu.
 *
 * Neden: yardımcı üç yol deniyordu — Web Share (dosyalı) → `<a download>` →
 * desteklenmiyor. Android Capacitor WebView'ında `navigator.share` HİÇ YOK ve
 * `<a download>` de çalışmaz (WebView'a DownloadListener bağlı değil). Yani
 * Android her seferinde ikinci yola düşüp 'INDIRILDI' döndürüyordu; çağıran
 * ekranlar da buna bakıp başarı mesajı yazıyordu. Dosya ortada yok.
 * Yalan başarı mesajı, sessiz hatadan daha kötüdür.
 *
 * DÜZELTME: pakette dosya @capacitor/filesystem ile diske yazılır ve
 * @capacitor/share ile sistem paylaşım sayfası açılır. Eklentiler `npx cap sync`
 * yapılmadan native tarafta bulunmayabileceği için çağrı DİNAMİK import +
 * try/catch içindedir; eksiklerse uygulama ÇÖKMEZ, eski yollara düşer.
 * Hiçbiri olmazsa 'DESTEKLENMIYOR' döner ve ekran bunu kullanıcıya SÖYLER.
 *
 * Bu dosya üç şeyi kilitler:
 *   (a) yardımcının yol sırası ve dürüst sonuçları (davranış testi),
 *   (b) native yolun dinamik import + try/catch ile çağrılması,
 *   (c) HER çağrı sitesinin dönen sonuca bakması; 'IPTAL' ve 'DESTEKLENMIYOR'
 *       durumlarında ASLA başarı mesajı yazmaması.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const oku = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/** Yorum satırlarını atar — kural metinleri yorumda geçebilir, KODDA geçmemeli. */
const yorumsuz = (kaynak: string) =>
  kaynak.split('\n').filter((s) => !/^\s*(\/\/|\*|\/\*)/.test(s));

// ════════════════════════════════════════════════════════════════════════════
// (a) + (b) — YARDIMCININ DAVRANIŞI
// ════════════════════════════════════════════════════════════════════════════

type Izler = {
  yazilan: { path?: string; directory?: string }[];
  paylasilan: { files?: string[]; title?: string }[];
  tiklananIndirme: string[];
};

type Kurulum = {
  native?: boolean;
  /** false → dinamik import REDDEDİLİR (kurucu `npx cap sync` yapmamış). */
  eklentiVar?: boolean;
  /** Share eklentisinin fırlatacağı hata (iptal senaryosu için). */
  shareHatasi?: Error;
  /** writeFile'ın döndüreceği uri; undefined → yazma başarısız sayılır. */
  writeUri?: string;
  /** Tarayıcı/WebView'da navigator.share var mı? */
  webShare?: boolean;
  /** navigator.share'in fırlatacağı hata. */
  webShareHatasi?: Error;
};

async function kur(opts: Kurulum) {
  vi.resetModules();

  const izler: Izler = { yazilan: [], paylasilan: [], tiklananIndirme: [] };

  if (opts.eklentiVar === false) {
    // Modül HİÇ yüklenemiyor → dinamik import promise'i reddeder.
    vi.doMock('@capacitor/filesystem', () => {
      throw new Error('Filesystem plugin is not implemented on android');
    });
    vi.doMock('@capacitor/share', () => {
      throw new Error('Share plugin is not implemented on android');
    });
  } else {
    vi.doMock('@capacitor/filesystem', () => ({
      Directory: { Cache: 'CACHE', Documents: 'DOCUMENTS' },
      Filesystem: {
        writeFile: async (o: { path: string; directory: string }) => {
          izler.yazilan.push(o);
          return { uri: 'writeUri' in opts ? opts.writeUri : `file:///cache/${o.path}` };
        },
      },
    }));
    vi.doMock('@capacitor/share', () => ({
      Share: {
        share: async (o: { files?: string[]; title?: string }) => {
          izler.paylasilan.push(o);
          if (opts.shareHatasi) throw opts.shareHatasi;
          return {};
        },
      },
    }));
  }

  const { Capacitor } = await import('@capacitor/core');
  vi.mocked(Capacitor.isNativePlatform).mockReturnValue(!!opts.native);

  // Web Share yüzeyi — Android WebView'da HİÇ YOKTUR, bu yüzden varsayılan kapalı.
  const nav = navigator as unknown as Record<string, unknown>;
  if (opts.webShare) {
    nav.share = async () => {
      if (opts.webShareHatasi) throw opts.webShareHatasi;
    };
    nav.canShare = () => true;
  } else {
    delete nav.share;
    delete nav.canShare;
  }

  // jsdom'da yok; klasik indirme yolunun gerçekten yürüdüğünü buradan görürüz.
  (URL as unknown as { createObjectURL: unknown }).createObjectURL = () => 'blob:sahte';
  (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = () => {};
  const tiklama = vi
    .spyOn(HTMLAnchorElement.prototype, 'click')
    .mockImplementation(function (this: HTMLAnchorElement) {
      izler.tiklananIndirme.push(this.download);
    });

  const { dosyaKaydetVeyaPaylas } = await import('../../utils/dosyaKaydet');
  return { dosyaKaydetVeyaPaylas, izler, tiklama };
}

const ornekBlob = () => new Blob(['gun;tutar\n2026-08-17;100'], { type: 'text/csv' });

describe('dosyaKaydet · yol sırası ve dürüst sonuçlar', () => {
  beforeEach(() => {
    const nav = navigator as unknown as Record<string, unknown>;
    delete nav.share;
    delete nav.canShare;
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock('@capacitor/filesystem');
    vi.doUnmock('@capacitor/share');
  });

  it('WEB · paylaşım yoksa klasik indirmeye düşer (davranış DEĞİŞMEDİ)', async () => {
    const { dosyaKaydetVeyaPaylas, izler } = await kur({ native: false, webShare: false });
    const sonuc = await dosyaKaydetVeyaPaylas(ornekBlob(), 'rapor.csv', 'OYNA Finans');
    expect(sonuc).toBe('INDIRILDI');
    expect(izler.tiklananIndirme).toEqual(['rapor.csv']);
  });

  it('WEB · Web Share varsa paylaşım sayfası açılır', async () => {
    const { dosyaKaydetVeyaPaylas, izler } = await kur({ native: false, webShare: true });
    const sonuc = await dosyaKaydetVeyaPaylas(ornekBlob(), 'rapor.csv');
    expect(sonuc).toBe('PAYLASILDI');
    expect(izler.tiklananIndirme).toEqual([]);
  });

  it('WEB · kullanıcı paylaşımdan vazgeçerse INDİRMEYE DÜŞMEZ (IPTAL)', async () => {
    const abort = Object.assign(new Error('iptal'), { name: 'AbortError' });
    const { dosyaKaydetVeyaPaylas, izler } = await kur({
      native: false, webShare: true, webShareHatasi: abort,
    });
    expect(await dosyaKaydetVeyaPaylas(ornekBlob(), 'rapor.csv')).toBe('IPTAL');
    expect(izler.tiklananIndirme).toEqual([]);
  });

  it('ANDROID · eklentilerle dosya diske yazılır ve paylaşım sayfası açılır', async () => {
    const { dosyaKaydetVeyaPaylas, izler } = await kur({ native: true, webShare: false });
    const sonuc = await dosyaKaydetVeyaPaylas(ornekBlob(), 'finans_2026-08.csv', 'OYNA Finans');

    expect(sonuc).toBe('PAYLASILDI');
    expect(izler.yazilan).toHaveLength(1);
    expect(izler.yazilan[0].path).toBe('finans_2026-08.csv');
    // Cache dizini file_paths.xml'deki <cache-path> ile eşleşir; Share eklentisi
    // dosyayı ancak oradan FileProvider ile paylaşabilir.
    expect(izler.yazilan[0].directory).toBe('CACHE');
    expect(izler.paylasilan[0].files).toEqual(['file:///cache/finans_2026-08.csv']);
    // Pakette çalışmayan `<a download>` yolu DENENMEZ.
    expect(izler.tiklananIndirme).toEqual([]);
  });

  it('ANDROID · REGRESYON: eklenti yoksa ÇÖKMEZ ve "indirildi" YALANI SÖYLEMEZ', async () => {
    // `npx cap sync` yapılmamış senaryosu: dinamik import reddeder.
    // Android WebView'da navigator.share da yoktur → hiçbir yol kalmaz.
    const { dosyaKaydetVeyaPaylas, izler } = await kur({
      native: true, eklentiVar: false, webShare: false,
    });
    const sonuc = await dosyaKaydetVeyaPaylas(ornekBlob(), 'bilet.png', 'OYNA Bilet');

    expect(sonuc).toBe('DESTEKLENMIYOR');
    expect(sonuc).not.toBe('INDIRILDI');
    // Kusurun ta kendisi: çalışmadığı bilinen indirme yolu denenip başarı sayılıyordu.
    expect(izler.tiklananIndirme).toEqual([]);
  });

  it('IOS · eklenti yoksa Web Share yedeği devreye girer', async () => {
    const { dosyaKaydetVeyaPaylas } = await kur({
      native: true, eklentiVar: false, webShare: true,
    });
    expect(await dosyaKaydetVeyaPaylas(ornekBlob(), 'bilet.png')).toBe('PAYLASILDI');
  });

  it('PAKET · kullanıcı paylaşım sayfasını kapatırsa IPTAL döner (hata değil)', async () => {
    // Capacitor Share eklentisi iOS ve Android'de "Share canceled" ile reddeder.
    const { dosyaKaydetVeyaPaylas, izler } = await kur({
      native: true, webShare: false, shareHatasi: new Error('Share canceled'),
    });
    expect(await dosyaKaydetVeyaPaylas(ornekBlob(), 'bilet.png')).toBe('IPTAL');
    expect(izler.tiklananIndirme).toEqual([]);
  });

  it('PAKET · diske yazılamazsa başarı UYDURULMAZ', async () => {
    const { dosyaKaydetVeyaPaylas, izler } = await kur({
      native: true, webShare: false, writeUri: undefined,
    });
    expect(await dosyaKaydetVeyaPaylas(ornekBlob(), 'bilet.png')).toBe('DESTEKLENMIYOR');
    expect(izler.paylasilan).toEqual([]);
  });
});

describe('dosyaKaydet · native yol dinamik import + try/catch ile çağrılır', () => {
  const kaynak = oku('utils/dosyaKaydet.ts');
  const kod = yorumsuz(kaynak).join('\n');

  it('eklentiler STATİK import edilmez (yoksa modül yüklenirken patlar)', () => {
    expect(kod).not.toMatch(/^\s*import\s[^\n]*['"]@capacitor\/(filesystem|share)['"]/m);
  });

  it('eklentiler DİNAMİK import ile çağrılır', () => {
    expect(kod).toMatch(/import\(\s*['"]@capacitor\/filesystem['"]\s*\)/);
    expect(kod).toMatch(/import\(\s*['"]@capacitor\/share['"]\s*\)/);
  });

  it('dinamik import bir try/catch içindedir', () => {
    // Dinamik import satırının ÖNCESİNDE bir `try {` bulunmalı, sonrasında `catch`.
    const i = kod.indexOf("import('@capacitor/filesystem')");
    expect(i).toBeGreaterThan(-1);
    expect(kod.slice(0, i)).toContain('try {');
    expect(kod.slice(i)).toContain('catch');
  });

  it('pakette klasik `<a download>` yoluna düşülmez', () => {
    // `pakette` doğruysa indirme denenmeden 'DESTEKLENMIYOR' dönmeli.
    expect(kod).toMatch(/if\s*\(pakette\)\s*return\s*'DESTEKLENMIYOR'/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// (c) — ÇAĞRI SİTELERİ SONUCU KONTROL EDİYOR MU?
// ════════════════════════════════════════════════════════════════════════════

/** Dosya GERÇEKTEN kaydedildiğinde kullanılabilecek başarı ifadeleri. */
const BASARI_IFADELERI = /(kaydedildi|indirildi|paylaşıma hazır)/i;

/** Sonuca bakıldığını gösteren dallanma. */
const SONUC_DALI = /['"]DESTEKLENMIYOR['"]/;

type CagriSitesi = { yol: string; cagri: RegExp; not: string };

const CAGRI_SITELERI: CagriSitesi[] = [
  { yol: 'views/MatchTicket.tsx', cagri: /await dosyaKaydetVeyaPaylas\(/, not: 'bilet QR' },
  { yol: 'views/SettingsScreen.tsx', cagri: /await dosyaKaydetVeyaPaylas\(/, not: 'KVKK veri dışa aktarımı' },
  { yol: 'views/owner/OwnerFinanceView.tsx', cagri: /await dosyaKaydetVeyaPaylas\(/, not: 'aylık finans CSV' },
  { yol: 'views/owner/finance/FinanceRangeReport.tsx', cagri: /await dosyaKaydetVeyaPaylas\(/, not: 'tarih aralıklı rapor CSV' },
  { yol: 'views/Studio.tsx', cagri: /await downloadBlob\(/, not: 'taktik görseli' },
];

describe('Çağrı siteleri · dönen sonuca göre konuşuyor', () => {
  for (const { yol, cagri, not } of CAGRI_SITELERI) {
    it(`${not} (${yol}) sonucu YOK SAYMIYOR`, () => {
      const satirlar = yorumsuz(oku(yol));
      const cagrilar = satirlar
        .map((s, i) => ({ s, i }))
        .filter(({ s }) => cagri.test(s));

      expect(cagrilar.length, `${yol} içinde çağrı bulunamadı`).toBeGreaterThan(0);

      for (const { s, i } of cagrilar) {
        // Sonuç bir değişkene alınmalı: `void ...` ya da çıplak `await ...`
        // kusurun ta kendisiydi (dönen değer çöpe gidiyordu).
        expect(s, `${yol}:${i + 1} sonucu bir değişkene almıyor`).toMatch(/=\s*await\s/);
        expect(s, `${yol}:${i + 1} sonucu \`void\` ile atıyor`).not.toMatch(/\bvoid\s+(dosyaKaydetVeyaPaylas|downloadBlob)\b/);

        // Çağrının hemen ardındaki blokta 'DESTEKLENMIYOR' dallanması olmalı —
        // yoksa kullanıcı dosyanın kaydedilmediğini HİÇ öğrenemez.
        const pencere = satirlar.slice(i, i + 20).join('\n');
        expect(pencere, `${yol}:${i + 1} 'DESTEKLENMIYOR' durumunu kullanıcıya söylemiyor`)
          .toMatch(SONUC_DALI);
      }
    });

    it(`${not} (${yol}) 'IPTAL'/'DESTEKLENMIYOR' için BAŞARI mesajı yazmıyor`, () => {
      const satirlar = yorumsuz(oku(yol));
      const cagrilar = satirlar
        .map((s, i) => ({ s, i }))
        .filter(({ s }) => cagri.test(s));

      for (const { i } of cagrilar) {
        for (const satir of satirlar.slice(i, i + 20)) {
          if (!BASARI_IFADELERI.test(satir)) continue;
          // Başarı ifadesi yalnız 'PAYLASILDI'/'INDIRILDI' dalında geçebilir.
          expect(satir, `koşulsuz başarı mesajı: ${yol} → ${satir.trim()}`)
            .toMatch(/PAYLASILDI|INDIRILDI/);
        }
      }
    });
  }

  it('shareImage.downloadBlob sonucu yutmadan geri verir', () => {
    const kod = yorumsuz(oku('views/studio/shareImage.ts')).join('\n');
    expect(kod).toMatch(/return\s+dosyaKaydetVeyaPaylas\(/);
    expect(kod).toContain('KaydetSonucu');
  });

  it('paket bağımlılıkları eklendi (kurucu `npx cap sync` çalıştırmalı)', () => {
    const pkg = JSON.parse(oku('package.json')) as { dependencies: Record<string, string> };
    expect(pkg.dependencies['@capacitor/share']).toBeTruthy();
    expect(pkg.dependencies['@capacitor/filesystem']).toBeTruthy();
  });
});
