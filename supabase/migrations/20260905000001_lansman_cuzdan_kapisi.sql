-- ════════════════════════════════════════════════════════════════════════════
-- LANSMAN: CÜZDAN KAPISI KİLİTLENDİ + MAÇ KAPORASI BEKLEMEYE ALINDI
-- ----------------------------------------------------------------------------
-- KURUCU KARARI (16 Ağustos 2026): OYNA kullanıcı adına bakiye TUTMAZ.
-- Uygulama içinde saklı bakiye ("cüzdan") 6493 sayılı Kanun kapsamında
-- elektronik para ihracı sayılır ve lisans ister. v1'de ödeme işlem başına
-- karttan alınır (iyzico canlıya alınınca); iadeler KARTA döner (v1.1 işi).
--
-- Bu göç üç kapı kurar (istemci zaten cüzdanı göstermiyor —
-- shared/featureFlags.ts; burası SUNUCU katmanı, prensip 6.1: kapılar
-- arayüze güvenmez):
--
--   1) app_config.wallet_enabled = false  → tüketici cüzdanının ana anahtarı.
--      wallet_cashout_enabled zaten false; bu anahtar YÜKLEMEYİ de kapatır.
--   2) payment_intents  BEFORE INSERT: TOP_UP niyeti üretilemez.
--      wallet_transactions BEFORE INSERT: TOP_UP defter satırı yazılamaz.
--      (EARNINGS ve REFUND_CREDIT bilinçli SERBEST: hakediş defteri ile mevcut
--      iade yolları çalışmaya devam eder; karta-iade gelene dek REFUND_CREDIT
--      tek iade kanalıdır ve yeni yükleme olmadığı için büyüyemez.)
--   3) app_config.match_deposit_enabled = false → maç kaporası BEKLEMEDE.
--      Kapora bugüne kadar YALNIZ cüzdan bakiyesinden bloke edilebiliyordu
--      (match_block_deposit). Cüzdan kapanınca kaporalı saha, maç yayınını
--      imkânsız kılardı (INSUFFICIENT_BALANCE). Kapora tutarının TEK kaynağı
--      _resolve_court_quote olduğundan kapı oraya kurulur: anahtar kapalıyken
--      kapora 0 döner → şerit "kapora yok" gösterir, create_match_atomic
--      kaporasız (deposit_status = NONE) yayınlar. Kart-kaporası v1.1'de
--      yazılınca anahtar açılır ve davranış tek yerden geri gelir.
--
-- İdempotent: tekrar uygulanması güvenlidir.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1 · Ayar anahtarları ────────────────────────────────────────────────────
INSERT INTO public.app_config (key, value, value_type, category, label, description, is_public, min_value, max_value) VALUES
  ('wallet_enabled', 'false'::jsonb, 'boolean', 'ODEME',
   'Tüketici Cüzdanı',
   'false: kullanıcı adına bakiye tutulmaz — yükleme kapalı, cüzdan yüzeyleri gizli (6493 e-para kararı, 16 Ağu 2026). Ancak lisanslı bir modelle ve kurucu kararıyla açılır; istemcideki shared/featureFlags.ts ile BİRLİKTE açılmalıdır.',
   false, NULL, NULL),
  ('match_deposit_enabled', 'false'::jsonb, 'boolean', 'ODEME',
   'Maç Kaporası',
   'false: maçlar kaporasız yayınlanır (kapora 0 çözülür). Kapora bugüne dek yalnız cüzdandan bloke edilebiliyordu; cüzdan kapalıyken bu anahtar da kapalı kalmalıdır. Kart-kaporası (v1.1) yazılınca açılır.',
   false, NULL, NULL)
ON CONFLICT (key) DO NOTHING;

-- ── 2 · Cüzdan yükleme kapıları (iki katman) ────────────────────────────────
-- Katman A: niyet üretimi. prepare_card_payment TOP_UP akışı buradan geçer.
CREATE OR REPLACE FUNCTION public._cuzdan_kapisi_payment_intents()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NEW.related_entity_type = 'TOP_UP'
     AND NOT public.get_config_bool('wallet_enabled', false) THEN
    RAISE EXCEPTION 'WALLET_DISABLED: Cüzdana yükleme kapalı — OYNA kullanıcı adına bakiye tutmaz.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS b_cuzdan_kapisi ON public.payment_intents;
CREATE TRIGGER b_cuzdan_kapisi
  BEFORE INSERT ON public.payment_intents
  FOR EACH ROW EXECUTE FUNCTION public._cuzdan_kapisi_payment_intents();

-- Katman B: defter satırı. Niyet katmanı bir gün atlansa bile bakiye DOĞAMAZ.
CREATE OR REPLACE FUNCTION public._cuzdan_kapisi_wallet_tx()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NEW.balance_type = 'TOP_UP'
     AND NOT public.get_config_bool('wallet_enabled', false) THEN
    RAISE EXCEPTION 'WALLET_DISABLED: Cüzdan defterine yükleme satırı yazılamaz — cüzdan kapalı.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS b_cuzdan_kapisi ON public.wallet_transactions;
CREATE TRIGGER b_cuzdan_kapisi
  BEFORE INSERT ON public.wallet_transactions
  FOR EACH ROW EXECUTE FUNCTION public._cuzdan_kapisi_wallet_tx();

-- ── 3 · Maç kaporası beklemede: kapı tutarın TEK kaynağında ─────────────────
-- 20260828000004 tanımının birebir kopyası + tek satırlık kapora kapısı.
-- (Şerit fiyatı, maç yayını ve kapora aynı fonksiyondan beslenir; kapı burada
-- olunca "ekran kapora yok diyor ama sunucu istiyor" ayrışması yaşanamaz.)
CREATE OR REPLACE FUNCTION public._resolve_court_quote(
  p_court_id uuid, p_date date, p_start_time time without time zone
) RETURNS TABLE(total numeric, deposit numeric, tariff_id uuid, deal_id uuid,
                base_price numeric, slot_minutes integer)
LANGUAGE plpgsql STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pitch uuid;
  v_flash boolean;
  v_tid uuid; v_price numeric; v_dep numeric; v_min int;
  v_deal_id uuid; v_deal_price numeric;
BEGIN
  SELECT c.pitch_id, COALESCE(p.flash_deals_enabled, false)
    INTO v_pitch, v_flash
  FROM public.courts c JOIN public.pitches p ON p.id = c.pitch_id
  WHERE c.id = p_court_id;
  IF v_pitch IS NULL THEN RETURN; END IF;

  -- t.slot_minutes NİTELENMİŞ okunur: aynı adlı OUT parametresiyle karışmasın.
  SELECT t.tariff_id, t.price, t.deposit, t.slot_minutes
    INTO v_tid, v_price, v_dep, v_min
  FROM public.get_current_tariff_price(v_pitch, p_date, p_start_time, p_court_id) t;

  IF v_flash THEN
    SELECT fd.id, fd.deal_price INTO v_deal_id, v_deal_price
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

  total        := COALESCE(v_deal_price, v_price);
  base_price   := v_price;
  tariff_id    := v_tid;
  deal_id      := v_deal_id;
  -- Kapora süreyle ölçeklenmez (E13): sahip ne yazdıysa o, yoksa toplamın %20'si.
  -- LANSMAN KAPISI: match_deposit_enabled kapalıyken kapora 0'dır — maçlar
  -- kaporasız yayınlanır (cüzdan kapandı, kart-kaporası v1.1'de).
  deposit      := CASE WHEN NOT public.get_config_bool('match_deposit_enabled', false) THEN 0
                       WHEN COALESCE(v_dep, 0) > 0 THEN v_dep
                       ELSE CEIL(COALESCE(total, 0) * 0.20) END;
  -- Slot süresi TARİFEDEN gelir; tarife bulunamadıysa NULL döner ve çağıran
  -- kendi yedeğine düşer (uydurma 60 BURADA basılmaz).
  slot_minutes := v_min;
  RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION public._resolve_court_quote(uuid, date, time without time zone)
  FROM PUBLIC, anon, authenticated;

-- ── 4 · Doğrulama (7.7: göç kendi kanıtını taşır) ───────────────────────────
DO $$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM public.app_config
  WHERE key IN ('wallet_enabled', 'match_deposit_enabled');
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'DOGRULAMA: ayar anahtarlari eksik (bulunan %, beklenen 2)', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM pg_trigger
  WHERE tgname = 'b_cuzdan_kapisi'
    AND tgrelid IN ('public.payment_intents'::regclass, 'public.wallet_transactions'::regclass);
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'DOGRULAMA: cuzdan kapisi tetikleyicileri eksik (bulunan %, beklenen 2)', v_n;
  END IF;

  IF (SELECT prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = '_resolve_court_quote'
      LIMIT 1) NOT LIKE '%match_deposit_enabled%' THEN
    RAISE EXCEPTION 'DOGRULAMA: _resolve_court_quote kapora kapisini tasimiyor';
  END IF;
END $$;

-- GERİ ALMA (gerekirse):
--   UPDATE public.app_config SET value = 'true'::jsonb WHERE key = 'wallet_enabled';
--   UPDATE public.app_config SET value = 'true'::jsonb WHERE key = 'match_deposit_enabled';
--   (tetikleyiciler anahtara bakar; anahtar açılınca kendiliğinden geçirgenleşir.
--    Tetikleyicileri tamamen kaldırmak İSTENMEZ — kapı, anahtarın denetimidir.)
