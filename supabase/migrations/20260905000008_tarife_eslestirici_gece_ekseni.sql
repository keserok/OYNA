-- ═══════════════════════════════════════════════════════════════════════════
-- TARİFE EŞLEŞTİRİCİ GECE EKSENİ (BULGU-8, 17 Ağu 2026 canlı testi)
--
-- NE BOZUKTU: get_current_tariff_price (rezervasyon ve maç fiyatlamasının
-- tek tarife eşleştiricisi) pencere kıyasını düz saatle yapıyordu:
--   p_start_time >= t.start_time AND (p_start_time < t.end_time OR end=00:00)
-- Gece yarısını aşan pencerede (08:00→02:00) bu kıyas AKŞAM saatlerini bile
-- bulamaz: 21:00 < 02:00 yanlış → NO_TARIFF. Canlı testte ızgaranın
-- gösterdiği 21:00 dilimi rezerve edilemedi (vitrin evet, kasa hayır — ekran
-- ile sunucunun ayrıştığı sınıf, kural 2.9).
--
-- ÇÖZÜM: Eşleştirici, ızgara motoru get_pitch_slots'un eksen matematiğinin
-- birebir aynasına geçirilir:
--   • pencere: end=00:00 → 1440 · end≤start → end+1440 · değilse düz;
--   • dilim: saat < 06:00 → +1440 (önceki akşamın devamı — ızgara/istemci
--     "grid günü" sözleşmesiyle tarih AYNI kalır, yalnız dakika kayar).
-- Böylece 08:00→02:00 penceresinde hem 21:00 hem 01:00 doğru fiyat bulur.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_current_tariff_price(
  p_pitch_id uuid, p_booking_date date, p_start_time time without time zone,
  p_court_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(tariff_id uuid, price numeric, deposit numeric,
              slot_minutes integer, window_start time without time zone)
LANGUAGE plpgsql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_dow int;
  v_slot_dk int;
BEGIN
  v_dow := EXTRACT(ISODOW FROM p_booking_date);
  -- Gece ekseni: 06:00 öncesi, aynı "grid gününün" akşam uzantısıdır.
  v_slot_dk := (EXTRACT(HOUR FROM p_start_time) * 60
                + EXTRACT(MINUTE FROM p_start_time))::int;
  IF v_slot_dk < 360 THEN
    v_slot_dk := v_slot_dk + 1440;
  END IF;

  RETURN QUERY
  SELECT t.id, t.slot_price, t.deposit_amount, t.slot_minutes, t.start_time
  FROM public.pitch_tariffs t
  CROSS JOIN LATERAL (
    SELECT (EXTRACT(HOUR FROM t.start_time) * 60
            + EXTRACT(MINUTE FROM t.start_time))::int AS bas_dk,
           CASE
             WHEN t.end_time = TIME '00:00' THEN 1440
             WHEN t.end_time <= t.start_time
               THEN (EXTRACT(HOUR FROM t.end_time) * 60
                     + EXTRACT(MINUTE FROM t.end_time))::int + 1440
             ELSE (EXTRACT(HOUR FROM t.end_time) * 60
                   + EXTRACT(MINUTE FROM t.end_time))::int
           END AS bit_dk
  ) e
  WHERE t.pitch_id = p_pitch_id
    AND COALESCE(t.is_active, true) = true
    AND v_dow = ANY(t.applies_to_days)
    AND v_slot_dk >= e.bas_dk
    AND v_slot_dk <  e.bit_dk
    AND (t.court_id IS NULL OR t.court_id = p_court_id)
    AND (t.valid_on IS NULL OR t.valid_on = p_booking_date)
  ORDER BY
    CASE WHEN t.valid_on IS NOT NULL THEN 0 ELSE 1 END,
    CASE WHEN t.court_id IS NOT NULL AND t.court_id = p_court_id THEN 0 ELSE 1 END,
    CASE t.tariff_type WHEN 'HOLIDAY' THEN 1 WHEN 'WEEKEND' THEN 2 WHEN 'WEEKDAY' THEN 3 ELSE 4 END,
    t.id
  LIMIT 1;
END;
$function$;

-- ── KENDİNİ DOĞRULAMA: kendi geçici tarifesiyle uçtan uca ─────────────────
DO $$
DECLARE
  v_pitch uuid; v_court uuid;
  v_tid uuid := '00000000-dead-4bee-8f00-000000000005';
  v_p1 numeric; v_p2 numeric; v_p3 numeric;
BEGIN
  SELECT s.id, c.id INTO v_pitch, v_court
  FROM public.pitches s JOIN public.courts c ON c.pitch_id = s.id
  WHERE s.is_demo LIMIT 1;
  IF v_pitch IS NULL THEN
    RAISE EXCEPTION 'DOĞRULAMA: demo saha yok — kanıt kurulamadı';
  END IF;

  INSERT INTO public.pitch_tariffs (id, pitch_id, court_id, name, tariff_type,
    applies_to_days, start_time, end_time, slot_price, deposit_amount, slot_minutes, is_active)
  VALUES (v_tid, v_pitch, v_court, '_eksen_kaniti', 'WEEKDAY',
    '{1,2,3,4,5,6,7}', '20:00', '02:00', 777, 77, 60, true);

  -- Akşam saati (21:00) pencereyi bulmalı
  SELECT g.price INTO v_p1
  FROM public.get_current_tariff_price(v_pitch, current_date + 1, '21:00', v_court) g;
  -- Gece uzantısı (01:00) aynı pencereyi bulmalı
  SELECT g.price INTO v_p2
  FROM public.get_current_tariff_price(v_pitch, current_date + 1, '01:00', v_court) g;
  -- Pencere dışı (19:00) bu tarifeyi BULMAMALI
  SELECT g.price INTO v_p3
  FROM public.get_current_tariff_price(v_pitch, current_date + 1, '19:00', v_court) g;

  DELETE FROM public.pitch_tariffs WHERE id = v_tid;

  IF v_p1 IS DISTINCT FROM 777 THEN
    RAISE EXCEPTION 'DOĞRULAMA: 21:00 gece penceresini bulamadı (%)', v_p1;
  END IF;
  IF v_p2 IS DISTINCT FROM 777 THEN
    RAISE EXCEPTION 'DOĞRULAMA: 01:00 gece uzantısını bulamadı (%)', v_p2;
  END IF;
  IF v_p3 IS NOT DISTINCT FROM 777 THEN
    RAISE EXCEPTION 'DOĞRULAMA: 19:00 pencere DIŞIyken 777 buldu — eksen kaymış';
  END IF;

  RAISE NOTICE 'DOĞRULAMA TAMAM: eşleştirici gece ekseninde (21:00 ✓, 01:00 ✓, 19:00 dışarıda ✓).';
END $$;
