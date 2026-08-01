-- ════════════════════════════════════════════════════════════════════════════
-- DEĞERLENDİRME PENCERESİ — maç bitiminden 2 gün sonra kapanır
-- ════════════════════════════════════════════════════════════════════════════
-- KULLANICI KARARI: değerlendirilmemiş maçlar iki gün sonra listeden kalksın VE
-- puanlama kapısı da kapansın (yalnız görünüm değil, gerçek kapı).
--
-- PENCERE: maçın BİTİŞİNDEN sayılır (başlangıç + süre), başlangıcından değil.
-- Süre kayıtlı değilse 60 dakika varsayılır.
--
-- PARA GÜVENLİĞİ (kapıyı koymadan önce doğrulandı)
--   `submit_service_rating` puanlamayla birlikte görevlinin ödemesini serbest
--   bırakıyor. Kapı yüzünden kimsenin parası askıda kalmaz: ödeme zaten
--   `auto_release_service_payouts` ile maç başlangıcı + 3 saat + 48 saatte
--   (yaklaşık 51. saat) OTOMATİK serbest bırakılıyor. Değerlendirme penceresi
--   ise ~49. saatte kapanıyor. Yani pencere kapandıktan ~2 saat sonra ödeme
--   kendiliğinden yapılır — hiçbir hakediş kaybolmaz.
--
-- ESNEKLİK: gün sayısı `app_config.evaluation_window_days` ile deploysuz
--   değiştirilebilir (deponun `service_auto_release_hours` deseniyle aynı).
--
-- MUAFİYETLER
--   • Platform admini her zaman geçebilir (veri düzeltmesi gerekebilir).
--   • `starts_at` boş olan ESKİ maçlar engellenmez — pencere hesaplanamaz,
--     kapı kapatılırsa geçmiş veri sessizce kilitlenirdi.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Ortak kapı ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._eval_window_open(p_match_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_starts timestamptz;
  v_dk     int;
  v_gun    numeric;
BEGIN
  SELECT m.starts_at, COALESCE(m.duration_minutes, 60)
    INTO v_starts, v_dk
    FROM public.matches m
   WHERE m.id = p_match_id;

  -- Maç yoksa kapıyı açık bırak: asıl hatayı çağıran fonksiyon versin.
  IF NOT FOUND THEN RETURN true; END IF;
  -- Başlangıcı bilinmeyen eski kayıt → pencere hesaplanamaz, engelleme.
  IF v_starts IS NULL THEN RETURN true; END IF;

  v_gun := COALESCE(public.get_config_number('evaluation_window_days', 2), 2);
  RETURN now() <= (v_starts + make_interval(mins => v_dk) + make_interval(days => v_gun::int));
END;
$function$;

REVOKE ALL ON FUNCTION public._eval_window_open(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._eval_window_open(uuid) TO authenticated, service_role;

-- ── 1) Oyuncu değerlendirmesi ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.submit_match_evaluation(p_match_id uuid, p_ratings jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_rating jsonb;
  v_count  int := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF NOT public._is_match_participant(p_match_id, v_uid) AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'NOT_PARTICIPANT: Yalnızca maça katılanlar değerlendirebilir.';
  END IF;
  IF NOT public.is_platform_admin() AND NOT public._eval_window_open(p_match_id) THEN
    RAISE EXCEPTION 'EVAL_WINDOW_CLOSED: Degerlendirme suresi doldu.';
  END IF;

  FOR v_rating IN SELECT jsonb_array_elements(p_ratings) LOOP
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
$function$;

-- ── 2) Tesis (saha) değerlendirmesi ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.submit_pitch_rating(p_match_id uuid, p_score integer, p_tags text[] DEFAULT '{}'::text[], p_comment text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid   uuid := auth.uid();
  v_pitch uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF NOT public._is_match_participant(p_match_id, v_uid) AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'NOT_PARTICIPANT: Yalniz maca katilanlar sahayi degerlendirebilir.';
  END IF;
  IF NOT public.is_platform_admin() AND NOT public._eval_window_open(p_match_id) THEN
    RAISE EXCEPTION 'EVAL_WINDOW_CLOSED: Degerlendirme suresi doldu.';
  END IF;

  SELECT pitch_id INTO v_pitch FROM public.matches WHERE id = p_match_id;
  IF v_pitch IS NULL THEN RAISE EXCEPTION 'NO_PITCH: Maca bagli saha yok.'; END IF;

  INSERT INTO public.pitch_ratings (pitch_id, match_id, rater_id, score, tags, comment)
  VALUES (v_pitch, p_match_id, v_uid, LEAST(5, GREATEST(1, p_score)), COALESCE(p_tags, '{}'), p_comment)
  ON CONFLICT (match_id, rater_id) DO UPDATE SET
    score = EXCLUDED.score, tags = EXCLUDED.tags, comment = EXCLUDED.comment;

  PERFORM public._recompute_pitch_rating(v_pitch);

  RETURN jsonb_build_object('pitch_id', v_pitch, 'match_id', p_match_id, 'score', p_score);
END;
$function$;

-- ── 3) Kaleci / hakem değerlendirmesi ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.submit_service_rating(p_match_id uuid, p_provider_id uuid, p_provider_type text, p_score integer, p_comment text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_provider_type NOT IN ('GK','REF') THEN RAISE EXCEPTION 'INVALID_TYPE'; END IF;
  IF v_uid = p_provider_id THEN RAISE EXCEPTION 'CANNOT_RATE_SELF: Saglayici kendini puanlayamaz.'; END IF;
  IF NOT public._is_match_participant(p_match_id, v_uid) AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'NOT_PARTICIPANT: Yalniz maca katilanlar degerlendirebilir.'; END IF;
  IF NOT public.is_platform_admin() AND NOT public._eval_window_open(p_match_id) THEN
    RAISE EXCEPTION 'EVAL_WINDOW_CLOSED: Degerlendirme suresi doldu.'; END IF;
  INSERT INTO public.service_ratings (match_id, provider_id, provider_type, rater_id, score, comment)
  VALUES (p_match_id, p_provider_id, p_provider_type, v_uid, LEAST(10, GREATEST(1, p_score)), p_comment)
  ON CONFLICT (match_id, provider_id, rater_id) DO UPDATE SET score = EXCLUDED.score, comment = EXCLUDED.comment;
  PERFORM public._recompute_provider_rating(p_provider_id, p_provider_type);
  PERFORM public._release_service_payout(p_match_id, p_provider_id);
  RETURN jsonb_build_object('match_id', p_match_id, 'provider_id', p_provider_id, 'score', p_score);
END; $function$;

-- ── Ayar kaydı (deploysuz değiştirilebilsin) ────────────────────────────────
INSERT INTO public.app_config (key, value, value_type, category, label, description, is_public, min_value, max_value)
VALUES ('evaluation_window_days', '2'::jsonb, 'number', 'MAC',
        'Değerlendirme Süresi (gün)',
        'Maç bittikten kaç gün sonra puanlama kapanır. Görevli ücretleri bundan bağımsız olarak 48 saatte otomatik serbest bırakılır.',
        false, 1, 30)
ON CONFLICT (key) DO NOTHING;
