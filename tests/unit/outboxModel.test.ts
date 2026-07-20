import { describe, it, expect } from 'vitest';
import {
  classifyOutboxError, parseOutbox, serializeOutbox, OUTBOX_MAX_ITEMS,
  type OutboxItem,
} from '../../shared/outboxModel';

describe('classifyOutboxError — ağ mı kalıcı mı', () => {
  it('fetch/ağ hataları → NETWORK', () => {
    expect(classifyOutboxError(new TypeError('Failed to fetch'))).toBe('NETWORK');
    expect(classifyOutboxError({ message: 'NetworkError when attempting to fetch resource.' })).toBe('NETWORK');
    expect(classifyOutboxError({ message: 'fetch failed' })).toBe('NETWORK');
    expect(classifyOutboxError({ message: 'Load failed' })).toBe('NETWORK');
    expect(classifyOutboxError({ message: 'net::ERR_INTERNET_DISCONNECTED' })).toBe('NETWORK');
    expect(classifyOutboxError({ message: 'The operation timed out' })).toBe('NETWORK');
  });
  it('sunucu/validasyon hataları → PERMANENT (sonsuz tekrar yok)', () => {
    expect(classifyOutboxError({ message: 'OVER_PAYMENT: kalan bakiyeden fazla tahsilat alınamaz.' })).toBe('PERMANENT');
    expect(classifyOutboxError({ message: 'UNAUTHORIZED: bu tesise erisim yok.' })).toBe('PERMANENT');
    expect(classifyOutboxError({ message: 'INVALID_AMOUNT' })).toBe('PERMANENT');
  });
  it('bilinmeyen → PERMANENT (güvenli varsayılan: kullanıcıya dürüst hata)', () => {
    expect(classifyOutboxError(null)).toBe('PERMANENT');
    expect(classifyOutboxError('tuhaf bir şey')).toBe('PERMANENT');
  });
});

describe('parseOutbox/serializeOutbox — dayanıklı (de)serileştirme', () => {
  const valid: OutboxItem = {
    id: 'a1', type: 'RECORD_PAYMENT', payload: { bookingId: 'b', amount: 10, method: 'CASH' },
    label: 'Tahsilat · 10₺', createdAt: '2026-07-19T10:00:00Z', tries: 1,
  };
  it('gidiş-dönüş kayıpsız', () => {
    expect(parseOutbox(serializeOutbox([valid]))).toEqual([valid]);
  });
  it('null/bozuk JSON/dizi-değil → boş kuyruk (uygulama kilitlenmez)', () => {
    expect(parseOutbox(null)).toEqual([]);
    expect(parseOutbox('{{bozuk')).toEqual([]);
    expect(parseOutbox('{"a":1}')).toEqual([]);
  });
  it('bozuk öğeler atılır, sağlamlar korunur', () => {
    const mixed = JSON.stringify([valid, { id: 5 }, { ...valid, id: 'a2', type: 'BILINMEZ' }, null]);
    expect(parseOutbox(mixed)).toEqual([valid]);
  });
  it('DEBTOR_PAYMENT türü geçerli', () => {
    const d = { ...valid, id: 'a3', type: 'DEBTOR_PAYMENT' as const };
    expect(parseOutbox(serializeOutbox([d]))).toEqual([d]);
  });
  it('kuyruk sınırı sabiti makul', () => {
    expect(OUTBOX_MAX_ITEMS).toBeGreaterThanOrEqual(50);
  });
});
