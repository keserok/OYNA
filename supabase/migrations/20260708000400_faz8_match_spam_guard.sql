-- ============================================================
-- FAZ 8 — Maç spam koruması (BL-05) — EKLEMELİ, kırıcı değil
--
-- Tespit: player_create_match'te tek kısıt 'is_banned'; oran/kota YOK → banlı
-- olmayan bir hesap (veya bot) sınırsız maç açıp listeleri/bildirimleri kirletebilir.
-- Çözüm: matches'a BEFORE INSERT trigger; kullanıcı (creatorId) başına
-- saatte ≤5, günde ≤20 maç. Admin ve sistem (creatorId NULL) muaf.
-- Hem player_create_match (DEFINER) hem doğrudan INSERT yolunu kapsar.
-- ============================================================

CREATE OR REPLACE FUNCTION public.enforce_match_spam_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_hour   int;
  v_day    int;
  c_hour   constant int := 5;   -- saatlik tavan
  c_day    constant int := 20;  -- günlük tavan
BEGIN
  IF NEW."creatorId" IS NULL OR public.is_platform_admin() THEN
    RETURN NEW;  -- sistem/admin muaf
  END IF;

  SELECT count(*) INTO v_hour FROM public.matches
  WHERE "creatorId" = NEW."creatorId" AND created_at > now() - interval '1 hour';
  IF v_hour >= c_hour THEN
    RAISE EXCEPTION 'RATE_LIMIT: Saatte en fazla % maç oluşturabilirsiniz.', c_hour
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO v_day FROM public.matches
  WHERE "creatorId" = NEW."creatorId" AND created_at > now() - interval '24 hours';
  IF v_day >= c_day THEN
    RAISE EXCEPTION 'RATE_LIMIT: Günde en fazla % maç oluşturabilirsiniz.', c_day
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_match_spam ON public.matches;
CREATE TRIGGER trg_enforce_match_spam
  BEFORE INSERT ON public.matches
  FOR EACH ROW EXECUTE FUNCTION public.enforce_match_spam_guard();

-- Sayım sorgusu için indeks (varsa atla)
CREATE INDEX IF NOT EXISTS idx_matches_creator_created ON public.matches("creatorId", created_at);
