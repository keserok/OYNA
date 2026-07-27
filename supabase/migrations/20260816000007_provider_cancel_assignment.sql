-- ============================================================
-- F1.7 — Sağlayıcı iş bırakma: preview_provider_cancel + provider_cancel_assignment
-- ============================================================
-- Kabul edilmiş (ACCEPTED/CAPTURED) bir işi sağlayıcının bırakma yolu YOKTU —
-- ne RPC ne UI. Tek fiili çıkış "maça gitmemek"ti; bu da no-show cezasını
-- tetikleyip kaptanı maç günü kalecisiz bırakıyordu (sistem en kötü davranışa
-- itiyordu).
--
-- Kurallar (app_config ile ayarlanabilir):
--  * Maça >= provider_cancel_free_hours (vars. 24 saat) varken: CEZASIZ iptal.
--  * Daha geç: ücretin %provider_cancel_penalty_pct'i (vars. 50) kadar ceza —
--    cüzdandan best-effort tahsilat (no-show cezası deseniyle birebir);
--    tahsil edilemezse iptal yine tamamlanır, penalty_charged=false döner ve
--    kayıt audit'te görünür.
--  * Maç başladıktan sonra iptal YASAK — o noktadan sonrası no-show/Sorun
--    Bildir akışının konusudur (ceza kaçırma kapısı açılmaz).
-- Para geri alma _void_services_on_match_cancel + _refund_service_captain
-- desenleriyle birebir: EARNINGS PENDING→CANCELLED, intent REFUNDED/VOIDED,
-- kaptana cüzdan iadesi. DİKKAT: kart-fonlu (funding_source='CARD') taleplerde
-- cüzdan iadesi YAZILMAZ — intent REFUNDED işaretlenir (maç iptalindeki mevcut
-- kurumsal davranışla aynı; gerçek kart iadesi iyzico akışında/manuel yapılır).

INSERT INTO public.app_config (key, value, value_type, category, label, description, is_public)
VALUES
  ('provider_cancel_free_hours', to_jsonb(24), 'number', 'HIZMET',
   'Sağlayıcı Cezasız İptal Eşiği (saat)',
   'Maç başlangıcına bu kadar saat ve daha fazlası varken sağlayıcı işi cezasız bırakabilir.', false),
  ('provider_cancel_penalty_pct', to_jsonb(50), 'number', 'HIZMET',
   'Sağlayıcı Geç İptal Cezası (%)',
   'Eşikten sonra iptalde hizmet ücretinin yüzde kaçı ceza olarak kesilir.', false)
ON CONFLICT (key) DO NOTHING;

-- ------------------------------------------------------------
-- Önizleme (SSOT): UI ceza hesabını TEKRARLAMAZ, buradan okur.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.preview_provider_cancel(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_req public.service_requests;
  v_starts timestamptz;
  v_free numeric; v_pct numeric;
  v_hours numeric; v_penalty numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT * INTO v_req FROM public.service_requests WHERE id = p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_req.provider_id IS DISTINCT FROM v_uid AND NOT public.is_platform_admin() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF v_req.status NOT IN ('ACCEPTED','CAPTURED') THEN
    RAISE EXCEPTION 'INVALID_STATE: Yalnız aktif (ACCEPTED/CAPTURED) iş bırakılabilir (mevcut: %).', v_req.status;
  END IF;

  SELECT starts_at INTO v_starts FROM public.matches WHERE id = v_req.match_id;
  v_free := public.get_config_number('provider_cancel_free_hours', 24);
  v_pct  := public.get_config_number('provider_cancel_penalty_pct', 50);
  v_hours := CASE WHEN v_starts IS NULL THEN NULL
                  ELSE EXTRACT(EPOCH FROM (v_starts - now())) / 3600.0 END;

  IF v_hours IS NOT NULL AND v_hours <= 0 THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'MATCH_STARTED',
      'message', 'Maç başladı — iş bırakılamaz; sorun varsa kaptan no-show bildirebilir.');
  END IF;

  v_penalty := CASE WHEN v_hours IS NULL OR v_hours >= v_free THEN 0
                    ELSE round(COALESCE(v_req.fee,0) * v_pct / 100.0, 2) END;

  RETURN jsonb_build_object(
    'allowed', true,
    'fee', v_req.fee,
    'hours_left', CASE WHEN v_hours IS NULL THEN NULL ELSE round(v_hours, 1) END,
    'free_hours', v_free,
    'penalty_pct', v_pct,
    'penalty', v_penalty,
    'funding_source', v_req.funding_source,
    'captain_wallet_refund', COALESCE(v_req.funding_source,'') = 'WALLET'
  );
END; $function$;

REVOKE ALL ON FUNCTION public.preview_provider_cancel(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_provider_cancel(uuid) TO authenticated, service_role;

-- ------------------------------------------------------------
-- İptal
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.provider_cancel_assignment(p_request_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_req public.service_requests;
  v_match RECORD;
  v_free numeric; v_pct numeric;
  v_hours numeric; v_penalty numeric := 0;
  v_charged boolean := false;
  v_provider_name text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT * INTO v_req FROM public.service_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_req.provider_id IS DISTINCT FROM v_uid THEN RAISE EXCEPTION 'FORBIDDEN: Yalnız işi üstlenen sağlayıcı bırakabilir.'; END IF;
  IF v_req.status NOT IN ('ACCEPTED','CAPTURED') THEN
    RAISE EXCEPTION 'INVALID_STATE: Yalnız aktif (ACCEPTED/CAPTURED) iş bırakılabilir (mevcut: %).', v_req.status;
  END IF;

  SELECT id, title, starts_at, gk_id, away_gk_id, "refereeId" INTO v_match
  FROM public.matches WHERE id = v_req.match_id FOR UPDATE;

  v_free := public.get_config_number('provider_cancel_free_hours', 24);
  v_pct  := public.get_config_number('provider_cancel_penalty_pct', 50);
  v_hours := CASE WHEN v_match.starts_at IS NULL THEN NULL
                  ELSE EXTRACT(EPOCH FROM (v_match.starts_at - now())) / 3600.0 END;

  IF v_hours IS NOT NULL AND v_hours <= 0 THEN
    RAISE EXCEPTION 'MATCH_STARTED: Maç başladıktan sonra iş bırakılamaz.';
  END IF;

  v_penalty := CASE WHEN v_hours IS NULL OR v_hours >= v_free THEN 0
                    ELSE round(COALESCE(v_req.fee,0) * v_pct / 100.0, 2) END;

  SELECT COALESCE(name, full_name, 'Sağlayıcı') INTO v_provider_name FROM public.profiles WHERE id = v_uid;

  -- 1) Sağlayıcı kazancı iptal (CAPTURED'da EARNINGS PENDING satırı vardır)
  IF v_req.payment_intent_id IS NOT NULL THEN
    UPDATE public.wallet_transactions SET status = 'CANCELLED'
      WHERE reference_id = v_req.payment_intent_id AND balance_type = 'EARNINGS' AND status = 'PENDING';
    -- 2) Ödeme niyeti: tahsil edildiyse REFUNDED, henüz blokajdaysa VOIDED
    UPDATE public.payment_intents SET status = 'REFUNDED'
      WHERE id = v_req.payment_intent_id AND status = 'CAPTURED';
    UPDATE public.payment_intents SET status = 'VOIDED', voided_at = now(), void_reason = 'PROVIDER_CANCELLED'
      WHERE id = v_req.payment_intent_id AND status IN ('PENDING','BLOCKED');
  END IF;
  PERFORM public._sync_wallet_mirror(v_req.provider_id);

  -- 3) Kaptana ücret iadesi (cüzdan-fonluysa; kart-fonluda intent işareti yeterli — üst not)
  PERFORM public._refund_service_captain(v_req);

  -- 4) Geç iptal cezası: best-effort tahsilat + kaptana tazminat (no-show deseni)
  IF v_penalty > 0 THEN
    BEGIN
      PERFORM public.wallet_spend_balance(v_req.provider_id, v_penalty, 'MATCH', v_req.match_id, v_req.match_id,
        'İş bırakma cezası (' || COALESCE(v_match.title,'maç') || ')');
      INSERT INTO public.wallet_transactions
        (user_id, match_id, amount, type, balance_type, status, reference_type, reference_id, description)
      VALUES
        (v_req.requested_by, v_req.match_id, v_penalty, 'MATCH_REFUND', 'REFUND_CREDIT', 'COMPLETED',
         'MATCH', v_req.match_id, 'Geç iptal tazminatı (' || v_provider_name || ')');
      PERFORM public._sync_wallet_mirror(v_req.provider_id);
      PERFORM public._sync_wallet_mirror(v_req.requested_by);
      v_charged := true;
    EXCEPTION WHEN OTHERS THEN
      v_charged := false;
    END;
  END IF;

  -- 5) Maç kartındaki hayalet sağlayıcı temizliği (guard'lı)
  IF v_req.provider_type = 'GK' THEN
    UPDATE public.matches SET gk_id = NULL WHERE id = v_req.match_id AND gk_id = v_req.provider_id;
    UPDATE public.matches SET away_gk_id = NULL WHERE id = v_req.match_id AND away_gk_id = v_req.provider_id;
  ELSE
    UPDATE public.matches SET "refereeId" = NULL WHERE id = v_req.match_id AND "refereeId" = v_req.provider_id;
  END IF;

  -- 6) Talep kapanışı
  UPDATE public.service_requests
    SET status = 'CANCELLED', cancelled_at = now(), penalty_amount = v_penalty
    WHERE id = p_request_id;

  -- 7) Bildirimler
  INSERT INTO public.notifications (user_id, title, body, type_key, match_id, deep_link)
  VALUES (v_req.requested_by,
          CASE WHEN v_req.provider_type = 'GK' THEN 'Kaleci işi bıraktı ⚠️' ELSE 'Hakem işi bıraktı ⚠️' END,
          v_provider_name || ', ' || COALESCE(v_match.title,'maçın') || ' görevini bıraktı. ' ||
          CASE WHEN COALESCE(v_req.funding_source,'') = 'WALLET'
               THEN 'Ödemen cüzdanına iade edildi. '
               ELSE 'Kart ödemenin iadesi başlatıldı. ' END ||
          CASE WHEN v_charged THEN v_penalty || '₺ geç iptal tazminatı cüzdanına eklendi. ' ELSE '' END ||
          'Maç ekranından yeni sağlayıcı seçebilirsin.',
          'service_provider_cancelled', v_req.match_id, 'oyna://match/' || v_req.match_id);

  INSERT INTO public.notifications (user_id, title, body, type_key, match_id, deep_link)
  VALUES (v_req.provider_id, 'İşi bıraktın',
          COALESCE(v_match.title,'Maç') || ' görevini bıraktın.' ||
          CASE WHEN v_penalty > 0 AND v_charged THEN ' ' || v_penalty || '₺ geç iptal cezası kesildi.'
               WHEN v_penalty > 0 AND NOT v_charged THEN ' ' || v_penalty || '₺ geç iptal cezası bakiye yetersizliğinden tahsil edilemedi; hesabına borç olarak işlenebilir.'
               ELSE '' END ||
          COALESCE(' Not: ' || NULLIF(btrim(p_reason),''), ''),
          'service_provider_cancelled', v_req.match_id, 'oyna://match/' || v_req.match_id);

  RETURN jsonb_build_object('request_id', p_request_id, 'status', 'CANCELLED',
    'penalty', v_penalty, 'penalty_charged', v_charged,
    'hours_left', CASE WHEN v_hours IS NULL THEN NULL ELSE round(v_hours,1) END);
END; $function$;

REVOKE ALL ON FUNCTION public.provider_cancel_assignment(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.provider_cancel_assignment(uuid, text) TO authenticated, service_role;
