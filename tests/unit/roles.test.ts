import { describe, it, expect } from 'vitest';
import {
  normalizeRole,
  roleToLandingView,
  pickLandingRole,
  switchableRoles,
  hasMultipleSwitchableRoles,
} from '../../shared/roles';
import { UserRole } from '../../types';

// ─── normalizeRole ─────────────────────────────────────────────────────────────

describe('normalizeRole', () => {
  it('geçerli roller büyük/küçük harfe bağımsız kabul edilir', () => {
    expect(normalizeRole('player')).toBe(UserRole.PLAYER);
    expect(normalizeRole('PLAYER')).toBe(UserRole.PLAYER);
    expect(normalizeRole('goalkeeper')).toBe(UserRole.GOALKEEPER);
    expect(normalizeRole('GOALKEEPER')).toBe(UserRole.GOALKEEPER);
    expect(normalizeRole('referee')).toBe(UserRole.REFEREE);
    expect(normalizeRole('owner')).toBe(UserRole.OWNER);
  });

  it('bilinmeyen roller → null', () => {
    expect(normalizeRole('ADMIN')).toBeNull();
    expect(normalizeRole('SUPER_ADMIN')).toBeNull();
    expect(normalizeRole('ORGANIZER')).toBeNull();
    expect(normalizeRole('random')).toBeNull();
  });

  it('null/undefined/boş → null', () => {
    expect(normalizeRole(null)).toBeNull();
    expect(normalizeRole(undefined)).toBeNull();
    expect(normalizeRole('')).toBeNull();
  });
});

// ─── roleToLandingView ────────────────────────────────────────────────────────

describe('roleToLandingView', () => {
  it('OWNER → OWNER_PANEL', () => {
    expect(roleToLandingView(UserRole.OWNER)).toBe('OWNER_PANEL');
  });

  it('GOALKEEPER → SERVICE_DASHBOARD', () => {
    expect(roleToLandingView(UserRole.GOALKEEPER)).toBe('SERVICE_DASHBOARD');
  });

  it('REFEREE → SERVICE_DASHBOARD', () => {
    expect(roleToLandingView(UserRole.REFEREE)).toBe('SERVICE_DASHBOARD');
  });

  it('PLAYER → DASHBOARD', () => {
    expect(roleToLandingView(UserRole.PLAYER)).toBe('DASHBOARD');
  });

  it('null → DASHBOARD (güvenli varsayılan)', () => {
    expect(roleToLandingView(null)).toBe('DASHBOARD');
  });
});

// ─── switchableRoles ──────────────────────────────────────────────────────────

describe('switchableRoles', () => {
  it('boş/null → boş dizi', () => {
    expect(switchableRoles(null)).toEqual([]);
    expect(switchableRoles([])).toEqual([]);
    expect(switchableRoles(undefined)).toEqual([]);
  });

  it('geçersizleri atar', () => {
    expect(switchableRoles(['ADMIN', 'SUPER_ADMIN', 'player'])).toEqual([UserRole.PLAYER]);
  });

  it('tekrarları tekilleştirir', () => {
    const roles = switchableRoles(['PLAYER', 'player', 'PLAYER']);
    expect(roles).toHaveLength(1);
    expect(roles[0]).toBe(UserRole.PLAYER);
  });

  it('birden çok rol — geçerli olanlar döner', () => {
    const roles = switchableRoles(['PLAYER', 'GOALKEEPER', 'ADMIN']);
    expect(roles).toHaveLength(2);
    expect(roles).toContain(UserRole.PLAYER);
    expect(roles).toContain(UserRole.GOALKEEPER);
  });
});

// ─── hasMultipleSwitchableRoles ───────────────────────────────────────────────

describe('hasMultipleSwitchableRoles', () => {
  it('1 geçilebilir rol → false', () => {
    expect(hasMultipleSwitchableRoles(['PLAYER'])).toBe(false);
  });

  it('2 geçilebilir rol → true', () => {
    expect(hasMultipleSwitchableRoles(['PLAYER', 'GOALKEEPER'])).toBe(true);
  });

  it('0 geçilebilir rol (hepsi geçersiz) → false', () => {
    expect(hasMultipleSwitchableRoles(['ADMIN', 'SUPER_ADMIN'])).toBe(false);
  });
});

// ─── pickLandingRole ──────────────────────────────────────────────────────────

describe('pickLandingRole — öncelik sırası (OWNER > REF > GK > PLAYER)', () => {
  it('tek PLAYER → PLAYER', () => {
    expect(pickLandingRole(['PLAYER'])).toBe(UserRole.PLAYER);
  });

  it('OWNER + PLAYER → OWNER (en yüksek öncelik)', () => {
    expect(pickLandingRole(['PLAYER', 'OWNER'])).toBe(UserRole.OWNER);
  });

  it('GOALKEEPER + PLAYER → GOALKEEPER', () => {
    expect(pickLandingRole(['PLAYER', 'GOALKEEPER'])).toBe(UserRole.GOALKEEPER);
  });

  it('REFEREE + GOALKEEPER → REFEREE (REF > GK)', () => {
    expect(pickLandingRole(['GOALKEEPER', 'REFEREE'])).toBe(UserRole.REFEREE);
  });

  it('boş dizi, current OWNER → OWNER (current güvenlik)', () => {
    expect(pickLandingRole([], 'OWNER')).toBe(UserRole.OWNER);
  });

  it('hiçbir geçerli rol yok → PLAYER (varsayılan)', () => {
    expect(pickLandingRole([])).toBe(UserRole.PLAYER);
    expect(pickLandingRole(['ADMIN'])).toBe(UserRole.PLAYER);
  });

  it('current geçerli ama roles dizisinde yoksa yine de dikkate alınır', () => {
    // Eski owner hesabı: roles=[] ama current=OWNER
    expect(pickLandingRole([], 'OWNER')).toBe(UserRole.OWNER);
  });

  // Yarış koşulu: eşzamanlı pickLandingRole çağrıları (pure fonksiyon)
  it('eşzamanlı 1000 çağrı deterministik sonuç verir', () => {
    const results = Array.from({ length: 1000 }, () =>
      pickLandingRole(['PLAYER', 'OWNER', 'GOALKEEPER'])
    );
    for (const r of results) expect(r).toBe(UserRole.OWNER);
  });
});
