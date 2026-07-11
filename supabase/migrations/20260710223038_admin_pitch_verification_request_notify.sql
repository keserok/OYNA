-- Yeni tesis başvurusu (verification_status='pending') adminlere DB tarafında
-- bildirilir. PartnerOnboarding'deki client-side fan-out .eq('role','ADMIN')
-- sorgusu boş döndüğü için (adminler is_admin=true / SUPER_ADMIN) hiçbir zaman
-- çalışmıyordu; tek otorite artık bu trigger. Client fan-out kaldırıldı.

CREATE OR REPLACE FUNCTION public.notify_admins_pitch_verification_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Demo kayıtlar admin kuyruğunu kirletmesin
  IF COALESCE(NEW.is_demo, false) THEN
    RETURN NEW;
  END IF;

  IF NEW.verification_status = 'pending'
     AND (TG_OP = 'INSERT' OR OLD.verification_status IS DISTINCT FROM NEW.verification_status) THEN
    INSERT INTO public.notifications (user_id, sender_id, title, body, type_key, payload)
    SELECT p.id,
           NEW.owner_id,
           'Yeni Tesis Onay Bekliyor',
           NEW.name || ' tesisi onayınızı bekliyor.',
           'PITCH_VERIFICATION_REQUEST',
           jsonb_build_object('pitch_id', NEW.id, 'city', NEW.city, 'district', NEW.district)
    FROM public.profiles p
    WHERE (p.is_admin = true OR p.role IN ('ADMIN', 'SUPER_ADMIN'))
      -- Aynı tesis için okunmamış talep bildirimi varken tekrar üretme (dedupe)
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.user_id = p.id
          AND n.type_key = 'PITCH_VERIFICATION_REQUEST'
          AND n.payload->>'pitch_id' = NEW.id::text
          AND n.is_read = false
      );
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_admins_pitch_verification_request() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_notify_admins_pitch_verification_request ON public.pitches;
CREATE TRIGGER trg_notify_admins_pitch_verification_request
  AFTER INSERT OR UPDATE OF verification_status ON public.pitches
  FOR EACH ROW EXECUTE FUNCTION public.notify_admins_pitch_verification_request();
