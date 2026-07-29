-- ÜRETİMDEN GERİ ÇEKİLDİ (defter sapması onarımı, 2026-07-28)
-- Bölüm 1/2: courts kapasite aralığı (TAKIM BAŞINA) + size_label + fiyat çözücüler
-- NOT: Buradaki _resolve_court_quote ve get_court_day_quote sürümleri sonraki
-- migrasyonlarda (20260727124701, 20260727154401) düzeltilmiştir; replay
-- sırasının doğru olması için bu dosya olduğu gibi korunur.
ALTER TABLE public.courts DROP CONSTRAINT IF EXISTS courts_capacity_range_check;

-- ── SIFIRDAN REPLAY GUARD'I (2026-07-29, depo sahibi onayıyla) ──────────────
-- Bu dosya normalde DEĞİŞMEZ (MIGRATION_PLAYBOOK Altın Kural 2). İstisna şu
-- somut kırılma için verildi:
--
--   Aşağıdaki blok `courts.min_capacity` / `max_capacity` kolonlarını
--   GÜNCELLİYOR, ama o kolonları 20260812000008 EKLİYOR — yani sürüm numarası
--   daha BÜYÜK bir dosya. `courts` tablosu 20260530090000'de bu kolonlar
--   olmadan yaratılıyor. Canlıda patlamadı çünkü gerçek uygulama sırası sürüm
--   sırasından farklıydı; sıfırdan replay dosyaları sürüm sırasına göre
--   çalıştırınca "column min_capacity does not exist" veriyordu.
--
-- Neden kolonu burada EKLEMİYORUZ (ilk denenen ve TERK EDİLEN yol): kolonları
-- erkenden eklemek UPDATE'in çalışmasına yol açıyor, o da TAKIM BAŞINA modelin
-- değerlerini (5, 7 gibi TEK sayılar) yazıyor. Oysa o tarihte hâlâ TOPLAM
-- KAPASİTE modeli geçerli ve 20260812000008 hemen ardından
-- "4–22 arası ve ÇİFT" kısıtını koyuyor → satırlar kısıtı ihlal ediyor:
--   ERROR: check constraint "courts_capacity_range_check" is violated
-- Yani kolonu eklemek hatayı çözmüyor, bir sonrakine taşıyor.
--
-- DOĞRU DAVRANIŞ: kolonlar henüz yoksa bu blok BÜTÜNÜYLE ATLANIR. Model zaten
-- 20260812000008 (toplam) ve 20260818000000 (takım başına) tarafından sırasıyla
-- kuruluyor; bu dosyanın erken müdahalesine gerek yok. Canlıda kolonlar mevcut
-- olduğu için blok eskisi gibi çalışır — üretim davranışı DEĞİŞMEZ.
DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'courts'
       AND column_name = 'min_capacity'
  ) THEN
    RAISE NOTICE 'courts.min_capacity henüz yok — kapasite bloğu atlandı (sıfırdan replay).';
    RETURN;
  END IF;

  UPDATE public.courts
     SET min_capacity = GREATEST(3, CEIL(COALESCE(capacity, 14) / 2.0)::int - 2),
         max_capacity = LEAST(11, CEIL(COALESCE(capacity, 14) / 2.0)::int)
   WHERE min_capacity IS NULL OR max_capacity IS NULL
      OR min_capacity > 11 OR max_capacity > 11;

  ALTER TABLE public.courts
    ALTER COLUMN min_capacity SET DEFAULT 5,
    ALTER COLUMN max_capacity SET DEFAULT 7;
END
$guard$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'courts' AND column_name = 'min_capacity'
  ) THEN RETURN; END IF;
  ALTER TABLE public.courts
    ADD CONSTRAINT courts_capacity_range_chk
    CHECK (min_capacity IS NULL OR max_capacity IS NULL
           OR (min_capacity BETWEEN 3 AND 11 AND max_capacity BETWEEN min_capacity AND 11));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.courts ADD COLUMN IF NOT EXISTS size_label text;
UPDATE public.courts
   SET size_label = CEIL(COALESCE(capacity, 14) / 2.0)::int || 'v' || CEIL(COALESCE(capacity, 14) / 2.0)::int
 WHERE size_label IS NULL;

CREATE OR REPLACE FUNCTION public._resolve_court_quote(
  p_court_id uuid, p_date date, p_start_time time without time zone
) RETURNS TABLE(total numeric, deposit numeric, tariff_id uuid, deal_id uuid, base_price numeric)
LANGUAGE plpgsql STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pitch uuid;
  v_flash boolean;
  v_t RECORD;
  v_d RECORD;
BEGIN
  SELECT c.pitch_id, COALESCE(p.flash_deals_enabled, false)
    INTO v_pitch, v_flash
  FROM public.courts c JOIN public.pitches p ON p.id = c.pitch_id
  WHERE c.id = p_court_id;
  IF v_pitch IS NULL THEN RETURN; END IF;

  SELECT t.tariff_id, t.price, t.deposit INTO v_t
  FROM public.get_current_tariff_price(v_pitch, p_date, p_start_time, p_court_id) t;

  IF v_flash THEN
    SELECT fd.id, fd.deal_price INTO v_d
    FROM public.pitch_flash_deals fd
    WHERE fd.pitch_id = v_pitch
      AND (fd.court_id = p_court_id OR fd.court_id IS NULL)
      AND fd.booking_date = p_date
      AND fd.start_time = p_start_time
      AND NOT COALESCE(fd.is_claimed, false)
      AND (fd.expires_at IS NULL OR fd.expires_at > now())
    ORDER BY (fd.court_id IS NOT NULL) DESC, fd.created_at DESC
    LIMIT 1;
  END IF;

  total     := COALESCE(v_d.deal_price, v_t.price);
  base_price := v_t.price;
  tariff_id := v_t.tariff_id;
  deal_id   := v_d.id;
  deposit   := CASE WHEN COALESCE(v_t.deposit, 0) > 0 THEN v_t.deposit
                    ELSE CEIL(COALESCE(total, 0) * 0.20) END;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public._resolve_court_quote(uuid, date, time) FROM PUBLIC, anon, authenticated;
