import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  safeUuid, isOnline, withSubmitTimeout, SubmitTimeoutError,
  RPC_TIMEOUT_MS, CARD_TIMEOUT_MS,
} from '../../shared/submitGuard';

// IP-02 · BULGU-043/050/111 — para veya kadro üreten her yazmanın ortak kapısı.

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('safeUuid', () => {
  it('uuid v4 biçiminde üretir', () => {
    const re = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    for (let i = 0; i < 50; i += 1) expect(safeUuid()).toMatch(re);
  });

  it('ardışık çağrılar farklı değer üretir', () => {
    const set = new Set(Array.from({ length: 200 }, () => safeUuid()));
    expect(set.size).toBe(200);
  });

  it('crypto.randomUUID yoksa yedeğe düşer ve yine uuid üretir', () => {
    vi.stubGlobal('crypto', {});
    const re = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(safeUuid()).toMatch(re);
  });

  it('crypto.randomUUID patlarsa yedeğe düşer', () => {
    vi.stubGlobal('crypto', { randomUUID: () => { throw new Error('yok'); } });
    expect(safeUuid()).toMatch(/^[0-9a-f-]{36}$/i);
  });
});

describe('isOnline — yanlış engelleme, geç engellemeden kötüdür', () => {
  it('navigator.onLine true iken çevrimiçi', () => {
    vi.stubGlobal('navigator', { onLine: true });
    expect(isOnline()).toBe(true);
  });

  it('yalnız KESİN false engeller', () => {
    vi.stubGlobal('navigator', { onLine: false });
    expect(isOnline()).toBe(false);
  });

  it('onLine undefined ise ÇEVRİMİÇİ varsayılır (eski WebView)', () => {
    vi.stubGlobal('navigator', {});
    expect(isOnline()).toBe(true);
  });
});

describe('withSubmitTimeout', () => {
  it('süre dolmadan çözülen sözü aynen geçirir', async () => {
    await expect(withSubmitTimeout(Promise.resolve('ok'), 1000)).resolves.toBe('ok');
  });

  it('süre dolmadan reddedilen sözün KENDİ hatasını geçirir', async () => {
    const err = new Error('sunucu hatası');
    await expect(withSubmitTimeout(Promise.reject(err), 1000)).rejects.toBe(err);
  });

  it('süre dolunca SubmitTimeoutError fırlatır', async () => {
    vi.useFakeTimers();
    const asili = new Promise(() => { /* hiç çözülmez */ });
    const p = withSubmitTimeout(asili, 5000);
    const beklenen = expect(p).rejects.toBeInstanceOf(SubmitTimeoutError);
    await vi.advanceTimersByTimeAsync(5001);
    await beklenen;
  });

  it('erken çözülünce zamanlayıcı temizlenir (sarkan timer bırakmaz)', async () => {
    vi.useFakeTimers();
    await expect(withSubmitTimeout(Promise.resolve(1), 10_000)).resolves.toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('erken reddedilince de zamanlayıcı temizlenir', async () => {
    vi.useFakeTimers();
    await expect(withSubmitTimeout(Promise.reject(new Error('x')), 10_000)).rejects.toThrow('x');
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('zaman aşımı pencereleri', () => {
  it('kart penceresi edge fonksiyonunun en kötü süresinden UZUN olmalı', () => {
    // create-payment: iyzico 20 sn timeout + 1 tekrar = en kötü 40 sn.
    // Daha kısa bir pencere ÇALIŞAN bir ödemeyi keserdi.
    expect(CARD_TIMEOUT_MS).toBeGreaterThan(40_000);
  });

  it('RPC penceresi kart penceresinden kısa (Postgres normalde <1 sn)', () => {
    expect(RPC_TIMEOUT_MS).toBeLessThan(CARD_TIMEOUT_MS);
    expect(RPC_TIMEOUT_MS).toBeGreaterThanOrEqual(10_000);
  });
});

describe('SubmitTimeoutError', () => {
  it('adı ve mesajı sabit — çağıran bu dalı ayırt edebilmeli', () => {
    const e = new SubmitTimeoutError();
    expect(e.name).toBe('SubmitTimeoutError');
    expect(e.message).toBe('SUBMIT_TIMEOUT');
    expect(e).toBeInstanceOf(Error);
  });
});
