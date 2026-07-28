-- ============================================================================
-- ÇALIŞMA SAATLERİ ARTIK TARİFEDEN TÜRETİLİR — TEK KAYNAK
-- ----------------------------------------------------------------------------
-- Ürün kararı: "Saha sahibi bir fiyatlandırma planı oluşturduğunda o planın
-- başlangıç ve bitiş saatleri tesisin ve sahanın çalışma saatleri olarak ana
-- uygulamada görünsün."
--
-- BUGÜNKÜ SORUN — İKİ AYRI GERÇEK:
--   • pitches.working_hours    → sahibin "Çalışma Saatleri" ekranından girdiği
--   • pitch_tariffs.start/end  → sahibin "Fiyatlandırma Politikası"ndan girdiği
-- İkisi birbirinden habersiz. Sahip 18:00-23:00 tarifesi kurup çalışma saatini
-- 09:00-17:00 bırakırsa kullanıcı hiç slot göremiyor; tersi durumda tarifesiz
-- saatler "açık" görünüp rezervasyonda fiyatsız kalıyordu.
--
-- ÇÖZÜM: Tarife TEK GERÇEK. Bir günün çalışma penceresi = o güne uygulanan
-- aktif tarifelerin EN ERKEN başlangıcı .. EN GEÇ bitişi. Hiç tarifesi olmayan
-- gün KAPALIDIR. pitches.working_hours artık elle yazılan bir alan değil,
-- trigger ile sürdürülen bir AYNADIR (profiles.wallet_balance gibi) — eski
-- okuyucular bozulmasın diye duruyor.
--
-- GÜN SEÇİMİ: applies_to_days (ISO 1=Pazartesi .. 7=Pazar) tek mekanizma.
-- Arayüzdeki "hafta içi / hafta sonu" ikilisi kalkıyor; sahip günleri tek tek
-- seçiyor. tariff_type yalnız tarih-özel/tatil ayrımı için şemada kalıyor.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. TÜRETİM — bir tesisin 7 günlük çalışma penceresi
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.derive_pitch_working_hours(p_pitch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_names text[] := ARRAY['Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi','Pazar'];
  v_out jsonb := '[]'::jsonb;
  d int;
  v_open  time;
  v_close time;
  v_has_midnight boolean;
  v_any boolean;
BEGIN
  FOR d IN 1..7 LOOP
    SELECT
      min(t.start_time),
      max(t.end_time),
      bool_or(t.end_time = '00:00:00'),
      count(*) > 0
    INTO v_open, v_close, v_has_midnight, v_any
    FROM public.pitch_tariffs t
    WHERE t.pitch_id = p_pitch_id
      AND COALESCE(t.is_active, true) = true
      -- Tarih-özel tarife haftalık pencereyi tanımlamaz; yalnız o gün geçerlidir.
      AND t.valid_on IS NULL
      AND d = ANY(t.applies_to_days);

    v_out := v_out || jsonb_build_object(
      'name',   v_names[d],
      'day',    d - 1,                      -- eski tüketiciler 0=Pazartesi bekliyor
      'open',   COALESCE(to_char(v_open, 'HH24:MI'), '09:00'),
      -- '00:00' bitiş = gün sonu; en geç bitiş odur.
      'close',  CASE WHEN COALESCE(v_has_midnight, false) THEN '00:00'
                     ELSE COALESCE(to_char(v_close, 'HH24:MI'), '23:00') END,
      'closed', NOT COALESCE(v_any, false)
    );
  END LOOP;

  RETURN v_out;
END;
$fn$;

REVOKE ALL ON FUNCTION public.derive_pitch_working_hours(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.derive_pitch_working_hours(uuid) TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2. AYNA — tarife değişince pitches.working_hours güncellenir
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._sync_pitch_working_hours()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_pitch uuid;
BEGIN
  v_pitch := COALESCE(NEW.pitch_id, OLD.pitch_id);
  IF v_pitch IS NOT NULL THEN
    UPDATE public.pitches
       SET working_hours = public.derive_pitch_working_hours(v_pitch)
     WHERE id = v_pitch;
  END IF;
  RETURN NULL; -- AFTER trigger
END;
$fn$;

DROP TRIGGER IF EXISTS trg_sync_pitch_working_hours ON public.pitch_tariffs;
CREATE TRIGGER trg_sync_pitch_working_hours
  AFTER INSERT OR UPDATE OR DELETE ON public.pitch_tariffs
  FOR EACH ROW EXECUTE FUNCTION public._sync_pitch_working_hours();

COMMENT ON COLUMN public.pitches.working_hours IS
  'TÜRETİLMİŞ AYNA — elle yazılmaz. pitch_tariffs''ten trigger ile üretilir: bir günün penceresi o güne uygulanan aktif tarifelerin en erken başlangıcı..en geç bitişidir. Tarifesiz gün kapalıdır. Tek gerçek pitch_tariffs''tir.';

-- ----------------------------------------------------------------------------
-- 3. BACKFILL — tarifesi olan tesislerin aynasını kur
-- ----------------------------------------------------------------------------
-- Tarifesi HİÇ olmayan tesisin mevcut working_hours'ı korunur: aksi hâlde
-- kurulum aşamasındaki tesis bir anda "7 gün kapalı" olurdu.
UPDATE public.pitches p
   SET working_hours = public.derive_pitch_working_hours(p.id)
 WHERE EXISTS (SELECT 1 FROM public.pitch_tariffs t WHERE t.pitch_id = p.id);

-- ----------------------------------------------------------------------------
-- 4. GÜN SEÇİMİ — boş gün dizisi kabul edilmez
-- ----------------------------------------------------------------------------
-- Gün gün seçime geçtiğimiz için "hiçbir gün seçilmemiş" tarife anlamsız:
-- ne slot üretir ne çalışma saati. Sunucu bunu baştan reddeder.
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pitch_tariffs_days_not_empty') THEN
    ALTER TABLE public.pitch_tariffs ADD CONSTRAINT pitch_tariffs_days_not_empty
      CHECK (applies_to_days IS NOT NULL AND array_length(applies_to_days, 1) >= 1);
  END IF;
END $do$;

-- ----------------------------------------------------------------------------
-- 5. owner_replace_tariffs — gün doğrulaması + boş set koruması
-- ----------------------------------------------------------------------------
-- Not: slot süresi kilidi (SLOT_MINUTES_LOCKED) 20260831000000'de kuruldu ve
-- aynen korunuyor; burada yalnız gün dizisi doğrulaması ekleniyor.
CREATE OR REPLACE FUNCTION public._validate_tariff_days(p_days jsonb)
RETURNS integer[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'pg_temp'
AS $fn$
DECLARE v_days integer[];
BEGIN
  SELECT array_agg(DISTINCT x::int ORDER BY x::int)
    INTO v_days
    FROM jsonb_array_elements_text(COALESCE(p_days, '[]'::jsonb)) AS x
   WHERE x ~ '^[1-7]$';
  RETURN v_days;
END;
$fn$;
