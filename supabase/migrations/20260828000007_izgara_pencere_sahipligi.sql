-- ============================================================================
-- IZGARA PENCERE SAHİPLİĞİ: dilim, başlangıcını kapsayan EN ÖNCELİKLİ tarifeye aittir
--
-- SORUN (20260828000005'ten sonra ortaya çıkan ikinci ayrışma):
-- Izgara, düşük öncelikli bir tarifenin YÜKSEK öncelikli bir tarifenin
-- penceresi İÇİNDE slot üretmesine izin veriyordu. Tekilleştirme yalnız
-- "başlangıç dakikası" bazındaydı; dolayısıyla yüksek öncelikli tarifenin
-- ızgarasına denk GELMEYEN saatler, düşük öncelikli tarifeden "boşluk
-- doldurma" slotu olarak sızıyordu.
--
-- Canlı kanıt (kort 28071df7, 2026-07-29 — 15:00-23:00 arası korta özel 90dk
-- tarife + tesis geneli 60dk tarifeler):
--
--   saat    ızgaranın dediği        _resolve_court_quote'un dediği
--   19:00   60 dakika, 3000TL       90 dakika, 0TL        ← AYRIŞMA
--   16:00   60 dakika, 1200TL       90 dakika, 0TL        ← AYRIŞMA
--   17:00   60 dakika, 3000TL       90 dakika, 0TL        ← AYRIŞMA
--
-- `create_match_atomic` süreyi ve fiyatı `_resolve_court_quote`'tan aldığı için
-- kullanıcı şeritte "19:00 · 60 dk · 3000TL" görüp tıkladığında 90 dakikalık ve
-- farklı fiyatlı bir maç kuruluyordu. Yani E12a'nın ızgara yarısı düzeltilmiş
-- olmasına rağmen "gösterilen dilim ≠ gerçek maç" hatası bu yoldan sürüyordu.
--
-- KURAL (E12a'nın doğru okunuşu — slotGrid.ts Kural 3'ün lafzı:
-- "Kazanan tarifenin ürettiği slot, daha düşük öncelikli tarifenin slotunu
-- ezer"): bir tarife, kendisinden DAHA ÖNCELİKLİ bir tarifenin penceresi
-- içinde kalan başlangıçlarda slot ÜRETEMEZ. Yüksek öncelikli tarife kendi
-- penceresinin tamamına sahiptir; artık süre (pencereye tam sığmayan kuyruk)
-- boş kalır — doldurulmaz.
--
-- SONUÇ: ızgara ile fiyat/süre çözümü her saatte AYNI tarifeyi gösterir;
-- şerit, kurulacak maçın gerçek süresini ve fiyatını yansıtır.
-- Aynı kural istemcide `shared/slotGrid.ts buildSlotGrid` içine de eklendi
-- (ikizler ayrışmasın).
--
-- Beklenen ızgara (aynı kort/gün):
--   09:00…14:00 (60dk) · 15:00/16:30/18:00/19:30/21:00 (90dk) · 23:00 (60dk)
--   22:30-23:00 arası 30 dakikalık artık BOŞ kalır (Kural 2).
--
-- İdempotent: tekrar uygulanması güvenlidir.
-- ============================================================================

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
      CASE WHEN COALESCE(tt.slot_minutes, 60) IN (60, 90, 120)
           THEN tt.slot_minutes ELSE 60 END AS dk,
      (EXTRACT(HOUR FROM tt.start_time) * 60
       + EXTRACT(MINUTE FROM tt.start_time))::int AS bas_dk,
      CASE
        WHEN tt.end_time = TIME '00:00' THEN 1440
        WHEN tt.end_time <= tt.start_time
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
    -- Kural 2: yalnız TAMAMI pencereye sığan dilimler.
    SELECT g.id, g.dk, g.slot_price, g.deposit_amount, g.oncelik,
           g.bas_dk + o.ofs AS slot_bas_dk
    FROM gecerli g
    CROSS JOIN LATERAL generate_series(0, g.bit_dk - g.bas_dk - g.dk, g.dk) AS o(ofs)
    WHERE g.bit_dk - g.bas_dk >= g.dk
  ),
  sahipli AS (
    -- Kural 3 (PENCERE SAHİPLİĞİ): daha öncelikli bir tarifenin penceresi bu
    -- başlangıcı kapsıyorsa, düşük öncelikli tarife burada slot üretemez.
    SELECT a.*
    FROM acilim a
    WHERE NOT EXISTS (
      SELECT 1 FROM gecerli ust
      WHERE ust.oncelik < a.oncelik
        AND a.slot_bas_dk >= ust.bas_dk
        AND a.slot_bas_dk <  ust.bit_dk
    )
  ),
  kazanan AS (
    -- Emniyet ağı: aynı başlangıç yine de iki kez üretilirse en öncelikli kalır.
    SELECT DISTINCT ON (slot_bas_dk) *
    FROM sahipli
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
  'Slot ızgarasının TEK kaynağı. shared/slotGrid.ts buildSlotGrid ile birebir aynı kural: her tarife kendi ızgarasını kurar, dilim başlangıcını kapsayan EN ÖNCELİKLİ tarifeye aittir (tarih-özel > saha-özel > tip), pencereye sığmayan artık boş kalır.';
