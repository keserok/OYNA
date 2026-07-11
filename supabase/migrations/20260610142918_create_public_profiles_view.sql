-- [DB GEÇMİŞİNDEN KURTARILDI 2026-07-11] Bu migration canlı veritabanına uygulanmıştı ancak repoda dosyası yoktu; supabase_migrations.schema_migrations.statements kolonundan geri çıkarıldı.

-- BLOK 3 / AŞAMA 1: Herkese açık profil vitrini
-- Yalnızca oyuncu kartı bilgilerini içerir; hassas alanlar
-- (email, phone, wallet, wallet_balance, last_location, push_token,
--  notification_preferences, ban bilgileri, friends, communities) HARİÇ.
-- NOT: Bu view bilinçli olarak RLS'i aşar (SECURITY DEFINER davranışı)
-- çünkü amacı tam da güvenli kolonları herkese sunmaktır.

CREATE OR REPLACE VIEW public.public_profiles AS
SELECT
  id,
  name,
  avatar_url,
  oyna_id,
  role,
  skill_rating,
  rating,
  trust_score,
  reliability_score,
  diamonds,
  win_count,
  total_matches,
  match_count,
  player_card,
  is_looking_for_team,
  is_available,
  is_verified,
  join_date
FROM public.profiles;

GRANT SELECT ON public.public_profiles TO anon, authenticated;
