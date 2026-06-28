-- ============================================================
-- FAZ 8 — Anti-abuse / anti-bot sertleştirme (EKLEMELİ, kırıcı değil)
--
-- Amaç: Rakip botların / sahte hesapların TÜM saha slotlarını bedavaya
-- rezerve ederek (veya 10 dk'lık hold'larla kilitleyerek) sistemi
-- kullanılamaz hale getirmesini engellemek. Mevcut akış DEĞİŞMEZ;
-- yalnızca anormal hacim/hız reddedilir. Meşru kullanıcı (1-5 yaklaşan
-- rezervasyon) hiç etkilenmez.
--
-- Tespit (canlı DB + kod kanıtı):
--  * create_pitch_booking → paid_amount=0, payment_status='PENDING' ile
--    rezervasyon açıyor; auto_approve_pending_bookings cron'u ~35 dk sonra
--    ödemeye BAKMADAN PENDING→CONFIRMED yapıyor. Kullanıcı başına kota YOK.
--  * pitch_slot_holds: 10 dk TTL var ama kullanıcı başına hold sayısı
--    sınırsız; "Holds are viewable by everyone" SELECT USING(true) → anon
--    dahil tüm doluluk haritası kazınabiliyor; cleanup cron'u zamanlanmamış.
--
-- Eşikler aşağıda sabit; ihtiyaca göre değerleri değiştirip yeniden apply edin.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1) Rezervasyon kötüye-kullanım kapısı (BEFORE INSERT trigger)
--    - Eşzamanlı ödenmemiş yaklaşan rezervasyon tavanı (BOOKING_MAX_OPEN)
--    - 10 dakikalık pencerede rezervasyon hız limiti (BOOKING_RATE_10MIN)
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
  c_max_open    constant int := 5;   -- eşzamanlı ödenmemiş yaklaşan rezervasyon tavanı
  c_rate_10min  constant int := 8;   -- 10 dakikada izin verilen rezervasyon denemesi
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
  IF v_active_open >= c_max_open THEN
    RAISE EXCEPTION 'BOOKING_LIMIT: Aynı anda en fazla % ödenmemiş rezervasyon tutabilirsiniz. Önce ödemeyi tamamlayın ya da iptal edin.', c_max_open
      USING ERRCODE = 'check_violation';
  END IF;

  -- (2) Hız limiti: son 10 dakikadaki rezervasyon denemeleri
  SELECT count(*) INTO v_recent
  FROM public.pitch_bookings
  WHERE user_id = NEW.user_id
    AND created_at > now() - interval '10 minutes';
  IF v_recent >= c_rate_10min THEN
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
--    Kullanıcı başına aynı anda aktif hold tavanı (HOLD_MAX_ACTIVE).
--    Bot'un her slotu 10 dk'lık hold ile kilitlemesini engeller.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_hold_abuse_guards()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_active   int;
  c_max_hold constant int := 3;  -- eşzamanlı aktif hold tavanı
BEGIN
  IF NEW.held_by IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT count(*) INTO v_active
  FROM public.pitch_slot_holds
  WHERE held_by = NEW.held_by
    AND expires_at > now();
  IF v_active >= c_max_hold THEN
    RAISE EXCEPTION 'HOLD_LIMIT: Aynı anda en fazla % slot kilidi tutabilirsiniz.', c_max_hold
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
--    Eski: "Holds are viewable by everyone" FOR SELECT USING (true)
--          → giriş yapmamış bot bile tüm doluluk haritasını çekebiliyor.
--    Yeni: yalnız authenticated görür (UI'da slotu gri yapmak için yeterli).
--    NOT: hold satırında PII yok (yalnız slot koordinatı), bu yüzden
--         authenticated için USING(true) kalması UX'i bozmaz.
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Holds are viewable by everyone" ON public.pitch_slot_holds;
DROP POLICY IF EXISTS "Holds viewable by authenticated" ON public.pitch_slot_holds;
CREATE POLICY "Holds viewable by authenticated"
  ON public.pitch_slot_holds FOR SELECT TO authenticated
  USING (true);

-- ────────────────────────────────────────────────────────────
-- 4) Süresi dolan hold'ları düzenli temizle (cron varsa)
--    cleanup_expired_holds() zaten mevcut; dakikada bir çalıştır.
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
