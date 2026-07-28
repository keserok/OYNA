import { describe, it, expect } from 'vitest';
import { canAccessRoute, firstAllowedRoute, roleLabel } from '../../admin-panel/views/auth/adminPermissions';
import type { AdminRole } from '../../admin-panel/views/auth/adminPermissions';
import type { GodViewSubRoute } from '../../admin-panel/views/GodViewPanel';

// İki rol modeli: SUPER_ADMIN her şeye erişir; ADMIN, ekip/yetki yönetimi
// (ACL) dışındaki her şeye erişir.

const OPERATION_ROUTES: GodViewSubRoute[] = [
  'GENEL', 'CONTROL', 'KULLANICILAR', 'SAHALAR', 'MATCHES', 'MODERATION',
  'TOPLULUKLAR', 'FINANCE', 'OWNER_ACCOUNTS', 'DISPUTES', 'AUDIT_LOG',
  'SETTINGS', 'SYSTEM_PARAMS', 'NOTIFICATIONS', 'NOTIFICATION_TEMPLATES',
  'PROMO_CODES', 'CONTENT', 'SUPPORT_TICKETS', 'DELETION_QUEUE',
];

// ─── canAccessRoute ────────────────────────────────────────────────────────────

describe('canAccessRoute — SUPER_ADMIN', () => {
  it('operasyon rotalarının tamamına erişir', () => {
    for (const route of OPERATION_ROUTES) {
      expect(canAccessRoute('SUPER_ADMIN', route), `SUPER_ADMIN → ${route}`).toBe(true);
    }
  });

  it('ekip & yetki yönetimine (ACL) erişir', () => {
    expect(canAccessRoute('SUPER_ADMIN', 'ACL')).toBe(true);
  });
});

describe('canAccessRoute — ADMIN', () => {
  it('operasyon rotalarının tamamına erişir', () => {
    for (const route of OPERATION_ROUTES) {
      expect(canAccessRoute('ADMIN', route), `ADMIN → ${route}`).toBe(true);
    }
  });

  it('ekip & yetki yönetimine (ACL) ERİŞEMEZ', () => {
    expect(canAccessRoute('ADMIN', 'ACL')).toBe(false);
  });
});

describe('canAccessRoute — rol okunamadığında', () => {
  it('ADMIN gibi davranır: operasyon açık, ACL kapalı', () => {
    // Geçici bir okuma hatası panelin operasyon ekranlarını gizlememeli;
    // süper admine özel ekran ise yine de kapalı kalmalı.
    expect(canAccessRoute(undefined, 'GENEL')).toBe(true);
    expect(canAccessRoute(undefined, 'SETTINGS')).toBe(true);
    expect(canAccessRoute(undefined, 'FINANCE')).toBe(true);
    expect(canAccessRoute(undefined, 'ACL')).toBe(false);
  });
});

// ─── firstAllowedRoute ─────────────────────────────────────────────────────────

describe('firstAllowedRoute', () => {
  it('her rol için erişilebilir bir rota döner', () => {
    const roles: (AdminRole | undefined)[] = ['SUPER_ADMIN', 'ADMIN', undefined];
    for (const role of roles) {
      const route = firstAllowedRoute(role);
      expect(route, `firstAllowedRoute(${role})`).toBeTruthy();
      expect(canAccessRoute(role, route), `${role} → ${route} erişilebilir olmalı`).toBe(true);
    }
  });

  it('her iki rol için de GENEL döner', () => {
    expect(firstAllowedRoute('SUPER_ADMIN')).toBe('GENEL');
    expect(firstAllowedRoute('ADMIN')).toBe('GENEL');
  });
});

// ─── roleLabel ─────────────────────────────────────────────────────────────────

describe('roleLabel', () => {
  it('iki rolün de Türkçe etiketi var', () => {
    expect(roleLabel('SUPER_ADMIN')).toBe('Süper Admin');
    expect(roleLabel('ADMIN')).toBe('Admin');
  });
});
