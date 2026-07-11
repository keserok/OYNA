-- PII sunucu taraflı maskeleme (Karar #39, Wave 10 ilk yarısı):
-- 1) admin_fetch_profiles artık email/phone'u MASKELİ döndürür — ham PII panel
--    network yanıtlarında taşınmaz. Arama ham kolonlar üzerinde çalışmaya
--    devam eder (tam e-postayla arama bulur, ekranda maskeli görünür).
--    Ham değer yalnız audit'li admin_reveal_pii ile alınır.
-- 2) admin_update_user_profile__core maskeli değer yazımını reddeder ('•'
--    içeren email/phone yok sayılır) — maskeli görüntünün kaydedilip gerçek
--    veriyi ezmesi imkânsız hale gelir.

CREATE OR REPLACE FUNCTION public.admin_fetch_profiles(
  p_offset integer DEFAULT 0, p_limit integer DEFAULT 500,
  p_search text DEFAULT NULL::text, p_status text DEFAULT NULL::text
)
 RETURNS TABLE(id uuid, full_name text, name text, email text, phone text, avatar_url text, role text, roles jsonb, rating numeric, match_count integer, is_verified boolean, is_banned boolean, is_pro boolean, wallet_balance numeric, ban_expires_at timestamp with time zone, created_at timestamp with time zone, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  RETURN QUERY
  SELECT
    p.id,
    p.full_name::text,
    p.name::text,
    CASE
      WHEN p.email IS NULL OR p.email = '' THEN p.email::text
      WHEN position('@' in p.email) = 0 THEN '•••'
      ELSE left(split_part(p.email, '@', 1), 2) || '•••@'
           || left(split_part(p.email, '@', 2), 1) || '•••'
           || CASE WHEN position('.' in split_part(p.email, '@', 2)) > 0
                   THEN '.' || split_part(split_part(p.email, '@', 2), '.', -1)
                   ELSE '' END
    END AS email,
    CASE
      WHEN p.phone IS NULL OR p.phone = '' THEN p.phone::text
      WHEN length(regexp_replace(p.phone, '\D', '', 'g')) < 6 THEN '•••'
      ELSE left(p.phone, 4) || ' ••• •• ' || right(regexp_replace(p.phone, '\D', '', 'g'), 2)
    END AS phone,
    p.avatar_url::text,
    p.role::text,
    p.roles,
    p.rating,
    p.match_count,
    p.is_verified,
    p.is_banned,
    p.is_pro,
    p.wallet_balance,
    p.ban_expires_at,
    COALESCE(p.created_at, p.join_date, NOW()) AS created_at,
    COUNT(*) OVER() AS total_count
  FROM public.profiles p
  WHERE
    (p_search IS NULL OR p_search = '' OR
      p.full_name ILIKE '%' || p_search || '%' OR
      p.name ILIKE '%' || p_search || '%' OR
      p.email ILIKE '%' || p_search || '%' OR
      p.role ILIKE '%' || p_search || '%' OR
      p.id::text ILIKE '%' || p_search || '%')
    AND (
      p_status IS NULL OR p_status = '' OR p_status = 'all' OR
      (p_status = 'banned' AND p.is_banned = true) OR
      (p_status = 'pro' AND p.is_pro = true) OR
      (p_status = 'active' AND COALESCE(p.is_banned, false) = false)
    )
  ORDER BY COALESCE(p.created_at, p.join_date) DESC NULLS LAST
  LIMIT GREATEST(p_limit, 1)
  OFFSET GREATEST(p_offset, 0);
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_fetch_profiles(integer, integer, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_fetch_profiles(integer, integer, text, text) TO authenticated;

-- Çekirdek güncellemesi (sarmalayıcı deseni gereği davranış __core'da değişir):
CREATE OR REPLACE FUNCTION public.admin_update_user_profile__core(p_user_id uuid, p_payload jsonb)
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
    -- Maskeli görüntü ('•' içeren) asla yazılmaz — gerçek veri korunur
    email = CASE WHEN p_payload ? 'email' AND position('•' in COALESCE(p_payload->>'email','')) = 0
                 THEN COALESCE(NULLIF(p_payload->>'email',''), email) ELSE email END,
    phone = CASE WHEN p_payload ? 'phone' AND position('•' in COALESCE(p_payload->>'phone','')) = 0
                 THEN COALESCE(NULLIF(p_payload->>'phone',''), phone) ELSE phone END,
    avatar_url = COALESCE(p_payload->>'avatar_url', avatar_url),
    role = COALESCE(p_payload->>'role', role),
    roles = CASE WHEN p_payload ? 'role' THEN jsonb_build_array(p_payload->>'role') ELSE roles END,
    is_verified = COALESCE((p_payload->>'is_verified')::boolean, is_verified),
    is_pro = COALESCE((p_payload->>'is_pro')::boolean, is_pro),
    wallet_balance = COALESCE((p_payload->>'wallet_balance')::numeric, wallet_balance),
    match_count = COALESCE((p_payload->>'match_count')::int, match_count),
    rating = COALESCE((p_payload->>'rating')::numeric, rating),
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
    COALESCE(v_old->>'email', p_user_id::text),
    v_old, p_payload
  );
  RETURN TRUE;
END;
$function$;
