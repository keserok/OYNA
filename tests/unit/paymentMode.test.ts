import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PaymentModeResolution } from '../../types';

// supabaseClient'ı izole et — bu testler ağ çağrısı yapmaz.
const rpcMock = vi.fn();
vi.mock('../../supabaseClient', () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args) },
  SUPABASE_URL: 'http://localhost',
}));

const {
  resolvePaymentMode,
  paymentModeLabel,
  paymentModeDescription,
  paymentModeReasonText,
} = await import('../../services/paymentModeService');

const baseRes: PaymentModeResolution = {
  effective_mode: 'HYBRID',
  global_mode: 'HYBRID',
  pitch_mode: 'HYBRID',
  locked: false,
  provider: 'IYZICO',
  provider_live: true,
  cash_allowed: true,
  online_allowed: true,
  reason: 'PITCH_CHOICE',
};

describe('resolvePaymentMode — fail-safe davranış (güvenlik kritik)', () => {
  beforeEach(() => {
    rpcMock.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sunucu hata dönerse online ödeme AÇILMAZ', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const res = await resolvePaymentMode('pitch-1');
    expect(res.online_allowed).toBe(false);
    expect(res.effective_mode).toBe('CASH_ONLY');
  });

  it('ağ patlarsa (throw) online ödeme AÇILMAZ', async () => {
    rpcMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const res = await resolvePaymentMode('pitch-1');
    expect(res.online_allowed).toBe(false);
    expect(res.cash_allowed).toBe(true);
  });

  it('veri boş dönerse güvenli varsayılana düşer', async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });
    const res = await resolvePaymentMode('pitch-1');
    expect(res.effective_mode).toBe('CASH_ONLY');
    expect(res.provider_live).toBe(false);
  });

  it('sunucu çözümlemesini olduğu gibi geçirir — istemci yeniden hesaplamaz', async () => {
    rpcMock.mockResolvedValue({ data: baseRes, error: null });
    const res = await resolvePaymentMode('pitch-1');
    expect(res).toEqual(baseRes);
  });

  it('pitchId verilmezse RPC null ile çağrılır (global duruş)', async () => {
    rpcMock.mockResolvedValue({ data: { ...baseRes, pitch_mode: null }, error: null });
    await resolvePaymentMode();
    expect(rpcMock).toHaveBeenCalledWith('resolve_payment_mode', { p_pitch_id: null });
  });
});

describe('Mod etiketleri ve açıklamaları', () => {
  it('her mod için etiket ve açıklama vardır (boş bırakılmaz)', () => {
    for (const m of ['CASH_ONLY', 'ONLINE_ONLY', 'HYBRID'] as const) {
      expect(paymentModeLabel(m).length).toBeGreaterThan(0);
      expect(paymentModeDescription(m).length).toBeGreaterThan(0);
    }
  });

  it('nakit modu açıklaması uygulama içinde para alınmadığını söyler', () => {
    expect(paymentModeDescription('CASH_ONLY')).toMatch(/tesiste|para alınmaz/i);
  });
});

describe('paymentModeReasonText — sahibe dürüst gerekçe', () => {
  it('sağlayıcı canlı değilse bunu açıkça söyler', () => {
    const txt = paymentModeReasonText({ ...baseRes, reason: 'PROVIDER_NOT_LIVE' });
    expect(txt).toMatch(/canlı/i);
  });

  it('global nakit modundaysa bunu açıkça söyler', () => {
    const txt = paymentModeReasonText({ ...baseRes, reason: 'GLOBAL_CASH_ONLY' });
    expect(txt).toMatch(/nakit modunda/i);
  });

  it('tesis kendi tercihiyle çalışıyorsa ek açıklama göstermez', () => {
    expect(paymentModeReasonText({ ...baseRes, reason: 'PITCH_CHOICE' })).toBeNull();
    expect(paymentModeReasonText({ ...baseRes, reason: 'GLOBAL_HYBRID' })).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// SATILAMAZ SAAT KAPISI (17 Ağustos 2026 — ödeme ONLINE_ONLY'ye alınırken)
// ════════════════════════════════════════════════════════════════════════════
//
// Canlı veride saat ücreti 0 ₺ olan bir tarife vardı. Nakit modunda zararsızdı;
// kart açılınca zincir kırılıyordu: rezervasyon CONFIRMED yazılıyor, ödeme
// adımı 0 tutarla durduğu için para alınamıyordu — saat dolu, kasa boş.
// Kapı, rezervasyon YAZILMADAN önce durur.
describe('Satılamaz saat kapısı · göç ve hata sözlüğü', () => {
  const goc = readFileSync(
    join(process.cwd(), 'supabase/migrations/20260905000011_satilamaz_saat_kapisi.sql'),
    'utf8',
  );

  it('kapı rezervasyon INSERT edilmeden ÖNCE çalışır', () => {
    const kapiIdx = goc.indexOf('SLOT_NOT_SELLABLE');
    const insertIdx = goc.indexOf('INSERT INTO public.pitch_bookings');
    expect(kapiIdx).toBeGreaterThan(-1);
    expect(insertIdx).toBeGreaterThan(-1);
    expect(kapiIdx).toBeLessThan(insertIdx);
  });

  it('yalnız uygulama rezervasyonunu ve yalnız online açıkken kapatır', () => {
    expect(goc).toContain("p_source = 'APP_BOOKING'");
    expect(goc).toContain("resolve_payment_mode(p_pitch_id)->>'online_allowed'");
  });

  it('KAPORA 0 olan tarifeyi kapatmaz (istemci %30 hesaplıyor)', () => {
    // Bu kural bilerek dar: kaporaya da bakarsak bugün ÇALIŞAN saatler kapanır.
    expect(goc).not.toContain('COALESCE(v_deposit, 0) <= 0');
    expect(goc).toContain('COALESCE(v_price, 0) <= 0');
  });

  it('kullanıcı ham hata kodu görmez', () => {
    const em = readFileSync(join(process.cwd(), 'utils/errorMap.ts'), 'utf8');
    expect(em).toContain('SLOT_NOT_SELLABLE:');
    expect(em).toContain('fiyat henüz tanımlanmamış');
  });
});
