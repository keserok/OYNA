// Paylaşılan Framer Motion geçiş sabitleri — tüm sayfa/modal animasyonları buradan türetilmeli.

export const PAGE_TRANSITION = {
  initial: { opacity: 0, y: 16, scale: 0.99 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -10, scale: 0.995 },
  transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] as const },
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
