-- [DB GEÇMİŞİNDEN KURTARILDI 2026-07-11] Bu migration canlı veritabanına uygulanmıştı ancak repoda dosyası yoktu; supabase_migrations.schema_migrations.statements kolonundan geri çıkarıldı.

-- FIX 1: slot_range GENERATED ALWAYS kolonu owner modülünün create_pitch_booking RPC'sinin
-- açık INSERT'ini engelliyordu (SQLSTATE 428C9). Generated'ı kaldırıp BEFORE trigger ile
-- otomatik dolduruyoruz: RPC insert edebilir, değer kanonik kalır, EXCLUDE koruması aynen çalışır.
ALTER TABLE public.pitch_bookings ALTER COLUMN slot_range DROP EXPRESSION IF EXISTS;

CREATE OR REPLACE FUNCTION public.pitch_bookings_set_slot_range()
RETURNS trigger
LANGUAGE plpgsql
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

-- FIX 2: court_availability view, Faz 2 testlerinde yanlışlıkla geri eklenmişti.
-- Güvenlik temizliğine (security_definer_view ERROR'unu önlemek) uygun şekilde tekrar siliniyor.
DROP VIEW IF EXISTS public.court_availability;
