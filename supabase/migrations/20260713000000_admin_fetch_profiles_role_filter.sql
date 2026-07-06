-- ============================================================================
-- admin_fetch_profiles — ROL filtresi (p_role) eklendi
-- ----------------------------------------------------------------------------
-- Admin panel "Kullanıcılar" listesine rol filtreleri (Oyuncu/Saha Sahibi/
-- Kaleci/Hakem) eklendi. Filtreleme, statü filtresi gibi SUNUCU tarafında yapılır
-- (sayfalama doğru kalsın diye). p_role verilmezse davranış eskisiyle aynıdır.
--
-- Not: 4 argümanlı eski sürüm DROP edilir; 5 argümanlı sürüm eklenir. Tüm
-- parametreler DEFAULT'lu olduğundan iki imza bir arada dursaydı 4-argümanlı
-- çağrılar "function is not unique" hatası verirdi.
-- ============================================================================

DROP FUNCTION IF EXISTS public.admin_fetch_profiles(integer, integer, text, text);

CREATE OR REPLACE FUNCTION public.admin_fetch_profiles(
  p_offset integer DEFAULT 0,
  p_limit integer DEFAULT 500,
  p_search text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_role text DEFAULT NULL
)
RETURNS TABLE(
  id uuid, full_name text, name text, email text, phone text, avatar_url text,
  role text, roles jsonb, rating numeric, match_count integer, is_verified boolean,
  is_banned boolean, is_pro boolean, wallet_balance numeric,
  ban_expires_at timestamp with time zone, created_at timestamp with time zone,
  total_count bigint
)
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
    -- Rol filtresi: BİRİNCİL role göre (temiz, örtüşmeyen kovalar). roles[] dizisi
    -- kullanılsaydı herkes PLAYER içerdiği için "Oyuncu" tümünü döndürürdü.
    AND (
      p_role IS NULL OR p_role = '' OR p_role = 'all' OR p.role = p_role
    )
  ORDER BY COALESCE(p.created_at, p.join_date) DESC NULLS LAST
  LIMIT GREATEST(p_limit, 1)
  OFFSET GREATEST(p_offset, 0);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_fetch_profiles(integer, integer, text, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_fetch_profiles(integer, integer, text, text, text) FROM anon;
