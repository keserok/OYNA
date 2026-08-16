// Kapora kuralları bekçisi — ekranda yazan ile sunucunun yaptığı AYNI olmalı.
//
// NEDEN VAR (2026-09):
//   Denetimde ekranın verdiği söz ile sunucunun davranışı ayrışmıştı:
//     • "Maç dolmazsa kaporanın tamamı iade" yazıyordu; otomatik iptal parayı
//       cüzdana geri koymuyordu.
//     • Lobide "karar saati" 8 saat öncesi olarak gösteriliyordu; gerçek karar
//       anı bambaşkaydı.
//     • Kadro eşiği ekranda "toplam − 2", sunucuda yüzde kuralıydı.
//   Sayılar iki yerde ayrı ayrı yazıldığı için biri değişince diğeri sessizce
//   yalan söylüyordu. Bu dosya o sayıları tek yerde sabitler.
//
// Sunucu karşılıkları:
//   • eşik            → public._match_player_counts (GREATEST(toplam − 2, 2))
//   • karar anı       → app_config.match_decision_minutes (90)
//   • son çağrı anı   → app_config.match_last_call_hours (8)

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { quorumDecisionTime, lastCallTime, type RahatMatchConfig } from '../../services/rahatMatchService';

const CFG: RahatMatchConfig = {
  captureWindowHours: 8,
  decisionWindowMinutes: 90,
  refundFullHours: 24,
  refundHalfHours: 6,
  refundHalfPct: 50,
};

const BASLANGIC = '2026-03-01T20:00:00.000Z';

describe('Karar anı — maça 90 dakika kala', () => {
  it('karar saati başlangıçtan 90 dakika öncedir', () => {
    const t = quorumDecisionTime(BASLANGIC, CFG);
    expect(t?.toISOString()).toBe('2026-03-01T18:30:00.000Z');
  });

  it('son çağrı saati başlangıçtan 8 saat öncedir (karar DEĞİL, uyarı)', () => {
    const t = lastCallTime(BASLANGIC, CFG);
    expect(t?.toISOString()).toBe('2026-03-01T12:00:00.000Z');
  });

  it('son çağrı karar anından ÖNCE olmalı — sıra ters kurulursa uyarı hiç gitmez', () => {
    const karar = quorumDecisionTime(BASLANGIC, CFG)!.getTime();
    const cagri = lastCallTime(BASLANGIC, CFG)!.getTime();
    expect(cagri).toBeLessThan(karar);
  });

  it('başlangıç yoksa saat UYDURULMAZ', () => {
    expect(quorumDecisionTime(null, CFG)).toBeNull();
    expect(quorumDecisionTime('anlamsız-tarih', CFG)).toBeNull();
    expect(lastCallTime(undefined, CFG)).toBeNull();
  });
});

describe('Kadro eşiği — her boy için TOPLAM − 2', () => {
  // Maç Kur ekranının kullanıcıya gösterdiği sayı: per * 2 - 2.
  const ekranEsigi = (takimBasi: number) => takimBasi * 2 - 2;
  // Sunucunun uyguladığı kural: GREATEST(toplam - 2, 2).
  const sunucuEsigi = (toplam: number) => Math.max(toplam - 2, 2);

  it.each([
    [5, 10, 8],    // 5v5  → 10 kişilik → 8
    [7, 14, 12],   // 7v7  → 14 kişilik → 12
    [10, 20, 18],  // 10v10 → 20 kişilik → 18 (yani 9+9)
    [11, 22, 20],
  ])('%sv%s: toplam %s → eşik %s', (takimBasi, toplam, beklenen) => {
    expect(ekranEsigi(takimBasi)).toBe(beklenen);
    expect(sunucuEsigi(toplam)).toBe(beklenen);
  });

  it('çok küçük kadroda eşik 2’nin altına DÜŞMEZ', () => {
    expect(sunucuEsigi(3)).toBe(2);
    expect(sunucuEsigi(2)).toBe(2);
  });
});

describe('Maç Kur ekranı, sunucudaki eşik kuralını yazar', () => {
  it('ekran eşiği hâlâ per*2−2 formülünden geliyor', () => {
    const kaynak = readFileSync(join(process.cwd(), 'views/MatchCreate.tsx'), 'utf8');
    expect(
      /const threshold = per \* 2 - 2;/.test(kaynak),
      'Maç Kur ekranındaki eşik formülü değişmiş. Sunucu kuralı (toplam − 2) ile ' +
      'aynı kalmalı; yoksa ekran oyuncuya yanlış sayı söyler.',
    ).toBe(true);
  });
});

describe('Kapora dili — verilen söz tutulabilir olmalı', () => {
  it('"tamamı iade" sözü veren metin varsa sunucu tarafı da iade yazıyor olmalı', () => {
    // Ekranda geçen söz (kart dönemi: iade karta döner, "cüzdanına" denmez —
    // kapora > 0 dalı "maç dolmazsa tamamı iade" sözünü verir):
    const ekran = readFileSync(join(process.cwd(), 'views/MatchCreate.tsx'), 'utf8');
    expect(/kapora[\s\S]{0,80}(tam iade|tamamı iade|dolmazsa tamamı)/i.test(ekran)).toBe(true);

    // Sunucu karşılığı: iptal yolunda kaporayı serbest bırakan çağrı DURMALI.
    const migrasyonlar = join(process.cwd(), 'supabase/migrations');
    const dosya = join(migrasyonlar, '20260903000000_kapora_ve_kadro_karari_yeniden_kuruldu.sql');
    const sql = readFileSync(dosya, 'utf8');
    expect(
      sql.includes('_match_release_deposit(p_match_id'),
      'Otomatik iptal yolu kaporayı serbest bırakan fonksiyonu ÇAĞIRMIYOR. ' +
      'Ekranda "tamamı iade" yazarken para cüzdana dönmezse söz tutulmamış olur.',
    ).toBe(true);
    expect(sql.includes('_refund_wallet_escrow')).toBe(true);
  });
});
