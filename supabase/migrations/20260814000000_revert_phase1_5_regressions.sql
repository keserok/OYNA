-- ==============================================================================
-- feature/database-hardening-and-phase1-5 REGRESYONLARININ GERİ ALINMASI
--
-- Bağlam: 20260813000001–20260813000004 SQL'leri canlı projeye elle uygulandı
-- (supabase_migrations tablosuna kaydedilmeden). O SQL'ler mevcut sertleştirmeyi
-- birkaç noktada geri aldı. Bu migration hepsini kanonik hâline döndürür.
--
-- Uygulanmamış bir veritabanında çalıştırıldığında NO-OP'tur (tüm adımlar
-- IF EXISTS / CREATE OR REPLACE ile korumalı).
--
-- Geri alınanlar:
--   1. cleanup_expired_slot_locks()          → DROP (anon'a açık + yetkisiz yıkıcı)
--   2. player_create_booking_with_lock()     → DROP (çifte rezervasyon zaten
--                                              pitch_bookings_no_overlap ile engelli)
--   3. admin_adjust_wallet()                 → DROP (wallet_transactions.type NOT NULL
--                                              ihlali; ilk çağrıda 23502)
--   4. wallet_pay_with_balance()             → DROP (wallet_spend_balance'ın kilitsiz kopyası)
--   5. admin_settle_owner_payout()           → DROP (çağıran yok, ledger dışı yazım)
--   6. request_payout_with_method()          → 20260731000002 sürümüne restore
--   7. owner_earnings_summary()              → 20260719000001001 sürümüne restore
--   8. wallet_transactions / payment_intents → gevşetilmiş politikalar kaldırıldı
--   9. profiles_role_check                   → 20260703000001 sürümüne restore (SUPER_ADMIN + NULL)
--  10. payment_intents_status_check          → 20260703000002 sürümüne restore
--  11. admin_ban_user / admin_verify_user    → KORUNDU, anon/public EXECUTE kaldırıldı
-- ==============================================================================

-- ─── 1–5) Tehlikeli / bozuk / gereksiz fonksiyonları düşür ───────────────────
DROP FUNCTION IF EXISTS public.cleanup_expired_slot_locks();
DROP FUNCTION IF EXISTS public.player_create_booking_with_lock(uuid, date, time, time, numeric);
DROP FUNCTION IF EXISTS public.admin_adjust_wallet(uuid, numeric, text, text);
DROP FUNCTION IF EXISTS public.wallet_pay_with_balance(numeric, text, uuid, text);
DROP FUNCTION IF EXISTS public.admin_settle_owner_payout(uuid, numeric, text);

-- ─── 6) request_payout_with_method — S4 kapılarıyla birlikte geri yükle ──────
-- Canlıdaki sürüm jsonb döndüren bir stub'a indirgenmişti; dönüş tipi
-- değiştiği için CREATE OR REPLACE yetmez, önce DROP gerekir.
DROP FUNCTION IF EXISTS public.request_payout_with_method(numeric, uuid);

CREATE OR REPLACE FUNCTION public.request_payout_with_method(
  p_amount    numeric,
  p_method_id uuid
)
RETURNS public.payout_requests
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid         uuid := auth.uid();
  v_method      public.payout_methods;
  v_wallet      jsonb;
  v_balance     numeric;
  v_payout      public.payout_requests;
  v_role        text;
  v_roles       jsonb;
  v_idstat      text;
  v_is_provider boolean;
  v_iban_disp   text;
  v_min         numeric := COALESCE(public.get_config_number('earnings_payout_min', 100), 100);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT: Tutar sifirdan buyuk olmali.'; END IF;
  IF p_amount < v_min THEN
    RAISE EXCEPTION 'MIN_PAYOUT: En az %₺ çekebilirsin.', v_min::int;
  END IF;

  -- [S4] Yeni hesap çekim kilidi
  PERFORM public._assert_account_old_enough_for_cashout(v_uid);

  SELECT * INTO v_method FROM public.payout_methods WHERE id = p_method_id AND user_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'METHOD_NOT_FOUND: Kayitli odeme yontemi bulunamadi.'; END IF;

  SELECT role, roles INTO v_role, v_roles FROM public.profiles WHERE id = v_uid;
  v_is_provider := v_role IN ('GOALKEEPER','REFEREE')
                   OR (COALESCE(v_roles,'[]'::jsonb) ? 'GOALKEEPER')
                   OR (COALESCE(v_roles,'[]'::jsonb) ? 'REFEREE');
  IF v_is_provider THEN
    SELECT status INTO v_idstat FROM public.provider_identities WHERE user_id = v_uid;
    IF v_idstat IS DISTINCT FROM 'VERIFIED' THEN
      RAISE EXCEPTION 'IDENTITY_REQUIRED: Odeme almadan once TC kimlik dogrulamasi gerekli.';
    END IF;
  END IF;

  v_wallet  := public.get_wallet_summary();
  v_balance := (v_wallet->>'earnings_balance')::numeric;
  IF v_balance < p_amount THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE: Bakiye yetersiz. Mevcut: %', v_balance;
  END IF;
  IF EXISTS (SELECT 1 FROM public.payout_requests WHERE user_id = v_uid AND status = 'PENDING') THEN
    RAISE EXCEPTION 'PENDING_PAYOUT: Bekleyen odeme talebiniz mevcut.';
  END IF;

  v_iban_disp := CASE WHEN v_method.kind = 'IBAN' THEN v_method.iban
                      ELSE 'KART **** ' || v_method.card_last4 || ' (' || COALESCE(v_method.card_brand,'KART') || ')' END;

  INSERT INTO public.payout_requests
    (user_id, amount, iban, iban_holder_name, payout_type, payout_method_id, method_kind)
  VALUES
    (v_uid, p_amount, v_iban_disp, v_method.holder_name,
     CASE WHEN v_is_provider THEN 'PROVIDER_INSTANT' ELSE 'MANUAL' END,
     v_method.id, v_method.kind)
  RETURNING * INTO v_payout;

  INSERT INTO public.wallet_transactions (user_id, amount, type, balance_type, status, reference_type, reference_id, description)
  VALUES (v_uid, p_amount, 'WITHDRAWAL', 'EARNINGS', 'PENDING', 'PAYOUT', v_payout.id,
          CASE WHEN v_method.kind = 'IBAN' THEN 'IBAN''a çekim talebi' ELSE 'Kayıtlı karta çekim talebi' END);

  RETURN v_payout;
END;
$$;

REVOKE ALL ON FUNCTION public.request_payout_with_method(numeric, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_payout_with_method(numeric, uuid) TO authenticated;

-- ─── 7) owner_earnings_summary — ledger/SSOT tabanlı sürüme geri dön ─────────
-- Canlıdaki sürüm reserved/pending'i sabit 0 yazıyor, komisyonu %10 sabitliyor
-- ve month_gross'u pitch_bookings.user_id (rezervasyonu YAPAN oyuncu) üzerinden
-- hesaplıyordu — saha sahibi kendi cirosunu göremiyordu.
CREATE OR REPLACE FUNCTION public.owner_earnings_summary()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_sum jsonb;
  v_pending numeric;
  v_month_gross numeric; v_month_net numeric; v_month_count int;
  v_month_other_net numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  v_sum := public.get_wallet_summary();

  SELECT COALESCE(sum(amount), 0) INTO v_pending
  FROM public.wallet_transactions
  WHERE user_id = v_uid AND balance_type = 'EARNINGS' AND status = 'PENDING' AND amount > 0;

  -- Bu ay saha kiralama: brüt (uygulama kart tahsilatı) → net (kazanç satırı)
  SELECT COALESCE(sum(bp.amount), 0), COALESCE(sum(wt.amount), 0), count(*)
    INTO v_month_gross, v_month_net, v_month_count
  FROM public.wallet_transactions wt
  JOIN public.booking_payments bp ON bp.id = wt.reference_id
  WHERE wt.user_id = v_uid AND wt.type = 'BOOKING_EARNING' AND wt.reference_type = 'BOOKING'
    AND wt.status IN ('PENDING','COMPLETED')
    AND wt.created_at >= date_trunc('month', now());

  -- Bu ay diğer kazançlar (maç/hizmet — kaleci & hakem)
  SELECT COALESCE(sum(amount), 0) INTO v_month_other_net
  FROM public.wallet_transactions
  WHERE user_id = v_uid AND balance_type = 'EARNINGS'
    AND type IN ('MATCH_EARNING','SERVICE_EARNING')
    AND status IN ('PENDING','COMPLETED') AND amount > 0
    AND created_at >= date_trunc('month', now());

  RETURN jsonb_build_object(
    'available',        COALESCE((v_sum->>'earnings_balance')::numeric, 0),
    'reserved',         COALESCE((v_sum->>'reserved_balance')::numeric, 0),
    'pending',          v_pending,
    'month_gross',      v_month_gross,
    'month_net',        v_month_net,
    'month_commission', GREATEST(v_month_gross - v_month_net, 0),
    'month_count',      v_month_count,
    'month_other_net',  v_month_other_net
  );
END;
$$;

REVOKE ALL ON FUNCTION public.owner_earnings_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_earnings_summary() TO authenticated;

-- ─── 8) Gevşetilmiş RLS politikalarını kaldır ────────────────────────────────
-- wallet_no_direct_insert (WITH CHECK false) zaten mevcut; permissive politikalar
-- OR'landığı için "No direct inserts by non-admins" adminlere istemciden doğrudan
-- ledger yazma imkânı veriyordu.
DROP POLICY IF EXISTS "No direct inserts by non-admins" ON public.wallet_transactions;

-- Bunlar wallet_select / "Users view own payment intents" politikalarının
-- TO public kopyalarıydı; kanonik olanlar TO authenticated ile duruyor.
DROP POLICY IF EXISTS "Kullanıcılar kendi işlemlerini görebilir" ON public.wallet_transactions;
DROP POLICY IF EXISTS "Kullanıcılar kendi ödeme niyetlerini görebilir" ON public.payment_intents;

-- ─── 9) profiles_role_check — SUPER_ADMIN ve NULL'ı geri getir ───────────────
-- Canlıdaki sürümde SUPER_ADMIN yoktu; is_platform_admin() bu rolü kontrol ediyor
-- ve profiles_roles_jsonb_check hâlâ izin veriyor. 'USER' ise bu sistemde
-- karşılığı olmayan bir değerdi.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IS NULL OR role::text = ANY (ARRAY[
    'PLAYER', 'GOALKEEPER', 'REFEREE', 'SUPER_ADMIN', 'ADMIN', 'ORGANIZER', 'OWNER'
  ]));

-- ─── 10) payment_intents_status_check — kanonik duruma dön ───────────────────
-- 'EXPIRED' yalnızca silinen cleanup_expired_slot_locks() tarafından yazılıyordu;
-- kod tabanının başka hiçbir yerinde okunmuyor/yazılmıyor.
ALTER TABLE public.payment_intents DROP CONSTRAINT IF EXISTS payment_intents_status_check;
ALTER TABLE public.payment_intents
  ADD CONSTRAINT payment_intents_status_check
  CHECK (status IN ('PENDING','BLOCKED','CAPTURED','PAID','FAILED','REFUNDED','VOIDED'));

-- ─── 11) Korunan admin RPC'leri: anon/public EXECUTE'u kaldır ────────────────
-- admin_ban_user / admin_verify_user işe yarar (sunucu tarafı yetki + audit log),
-- ancak repo konvansiyonu gereği anon'a kapalı olmalı (bkz. 20260809000001).
DO $grant$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'admin_ban_user'
      AND pg_get_function_identity_arguments(p.oid) = 'p_target_id uuid, p_is_banned boolean, p_reason text'
  ) THEN
    REVOKE ALL ON FUNCTION public.admin_ban_user(uuid, boolean, text) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.admin_ban_user(uuid, boolean, text) TO authenticated;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'admin_verify_user'
      AND pg_get_function_identity_arguments(p.oid) = 'p_target_id uuid, p_status text'
  ) THEN
    REVOKE ALL ON FUNCTION public.admin_verify_user(uuid, text) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.admin_verify_user(uuid, text) TO authenticated;
  END IF;
END
$grant$;
