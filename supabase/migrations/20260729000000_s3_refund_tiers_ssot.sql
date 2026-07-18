-- ════════════════════════════════════════════════════════════════════════════
-- [S3] İADE KADEMESİ TEK KAYNAK (_pitch_refund_tiers) + önizleme RPC
-- ────────────────────────────────────────────────────────────────────────────
-- İptal/iade kademesini (tam-iade saati, yarım-iade saati/yüzdesi) TEK yerden
-- okuyan helper. Tesis override (pitches.refund_*) varsa onu, yoksa global
-- settings'i döndürür. Hem _booking_cancel_quote (gerçek iade) hem
-- preview_pitch_refund_policy (ödeme ekranı + onay sayfası gösterimi) bunu
-- kullanır → gösterilen kademe ile uygulanan kademe ASLA ayrışmaz.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._pitch_refund_tiers(p_pitch_id uuid)
RETURNS TABLE (full_hours numeric, half_hours numeric, half_pct numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE s RECORD;
BEGIN
  SELECT COALESCE(booking_refund_full_hours,24) AS fh,
         COALESCE(booking_refund_half_hours,6)  AS hh,
         COALESCE(booking_refund_half_pct,50)   AS hp
    INTO s FROM public.settings LIMIT 1;
  full_hours := s.fh; half_hours := s.hh; half_pct := s.hp;
  IF p_pitch_id IS NOT NULL THEN
    SELECT COALESCE(p.refund_full_hours, s.fh),
           COALESCE(p.refund_half_hours, s.hh),
           COALESCE(p.refund_half_pct,   s.hp)
      INTO full_hours, half_hours, half_pct
    FROM public.pitches p WHERE p.id = p_pitch_id;
    IF NOT FOUND THEN full_hours := s.fh; half_hours := s.hh; half_pct := s.hp; END IF;
  END IF;
  RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION public._pitch_refund_tiers(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._pitch_refund_tiers(uuid) TO service_role;

-- _booking_cancel_quote artık kademeyi helper'dan alır (tek kaynak).
CREATE OR REPLACE FUNCTION public._booking_cancel_quote(p_paid numeric, p_start timestamp, p_pitch_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  t RECORD;
  v_now_tr timestamp := (now() AT TIME ZONE 'Europe/Istanbul');
  v_hours numeric; v_pct numeric; v_gross numeric; v_psp numeric; v_refund numeric;
BEGIN
  SELECT * INTO t FROM public._pitch_refund_tiers(p_pitch_id);
  v_hours := EXTRACT(EPOCH FROM (p_start - v_now_tr)) / 3600.0;
  v_pct := CASE WHEN v_hours >= t.full_hours THEN 100
                WHEN v_hours >= t.half_hours THEN t.half_pct
                ELSE 0 END;
  v_gross  := round(COALESCE(p_paid, 0) * v_pct / 100.0, 2);
  v_psp    := public._psp_fee(v_gross);
  v_refund := GREATEST(0, v_gross - v_psp);
  RETURN jsonb_build_object('pct', v_pct, 'gross', v_gross, 'psp', v_psp, 'refund', v_refund,
    'hours_left', round(v_hours, 2));
END;
$$;
REVOKE ALL ON FUNCTION public._booking_cancel_quote(numeric, timestamp, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._booking_cancel_quote(numeric, timestamp, uuid) TO service_role;

-- Ödemeden ÖNCE (booking yokken) tesisin iade kademesini gösterir.
CREATE OR REPLACE FUNCTION public.preview_pitch_refund_policy(p_pitch_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE t RECORD;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT * INTO t FROM public._pitch_refund_tiers(p_pitch_id);
  RETURN jsonb_build_object(
    'full_hours', t.full_hours, 'half_hours', t.half_hours, 'half_pct', t.half_pct,
    'is_custom', (p_pitch_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.pitches WHERE id = p_pitch_id
        AND (refund_full_hours IS NOT NULL OR refund_half_hours IS NOT NULL OR refund_half_pct IS NOT NULL)))
  );
END;
$$;
REVOKE ALL ON FUNCTION public.preview_pitch_refund_policy(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_pitch_refund_policy(uuid) TO authenticated, service_role;
