-- ════════════════════════════════════════════════════════════════════════════
-- HESAP SİLME: ÇIKIŞI OLMAYAN ÖN KOŞULLAR KALDIRILDI (24 Ağustos 2026)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Apple Guideline 5.1.1(v), hesabın uygulama İÇİNDEN silinebilmesini şart
-- koşar. `_account_deletion_status` bunu üç ön koşula bağlıyordu ve biri
-- kullanıcının uygulama içinde ÇÖZEMEYECEĞİ bir koşuldu:
--
--   CASHABLE_BALANCE → "Cüzdanında çekilebilir X₺ var. Silmeden önce hesabına
--   çek." Ama cüzdan KALICI olarak kapalıdır (§2.10, 6493 sayılı kanun) ve
--   uygulamada para çekme yolu YOKTUR. Yani ekran, yapılması imkânsız bir şeyi
--   yapmasını isteyip hesabı kilitliyordu.
--
-- Ölçüldü (24 Ağu 2026): 41 kullanıcının 20'sinde bakiye > 0. Apple'a verilen
-- tesis hesabı `saha1@oyna.app` da bunlardan biriydi — 6.382₺ bakiyeyle hesabını
-- HİÇ silemiyordu. İncelemeci 5.1.1(v)'i tam olarak orada dener.
--
-- ─── ACTIVE_BOOKING / ACTIVE_MATCH DE ENGEL OLMAKTAN ÇIKTI ──────────────────
-- Bunlar kullanıcının çözebileceği koşullardı (iptal et / maçtan ayrıl), ama
-- yine de silme düğmesini kilitliyorlardı. İncelemecinin doğal yolu şu:
-- vitrindeki örnek maçlardan birine katıl → sonra hesap silmeyi dene → duvar.
--
-- Kaldırmak GÜVENLİ, çünkü asıl koruma zaten SİLME İŞÇİSİNDE:
-- `process_expired_account_deletions` her gece aynı iki koşula bakar ve
-- yaklaşan rezervasyon/maç varsa o kullanıcıyı ATLAR (CONTINUE) — talep
-- kaydı silinmez, ertesi gece tekrar bakılır. Yani silme ertelenir, kaybolmaz.
-- Talep anındaki kapı, işçideki kapının gereksiz bir ikizi ve tek etkisi
-- kullanıcıyı düğmeden mahrum bırakmaktı.
--
-- ─── NE ENGEL OLARAK KALDI ──────────────────────────────────────────────────
-- PENDING_PAYOUT kalır. Orada para GERÇEKTEN hareket hâlindedir (bankaya giden
-- bir çekim talebi) ve silme işçisi bunu kontrol ETMEZ. Apple da yasal/finansal
-- yükümlülük kaynaklı geçici tutmaları kabul eder. Uygulamadan çekim kapalı
-- olduğu için bu satır pratikte yalnız yönetici işlemleriyle doğar.
--
-- ─── KULLANICI NE GÖRÜR ─────────────────────────────────────────────────────
-- Engel değil UYARI: silme düğmesi çalışır, ama ekran neyin bekleyeceğini
-- söyler ("yaklaşan maçın tamamlanana kadar silme bekletilir"). Sessizce
-- silmiyoruz; sadece kapıyı kilitlemiyoruz.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

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
  v_cashable := round(v_topup + v_refund + v_earnings, 2);

  SELECT COALESCE((SELECT (value #>> '{}')::int FROM public.app_config WHERE key = 'account_deletion_wait_days'), 7)
    INTO v_wait;

  -- ── UYARI (engel DEĞİL): yaklaşan rezervasyon ──────────────────────────
  -- Silme işçisi bu koşulu kendisi kontrol eder ve o gece atlar; talep
  -- kaydı durur, rezervasyon geçtikten sonra silme gerçekleşir.
  IF EXISTS (
    SELECT 1 FROM public.pitch_bookings
    WHERE user_id = p_uid AND status IN ('PENDING','CONFIRMED')
      AND (booking_date > CURRENT_DATE OR (booking_date = CURRENT_DATE AND end_time > CURRENT_TIME))
  ) THEN
    v_warnings := v_warnings || jsonb_build_object('code','ACTIVE_BOOKING',
      'message','Yaklaşan bir saha rezervasyonun var. Silme, rezervasyon tamamlanana kadar bekletilir.');
  END IF;

  -- ── UYARI (engel DEĞİL): yaklaşan maç katılımı ─────────────────────────
  IF EXISTS (
    SELECT 1 FROM public.payment_intents pi
    JOIN public.matches m ON m.id = pi.match_id
    WHERE pi.user_id = p_uid AND pi.status IN ('PENDING','BLOCKED','CAPTURED')
      AND m.status IN ('DRAFT','ACTIVE','CONFIRMED','LIVE')
  ) THEN
    v_warnings := v_warnings || jsonb_build_object('code','ACTIVE_MATCH',
      'message','Yaklaşan bir maça katılımın var. Silme, maç tamamlanana kadar bekletilir.');
  END IF;

  -- ── UYARI (engel DEĞİL): çekilemeyen bakiye ────────────────────────────
  -- Cüzdan kapalı olduğu için bu para uygulamadan ÇEKİLEMEZ. Engel yapmak,
  -- kullanıcıdan yapamayacağı bir şeyi istemek olurdu.
  IF v_cashable > 0 THEN
    v_warnings := v_warnings || jsonb_build_object('code','CASHABLE_BALANCE',
      'amount', v_cashable,
      'message', format('Cüzdanında %s₺ görünüyor. Cüzdan kapalı olduğu için bu tutar uygulamadan çekilemez ve hesabınla birlikte silinir.',
        trim(to_char(v_cashable, 'FM999G999G990D00'))));
  END IF;

  -- ── ENGEL: bankaya giden çekim ─────────────────────────────────────────
  -- Burada para GERÇEKTEN hareket hâlinde ve silme işçisi bunu kontrol etmez.
  IF v_reserved > 0 OR EXISTS (
    SELECT 1 FROM public.payout_requests
    WHERE user_id = p_uid AND status IN ('PENDING','PROCESSING')
  ) THEN
    v_blockers := v_blockers || jsonb_build_object('code','PENDING_PAYOUT',
      'message','Bekleyen bir çekim talebin var. Sonuçlanmasını bekle, sonra tekrar dene.');
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

-- ═══ DOĞRULAMA (§7.7) ══════════════════════════════════════════════════════
DO $$
DECLARE
  v_saha uuid; v_d jsonb; v_engelli int; v_bakiyeli int;
BEGIN
  -- 1) Apple'a verilen tesis hesabı artık silinebilmeli.
  SELECT u.id INTO v_saha FROM auth.users u WHERE u.email = 'saha1@oyna.app';
  IF v_saha IS NULL THEN
    RAISE EXCEPTION 'DOGRULAMA: saha1@oyna.app bulunamadi — inceleme hesabi silinmis olabilir';
  END IF;
  v_d := public._account_deletion_status(v_saha);
  IF (v_d->>'can_delete')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'DOGRULAMA: saha1@oyna.app hala silemiyor — engeller: %', v_d->'blockers';
  END IF;

  -- 2) Bakiye artık UYARI olarak görünmeli; sessizce kaybolmamalı.
  IF NOT (v_d->'warnings')::text LIKE '%CASHABLE_BALANCE%' THEN
    RAISE EXCEPTION 'DOGRULAMA: bakiye uyarisi kayboldu — kullanici parasinin silinecegini ogrenemez';
  END IF;

  -- 3) Bakiyesi olan HİÇBİR kullanıcı bu yüzden kilitli kalmamalı.
  SELECT count(*) INTO v_bakiyeli
  FROM auth.users u CROSS JOIN LATERAL public._wallet_bucket_balances(u.id) b
  WHERE b.topup_balance + b.refund_credit_balance > 0;

  SELECT count(*) INTO v_engelli
  FROM auth.users u
  WHERE (public._account_deletion_status(u.id))->'blockers'::text
        @> '[{"code":"CASHABLE_BALANCE"}]'::jsonb;

  IF v_engelli > 0 THEN
    RAISE EXCEPTION 'DOGRULAMA: % kullanici hala CASHABLE_BALANCE ile kilitli', v_engelli;
  END IF;

  RAISE NOTICE 'DOGRULAMA GECTI: bakiyeli % kullanicinin hicbiri kilitli degil; saha1 silebiliyor', v_bakiyeli;
END $$;

COMMIT;
