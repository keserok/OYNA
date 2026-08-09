// ════════════════════════════════════════════════════════════════════════════
// WHATSAPP HATIRLATMA (C2) · Rezervasyon detayı + veresiye, tek yardımcı
// ════════════════════════════════════════════════════════════════════════════
//
// Panel kataloğu C2 (⭐⭐⭐): "WhatsApp rezervasyon hatırlatması — no-show'un
// ana kaynağı". Kurucu odağı saha sahibi paneli seçince (9 Ağu 2026) ilk iş
// olarak bu kapatıldı: rezervasyon detayına hazır mesajlı WhatsApp düğmesi.
// Veresiye defterindeki yerel numara-biçimleme kopyası da aynı yardımcıya
// bağlandı — iki ekran tek kural kullanır.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { waNumber, waLink, bookingReminderMessage } from '../../utils/whatsapp';

const oku = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('waNumber — TR numarası wa.me biçimine', () => {
  it('0 ile başlayan 11 hane → başına 90', () => {
    expect(waNumber('05321234567')).toBe('905321234567');
  });
  it('çıplak 10 hane → başına 90', () => {
    expect(waNumber('5321234567')).toBe('905321234567');
  });
  it('+90 ve boşluklar temizlenir', () => {
    expect(waNumber('+90 532 123 45 67')).toBe('905321234567');
  });
  it('zaten 90 ile başlıyorsa dokunulmaz', () => {
    expect(waNumber('905321234567')).toBe('905321234567');
  });
});

describe('waLink — hazır metinli sohbet bağlantısı', () => {
  it('metni URL içinde güvenli taşır (boşluk/emoji kodlanır)', () => {
    const l = waLink('05321234567', 'Merhaba ⚽ & görüşürüz');
    expect(l.startsWith('https://wa.me/905321234567?text=')).toBe(true);
    expect(l).not.toContain(' ');
    expect(decodeURIComponent(l.split('text=')[1])).toBe('Merhaba ⚽ & görüşürüz');
  });
});

describe('bookingReminderMessage — sahibin ağzından hatırlatma', () => {
  it('ad + tesis + Türkçe tarih + saat aynı mesajda', () => {
    const m = bookingReminderMessage({
      customerName: 'Ahmet Yılmaz',
      time: '20:00',
      facilityName: 'Capo Arena',
      dateISO: '2026-08-12',
    });
    expect(m).toContain('Ahmet Yılmaz');
    expect(m).toContain('Capo Arena hatırlatması');
    expect(m).toContain('saat 20:00');
    expect(m).toContain('12');
    expect(m).toContain('Ağustos');
  });

  it('tarih ve tesis yoksa mesaj yine düzgün kurulur', () => {
    const m = bookingReminderMessage({ customerName: '', time: '21:00' });
    expect(m).toContain('Rezervasyon hatırlatması');
    expect(m).toContain('saat 21:00');
    expect(m).not.toContain('undefined');
  });

  it('bozuk tarih sessizce atlanır — mesaj bozulmaz', () => {
    const m = bookingReminderMessage({ customerName: 'Ali', time: '19:00', dateISO: 'bozuk' });
    expect(m).toContain('saat 19:00');
    expect(m).not.toContain('Invalid');
  });
});

describe('ekran bağları — düğme ve tek-kopya kuralı', () => {
  const modal = oku('views/owner/OwnerBookingDetailModal.tsx');
  const veresiye = oku('views/owner/finance/DebtorSheet.tsx');
  const takvim = oku('views/owner/calendar/FinancialCalendarView.tsx');

  it('rezervasyon detayında WhatsApp Hatırlat düğmesi var', () => {
    expect(modal).toContain('WhatsApp Hatırlat');
    expect(modal).toContain('bookingReminderMessage');
  });

  it('veresiye defteri AYNI yardımcıyı kullanıyor — yerel kopya kalmadı', () => {
    expect(veresiye).toContain("utils/whatsapp");
    expect(veresiye).not.toContain('function waNumber');
  });

  it('takvim modala rezervasyon gününü ve tesis adını geçiriyor', () => {
    expect(takvim).toContain('dateISO={selectedBooking.date ?? selectedDateISO}');
    expect(takvim).toContain('facilityName={facilityName}');
  });
});
