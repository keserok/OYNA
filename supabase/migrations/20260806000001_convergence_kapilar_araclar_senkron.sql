-- ============================================================================
-- YAKINSAMA (Faz 2a-1) — KAPILAR, ADMİN ARAÇLARI, SENKRON TETİKLEYİCİLERİ, CRON
-- ----------------------------------------------------------------------------
-- DRIFT ONARIMI NOTU (2026-07-21): Bu 11 fonksiyon + 4 tetikleyici bağı + 2
-- zamanlanmış görev canlıda çalışıyordu ancak repoda tanımları yoktu (Faz 2a
-- prod-only envanteri). Tüm tanımlar canlıdan BİREBİR alınmıştır
-- (pg_get_functiondef / pg_get_triggerdef / cron.job). Canlıda davranış
-- değişmez; kazanç, sıfırdan kurulumların canlıyla birebir çıkmasıdır.
-- Ön-uçuş kanıtları: earthdistance uzantısı 20260526000000'da, settings
-- kolonları 20260530095000 + 20260618103739'da, support tabloları
-- 20260720135945'te — hepsi bu dosyadan önce koşar.
--
-- KOLON DRIFT DÜZELTMESİ (2026-07-21): goalkeepers/referees tablolarındaki
-- verification_status kolonu canlıda vardı ama hiçbir repo migration'ı
-- oluşturmuyordu (CREATE TABLE 20260530000000'da yok, ALTER de yok). Bugüne
-- dek görünmedi çünkü tüm referanslar plpgsql gövdelerindeydi (CREATE anında
-- doğrulanmaz); aşağıdaki trg_gk_role_sync/trg_ref_role_sync tetikleyicileri
-- kolonu ilk kez DDL düzeyinde ('UPDATE OF verification_status') zorluyor.
-- Canlı tanım birebir: text NOT NULL DEFAULT 'pending'. Idempotent eklenir —
-- canlıda no-op (kolon zaten var), fresh replay'de kolonu yaratır ki
-- tetikleyiciler bağlanabilsin. Diğer olası prod-only kolonlar Faz 2c'de
-- denetlenecek; bu düzeltme yalnız tetikleyicilerin ihtiyaç duyduğu kolonu
-- kapsar.
-- ============================================================================

-- ─── Kolon drift düzeltmesi: sağlayıcı doğrulama kolonu (tetikleyicilerden önce) ───

ALTER TABLE public.goalkeepers ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'pending';
ALTER TABLE public.referees    ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'pending';

-- ─── Bakım / kayıt kapıları ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_maintenance_active()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE(s."maintenanceMode", false)
      OR (
        s."maintenanceStartsAt" IS NOT NULL
        AND s."maintenanceEndsAt" IS NOT NULL
        AND now() >= s."maintenanceStartsAt"
        AND now() <  s."maintenanceEndsAt"
      )
  FROM public.settings s WHERE s.id = 'main';
$function$
;

CREATE OR REPLACE FUNCTION public.is_registration_open()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE(s."registrationOpen", true) FROM public.settings s WHERE s.id = 'main';
$function$
;

-- ─── Admin araçları ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_adjust_wallet_balance(p_user_id uuid, p_amount numeric, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid         uuid := auth.uid();
  v_name        text;
  v_before      numeric;
  v_b           RECORD;
  v_debit       numeric;
  v_from_refund numeric;
  v_from_topup  numeric;
  v_after       numeric;
BEGIN
  PERFORM public.require_admin_role(ARRAY['FINANCE']);

  p_reason := btrim(COALESCE(p_reason, ''));
  IF length(p_reason) < 3 THEN RAISE EXCEPTION 'Sebep zorunludur (en az 3 karakter).'; END IF;
  p_amount := round(COALESCE(p_amount, 0), 2);
  IF p_amount = 0 THEN RAISE EXCEPTION 'Tutar sıfır olamaz.'; END IF;
  IF abs(p_amount) > 50000 THEN RAISE EXCEPTION 'Tek işlemde en fazla 50.000 ₺ düzeltme yapılabilir.'; END IF;

  SELECT COALESCE(full_name, name, email) INTO v_name FROM public.profiles WHERE id = p_user_id;
  IF v_name IS NULL THEN RAISE EXCEPTION 'Kullanıcı bulunamadı.'; END IF;

  PERFORM 1 FROM public.profiles WHERE id = p_user_id FOR UPDATE;

  SELECT * INTO v_b FROM public._wallet_bucket_balances(p_user_id);
  v_before := v_b.topup_balance + v_b.refund_credit_balance;

  IF p_amount > 0 THEN
    INSERT INTO public.wallet_transactions
      (user_id, amount, type, balance_type, status, reference_type, description, meta)
    VALUES
      (p_user_id, p_amount, 'TOP_UP', 'TOP_UP', 'COMPLETED', 'ADMIN_ADJUST',
       'Admin bakiye yüklemesi: ' || p_reason,
       jsonb_build_object('admin_id', v_uid, 'reason', p_reason));
  ELSE
    v_debit := abs(p_amount);
    IF v_before < v_debit THEN
      RAISE EXCEPTION 'Yetersiz bakiye. Mevcut: % ₺, Düşülmek istenen: % ₺', v_before, v_debit;
    END IF;
    v_from_refund := LEAST(v_b.refund_credit_balance, v_debit);
    v_from_topup  := v_debit - v_from_refund;

    IF v_from_refund > 0 THEN
      INSERT INTO public.wallet_transactions
        (user_id, amount, type, balance_type, status, reference_type, description, meta)
      VALUES
        (p_user_id, v_from_refund, 'WALLET_PAYMENT', 'REFUND_CREDIT', 'COMPLETED', 'ADMIN_ADJUST',
         'Admin bakiye düşümü: ' || p_reason,
         jsonb_build_object('admin_id', v_uid, 'reason', p_reason));
    END IF;
    IF v_from_topup > 0 THEN
      INSERT INTO public.wallet_transactions
        (user_id, amount, type, balance_type, status, reference_type, description, meta)
      VALUES
        (p_user_id, v_from_topup, 'WALLET_PAYMENT', 'TOP_UP', 'COMPLETED', 'ADMIN_ADJUST',
         'Admin bakiye düşümü: ' || p_reason,
         jsonb_build_object('admin_id', v_uid, 'reason', p_reason));
    END IF;
  END IF;

  PERFORM public._sync_wallet_mirror(p_user_id);
  SELECT * INTO v_b FROM public._wallet_bucket_balances(p_user_id);
  v_after := v_b.topup_balance + v_b.refund_credit_balance;

  PERFORM public.log_admin_action('WALLET_ADJUST', 'user', p_user_id, v_name,
    jsonb_build_object('balance_before', v_before),
    jsonb_build_object('amount', p_amount, 'reason', p_reason, 'balance_after', v_after));

  RETURN jsonb_build_object(
    'ok', true,
    'balance_before', v_before,
    'balance_after', v_after,
    'amount', p_amount
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_delete_pitch_rating(p_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_pitch uuid; v_old jsonb;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT pitch_id, to_jsonb(pr.*) INTO v_pitch, v_old FROM public.pitch_ratings pr WHERE id = p_id;
  IF v_pitch IS NULL THEN RAISE EXCEPTION 'Değerlendirme bulunamadı'; END IF;
  DELETE FROM public.pitch_ratings WHERE id = p_id;
  PERFORM public.log_admin_action('PITCH_RATING_DELETE', 'pitch_rating', p_id, v_pitch::text, v_old, NULL);
  RETURN TRUE;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_emergency_cancel_match(p_match_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_count  int := 0;
  v_reason text;
  v_title  text;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  v_reason := COALESCE(NULLIF(btrim(COALESCE(p_reason, '')), ''), 'Acil iptal (yönetici)');

  SELECT title INTO v_title FROM public.matches WHERE id = p_match_id;
  IF v_title IS NULL THEN RAISE EXCEPTION 'Maç bulunamadı'; END IF;

  UPDATE public.matches SET
    status        = 'CANCELLED',
    cancel_reason = v_reason,
    refund_status = 'PENDING'
  WHERE id = p_match_id;

  WITH roster AS (
    SELECT DISTINCT ((e.s)->'player'->>'id')::uuid AS pid
    FROM public.matches m
    CROSS JOIN LATERAL (
      SELECT jsonb_array_elements(COALESCE(m.slots, '[]'::jsonb)) AS s
      UNION ALL
      SELECT jsonb_array_elements(COALESCE(m."awaySlots", '[]'::jsonb)) AS s
    ) e
    WHERE m.id = p_match_id
      AND (e.s->>'status') = 'TAKEN'
      AND (e.s->'player'->>'id') IS NOT NULL
  )
  INSERT INTO public.notifications (user_id, title, body, type_key, payload)
  SELECT pid,
         'Maç iptal edildi',
         'Katıldığınız "' || v_title || '" maçı iptal edildi. Sebep: ' || v_reason ||
           '. Ödemeniz varsa iade süreci başlatıldı.',
         'MATCH_CANCELLED',
         jsonb_build_object('match_id', p_match_id, 'reason', v_reason)
  FROM roster WHERE pid IS NOT NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  PERFORM public.log_admin_action('MATCH_EMERGENCY_CANCEL', 'match', p_match_id, v_title, NULL,
    jsonb_build_object('reason', v_reason, 'refund', true, 'recipients', v_count));

  RETURN jsonb_build_object('ok', true, 'status', 'CANCELLED', 'recipients', v_count);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_send_template_test(p_type_key text, p_vars jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_id uuid;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  v_id := public.notify_from_template(auth.uid(), p_type_key, p_vars, NULL);
  PERFORM public.log_admin_action('NOTIFY_TEMPLATE_TEST', 'notification_template', NULL, p_type_key, NULL, p_vars);
  RETURN v_id;
END; $function$
;

-- ─── Yakındaki hizmet sağlayıcılar (kaleci/hakem keşfi) ─────────────────────

CREATE OR REPLACE FUNCTION public.get_nearby_providers(p_lat double precision, p_lon double precision, p_radius_km double precision DEFAULT 25, p_type text DEFAULT 'GK'::text)
 RETURNS TABLE(id uuid, distance_km double precision)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp', 'extensions'
AS $function$
  SELECT g.id,
         earth_distance(
           ll_to_earth(p_lat, p_lon),
           ll_to_earth((g.coordinates->>'lat')::double precision, (g.coordinates->>'lng')::double precision)
         ) / 1000.0 AS distance_km
  FROM public.goalkeepers g
  JOIN public.profiles p ON p.id = g.id
  WHERE p_type = 'GK'
    AND p.verification_status = 'approved'
    AND COALESCE(p.is_available, true) = true
    AND COALESCE(g."isDemo", false) = false
    AND g.coordinates IS NOT NULL
    AND (g.coordinates->>'lat') IS NOT NULL AND (g.coordinates->>'lng') IS NOT NULL
    AND earth_distance(
          ll_to_earth(p_lat, p_lon),
          ll_to_earth((g.coordinates->>'lat')::double precision, (g.coordinates->>'lng')::double precision)
        ) <= p_radius_km * 1000.0

  UNION ALL

  SELECT r.id,
         earth_distance(
           ll_to_earth(p_lat, p_lon),
           ll_to_earth((r.coordinates->>'lat')::double precision, (r.coordinates->>'lng')::double precision)
         ) / 1000.0 AS distance_km
  FROM public.referees r
  JOIN public.profiles p ON p.id = r.id
  WHERE p_type = 'REF'
    AND p.verification_status = 'approved'
    AND COALESCE(p.is_available, true) = true
    AND COALESCE(r."isDemo", false) = false
    AND r.coordinates IS NOT NULL
    AND (r.coordinates->>'lat') IS NOT NULL AND (r.coordinates->>'lng') IS NOT NULL
    AND earth_distance(
          ll_to_earth(p_lat, p_lon),
          ll_to_earth((r.coordinates->>'lat')::double precision, (r.coordinates->>'lng')::double precision)
        ) <= p_radius_km * 1000.0

  ORDER BY 2 ASC;
$function$
;

-- ─── Sağlayıcı doğrulama / rol / puan senkron fonksiyonları ─────────────────

CREATE OR REPLACE FUNCTION public._sync_role_from_provider_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_role text := CASE WHEN TG_TABLE_NAME = 'goalkeepers' THEN 'GOALKEEPER' ELSE 'REFEREE' END;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.verification_status IS NOT DISTINCT FROM OLD.verification_status THEN
    RETURN NEW;
  END IF;
  PERFORM set_config('app.bypass_role_protection', 'true', true);
  IF NEW.verification_status = 'approved' THEN
    UPDATE public.profiles
       SET roles = COALESCE(roles, '[]'::jsonb) || jsonb_build_array(v_role),
           updated_at = now()
     WHERE id = NEW.id AND NOT (COALESCE(roles, '[]'::jsonb) ? v_role);
  ELSE
    UPDATE public.profiles
       SET roles = (COALESCE(roles, '[]'::jsonb) - v_role),
           updated_at = now()
     WHERE id = NEW.id AND COALESCE(roles, '[]'::jsonb) ? v_role;
    UPDATE public.profiles p
       SET role = CASE
           WHEN COALESCE(p.roles, '[]'::jsonb) ? 'OWNER' THEN 'OWNER'
           WHEN COALESCE(p.roles, '[]'::jsonb) ? 'REFEREE' THEN 'REFEREE'
           WHEN COALESCE(p.roles, '[]'::jsonb) ? 'GOALKEEPER' THEN 'GOALKEEPER'
           ELSE 'PLAYER' END,
           updated_at = now()
     WHERE p.id = NEW.id AND p.role = v_role;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_provider_verification_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.verification_status IS DISTINCT FROM OLD.verification_status THEN
    UPDATE public.goalkeepers SET verification_status = NEW.verification_status WHERE id = NEW.id;
    UPDATE public.referees    SET verification_status = NEW.verification_status WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END; $function$
;

CREATE OR REPLACE FUNCTION public.tr_pitch_rating_sync()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_pitch uuid; v_avg numeric; v_cnt integer;
BEGIN
  v_pitch := COALESCE(NEW.pitch_id, OLD.pitch_id);
  IF v_pitch IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  SELECT round(avg(score)::numeric, 2), count(*) INTO v_avg, v_cnt
    FROM public.pitch_ratings WHERE pitch_id = v_pitch;
  UPDATE public.pitches
    SET rating = COALESCE(v_avg, 0), rating_count = COALESCE(v_cnt, 0)
    WHERE id = v_pitch;
  RETURN COALESCE(NEW, OLD);
END;
$function$
;

-- ─── Cron dosyasında yer almayan görevler ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.process_expired_account_deletions()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_wait int; v_count int := 0; r record;
BEGIN
  IF NOT public.get_config_bool('account_deletion_auto_process', false) THEN RETURN 0; END IF;
  SELECT COALESCE((value)::int, 7) INTO v_wait FROM public.app_config WHERE key = 'account_deletion_wait_days';
  v_wait := COALESCE(v_wait, 7);
  FOR r IN
    SELECT id FROM public.profiles
    WHERE account_deletion_requested_at IS NOT NULL
      AND now() >= account_deletion_requested_at + (v_wait || ' days')::interval
      AND COALESCE(is_admin, false) = false AND role NOT IN ('ADMIN','SUPER_ADMIN')
  LOOP
    IF EXISTS (SELECT 1 FROM public.pitch_bookings WHERE user_id = r.id AND status IN ('PENDING','CONFIRMED')
               AND (booking_date > CURRENT_DATE OR (booking_date = CURRENT_DATE AND end_time > CURRENT_TIME)))
       OR EXISTS (SELECT 1 FROM public.payment_intents pi JOIN public.matches m ON m.id = pi.match_id
               WHERE pi.user_id = r.id AND pi.status IN ('PENDING','BLOCKED','CAPTURED')
               AND m.status IN ('GATHERING','CONFIRMED','PLAYING','LIVE')) THEN
      CONTINUE;
    END IF;
    UPDATE public.profiles SET full_name='Silinmiş Kullanıcı', name='Silinmiş Kullanıcı',
      email='deleted_'||substr(r.id::text,1,8)||'@oyna.deleted', phone=NULL, avatar_url=NULL,
      is_banned=true, account_deletion_requested_at=NULL, updated_at=NOW() WHERE id=r.id;
    BEGIN
      UPDATE auth.users SET email='deleted_'||substr(r.id::text,1,8)||'@oyna.deleted',
        phone=NULL, raw_user_meta_data='{}'::jsonb, banned_until='2999-01-01'::timestamptz, updated_at=NOW()
      WHERE id=r.id;
    EXCEPTION WHEN others THEN RAISE WARNING 'process_expired_account_deletions: auth temizlenemedi (%): %', r.id, SQLERRM;
    END;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END; $function$
;

-- ─── Tetikleyici bağları (canlıdaki pg_get_triggerdef çıktısı birebir) ──────

DROP TRIGGER IF EXISTS trg_gk_role_sync ON public.goalkeepers;
CREATE TRIGGER trg_gk_role_sync AFTER INSERT OR UPDATE OF verification_status ON public.goalkeepers FOR EACH ROW EXECUTE FUNCTION _sync_role_from_provider_status();

DROP TRIGGER IF EXISTS trg_ref_role_sync ON public.referees;
CREATE TRIGGER trg_ref_role_sync AFTER INSERT OR UPDATE OF verification_status ON public.referees FOR EACH ROW EXECUTE FUNCTION _sync_role_from_provider_status();

DROP TRIGGER IF EXISTS trg_sync_provider_verification ON public.profiles;
CREATE TRIGGER trg_sync_provider_verification AFTER UPDATE OF verification_status ON public.profiles FOR EACH ROW EXECUTE FUNCTION sync_provider_verification_status();

DROP TRIGGER IF EXISTS tr_pitch_rating_sync ON public.pitch_ratings;
CREATE TRIGGER tr_pitch_rating_sync AFTER INSERT OR DELETE OR UPDATE ON public.pitch_ratings FOR EACH ROW EXECUTE FUNCTION tr_pitch_rating_sync();

-- ─── Zamanlanmış görevler (canlı cron.job kayıtları birebir; idempotent) ────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN PERFORM cron.unschedule('process-expired-account-deletions'); EXCEPTION WHEN OTHERS THEN NULL; END;
    PERFORM cron.schedule('process-expired-account-deletions', '0 3 * * *', ' SELECT public.process_expired_account_deletions(); ');
    BEGIN PERFORM cron.unschedule('materialize_subs_daily'); EXCEPTION WHEN OTHERS THEN NULL; END;
    PERFORM cron.schedule('materialize_subs_daily', '5 0 * * *', 'SELECT public.materialize_subscriptions(12)');
  END IF;
END $$;

-- ─── Yetkiler (canlı proacl kayıtları birebir) ──────────────────────────────

REVOKE ALL ON FUNCTION public.is_maintenance_active() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_maintenance_active() TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_registration_open() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_registration_open() TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_adjust_wallet_balance(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_adjust_wallet_balance(uuid, numeric, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_delete_pitch_rating(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_pitch_rating(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_emergency_cancel_match(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_emergency_cancel_match(uuid, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_send_template_test(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_send_template_test(text, jsonb) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_nearby_providers(double precision, double precision, double precision, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_nearby_providers(double precision, double precision, double precision, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public._sync_role_from_provider_status() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._sync_role_from_provider_status() TO service_role;

REVOKE ALL ON FUNCTION public.sync_provider_verification_status() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_provider_verification_status() TO service_role;

REVOKE ALL ON FUNCTION public.tr_pitch_rating_sync() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tr_pitch_rating_sync() TO service_role;

REVOKE ALL ON FUNCTION public.process_expired_account_deletions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_expired_account_deletions() TO service_role;
