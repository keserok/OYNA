-- ============================================================================
-- FIX: owner modülü create_pitch_booking RPC'sini açan iki düzeltme
-- PROD'A UYGULANDI (project iikvzgyccvgcybzdfwlv).
-- ----------------------------------------------------------------------------
-- 1) pitch_bookings.slot_range, eski owner_occupancy migration'ında GENERATED
--    ALWAYS olarak tanımlanmıştı. Owner modülünün create_pitch_booking RPC'si
--    bu kolona AÇIKÇA INSERT ediyor → SQLSTATE 428C9 ("cannot insert a
--    non-DEFAULT value into column slot_range") → her rezervasyon oluşturma
--    patlıyordu. Generated'ı kaldırıp BEFORE trigger ile otomatik dolduruyoruz:
--    RPC insert edebilir, değer kanonik kalır, GiST EXCLUDE (çift-rezervasyon)
--    koruması aynen çalışır.
-- 2) court_availability view'ı güvenlik temizliğinde silinmişti; bir Faz 2
--    test oturumunda yanlışlıkla geri eklenmişti (security_definer_view ERROR).
--    Tekrar siliniyor.
-- ============================================================================

-- 1) slot_range: GENERATED -> trigger-populated
ALTER TABLE public.pitch_bookings ALTER COLUMN slot_range DROP EXPRESSION IF EXISTS;

CREATE OR REPLACE FUNCTION public.pitch_bookings_set_slot_range()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.slot_range := tsrange(
    (NEW.booking_date + NEW.start_time),
    CASE WHEN NEW.end_time <= NEW.start_time
         THEN (NEW.booking_date + 1 + NEW.end_time)
         ELSE (NEW.booking_date + NEW.end_time) END,
    '[)'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pitch_bookings_slot_range ON public.pitch_bookings;
CREATE TRIGGER trg_pitch_bookings_slot_range
  BEFORE INSERT OR UPDATE ON public.pitch_bookings
  FOR EACH ROW EXECUTE FUNCTION public.pitch_bookings_set_slot_range();

-- 2) Kullanılmayan court_availability view'ını sil (güvenlik temizliğine uygun)
DROP VIEW IF EXISTS public.court_availability;
