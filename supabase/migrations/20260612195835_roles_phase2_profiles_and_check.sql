-- [DB GEÇMİŞİNDEN KURTARILDI 2026-07-11] Bu migration canlı veritabanına uygulanmıştı ancak repoda dosyası yoktu; supabase_migrations.schema_migrations.statements kolonundan geri çıkarıldı.

-- ============================================================
-- OYNA — Rol Sistemi / Faz 2: profiles politikaları + CHECK sıkılaştırma
-- ============================================================

-- A) role CHECK: 9 -> 6 (ORGANIZER, COMMUNITY_ADMIN, CAPTAIN çıkar)
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK ((role)::text = ANY (ARRAY['PLAYER','GOALKEEPER','REFEREE','ADMIN','SUPER_ADMIN','OWNER']));

-- jsonb roles için de aynı sözlük (yetki kaynağı bu, sözlüğü zorla)
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_roles_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_roles_check
  CHECK (
    roles IS NULL OR (
      jsonb_typeof(roles) = 'array'
      AND roles <@ '["PLAYER","GOALKEEPER","REFEREE","ADMIN","SUPER_ADMIN","OWNER"]'::jsonb
    )
  );

-- B) Eski profiles politikalarını kaldır (service_role olanı KORU)
DROP POLICY IF EXISTS "Profiles are viewable by everyone"        ON public.profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON public.profiles;
DROP POLICY IF EXISTS "Users can view all profiles"              ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile"            ON public.profiles;
DROP POLICY IF EXISTS "Admins can update any profile."          ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile"            ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile."          ON public.profiles;
DROP POLICY IF EXISTS "Only admins can delete profiles"        ON public.profiles;

-- C) Yeni temiz ve tutarlı set
-- SELECT: sadece giriş yapanlar (anon PII sızıntısı kapanır)
CREATE POLICY "profiles_select_authenticated" ON public.profiles
  FOR SELECT TO authenticated USING (true);

-- INSERT: kendi profilini oluştur
CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = id);

-- UPDATE: kendi profilini (id'sini başkasınınkiyle değiştiremez; hassas kolonları trigger korur)
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) = id);

-- UPDATE: admin/super_admin her profili (jsonb + tek rol farketmez)
CREATE POLICY "profiles_update_admin" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- DELETE: sadece admin/super_admin
CREATE POLICY "profiles_delete_admin" ON public.profiles
  FOR DELETE TO authenticated
  USING (public.is_admin());
