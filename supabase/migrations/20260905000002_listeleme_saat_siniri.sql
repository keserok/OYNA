-- ════════════════════════════════════════════════════════════════════════════
-- SAHA BAZLI LİSTELEME SAAT SINIRI ("akşam saatleri sahibinde kalır")
-- ----------------------------------------------------------------------------
-- KURUCU KARARI (16 Ağustos 2026): Saha sahipleri ilk dönemde TÜM açık
-- saatlerini vitrine vermeyecek; her sahayla "şu saate kadar listelenir" diye
-- anlaşılacak. Sınır SAHA BAZINDADIR (prensip 2.6: anlaşma tesise özel) ve
-- saha sahibi panelinden ya da yönetim panelinden yazılır. Yazılmamışsa sınır
-- YOKTUR (her şey listelenir) — mevcut sahalar bir karar verilmeden değişmez.
--
-- KURAL (istemci ikizi: shared/slotGrid.ts):
--   · Bir slot ancak TAMAMI sınırdan önce bitiyorsa vitrine çıkar
--     (bitiş ≤ sınır). 90/120 dakikalık slotlar sınırı taşamaz — söz verilen
--     "akşam bende kalsın" sözünün sonuna kadar tutulması için bitişe bakılır.
--   · Gece ekseni: saat < 06:00 "o günün gecesi" sayılır (get_court_day_quote
--     ile aynı dil). Yani sınır 20:00 iken 00:00-02:00 slotları da vitrin
--     DIŞIDIR — gece yarısı, akşamın devamıdır. Sınır 02:00 yazılırsa
--     "gece 2'ye kadar listele" demektir.
--   · Sınır yalnız UYGULAMA kanalını kısar: APP_BOOKING ve APP_MATCH.
--     OWNER_MANUAL ve SUBSCRIPTION serbesttir — saha sahibi akşam saatlerini
--     panelinden elle yönetmeye (kendi müşterisine kapatmaya, deftere
--     işlemeye) devam eder. "Parayı topla" vaadi akşam için ölmez.
--
-- KATMANLAR (prensip 6.1 — arayüze güvenilmez):
--   1) get_pitch_slots: oyuncu ızgarasının TEK kaynağı sınırı uygular
--      (get_court_day_quote buradan beslenir). Sahibin takvimi bu RPC'yi
--      KULLANMAZ (istemci ikizi sınırsız çağrılır) → sahip her saati görür.
--   2) pitch_bookings BEFORE INSERT tetikleyicisi: ızgara atlanıp doğrudan
--      API ile yazılmak istense de sınır dışı APP kaydı doğamaz
--      (create_match_atomic'in rezervasyonu da buradan geçer).
--   3) Yazma yüzeyi: owner_set_listing_cutoff (sahip veya platform admini) +
--      admin_set_pitch_listing_cutoff (denetim kayıtlı ince sarmalayıcı).
--
-- İdempotent: tekrar uygulanması güvenlidir.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1 · Kolon ───────────────────────────────────────────────────────────────
ALTER TABLE public.pitches ADD COLUMN IF NOT EXISTS listing_cutoff time without time zone;

COMMENT ON COLUMN public.pitches.listing_cutoff IS
  'Uygulamada listelenen SON saat (bitişi bu saati aşan slot vitrine çıkmaz; saat<06:00 ertesi gece sayılır). NULL = sınırsız. Yalnız APP_BOOKING/APP_MATCH kanalını kısar; sahibin elle yönetimi serbesttir.';

-- ── 2 · Gece eksenine çeviren yardımcı (tek yerde, iki kullanıcı) ───────────
-- 06:00 çıpalı dakika: 06:00→360 … 23:00→1380 … 00:30→1470 … 05:59→1799.
CREATE OR REPLACE FUNCTION public._listeleme_eksen_dk(p_t time without time zone)
RETURNS integer
LANGUAGE sql IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT CASE WHEN EXTRACT(HOUR FROM p_t) < 6
              THEN (EXTRACT(HOUR FROM p_t) * 60 + EXTRACT(MINUTE FROM p_t))::int + 1440
              ELSE (EXTRACT(HOUR FROM p_t) * 60 + EXTRACT(MINUTE FROM p_t))::int
         END;
$$;

-- ── 3 · Izgara: get_pitch_slots sınırı uygular ──────────────────────────────
-- 20260828000007 tanımının birebir kopyası + `kesim` süzgeci. Yeni parametre
-- p_apply_listing_cutoff DEFAULT true: mevcut çağıranlar (get_court_day_quote)
-- değişmeden sınırlı ızgarayı alır; ileride sahibe özel sunucu tüketicisi
-- çıkarsa false geçebilir.
DROP FUNCTION IF EXISTS public.get_pitch_slots(uuid, date, uuid);
CREATE OR REPLACE FUNCTION public.get_pitch_slots(
  p_pitch_id uuid,
  p_date date,
  p_court_id uuid DEFAULT NULL::uuid,
  p_apply_listing_cutoff boolean DEFAULT true
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
  ),
  kesim AS (
    -- LİSTELEME SINIRI (kurucu kararı 16 Ağu 2026): bitişi sınırı aşan dilim
    -- vitrine çıkmaz. Gece ekseni: dakikalar 06:00 çıpasına göre okunur —
    -- tarife 00:00-02:00 penceresi ızgarada 0-120 üretir, sınır karşısında
    -- 1440-1560 sayılır (o günün gecesi). NULL sınır = süzgeç yok.
    SELECT k.*
    FROM kazanan k
    WHERE NOT p_apply_listing_cutoff
       OR NOT EXISTS (
            SELECT 1 FROM public.pitches p
            WHERE p.id = p_pitch_id
              AND p.listing_cutoff IS NOT NULL
              AND (CASE WHEN k.slot_bas_dk < 360
                        THEN k.slot_bas_dk + 1440 ELSE k.slot_bas_dk END) + k.dk
                  > public._listeleme_eksen_dk(p.listing_cutoff)
          )
  )
  SELECT (make_interval(mins => slot_bas_dk))::time,
         (make_interval(mins => slot_bas_dk + dk))::time,
         dk,
         slot_price,
         deposit_amount,
         id,
         (slot_bas_dk + dk) >= 1440
  FROM kesim
  ORDER BY slot_bas_dk;
$$;

COMMENT ON FUNCTION public.get_pitch_slots(uuid, date, uuid, boolean) IS
  'Slot ızgarasının TEK kaynağı. shared/slotGrid.ts buildSlotGrid ile birebir aynı kural + listeleme saat sınırı (pitches.listing_cutoff; bitiş ≤ sınır, gece 06:00 ekseni). Sahip takvimi istemci ikizini SINIRSIZ kullanır.';

-- ── 4 · Yazma kapısı: sınır dışı APP kaydı doğamaz ─────────────────────────
-- Kalıp: enforce_active_court_for_app_booking (20260828000008) — yalnız
-- uygulama kanalları süzülür, sahibin elle işlemi serbesttir.
CREATE OR REPLACE FUNCTION public._listeleme_siniri_bekcisi()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_cutoff time without time zone;
  v_bas int; v_bit int;
BEGIN
  IF NEW.source NOT IN ('APP_BOOKING', 'APP_MATCH') THEN RETURN NEW; END IF;

  SELECT listing_cutoff INTO v_cutoff FROM public.pitches WHERE id = NEW.pitch_id;
  IF v_cutoff IS NULL THEN RETURN NEW; END IF;

  v_bas := public._listeleme_eksen_dk(NEW.start_time);
  -- Bitiş başlangıçtan küçükse gece yarısını aşıyordur (23:00→00:30).
  v_bit := public._listeleme_eksen_dk(NEW.end_time);
  IF v_bit <= v_bas THEN v_bit := v_bit + 1440; END IF;

  IF v_bit > public._listeleme_eksen_dk(v_cutoff) THEN
    RAISE EXCEPTION 'LISTING_CUTOFF: Bu saha uygulamadan % saatine kadar rezervasyon alıyor.',
      to_char(v_cutoff, 'HH24:MI');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS b_listeleme_siniri ON public.pitch_bookings;
CREATE TRIGGER b_listeleme_siniri
  BEFORE INSERT ON public.pitch_bookings
  FOR EACH ROW EXECUTE FUNCTION public._listeleme_siniri_bekcisi();

-- ── 5 · Yazma yüzeyi: sahip + admin ─────────────────────────────────────────
-- Kalıp: owner_set_pitch_refund_policy (20260728000003) — sahip veya platform
-- admini; NULL = sınır kaldırıldı (her şey listelenir).
CREATE OR REPLACE FUNCTION public.owner_set_listing_cutoff(
  p_pitch_id uuid, p_cutoff time without time zone
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE v_owner uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT owner_id INTO v_owner FROM public.pitches WHERE id = p_pitch_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Saha bulunamadı.'; END IF;
  IF v_owner IS DISTINCT FROM auth.uid() AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: Yalnız kendi sahanın listeleme sınırını belirleyebilirsin.';
  END IF;
  -- 06:00-11:59 arası bir sınır her şeyi kapatır — neredeyse kesin yazım hatası.
  IF p_cutoff IS NOT NULL
     AND EXTRACT(HOUR FROM p_cutoff) >= 6 AND EXTRACT(HOUR FROM p_cutoff) < 12 THEN
    RAISE EXCEPTION 'INVALID: Listeleme sınırı öğleden önce olamaz (12:00–05:59 arası bir saat seç).';
  END IF;
  UPDATE public.pitches SET listing_cutoff = p_cutoff WHERE id = p_pitch_id;
  RETURN jsonb_build_object('pitch_id', p_pitch_id,
    'listing_cutoff', CASE WHEN p_cutoff IS NULL THEN NULL ELSE to_char(p_cutoff, 'HH24:MI') END);
END;
$$;
REVOKE ALL ON FUNCTION public.owner_set_listing_cutoff(uuid, time without time zone) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_set_listing_cutoff(uuid, time without time zone) TO authenticated;

-- Admin ince sarmalayıcısı — denetim kayıtlı (kalıp: admin_set_pitch_cancel_policy).
CREATE OR REPLACE FUNCTION public.admin_set_pitch_listing_cutoff(
  p_pitch_id uuid, p_cutoff time without time zone
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_eski jsonb; v_yeni jsonb;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT jsonb_build_object('listing_cutoff', to_char(listing_cutoff, 'HH24:MI'))
    INTO v_eski FROM public.pitches WHERE id = p_pitch_id;
  v_yeni := public.owner_set_listing_cutoff(p_pitch_id, p_cutoff);
  PERFORM public.log_admin_action('PITCH_LISTING_CUTOFF_SET', 'pitch', p_pitch_id, NULL, v_eski, v_yeni);
  RETURN v_yeni;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_set_pitch_listing_cutoff(uuid, time without time zone) TO authenticated;

-- ── 6 · Doğrulama (7.7: göç kendi kanıtını taşır) ───────────────────────────
DO $$
DECLARE v_n int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pitches' AND column_name = 'listing_cutoff'
  ) THEN
    RAISE EXCEPTION 'DOGRULAMA: pitches.listing_cutoff kolonu yok';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'b_listeleme_siniri' AND tgrelid = 'public.pitch_bookings'::regclass
  ) THEN
    RAISE EXCEPTION 'DOGRULAMA: b_listeleme_siniri tetikleyicisi yok';
  END IF;

  IF (SELECT prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'get_pitch_slots'
      LIMIT 1) NOT LIKE '%listing_cutoff%' THEN
    RAISE EXCEPTION 'DOGRULAMA: get_pitch_slots listeleme sinirini tasimiyor';
  END IF;

  -- Eksen yardımcısı: gece 01:30 → 1530, akşam 20:00 → 1200.
  IF public._listeleme_eksen_dk(TIME '01:30') <> 1530
     OR public._listeleme_eksen_dk(TIME '20:00') <> 1200 THEN
    RAISE EXCEPTION 'DOGRULAMA: _listeleme_eksen_dk gece eksenini yanlis hesapliyor';
  END IF;
END $$;

-- GERİ ALMA (gerekirse):
--   UPDATE public.pitches SET listing_cutoff = NULL;  -- tüm sınırlar kalkar
--   (kolon/tetikleyici yerinde kalır; NULL sınır süzgeci tamamen susturur.)
