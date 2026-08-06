import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { formatLabel, TEAM_FORMATS } from '../../services/teamSocialService';

// ════════════════════════════════════════════════════════════════════════════
// TAKIM FORMAT DİLİ — kurucu kararı (2026-08-06)
// ════════════════════════════════════════════════════════════════════════════
//
// "Takım kurma ve takımların görünümleri kısmındaki +1 ibaresini kaldıralım ve
//  takımlar toplam kaç kişiyse onun seçilebilmesini sağlayalım, her tarafta da
//  böyle olmasını sağlayalım."
//
// İKİ KURAL, İKİSİ DE BURADA KİLİTLİ:
//   1) Ekranda "+1" YOK. Takım kaç kişiyse o yazılır: 6v6.
//   2) Seçilebilir format listesi HER EKRANDA AYNI ve veritabanının kabul
//      ettiği listeyle birebir.
// ════════════════════════════════════════════════════════════════════════════

const KOK = join(__dirname, '..', '..');
const ATLA = new Set(['node_modules', 'dist', '.git', 'coverage', 'tests', 'supabase', 'docs']);

function kaynaklar(dizin = KOK, biriktir: string[] = []): string[] {
  for (const ad of readdirSync(dizin)) {
    if (ATLA.has(ad)) continue;
    const yol = join(dizin, ad);
    if (statSync(yol).isDirectory()) kaynaklar(yol, biriktir);
    else if (/\.(ts|tsx)$/.test(ad)) biriktir.push(yol);
  }
  return biriktir;
}

describe('formatLabel — "+1" dili kaldırıldı', () => {
  it('takım formatı olduğu gibi yazılır, "+1" üretmez', () => {
    expect(formatLabel('6v6')).toBe('6v6');
    expect(formatLabel('11v11')).toBe('11v11');
    expect(formatLabel('3v3')).toBe('3v3');
  });

  it('hiçbir format "+1" ile bitmiyor', () => {
    for (const f of TEAM_FORMATS) {
      expect(formatLabel(f), `${f} etiketi`).not.toContain('+1');
    }
  });

  it('tanınmayan/boş değer varsayılana düşer (ekranda boşluk kalmasın)', () => {
    expect(formatLabel(null)).toBe('7v7');
    expect(formatLabel('')).toBe('7v7');
    expect(formatLabel('saçma')).toBe('saçma');
  });
});

describe('seçilebilir format listesi — her ekranda aynı', () => {
  it('dokuz format da seçilebilir (veritabanı kısıtıyla birebir)', () => {
    // Canlıdaki `teams_format_check` kısıtı tam olarak bu dokuz değeri kabul
    // ediyor. Liste ondan sapa­rsa kullanıcı seçtiği formatta takım kuramaz.
    expect(TEAM_FORMATS).toEqual([
      '3v3', '4v4', '5v5', '6v6', '7v7', '8v8', '9v9', '10v10', '11v11',
    ]);
  });

  it('ekranlar kendi listesini yazmıyor — hepsi TEK kaynaktan besleniyor', () => {
    // Eskiden üç kopya vardı ve Takımlar Vitrini'ndeki BEŞ formatlıydı: 3v3,
    // 4v4, 9v9 ve 10v10 kurulan takımlar hiçbir filtreyle bulunamıyordu.
    const ihlal: string[] = [];
    for (const yol of kaynaklar()) {
      const metin = readFileSync(yol, 'utf8');
      // "elle yazılmış format dizisi" imzası: TeamFormat[] = [ '...'
      if (/TeamFormat\[\]\s*=\s*\[\s*'/.test(metin)) {
        ihlal.push(yol.slice(KOK.length + 1));
      }
    }
    // Tek istisna: listenin KENDİSİNİ tanımlayan servis dosyası.
    expect(ihlal, `format listesi elle yazılmış:\n${ihlal.join('\n')}`)
      .toEqual(['services/teamSocialService.ts']);
  });
});
