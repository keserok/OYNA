-- ============================================================
-- FAZ 8 — Promo kodu sunucu-tarafı doğrulama + atomik tüketim (BL-07)
--
-- Tespit: promo_redemptions tablosu + UNIQUE(promo_id,user_id) var ama indirimi
-- SUNUCUDA hesaplayıp tüketen RPC YOK → istemci kendi "indirimli fiyatını"
-- gönderebiliyor (yalnız admin_create/delete/set_active promo fonksiyonları mevcut).
-- Çözüm: redeem_promo — kodu doğrula, indirimi hesapla, redemption'ı atomik tüket.
-- ÖDEME TUTARI HER ZAMAN dönen final_amount'tan alınmalı; istemci fiyatına güvenilmemeli.
--
-- Doğrulanmış şema: promo_codes(code, discount_type, discount_value, max_redemptions,
--   redemption_count, valid_from, valid_until, is_active);
--   promo_redemptions(promo_id, user_id, redeemed_at) UNIQUE(promo_id,user_id).
-- ============================================================

CREATE OR REPLACE FUNCTION public.redeem_promo(p_code text, p_base_amount numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  c      public.promo_codes;
  v_used int;
  v_disc numeric;
  v_final numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_base_amount IS NULL OR p_base_amount < 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;

  SELECT * INTO c FROM public.promo_codes
  WHERE code = upper(trim(p_code))
    AND is_active
    AND (valid_from  IS NULL OR valid_from  <= now())
    AND (valid_until IS NULL OR valid_until >  now())
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_PROMO: Kod gecersiz veya suresi dolmus.'; END IF;

  IF c.max_redemptions IS NOT NULL THEN
    SELECT count(*) INTO v_used FROM public.promo_redemptions WHERE promo_id = c.id;
    IF v_used >= c.max_redemptions THEN RAISE EXCEPTION 'PROMO_EXHAUSTED: Kod kullanim limiti dolmus.'; END IF;
  END IF;

  -- Tek kullanım/kullanıcı: UNIQUE(promo_id,user_id) ihlali → zaten kullanılmış
  BEGIN
    INSERT INTO public.promo_redemptions (promo_id, user_id) VALUES (c.id, v_uid);
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'ALREADY_REDEEMED: Bu kodu zaten kullandiniz.';
  END;

  UPDATE public.promo_codes SET redemption_count = COALESCE(redemption_count, 0) + 1 WHERE id = c.id;

  v_disc := CASE
    WHEN upper(c.discount_type) IN ('PERCENT', 'PERCENTAGE', 'YUZDE')
      THEN round(p_base_amount * c.discount_value / 100.0, 2)
    ELSE least(c.discount_value, p_base_amount)   -- sabit tutar (FIXED)
  END;
  v_final := greatest(0, p_base_amount - v_disc);

  RETURN jsonb_build_object('promo_id', c.id, 'discount', v_disc, 'final_amount', v_final);
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_promo(text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_promo(text, numeric) TO authenticated;
