// Paylaşılan Framer Motion geçiş sabitleri — tüm sayfa/modal animasyonları buradan türetilmeli.

// IP-11: AnimatePresence `mode="wait"`e geçti — eski `popLayout` iki ağır
// görünümü aynı anda DOM'da tutuyordu. `wait` bunu çözer ama çıkış animasyonu
// bitmeden yenisini monte etmez, yani süre doğrudan gezinmeye eklenir.
// 0,35 sn her dokunuşta hissedilir bir gecikmeydi; 0,2 sn'de geçiş hâlâ
// görünür, bekleme hissi kalmıyor.
export const PAGE_TRANSITION = {
  initial: { opacity: 0, y: 16, scale: 0.99 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -10, scale: 0.995 },
  transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] as const },
};

export const MODAL_BACKDROP = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.2 },
};

export const MODAL_CARD = {
  initial: { scale: 0.9, y: 20, opacity: 0 },
  animate: { scale: 1, y: 0, opacity: 1 },
  exit: { scale: 0.9, y: 20, opacity: 0 },
  transition: { duration: 0.25, ease: [0.22, 1, 0.36, 1] as const },
};
