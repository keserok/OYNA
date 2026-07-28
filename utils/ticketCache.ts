// ════════════════════════════════════════════════════════════════════════
// BİLET ANLIK GÖRÜNTÜSÜ — çevrimdışı dayanıklılık (IP-20 · BULGU-109)
//
// Sorun: bilet ekranı rezervasyonu HER açılışta ağdan çekiyor. Sahaya varıp
// bağlantı koptuğunda sorgu düşüyor, booking null kalıyor, QR hiç üretilmiyor
// ve kapıda gösterilecek bir şey kalmıyor.
//
// Çözüm: son başarılı okuma localStorage'a yazılır; ağ düşerse ekran bu
// kopyadan çizilir. QR'ın kendisi zaten YEREL üretiliyor (qrcode paketi),
// yani anlık görüntü yeterli.
//
// localStorage erişimlerinin TAMAMI try/catch içinde: özel sekme, dolu kota
// ve devre dışı depolama uygulamayı çökertmemeli (services/offline/outbox.ts
// aynı deseni kullanıyor).
// ════════════════════════════════════════════════════════════════════════

export interface TicketSnapshot {
  id: string;
  status: string | null;
  payment_status: string | null;
  paid_amount: number | null;
  price: number | null;
  deposit_amount: number | null;
  booking_date: string | null;
  start_time: string | null;
  end_time: string | null;
  court_id: string | null;
  pitch_id: string | null;
  pitch_name: string | null;
  pitch_district: string | null;
  court_name: string | null;
  /** Anlık görüntünün alındığı an (ms). Ekranda "son güncelleme" olarak gösterilir. */
  savedAt: number;
}

/** writeTicketCache'in kabul ettiği gevşek satır — hem bilet sorgusu hem MyBooking uyar. */
export interface TicketCacheInput {
  id: string;
  status?: string | null;
  payment_status?: string | null;
  paid_amount?: number | null;
  price?: number | null;
  deposit_amount?: number | null;
  booking_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  court_id?: string | null;
  pitch_id?: string | null;
  pitches?: { name?: string | null; district?: string | null } | null;
  courts?: { name?: string | null } | null;
}

const KEY_PREFIX = 'oyna.ticket.';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 gün

const store = (): Storage | null => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
};

/** 30 günden eski bilet anlık görüntülerini siler; kota baskısını da azaltır. */
function prune(): void {
  const ls = store();
  if (!ls) return;
  try {
    const now = Date.now();
    const sil: string[] = [];
    for (let i = 0; i < ls.length; i += 1) {
      const k = ls.key(i);
      if (!k || !k.startsWith(KEY_PREFIX)) continue;
      try {
        const snap = JSON.parse(ls.getItem(k) ?? 'null') as TicketSnapshot | null;
        if (!snap || typeof snap.savedAt !== 'number' || now - snap.savedAt > MAX_AGE_MS) sil.push(k);
      } catch {
        sil.push(k); // okunamayan kayıt = çöp
      }
    }
    sil.forEach((k) => ls.removeItem(k));
  } catch {
    /* depolama okunamadı — sessiz geç */
  }
}

/** Son başarılı bilet okumasını saklar. Hata durumunda sessizce vazgeçer. */
export function writeTicketCache(row: TicketCacheInput | null | undefined): void {
  const ls = store();
  if (!ls || !row?.id) return;
  const snap: TicketSnapshot = {
    id: row.id,
    status: row.status ?? null,
    payment_status: row.payment_status ?? null,
    paid_amount: row.paid_amount ?? null,
    price: row.price ?? null,
    deposit_amount: row.deposit_amount ?? null,
    booking_date: row.booking_date ?? null,
    start_time: row.start_time ?? null,
    end_time: row.end_time ?? null,
    court_id: row.court_id ?? null,
    pitch_id: row.pitch_id ?? null,
    pitch_name: row.pitches?.name ?? null,
    pitch_district: row.pitches?.district ?? null,
    court_name: row.courts?.name ?? null,
    savedAt: Date.now(),
  };
  try {
    prune();
    ls.setItem(`${KEY_PREFIX}${row.id}`, JSON.stringify(snap));
  } catch {
    // Kota dolu olabilir: eskileri temizleyip bir kez daha dene, yine olmazsa vazgeç.
    try {
      prune();
      ls.setItem(`${KEY_PREFIX}${row.id}`, JSON.stringify(snap));
    } catch {
      /* çevrimdışı kopya yazılamadı — ekran yine de çevrimiçi çalışır */
    }
  }
}

/** Kayıtlı anlık görüntüyü döner; yoksa ya da 30 günden eskiyse null. */
export function readTicketCache(id: string | null | undefined): TicketSnapshot | null {
  const ls = store();
  if (!ls || !id) return null;
  try {
    const raw = ls.getItem(`${KEY_PREFIX}${id}`);
    if (!raw) return null;
    const snap = JSON.parse(raw) as TicketSnapshot | null;
    if (!snap || snap.id !== id || typeof snap.savedAt !== 'number') return null;
    if (Date.now() - snap.savedAt > MAX_AGE_MS) {
      ls.removeItem(`${KEY_PREFIX}${id}`);
      return null;
    }
    return snap;
  } catch {
    return null;
  }
}

/** Tek bir bileti önbellekten siler (ör. rezervasyon iptal edildiğinde). */
export function clearTicketCache(id: string | null | undefined): void {
  const ls = store();
  if (!ls || !id) return;
  try {
    ls.removeItem(`${KEY_PREFIX}${id}`);
  } catch {
    /* sessiz */
  }
}
