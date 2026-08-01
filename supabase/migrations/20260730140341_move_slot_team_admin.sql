-- ============================================================================
-- player_move_slot_team: admin da taşıyabilir (E9 — admin Rahat lobisi)
--
-- 20260831000001'deki fonksiyonun TEK değişikliği: sahiplik kapısına
-- is_admin() muafiyeti. Admin, kullanıcının satın aldığı yeri kadro
-- yönetimi için karşı takıma taşıyabilir (para hareketi yine YOK; oturan
-- varsa match_participants.role birlikte taşınır — davranış aynen).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.player_move_slot_team(
  p_match_id uuid, p_slot_id text, p_target_side text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_slots jsonb; v_away jsonb;
  v_src jsonb; v_dst jsonb;
  v_slot jsonb;
  v_src_is_home boolean;
  v_target_id text;
  v_payload jsonb;
  v_occ uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_target_side NOT IN ('home', 'away') THEN RAISE EXCEPTION 'INVALID_SIDE'; END IF;

  SELECT slots, COALESCE("awaySlots", '[]'::jsonb) INTO v_slots, v_away
  FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF v_slots IS NULL THEN RAISE EXCEPTION 'NOT_FOUND: Maç bulunamadı'; END IF;

  SELECT s INTO v_slot FROM jsonb_array_elements(v_slots) s WHERE s->>'id' = p_slot_id;
  IF v_slot IS NOT NULL THEN
    v_src_is_home := true;
  ELSE
    SELECT s INTO v_slot FROM jsonb_array_elements(v_away) s WHERE s->>'id' = p_slot_id;
    IF v_slot IS NULL THEN RAISE EXCEPTION 'SLOT_NOT_FOUND: %', p_slot_id; END IF;
    v_src_is_home := false;
  END IF;

  -- Sahiplik: alıcı YA DA platform admini (E9 kadro yönetimi).
  IF (v_slot->>'purchasedBy') IS DISTINCT FROM v_uid::text AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'NOT_OWNER: Bu yeri sen almadın.';
  END IF;

  IF (v_src_is_home AND p_target_side = 'home')
     OR (NOT v_src_is_home AND p_target_side = 'away') THEN
    RETURN jsonb_build_object('ok', true, 'moved', false, 'reason', 'ALREADY_THERE');
  END IF;

  v_src := CASE WHEN v_src_is_home THEN v_slots ELSE v_away END;
  v_dst := CASE WHEN v_src_is_home THEN v_away  ELSE v_slots END;

  SELECT s->>'id' INTO v_target_id
  FROM jsonb_array_elements(v_dst) WITH ORDINALITY AS t(s, ord)
  WHERE COALESCE(s->>'status', 'OPEN') = 'OPEN'
  ORDER BY ord LIMIT 1;
  IF v_target_id IS NULL THEN
    RAISE EXCEPTION 'TARGET_FULL: Karşı takımda boş yer yok.';
  END IF;

  v_payload := v_slot - 'id' - 'role' - 'x' - 'y';
  v_occ := COALESCE(NULLIF(v_slot->>'occupant', '')::uuid,
                    NULLIF(v_slot->'player'->>'id', '')::uuid);

  v_src := (SELECT jsonb_agg(
      CASE WHEN s->>'id' = p_slot_id
        THEN (s - 'player' - 'occupant' - 'inviteeId' - 'claimCode' - 'purchasedBy' - 'assignmentStatus')
             || jsonb_build_object('status', 'OPEN')
        ELSE s END ORDER BY ord)
    FROM jsonb_array_elements(v_src) WITH ORDINALITY AS t(s, ord));

  v_dst := (SELECT jsonb_agg(
      CASE WHEN s->>'id' = v_target_id THEN s || v_payload ELSE s END ORDER BY ord)
    FROM jsonb_array_elements(v_dst) WITH ORDINALITY AS t(s, ord));

  IF v_src_is_home THEN
    v_slots := v_src; v_away := v_dst;
  ELSE
    v_away := v_src; v_slots := v_dst;
  END IF;
  UPDATE public.matches SET slots = v_slots, "awaySlots" = v_away WHERE id = p_match_id;

  IF v_occ IS NOT NULL THEN
    UPDATE public.match_participants SET role = p_target_side
     WHERE match_id = p_match_id AND user_id = v_occ;
  END IF;

  RETURN jsonb_build_object('ok', true, 'moved', true,
                            'fromSlot', p_slot_id, 'toSlot', v_target_id,
                            'side', p_target_side);
END;
$$;
REVOKE ALL ON FUNCTION public.player_move_slot_team(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.player_move_slot_team(uuid, text, text) TO authenticated;
