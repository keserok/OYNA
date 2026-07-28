-- ÜRETİMDEN GERİ ÇEKİLDİ (defter sapması onarımı, 2026-07-28)
-- _resolve_court_quote: atanmamış RECORD erişimi düzeltmesi (skalerlere geçiş)
CREATE OR REPLACE FUNCTION public._resolve_court_quote(
  p_court_id uuid, p_date date, p_start_time time without time zone
) RETURNS TABLE(total numeric, deposit numeric, tariff_id uuid, deal_id uuid, base_price numeric)
LANGUAGE plpgsql STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pitch uuid;
  v_flash boolean;
  v_tid uuid; v_price numeric; v_dep numeric;
  v_deal_id uuid; v_deal_price numeric;
BEGIN
  SELECT c.pitch_id, COALESCE(p.flash_deals_enabled, false)
    INTO v_pitch, v_flash
  FROM public.courts c JOIN public.pitches p ON p.id = c.pitch_id
  WHERE c.id = p_court_id;
  IF v_pitch IS NULL THEN RETURN; END IF;

  SELECT t.tariff_id, t.price, t.deposit INTO v_tid, v_price, v_dep
  FROM public.get_current_tariff_price(v_pitch, p_date, p_start_time, p_court_id) t;

  IF v_flash THEN
    SELECT fd.id, fd.deal_price INTO v_deal_id, v_deal_price
    FROM public.pitch_flash_deals fd
    WHERE fd.pitch_id = v_pitch
      AND (fd.court_id = p_court_id OR fd.court_id IS NULL)
      AND fd.booking_date = p_date
      AND fd.start_time = p_start_time
      AND NOT COALESCE(fd.is_claimed, false)
      AND (fd.expires_at IS NULL OR fd.expires_at > now())
    ORDER BY (fd.court_id IS NOT NULL) DESC, fd.created_at DESC
    LIMIT 1;
  END IF;

  total      := COALESCE(v_deal_price, v_price);
  base_price := v_price;
  tariff_id  := v_tid;
  deal_id    := v_deal_id;
  deposit    := CASE WHEN COALESCE(v_dep, 0) > 0 THEN v_dep
                     ELSE CEIL(COALESCE(total, 0) * 0.20) END;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public._resolve_court_quote(uuid, date, time) FROM PUBLIC, anon, authenticated;
