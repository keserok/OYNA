-- ============================================================================
-- TARİH-ÖZEL TARİFE (takvimden girilen özel fiyat) — valid_on
-- ----------------------------------------------------------------------------
-- Sorun 1: SPECIAL tarife öncelik sırasında EN SONDAYDI (HOLIDAY>WEEKEND>
--   WEEKDAY>ELSE). Aynı saati kapsayan standart tarife varken özel fiyat hiçbir
--   zaman uygulanmıyordu: oyuncu standart fiyatı görüyor ve ödüyordu.
-- Sorun 2: Özel fiyat haftanın gününe (applies_to_days) yazılıyordu — tek bir
--   tarih için girilen fiyat aslında her hafta o gün tekrar edecekti.
--
-- Çözüm: pitch_tariffs.valid_on (date). Dolu ise tarife YALNIZ o tarihte
-- geçerlidir ve o tarihte diğer tüm tarifelere üstün gelir. İstemci tarafı
-- (tariffService.resolveTariffForSlot, ownerCalendarHelpers.resolveHourlyPrice)
-- aynı önceliği uygular: oyuncunun gördüğü fiyat = rezervasyon fiyatı = ödeme.
-- ============================================================================

ALTER TABLE public.pitch_tariffs ADD COLUMN IF NOT EXISTS valid_on date;

COMMENT ON COLUMN public.pitch_tariffs.valid_on IS
  'Dolu ise tarife yalnız bu tarihte geçerlidir ve o tarihte en yüksek önceliğe sahiptir (takvimden girilen özel fiyat). NULL = süresiz/haftalık tarife.';

-- Eski SPECIAL kayıtları adlarındaki tarihten backfill edilir
-- (upsertSpecialSlotTariff adı "Özel YYYY-MM-DD HH:MM" formatında yazıyordu).
UPDATE public.pitch_tariffs
SET valid_on = (substring(name FROM '\d{4}-\d{2}-\d{2}'))::date
WHERE tariff_type = 'SPECIAL'
  AND valid_on IS NULL
  AND name ~ '\d{4}-\d{2}-\d{2}';

-- Tarife çözümü: tarih-özel satır en yüksek öncelik + yalnız kendi tarihinde.
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
    -- Tarih-özel tarife yalnız kendi tarihinde adaydır.
    AND (t.valid_on IS NULL OR t.valid_on = p_booking_date)
  ORDER BY
    -- 1) Tarih-özel (takvimden girilen özel fiyat) her şeye üstün gelir.
    CASE WHEN t.valid_on IS NOT NULL THEN 0 ELSE 1 END,
    -- 2) Saha-özel tarife tesis-geneline üstün gelir.
    CASE WHEN t.court_id IS NOT NULL AND t.court_id = p_court_id THEN 0 ELSE 1 END,
    -- 3) Tarife tipi önceliği.
    CASE t.tariff_type WHEN 'HOLIDAY' THEN 1 WHEN 'WEEKEND' THEN 2 WHEN 'WEEKDAY' THEN 3 ELSE 4 END,
    t.id
  LIMIT 1;
END;
$function$;

-- owner_replace_tariffs artık valid_on taşır (yoksa NULL).
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
    price_per_hour, deposit_amount, sort_order, is_active, court_id, valid_on
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
    NULLIF(t->>'court_id', '')::uuid,
    NULLIF(t->>'valid_on', '')::date
  FROM jsonb_array_elements(COALESCE(p_tariffs, '[]'::jsonb)) AS t;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;
