-- ============================================================================
-- RAHAT TRIGGER GÜVENLİK DÜZELTMESİ + ÖLÜ FONKSİYON TEMİZLİĞİ
--
-- 1) _rahat_slots_positionless (20260831000001) SECURITY DEFINER değildi ama
--    authenticated'dan EXECUTE'u alınmış _flatten_slot_array'i çağırıyordu.
--    Invoker-rights trigger DML'i yapan rolün yetkileriyle koşar: matches_update
--    RLS politikası (20260810000000) kaptanın matches satırını DOĞRUDAN
--    güncellemesine izin verdiği için Rahat maçta böyle bir UPDATE
--    'permission denied for function _flatten_slot_array' ile düşerdi.
--    Emsal matches BEFORE trigger'ları gibi (matches_autofill_image,
--    matches_format_range_guard) SECURITY DEFINER yapılır — gövde AYNI.
--
-- 2) _flat_slots (20260831000001) hiç çağıransız kaldı: slot üretimi üç
--    yaratma yolunda değil trigger'daki _flatten_slot_array'de çözüldü,
--    üreteç tasarım artığı olarak prod'a gitmesin.
-- ============================================================================

CREATE OR REPLACE FUNCTION public._rahat_slots_positionless()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF COALESCE(NEW.difficulty, '') <> 'Rahat' THEN
    RETURN NEW;
  END IF;
  -- Boş diziyi jsonb_agg NULL'a çevirmesin diye COALESCE _flatten içinde.
  IF NEW.slots IS NOT NULL AND jsonb_typeof(NEW.slots) = 'array' THEN
    NEW.slots := public._flatten_slot_array(NEW.slots);
  END IF;
  IF NEW."awaySlots" IS NOT NULL AND jsonb_typeof(NEW."awaySlots") = 'array' THEN
    NEW."awaySlots" := public._flatten_slot_array(NEW."awaySlots");
  END IF;
  RETURN NEW;
END;
$$;

DROP FUNCTION IF EXISTS public._flat_slots(text, text);
