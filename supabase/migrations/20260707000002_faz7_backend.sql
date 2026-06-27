-- ==============================================================================
-- FAZ 7 — Backend tamamlama (7.5 rol geçişi · 7.1 nearby · 7.3 admin · 7.2 hatırlatma)
-- ==============================================================================

-- ── 7.5: protect_profile_sensitive_fields — aktif rol geçişine izin ──────────
-- KRİTİK düzeltme (e2e yakaladı): bu trigger NEW.role değişimini her non-admin
-- için RAISE ediyordu ve app.bypass_role_protection bayrağını ONURLANDIRMIYORDU
-- → set_active_role her normal kullanıcıda çöküyordu (Faz 5 rating_recompute ile
--  aynı sınıf hata). Yalnız `role` alanı için bypass tanınır; roles/is_admin/
--  wallet/ban korumaları AYNEN sürer (ayrıcalık yükseltme yüzeyi yok).
CREATE OR REPLACE FUNCTION public.protect_profile_sensitive_fields()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_platform_admin() THEN
    IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
      RAISE EXCEPTION 'SECURITY: is_admin alanı doğrudan değiştirilemez.';
    END IF;
    IF NEW.phone_verified IS DISTINCT FROM OLD.phone_verified THEN
      RAISE EXCEPTION 'SECURITY: phone_verified alanı doğrudan değiştirilemez.';
    END IF;
    IF NEW.role IS DISTINCT FROM OLD.role
       AND COALESCE(current_setting('app.bypass_role_protection', true), '') <> 'true' THEN
      RAISE EXCEPTION 'SECURITY: role alanı doğrudan değiştirilemez.';
    END IF;
    IF NEW.roles IS DISTINCT FROM OLD.roles THEN
      RAISE EXCEPTION 'SECURITY: roles alanı doğrudan değiştirilemez.';
    END IF;
    IF NEW.wallet_balance IS DISTINCT FROM OLD.wallet_balance
       AND COALESCE(current_setting('app.wallet_ctx', true), '') <> 'on' THEN
      RAISE EXCEPTION 'SECURITY: wallet_balance doğrudan değiştirilemez.';
    END IF;
    IF NEW.is_banned IS DISTINCT FROM OLD.is_banned THEN
      RAISE EXCEPTION 'SECURITY: is_banned doğrudan değiştirilemez.';
    END IF;
    IF NEW.ban_expires_at IS DISTINCT FROM OLD.ban_expires_at THEN
      RAISE EXCEPTION 'SECURITY: ban_expires_at doğrudan değiştirilemez.';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- ── 7.5: set_active_role — kullanıcı sahip olduğu roller arasında geçer ──────
-- (profiles.role protect_profile_columns ile korumalı; yalnız bu RPC, yalnız
--  zaten roles[]'te olan bir role geçişe izin verir — ayrıcalık yükseltme yok.)
CREATE OR REPLACE FUNCTION public.set_active_role(p_role text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid := auth.uid(); v_roles jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_role NOT IN ('PLAYER','GOALKEEPER','REFEREE','OWNER') THEN RAISE EXCEPTION 'INVALID_ROLE'; END IF;
  SELECT roles INTO v_roles FROM public.profiles WHERE id = v_uid;
  IF NOT (COALESCE(v_roles,'[]'::jsonb) ? p_role) THEN
    RAISE EXCEPTION 'ROLE_NOT_OWNED: Bu role sahip degilsin.'; END IF;
  PERFORM set_config('app.bypass_role_protection','true',true);
  UPDATE public.profiles SET role = p_role, updated_at = now() WHERE id = v_uid;
  RETURN p_role;
END; $$;
REVOKE ALL ON FUNCTION public.set_active_role(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_active_role(text) TO authenticated;

-- ── 7.1: get_nearby_matches — yakındaki açık maçlar (earthdistance) ──────────
CREATE OR REPLACE FUNCTION public.get_nearby_matches(p_lat double precision, p_lon double precision, p_radius_km double precision DEFAULT 25)
RETURNS SETOF public.matches LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp, extensions AS $$
  SELECT m.*
  FROM public.matches m
  JOIN public.pitches pt ON pt.id = m.pitch_id
  WHERE m.status = 'ACTIVE'
    AND m.visibility = 'OPEN'
    AND pt.latitude IS NOT NULL AND pt.longitude IS NOT NULL
    AND m.starts_at IS NOT NULL AND m.starts_at > now()
    AND earth_distance(ll_to_earth(p_lat, p_lon), ll_to_earth(pt.latitude, pt.longitude)) <= p_radius_km * 1000.0
  ORDER BY earth_distance(ll_to_earth(p_lat, p_lon), ll_to_earth(pt.latitude, pt.longitude)) ASC
  LIMIT 100;
$$;
REVOKE ALL ON FUNCTION public.get_nearby_matches(double precision, double precision, double precision) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_nearby_matches(double precision, double precision, double precision) TO authenticated;

-- ── 7.3: admin_override_match_score — admin maç skoru düzeltmesi (audit'li) ──
CREATE OR REPLACE FUNCTION public.admin_override_match_score(p_match_id uuid, p_home int, p_away int, p_notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_old_h int; v_old_a int;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF p_home < 0 OR p_away < 0 THEN RAISE EXCEPTION 'INVALID_SCORE'; END IF;
  SELECT "homeScore","awayScore" INTO v_old_h, v_old_a FROM public.matches WHERE id = p_match_id;
  UPDATE public.matches SET "homeScore" = p_home, "awayScore" = p_away, "scoreEnteredAt" = now()
  WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  PERFORM public.log_admin_action('MATCH_SCORE_OVERRIDE', 'match', p_match_id, NULL,
    jsonb_build_object('home', v_old_h, 'away', v_old_a),
    jsonb_build_object('home', p_home, 'away', p_away, 'notes', p_notes));
  RETURN jsonb_build_object('match_id', p_match_id, 'home', p_home, 'away', p_away);
END; $$;
REVOKE ALL ON FUNCTION public.admin_override_match_score(uuid, int, int, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_override_match_score(uuid, int, int, text) TO authenticated;

-- ── 7.2: sessiz saatler yardımcısı (push edge'in çağıracağı) ────────────────
-- notification_preferences.quiet_hours = {"start":"23:00","end":"08:00"} (yerel TR)
CREATE OR REPLACE FUNCTION public._in_quiet_hours(p_uid uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_pref jsonb; v_start time; v_end time; v_now time;
BEGIN
  SELECT notification_preferences INTO v_pref FROM public.profiles WHERE id = p_uid;
  IF v_pref IS NULL OR NOT (v_pref ? 'quiet_hours') THEN RETURN false; END IF;
  BEGIN
    v_start := (v_pref->'quiet_hours'->>'start')::time;
    v_end   := (v_pref->'quiet_hours'->>'end')::time;
  EXCEPTION WHEN others THEN RETURN false; END;
  IF v_start IS NULL OR v_end IS NULL THEN RETURN false; END IF;
  v_now := (now() AT TIME ZONE 'Europe/Istanbul')::time;
  IF v_start <= v_end THEN
    RETURN v_now >= v_start AND v_now < v_end;
  ELSE  -- gece yarısını aşan aralık (örn 23:00-08:00)
    RETURN v_now >= v_start OR v_now < v_end;
  END IF;
END; $$;
REVOKE ALL ON FUNCTION public._in_quiet_hours(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._in_quiet_hours(uuid) TO authenticated, service_role;

-- ── 7.2: maç hatırlatma (1s & 24s) — cron ile in-app bildirim üretimi ────────
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS reminder_24h_sent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_1h_sent  boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.send_match_reminders()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE m RECORD; v_uid uuid; v_n int := 0; v_kind text; v_when text;
BEGIN
  FOR m IN
    SELECT id, title, starts_at,
           (NOT reminder_1h_sent  AND starts_at BETWEEN now() AND now() + interval '1 hour')  AS due_1h,
           (NOT reminder_24h_sent AND starts_at BETWEEN now() AND now() + interval '24 hours') AS due_24h
    FROM public.matches
    WHERE status IN ('ACTIVE','CONFIRMED') AND starts_at IS NOT NULL AND starts_at > now()
      AND (NOT reminder_1h_sent OR NOT reminder_24h_sent)
      AND starts_at <= now() + interval '24 hours'
  LOOP
    IF m.due_1h THEN v_kind := '1h'; v_when := '1 saat';
    ELSIF m.due_24h THEN v_kind := '24h'; v_when := '24 saat';
    ELSE CONTINUE; END IF;

    FOREACH v_uid IN ARRAY public._match_participant_ids(m.id) LOOP
      INSERT INTO public.notifications (user_id, title, body, type_key, match_id, deep_link)
      VALUES (v_uid, '⏰ Maç Hatırlatması',
              COALESCE(m.title,'Maçın') || ' ' || v_when || ' sonra başlıyor.',
              'MATCH_REMINDER', m.id, '/match/' || m.id::text);
      v_n := v_n + 1;
    END LOOP;

    IF v_kind = '1h' THEN UPDATE public.matches SET reminder_1h_sent = true, reminder_24h_sent = true WHERE id = m.id;
    ELSE UPDATE public.matches SET reminder_24h_sent = true WHERE id = m.id; END IF;
  END LOOP;
  RETURN jsonb_build_object('notifications', v_n);
END; $$;
REVOKE ALL ON FUNCTION public.send_match_reminders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.send_match_reminders() TO service_role;

-- 15 dakikada bir hatırlatma kontrolü
SELECT cron.schedule('send_match_reminders', '*/15 * * * *', 'SELECT public.send_match_reminders()')
WHERE NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send_match_reminders');
