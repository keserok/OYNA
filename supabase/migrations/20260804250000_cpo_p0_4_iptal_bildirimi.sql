-- ════════════════════════════════════════════════════════════════════════════
-- [SON-3 / CPO-P0-4] MAÇ İPTALİNDE KATILIMCILARA BİLDİRİM GİTMİYOR
-- Kurucu onayı: SON_KARARLAR 34
-- ────────────────────────────────────────────────────────────────────────────
-- BULGU: `notify_match_cancelled` tetikleyicisi katılımcıları şöyle arıyordu:
--     WHERE status = 'CONFIRMED'      ← BÜYÜK harf
-- Ama `match_participants.status` sütunundaki gerçek değerler KÜÇÜK harf.
-- Canlıdan sayıldı: confirmed=40 · creator=13 · left=1. 'CONFIRMED' → **0 satır**.
--
-- SONUÇ: Bir maç iptal edildiğinde döngü hiç dönmüyor; yalnızca maçı kuran
-- kişiye bildirim gidiyor. Parasını ödemiş oyuncular maçın iptal edildiğini
-- **hiç öğrenmiyor**. Tetikleyici çalışıyor, hata vermiyor, kimse fark etmiyor.
--
-- İKİNCİ VE DAHA DERİN SORUN: Elle yazılmış bu sorgu yalnız `match_participants`
-- tablosuna bakıyordu. Oysa P-2A'da tam bu iş için tek kaynak kurmuştuk:
-- `_match_participant_ids()` — slotu DOLDURAN ∪ slotu SATIN ALAN.
-- Bir kişi başkası için slot satın aldıysa (K-3.4 hediye/devir), eski sorguda
-- görünmüyordu; parası gidiyor, haberi olmuyordu.
--
-- ÇÖZÜM: Kendi sorgusunu yazmayı bırak, tek kaynağı kullan. Ayrıca
-- `match_participants` tablosunu da (küçük harf değerlerle) BİRLEŞİME kat —
-- böylece slotu temizlenmiş ama kadroda duran kimse de kaybolmaz.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.notify_match_cancelled()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_template RECORD;
  v_title TEXT;
  v_body  TEXT;
  v_vars  JSONB;
  v_kisi  uuid;
  v_alici uuid[];
BEGIN
  IF NEW.status = 'CANCELLED' AND (OLD.status IS NULL OR OLD.status <> 'CANCELLED') THEN

    SELECT * INTO v_template
      FROM public.notification_templates
     WHERE type_key = 'match_cancelled';

    IF NOT FOUND THEN RETURN NEW; END IF;

    v_vars := jsonb_build_object(
      'match_date', COALESCE(NEW.date, 'Belirtilmedi'),
      'match_time', COALESCE(NEW.time, ''),
      'pitch_name', COALESCE(NEW.location, 'Belirtilmemiş Saha')
    );
    v_title := replace_template_vars(v_template.title_tr, v_vars);
    v_body  := replace_template_vars(v_template.body_tr,  v_vars);

    -- ── ALICI LİSTESİ: üç kaynağın birleşimi ────────────────────────────────
    --   1) slotu dolduran   ∪  2) slotu satın alan   → _match_participant_ids
    --   3) kadro tablosunda ayrılmamış görünen herkes (KÜÇÜK harf değerler)
    --   4) maçı kuran
    SELECT COALESCE(array_agg(DISTINCT uid), '{}') INTO v_alici
    FROM (
      SELECT unnest(public._match_participant_ids(NEW.id)) AS uid
      UNION
      SELECT mp.user_id
        FROM public.match_participants mp
       WHERE mp.match_id = NEW.id
         AND lower(COALESCE(mp.status,'')) NOT IN ('left','cancelled','removed','declined')
      UNION
      SELECT NEW."creatorId"
      UNION
      SELECT NEW.captain_id
    ) s
    WHERE uid IS NOT NULL;

    FOREACH v_kisi IN ARRAY v_alici LOOP
      INSERT INTO public.notifications
        (user_id, title, body, type_key, match_id, action_required, deep_link, is_read)
      SELECT v_kisi, v_title, v_body, 'match_cancelled', NEW.id, false,
             'oyna://match/' || NEW.id::TEXT, false
      -- Aynı kişiye aynı maç için ikinci kez gönderme (tetikleyici tekrar
      -- çalışırsa mükerrer bildirim olmasın).
      WHERE NOT EXISTS (
        SELECT 1 FROM public.notifications n
         WHERE n.user_id = v_kisi AND n.match_id = NEW.id
           AND n.type_key = 'match_cancelled'
      );
    END LOOP;

  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.notify_match_cancelled() IS
  'CPO-P0-4 duzeltildi: alici listesi _match_participant_ids (dolduran + satin alan) ile kadro tablosunun (kucuk harf) BIRLESIMI. Eskiden status=CONFIRMED (buyuk harf) araniyor ve 0 kisi buluyordu.';
