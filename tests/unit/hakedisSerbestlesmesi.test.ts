import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

// ═══════════════════════════════════════════════════════════════════════════
// HAKEDİŞ SERBESTLEŞMESİ — karar kilidi (19 Ağustos 2026, para kaçağı denetimi)
//
// KAÇAK: bekleme süresi ÖDEME anından sayılıyordu; rezervasyon takvimi ise
// bugün + 90 gün açık. 60 gün sonrasına yapılan bir rezervasyonda tesis 14.
// günde parasını çekebiliyor, oyuncu 50. günde tam iade alıp ayrılıyordu.
// OYNA hem iade ediyor hem tesise ödüyor hem komisyon kazanmıyordu.
//
// KARAR: bekleme, HİZMETİN BİTTİĞİ andan sayılır. İtiraz penceresi para
// geldiğinde değil, hizmet verildiğinde başlar.
// ═══════════════════════════════════════════════════════════════════════════

const KOK = path.resolve(__dirname, '../..');
const goc = () => readFileSync(
  path.join(KOK, 'supabase/migrations/20260910000002_hakedis_hizmetten_sonra_serbestlesir.sql'), 'utf-8');

describe('sayaç hizmetten sonra işler', () => {
  it('serbestleşme eşiği hizmet sonunu okur', () => {
    const s = goc();
    expect(s).toContain('_hakedis_hizmet_sonu(wt.type, wt.reference_type, wt.reference_id)');
  });

  it('hizmet tarihi bilinmiyorsa eski davranışa düşülür (kayıt kilitlenmez)', () => {
    expect(goc()).toMatch(/COALESCE\(\s*public\._hakedis_hizmet_sonu[\s\S]{0,120}wt\.created_at\)/);
  });

  it('hiçbir hakediş oluşma anı + N günden ERKEN serbestleşemez', () => {
    // GREATEST(created_at, hizmet_sonu) — tabanı created_at olan bir alt sınır.
    expect(goc()).toMatch(/GREATEST\(\s*wt\.created_at,/);
  });

  it('üç referans yolunun üçü de tanımlı (rezervasyon · maç · niyet)', () => {
    const s = goc();
    expect(s).toContain("p_type = 'BOOKING_EARNING' AND p_reference_type = 'BOOKING'");
    expect(s).toContain("WHEN p_reference_type = 'MATCH' THEN");
    expect(s).toContain("WHEN p_reference_type = 'PAYMENT_INTENT' THEN");
  });

  it('yardımcı fonksiyon istemciye AÇIK DEĞİL (yalnız service_role)', () => {
    const s = goc();
    expect(s).toContain('REVOKE ALL ON FUNCTION public._hakedis_hizmet_sonu(text, text, uuid) FROM PUBLIC, anon, authenticated');
    expect(s).toContain('GRANT EXECUTE ON FUNCTION public._hakedis_hizmet_sonu(text, text, uuid) TO service_role');
  });

  it('göç kendi kaçak kanıtını taşıyor (60 gün sonrası serbest bırakılmamalı)', () => {
    const s = goc();
    expect(s).toContain('kacak acik');
    expect(s).toContain("current_date + 60");
  });

  it('bekleme gün sayısı hâlâ ayardan okunur — sabitlenmedi', () => {
    expect(goc()).toContain('owner_payout_days');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PROVİZYON ÖMRÜ KAPISI KALDIRILDI (kurucu kararı, 19 Ağustos 2026)
//
// Aynı gün eklenmiş, aynı gün kalkmıştır. Sebebi: kod okununca kapora akışında
// GERÇEK BİR PROVİZYON OLMADIĞI ortaya çıktı — para `/payment/3dsecure/auth`
// ile doğrudan TAHSİL ediliyor, `BLOCKED` yalnız OYNA'nın kendi etiketi.
// "Banka blokeyi çözer" riski bu akışta yok; kapı, olmayan bir riske karşılık
// uzak tarihli maçların kaporasını gerekçesiz engelliyordu.
//
// Kurucu kararı: "Provizyon sistemi komple iptal, direkt ödeme alıp parayı
// kendimiz yöneteceğiz herhangi bir iptal durumunda."
// ═══════════════════════════════════════════════════════════════════════════
const gocKapora = () => readFileSync(
  path.join(KOK, 'supabase/migrations/20260911000002_kapora_dogrudan_tahsilat_ve_manuel_iade.sql'), 'utf-8');

describe('provizyon kaldırıldı, iade elle yapılıyor', () => {
  it('provizyon ömrü ayarı siliniyor', () => {
    expect(gocKapora()).toContain("DELETE FROM public.app_config WHERE key = 'preauth_max_days'");
  });

  it('kapora başlatmada artık uzaklık kapısı yok', () => {
    // Doğrulama bloğu kapının YOKLUĞUNU sınıyor, orada geçmesi normal.
    const govde = gocKapora().slice(0, gocKapora().indexOf('-- ── Doğrulama'));
    expect(govde).not.toContain('PREAUTH_TOO_FAR');
  });

  it('iade OTOMATİK DEĞİL — kuyruğa düşüyor', () => {
    const s = gocKapora();
    expect(s).toContain("deposit_status = 'REFUND_PENDING'");
    // Otomatik iade çağrısı gövdeden çıkmalı; para hareketini insan yapar.
    expect(s).toContain('_refund_wallet_escrow');       // yalnız doğrulama bloğunda
    const govde = s.slice(0, s.indexOf('-- ── Doğrulama'));
    expect(govde).not.toContain('_refund_wallet_escrow');
  });

  it('yönetici bekleyen iadeleri görebiliyor', () => {
    const s = gocKapora();
    expect(s).toContain('admin_bekleyen_kapora_iadeleri');
    expect(s).toContain('is_platform_admin');
    expect(s).toContain('FROM PUBLIC, anon');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// UYGULAMADAN ÇEKİM KAPALI (kurucu kararı, 19 Ağustos 2026)
// ═══════════════════════════════════════════════════════════════════════════
const gocCekim = () => readFileSync(
  path.join(KOK, 'supabase/migrations/20260911000003_uygulamadan_cekim_kapatildi.sql'), 'utf-8');
const bayraklar = () => readFileSync(path.join(KOK, 'shared/featureFlags.ts'), 'utf-8');

describe('uygulamadan para çekme kapalı', () => {
  it('iki çekim yolu da kapalı ve sebebi yazıyor', () => {
    const s = gocCekim();
    expect(s).toContain('CREATE OR REPLACE FUNCTION public.request_payout(');
    expect(s).toContain('CREATE OR REPLACE FUNCTION public.request_payout_with_method(');
    expect((s.match(/PAYOUT_MANUAL:/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('mesaj kullanıcıya NE OLACAĞINI söylüyor', () => {
    const s = gocCekim();
    expect(s).toContain('OYNA tarafından aktarılır');
    expect(s).toContain('Maç oynandıktan sonra');
  });

  it('TC kimlik kapısı çekim yolundan kalktı', () => {
    expect(gocCekim()).toContain('IDENTITY_REQUIRED');   // yalnız doğrulama bloğunda
    const govde = gocCekim().slice(0, gocCekim().indexOf('-- ── Doğrulama'));
    expect(govde).not.toContain('IDENTITY_REQUIRED');
  });

  it('gelmeme cezası asgari tutarı panelden yönetiliyor ve sağlayıcıya görünür', () => {
    const s = gocCekim();
    expect(s).toContain('provider_noshow_penalty_min');
    expect(s).toContain('true, 0, 5000');   // is_public = true
  });

  it('arayüz katmanı da kapalı (prensip 6.1 — iki katman)', () => {
    expect(bayraklar()).toContain('export const CEKIM_UYGULAMADAN_ACIK = false');
    expect(bayraklar()).toContain('CEKIM_KAPALI_ACIKLAMA');
  });

  it('kapı servis katmanında — her ekran aynı cümleyi gösterir', () => {
    for (const f of ['services/walletService.ts', 'services/pitchOwnerService.ts']) {
      const s = readFileSync(path.join(KOK, f), 'utf-8');
      expect(s, f).toContain('cekimUygulamadanAcikMi()');
      expect(s, f).toContain('CEKIM_KAPALI_ACIKLAMA');
    }
  });
});
