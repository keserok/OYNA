-- [DB GEÇMİŞİNDEN KURTARILDI 2026-07-11] Bu migration canlı veritabanına uygulanmıştı ancak repoda dosyası yoktu; supabase_migrations.schema_migrations.statements kolonundan geri çıkarıldı.

-- Yeniden oluşturulan fonksiyonlarda varsayılan PUBLIC execute iznini kapat:
-- yalnız authenticated çağırabilir (iç is_platform_admin guard'ı ana kapı).
REVOKE ALL ON FUNCTION public.admin_create_pitch(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_update_pitch(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_log_pii_reveal(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_pitch(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_pitch(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_log_pii_reveal(uuid, text) TO authenticated;
