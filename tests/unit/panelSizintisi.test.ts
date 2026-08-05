import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

// ════════════════════════════════════════════════════════════════════════════
// PANEL SIZINTISI BEKÇİSİ  (P-0: "peki bu koruma bozulursa kim söyleyecek?")
// ────────────────────────────────────────────────────────────────────────────
// KURAL: Oyuncu uygulaması yönetim panelinden KOD İTHAL EDEMEZ.
//
// NEDEN BİR TESTE İHTİYAÇ VAR: bu koruma tek bir `import` satırıyla sessizce
// bozulur. Kimse fark etmez — uygulama çalışmaya devam eder, yalnız panel kodu
// tekrar oyuncuların telefonuna inmeye başlar. Bu test o satırı yakalar.
//
// İSTİSNA — `import type` / `export type`:
// TypeScript tip alışverişini derlerken TAMAMEN siler; üretilen JavaScript'te
// karşılığı yoktur, dolayısıyla pakete hiçbir şey eklemez. Buna karşılık tip
// bağı köprünün (shared/adminKopru.ts) panelin imzasıyla uyumlu kalmasını
// zorlar. Bu yüzden tip serbest, DEĞER importu yasaktır.
//
// PANEL NASIL BAĞLANIYOR: bağımlılık ters çevrildi — panel açılışta kendini
// shared/adminKopru.ts'e KAYDEDER (admin-panel/admin-main.tsx).
// ════════════════════════════════════════════════════════════════════════════

const KOK = join(__dirname, '..', '..');

/** Taranmayacak yerler: panelin kendisi, üretilen/dış dosyalar, testler. */
const HARIC = new Set([
  'admin-panel', 'node_modules', 'dist', 'android', 'ios', 'test-results',
  'tests', 'scripts', '.git', 'public', 'assets', 'supabase', 'docs', 'design',
  'sozlesmeler', 'data', '.claude', '.cursor', '.github',
]);

function kaynakDosyalari(dizin: string, birikim: string[] = []): string[] {
  for (const ad of readdirSync(dizin)) {
    const tam = join(dizin, ad);
    if (HARIC.has(ad)) continue;
    if (statSync(tam).isDirectory()) kaynakDosyalari(tam, birikim);
    else if (/\.tsx?$/.test(ad)) birikim.push(tam);
  }
  return birikim;
}

/** Yorum satırlarını at — yorumdaki "admin-panel" kelimesi sızıntı değildir. */
function yorumsuz(kaynak: string): string {
  return kaynak
    .replace(/\/\*[\s\S]*?\*\//g, '')  // blok yorumlar
    .replace(/^\s*\/\/.*$/gm, '');     // satır yorumları
}

/**
 * Bir satır SALT TİP bağı mı?
 *   import type ... / export type ... / import { type X } ...
 */
function saltTip(satir: string): boolean {
  return /^\s*(import|export)\s+type\s/.test(satir) || /^\s*import\s+\{\s*type\s/.test(satir);
}

describe('Panel sızıntısı bekçisi — oyuncu uygulaması panelden kod ithal edemez', () => {
  const dosyalar = kaynakDosyalari(KOK);

  it('taranacak kaynak dosya bulundu (bekçi boşa çalışmıyor)', () => {
    // Bekçinin kendisi bozulursa (ör. yol değişir, hiçbir dosya taranmaz)
    // test "yeşil" görünüp koruma yokmuş gibi davranırdı. Bu satır onu önler.
    expect(dosyalar.length).toBeGreaterThan(200);
  });

  it('hiçbir dosya admin-panel/ altından DEĞER (runtime) importu yapmıyor', () => {
    const ihlaller: string[] = [];

    for (const dosya of dosyalar) {
      const satirlar = yorumsuz(readFileSync(dosya, 'utf-8')).split('\n');
      satirlar.forEach((satir, i) => {
        if (!satir.includes('admin-panel')) return;
        // İçe/dışa aktarım ya da dinamik import kalıbı mı?
        const bagimlilik =
          /\b(import|export)\b[^;]*['"][^'"]*admin-panel[^'"]*['"]/.test(satir) ||
          /\bimport\s*\(\s*['"][^'"]*admin-panel[^'"]*['"]/.test(satir) ||
          /\brequire\s*\(\s*['"][^'"]*admin-panel[^'"]*['"]/.test(satir);
        if (!bagimlilik) return;
        if (saltTip(satir)) return; // tip serbest — pakete hiçbir şey eklemez
        ihlaller.push(`${relative(KOK, dosya).split(sep).join('/')}:${i + 1}\n    ${satir.trim()}`);
      });
    }

    expect(
      ihlaller,
      'Oyuncu uygulaması panelden KOD ithal ediyor. Panel kodu yeniden herkesin ' +
        'telefonuna inecek. Çözüm: ihtiyacın olan işi uygulamanın kendi servisine ' +
        'taşı ya da shared/adminKopru.ts köprüsünü kullan.\n\n' +
        ihlaller.join('\n'),
    ).toEqual([]);
  });

  it('uygulama içinde panel ekranına giden bir rota YOK', () => {
    const app = readFileSync(join(KOK, 'App.tsx'), 'utf-8');
    // 'ADMIN_PANEL' rota dalı kaldırıldı; yalnız types.ts'deki birleşim tipinde
    // adı geçebilir (geçmiş uyumu). App.tsx'te render edilen bir dal OLMAMALI.
    expect(app).not.toMatch(/case\s+'ADMIN_PANEL'\s*:/);
  });

  it('köprü, panel kurulu değilken yönetici eylemini reddediyor', async () => {
    const { adminKoprusu, adminKoprusunuSifirla, adminKoprusuHazirMi } = await import(
      '../../shared/adminKopru'
    );
    adminKoprusunuSifirla();
    expect(adminKoprusuHazirMi()).toBe(false);
    expect(() => adminKoprusu()).toThrow(/yalnız yönetim panelinde/i);
  });
});
