-- ============================================================================
-- FAZ 3 (min-oyuncu → app_config) + FAZ 8 (RBAC alt-rol + son-SUPER_ADMIN koruması)
-- Tüm gövdeler CANLI tanımdan birebir; yalnız işaretli satırlar eklendi/değişti.
-- ============================================================================

-- ─── Wave 3: maç min-oyuncu yüzdesi artık app_config'ten (panelden) ──────────
CREATE OR REPLACE FUNCTION public.process_match_at_deadline(p_match_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  m          RECORD;
  v_stats    jsonb;
  v_quorum   numeric;
  v_ratio    numeric;
  v_intent   RECORD;
  v_fee      RECORD;
  v_collected numeric;
  v_comm     jsonb;
  v_captured int := 0;
  v_voided   int := 0;
  v_refunded int := 0;
BEGIN
  SELECT * INTO m FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF m.status IN ('CONFIRMED','CANCELLED','COMPLETED','LIVE') THEN
    RETURN jsonb_build_object('match_id', p_match_id, 'status', m.status, 'idempotent', true);
  END IF;

  -- DEĞİŞTİ: min-oyuncu yüzdesi panelden (app_config.match_min_player_pct) okunur
  v_quorum := COALESCE(public.get_config_number('match_min_player_pct', 70), 70) / 100.0;
  v_stats  := public.match_fill_stats(p_match_id);
  v_ratio  := (v_stats->>'paid_ratio')::numeric;

  IF v_ratio >= v_quorum THEN
    UPDATE public.matches SET status = 'CONFIRMED', confirmed_at = now() WHERE id = p_match_id;

    SELECT COALESCE(SUM(ABS(amount)), 0) INTO v_collected
    FROM public.wallet_transactions WHERE match_id = p_match_id AND type = 'MATCH_FEE';

    IF v_collected > 0 AND m.pitch_id IS NOT NULL THEN
      v_comm := public.calculate_commission(v_collected, 'PITCH', m.pitch_id);
      INSERT INTO public.wallet_transactions
        (user_id, match_id, amount, type, balance_type, status, reference_type, reference_id, description)
      SELECT p.owner_id, p_match_id, (v_comm->>'net_amount')::numeric, 'MATCH_EARNING', 'EARNINGS', 'PENDING',
             'MATCH', p_match_id, 'Maç onaylandı — kapora tahsilatı (2 hafta beklemede)'
      FROM public.pitches p WHERE p.id = m.pitch_id AND p.owner_id IS NOT NULL;
    END IF;

    FOR v_intent IN
      SELECT * FROM public.payment_intents
      WHERE match_id = p_match_id AND status IN ('BLOCKED','PENDING') FOR UPDATE
    LOOP
      UPDATE public.payment_intents SET status = 'CAPTURED', captured_at = now()
      WHERE id = v_intent.id;
      v_captured := v_captured + 1;
    END LOOP;

    RETURN jsonb_build_object('match_id', p_match_id, 'status', 'CONFIRMED',
      'paid_ratio', v_ratio, 'collected', v_collected, 'captured_intents', v_captured);
  ELSE
    UPDATE public.matches SET status = 'CANCELLED', cancel_reason = 'QUORUM_NOT_MET',
      refund_status = 'PROCESSING' WHERE id = p_match_id;

    PERFORM set_config('app.wallet_ctx', 'on', true);
    FOR v_fee IN
      SELECT wt.user_id, ABS(wt.amount) AS amt
      FROM public.wallet_transactions wt
      WHERE wt.match_id = p_match_id AND wt.type = 'MATCH_FEE'
        AND NOT EXISTS (
          SELECT 1 FROM public.wallet_transactions r
          WHERE r.match_id = p_match_id AND r.user_id = wt.user_id AND r.type = 'MATCH_REFUND'
        )
    LOOP
      UPDATE public.profiles SET wallet_balance = COALESCE(wallet_balance, 0) + v_fee.amt
      WHERE id = v_fee.user_id;
      INSERT INTO public.wallet_transactions (user_id, match_id, amount, type, description)
      VALUES (v_fee.user_id, p_match_id, v_fee.amt, 'MATCH_REFUND', 'Maç iptal — kapora iadesi');
      v_refunded := v_refunded + 1;
    END LOOP;

    FOR v_intent IN
      SELECT * FROM public.payment_intents
      WHERE match_id = p_match_id AND status IN ('BLOCKED','PENDING') FOR UPDATE
    LOOP
      UPDATE public.payment_intents SET status = 'VOIDED', voided_at = now(),
        void_reason = 'MATCH_QUORUM_NOT_MET' WHERE id = v_intent.id;
      v_voided := v_voided + 1;
    END LOOP;

    UPDATE public.matches SET refund_status = 'DONE' WHERE id = p_match_id;

    RETURN jsonb_build_object('match_id', p_match_id, 'status', 'CANCELLED',
      'paid_ratio', v_ratio, 'refunded', v_refunded, 'voided_intents', v_voided);
  END IF;
END;
$function$;

-- ─── Wave 8: finans RPC'lerine FİNANS alt-rol kapısı (SUPER_ADMIN/ADMIN her zaman geçer) ──
CREATE OR REPLACE FUNCTION public.admin_process_withdrawal(p_request_id uuid, p_approved boolean, p_notes text DEFAULT NULL::text)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_owner_id   UUID;
  v_amount     NUMERIC;
  v_pitch_name TEXT;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;
  PERFORM public.require_admin_role(ARRAY['FINANCE']);  -- EKLENDI

  SELECT w.owner_id, w.amount, p.name
  INTO v_owner_id, v_amount, v_pitch_name
  FROM public.owner_withdrawal_requests w
  LEFT JOIN public.pitches p ON p.id = w.pitch_id
  WHERE w.id = p_request_id;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Talep bulunamadı.';
  END IF;

  UPDATE public.owner_withdrawal_requests SET
    status       = CASE WHEN p_approved THEN 'APPROVED' ELSE 'REJECTED' END,
    admin_notes  = p_notes,
    processed_at = NOW(),
    processed_by = auth.uid()
  WHERE id = p_request_id;

  INSERT INTO public.notifications (user_id, title, body, type_key)
  VALUES (
    v_owner_id,
    CASE WHEN p_approved THEN 'Para Çekme Talebiniz Onaylandı' ELSE 'Para Çekme Talebiniz Reddedildi' END,
    CASE WHEN p_approved
      THEN COALESCE(v_amount::text, '0') || '₺ tutarındaki talebiniz onaylandı.'
      ELSE COALESCE(p_notes, 'Talep reddedildi.')
    END,
    CASE WHEN p_approved THEN 'WITHDRAWAL_APPROVED' ELSE 'WITHDRAWAL_REJECTED' END
  );

  PERFORM public.log_admin_action(
    CASE WHEN p_approved THEN 'WITHDRAWAL_APPROVE' ELSE 'WITHDRAWAL_REJECT' END,
    'withdrawal', p_request_id, COALESCE(v_pitch_name, 'withdrawal'),
    jsonb_build_object('status', 'PENDING'),
    jsonb_build_object('status', CASE WHEN p_approved THEN 'APPROVED' ELSE 'REJECTED' END, 'notes', p_notes, 'amount', v_amount)
  );

  RETURN TRUE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_refund_intent(p_intent_id uuid, p_notes text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_intent public.payment_intents;
  v_hours  numeric;
  v_start  timestamptz;
  v_policy text := 'MATCH';
  v_res    jsonb;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  PERFORM public.require_admin_role(ARRAY['FINANCE']);  -- EKLENDI
  SELECT * INTO v_intent FROM public.payment_intents WHERE id = p_intent_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  IF v_intent.match_id IS NOT NULL THEN
    SELECT starts_at INTO v_start FROM public.matches WHERE id = v_intent.match_id;
    v_policy := 'MATCH';
  ELSIF v_intent.booking_id IS NOT NULL THEN
    SELECT (booking_date + start_time)::timestamptz INTO v_start FROM public.pitch_bookings WHERE id = v_intent.booking_id;
    v_policy := 'BOOKING';
  END IF;
  v_hours := CASE WHEN v_start IS NULL THEN 999
                  ELSE GREATEST(0, EXTRACT(EPOCH FROM (v_start - now())) / 3600.0) END;

  v_res := public.process_tiered_refund(p_intent_id, v_hours, v_policy);

  PERFORM public.log_admin_action('FORCE_REFUND', 'payment_intent', p_intent_id, NULL,
    jsonb_build_object('status', v_intent.status, 'amount', v_intent.amount),
    jsonb_build_object('result', v_res, 'hours_to_match', round(v_hours,2), 'policy', v_policy, 'notes', p_notes));
  RETURN v_res;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_resolve_dispute(p_dispute_id uuid, p_status text, p_notes text DEFAULT NULL::text)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_match_id uuid;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  PERFORM public.require_admin_role(ARRAY['MODERATOR','FINANCE']);  -- EKLENDI
  IF p_status NOT IN ('RESOLVED', 'DISMISSED', 'UNDER_REVIEW') THEN RAISE EXCEPTION 'Geçersiz durum'; END IF;
  SELECT match_id INTO v_match_id FROM match_disputes WHERE id = p_dispute_id;
  UPDATE match_disputes SET status = p_status, resolution_notes = p_notes, resolved_by = auth.uid(), resolved_at = CASE WHEN p_status IN ('RESOLVED','DISMISSED') THEN NOW() ELSE NULL END WHERE id = p_dispute_id;
  PERFORM log_admin_action('DISPUTE_' || p_status, 'match', v_match_id, p_dispute_id::text, NULL, jsonb_build_object('status', p_status, 'notes', p_notes));
  RETURN true;
END; $function$;

CREATE OR REPLACE FUNCTION public.admin_process_payout(p_payout_id uuid, p_status text, p_ref text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_payout public.payout_requests;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  PERFORM public.require_admin_role(ARRAY['FINANCE']);  -- EKLENDI
  IF p_status NOT IN ('PROCESSING','COMPLETED','FAILED','CANCELLED') THEN
    RAISE EXCEPTION 'INVALID_STATUS';
  END IF;
  SELECT * INTO v_payout FROM public.payout_requests WHERE id = p_payout_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  UPDATE public.payout_requests SET
    status = p_status,
    iyzico_payout_ref = COALESCE(p_ref, iyzico_payout_ref),
    admin_notes = COALESCE(p_notes, admin_notes),
    processed_at = CASE WHEN p_status IN ('COMPLETED','FAILED','CANCELLED') THEN now() ELSE processed_at END,
    processed_by = auth.uid()
  WHERE id = p_payout_id;
  IF p_status = 'COMPLETED' THEN
    UPDATE public.wallet_transactions SET status = 'COMPLETED'
    WHERE reference_type = 'PAYOUT' AND reference_id = p_payout_id AND status = 'PENDING';
  ELSIF p_status IN ('FAILED','CANCELLED') THEN
    UPDATE public.wallet_transactions SET status = 'CANCELLED'
    WHERE reference_type = 'PAYOUT' AND reference_id = p_payout_id AND status = 'PENDING';
  END IF;
  PERFORM public.log_admin_action('PAYOUT_PROCESS', 'payout', p_payout_id, v_payout.user_id::text,
    jsonb_build_object('old_status', v_payout.status, 'amount', v_payout.amount),
    jsonb_build_object('status', p_status, 'ref', p_ref, 'notes', p_notes));
  RETURN jsonb_build_object('payout_id', p_payout_id, 'status', p_status);
END;
$function$;

-- ─── Wave 8: son-SUPER_ADMIN kilitlenme koruması ─────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_set_platform_role(p_user_id uuid, p_admin_role text, p_grant_platform_admin boolean DEFAULT false)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_email text;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Yalnızca SUPER_ADMIN platform rolü atayabilir';
  END IF;
  IF p_admin_role NOT IN ('SUPER_ADMIN', 'ADMIN', 'MODERATOR', 'FINANCE', 'SUPPORT') THEN
    RAISE EXCEPTION 'Geçersiz rol: %', p_admin_role;
  END IF;

  -- EKLENDI: son SUPER_ADMIN'i düşürme koruması (kilitlenme önleme)
  IF p_admin_role <> 'SUPER_ADMIN'
     AND EXISTS (SELECT 1 FROM admin_team_members WHERE user_id = p_user_id AND admin_role = 'SUPER_ADMIN')
     AND (SELECT count(*) FROM admin_team_members WHERE admin_role = 'SUPER_ADMIN') <= 1 THEN
    RAISE EXCEPTION 'Son SUPER_ADMIN düşürülemez (kilitlenme önleme).';
  END IF;

  SELECT email INTO v_email FROM profiles WHERE id = p_user_id;

  INSERT INTO admin_team_members (user_id, admin_role, invited_by)
  VALUES (p_user_id, p_admin_role, auth.uid())
  ON CONFLICT (user_id) DO UPDATE SET admin_role = EXCLUDED.admin_role;

  UPDATE profiles SET
    is_admin = true,
    role = CASE WHEN p_admin_role IN ('SUPER_ADMIN', 'ADMIN') THEN p_admin_role ELSE 'ADMIN' END
  WHERE id = p_user_id;

  PERFORM log_admin_action(
    'ROLE_CHANGE', 'user', p_user_id, v_email, NULL,
    jsonb_build_object('admin_role', p_admin_role, 'is_admin', true)
  );
  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_revoke_platform_role(p_user_id uuid)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_email TEXT;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_user_id = auth.uid() THEN RAISE EXCEPTION 'Kendi admin yetkinizi kaldıramazsınız.'; END IF;
  -- EKLENDI: son SUPER_ADMIN'in yetkisi kaldırılamaz (kilitlenme önleme)
  IF EXISTS (SELECT 1 FROM admin_team_members WHERE user_id = p_user_id AND admin_role = 'SUPER_ADMIN')
     AND (SELECT count(*) FROM admin_team_members WHERE admin_role = 'SUPER_ADMIN') <= 1 THEN
    RAISE EXCEPTION 'Son SUPER_ADMIN''in yetkisi kaldırılamaz.';
  END IF;
  SELECT email INTO v_email FROM public.profiles WHERE id = p_user_id;
  IF v_email IS NULL THEN RAISE EXCEPTION 'Kullanıcı bulunamadı.'; END IF;
  DELETE FROM public.admin_team_members WHERE user_id = p_user_id;
  UPDATE public.profiles SET is_admin = false, role = 'PLAYER' WHERE id = p_user_id;
  PERFORM public.log_admin_action('ROLE_REVOKE', 'user', p_user_id, v_email, NULL,
    jsonb_build_object('revoked_at', NOW()));
  RETURN TRUE;
END;
$function$;
