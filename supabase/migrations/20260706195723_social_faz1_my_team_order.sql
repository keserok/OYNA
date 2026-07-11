-- ================================================================
-- SOSYAL AŞAMA 1.13 — Kişisel takım sırası RPC'si (Spec G eki)
-- team_members UPDATE RLS'i kaptan-only olduğundan, üyenin kendi
-- sort_order'ı bu SECURITY DEFINER ile yazılır (yalnız kendi satırları).
-- ================================================================
CREATE OR REPLACE FUNCTION public.set_my_team_order(p_team_ids uuid[])
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = 'public','pg_temp' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_i   int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_team_ids IS NULL OR array_length(p_team_ids, 1) IS NULL THEN RETURN; END IF;
  IF array_length(p_team_ids, 1) > 20 THEN RAISE EXCEPTION 'TOO_MANY'; END IF;
  FOR v_i IN 1 .. array_length(p_team_ids, 1) LOOP
    UPDATE public.team_members
    SET sort_order = v_i
    WHERE team_id = p_team_ids[v_i] AND user_id = v_uid;
  END LOOP;
END $$;
REVOKE EXECUTE ON FUNCTION public.set_my_team_order(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_my_team_order(uuid[]) TO authenticated;
