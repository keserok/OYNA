-- ==============================================================================
-- FAZ 3 Düzeltmeleri — adversarial denetim bulguları (14 bulgu)
-- CRITICAL: iptalde MATCH_FEE kaporaları iade et (para kaybı)
-- HIGH: onayda owner kazancını CÜZDAN sisteminden settle et; başarı sinyali
--       gerçek onaya bağla; status spoof/clobber engelle; otomatik finalize
-- MEDIUM/LOW: pitch_id doğrulama, overdue backstop, time regex anchor
-- ==============================================================================

-- ── process_match_at_deadline: GERÇEK cüzdan sistemiyle uzlaştır ──────────────
-- Onayda: toplanan MATCH_FEE'den owner kazancını yaz (+forward-compat intent capture)
-- İptalde: MATCH_FEE kaporalarını wallet_balance'a İADE et (CRITICAL fix)
CREATE OR REPLACE FUNCTION public.process_match_at_deadline(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  m          RECORD;
  v_stats    jsonb;
  v_quorum   numeric;
  v_ratio    numeric;
  v_intent   RECORD;
  v_fee      RECORD;
  v_collected numeric;
  v_comm     jsonb;
  v_captured int := 0;
  v_voided   int := 0;
  v_refunded int := 0;
BEGIN
  SELECT * INTO m FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF m.status IN ('CONFIRMED','CANCELLED','COMPLETED','LIVE') THEN
    RETURN jsonb_build_object('match_id', p_match_id, 'status', m.status, 'idempotent', true);
  END IF;

  SELECT COALESCE(min_quorum_pct, 70) INTO v_quorum FROM public.settings LIMIT 1;
  v_quorum := COALESCE(v_quorum, 70) / 100.0;
  v_stats  := public.match_fill_stats(p_match_id);
  v_ratio  := (v_stats->>'paid_ratio')::numeric;

  IF v_ratio >= v_quorum THEN
    UPDATE public.matches SET status = 'CONFIRMED', confirmed_at = now() WHERE id = p_match_id;

    -- (A) GERÇEK sistem: toplanan MATCH_FEE'den saha sahibi kazancını yaz
    SELECT COALESCE(SUM(ABS(amount)), 0) INTO v_collected
    FROM public.wallet_transactions WHERE match_id = p_match_id AND type = 'MATCH_FEE';

    IF v_collected > 0 AND m.pitch_id IS NOT NULL THEN
      v_comm := public.calculate_commission(v_collected, 'PITCH', m.pitch_id);
      INSERT INTO public.wallet_transactions
        (user_id, match_id, amount, type, balance_type, status, reference_type, reference_id, description)
      SELECT p.owner_id, (v_comm->>'net_amount')::numeric, 'MATCH_EARNING', 'EARNINGS', 'PENDING',
             'MATCH', p_match_id, 'Maç onaylandı — kapora tahsilatı (2 hafta beklemede)'
      FROM public.pitches p WHERE p.id = m.pitch_id AND p.owner_id IS NOT NULL;
    END IF;

    -- (B) Forward-compat: varsa pre-auth intent'leri de capture et
    FOR v_intent IN
      SELECT * FROM public.payment_intents
      WHERE match_id = p_match_id AND status IN ('BLOCKED','PENDING') FOR UPDATE
    LOOP
      UPDATE public.payment_intents SET status = 'CAPTURED', captured_at = now()
      WHERE id = v_intent.id;
      v_captured := v_captured + 1;
    END LOOP;

    RETURN jsonb_build_object('match_id', p_match_id, 'status', 'CONFIRMED',
      'paid_ratio', v_ratio, 'collected', v_collected, 'captured_intents', v_captured);
  ELSE
    UPDATE public.matches SET status = 'CANCELLED', cancel_reason = 'QUORUM_NOT_MET',
      refund_status = 'PROCESSING' WHERE id = p_match_id;

    -- (A) GERÇEK sistem: MATCH_FEE kaporalarını wallet_balance'a İADE et (idempotent)
    FOR v_fee IN
      SELECT wt.user_id, ABS(wt.amount) AS amt
      FROM public.wallet_transactions wt
      WHERE wt.match_id = p_match_id AND wt.type = 'MATCH_FEE'
        AND NOT EXISTS (
          SELECT 1 FROM public.wallet_transactions r
          WHERE r.match_id = p_match_id AND r.user_id = wt.user_id AND r.type = 'MATCH_REFUND'
        )
    LOOP
      UPDATE public.profiles SET wallet_balance = COALESCE(wallet_balance, 0) + v_fee.amt
      WHERE id = v_fee.user_id;
      INSERT INTO public.wallet_transactions (user_id, match_id, amount, type, description)
      VALUES (v_fee.user_id, p_match_id, v_fee.amt, 'MATCH_REFUND', 'Maç iptal — kapora iadesi');
      v_refunded := v_refunded + 1;
    END LOOP;

    -- (B) Forward-compat: varsa pre-auth intent'leri void et
    FOR v_intent IN
      SELECT * FROM public.payment_intents
      WHERE match_id = p_match_id AND status IN ('BLOCKED','PENDING') FOR UPDATE
    LOOP
      UPDATE public.payment_intents SET status = 'VOIDED', voided_at = now(),
        void_reason = 'MATCH_QUORUM_NOT_MET' WHERE id = v_intent.id;
      v_voided := v_voided + 1;
    END LOOP;

    UPDATE public.matches SET refund_status = 'DONE' WHERE id = p_match_id;

    RETURN jsonb_build_object('match_id', p_match_id, 'status', 'CANCELLED',
      'paid_ratio', v_ratio, 'refunded', v_refunded, 'voided_intents', v_voided);
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.process_match_at_deadline(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_match_at_deadline(uuid) TO authenticated, service_role;

-- ── auto_process_matches: overdue (starts_at geçmiş) maçları da işle (backstop) ──
CREATE OR REPLACE FUNCTION public.auto_process_matches()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_window  numeric;
  v_match   RECORD;
  v_processed int := 0;
BEGIN
  SELECT COALESCE(capture_window_hours, 8) INTO v_window FROM public.settings LIMIT 1;
  v_window := COALESCE(v_window, 8);

  -- T-8s penceresine giren VEYA başlangıcı geçmiş (overdue) ACTIVE maçlar
  FOR v_match IN
    SELECT id FROM public.matches
    WHERE status = 'ACTIVE'
      AND starts_at IS NOT NULL
      AND starts_at <= now() + make_interval(hours => v_window::int)
  LOOP
    PERFORM public.process_match_at_deadline(v_match.id);
    v_processed := v_processed + 1;
  END LOOP;

  RETURN jsonb_build_object('processed', v_processed, 'window_hours', v_window);
END;
$$;
REVOKE ALL ON FUNCTION public.auto_process_matches() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_process_matches() TO service_role;

-- ── finalize_match: başarıyı GERÇEK onaya bağla + idempotent ödül ─────────────
CREATE OR REPLACE FUNCTION public.finalize_match(
  p_match_id   uuid,
  p_home_score integer DEFAULT NULL,
  p_away_score integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  m            RECORD;
  v_uid        uuid := auth.uid();
  v_successful boolean;
  v_award      boolean := false;
  v_slot       jsonb;
  v_player_ids uuid[] := '{}';
BEGIN
  SELECT * INTO m FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  -- Yetki: maç sahibi/kaptan veya admin (cron'da auth.uid()=NULL → izinli)
  IF v_uid IS NOT NULL AND m."creatorId" IS DISTINCT FROM v_uid
     AND m.captain_id IS DISTINCT FROM v_uid AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  -- "Başarılı maç": GERÇEK onay (confirmed_at) + iptal değil — status string'e GÜVENME
  v_successful := (m.confirmed_at IS NOT NULL) AND (m.cancel_reason IS NULL);
  -- Ödül yalnız bir kez (idempotent): daha önce işaretlenmemişse
  v_award := v_successful AND (m.is_successful IS NOT TRUE);

  UPDATE public.matches SET
    status = 'COMPLETED',
    "homeScore" = COALESCE(p_home_score, "homeScore"),
    "awayScore" = COALESCE(p_away_score, "awayScore"),
    "scoreEnteredAt" = CASE WHEN p_home_score IS NOT NULL THEN now() ELSE "scoreEnteredAt" END,
    is_successful = v_successful
  WHERE id = p_match_id;

  IF v_award THEN
    FOR v_slot IN
      SELECT jsonb_array_elements(COALESCE(m.slots,'[]'::jsonb))
      UNION ALL
      SELECT jsonb_array_elements(COALESCE(m."awaySlots",'[]'::jsonb))
    LOOP
      IF v_slot->>'status' = 'TAKEN' AND (v_slot->'player'->>'id') IS NOT NULL THEN
        v_player_ids := array_append(v_player_ids, (v_slot->'player'->>'id')::uuid);
      END IF;
    END LOOP;

    UPDATE public.profiles SET
      match_count = COALESCE(match_count, 0) + 1,
      reliability_score = LEAST(100, COALESCE(reliability_score, 100) + 1)
    WHERE id = ANY(v_player_ids);
  END IF;

  RETURN jsonb_build_object('match_id', p_match_id, 'status', 'COMPLETED',
    'is_successful', v_successful, 'awarded', v_award,
    'participants', array_length(v_player_ids, 1));
END;
$$;
REVOKE ALL ON FUNCTION public.finalize_match(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_match(uuid, integer, integer) TO authenticated, service_role;

-- ── auto_finalize_matches: oynanmış onaylı maçları OTOMATİK sonlandır (§3.4) ──
-- QR-skor (submit_match_score) veya değerlendirme yapılmasa bile başarı sinyali oluşsun
CREATE OR REPLACE FUNCTION public.auto_finalize_matches()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_match     RECORD;
  v_finalized int := 0;
BEGIN
  -- Başlangıcından ~3 saat geçmiş, onaylı, iptal olmamış, henüz ödüllenmemiş maçlar
  FOR v_match IN
    SELECT id FROM public.matches
    WHERE confirmed_at IS NOT NULL
      AND cancel_reason IS NULL
      AND is_successful IS NOT TRUE
      AND starts_at IS NOT NULL
      AND starts_at < now() - interval '3 hours'
      AND status IN ('CONFIRMED','LIVE','COMPLETED')
  LOOP
    PERFORM public.finalize_match(v_match.id);
    v_finalized := v_finalized + 1;
  END LOOP;

  RETURN jsonb_build_object('finalized', v_finalized);
END;
$$;
REVOKE ALL ON FUNCTION public.auto_finalize_matches() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_finalize_matches() TO service_role;

SELECT cron.schedule('auto_finalize_matches', '*/15 * * * *',
  'SELECT public.auto_finalize_matches()')
WHERE NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto_finalize_matches');

-- ── player_update_match: status whitelist (spoof + clobber engelle) ──────────
-- Kullanıcı yalnız DRAFT/ACTIVE/CANCELLED arası geçiş yapabilir; sistem durumları
-- (CONFIRMED/LIVE/COMPLETED) yalnız lifecycle fonksiyonları tarafından yazılır
CREATE OR REPLACE FUNCTION public.player_update_match(p_match_id uuid, p_payload jsonb)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_is_banned boolean;
  v_is_participant boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT is_banned INTO v_is_banned FROM public.profiles WHERE id = v_uid;
  IF v_is_banned THEN RAISE EXCEPTION 'Kullanıcı banlı!'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.matches m
    WHERE m.id = p_match_id
    AND (
      m."creatorId" = v_uid
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(m.slots, '[]'::jsonb)) s WHERE (s->'player'->>'id')::uuid = v_uid)
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(m."awaySlots", '[]'::jsonb)) s WHERE (s->'player'->>'id')::uuid = v_uid)
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(m."reservePlayers", '[]'::jsonb)) s WHERE (s->>'id')::uuid = v_uid)
    )
  ) INTO v_is_participant;

  IF NOT v_is_participant AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  UPDATE public.matches SET
    slots = CASE WHEN p_payload ? 'slots' THEN p_payload->'slots' ELSE slots END,
    "awaySlots" = CASE WHEN p_payload ? 'awaySlots' THEN p_payload->'awaySlots' ELSE "awaySlots" END,
    "reservePlayers" = CASE WHEN p_payload ? 'reservePlayers' THEN p_payload->'reservePlayers' ELSE "reservePlayers" END,
    "chatMessages" = CASE WHEN p_payload ? 'chatMessages' THEN p_payload->'chatMessages' ELSE "chatMessages" END,
    "homeTeamId" = CASE WHEN p_payload ? 'homeTeamId' THEN NULLIF(p_payload->>'homeTeamId', '')::uuid ELSE "homeTeamId" END,
    "awayTeamId" = CASE WHEN p_payload ? 'awayTeamId' THEN NULLIF(p_payload->>'awayTeamId', '')::uuid ELSE "awayTeamId" END,
    -- status: yalnız kullanıcı durumları arası (DRAFT/ACTIVE→DRAFT/ACTIVE/CANCELLED);
    -- sistem durumlarını (CONFIRMED/LIVE/COMPLETED) kullanıcı yazamaz/ezemez
    status = CASE
      WHEN p_payload ? 'status'
           AND status IN ('DRAFT','ACTIVE')
           AND (p_payload->>'status') IN ('DRAFT','ACTIVE','CANCELLED')
      THEN p_payload->>'status'
      ELSE status END,
    format = CASE WHEN p_payload ? 'format' THEN p_payload->>'format' ELSE format END,
    duration = CASE WHEN p_payload ? 'duration' THEN p_payload->>'duration' ELSE duration END,
    gender = CASE WHEN p_payload ? 'gender' THEN p_payload->>'gender' ELSE gender END,
    "ageGroup" = CASE WHEN p_payload ? 'ageGroup' THEN p_payload->>'ageGroup' ELSE "ageGroup" END,
    "homeScore" = CASE WHEN p_payload ? 'homeScore' THEN (p_payload->>'homeScore')::int ELSE "homeScore" END,
    "awayScore" = CASE WHEN p_payload ? 'awayScore' THEN (p_payload->>'awayScore')::int ELSE "awayScore" END,
    "scoreEnteredAt" = CASE WHEN p_payload ? 'scoreEnteredAt' THEN (p_payload->>'scoreEnteredAt')::timestamptz ELSE "scoreEnteredAt" END
  WHERE id = p_match_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Maç bulunamadı'; END IF;
  RETURN TRUE;
END;
$$;
REVOKE ALL ON FUNCTION public.player_update_match(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.player_update_match(uuid, jsonb) TO authenticated;

-- ── player_create_match: pitch_id doğrulama + time regex anchor ──────────────
CREATE OR REPLACE FUNCTION public.player_create_match(p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id        uuid := gen_random_uuid();
  v_uid       uuid := auth.uid();
  v_is_banned boolean;
  v_visibility text;
  v_code      text;
  v_starts_at timestamptz;
  v_date      text;
  v_time      text;
  v_pitch_id  uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT is_banned INTO v_is_banned FROM public.profiles WHERE id = v_uid;
  IF v_is_banned THEN RAISE EXCEPTION 'Kullanıcı banlı!'; END IF;

  v_pitch_id := NULLIF(p_payload->>'pitch_id','')::uuid;
  -- Saha verildiyse gerçek + onaylı olmalı (yanlış owner kredisi/sahte rezerve önle)
  IF v_pitch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.pitches WHERE id = v_pitch_id AND verification_status = 'approved'
  ) THEN
    RAISE EXCEPTION 'INVALID_PITCH: Geçersiz veya onaysız saha.';
  END IF;

  v_visibility := COALESCE(p_payload->>'visibility', 'OPEN');
  IF v_visibility = 'PRIVATE' THEN
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  END IF;

  v_date := p_payload->>'date';
  v_time := p_payload->>'time';
  v_starts_at := CASE
    WHEN v_date ~ '^\d{4}-\d{2}-\d{2}$' AND v_time ~ '^\d{1,2}:\d{2}$'
    THEN (v_date::date + (v_time||':00')::time)::timestamptz ELSE NULL END;

  INSERT INTO public.matches (
    id, title, location, date, "time", price, difficulty, status, format,
    duration, gender, "ageGroup", image, badges, "minRating", "missingPositions",
    slots, "awaySlots", "creatorId", captain_id, "isDemo",
    pitch_id, visibility, private_code, starts_at
  ) VALUES (
    v_id,
    COALESCE(p_payload->>'title', 'Yeni Maç'),
    COALESCE(p_payload->>'location', ''),
    COALESCE((p_payload->>'date')::date, CURRENT_DATE),
    COALESCE(p_payload->>'time', '20:00'),
    COALESCE((p_payload->>'price')::numeric, 0),
    COALESCE(p_payload->>'difficulty', 'Rahat'),
    COALESCE(p_payload->>'status', 'ACTIVE'),
    COALESCE(p_payload->>'format', '7v7'),
    p_payload->>'duration',
    p_payload->>'gender',
    p_payload->>'ageGroup',
    p_payload->>'image',
    COALESCE(p_payload->'badges', '[]'::jsonb),
    COALESCE((p_payload->>'minRating')::numeric, 3.0),
    COALESCE(p_payload->'missingPositions', '[]'::jsonb),
    COALESCE(p_payload->'slots', '[]'::jsonb),
    COALESCE(p_payload->'awaySlots', '[]'::jsonb),
    v_uid, v_uid, false,
    v_pitch_id, v_visibility, v_code, v_starts_at
  );
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.player_create_match(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.player_create_match(jsonb) TO authenticated;
