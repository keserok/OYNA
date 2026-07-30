-- ═══════════════════════════════════════════════════════════════════════════
-- GÜVENLİK — KRİTİK: public_profiles görünümü üzerinden profil YAZMA kapatıldı
--
-- SORUN (canlı denetimde bulundu, 2026-07-30):
--   public.public_profiles görünümü SECURITY DEFINER'dır (security_invoker=false).
--   Bu, görünümün altındaki profiles tablosuna görünüm SAHİBİNİN (postgres)
--   yetkisiyle erişildiği anlamına gelir — yani profiles üzerindeki RLS
--   (satır bazlı erişim kuralı) DEVREYE GİRMEZ. OKUMA için bu bilinçli ve
--   doğrudur: kullanıcılar birbirinin AD/AVATAR gibi güvenli alanlarını
--   görebilsin diye tasarlanmıştır (e-posta/telefon/konum bu görünümde YOKTUR).
--
--   Ancak görünüm tek tablodan türediği için PostgreSQL onu OTOMATİK
--   GÜNCELLENEBİLİR (auto-updatable) sayar ve `authenticated` rolüne
--   INSERT/UPDATE/DELETE yetkileri de verilmiş durumdaydı. Sonuç:
--   giriş yapmış HERHANGİ bir kullanıcı
--       PATCH /rest/v1/public_profiles?id=eq.<baskasinin-idsi>
--   çağrısıyla BAŞKA bir kullanıcının profilini değiştirebiliyordu.
--
--   profiles üzerindeki koruma trigger'ları (protect_profile_columns,
--   protect_profile_sensitive_fields) role/roles/is_admin/is_banned/
--   is_verified/wallet_balance alanlarını koruduğu için ADMIN'e yükselme
--   veya bakiye değiştirme MÜMKÜN DEĞİLDİ. Fakat korunmayan alanlar açıktı:
--     - name, full_name, bio, avatar_url, gender, position, play_style
--       → başkasının adına içerik yazma / kimliğe bürünme (impersonation)
--     - trust_score, reliability_score, match_count, win_count, total_matches,
--       diamonds, is_pro, self_skill → puan/rozet şişirme, ücretli özelliğe
--       bedava erişim
--     - oyna_id → başkasının kullanıcı kimliğini çalma/çakıştırma
--     - DELETE yetkisi → başkasının profil satırını SİLME
--
-- ÇÖZÜM:
--   Görünümden yazma yetkilerini geri al. SELECT olduğu gibi kalır, yani
--   uygulamanın hiçbir OKUMA akışı etkilenmez. Profil güncellemesi zaten
--   doğru yol olan `profiles` tablosu + RLS üzerinden yapılmaktadır
--   (profiles_update: yalnız kendi satırı veya admin).
--
--   Ek olarak görünüme WITH CHECK OPTION eklenmez; yazma tamamen kapandığı
--   için gereksizdir ve mevcut okuma davranışını değiştirme riski taşımaz.
-- ═══════════════════════════════════════════════════════════════════════════

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.public_profiles FROM authenticated;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.public_profiles FROM anon;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.public_profiles FROM PUBLIC;

-- Okuma açıkça korunur (uygulamanın oyuncu kartı/arama akışları buna bağlı).
GRANT SELECT ON public.public_profiles TO authenticated;

-- service_role (sunucu tarafı yönetim işleri) dokunulmaz — edge fonksiyonları
-- ve admin işlemleri bu rolü kullanır.

-- ── Savunma derinliği: iç yardımcı/trigger fonksiyonlarında PUBLIC EXECUTE ──
-- Aşağıdaki fonksiyonlar ya yalnız trigger olarak çalışır ya da admin işidir.
-- Hepsinin kendi içinde yetki kontrolü vardır (admin_* fonksiyonları
-- is_admin() çağırır), ama PUBLIC'e EXECUTE verilmesi gereksiz saldırı yüzeyidir.
-- Supabase güvenlik danışmanı (advisor) bunları "anon çalıştırabilir" diye
-- işaretliyordu; bu satırlar o uyarıları kapatır.
REVOKE EXECUTE ON FUNCTION public._pitches_owner_guard()        FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public._sync_pitch_working_hours()   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.matches_format_range_guard()  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_fetch_pitches(text, text, integer, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_pitch_team(uuid)             FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_remove_pitch_staff(uuid)     FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_pitch_staff(uuid, uuid, text) FROM PUBLIC, anon;

-- admin_* fonksiyonlarını yönetici paneli `authenticated` rolüyle çağırır;
-- o yetki korunur (fonksiyon içindeki is_admin() kontrolü gerçek kapıdır).
GRANT EXECUTE ON FUNCTION public.admin_fetch_pitches(text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_pitch_team(uuid)             TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_remove_pitch_staff(uuid)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_pitch_staff(uuid, uuid, text) TO authenticated;
