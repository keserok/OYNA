-- ============================================================
-- F1.3 — Gün adı normalizasyonu: kısa Türkçe gün adları da eşleşir
-- ============================================================
-- Sağlayıcı working_hours.activeDays alanını yazan İKİ arayüz de
-- (views/ServiceDashboard.tsx ve admin ProviderDetailPanel) istisnasız KISA
-- adları kaydeder: Pzt/Sal/Çar/Per/Cum/Cmt/Paz. _provider_serves_schedule ise
-- yalnız TAM adlarla ('Pazartesi'…) karşılaştırıyordu → müsaitlik gününü
-- dolduran her sağlayıcı find_providers_for_match sonuçlarından o gün için
-- tamamen eleniyordu (dolduranın cezalandırıldığı ters teşvik).
--
-- Çözüm: veri migrasyonu YOK; sunucu her iki formatı (+ ASCII katlanmış
-- varyantları) tanır. Ayrıştırılamayan token (örn. 'Bugün', 'Hafta içi' veya
-- gelecekte eklenecek yeni bir değer) DEFANSİF olarak "eleme yapma" sayılır —
-- eski kaçış listesi davranışı otomatik korunur.

CREATE OR REPLACE FUNCTION public._tr_day_index(p_day text)
RETURNS int
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT CASE lower(btrim(coalesce(p_day, '')))
    WHEN 'pazar' THEN 0      WHEN 'paz' THEN 0  WHEN 'pz'  THEN 0
    WHEN 'pazartesi' THEN 1  WHEN 'pzt' THEN 1  WHEN 'pts' THEN 1
    WHEN 'salı' THEN 2       WHEN 'sali' THEN 2 WHEN 'sal' THEN 2
    WHEN 'çarşamba' THEN 3   WHEN 'carsamba' THEN 3 WHEN 'çar' THEN 3 WHEN 'car' THEN 3 WHEN 'çrş' THEN 3 WHEN 'crs' THEN 3
    WHEN 'perşembe' THEN 4   WHEN 'persembe' THEN 4 WHEN 'per' THEN 4 WHEN 'prş' THEN 4
    WHEN 'cuma' THEN 5       WHEN 'cum' THEN 5
    WHEN 'cumartesi' THEN 6  WHEN 'cmt' THEN 6  WHEN 'cts' THEN 6
    ELSE NULL
  END;
$$;

-- Gövde canlıdan birebir (2026-07-27 teyidi); yalnız GÜN bloğu değişti.
-- Saat bloğuna dokunulmadı.
CREATE OR REPLACE FUNCTION public._provider_serves_schedule(p_wh jsonb, p_starts_at timestamp with time zone)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_days jsonb; v_hours text; v_start text; v_end text;
  v_match_t time; v_s time; v_e time; v_dow int;
  v_day_ok boolean := true; v_time_ok boolean := true;
BEGIN
  IF p_wh IS NULL OR p_starts_at IS NULL THEN RETURN true; END IF;
  v_days := p_wh->'activeDays';
  IF v_days IS NOT NULL AND jsonb_typeof(v_days) = 'array' AND jsonb_array_length(v_days) > 0 THEN
    v_dow := extract(dow from (p_starts_at AT TIME ZONE 'Europe/Istanbul'))::int;
    -- F1.3: kısa+tam adlar _tr_day_index ile 0..6'ya çevrilir; tanınmayan
    -- token ('Bugün', 'Hafta içi', 'Her gün'…) varsa defansif dahil edilir.
    v_day_ok := EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_days) d
                        WHERE public._tr_day_index(d) = v_dow);
    IF NOT v_day_ok AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_days) d
                                WHERE public._tr_day_index(d) IS NULL) THEN
      v_day_ok := true;
    END IF;
  END IF;
  v_hours := p_wh->>'activeHours';
  IF v_hours IS NOT NULL AND v_hours ~ '\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}' THEN
    v_start := btrim(split_part(v_hours, '-', 1));
    v_end   := btrim(split_part(v_hours, '-', 2));
    BEGIN
      v_s := v_start::time; v_e := v_end::time;
      v_match_t := (p_starts_at AT TIME ZONE 'Europe/Istanbul')::time;
      IF v_e >= v_s THEN
        v_time_ok := (v_match_t >= v_s AND v_match_t <= v_e);
      ELSE
        v_time_ok := (v_match_t >= v_s OR v_match_t <= v_e);
      END IF;
    EXCEPTION WHEN OTHERS THEN v_time_ok := true;
    END;
  END IF;
  RETURN v_day_ok AND v_time_ok;
END;
$function$;
