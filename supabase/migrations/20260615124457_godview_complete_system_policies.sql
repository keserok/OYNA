-- [DB GEÇMİŞİNDEN KURTARILDI 2026-07-11] Bu migration canlı veritabanına uygulanmıştı ancak repoda dosyası yoktu; supabase_migrations.schema_migrations.statements kolonundan geri çıkarıldı.

DROP POLICY IF EXISTS "ccr_admin_all" ON public.community_creation_requests;
CREATE POLICY "ccr_admin_all" ON public.community_creation_requests FOR ALL
  USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "ccr_requester_read" ON public.community_creation_requests;
CREATE POLICY "ccr_requester_read" ON public.community_creation_requests FOR SELECT
  USING (requester_id = auth.uid() OR public.is_platform_admin());

DROP POLICY IF EXISTS "ccr_requester_insert" ON public.community_creation_requests;
CREATE POLICY "ccr_requester_insert" ON public.community_creation_requests FOR INSERT
  WITH CHECK (requester_id = auth.uid());

DROP POLICY IF EXISTS "Platform admins manage goalkeepers" ON public.goalkeepers;
CREATE POLICY "Platform admins manage goalkeepers" ON public.goalkeepers FOR ALL
  USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "Platform admins manage referees" ON public.referees;
CREATE POLICY "Platform admins manage referees" ON public.referees FOR ALL
  USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "Public read goalkeepers" ON public.goalkeepers;
CREATE POLICY "Public read goalkeepers" ON public.goalkeepers FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read referees" ON public.referees;
CREATE POLICY "Public read referees" ON public.referees FOR SELECT USING (true);

CREATE OR REPLACE VIEW public.pending_provider_verifications AS
SELECT
  p.id,
  COALESCE(p.full_name, p.name) AS full_name,
  p.email,
  p.avatar_url,
  p.role AS primary_role,
  p.roles,
  p.verification_status,
  p.created_at,
  g.id AS gk_profile_id,
  g.bio AS gk_bio,
  g.fee AS gk_fee,
  r.id AS ref_profile_id,
  r.bio AS ref_bio,
  r.fee AS ref_fee
FROM public.profiles p
LEFT JOIN public.goalkeepers g ON g.id = p.id OR g."authUid" = p.id
LEFT JOIN public.referees r ON r.id = p.id OR r."authUid" = p.id
WHERE p.verification_status = 'pending'
  AND (
    p.role IN ('GOALKEEPER', 'REFEREE')
    OR COALESCE(p.roles, '[]'::jsonb) ? 'GOALKEEPER'
    OR COALESCE(p.roles, '[]'::jsonb) ? 'REFEREE'
  );

GRANT SELECT ON public.pending_provider_verifications TO authenticated;
