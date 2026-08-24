/**
 * KOMİSYON MODELİ — KURUCU KARARI (24 Ağustos 2026) KİLİDİ
 *
 * Karar tek cümle:
 *   · Tesis %8,5 öder (5,0 OYNA + 3,5 ödeme altyapısı).
 *   · Oyuncu maça katılırken kişi başı ücretine %10 eklenir (300 → 330).
 *   · Kapora MARKUPSIZDIR: kullanıcı ekranda yazanı öder, üzerine bir şey
 *     eklenmez (§2.14 "etikette yazan ödenir").
 *
 * ─── NEDEN BU DOSYA VAR ─────────────────────────────────────────────────────
 * Bu kararı uygularken GERÇEK bir hata yapıldı ve yakalanması zor oldu:
 * %10, `commission_config` içindeki MODEL_B satırına yazıldı. Oysa maç
 * fiyatını hesaplayan zincir MODEL_B'yi hiç okumuyor —
 * `create_match_atomic → _pitch_agreement` daima GLOBAL/**MODEL_A** satırına
 * düşüyor. Yani karar sessizce uygulanmıyordu; oyuncu 300 ödemeye devam
 * ediyordu.
 *
 * Hatanın gizlenme sebebi öğreticidir: `calculate_commission(300, …,'MODEL_B')`
 * DOĞRUDAN çağrıldığında 330 dönüyordu ve doğrulama yeşil görünüyordu. Ama
 * gerçek akış o çağrıyı hiç yapmaz. Bu yüzden buradaki testler ORANLARIN
 * NEREDE DURDUĞUNA değil, ZİNCİRİN ÜRETTİĞİ RAKAMA bakar.
 *
 * ─── BU DOSYA NEYİ ÖLÇER ────────────────────────────────────────────────────
 * Sunucuya bağlanamayız (birim testi). O yüzden ölçtüğümüz şey şudur:
 * istemcideki hesap, sunucudaki hesabın BİREBİR ikizi mi ve kararın rakamlarını
 * mı üretiyor? İkisi ayrıştığı gün kullanıcı ekranda bir rakam görüp başka bir
 * rakam öder — bu testin varlık sebebi tam olarak odur.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PITCH_PRICE_FALLBACK,
  oyuncuToplami,
  type PitchPricePreview,
} from '../../services/matchCreateService';

const oku = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/** Yürürlükteki karar — tek yerde yazılı, testlerin tamamı buradan okur. */
const KARAR = {
  tesisKesintisi: 8.5,   // tesisten düşülen toplam
  oynaPayi: 5.0,         // bunun OYNA'ya kalanı
  pspPayi: 3.5,          // bunun ödeme altyapısına gideni
  oyuncuPayi: 10.0,      // oyuncunun kişi başı ücretine eklenen
} as const;

const onizleme = (markupPct: number): PitchPricePreview => ({
  markupPct, markupAmount: 0, fullHours: 24, halfHours: 6, halfPct: 50,
});

describe('Komisyon modeli · kurucu kararının rakamları', () => {
  it('kurucunun verdiği örnek birebir çıkıyor: 300 → 330', () => {
    expect(oyuncuToplami(300, onizleme(KARAR.oyuncuPayi))).toBe(330);
  });

  it('slot ücretinden kişi başı ücret doğru türüyor (2400 TL / 8 oyuncu → 330)', () => {
    // Sunucudaki ikizi: CEIL((slot + markup) / (per*2)) — create_match_atomic.
    const slot = 2400;
    const toplam = oyuncuToplami(slot, onizleme(KARAR.oyuncuPayi));
    expect(toplam).toBe(2640);
    expect(Math.ceil(toplam / 8)).toBe(330);
  });

  it('canlı tarifeyle de tutarlı (3200 TL / 16 oyuncu → 220)', () => {
    const toplam = oyuncuToplami(3200, onizleme(KARAR.oyuncuPayi));
    expect(Math.ceil(toplam / 16)).toBe(220);
  });

  it('tesisin eline geçen: 960 TL kaporadan %8,5 düşer → 878,40', () => {
    const kapora = 960;
    const kesinti = Math.round(kapora * KARAR.tesisKesintisi) / 100;
    expect(kesinti).toBe(81.6);
    expect(Math.round((kapora - kesinti) * 100) / 100).toBe(878.4);
  });

  it('kesintinin kırılımı toplamı verir: 5,0 + 3,5 = 8,5', () => {
    // Finansal tablolar "OYNA 8,5 aldı" DEMEMELİ; 3,5 puanı ödeme altyapısının.
    expect(KARAR.oynaPayi + KARAR.pspPayi).toBe(KARAR.tesisKesintisi);
    const kapora = 960;
    expect(Math.round(kapora * KARAR.oynaPayi) / 100).toBe(48);
    expect(Math.round(kapora * KARAR.pspPayi) / 100).toBe(33.6);
  });
});

describe('Komisyon modeli · istemci ile sunucu ayrışmasın', () => {
  it('istemcideki yedek oran, kararın oranıyla AYNI', () => {
    // Saha okunamazsa ekran bu sayıyı kullanır. Sunucudan saptığı gün
    // kullanıcı ekranda bir rakam görüp başka bir rakam öder.
    expect(PITCH_PRICE_FALLBACK.markupPct).toBe(KARAR.oyuncuPayi);
  });

  it('istemci hesabı sunucudaki `_markup_tutari` ile aynı kuralı uygular', () => {
    // Sabit tutar doluysa yüzde YOK SAYILIR — sunucudaki davranışın ikizi.
    const sabitli: PitchPricePreview = { ...onizleme(10), markupAmount: 50 };
    expect(oyuncuToplami(300, sabitli)).toBe(350); // 50 eklendi, %10 yok sayıldı
  });

  it('göç dosyaları kararın oranlarını taşıyor', () => {
    // Göç depoda durmazsa canlı ile depo ayrışır — bu projenin baş belası.
    const g = oku('supabase/migrations/20260917000000_komisyon_modeli_kurucu_karari.sql');
    expect(g).toContain('rate_pct   = 8.5');
    expect(g).toContain('commission_psp_share_pct');
    expect(g).toContain('commission_oyna_share_pct');

    const d = oku('supabase/migrations/20260917000001_markup_dogru_modele_yazildi.sql');
    expect(d).toContain('markup_pct = 10.0');
    // Düzeltmenin özü: MODEL_A da güncellenmeli, yoksa maç akışı okumaz.
    expect(d).toContain("model IN ('MODEL_A', 'MODEL_B')");
  });

  it('ESKİ oranlar hiçbir yerde saklı kalmadı', () => {
    // 15/5 ve 5/20 dönerse kimse fark etmeden yanlış para akar.
    const d = oku('supabase/migrations/20260917000001_markup_dogru_modele_yazildi.sql');
    expect(d).toContain('rate_pct := 8.5');
    expect(d).not.toContain('rate_pct := 15.0');
    expect(oku('services/matchCreateService.ts')).not.toContain('markupPct: 5,');
  });
});

describe('Komisyon modeli · kapora markupsız kalır', () => {
  it('kapora hesabına oyuncu payı EKLENMEZ', () => {
    // §2.14: kullanıcı tek rakam görür ve o rakamı öder. Kaporayı
    // `_resolve_court_quote` üretir ve o zincirde `_markup_tutari` çağrılmaz;
    // 20260917000001 göçü bunu sunucuda da doğrular.
    const g = oku('supabase/migrations/20260917000001_markup_dogru_modele_yazildi.sql');
    expect(g).toContain('kapora zincirine markup sizmis');
  });

  it('kart bedeli kullanıcıya ayrı satır olarak eklenmiyor', () => {
    // get_card_fee_quote bilerek kapalı bırakıldı (20 Ağu 2026). Bu kararın
    // yeni komisyon modelinde de sürdüğünü kilitliyoruz: %3,5'i TESİS üstlenir,
    // kullanıcının ödediği tutara eklenmez.
    const g = oku('supabase/migrations/20260917000000_komisyon_modeli_kurucu_karari.sql');
    expect(g).toContain('ÜZERİNE HİÇBİR ŞEY EKLENMEZ');
  });
});
