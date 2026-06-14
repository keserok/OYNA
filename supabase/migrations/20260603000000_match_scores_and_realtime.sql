-- ==============================================================================
-- OYNA: Skor Sistemi + Vitrin Alanları + Realtime
-- ==============================================================================
-- Tesis sahibi VEYA hakem maç skoru girer, kaptan onaylarıyla mühürlenir.
-- Vitrin Stüdyosu için showcase alanları eklenir.
-- pitch_bookings + individual_matches + pitches realtime'a kaydedilir.
-- ==============================================================================

-- 1. INDIVIDUAL_MATCHES tablosuna skor ve onay alanları
ALTER TABLE public.individual_matches
  ADD COLUMN IF NOT EXISTS home_score INT,
  ADD COLUMN IF NOT EXISTS away_score INT,
  ADD COLUMN IF NOT EXISTS score_entered_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS score_entered_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS score_entered_role VARCHAR(20) CHECK (score_entered_role IN ('OWNER', 'REFEREE')),
  ADD COLUMN IF NOT EXISTS home_captain_approved BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS away_captain_approved BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS home_captain_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS away_captain_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS referee_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS score_locked_at TIMESTAMP WITH TIME ZONE;

-- 2. PITCHES tablosuna vitrin alanları
ALTER TABLE public.pitches
  ADD COLUMN IF NOT EXISTS showcase_campaign JSONB,
  ADD COLUMN IF NOT EXISTS featured_amenities TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS cover_image_index INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quality_grades JSONB DEFAULT '{"grass":"B","lighting":"B","lockerRoom":"B"}'::jsonb,
  ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT true;

-- 3. SKOR KAYIT RPC (Atomic - yetki kontrolü dahil)
CREATE OR REPLACE FUNCTION public.record_match_score(
  p_match_id UUID,
  p_home INT,
  p_away INT,
  p_by_role VARCHAR
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pitch_owner UUID;
  v_referee UUID;
  v_existing_score_at TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Maçın sahibini ve hakemini bul
  SELECT p.owner_id, m.referee_id, m.score_entered_at
    INTO v_pitch_owner, v_referee, v_existing_score_at
    FROM individual_matches m
    JOIN pitches p ON p.id = m.pitch_id
    WHERE m.id = p_match_id;

  IF v_pitch_owner IS NULL THEN
    RAISE EXCEPTION 'Maç bulunamadı';
  END IF;

  -- Skor zaten girildiyse, sadece atanan yetkili tekrar girebilir
  IF v_existing_score_at IS NOT NULL AND p_by_role != 'REFEREE' THEN
    RAISE EXCEPTION 'Skor zaten girilmiş';
  END IF;

  -- Yetki kontrolü
  IF p_by_role = 'OWNER' THEN
    IF auth.uid() != v_pitch_owner THEN
      RAISE EXCEPTION 'Bu maça skor girme yetkiniz yok (tesis sahibi değilsiniz)';
    END IF;
    -- Hakem atanmışsa owner skor giremez
    IF v_referee IS NOT NULL THEN
      RAISE EXCEPTION 'Bu maça hakem atanmış - skoru hakem girmeli';
    END IF;
  ELSIF p_by_role = 'REFEREE' THEN
    IF auth.uid() != v_referee THEN
      RAISE EXCEPTION 'Bu maçın hakemi siz değilsiniz';
    END IF;
  ELSE
    RAISE EXCEPTION 'Geçersiz rol: %', p_by_role;
  END IF;

  IF p_home < 0 OR p_away < 0 OR p_home > 99 OR p_away > 99 THEN
    RAISE EXCEPTION 'Skor 0-99 aralığında olmalı';
  END IF;

  UPDATE individual_matches SET
    home_score = p_home,
    away_score = p_away,
    score_entered_at = NOW(),
    score_entered_by = auth.uid(),
    score_entered_role = p_by_role,
    home_captain_approved = false,
    away_captain_approved = false,
    status = 'COMPLETED'
  WHERE id = p_match_id;

  RETURN jsonb_build_object(
    'success', true,
    'match_id', p_match_id,
    'home_score', p_home,
    'away_score', p_away,
    'entered_by_role', p_by_role,
    'awaiting_captains', true
  );
END $$;

GRANT EXECUTE ON FUNCTION public.record_match_score TO authenticated;

-- 4. KAPTAN ONAY RPC
CREATE OR REPLACE FUNCTION public.approve_match_score(
  p_match_id UUID,
  p_side VARCHAR -- 'home' veya 'away'
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_home_captain UUID;
  v_away_captain UUID;
  v_home_approved BOOLEAN;
  v_away_approved BOOLEAN;
  v_locked_at TIMESTAMP WITH TIME ZONE;
BEGIN
  SELECT home_captain_id, away_captain_id, home_captain_approved, away_captain_approved
    INTO v_home_captain, v_away_captain, v_home_approved, v_away_approved
    FROM individual_matches WHERE id = p_match_id;

  IF p_side = 'home' THEN
    IF auth.uid() != v_home_captain THEN
      RAISE EXCEPTION 'Ev sahibi kaptanı siz değilsiniz';
    END IF;
    UPDATE individual_matches SET home_captain_approved = true WHERE id = p_match_id;
    v_home_approved := true;
  ELSIF p_side = 'away' THEN
    IF auth.uid() != v_away_captain THEN
      RAISE EXCEPTION 'Deplasman kaptanı siz değilsiniz';
    END IF;
    UPDATE individual_matches SET away_captain_approved = true WHERE id = p_match_id;
    v_away_approved := true;
  ELSE
    RAISE EXCEPTION 'Geçersiz taraf: %', p_side;
  END IF;

  -- İki kaptan da onayladıysa mühürle
  IF v_home_approved AND v_away_approved THEN
    UPDATE individual_matches SET score_locked_at = NOW() WHERE id = p_match_id;
    v_locked_at := NOW();
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'home_approved', v_home_approved,
    'away_approved', v_away_approved,
    'locked', v_locked_at IS NOT NULL
  );
END $$;

GRANT EXECUTE ON FUNCTION public.approve_match_score TO authenticated;

-- 5. REALTIME PUBLICATIONS
-- (Var olan publication'a tablo eklemek; çakışma olursa atla)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.pitch_bookings;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.individual_matches;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.pitches;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

-- 6. İNDEKSLER - skor sorguları için
CREATE INDEX IF NOT EXISTS idx_individual_matches_pitch_status
  ON public.individual_matches (pitch_id, status);
CREATE INDEX IF NOT EXISTS idx_individual_matches_score_pending
  ON public.individual_matches (score_entered_at)
  WHERE score_locked_at IS NULL AND status = 'COMPLETED';
CREATE INDEX IF NOT EXISTS idx_pitch_bookings_date_pitch
  ON public.pitch_bookings (pitch_id, booking_date, start_time);
