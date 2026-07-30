-- ============================================================================
-- public_profiles: beyan edilen seviye girer, akran-puanı yüzeyi çıkar
--
-- Puan sistemi sökümünün (20260831000000) görünüm ayağı:
--   + self_skill        — kadro satırı seviye bandının kaynağı (skillBand)
--   − rating            — eski akran türevi kamusal puan (artık hiçbir istemci okumaz)
--   − skill_rating      — kart OVR temeli (kart OVR sistemi söküldü)
--   − ratings_history   — akran puan geçmişi (trigger de söküldü)
--   − player_card       — OVR kartı jsonb'si (fp beslemesi söküldü)
--   − card_active/card_tier — premium kart kapısı (nötr kart herkese açık)
--
-- İstemci süpürmesi bu migration'la AYNI dalda: kalan tek public_profiles
-- tüketicileri ad/avatar/oyna_id/last_active + yeni self_skill okuyor.
-- profiles tablosundaki kolonlar DÜŞÜRÜLMEDİ (geri dönüş); yalnız kamusal
-- görünümden çıkarıldılar.
-- ============================================================================

DROP VIEW IF EXISTS public.public_profiles;
CREATE VIEW public.public_profiles
WITH (security_invoker = false) AS
SELECT
  id,
  name,
  full_name,
  avatar_url,
  role,
  roles,
  trust_score,
  reliability_score,
  is_verified,
  join_date,
  is_pro,
  match_count,
  win_count,
  total_matches,
  diamonds,
  communities,
  self_skill,
  oyna_id,
  is_looking_for_team,
  is_available,
  position,
  bio,
  play_style,
  gender,
  CASE WHEN show_online_status THEN last_active_at ELSE NULL END AS last_active_at
FROM public.profiles
WHERE is_searchable = true
   OR id = (SELECT auth.uid())
   OR is_admin();

GRANT SELECT ON public.public_profiles TO authenticated;
REVOKE ALL ON public.public_profiles FROM anon, public;

COMMENT ON VIEW public.public_profiles IS
  'Column- and row-filtered public read surface for profiles. Never add email, '
  'phone, last_location, wallet_balance, wallet, or iyzico_card_user_key. '
  'Akran-puanı kolonları (rating/skill_rating/ratings_history/player_card/'
  'card_*) 20260831000002 ile bilinçli çıkarıldı — geri ekleme.';
