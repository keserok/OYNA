import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
