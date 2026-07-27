-- ============================================================
-- F1.4 — No-show itirazı karar RPC'si: admin_resolve_noshow_dispute
-- ============================================================
-- Tespit: captain_report_no_show reported_at ile AYNI update'te
-- payout_released=true yazar; admin kuyruğu payout_released=false filtreler →
-- no-show/DISPUTED kayıtlar kuyruğa HİÇ düşmüyordu. Karar RPC'si de hiç
-- yazılmamıştı (NOSHOW_FINALIZED statüsü CHECK'te tanımlı ama hiçbir kod set
-- etmiyordu) ve karar sonrası taraflara bildirim yoktu.
--
-- Bu RPC iki dalı kapatır (kuyruk filtresi frontend'te düzeltilir):
--  * p_uphold=true  → kaptan haklı: ceza kesinleşir, statü NOSHOW_FINALIZED.
--    (Para hareketi yok — ceza ve tazminat captain_report_no_show'da yapıldı.)
--  * p_uphold=false → sağlayıcı haklı: no-show'un TÜM para etkileri ledger
--    üzerinden geri alınır (satır iptali + ayna senkronu), EARNINGS geri
--    COMPLETED olur, statü COMPLETED + sayaç +1.
-- Tüm satır hedefleri captain_report_no_show'un canlı gövdesinin (2026-07-27)
-- yazdığı kayıtlarla birebir eşleşecek şekilde filtrelenmiştir; her adım
-- idempotent (ikinci çağrı INVALID_STATE'e düşer).

CREATE OR REPLACE FUNCTION public.admin_resolve_noshow_dispute(
  p_request_id uuid,
  p_uphold boolean,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_req public.service_requests;
  v_title text;
  v_provider_name text;
  v_penalty_reversed boolean := false;
  v_comp_clawed int := 0;
  v_fee_clawed int := 0;
  v_earnings_restored int := 0;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  PERFORM public.require_admin_role(ARRAY['MODERATOR','FINANCE']);
  PERFORM public.require_admin_write();

  SELECT * INTO v_req FROM public.service_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_req.status NOT IN ('NOSHOW_REPORTED','DISPUTED') THEN
    RAISE EXCEPTION 'INVALID_STATE: Karar yalnız NOSHOW_REPORTED/DISPUTED talepte verilebilir (mevcut: %).', v_req.status;
  END IF;

  SELECT COALESCE(m.title,'Maç') INTO v_title FROM public.matches m WHERE m.id = v_req.match_id;
  SELECT COALESCE(name, full_name, 'Sağlayıcı') INTO v_provider_name FROM public.profiles WHERE id = v_req.provider_id;

  IF p_uphold THEN
    -- Kaptan haklı: ceza kesinleşir.
    UPDATE public.service_requests SET status = 'NOSHOW_FINALIZED' WHERE id = p_request_id;

    INSERT INTO public.notifications (user_id, title, body, type_key, match_id, deep_link)
    VALUES (v_req.provider_id, 'İtiraz sonucu: ceza kesinleşti',
            v_title || ' için no-show bildirimi incelendi ve kaptan haklı bulundu. ' ||
            COALESCE(v_req.penalty_amount,0) || '₺ ceza kesinleşti.' ||
            COALESCE(' Not: ' || NULLIF(btrim(p_notes),''), ''),
            'service_noshow_resolved', v_req.match_id, 'oyna://match/' || v_req.match_id);
    INSERT INTO public.notifications (user_id, title, body, type_key, match_id, deep_link)
    VALUES (v_req.requested_by, 'No-show bildirimin onaylandı',
            v_title || ' için no-show bildirimin incelendi ve haklı bulundun; tazminatın kesinleşti.',
            'service_noshow_resolved', v_req.match_id, 'oyna://match/' || v_req.match_id);

    PERFORM public.log_admin_action('NOSHOW_RESOLVE', 'service_request', p_request_id, v_provider_name,
      jsonb_build_object('status', v_req.status),
      jsonb_build_object('uphold', true, 'penalty', v_req.penalty_amount, 'notes', p_notes));

    RETURN jsonb_build_object('request_id', p_request_id, 'status', 'NOSHOW_FINALIZED', 'uphold', true);
  END IF;

  -- Sağlayıcı haklı: no-show'un para etkilerini geri al.

  -- 1) Sağlayıcıya kesilen ceza iadesi — yalnız ceza gerçekten tahsil
  --    edildiyse (reported_at sonrasında sağlayıcı hesabında eksi satır) ve
  --    daha önce iade edilmediyse (reference NOSHOW_REVERSAL idempotans kilidi).
  IF COALESCE(v_req.penalty_amount,0) > 0
     AND EXISTS (SELECT 1 FROM public.wallet_transactions
                 WHERE user_id = v_req.provider_id AND match_id = v_req.match_id
                   AND amount < 0 AND created_at >= COALESCE(v_req.reported_at, now()) - interval '1 minute')
     AND NOT EXISTS (SELECT 1 FROM public.wallet_transactions
                     WHERE reference_type = 'NOSHOW_REVERSAL' AND reference_id = p_request_id) THEN
    INSERT INTO public.wallet_transactions
      (user_id, match_id, amount, type, balance_type, status, reference_type, reference_id, description)
    VALUES
      (v_req.provider_id, v_req.match_id, v_req.penalty_amount, 'REFUND', 'REFUND_CREDIT', 'COMPLETED',
       'NOSHOW_REVERSAL', p_request_id, 'No-show cezası iadesi (itiraz haklı bulundu)');
    v_penalty_reversed := true;
  END IF;

  -- 2) Kaptanın no-show tazminatı geri alınır (captain_report_no_show'un yazdığı satır)
  UPDATE public.wallet_transactions SET status = 'CANCELLED'
  WHERE user_id = v_req.requested_by AND match_id = v_req.match_id
    AND type = 'MATCH_REFUND' AND reference_type = 'MATCH' AND status = 'COMPLETED'
    AND amount = COALESCE(v_req.penalty_amount,0)
    AND description LIKE 'No-show tazminati%';
  GET DIAGNOSTICS v_comp_clawed = ROW_COUNT;

  -- 3) Kaptanın hizmet ücreti iadesi geri alınır (_refund_service_captain satırı;
  --    aynı maçta başka iptal iadeleriyle karışmasın diye zaman penceresi dar)
  IF COALESCE(v_req.captain_refunded, false) THEN
    UPDATE public.wallet_transactions SET status = 'CANCELLED'
    WHERE user_id = v_req.requested_by AND match_id = v_req.match_id
      AND type = 'REFUND' AND reference_type = 'REFUND' AND status = 'COMPLETED'
      AND amount = v_req.fee
      AND description = 'Hizmet iadesi (talep iptal/red/no-show)'
      AND created_at >= COALESCE(v_req.reported_at, now()) - interval '5 minutes';
    GET DIAGNOSTICS v_fee_clawed = ROW_COUNT;
    IF v_fee_clawed > 0 THEN
      UPDATE public.service_requests SET captain_refunded = false WHERE id = p_request_id;
    END IF;
  END IF;

  -- 4) Sağlayıcının EARNINGS satırı geri COMPLETED (no-show anında CANCELLED edilmişti)
  UPDATE public.wallet_transactions SET status = 'COMPLETED'
  WHERE reference_id = v_req.payment_intent_id AND balance_type = 'EARNINGS' AND status = 'CANCELLED';
  GET DIAGNOSTICS v_earnings_restored = ROW_COUNT;

  -- 5) Aynalar + statü + sayaç
  PERFORM public._sync_wallet_mirror(v_req.provider_id);
  PERFORM public._sync_wallet_mirror(v_req.requested_by);

  UPDATE public.service_requests
    SET status = 'COMPLETED', completed_at = now()
    WHERE id = p_request_id;

  IF v_req.provider_type = 'GK' THEN
    UPDATE public.goalkeepers SET "matchCount" = COALESCE("matchCount",0) + 1 WHERE id = v_req.provider_id;
  ELSIF v_req.provider_type = 'REF' THEN
    UPDATE public.referees SET "matchCount" = COALESCE("matchCount",0) + 1 WHERE id = v_req.provider_id;
  END IF;

  INSERT INTO public.notifications (user_id, title, body, type_key, match_id, deep_link)
  VALUES (v_req.provider_id, 'İtirazın kabul edildi ✅',
          v_title || ' için itirazın haklı bulundu: ' ||
          CASE WHEN v_penalty_reversed THEN 'ceza iade edildi ve ücretin' ELSE 'ücretin' END ||
          ' cüzdanına işlendi.' || COALESCE(' Not: ' || NULLIF(btrim(p_notes),''), ''),
          'service_noshow_resolved', v_req.match_id, 'oyna://match/' || v_req.match_id);
  INSERT INTO public.notifications (user_id, title, body, type_key, match_id, deep_link)
  VALUES (v_req.requested_by, 'No-show bildirimi sonuçlandı',
          v_title || ' için bildirimin incelendi: ' || v_provider_name ||
          ' haklı bulundu. Hizmet ücreti sağlayıcıya ödendi; tazminat ve iade geri alındı.',
          'service_noshow_resolved', v_req.match_id, 'oyna://match/' || v_req.match_id);

  PERFORM public.log_admin_action('NOSHOW_RESOLVE', 'service_request', p_request_id, v_provider_name,
    jsonb_build_object('status', v_req.status, 'penalty', v_req.penalty_amount,
                       'captain_refunded', v_req.captain_refunded),
    jsonb_build_object('uphold', false, 'penalty_reversed', v_penalty_reversed,
                       'compensation_clawed_rows', v_comp_clawed, 'fee_refund_clawed_rows', v_fee_clawed,
                       'earnings_restored_rows', v_earnings_restored, 'notes', p_notes));

  RETURN jsonb_build_object('request_id', p_request_id, 'status', 'COMPLETED', 'uphold', false,
    'penalty_reversed', v_penalty_reversed, 'earnings_restored', v_earnings_restored > 0);
END; $function$;

REVOKE ALL ON FUNCTION public.admin_resolve_noshow_dispute(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_resolve_noshow_dispute(uuid, boolean, text) TO authenticated, service_role;
