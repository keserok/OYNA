-- ============================================================================
-- CÜZDAN-ÖNCELİKLİ ÖDEME SİSTEMİ (strateji kararı)
--
-- Amaç: ödeme altyapısına (PSP) ödenen komisyonu minimuma indirmek — kullanıcı
-- cüzdana tek seferde yükler, oynamalar cüzdan üzerinden döner.
--
-- 1) Maç oluşturma kaporası artık KART BLOKESİ değil, CÜZDAN GÜVENCESİ:
--    bloke anında bakiyeden düşülür (PSP maliyeti yok); maç dolmazsa/iptalde
--    tutar OTOMATİK iade kredisine döner. Kart blokesi (pre-auth) tamamen
--    devre dışı — 7 günlük banka bloke ömrü riski de ortadan kalkar.
-- 2) KOMİSYON TEK KAYNAK: saha sahibi kazancı artık commission_config'ten
--    (admin paneli; GLOBAL + saha bazlı PITCH override) hesaplanır —
--    pitches.platform_commission_rate ile çifte muhasebe biter.
-- 3) owner_earnings_summary: tesis/kaleci/hakem paneli için kazanç özeti
--    (çekilebilir · güvence beklemesinde · bu ay brüt→komisyon→net).
-- ============================================================================

-- ─── 0) _refund_wallet_escrow — cüzdan güvencesini iade kredisine çöz ────────
-- İç yardımcı (SECURITY DEFINER fonksiyonlardan çağrılır). İdempotent:
-- aynı intent için ikinci çağrı para yaratmaz.
CREATE OR REPLACE FUNCTION public._refund_wallet_escrow(p_intent_id uuid, p_note text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_i public.payment_intents;
BEGIN
  SELECT * INTO v_i FROM public.payment_intents WHERE id = p_intent_id;
  IF NOT FOUND OR v_i.provider IS DISTINCT FROM 'WALLET' THEN RETURN false; END IF;
  IF EXISTS (
    SELECT 1 FROM public.wallet_transactions
    WHERE reference_type = 'PAYMENT_INTENT' AND reference_id = p_intent_id
      AND balance_type = 'REFUND_CREDIT'
  ) THEN RETURN false; END IF;

  INSERT INTO public.wallet_transactions
    (user_id, match_id, amount, type, balance_type, status, reference_type, reference_id, description)
  VALUES (v_i.user_id, v_i.match_id, v_i.amount, 'DEPOSIT', 'REFUND_CREDIT', 'COMPLETED',
          'PAYMENT_INTENT', p_intent_id,
          COALESCE(p_note, 'Maç kaporası çözüldü — tutar iade kredisine döndü'));
  PERFORM public._sync_wallet_mirror(v_i.user_id);
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public._refund_wallet_escrow(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._refund_wallet_escrow(uuid, text) TO service_role;

-- ─── 1) match_block_deposit — kapora CÜZDANDAN güvenceye alınır ──────────────
CREATE OR REPLACE FUNCTION public.match_block_deposit(
  p_match_id uuid, p_amount numeric, p_providers jsonb DEFAULT '[]'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_match RECORD;
  v_intent public.payment_intents;
  v_counts RECORD;
  v_prov jsonb;
  v_pid text;
  v_sugg jsonb;
  v_buckets RECORD;
  v_spendable numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT: Kapora tutarı pozitif olmalı.'; END IF;

  SELECT id, "creatorId", captain_id, pitch_id, deposit_status, price, commission_model
    INTO v_match FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Maç bulunamadı.'; END IF;
  IF COALESCE(v_match."creatorId", v_match.captain_id) IS DISTINCT FROM v_uid AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: Yalnız maçı kuran kaptan kapora bloke edebilir.';
  END IF;
  IF v_match.deposit_status <> 'NONE' THEN
    RAISE EXCEPTION 'ALREADY_BLOCKED: Bu maçın kaporası zaten işlenmiş (%).', v_match.deposit_status;
  END IF;

  -- CÜZDAN-ÖNCELİKLİ: yeterli bakiye şart; yoksa kullanıcı yüklemeye yönlendirilir.
  SELECT * INTO v_buckets FROM public._wallet_bucket_balances(v_uid);
  v_spendable := COALESCE(v_buckets.topup_balance, 0) + COALESCE(v_buckets.refund_credit_balance, 0);
  IF v_spendable < p_amount THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE: Kapora için %₺ gerekiyor; kullanılabilir bakiyen %₺. Cüzdanına yükleme yapıp tekrar dene.',
      p_amount::int, round(v_spendable, 2);
  END IF;

  PERFORM public.wallet_spend_balance(v_uid, p_amount, 'MATCH', p_match_id, p_match_id,
    'Maç kaporası — cüzdandan güvenceye alındı');

  -- Güvence intent'i: provider WALLET (kart blokesi YOK; para platformda).
  INSERT INTO public.payment_intents (
    user_id, match_id, pitch_id, amount, currency, status, provider,
    commission_amount, owner_amount, service_provider_amount,
    commission_model, related_entity_type, blocked_at, raw
  ) VALUES (
    v_uid, p_match_id, v_match.pitch_id, p_amount, 'TRY', 'BLOCKED', 'WALLET',
    0, 0, 0, COALESCE(v_match.commission_model,'MODEL_A'), 'MATCH_DEPOSIT', timezone('utc', now()),
    jsonb_build_object('wallet_escrow', true)
  ) RETURNING * INTO v_intent;

  SELECT * INTO v_counts FROM public._match_player_counts(p_match_id);

  UPDATE public.matches SET
    deposit_intent_id  = v_intent.id,
    deposit_status     = 'BLOCKED',
    deposit_amount     = p_amount,
    deferred_providers = COALESCE(p_providers, '[]'::jsonb),
    min_players        = v_counts.min_players,
    status             = 'ACTIVE'
  WHERE id = p_match_id;

  -- Ertelenmiş kaleci/hakem talepleri: providerId verilmişse gerçekten gönder.
  FOR v_prov IN SELECT * FROM jsonb_array_elements(COALESCE(p_providers,'[]'::jsonb)) LOOP
    IF (v_prov->>'type') IS NOT NULL THEN
      BEGIN
        v_pid := NULLIF(v_prov->>'providerId', '');
        IF v_pid IS NULL THEN
          v_sugg := public.find_providers_for_match(p_match_id, (v_prov->>'type')::text);
          v_pid  := v_sugg->0->>'id';
        END IF;
        IF v_pid IS NOT NULL THEN
          PERFORM public.create_service_request(p_match_id, v_pid::uuid, (v_prov->>'type')::text);
        END IF;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Ertelenmiş sağlayıcı talebi gönderilemedi (%): %', v_prov, SQLERRM;
      END;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true, 'intent_id', v_intent.id, 'deposit_status', 'BLOCKED',
    'match_status', 'ACTIVE', 'min_players', v_counts.min_players,
    'total_slots', v_counts.total_slots
  );
END; $$;

-- ─── 2) match_void_deposit — çözülen güvence OTOMATİK iade kredisine ─────────
CREATE OR REPLACE FUNCTION public.match_void_deposit(p_match_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_uid uuid := auth.uid(); v_match RECORD;
BEGIN
  SELECT id, "creatorId", captain_id, deposit_intent_id, deposit_status INTO v_match
  FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF COALESCE(v_match."creatorId", v_match.captain_id) IS DISTINCT FROM v_uid AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF v_match.deposit_status <> 'BLOCKED' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'NOT_BLOCKED', 'deposit_status', v_match.deposit_status);
  END IF;

  UPDATE public.payment_intents
    SET status = 'VOIDED', voided_at = timezone('utc', now()),
        void_reason = COALESCE(p_reason, 'Kadro tamamlanamadı.')
    WHERE id = v_match.deposit_intent_id;

  -- Cüzdan güvencesiyse tutar anında iade kredisine döner (idempotent).
  PERFORM public._refund_wallet_escrow(v_match.deposit_intent_id,
    'Maç kaporası serbest bırakıldı — tutar iade kredisine döndü');

  UPDATE public.matches
    SET deposit_status = 'VOIDED', status = 'CANCELLED',
        cancel_reason = COALESCE(p_reason, 'Kadro tamamlanamadı — kapora serbest bırakıldı.')
    WHERE id = p_match_id;

  RETURN jsonb_build_object('ok', true, 'deposit_status', 'VOIDED', 'match_status', 'CANCELLED');
END; $$;

-- ─── 3) void_preauth — genel void da cüzdan güvencesini çözer ────────────────
CREATE OR REPLACE FUNCTION public.void_preauth(
  p_intent_id   uuid,
  p_void_reason text DEFAULT 'USER_CANCELLED'
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_intent public.payment_intents;
  v_uid    uuid := auth.uid();
BEGIN
  SELECT * INTO v_intent FROM public.payment_intents WHERE id = p_intent_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_intent.status = 'VOIDED' THEN
    RETURN jsonb_build_object('intent_id', v_intent.id, 'status', 'VOIDED', 'idempotent', true);
  END IF;
  IF v_intent.status NOT IN ('PENDING','BLOCKED') THEN
    RAISE EXCEPTION 'INVALID_STATE: PENDING veya BLOCKED bekleniyor, mevcut: %', v_intent.status;
  END IF;
  IF v_uid IS NOT NULL AND v_intent.user_id IS DISTINCT FROM v_uid AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  UPDATE public.payment_intents SET
    status = 'VOIDED', voided_at = now(), void_reason = p_void_reason
  WHERE id = p_intent_id;

  -- Cüzdan güvencesiyse tutar iade kredisine döner (idempotent).
  PERFORM public._refund_wallet_escrow(p_intent_id, NULL);

  RETURN jsonb_build_object('intent_id', p_intent_id, 'status', 'VOIDED', 'reason', p_void_reason);
END;
$$;

-- ─── 4) match_cancel_by_captain — CAPTURED cüzdan kaporasının iadesi ─────────
CREATE OR REPLACE FUNCTION public.match_cancel_by_captain(p_match_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_match RECORD; v_hours numeric; v_far boolean;
BEGIN
  SELECT id, "creatorId", captain_id, deposit_intent_id, deposit_status,
         deposit_amount, starts_at
    INTO v_match FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF COALESCE(v_match."creatorId", v_match.captain_id) IS DISTINCT FROM v_uid AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  v_hours := CASE WHEN v_match.starts_at IS NULL THEN 999
                  ELSE EXTRACT(EPOCH FROM (v_match.starts_at - timezone('utc', now()))) / 3600 END;
  v_far := v_hours >= 24;

  IF v_match.deposit_status = 'BLOCKED' THEN
    -- Henüz kesinleşmedi → her hâlükârda çöz (cüzdansa iade kredisi otomatik).
    PERFORM public.match_void_deposit(p_match_id, 'Kaptan iptali.');
    RETURN jsonb_build_object('ok', true, 'outcome', 'VOIDED', 'refund', 0);
  ELSIF v_match.deposit_status = 'CAPTURED' THEN
    IF v_far THEN
      UPDATE public.payment_intents SET status = 'REFUNDED', voided_at = timezone('utc', now()),
        void_reason = 'Kaptan iptali (≥24s) — iade.'
        WHERE id = v_match.deposit_intent_id;
      -- Cüzdan kaporası: tutar iade kredisine döner (PSP maliyeti olmadığından tam iade).
      PERFORM public._refund_wallet_escrow(v_match.deposit_intent_id,
        'Kaptan iptali (≥24s) — kapora iade kredisine döndü');
      UPDATE public.matches SET deposit_status = 'REFUNDED', status = 'CANCELLED',
        cancel_reason = 'Kaptan iptali (≥24s) — kapora iade edildi.' WHERE id = p_match_id;
      RETURN jsonb_build_object('ok', true, 'outcome', 'REFUNDED');
    ELSE
      UPDATE public.matches SET status = 'CANCELLED',
        cancel_reason = 'Kaptan iptali (<24s) — iade yok (no-show).' WHERE id = p_match_id;
      UPDATE public.profiles
        SET trust_score = GREATEST(COALESCE(trust_score,5.0) - 0.5, 0)
        WHERE id = v_uid;
      RETURN jsonb_build_object('ok', true, 'outcome', 'NO_REFUND_PENALTY');
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', false, 'reason', 'NO_DEPOSIT', 'deposit_status', v_match.deposit_status);
END; $$;

-- ─── 5) admin_match_deposit_action — REFUND cüzdan iadesini de işler ─────────
CREATE OR REPLACE FUNCTION public.admin_match_deposit_action(
  p_match_id uuid, p_action text, p_reason text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_res jsonb; v_intent_id uuid;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'FORBIDDEN: admin gerekli.'; END IF;

  IF p_action = 'CAPTURE' THEN
    v_res := public.match_capture_deposit(p_match_id);
  ELSIF p_action = 'VOID' THEN
    v_res := public.match_void_deposit(p_match_id, COALESCE(p_reason, 'Admin void.'));
  ELSIF p_action = 'REFUND' THEN
    SELECT id INTO v_intent_id FROM public.payment_intents
      WHERE match_id = p_match_id AND related_entity_type = 'MATCH_DEPOSIT'
        AND status IN ('BLOCKED','CAPTURED')
      ORDER BY created_at DESC LIMIT 1;
    UPDATE public.payment_intents SET status = 'REFUNDED', voided_at = timezone('utc', now()),
      void_reason = COALESCE(p_reason, 'admin_refund')
      WHERE match_id = p_match_id AND related_entity_type = 'MATCH_DEPOSIT'
        AND status IN ('BLOCKED','CAPTURED');
    IF v_intent_id IS NOT NULL THEN
      PERFORM public._refund_wallet_escrow(v_intent_id, 'Admin iadesi — kapora iade kredisine döndü');
    END IF;
    UPDATE public.matches SET deposit_status = 'REFUNDED' WHERE id = p_match_id;
    v_res := jsonb_build_object('ok', true, 'deposit_status', 'REFUNDED');
  ELSE
    RAISE EXCEPTION 'INVALID_ACTION: CAPTURE|VOID|REFUND bekleniyor.';
  END IF;

  BEGIN
    PERFORM public.log_admin_action('MATCH_DEPOSIT_' || p_action, 'MATCH', p_match_id, p_match_id::text,
      NULL, jsonb_build_object('reason', p_reason, 'result', v_res));
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN v_res;
END; $$;

-- ─── 6) KOMİSYON TEK KAYNAK — owner kazancı commission_config'ten ───────────
-- Eski: pitches.platform_commission_rate (%10 varsayılan) — artık KULLANILMAZ.
-- Yeni: calculate_commission(tutar, 'PITCH', pitch_id) → admin panelindeki oran
-- (GLOBAL varsayılan + saha bazlı PITCH override). payment_intents ile tutarlı.
CREATE OR REPLACE FUNCTION public.credit_owner_booking_earning()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_owner_id     uuid;
  v_pitch_id     uuid;
  v_comm         jsonb;
  v_owner_amount numeric;
BEGIN
  -- A2 KESİN PREDICATE (fail-open): yalnız KART ve OWNER-MANUEL OLMAYAN kredilenir.
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

  SELECT p.owner_id, p.id
    INTO v_owner_id, v_pitch_id
  FROM public.pitch_bookings b
  JOIN public.pitches p ON p.id = b.pitch_id
  WHERE b.id = NEW.booking_id;

  IF v_owner_id IS NULL THEN RETURN NEW; END IF;

  v_comm := public.calculate_commission(NEW.amount, 'PITCH', v_pitch_id);
  v_owner_amount := round((v_comm->>'net_amount')::numeric, 2);

  IF v_owner_amount <= 0 THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.wallet_transactions
    (user_id, amount, type, balance_type, status, reference_type, reference_id, description)
  VALUES
    (v_owner_id, v_owner_amount, 'BOOKING_EARNING', 'EARNINGS', 'PENDING',
     'BOOKING', NEW.id,
     format('Saha kiralama geliri (%%%s komisyon düşüldü · 2 hafta beklemede)',
            COALESCE(v_comm->>'commission_pct', '15')));

  RETURN NEW;
END;
$$;

-- ─── 7) owner_earnings_summary — kazanç paneli özeti ────────────────────────
-- Tesis/kaleci/hakem: çekilebilir · güvence beklemesinde · bu ay brüt→komisyon→net.
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
