/**
 * profileAdapter.ts
 *
 * Tek kullanıcı tablosu olarak profiles kullanılıyor (snake_case sütunlar).
 * TypeScript tarafındaki AdminUser camelCase ile DB snake_case arasında köprü.
 *
 * KURAL: Veritabanına yazarken her zaman toProfileRow() kullan.
 *        Veritabanından okurken her zaman fromProfileRow() kullan.
 */

import { AdminUser, UserRole } from '../types';

// ──────────────────────────────────────────────────────────────────────────────
// DB satırından → AdminUser
// ──────────────────────────────────────────────────────────────────────────────
export function fromProfileRow(row: Record<string, any>): AdminUser {
  return {
    id: row.id ?? '',
    name: row.full_name ?? row.name ?? '',
    email: row.email ?? '',
    phone: row.phone ?? undefined,
    avatar: row.avatar_url ?? '',
    role: (row.role as UserRole) ?? UserRole.PLAYER,
    roles: Array.isArray(row.roles) ? (row.roles as UserRole[]) : [],
    rating: Number(row.rating) || 5.0,
    isVerified: Boolean(row.is_verified),
    isBanned: Boolean(row.is_banned),
    isPro: Boolean(row.is_pro),
    joinDate: row.join_date ?? row.created_at ?? '',
    matchCount: Number(row.match_count) || 0,
    wallet: Number(row.wallet_balance ?? row.wallet ?? 0),
    reliabilityScore: Number(row.reliability_score) ?? 100,
    banExpiresAt: row.ban_expires_at ?? null,
    communities: Array.isArray(row.communities) ? row.communities : [],
    playerCard: row.player_card ?? {},
    cardActive: row.card_active === undefined ? undefined : Boolean(row.card_active),
    oynaId: row.oyna_id ?? undefined,
    friends: Array.isArray(row.friends) ? row.friends : [],
    isLookingForTeam: Boolean(row.is_looking_for_team),
    newMatchBadge: false,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// AdminUser (tam nesne) → DB satırı
// ──────────────────────────────────────────────────────────────────────────────
export function toProfileRow(user: Partial<AdminUser>): Record<string, any> {
  const row: Record<string, any> = {};

  if (user.id !== undefined)               row.id = user.id;
  if (user.name !== undefined)             row.full_name = user.name;
  if (user.email !== undefined)            row.email = user.email;
  if (user.phone !== undefined)            row.phone = user.phone;
  if (user.avatar !== undefined)           row.avatar_url = user.avatar;
  if (user.role !== undefined)             row.role = user.role;
  if (user.roles !== undefined)            row.roles = user.roles;
  if (user.rating !== undefined)           row.rating = user.rating;
  if (user.isVerified !== undefined)       row.is_verified = user.isVerified;
  if (user.isBanned !== undefined)         row.is_banned = user.isBanned;
  if (user.isPro !== undefined)            row.is_pro = user.isPro;
  if (user.joinDate !== undefined)         row.join_date = user.joinDate;
  if (user.matchCount !== undefined)       row.match_count = user.matchCount;
  if (user.wallet !== undefined)           row.wallet_balance = user.wallet;
  if (user.reliabilityScore !== undefined) row.reliability_score = user.reliabilityScore;
  if (user.banExpiresAt !== undefined)     row.ban_expires_at = user.banExpiresAt;
  if (user.communities !== undefined)      row.communities = user.communities;
  if (user.playerCard !== undefined)       row.player_card = user.playerCard;
  if (user.cardActive !== undefined)       row.card_active = user.cardActive;
  if (user.oynaId !== undefined)           row.oyna_id = user.oynaId;
  if (user.friends !== undefined)          row.friends = user.friends;
  if (user.isLookingForTeam !== undefined) row.is_looking_for_team = user.isLookingForTeam;

  return row;
}

// ──────────────────────────────────────────────────────────────────────────────
// Yeni kullanıcı oluştururken auth metadata'dan profil satırı
// ──────────────────────────────────────────────────────────────────────────────
export function newProfileFromAuth(authUser: {
  id: string;
  email?: string | null;
  displayName?: string | null;
  photoURL?: string | null;
}): Record<string, any> {
  return {
    id: authUser.id,
    full_name: authUser.displayName || authUser.email?.split('@')[0] || '',
    email: authUser.email ?? null,
    avatar_url: authUser.photoURL ?? '',
    role: 'PLAYER',
    rating: 5.0,
    wallet_balance: 0,
    is_verified: false,
    is_banned: false,
    is_pro: false,
    match_count: 0,
    reliability_score: 100,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    join_date: new Date().toISOString(),
  };
}
