-- ============================================================================
-- SERTLEŞTİRME — GERİ KAZANIM (Faz 2b.5): account_deletion_financial_guard
-- ----------------------------------------------------------------------------
-- Canlıya PR-hattı DIŞINDA doğrudan uygulanmış (ledger'da 20260809000002 KAYITLI,
-- statements NULL, repo'da dosyası yoktu). İçerik canlının GÜNCEL fonksiyon
-- tanımlarından birebir (pg_get_functiondef) yeniden üretildi. Canlıda ledger'da
-- mevcut → merge'de ATLANIR (NET NO-OP); yalnız fresh preview'de çalışır ve
-- hesap-silme akışına finansal koruma ekler.
--
-- Koruma: bakiyesi/çekilebilir tutarı, aktif rezervasyonu, yaklaşan maç blokajı
-- ya da bekleyen ödemesi olan kullanıcının hesabı silinemez; reşit olmayan için
-- veli onayı işlem şartı. Aşağıdaki 5 fonksiyon canlıyla md5-eş olacak şekilde
-- CREATE OR REPLACE ile eşitlenir.
-- ============================================================================

CREATE OR REPLACE FUNCTION public._account_deletion_status(p_uid uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_topup numeric; v_refund numeric; v_earnings numeric; v_reserved numeric;
  v_cashable numeric; v_wait int;
  v_blockers jsonb := '[]'::jsonb; v_warnings jsonb := '[]'::jsonb;
BEGIN
  SELECT topup_balance, refund_credit_balance INTO v_topup, v_refund
    FROM public._wallet_bucket_balances(p_uid);
  SELECT COALESCE(SUM(CASE WHEN type IN ('DEPOSIT','MATCH_EARNING','BOOKING_EARNING','SERVICE_EARNING','REFERRAL_BONUS')
                           THEN amount ELSE -amount END), 0)
    INTO v_earnings FROM public.wallet_transactions
    WHERE user_id = p_uid AND balance_type = 'EARNINGS' AND status = 'COMPLETED'
      AND type NOT IN ('MATCH_FEE','MATCH_REFUND','REFUND');
  SELECT COALESCE(SUM(amount), 0) INTO v_reserved FROM public.wallet_transactions
    WHERE user_id = p_uid AND balance_type = 'EARNINGS' AND type = 'WITHDRAWAL' AND status = 'PENDING';
  v_earnings := GREATEST(v_earnings - v_reserved, 0);
  v_cashable := round(v_topup + v_earnings, 2);

  SELECT COALESCE((SELECT (value #>> '{}')::int FROM public.app_config WHERE key = 'account_deletion_wait_days'), 7)
    INTO v_wait;

  IF EXISTS (
    SELECT 1 FROM public.pitch_bookings
    WHERE user_id = p_uid AND status IN ('PENDING','CONFIRMED')
      AND (booking_date > CURRENT_DATE OR (booking_date = CURRENT_DATE AND end_time > CURRENT_TIME))
  ) THEN
    v_blockers := v_blockers || jsonb_build_object('code','ACTIVE_BOOKING',
      'message','Aktif bir saha rezervasyonun var. Önce iptal et veya tamamlanmasını bekle.');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.payment_intents pi
    JOIN public.matches m ON m.id = pi.match_id
    WHERE pi.user_id = p_uid AND pi.status IN ('PENDING','BLOCKED','CAPTURED')
      AND m.status IN ('GATHERING','CONFIRMED','PLAYING','LIVE')
  ) THEN
    v_blockers := v_blockers || jsonb_build_object('code','ACTIVE_MATCH',
      'message','Yaklaşan bir maça katılımın (blokaj/ödeme) var. Önce maçtan ayrıl.');
  END IF;

  IF v_cashable > 0 THEN
    v_blockers := v_blockers || jsonb_build_object('code','CASHABLE_BALANCE',
      'amount', v_cashable,
      'message', format('Cüzdanında çekilebilir %s₺ var. Silmeden önce IBAN''ına çek.',
        trim(to_char(v_cashable, 'FM999G999G990D00'))));
  END IF;

  IF v_reserved > 0 OR EXISTS (
    SELECT 1 FROM public.payout_requests
    WHERE user_id = p_uid AND status IN ('PENDING','PROCESSING')
  ) THEN
    v_blockers := v_blockers || jsonb_build_object('code','PENDING_PAYOUT',
      'message','Bekleyen bir çekim talebin var. Sonuçlanmasını bekle, sonra tekrar dene.');
  END IF;

  IF v_refund > 0 THEN
    v_warnings := v_warnings || jsonb_build_object('code','REFUND_CREDIT_FORFEIT',
      'amount', v_refund,
      'message', format('%s₺ iade kredin var; bu tutar çekilemez, yalnız uygulama içinde harcanır. Hesabını silersen kaybolur.',
        trim(to_char(v_refund, 'FM999G999G990D00'))));
  END IF;

  RETURN jsonb_build_object(
    'can_delete', (jsonb_array_length(v_blockers) = 0),
    'blockers', v_blockers,
    'warnings', v_warnings,
    'wait_days', v_wait,
    'balances', jsonb_build_object(
      'topup', v_topup, 'earnings', v_earnings, 'refund_credit', v_refund,
      'reserved', v_reserved, 'cashable', v_cashable)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_fetch_deletion_queue()
 RETURNS TABLE(user_id uuid, full_name text, email text, requested_at timestamp with time zone, eligible_at timestamp with time zone, is_eligible boolean, wait_days integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_wait int;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT COALESCE((value)::int, 7) INTO v_wait FROM public.app_config WHERE key = 'account_deletion_wait_days';
  v_wait := COALESCE(v_wait, 7);

  RETURN QUERY
  SELECT
    p.id,
    p.full_name::text,
    CASE WHEN p.email IS NULL OR position('@' in p.email) = 0 THEN p.email::text
         ELSE left(split_part(p.email,'@',1),2) || '•••@' || left(split_part(p.email,'@',2),1) || '•••'
              || CASE WHEN position('.' in split_part(p.email,'@',2))>0
                      THEN '.' || split_part(split_part(p.email,'@',2),'.',-1) ELSE '' END
    END AS email,
    p.account_deletion_requested_at AS requested_at,
    (p.account_deletion_requested_at + (v_wait || ' days')::interval) AS eligible_at,
    (now() >= p.account_deletion_requested_at + (v_wait || ' days')::interval) AS is_eligible,
    v_wait AS wait_days
  FROM public.profiles p
  WHERE p.account_deletion_requested_at IS NOT NULL
  ORDER BY p.account_deletion_requested_at ASC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_process_account_deletion__core(p_user_id uuid, p_anonymize boolean DEFAULT true)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_email        text;
  v_is_admin     boolean;
  v_hard_deleted boolean := false;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT email, (COALESCE(is_admin,false) OR role IN ('ADMIN','SUPER_ADMIN')) INTO v_email, v_is_admin
  FROM public.profiles WHERE id = p_user_id;
  IF v_email IS NULL THEN RAISE EXCEPTION 'Kullanıcı bulunamadı'; END IF;
  IF v_is_admin THEN RAISE EXCEPTION 'Admin hesabı silinemez. Önce yönetici yetkilerini kaldırın.'; END IF;

  IF EXISTS (SELECT 1 FROM public.pitch_bookings WHERE user_id = p_user_id AND status IN ('PENDING','CONFIRMED')
      AND (booking_date > CURRENT_DATE OR (booking_date = CURRENT_DATE AND end_time > CURRENT_TIME))) THEN
    RAISE EXCEPTION 'Kullanıcının aktif saha rezervasyonu var — silme reddedildi. Önce rezervasyon çözülmeli.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.payment_intents pi JOIN public.matches m ON m.id = pi.match_id
      WHERE pi.user_id = p_user_id AND pi.status IN ('PENDING','BLOCKED','CAPTURED')
      AND m.status IN ('GATHERING','CONFIRMED','PLAYING','LIVE')) THEN
    RAISE EXCEPTION 'Kullanıcının yaklaşan maçta blokaj/ödemesi var — silme reddedildi.';
  END IF;

  IF NOT p_anonymize THEN
    BEGIN
      DELETE FROM auth.users WHERE id = p_user_id;
      DELETE FROM public.profiles WHERE id = p_user_id;
      v_hard_deleted := true;
    EXCEPTION WHEN foreign_key_violation THEN
      v_hard_deleted := false;
    END;
  END IF;

  IF NOT v_hard_deleted THEN
    UPDATE public.profiles SET
      full_name='Silinmiş Kullanıcı', name='Silinmiş Kullanıcı',
      email='deleted_'||substr(p_user_id::text,1,8)||'@oyna.deleted',
      phone=NULL, avatar_url=NULL, is_banned=true,
      account_deletion_requested_at=NULL, updated_at=NOW()
    WHERE id=p_user_id;
    BEGIN
      UPDATE auth.users SET
        email='deleted_'||substr(p_user_id::text,1,8)||'@oyna.deleted',
        phone=NULL, raw_user_meta_data='{}'::jsonb,
        banned_until='2999-01-01'::timestamptz, updated_at=NOW()
      WHERE id=p_user_id;
    EXCEPTION WHEN others THEN
      RAISE WARNING 'admin_process_account_deletion: auth.users anonimleştirilemedi (%): %', p_user_id, SQLERRM;
    END;
  END IF;

  PERFORM public.log_admin_action('ACCOUNT_DELETE','user',p_user_id,v_email,NULL,
    jsonb_build_object(
      'anonymized',            NOT v_hard_deleted,
      'hard_delete_requested', NOT p_anonymize,
      'hard_deleted',          v_hard_deleted,
      'note', CASE WHEN (NOT p_anonymize) AND (NOT v_hard_deleted)
                   THEN 'HARD_DELETE_FALLBACK_ANONYMIZED' END
    ));
  RETURN true;
END; $function$;

CREATE OR REPLACE FUNCTION public.assert_can_transact(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_status text;
BEGIN
  IF public.is_user_minor(p_user_id) THEN
    SELECT guardian_consent_status INTO v_status FROM public.profiles WHERE id = p_user_id;
    IF v_status IS DISTINCT FROM 'ACTIVE' THEN
      RAISE EXCEPTION 'MINOR_GUARDIAN_CONSENT_REQUIRED' USING ERRCODE = 'check_violation',
        HINT = 'Reşit olmayan kullanıcı için veli onayı gerekli.';
    END IF;
  END IF;
END; $function$;

CREATE OR REPLACE FUNCTION public.request_account_deletion()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_st jsonb; v_first jsonb; v_wait_days text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Giriş yapmanız gerekiyor.'; END IF;

  v_st := public._account_deletion_status(v_uid);
  IF NOT (v_st->>'can_delete')::boolean THEN
    v_first := (v_st->'blockers')->0;
    RAISE EXCEPTION '%', COALESCE(v_first->>'message', 'Hesap silme şu an engelli.');
  END IF;

  UPDATE public.profiles SET account_deletion_requested_at = NOW(), updated_at = NOW()
  WHERE id = v_uid;

  v_wait_days := v_st->>'wait_days';

  INSERT INTO public.notifications (user_id, title, body, type_key)
  SELECT id, 'Hesap Silme Talebi',
    'Bir kullanıcı hesap silme talebinde bulundu. ' || v_wait_days || ' gün içinde işleme alınmalı.',
    'ACCOUNT_DELETION_REQUEST'
  FROM public.profiles WHERE is_admin = true;

  RETURN TRUE;
END;
$function$;
