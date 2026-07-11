-- [DB GEÇMİŞİNDEN KURTARILDI 2026-07-11] Bu migration canlı veritabanına uygulanmıştı ancak repoda dosyası yoktu; supabase_migrations.schema_migrations.statements kolonundan geri çıkarıldı.

-- Canlı veritabanının role/roles kısıtlarını uygulamanın tam rol modeliyle hizalar.
-- Yalnızca izin verilen değerleri GENİŞLETİR (CAPTAIN, COMMUNITY_ADMIN, ORGANIZER eklenir).
-- Genişletme olduğu için mevcut hiçbir satır/yazma işlemi bozulmaz.

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role::text IN (
    'PLAYER','GOALKEEPER','REFEREE','ADMIN','ORGANIZER',
    'SUPER_ADMIN','COMMUNITY_ADMIN','CAPTAIN','OWNER'
  ));

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_roles_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_roles_check
  CHECK (
    roles IS NULL OR (
      jsonb_typeof(roles) = 'array'
      AND roles <@ '["PLAYER","GOALKEEPER","REFEREE","ADMIN","ORGANIZER","SUPER_ADMIN","COMMUNITY_ADMIN","CAPTAIN","OWNER"]'::jsonb
    )
  );
