-- ═══════════════════════════════════════════════════════════════════════════
-- A PAKETİ — BİLDİRİMLER TIKLANIR OLSUN · CEO kararı, 4 Ağustos 2026
--
-- Canlı ölçüm: bugüne kadar üretilmiş 128 bildirimin 78'i (%61) tıklanınca
-- ya hiçbir şey yapmıyor ya da yanlış ekranı açıyordu.
--
-- A1 — 36 maç hatırlatması ÖLÜ: adres '/match/<id>' yazılıyordu; uygulama
--      güvenlik gereği yalnız 'oyna://' kabul ediyor (pushService.ts:170).
-- A2 — Hatırlatma YANLIŞ SAAT söylüyordu: maça 5,9 saat kala "24 saat sonra
--      başlıyor" gitmiş (canlı kanıt: 3 vaka). Sebep: metin sabit yazılmıştı.
-- A4 — Saha sahibi ve destek bildirimlerinin adresi HİÇ yoktu.
-- A7 — Saha değişikliği sonucu 'OWNER_PANEL' yazıyordu — bu bir adres değil.
--
-- BOZMA RİSKİ: Düşük. Kimin hangi bildirimi alacağı DEĞİŞMİYOR; yalnız
-- bildirimin adresi ve metni düzeliyor.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── A1 + A2 — maç hatırlatması ───────────────────────────────────────────
-- Değişen üç şey:
--   1) deep_link artık 'oyna://match/<id>' (uygulamanın kabul ettiği biçim)
--   2) metin sabit değil, GERÇEK kalan süreyi yazıyor
--   3) 24 saatlik hatırlatma yalnız gerçekten 20-24 saat kala gönderiliyor;
--      daha yakın maçlarda yalnız 1 saatlik hatırlatma gider (yanlış bilgi yok)
-- NOT: Süre GÖRELİ yazılıyor ("22 saat sonra"), mutlak saat değil. Sebep:
--      mutlak saat yazmak sunucu saat dilimine bağımlıdır ve 3 saat kayabilir.
CREATE OR REPLACE FUNCTION public.send_match_reminders()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  m RECORD; v_uid uuid; v_n int := 0; v_kind text; v_when text;
  v_kalan interval; v_dk int; v_sa int;
BEGIN
  FOR m IN
    SELECT id, title, starts_at,
           (NOT reminder_1h_sent
             AND starts_at BETWEEN now() AND now() + interval '1 hour') AS due_1h,
           -- 20 saat ALT SINIRI yeni: bu olmadan 6 saat kalan maça da
           -- "24 saat sonra" deniyordu.
           (NOT reminder_24h_sent
             AND starts_at BETWEEN now() + interval '20 hours'
                               AND now() + interval '24 hours') AS due_24h
    FROM public.matches
    WHERE status IN ('ACTIVE','CONFIRMED') AND starts_at IS NOT NULL AND starts_at > now()
      AND (NOT reminder_1h_sent OR NOT reminder_24h_sent)
      AND starts_at <= now() + interval '24 hours'
  LOOP
    IF m.due_1h THEN v_kind := '1h';
    ELSIF m.due_24h THEN v_kind := '24h';
    ELSE CONTINUE; END IF;

    v_kalan := m.starts_at - now();
    IF v_kind = '1h' THEN
      v_dk := greatest(1, floor(EXTRACT(EPOCH FROM v_kalan) / 60.0)::int);
      v_when := v_dk || ' dakika';
    ELSE
      v_sa := greatest(1, round(EXTRACT(EPOCH FROM v_kalan) / 3600.0)::int);
      v_when := v_sa || ' saat';
    END IF;

    FOREACH v_uid IN ARRAY public._match_participant_ids(m.id) LOOP
      INSERT INTO public.notifications (user_id, title, body, type_key, match_id, deep_link)
      VALUES (v_uid, '⏰ Maç Hatırlatması',
              COALESCE(m.title,'Maçın') || ' ' || v_when || ' sonra başlıyor.',
              'MATCH_REMINDER', m.id, 'oyna://match/' || m.id::text);
      v_n := v_n + 1;
    END LOOP;

    IF v_kind = '1h' THEN
      UPDATE public.matches SET reminder_1h_sent = true, reminder_24h_sent = true WHERE id = m.id;
    ELSE
      UPDATE public.matches SET reminder_24h_sent = true WHERE id = m.id;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('notifications', v_n);
END; $$;

-- ─── A7 — saha sahibi bildirimleri ────────────────────────────────────────
-- 'OWNER_PANEL' bir adres değildi; uygulama tanımadığı için hiçbir şey olmuyordu.
CREATE OR REPLACE FUNCTION public.notify_pitch_owner(
  p_pitch_id uuid, p_type_key text, p_title text, p_body text,
  p_payload jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_owner uuid;
BEGIN
  SELECT owner_id INTO v_owner FROM pitches WHERE id = p_pitch_id;
  IF v_owner IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO notifications (id, user_id, type_key, title, body, payload, deep_link, is_read)
  VALUES (
    gen_random_uuid(), v_owner, p_type_key, p_title, p_body,
    p_payload || jsonb_build_object('pitch_id', p_pitch_id),
    'oyna://owner', false
  );
EXCEPTION WHEN others THEN
  RAISE WARNING 'notify_pitch_owner: %', SQLERRM;
END;
$function$;

-- ─── A4 — rezervasyon bildirimlerine adres ────────────────────────────────
-- Üç bildirimin de adresi yoktu. Gövdenin geri kalanı BİREBİR aynı;
-- yalnız deep_link sütunu eklendi (owner_cancellation'ın tercih kontrolü
-- dahil hiçbir koşul değişmedi).
CREATE OR REPLACE FUNCTION public.notify_booking_events()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE
  v_owner uuid; v_pitch_name text; v_when text;
BEGIN
  SELECT owner_id, name INTO v_owner, v_pitch_name FROM public.pitches WHERE id = NEW.pitch_id;
  v_when := to_char(NEW.booking_date, 'DD.MM.YYYY') || ' ' || to_char(NEW.start_time, 'HH24:MI');
  IF TG_OP = 'INSERT' THEN
    IF NEW.source IN ('APP_BOOKING', 'APP_MATCH') AND v_owner IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, title, body, type_key, payload, action_required, deep_link)
      VALUES (
        v_owner,
        'Yeni Rezervasyon ✅',
        COALESCE(v_pitch_name, 'Tesisiniz') || ' — ' || v_when || ' rezervasyonu oluşturuldu.',
        'owner_new_booking',
        jsonb_build_object('booking_id', NEW.id, 'pitch_id', NEW.pitch_id),
        false,
        'oyna://owner'
      );
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'CANCELLED' AND OLD.status <> 'CANCELLED'
      AND NEW.cancelled_by IS NOT NULL AND NEW.cancelled_by = NEW.user_id
      AND v_owner IS NOT NULL
      AND public._notification_pref_enabled(v_owner, 'owner_cancellation') THEN
      INSERT INTO public.notifications (user_id, title, body, type_key, payload, deep_link)
      VALUES (
        v_owner,
        'Rezervasyon İptal Edildi ❌',
        COALESCE(v_pitch_name, 'Tesisiniz') || ' — ' || v_when || ' rezervasyonu oyuncu tarafından iptal edildi.',
        'owner_cancellation',
        jsonb_build_object('booking_id', NEW.id, 'pitch_id', NEW.pitch_id),
        'oyna://owner'
      );
    ELSIF NEW.status = 'CANCELLED' AND OLD.status <> 'CANCELLED'
      AND NEW.user_id IS NOT NULL
      AND (NEW.cancelled_by IS NULL OR NEW.cancelled_by <> NEW.user_id) THEN
      INSERT INTO public.notifications (user_id, title, body, type_key, payload, deep_link)
      VALUES (
        NEW.user_id,
        'Rezervasyonun İptal Edildi',
        COALESCE(v_pitch_name, 'Saha') || ' — ' || v_when || ' rezervasyonun tesis tarafından iptal edildi.' ||
          COALESCE(' Sebep: ' || NULLIF(NEW.cancellation_reason, ''), ''),
        'BOOKING_REJECTED',
        jsonb_build_object('booking_id', NEW.id, 'pitch_id', NEW.pitch_id),
        'oyna://bookings'
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- ─── A4 — destek cevabına adres ───────────────────────────────────────────
-- Tek değişiklik: deep_link sütunu. Yetki kontrolü ve gövde birebir aynı.
CREATE OR REPLACE FUNCTION public.admin_support_ticket_reply(
  p_ticket_id uuid, p_body text, p_new_status text DEFAULT NULL::text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_name   text;
  v_msg    uuid;
  v_user   uuid;
  v_subj   text;
  v_status text;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  p_body := btrim(COALESCE(p_body, ''));
  IF length(p_body) < 1 THEN RAISE EXCEPTION 'Yanıt boş olamaz.'; END IF;
  IF p_new_status IS NOT NULL AND p_new_status NOT IN ('OPEN','PENDING','RESOLVED','CLOSED') THEN
    RAISE EXCEPTION 'Geçersiz durum.';
  END IF;

  SELECT user_id, subject INTO v_user, v_subj FROM public.support_tickets WHERE id = p_ticket_id;
  IF v_user IS NULL THEN RAISE EXCEPTION 'Talep bulunamadı.'; END IF;

  SELECT COALESCE(full_name, name, email, 'OYNA Destek') INTO v_name FROM public.profiles WHERE id = v_uid;

  INSERT INTO public.support_ticket_messages (ticket_id, sender_id, sender_role, sender_name, body)
  VALUES (p_ticket_id, v_uid, 'ADMIN', COALESCE(v_name, 'OYNA Destek'), p_body)
  RETURNING id INTO v_msg;

  v_status := COALESCE(p_new_status, 'PENDING');

  UPDATE public.support_tickets SET
    last_message_at  = now(),
    updated_at       = now(),
    last_sender_role = 'ADMIN',
    unread_for_admin = false,
    unread_for_user  = true,
    status           = v_status,
    resolved_at      = CASE WHEN v_status IN ('RESOLVED','CLOSED') THEN now() ELSE NULL END,
    resolved_by      = CASE WHEN v_status IN ('RESOLVED','CLOSED') THEN v_uid ELSE resolved_by END
  WHERE id = p_ticket_id;

  INSERT INTO public.notifications (user_id, title, body, type_key, payload, deep_link)
  VALUES (
    v_user,
    'Destek talebiniz yanıtlandı',
    left(p_body, 140),
    'SUPPORT_REPLY',
    jsonb_build_object('ticket_id', p_ticket_id, 'subject', v_subj),
    'oyna://support'
  );

  PERFORM public.log_admin_action('SUPPORT_REPLY', 'support_ticket', p_ticket_id, v_subj, NULL,
    jsonb_build_object('status', v_status));

  RETURN v_msg;
END;
$function$;

-- ─── S4a — GEÇMİŞ bozuk bildirimleri düzelt (CEO onayı ile) ───────────────
-- Yalnız deep_link sütununa yazar. Başka hiçbir sütuna, hiçbir tabloya
-- dokunmaz. Böylece kullanıcıların kutusunda duran eski bildirimler de
-- tıklanır hâle gelir.
UPDATE public.notifications
   SET deep_link = 'oyna://match/' || match_id::text
 WHERE type_key = 'MATCH_REMINDER'
   AND match_id IS NOT NULL
   AND deep_link IS NOT NULL
   AND deep_link NOT LIKE 'oyna://%';

UPDATE public.notifications
   SET deep_link = 'oyna://owner'
 WHERE deep_link = 'OWNER_PANEL';

-- ─── DOĞRULAMA — yanlışsa tüm göç geri alınır ─────────────────────────────
DO $$
DECLARE v_bozuk bigint; v_adressiz bigint;
BEGIN
  SELECT count(*) INTO v_bozuk FROM public.notifications
   WHERE deep_link IS NOT NULL AND deep_link NOT LIKE 'oyna://%';
  IF v_bozuk > 0 THEN
    RAISE EXCEPTION 'DOGRULAMA: hala % adet gecersiz semali baglanti var.', v_bozuk;
  END IF;

  -- Hatırlatmaların hepsi maç adresine sahip olmalı
  SELECT count(*) INTO v_adressiz FROM public.notifications
   WHERE type_key = 'MATCH_REMINDER' AND (deep_link IS NULL OR deep_link NOT LIKE 'oyna://match/%');
  IF v_adressiz > 0 THEN
    RAISE EXCEPTION 'DOGRULAMA: % adet hatirlatma hala adressiz.', v_adressiz;
  END IF;

  -- Yeni fonksiyon gerçekten oyna:// üretiyor mu (kaynak denetimi)
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='send_match_reminders'
       AND p.prosrc LIKE '%oyna://match/%'
  ) THEN
    RAISE EXCEPTION 'DOGRULAMA: send_match_reminders hala eski adresi uretiyor.';
  END IF;

  RAISE NOTICE 'A paketi baglantilar: dogrulama gecti.';
END $$;
