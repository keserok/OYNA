/**
 * DEV-ONLY mock kullanıcılar.
 * Bu dosya sadece import.meta.env.DEV modunda yüklenir.
 * Prod build'e DAHİL EDİLMEZ.
 *
 * Ünlü isimleri ve transfermarkt görselleri kaldırıldı — telif riski.
 */
import { UserRole, AdminUser } from '../types';

export const MOCK_USERS: AdminUser[] = [
  // ── 5 OYUNCULAR ─────────────────────────────────────
  {
    id: 'u1', name: 'Kerem Yılmaz', email: 'kerem@test.oyna.app', phone: '+90 532 111 22 33',
    avatar: 'https://i.pravatar.cc/150?u=kerem2024',
    role: UserRole.CAPTAIN, rating: 4.9, isVerified: true, isBanned: false, isPro: true,
    joinDate: '15 Oca 2024', matchCount: 52, reliabilityScore: 100, banExpiresAt: null
  },
  {
    id: 'u2', name: 'Burak Demir', email: 'burak@test.oyna.app', phone: '+90 555 222 33 44',
    avatar: 'https://i.pravatar.cc/150?u=burak2024',
    role: UserRole.PLAYER, rating: 4.5, isVerified: true, isBanned: false, isPro: true,
    joinDate: '20 Oca 2024', matchCount: 34, reliabilityScore: 100, banExpiresAt: null
  },
  {
    id: 'u3', name: 'Mert Arslan', email: 'mert@test.oyna.app', phone: '+90 555 333 44 55',
    avatar: 'https://i.pravatar.cc/150?u=mert2024',
    role: UserRole.PLAYER, rating: 4.1, isVerified: true, isBanned: false, isPro: false,
    joinDate: '03 Şub 2024', matchCount: 18, reliabilityScore: 100, banExpiresAt: null
  },
  {
    id: 'u4', name: 'Arda Kaya', email: 'arda@test.oyna.app', phone: '+90 533 444 55 66',
    avatar: 'https://i.pravatar.cc/150?u=arda2024',
    role: UserRole.PLAYER, rating: 3.8, isVerified: false, isBanned: false, isPro: false,
    joinDate: '10 Şub 2024', matchCount: 9, reliabilityScore: 100, banExpiresAt: null
  },
  {
    id: 'u5', name: 'Emre Çelik', email: 'emre@test.oyna.app', phone: '+90 544 555 66 77',
    avatar: 'https://i.pravatar.cc/150?u=emre2024',
    role: UserRole.PLAYER, rating: 4.3, isVerified: true, isBanned: false, isPro: false,
    joinDate: '18 Şub 2024', matchCount: 25, reliabilityScore: 100, banExpiresAt: null
  },
  // ── 5 KALECİLER (anonim isimler, placeholder avatarlar) ────
  {
    id: 'ugk1', name: 'GK Deniz Acar', email: 'gk1@test.oyna.app', phone: '+90 532 999 88 77',
    avatar: 'https://i.pravatar.cc/150?u=gk1',
    role: UserRole.GOALKEEPER, rating: 4.9, isVerified: true, isBanned: false, isPro: true,
    joinDate: '10 Oca 2024', matchCount: 31, reliabilityScore: 100, banExpiresAt: null
  },
  {
    id: 'ugk2', name: 'GK Onur Soylu', email: 'gk2@test.oyna.app', phone: '+90 532 888 77 66',
    avatar: 'https://i.pravatar.cc/150?u=gk2',
    role: UserRole.GOALKEEPER, rating: 4.8, isVerified: true, isBanned: false, isPro: true,
    joinDate: '12 Oca 2024', matchCount: 27, reliabilityScore: 100, banExpiresAt: null
  },
  {
    id: 'ugk3', name: 'GK Baran Yıldız', email: 'gk3@test.oyna.app', phone: '+90 532 777 66 55',
    avatar: 'https://i.pravatar.cc/150?u=gk3',
    role: UserRole.GOALKEEPER, rating: 4.7, isVerified: true, isBanned: false, isPro: true,
    joinDate: '15 Oca 2024', matchCount: 22, reliabilityScore: 100, banExpiresAt: null
  },
  {
    id: 'ugk4', name: 'GK Tolga Şen', email: 'gk4@test.oyna.app', phone: '+90 533 666 55 44',
    avatar: 'https://i.pravatar.cc/150?u=gk4',
    role: UserRole.GOALKEEPER, rating: 4.7, isVerified: true, isBanned: false, isPro: false,
    joinDate: '20 Oca 2024', matchCount: 19, reliabilityScore: 100, banExpiresAt: null
  },
  {
    id: 'ugk5', name: 'GK Eren Koç', email: 'gk5@test.oyna.app', phone: '+90 533 555 44 33',
    avatar: 'https://i.pravatar.cc/150?u=gk5',
    role: UserRole.GOALKEEPER, rating: 4.5, isVerified: true, isBanned: false, isPro: false,
    joinDate: '25 Oca 2024', matchCount: 15, reliabilityScore: 100, banExpiresAt: null
  },
  // ── 5 HAKEMLER (anonim isimler, placeholder avatarlar) ──────
  {
    id: 'uref1', name: 'Hakem Can Öztürk', email: 'ref1@test.oyna.app', phone: '+90 533 777 66 55',
    avatar: 'https://i.pravatar.cc/150?u=ref1',
    role: UserRole.REFEREE, rating: 4.9, isVerified: true, isBanned: false, isPro: true,
    joinDate: '05 Oca 2024', matchCount: 58, reliabilityScore: 100, banExpiresAt: null
  },
  {
    id: 'uref2', name: 'Hakem Serkan Kılıç', email: 'ref2@test.oyna.app', phone: '+90 533 666 77 88',
    avatar: 'https://i.pravatar.cc/150?u=ref2',
    role: UserRole.REFEREE, rating: 4.7, isVerified: true, isBanned: false, isPro: true,
    joinDate: '08 Oca 2024', matchCount: 44,
  },
  {
    id: 'uref3', name: 'Hakem Oğuz Demir', email: 'ref3@test.oyna.app', phone: '+90 534 555 66 77',
    avatar: 'https://i.pravatar.cc/150?u=ref3',
    role: UserRole.REFEREE, rating: 4.8, isVerified: true, isBanned: false, isPro: true,
    joinDate: '11 Oca 2024', matchCount: 38,
  },
  {
    id: 'uref4', name: 'Hakem Yasin Ak', email: 'ref4@test.oyna.app', phone: '+90 534 444 55 66',
    avatar: 'https://i.pravatar.cc/150?u=ref4',
    role: UserRole.REFEREE, rating: 4.4, isVerified: true, isBanned: false, isPro: false,
    joinDate: '18 Oca 2024', matchCount: 29,
  },
  {
    id: 'uref5', name: 'Hakem Volkan Er', email: 'ref5@test.oyna.app', phone: '+90 534 333 44 55',
    avatar: 'https://i.pravatar.cc/150?u=ref5',
    role: UserRole.REFEREE, rating: 4.5, isVerified: false, isBanned: false, isPro: false,
    joinDate: '22 Oca 2024', matchCount: 21,
  },
];
