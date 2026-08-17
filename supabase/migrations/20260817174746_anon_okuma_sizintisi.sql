-- ════════════════════════════════════════════════════════════════════════════
-- DEFTERDEN ALINDI — 17 Ağustos 2026 17:47 UTC bant-dışı uygulaması
-- ════════════════════════════════════════════════════════════════════════════
-- Denetim raporundaki YÜKSEK bulgunun (anon'a açık okuma) üretimde elden
-- kapatılması. Dosya, defterdeki statements içeriğinden BİREBİR
-- (md5 56f992223510a26dfa49e97d987b1eac) alınarak playbook Kural 1 gereği
-- depoya eklendi. 20260908000000_anon_acik_tablolar_kapatildi ile uyumludur:
-- oradaki DROP/CREATE'ler idempotenttir, bu dosyanın kurduğu _select_own
-- politikalarına dokunmaz.
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Registrations are viewable by everyone." ON public.match_registrations;
DROP POLICY IF EXISTS "Waitlist viewable by everyone."          ON public.waitlist;
DROP POLICY IF EXISTS "Holds are viewable by everyone"          ON public.pitch_slot_holds;

CREATE POLICY match_registrations_select_own ON public.match_registrations
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.is_admin());

CREATE POLICY waitlist_select_own ON public.waitlist
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.is_admin());

CREATE POLICY slot_holds_select_own ON public.pitch_slot_holds
  FOR SELECT TO authenticated
  USING (held_by = (SELECT auth.uid()) OR public.is_admin());

REVOKE ALL ON public.match_registrations FROM anon;
REVOKE ALL ON public.waitlist            FROM anon;
REVOKE ALL ON public.pitch_slot_holds    FROM anon;

DO $$
DECLARE v_acik int;
BEGIN
  SELECT count(*) INTO v_acik
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('match_registrations', 'waitlist', 'pitch_slot_holds')
    AND cmd = 'SELECT'
    AND roles::text LIKE '%public%'
    AND coalesce(qual, 'true') = 'true';
  IF v_acik <> 0 THEN
    RAISE EXCEPTION 'DOGRULAMA: hala % adet herkese acik okuma politikasi var.', v_acik;
  END IF;

  IF has_table_privilege('anon', 'public.match_registrations', 'SELECT')
     OR has_table_privilege('anon', 'public.waitlist', 'SELECT')
     OR has_table_privilege('anon', 'public.pitch_slot_holds', 'SELECT') THEN
    RAISE EXCEPTION 'DOGRULAMA: anon rolunun SELECT yetkisi hala duruyor.';
  END IF;
END $$;
