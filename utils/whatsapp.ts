// ─── WhatsApp yardımcıları (saha sahibi paneli) ─────────────────────────────
//
// C2 (panel kataloğu): rezervasyon hatırlatması no-show'un ana panzehiri.
// Veresiye defteri zaten WhatsApp'la hatırlatıyordu; numara biçimleme oradaki
// yerel kopyadan buraya taşındı ki iki ekran aynı kuralı kullansın.

/** TR telefonu wa.me biçimine çevirir: rakamları al, baştaki 0 → 90,
 *  10 haneli çıplak numaraya 90 ekle. Uluslararası girildiyse dokunma. */
export const waNumber = (phone: string): string => {
  let d = phone.replace(/\D/g, '');
  if (d.startsWith('0')) d = '90' + d.slice(1);
  else if (d.length === 10) d = '90' + d;
  return d;
};

/** Hazır metinli WhatsApp sohbet bağlantısı. */
export const waLink = (phone: string, text: string): string =>
  `https://wa.me/${waNumber(phone)}?text=${encodeURIComponent(text)}`;

/** "12 Ağustos Çarşamba" — hatırlatma mesajının tarih kısmı. */
const trTarih = (dateISO: string): string => {
  const d = new Date(`${dateISO}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' });
};

/** Rezervasyon hatırlatma mesajı — sahibin ağzından, kısa ve saygılı.
 *  Tesis adına Türkçe ek TAKILMAZ ("Capo Arena hatırlatması") ki özel isim
 *  hangi harfle biterse bitsin mesaj bozulmasın. */
export const bookingReminderMessage = (p: {
  customerName: string;
  time: string;
  facilityName?: string;
  dateISO?: string;
}): string => {
  const kim = p.customerName.trim() ? `Merhaba ${p.customerName.trim()} 👋` : 'Merhaba 👋';
  const nereden = p.facilityName?.trim() ? `${p.facilityName.trim()} hatırlatması:` : 'Rezervasyon hatırlatması:';
  const tarih = p.dateISO ? trTarih(p.dateISO) : '';
  const zaman = tarih ? `${tarih} saat ${p.time}` : `saat ${p.time}`;
  return `${kim} ${nereden} ${zaman} halı saha rezervasyonunuz var. Görüşmek üzere! ⚽`;
};
