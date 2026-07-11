-- [DB GEÇMİŞİNDEN KURTARILDI 2026-07-11] Bu migration canlı veritabanına uygulanmıştı ancak repoda dosyası yoktu; supabase_migrations.schema_migrations.statements kolonundan geri çıkarıldı.

-- slot_range trigger fonksiyonuna sabit search_path ekle (function_search_path_mutable WARN'unu temizler)
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
