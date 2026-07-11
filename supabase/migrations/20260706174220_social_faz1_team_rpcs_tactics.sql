-- ================================================================
-- SOSYAL AŞAMA 1.12 — Takım okuma/yazma RPC'leri + taktik yaşam döngüsü
-- (Spec §6: get_my_teams · get_team_squad · list_public_teams ·
--  get_team_public_profile · create_team · update_team_settings_v2 ·
--  save_team_tactic · approve/reject_tactic · share_token)
-- Sapma notları:
--  · tactics TEXT→jsonb dönüşümü AŞAMA 2'de (eski istemci JSON.parse
--    ile okuyor; şimdi çevirmek canlı Stüdyo'yu kırar). RPC'ler metin yazar.
--  · update_team_settings imza çakışmasın diye v2 (jsonb patch) eklendi.
--  · draws sayacının skor-kesinleştirmeye bağlanması Küme 2'de.
-- ================================================================

-- ── 1) Bildirim şablonları (taktik olayları) ──
INSERT INTO public.notification_templates (type_key, label_tr, title_tr, body_tr, category, is_mandatory, can_user_disable, sort_order)
SELECT * FROM (VALUES
  ('tactic_proposed','Taktik önerisi','Yeni taktik önerisi 📋','{sender_name}, {team_name} için "{tactic_name}" taktiğini önerdi.','SOCIAL',false,true,40),
  ('tactic_approved','Taktik onayı','Taktiğin onaylandı ✅','"{tactic_name}" artık {team_name} oyun defterinde.','SOCIAL',false,true,41),
  ('tactic_rejected','Taktik yanıtı','Taktik önerisi hakkında','"{tactic_name}" bu kez kabul edilmedi; kişisel kütüphanene kopyalandı.','SOCIAL',false,true,42)
) AS v(type_key,label_tr,title_tr,body_tr,category,is_mandatory,can_user_disable,sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.notification_templates t WHERE t.type_key = v.type_key);

-- ── 2) tactics: paylaşım linki + RLS yeniden yazımı ──
ALTER TABLE public.tactics ADD COLUMN IF NOT EXISTS share_token uuid;
CREATE UNIQUE INDEX IF NOT EXISTS tactics_share_token_uidx
  ON public.tactics (share_token) WHERE share_token IS NOT NULL;

-- INSERT: yabancı takıma taktik ekleme açığı kapanır (M85)
DROP POLICY IF EXISTS tactics_insert ON public.tactics;
CREATE POLICY tactics_insert ON public.tactics
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = "userId"
    AND ("teamId" IS NULL OR public._is_team_member("teamId", (SELECT auth.uid())))
  );

-- UPDATE (M86): PENDING = yalnız yazar; APPROVED takım taktiği = yazar + yöneticiler
DROP POLICY IF EXISTS tactics_update ON public.tactics;
CREATE POLICY tactics_update ON public.tactics
  FOR UPDATE TO authenticated
  USING (
    (SELECT auth.uid()) = "userId"
    OR (status = 'APPROVED' AND "teamId" IS NOT NULL
        AND public._is_team_admin("teamId", (SELECT auth.uid())))
  )
  WITH CHECK (
    (SELECT auth.uid()) = "userId"
    OR (status = 'APPROVED' AND "teamId" IS NOT NULL
        AND public._is_team_admin("teamId", (SELECT auth.uid())))
  );

-- ── 3) Taktik yaşam döngüsü RPC'leri (tek makine — M88) ──
CREATE OR REPLACE FUNCTION public.save_team_tactic(
  p_team_id uuid, p_tactic_id uuid, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = 'public','pg_temp' AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_status   text;
  v_id       uuid;
  v_name     text := coalesce(p_payload->>'name', 'Taktik');
  v_my_name  text;
  v_team     record;
  v_admin    uuid;
  v_existing record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  IF p_team_id IS NOT NULL THEN
    IF NOT public._is_team_member(p_team_id, v_uid) THEN
      RAISE EXCEPTION 'NOT_MEMBER: Bu takımın üyesi değilsin.';
    END IF;
    -- Status SUNUCUDA belirlenir (M85): yönetici → APPROVED, üye → öneri
    v_status := CASE WHEN public._is_team_admin(p_team_id, v_uid)
                     THEN 'APPROVED' ELSE 'PENDING_APPROVAL' END;
  ELSE
    v_status := 'APPROVED'; -- kişisel kütüphane
  END IF;

  IF p_tactic_id IS NOT NULL THEN
    SELECT id, "userId", status INTO v_existing FROM public.tactics WHERE id = p_tactic_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Taktik bulunamadı.'; END IF;
    -- Düzenleme hakkı (M86): PENDING=yazar; APPROVED=yazar+yönetici
    IF NOT (v_existing."userId" = v_uid
            OR (v_existing.status = 'APPROVED' AND p_team_id IS NOT NULL
                AND public._is_team_admin(p_team_id, v_uid))) THEN
      RAISE EXCEPTION 'UNAUTHORIZED: Bu taktiği düzenleme yetkin yok.';
    END IF;
    UPDATE public.tactics SET
      name        = v_name,
      "teamId"    = p_team_id,
      "teamName"  = (SELECT name FROM public.teams WHERE id = p_team_id),
      size        = coalesce(p_payload->>'size', size),
      formation   = coalesce(p_payload->>'formation', formation),
      slots       = coalesce(p_payload->'slots', 'null'::jsonb)::text,
      subs        = coalesce(p_payload->'subs', '[]'::jsonb)::text,
      opponents   = coalesce(p_payload->'opponents', '[]'::jsonb)::text,
      drawings    = coalesce(p_payload->'drawings', '[]'::jsonb)::text,
      "captainId" = p_payload->>'captainId',
      notes       = coalesce(p_payload->>'notes', notes),
      mentality   = coalesce(p_payload->>'mentality', mentality),
      tempo       = coalesce(p_payload->>'tempo', tempo),
      identity    = coalesce(p_payload->>'identity', identity),
      status      = CASE WHEN "teamId" IS NOT DISTINCT FROM p_team_id
                         THEN status ELSE v_status END,
      "updatedAt" = timezone('utc', now())
    WHERE id = p_tactic_id
    RETURNING id, status INTO v_id, v_status;
  ELSE
    INSERT INTO public.tactics
      ("userId", mode, name, "teamId", "teamName", size, formation,
       slots, subs, opponents, drawings, "captainId", notes,
       mentality, tempo, identity, status, "proposedBy")
    VALUES
      (v_uid, 'FARAZI', v_name, p_team_id,
       (SELECT name FROM public.teams WHERE id = p_team_id),
       p_payload->>'size', p_payload->>'formation',
       coalesce(p_payload->'slots', 'null'::jsonb)::text,
       coalesce(p_payload->'subs', '[]'::jsonb)::text,
       coalesce(p_payload->'opponents', '[]'::jsonb)::text,
       coalesce(p_payload->'drawings', '[]'::jsonb)::text,
       p_payload->>'captainId', p_payload->>'notes',
       p_payload->>'mentality', p_payload->>'tempo', p_payload->>'identity',
       v_status,
       CASE WHEN v_status = 'PENDING_APPROVAL' THEN v_uid ELSE NULL END)
    RETURNING id INTO v_id;
  END IF;

  -- Öneri ise yöneticilere bildirim (tactic_proposed)
  IF v_status = 'PENDING_APPROVAL' AND p_team_id IS NOT NULL THEN
    SELECT name INTO v_team FROM public.teams WHERE id = p_team_id;
    SELECT coalesce(full_name, name::text, 'Bir oyuncu') INTO v_my_name
    FROM public.profiles WHERE id = v_uid;
    FOR v_admin IN
      SELECT tm.user_id FROM public.team_members tm
      WHERE tm.team_id = p_team_id AND tm.is_active = true
        AND tm.role IN ('CAPTAIN','ADMIN')
    LOOP
      PERFORM public._notify_team_event(
        v_admin, 'tactic_proposed', v_uid, p_team_id,
        jsonb_build_object('sender_name', v_my_name, 'team_name', v_team.name, 'tactic_name', v_name),
        true, 'oyna://tactic/' || v_id::text);
    END LOOP;
  END IF;

  RETURN jsonb_build_object('ok', true, 'tactic_id', v_id, 'status', v_status);
END $$;
REVOKE EXECUTE ON FUNCTION public.save_team_tactic(uuid,uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_team_tactic(uuid,uuid,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.approve_tactic(p_tactic_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = 'public','pg_temp' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_t   record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT id, "userId", "teamId", name, status INTO v_t
  FROM public.tactics WHERE id = p_tactic_id FOR UPDATE;
  IF NOT FOUND OR v_t."teamId" IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF NOT public._is_team_admin(v_t."teamId", v_uid) THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF v_t.status <> 'PENDING_APPROVAL' THEN RAISE EXCEPTION 'NOT_PENDING'; END IF;
  UPDATE public.tactics SET status = 'APPROVED', "updatedAt" = timezone('utc', now())
  WHERE id = p_tactic_id;
  PERFORM public._notify_team_event(
    v_t."userId", 'tactic_approved', v_uid, v_t."teamId",
    jsonb_build_object('tactic_name', v_t.name,
      'team_name', (SELECT name FROM public.teams WHERE id = v_t."teamId")),
    false, 'oyna://tactic/' || p_tactic_id::text);
  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE EXECUTE ON FUNCTION public.approve_tactic(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_tactic(uuid) TO authenticated;

-- Ret NAZİKTİR: yazarın emeği kişisel kütüphaneye kopyalanır (M88)
CREATE OR REPLACE FUNCTION public.reject_tactic(p_tactic_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = 'public','pg_temp' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_t   public.tactics%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT * INTO v_t FROM public.tactics WHERE id = p_tactic_id FOR UPDATE;
  IF NOT FOUND OR v_t."teamId" IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF NOT public._is_team_admin(v_t."teamId", v_uid) THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF v_t.status <> 'PENDING_APPROVAL' THEN RAISE EXCEPTION 'NOT_PENDING'; END IF;

  UPDATE public.tactics SET status = 'REJECTED', "updatedAt" = timezone('utc', now())
  WHERE id = p_tactic_id;

  INSERT INTO public.tactics
    ("userId", mode, name, "teamId", "teamName", size, formation,
     slots, subs, opponents, drawings, "captainId", notes,
     mentality, tempo, identity, status)
  VALUES
    (v_t."userId", 'FARAZI', v_t.name || ' (kişisel)', NULL, NULL,
     v_t.size, v_t.formation, v_t.slots, v_t.subs, v_t.opponents,
     v_t.drawings, v_t."captainId", v_t.notes,
     v_t.mentality, v_t.tempo, v_t.identity, 'APPROVED');

  PERFORM public._notify_team_event(
    v_t."userId", 'tactic_rejected', NULL, v_t."teamId",
    jsonb_build_object('tactic_name', v_t.name), false, NULL);
  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE EXECUTE ON FUNCTION public.reject_tactic(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_tactic(uuid) TO authenticated;

-- Paylaşım linki (N92): yazar açar/kapar; token'la salt-okunur erişim
CREATE OR REPLACE FUNCTION public.set_tactic_share_link(p_tactic_id uuid, p_enabled boolean)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = 'public','pg_temp' AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_token uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tactics WHERE id = p_tactic_id AND "userId" = v_uid) THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  IF p_enabled THEN
    v_token := gen_random_uuid();
    UPDATE public.tactics SET share_token = v_token WHERE id = p_tactic_id;
    RETURN jsonb_build_object('ok', true, 'share_token', v_token);
  ELSE
    UPDATE public.tactics SET share_token = NULL WHERE id = p_tactic_id;
    RETURN jsonb_build_object('ok', true, 'share_token', NULL);
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.set_tactic_share_link(uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_tactic_share_link(uuid,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_tactic_by_share_token(p_token uuid)
RETURNS TABLE (
  id uuid, name text, size text, formation text,
  slots text, subs text, opponents text, drawings text,
  mentality text, tempo text, identity text, notes text,
  team_name text, author_name text
) LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = 'public','pg_temp' AS $$
  SELECT t.id, t.name, t.size, t.formation,
         t.slots, t.subs, t.opponents, t.drawings,
         t.mentality, t.tempo, t.identity, t.notes,
         t."teamName",
         coalesce(p.full_name, p.name::text, 'Oyuncu')
  FROM public.tactics t
  JOIN public.profiles p ON p.id = t."userId"
  WHERE t.share_token = p_token;
$$;
REVOKE EXECUTE ON FUNCTION public.get_tactic_by_share_token(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_tactic_by_share_token(uuid) TO authenticated;

-- ── 4) Takım okuma RPC'leri ──

-- Takımlarım — tek atış (G40 iyileştirmesi: N+1 ölür)
CREATE OR REPLACE FUNCTION public.get_my_teams()
RETURNS TABLE (
  team_id       uuid,
  name          text,
  short_name    text,
  crest_config  jsonb,
  color1        text,
  color2        text,
  format        text,
  city          text,
  visibility    text,
  is_recruiting boolean,
  is_archived   boolean,
  my_role       text,
  my_sort_order integer,
  member_count  integer,
  wins          integer,
  draws         integer,
  losses        integer,
  next_match_id uuid,
  next_match_date text,
  next_match_time text,
  next_match_location text,
  pending_invites integer
) LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = 'public','pg_temp' AS $$
  SELECT
    t.id, t.name, t."shortName", t.crest_config, t.color1, t.color2,
    t.format, t.city, t.visibility, t.is_recruiting, t.is_archived,
    tm.role, tm.sort_order,
    (SELECT count(*)::int FROM public.team_members x
     WHERE x.team_id = t.id AND x.is_active = true),
    coalesce(t.wins, 0), coalesce(t.draws, 0), coalesce(t.losses, 0),
    nm.id, nm.date, nm."time", nm.location,
    (SELECT count(*)::int FROM public.team_invites ti
     WHERE ti.team_id = t.id AND ti.status = 'PENDING')
  FROM public.team_members tm
  JOIN public.teams t ON t.id = tm.team_id
  LEFT JOIN LATERAL (
    SELECT m.id, m.date, m."time", m.location
    FROM public.matches m
    WHERE (m."homeTeamId" = t.id OR m."awayTeamId" = t.id)
      AND upper(coalesce(m.status, '')) IN ('PENDING','OPEN','CONFIRMED')
    ORDER BY m.date NULLS LAST, m."time" NULLS LAST
    LIMIT 1
  ) nm ON true
  WHERE tm.user_id = auth.uid() AND tm.is_active = true
    AND t.is_demo = false
$$;
REVOKE EXECUTE ON FUNCTION public.get_my_teams() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_teams() TO authenticated;

-- Canlı kadro (M81 — Stüdyo dahil her tüketici için)
CREATE OR REPLACE FUNCTION public.get_team_squad(p_team_id uuid)
RETURNS TABLE (
  user_id       uuid,
  full_name     text,
  avatar_url    text,
  oyna_id       text,
  role          text,
  jersey_number integer,
  pos           text,
  fp            numeric,
  joined_at     timestamptz
) LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = 'public','pg_temp' AS $$
  SELECT
    p.id,
    coalesce(p.full_name, p.name::text, 'Oyuncu'),
    p.avatar_url,
    p.oyna_id,
    tm.role,
    tm.jersey_number,
    coalesce(tm.position, p.player_card->>'position'),
    nullif(p.player_card->>'fp', '')::numeric,
    tm.joined_at
  FROM public.team_members tm
  JOIN public.profiles p ON p.id = tm.user_id
  WHERE tm.team_id = p_team_id AND tm.is_active = true
    AND public._is_team_member(p_team_id, auth.uid())
  ORDER BY CASE tm.role WHEN 'CAPTAIN' THEN 0 WHEN 'ADMIN' THEN 1 ELSE 2 END,
           tm.jersey_number NULLS LAST, p.full_name
$$;
REVOKE EXECUTE ON FUNCTION public.get_team_squad(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_team_squad(uuid) TO authenticated;

-- Tüm Takımlar dizini (I50-52): şehir-öncelikli, aranabilir, sayfalı
CREATE OR REPLACE FUNCTION public.list_public_teams(
  p_q text DEFAULT NULL, p_city text DEFAULT NULL, p_format text DEFAULT NULL,
  p_recruiting_only boolean DEFAULT false,
  p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
RETURNS TABLE (
  team_id       uuid,
  name          text,
  crest_config  jsonb,
  color1        text,
  color2        text,
  format        text,
  city          text,
  is_recruiting boolean,
  member_count  integer,
  roster_max    integer,
  wins          integer,
  draws         integer,
  losses        integer,
  my_state      text   -- NONE | MEMBER | REQUEST_PENDING
) LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = 'public','pg_temp' AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_norm  text := public.normalize_tr(coalesce(p_q, ''));
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  RETURN QUERY
  SELECT
    t.id, t.name, t.crest_config, t.color1, t.color2,
    t.format, t.city, t.is_recruiting,
    (SELECT count(*)::int FROM public.team_members x
     WHERE x.team_id = t.id AND x.is_active = true),
    public._social_config_int('team_roster_max', 20),
    coalesce(t.wins, 0), coalesce(t.draws, 0), coalesce(t.losses, 0),
    CASE
      WHEN public._is_team_member(t.id, v_uid) THEN 'MEMBER'
      WHEN EXISTS (SELECT 1 FROM public.team_join_requests r
                   WHERE r.team_id = t.id AND r.user_id = v_uid
                     AND r.status = 'PENDING') THEN 'REQUEST_PENDING'
      ELSE 'NONE' END
  FROM public.teams t
  WHERE t.visibility = 'PUBLIC'
    AND t.is_archived = false AND t.is_demo = false
    AND (p_city IS NULL OR public.normalize_tr(t.city) = public.normalize_tr(p_city))
    AND (p_format IS NULL OR t.format = p_format)
    AND (NOT p_recruiting_only OR t.is_recruiting = true)
    AND (length(v_norm) < 2 OR public.normalize_tr(t.name) LIKE '%' || v_norm || '%')
  ORDER BY t.created_at DESC
  LIMIT v_limit OFFSET greatest(coalesce(p_offset, 0), 0);
END $$;
REVOKE EXECUTE ON FUNCTION public.list_public_teams(text,text,text,boolean,integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_public_teams(text,text,text,boolean,integer,integer) TO authenticated;

-- Vitrin (I56 + L77 H2H): üye olmayan görünümü; taktik/kadro sızdırmaz
CREATE OR REPLACE FUNCTION public.get_team_public_profile(p_team_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = 'public','pg_temp' AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_team record;
  v_h2h  jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT * INTO v_team FROM public.teams
  WHERE id = p_team_id AND is_archived = false AND is_demo = false
    AND (visibility = 'PUBLIC' OR public._is_team_member(id, v_uid));
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Takım bulunamadı.'; END IF;

  -- H2H: benim takımlarımla bu takım arasındaki tamamlanmış maçlar
  SELECT jsonb_build_object(
    'played', count(*),
    'wins',   count(*) FILTER (WHERE
      (m."homeTeamId" = p_team_id AND m."awayScore" > m."homeScore") OR
      (m."awayTeamId" = p_team_id AND m."homeScore" > m."awayScore")),
    'draws',  count(*) FILTER (WHERE m."homeScore" = m."awayScore"))
  INTO v_h2h
  FROM public.matches m
  WHERE upper(coalesce(m.status, '')) IN ('COMPLETED','FINISHED','SCORED')
    AND m."homeScore" IS NOT NULL AND m."awayScore" IS NOT NULL
    AND ((m."homeTeamId" = p_team_id AND m."awayTeamId" IN (
            SELECT team_id FROM public.team_members
            WHERE user_id = v_uid AND is_active = true))
      OR (m."awayTeamId" = p_team_id AND m."homeTeamId" IN (
            SELECT team_id FROM public.team_members
            WHERE user_id = v_uid AND is_active = true)));

  RETURN jsonb_build_object(
    'team_id', v_team.id,
    'name', v_team.name,
    'short_name', v_team."shortName",
    'crest_config', v_team.crest_config,
    'color1', v_team.color1, 'color2', v_team.color2,
    'format', v_team.format, 'city', v_team.city,
    'play_style', v_team."playStyle",
    'is_recruiting', v_team.is_recruiting,
    'wins', coalesce(v_team.wins, 0),
    'draws', coalesce(v_team.draws, 0),
    'losses', coalesce(v_team.losses, 0),
    'member_count', (SELECT count(*) FROM public.team_members x
                     WHERE x.team_id = v_team.id AND x.is_active = true),
    'roster_max', public._social_config_int('team_roster_max', 20),
    'captain_name', (SELECT coalesce(p.full_name, p.name::text)
                     FROM public.team_members tm JOIN public.profiles p ON p.id = tm.user_id
                     WHERE tm.team_id = v_team.id AND tm.role = 'CAPTAIN'
                       AND tm.is_active = true LIMIT 1),
    'is_member', public._is_team_member(v_team.id, v_uid),
    'my_request_pending', EXISTS (SELECT 1 FROM public.team_join_requests r
        WHERE r.team_id = v_team.id AND r.user_id = v_uid AND r.status = 'PENDING'),
    'h2h', v_h2h);
END $$;
REVOKE EXECUTE ON FUNCTION public.get_team_public_profile(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_team_public_profile(uuid) TO authenticated;

-- ── 5) Takım oluşturma — tek transaction (J62) ──
CREATE OR REPLACE FUNCTION public.create_team(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = 'public','pg_temp' AS $$
DECLARE
  v_uid           uuid := auth.uid();
  v_captaincy_max int := public._social_config_int('team_captaincy_max', 3);
  v_membership_max int := public._social_config_int('team_membership_max', 5);
  v_team_id       uuid;
  v_name          text := trim(coalesce(p_payload->>'name', ''));
  v_format        text := coalesce(p_payload->>'format', '7v7');
  v_invited       uuid;
  v_sent          int := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF length(v_name) < 2 THEN RAISE EXCEPTION 'INVALID_NAME: Takım adı en az 2 karakter.'; END IF;
  IF (SELECT count(*) FROM public.team_members
      WHERE user_id = v_uid AND is_active = true AND role = 'CAPTAIN') >= v_captaincy_max THEN
    RAISE EXCEPTION 'CAPTAINCY_LIMIT: En fazla % takımda kaptan olabilirsin.', v_captaincy_max;
  END IF;
  IF (SELECT count(*) FROM public.team_members
      WHERE user_id = v_uid AND is_active = true) >= v_membership_max THEN
    RAISE EXCEPTION 'MEMBERSHIP_LIMIT: En fazla % takımda yer alabilirsin.', v_membership_max;
  END IF;

  INSERT INTO public.teams
    (name, "shortName", color1, color2, crest_config, format, visibility,
     is_recruiting, city, "playStyle", formation,
     captain_id, captain, captains, wins, losses, draws)
  VALUES
    (v_name,
     upper(left(coalesce(nullif(trim(p_payload->>'short_name'), ''), v_name), 4)),
     coalesce(p_payload->>'color1', '#39FF14'),
     coalesce(p_payload->>'color2', '#0A0E14'),
     coalesce(p_payload->'crest_config',
       jsonb_build_object('type','GENERATED','shape','shield','pattern','solid','symbol','star')),
     v_format,
     CASE WHEN coalesce(p_payload->>'visibility','PUBLIC') = 'PRIVATE'
          THEN 'PRIVATE' ELSE 'PUBLIC' END,
     coalesce((p_payload->>'is_recruiting')::boolean, true),
     nullif(trim(p_payload->>'city'), ''),
     nullif(trim(p_payload->>'play_style'), ''),
     jsonb_build_object('name', v_format, 'players', '[]'::jsonb),
     v_uid, v_uid, to_jsonb(ARRAY[v_uid::text]), 0, 0, 0)
  RETURNING id INTO v_team_id;

  INSERT INTO public.team_members (team_id, user_id, is_active, role, joined_at)
  VALUES (v_team_id, v_uid, true, 'CAPTAIN', timezone('utc', now()));

  -- Kurucu kadro: GERÇEK davetler (hayalet roster ölür — J62)
  FOR v_invited IN
    SELECT (x #>> '{}')::uuid
    FROM jsonb_array_elements(coalesce(p_payload->'invite_user_ids', '[]'::jsonb)) x
    LIMIT 20
  LOOP
    BEGIN
      PERFORM public.invite_to_team(v_team_id, v_invited);
      v_sent := v_sent + 1;
    EXCEPTION WHEN OTHERS THEN
      NULL; -- engelli/yasaklı/çift davet: kuruluşu durdurmaz, sessiz atlanır
    END;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'team_id', v_team_id, 'invites_sent', v_sent);
END $$;
REVOKE EXECUTE ON FUNCTION public.create_team(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_team(jsonb) TO authenticated;

-- ── 6) Ayarlar v2 — jsonb patch (eski update_team_settings yaşar) ──
CREATE OR REPLACE FUNCTION public.update_team_settings_v2(p_team_id uuid, p_patch jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = 'public','pg_temp' AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF NOT public._is_team_admin(p_team_id, v_uid) THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  UPDATE public.teams SET
    name          = coalesce(nullif(trim(p_patch->>'name'), ''), name),
    "shortName"   = coalesce(nullif(trim(p_patch->>'short_name'), ''), "shortName"),
    color1        = coalesce(p_patch->>'color1', color1),
    color2        = coalesce(p_patch->>'color2', color2),
    crest_config  = coalesce(p_patch->'crest_config', crest_config),
    format        = coalesce(p_patch->>'format', format),
    city          = coalesce(nullif(trim(p_patch->>'city'), ''), city),
    visibility    = CASE WHEN p_patch->>'visibility' IN ('PUBLIC','PRIVATE')
                         THEN p_patch->>'visibility' ELSE visibility END,
    is_recruiting = coalesce((p_patch->>'is_recruiting')::boolean, is_recruiting),
    "playStyle"   = coalesce(p_patch->>'play_style', "playStyle"),
    home_pitch_id = coalesce((p_patch->>'home_pitch_id')::uuid, home_pitch_id)
  WHERE id = p_team_id;
  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE EXECUTE ON FUNCTION public.update_team_settings_v2(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_team_settings_v2(uuid,jsonb) TO authenticated;
