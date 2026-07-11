-- [DB GEÇMİŞİNDEN KURTARILDI 2026-07-11] Bu migration canlı veritabanına uygulanmıştı ancak repoda dosyası yoktu; supabase_migrations.schema_migrations.statements kolonundan geri çıkarıldı.

REVOKE EXECUTE ON FUNCTION public.admin_broadcast_notification(text, text, text, text, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_broadcast_notification(text, text, text, text, uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_cancel_account_deletion(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_cancel_account_deletion(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_send_template_test(text, jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_send_template_test(text, jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_provider_verification_status() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_provider_verification_status() FROM anon;
REVOKE EXECUTE ON FUNCTION public.sync_provider_verification_status() FROM authenticated;
