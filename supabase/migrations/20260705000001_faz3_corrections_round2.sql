-- ==============================================================================
-- FAZ 3 Düzeltmeleri — Round 2 (entegrasyon testi bulgusu)
-- CRITICAL: process_match_at_deadline CONFIRM dalındaki owner-kazanç INSERT'i
--   9 kolon / 8 değer uyuşmazlığı içeriyordu → "INSERT has more target columns
--   than expressions". Kapora toplanmış + saha sahibi olan HER gerçek maçın
--   quorum onayı çöküyordu (mutlu yol kırık). match_id değeri eksikti.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.process_match_at_deadline(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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

  SELECT COALESCE(min_quorum_pct, 70) INTO v_quorum FROM public.settings LIMIT 1;
  v_quorum := COALESCE(v_quorum, 70) / 100.0;
  v_stats  := public.match_fill_stats(p_match_id);
  v_ratio  := (v_stats->>'paid_ratio')::numeric;

  IF v_ratio >= v_quorum THEN
    UPDATE public.matches SET status = 'CONFIRMED', confirmed_at = now() WHERE id = p_match_id;

    -- (A) GERÇEK sistem: toplanan MATCH_FEE'den saha sahibi kazancını yaz
    SELECT COALESCE(SUM(ABS(amount)), 0) INTO v_collected
    FROM public.wallet_transactions WHERE match_id = p_match_id AND type = 'MATCH_FEE';

    IF v_collected > 0 AND m.pitch_id IS NOT NULL THEN
      v_comm := public.calculate_commission(v_collected, 'PITCH', m.pitch_id);
      -- DÜZELTME: kolon listesi 9, değer listesi 9 (match_id değeri eklendi)
      INSERT INTO public.wallet_transactions
        (user_id, match_id, amount, type, balance_type, status, reference_type, reference_id, description)
      SELECT p.owner_id, p_match_id, (v_comm->>'net_amount')::numeric, 'MATCH_EARNING', 'EARNINGS', 'PENDING',
             'MATCH', p_match_id, 'Maç onaylandı — kapora tahsilatı (2 hafta beklemede)'
      FROM public.pitches p WHERE p.id = m.pitch_id AND p.owner_id IS NOT NULL;
    END IF;

    -- (B) Forward-compat: varsa pre-auth intent'leri de capture et
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

    -- (A) GERÇEK sistem: MATCH_FEE kaporalarını wallet_balance'a İADE et (idempotent)
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

    -- (B) Forward-compat: varsa pre-auth intent'leri void et
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
$$;
REVOKE ALL ON FUNCTION public.process_match_at_deadline(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_match_at_deadline(uuid) TO authenticated, service_role;

-- ==============================================================================
-- CRITICAL #2: notify_match_cancelled trigger'ı var olmayan kolonlara INSERT
--   ediyordu: notifications.type ve notifications.is_active YOK (şema type_key
--   kullanıyor). HER maç iptali bu trigger yüzünden çöküyordu (quorum iptali,
--   admin iptali, manuel iptal — hepsi). 'type' değeri type_key ile zaten
--   gereksiz; 'is_active' kolonu mevcut değil → ikisi de kaldırıldı.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.notify_match_cancelled()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_template RECORD;
  v_participant RECORD;
  v_title TEXT;
  v_body TEXT;
  v_vars JSONB;
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
    v_body  := replace_template_vars(v_template.body_tr, v_vars);

    FOR v_participant IN
      SELECT DISTINCT user_id
        FROM public.match_participants
       WHERE match_id = NEW.id
         AND status = 'CONFIRMED'
    LOOP
      INSERT INTO public.notifications
        (user_id, title, body, type_key, match_id, action_required, deep_link, is_read)
      VALUES (
        v_participant.user_id, v_title, v_body,
        'match_cancelled', NEW.id, false,
        'oyna://match/' || NEW.id::TEXT, false
      );
    END LOOP;

    IF NEW."creatorId" IS NOT NULL THEN
      INSERT INTO public.notifications
        (user_id, title, body, type_key, match_id, action_required, deep_link, is_read)
      SELECT
        NEW."creatorId", v_title, v_body,
        'match_cancelled', NEW.id, false,
        'oyna://match/' || NEW.id::TEXT, false
      WHERE NOT EXISTS (
        SELECT 1 FROM public.notifications
         WHERE user_id = NEW."creatorId"
           AND match_id = NEW.id
           AND type_key = 'match_cancelled'
      );
    END IF;

  END IF;

  RETURN NEW;
END;
$function$;

-- ==============================================================================
-- CRITICAL #4: notify_match_joined — aynı tür/is_active hatası. match_participants'a
--   katılım eklendiğinde tetikleniyordu → maça katılımı çökertme riski.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.notify_match_joined()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_captain_id UUID;
  v_match_date TEXT;
  v_location TEXT;
  v_template RECORD;
  v_player_name TEXT;
BEGIN
  IF NEW.role = 'CAPTAIN' THEN
    RETURN NEW;
  END IF;

  SELECT "creatorId", date, location
    INTO v_captain_id, v_match_date, v_location
    FROM public.matches WHERE id = NEW.match_id;

  IF v_captain_id IS NULL THEN RETURN NEW; END IF;

  SELECT COALESCE(name, 'Bir Oyuncu') INTO v_player_name
    FROM public.profiles WHERE id = NEW.user_id;

  SELECT * INTO v_template
    FROM public.notification_templates WHERE type_key = 'match_joined';
  IF NOT FOUND THEN RETURN NEW; END IF;

  INSERT INTO public.notifications
    (user_id, title, body, type_key, match_id, sender_id, action_required, deep_link, is_read)
  VALUES (
    v_captain_id,
    replace_template_vars(v_template.title_tr, jsonb_build_object(
      'player_name', v_player_name, 'match_date', COALESCE(v_match_date, 'Tarih belirtilmedi'), 'pitch_name', COALESCE(v_location, 'Saha'))),
    replace_template_vars(v_template.body_tr, jsonb_build_object(
      'player_name', v_player_name, 'match_date', COALESCE(v_match_date, 'Tarih belirtilmedi'), 'pitch_name', COALESCE(v_location, 'Saha'))),
    'match_joined', NEW.match_id, NEW.user_id, false,
    'oyna://match/' || NEW.match_id::TEXT, false
  );

  RETURN NEW;
END;
$function$;

-- ==============================================================================
-- CRITICAL #5: send_match_invite — aynı tür/is_active hatası. Maç/takım daveti
--   gönderimini çökertme riski.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.send_match_invite(p_match_id uuid, p_target_user_id uuid, p_sender_id uuid, p_team_id uuid DEFAULT NULL::uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_match_date TEXT;
  v_location TEXT;
  v_sender_name TEXT;
  v_team_name TEXT;
  v_template RECORD;
  v_type_key TEXT;
  v_vars JSONB;
  v_notification_id UUID;
BEGIN
  IF auth.uid() IS NOT NULL
     AND auth.uid() <> p_sender_id
     AND COALESCE((SELECT role FROM public.profiles WHERE id = auth.uid()), '') NOT IN ('ADMIN','SUPER_ADMIN') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Başka bir kullanıcı adına davet gönderemezsiniz.';
  END IF;

  SELECT date, location INTO v_match_date, v_location FROM public.matches WHERE id = p_match_id;
  SELECT COALESCE(name, 'Bir Oyuncu') INTO v_sender_name FROM public.profiles WHERE id = p_sender_id;

  IF p_team_id IS NOT NULL THEN
    v_type_key := 'team_invite';
    SELECT name INTO v_team_name FROM public.teams WHERE id = p_team_id;
    v_vars := jsonb_build_object('team_name', COALESCE(v_team_name, 'Takım'), 'sender_name', v_sender_name,
      'match_date', COALESCE(v_match_date, 'Belirtilmedi'), 'pitch_name', COALESCE(v_location, 'Saha'));
  ELSE
    v_type_key := 'match_invite';
    v_vars := jsonb_build_object('sender_name', v_sender_name,
      'match_date', COALESCE(v_match_date, 'Belirtilmedi'), 'pitch_name', COALESCE(v_location, 'Saha'));
  END IF;

  SELECT * INTO v_template FROM public.notification_templates WHERE type_key = v_type_key;

  INSERT INTO public.notifications
    (user_id, title, body, type_key, match_id, team_id, sender_id, action_required, deep_link, is_read)
  VALUES (
    p_target_user_id,
    replace_template_vars(v_template.title_tr, v_vars),
    replace_template_vars(v_template.body_tr, v_vars),
    v_type_key, p_match_id, p_team_id, p_sender_id,
    true, 'oyna://match/' || p_match_id::TEXT, false
  )
  RETURNING id INTO v_notification_id;

  RETURN v_notification_id;
END;
$function$;

-- ==============================================================================
-- CRITICAL #3: notify_ref_status_change da aynı hatayı taşıyordu (type/is_active
--   var olmayan kolonlar). Hakem atandığında/kaldırıldığında HER güncelleme
--   çöküyordu (GK/Ref akışını bozar). 'type' kaldırıldı (type_key yeterli),
--   'is_active' kaldırıldı (kolon yok).
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.notify_ref_status_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_template RECORD;
  v_applicant_id UUID;
  v_applicant_name TEXT;
  v_type_key TEXT;
  v_vars JSONB;
BEGIN
  IF NEW."refereeId" IS DISTINCT FROM OLD."refereeId" THEN
    IF NEW."refereeId" IS NOT NULL THEN
      v_type_key := 'ref_accepted';
      v_applicant_id := NEW."refereeId";
    ELSE
      v_type_key := 'ref_rejected';
      v_applicant_id := OLD."refereeId";
    END IF;

    IF v_applicant_id IS NOT NULL THEN
      SELECT COALESCE(name, 'Hakem')
        INTO v_applicant_name
        FROM public.profiles WHERE id = v_applicant_id;

      SELECT * INTO v_template
        FROM public.notification_templates WHERE type_key = v_type_key;

      IF FOUND THEN
        v_vars := jsonb_build_object(
          'ref_name', v_applicant_name,
          'match_date', COALESCE(NEW.date, 'Belirtilmedi'),
          'pitch_name', COALESCE(NEW.location, 'Saha')
        );

        IF NEW."creatorId" IS NOT NULL THEN
          INSERT INTO public.notifications
            (user_id, title, body, type_key, match_id, sender_id, action_required, deep_link, is_read)
          VALUES (
            NEW."creatorId",
            replace_template_vars(v_template.title_tr, v_vars),
            replace_template_vars(v_template.body_tr, v_vars),
            v_type_key, NEW.id, v_applicant_id, false,
            'oyna://match/' || NEW.id::TEXT, false
          );
        END IF;

        INSERT INTO public.notifications
          (user_id, title, body, type_key, match_id, action_required, deep_link, is_read)
        VALUES (
          v_applicant_id,
          replace_template_vars(v_template.title_tr, v_vars),
          CASE WHEN v_type_key = 'ref_accepted' THEN 'Maça hakem olarak onaylandınız!' ELSE 'Hakem başvurunuz reddedildi.' END,
          v_type_key, NEW.id, false,
          'oyna://match/' || NEW.id::TEXT, false
        );
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
