-- [DB GEÇMİŞİNDEN KURTARILDI 2026-07-11] Bu migration canlı veritabanına uygulanmıştı ancak repoda dosyası yoktu; supabase_migrations.schema_migrations.statements kolonundan geri çıkarıldı.

-- DÜZELTME 3: Hassas fonksiyonlardan anonim (giriş yapmamış) erişimi kaldır.
-- cleanup_expired_holds bir bakım görevi olduğundan normal kullanıcılardan da kaldırıldı
-- (yalnızca sunucu/cron çağırabilir).

REVOKE EXECUTE ON FUNCTION public.create_pitch_booking(uuid, uuid, date, time, time, text, text, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.submit_match_score(text, integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_or_create_match_score_token(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.process_match_payment(uuid, uuid, numeric) FROM anon;
REVOKE EXECUTE ON FUNCTION public.process_match_refund(uuid, uuid, numeric) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_user_location(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_holds() FROM anon;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_holds() FROM authenticated;
