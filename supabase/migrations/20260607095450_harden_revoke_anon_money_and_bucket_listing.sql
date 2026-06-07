-- ============================================================================
-- OYNA: Block anon on money/rating/occupancy RPCs; remove broad bucket listing
-- APPLIED TO PRODUCTION on 2026-06-07 (project iikvzgyccvgcybzdfwlv).
-- These functions had the default PUBLIC EXECUTE grant, so anon could call them.
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.process_match_payment(uuid, uuid, numeric)     FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.update_player_diamond(uuid, boolean, integer)  FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_court_occupancy(uuid, date)                FROM anon, public;

-- Public 'images' bucket: drop broad listing policy (object URLs still work via getPublicUrl)
DROP POLICY IF EXISTS "Anyone can view images" ON storage.objects;
