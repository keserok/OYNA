// Çevrimiçi / son görülme — gerçek `last_active_at` verisinden insancıl etiket üretir.
// 5 dakikadan yeni aktiflik = çevrimiçi sayılır.
export const ONLINE_THRESHOLD_MS = 5 * 60 * 1000;

export const isUserOnline = (lastActiveAt?: string | null): boolean => {
  if (!lastActiveAt) return false;
  const t = new Date(lastActiveAt).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t < ONLINE_THRESHOLD_MS;
};

/**
 * "Şimdi aktif" / "5 dk önce" / "3 sa önce" / "Dün" / "4 gün önce" / "12 Mar".
 * Veri yoksa boş string döner (etiketi hiç gösterme).
 */
export const formatLastSeen = (lastActiveAt?: string | null): string => {
  if (!lastActiveAt) return '';
  const t = new Date(lastActiveAt).getTime();
  if (Number.isNaN(t)) return '';
  const diff = Date.now() - t;
  if (diff < ONLINE_THRESHOLD_MS) return 'Şimdi aktif';

  const min = Math.floor(diff / 60000);
  if (min < 60) return `${min} dk önce`;

  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} sa önce`;

  const day = Math.floor(hr / 24);
  if (day === 1) return 'Dün';
  if (day < 7) return `${day} gün önce`;

  return new Date(t).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
};
