// ════════════════════════════════════════════════════════════════════════
// ROL → AÇILIŞ EKRANI + AÇILIŞ ROLÜ SEÇİMİ — TEK KAYNAK (SSOT)
// App.tsx (giriş yönlendirmesi) ve RoleSwitcher (uygulama-içi rol geçişi)
// AYNI eşlemeyi kullanır; mantık iki yerde kopyalanmaz (drift yok).
// Master prensipler §3: PLAYER→Dashboard, GK/REF→ServiceDashboard, OWNER→OwnerPanel.
// ════════════════════════════════════════════════════════════════════════
import { UserRole, type AppView } from '../types';

/**
 * Aktif role göre açılış ekranı.
 * Oyuncu (ve bilinmeyen/null) → Dashboard; kaleci/hakem → ServiceDashboard; tesis → OwnerPanel.
 */
export const roleToLandingView = (role: UserRole | null): AppView => {
  if (role === UserRole.OWNER) return 'OWNER_PANEL';
  if (role === UserRole.GOALKEEPER || role === UserRole.REFEREE) return 'SERVICE_DASHBOARD';
  return 'DASHBOARD';
};

/**
 * Açılışta öncelik sırası: kullanıcı birden çok role sahipse hangi paneli
 * "kendi arayüzü" sayacağımızı belirler. Sağlayıcı/tesis rolleri oyuncunun
 * önüne geçer — böylece kaleci/hakem/saha sahibi girişte kendi paneline düşer.
 */
export const ROLE_PRIORITY: UserRole[] = [
  UserRole.OWNER,
  UserRole.REFEREE,
  UserRole.GOALKEEPER,
  UserRole.PLAYER,
];

/**
 * Serbest metin bir rolü kanonik, GEÇİLEBİLİR bir UserRole'a indirger.
 * PLAYER/GOALKEEPER/REFEREE/OWNER dışındaki değerler (ADMIN, ORGANIZER,
 * SUPER_ADMIN, boş, vb.) null döner — rol geçişinde bunlar dikkate alınmaz.
 */
export const normalizeRole = (r: string | null | undefined): UserRole | null => {
  const up = (r || '').toUpperCase();
  if (up === UserRole.PLAYER || up === UserRole.GOALKEEPER
      || up === UserRole.REFEREE || up === UserRole.OWNER) {
    return up as UserRole;
  }
  return null;
};

/**
 * Kullanıcının GEÇİLEBİLİR (RoleSwitcher'ın sunacağı) benzersiz rolleri.
 * Ham `roles` dizisini normalize eder, geçersizleri atar, tekilleştirir.
 * RoleSwitcher listesi + "Rol Değiştir" görünürlük kapıları TEK bu kaynaktan
 * beslenir (ham dizi uzunluğu değil) → "görünür ama boş sheet" tutarsızlığı olmaz.
 */
export const switchableRoles = (roles: readonly string[] | null | undefined): UserRole[] =>
  Array.from(new Set(
    (roles ?? [])
      .map(normalizeRole)
      .filter((r): r is UserRole => r !== null),
  ));

/** Rol geçişi anlamlı mı? (≥2 farklı geçilebilir rol). */
export const hasMultipleSwitchableRoles = (
  roles: readonly string[] | null | undefined,
): boolean => switchableRoles(roles).length > 1;

/**
 * Girişte açılacak rolü seçer (1A: "her zaman kendi paneli").
 * Sahip olunan roller (`roles`) + mevcut aktif rol (`current`, roles'ta eksik
 * kalmış eski owner hesapları için güvenlik) birleşiminden ROLE_PRIORITY'ye göre
 * en yüksek öncelikli rolü döndürür. Hiçbiri yoksa PLAYER.
 */
export const pickLandingRole = (
  roles: readonly string[] | null | undefined,
  current?: UserRole | string | null,
): UserRole => {
  const owned = new Set<UserRole>();
  (roles ?? []).forEach(r => { const n = normalizeRole(r); if (n) owned.add(n); });
  const cur = normalizeRole(current ?? null);
  if (cur) owned.add(cur);
  for (const role of ROLE_PRIORITY) {
    if (owned.has(role)) return role;
  }
  return UserRole.PLAYER;
};
