-- ==============================================================================
-- OW-E / OP-P1-8 (P4) — Çok-kort tesis takvimi: get_facility_schedule RPC
-- ------------------------------------------------------------------------------
-- Tesis takvimi (GÜN/TESİS/HAFTA) için TEK kaynak. Ham varlık listelerini döner
-- (kortlar + rezervasyonlar + kapanışlar + canlı hold'lar); saat-ızgara birleştirme
-- istemcide saf facilityScheduleModel'de yapılır (840 slot objesi yerine ~50 kayıt).
-- Yetki: tesis sahibi / admin (personel ileride is_pitch_staff ile eklenir).
-- Pencere ≤ 31 gün. Kişisel veri: müşteri adı/telefon YALNIZ yetkili owner/admin'e
-- döner (RPC zaten owner/admin kapılı).
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.get_facility_schedule(
  p_pitch_id uuid,
  p_from     date,
  p_to       date
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_owner boolean;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN
    RAISE EXCEPTION 'INVALID_RANGE';
  END IF;
  IF (p_to - p_from) > 31 THEN
    RAISE EXCEPTION 'RANGE_TOO_WIDE: en fazla 31 gunluk pencere.';
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.pitches WHERE id = p_pitch_id AND owner_id = v_uid)
    INTO v_is_owner;
  IF NOT (v_is_owner OR public.is_admin()) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: bu tesise erisim yok.';
  END IF;

  SELECT jsonb_build_object(
    'pitch', (SELECT jsonb_build_object(
                'id', p.id, 'name', p.name,
                'working_hours', p.working_hours,
                'auto_approve_enabled', COALESCE(p.auto_approve_enabled, true),
                'auto_approve_minutes', COALESCE(p.auto_approve_minutes, 35))
              FROM public.pitches p WHERE p.id = p_pitch_id),

    'courts', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                'id', c.id, 'name', c.name, 'court_type', c.court_type)
                ORDER BY c.name)
              FROM public.courts c
              WHERE c.pitch_id = p_pitch_id AND c.is_active IS NOT FALSE), '[]'::jsonb),

    'bookings', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                  'id', b.id, 'court_id', b.court_id, 'booking_date', b.booking_date,
                  'start_time', to_char(b.start_time,'HH24:MI'),
                  'end_time', to_char(b.end_time,'HH24:MI'),
                  'status', b.status, 'source', b.source,
                  'price', b.price, 'paid_amount', b.paid_amount,
                  'payment_status', b.payment_status,
                  'customer_name', b.customer_name, 'customer_phone', b.customer_phone,
                  'title', b.title))
                FROM public.pitch_bookings b
                WHERE b.pitch_id = p_pitch_id
                  AND b.booking_date BETWEEN p_from AND p_to
                  AND b.status <> 'CANCELLED'), '[]'::jsonb),

    -- Kapanışlar: tarih-aralığındaki tek-seferlikler + TÜM tekrarlayanlar (istemci
    -- day_of_week ile pencereye açar). court_id null = tesis geneli.
    'closures', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                  'id', e.id, 'court_id', e.court_id,
                  'is_recurring', COALESCE(e.is_recurring, false),
                  'exception_date', e.exception_date,
                  'day_of_week', e.day_of_week,
                  'start_time', CASE WHEN e.start_time IS NULL THEN NULL ELSE to_char(e.start_time,'HH24:MI') END,
                  'end_time', CASE WHEN e.end_time IS NULL THEN NULL ELSE to_char(e.end_time,'HH24:MI') END,
                  'reason', e.reason))
                FROM public.pitch_availability_exceptions e
                WHERE e.pitch_id = p_pitch_id
                  AND (
                    (COALESCE(e.is_recurring,false) = false AND e.exception_date BETWEEN p_from AND p_to)
                    OR COALESCE(e.is_recurring,false) = true
                  )), '[]'::jsonb),

    -- Canlı hold'lar (oyuncu tam alırken): süresi geçmemiş.
    'holds', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                'court_id', h.court_id, 'booking_date', h.booking_date,
                'start_time', to_char(h.start_time,'HH24:MI'),
                'is_mine', (h.held_by = v_uid)))
              FROM public.pitch_slot_holds h
              WHERE h.pitch_id = p_pitch_id
                AND h.booking_date BETWEEN p_from AND p_to
                AND h.expires_at > now()), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_facility_schedule(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_facility_schedule(uuid, date, date) TO authenticated;
