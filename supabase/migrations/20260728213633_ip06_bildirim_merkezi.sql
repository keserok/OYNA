-- ================================================================
-- IP-06 — Bildirim merkezi, derin bağlantı ve bildirim üretimi
-- BULGU-070 (ret sunucuya yazılmıyor) + BULGU-078 (nearby_match üreticisi yok)
-- Idempotent: CREATE OR REPLACE / IF NOT EXISTS / ON CONFLICT.
-- ================================================================

-- ── 1) Eksik şablonlar ────────────────────────────────────────────
-- nearby_match yalnız notifications/schema_additions.sql'de vardı (migration DEĞİL).
-- match_invite_declined yeni. DİKKAT: _notify_team_event TEK süslü parantez
-- ({sender_name}) değiştirir; replace_template_vars ÇİFT ({{distance}}) değiştirir.
INSERT INTO public.notification_templates
  (type_key, label_tr, title_tr, body_tr, category, is_mandatory, can_user_disable, sort_order)
SELECT * FROM (VALUES
  ('nearby_match','Yakında Maç','📍 Yakında Maç!',
   '{{distance}} km yakınında açık bir maç var. Hemen katıl!','MATCH',false,true,11),
  ('match_invite_declined','Davet cevabı','Davetin cevaplandı',
   '{sender_name} bu maça gelemeyeceğini bildirdi.','MATCH',false,true,32)
) AS v(type_key,label_tr,title_tr,body_tr,category,is_mandatory,can_user_disable,sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.notification_templates t WHERE t.type_key = v.type_key);

-- ── 2) İlan sınırları için yapılandırma ──────────────────────────
INSERT INTO public.social_config (key, value) VALUES
  ('nearby_broadcast_radius_km', '25'),
  ('nearby_broadcast_max',       '50')
ON CONFLICT (key) DO NOTHING;

-- ── 3) Hız sınırı sorguları için indeksler ───────────────────────
CREATE INDEX IF NOT EXISTS notifications_match_type_created_idx
  ON public.notifications (match_id, type_key, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_user_type_created_idx
  ON public.notifications (user_id, type_key, created_at DESC);


-- ── 4) send_match_invite v3 ──────────────────────────────────────
-- DEĞİŞEN: (a) her davet match_list_invites'a bir satır bırakır — tekil "Maça
-- Çağır" yolunda (inviteFriendToMatch) reddedilecek kayıt YOKTU; (b) bildirim
-- payload'ında invite_id taşınır — istemci "Gelemem"i bu id ile gönderir.
-- CREATE OR REPLACE grant'ları korur.
CREATE OR REPLACE FUNCTION public.send_match_invite(
  p_match_id uuid, p_target_user_id uuid, p_sender_id uuid, p_team_id uuid DEFAULT NULL::uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_match_date TEXT; v_location TEXT; v_sender_name TEXT; v_team_name TEXT;
  v_template RECORD; v_type_key TEXT; v_vars JSONB;
  v_notification_id UUID; v_invite_id UUID;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_sender_id
     AND COALESCE((SELECT role FROM public.profiles WHERE id = auth.uid()), '') NOT IN ('ADMIN','SUPER_ADMIN') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Başka bir kullanıcı adına davet gönderemezsiniz.';
  END IF;

  SELECT date, location INTO v_match_date, v_location FROM public.matches WHERE id = p_match_id;
  SELECT COALESCE(name, 'Bir Oyuncu') INTO v_sender_name FROM public.profiles WHERE id = p_sender_id;

  IF p_team_id IS NOT NULL THEN
    v_type_key := 'team_invite';
    SELECT name INTO v_team_name FROM public.teams WHERE id = p_team_id;
    v_vars := jsonb_build_object('team_name', COALESCE(v_team_name,'Takım'), 'sender_name', v_sender_name,
      'match_date', COALESCE(v_match_date,'Belirtilmedi'), 'pitch_name', COALESCE(v_location,'Saha'));
  ELSE
    v_type_key := 'match_invite';
    v_vars := jsonb_build_object('sender_name', v_sender_name,
      'match_date', COALESCE(v_match_date,'Belirtilmedi'), 'pitch_name', COALESCE(v_location,'Saha'));
  END IF;

  -- CHECK (inviter_id <> invited_id) yüzünden kendine davette satır AÇILMAZ.
  -- Daha önce REDDEDİLEN/SÜRESİ GEÇEN davet yeniden gönderilirse satır PENDING'e
  -- döner; aksi hâlde bildirim, cevaplanamayacak ölü bir id taşırdı.
  IF p_sender_id <> p_target_user_id THEN
    INSERT INTO public.match_list_invites (match_id, inviter_id, invited_id)
    VALUES (p_match_id, p_sender_id, p_target_user_id)
    ON CONFLICT (match_id, invited_id) DO UPDATE
      SET status = 'PENDING', inviter_id = EXCLUDED.inviter_id, responded_at = NULL
      WHERE public.match_list_invites.status IN ('DECLINED','EXPIRED');
    SELECT id INTO v_invite_id FROM public.match_list_invites
    WHERE match_id = p_match_id AND invited_id = p_target_user_id;
  END IF;

  SELECT * INTO v_template FROM public.notification_templates WHERE type_key = v_type_key;

  INSERT INTO public.notifications
    (user_id, title, body, type_key, match_id, team_id, sender_id, action_required, deep_link, is_read, payload)
  VALUES (
    p_target_user_id,
    replace_template_vars(v_template.title_tr, v_vars),
    replace_template_vars(v_template.body_tr, v_vars),
    v_type_key, p_match_id, p_team_id, p_sender_id,
    true, 'oyna://match/' || p_match_id::TEXT, false,
    jsonb_build_object('invite_id', v_invite_id)
  )
  RETURNING id INTO v_notification_id;

  RETURN v_notification_id;
END; $function$;


-- ── 5) respond_match_list_invite v2 ──────────────────────────────
-- DEĞİŞEN: ret artık (a) davet edene match_invite_declined bildirimi yazar,
-- (b) kutudaki davet satırını aksiyonsuz/okundu yapar.
-- NOT: Plandaki "atanmış slotu satın alana geri ver" bloğu YAZILMADI —
-- canlı player_assign_slot arkadaşı doğrudan ASSIGNED yapıyor, artık
-- 'INVITED' + inviteeId yazan hiçbir yol yok (canlıda 0 satır). Ölü kod
-- olurdu ve matches satırını boşuna kilitleyip player_buy_slots ile
-- deadlock yüzeyi açardı. Slot iadesi player_kick_slot'un işi.
CREATE OR REPLACE FUNCTION public.respond_match_list_invite(p_invite_id uuid, p_decline boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE
  v_uid  uuid := auth.uid();
  v_inv  public.match_list_invites%ROWTYPE;
  v_name text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  SELECT * INTO v_inv FROM public.match_list_invites WHERE id = p_invite_id FOR UPDATE;
  IF NOT FOUND OR v_inv.invited_id <> v_uid THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_inv.status <> 'PENDING' THEN RETURN jsonb_build_object('ok', true, 'state', v_inv.status); END IF;
  IF NOT p_decline THEN RETURN jsonb_build_object('ok', true, 'state', 'PENDING'); END IF;

  UPDATE public.match_list_invites
     SET status = 'DECLINED', responded_at = timezone('utc', now())
   WHERE id = v_inv.id;

  -- Kaptan "cevap yok" ile "gelemem"i ayırt edebilsin.
  SELECT coalesce(name::text, full_name, 'Bir oyuncu') INTO v_name FROM public.profiles WHERE id = v_uid;
  PERFORM public._notify_team_event(
    v_inv.inviter_id, 'match_invite_declined', v_uid, NULL,
    jsonb_build_object('sender_name', v_name), false,
    'oyna://match/' || v_inv.match_id::text);

  -- Kutudaki davet satırı artık aksiyon beklemiyor.
  UPDATE public.notifications
     SET action_required = false, action_taken = 'DECLINED', is_read = true
   WHERE user_id = v_uid AND match_id = v_inv.match_id
     AND type_key IN ('match_invite','team_invite');

  RETURN jsonb_build_object('ok', true, 'state', 'DECLINED');
END $function$;
REVOKE EXECUTE ON FUNCTION public.respond_match_list_invite(uuid,boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.respond_match_list_invite(uuid,boolean) TO authenticated;


-- ── 6) broadcast_open_slot — nearby_match'in ÜRETİCİSİ ───────────
-- Mesafe: earthdistance (get_nearby_matches ile aynı desen; PostGIS YOK),
-- bu yüzden search_path'te 'extensions' var.
CREATE OR REPLACE FUNCTION public.broadcast_open_slot(p_match_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp', 'extensions' AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_match  record;
  v_lat    double precision; v_lon double precision;
  v_open   int;
  v_radius int := public._social_config_int('nearby_broadcast_radius_km', 25);
  v_max    int := public._social_config_int('nearby_broadcast_max', 50);
  v_tpl    record; v_sent int := 0; v_row record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  SELECT m.*, pt.latitude AS pt_lat, pt.longitude AS pt_lon INTO v_match
  FROM public.matches m LEFT JOIN public.pitches pt ON pt.id = m.pitch_id
  WHERE m.id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Maç bulunamadı.'; END IF;
  -- Kaptan kimliği iki kolonda tutuluyor (creatorId eski, captain_id yeni).
  IF coalesce(v_match.captain_id, v_match."creatorId") IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'NOT_CAPTAIN: İlanı yalnız maçı kuran verebilir.';
  END IF;
  IF coalesce(v_match.visibility,'OPEN') <> 'OPEN' THEN RAISE EXCEPTION 'NOT_PUBLIC: Özel maça ilan verilemez.'; END IF;
  IF v_match.status NOT IN ('OPEN','ACTIVE') THEN RAISE EXCEPTION 'NOT_OPEN: Maç ilana kapalı.'; END IF;
  IF v_match.starts_at IS NULL OR v_match.starts_at <= now()
     OR v_match.starts_at > now() + interval '24 hours' THEN
    RAISE EXCEPTION 'TOO_EARLY: İlan yalnız maça 24 saatten az kala verilebilir.';
  END IF;

  SELECT count(*) INTO v_open FROM (
    SELECT s FROM jsonb_array_elements(coalesce(v_match.slots,'[]'::jsonb)) s
    UNION ALL
    SELECT s FROM jsonb_array_elements(coalesce(v_match."awaySlots",'[]'::jsonb)) s
  ) q WHERE coalesce(q.s->>'status','OPEN') = 'OPEN';
  IF v_open = 0 THEN RAISE EXCEPTION 'NO_OPEN_SLOT: Kadroda boş yer yok.'; END IF;

  IF EXISTS (SELECT 1 FROM public.notifications
             WHERE match_id = p_match_id AND type_key = 'nearby_match'
               AND created_at > now() - interval '2 hours') THEN
    RAISE EXCEPTION 'TOO_SOON: Bu maç için ilanı 2 saatte bir verebilirsin.';
  END IF;

  v_lat := v_match.pt_lat; v_lon := v_match.pt_lon;
  IF v_lat IS NULL OR v_lon IS NULL THEN RAISE EXCEPTION 'NO_LOCATION: Sahanın konumu yok.'; END IF;

  SELECT * INTO v_tpl FROM public.notification_templates WHERE type_key = 'nearby_match';

  FOR v_row IN
    SELECT p.id AS uid,
           round((earth_distance(ll_to_earth(v_lat, v_lon),
                  ll_to_earth((p.last_location->>'lat')::double precision,
                              (p.last_location->>'lng')::double precision)) / 1000.0)::numeric, 1) AS km
    FROM public.profiles p
    WHERE p.id <> v_uid
      AND coalesce(p.is_banned, false) = false
      AND p.last_location ? 'lat' AND p.last_location ? 'lng'
      AND coalesce(p.notification_preferences->'nearby_match'->>'enabled','false') = 'true'
      AND earth_distance(ll_to_earth(v_lat, v_lon),
            ll_to_earth((p.last_location->>'lat')::double precision,
                        (p.last_location->>'lng')::double precision)) <= v_radius * 1000.0
      AND NOT public._is_blocked_between(v_uid, p.id)
      AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(
              coalesce(v_match.slots,'[]'::jsonb) || coalesce(v_match."awaySlots",'[]'::jsonb)) s
            WHERE s->>'occupant' = p.id::text OR s->'player'->>'id' = p.id::text)
      AND NOT EXISTS (SELECT 1 FROM public.match_list_invites mli
            WHERE mli.match_id = p_match_id AND mli.invited_id = p.id)
      AND NOT EXISTS (SELECT 1 FROM public.notifications n
            WHERE n.user_id = p.id AND n.type_key = 'nearby_match'
              AND n.created_at > now() - interval '24 hours')
    ORDER BY 2 ASC
    LIMIT v_max
  LOOP
    INSERT INTO public.notifications
      (user_id, title, body, type_key, match_id, sender_id, deep_link, is_read)
    VALUES (v_row.uid,
      coalesce(v_tpl.title_tr, '📍 Yakında Maç!'),
      replace_template_vars(
        coalesce(v_tpl.body_tr, '{{distance}} km yakınında açık bir maç var. Hemen katıl!'),
        jsonb_build_object('distance', v_row.km::text)),
      'nearby_match', p_match_id, v_uid,
      'oyna://match/' || p_match_id::text, false);
    v_sent := v_sent + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'sent', v_sent);
END $function$;
REVOKE EXECUTE ON FUNCTION public.broadcast_open_slot(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.broadcast_open_slot(uuid) TO authenticated;


-- ── 7) nearby_match tercihi ──────────────────────────────────────
-- Yeni kullanıcılar için kolon varsayılanı (notifications/schema_additions.sql
-- ile birebir aynı, YALNIZ nearby_match true).
ALTER TABLE public.profiles ALTER COLUMN notification_preferences SET DEFAULT '{
  "match_joined":       { "enabled": true,  "mandatory": true  },
  "match_cancelled":    { "enabled": true,  "mandatory": true  },
  "match_invite":       { "enabled": true,  "mandatory": true  },
  "team_invite":        { "enabled": true,  "mandatory": true  },
  "gk_accepted":        { "enabled": true,  "mandatory": true  },
  "gk_rejected":        { "enabled": true,  "mandatory": true  },
  "ref_accepted":       { "enabled": true,  "mandatory": true  },
  "ref_rejected":       { "enabled": true,  "mandatory": true  },
  "match_reminder_1h":  { "enabled": true,  "mandatory": false },
  "match_reminder_24h": { "enabled": true,  "mandatory": false },
  "nearby_match":       { "enabled": true,  "mandatory": false },
  "promo_offers":       { "enabled": false, "mandatory": false },
  "weekly_summary":     { "enabled": true,  "mandatory": false }
}'::jsonb;

-- Mevcut satırlar: bugünkü false değeri KULLANICI SEÇİMİ DEĞİL, kolon
-- varsayılanından geldi (schema_additions.sql). Bu yüzden geri doldurulur.
-- Kullanıcı isterse Ayarlar → Bildirimler → "Keşif Bildirimleri"nden kapatır.
UPDATE public.profiles
   SET notification_preferences = jsonb_set(
        coalesce(notification_preferences, '{}'::jsonb),
        '{nearby_match}', '{"enabled": true, "mandatory": false}'::jsonb, true)
 WHERE coalesce(notification_preferences->'nearby_match'->>'enabled','false') = 'false';
