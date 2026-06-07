/**
 * OYNA Store — Zustand Slice Architecture
 *
 * Yeni kod bu dosyadan spesifik slice store'ları import etmeli:
 *   import { useUIStore } from './store/useUIStore';
 *   import { useAuthStore } from './store/useAuthStore';
 *
 * Eski `useAppStore` geriye uyumluluk için korunuyor ama
 * her state değişikliğinde TÜM subscriber'lar re-render oluyor.
 * Performans için slice store'ları tercih edin.
 */

export { useAuthStore, auth } from './useAuthStore';
export type { AuthUser } from './useAuthStore';

export { useUIStore } from './useUIStore';
export { useMatchStore } from './useMatchStore';
export { useAdminStore } from './useAdminStore';
export type { AppSettings } from './useAdminStore';
export { useNotifStore } from './useNotifStore';
export type { UserNotificationItem, AdminNotification } from './useNotifStore';
export { useSocialStore } from './useSocialStore';
export type { Friend } from './useSocialStore';
