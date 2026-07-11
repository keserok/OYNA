-- [DB GEÇMİŞİNDEN KURTARILDI 2026-07-11] Bu migration canlı veritabanına uygulanmıştı ancak repoda dosyası yoktu; supabase_migrations.schema_migrations.statements kolonundan geri çıkarıldı.

-- Supabase anon'a açık EXECUTE veriyor; doğrudan anon'dan kaldır
REVOKE EXECUTE ON FUNCTION public.is_admin()       FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_super_admin()  FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_role(text)    FROM anon;
-- trigger fonksiyonu: RPC olarak ne anon ne authenticated çağırabilsin (trigger yine çalışır)
REVOKE EXECUTE ON FUNCTION public.protect_profile_columns() FROM anon, authenticated;
