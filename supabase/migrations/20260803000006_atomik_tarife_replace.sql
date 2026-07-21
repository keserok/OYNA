-- ============================================================================
-- ATOMİK TARİFE DEĞİŞİMİ + is_active TUTARLILIĞI (Faz 1 review düzeltmeleri)
--  * owner_replace_tariffs: DELETE+INSERT'i TEK transaction'da yapar. Eski
--    istemci-tarafı saveTariffs (ayrı delete + insert) DELETE başarılı +
--    INSERT başarısız olursa tesisin TÜM tarifelerini (her saha + SPECIAL)
--    silebiliyordu (adversaryal review medium bulgusu). RPC ile atomik.
--  * get_current_tariff_price: is_active NULL asimetrisi — istemci NULL'ı aktif
--    sayarken sunucu eliyordu (gösterilen ≠ tahsil). COALESCE(is_active,true)
--    ile hizalanır (kolon default true; app her zaman açık yazar).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.owner_replace_tariffs(p_pitch_id uuid, p_tariffs jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_count integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED: Giris gerekli.'; END IF;
  IF NOT public.can_manage_pitch(p_pitch_id) THEN RAISE EXCEPTION 'UNAUTHORIZED: yetki yok.'; END IF;

  DELETE FROM public.pitch_tariffs WHERE pitch_id = p_pitch_id;

  INSERT INTO public.pitch_tariffs (
    pitch_id, name, tariff_type, applies_to_days, start_time, end_time,
    price_per_hour, deposit_amount, sort_order, is_active, court_id
  )
  SELECT
    p_pitch_id,
    t->>'name',
    COALESCE(t->>'tariff_type', 'WEEKDAY'),
    COALESCE((SELECT array_agg(x::int) FROM jsonb_array_elements_text(t->'applies_to_days') AS x), ARRAY[1,2,3,4,5]),
    (t->>'start_time')::time,
    (t->>'end_time')::time,
    COALESCE((t->>'price_per_hour')::numeric, 0),
    COALESCE((t->>'deposit_amount')::numeric, 0),
    COALESCE((t->>'sort_order')::int, 0),
    COALESCE((t->>'is_active')::boolean, true),
    NULLIF(t->>'court_id', '')::uuid
  FROM jsonb_array_elements(COALESCE(p_tariffs, '[]'::jsonb)) AS t;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.owner_replace_tariffs(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_replace_tariffs(uuid, jsonb) TO authenticated;

-- get_current_tariff_price: is_active NULL'ı aktif say (istemci ile birebir).
CREATE OR REPLACE FUNCTION public.get_current_tariff_price(
  p_pitch_id uuid,
  p_booking_date date,
  p_start_time time without time zone,
  p_court_id uuid DEFAULT NULL
)
RETURNS TABLE(tariff_id uuid, price numeric, deposit numeric)
LANGUAGE plpgsql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_dow INTEGER;
BEGIN
  v_dow := EXTRACT(ISODOW FROM p_booking_date);
  RETURN QUERY
  SELECT t.id, t.price_per_hour, t.deposit_amount
  FROM public.pitch_tariffs t
  WHERE t.pitch_id = p_pitch_id
    AND COALESCE(t.is_active, true) = true
    AND v_dow = ANY(t.applies_to_days)
    AND p_start_time >= t.start_time
    AND (p_start_time < t.end_time OR t.end_time = '00:00:00')
    AND (t.court_id IS NULL OR t.court_id = p_court_id)
  ORDER BY
    CASE WHEN t.court_id IS NOT NULL AND t.court_id = p_court_id THEN 0 ELSE 1 END,
    CASE t.tariff_type WHEN 'HOLIDAY' THEN 1 WHEN 'WEEKEND' THEN 2 WHEN 'WEEKDAY' THEN 3 ELSE 4 END,
    t.id
  LIMIT 1;
END;
$function$;
