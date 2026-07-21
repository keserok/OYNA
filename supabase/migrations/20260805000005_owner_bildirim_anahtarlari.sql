-- ============================================================================
-- SAHA SAHİBİ BİLDİRİM ANAHTARLARI (Faz 8 · Karar #40-41)
-- Owner bildirim tercihlerinin GERÇEKTEN kapı olması için: rezervasyon
-- trigger'ının owner-hedefli notification'larının type_key'i, owner tercih
-- anahtarlarıyla (owner_new_booking / owner_cancellation) hizalanır. send-push
-- prefs[type_key] ile kontrol ettiği için artık toggle push'u geçitler.
-- Player-hedefli type_key'ler (BOOKING_CONFIRMED/REJECTED) DEĞİŞMEZ.
-- Ayrıca 4 owner olayı için notification_templates satırı eklenir.
-- ============================================================================

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
      AND v_owner IS NOT NULL THEN
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

-- Owner bildirim şablonları (kategori OWNER, kapatılabilir).
INSERT INTO public.notification_templates (type_key, label_tr, title_tr, body_tr, category, is_mandatory, can_user_disable, sort_order)
VALUES
  ('owner_new_booking',  'Yeni Rezervasyon', 'Yeni Rezervasyon', 'Sahan için yeni bir rezervasyon var.', 'OWNER', false, true, 60),
  ('owner_cancellation', 'İptal',            'Rezervasyon İptal', 'Bir rezervasyon iptal edildi.',        'OWNER', false, true, 61),
  ('owner_deposit_paid', 'Kapora Ödendi',    'Kapora Ödendi',    'Rezervasyon kaporası tesisine düştü.',  'OWNER', false, true, 62),
  ('owner_daily_summary','Günlük Özet',      'Günlük Özet',      'Bugünkü tahsilat ve doluluk özeti.',    'OWNER', false, true, 63)
ON CONFLICT (type_key) DO NOTHING;
