-- [DB GEÇMİŞİNDEN KURTARILDI 2026-07-11] Bu migration canlı veritabanına uygulanmıştı ancak repoda dosyası yoktu; supabase_migrations.schema_migrations.statements kolonundan geri çıkarıldı.

-- CÜZDAN V2 (1/3) — Kayıtlı kartlar (DB-backed, maskeli meta)
-- (repo: 20260717000001_user_saved_cards.sql) PAN/CVV ASLA saklanmaz.

CREATE TABLE IF NOT EXISTS public.user_saved_cards (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  brand                   text NOT NULL DEFAULT 'KART',
  last4                   text NOT NULL CHECK (last4 ~ '^[0-9]{4}$'),
  exp_month               int  CHECK (exp_month BETWEEN 1 AND 12),
  exp_year                int  CHECK (exp_year BETWEEN 2020 AND 2100),
  holder_name             text,
  gradient                text,
  is_default              boolean NOT NULL DEFAULT false,
  provider_card_user_key  text,
  provider_card_token     text,
  created_at              timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.user_saved_cards IS
  'Kayıtlı ödeme kartları — yalnız maskeli meta (marka/son4/SKT). PAN/CVV saklanmaz; canlıda iyzico tokenizasyonu provider_* sütunlarına bağlanır.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_saved_cards_default
  ON public.user_saved_cards(user_id) WHERE is_default;

CREATE INDEX IF NOT EXISTS idx_user_saved_cards_user
  ON public.user_saved_cards(user_id, created_at DESC);

ALTER TABLE public.user_saved_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own saved cards" ON public.user_saved_cards;
CREATE POLICY "Users view own saved cards"
  ON public.user_saved_cards FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- ─── add_saved_card ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.add_saved_card(
  p_brand        text,
  p_last4        text,
  p_exp_month    int,
  p_exp_year     int,
  p_holder_name  text DEFAULT NULL,
  p_gradient     text DEFAULT NULL,
  p_make_default boolean DEFAULT false
)
RETURNS public.user_saved_cards
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_count int;
  v_card  public.user_saved_cards;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_last4 IS NULL OR p_last4 !~ '^[0-9]{4}$' THEN
    RAISE EXCEPTION 'INVALID_CARD: Kart bilgisi geçersiz.';
  END IF;
  IF p_exp_month IS NULL OR p_exp_year IS NULL
     OR p_exp_month NOT BETWEEN 1 AND 12
     OR (p_exp_year * 100 + p_exp_month) < (EXTRACT(YEAR FROM now())::int * 100 + EXTRACT(MONTH FROM now())::int) THEN
    RAISE EXCEPTION 'CARD_EXPIRED: Kartın son kullanma tarihi geçersiz.';
  END IF;

  SELECT * INTO v_card FROM public.user_saved_cards
  WHERE user_id = v_uid AND last4 = p_last4
    AND exp_month = p_exp_month AND exp_year = p_exp_year
  LIMIT 1;
  IF FOUND THEN RETURN v_card; END IF;

  SELECT count(*) INTO v_count FROM public.user_saved_cards WHERE user_id = v_uid;
  IF v_count >= 10 THEN
    RAISE EXCEPTION 'CARD_LIMIT: En fazla 10 kart kaydedebilirsin.';
  END IF;

  IF p_make_default OR v_count = 0 THEN
    UPDATE public.user_saved_cards SET is_default = false
    WHERE user_id = v_uid AND is_default;
  END IF;

  INSERT INTO public.user_saved_cards
    (user_id, brand, last4, exp_month, exp_year, holder_name, gradient, is_default)
  VALUES
    (v_uid, COALESCE(NULLIF(trim(p_brand), ''), 'KART'), p_last4, p_exp_month, p_exp_year,
     NULLIF(trim(p_holder_name), ''), p_gradient, (p_make_default OR v_count = 0))
  RETURNING * INTO v_card;

  RETURN v_card;
END;
$$;

REVOKE ALL ON FUNCTION public.add_saved_card(text, text, int, int, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_saved_card(text, text, int, int, text, text, boolean) TO authenticated;

-- ─── delete_saved_card ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_saved_card(p_card_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_card public.user_saved_cards;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  SELECT * INTO v_card FROM public.user_saved_cards
  WHERE id = p_card_id AND user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Kart bulunamadı.'; END IF;

  DELETE FROM public.user_saved_cards WHERE id = p_card_id;

  IF v_card.is_default THEN
    UPDATE public.user_saved_cards SET is_default = true
    WHERE id = (
      SELECT id FROM public.user_saved_cards
      WHERE user_id = v_uid ORDER BY created_at DESC LIMIT 1
    );
  END IF;

  RETURN jsonb_build_object('ok', true, 'deleted_id', p_card_id);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_saved_card(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_saved_card(uuid) TO authenticated;

-- ─── set_default_saved_card ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_default_saved_card(p_card_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_saved_cards WHERE id = p_card_id AND user_id = v_uid) THEN
    RAISE EXCEPTION 'NOT_FOUND: Kart bulunamadı.';
  END IF;

  UPDATE public.user_saved_cards SET is_default = false
  WHERE user_id = v_uid AND is_default AND id <> p_card_id;

  UPDATE public.user_saved_cards SET is_default = true WHERE id = p_card_id;

  RETURN jsonb_build_object('ok', true, 'default_id', p_card_id);
END;
$$;

REVOKE ALL ON FUNCTION public.set_default_saved_card(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_default_saved_card(uuid) TO authenticated;
