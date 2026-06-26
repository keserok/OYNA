-- ==============================================================================
-- FAZ 3 — Rezervasyon & Maç Çekirdeği: Maç Yaşam Döngüsü
-- 3.2: T-8s quorum onayı (min %70) → tahsil / tutmazsa otomatik iptal + iade
-- 3.3: açık/özel maç (private_code)
-- 3.4: skor + değerlendirme kalıcılığı + "başarılı maç" sinyali
-- ==============================================================================

-- ── Yeni kolonlar ───────────────────────────────────────────────────────────
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS visibility    text NOT NULL DEFAULT 'OPEN'
      CHECK (visibility IN ('OPEN','PRIVATE')),
  ADD COLUMN IF NOT EXISTS private_code  text,
  ADD COLUMN IF NOT EXISTS is_successful boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS confirmed_at  timestamptz,
  ADD COLUMN IF NOT EXISTS starts_at     timestamptz;

CREATE INDEX IF NOT EXISTS idx_matches_starts_at ON public.matches(starts_at)
  WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS idx_matches_private_code ON public.matches(private_code)
  WHERE private_code IS NOT NULL;

-- Mevcut maçlar için starts_at'i date+time metninden türet (best-effort)
UPDATE public.matches SET starts_at = (
  CASE WHEN date ~ '^\d{4}-\d{2}-\d{2}$' AND "time" ~ '^\d{1,2}:\d{2}'
       THEN (date::date + ("time"||':00')::time)::timestamptz
       ELSE NULL END)
WHERE starts_at IS NULL;

-- ── Yardımcı: maç doluluk/ödeme istatistiği (slots + awaySlots JSONB) ─────────
CREATE OR REPLACE FUNCTION public.match_fill_stats(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  m RECORD;
  v_total int := 0;
  v_taken int := 0;
  v_paid  int := 0;
  v_slot  jsonb;
BEGIN
  SELECT slots, "awaySlots" INTO m FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  FOR v_slot IN
    SELECT jsonb_array_elements(COALESCE(m.slots,'[]'::jsonb))
    UNION ALL
    SELECT jsonb_array_elements(COALESCE(m."awaySlots",'[]'::jsonb))
  LOOP
    v_total := v_total + 1;
    IF v_slot->>'status' = 'TAKEN' THEN
      v_taken := v_taken + 1;
      IF v_slot->'player'->>'paymentStatus' = 'PAID' THEN v_paid := v_paid + 1; END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'total', v_total, 'taken', v_taken, 'paid', v_paid,
    'paid_ratio', CASE WHEN v_total > 0 THEN round(v_paid::numeric / v_total, 4) ELSE 0 END
  );
END;
$$;
REVOKE ALL ON FUNCTION public.match_fill_stats(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.match_fill_stats(uuid) TO authenticated, service_role;

-- ── 3.2: process_match_at_deadline — T-8s onay/iptal kararı ───────────────────
-- Quorum tutarsa: CONFIRMED + BLOCKED pre-auth'ları tahsil et (capture)
-- Tutmazsa: CANCELLED + tüm aktif pre-auth'ları void et + ödenmiş kaporaları iade
CREATE OR REPLACE FUNCTION public.process_match_at_deadline(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  m         RECORD;
  v_stats   jsonb;
  v_quorum  numeric;
  v_ratio   numeric;
  v_intent  RECORD;
  v_captured int := 0;
  v_voided   int := 0;
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
    -- ONAY: kesin rezerve + bekleyen blokajları tahsil et
    UPDATE public.matches SET status = 'CONFIRMED', confirmed_at = now() WHERE id = p_match_id;

    FOR v_intent IN
      SELECT * FROM public.payment_intents
      WHERE match_id = p_match_id AND status IN ('BLOCKED','PENDING') FOR UPDATE
    LOOP
      UPDATE public.payment_intents SET status = 'CAPTURED', captured_at = now()
      WHERE id = v_intent.id;
      -- Saha sahibi kazancını EARNINGS (2 hafta beklemede) olarak yaz
      INSERT INTO public.wallet_transactions (user_id, amount, type, balance_type, status, reference_type, reference_id, description)
      SELECT p.owner_id, v_intent.owner_amount, 'MATCH_EARNING', 'EARNINGS', 'PENDING',
             'PAYMENT_INTENT', v_intent.id, 'Maç onaylandı — kapora tahsilatı'
      FROM public.pitches p WHERE p.id = v_intent.pitch_id AND p.owner_id IS NOT NULL;
      v_captured := v_captured + 1;
    END LOOP;

    RETURN jsonb_build_object('match_id', p_match_id, 'status', 'CONFIRMED',
      'paid_ratio', v_ratio, 'captured', v_captured);
  ELSE
    -- İPTAL: quorum tutmadı → blokajları serbest bırak (void) + kaporaları iade
    UPDATE public.matches SET status = 'CANCELLED',
      cancel_reason = 'QUORUM_NOT_MET', refund_status = 'PROCESSING' WHERE id = p_match_id;

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
      'paid_ratio', v_ratio, 'voided', v_voided);
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.process_match_at_deadline(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_match_at_deadline(uuid) TO authenticated, service_role;

-- ── 3.2: auto_process_matches — T-8s penceresine giren maçları işle (cron) ────
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

  FOR v_match IN
    SELECT id FROM public.matches
    WHERE status = 'ACTIVE'
      AND starts_at IS NOT NULL
      AND starts_at <= now() + make_interval(hours => v_window::int)
      AND starts_at > now()  -- henüz başlamamış
  LOOP
    PERFORM public.process_match_at_deadline(v_match.id);
    v_processed := v_processed + 1;
  END LOOP;

  RETURN jsonb_build_object('processed', v_processed, 'window_hours', v_window);
END;
$$;
REVOKE ALL ON FUNCTION public.auto_process_matches() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_process_matches() TO service_role;

-- 10 dakikada bir T-8s deadline kontrolü
SELECT cron.schedule('auto_process_matches', '*/10 * * * *',
  'SELECT public.auto_process_matches()')
WHERE NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto_process_matches');

-- ── 3.4: finalize_match — skor + "başarılı maç" sinyali + güvenilirlik ────────
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
  v_slot       jsonb;
  v_player_ids uuid[] := '{}';
BEGIN
  SELECT * INTO m FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  -- Yetki: maç sahibi/kaptan veya admin
  IF v_uid IS NOT NULL AND m."creatorId" IS DISTINCT FROM v_uid
     AND m.captain_id IS DISTINCT FROM v_uid AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;
  IF m.status = 'COMPLETED' THEN
    RETURN jsonb_build_object('match_id', p_match_id, 'status', 'COMPLETED', 'idempotent', true);
  END IF;

  -- "Başarılı maç": onaylanmış/tahsil edilmiş + iptal değil
  v_successful := (m.status IN ('CONFIRMED','LIVE')) AND m.cancel_reason IS NULL;

  UPDATE public.matches SET
    status = 'COMPLETED',
    "homeScore" = COALESCE(p_home_score, "homeScore"),
    "awayScore" = COALESCE(p_away_score, "awayScore"),
    "scoreEnteredAt" = CASE WHEN p_home_score IS NOT NULL THEN now() ELSE "scoreEnteredAt" END,
    is_successful = v_successful
  WHERE id = p_match_id;

  -- Katılımcıların güvenilirlik + maç sayısını artır (başarılı maçta)
  IF v_successful THEN
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
    'is_successful', v_successful, 'participants', array_length(v_player_ids, 1));
END;
$$;
REVOKE ALL ON FUNCTION public.finalize_match(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_match(uuid, integer, integer) TO authenticated, service_role;

-- ── 3.4: submit_match_evaluation — fair-play + oyuncu puanları kalıcılığı ─────
-- p_ratings: [{ "ratee_id": uuid, "skill_score": 1-10, "fair_play_score": 1-5 }, ...]
CREATE OR REPLACE FUNCTION public.submit_match_evaluation(
  p_match_id uuid,
  p_ratings  jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_rating jsonb;
  v_count  int := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF NOT public._is_match_participant(p_match_id, v_uid) AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'NOT_PARTICIPANT: Yalnızca maça katılanlar değerlendirebilir.';
  END IF;

  FOR v_rating IN SELECT jsonb_array_elements(p_ratings) LOOP
    -- Kendini puanlayamaz, aynı maçta tekrar puanlayamaz (idempotent upsert)
    IF (v_rating->>'ratee_id')::uuid = v_uid THEN CONTINUE; END IF;

    INSERT INTO public.player_ratings (match_id, rater_id, ratee_id, skill_score, fair_play_score)
    VALUES (
      p_match_id, v_uid, (v_rating->>'ratee_id')::uuid,
      LEAST(10, GREATEST(1, COALESCE((v_rating->>'skill_score')::int, 5))),
      LEAST(5,  GREATEST(1, COALESCE((v_rating->>'fair_play_score')::int, 3)))
    )
    ON CONFLICT (match_id, rater_id, ratee_id) DO UPDATE SET
      skill_score = EXCLUDED.skill_score,
      fair_play_score = EXCLUDED.fair_play_score;
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('match_id', p_match_id, 'ratings_saved', v_count);
END;
$$;
REVOKE ALL ON FUNCTION public.submit_match_evaluation(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_match_evaluation(uuid, jsonb) TO authenticated;

-- player_ratings: aynı (maç,puanlayan,puanlanan) için tek kayıt (idempotent eval)
CREATE UNIQUE INDEX IF NOT EXISTS uq_player_ratings_unique
  ON public.player_ratings(match_id, rater_id, ratee_id);

-- ── 3.3: join_private_match — özel kodla maça katılım çözümü ──────────────────
CREATE OR REPLACE FUNCTION public.resolve_private_match(p_code text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE m RECORD;
BEGIN
  IF p_code IS NULL OR length(trim(p_code)) < 4 THEN RAISE EXCEPTION 'INVALID_CODE'; END IF;
  SELECT id, title, status INTO m FROM public.matches
  WHERE private_code = upper(trim(p_code)) AND visibility = 'PRIVATE'
  ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Bu koda ait özel maç bulunamadı.'; END IF;
  RETURN jsonb_build_object('match_id', m.id, 'title', m.title, 'status', m.status);
END;
$$;
REVOKE ALL ON FUNCTION public.resolve_private_match(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_private_match(text) TO authenticated;

-- ── 3.3: player_create_match v2 — pitch_id, visibility, private_code, starts_at ──
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
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT is_banned INTO v_is_banned FROM public.profiles WHERE id = v_uid;
  IF v_is_banned THEN RAISE EXCEPTION 'Kullanıcı banlı!'; END IF;

  v_visibility := COALESCE(p_payload->>'visibility', 'OPEN');
  IF v_visibility = 'PRIVATE' THEN
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  END IF;

  v_date := p_payload->>'date';
  v_time := p_payload->>'time';
  v_starts_at := CASE
    WHEN v_date ~ '^\d{4}-\d{2}-\d{2}$' AND v_time ~ '^\d{1,2}:\d{2}'
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
    NULLIF(p_payload->>'pitch_id','')::uuid,
    v_visibility,
    v_code,
    v_starts_at
  );
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.player_create_match(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.player_create_match(jsonb) TO authenticated;
