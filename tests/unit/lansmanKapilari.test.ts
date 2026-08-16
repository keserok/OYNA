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

  it('sunucu anahtarları göçte: wallet_enabled + match_deposit_enabled = false', () => {
    const s = oku(CUZDAN_GOCU);
    expect(s).toContain("'wallet_enabled', 'false'::jsonb");
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

  it('ödeme ucu fail-closed: env yokken sağlayıcı DISABLED ve kapı en önde', () => {
    const s = oku('supabase/functions/create-payment/index.ts');
    expect(s).toContain("Deno.env.get('PAYMENT_PROVIDER') ?? 'DISABLED'");
    expect(s).toContain("PAYMENTS_DISABLED");
    expect(s).not.toContain("?? 'SIMULATION'");
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
