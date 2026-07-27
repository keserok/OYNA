-- ============================================================
-- F3 — Yanıltıcı arayüz temizliğinin sunucu ayağı
-- ============================================================
-- (c) YOLA ÇIKTIM / TESİSE VARDIM: yalnız cihaz-yerel state idi ve ekran
--     "KAPTANA BİLDİRİLDİ" diyordu (yalan; F0'da metin düzeltildi). Artık
--     gerçek: service_requests.live_status + provider_set_live_status RPC'si
--     kaptana bildirim atar; kaptan lobisi rozeti gösterir.
-- (i) Saha sahibi bildirim tercihleri: push gönderici (send-push) tercihleri
--     okuyor ama uygulama-içi bildirim üreten notify_booking_events HİÇ
--     okumuyordu. owner_cancellation artık tercihe uyar; owner_new_booking
--     operasyonel-kritik olduğundan HER ZAMAN düşer (şablon is_mandatory=true).
-- (h/i) goalkeepers/referees.settings JSONB'sinden ölü anahtar temizliği:
--     hidePhone (telefon hiçbir yerde gösterilmiyor) + hiçbir göndericinin
--     okumadığı 5 notif* anahtarı (tercihler artık profiles.notification_
--     preferences'ta, oyuncuyla ortak ekran).
-- (d) Stok Unsplash avatarları gerçek veri olarak yazılmıştı (yabancı kişi
--     fotoğrafı = kimlik yanıltması); demo olmayan kayıtlarda NULL'a çekilir.

-- ------------------------------------------------------------
-- (c) live_status kolonu + RPC
-- ------------------------------------------------------------
ALTER TABLE public.service_requests
  ADD COLUMN IF NOT EXISTS live_status text NOT NULL DEFAULT 'PENDING';

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.service_requests'::regclass
      AND conname = 'service_requests_live_status_check'
  ) THEN
    ALTER TABLE public.service_requests
      ADD CONSTRAINT service_requests_live_status_check
      CHECK (live_status IN ('PENDING','ON_THE_WAY','ARRIVED','FINISHED'));
  END IF;
END
$do$;

CREATE OR REPLACE FUNCTION public.provider_set_live_status(p_request_id uuid, p_status text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_req public.service_requests;
  v_title text;
  v_name text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_status NOT IN ('ON_THE_WAY','ARRIVED','FINISHED') THEN
    RAISE EXCEPTION 'INVALID_STATUS: %', p_status;
  END IF;
  SELECT * INTO v_req FROM public.service_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_req.provider_id IS DISTINCT FROM v_uid THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF v_req.status NOT IN ('ACCEPTED','CAPTURED') THEN
    RAISE EXCEPTION 'INVALID_STATE: Canlı durum yalnız aktif işte güncellenir (mevcut: %).', v_req.status;
  END IF;

  IF v_req.live_status = p_status THEN
    RETURN jsonb_build_object('request_id', p_request_id, 'live_status', p_status, 'changed', false);
  END IF;

  UPDATE public.service_requests SET live_status = p_status WHERE id = p_request_id;

  -- Kaptana gerçek sinyal (yalnız yolda/vardım geçişlerinde; FINISHED zaten
  -- onay akışının konusu)
  IF p_status IN ('ON_THE_WAY','ARRIVED') THEN
    SELECT COALESCE(m.title,'Maç') INTO v_title FROM public.matches m WHERE m.id = v_req.match_id;
    SELECT COALESCE(name, full_name, 'Sağlayıcı') INTO v_name FROM public.profiles WHERE id = v_uid;
    INSERT INTO public.notifications (user_id, title, body, type_key, match_id, deep_link)
    VALUES (v_req.requested_by,
            CASE WHEN p_status = 'ON_THE_WAY'
                 THEN CASE WHEN v_req.provider_type='GK' THEN 'Kalecin yola çıktı 🧤' ELSE 'Hakem yola çıktı ⚖️' END
                 ELSE CASE WHEN v_req.provider_type='GK' THEN 'Kalecin tesiste ✅' ELSE 'Hakem tesiste ✅' END END,
            v_name || ', ' || v_title ||
            CASE WHEN p_status = 'ON_THE_WAY' THEN ' için yola çıktığını bildirdi.' ELSE ' tesisine vardı.' END,
            'service_live_status', v_req.match_id, 'oyna://match/' || v_req.match_id);
  END IF;

  RETURN jsonb_build_object('request_id', p_request_id, 'live_status', p_status, 'changed', true);
END; $function$;

REVOKE ALL ON FUNCTION public.provider_set_live_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.provider_set_live_status(uuid, text) TO authenticated, service_role;

-- ------------------------------------------------------------
-- (i) Tercih yardımcı + notify_booking_events (canlı gövde + kapı)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._notification_pref_enabled(p_user_id uuid, p_type_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT COALESCE(
    (SELECT (notification_preferences -> p_type_key ->> 'enabled')::boolean
     FROM public.profiles WHERE id = p_user_id),
    true);
$$;

REVOKE ALL ON FUNCTION public._notification_pref_enabled(uuid, text) FROM PUBLIC, anon;

-- Gövde canlıdan birebir (2026-07-27 teyidi); yalnız owner_cancellation dalına
-- tercih kapısı eklendi. owner_new_booking BİLİNÇLİ olarak koşulsuz (kritik).
CREATE OR REPLACE FUNCTION public.notify_booking_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_owner uuid;
  v_pitch_name text;
  v_when text;
BEGIN
  SELECT owner_id, name INTO v_owner, v_pitch_name FROM public.pitches WHERE id = NEW.pitch_id;
  v_when := to_char(NEW.booking_date, 'DD.MM.YYYY') || ' ' || to_char(NEW.start_time, 'HH24:MI');

  IF TG_OP = 'INSERT' THEN
    IF NEW.source IN ('APP_BOOKING', 'APP_MATCH') AND v_owner IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, title, body, type_key, payload, action_required)
      VALUES (
        v_owner,
        CASE WHEN NEW.status = 'PENDING' THEN 'Yeni Rezervasyon Talebi ⏳' ELSE 'Yeni Rezervasyon ✅' END,
        COALESCE(v_pitch_name, 'Tesisiniz') || ' — ' || v_when ||
          CASE WHEN NEW.status = 'PENDING' THEN ' için onay bekleyen talep var.' ELSE ' rezervasyonu oluşturuldu.' END,
        'owner_new_booking',
        jsonb_build_object('booking_id', NEW.id, 'pitch_id', NEW.pitch_id),
        NEW.status = 'PENDING'
      );
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'PENDING' AND NEW.status = 'CONFIRMED' AND NEW.user_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, title, body, type_key, payload)
      VALUES (
        NEW.user_id,
        'Rezervasyonun Onaylandı ✅',
        COALESCE(v_pitch_name, 'Saha') || ' — ' || v_when || ' rezervasyonun onaylandı. İyi oyunlar!',
        'BOOKING_CONFIRMED',
        jsonb_build_object('booking_id', NEW.id, 'pitch_id', NEW.pitch_id)
      );
    ELSIF NEW.status = 'CANCELLED' AND OLD.status <> 'CANCELLED'
      AND NEW.cancelled_by IS NOT NULL AND NEW.cancelled_by = NEW.user_id
      AND v_owner IS NOT NULL
      AND public._notification_pref_enabled(v_owner, 'owner_cancellation') THEN
      -- F3i: iptal bildirimi artık sahibin tercihini sayar
      INSERT INTO public.notifications (user_id, title, body, type_key, payload)
      VALUES (
        v_owner,
        'Rezervasyon İptal Edildi ❌',
        COALESCE(v_pitch_name, 'Tesisiniz') || ' — ' || v_when || ' rezervasyonu oyuncu tarafından iptal edildi.',
        'owner_cancellation',
        jsonb_build_object('booking_id', NEW.id, 'pitch_id', NEW.pitch_id)
      );
    ELSIF NEW.status = 'CANCELLED' AND OLD.status = 'PENDING'
      AND NEW.user_id IS NOT NULL
      AND (NEW.cancelled_by IS NULL OR NEW.cancelled_by <> NEW.user_id) THEN
      INSERT INTO public.notifications (user_id, title, body, type_key, payload)
      VALUES (
        NEW.user_id,
        'Rezervasyonun Onaylanmadı',
        COALESCE(v_pitch_name, 'Saha') || ' — ' || v_when || ' talebin onaylanmadı.' ||
          COALESCE(' Sebep: ' || NULLIF(NEW.cancellation_reason, ''), ''),
        'BOOKING_REJECTED',
        jsonb_build_object('booking_id', NEW.id, 'pitch_id', NEW.pitch_id)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- owner_new_booking şablonu zorunlu işaretlenir (push tarafında da susturulamaz)
UPDATE public.notification_templates
SET is_mandatory = true, can_user_disable = false
WHERE type_key = 'owner_new_booking';

-- ------------------------------------------------------------
-- (h/i) Ölü settings anahtarları temizliği
-- ------------------------------------------------------------
UPDATE public.goalkeepers
SET settings = settings - 'hidePhone' - 'notifNewOffer' - 'notifReminder' - 'notifPayment' - 'notifWeekly' - 'notifMarketing'
WHERE settings ?| ARRAY['hidePhone','notifNewOffer','notifReminder','notifPayment','notifWeekly','notifMarketing'];

UPDATE public.referees
SET settings = settings - 'hidePhone' - 'notifNewOffer' - 'notifReminder' - 'notifPayment' - 'notifWeekly' - 'notifMarketing'
WHERE settings ?| ARRAY['hidePhone','notifNewOffer','notifReminder','notifPayment','notifWeekly','notifMarketing'];

-- ------------------------------------------------------------
-- (d) Stok Unsplash avatar temizliği (demo kayıtlar hariç)
-- ------------------------------------------------------------
UPDATE public.goalkeepers SET avatar = NULL
WHERE avatar LIKE '%images.unsplash.com%' AND COALESCE("isDemo", false) = false;

UPDATE public.referees SET avatar = NULL
WHERE avatar LIKE '%images.unsplash.com%' AND COALESCE("isDemo", false) = false;
