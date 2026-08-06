-- ==============================================================================
-- Profil ekranı yenilemesi — kendi profilini düzenleme kolon yetkileri
-- KÖK NEDEN: authenticated rolünün profiles üzerindeki UPDATE yetkisi kolon
-- bazlı verilmişti ve position/bio listede yoktu → "Profili Düzenle" PATCH'i
-- 42501 (permission denied) ile düşüyordu. Satır güvenliği RLS'te
-- (profiles_update: yalnız kendi satırı + profile_privileges_unchanged),
-- yetki yükseltme koruması trigger'da; bu kolonlar güvenle açılabilir.
-- ==============================================================================

-- ── ÖN KOŞUL: tablo düzeyinde UPDATE OLMAMALI ───────────────────────────────
-- Sütun bazlı yetki ancak tablo düzeyinde UPDATE YOKKEN anlam taşır: PostgreSQL'de
-- tablo düzeyinde UPDATE'i olan bir rol HER sütunu yazabilir, sütun bazlı
-- kısıtlar dikkate alınmaz.
--
-- Canlıda bu daraltma ZATEN yapılmış (profiles üzerinde authenticated ve anon
-- `ardDxtm` — yani `w` yok, ve 34 sütun tek tek verilmiş) ama onu yapan adım
-- hiçbir migration'a yazılmamış; elle uygulanmış. Depo bu yüzden sıfırdan
-- kurulduğunda tablo düzeyinde UPDATE açık kalıyordu ve
-- 20260804140707 (wallet sütununu kapatan SEC-1 migration'ı) kendi
-- doğrulamasında haklı olarak "wallet hala yazilabilir" diyerek duruyordu.
--
-- CANLIYA ETKİSİ YOK: orada zaten alınmış durumda; bu satır aynı sonucu tekrar
-- yazar. Aşağıdaki sütun izinleri ise hemen ardından geri verilir.
REVOKE UPDATE ON public.profiles FROM anon, authenticated;

GRANT UPDATE (position, bio, birthdate, preferred_foot)
  ON public.profiles TO authenticated;
