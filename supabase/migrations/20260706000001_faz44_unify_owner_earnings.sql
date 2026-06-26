-- FAZ 4.4 — Saha sahibi gelir birleştirme:
-- Doğrudan saha kiralama (OYNA'nın KART ile tahsil ettiği) geliri de sahibin
-- tek cüzdanına EARNINGS olarak yazılır; böylece bakiye + payout tek güvenli
-- Faz 2 motoru (get_wallet_summary + request_payout + admin_process_payout)
-- üzerinden yürür. Nakit (CASH) tahsilat OYNA'dan geçmediği için yazılmaz.

-- 1) Kazanç özetine BOOKING_EARNING'i ekle
CREATE OR REPLACE FUNCTION public.get_wallet_summary()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_earnings numeric;
  v_reserved numeric;
  v_refund   numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  SELECT COALESCE(SUM(CASE WHEN type IN ('DEPOSIT','MATCH_EARNING','BOOKING_EARNING','REFERRAL_BONUS') THEN amount ELSE -amount END), 0)
  INTO v_earnings
  FROM public.wallet_transactions
  WHERE user_id = v_uid AND balance_type = 'EARNINGS' AND status = 'COMPLETED';

  SELECT COALESCE(SUM(amount), 0)
  INTO v_reserved
  FROM public.wallet_transactions
  WHERE user_id = v_uid AND balance_type = 'EARNINGS'
    AND type = 'WITHDRAWAL' AND status = 'PENDING';

  SELECT COALESCE(SUM(CASE WHEN type = 'DEPOSIT' THEN amount ELSE -amount END), 0)
  INTO v_refund
  FROM public.wallet_transactions
  WHERE user_id = v_uid AND balance_type = 'REFUND_CREDIT' AND status = 'COMPLETED';

  RETURN jsonb_build_object(
    'earnings_balance',      GREATEST(v_earnings - v_reserved, 0),
    'reserved_balance',      GREATEST(v_reserved, 0),
    'refund_credit_balance', GREATEST(v_refund, 0)
  );
END;
$function$;

-- 2) 2 haftalık serbest bırakma cron'u BOOKING_EARNING'i de olgunlaştırsın
CREATE OR REPLACE FUNCTION public.release_owner_earnings()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_days     integer;
  v_released integer;
BEGIN
  SELECT COALESCE(owner_payout_days, 14) INTO v_days FROM public.settings LIMIT 1;
  v_days := COALESCE(v_days, 14);

  WITH released AS (
    UPDATE public.wallet_transactions wt SET status = 'COMPLETED'
    WHERE wt.balance_type = 'EARNINGS'
      AND wt.status = 'PENDING'
      AND wt.type IN ('MATCH_EARNING','BOOKING_EARNING')
      AND wt.created_at <= now() - make_interval(days => v_days)
    RETURNING wt.id
  )
  SELECT COUNT(*) INTO v_released FROM released;

  RETURN jsonb_build_object('released_count', v_released, 'payout_days', v_days);
END;
$function$;

-- 3) booking_payments INSERT → sahibe BOOKING_EARNING (yalnız KART, komisyon sonrası, PENDING)
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
  -- Yalnız OYNA'nın topladığı kart ödemesi cüzdana girer (nakit OYNA'dan geçmez)
  IF NEW.payment_method IS DISTINCT FROM 'CARD' THEN
    RETURN NEW;
  END IF;

  -- Aynı ödeme için tekrar kredi yazma (idempotency)
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

DROP TRIGGER IF EXISTS trg_credit_owner_booking_earning ON public.booking_payments;
CREATE TRIGGER trg_credit_owner_booking_earning
AFTER INSERT ON public.booking_payments
FOR EACH ROW EXECUTE FUNCTION public.credit_owner_booking_earning();
