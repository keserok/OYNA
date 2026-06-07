-- ============================================================================
-- OYNA: Drop legacy court_availability view (unused; resolved SECURITY DEFINER lint)
-- APPLIED TO PRODUCTION on 2026-06-07 (project iikvzgyccvgcybzdfwlv).
-- Occupancy single-source is the get_court_occupancy() function; this view was
-- dead code and not referenced anywhere in the app.
-- ============================================================================

DROP VIEW IF EXISTS public.court_availability;
