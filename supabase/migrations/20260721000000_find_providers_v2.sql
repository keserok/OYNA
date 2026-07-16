-- FAZ 3: find_providers_for_match v2 — kaleci pazarı için detaylı alanlar.
-- Kaptanın gördüğü pazarda dikey detaylı kart (yetenek barları + istatistik) için
-- kaleci skills/stats/boy/yaş ve hakem stats alanları da döner. Yetki/filtre aynen
-- korunur (yalnız kaptan/sahip/admin; onaylı + müsait + çakışmasız sağlayıcılar).
CREATE OR REPLACE FUNCTION public.find_providers_for_match(p_match_id uuid, p_provider_type text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_match RECORD; v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_provider_type NOT IN ('GK','REF') THEN RAISE EXCEPTION 'INVALID_TYPE'; END IF;
  SELECT id, starts_at, status, "creatorId", captain_id INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_match."creatorId" IS DISTINCT FROM v_uid AND v_match.captain_id IS DISTINCT FROM v_uid AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: Yalniz mac sahibi/kaptan saglayici arayabilir.'; END IF;
  IF p_provider_type = 'GK' THEN
    SELECT jsonb_agg(row_to_json(t) ORDER BY t.rating DESC, t.match_count DESC, t.fee ASC) INTO v_result FROM (
      SELECT g.id, g.name, g.avatar, g.rating, g.fee, g."matchCount" AS match_count, g.style,
             g.height, g.age, g.skills, g.stats,
             g."preferredZones" AS preferred_zones, g.coordinates, g."isElite" AS is_elite
      FROM public.goalkeepers g JOIN public.profiles p ON p.id = g.id
      WHERE p.verification_status = 'approved' AND COALESCE(p.is_available, true) = true AND COALESCE(g."isDemo", false) = false
        AND NOT public._provider_has_conflict(g.id, v_match.starts_at, p_match_id)) t;
  ELSE
    SELECT jsonb_agg(row_to_json(t) ORDER BY t.rating DESC, t.match_count DESC, t.fee ASC) INTO v_result FROM (
      SELECT r.id, r.name, r.avatar, r.rating, r.fee, r."matchCount" AS match_count, r.level, r.style,
             r.stats,
             r."preferredZones" AS preferred_zones, r.coordinates, r."isElite" AS is_elite
      FROM public.referees r JOIN public.profiles p ON p.id = r.id
      WHERE p.verification_status = 'approved' AND COALESCE(p.is_available, true) = true AND COALESCE(r."isDemo", false) = false
        AND NOT public._provider_has_conflict(r.id, v_match.starts_at, p_match_id)) t;
  END IF;
  RETURN COALESCE(v_result, '[]'::jsonb);
END; $function$;
