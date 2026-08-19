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
// PROVİZYON ÖMRÜ KAPISI — karar kilidi (19 Ağustos 2026)
//
// KAÇAK: maç kaporası karttaki BLOKE ile tutulur; banka blokeyi ~1 ay içinde
// kendiliğinden çözer. Maç takvimi ise 90 gün açıktı. 60 gün sonrasına
// kurulan maçta blokeden geriye bir şey kalmıyor, tahsilat MAÇ GÜNÜ
// başarısız oluyordu — düzeltmek için en geç an.
// ═══════════════════════════════════════════════════════════════════════════
const gocKapi = () => readFileSync(
  path.join(KOK, 'supabase/migrations/20260910000003_provizyon_omru_kapisi.sql'), 'utf-8');

describe('provizyon ömrü kapısı', () => {
  it('süre koda gömülü değil, ayardan okunur', () => {
    const s = gocKapi();
    expect(s).toContain("public.get_config_number('preauth_max_days', 20)");
    expect(s).toContain("'preauth_max_days'");
  });

  it('0 yazılırsa kapı kapanır (sınırsız anlaşma mümkün)', () => {
    expect(gocKapi()).toContain('IF v_max_days > 0');
  });

  it('kapı kaporanın BAŞLANGICINDA duruyor — maç günü değil', () => {
    const s = gocKapi();
    const kapi = s.indexOf('PREAUTH_TOO_FAR');
    const yazma = s.indexOf("deposit_status     = 'AWAITING_PAYMENT'", kapi);
    expect(kapi).toBeGreaterThan(-1);
    expect(yazma, 'kapı, maça yazma işleminden ÖNCE olmalı').toBeGreaterThan(kapi);
  });

  it('hata mesajı sebebi ve çıkışı birlikte söylüyor', () => {
    const s = gocKapi();
    const m = s.slice(s.indexOf('PREAUTH_TOO_FAR'), s.indexOf('PREAUTH_TOO_FAR') + 300);
    expect(m).toContain('banka');            // sebep
    expect(m).toContain('başlatabilirsin');  // çıkış
  });

  it('maç kurma / uzak tarihe rezervasyon kısıtlanmadı (kapsam dar)', () => {
    const s = gocKapi();
    // Yalnız match_block_deposit değiştirildi.
    expect(s).toContain('CREATE OR REPLACE FUNCTION public.match_block_deposit');
    expect(s).not.toContain('CREATE OR REPLACE FUNCTION public.create_pitch_booking');
    expect(s).not.toContain('CREATE OR REPLACE FUNCTION public.create_match_atomic');
  });
});
