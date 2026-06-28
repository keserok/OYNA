-- ============================================================
-- FAZ 8 — Maç spam koruması (BL-05) — EKLEMELİ, kırıcı değil
--
-- Tespit: player_create_match'te tek kısıt 'is_banned'; oran/kota YOK → banlı
-- olmayan bir hesap (veya bot) sınırsız maç açıp listeleri/bildirimleri kirletebilir.
-- Çözüm: matches'a BEFORE INSERT trigger; kullanıcı (creatorId) başına saatlik/günlük tavan.
-- Admin ve sistem (creatorId NULL) muaf. Hem player_create_match (DEFINER) hem doğrudan INSERT.
--
-- Eşikler app_config'ten okunur → admin panelden ayarlanabilir (GÜVENLİK kategorisi).
-- ============================================================

INSERT INTO public.app_config (key, value, value_type, category, label, description, is_public, min_value, max_value, updated_at)
VALUES
  ('sec_match_create_per_hour', '5'::jsonb, 'number', 'GÜVENLİK',
   'Saatlik maç oluşturma tavanı',
   'Bir kullanıcının 1 saatte oluşturabileceği maç sayısı (anti-spam).', false, 1, 50, now()),
  ('sec_match_create_per_day', '20'::jsonb, 'number', 'GÜVENLİK',
   'Günlük maç oluşturma tavanı',
   'Bir kullanıcının 24 saatte oluşturabileceği maç sayısı (anti-spam).', false, 1, 200, now())
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.enforce_match_spam_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_hour int;
  v_day  int;
  v_max_hour int := COALESCE((SELECT (value #>> '{}')::int FROM public.app_config WHERE key = 'sec_match_create_per_hour'), 5);
  v_max_day  int := COALESCE((SELECT (value #>> '{}')::int FROM public.app_config WHERE key = 'sec_match_create_per_day'), 20);
BEGIN
  IF NEW."creatorId" IS NULL OR public.is_platform_admin() THEN
    RETURN NEW;  -- sistem/admin muaf
  END IF;

  SELECT count(*) INTO v_hour FROM public.matches
  WHERE "creatorId" = NEW."creatorId" AND created_at > now() - interval '1 hour';
  IF v_hour >= v_max_hour THEN
    RAISE EXCEPTION 'RATE_LIMIT: Saatte en fazla % maç oluşturabilirsiniz.', v_max_hour
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO v_day FROM public.matches
  WHERE "creatorId" = NEW."creatorId" AND created_at > now() - interval '24 hours';
  IF v_day >= v_max_day THEN
    RAISE EXCEPTION 'RATE_LIMIT: Günde en fazla % maç oluşturabilirsiniz.', v_max_day
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_match_spam ON public.matches;
CREATE TRIGGER trg_enforce_match_spam
  BEFORE INSERT ON public.matches
  FOR EACH ROW EXECUTE FUNCTION public.enforce_match_spam_guard();

CREATE INDEX IF NOT EXISTS idx_matches_creator_created ON public.matches("creatorId", created_at);
