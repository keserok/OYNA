-- ============================================================
-- F1.6 — Sağlayıcı maç sayacı: payout serbest kalınca +1 ve backfill
-- ============================================================
-- goalkeepers/referees."matchCount" hiçbir kod yolunda artmıyordu (yalnız
-- admin payload'ı yazabiliyor); marketplace "0 maç" gösteriyor ve
-- find_providers_for_match'in match_count DESC sıralaması ölüydü.
-- Kanca noktası: _release_service_payout — payout'un serbest kaldığı TEK yer
-- (provider_confirm/captain_confirm/submit_service_rating/admin hepsi buraya
-- iner). Gövde canlıdan birebir alındı (2026-07-27 teyidi); yalnız sayaç
-- bloğu EKLENDİ. İdempotans fonksiyonun kendi kapısından gelir:
-- payout_released=false satırı seçilir ve aynı işlemde true yapılır.

CREATE OR REPLACE FUNCTION public._release_service_payout(p_match_id uuid, p_provider_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_req public.service_requests;
BEGIN
  SELECT * INTO v_req FROM public.service_requests
    WHERE match_id = p_match_id AND provider_id = p_provider_id AND status = 'CAPTURED' AND payout_released = false
    ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;
  IF NOT (COALESCE(v_req.provider_confirmed,false) AND COALESCE(v_req.captain_confirmed,false)) THEN RETURN; END IF;
  UPDATE public.wallet_transactions SET status = 'COMPLETED'
    WHERE reference_id = v_req.payment_intent_id AND balance_type = 'EARNINGS' AND status = 'PENDING';
  PERFORM public._sync_wallet_mirror(v_req.provider_id);
  UPDATE public.service_requests SET status = 'COMPLETED', completed_at = now(), payout_released = true WHERE id = v_req.id;

  -- F1.6: tamamlanan iş sayacı (bu satır her talep için en fazla bir kez çalışır)
  IF v_req.provider_type = 'GK' THEN
    UPDATE public.goalkeepers SET "matchCount" = COALESCE("matchCount",0) + 1 WHERE id = v_req.provider_id;
  ELSIF v_req.provider_type = 'REF' THEN
    UPDATE public.referees SET "matchCount" = COALESCE("matchCount",0) + 1 WHERE id = v_req.provider_id;
  END IF;
END; $function$;

-- Tek seferlik backfill: geçmiş COMPLETED işler. GREATEST — admin'in elle
-- girdiği (gerçek saha geçmişini yansıtan) değerler aşağı çekilmez.
UPDATE public.goalkeepers g
SET "matchCount" = GREATEST(COALESCE(g."matchCount",0), s.c)
FROM (SELECT provider_id, count(*)::int AS c FROM public.service_requests
      WHERE status = 'COMPLETED' AND provider_type = 'GK' GROUP BY provider_id) s
WHERE g.id = s.provider_id;

UPDATE public.referees r
SET "matchCount" = GREATEST(COALESCE(r."matchCount",0), s.c)
FROM (SELECT provider_id, count(*)::int AS c FROM public.service_requests
      WHERE status = 'COMPLETED' AND provider_type = 'REF' GROUP BY provider_id) s
WHERE r.id = s.provider_id;
