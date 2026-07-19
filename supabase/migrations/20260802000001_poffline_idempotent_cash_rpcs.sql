-- ════════════════════════════════════════════════════════════════════════
-- P-OFFLINE 1 — KASA RPC'LERİNE İDEMPOTENCY (client_request_id)
-- ------------------------------------------------------------------------
-- Halı sahada internet kopar; kasa durmamalı. Çevrimdışı kuyruk (outbox)
-- bağlantı gelince işlemleri YENİDEN gönderir — aynı işlem iki kez
-- işlenmemeli (para dürüstlüğü). Kalıp owner_create_manual_booking ile aynı:
-- owner_client_ops tablosuna INSERT ... ON CONFLICT DO NOTHING ile "claim";
-- claim edilemezse (tekrar gönderim) saklanan sonuç aynen döner.
--
-- İMZA NOTU: parametre eklemek yeni bir overload yaratır; eski imza kalırsa
-- PostgREST adlı-parametre eşlemesinde çift-eşleşme (300) üretir. Bu yüzden
-- eski fonksiyonlar DROP edilir — p_client_request_id DEFAULT NULL olduğundan
-- eski istemciler (parametresiz çağrı) tek yeni imzayla sorunsuz eşleşir.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1) staff_record_payment — rezervasyon tahsilatı (kasa) ──────────────────
DROP FUNCTION IF EXISTS public.staff_record_payment(uuid, numeric, text, text);

CREATE OR REPLACE FUNCTION public.staff_record_payment(
  p_booking_id uuid,
  p_amount numeric,
  p_method text DEFAULT 'CASH'::text,
  p_note text DEFAULT NULL::text,
  p_client_request_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_pitch uuid; v_price numeric; v_paid numeric;
  v_claimed int := 0; v_existing jsonb; v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  -- İdempotency claim — YETKİ KONTROLÜNDEN ÖNCE DEĞİL; önce claim, ama sonucu
  -- ancak işlem gerçekten yapılmışsa döndürürüz. Claim edilemeyen istek =
  -- tekrar gönderim → saklanan sonucu aynen döndür (ikinci kez YAZMA YOK).
  IF p_client_request_id IS NOT NULL THEN
    INSERT INTO public.owner_client_ops (client_request_id, op_type, created_by)
    VALUES (p_client_request_id, 'RECORD_PAYMENT', v_uid)
    ON CONFLICT (client_request_id) DO NOTHING;
    GET DIAGNOSTICS v_claimed = ROW_COUNT;
    IF v_claimed = 0 THEN
      SELECT result INTO v_existing FROM public.owner_client_ops
      WHERE client_request_id = p_client_request_id;
      RETURN COALESCE(v_existing, jsonb_build_object('status', 'DUPLICATE_IN_FLIGHT'));
    END IF;
  END IF;

  SELECT b.pitch_id, COALESCE(b.price, 0), COALESCE(b.paid_amount, 0)
    INTO v_pitch, v_price, v_paid
  FROM public.pitch_bookings b WHERE b.id = p_booking_id;
  IF v_pitch IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF NOT public.can_staff_pitch(v_pitch) THEN RAISE EXCEPTION 'UNAUTHORIZED: bu tesise erisim yok.'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;
  IF v_price > 0 AND p_amount > GREATEST(v_price - v_paid, 0) + 0.001 THEN
    RAISE EXCEPTION 'OVER_PAYMENT: kalan bakiyeden fazla tahsilat alınamaz.';
  END IF;

  INSERT INTO public.booking_payments (booking_id, amount, payment_method, note, recorded_by, source)
  VALUES (p_booking_id, p_amount, COALESCE(NULLIF(p_method, ''), 'CASH'), p_note, v_uid, 'OWNER_MANUAL');

  v_result := jsonb_build_object('status', 'OK', 'booking_id', p_booking_id, 'amount', p_amount);
  IF p_client_request_id IS NOT NULL THEN
    UPDATE public.owner_client_ops SET result = v_result
    WHERE client_request_id = p_client_request_id;
  END IF;
  RETURN v_result;
END;
$$;

-- ── 2) debtor_add_payment — veresiye ödemesi (kasa) ─────────────────────────
DROP FUNCTION IF EXISTS public.debtor_add_payment(uuid, numeric, text, text);

CREATE OR REPLACE FUNCTION public.debtor_add_payment(
  p_debtor_id uuid,
  p_amount numeric,
  p_method text DEFAULT 'CASH'::text,
  p_note text DEFAULT NULL::text,
  p_client_request_id uuid DEFAULT NULL::uuid
)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid uuid := auth.uid(); v_pitch uuid; v_bal numeric;
  v_claimed int := 0; v_existing jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  IF p_client_request_id IS NOT NULL THEN
    INSERT INTO public.owner_client_ops (client_request_id, op_type, created_by)
    VALUES (p_client_request_id, 'DEBTOR_PAYMENT', v_uid)
    ON CONFLICT (client_request_id) DO NOTHING;
    GET DIAGNOSTICS v_claimed = ROW_COUNT;
    IF v_claimed = 0 THEN
      -- Tekrar gönderim: kaydedilen bakiyeyi döndür; sonuç henüz yazılmadıysa
      -- (ilk istek hâlâ uçuşta) mevcut bakiyeyi oku — ikinci kez YAZMA YOK.
      SELECT result INTO v_existing FROM public.owner_client_ops
      WHERE client_request_id = p_client_request_id;
      IF v_existing ? 'balance' THEN RETURN (v_existing->>'balance')::numeric; END IF;
      SELECT GREATEST(COALESCE(amount_owed, 0), 0) INTO v_bal FROM public.pitch_debtors WHERE id = p_debtor_id;
      RETURN COALESCE(v_bal, 0);
    END IF;
  END IF;

  SELECT d.pitch_id, GREATEST(COALESCE(d.amount_owed, 0), 0) INTO v_pitch, v_bal
  FROM public.pitch_debtors d WHERE d.id = p_debtor_id;
  IF v_pitch IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF NOT public.can_staff_pitch(v_pitch) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: bu tesise erisim yok.';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;
  IF p_amount > v_bal + 0.001 THEN RAISE EXCEPTION 'OVER_PAYMENT: bakiyeden fazla ödeme alınamaz.'; END IF;

  INSERT INTO public.pitch_debtor_entries (debtor_id, pitch_id, entry_type, amount, payment_method, note)
  VALUES (p_debtor_id, v_pitch, 'PAYMENT', p_amount, p_method, p_note);

  SELECT GREATEST(COALESCE(amount_owed, 0), 0) INTO v_bal FROM public.pitch_debtors WHERE id = p_debtor_id;

  IF p_client_request_id IS NOT NULL THEN
    UPDATE public.owner_client_ops SET result = jsonb_build_object('balance', v_bal)
    WHERE client_request_id = p_client_request_id;
  END IF;
  RETURN v_bal;
END;
$$;

-- ── 3) İZİNLER ──────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.staff_record_payment(uuid, numeric, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.debtor_add_payment(uuid, numeric, text, text, uuid) TO authenticated;

-- ── 4) Eski idempotency kayıtlarının bakımı (30 günden eski op'lar) ─────────
-- Tablo küçük kalır; süpürme owner_client_ops'u kullanan tüm op türleri için
-- geçerlidir. (pg_cron varsa zamanlanabilir; şimdilik elle/migration'da.)
DELETE FROM public.owner_client_ops WHERE created_at < now() - interval '30 days';
