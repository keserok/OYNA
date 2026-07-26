-- ═══════════════════════════════════════════════════════════════════════════
-- ADMİN TAKIM CRUD RPC'LERİ + SAHA PUANI SİLME DÜZELTMESİ
--
-- 1) admin_create_team / admin_delete_team: panel bugüne dek teams tablosuna
--    DOĞRUDAN yazıyordu → (a) INSERT, teams_insert_own RLS'ine
--    (captain_id = auth.uid()) takılıp admin için HEP patlıyordu;
--    (b) DELETE çalışıyordu ama audit'siz ve RBAC alt-rol kapısız.
--    Diğer varlıklarla aynı kalıba alındı: __core (audit'li, service_role) +
--    require_admin_role(['MODERATOR']) sarmalayıcı.
--
-- 2) admin_delete_pitch_rating: yorum silindikten sonra pitches.rating /
--    rating_count bayat kalıyordu — artık _recompute_pitch_rating çağrılır;
--    son yorum silindiyse rating_count 0'a çekilir (vitrin "Yeni" gösterir).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1a) admin_create_team ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_create_team__core(p_name text, p_is_demo boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_id uuid;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF COALESCE(btrim(p_name), '') = '' THEN RAISE EXCEPTION 'Takım adı boş olamaz'; END IF;
  INSERT INTO public.teams (name, is_demo) VALUES (btrim(p_name), COALESCE(p_is_demo, false)) RETURNING id INTO v_id;
  PERFORM public.log_admin_action('TEAM_CREATE', 'team', v_id, btrim(p_name), NULL, jsonb_build_object('is_demo', COALESCE(p_is_demo, false)));
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_create_team(p_name text, p_is_demo boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.require_admin_role(ARRAY['MODERATOR']);
  RETURN public.admin_create_team__core(p_name, p_is_demo);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_create_team__core(p_name text, p_is_demo boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_team__core(p_name text, p_is_demo boolean) TO service_role;
REVOKE ALL ON FUNCTION public.admin_create_team(p_name text, p_is_demo boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_team(p_name text, p_is_demo boolean) TO authenticated, service_role;

-- ─── 1b) admin_delete_team ───────────────────────────────────────────────────
-- CASCADE bilinçli: team_members / tactics / match_tactics / davetler / sohbet
-- takımla birlikte gider; matches.homeTeamId/awayTeamId FK'sız olduğundan
-- sarkık kalır (skor ekranı takım adını çözemez) — audit'e team adı yazılır ki
-- iz sürülebilsin. Ürün kuralı K72: dağıtma=arşiv; hard delete yalnız panel.

CREATE OR REPLACE FUNCTION public.admin_delete_team__core(p_team_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_name TEXT;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT name INTO v_name FROM public.teams WHERE id = p_team_id;
  IF v_name IS NULL THEN RAISE EXCEPTION 'Takım bulunamadı'; END IF;
  DELETE FROM public.teams WHERE id = p_team_id;
  PERFORM public.log_admin_action('TEAM_DELETE', 'team', p_team_id, v_name, NULL, NULL);
  RETURN TRUE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_delete_team(p_team_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.require_admin_role(ARRAY['MODERATOR']);
  RETURN public.admin_delete_team__core(p_team_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_delete_team__core(p_team_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_team__core(p_team_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.admin_delete_team(p_team_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_team(p_team_id uuid) TO authenticated, service_role;

-- ─── 2) admin_delete_pitch_rating v2 — silme sonrası toplam puan tazelenir ──

CREATE OR REPLACE FUNCTION public.admin_delete_pitch_rating(p_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_old   jsonb;
  v_pitch uuid;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT to_jsonb(r.*), r.pitch_id INTO v_old, v_pitch FROM public.pitch_ratings r WHERE r.id = p_id;
  IF v_old IS NULL THEN RAISE EXCEPTION 'Puan kaydı bulunamadı'; END IF;
  DELETE FROM public.pitch_ratings WHERE id = p_id;
  -- Toplam puanı tazele; son yorum silindiyse recompute erken döner → sayaç 0'a çekilir
  PERFORM public._recompute_pitch_rating(v_pitch);
  UPDATE public.pitches SET rating_count = 0
  WHERE id = v_pitch AND NOT EXISTS (SELECT 1 FROM public.pitch_ratings WHERE pitch_id = v_pitch);
  PERFORM public.log_admin_action('PITCH_RATING_DELETE', 'pitch_rating', p_id, v_pitch::text, v_old, NULL);
  RETURN TRUE;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_delete_pitch_rating(p_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_pitch_rating(p_id uuid) TO authenticated, service_role;
