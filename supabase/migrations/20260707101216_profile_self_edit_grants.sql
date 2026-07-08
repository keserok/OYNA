-- ==============================================================================
-- Profil ekranı yenilemesi — kendi profilini düzenleme kolon yetkileri
-- KÖK NEDEN: authenticated rolünün profiles üzerindeki UPDATE yetkisi kolon
-- bazlı verilmişti ve position/bio listede yoktu → "Profili Düzenle" PATCH'i
-- 42501 (permission denied) ile düşüyordu. Satır güvenliği RLS'te
-- (profiles_update: yalnız kendi satırı + profile_privileges_unchanged),
-- yetki yükseltme koruması trigger'da; bu kolonlar güvenle açılabilir.
-- ==============================================================================

GRANT UPDATE (position, bio, birthdate, preferred_foot)
  ON public.profiles TO authenticated;
