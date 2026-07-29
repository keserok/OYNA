-- ============================================================================
-- SKOR: SAHA SAHİBİ YETKİSİ + MAÇ BİTİŞ ZAMANI + SKORSUZ MAÇ DURUMU
-- ----------------------------------------------------------------------------
-- Ürün kararı (K2): Skoru YALNIZCA hakem veya saha sahibi girer. Kaptan ve
-- oyuncular giremez. Skor ancak maç bittikten sonra girilebilir.
--
-- Bu migrasyon o kararın uygulanabilmesi için gereken üç eksiği kapatır:
--
--  1) SAHA SAHİBİ YOLU KIRIKTI. get_or_create_match_score_token sahibin
--     yetkisini pitch_bookings.match_id üzerinden arıyordu; o kolonu hiçbir
--     kod yazmıyor (canlıda 27 rezervasyonun 0'ında dolu). Sahip maçı panelde
--     görüyor ama token RPC'si UNAUTHORIZED veriyordu. Yetki artık maçın
--     kendi tesis bağı (matches.pitch_id -> pitches.owner_id) üzerinden
--     kuruluyor; eski rezervasyon dalı geriye dönük uyumluluk için duruyor.
--
--  2) MAÇIN NE ZAMAN BİTTİĞİ BİLİNMİYORDU. duration serbest metindi
--     ('60 Dakika'), ends_at kolonu yoktu; repo genelinde "starts_at + 3 saat"
--     sezgisi kullanılıyordu (60 dakikalık maçta 2 saat gecikme). Artık
--     duration_minutes (sayı) ve ends_at (gerçek zaman) var.
--
--     NOT: ends_at bilerek GENERATED kolon DEĞİL. timestamptz + interval
--     operatörü Postgres'te STABLE'dır (IMMUTABLE değil), bu yüzden üretilmiş
--     kolon ifadesi olarak reddedilir. Trigger ile sürdürülüyor.
--
--  3) SKORSUZ MAÇ YALAN SÖYLÜYORDU. Skor girilmeyen maç arayüzde 0-0
--     beraberlik görünüyordu (MatchDiaryDetail'deki ?? 0 yedeği). score_status
--     artık bunu ayırt ediyor: PENDING / ENTERED / NOT_ENTERED.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. KOLONLAR
-- ----------------------------------------------------------------------------
-- duration_minutes: bilerek DEFAULT'suz ve nullable eklenir; trigger doldurur.
-- DEFAULT 60 verilseydi, duration='90 Dakika' ile gelen INSERT'te COALESCE
-- metni değil varsayılanı seçer ve 90 dakikalık maç 60 sanılırdı.
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS duration_minutes integer;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS ends_at timestamptz;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS score_status text;

COMMENT ON COLUMN public.matches.duration_minutes IS
  'Maç süresi (dakika). duration serbest metninden trigger ile türetilir; elle verilirse o kazanır. 5-300 dışı değerler 60''a çekilir.';
COMMENT ON COLUMN public.matches.ends_at IS
  'Maçın bitiş anı = starts_at + duration_minutes. Trigger ile sürdürülür (timestamptz+interval STABLE olduğu için GENERATED kolon olamaz). starts_at yoksa NULL.';
COMMENT ON COLUMN public.matches.score_status IS
  'Skor durumu — tamamen türetilmiştir, elle yazılmaz. ENTERED: skor girildi. NOT_ENTERED: maç bitti/kapandı ama skor girilmedi. PENDING: henüz beklenir.';

CREATE INDEX IF NOT EXISTS idx_matches_ends_at ON public.matches(ends_at);
CREATE INDEX IF NOT EXISTS idx_matches_score_status ON public.matches(score_status);

-- ----------------------------------------------------------------------------
-- 2. TRIGGER — duration_minutes, ends_at ve score_status'u sürdürür
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.matches_sync_time_and_score_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_parsed integer;
BEGIN
  -- 'duration' serbest metninden ilk sayıyı çıkar: '90 Dakika' -> 90
  v_parsed := NULLIF((regexp_match(COALESCE(NEW.duration, ''), '\d+'))[1], '')::integer;

  IF TG_OP = 'UPDATE'
     AND NEW.duration IS DISTINCT FROM OLD.duration
     AND NEW.duration_minutes IS NOT DISTINCT FROM OLD.duration_minutes THEN
    -- Metin değişti ama sayı elle verilmedi -> yeni metinden yeniden türet.
    NEW.duration_minutes := COALESCE(v_parsed, NEW.duration_minutes, 60);
  ELSE
    -- Elle verilen sayı her zaman metinden önce gelir.
    NEW.duration_minutes := COALESCE(NEW.duration_minutes, v_parsed, 60);
  END IF;

  -- Akıl dışı süreler zaman kapısını kilitleyebilir ('1 saat' -> 1 dakika gibi).
  IF NEW.duration_minutes < 5 OR NEW.duration_minutes > 300 THEN
    NEW.duration_minutes := 60;
  END IF;

  NEW.ends_at := CASE
    WHEN NEW.starts_at IS NOT NULL
      THEN NEW.starts_at + make_interval(mins => NEW.duration_minutes)
    ELSE NULL
  END;

  -- score_status tamamen türetilir; dışarıdan yazılan değer yok sayılır.
  NEW.score_status := CASE
    WHEN NEW."homeScore" IS NOT NULL AND NEW."awayScore" IS NOT NULL THEN 'ENTERED'
    WHEN NEW.status IN ('COMPLETED', 'CANCELLED') THEN 'NOT_ENTERED'
    ELSE 'PENDING'
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_matches_sync_time_and_score_status ON public.matches;
CREATE TRIGGER trg_matches_sync_time_and_score_status
  BEFORE INSERT OR UPDATE ON public.matches
  FOR EACH ROW EXECUTE FUNCTION public.matches_sync_time_and_score_status();

-- ----------------------------------------------------------------------------
-- 3. BACKFILL — trigger'ı mevcut satırlarda çalıştır
-- ----------------------------------------------------------------------------
UPDATE public.matches SET id = id;

ALTER TABLE public.matches ALTER COLUMN duration_minutes SET NOT NULL;
ALTER TABLE public.matches ALTER COLUMN score_status SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'matches_score_status_check'
  ) THEN
    ALTER TABLE public.matches ADD CONSTRAINT matches_score_status_check
      CHECK (score_status IN ('PENDING', 'ENTERED', 'NOT_ENTERED'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'matches_duration_minutes_check'
  ) THEN
    ALTER TABLE public.matches ADD CONSTRAINT matches_duration_minutes_check
      CHECK (duration_minutes BETWEEN 5 AND 300);
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 4. SKOR TOKEN YETKİSİ — saha sahibi yolunu onar
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_or_create_match_score_token(p_match_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_token TEXT;
  v_allowed BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Giriş gerekli.';
  END IF;

  SELECT (
    -- Hakem: K2'nin birincil skor yazarı.
    EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.id = p_match_id AND m."refereeId" = auth.uid()
    )
    -- Saha sahibi/personeli: maçın kendi tesis bağı üzerinden (ASIL ONARIM).
    OR EXISTS (
      SELECT 1 FROM public.matches m
      JOIN public.pitches p ON p.id = m.pitch_id
      WHERE m.id = p_match_id
        AND (p.owner_id = auth.uid() OR public.can_staff_pitch(p.id))
    )
    -- Geriye dönük: rezervasyon üzerinden bağlanmış maçlar (pitch_id boşsa).
    OR EXISTS (
      SELECT 1 FROM public.pitch_bookings pb
      JOIN public.pitches p ON p.id = pb.pitch_id
      WHERE pb.match_id = p_match_id
        AND (p.owner_id = auth.uid() OR public.can_staff_pitch(p.id))
    )
    OR public.is_platform_admin()
  ) INTO v_allowed;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Bu maç için QR üretme yetkiniz yok.';
  END IF;

  INSERT INTO public.match_score_tokens (match_id)
  VALUES (p_match_id)
  ON CONFLICT (match_id) DO UPDATE
    SET expires_at = NOW() + INTERVAL '4 hours',
        used_at = NULL,
        used_by = NULL
  RETURNING token INTO v_token;

  RETURN v_token;
END;
$$;

REVOKE ALL ON FUNCTION public.get_or_create_match_score_token(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_or_create_match_score_token(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. ZAMAN KAPISI — skor ancak maç bittikten sonra girilebilir
-- ----------------------------------------------------------------------------
-- submit_match_score: token ile giriş. Skor her zaman verilir -> kapı hep işler.
CREATE OR REPLACE FUNCTION public.submit_match_score(p_token text, p_home_score integer, p_away_score integer)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_match_id UUID;
  v_captain UUID;
  v_creator UUID;
  v_ends_at TIMESTAMPTZ;
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

  -- Maç bitmeden skor girilemez. Admin muaf (düzeltme/destek gerekebilir).
  SELECT ends_at INTO v_ends_at FROM public.matches WHERE id = v_match_id;
  IF v_ends_at IS NOT NULL AND NOW() < v_ends_at AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'TOO_EARLY: Skor ancak maç bittikten sonra girilebilir.';
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
$$;

-- finalize_match: kapı YALNIZ skor verildiğinde işler. Cron (auth.uid() IS NULL)
-- skorsuz kapanış yapar ve muaftır — zaten skor yazmıyor.
CREATE OR REPLACE FUNCTION public.finalize_match(p_match_id uuid, p_home_score integer DEFAULT NULL::integer, p_away_score integer DEFAULT NULL::integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  m RECORD; v_uid uuid := auth.uid(); v_successful boolean; v_award boolean := false;
  v_slot jsonb; v_player_ids uuid[] := '{}'; v_pid uuid;
BEGIN
  SELECT * INTO m FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_uid IS NOT NULL
     AND m."creatorId" IS DISTINCT FROM v_uid
     AND m.captain_id   IS DISTINCT FROM v_uid
     AND m."refereeId"  IS DISTINCT FROM v_uid
     AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  -- Maç bitmeden skor girilemez. Cron ve admin muaf.
  IF p_home_score IS NOT NULL
     AND v_uid IS NOT NULL
     AND m.ends_at IS NOT NULL
     AND now() < m.ends_at
     AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'TOO_EARLY: Skor ancak maç bittikten sonra girilebilir.';
  END IF;

  v_successful := (m.confirmed_at IS NOT NULL) AND (m.cancel_reason IS NULL);
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
    IF m.starts_at IS NOT NULL AND m.starts_at > now() - interval '7 days' THEN
      FOREACH v_pid IN ARRAY v_player_ids LOOP
        INSERT INTO public.notifications (user_id, title, body, type_key, match_id, deep_link)
        VALUES (v_pid, 'Maç tamamlandı — değerlendir ⭐',
                COALESCE(m.title,'Maçın') || ' sona erdi. Takım arkadaşlarını ve kaleci/hakemi değerlendir.',
                'match_completed_evaluate', p_match_id, 'oyna://match/' || p_match_id::text || '/eval');
      END LOOP;
    END IF;
  END IF;
  RETURN jsonb_build_object('match_id', p_match_id, 'status', 'COMPLETED',
    'is_successful', v_successful, 'awarded', v_award,
    'participants', array_length(v_player_ids, 1));
END;
$$;
