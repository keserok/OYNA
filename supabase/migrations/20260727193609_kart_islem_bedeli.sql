-- ÜRETİMDEN GERİ ÇEKİLDİ (defter sapması onarımı, 2026-07-28)
-- Kart işlem bedeli: config + kolon + kota RPC'si
INSERT INTO public.app_config (key, value, value_type, category, label, description, is_public, min_value, max_value)
VALUES (
  'card_fee_pct', '2.5'::jsonb, 'number', 'ODEME', 'Kart İşlem Bedeli (%)',
  'Kartla ödemede tutarın üstüne eklenen işlem bedeli yüzdesi (ödeme altyapısı komisyonunu karşılar). Cüzdandan ödemede uygulanmaz. 0 yapılırsa özellik tamamen kapanır ve ekranlarda hiç görünmez.',
  true, 0, 15
)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.payment_intents
  ADD COLUMN IF NOT EXISTS card_fee_amount numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.payment_intents.card_fee_amount IS
  'Kart yolunda tabana eklenen işlem bedeli. amount = taban + card_fee_amount.';

CREATE OR REPLACE FUNCTION public.get_card_fee_quote(p_amount numeric)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_pct numeric := COALESCE(public.get_config_number('card_fee_pct', 2.5), 2.5);
  v_base numeric := round(GREATEST(COALESCE(p_amount, 0), 0), 2);
  v_fee numeric;
BEGIN
  v_fee := CASE WHEN v_pct > 0 THEN round(v_base * v_pct / 100.0, 2) ELSE 0 END;
  RETURN jsonb_build_object(
    'pct', v_pct,
    'base', v_base,
    'fee', v_fee,
    'total', round(v_base + v_fee, 2),
    'enabled', v_pct > 0
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.get_card_fee_quote(numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_card_fee_quote(numeric) TO authenticated;
