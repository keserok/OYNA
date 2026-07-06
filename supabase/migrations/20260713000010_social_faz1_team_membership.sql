-- ================================================================
-- SOSYAL AŞAMA 1.9 — Takım üyelik makinesi (Spec §6 / I-K bölümleri)
-- Katılma istekleri · davetler (kişi + link) · rol yönetimi · ayrılma/
-- dağıtma. Tüm iş kuralları SUNUCUDA; eski kaptan kolonlarına geçiş
-- boyunca ÇİFT-YAZIM yapılır (captain_id/captain/captains ↔ role).
-- ================================================================

-- ── 1) Tablolar ──
CREATE TABLE IF NOT EXISTS public.team_join_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id      uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message      text CHECK (message IS NULL OR char_length(message) <= 200),
  status       text NOT NULL DEFAULT 'PENDING'
               CHECK (status IN ('PENDING','APPROVED','REJECTED','CANCELLED')),
  created_at   timestamptz NOT NULL DEFAULT timezone('utc', now()),
  responded_at timestamptz,
  responded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS team_join_requests_pending_uidx
  ON public.team_join_requests (team_id, user_id) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS team_join_requests_team_status_idx
  ON public.team_join_requests (team_id, status);
CREATE INDEX IF NOT EXISTS team_join_requests_user_idx
  ON public.team_join_requests (user_id, status);

ALTER TABLE public.team_join_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tjr_select ON public.team_join_requests;
CREATE POLICY tjr_select ON public.team_join_requests
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid())
      OR public._is_team_admin(team_id, (SELECT auth.uid())));
-- Yazım yalnız RPC.

CREATE TABLE IF NOT EXISTS public.team_invites (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id      uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  inviter_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  invited_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status       text NOT NULL DEFAULT 'PENDING'
               CHECK (status IN ('PENDING','ACCEPTED','DECLINED','CANCELLED','EXPIRED')),
  created_at   timestamptz NOT NULL DEFAULT timezone('utc', now()),
  responded_at timestamptz,
  CHECK (inviter_id <> invited_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS team_invites_pending_uidx
  ON public.team_invites (team_id, invited_id) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS team_invites_invited_idx
  ON public.team_invites (invited_id, status);
CREATE INDEX IF NOT EXISTS team_invites_team_idx
  ON public.team_invites (team_id, status);

ALTER TABLE public.team_invites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ti_select ON public.team_invites;
CREATE POLICY ti_select ON public.team_invites
  FOR SELECT TO authenticated
  USING (invited_id = (SELECT auth.uid())
      OR inviter_id = (SELECT auth.uid())
      OR public._is_team_admin(team_id, (SELECT auth.uid())));
-- Yazım yalnız RPC.

-- ── 2) Bildirim şablonları ──
INSERT INTO public.notification_templates (type_key, label_tr, title_tr, body_tr, category, is_mandatory, can_user_disable, sort_order)
SELECT * FROM (VALUES
  ('team_member_invite','Takım daveti','Takım daveti ⚽','{sender_name} seni {team_name} kadrosuna davet etti.','SOCIAL',false,true,20),
  ('team_invite_accepted','Davet kabulü','Davetin kabul edildi ✅','{sender_name}, {team_name} kadrosuna katıldı.','SOCIAL',false,true,21),
  ('team_join_request','Katılma isteği','Katılma isteği 📨','{sender_name}, {team_name} takımına katılmak istiyor.','SOCIAL',false,true,22),
  ('team_join_approved','Katılım onayı','Kadroya hoş geldin! 🎉','{team_name} katılma isteğini onayladı.','SOCIAL',false,true,23),
  ('team_join_rejected','Katılım yanıtı','Kadro şu an uygun değil','{team_name} kadrosunda şu an yer yok. Başka takımlara göz atabilirsin.','SOCIAL',false,true,24),
  ('team_member_removed','Kadro değişikliği','Kadro değişikliği','{team_name} kadrosundan çıkarıldın.','SOCIAL',false,true,25),
  ('team_captain_transferred','Kaptanlık devri','Artık kaptansın 🧢','{team_name} kaptanlığı sana devredildi.','SOCIAL',false,true,26)
) AS v(type_key,label_tr,title_tr,body_tr,category,is_mandatory,can_user_disable,sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.notification_templates t WHERE t.type_key = v.type_key);

-- ── 3) İç yardımcılar ──
CREATE OR REPLACE FUNCTION public._notify_team_event(
  p_user uuid, p_type_key text, p_sender uuid, p_team uuid,
  p_vars jsonb, p_action boolean, p_deep_link text)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = 'public','pg_temp' AS $$
DECLARE v_tpl record; v_title text; v_body text; v_k text; v_v text;
BEGIN
  SELECT * INTO v_tpl FROM public.notification_templates WHERE type_key = p_type_key;
  v_title := coalesce(v_tpl.title_tr, p_type_key);
  v_body  := coalesce(v_tpl.body_tr, '');
  FOR v_k, v_v IN SELECT key, value #>> '{}' FROM jsonb_each(coalesce(p_vars, '{}'::jsonb)) LOOP
    v_title := replace(v_title, '{' || v_k || '}', coalesce(v_v, ''));
    v_body  := replace(v_body,  '{' || v_k || '}', coalesce(v_v, ''));
  END LOOP;
  INSERT INTO public.notifications (user_id, title, body, type_key, sender_id, team_id, action_required, deep_link, is_read)
  VALUES (p_user, v_title, v_body, p_type_key, p_sender, p_team, coalesce(p_action, false), p_deep_link, false);
END $$;
REVOKE EXECUTE ON FUNCTION public._notify_team_event(uuid,text,uuid,uuid,jsonb,boolean,text) FROM PUBLIC, anon, authenticated;

-- Üyelik ekleme (tavanlar + yeniden-aktifleştirme tek yerde)
CREATE OR REPLACE FUNCTION public._team_add_member(p_team_id uuid, p_user uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = 'public','pg_temp' AS $$
DECLARE
  v_roster_max     int := public._social_config_int('team_roster_max', 20);
  v_membership_max int := public._social_config_int('team_membership_max', 5);
BEGIN
  IF (SELECT count(*) FROM public.team_members WHERE team_id = p_team_id AND is_active = true) >= v_roster_max THEN
    RAISE EXCEPTION 'ROSTER_FULL: Kadro dolu (en fazla % oyuncu).', v_roster_max;
  END IF;
  IF (SELECT count(*) FROM public.team_members WHERE user_id = p_user AND is_active = true) >= v_membership_max THEN
    RAISE EXCEPTION 'MEMBERSHIP_LIMIT: En fazla % takımda yer alabilirsin.', v_membership_max;
  END IF;
  INSERT INTO public.team_members (team_id, user_id, is_active, role, joined_at)
  VALUES (p_team_id, p_user, true, 'MEMBER', timezone('utc', now()))
  ON CONFLICT (team_id, user_id) DO UPDATE
    SET is_active = true,
        role = CASE WHEN public.team_members.role = 'CAPTAIN' THEN 'CAPTAIN' ELSE 'MEMBER' END,
        joined_at = timezone('utc', now());
END $$;
REVOKE EXECUTE ON FUNCTION public._team_add_member(uuid,uuid) FROM PUBLIC, anon, authenticated;

-- Birincil kaptanı bul (bildirim/engel kontrolleri için)
CREATE OR REPLACE FUNCTION public._team_captain(p_team_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = 'public','pg_temp' AS $$
  SELECT coalesce(
    (SELECT tm.user_id FROM public.team_members tm
     WHERE tm.team_id = p_team_id AND tm.role = 'CAPTAIN' AND tm.is_active = true LIMIT 1),
    (SELECT t.captain_id FROM public.teams t WHERE t.id = p_team_id));
$$;
REVOKE EXECUTE ON FUNCTION public._team_captain(uuid) FROM PUBLIC, anon, authenticated;

-- ── 4) Katılma isteği akışı (I53) ──
CREATE OR REPLACE FUNCTION public.request_to_join_team(p_team_id uuid, p_message text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = 'public','pg_temp' AS $$
DECLARE
  v_uid         uuid := auth.uid();
  v_team        record;
  v_pending_max int := public._social_config_int('team_join_pending_max', 10);
  v_cooldown    int := public._social_config_int('friend_reject_cooldown_hours', 72);
  v_req         public.team_join_requests%ROWTYPE;
  v_name        text;
  v_admin       uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT * INTO v_team FROM public.teams WHERE id = p_team_id FOR UPDATE;
  IF NOT FOUND OR v_team.is_archived OR v_team.is_demo THEN
    RAISE EXCEPTION 'NOT_FOUND: Takım bulunamadı.';
  END IF;
  IF v_team.visibility <> 'PUBLIC' OR v_team.is_recruiting = false THEN
    RAISE EXCEPTION 'NOT_RECRUITING: Takım şu an oyuncu almıyor.';
  END IF;
  IF public._is_team_member(p_team_id, v_uid) THEN
    RAISE EXCEPTION 'ALREADY_MEMBER: Zaten bu takımdasın.';
  END IF;
  IF public._is_blocked_between(v_uid, public._team_captain(p_team_id)) THEN
    RAISE EXCEPTION 'NOT_FOUND: Takım bulunamadı.';
  END IF;
  IF (SELECT count(*) FROM public.team_members WHERE team_id = p_team_id AND is_active = true)
     >= public._social_config_int('team_roster_max', 20) THEN
    RAISE EXCEPTION 'ROSTER_FULL: Kadro dolu.';
  END IF;
  IF (SELECT count(*) FROM public.team_join_requests
      WHERE user_id = v_uid AND status = 'PENDING') >= v_pending_max THEN
    RAISE EXCEPTION 'PENDING_LIMIT: Çok fazla bekleyen katılma isteğin var.';
  END IF;
  -- Ret sonrası bekleme (arkadaşlık deseninin aynısı)
  IF EXISTS (SELECT 1 FROM public.team_join_requests
             WHERE team_id = p_team_id AND user_id = v_uid AND status = 'REJECTED'
               AND responded_at > timezone('utc', now()) - make_interval(hours => v_cooldown)) THEN
    RAISE EXCEPTION 'COOLDOWN: Bu takıma şimdilik tekrar istek gönderemezsin.';
  END IF;

  BEGIN
    INSERT INTO public.team_join_requests (team_id, user_id, message)
    VALUES (p_team_id, v_uid, nullif(trim(p_message), ''))
    RETURNING * INTO v_req;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', true, 'state', 'PENDING'); -- idempotent
  END;

  SELECT coalesce(full_name, name::text, 'Bir oyuncu') INTO v_name FROM public.profiles WHERE id = v_uid;
  FOR v_admin IN
    SELECT tm.user_id FROM public.team_members tm
    WHERE tm.team_id = p_team_id AND tm.is_active = true AND tm.role IN ('CAPTAIN','ADMIN')
  LOOP
    PERFORM public._notify_team_event(
      v_admin, 'team_join_request', v_uid, p_team_id,
      jsonb_build_object('sender_name', v_name, 'team_name', v_team.name),
      true, 'oyna://team/' || p_team_id::text || '/members');
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'state', 'PENDING', 'request_id', v_req.id);
END $$;
REVOKE EXECUTE ON FUNCTION public.request_to_join_team(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_to_join_team(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.respond_join_request(p_request_id uuid, p_approve boolean)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = 'public','pg_temp' AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_req  public.team_join_requests%ROWTYPE;
  v_team record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT * INTO v_req FROM public.team_join_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: İstek bulunamadı.'; END IF;
  IF NOT public._is_team_admin(v_req.team_id, v_uid) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Bu işlem için yetkin yok.';
  END IF;
  IF v_req.status <> 'PENDING' THEN
    RAISE EXCEPTION 'NOT_PENDING: İstek zaten yanıtlanmış.';
  END IF;
  SELECT * INTO v_team FROM public.teams WHERE id = v_req.team_id;

  IF p_approve THEN
    PERFORM public._team_add_member(v_req.team_id, v_req.user_id);
    UPDATE public.team_join_requests
    SET status = 'APPROVED', responded_at = timezone('utc', now()), responded_by = v_uid
    WHERE id = v_req.id;
    PERFORM public._notify_team_event(
      v_req.user_id, 'team_join_approved', v_uid, v_req.team_id,
      jsonb_build_object('team_name', v_team.name),
      false, 'oyna://team/' || v_req.team_id::text);
  ELSE
    UPDATE public.team_join_requests
    SET status = 'REJECTED', responded_at = timezone('utc', now()), responded_by = v_uid
    WHERE id = v_req.id;
    -- Nazik, nötr kapanış (I53 — belirsizlikte süründürmez)
    PERFORM public._notify_team_event(
      v_req.user_id, 'team_join_rejected', NULL, v_req.team_id,
      jsonb_build_object('team_name', v_team.name), false, NULL);
  END IF;

  -- Tüm yöneticilerdeki okunmamış istek bildirimi kapatılır
  UPDATE public.notifications SET is_read = true
  WHERE type_key = 'team_join_request' AND team_id = v_req.team_id
    AND sender_id = v_req.user_id AND is_read = false;

  RETURN jsonb_build_object('ok', true, 'state', CASE WHEN p_approve THEN 'APPROVED' ELSE 'REJECTED' END);
END $$;
REVOKE EXECUTE ON FUNCTION public.respond_join_request(uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_join_request(uuid,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_join_request(p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = 'public','pg_temp' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_req public.team_join_requests%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT * INTO v_req FROM public.team_join_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND OR v_req.user_id <> v_uid THEN RAISE EXCEPTION 'NOT_FOUND: İstek bulunamadı.'; END IF;
  IF v_req.status <> 'PENDING' THEN RAISE EXCEPTION 'NOT_PENDING: İstek zaten yanıtlanmış.'; END IF;
  UPDATE public.team_join_requests
  SET status = 'CANCELLED', responded_at = timezone('utc', now())
  WHERE id = v_req.id;
  DELETE FROM public.notifications
  WHERE type_key = 'team_join_request' AND team_id = v_req.team_id
    AND sender_id = v_uid AND is_read = false;
  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE EXECUTE ON FUNCTION public.cancel_join_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_join_request(uuid) TO authenticated;

-- ── 5) Davet akışı (K68) ──
CREATE OR REPLACE FUNCTION public.invite_to_team(p_team_id uuid, p_invited uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = 'public','pg_temp' AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_team record;
  v_inv  public.team_invites%ROWTYPE;
  v_name text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF NOT public._is_team_admin(p_team_id, v_uid) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Davet için yönetici olmalısın.';
  END IF;
  SELECT * INTO v_team FROM public.teams WHERE id = p_team_id;
  IF NOT FOUND OR v_team.is_archived THEN RAISE EXCEPTION 'NOT_FOUND: Takım bulunamadı.'; END IF;
  IF p_invited IS NULL OR p_invited = v_uid THEN RAISE EXCEPTION 'INVALID_TARGET'; END IF;
  IF public._is_team_member(p_team_id, p_invited) THEN
    RAISE EXCEPTION 'ALREADY_MEMBER: Bu oyuncu zaten kadroda.';
  END IF;
  IF coalesce((SELECT is_banned FROM public.profiles WHERE id = p_invited), true) THEN
    RAISE EXCEPTION 'NOT_FOUND: Kullanıcı bulunamadı.';
  END IF;
  IF public._is_blocked_between(v_uid, p_invited) THEN
    RAISE EXCEPTION 'NOT_FOUND: Kullanıcı bulunamadı.';
  END IF;
  IF (SELECT count(*) FROM public.team_members WHERE team_id = p_team_id AND is_active = true)
     >= public._social_config_int('team_roster_max', 20) THEN
    RAISE EXCEPTION 'ROSTER_FULL: Kadro dolu.';
  END IF;

  BEGIN
    INSERT INTO public.team_invites (team_id, inviter_id, invited_id)
    VALUES (p_team_id, v_uid, p_invited)
    RETURNING * INTO v_inv;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', true, 'state', 'PENDING'); -- idempotent
  END;

  SELECT coalesce(full_name, name::text, 'Bir oyuncu') INTO v_name FROM public.profiles WHERE id = v_uid;
  PERFORM public._notify_team_event(
    p_invited, 'team_member_invite', v_uid, p_team_id,
    jsonb_build_object('sender_name', v_name, 'team_name', v_team.name),
    true, 'oyna://team/' || p_team_id::text);
  RETURN jsonb_build_object('ok', true, 'state', 'PENDING', 'invite_id', v_inv.id);
END $$;
REVOKE EXECUTE ON FUNCTION public.invite_to_team(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invite_to_team(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.respond_team_invite(p_invite_id uuid, p_accept boolean)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = 'public','pg_temp' AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_inv  public.team_invites%ROWTYPE;
  v_team record;
  v_ttl  int := public._social_config_int('team_invite_ttl_days', 14);
  v_name text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT * INTO v_inv FROM public.team_invites WHERE id = p_invite_id FOR UPDATE;
  IF NOT FOUND OR v_inv.invited_id <> v_uid THEN RAISE EXCEPTION 'NOT_FOUND: Davet bulunamadı.'; END IF;
  IF v_inv.status <> 'PENDING' THEN RAISE EXCEPTION 'NOT_PENDING: Davet artık geçerli değil.'; END IF;
  IF v_inv.created_at < timezone('utc', now()) - make_interval(days => v_ttl) THEN
    UPDATE public.team_invites SET status = 'EXPIRED', responded_at = timezone('utc', now()) WHERE id = v_inv.id;
    RAISE EXCEPTION 'EXPIRED: Davetin süresi dolmuş.';
  END IF;
  SELECT * INTO v_team FROM public.teams WHERE id = v_inv.team_id;

  IF p_accept THEN
    PERFORM public._team_add_member(v_inv.team_id, v_uid);
    UPDATE public.team_invites
    SET status = 'ACCEPTED', responded_at = timezone('utc', now()) WHERE id = v_inv.id;
    SELECT coalesce(full_name, name::text, 'Bir oyuncu') INTO v_name FROM public.profiles WHERE id = v_uid;
    PERFORM public._notify_team_event(
      v_inv.inviter_id, 'team_invite_accepted', v_uid, v_inv.team_id,
      jsonb_build_object('sender_name', v_name, 'team_name', v_team.name),
      false, 'oyna://team/' || v_inv.team_id::text);
  ELSE
    UPDATE public.team_invites
    SET status = 'DECLINED', responded_at = timezone('utc', now()) WHERE id = v_inv.id;
  END IF;

  UPDATE public.notifications SET is_read = true
  WHERE user_id = v_uid AND type_key = 'team_member_invite'
    AND team_id = v_inv.team_id AND is_read = false;

  RETURN jsonb_build_object('ok', true, 'state', CASE WHEN p_accept THEN 'ACCEPTED' ELSE 'DECLINED' END);
END $$;
REVOKE EXECUTE ON FUNCTION public.respond_team_invite(uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_team_invite(uuid,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_team_invite(p_invite_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = 'public','pg_temp' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_inv public.team_invites%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT * INTO v_inv FROM public.team_invites WHERE id = p_invite_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Davet bulunamadı.'; END IF;
  IF v_inv.inviter_id <> v_uid AND NOT public._is_team_admin(v_inv.team_id, v_uid) THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;
  IF v_inv.status <> 'PENDING' THEN RAISE EXCEPTION 'NOT_PENDING'; END IF;
  UPDATE public.team_invites
  SET status = 'CANCELLED', responded_at = timezone('utc', now()) WHERE id = v_inv.id;
  DELETE FROM public.notifications
  WHERE user_id = v_inv.invited_id AND type_key = 'team_member_invite'
    AND team_id = v_inv.team_id AND is_read = false;
  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE EXECUTE ON FUNCTION public.cancel_team_invite(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_team_invite(uuid) TO authenticated;

-- Davet linki (K68): aç/kapa/yenile — kapaliyken token NULL
CREATE OR REPLACE FUNCTION public.set_team_invite_link(p_team_id uuid, p_enabled boolean)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = 'public','pg_temp' AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_token uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF NOT public._is_team_admin(p_team_id, v_uid) THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_enabled THEN
    v_token := gen_random_uuid();
    UPDATE public.teams SET invite_token = v_token WHERE id = p_team_id;
    RETURN jsonb_build_object('ok', true, 'invite_token', v_token);
  ELSE
    UPDATE public.teams SET invite_token = NULL WHERE id = p_team_id;
    RETURN jsonb_build_object('ok', true, 'invite_token', NULL);
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.set_team_invite_link(uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_team_invite_link(uuid,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.join_by_invite_token(p_token uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = 'public','pg_temp' AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_team record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT * INTO v_team FROM public.teams
  WHERE invite_token = p_token AND is_archived = false FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_TOKEN: Davet linki geçersiz.'; END IF;
  IF public._is_team_member(v_team.id, v_uid) THEN
    RETURN jsonb_build_object('ok', true, 'team_id', v_team.id, 'state', 'ALREADY_MEMBER');
  END IF;
  IF public._is_blocked_between(v_uid, public._team_captain(v_team.id)) THEN
    RAISE EXCEPTION 'INVALID_TOKEN: Davet linki geçersiz.';
  END IF;
  PERFORM public._team_add_member(v_team.id, v_uid);
  RETURN jsonb_build_object('ok', true, 'team_id', v_team.id, 'state', 'JOINED');
END $$;
REVOKE EXECUTE ON FUNCTION public.join_by_invite_token(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_by_invite_token(uuid) TO authenticated;

-- ── 6) Rol yönetimi & ayrılma/dağıtma (K65-73; eski kolonlara çift-yazım) ──
CREATE OR REPLACE FUNCTION public.set_member_role(p_team_id uuid, p_user uuid, p_role text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = 'public','pg_temp' AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_role NOT IN ('ADMIN','MEMBER') THEN RAISE EXCEPTION 'INVALID_ROLE'; END IF;
  -- Yönetici atama/alma yalnız KAPTAN yetkisi (K67 matrisi)
  IF NOT EXISTS (SELECT 1 FROM public.team_members
                 WHERE team_id = p_team_id AND user_id = v_uid
                   AND role = 'CAPTAIN' AND is_active = true) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Bu işlem yalnız kaptana açık.';
  END IF;
  IF p_user = v_uid THEN RAISE EXCEPTION 'INVALID_TARGET: Kendi rolünü buradan değiştiremezsin.'; END IF;
  UPDATE public.team_members SET role = p_role
  WHERE team_id = p_team_id AND user_id = p_user AND is_active = true AND role <> 'CAPTAIN';
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Üye bulunamadı.'; END IF;
  -- Eski captains[] çift-yazımı (geçiş uyumu)
  IF p_role = 'ADMIN' THEN
    UPDATE public.teams SET captains = coalesce(captains, '[]'::jsonb) || to_jsonb(p_user::text)
    WHERE id = p_team_id AND NOT (coalesce(captains, '[]'::jsonb) ? p_user::text);
  ELSE
    UPDATE public.teams SET captains = coalesce(captains, '[]'::jsonb) - p_user::text
    WHERE id = p_team_id;
  END IF;
  RETURN jsonb_build_object('ok', true, 'role', p_role);
END $$;
REVOKE EXECUTE ON FUNCTION public.set_member_role(uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_member_role(uuid,uuid,text) TO authenticated;

-- Kaptanlık devri (açık rıza akışının sunucu ayağı — K73)
CREATE OR REPLACE FUNCTION public.transfer_captaincy(p_team_id uuid, p_new_captain uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = 'public','pg_temp' AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_team record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.team_members
                 WHERE team_id = p_team_id AND user_id = v_uid
                   AND role = 'CAPTAIN' AND is_active = true) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Devir yalnız kaptana açık.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.team_members
                 WHERE team_id = p_team_id AND user_id = p_new_captain AND is_active = true) THEN
    RAISE EXCEPTION 'NOT_MEMBER: Yeni kaptan aktif üye olmalı.';
  END IF;
  SELECT * INTO v_team FROM public.teams WHERE id = p_team_id;

  -- Eski kaptan yönetici olarak kalır; halef KAPTAN olur
  UPDATE public.team_members SET role = 'ADMIN'
  WHERE team_id = p_team_id AND user_id = v_uid;
  UPDATE public.team_members SET role = 'CAPTAIN'
  WHERE team_id = p_team_id AND user_id = p_new_captain;

  -- Eski kolon çift-yazımı
  UPDATE public.teams
  SET captain_id = p_new_captain,
      captain    = p_new_captain,
      captains   = (
        SELECT coalesce(jsonb_agg(DISTINCT x), '[]'::jsonb)
        FROM jsonb_array_elements_text(
          coalesce(captains, '[]'::jsonb) || to_jsonb(v_uid::text) || to_jsonb(p_new_captain::text)
        ) AS x)
  WHERE id = p_team_id;

  PERFORM public._notify_team_event(
    p_new_captain, 'team_captain_transferred', v_uid, p_team_id,
    jsonb_build_object('team_name', v_team.name),
    false, 'oyna://team/' || p_team_id::text);
END $$;

-- Ayrılma: kaptan halef seçmeden ayrılamaz (sessiz oto-devir ÖLDÜ — K73)
CREATE OR REPLACE FUNCTION public.leave_team(p_team_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = 'public','pg_temp' AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_role   text;
  v_others int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT role INTO v_role FROM public.team_members
  WHERE team_id = p_team_id AND user_id = v_uid AND is_active = true FOR UPDATE;
  IF v_role IS NULL THEN RAISE EXCEPTION 'NOT_MEMBER: Bu takımda değilsin.'; END IF;

  SELECT count(*) INTO v_others FROM public.team_members
  WHERE team_id = p_team_id AND is_active = true AND user_id <> v_uid;

  IF v_role = 'CAPTAIN' AND v_others > 0 THEN
    RAISE EXCEPTION 'CAPTAIN_MUST_TRANSFER: Ayrılmadan önce kaptanlığı devretmelisin.';
  END IF;

  UPDATE public.team_members SET is_active = false
  WHERE team_id = p_team_id AND user_id = v_uid;
  UPDATE public.teams SET captains = coalesce(captains, '[]'::jsonb) - v_uid::text
  WHERE id = p_team_id;

  IF v_role = 'CAPTAIN' AND v_others = 0 THEN
    -- Tek üye kaptandı → takım arşivlenir (dağıtma = arşiv)
    UPDATE public.teams
    SET is_archived = true, archived_at = timezone('utc', now())
    WHERE id = p_team_id;
    RETURN jsonb_build_object('ok', true, 'archived', true);
  END IF;
  RETURN jsonb_build_object('ok', true, 'archived', false);
END $$;

CREATE OR REPLACE FUNCTION public.remove_team_member(p_team_id uuid, p_user uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = 'public','pg_temp' AS $$
DECLARE
  v_uid         uuid := auth.uid();
  v_my_role     text;
  v_target_role text;
  v_team_name   text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT role INTO v_my_role FROM public.team_members
  WHERE team_id = p_team_id AND user_id = v_uid AND is_active = true;
  IF v_my_role NOT IN ('CAPTAIN','ADMIN') THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT role INTO v_target_role FROM public.team_members
  WHERE team_id = p_team_id AND user_id = p_user AND is_active = true FOR UPDATE;
  IF v_target_role IS NULL THEN RAISE EXCEPTION 'NOT_FOUND: Üye bulunamadı.'; END IF;
  IF v_target_role = 'CAPTAIN' THEN
    RAISE EXCEPTION 'CANNOT_REMOVE_CAPTAIN: Kaptan çıkarılamaz.';
  END IF;
  -- Yönetici yöneticiyi çıkaramaz (K67 hiyerarşi güvenliği)
  IF v_my_role = 'ADMIN' AND v_target_role = 'ADMIN' THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Yönetici, başka bir yöneticiyi çıkaramaz.';
  END IF;

  UPDATE public.team_members SET is_active = false
  WHERE team_id = p_team_id AND user_id = p_user;
  UPDATE public.teams SET captains = coalesce(captains, '[]'::jsonb) - p_user::text
  WHERE id = p_team_id;

  SELECT name INTO v_team_name FROM public.teams WHERE id = p_team_id;
  -- Nötr bilgilendirme (K73 — sessiz kaybolma yaşatılmaz)
  PERFORM public._notify_team_event(
    p_user, 'team_member_removed', NULL, p_team_id,
    jsonb_build_object('team_name', coalesce(v_team_name, 'Takım')), false, NULL);
  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE EXECUTE ON FUNCTION public.remove_team_member(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_team_member(uuid,uuid) TO authenticated;

-- Dağıt (=arşiv) / 30 gün içinde geri aç (K72)
CREATE OR REPLACE FUNCTION public.disband_team(p_team_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = 'public','pg_temp' AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.team_members
                 WHERE team_id = p_team_id AND user_id = v_uid
                   AND role = 'CAPTAIN' AND is_active = true) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Dağıtma yalnız kaptana açık.';
  END IF;
  UPDATE public.teams
  SET is_archived = true, archived_at = timezone('utc', now())
  WHERE id = p_team_id AND is_archived = false;
  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE EXECUTE ON FUNCTION public.disband_team(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.disband_team(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.restore_team(p_team_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = 'public','pg_temp' AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.team_members
                 WHERE team_id = p_team_id AND user_id = v_uid AND role = 'CAPTAIN') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Geri açma yalnız kaptana açık.';
  END IF;
  UPDATE public.teams
  SET is_archived = false, archived_at = NULL
  WHERE id = p_team_id AND is_archived = true
    AND archived_at > timezone('utc', now()) - interval '30 days';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESTORE_WINDOW_CLOSED: 30 günlük geri açma süresi geçmiş.';
  END IF;
  -- Kaptan üyeliği yeniden aktifleştirilir
  UPDATE public.team_members SET is_active = true
  WHERE team_id = p_team_id AND user_id = v_uid;
  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE EXECUTE ON FUNCTION public.restore_team(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_team(uuid) TO authenticated;

-- Eski istemci yolu set_team_admin: yeni rol modeline ÇİFT-YAZIM yapar
-- (aksi hâlde eski yoldan atanan yönetici role kolonuna yansımaz — kayma).
-- Eski kapı (_is_team_admin) korunur; yeni set_member_role kaptan-only'dir.
CREATE OR REPLACE FUNCTION public.set_team_admin(p_team_id uuid, p_user uuid, p_grant boolean)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = 'public','pg_temp' AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF NOT public._is_team_admin(p_team_id, v_uid) THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF NOT p_grant AND EXISTS (SELECT 1 FROM public.team_members
      WHERE team_id = p_team_id AND user_id = p_user
        AND role = 'CAPTAIN' AND is_active = true) THEN
    RAISE EXCEPTION 'CANNOT_REMOVE_PRIMARY: Kaptanın yetkisi alınamaz.';
  END IF;
  UPDATE public.team_members
  SET role = CASE WHEN p_grant THEN 'ADMIN' ELSE 'MEMBER' END
  WHERE team_id = p_team_id AND user_id = p_user
    AND is_active = true AND role <> 'CAPTAIN';
  IF p_grant THEN
    UPDATE public.teams SET captains = coalesce(captains, '[]'::jsonb) || to_jsonb(p_user::text)
    WHERE id = p_team_id AND NOT (coalesce(captains, '[]'::jsonb) ? p_user::text);
  ELSE
    UPDATE public.teams SET captains = coalesce(captains, '[]'::jsonb) - p_user::text
    WHERE id = p_team_id;
  END IF;
END $$;

-- ── 7) Davet süre dolumu (gecelik) ──
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'social_expire_team_invites') THEN
    PERFORM cron.schedule(
      'social_expire_team_invites',
      '25 3 * * *',
      $job$UPDATE public.team_invites SET status='EXPIRED', responded_at=timezone('utc',now())
           WHERE status='PENDING'
             AND created_at < now() - make_interval(days => public._social_config_int('team_invite_ttl_days',14))$job$
    );
  END IF;
END $$;
