-- [DB GEÇMİŞİNDEN KURTARILDI 2026-07-11] Bu migration canlı veritabanına uygulanmıştı ancak repoda dosyası yoktu; supabase_migrations.schema_migrations.statements kolonundan geri çıkarıldı.

-- Trigger fonksiyonu yalnız trigger tarafından çağrılır; doğrudan execute izni gereksiz.
REVOKE ALL ON FUNCTION public.audit_log_hash_chain() FROM PUBLIC, anon, authenticated;
