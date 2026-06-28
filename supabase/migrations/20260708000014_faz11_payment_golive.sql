-- ============================================================================
-- FAZ 11 — Ödeme/payout go-live hazırlığı (SİMÜLASYON-uyumlu) + para güvenliği
-- ----------------------------------------------------------------------------
-- A) payment_provider'ı app_config'e taşı → "tek anahtar" panelden çevrilir.
--    create_match_preauth artık sağlayıcıyı config'ten okur (eskiden hard-code
--    'IYZICO' idi; edge SIMULATION davranırken intent'e IYZICO yazıyordu — tutarsızlık).
-- B) admin_payment_golive_readiness(): gerçek ödemeye geçmeden ÖNCE neyin hazır
--    olduğunu tek ekranda gösteren salt-okunur ön-uçuş (preflight).
-- C) admin_reconciliation_summary(): tahsilat / komisyon / owner payı / iade /
--    payout tutarlarını tek bakışta toplayıp "para tutuyor mu" sorusunu yanıtlar.
-- D) Payout güvenliği: COMPLETED için banka referansı ZORUNLU + admin_reverse_payout
--    (yanlış COMPLETED'ı geri al).
-- E) Salt-okunur acil durdurma (kill-switch): admin_readonly_mode=true iken tüm
--    god-mode PARA işlemleri reddedilir (force capture/void/refund + payout).
--    admin_set_config bu kapıya TABİ DEĞİL → founder anahtarı her zaman kapatabilir.
-- HİÇBİR gerçek iyzico API çağrısı EKLENMEZ — hepsi salt-okunur DB + guard.
-- ============================================================================

-- ─── Yardımcılar: metin config + salt-okunur yazma kapısı ───────────────────
CREATE OR REPLACE FUNCTION public.get_config_text(p_key text, p_default text DEFAULT NULL)
 RETURNS text LANGUAGE sql STABLE SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE((SELECT value #>> '{}' FROM public.app_config WHERE key = p_key), p_default);
$function$;
REVOKE ALL ON FUNCTION public.get_config_text(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_config_text(text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.require_admin_write()
 RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF public.get_config_bool('admin_readonly_mode', false) THEN
    RAISE EXCEPTION 'READ_ONLY_MODE: Sistem salt-okunur (acil durdurma) modunda; para/yazma işlemleri geçici kapalı. Sistem Parametreleri''nden "admin_readonly_mode" kapatılınca açılır.';
  END IF;
END;
$function$;
REVOKE ALL ON FUNCTION public.require_admin_write() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.require_admin_write() TO authenticated;

-- ─── Config anahtarları ─────────────────────────────────────────────────────
INSERT INTO public.app_config (key, value, value_type, category, label, description, is_public, min_value, max_value) VALUES
  ('payment_provider', '"SIMULATION"'::jsonb, 'text', 'ODEME',
   'Ödeme Sağlayıcısı',
   'SIMULATION iken gerçek para çekilmez (test). Lansmanda iyzico anahtarları + ön-uçuş yeşil olunca IYZICO yapın. (Edge fonksiyon secret''ı PAYMENT_PROVIDER ile birlikte ayarlanmalı.)',
   false, NULL, NULL),
  ('admin_readonly_mode', 'false'::jsonb, 'boolean', 'GUVENLIK',
   'Salt-Okunur Acil Durdurma',
   'AÇIK iken tüm god-mode PARA işlemleri (zorla tahsil/iptal/iade + payout) reddedilir. Olay anında tek anahtarla parayı dondurma. Bu anahtarı kapatmak her zaman mümkündür.',
   false, NULL, NULL)
ON CONFLICT (key) DO NOTHING;

-- ─── A) create_match_preauth: sağlayıcı config''ten ─────────────────────────
CREATE OR REPLACE FUNCTION public.create_match_preauth(p_match_id uuid, p_amount numeric, p_provider text DEFAULT 'IYZICO'::text)
 RETURNS payment_intents
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_match    RECORD;
  v_pitch_id uuid;
  v_scope    text;
  v_scope_id uuid;
  v_model    text;
  v_comm     jsonb;
  v_provider text;
  v_intent   public.payment_intents;
  v_existing public.payment_intents;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;

  -- Sağlayıcı tek kaynaktan (app_config); yoksa parametreye düş.
  v_provider := COALESCE(public.get_config_text('payment_provider', NULL), p_provider, 'SIMULATION');

  SELECT id, pitch_id, price, commission_model INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Mac bulunamadi.'; END IF;

  IF v_match.price IS NOT NULL AND p_amount > v_match.price THEN
    RAISE EXCEPTION 'AMOUNT_EXCEEDS_PRICE: Blokaj tutari mac fiyatini asamaz.';
  END IF;

  v_pitch_id := v_match.pitch_id;
  v_model    := COALESCE(v_match.commission_model, 'MODEL_A');

  SELECT * INTO v_existing FROM public.payment_intents
  WHERE match_id = p_match_id AND user_id = v_uid
    AND status IN ('PENDING','BLOCKED') ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN RETURN v_existing; END IF;

  IF EXISTS (SELECT 1 FROM public.commission_config
             WHERE scope='MATCH' AND scope_id=p_match_id AND model=v_model AND is_active) THEN
    v_scope := 'MATCH'; v_scope_id := p_match_id;
  ELSE
    v_scope := CASE WHEN v_pitch_id IS NOT NULL THEN 'PITCH' ELSE 'GLOBAL' END;
    v_scope_id := v_pitch_id;
  END IF;
  v_comm := public.calculate_commission(p_amount, v_scope, v_scope_id, v_model);

  BEGIN
    INSERT INTO public.payment_intents (
      user_id, match_id, pitch_id, amount, currency, status, provider,
      commission_amount, owner_amount, service_provider_amount,
      commission_model, related_entity_type
    ) VALUES (
      v_uid, p_match_id, v_pitch_id,
      (v_comm->>'player_total')::numeric,
      'TRY', 'PENDING', v_provider,
      (v_comm->>'oyna_take')::numeric,
      (v_comm->>'owner_net')::numeric,
      0,
      v_comm->>'model',
      'MATCH'
    )
    RETURNING * INTO v_intent;
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO v_intent FROM public.payment_intents
    WHERE match_id = p_match_id AND user_id = v_uid
      AND status IN ('PENDING','BLOCKED') ORDER BY created_at DESC LIMIT 1;
  END;

  RETURN v_intent;
END;
$function$;

-- ─── B) Go-live ön-uçuş (preflight) — salt-okunur ───────────────────────────
CREATE OR REPLACE FUNCTION public.admin_payment_golive_readiness()
 RETURNS TABLE(check_key text, ok boolean, detail text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_provider     text;
  v_demo         boolean;
  v_stuck        int;
  v_pending_pay  int;
  v_comm         numeric;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  v_provider    := COALESCE(public.get_config_text('payment_provider', 'SIMULATION'), 'SIMULATION');
  v_demo        := public.get_config_bool('demo_mode_enabled', false);
  SELECT COUNT(*) INTO v_stuck FROM public.payment_intents WHERE status IN ('PENDING','BLOCKED');
  SELECT COUNT(*) INTO v_pending_pay FROM public.payout_requests WHERE status = 'PENDING';
  SELECT "commissionRate" INTO v_comm FROM public.settings WHERE id = 'main';

  check_key := 'payment_provider'; ok := (v_provider IN ('SIMULATION','IYZICO'));
  detail := 'Sağlayıcı: ' || v_provider || CASE WHEN v_provider='SIMULATION' THEN ' (test modu — gerçek para çekilmez)' ELSE ' (CANLI)' END;
  RETURN NEXT;

  check_key := 'demo_mode_off'; ok := (v_demo IS NOT TRUE);
  detail := CASE WHEN v_demo THEN 'Demo modu AÇIK — lansmandan önce kapatın (demo veri tüketiciye görünür).' ELSE 'Demo modu kapalı.' END;
  RETURN NEXT;

  check_key := 'no_stuck_intents'; ok := (v_stuck = 0);
  detail := v_stuck::text || ' adet askıda (PENDING/BLOCKED) ödeme niyeti. Go-live öncesi 0 olmalı.';
  RETURN NEXT;

  check_key := 'pending_payouts'; ok := true;
  detail := v_pending_pay::text || ' adet bekleyen para çekme talebi (bilgi).';
  RETURN NEXT;

  check_key := 'commission_configured'; ok := (v_comm IS NOT NULL);
  detail := CASE WHEN v_comm IS NULL THEN 'Komisyon oranı ayarlı değil!' ELSE 'Komisyon oranı: %' || v_comm::text END;
  RETURN NEXT;

  check_key := 'readonly_mode_off'; ok := (public.get_config_bool('admin_readonly_mode', false) IS NOT TRUE);
  detail := CASE WHEN public.get_config_bool('admin_readonly_mode', false) THEN 'Salt-okunur acil durdurma AÇIK — para işlemleri kapalı.' ELSE 'Sistem normal (yazılabilir).' END;
  RETURN NEXT;
END;
$function$;

-- ─── C) Mutabakat (reconciliation) özeti — salt-okunur ──────────────────────
CREATE OR REPLACE FUNCTION public.admin_reconciliation_summary(p_from timestamptz DEFAULT (now() - interval '30 days'), p_to timestamptz DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_out jsonb;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT jsonb_build_object(
    'from', p_from, 'to', p_to,
    'captured_count',  (SELECT COUNT(*) FROM public.payment_intents WHERE status IN ('CAPTURED','PAID') AND created_at BETWEEN p_from AND p_to),
    'gross_captured',  COALESCE((SELECT SUM(amount) FROM public.payment_intents WHERE status IN ('CAPTURED','PAID') AND created_at BETWEEN p_from AND p_to), 0),
    'total_commission',COALESCE((SELECT SUM(commission_amount) FROM public.payment_intents WHERE status IN ('CAPTURED','PAID') AND created_at BETWEEN p_from AND p_to), 0),
    'owner_share',     COALESCE((SELECT SUM(owner_amount) FROM public.payment_intents WHERE status IN ('CAPTURED','PAID') AND created_at BETWEEN p_from AND p_to), 0),
    'refunded_count',  (SELECT COUNT(*) FROM public.payment_intents WHERE status = 'REFUNDED' AND created_at BETWEEN p_from AND p_to),
    'refunded_sum',    COALESCE((SELECT SUM(amount) FROM public.payment_intents WHERE status = 'REFUNDED' AND created_at BETWEEN p_from AND p_to), 0),
    'booking_payments',COALESCE((SELECT SUM(amount) FROM public.booking_payments WHERE created_at BETWEEN p_from AND p_to), 0),
    'wallet_pending',  COALESCE((SELECT SUM(amount) FROM public.wallet_transactions WHERE status = 'PENDING' AND created_at BETWEEN p_from AND p_to), 0),
    'wallet_completed',COALESCE((SELECT SUM(amount) FROM public.wallet_transactions WHERE status = 'COMPLETED' AND created_at BETWEEN p_from AND p_to), 0),
    'payout_requested',COALESCE((SELECT SUM(amount) FROM public.payout_requests WHERE status = 'PENDING' AND created_at BETWEEN p_from AND p_to), 0),
    'payout_completed',COALESCE((SELECT SUM(amount) FROM public.payout_requests WHERE status = 'COMPLETED' AND created_at BETWEEN p_from AND p_to), 0)
  ) INTO v_out;
  RETURN v_out;
END;
$function$;

-- ─── D) Payout güvenliği: referans zorunlu + reversal ───────────────────────
CREATE OR REPLACE FUNCTION public.admin_process_payout(p_payout_id uuid, p_status text, p_ref text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_payout public.payout_requests;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  PERFORM public.require_admin_role(ARRAY['FINANCE']);
  PERFORM public.require_admin_write();
  IF p_status NOT IN ('PROCESSING','COMPLETED','FAILED','CANCELLED') THEN
    RAISE EXCEPTION 'INVALID_STATUS';
  END IF;
  IF p_status = 'COMPLETED' AND COALESCE(btrim(p_ref), '') = '' THEN
    RAISE EXCEPTION 'PAYOUT_REF_REQUIRED: COMPLETED işaretlemek için banka/iyzico transfer referansı zorunludur (iz ve mutabakat için).';
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

CREATE OR REPLACE FUNCTION public.admin_reverse_payout(p_payout_id uuid, p_reason text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_payout public.payout_requests;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  PERFORM public.require_admin_role(ARRAY['FINANCE']);
  PERFORM public.require_admin_write();
  IF COALESCE(btrim(p_reason), '') = '' THEN RAISE EXCEPTION 'Geri alma nedeni zorunludur.'; END IF;
  SELECT * INTO v_payout FROM public.payout_requests WHERE id = p_payout_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_payout.status <> 'COMPLETED' THEN
    RAISE EXCEPTION 'Yalnız COMPLETED ödeme geri alınabilir (mevcut: %).', v_payout.status;
  END IF;
  UPDATE public.payout_requests SET
    status = 'PENDING', processed_at = NULL, processed_by = auth.uid(),
    admin_notes = COALESCE(admin_notes,'') || ' | GERİ ALINDI: ' || p_reason
  WHERE id = p_payout_id;
  UPDATE public.wallet_transactions SET status = 'PENDING'
  WHERE reference_type = 'PAYOUT' AND reference_id = p_payout_id AND status = 'COMPLETED';
  PERFORM public.log_admin_action('PAYOUT_REVERSE', 'payout', p_payout_id, v_payout.user_id::text,
    jsonb_build_object('old_status', 'COMPLETED', 'amount', v_payout.amount),
    jsonb_build_object('reason', p_reason));
  RETURN jsonb_build_object('payout_id', p_payout_id, 'status', 'PENDING');
END;
$function$;

-- ─── E) god-mode para işlemlerine salt-okunur kapısı ────────────────────────
CREATE OR REPLACE FUNCTION public.admin_force_capture_intent(p_intent_id uuid, p_notes text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_res jsonb;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  PERFORM public.require_admin_role(ARRAY['FINANCE']);
  PERFORM public.require_admin_write();
  v_res := public.capture_preauth(p_intent_id, 'ADMIN_FORCE', jsonb_build_object('admin', true, 'notes', p_notes));
  PERFORM public.log_admin_action('FORCE_CAPTURE', 'payment_intent', p_intent_id, NULL, NULL,
    v_res || jsonb_build_object('notes', p_notes));
  RETURN v_res;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_force_void_intent(p_intent_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_res jsonb;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  PERFORM public.require_admin_role(ARRAY['FINANCE']);
  PERFORM public.require_admin_write();
  v_res := public.void_preauth(p_intent_id, COALESCE(p_reason, 'ADMIN_FORCE_VOID'));
  PERFORM public.log_admin_action('FORCE_VOID', 'payment_intent', p_intent_id, NULL, NULL,
    v_res || jsonb_build_object('reason', p_reason));
  RETURN v_res;
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
  PERFORM public.require_admin_role(ARRAY['FINANCE']);
  PERFORM public.require_admin_write();
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

REVOKE ALL ON FUNCTION public.admin_payment_golive_readiness()                          FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_reconciliation_summary(timestamptz, timestamptz)   FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_reverse_payout(uuid, text)                          FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_payment_golive_readiness()                        TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reconciliation_summary(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reverse_payout(uuid, text)                        TO authenticated;
