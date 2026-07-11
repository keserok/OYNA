-- [DB GEÇMİŞİNDEN KURTARILDI 2026-07-11] Bu migration canlı veritabanına uygulanmıştı ancak repoda dosyası yoktu; supabase_migrations.schema_migrations.statements kolonundan geri çıkarıldı.

CREATE OR REPLACE FUNCTION public.admin_fetch_matches(
  p_search text DEFAULT NULL::text,
  p_status text DEFAULT NULL::text,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid, title text, location text, date text, "time" text, price numeric,
  difficulty text, status text, format text, image text, "minRating" numeric,
  badges jsonb, "missingPositions" jsonb, slots jsonb, away_slots jsonb,
  "refereeId" uuid, "creatorId" uuid, "isDemo" boolean, cancel_reason text,
  refund_status text, created_at timestamp with time zone,
  starts_at timestamp with time zone, visibility text, pitch_id uuid,
  confirmed_at timestamp with time zone, is_successful boolean,
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
    m.id, m.title, m.location, m.date, m."time",
    COALESCE(m.price, 0)::numeric AS price,
    m.difficulty, m.status, m.format, m.image, m."minRating",
    m.badges, m."missingPositions", m.slots,
    COALESCE(m."awaySlots", '[]'::jsonb) AS away_slots,
    m."refereeId" AS "refereeId",
    COALESCE(m."creatorId", m.captain_id) AS "creatorId",
    COALESCE(m."isDemo", false) AS "isDemo",
    m.cancel_reason, m.refund_status, m.created_at,
    m.starts_at, m.visibility, m.pitch_id, m.confirmed_at, m.is_successful,
    COUNT(*) OVER() AS total_count
  FROM public.matches m
  WHERE (
    p_search IS NULL OR p_search = '' OR
    m.title ILIKE '%' || p_search || '%' OR
    m.location ILIKE '%' || p_search || '%' OR
    m.id::text ILIKE '%' || p_search || '%'
  )
  AND (
    p_status IS NULL OR p_status = '' OR p_status = 'ALL' OR
    m.status ILIKE p_status OR
    (p_status = 'ACTIVE' AND m.status IN ('ACTIVE', 'OPEN', 'CONFIRMED')) OR
    (p_status = 'DRAFT' AND m.status IN ('DRAFT', 'OPEN'))
  )
  ORDER BY m.created_at DESC NULLS LAST, m.starts_at DESC NULLS LAST
  LIMIT GREATEST(p_limit, 1)
  OFFSET GREATEST(p_offset, 0);
END;
$function$;
