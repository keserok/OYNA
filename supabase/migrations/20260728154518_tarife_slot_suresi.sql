-- ============================================================================
-- TARİFE BAZLI SLOT SÜRESİ (60 / 90 / 120 dakika)
-- ----------------------------------------------------------------------------
-- Ürün kararı (S3 + E1..E6, E11..E15):
--   • Slot süresi TARİFE satırında tanımlanır (E1a). Böylece gündüz 60, akşam 90
--     gibi ayrım yapılabilir.
--   • Fiyat artık SLOT BAŞINA (E2b). Sahip "90 dakika 900₺" der; 1.5× çarpımıyla
--     uğraşmaz, küsuratlı fiyat çıkmaz.
--   • Her tarife KENDİ başlangıcından kendi ızgarasını kurar (E12a).
--   • Çalışma penceresine tam bölünmeyen artık süre BOŞ bırakılır (E3a).
--   • Rezervasyon bulunan gün/saat için sahip süreyi DEĞİŞTİREMEZ (E4).
--   • Kapora süreyle ölçeklenmez, sahip ne yazdıysa odur (E13).
--   • Değiştirme yetkisi: sahip + müdür (E14a) — can_manage_pitch zaten bu ikisi.
--
-- ADLANDIRMA: price_per_hour -> slot_price (E11a). Bugün tüm slotlar 60 dakika
-- olduğu için dönüşüm KAYIPSIZ: saatlik fiyat = slot fiyatı.
--
-- REPLAY GÜVENLİĞİ: Yeniden adlandırma, kolonu kullanan tüm tarihsel
-- migrasyonlardan SONRA çalışır; sıralı replay'de sorun çıkmaz. Kolonu okuyan
-- canlı fonksiyonlar (3 adet) aynı migrasyonda güncelleniyor.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. KOLONLAR
-- ----------------------------------------------------------------------------
ALTER TABLE public.pitch_tariffs RENAME COLUMN price_per_hour TO slot_price;

ALTER TABLE public.pitch_tariffs
  ADD COLUMN IF NOT EXISTS slot_minutes integer NOT NULL DEFAULT 60;

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pitch_tariffs_slot_minutes_check') THEN
    ALTER TABLE public.pitch_tariffs ADD CONSTRAINT pitch_tariffs_slot_minutes_check
      CHECK (slot_minutes IN (60, 90, 120));
  END IF;
END $do$;

COMMENT ON COLUMN public.pitch_tariffs.slot_price IS
  'Bir SLOTUN fiyatı (saatlik değil). 90 dakikalık slot için doğrudan 90 dakikanın bedeli yazılır. Eski adı price_per_hour idi; tüm slotlar 60 dakika olduğu için dönüşüm kayıpsız yapıldı.';
COMMENT ON COLUMN public.pitch_tariffs.slot_minutes IS
  'Bu tarifenin ürettiği slot süresi (dakika): 60, 90 veya 120. Izgara tarifenin start_time''ından başlar; pencereye sığmayan artık süre boş bırakılır.';

-- ----------------------------------------------------------------------------
-- 2. TARİFE ÇÖZÜMLEME — slot süresini de döndür
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_current_tariff_price(uuid, date, time without time zone, uuid);

CREATE OR REPLACE FUNCTION public.get_current_tariff_price(
  p_pitch_id uuid, p_booking_date date, p_start_time time without time zone, p_court_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(tariff_id uuid, price numeric, deposit numeric, slot_minutes integer, window_start time without time zone)
LANGUAGE plpgsql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_dow INTEGER;
BEGIN
  v_dow := EXTRACT(ISODOW FROM p_booking_date);
  RETURN QUERY
  SELECT t.id, t.slot_price, t.deposit_amount, t.slot_minutes, t.start_time
  FROM public.pitch_tariffs t
  WHERE t.pitch_id = p_pitch_id
    AND COALESCE(t.is_active, true) = true
    AND v_dow = ANY(t.applies_to_days)
    AND p_start_time >= t.start_time
    AND (p_start_time < t.end_time OR t.end_time = '00:00:00')
    AND (t.court_id IS NULL OR t.court_id = p_court_id)
    -- Tarih-özel tarife yalnız kendi tarihinde adaydır.
    AND (t.valid_on IS NULL OR t.valid_on = p_booking_date)
  ORDER BY
    -- 1) Tarih-özel (takvimden girilen özel fiyat) her şeye üstün gelir.
    CASE WHEN t.valid_on IS NOT NULL THEN 0 ELSE 1 END,
    -- 2) Saha-özel tarife tesis-geneline üstün gelir.
    CASE WHEN t.court_id IS NOT NULL AND t.court_id = p_court_id THEN 0 ELSE 1 END,
    -- 3) Tarife tipi önceliği.
    CASE t.tariff_type WHEN 'HOLIDAY' THEN 1 WHEN 'WEEKEND' THEN 2 WHEN 'WEEKDAY' THEN 3 ELSE 4 END,
    t.id
  LIMIT 1;
END;
$fn$;

-- ----------------------------------------------------------------------------
-- 3. SLOT IZGARASI — SUNUCU TARAFI TEK KAYNAK
-- ----------------------------------------------------------------------------
-- Verilen tesis/kort/tarih için slot listesini üretir. Arayüz, takvim, admin
-- paneli ve tüketici ekranı AYNI bu fonksiyondan okur — ızgara tek yerde tanımlı.
CREATE OR REPLACE FUNCTION public.get_pitch_slots(
  p_pitch_id uuid, p_date date, p_court_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(
  slot_start time without time zone,
  slot_end   time without time zone,
  minutes    integer,
  price      numeric,
  deposit    numeric,
  tariff_id  uuid,
  crosses_midnight boolean)
LANGUAGE plpgsql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_dow int := EXTRACT(ISODOW FROM p_date);
  t RECORD;
  v_cur   interval;
  v_endw  interval;
  v_step  interval;
BEGIN
  -- Her tarife KENDİ penceresinde, KENDİ başlangıcından ızgarasını kurar (E12a).
  -- Aynı saati birden fazla tarife kapsıyorsa öncelik get_current_tariff_price
  -- ile aynı sırayla çözülür; burada tarifeler başlangıca göre sıralanır ve
  -- üretilen slotlar çakışmayacak şekilde ilerletilir.
  FOR t IN
    SELECT tt.id, tt.start_time, tt.end_time, tt.slot_minutes, tt.slot_price, tt.deposit_amount
    FROM public.pitch_tariffs tt
    WHERE tt.pitch_id = p_pitch_id
      AND COALESCE(tt.is_active, true) = true
      AND v_dow = ANY(tt.applies_to_days)
      AND (tt.court_id IS NULL OR tt.court_id = p_court_id)
      AND (tt.valid_on IS NULL OR tt.valid_on = p_date)
    ORDER BY
      CASE WHEN tt.valid_on IS NOT NULL THEN 0 ELSE 1 END,
      CASE WHEN tt.court_id IS NOT NULL AND tt.court_id = p_court_id THEN 0 ELSE 1 END,
      tt.start_time,
      CASE tt.tariff_type WHEN 'HOLIDAY' THEN 1 WHEN 'WEEKEND' THEN 2 WHEN 'WEEKDAY' THEN 3 ELSE 4 END,
      tt.id
  LOOP
    v_cur  := t.start_time::interval;
    -- '00:00' bitiş = gün sonu (24:00). Gece yarısını aşan pencere desteklenir.
    v_endw := CASE WHEN t.end_time = '00:00:00' THEN interval '24 hours'
                   WHEN t.end_time <= t.start_time THEN t.end_time::interval + interval '24 hours'
                   ELSE t.end_time::interval END;
    v_step := make_interval(mins => t.slot_minutes);

    -- Artık süre BOŞ bırakılır (E3a): slot ancak tamamı pencereye sığıyorsa üretilir.
    WHILE v_cur + v_step <= v_endw LOOP
      slot_start       := (v_cur)::time;
      slot_end         := (v_cur + v_step)::time;
      minutes          := t.slot_minutes;
      price            := t.slot_price;
      deposit          := t.deposit_amount;
      tariff_id        := t.id;
      crosses_midnight := (v_cur + v_step) >= interval '24 hours';
      RETURN NEXT;
      v_cur := v_cur + v_step;
    END LOOP;
  END LOOP;
END;
$fn$;

REVOKE ALL ON FUNCTION public.get_pitch_slots(uuid, date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_pitch_slots(uuid, date, uuid) TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 4. TARİFE YAZMA — slot süresi + REZERVASYON KORUMASI
-- ----------------------------------------------------------------------------
-- E4: Rezervasyon bulunan gün/saat için süre değiştirilemez. Aksi hâlde
-- 20:00-21:00 dolu bir slot, ızgara 90'a çıkınca 20:00-21:30 ile çakışır ve
-- takvim tutarsızlaşır.
CREATE OR REPLACE FUNCTION public.owner_replace_tariffs(p_pitch_id uuid, p_tariffs jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_count integer;
  v_conflict RECORD;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED: Giris gerekli.'; END IF;
  -- can_manage_pitch = sahip + müdür (E14a)
  IF NOT public.can_manage_pitch(p_pitch_id) THEN RAISE EXCEPTION 'UNAUTHORIZED: yetki yok.'; END IF;

  -- ── E4 KORUMASI ─────────────────────────────────────────────────────────
  -- Gelecekteki her rezervasyon için: o saati bugün çözen tarifenin süresi ile
  -- yeni tarife setinin süresi farklıysa reddet.
  SELECT b.booking_date, b.start_time, old_t.slot_minutes AS eski, nw.yeni INTO v_conflict
  FROM public.pitch_bookings b
  JOIN LATERAL (
    SELECT tt.slot_minutes
    FROM public.pitch_tariffs tt
    WHERE tt.pitch_id = p_pitch_id
      AND COALESCE(tt.is_active, true) = true
      AND EXTRACT(ISODOW FROM b.booking_date) = ANY(tt.applies_to_days)
      AND b.start_time >= tt.start_time
      AND (b.start_time < tt.end_time OR tt.end_time = '00:00:00')
      AND (tt.court_id IS NULL OR tt.court_id = b.court_id)
      AND (tt.valid_on IS NULL OR tt.valid_on = b.booking_date)
    ORDER BY
      CASE WHEN tt.valid_on IS NOT NULL THEN 0 ELSE 1 END,
      CASE WHEN tt.court_id IS NOT NULL AND tt.court_id = b.court_id THEN 0 ELSE 1 END,
      CASE tt.tariff_type WHEN 'HOLIDAY' THEN 1 WHEN 'WEEKEND' THEN 2 WHEN 'WEEKDAY' THEN 3 ELSE 4 END,
      tt.id
    LIMIT 1
  ) old_t ON true
  JOIN LATERAL (
    SELECT COALESCE((x->>'slot_minutes')::int, 60) AS yeni
    FROM jsonb_array_elements(COALESCE(p_tariffs, '[]'::jsonb)) AS x
    WHERE EXTRACT(ISODOW FROM b.booking_date) = ANY (
            COALESCE((SELECT array_agg(d::int) FROM jsonb_array_elements_text(x->'applies_to_days') AS d), ARRAY[1,2,3,4,5]))
      AND b.start_time >= (x->>'start_time')::time
      AND (b.start_time < (x->>'end_time')::time OR (x->>'end_time')::time = '00:00:00')
      AND (NULLIF(x->>'court_id','') IS NULL OR NULLIF(x->>'court_id','')::uuid = b.court_id)
      AND (NULLIF(x->>'valid_on','') IS NULL OR NULLIF(x->>'valid_on','')::date = b.booking_date)
    ORDER BY
      CASE WHEN NULLIF(x->>'valid_on','') IS NOT NULL THEN 0 ELSE 1 END,
      CASE WHEN NULLIF(x->>'court_id','') IS NOT NULL THEN 0 ELSE 1 END,
      CASE COALESCE(x->>'tariff_type','WEEKDAY') WHEN 'HOLIDAY' THEN 1 WHEN 'WEEKEND' THEN 2 WHEN 'WEEKDAY' THEN 3 ELSE 4 END
    LIMIT 1
  ) nw ON true
  WHERE b.pitch_id = p_pitch_id
    AND b.status IN ('PENDING','CONFIRMED')
    AND b.booking_date >= CURRENT_DATE
    AND old_t.slot_minutes IS DISTINCT FROM nw.yeni
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'SLOT_MINUTES_LOCKED: % tarihinde %:% saatinde rezervasyon var; o saatin slot süresi (% dk) değiştirilemez. Önce rezervasyonu iptal et ya da o saat aralığının süresini olduğu gibi bırak.',
      to_char(v_conflict.booking_date, 'DD.MM.YYYY'),
      to_char(v_conflict.start_time, 'HH24'), to_char(v_conflict.start_time, 'MI'),
      v_conflict.eski;
  END IF;

  DELETE FROM public.pitch_tariffs WHERE pitch_id = p_pitch_id;

  INSERT INTO public.pitch_tariffs (
    pitch_id, name, tariff_type, applies_to_days, start_time, end_time,
    slot_price, slot_minutes, deposit_amount, sort_order, is_active, court_id, valid_on
  )
  SELECT
    p_pitch_id,
    t->>'name',
    COALESCE(t->>'tariff_type', 'WEEKDAY'),
    COALESCE((SELECT array_agg(x::int) FROM jsonb_array_elements_text(t->'applies_to_days') AS x), ARRAY[1,2,3,4,5]),
    (t->>'start_time')::time,
    (t->>'end_time')::time,
    -- Geriye dönük uyum: eski istemci hâlâ price_per_hour gönderiyorsa kabul et.
    COALESCE((t->>'slot_price')::numeric, (t->>'price_per_hour')::numeric, 0),
    CASE WHEN COALESCE((t->>'slot_minutes')::int, 60) IN (60,90,120)
         THEN (t->>'slot_minutes')::int ELSE 60 END,
    COALESCE((t->>'deposit_amount')::numeric, 0),
    COALESCE((t->>'sort_order')::int, 0),
    COALESCE((t->>'is_active')::boolean, true),
    NULLIF(t->>'court_id', '')::uuid,
    NULLIF(t->>'valid_on', '')::date
  FROM jsonb_array_elements(COALESCE(p_tariffs, '[]'::jsonb)) AS t;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$fn$;

-- ----------------------------------------------------------------------------
-- 5. DEMO TOHUMU — kolon adını otomatik güncelle
-- ----------------------------------------------------------------------------
-- seed_owner_demo gövdesi uzun ve yalnız kolon adı değişiyor; tanımı okuyup
-- adı değiştirerek yeniden kuruyoruz (elle kopyalarken sürüm kayması olmasın).
DO $do$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'seed_owner_demo';

  IF v_def IS NOT NULL AND v_def ILIKE '%price_per_hour%' THEN
    v_def := replace(v_def, 'price_per_hour', 'slot_price');
    EXECUTE v_def;
  END IF;
END $do$;
