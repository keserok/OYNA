import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { readTicketCache, writeTicketCache, clearTicketCache } from '../../utils/ticketCache';

// IP-20 · BULGU-109 — bilet çevrimdışı açılabilmeli.
// Kapıda internet yoksa sorgu düşer; son başarılı kopya bileti çizer,
// QR zaten yerelde (qrcode paketi) yeniden üretilir.

const ROW = {
  id: 'bk-1',
  status: 'CONFIRMED',
  payment_status: 'PARTIAL',
  paid_amount: 300,
  price: 1000,
  deposit_amount: 300,
  booking_date: '2026-08-01',
  start_time: '20:00:00',
  end_time: '21:30:00',
  court_id: 'c-1',
  pitch_id: 'p-1',
  pitches: { name: 'Cumhuriyet Gençlik', district: 'Altınordu' },
  courts: { name: 'A Sahası' },
};

beforeEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('writeTicketCache / readTicketCache', () => {
  it('yazılan anlık görüntü aynen okunur', () => {
    writeTicketCache(ROW);
    const snap = readTicketCache('bk-1');
    expect(snap).not.toBeNull();
    expect(snap!.pitch_name).toBe('Cumhuriyet Gençlik');
    expect(snap!.pitch_district).toBe('Altınordu');
    expect(snap!.court_name).toBe('A Sahası');
    expect(snap!.paid_amount).toBe(300);
    expect(snap!.price).toBe(1000);
    expect(typeof snap!.savedAt).toBe('number');
  });

  it('kaydı olmayan id için null döner', () => {
    expect(readTicketCache('yok')).toBeNull();
  });

  it('id boş/null ise null döner, patlamaz', () => {
    expect(readTicketCache(null)).toBeNull();
    expect(readTicketCache('')).toBeNull();
  });

  it('id olmadan yazma sessizce yok sayılır', () => {
    writeTicketCache(null);
    writeTicketCache({ id: '' } as never);
    expect(localStorage.length).toBe(0);
  });

  it('join alanları yoksa null olarak saklanır', () => {
    writeTicketCache({ id: 'bk-2', pitches: null, courts: null });
    const snap = readTicketCache('bk-2');
    expect(snap!.pitch_name).toBeNull();
    expect(snap!.court_name).toBeNull();
  });

  it('MyBooking biçimi de kabul edilir (önbelleği ısıtma yolu)', () => {
    writeTicketCache({
      id: 'bk-3', booking_date: '2026-08-02', start_time: '19:00:00',
      pitches: { name: 'Yıldız Halısaha', district: 'Fatsa' }, courts: { name: 'B' },
    });
    expect(readTicketCache('bk-3')!.pitch_name).toBe('Yıldız Halısaha');
  });

  it('aynı id yeniden yazılınca üzerine yazar', () => {
    writeTicketCache(ROW);
    writeTicketCache({ ...ROW, paid_amount: 1000, payment_status: 'PAID' });
    expect(readTicketCache('bk-1')!.paid_amount).toBe(1000);
  });
});

describe('yaş sınırı (30 gün)', () => {
  it('30 günden eski kayıt okunmaz ve silinir', () => {
    writeTicketCache(ROW);
    const key = 'oyna.ticket.bk-1';
    const snap = JSON.parse(localStorage.getItem(key)!);
    snap.savedAt = Date.now() - (31 * 24 * 60 * 60 * 1000);
    localStorage.setItem(key, JSON.stringify(snap));

    expect(readTicketCache('bk-1')).toBeNull();
    expect(localStorage.getItem(key)).toBeNull(); // temizlendi
  });

  it('29 günlük kayıt hâlâ okunur', () => {
    writeTicketCache(ROW);
    const key = 'oyna.ticket.bk-1';
    const snap = JSON.parse(localStorage.getItem(key)!);
    snap.savedAt = Date.now() - (29 * 24 * 60 * 60 * 1000);
    localStorage.setItem(key, JSON.stringify(snap));
    expect(readTicketCache('bk-1')).not.toBeNull();
  });

  it('yazma sırasında eski kayıtlar budanır', () => {
    writeTicketCache({ ...ROW, id: 'eski' });
    const key = 'oyna.ticket.eski';
    const snap = JSON.parse(localStorage.getItem(key)!);
    snap.savedAt = Date.now() - (40 * 24 * 60 * 60 * 1000);
    localStorage.setItem(key, JSON.stringify(snap));

    writeTicketCache({ ...ROW, id: 'yeni' });
    expect(localStorage.getItem('oyna.ticket.eski')).toBeNull();
    expect(localStorage.getItem('oyna.ticket.yeni')).not.toBeNull();
  });
});

describe('bozuk veri ve depolama hataları', () => {
  it('bozuk JSON null döner, patlamaz', () => {
    localStorage.setItem('oyna.ticket.bozuk', '{eksik');
    expect(readTicketCache('bozuk')).toBeNull();
  });

  it('id uyuşmazlığı reddedilir (anahtar kurcalanmış)', () => {
    writeTicketCache(ROW);
    const snap = JSON.parse(localStorage.getItem('oyna.ticket.bk-1')!);
    snap.id = 'baska';
    localStorage.setItem('oyna.ticket.bk-1', JSON.stringify(snap));
    expect(readTicketCache('bk-1')).toBeNull();
  });

  it('savedAt yoksa reddedilir', () => {
    localStorage.setItem('oyna.ticket.x', JSON.stringify({ id: 'x' }));
    expect(readTicketCache('x')).toBeNull();
  });

  it('kota dolduğunda uygulama çökmez', () => {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new DOMException('QuotaExceededError'); };
    expect(() => writeTicketCache(ROW)).not.toThrow();
    Storage.prototype.setItem = orig;
  });

  it('okuma hatası null döner, patlamaz', () => {
    const orig = Storage.prototype.getItem;
    Storage.prototype.getItem = () => { throw new Error('devre dışı'); };
    expect(() => readTicketCache('bk-1')).not.toThrow();
    expect(readTicketCache('bk-1')).toBeNull();
    Storage.prototype.getItem = orig;
  });
});

describe('clearTicketCache', () => {
  it('yalnız verilen bileti siler', () => {
    writeTicketCache({ ...ROW, id: 'a' });
    writeTicketCache({ ...ROW, id: 'b' });
    clearTicketCache('a');
    expect(readTicketCache('a')).toBeNull();
    expect(readTicketCache('b')).not.toBeNull();
  });

  it('olmayan id sessizce geçer', () => {
    expect(() => clearTicketCache('yok')).not.toThrow();
    expect(() => clearTicketCache(null)).not.toThrow();
  });
});
