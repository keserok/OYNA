-- ==============================================================================
-- OYNA: Owner (Saha Sahibi) Module — Complete Schema
-- ==============================================================================
-- RECONCILED MIGRATION.
-- Bu migration, canlı (production) OYNA veritabanının GERÇEK durumuna göre
-- yazılmıştır; spesifikasyondaki varsayımsal şema ile birebir aynı değildir.
--
-- Canlı şema ile uyumlandırma kararları:
--   * `pitch_courts` YERİNE mevcut `courts` tablosu kullanılır
--     (pitch_bookings.court_id -> courts.id zaten bağlı).
--   * `pitch_availability_exceptions` YERİNE mevcut `court_availability` genişletilir.
--   * `pitch_subscriptions` zaten var (weekday/price/customer_name şemasıyla);
--     yalnızca eksik kolonlar eklenir.
--   * `pitch_bookings` zaten gelişmiş: `source` (booking_source DEĞİL),
--     `price` (total_price DEĞİL), `paid_amount`, `customer_name/phone`,
--     `payment_status` ve GiST EXCLUDE (court_id =, slot_range &&) çift-rezervasyon
--     engeli mevcut. UNIQUE constraint EKLENMEZ (exclude daha güçlü).
--   * Admin tespiti `profiles.role = 'ADMIN'` ile yapılır (`is_admin` YOK).
--   * Bildirimler `type_key` + `payload` kolonlarını kullanır (`type`/`target_audience` YOK).
--   * Maç skoru `matches."homeScore"/"awayScore"/"scoreEnteredAt"` (camelCase) kolonlarına yazılır.
--   * Tüm kullanıcı FK'leri `public.profiles(id)` referanslar (DB konvansiyonu).
--   * Tüm policy/trigger/constraint eklemeleri idempotent (tekrar çalıştırılabilir).
-- ==============================================================================

-- ==============================================================================
-- 1A. pitches — eksik kolonlar
-- ==============================================================================
ALTER TABLE public.pitches ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'pending';
ALTER TABLE public.pitches ADD COLUMN IF NOT EXISTS verification_notes TEXT;
ALTER TABLE public.pitches ADD COLUMN IF NOT EXISTS is_open BOOLEAN DEFAULT true;
ALTER TABLE public.pitches ADD COLUMN IF NOT EXISTS auto_approve_minutes INTEGER DEFAULT 35;
ALTER TABLE public.pitches ADD COLUMN IF NOT EXISTS pricing_mode TEXT DEFAULT 'FULL';
ALTER TABLE public.pitches ADD COLUMN IF NOT EXISTS cancellation_policy JSONB DEFAULT '{
  "before_24h_refund_percent": 100,
  "before_12h_refund_percent": 50,
  "before_0h_refund_percent": 0
}'::jsonb;
ALTER TABLE public.pitches ADD COLUMN IF NOT EXISTS iban TEXT;
ALTER TABLE public.pitches ADD COLUMN IF NOT EXISTS platform_commission_rate NUMERIC DEFAULT 10.0;
ALTER TABLE public.pitches ADD COLUMN IF NOT EXISTS google_rating NUMERIC DEFAULT 0;
ALTER TABLE public.pitches ADD COLUMN IF NOT EXISTS google_review_count INTEGER DEFAULT 0;
-- city / price_per_match: spec onboarding ve bölgesel istatistik sorguları için (additive)
ALTER TABLE public.pitches ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE public.pitches ADD COLUMN IF NOT EXISTS price_per_match NUMERIC;

-- Onboarding sırasında koordinat toplanmadığı için latitude/longitude opsiyonel olmalı
ALTER TABLE public.pitches ALTER COLUMN latitude DROP NOT NULL;
ALTER TABLE public.pitches ALTER COLUMN longitude DROP NOT NULL;

-- CHECK kısıtları (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pitches_verification_status_check') THEN
    ALTER TABLE public.pitches ADD CONSTRAINT pitches_verification_status_check
      CHECK (verification_status IN ('pending','approved','rejected'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pitches_pricing_mode_check') THEN
    ALTER TABLE public.pitches ADD CONSTRAINT pitches_pricing_mode_check
      CHECK (pricing_mode IN ('FULL','PER_PERSON'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_pitches_verification_status ON public.pitches(verification_status);
CREATE INDEX IF NOT EXISTS idx_pitches_owner ON public.pitches(owner_id);

-- ==============================================================================
-- 1B. courts — spec'teki "pitch_courts" YERİNE mevcut tablo (eksik kolon ekle)
-- ==============================================================================
ALTER TABLE public.courts ADD COLUMN IF NOT EXISTS capacity INTEGER DEFAULT 14;
-- RLS + policy'ler (Courts viewable / Owners manage / Admins manage) zaten mevcut.

-- ==============================================================================
-- 1C. pitch_tariffs — zaman dilimine göre fiyatlandırma (YENİ)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.pitch_tariffs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pitch_id UUID NOT NULL REFERENCES public.pitches(id) ON DELETE CASCADE,
  court_id UUID REFERENCES public.courts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  tariff_type TEXT DEFAULT 'WEEKDAY' CHECK (tariff_type IN ('WEEKDAY','WEEKEND','HOLIDAY','SPECIAL')),
  applies_to_days INTEGER[] DEFAULT ARRAY[1,2,3,4,5],
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  price_per_hour NUMERIC NOT NULL,
  deposit_amount NUMERIC DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT valid_tariff_time CHECK (start_time < end_time OR end_time = '00:00:00')
);
CREATE INDEX IF NOT EXISTS idx_pitch_tariffs_pitch ON public.pitch_tariffs(pitch_id);

ALTER TABLE public.pitch_tariffs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tariffs are publicly viewable" ON public.pitch_tariffs;
CREATE POLICY "Tariffs are publicly viewable" ON public.pitch_tariffs FOR SELECT USING (true);

DROP POLICY IF EXISTS "Owners manage their tariffs" ON public.pitch_tariffs;
CREATE POLICY "Owners manage their tariffs" ON public.pitch_tariffs FOR ALL
USING (
  EXISTS (SELECT 1 FROM public.pitches WHERE id = pitch_tariffs.pitch_id AND owner_id = auth.uid())
  OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'ADMIN'
);

-- ==============================================================================
-- 1D. pitch_bookings — eksik kolonlar (mevcut source/price/paid_amount korunur)
-- ==============================================================================
ALTER TABLE public.pitch_bookings ADD COLUMN IF NOT EXISTS tariff_id UUID REFERENCES public.pitch_tariffs(id) ON DELETE SET NULL;
ALTER TABLE public.pitch_bookings ADD COLUMN IF NOT EXISTS deposit_amount NUMERIC DEFAULT 0;
ALTER TABLE public.pitch_bookings ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE public.pitch_bookings ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE public.pitch_bookings ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.pitch_bookings ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
ALTER TABLE public.pitch_bookings ADD COLUMN IF NOT EXISTS auto_approved_at TIMESTAMPTZ;

-- payment_status CHECK'ini REFUNDED/WAIVED içerecek şekilde genişlet (mevcut değerler alt küme)
ALTER TABLE public.pitch_bookings DROP CONSTRAINT IF EXISTS pitch_bookings_payment_status_check;
ALTER TABLE public.pitch_bookings ADD CONSTRAINT pitch_bookings_payment_status_check
  CHECK (payment_status IN ('PENDING','PARTIAL','PAID','REFUNDED','WAIVED'));

CREATE INDEX IF NOT EXISTS idx_pitch_bookings_pitch_date ON public.pitch_bookings(pitch_id, booking_date);
CREATE INDEX IF NOT EXISTS idx_pitch_bookings_status ON public.pitch_bookings(status);

-- ==============================================================================
-- 1E. pitch_slot_holds — ödeme öncesi 10 dk slot kilidi (YENİ)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.pitch_slot_holds (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pitch_id UUID NOT NULL REFERENCES public.pitches(id) ON DELETE CASCADE,
  court_id UUID REFERENCES public.courts(id) ON DELETE CASCADE,
  booking_date DATE NOT NULL,
  start_time TIME NOT NULL,
  held_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '10 minutes'),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_slot_hold UNIQUE (pitch_id, court_id, booking_date, start_time)
);
CREATE INDEX IF NOT EXISTS idx_slot_holds_lookup ON public.pitch_slot_holds(pitch_id, court_id, booking_date, start_time);

ALTER TABLE public.pitch_slot_holds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Holds are viewable by everyone" ON public.pitch_slot_holds;
CREATE POLICY "Holds are viewable by everyone" ON public.pitch_slot_holds FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users manage own holds" ON public.pitch_slot_holds;
CREATE POLICY "Users manage own holds" ON public.pitch_slot_holds FOR ALL USING (held_by = auth.uid())
WITH CHECK (held_by = auth.uid());

CREATE OR REPLACE FUNCTION public.cleanup_expired_holds()
RETURNS void AS $$
BEGIN
  DELETE FROM public.pitch_slot_holds WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==============================================================================
-- 1F. pitch_subscriptions — mevcut tablo (eksik kolon + subscriber SELECT policy)
-- ==============================================================================
ALTER TABLE public.pitch_subscriptions ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.pitch_subscriptions ADD COLUMN IF NOT EXISTS auto_renew BOOLEAN DEFAULT true;
ALTER TABLE public.pitch_subscriptions ADD COLUMN IF NOT EXISTS renewal_reminder_sent_at TIMESTAMPTZ;

DROP POLICY IF EXISTS "Subscribers view own subscriptions" ON public.pitch_subscriptions;
CREATE POLICY "Subscribers view own subscriptions" ON public.pitch_subscriptions FOR SELECT
USING (user_id = auth.uid());

-- ==============================================================================
-- 1G. booking_payments — booking başına çoklu ödeme (YENİ)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.booking_payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID NOT NULL REFERENCES public.pitch_bookings(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('CASH','CARD','BANK_TRANSFER','OYNA_WALLET')),
  note TEXT,
  recorded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_booking_payments_booking ON public.booking_payments(booking_id);

ALTER TABLE public.booking_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners manage booking payments" ON public.booking_payments;
CREATE POLICY "Owners manage booking payments" ON public.booking_payments FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.pitch_bookings pb
    JOIN public.pitches p ON p.id = pb.pitch_id
    WHERE pb.id = booking_payments.booking_id AND p.owner_id = auth.uid()
  )
  OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'ADMIN'
);

-- Ödeme eklenince pitch_bookings.paid_amount + payment_status otomatik güncelle
-- NOT: canlı tabloda toplam alan adı `price` (total_price DEĞİL).
CREATE OR REPLACE FUNCTION public.update_booking_paid_amount()
RETURNS TRIGGER AS $$
DECLARE
  v_paid NUMERIC;
  v_total NUMERIC;
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO v_paid
  FROM public.booking_payments WHERE booking_id = NEW.booking_id;

  SELECT COALESCE(price, 0) INTO v_total
  FROM public.pitch_bookings WHERE id = NEW.booking_id;

  UPDATE public.pitch_bookings
  SET
    paid_amount = v_paid,
    payment_status = CASE
      WHEN v_total > 0 AND v_paid >= v_total THEN 'PAID'
      WHEN v_paid > 0 THEN 'PARTIAL'
      ELSE 'PENDING'
    END
  WHERE id = NEW.booking_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_booking_paid ON public.booking_payments;
CREATE TRIGGER trg_update_booking_paid
AFTER INSERT ON public.booking_payments
FOR EACH ROW EXECUTE FUNCTION public.update_booking_paid_amount();

-- ==============================================================================
-- 1H. pitch_expenses — tesis gider takibi (YENİ)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.pitch_expenses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pitch_id UUID NOT NULL REFERENCES public.pitches(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  expense_date DATE DEFAULT CURRENT_DATE,
  note TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pitch_expenses_pitch_date ON public.pitch_expenses(pitch_id, expense_date);

ALTER TABLE public.pitch_expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners manage their expenses" ON public.pitch_expenses;
CREATE POLICY "Owners manage their expenses" ON public.pitch_expenses FOR ALL
USING (
  EXISTS (SELECT 1 FROM public.pitches WHERE id = pitch_expenses.pitch_id AND owner_id = auth.uid())
  OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'ADMIN'
);

-- ==============================================================================
-- 1I. pitch_debtors — veresiye müşteri takibi (YENİ)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.pitch_debtors (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pitch_id UUID NOT NULL REFERENCES public.pitches(id) ON DELETE CASCADE,
  oyna_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  phone TEXT,
  amount_owed NUMERIC DEFAULT 0,
  last_match_date DATE,
  notes TEXT,
  last_reminded_at TIMESTAMPTZ,
  is_resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pitch_debtors_pitch ON public.pitch_debtors(pitch_id) WHERE is_resolved = false;

ALTER TABLE public.pitch_debtors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners manage their debtors" ON public.pitch_debtors;
CREATE POLICY "Owners manage their debtors" ON public.pitch_debtors FOR ALL
USING (
  EXISTS (SELECT 1 FROM public.pitches WHERE id = pitch_debtors.pitch_id AND owner_id = auth.uid())
  OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'ADMIN'
);

-- ==============================================================================
-- 1J. pitch_availability_exceptions — kapalı gün/saatler (YENİ)
-- NOT: canlı `court_availability` bir VIEW olduğu için ALTER edilemez;
--      kapatma/istisna verisi için ayrı bir tablo oluşturulur.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.pitch_availability_exceptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pitch_id UUID NOT NULL REFERENCES public.pitches(id) ON DELETE CASCADE,
  court_id UUID REFERENCES public.courts(id) ON DELETE CASCADE,
  exception_date DATE,
  day_of_week INTEGER CHECK (day_of_week BETWEEN 1 AND 7),
  start_time TIME,
  end_time TIME,
  reason TEXT,
  exception_type TEXT DEFAULT 'MAINTENANCE'
    CHECK (exception_type IN ('MAINTENANCE','PRIVATE_EVENT','HOLIDAY','EMERGENCY','OTHER')),
  is_recurring BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pitch_exceptions_pitch ON public.pitch_availability_exceptions(pitch_id, exception_date);

ALTER TABLE public.pitch_availability_exceptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Exceptions publicly viewable" ON public.pitch_availability_exceptions;
CREATE POLICY "Exceptions publicly viewable" ON public.pitch_availability_exceptions FOR SELECT USING (true);

DROP POLICY IF EXISTS "Owners manage exceptions" ON public.pitch_availability_exceptions;
CREATE POLICY "Owners manage exceptions" ON public.pitch_availability_exceptions FOR ALL
USING (
  EXISTS (SELECT 1 FROM public.pitches WHERE id = pitch_availability_exceptions.pitch_id AND owner_id = auth.uid())
  OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'ADMIN'
);

-- ==============================================================================
-- 1K. pitch_flash_deals — anlık indirim kampanyaları (YENİ)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.pitch_flash_deals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pitch_id UUID NOT NULL REFERENCES public.pitches(id) ON DELETE CASCADE,
  court_id UUID REFERENCES public.courts(id) ON DELETE CASCADE,
  booking_date DATE NOT NULL,
  start_time TIME NOT NULL,
  discount_percent INTEGER NOT NULL CHECK (discount_percent BETWEEN 5 AND 80),
  original_price NUMERIC NOT NULL,
  deal_price NUMERIC GENERATED ALWAYS AS (original_price * (1 - discount_percent::NUMERIC / 100)) STORED,
  expires_at TIMESTAMPTZ NOT NULL,
  is_claimed BOOLEAN DEFAULT false,
  claimed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_flash_deals_active ON public.pitch_flash_deals(pitch_id, expires_at) WHERE is_claimed = false;

ALTER TABLE public.pitch_flash_deals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Flash deals publicly viewable" ON public.pitch_flash_deals;
CREATE POLICY "Flash deals publicly viewable" ON public.pitch_flash_deals FOR SELECT USING (true);

DROP POLICY IF EXISTS "Owners manage flash deals" ON public.pitch_flash_deals;
CREATE POLICY "Owners manage flash deals" ON public.pitch_flash_deals FOR ALL
USING (
  EXISTS (SELECT 1 FROM public.pitches WHERE id = pitch_flash_deals.pitch_id AND owner_id = auth.uid())
  OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'ADMIN'
);

-- ==============================================================================
-- 1L. match_score_tokens — QR ile güvenli skor girişi token'ı (YENİ)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.match_score_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '4 hours'),
  used_at TIMESTAMPTZ,
  used_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT one_token_per_match UNIQUE (match_id)
);

ALTER TABLE public.match_score_tokens ENABLE ROW LEVEL SECURITY;

-- Okuma: maç katılımcıları (kaptan/oluşturan/hakem) + sahanın sahibi + admin.
-- NOT: canlı `matches` tablosunda gk_id YOK; refereeId/creatorId/captain_id var (camelCase).
DROP POLICY IF EXISTS "Tokens readable by participants and owner" ON public.match_score_tokens;
CREATE POLICY "Tokens readable by participants and owner" ON public.match_score_tokens FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.matches m
    WHERE m.id = match_score_tokens.match_id
      AND (
        m.captain_id = auth.uid()
        OR m."creatorId" = auth.uid()
        OR m."refereeId" = auth.uid()
      )
  )
  OR EXISTS (
    SELECT 1 FROM public.pitch_bookings pb
    JOIN public.pitches p ON p.id = pb.pitch_id
    WHERE pb.match_id = match_score_tokens.match_id AND p.owner_id = auth.uid()
  )
  OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'ADMIN'
);
-- INSERT/UPDATE yalnızca SECURITY DEFINER RPC'ler üzerinden (aşağıda).

-- ==============================================================================
-- 1M. match_disputes — skor ihtilaf yönetimi (YENİ)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.match_disputes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  raised_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  home_claimed_score TEXT,
  away_claimed_score TEXT,
  evidence_urls JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'OPEN' CHECK (status IN ('OPEN','UNDER_REVIEW','RESOLVED','DISMISSED')),
  resolution_notes TEXT,
  resolved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_match_disputes_status ON public.match_disputes(status);

ALTER TABLE public.match_disputes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage disputes" ON public.match_disputes;
CREATE POLICY "Admins manage disputes" ON public.match_disputes FOR ALL
USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'ADMIN');

DROP POLICY IF EXISTS "Participants view own disputes" ON public.match_disputes;
CREATE POLICY "Participants view own disputes" ON public.match_disputes FOR SELECT
USING (raised_by = auth.uid());

DROP POLICY IF EXISTS "Participants create disputes" ON public.match_disputes;
CREATE POLICY "Participants create disputes" ON public.match_disputes FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL AND raised_by = auth.uid());

-- ==============================================================================
-- 1N. owner_withdrawal_requests — para çekme talepleri (YENİ)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.owner_withdrawal_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pitch_id UUID NOT NULL REFERENCES public.pitches(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  iban TEXT NOT NULL,
  iban_photo_url TEXT,
  status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','PROCESSING','COMPLETED','REJECTED')),
  admin_notes TEXT,
  processed_at TIMESTAMPTZ,
  processed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON public.owner_withdrawal_requests(status);
CREATE INDEX IF NOT EXISTS idx_withdrawals_owner ON public.owner_withdrawal_requests(owner_id);

ALTER TABLE public.owner_withdrawal_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners view own requests" ON public.owner_withdrawal_requests;
CREATE POLICY "Owners view own requests" ON public.owner_withdrawal_requests FOR SELECT
USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "Owners create requests" ON public.owner_withdrawal_requests;
CREATE POLICY "Owners create requests" ON public.owner_withdrawal_requests FOR INSERT
WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "Admins manage all requests" ON public.owner_withdrawal_requests;
CREATE POLICY "Admins manage all requests" ON public.owner_withdrawal_requests FOR ALL
USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'ADMIN');

-- ==============================================================================
-- 1O. View'lar & yardımcı fonksiyonlar
-- ==============================================================================
-- Bugünkü sahacı özeti. security_invoker=true => çağıranın RLS'i geçerli olur
-- (bir sahacı yalnızca KENDİ sahasının verisini görür).
DROP VIEW IF EXISTS public.owner_daily_summary;
CREATE VIEW public.owner_daily_summary
WITH (security_invoker = true) AS
SELECT
  p.id AS pitch_id,
  p.name AS pitch_name,
  p.owner_id,
  CURRENT_DATE AS summary_date,
  (SELECT COUNT(*) FROM public.pitch_bookings pb
     WHERE pb.pitch_id = p.id AND pb.booking_date = CURRENT_DATE) AS total_bookings_today,
  (SELECT COUNT(*) FROM public.pitch_bookings pb
     WHERE pb.pitch_id = p.id AND pb.booking_date = CURRENT_DATE AND pb.status = 'CONFIRMED') AS confirmed_today,
  (SELECT COUNT(*) FROM public.pitch_bookings pb
     WHERE pb.pitch_id = p.id AND pb.booking_date = CURRENT_DATE AND pb.status = 'PENDING') AS pending_today,
  (SELECT COALESCE(SUM(pb.price), 0) FROM public.pitch_bookings pb
     WHERE pb.pitch_id = p.id AND pb.booking_date = CURRENT_DATE AND pb.status = 'CONFIRMED') AS expected_revenue_today,
  (SELECT COALESCE(SUM(pb.paid_amount), 0) FROM public.pitch_bookings pb
     WHERE pb.pitch_id = p.id AND pb.booking_date = CURRENT_DATE) AS collected_today,
  (SELECT COUNT(*) FROM public.courts c WHERE c.pitch_id = p.id) AS total_courts,
  (SELECT COUNT(*) FROM public.courts c WHERE c.pitch_id = p.id AND c.is_active = true) AS active_courts
FROM public.pitches p;

-- Verilen tarih/saat için geçerli tarife fiyatını döndürür
CREATE OR REPLACE FUNCTION public.get_current_tariff_price(
  p_pitch_id UUID,
  p_booking_date DATE,
  p_start_time TIME
) RETURNS TABLE(tariff_id UUID, price NUMERIC, deposit NUMERIC) AS $$
DECLARE
  v_dow INTEGER;
BEGIN
  v_dow := EXTRACT(ISODOW FROM p_booking_date);
  RETURN QUERY
  SELECT t.id, t.price_per_hour, t.deposit_amount
  FROM public.pitch_tariffs t
  WHERE t.pitch_id = p_pitch_id
    AND t.is_active = true
    AND v_dow = ANY(t.applies_to_days)
    AND p_start_time >= t.start_time
    AND (p_start_time < t.end_time OR t.end_time = '00:00:00')
  ORDER BY
    CASE t.tariff_type
      WHEN 'HOLIDAY' THEN 1
      WHEN 'WEEKEND' THEN 2
      WHEN 'WEEKDAY' THEN 3
      ELSE 4
    END
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;

-- ==============================================================================
-- 1P. Atomik rezervasyon RPC (çift rezervasyon EXCLUDE constraint ile engellenir)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.create_pitch_booking(
  p_pitch_id UUID,
  p_court_id UUID,
  p_booking_date DATE,
  p_start_time TIME,
  p_end_time TIME,
  p_source TEXT DEFAULT 'OWNER_MANUAL',
  p_customer_name TEXT DEFAULT NULL,
  p_customer_phone TEXT DEFAULT NULL,
  p_note TEXT DEFAULT NULL,
  p_title TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_booking_id UUID;
  v_tariff_id UUID;
  v_price NUMERIC;
  v_deposit NUMERIC;
  v_is_blocked BOOLEAN;
  v_is_owner BOOLEAN;
  v_is_admin BOOLEAN;
  v_start_ts TIMESTAMP;
  v_end_ts TIMESTAMP;
  v_status TEXT;
  v_auto_minutes INTEGER;
  v_user_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Giriş gerekli.';
  END IF;

  IF p_source NOT IN ('OWNER_MANUAL','APP_BOOKING','SUBSCRIPTION','APP_MATCH') THEN
    RAISE EXCEPTION 'INVALID_SOURCE: Geçersiz rezervasyon kaynağı.';
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.pitches WHERE id = p_pitch_id AND owner_id = auth.uid())
    INTO v_is_owner;
  SELECT ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'ADMIN') INTO v_is_admin;

  -- Sahacı/manuel rezervasyonu sadece tesis sahibi veya admin oluşturabilir
  IF p_source = 'OWNER_MANUAL' AND NOT (v_is_owner OR v_is_admin) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Bu tesis için rezervasyon oluşturma yetkiniz yok.';
  END IF;

  -- Slot zaman aralığı (gece yarısını geçen saatleri ertesi güne taşı)
  v_start_ts := (p_booking_date + p_start_time)::timestamp;
  v_end_ts := (p_booking_date + p_end_time)::timestamp;
  IF v_end_ts <= v_start_ts THEN
    v_end_ts := v_end_ts + INTERVAL '1 day';
  END IF;

  -- 1) Kapalı gün / istisna kontrolü (pitch_availability_exceptions)
  --    start_time NULL => tüm gün kapalı.
  SELECT EXISTS(
    SELECT 1 FROM public.pitch_availability_exceptions ex
    WHERE ex.pitch_id = p_pitch_id
      AND (ex.court_id = p_court_id OR ex.court_id IS NULL)
      AND (
        (COALESCE(ex.is_recurring, false) = false AND ex.exception_date = p_booking_date
           AND (ex.start_time IS NULL OR (ex.start_time <= p_start_time AND ex.end_time > p_start_time)))
        OR
        (ex.is_recurring = true AND ex.day_of_week = EXTRACT(ISODOW FROM p_booking_date)::int
           AND (ex.start_time IS NULL OR (ex.start_time <= p_start_time AND ex.end_time > p_start_time)))
      )
  ) INTO v_is_blocked;

  IF v_is_blocked THEN
    RAISE EXCEPTION 'SLOT_UNAVAILABLE: Bu saat dilimi kapalıdır.';
  END IF;

  -- 2) Tarife fiyatı
  SELECT t.tariff_id, t.price, t.deposit
  INTO v_tariff_id, v_price, v_deposit
  FROM public.get_current_tariff_price(p_pitch_id, p_booking_date, p_start_time) t;

  -- 3) Onay durumu
  SELECT auto_approve_minutes INTO v_auto_minutes FROM public.pitches WHERE id = p_pitch_id;
  IF p_source = 'OWNER_MANUAL' OR COALESCE(v_auto_minutes, 35) = 0 THEN
    v_status := 'CONFIRMED';
  ELSE
    v_status := 'PENDING';
  END IF;

  -- 4) Uygulama üzerinden rezervasyonlarda user_id = auth.uid()
  IF p_source IN ('APP_BOOKING','APP_MATCH') THEN
    v_user_id := auth.uid();
  ELSE
    v_user_id := NULL;
  END IF;

  -- 5) İlgili kullanıcının bu slottaki geçici hold'unu temizle
  DELETE FROM public.pitch_slot_holds
  WHERE pitch_id = p_pitch_id AND court_id = p_court_id
    AND booking_date = p_booking_date AND start_time = p_start_time
    AND held_by = auth.uid();

  -- 6) Rezervasyonu oluştur. Çakışma olursa EXCLUDE constraint hata fırlatır.
  BEGIN
    INSERT INTO public.pitch_bookings (
      pitch_id, court_id, user_id, title, customer_name, customer_phone,
      booking_date, start_time, end_time, slot_range,
      status, source, tariff_id, price, deposit_amount, paid_amount,
      payment_status, note
    ) VALUES (
      p_pitch_id, p_court_id, v_user_id, p_title, p_customer_name, p_customer_phone,
      p_booking_date, p_start_time, p_end_time, tsrange(v_start_ts, v_end_ts, '[)'),
      v_status, p_source, v_tariff_id, COALESCE(v_price, 0), COALESCE(v_deposit, 0), 0,
      'PENDING', p_note
    ) RETURNING id INTO v_booking_id;
  EXCEPTION WHEN exclusion_violation THEN
    RAISE EXCEPTION 'SLOT_TAKEN: Bu saat dilimi zaten rezerve edilmiştir.';
  WHEN unique_violation THEN
    RAISE EXCEPTION 'SLOT_TAKEN: Bu saat dilimi zaten rezerve edilmiştir.';
  END;

  RETURN v_booking_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==============================================================================
-- 1Q. Skor QR RPC'leri (token üretimi + skor gönderimi) — SECURITY DEFINER
-- ==============================================================================
-- Maç için skor token'ı oluştur/getir. Yetki: tesis sahibi / kaptan / oluşturan / hakem / admin.
CREATE OR REPLACE FUNCTION public.get_or_create_match_score_token(p_match_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_token TEXT;
  v_allowed BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Giriş gerekli.';
  END IF;

  SELECT (
    EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.id = p_match_id
        AND (m.captain_id = auth.uid() OR m."creatorId" = auth.uid() OR m."refereeId" = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.pitch_bookings pb
      JOIN public.pitches p ON p.id = pb.pitch_id
      WHERE pb.match_id = p_match_id AND p.owner_id = auth.uid()
    )
    OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'ADMIN'
  ) INTO v_allowed;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Bu maç için QR üretme yetkiniz yok.';
  END IF;

  INSERT INTO public.match_score_tokens (match_id)
  VALUES (p_match_id)
  ON CONFLICT (match_id) DO UPDATE
    SET expires_at = NOW() + INTERVAL '4 hours',
        used_at = NULL,
        used_by = NULL
  RETURNING token INTO v_token;

  RETURN v_token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Token ile skor gönder: maçı güncelle, token'ı kullanılmış işaretle, kaptan/oluşturana bildir.
CREATE OR REPLACE FUNCTION public.submit_match_score(
  p_token TEXT,
  p_home_score INTEGER,
  p_away_score INTEGER
) RETURNS UUID AS $$
DECLARE
  v_match_id UUID;
  v_captain UUID;
  v_creator UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Giriş gerekli.';
  END IF;
  IF p_home_score IS NULL OR p_away_score IS NULL OR p_home_score < 0 OR p_away_score < 0
     OR p_home_score > 50 OR p_away_score > 50 THEN
    RAISE EXCEPTION 'INVALID_SCORE: Geçersiz skor.';
  END IF;

  SELECT match_id INTO v_match_id
  FROM public.match_score_tokens
  WHERE token = p_token AND expires_at > NOW() AND used_at IS NULL
  FOR UPDATE;

  IF v_match_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_TOKEN: QR kodu geçersiz veya süresi dolmuş.';
  END IF;

  UPDATE public.matches
  SET "homeScore" = p_home_score,
      "awayScore" = p_away_score,
      status = 'COMPLETED',
      "scoreEnteredAt" = NOW()
  WHERE id = v_match_id;

  UPDATE public.match_score_tokens
  SET used_at = NOW(), used_by = auth.uid()
  WHERE token = p_token;

  SELECT captain_id, "creatorId" INTO v_captain, v_creator FROM public.matches WHERE id = v_match_id;

  INSERT INTO public.notifications (user_id, title, body, type_key, match_id, action_required)
  SELECT uid, 'Maç skoru girildi',
         format('Maç skoru girildi: %s-%s. Onaylar mısın?', p_home_score, p_away_score),
         'MATCH_SCORE_CONFIRM', v_match_id, true
  FROM (SELECT DISTINCT uid FROM unnest(ARRAY[v_captain, v_creator]) AS uid WHERE uid IS NOT NULL) q;

  RETURN v_match_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==============================================================================
-- 1R. Realtime publication (canlı güncellemeler için) — idempotent
-- ==============================================================================
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['pitch_bookings','booking_payments','pitch_slot_holds','pitch_flash_deals','pitch_tariffs']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
