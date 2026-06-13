-- Kullanıcı istatistikleri (profiles tablosu - snake_case)
-- Sistemdeki kullanıcı sayıları ve durumları

SELECT 
  COUNT(*) as total_users,
  COUNT(*) FILTER (WHERE is_verified = true) as verified_users,
  COUNT(*) FILTER (WHERE is_banned = true) as banned_users,
  COUNT(*) FILTER (WHERE is_pro = true) as pro_users,
  ROUND(AVG(rating)::numeric, 2) as avg_rating,
  ROUND(AVG(reliability_score)::numeric, 2) as avg_reliability,
  COUNT(*) FILTER (WHERE is_looking_for_team = true) as looking_for_team
FROM profiles;
