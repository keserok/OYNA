import { describe, it, expect } from 'vitest';
import { canAccessRoute, firstAllowedRoute, roleLabel } from '../../admin-panel/views/auth/adminPermissions';
import type { AdminRole } from '../../admin-panel/views/auth/adminPermissions';
import type { GodViewSubRoute } from '../../admin-panel/views/GodViewPanel';

// ─── canAccessRoute ────────────────────────────────────────────────────────────

describe('canAccessRoute — FULL_ACCESS rolleri', () => {
  const fullAccessRoles: AdminRole[] = ['SUPER_ADMIN', 'ADMIN'];
  const sensitiveRoutes: GodViewSubRoute[] = ['SETTINGS', 'ACL', 'NOTIFICATIONS', 'NOTIFICATION_TEMPLATES', 'PROMO_CODES'];
  const generalRoutes: GodViewSubRoute[] = ['GENEL', 'KULLANICILAR', 'SAHALAR', 'MATCHES', 'FINANCE'];

  for (const role of fullAccessRoles) {
    it(`${role} tüm hassas rotalara erişebilir`, () => {
      for (const route of sensitiveRoutes) {
        expect(canAccessRoute(role, route), `${role} → ${route}`).toBe(true);
      }
    });

    it(`${role} tüm genel rotalara erişebilir`, () => {
      for (const route of generalRoutes) {
        expect(canAccessRoute(role, route), `${role} → ${route}`).toBe(true);
      }
    });
  }
});

describe('canAccessRoute — MODERATOR', () => {
  it('izin verilen rotalara erişebilir', () => {
    const allowed: GodViewSubRoute[] = ['GENEL', 'CONTROL', 'SAHALAR', 'KULLANICILAR', 'MATCHES', 'MODERATION', 'TOPLULUKLAR'];
    for (const route of allowed) {
      expect(canAccessRoute('MODERATOR', route), `MODERATOR → ${route}`).toBe(true);
    }
  });

  it('kısıtlı rotalara erişemez', () => {
    const restricted: GodViewSubRoute[] = ['SETTINGS', 'ACL', 'FINANCE', 'OWNER_ACCOUNTS', 'NOTIFICATIONS', 'PROMO_CODES'];
    for (const route of restricted) {
      expect(canAccessRoute('MODERATOR', route), `MODERATOR ENGEL → ${route}`).toBe(false);
    }
  });
});

describe('canAccessRoute — FINANCE', () => {
  it('finans rotalarına erişebilir', () => {
    expect(canAccessRoute('FINANCE', 'FINANCE')).toBe(true);
    expect(canAccessRoute('FINANCE', 'OWNER_ACCOUNTS')).toBe(true);
    expect(canAccessRoute('FINANCE', 'DISPUTES')).toBe(true);
    expect(canAccessRoute('FINANCE', 'AUDIT_LOG')).toBe(true);
    expect(canAccessRoute('FINANCE', 'GENEL')).toBe(true);
  });

  it('yönetim rotalarına erişemez', () => {
    expect(canAccessRoute('FINANCE', 'SETTINGS')).toBe(false);
    expect(canAccessRoute('FINANCE', 'ACL')).toBe(false);
    expect(canAccessRoute('FINANCE', 'KULLANICILAR')).toBe(false);
    expect(canAccessRoute('FINANCE', 'SAHALAR')).toBe(false);
    expect(canAccessRoute('FINANCE', 'MODERATION')).toBe(false);
  });
});

describe('canAccessRoute — SUPPORT', () => {
  it('destek rotalarına erişebilir', () => {
    expect(canAccessRoute('SUPPORT', 'GENEL')).toBe(true);
    expect(canAccessRoute('SUPPORT', 'KULLANICILAR')).toBe(true);
    expect(canAccessRoute('SUPPORT', 'DISPUTES')).toBe(true);
    expect(canAccessRoute('SUPPORT', 'AUDIT_LOG')).toBe(true);
  });

  it('kısıtlı rotalara erişemez', () => {
    expect(canAccessRoute('SUPPORT', 'SETTINGS')).toBe(false);
    expect(canAccessRoute('SUPPORT', 'FINANCE')).toBe(false);
    expect(canAccessRoute('SUPPORT', 'SAHALAR')).toBe(false);
    expect(canAccessRoute('SUPPORT', 'ACL')).toBe(false);
  });
});

describe('canAccessRoute — undefined / geçersiz rol', () => {
  it('undefined rol SUPPORT gibi davranır', () => {
    expect(canAccessRoute(undefined, 'SETTINGS')).toBe(false);
    expect(canAccessRoute(undefined, 'GENEL')).toBe(true);
  });
});

// ─── firstAllowedRoute ─────────────────────────────────────────────────────────

describe('firstAllowedRoute', () => {
  it("her rol için en az bir rota döner", () => {
    const roles: (AdminRole | undefined)[] = ['SUPER_ADMIN', 'ADMIN', 'MODERATOR', 'FINANCE', 'SUPPORT', undefined];
    for (const role of roles) {
      const route = firstAllowedRoute(role);
      expect(route, `firstAllowedRoute(${role})`).toBeTruthy();
      expect(canAccessRoute(role, route), `${role} → ${route} erişilebilir olmalı`).toBe(true);
    }
  });

  it('SUPER_ADMIN için GENEL döner', () => {
    expect(firstAllowedRoute('SUPER_ADMIN')).toBe('GENEL');
  });

  it('FINANCE için geçerli bir rota döner', () => {
    const route = firstAllowedRoute('FINANCE');
    expect(canAccessRoute('FINANCE', route)).toBe(true);
  });
});

// ─── roleLabel ─────────────────────────────────────────────────────────────────

describe('roleLabel', () => {
  it('tüm rollerin Türkçe etiketi var', () => {
    expect(roleLabel('SUPER_ADMIN')).toBe('Süper Admin');
    expect(roleLabel('ADMIN')).toBe('Admin');
    expect(roleLabel('MODERATOR')).toBe('Moderatör');
    expect(roleLabel('FINANCE')).toBe('Finans');
    expect(roleLabel('SUPPORT')).toBe('Destek');
  });
});
