-- LOBİ FAZ 4 — İki slotun oyuncusunu ATOMİK yer değiştir (taşı/değiştir).
-- Slotun KONUM kimliği (id, role, x, y) yerinde kalır; yalnız OYUNCU verisi
-- (status, userId, player, assignmentStatus, purchasedBy, occupant) takas edilir.
-- Aynı taraf içinde (ev/ev veya deplasman/deplasman). Sonunda statü yeniden hesaplanır.
CREATE OR REPLACE FUNCTION public.admin_swap_slots(
  p_match_id uuid, p_slot_a text, p_slot_b text, p_is_away boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_slots JSONB; v_a JSONB; v_b JSONB; v_pos_a JSONB; v_pos_b JSONB; v_occ_a JSONB; v_occ_b JSONB;
  v_new_a JSONB; v_new_b JSONB; v_updated JSONB;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_slot_a = p_slot_b THEN RAISE EXCEPTION 'Aynı slot'; END IF;

  IF p_is_away THEN
    SELECT "awaySlots" INTO v_slots FROM public.matches WHERE id = p_match_id FOR UPDATE;
  ELSE
    SELECT slots INTO v_slots FROM public.matches WHERE id = p_match_id FOR UPDATE;
  END IF;

  SELECT elem INTO v_a FROM jsonb_array_elements(COALESCE(v_slots,'[]'::jsonb)) elem WHERE elem->>'id' = p_slot_a;
  SELECT elem INTO v_b FROM jsonb_array_elements(COALESCE(v_slots,'[]'::jsonb)) elem WHERE elem->>'id' = p_slot_b;
  IF v_a IS NULL OR v_b IS NULL THEN RAISE EXCEPTION 'Slot bulunamadı'; END IF;

  -- konum (id/role/x/y vb.) = oyuncu anahtarları çıkarılmış hali
  v_pos_a := v_a - 'status' - 'userId' - 'player' - 'assignmentStatus' - 'purchasedBy' - 'occupant';
  v_pos_b := v_b - 'status' - 'userId' - 'player' - 'assignmentStatus' - 'purchasedBy' - 'occupant';
  -- oyuncu verisi = konum anahtarları çıkarılmış hali
  v_occ_a := v_a - 'id' - 'role' - 'x' - 'y';
  v_occ_b := v_b - 'id' - 'role' - 'x' - 'y';

  v_new_a := v_pos_a || v_occ_b;
  v_new_a := v_new_a || jsonb_build_object('status', COALESCE(v_new_a->>'status','OPEN'));
  v_new_b := v_pos_b || v_occ_a;
  v_new_b := v_new_b || jsonb_build_object('status', COALESCE(v_new_b->>'status','OPEN'));

  SELECT COALESCE(jsonb_agg(
    CASE WHEN elem->>'id' = p_slot_a THEN v_new_a
         WHEN elem->>'id' = p_slot_b THEN v_new_b
         ELSE elem END
  ), '[]'::jsonb)
  INTO v_updated
  FROM jsonb_array_elements(COALESCE(v_slots,'[]'::jsonb)) AS elem;

  IF p_is_away THEN
    UPDATE public.matches SET "awaySlots" = v_updated WHERE id = p_match_id;
  ELSE
    UPDATE public.matches SET slots = v_updated WHERE id = p_match_id;
  END IF;

  PERFORM public.log_admin_action('MATCH_SWAP_SLOTS', 'match', p_match_id, NULL, NULL,
    jsonb_build_object('slot_a', p_slot_a, 'slot_b', p_slot_b, 'is_away', p_is_away));
  PERFORM public.admin_recompute_match_status(p_match_id);
  RETURN v_updated;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_swap_slots(uuid, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_swap_slots(uuid, text, text, boolean) TO authenticated;
