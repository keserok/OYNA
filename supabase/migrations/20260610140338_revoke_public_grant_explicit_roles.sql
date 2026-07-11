-- [DB GEÇMİŞİNDEN KURTARILDI 2026-07-11] Bu migration canlı veritabanına uygulanmıştı ancak repoda dosyası yoktu; supabase_migrations.schema_migrations.statements kolonundan geri çıkarıldı.

-- DÜZELTME 3b: PUBLIC (herkes) üzerinden gelen örtük yetkileri kaldır,
-- yalnızca authenticated + service_role'e açıkça ver.

-- Rezervasyon
REVOKE EXECUTE ON FUNCTION public.create_pitch_booking(uuid, uuid, date, time, time, text, text, text, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.create_pitch_booking(uuid, uuid, date, time, time, text, text, text, text, text) TO authenticated, service_role;

-- Skor girişi
REVOKE EXECUTE ON FUNCTION public.submit_match_score(text, integer, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.submit_match_score(text, integer, integer) TO authenticated, service_role;

-- QR token
REVOKE EXECUTE ON FUNCTION public.get_or_create_match_score_token(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_or_create_match_score_token(uuid) TO authenticated, service_role;

-- Ödeme ve iade
REVOKE EXECUTE ON FUNCTION public.process_match_payment(uuid, uuid, numeric) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.process_match_payment(uuid, uuid, numeric) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.process_match_refund(uuid, uuid, numeric) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.process_match_refund(uuid, uuid, numeric) TO authenticated, service_role;

-- Konum
REVOKE EXECUTE ON FUNCTION public.update_user_location(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.update_user_location(uuid, text) TO authenticated, service_role;

-- Maça katılım ve elmas (garanti olsun diye PUBLIC da çekiliyor)
REVOKE EXECUTE ON FUNCTION public.join_match_slot(uuid, uuid, character varying, character varying) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.join_match_slot(uuid, uuid, character varying, character varying) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.update_player_diamond(uuid, boolean, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.update_player_diamond(uuid, boolean, integer) TO authenticated, service_role;

-- Bakım görevi: yalnızca sunucu/cron
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_holds() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.cleanup_expired_holds() TO service_role;
