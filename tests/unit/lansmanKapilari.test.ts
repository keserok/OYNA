/**
 * LANSMAN KAPILARI (kurucu kararı, 16 Ağustos 2026)
 *
 * İki karar bu dosyayla KİLİTLENİR — biri yanlışlıkla geri açılırsa test kırılır:
 *
 *  1. CÜZDAN KAPALI: OYNA kullanıcı adına bakiye tutmaz (6493 e-para kararı).
 *     İstemci bayrağı kapalı, sunucu kapıları (yükleme tetikleyicileri +
 *     kapora bekletme) göç dosyasında, ödeme ucu fail-closed.
 *  2. LİSTELEME SINIRI: saha "uygulamada şu saate kadar listelenirim" der;
 *     kapı hem ızgarada (get_pitch_slots) hem yazımda (pitch_bookings
 *     tetikleyicisi) — yalnız APP kanalını kısar, sahibin elle yönetimi serbest.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { WALLET_ENABLED, isWalletEnabled } from '../../shared/featureFlags';

const oku = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const CUZDAN_GOCU = 'supabase/migrations/20260905000001_lansman_cuzdan_kapisi.sql';
const SINIR_GOCU = 'supabase/migrations/20260905000002_listeleme_saat_siniri.sql';

describe('1 · Cüzdan lansmanda kapalı', () => {
  it('istemci bayrağı kapalı (derleme zamanı, fail-closed)', () => {
    expect(WALLET_ENABLED).toBe(false);
    expect(isWalletEnabled()).toBe(false);
  });

  it('sunucu anahtarları göçte: wallet_enabled=false; kapora önce kapalı doğar', () => {
    const s = oku(CUZDAN_GOCU);
    expect(s).toContain("'wallet_enabled', 'false'::jsonb");
    // Kapora anahtarı kapalı doğar; kart kaporası göçü (20260905000003) açar.
    expect(s).toContain("'match_deposit_enabled', 'false'::jsonb");
  });

  it('yükleme İKİ katmanda kilitli: niyet + defter tetikleyicisi', () => {
    const s = oku(CUZDAN_GOCU);
    expect(s).toContain('BEFORE INSERT ON public.payment_intents');
    expect(s).toContain('BEFORE INSERT ON public.wallet_transactions');
    // İki kapı da anahtara bakar; anahtar kapalıyken TOP_UP doğamaz.
    expect(s.match(/WALLET_DISABLED/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it('hakediş ve iade defteri BİLEREK serbest (yalnız TOP_UP kilitli)', () => {
    // EARNINGS/REFUND_CREDIT satırları engellenirse saha hakedişi ve mevcut
    // iade yolları kırılır — kapı yalnız yeni bakiye DOĞMASINI engeller.
    const s = oku(CUZDAN_GOCU);
    expect(s).toContain("NEW.balance_type = 'TOP_UP'");
    expect(s).not.toContain("NEW.balance_type = 'EARNINGS'");
    expect(s).not.toContain("NEW.balance_type = 'REFUND_CREDIT'");
  });

  it('maç kaporası tutarın TEK kaynağında bekletilir (_resolve_court_quote)', () => {
    const s = oku(CUZDAN_GOCU);
    expect(s).toMatch(/deposit\s+:= CASE WHEN NOT public\.get_config_bool\('match_deposit_enabled', false\) THEN 0/);
  });

  /**
   * 19 Ağu 2026 — kural YERİNDE, ADRESİ DEĞİŞTİ.
   *
   * "env yoksa DISABLED" iddiası artık create-payment'ın kendi gövdesinde
   * aranamaz: sağlayıcı çözümlemesi _shared/paymentProvider.ts'e taşındı,
   * çünkü sağlayıcının İKİ yerde (panel + secret) ayrışabilmesi canlıda
   * gerçek bir hataya yol açtı (panel SIMULATION, fonksiyon IYZICO).
   *
   * Fail-closed gevşemedi, SIKILAŞTI: gerçek para artık secret'ın TEK
   * BAŞINA açamadığı bir yol. Kuralın kendisi magazaKapilari.test.ts →
   * "panel daraltır, genişletmez" başlığında kilitleniyor; burada yalnız
   * ucun o tek kaynağa bağlı olduğu ve kapının en önde durduğu sınanır.
   */
  it('ödeme ucu fail-closed: sağlayıcı tek kaynaktan gelir, kapı en önde', () => {
    const s = oku('supabase/functions/create-payment/index.ts');
    expect(s).toContain("import { resolvePaymentProvider } from '../_shared/paymentProvider.ts'");
    expect(s).toContain('const PROVIDER = await resolvePaymentProvider(admin)');
    expect(s).toContain("PAYMENTS_DISABLED");
    // Uç kendi başına sağlayıcı UYDURAMAZ — ne env okur ne varsayılan seçer.
    expect(s).not.toContain("Deno.env.get('PAYMENT_PROVIDER')");
    expect(s).not.toContain("?? 'SIMULATION'");

    // Tek kaynağın kendisi hâlâ fail-closed.
    const ortak = oku('supabase/functions/_shared/paymentProvider.ts');
    expect(ortak).toContain("sonuc = 'DISABLED'");
    expect(ortak).not.toContain("?? 'SIMULATION'");
  });

  it('tüketici yüzeyinde cüzdan rotası ölü: WALLET ana ekrana düşer', () => {
    const s = oku('App.tsx');
    expect(s).toMatch(/case 'WALLET':\s*\n\s*case 'DASHBOARD':/);
    expect(s).not.toContain("import('./views/WalletScreen')");
  });

  it('ödeme ekranı bakiye tanımaz: cüzdan özeti çekilmez, bakiye bölüşümü yok', () => {
    const s = oku('views/PaymentScreen.tsx');
    expect(s).not.toContain('getWalletSummary');
    expect(s).not.toContain('spendableBalance');
    // Kart akışları bakiye kullanmaz (useBalance hep false gider).
    expect(s).not.toMatch(/useBalance:\s*true/);
  });

  it('pazaryeri kiralaması hayalet ödeme yazamaz (fundServiceRequest çağrısı yok)', () => {
    // Eski "Kartla" düğmesi kart formu açmadan sağlayıcıya kazanç yazıyordu
    // (5_GUNLUK_CIKIS_PLANI engelleyici #2). Kartlı emanet v1.1'de.
    expect(oku('views/MatchJoin.tsx')).not.toContain('fundServiceRequest');
    expect(oku('views/Marketplace.tsx')).not.toContain('fundServiceRequest');
  });
});

describe('2 · Listeleme saat sınırı', () => {
  it('kolon + ızgara + yazım kapısı aynı göçte', () => {
    const s = oku(SINIR_GOCU);
    expect(s).toContain('ADD COLUMN IF NOT EXISTS listing_cutoff');
    expect(s).toContain('BEFORE INSERT ON public.pitch_bookings');
    expect(s).toContain('LISTING_CUTOFF');
  });

  it('sınır yalnız APP kanalını kısar — sahibin elle yönetimi serbest', () => {
    const s = oku(SINIR_GOCU);
    expect(s).toContain("NEW.source NOT IN ('APP_BOOKING', 'APP_MATCH')");
  });

  it('gece ekseni sunucuda da 06:00 çıpalı (istemci ikiziyle aynı kural)', () => {
    const s = oku(SINIR_GOCU);
    expect(s).toContain('_listeleme_eksen_dk');
    expect(s).toMatch(/EXTRACT\(HOUR FROM p_t\) < 6/);
  });

  it('oyuncu keşfi sınırı ızgaraya geçirir; sahip paydası sınırsız kalır', () => {
    const s = oku('services/availabilityService.ts');
    expect(s).toContain('pitch.listingCutoff');
    // Sahip doluluk paydaları cutoff parametresi GEÇMEZ (4 argümanla çağrılır).
    const grid = oku('shared/slotGrid.ts');
    expect(grid).toContain('listingCutoff?: string | null');
    expect(grid).toContain('isSlotWithinListingCutoff');
  });

  it('istemci hata sözlüğü sunucu kodunu tanır', () => {
    expect(oku('utils/errorMap.ts')).toContain('LISTING_CUTOFF:');
  });
});

describe('3 · Kart kaporası + karta iade (16 Ağu 2026 — ikinci tur)', () => {
  const KART_GOCU = 'supabase/migrations/20260905000003_kart_kaporasi_ve_karta_iade.sql';

  it('kapora anahtarı kart göçüyle AÇILIR (maçlar yeniden kaporalı)', () => {
    const s = oku(KART_GOCU);
    expect(s).toMatch(/UPDATE public\.app_config\s+SET value = 'true'::jsonb\s+WHERE key = 'match_deposit_enabled'/);
  });

  it('karta iade kuyruğu + zehirli iş sınırı (7.5) kurulu', () => {
    const s = oku(KART_GOCU);
    expect(s).toContain('CREATE TABLE IF NOT EXISTS public.card_refund_queue');
    expect(s).toContain("CHECK (status IN ('PENDING','DONE','FAILED'))");
    // Kuyruk istemciye kapalı (6.1): anon/authenticated yetkisi geri alınır.
    expect(s).toContain('REVOKE ALL ON public.card_refund_queue FROM PUBLIC, anon, authenticated');
  });

  it('kapora akışı kart rayında: prepare + apply MATCH_DEPOSIT taşır', () => {
    const s = oku(KART_GOCU);
    expect(s).toContain("p_flow = 'MATCH_DEPOSIT'");
    expect(s).toContain("v_flow = 'MATCH_DEPOSIT'");
    // Blokaj fonksiyonu artık para OYNATMAZ — beklemeye alır. Fonksiyonun
    // KENDİ gövdesi kesilip bakılır (dosya genelinde arama yanlış pozitif
    // verir: doğrulama bloğu iki adı da anar).
    const bas = s.indexOf('CREATE OR REPLACE FUNCTION public.match_block_deposit');
    expect(bas).toBeGreaterThan(-1);
    const govde = s.slice(bas, s.indexOf('$function$;', bas));
    expect(govde).toContain("'AWAITING_PAYMENT'");
    expect(govde).not.toContain('wallet_spend_balance');
    expect(govde).not.toContain('payment_intents');
  });

  it('iade yazarları karta bağlandı; cüzdan emaneti (legacy) korunur', () => {
    const s = oku(KART_GOCU);
    for (const fn of ['process_match_refund', '_match_refund_partial', 'process_tiered_refund', 'cancel_app_booking']) {
      expect(s).toContain(`CREATE OR REPLACE FUNCTION public.${fn}`);
    }
    expect(s).toContain('_iade_karta_kuyruga');
    expect(s).toContain("provider = 'WALLET'");
  });

  it('kaptan iptali 24 saat kuralına bağlı ve PSP kesintisi düşülür', () => {
    const s = oku(KART_GOCU);
    expect(s).toContain('_pitch_refund_tiers');
    expect(s).toContain('_psp_fee');
    expect(s).toMatch(/v_hours < COALESCE\(v_full_hours, 24\)/);
  });

  it('ödeme bekleyen maç süpürücüsü kurulu (7.4: alınmadıysa alınmasın)', () => {
    const s = oku(KART_GOCU);
    expect(s).toContain('sweep_awaiting_deposit_matches');
    expect(s).toContain('kapora_bekleyen_mac_supuruecuesu');
  });

  it('uçlar kart kaporasını tanır; iade ucu kuyruk işlemcisi oldu', () => {
    expect(oku('supabase/functions/create-payment/index.ts')).toContain("'MATCH_DEPOSIT'");
    const r = oku('supabase/functions/refund-payment/index.ts');
    expect(r).toContain("'process-queue'");
    expect(r).toContain('card_refund_queue');
    // Fail-closed kuralı _shared/paymentProvider.ts'e taşındı (19 Ağu 2026):
    // iade ucu de sağlayıcıyı kendi başına uyduramaz.
    expect(r).toContain("import { resolvePaymentProvider } from '../_shared/paymentProvider.ts'");
    expect(r).not.toContain("Deno.env.get('PAYMENT_PROVIDER')");
  });

  it('istemci kapora akışı kart rayında (PaymentScreen → MATCH_DEPOSIT)', () => {
    expect(oku('views/MatchCreate.tsx')).toContain("'AWAITING_PAYMENT'");
    expect(oku('services/paymentService.ts')).toContain("'MATCH_DEPOSIT'");
  });
});

describe('4 · Nakit rezervasyon kapalı + iade kesintisi tek model (17 Ağu 2026)', () => {
  const IADE_GOCU = 'supabase/migrations/20260905000009_iade_kesintisi_tek_model.sql';
  const KAPI_GOCU = 'supabase/migrations/20260905000010_nakit_rezervasyon_kapisi.sql';

  it('iade tabanı karttan çekilen TOPLAM: iki çağıran da işlem bedelini katar', () => {
    const s = oku(IADE_GOCU);
    // preview + cancel: taban = paid + kart işlem bedelleri (tek model)
    expect(s.match(/card_fee_amount/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    // Dağıtım tavanı kartın GERÇEK çekim tutarı (işlem bedeli payı da dönebilsin)
    expect(s).toContain('v_taban := r.amount');
  });

  it('nakit rezervasyon kapısı: yalnız APP_BOOKING kısılır, tek kaynak resolve_payment_mode', () => {
    const s = oku(KAPI_GOCU);
    expect(s).toContain("NEW.source = 'APP_BOOKING'");
    expect(s).toContain('resolve_payment_mode(NEW.pitch_id)');
    expect(s).toContain('CASH_BOOKING_DISABLED');
    // Maç ve elle yönetim kapının DIŞINDA (doğrulama bloğu ikisini de kanıtlar)
    expect(s).toContain("'OWNER_MANUAL'");
    expect(s).toContain("'APP_MATCH'");
  });

  it('hata sözlüğünde nakit rezervasyon tanımı vardır', () => {
    expect(oku('utils/errorMap.ts')).toContain('CASH_BOOKING_DISABLED:');
  });

  it('vitrinde "tesisi ara" istisna metni YOK (kurucu kararı 17 Ağu)', () => {
    // Kapı sunucuda; keşif ekranı istisna anlatımıyla kalabalıklaşmaz.
    // Lansmanda anlaşmalı sahaların hepsinde online ödeme açık olacak.
    const p = oku('views/PitchDiscovery.tsx');
    expect(p).not.toContain('Tesisi Ara');
    expect(p).not.toContain('phoneOnlyPitch');
  });
});
