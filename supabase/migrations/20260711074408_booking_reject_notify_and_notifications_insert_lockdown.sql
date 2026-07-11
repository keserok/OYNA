-- 1) notify_booking_events: sahibin PENDING talebi reddetmesi oyuncuya DB'den
--    bildirilir (önceden pitchOwnerService.rejectBooking client'tan yazıyordu).
--    CONFIRMED iptali owner_cancel_confirmed_booking RPC'sinde zaten bildiriliyor;
--    çifte bildirim olmaması için burada yalnız PENDING→CANCELLED (ret) kapsanır.
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
    -- Uygulamadan gelen yeni talep → tesis sahibine bildir
    IF NEW.source IN ('APP_BOOKING', 'APP_MATCH') AND v_owner IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, title, body, type_key, payload, action_required)
      VALUES (
        v_owner,
        CASE WHEN NEW.status = 'PENDING' THEN 'Yeni Rezervasyon Talebi ⏳' ELSE 'Yeni Rezervasyon ✅' END,
        COALESCE(v_pitch_name, 'Tesisiniz') || ' — ' || v_when ||
          CASE WHEN NEW.status = 'PENDING' THEN ' için onay bekleyen talep var.' ELSE ' rezervasyonu oluşturuldu.' END,
        'BOOKING_REQUEST',
        jsonb_build_object('booking_id', NEW.id, 'pitch_id', NEW.pitch_id),
        NEW.status = 'PENDING'
      );
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    -- Onaylandı (manuel veya otomatik) → oyuncuya bildir
    IF OLD.status = 'PENDING' AND NEW.status = 'CONFIRMED' AND NEW.user_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, title, body, type_key, payload)
      VALUES (
        NEW.user_id,
        'Rezervasyonun Onaylandı ✅',
        COALESCE(v_pitch_name, 'Saha') || ' — ' || v_when || ' rezervasyonun onaylandı. İyi oyunlar!',
        'BOOKING_CONFIRMED',
        jsonb_build_object('booking_id', NEW.id, 'pitch_id', NEW.pitch_id)
      );
    -- Oyuncu kendi iptal etti → tesis sahibine bildir
    ELSIF NEW.status = 'CANCELLED' AND OLD.status <> 'CANCELLED'
      AND NEW.cancelled_by IS NOT NULL AND NEW.cancelled_by = NEW.user_id
      AND v_owner IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, title, body, type_key, payload)
      VALUES (
        v_owner,
        'Rezervasyon İptal Edildi ❌',
        COALESCE(v_pitch_name, 'Tesisiniz') || ' — ' || v_when || ' rezervasyonu oyuncu tarafından iptal edildi.',
        'BOOKING_CANCELLED_BY_PLAYER',
        jsonb_build_object('booking_id', NEW.id, 'pitch_id', NEW.pitch_id)
      );
    -- Tesis sahibi PENDING talebi reddetti → oyuncuya bildir
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

-- 2) notifications INSERT kilidi: eski politika herhangi bir oturumlu kullanıcının
--    HERHANGİ BİR kullanıcıya bildirim yazmasına izin veriyordu (sahte "ödeme
--    onaylandı" vb. mümkündü). Client artık yalnız kendi adına yazabilir; başka
--    kullanıcıya giden tüm sistem bildirimleri SECURITY DEFINER trigger/RPC'ler
--    ve service-role üzerinden üretilir (tümü RLS'i zaten baypas eder).
DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;
DROP POLICY IF EXISTS "notifications_insert_self_or_admin" ON public.notifications;

CREATE POLICY "notifications_insert_self_or_admin" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    OR public.is_platform_admin()
  );
