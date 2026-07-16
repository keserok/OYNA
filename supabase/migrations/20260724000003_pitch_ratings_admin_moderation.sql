-- =============================================================================
-- Migration: Saha yorumu (pitch_ratings) admin moderasyonu
--   (a) tr_pitch_rating_sync trigger'ı: INSERT/UPDATE/DELETE'te sahanın ortalama
--       puanını + yorum sayısını otomatik yeniden hesaplar (özellikle bir yorum
--       SİLİNDİĞİNDE ortalama düzelir).
--   (b) admin_delete_pitch_rating(p_id): platform admin bir yorumu siler; trigger
--       ortalamayı günceller; işlem audit'lenir.
-- =============================================================================
-- Not: Mevcut submit_pitch_rating zaten INSERT sonrası _recompute_pitch_rating
--   çağırıyor; trigger bunu tüm yollar için (silme dâhil) garanti eder ve idempotenttir.
--   pitch_ratings RLS'i yalnız public SELECT içerir; yazma/silme SECURITY DEFINER
--   RPC'ler üzerinden yapılır → admin silme için ayrı RLS politikası gerekmez.
-- =============================================================================

-- (a) Ortalama senkron trigger'ı ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tr_pitch_rating_sync()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_pitch uuid; v_avg numeric; v_cnt integer;
BEGIN
  v_pitch := COALESCE(NEW.pitch_id, OLD.pitch_id);
  IF v_pitch IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  SELECT round(avg(score)::numeric, 2), count(*) INTO v_avg, v_cnt
    FROM public.pitch_ratings WHERE pitch_id = v_pitch;
  UPDATE public.pitches
    SET rating = COALESCE(v_avg, 0), rating_count = COALESCE(v_cnt, 0)
    WHERE id = v_pitch;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- Trigger fonksiyonu RPC olarak çağrılamamalı (advisor: anon/authenticated
-- SECURITY DEFINER RPC ifşası). Trigger'ın kendisi tablo sahibi olarak çalışır;
-- EXECUTE grant'ı gerekmez.
REVOKE ALL ON FUNCTION public.tr_pitch_rating_sync() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tr_pitch_rating_sync ON public.pitch_ratings;
CREATE TRIGGER tr_pitch_rating_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.pitch_ratings
  FOR EACH ROW EXECUTE FUNCTION public.tr_pitch_rating_sync();

-- (b) Admin silme RPC'si ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_delete_pitch_rating(p_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_pitch uuid; v_old jsonb;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT pitch_id, to_jsonb(pr.*) INTO v_pitch, v_old FROM public.pitch_ratings pr WHERE id = p_id;
  IF v_pitch IS NULL THEN RAISE EXCEPTION 'Değerlendirme bulunamadı'; END IF;
  DELETE FROM public.pitch_ratings WHERE id = p_id;  -- tr_pitch_rating_sync ortalamayı günceller
  PERFORM public.log_admin_action('PITCH_RATING_DELETE', 'pitch_rating', p_id, v_pitch::text, v_old, NULL);
  RETURN TRUE;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_delete_pitch_rating(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_pitch_rating(uuid) TO authenticated;
