-- ============================================================================
-- ADMIN CÜZDAN DÜZELTME + MAÇ ACİL İPTAL
--
-- Eksiklik #6 (Kullanıcı Bakiye Yönetimi): admin bir oyuncuya bonus kredi
-- yükleyebilir veya fazla/yanlış tutarı geri alabilir. İşlem cüzdan v2 kova
-- matematiğine uygun yazılır (TOP_UP / REFUND_CREDIT), ayna senkronlanır ve
-- denetim günlüğüne (log_admin_action) işlenir. FİNANS yetkisi ister.
--
-- Eksiklik #5 (Acil İptal): tek çağrıyla maç iptal + iade kuyruğu + kadro
-- bildirimi — admin'in ayrı ayrı sekmelerde işlem yapmasına gerek kalmaz.
-- ============================================================================

-- ─── 1) Bakiye düzeltme ──────────────────────────────────────────────────────
-- p_amount işaretlidir: pozitif = yükleme (bonus/tazminat), negatif = geri alma.
CREATE OR REPLACE FUNCTION public.admin_adjust_wallet_balance(
  p_user_id uuid,
  p_amount  numeric,
  p_reason  text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid         uuid := auth.uid();
  v_name        text;
  v_before      numeric;
  v_b           RECORD;
  v_debit       numeric;
  v_from_refund numeric;
  v_from_topup  numeric;
  v_after       numeric;
BEGIN
  -- Para işlemi: SUPER_ADMIN/ADMIN veya FINANCE
  PERFORM public.require_admin_role(ARRAY['FINANCE']);

  p_reason := btrim(COALESCE(p_reason, ''));
  IF length(p_reason) < 3 THEN RAISE EXCEPTION 'Sebep zorunludur (en az 3 karakter).'; END IF;
  p_amount := round(COALESCE(p_amount, 0), 2);
  IF p_amount = 0 THEN RAISE EXCEPTION 'Tutar sıfır olamaz.'; END IF;
  IF abs(p_amount) > 50000 THEN RAISE EXCEPTION 'Tek işlemde en fazla 50.000 ₺ düzeltme yapılabilir.'; END IF;

  SELECT COALESCE(full_name, name, email) INTO v_name FROM public.profiles WHERE id = p_user_id;
  IF v_name IS NULL THEN RAISE EXCEPTION 'Kullanıcı bulunamadı.'; END IF;

  -- Eşzamanlı harcamaya karşı kullanıcı satırını kilitle
  PERFORM 1 FROM public.profiles WHERE id = p_user_id FOR UPDATE;

  SELECT * INTO v_b FROM public._wallet_bucket_balances(p_user_id);
  v_before := v_b.topup_balance + v_b.refund_credit_balance;

  IF p_amount > 0 THEN
    -- Yükleme → TOP_UP kovası (+amount)
    INSERT INTO public.wallet_transactions
      (user_id, amount, type, balance_type, status, reference_type, description, meta)
    VALUES
      (p_user_id, p_amount, 'TOP_UP', 'TOP_UP', 'COMPLETED', 'ADMIN_ADJUST',
       'Admin bakiye yüklemesi: ' || p_reason,
       jsonb_build_object('admin_id', v_uid, 'reason', p_reason));
  ELSE
    -- Geri alma → önce iade kredisi, sonra yüklenen bakiyeden düş
    v_debit := abs(p_amount);
    IF v_before < v_debit THEN
      RAISE EXCEPTION 'Yetersiz bakiye. Mevcut: % ₺, Düşülmek istenen: % ₺', v_before, v_debit;
    END IF;
    v_from_refund := LEAST(v_b.refund_credit_balance, v_debit);
    v_from_topup  := v_debit - v_from_refund;

    IF v_from_refund > 0 THEN
      INSERT INTO public.wallet_transactions
        (user_id, amount, type, balance_type, status, reference_type, description, meta)
      VALUES
        (p_user_id, v_from_refund, 'WALLET_PAYMENT', 'REFUND_CREDIT', 'COMPLETED', 'ADMIN_ADJUST',
         'Admin bakiye düşümü: ' || p_reason,
         jsonb_build_object('admin_id', v_uid, 'reason', p_reason));
    END IF;
    IF v_from_topup > 0 THEN
      INSERT INTO public.wallet_transactions
        (user_id, amount, type, balance_type, status, reference_type, description, meta)
      VALUES
        (p_user_id, v_from_topup, 'WALLET_PAYMENT', 'TOP_UP', 'COMPLETED', 'ADMIN_ADJUST',
         'Admin bakiye düşümü: ' || p_reason,
         jsonb_build_object('admin_id', v_uid, 'reason', p_reason));
    END IF;
  END IF;

  PERFORM public._sync_wallet_mirror(p_user_id);
  SELECT * INTO v_b FROM public._wallet_bucket_balances(p_user_id);
  v_after := v_b.topup_balance + v_b.refund_credit_balance;

  PERFORM public.log_admin_action('WALLET_ADJUST', 'user', p_user_id, v_name,
    jsonb_build_object('balance_before', v_before),
    jsonb_build_object('amount', p_amount, 'reason', p_reason, 'balance_after', v_after));

  RETURN jsonb_build_object(
    'ok', true,
    'balance_before', v_before,
    'balance_after', v_after,
    'amount', p_amount
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_adjust_wallet_balance(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_adjust_wallet_balance(uuid, numeric, text) TO authenticated;

-- ─── 2) Maç acil iptal (iptal + iade kuyruğu + kadro bildirimi) ──────────────
CREATE OR REPLACE FUNCTION public.admin_emergency_cancel_match(
  p_match_id uuid,
  p_reason   text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_count  int := 0;
  v_reason text;
  v_title  text;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  v_reason := COALESCE(NULLIF(btrim(COALESCE(p_reason, '')), ''), 'Acil iptal (yönetici)');

  SELECT title INTO v_title FROM public.matches WHERE id = p_match_id;
  IF v_title IS NULL THEN RAISE EXCEPTION 'Maç bulunamadı'; END IF;

  UPDATE public.matches SET
    status        = 'CANCELLED',
    cancel_reason = v_reason,
    refund_status = 'PENDING'
  WHERE id = p_match_id;

  -- Kadroyu bilgilendir (ev + deplasman dolu slotlar)
  WITH roster AS (
    SELECT DISTINCT ((e.s)->'player'->>'id')::uuid AS pid
    FROM public.matches m
    CROSS JOIN LATERAL (
      SELECT jsonb_array_elements(COALESCE(m.slots, '[]'::jsonb)) AS s
      UNION ALL
      SELECT jsonb_array_elements(COALESCE(m."awaySlots", '[]'::jsonb)) AS s
    ) e
    WHERE m.id = p_match_id
      AND (e.s->>'status') = 'TAKEN'
      AND (e.s->'player'->>'id') IS NOT NULL
  )
  INSERT INTO public.notifications (user_id, title, body, type_key, payload)
  SELECT pid,
         'Maç iptal edildi',
         'Katıldığınız "' || v_title || '" maçı iptal edildi. Sebep: ' || v_reason ||
           '. Ödemeniz varsa iade süreci başlatıldı.',
         'MATCH_CANCELLED',
         jsonb_build_object('match_id', p_match_id, 'reason', v_reason)
  FROM roster WHERE pid IS NOT NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  PERFORM public.log_admin_action('MATCH_EMERGENCY_CANCEL', 'match', p_match_id, v_title, NULL,
    jsonb_build_object('reason', v_reason, 'refund', true, 'recipients', v_count));

  RETURN jsonb_build_object('ok', true, 'status', 'CANCELLED', 'recipients', v_count);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_emergency_cancel_match(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_emergency_cancel_match(uuid, text) TO authenticated;
