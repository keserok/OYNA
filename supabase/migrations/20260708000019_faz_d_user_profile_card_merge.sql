-- FAZ D — admin_update_user_profile artık player_card'ı CLOBBER etmiyor (MERGE) +
-- card_tier ve card_active alanlarını da yönetiyor.
-- Sebep: önceki sürüm `player_card = COALESCE(p_payload->'player_card', player_card)`
-- ile tam değiştiriyordu → tüketicinin eklediği alanlar (position, fp, cardImage...)
-- silinme riski taşıyordu. jsonb MERGE (||) ile yalnız gönderilen alanlar güncellenir.
CREATE OR REPLACE FUNCTION public.admin_update_user_profile(p_user_id uuid, p_payload jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_old JSONB;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT to_jsonb(p.*) INTO v_old FROM public.profiles p WHERE id = p_user_id;
  IF v_old IS NULL THEN RAISE EXCEPTION 'Kullanıcı bulunamadı'; END IF;

  UPDATE public.profiles SET
    full_name = COALESCE(p_payload->>'full_name', full_name),
    email = COALESCE(p_payload->>'email', email),
    phone = COALESCE(p_payload->>'phone', phone),
    avatar_url = COALESCE(p_payload->>'avatar_url', avatar_url),
    role = COALESCE(p_payload->>'role', role),
    roles = CASE WHEN p_payload ? 'role' THEN jsonb_build_array(p_payload->>'role') ELSE roles END,
    is_verified = COALESCE((p_payload->>'is_verified')::boolean, is_verified),
    is_pro = COALESCE((p_payload->>'is_pro')::boolean, is_pro),
    wallet_balance = COALESCE((p_payload->>'wallet_balance')::numeric, wallet_balance),
    match_count = COALESCE((p_payload->>'match_count')::int, match_count),
    rating = COALESCE((p_payload->>'rating')::numeric, rating),
    -- MERGE: yalnız gönderilen kart alanları güncellenir, gerisi korunur
    player_card = CASE
      WHEN p_payload ? 'player_card' AND jsonb_typeof(p_payload->'player_card') = 'object'
      THEN COALESCE(player_card, '{}'::jsonb) || (p_payload->'player_card')
      ELSE player_card
    END,
    card_tier = COALESCE(NULLIF(p_payload->>'card_tier',''), card_tier),
    card_active = COALESCE((p_payload->>'card_active')::boolean, card_active),
    updated_at = NOW()
  WHERE id = p_user_id;

  PERFORM public.log_admin_action(
    'USER_UPDATE', 'user', p_user_id,
    COALESCE(p_payload->>'email', v_old->>'email'),
    v_old, p_payload
  );
  RETURN TRUE;
END;
$function$;
