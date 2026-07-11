-- Demo tesis RLS: has_role('OWNER') + is_admin() standardı
-- seed/purge RPC: authenticated + service_role (anon kapalı)

DROP POLICY IF EXISTS "Owners manage demo pitches" ON public.pitches;
CREATE POLICY "Owners manage demo pitches" ON public.pitches FOR ALL
USING (is_demo = true AND public.has_role('OWNER'))
WITH CHECK (is_demo = true AND public.has_role('OWNER'));

DROP POLICY IF EXISTS "Owners manage demo pitch bookings" ON public.pitch_bookings;
CREATE POLICY "Owners manage demo pitch bookings" ON public.pitch_bookings FOR ALL
USING (
  EXISTS (SELECT 1 FROM public.pitches p WHERE p.id = pitch_bookings.pitch_id AND p.is_demo = true)
  AND public.has_role('OWNER')
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.pitches p WHERE p.id = pitch_bookings.pitch_id AND p.is_demo = true)
  AND public.has_role('OWNER')
);

DROP POLICY IF EXISTS "Owners manage pitch bank accounts" ON public.pitch_bank_accounts;
CREATE POLICY "Owners manage pitch bank accounts" ON public.pitch_bank_accounts FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.pitches p
    WHERE p.id = pitch_bank_accounts.pitch_id
      AND (p.owner_id = auth.uid() OR (p.is_demo = true AND public.has_role('OWNER')))
  )
  OR public.is_admin()
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.pitches p
    WHERE p.id = pitch_bank_accounts.pitch_id
      AND (p.owner_id = auth.uid() OR (p.is_demo = true AND public.has_role('OWNER')))
  )
  OR public.is_admin()
);

DROP POLICY IF EXISTS "Owners manage pitch staff" ON public.pitch_staff_members;
CREATE POLICY "Owners manage pitch staff" ON public.pitch_staff_members FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.pitches p
    WHERE p.id = pitch_staff_members.pitch_id
      AND (p.owner_id = auth.uid() OR (p.is_demo = true AND public.has_role('OWNER')))
  )
  OR public.is_admin()
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.pitches p
    WHERE p.id = pitch_staff_members.pitch_id
      AND (p.owner_id = auth.uid() OR (p.is_demo = true AND public.has_role('OWNER')))
  )
  OR public.is_admin()
);

DROP POLICY IF EXISTS "Owners manage pitch tasks" ON public.pitch_staff_tasks;
CREATE POLICY "Owners manage pitch tasks" ON public.pitch_staff_tasks FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.pitches p
    WHERE p.id = pitch_staff_tasks.pitch_id
      AND (p.owner_id = auth.uid() OR (p.is_demo = true AND public.has_role('OWNER')))
  )
  OR public.is_admin()
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.pitches p
    WHERE p.id = pitch_staff_tasks.pitch_id
      AND (p.owner_id = auth.uid() OR (p.is_demo = true AND public.has_role('OWNER')))
  )
  OR public.is_admin()
);

REVOKE ALL ON FUNCTION public.purge_owner_demo() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.seed_owner_demo() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purge_owner_demo() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.seed_owner_demo() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_owner_demo_pitch_id() TO authenticated, service_role;
