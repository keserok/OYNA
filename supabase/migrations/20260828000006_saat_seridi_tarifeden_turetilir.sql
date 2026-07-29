-- ============================================================================
-- SAAT ŞERİDİ TARİFEDEN TÜRETİLİR (E12a'nın sunucu yarısı)
--
-- KARAR (E1a / E12a / E5a): slot süresinin tek gerçek kaynağı
-- `pitch_tariffs.slot_minutes`'tır — tarife satırı bazında (saat aralığı + gün
-- + kort). Sabah 60, akşam 90 olabilir ve "her tarife KENDİ başlangıcından
-- KENDİ ızgarasını kurar". Izgara sahip panelinde, admin panelinde ve
-- kullanıcı uygulamasında BİREBİR aynı olmalıdır (K-0.3).
--
-- İKİ AYRI HATA DÜZELTİLİYOR:
--
-- A) `get_court_day_quote` ızgarayı tesis-geneli `working_hours->>'slot_duration'`
--    değerinden kuruyordu ve adımı `CEIL(süre/60)` ile TAM SAATE yuvarlıyordu:
--      · 90 dakikalık tarife → adım 2 SAAT (yanlış),
--      · döngü `make_time(saat,0,0)` ile hep saat başı ilerlediği için
--        18:00 / 19:30 / 21:00 gibi yarım saatli başlangıçlar HİÇ üretilemiyordu.
--    Sonuç: kullanıcının GÖRDÜĞÜ şerit saat başı ilerliyor, ama maç
--    `create_match_atomic` tarifeden 90 dakika olarak kuruluyordu — gösterilen
--    dilim ile gerçek maç süresi ayrışıyordu.
--    Canlı kanıt (kort 28071df7, 2026-07-29): 15:00-23:00 arası 90 dakikalık
--    korta özel tarife varken şerit 09:00…23:00 saat başı, slotDuration=60
--    dönüyordu; 90'lık tarife ekranda hiç görünmüyordu.
--
-- B) `get_pitch_slots` (shared/slotGrid.ts'in SQL ikizi) çakışan tarifelerde
--    AYNI başlangıç saatini birden çok kez üretiyordu: istemcideki
--    `buildSlotGrid` başlangıç dakikasına göre TEKİLLEŞTİRİP yüksek öncelikli
--    tarifeyi kazandırırken (tests/unit/slotGrid.test.ts: "tarih-ozel tarife
--    ayni saatte digerini ezer", "saha-ozel tarife tesis-genelini ezer"),
--    SQL ikizi ikisini de döndürüyordu. Ayrıca öncelik sırası ayrışmıştı:
--    istemci tip'i start_time'dan ÖNCE, sunucu SONRA değerlendiriyordu.
--    Sonuç: aynı gün için sahip paneli ile kullanıcı ekranı farklı şerit
--    çizebiliyordu. Canlı kanıt (aynı kort/gün): 15:00, 18:00 ve 21:00
--    başlangıçları ikişer kez dönüyordu.
--
-- ÇÖZÜM: ızgaranın TEK kaynağı `get_pitch_slots` olur; `get_court_day_quote`
-- kendi ızgarasını kurmayı bırakır, onu tüketir ve her dilimi
-- `_resolve_court_quote` ile fiyatlar. Yanıta dilim başına `minutes` ve
-- `endTime` eklenir — üst düzey `slotDuration` yalnız geriye dönük uyum için
-- kalır (ilk dilimin süresi) ve karışık süreli günlerde tek başına anlamlı
-- DEĞİLDİR; istemci dilim başına `minutes` okumalıdır.
--
-- İdempotent: tekrar uygulanması güvenlidir.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- B) get_pitch_slots: istemcideki buildSlotGrid ile BİREBİR aynı kural
--
--    1. Öncelik: tarih-özel > saha-özel > tip (HOLIDAY>WEEKEND>WEEKDAY>SPECIAL)
--       > başlangıç > id.  (slotGrid.ts `sortTariffs` ile aynı sıra.)
--    2. Aynı başlangıç dakikasını ilk (en öncelikli) tarife alır; sonrakiler
--       o dakikayı EZEMEZ, yalnız boşlukları doldurur.
--    3. Pencereye TAMAMI sığmayan artık süre slot üretmez.
--    4. Süre 60/90/120 dışındaysa 60'a çekilir (slotGrid.normalizeSlotMinutes).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_pitch_slots(
  p_pitch_id uuid,
  p_date date,
  p_court_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(slot_start time without time zone, slot_end time without time zone,
              minutes integer, price numeric, deposit numeric,
              tariff_id uuid, crosses_midnight boolean)
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  WITH gecerli AS (
    SELECT
      tt.id, tt.slot_price, tt.deposit_amount,
      -- Kural 4: izin verilmeyen süre ızgarayı kilitlemesin.
      CASE WHEN COALESCE(tt.slot_minutes, 60) IN (60, 90, 120)
           THEN tt.slot_minutes ELSE 60 END AS dk,
      (EXTRACT(HOUR FROM tt.start_time) * 60
       + EXTRACT(MINUTE FROM tt.start_time))::int AS bas_dk,
      CASE
        WHEN tt.end_time = TIME '00:00' THEN 1440           -- gün sonu
        WHEN tt.end_time <= tt.start_time                    -- gece yarısını aşan
          THEN (EXTRACT(HOUR FROM tt.end_time) * 60
                + EXTRACT(MINUTE FROM tt.end_time))::int + 1440
        ELSE (EXTRACT(HOUR FROM tt.end_time) * 60
              + EXTRACT(MINUTE FROM tt.end_time))::int
      END AS bit_dk,
      row_number() OVER (ORDER BY
        CASE WHEN tt.valid_on IS NOT NULL THEN 0 ELSE 1 END,
        CASE WHEN tt.court_id IS NOT NULL AND tt.court_id = p_court_id
             THEN 0 ELSE 1 END,
        CASE tt.tariff_type WHEN 'HOLIDAY' THEN 1 WHEN 'WEEKEND' THEN 2
                            WHEN 'WEEKDAY' THEN 3 ELSE 4 END,
        tt.start_time,
        tt.id
      ) AS oncelik
    FROM public.pitch_tariffs tt
    WHERE tt.pitch_id = p_pitch_id
      AND COALESCE(tt.is_active, true) = true
      AND (EXTRACT(ISODOW FROM p_date))::int
            = ANY(COALESCE(tt.applies_to_days, ARRAY[1,2,3,4,5]))
      AND (tt.court_id IS NULL OR tt.court_id = p_court_id)
      AND (tt.valid_on IS NULL OR tt.valid_on = p_date)
  ),
  acilim AS (
    -- Kural 3: yalnız TAMAMI pencereye sığan dilimler üretilir.
    SELECT g.id, g.dk, g.slot_price, g.deposit_amount, g.oncelik,
           g.bas_dk + o.ofs AS slot_bas_dk
    FROM gecerli g
    CROSS JOIN LATERAL generate_series(0, g.bit_dk - g.bas_dk - g.dk, g.dk) AS o(ofs)
    WHERE g.bit_dk - g.bas_dk >= g.dk
  ),
  kazanan AS (
    -- Kural 2: başlangıç dakikası başına tek dilim; en öncelikli tarife kazanır.
    SELECT DISTINCT ON (slot_bas_dk) *
    FROM acilim
    ORDER BY slot_bas_dk, oncelik
  )
  SELECT (make_interval(mins => slot_bas_dk))::time,
         (make_interval(mins => slot_bas_dk + dk))::time,
         dk,
         slot_price,
         deposit_amount,
         id,
         (slot_bas_dk + dk) >= 1440
  FROM kazanan
  ORDER BY slot_bas_dk;
$$;

COMMENT ON FUNCTION public.get_pitch_slots(uuid, date, uuid) IS
  'Slot ızgarasının TEK kaynağı. shared/slotGrid.ts buildSlotGrid ile birebir aynı kural: tarife başına kendi ızgarası, başlangıç dakikasında tekilleştirme, öncelik tarih-özel > saha-özel > tip.';

-- ─────────────────────────────────────────────────────────────────────────────
-- A) get_court_day_quote: kendi ızgarasını kurmayı bırakır
--
--    Izgara get_pitch_slots'tan gelir; her dilim _resolve_court_quote ile
--    fiyatlanır (tarife + flash indirim + kapora). Tarife HİÇ yoksa
--    slotGrid.ts Kural 4 ile aynı yedeğe düşülür: çalışma saatinden ızgara.
--    `working_hours->>'slot_duration'` ARTIK YALNIZ bu tarifesiz yedekte okunur.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_court_day_quote(p_court_id uuid, p_date date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_pitch  uuid;
  v_wh     jsonb;
  v_today  jsonb;
  v_out    jsonb := '[]'::jsonb;
  v_sure   int;
  v_step   int;
  v_open   int;
  v_close  int;
  v_m      int;
  v_tarife boolean := false;
  s        RECORD;
  v_q      RECORD;
BEGIN
  SELECT c.pitch_id, p.working_hours INTO v_pitch, v_wh
  FROM public.courts c JOIN public.pitches p ON p.id = c.pitch_id
  WHERE c.id = p_court_id AND COALESCE(c.is_active, true);

  IF v_pitch IS NULL THEN
    RETURN jsonb_build_object('courtId', p_court_id, 'date', p_date,
                              'slotDuration', 60, 'hours', '[]'::jsonb);
  END IF;

  -- 1) TARİFEDEN IZGARA (tek kaynak). Gündüz sonra gece: şeridin okunma sırası.
  FOR s IN
    SELECT g.slot_start, g.slot_end, g.minutes
    FROM public.get_pitch_slots(v_pitch, p_date, p_court_id) g
    ORDER BY (EXTRACT(HOUR FROM g.slot_start) < 6), g.slot_start
  LOOP
    v_tarife := true;
    IF v_sure IS NULL THEN v_sure := s.minutes; END IF;

    SELECT * INTO v_q
    FROM public._resolve_court_quote(p_court_id, p_date, s.slot_start);

    v_out := v_out || jsonb_build_object(
      'time',      to_char(s.slot_start, 'HH24:MI'),
      'endTime',   to_char(s.slot_end,   'HH24:MI'),
      'minutes',   s.minutes,
      'night',     EXTRACT(HOUR FROM s.slot_start) < 6,
      'tariffOk',  v_q.tariff_id IS NOT NULL,
      'total',     v_q.total,
      'basePrice', v_q.base_price,
      'deal',      v_q.deal_id IS NOT NULL,
      'deposit',   v_q.deposit
    );
  END LOOP;

  -- 2) TARİFESİZ YEDEK (slotGrid.ts Kural 4): tesis boş ekran görmesin.
  IF NOT v_tarife THEN
    IF v_wh IS NULL THEN v_wh := '{"open":"09:00","close":"00:00"}'::jsonb; END IF;

    IF jsonb_typeof(v_wh) = 'array' THEN
      v_today := v_wh -> (EXTRACT(ISODOW FROM p_date)::int - 1);
      v_step  := 60;
    ELSE
      v_today := v_wh;
      v_step  := CASE WHEN COALESCE((v_wh->>'slot_duration')::int, 60) IN (60, 90, 120)
                      THEN (v_wh->>'slot_duration')::int ELSE 60 END;
    END IF;

    IF v_today IS NOT NULL AND NOT COALESCE((v_today->>'closed')::boolean, false) THEN
      v_open  := COALESCE(NULLIF(split_part(v_today->>'open',  ':', 1), '')::int, 9) * 60
               + COALESCE(NULLIF(split_part(v_today->>'open',  ':', 2), '')::int, 0);
      v_close := COALESCE(NULLIF(split_part(v_today->>'close', ':', 1), '')::int, 0) * 60
               + COALESCE(NULLIF(split_part(v_today->>'close', ':', 2), '')::int, 0);
      IF v_close <= v_open THEN v_close := v_close + 1440; END IF;

      v_m := v_open;
      WHILE v_m + v_step <= v_close LOOP
        SELECT * INTO v_q
        FROM public._resolve_court_quote(p_court_id, p_date,
                                         (make_interval(mins => v_m))::time);
        v_out := v_out || jsonb_build_object(
          'time',      to_char((make_interval(mins => v_m))::time, 'HH24:MI'),
          'endTime',   to_char((make_interval(mins => v_m + v_step))::time, 'HH24:MI'),
          'minutes',   v_step,
          'night',     (v_m % 1440) < 360,
          'tariffOk',  v_q.tariff_id IS NOT NULL,
          'total',     v_q.total,
          'basePrice', v_q.base_price,
          'deal',      v_q.deal_id IS NOT NULL,
          'deposit',   v_q.deposit
        );
        v_m := v_m + v_step;
      END LOOP;
    END IF;
    v_sure := v_step;
  END IF;

  RETURN jsonb_build_object(
    'courtId', p_court_id,
    'date', p_date,
    -- Geriye dönük uyum. Karışık süreli günde tek başına ANLAMSIZDIR;
    -- istemci dilim başına 'minutes' okumalıdır.
    'slotDuration', COALESCE(v_sure, 60),
    'hours', v_out
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_court_day_quote(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_court_day_quote(uuid, date) TO authenticated;

COMMENT ON FUNCTION public.get_court_day_quote(uuid, date) IS
  'Bir kortun bir günlük saat şeridi + fiyatı. Izgara get_pitch_slots''tan (tarifeden) gelir; working_hours slot_duration yalnız tarifesiz yedekte okunur. Dilim başına minutes/endTime döner.';
