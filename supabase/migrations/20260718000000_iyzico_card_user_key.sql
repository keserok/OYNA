-- ============================================================================
-- iyzico kart saklama köprüsü — kullanıcı başına cardUserKey + maskeli kart
--
-- profiles.iyzico_card_user_key: iyzico kart deposundaki kullanıcı anahtarı.
-- set/upsert RPC'leri YALNIZ service_role (edge fonksiyonları) tarafından
-- çağrılır; kart numarası hiçbir zaman DB'ye yazılmaz (yalnız son 4 + marka).
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS iyzico_card_user_key text;

ALTER TABLE public.user_saved_cards
  ADD COLUMN IF NOT EXISTS provider_card_token text;

-- ─── cardUserKey yaz (ilk kayıtta ya da değiştiyse) ─────────────────────────
CREATE OR REPLACE FUNCTION public.set_iyzico_card_user_key(p_user_id uuid, p_key text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_key IS NULL OR btrim(p_key) = '' THEN RETURN; END IF;
  UPDATE public.profiles
  SET iyzico_card_user_key = p_key
  WHERE id = p_user_id AND (iyzico_card_user_key IS NULL OR iyzico_card_user_key <> p_key);
END;
$$;

REVOKE ALL ON FUNCTION public.set_iyzico_card_user_key(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_iyzico_card_user_key(uuid, text) TO service_role;

-- ─── Maskeli kartı kaydet/güncelle (token'a göre idempotent) ────────────────
CREATE OR REPLACE FUNCTION public.upsert_iyzico_saved_card(
  p_user_id    uuid,
  p_card_token text,
  p_last4      text,
  p_brand      text,
  p_exp_month  integer DEFAULT NULL,
  p_exp_year   integer DEFAULT NULL,
  p_gradient   text    DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_count int;
BEGIN
  IF p_card_token IS NULL OR p_last4 !~ '^[0-9]{4}$' THEN RETURN; END IF;

  -- Zaten kayıtlıysa (token) güncelle, değilse ekle
  IF EXISTS (SELECT 1 FROM public.user_saved_cards
             WHERE user_id = p_user_id AND provider_card_token = p_card_token) THEN
    UPDATE public.user_saved_cards
    SET last4 = p_last4, brand = COALESCE(NULLIF(p_brand,''), brand),
        exp_month = COALESCE(p_exp_month, exp_month), exp_year = COALESCE(p_exp_year, exp_year)
    WHERE user_id = p_user_id AND provider_card_token = p_card_token;
    RETURN;
  END IF;

  SELECT count(*) INTO v_count FROM public.user_saved_cards WHERE user_id = p_user_id;

  INSERT INTO public.user_saved_cards
    (user_id, brand, last4, exp_month, exp_year, gradient, is_default, provider_card_token)
  VALUES
    (p_user_id, COALESCE(NULLIF(p_brand,''),'KART'), p_last4, p_exp_month, p_exp_year,
     p_gradient, (v_count = 0), p_card_token);
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_iyzico_saved_card(uuid, text, text, text, integer, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_iyzico_saved_card(uuid, text, text, text, integer, integer, text) TO service_role;
