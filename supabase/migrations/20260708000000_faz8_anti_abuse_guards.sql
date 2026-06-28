-- ============================================================
-- FAZ 8 — Anti-abuse / anti-bot sertleştirme (EKLEMELİ, kırıcı değil)
--
-- Amaç: Rakip botların / sahte hesapların TÜM saha slotlarını bedavaya
-- rezerve ederek (veya 10 dk'lık hold'larla kilitleyerek) sistemi
-- kullanılamaz hale getirmesini engellemek. Mevcut akış DEĞİŞMEZ;
-- yalnızca anormal hacim/hız reddedilir.
--
-- Eşikler app_config'ten okunur → admin panelden ayarlanabilir (master prensip:
-- "tüm 'admin ayarlı' parametreler"). app_config satırı yoksa koddaki varsayılan kullanılır.
-- ============================================================

-- ── Ayarlanabilir eşikler (admin panel → GÜVENLİK kategorisi) ────────────────
INSERT INTO public.app_config (key, value, value_type, category, label, description, is_public, min_value, max_value, updated_at)
VALUES
  ('sec_booking_max_open_unpaid', '5'::jsonb, 'number', 'GÜVENLİK',
   'Eşzamanlı ödenmemiş rezervasyon tavanı',
   'Bir kullanıcının aynı anda tutabileceği ödenmemiş yaklaşan rezervasyon sayısı (anti-bot).', false, 1, 50, now()),
  ('sec_booking_rate_per_10min', '8'::jsonb, 'number', 'GÜVENLİK',
   'Rezervasyon hız limiti (10 dk)',
   '10 dakikalık pencerede izin verilen rezervasyon denemesi sayısı.', false, 1, 100, now()),
  ('sec_hold_max_active', '3'::jsonb, 'number', 'GÜVENLİK',
   'Eşzamanlı aktif slot kilidi tavanı',
   'Bir kullanıcının aynı anda tutabileceği geçici slot kilidi (hold) sayısı.', false, 1, 20, now())
ON CONFLICT (key) DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- 1) Rezervasyon kötüye-kullanım kapısı (BEFORE INSERT trigger)
--    Yalnız APP_BOOKING / APP_MATCH (gerçek oyuncu) kaynaklı kayıtlara uygulanır;
--    OWNER_MANUAL / SUBSCRIPTION etkilenmez.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_booking_abuse_guards()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now_tr      timestamp := (now() AT TIME ZONE 'Europe/Istanbul');
  v_active_open int;
  v_recent      int;
  v_max_open    int := COALESCE((SELECT (value #>> '{}')::int FROM public.app_config WHERE key = 'sec_booking_max_open_unpaid'), 5);
  v_rate_10min  int := COALESCE((SELECT (value #>> '{}')::int FROM public.app_config WHERE key = 'sec_booking_rate_per_10min'), 8);
BEGIN
  IF NEW.source NOT IN ('APP_BOOKING', 'APP_MATCH') OR NEW.user_id IS NULL THEN
    RETURN NEW;  -- saha sahibi / abonelik kaynaklı kayıtlar kısıtlanmaz
  END IF;

  -- (1) Eşzamanlı ödenmemiş yaklaşan rezervasyon tavanı
  SELECT count(*) INTO v_active_open
  FROM public.pitch_bookings
  WHERE user_id = NEW.user_id
    AND status IN ('PENDING', 'CONFIRMED')
    AND COALESCE(paid_amount, 0) = 0
    AND (booking_date + start_time) > v_now_tr;
  IF v_active_open >= v_max_open THEN
    RAISE EXCEPTION 'BOOKING_LIMIT: Aynı anda en fazla % ödenmemiş rezervasyon tutabilirsiniz. Önce ödemeyi tamamlayın ya da iptal edin.', v_max_open
      USING ERRCODE = 'check_violation';
  END IF;

  -- (2) Hız limiti: son 10 dakikadaki rezervasyon denemeleri
  SELECT count(*) INTO v_recent
  FROM public.pitch_bookings
  WHERE user_id = NEW.user_id
    AND created_at > now() - interval '10 minutes';
  IF v_recent >= v_rate_10min THEN
    RAISE EXCEPTION 'RATE_LIMIT: Çok kısa sürede çok fazla rezervasyon denemesi. Lütfen birkaç dakika sonra tekrar deneyin.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_booking_abuse ON public.pitch_bookings;
CREATE TRIGGER trg_enforce_booking_abuse
  BEFORE INSERT ON public.pitch_bookings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_booking_abuse_guards();

-- ────────────────────────────────────────────────────────────
-- 2) Slot-hold kötüye-kullanım kapısı (BEFORE INSERT trigger)
--    Bot'un her slotu 10 dk'lık hold ile kilitlemesini engeller.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_hold_abuse_guards()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_active int;
  v_max    int := COALESCE((SELECT (value #>> '{}')::int FROM public.app_config WHERE key = 'sec_hold_max_active'), 3);
BEGIN
  IF NEW.held_by IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT count(*) INTO v_active
  FROM public.pitch_slot_holds
  WHERE held_by = NEW.held_by
    AND expires_at > now();
  IF v_active >= v_max THEN
    RAISE EXCEPTION 'HOLD_LIMIT: Aynı anda en fazla % slot kilidi tutabilirsiniz.', v_max
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_hold_abuse ON public.pitch_slot_holds;
CREATE TRIGGER trg_enforce_hold_abuse
  BEFORE INSERT ON public.pitch_slot_holds
  FOR EACH ROW EXECUTE FUNCTION public.enforce_hold_abuse_guards();

-- ────────────────────────────────────────────────────────────
-- 3) Doluluk/hold kazıma yüzeyini daralt — anon erişimini kaldır
--    Eski: "Holds are viewable by everyone" FOR SELECT USING (true)  → anon bile doluluk haritasını çekiyor.
--    Yeni: yalnız authenticated (UI'da slotu gri yapmak için yeterli; hold satırında PII yok).
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Holds are viewable by everyone" ON public.pitch_slot_holds;
DROP POLICY IF EXISTS "Holds viewable by authenticated" ON public.pitch_slot_holds;
CREATE POLICY "Holds viewable by authenticated"
  ON public.pitch_slot_holds FOR SELECT TO authenticated
  USING (true);

-- ────────────────────────────────────────────────────────────
-- 4) Süresi dolan hold'ları düzenli temizle (cron varsa)
-- ────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup_expired_holds') THEN
      PERFORM cron.unschedule('cleanup_expired_holds');
    END IF;
    PERFORM cron.schedule('cleanup_expired_holds', '* * * * *',
      'SELECT public.cleanup_expired_holds()');
  END IF;
END;
$$;
