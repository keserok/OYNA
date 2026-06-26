import type { GodViewSubRoute } from '../GodViewPanel';

export type AdminRole = 'SUPER_ADMIN' | 'ADMIN' | 'MODERATOR' | 'FINANCE' | 'SUPPORT';

const FULL_ACCESS: AdminRole[] = ['SUPER_ADMIN', 'ADMIN'];

const ROUTE_ROLES: Partial<Record<GodViewSubRoute, AdminRole[]>> = {
  GENEL: [...FULL_ACCESS, 'MODERATOR', 'FINANCE', 'SUPPORT'],
  CONTROL: [...FULL_ACCESS, 'MODERATOR', 'SUPPORT'],
  SAHALAR: [...FULL_ACCESS, 'MODERATOR'],
  KULLANICILAR: [...FULL_ACCESS, 'MODERATOR', 'SUPPORT'],
  KALECİLER: [...FULL_ACCESS, 'MODERATOR', 'SUPPORT'],
  HAKEMLER: [...FULL_ACCESS, 'MODERATOR', 'SUPPORT'],
  PENDING_VERIFICATIONS: [...FULL_ACCESS, 'MODERATOR', 'SUPPORT'],
  PROVIDER_IDENTITIES: [...FULL_ACCESS, 'MODERATOR', 'SUPPORT'],
  MODERATION: [...FULL_ACCESS, 'MODERATOR'],
  OWNER_ACCOUNTS: [...FULL_ACCESS, 'FINANCE'],
  MATCHES: [...FULL_ACCESS, 'MODERATOR', 'SUPPORT'],
  TOPLULUKLAR: [...FULL_ACCESS, 'MODERATOR'],
  TAKIMLAR: [...FULL_ACCESS, 'MODERATOR'],
  TURNUVALAR: [...FULL_ACCESS, 'MODERATOR'],
  NOTIFICATIONS: [...FULL_ACCESS],
  SEGMENTATION: [...FULL_ACCESS],
  PROMO_CODES: [...FULL_ACCESS],
  FINANCE: [...FULL_ACCESS, 'FINANCE'],
  DISPUTES: [...FULL_ACCESS, 'MODERATOR', 'FINANCE', 'SUPPORT'],
  SERVICE_DISPUTES: [...FULL_ACCESS, 'MODERATOR', 'FINANCE'],
  AUDIT_LOG: [...FULL_ACCESS, 'MODERATOR', 'FINANCE', 'SUPPORT'],
  CONTENT: [...FULL_ACCESS],
  SETTINGS: [...FULL_ACCESS],
  ACL: FULL_ACCESS,
};

export function canAccessRoute(role: AdminRole | undefined, route: GodViewSubRoute): boolean {
  const r = role || 'SUPPORT';
  if (FULL_ACCESS.includes(r)) return true;
  const allowed = ROUTE_ROLES[route];
  if (!allowed) return false;
  return allowed.includes(r);
}

export function firstAllowedRoute(role: AdminRole | undefined): GodViewSubRoute {
  const routes = Object.keys(ROUTE_ROLES) as GodViewSubRoute[];
  for (const route of ['GENEL', 'CONTROL', 'KULLANICILAR', 'FINANCE', ...routes] as GodViewSubRoute[]) {
    if (canAccessRoute(role, route)) return route;
  }
  return 'GENEL';
}

export function roleLabel(role: AdminRole): string {
  const labels: Record<AdminRole, string> = {
    SUPER_ADMIN: 'Süper Admin',
    ADMIN: 'Admin',
    MODERATOR: 'Moderatör',
    FINANCE: 'Finans',
    SUPPORT: 'Destek',
  };
  return labels[role] || role;
}
