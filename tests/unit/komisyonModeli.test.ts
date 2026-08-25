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

describe('Demo ödeme · kullanıcı yanılmasın', () => {
  /**
   * Kurucu kararı (24 Ağu 2026): iyzico sözleşmesi tamamlanana kadar demo
   * ödemeyle ilerlenir. Bu, sistemin bilinçli bir güvenlik kilidini gevşetir —
   * `resolve_payment_mode` normalde sağlayıcı canlı değilken online ödemeyi
   * HİÇ teklif etmez, çünkü simülasyonda kullanıcı "ödedim" sanır ama para
   * hareket etmez.
   *
   * Kilit gevşetildiğine göre yerine DÜRÜSTLÜK konmalı: ekran kullanıcıya
   * bunun test ödemesi olduğunu söylemek zorunda.
   */
  it('ödeme ekranı test uyarısını SUNUCUDAN sürüyor, koda gömmüyor', () => {
    // Koda gömülseydi iyzico canlıya alındığı gün uyarı ekranda KALIRDI ve
    // gerçek ödeme yapan kullanıcıya "para çekilmez" denirdi. Sunucudan
    // sürüldüğü için `payment_provider = IYZICO` olduğu an kendiliğinden
    // kaybolur — yeni paket gerekmez.
    const ekran = oku('views/PaymentScreen.tsx');
    expect(ekran).toContain('payMode?.simulation === true');
    expect(ekran).toContain('Bu bir TEST ödemesidir');
    // Uyarı, ödeme modu bilinmeden ya da online kapalıyken çizilmemeli.
    expect(ekran).toContain('payMode?.simulation === true && onlineAllowed');
  });

  it('uyarı KART SEÇİMİNDEN ÖNCE çiziliyor', () => {
    // İlk denemede ekranın en altına konmuştu ve yapışkan alt çubuk metnin
    // üstüne binip yarısını örtüyordu. Görülmeyen uyarı, uyarı değildir.
    const ekran = oku('views/PaymentScreen.tsx');
    const uyari = ekran.indexOf('Bu bir TEST ödemesidir');
    const kartSecici = ekran.indexOf('Ödeme Yöntemi');
    expect(uyari).toBeGreaterThan(-1);
    expect(kartSecici).toBeGreaterThan(-1);
    expect(uyari, 'uyarı kart seçicisinden SONRA çiziliyor').toBeLessThan(kartSecici);
  });

  it('simulation alanı tipte tanımlı ve güvenli varsayılanı false', () => {
    // Ağ hatasında online ödeme zaten açılmaz; uyarı da gösterilmemeli.
    expect(oku('types.ts')).toContain('simulation: boolean;');
    expect(oku('services/paymentModeService.ts')).toContain('simulation: false,');
  });

  it('göç, simulation bayrağının TRUE döndüğünü DOĞRULUYOR', () => {
    // Anahtarlar açılıp bayrak false dönseydi kullanıcı test ödemesi
    // yaptığını hiç öğrenmezdi — kararın en tehlikeli hâli.
    const g = oku('supabase/migrations/20260917000002_demo_odeme_acildi.sql');
    expect(g).toContain("(v->>'simulation')::boolean IS NOT TRUE");
    expect(g).toContain('ekran test uyarisini cizemez');
  });
});

describe('Demo ödeme · uyarı akışın TAMAMINDA', () => {
  /**
   * 24 Ağustos 2026 denetimi, uyarının yalnız TEK ekranda olduğunu buldu.
   * Kullanıcı akışta üç ekran görüyor ve ikisinde hiçbir işaret yoktu:
   *
   *   1. Ödeme ekranı   → kırmızı uyarı VARDI
   *   2. Kart formu     → uyarı YOK; üstelik "banka doğrulaması (3D Secure)
   *                       ile tahsil edilir" diyordu. İkisi de yalandı ve
   *                       incelemeci gerçek kartını girmeye zorlanıyordu.
   *   3. Başarı ekranı  → uyarı YOK; işlem numaralı bir makbuz çiziyordu.
   *
   * Uyarının tam da "ödendi" iddiasının yapıldığı anda kaybolması, hiç
   * olmamasından kötüdür: kullanıcı ilkini unutur, makbuzu hatırlar.
   */
  it('kart formu simülasyonu BİLİYOR ve yanlış söz vermiyor', () => {
    const kart = oku('components/payment/AddCardScreen.tsx');
    expect(kart).toContain('simulation');
    expect(kart).toContain('Bu bir TEST ödemesidir');
    // Simülasyonda 3DS/tahsilat sözü SUSTURULMALI.
    const guvenlikNotu = kart.slice(kart.indexOf('simulation\n'), kart.indexOf('{error && ('));
    expect(kart).toContain("? 'Test modunda kart bilgilerin hiçbir bankaya");
    expect(guvenlikNotu.length).toBeGreaterThan(0);
  });

  it('bayrak ödeme ekranından kart formuna GEÇİRİLİYOR', () => {
    // Bileşen desteklese de prop bağlanmazsa uyarı hiç çizilmez.
    expect(oku('views/PaymentScreen.tsx'))
      .toContain('simulation={payMode?.simulation === true && onlineAllowed}');
  });

  it('başarı ekranında da uyarı var ve makbuz TEST diye etiketli', () => {
    const ekran = oku('views/PaymentScreen.tsx');
    const basari = ekran.slice(ekran.indexOf("if (screen === 'SUCCESS')"));
    expect(basari).toContain('Bu bir TEST ödemesidir');
    expect(basari).toContain("payMode?.simulation === true ? 'Test İşlem No' : 'İşlem No'");
    expect(basari).toContain("'Kart · TEST'");
  });

  it('ekran KENDİ İÇİNDE çelişmiyor', () => {
    // Kırmızı "para çekilmez" uyarısının altında yeşil "tamamı karttan tahsil
    // edilir" kutusu duruyordu. İncelemeci hangisinin doğru olduğunu bilemez.
    const ekran = oku('views/PaymentScreen.tsx');
    expect(ekran).toContain("? 'TEST · tahsilat yok'");
    expect(ekran).toContain('Bu işlemde kartından tahsilat yapılmaz');
    // Simülasyonda banka doğrulaması HİÇ açılmaz.
    expect(ekran).toContain("? 'Test işlemi çalıştırılıyor…'");
  });

  it('kart kaydetme varsayılanı KAPALI', () => {
    // Kutu açık geliyordu ve kayıtlı kartı silecek bir ekran YOK.
    expect(oku('components/payment/AddCardScreen.tsx')).toContain('useState(false)');
  });
});

describe('Kurulum sihirbazı · kapan değil', () => {
  it('sihirbazda ÇIKIŞ var — hesap silmeye giden yol açık kalıyor', () => {
    // "Atla" kaldırıldığında yerine hiçbir şey konmamıştı: hesap kayıtta zaten
    // açılıyor, kullanıcı her açılışta bu ekrana düşüyor, ama yaşını/adını
    // vermek istemiyorsa uygulamadan çıkmanın da hesabını silmenin de yolu
    // yoktu. Apple 5.1.1(v) hesabın uygulama İÇİNDEN silinebilmesini şart
    // koşar; silme ekranına giden tek yol Ayarlar'dır.
    const ob = oku('views/Onboarding.tsx');
    expect(ob).toContain('const cikisYap');
    expect(ob).toContain('await logout()');
    expect(ob).toContain('aria-label="Çıkış yap"');
    // Zorunluluk GEVŞEMEDİ: kapılar hâlâ ctaEnabled içinde.
    expect(ob).toContain('case 1: return ageIndex !== null');
    expect(ob).not.toContain('const handleSkip');
  });
});

describe('KVKK rıza kaydı · söylediğimizi yazıyoruz', () => {
  it('kayıt başarılı olduğunda rıza sunucuya yazılıyor', () => {
    // Ekran üç belgeyi onaylatıyordu ama sunucudaki user_consents tablosu
    // 41 kullanıcıya karşılık BOŞTU. KVKK'da açık rızanın ispat yükü veri
    // sorumlusundadır; bir şikâyette elimizde hiçbir kanıt yoktu.
    const auth = oku('views/AuthScreen.tsx');
    expect(auth).toContain("recordUserConsents(['TERMS', 'KVKK', 'PRIVACY'])");
    expect(auth).toContain("from '../services/consentService'");
    // Hem şifreli kayıtta hem sağlayıcı yolunda çağrılmalı.
    expect(auth.match(/recordUserConsents\(/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it('rıza kaydı akışı BLOKE ETMİYOR', () => {
    // Sunucu yazamazsa kullanıcı içeri girmeye devam etmeli; kaydı bloke
    // etmek, çözdüğünden büyük bir sorun yaratır.
    expect(oku('views/AuthScreen.tsx')).toContain('void recordUserConsents');
    expect(oku('services/consentService.ts')).toContain('best-effort');
  });
});

describe('Yasal metinler · ürünün bugünkü hâlini anlatıyor', () => {
  it('iyzico maddesi "bugün geçerli değil" notuyla duruyor', () => {
    // Ödeme ekranı "bu bir TEST ödemesidir" derken bağlayıcı sözleşme
    // "ödemeniz lisanslı kuruluş iyzico üzerinden gerçekleşir" diyordu.
    for (const yol of ['shared/legalDocs.ts', 'sozlesmeler/oyuncu/01-kullanim-sartlari.md']) {
      expect(oku(yol), yol).toContain('Ödeme altyapısı canlıya alınana kadar uygulama içi ödemeler TEST');
    }
  });

  it('rol sözleşmelerinde "cüzdana iade" kalmadı', () => {
    // Cüzdan kalıcı olarak kapalı (§2.10); iade karta döner.
    expect(oku('shared/legalDocsRol.ts')).not.toContain('cüzdanına iade');
  });

  it('iade modeli TEK: kesinti yok', () => {
    // Aynı belgenin iki maddesi birbirini çürütüyordu: biri "tamamı iade
    // edilir, işlem bedeli de yansıtılmaz" derken diğeri "yalnızca işlem
    // bedeli düşülür" diyordu. Canlı ayar card_fee_pct = 0.
    const ld = oku('shared/legalDocs.ts');
    expect(ld).not.toContain('YALNIZCA ödeme altyapısının işlem bedeli düşülür');
    expect(ld).toContain('HİÇBİR KESİNTİ yapılmaz');
  });
});
