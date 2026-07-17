-- ════════════════════════════════════════════════════════════════════════════
-- [S2.2 + G2] Kazanç çekimi min eşiği + para bekçisine çekim değişmezi
-- ────────────────────────────────────────────────────────────────────────────
-- S2.2: request_payout_with_method'a min eşik (config, varsayılan 100₺).
--       Admin bekleyen-payout listesi (admin_fetch_payouts) ZATEN var.
-- G2:   check_money_invariants'a I7 eklenir — her WALLET_CASHOUT talebinde
--       amount = fee_amount + net_amount (kesinti muhasebesi tutarlı).
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO public.app_config (key, value, value_type, category, label, description, is_public, min_value, max_value) VALUES
  ('earnings_payout_min', '100'::jsonb, 'number', 'ODEME',
   'Min Kazanç Çekimi (₺)',
   'Kaleci/hakem/saha sahibinin kazancını IBAN''a çekmesi için minimum tutar.',
   false, 1, 100000)
ON CONFLICT (key) DO NOTHING;

-- ─── request_payout_with_method — faz8a gövdesi + MIN EŞİK ────────────────────
-- Davranış değişmezi: yalnız min eşik kontrolü eklendi; gerisi birebir.
CREATE OR REPLACE FUNCTION public.request_payout_with_method(
  p_amount    numeric,
  p_method_id uuid
)
RETURNS public.payout_requests
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid         uuid := auth.uid();
  v_method      public.payout_methods;
  v_wallet      jsonb;
  v_balance     numeric;
  v_payout      public.payout_requests;
  v_role        text;
  v_roles       jsonb;
  v_idstat      text;
  v_is_provider boolean;
  v_iban_disp   text;
  v_min         numeric := COALESCE(public.get_config_number('earnings_payout_min', 100), 100);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT: Tutar sifirdan buyuk olmali.'; END IF;
  IF p_amount < v_min THEN
    RAISE EXCEPTION 'MIN_PAYOUT: En az %₺ çekebilirsin.', v_min::int;
  END IF;

  SELECT * INTO v_method FROM public.payout_methods WHERE id = p_method_id AND user_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'METHOD_NOT_FOUND: Kayitli odeme yontemi bulunamadi.'; END IF;

  SELECT role, roles INTO v_role, v_roles FROM public.profiles WHERE id = v_uid;
  v_is_provider := v_role IN ('GOALKEEPER','REFEREE')
                   OR (COALESCE(v_roles,'[]'::jsonb) ? 'GOALKEEPER')
                   OR (COALESCE(v_roles,'[]'::jsonb) ? 'REFEREE');
  IF v_is_provider THEN
    SELECT status INTO v_idstat FROM public.provider_identities WHERE user_id = v_uid;
    IF v_idstat IS DISTINCT FROM 'VERIFIED' THEN
      RAISE EXCEPTION 'IDENTITY_REQUIRED: Odeme almadan once TC kimlik dogrulamasi gerekli.';
    END IF;
  END IF;

  v_wallet  := public.get_wallet_summary();
  v_balance := (v_wallet->>'earnings_balance')::numeric;
  IF v_balance < p_amount THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE: Bakiye yetersiz. Mevcut: %', v_balance;
  END IF;
  IF EXISTS (SELECT 1 FROM public.payout_requests WHERE user_id = v_uid AND status = 'PENDING') THEN
    RAISE EXCEPTION 'PENDING_PAYOUT: Bekleyen odeme talebiniz mevcut.';
  END IF;

  v_iban_disp := CASE WHEN v_method.kind = 'IBAN' THEN v_method.iban
                      ELSE 'KART **** ' || v_method.card_last4 || ' (' || COALESCE(v_method.card_brand,'KART') || ')' END;

  INSERT INTO public.payout_requests
    (user_id, amount, iban, iban_holder_name, payout_type, payout_method_id, method_kind)
  VALUES
    (v_uid, p_amount, v_iban_disp, v_method.holder_name,
     CASE WHEN v_is_provider THEN 'PROVIDER_INSTANT' ELSE 'MANUAL' END,
     v_method.id, v_method.kind)
  RETURNING * INTO v_payout;

  INSERT INTO public.wallet_transactions (user_id, amount, type, balance_type, status, reference_type, reference_id, description)
  VALUES (v_uid, p_amount, 'WITHDRAWAL', 'EARNINGS', 'PENDING', 'PAYOUT', v_payout.id,
          CASE WHEN v_method.kind = 'IBAN' THEN 'IBAN''a çekim talebi' ELSE 'Kayıtlı karta çekim talebi' END);

  RETURN v_payout;
END;
$$;
REVOKE ALL ON FUNCTION public.request_payout_with_method(numeric, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_payout_with_method(numeric, uuid) TO authenticated;

-- ─── G2: check_money_invariants + I7 (cashout kesinti muhasebesi tutarlı) ─────
CREATE OR REPLACE FUNCTION public.check_money_invariants()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  i1 int; i2 int; i3 int; i4 int; i5 int; i6 int; i7 int; v_ok boolean;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  WITH b AS (
    SELECT user_id,
      GREATEST(COALESCE(SUM(CASE WHEN balance_type='TOP_UP' AND status='COMPLETED'
                  THEN (CASE WHEN type='TOP_UP' THEN amount ELSE -amount END) ELSE 0 END),0),0)
      + GREATEST(COALESCE(SUM(CASE WHEN balance_type='REFUND_CREDIT' AND status='COMPLETED'
                  THEN (CASE WHEN type IN ('DEPOSIT','REFUND','MATCH_REFUND') THEN amount ELSE -amount END) ELSE 0 END),0),0)
      AS computed
    FROM public.wallet_transactions GROUP BY user_id
  )
  SELECT count(*) INTO i1
  FROM public.profiles p LEFT JOIN b ON b.user_id = p.id
  WHERE round(COALESCE(p.wallet_balance,0),2) <> round(COALESCE(b.computed,0),2);

  SELECT count(*) INTO i2 FROM (
    SELECT user_id, idempotency_key FROM public.payment_intents
    WHERE idempotency_key IS NOT NULL GROUP BY user_id, idempotency_key HAVING count(*) > 1
  ) d;

  SELECT count(*) INTO i3 FROM (
    SELECT reference_id FROM public.wallet_transactions
    WHERE reference_type='PAYMENT_INTENT' AND type='TOP_UP' AND status='COMPLETED'
    GROUP BY reference_id HAVING count(*) > 1
  ) d;

  SELECT count(*) INTO i4 FROM (
    SELECT user_id,
      SUM(CASE WHEN balance_type='TOP_UP' AND status='COMPLETED'
              THEN (CASE WHEN type='TOP_UP' THEN amount ELSE -amount END) ELSE 0 END) AS topup_raw,
      SUM(CASE WHEN balance_type='REFUND_CREDIT' AND status='COMPLETED'
              THEN (CASE WHEN type IN ('DEPOSIT','REFUND','MATCH_REFUND') THEN amount ELSE -amount END) ELSE 0 END) AS refund_raw
    FROM public.wallet_transactions GROUP BY user_id
  ) s WHERE s.topup_raw < -0.005 OR s.refund_raw < -0.005;

  SELECT count(*) INTO i5 FROM public.wallet_transactions wt
  WHERE wt.balance_type='REFUND_CREDIT' AND wt.reference_type='PAYMENT_INTENT'
    AND NOT EXISTS (SELECT 1 FROM public.payment_intents pi WHERE pi.id::text = wt.reference_id::text);

  SELECT count(*) INTO i6 FROM public.payment_intents
  WHERE status='PENDING' AND provider='IYZICO'
    AND (raw->>'flow') IN ('BOOKING_DEPOSIT','TOP_UP','MATCH_JOIN')
    AND created_at < now() - interval '6 hour';

  -- I7 (G2): her WALLET_CASHOUT talebinde amount = fee_amount + net_amount
  SELECT count(*) INTO i7 FROM public.payout_requests
  WHERE payout_type = 'WALLET_CASHOUT'
    AND round(COALESCE(amount,0),2) <> round(COALESCE(fee_amount,0) + COALESCE(net_amount,0),2);

  v_ok := (i1=0 AND i2=0 AND i3=0 AND i4=0 AND i5=0 AND i7=0);

  RETURN jsonb_build_object(
    'ok', v_ok,
    'invariants', jsonb_build_object(
      'I1_wallet_mirror_mismatch', i1, 'I2_idempotency_dup', i2,
      'I3_double_topup_credit', i3, 'I4_negative_bucket', i4, 'I5_orphan_refund', i5,
      'I7_cashout_fee_consistency', i7),
    'info', jsonb_build_object('I6_stale_pending_over_6h', i6)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.check_money_invariants() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_money_invariants() TO authenticated, service_role;
