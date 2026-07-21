-- ============================================================================
-- MAÇ ↔ SAHA (KORT) BAĞI + QR SKOR GİRİŞİ BİLDİRİMLERİ
-- ----------------------------------------------------------------------------
-- DRIFT ONARIMI NOTU (2026-07-21): Canlıya MCP ile uygulanmış (ledger:
-- 20260721003434|mac_saha_bagi) ancak repoya commit'lenmemişti. İçerik canlı
-- ledger'daki statements kaydından BİREBİR aktarılmıştır; canlıda uygulandığı
-- için ledger'da "applied" işaretlidir, sıfırdan replay'de normal koşar
-- (backfill UPDATE boş veritabanında 0 satır etkiler — güvenli).
-- ============================================================================

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS court_id uuid REFERENCES public.courts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_matches_court ON public.matches(court_id);

COMMENT ON COLUMN public.matches.court_id IS
  'Maçın oynandığı saha (court). Rezervasyonla oluşan maçlarda booking.court_id ile eşlenir; null olabilir (saha seçilmemiş).';

UPDATE public.matches m
SET court_id = b.court_id
FROM public.pitch_bookings b
WHERE b.match_id = m.id
  AND m.court_id IS NULL
  AND b.court_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.submit_match_score(p_token text, p_home_score integer, p_away_score integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_match_id UUID;
  v_captain UUID;
  v_creator UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_home_score IS NULL OR p_away_score IS NULL OR p_home_score < 0 OR p_away_score < 0 OR p_home_score > 50 OR p_away_score > 50 THEN
    RAISE EXCEPTION 'INVALID_SCORE';
  END IF;
  SELECT match_id INTO v_match_id FROM public.match_score_tokens
    WHERE token = p_token AND expires_at > NOW() AND used_at IS NULL FOR UPDATE;
  IF v_match_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_TOKEN: QR kodu gecersiz veya suresi dolmus.';
  END IF;
  UPDATE public.matches
    SET "homeScore" = p_home_score, "awayScore" = p_away_score,
        status = 'COMPLETED', "scoreEnteredAt" = NOW()
    WHERE id = v_match_id;
  UPDATE public.match_score_tokens SET used_at = NOW(), used_by = auth.uid() WHERE token = p_token;

  UPDATE public.match_score_proposals
    SET status = 'SUPERSEDED', resolved_at = NOW()
    WHERE match_id = v_match_id AND status = 'PENDING';

  SELECT captain_id, "creatorId" INTO v_captain, v_creator FROM public.matches WHERE id = v_match_id;

  INSERT INTO public.notifications (user_id, title, body, type_key, match_id, action_required)
  SELECT uid, 'Mac skoru girildi',
         format('Mac skoru girildi: %s-%s. Onaylar misin?', p_home_score, p_away_score),
         'MATCH_SCORE_CONFIRM', v_match_id, true
  FROM (SELECT DISTINCT uid FROM unnest(ARRAY[v_captain, v_creator]) AS uid WHERE uid IS NOT NULL) q;

  INSERT INTO public.notifications (user_id, title, body, type_key, match_id, action_required)
  SELECT DISTINCT mp.user_id, 'Mac skoru girildi',
         format('Oynadigin macin skoru girildi: %s-%s', p_home_score, p_away_score),
         'MATCH_SCORE_ENTERED', v_match_id, false
  FROM public.match_participants mp
  WHERE mp.match_id = v_match_id
    AND mp.user_id IS NOT NULL
    AND mp.user_id NOT IN (
      COALESCE(v_captain, '00000000-0000-0000-0000-000000000000'::uuid),
      COALESCE(v_creator, '00000000-0000-0000-0000-000000000000'::uuid)
    );

  RETURN v_match_id;
END;
$function$;
