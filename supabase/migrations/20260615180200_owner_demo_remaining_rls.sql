-- Demo tesis: tarife, gider, borçlu, abonelik, saha yazma RLS

DROP POLICY IF EXISTS "pitch_tariffs_insert" ON public.pitch_tariffs;
CREATE POLICY "pitch_tariffs_insert" ON public.pitch_tariffs FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.pitches p
    WHERE p.id = pitch_tariffs.pitch_id
      AND (p.owner_id = auth.uid() OR (p.is_demo = true AND public.has_role('OWNER')))
  )
  OR public.is_admin()
);

DROP POLICY IF EXISTS "pitch_tariffs_update" ON public.pitch_tariffs;
CREATE POLICY "pitch_tariffs_update" ON public.pitch_tariffs FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.pitches p
    WHERE p.id = pitch_tariffs.pitch_id
      AND (p.owner_id = auth.uid() OR (p.is_demo = true AND public.has_role('OWNER')))
  )
  OR public.is_admin()
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.pitches p
    WHERE p.id = pitch_tariffs.pitch_id
      AND (p.owner_id = auth.uid() OR (p.is_demo = true AND public.has_role('OWNER')))
  )
  OR public.is_admin()
);

DROP POLICY IF EXISTS "pitch_tariffs_delete" ON public.pitch_tariffs;
CREATE POLICY "pitch_tariffs_delete" ON public.pitch_tariffs FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.pitches p
    WHERE p.id = pitch_tariffs.pitch_id
      AND (p.owner_id = auth.uid() OR (p.is_demo = true AND public.has_role('OWNER')))
  )
  OR public.is_admin()
);

DROP POLICY IF EXISTS "pitch_expenses_manage" ON public.pitch_expenses;
CREATE POLICY "pitch_expenses_manage" ON public.pitch_expenses FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.pitches p
    WHERE p.id = pitch_expenses.pitch_id
      AND (p.owner_id = auth.uid() OR (p.is_demo = true AND public.has_role('OWNER')))
  )
  OR public.is_admin()
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.pitches p
    WHERE p.id = pitch_expenses.pitch_id
      AND (p.owner_id = auth.uid() OR (p.is_demo = true AND public.has_role('OWNER')))
  )
  OR public.is_admin()
);

DROP POLICY IF EXISTS "pitch_debtors_manage" ON public.pitch_debtors;
CREATE POLICY "pitch_debtors_manage" ON public.pitch_debtors FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.pitches p
    WHERE p.id = pitch_debtors.pitch_id
      AND (p.owner_id = auth.uid() OR (p.is_demo = true AND public.has_role('OWNER')))
  )
  OR public.is_admin()
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.pitches p
    WHERE p.id = pitch_debtors.pitch_id
      AND (p.owner_id = auth.uid() OR (p.is_demo = true AND public.has_role('OWNER')))
  )
  OR public.is_admin()
);

DROP POLICY IF EXISTS "pitch_subscriptions_insert" ON public.pitch_subscriptions;
CREATE POLICY "pitch_subscriptions_insert" ON public.pitch_subscriptions FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.pitches p
    WHERE p.id = pitch_subscriptions.pitch_id
      AND (p.owner_id = auth.uid() OR (p.is_demo = true AND public.has_role('OWNER')))
  )
  OR public.is_admin()
);

DROP POLICY IF EXISTS "pitch_subscriptions_update" ON public.pitch_subscriptions;
CREATE POLICY "pitch_subscriptions_update" ON public.pitch_subscriptions FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.pitches p
    WHERE p.id = pitch_subscriptions.pitch_id
      AND (p.owner_id = auth.uid() OR (p.is_demo = true AND public.has_role('OWNER')))
  )
  OR public.is_admin()
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.pitches p
    WHERE p.id = pitch_subscriptions.pitch_id
      AND (p.owner_id = auth.uid() OR (p.is_demo = true AND public.has_role('OWNER')))
  )
  OR public.is_admin()
);

DROP POLICY IF EXISTS "pitch_subscriptions_delete" ON public.pitch_subscriptions;
CREATE POLICY "pitch_subscriptions_delete" ON public.pitch_subscriptions FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.pitches p
    WHERE p.id = pitch_subscriptions.pitch_id
      AND (p.owner_id = auth.uid() OR (p.is_demo = true AND public.has_role('OWNER')))
  )
  OR public.is_admin()
);

DROP POLICY IF EXISTS "courts_write_insert" ON public.courts;
CREATE POLICY "courts_write_insert" ON public.courts FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.pitches p
    WHERE p.id = courts.pitch_id
      AND (p.owner_id = auth.uid() OR (p.is_demo = true AND public.has_role('OWNER')))
  )
  OR public.is_admin()
);

DROP POLICY IF EXISTS "courts_write_update" ON public.courts;
CREATE POLICY "courts_write_update" ON public.courts FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.pitches p
    WHERE p.id = courts.pitch_id
      AND (p.owner_id = auth.uid() OR (p.is_demo = true AND public.has_role('OWNER')))
  )
  OR public.is_admin()
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.pitches p
    WHERE p.id = courts.pitch_id
      AND (p.owner_id = auth.uid() OR (p.is_demo = true AND public.has_role('OWNER')))
  )
  OR public.is_admin()
);

DROP POLICY IF EXISTS "courts_write_delete" ON public.courts;
CREATE POLICY "courts_write_delete" ON public.courts FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.pitches p
    WHERE p.id = courts.pitch_id
      AND (p.owner_id = auth.uid() OR (p.is_demo = true AND public.has_role('OWNER')))
  )
  OR public.is_admin()
);
