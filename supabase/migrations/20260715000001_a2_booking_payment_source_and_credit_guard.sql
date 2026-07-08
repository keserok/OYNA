-- ==============================================================================
-- A2 — booking_payments.source + owner-manuel kart ödemesini krediden çıkar
-- ------------------------------------------------------------------------------
-- Sorun (denetim OP-P0-2): credit_owner_booking_earning trigger'ı (20260706000001)
-- YALNIZ payment_method='CARD' filtresiyle çalışır; ödemenin KAYNAĞINI ayırt etmez.
-- Bir owner kapıda kendi fiziki POS'undan aldığı kartı recordBookingPayment(...,'CARD')
-- ile girerse OYNA cüzdanına da net kredi yazılır → owner parayı iki kez alır
-- (POS + OYNA payout). Bugün quick-create yöntemi 'CASH' sabit olduğu için UI ile
-- örtülü; veri katmanında açık.
--
-- Çözüm (eklemeli, davranış-koruyan, fail-open):
--   (a) booking_payments'a NOT NULL DEFAULT 'APP' 'source' kolonu. DEFAULT 'APP'
--       kritik: source yazmayan GERÇEK uygulama kart yolları
--       (record_app_deposit_payment 20260707000006, apply_booking_payment
--       20260615091000 — edge create-payment/payment-webhook üzerinden) 'APP'e düşer,
--       owner kredisi YAZMAYA DEVAM eder. Ayrı backfill gerekmez.
--   (b) Trigger predikatı fail-open: kredi = method='CARD' VE source<>'OWNER_MANUAL'.
--       NULL/APP → kredilenir (app yolu asla kırılmaz); OWNER_MANUAL → atlanır.
--   (c) İstemci tarafı (services/pitchOwnerService.ts recordBookingPayment) owner-manuel
--       ödemeye source='OWNER_MANUAL' damgalar (bu migration'la BİRLİKTE deploy edilir).
--
-- update_booking_paid_amount trigger'ına (20260607000001) DOKUNULMAZ: owner-manuel
-- ödeme paid_amount/payment_status'a saymaya devam eder (source'tan bağımsız).
--
-- Uyumluluk: Admin (admin_fetch_booking_payments, reconciliation SUM'ları) ve tüm
-- ciro agregasyonları source-agnostik → owner-manuel kartlar ciroda kalır (kasıtlı).
-- ==============================================================================

-- 1) Kolon
ALTER TABLE public.booking_payments
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'APP'
  CHECK (source IN ('APP','OWNER_MANUAL'));

-- 2) Trigger fonksiyonunu daralt (20260706000001:75-127 gövdesi + fail-open guard)
CREATE OR REPLACE FUNCTION public.credit_owner_booking_earning()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_owner_id     uuid;
  v_rate         numeric;
  v_owner_amount numeric;
BEGIN
  -- A2 KESİN PREDICATE (fail-open): yalnız KART ve OWNER-MANUEL OLMAYAN kredilenir.
  -- NULL/APP → kredi (gerçek uygulama kart ödemesi korunur); OWNER_MANUAL → atla.
  IF NEW.payment_method IS DISTINCT FROM 'CARD'
     OR NEW.source IS NOT DISTINCT FROM 'OWNER_MANUAL' THEN
    RETURN NEW;
  END IF;

  -- Aynı ödeme için tekrar kredi yazma (idempotency; reference_id = booking_payments.id)
  IF EXISTS (
    SELECT 1 FROM public.wallet_transactions
    WHERE reference_type = 'BOOKING' AND reference_id = NEW.id AND type = 'BOOKING_EARNING'
  ) THEN
    RETURN NEW;
  END IF;

  SELECT p.owner_id, COALESCE(p.platform_commission_rate, 10)
    INTO v_owner_id, v_rate
  FROM public.pitch_bookings b
  JOIN public.pitches p ON p.id = b.pitch_id
  WHERE b.id = NEW.booking_id;

  IF v_owner_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_owner_amount := round(NEW.amount * (1 - v_rate / 100.0), 2);
  IF v_owner_amount <= 0 THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.wallet_transactions
    (user_id, amount, type, balance_type, status, reference_type, reference_id, description)
  VALUES
    (v_owner_id, v_owner_amount, 'BOOKING_EARNING', 'EARNINGS', 'PENDING',
     'BOOKING', NEW.id, 'Saha kiralama geliri (2 hafta beklemede)');

  RETURN NEW;
END;
$function$;

-- Trigger bağı zaten mevcut (20260706000001:124-127 AFTER INSERT); yeniden tanımlanmaz.
