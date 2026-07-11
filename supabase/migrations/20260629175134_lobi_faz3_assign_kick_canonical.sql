-- LOBİ FAZ 3 — Admin atama/çıkarma artık GERÇEK katılımla birebir + statü yeniden hesabı.
-- Kök neden (canlı doğrulandı): match_fill_stats yalnız player.paymentStatus='PAID' sayar;
-- admin_assign_to_slot bunu (ve userId'yi) yazmadığı için paid_ratio=0 → process_match_at_deadline
-- quorum'u geçemez → maç CANCELLED. Ayrıca _admin_patch_slot 'elem || patch' (sığ-merge) olduğu
-- için kick {status:OPEN,player:null} yazsa bile bayat userId/purchasedBy/occupant slotta asılı kalır.

-- 1) ATAMA: kanonik slot şekli (userId + player{...paymentStatus:'PAID', x,y,position} + assignmentStatus:'ADMIN')
CREATE OR REPLACE FUNCTION public.admin_assign_to_slot(
  p_match_id uuid, p_slot_id text, p_user_id uuid, p_is_away boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_slots JSONB; v_updated JSONB; v_elem JSONB; v_player JSONB; v_patch JSONB;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT jsonb_build_object(
    'id', p.id, 'name', COALESCE(p.full_name, p.email),
    'avatar', p.avatar_url, 'rating', COALESCE(p.rating, 5.0)
  ) INTO v_player FROM public.profiles p WHERE id = p_user_id;
  IF v_player IS NULL THEN RAISE EXCEPTION 'Kullanıcı bulunamadı'; END IF;

  IF p_is_away THEN
    SELECT "awaySlots" INTO v_slots FROM public.matches WHERE id = p_match_id FOR UPDATE;
  ELSE
    SELECT slots INTO v_slots FROM public.matches WHERE id = p_match_id FOR UPDATE;
  END IF;

  SELECT elem INTO v_elem FROM jsonb_array_elements(COALESCE(v_slots,'[]'::jsonb)) elem WHERE elem->>'id' = p_slot_id;
  IF v_elem IS NULL THEN RAISE EXCEPTION 'Slot bulunamadı'; END IF;

  -- player: tüketici join_public_match_slot ile alan-alan aynı + paymentStatus:'PAID' (admin = ödenmiş gerçek katılım)
  v_player := v_player || jsonb_build_object(
    'position', COALESCE(v_elem->>'role','OYUNCU'),
    'x', v_elem->'x', 'y', v_elem->'y',
    'paymentStatus', 'PAID'
  );
  -- üst seviye userId (seed/admin kimlik uyumu) + assignmentStatus izlenebilirliği
  v_patch := jsonb_build_object('status','TAKEN','userId',p_user_id,'player',v_player,'assignmentStatus','ADMIN');
  v_updated := public._admin_patch_slot(v_slots, p_slot_id, v_patch);

  IF p_is_away THEN
    UPDATE public.matches SET "awaySlots" = v_updated WHERE id = p_match_id;
  ELSE
    UPDATE public.matches SET slots = v_updated WHERE id = p_match_id;
  END IF;

  PERFORM public.log_admin_action('MATCH_ASSIGN_SLOT', 'match', p_match_id, p_user_id::text, NULL,
    jsonb_build_object('slot_id', p_slot_id, 'is_away', p_is_away, 'paymentStatus','PAID'));
  PERFORM public.admin_recompute_match_status(p_match_id);
  RETURN v_updated;
END;
$function$;

-- 2) ÇIKARMA: bayat anahtarları GERÇEKTEN sil (sığ-merge yetersizdi) → {id,role?,x?,y?,status:'OPEN'}
CREATE OR REPLACE FUNCTION public.admin_kick_from_slot(
  p_match_id uuid, p_slot_id text, p_is_away boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_slots JSONB; v_updated JSONB;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_is_away THEN
    SELECT "awaySlots" INTO v_slots FROM public.matches WHERE id = p_match_id FOR UPDATE;
  ELSE
    SELECT slots INTO v_slots FROM public.matches WHERE id = p_match_id FOR UPDATE;
  END IF;

  SELECT COALESCE(jsonb_agg(
    CASE WHEN elem->>'id' = p_slot_id
      THEN (elem - 'userId' - 'player' - 'purchasedBy' - 'occupant' - 'assignmentStatus')
           || jsonb_build_object('status','OPEN')
      ELSE elem END
  ), '[]'::jsonb)
  INTO v_updated
  FROM jsonb_array_elements(COALESCE(v_slots,'[]'::jsonb)) AS elem;

  IF p_is_away THEN
    UPDATE public.matches SET "awaySlots" = v_updated WHERE id = p_match_id;
  ELSE
    UPDATE public.matches SET slots = v_updated WHERE id = p_match_id;
  END IF;

  PERFORM public.log_admin_action('MATCH_KICK_SLOT', 'match', p_match_id, p_slot_id, NULL,
    jsonb_build_object('is_away', p_is_away));
  PERFORM public.admin_recompute_match_status(p_match_id);
  RETURN v_updated;
END;
$function$;

-- 3) STATÜ YENİDEN HESABI: kadro tamamen dolu+ödenmiş ise LIVE'a YÜKSELT (yalnız ileri yön).
--    CANCELLED/COMPLETED'a dokunmaz; düşürme yapmaz. CONFIRMED/quorum kararı deadline job'ında kalır
--    (finansal yan etki üretmemek için). Bu RPC anlık "doldu → canlı" geri bildirimi sağlar.
CREATE OR REPLACE FUNCTION public.admin_recompute_match_status(p_match_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_status TEXT; v_stats JSONB; v_total int; v_taken int; v_paid int;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT status INTO v_status FROM public.matches WHERE id = p_match_id;
  IF v_status IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_status IN ('CANCELLED','COMPLETED') THEN RETURN v_status; END IF;

  v_stats := public.match_fill_stats(p_match_id);
  v_total := (v_stats->>'total')::int; v_taken := (v_stats->>'taken')::int; v_paid := (v_stats->>'paid')::int;

  IF v_total > 0 AND v_taken = v_total AND v_paid = v_total AND v_status <> 'LIVE' THEN
    UPDATE public.matches SET status = 'LIVE' WHERE id = p_match_id;
    PERFORM public.log_admin_action('MATCH_STATUS_RECOMPUTE','match',p_match_id,NULL,
      to_jsonb(v_status), jsonb_build_object('status','LIVE','stats',v_stats));
    RETURN 'LIVE';
  END IF;
  RETURN v_status;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_recompute_match_status(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_recompute_match_status(uuid) TO authenticated;
