import type { GodViewSubRoute } from '../GodViewPanel';

/**
 * İki rol modeli:
 *   SUPER_ADMIN → platformun sahibi. Her şeyi yapar; ekip ve yetki yönetimi
 *                 (Ekipler & Yetkiler) yalnız onda.
 *   ADMIN       → panelden yetkilendirilen yönetici. Günlük operasyonun
 *                 tamamını yürütür; ekip/yetki yönetimine dokunamaz.
 *
 * Not: bu dosya yalnız ARAYÜZ görünürlüğünü belirler. Asıl yetki sunucuda,
 * RPC guard'larında (`require_super_admin`, `is_platform_admin`) zorlanır.
 */
export type AdminRole = 'SUPER_ADMIN' | 'ADMIN';

/** Yalnız SUPER_ADMIN'e açık rotalar. */
const SUPER_ADMIN_ONLY: readonly GodViewSubRoute[] = ['ACL'];

/**
 * Rol okunamadığında ADMIN varsayılır: panel açık kalır, yalnız süper admine
 * özel ekranlar gizlenir. (Önceki 'SUPPORT' varsayımı, geçici bir ağ hatasında
 * süper admini bile Destek rolüne düşürüp menülerin çoğunu gizliyordu.)
 * Panele girişin kendisi ayrıca `resolveAdminSession` tarafından doğrulanır.
 */
const DEFAULT_ROLE: AdminRole = 'ADMIN';

export function canAccessRoute(role: AdminRole | undefined, route: GodViewSubRoute): boolean {
  const r = role || DEFAULT_ROLE;
  if (SUPER_ADMIN_ONLY.includes(route)) return r === 'SUPER_ADMIN';
  return true;
}

export function firstAllowedRoute(role: AdminRole | undefined): GodViewSubRoute {
  // Genel Bakış her iki role de açıktır.
  return canAccessRoute(role, 'GENEL') ? 'GENEL' : 'CONTROL';
}

export function roleLabel(role: AdminRole): string {
  const labels: Record<AdminRole, string> = {
    SUPER_ADMIN: 'Süper Admin',
    ADMIN: 'Admin',
  };
  return labels[role] || role;
}
