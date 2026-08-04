-- ════════════════════════════════════════════════════════════════════════════
-- [P-5 / K-12.2] get_my_matches — KALECİ / HAKEM kapsamı
-- ────────────────────────────────────────────────────────────────────────────
-- Küresel canlı aboneliğin kapatılmasının (K-12.1) ÖN KOŞULU.
-- ServiceDashboard "bana atanan maçlar" listesini global adminMatches'ten
-- süzüyordu; küresel abonelik kapanınca bu kapsam olmadan EKSİK liste
-- gösterirdi. Kaptan da eklendi (creatorId ile aynı olmayabilir).
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_my_matches()
RETURNS SETOF public.matches
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT m.*
  FROM public.matches m
  WHERE (SELECT auth.uid()) IS NOT NULL
    AND (
      m."creatorId" = (SELECT auth.uid())
      OR m.captain_id = (SELECT auth.uid())
      -- [K-12.2] Pazaryeri atamalari
      OR m.gk_id       = (SELECT auth.uid())
      OR m.away_gk_id  = (SELECT auth.uid())
      OR m."refereeId" = (SELECT auth.uid())
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements(
               COALESCE(m.slots, '[]'::jsonb) || COALESCE(m."awaySlots", '[]'::jsonb)
             ) AS s
        WHERE (s->'player'->>'id')::uuid = (SELECT auth.uid())
           OR (s->>'occupant')::uuid     = (SELECT auth.uid())
           OR (s->>'purchasedBy')::uuid  = (SELECT auth.uid())
      )
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements(COALESCE(m."reservePlayers", '[]'::jsonb)) AS r
        WHERE (r->>'id')::uuid = (SELECT auth.uid())
      )
    );
$function$;

COMMENT ON FUNCTION public.get_my_matches() IS
  'P-5/K-12.2: Kullanicinin maclari = kurucu | kaptan | kaleci | deplasman kalecisi | hakem | slotta oturan | slotu satin alan | yedek.';

REVOKE ALL ON FUNCTION public.get_my_matches() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_matches() TO authenticated;

DO $do$
DECLARE v_kapsam int;
BEGIN
  SELECT count(*) INTO v_kapsam FROM (
    SELECT unnest(ARRAY['creatorId','captain_id','gk_id','away_gk_id','refereeId']) AS c
  ) t WHERE position(t.c in pg_get_functiondef('public.get_my_matches()'::regprocedure)) > 0;
  IF v_kapsam <> 5 THEN RAISE EXCEPTION '[K-12.2] Kapsam eksik: %/5', v_kapsam; END IF;
END $do$;
