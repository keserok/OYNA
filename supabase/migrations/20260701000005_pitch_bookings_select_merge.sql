-- Merge two SELECT policies on pitch_bookings to eliminate the last
-- multiple_permissive_policies warning.
--
-- "Authenticated users can view demo pitch bookings" {public}
--   USING: EXISTS(pitch.is_demo=true) AND auth.uid() IS NOT NULL
-- "pitch_bookings_select" {authenticated}
--   USING: user_id=uid OR EXISTS(pitch.owner_id=uid) OR is_admin()
--
-- Merged: single TO authenticated with demo pitch condition folded into
-- the pitches EXISTS subquery via OR.

DROP POLICY IF EXISTS "Authenticated users can view demo pitch bookings" ON public.pitch_bookings;
DROP POLICY IF EXISTS "pitch_bookings_select" ON public.pitch_bookings;

CREATE POLICY "pitch_bookings_select" ON public.pitch_bookings
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid() AS uid)
    OR EXISTS (
      SELECT 1 FROM public.pitches p
      WHERE p.id = pitch_bookings.pitch_id
        AND (
          p.owner_id = (SELECT auth.uid() AS uid)
          OR p.is_demo = true
        )
    )
    OR is_admin()
  );
