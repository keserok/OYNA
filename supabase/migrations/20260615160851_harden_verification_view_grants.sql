-- [DB GEÇMİŞİNDEN KURTARILDI 2026-07-11] Bu migration canlı veritabanına uygulanmıştı ancak repoda dosyası yoktu; supabase_migrations.schema_migrations.statements kolonundan geri çıkarıldı.

-- pending_provider_verifications view: anon tüm izinlerini kaldır, authenticated yalnız SELECT.
REVOKE ALL ON public.pending_provider_verifications FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.pending_provider_verifications FROM authenticated;
-- authenticated SELECT kalır (admin onay sekmesi okur; RLS profiles üzerinden uygulanır)
GRANT SELECT ON public.pending_provider_verifications TO authenticated;
