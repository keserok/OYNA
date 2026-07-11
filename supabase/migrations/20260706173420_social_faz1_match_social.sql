-- ================================================================
-- SOSYAL AŞAMA 1.10 — Maç-sosyal katmanı (Spec §3.4 FCFS + §M89)
-- Liste→maç daveti (ilk ödeyen katılır) + maça-özel taktik.
-- Yarış güvenliği player_buy_slots'un mevcut FOR UPDATE kilidinde;
-- burada YALNIZ davet takibi ve bildirim orkestre edilir.
-- ================================================================

-- ── 1) match_list_invites ──
CREATE TABLE IF NOT EXISTS public.match_list_invites (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id     uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  inviter_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  invited_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  list_id      uuid REFERENCES public.friend_lists(id) ON DELETE SET NULL,
  status       text NOT NULL DEFAULT 'PENDING'
               CHECK (status IN ('PENDING','JOINED','DECLINED','EXPIRED')),
  created_at   timestamptz NOT NULL DEFAULT timezone('utc', now()),
  responded_at timestamptz,
  UNIQUE (match_id, invited_id),
  CHECK (inviter_id <> invited_id)
);
CREATE INDEX IF NOT EXISTS match_list_invites_match_idx
  ON public.match_list_invites (match_id, status);
CREATE INDEX IF NOT EXISTS match_list_invites_invited_idx
  ON public.match_list_invites (invited_id, status);

ALTER TABLE public.match_list_invites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mli_select ON public.match_list_invites;
CREATE POLICY mli_select ON public.match_list_invites
  FOR SELECT TO authenticated
  USING (invited_id = (SELECT auth.uid()) OR inviter_id = (SELECT auth.uid()));
-- Yazım yalnız RPC.

-- Bildirim şablonları
INSERT INTO public.notification_templates (type_key, label_tr, title_tr, body_tr, category, is_mandatory, can_user_disable, sort_order)
SELECT * FROM (VALUES
  ('match_invite_joined','Davet karşılığı','Davetin işe yaradı ⚽','{sender_name} davet ettiğin maça katıldı.','MATCH',false,true,30),
  ('match_tactic_assigned','Maç taktiği','Maç planı hazır 📋','{team_name} · {tactic_name} taktiği sıradaki maça atandı.','SOCIAL',false,true,31)
) AS v(type_key,label_tr,title_tr,body_tr,category,is_mandatory,can_user_disable,sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.notification_templates t WHERE t.type_key = v.type_key);

-- ── 2) Liste→maç davet yayılımı ──
CREATE OR REPLACE FUNCTION public.invite_list_to_match(p_match_id uuid, p_list_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = 'public','pg_temp' AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_batch_max int := public._social_config_int('match_list_invite_batch_max', 50);
  v_match     record;
  v_sent      int := 0;
  v_skipped   int := 0;
  v_member    uuid;
  v_is_participant boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  -- Liste sahibi olmalı
  IF NOT EXISTS (SELECT 1 FROM public.friend_lists WHERE id = p_list_id AND owner_id = v_uid) THEN
    RAISE EXCEPTION 'NOT_FOUND: Liste bulunamadı.';
  END IF;
  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Maç bulunamadı.'; END IF;

  -- Çağıran maçın katılımcısı veya kurucusu olmalı (Spec §3.4)
  v_is_participant := (v_match."creatorId" = v_uid) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(coalesce(v_match.slots,'[]'::jsonb) || coalesce(v_match."awaySlots",'[]'::jsonb)) s
    WHERE s->>'occupant' = v_uid::text OR s->'player'->>'id' = v_uid::text);
  IF NOT v_is_participant THEN
    RAISE EXCEPTION 'NOT_PARTICIPANT: Davet için maçın katılımcısı olmalısın.';
  END IF;

  FOR v_member IN
    SELECT flm.member_id FROM public.friend_list_members flm
    WHERE flm.list_id = p_list_id
    LIMIT v_batch_max
  LOOP
    -- Atlananlar: maçta olan, engelli, yasaklı, zaten davetli
    IF EXISTS (
         SELECT 1 FROM jsonb_array_elements(coalesce(v_match.slots,'[]'::jsonb) || coalesce(v_match."awaySlots",'[]'::jsonb)) s
         WHERE s->>'occupant' = v_member::text OR s->'player'->>'id' = v_member::text)
       OR public._is_blocked_between(v_uid, v_member)
       OR coalesce((SELECT is_banned FROM public.profiles WHERE id = v_member), true)
       OR EXISTS (SELECT 1 FROM public.match_list_invites
                  WHERE match_id = p_match_id AND invited_id = v_member)
    THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.match_list_invites (match_id, inviter_id, invited_id, list_id)
    VALUES (p_match_id, v_uid, v_member, p_list_id);
    -- Mevcut davet makinesi: bildirim + action_required + deep link
    PERFORM public.send_match_invite(p_match_id, v_member, v_uid, NULL);
    v_sent := v_sent + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'sent', v_sent, 'skipped', v_skipped);
END $$;
REVOKE EXECUTE ON FUNCTION public.invite_list_to_match(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invite_list_to_match(uuid,uuid) TO authenticated;

-- Sessiz ret (yalnız sayaç — davet edene tek tek "reddetti" bildirimi YOK)
CREATE OR REPLACE FUNCTION public.respond_match_list_invite(p_invite_id uuid, p_decline boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = 'public','pg_temp' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_inv public.match_list_invites%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT * INTO v_inv FROM public.match_list_invites WHERE id = p_invite_id FOR UPDATE;
  IF NOT FOUND OR v_inv.invited_id <> v_uid THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_inv.status <> 'PENDING' THEN RETURN jsonb_build_object('ok', true, 'state', v_inv.status); END IF;
  IF p_decline THEN
    UPDATE public.match_list_invites
    SET status = 'DECLINED', responded_at = timezone('utc', now()) WHERE id = v_inv.id;
  END IF;
  RETURN jsonb_build_object('ok', true, 'state', CASE WHEN p_decline THEN 'DECLINED' ELSE 'PENDING' END);
END $$;
REVOKE EXECUTE ON FUNCTION public.respond_match_list_invite(uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_match_list_invite(uuid,boolean) TO authenticated;

-- ── 3) player_buy_slots genişletmesi: katılım daveti JOINED yapar +
--       davet edene bildirim (FCFS'in davet-takip kancası) ──
CREATE OR REPLACE FUNCTION public.player_buy_slots(p_match_id uuid, p_slot_ids text[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','pg_temp' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_slots jsonb; v_away jsonb; v_price numeric; v_count int := 0; v_total numeric;
  v_player jsonb; v_sid text; v_slot jsonb;
  v_inv public.match_list_invites%ROWTYPE;
  v_name text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT slots, "awaySlots", price INTO v_slots, v_away, v_price
  FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF v_slots IS NULL THEN RAISE EXCEPTION 'NOT_FOUND: Maç bulunamadı'; END IF;
  v_away := coalesce(v_away, '[]'::jsonb);

  FOREACH v_sid IN ARRAY p_slot_ids LOOP
    SELECT s INTO v_slot FROM jsonb_array_elements(v_slots) s WHERE s->>'id' = v_sid;
    IF v_slot IS NULL THEN
      SELECT s INTO v_slot FROM jsonb_array_elements(v_away) s WHERE s->>'id' = v_sid;
    END IF;
    IF v_slot IS NULL THEN RAISE EXCEPTION 'SLOT_NOT_FOUND: %', v_sid; END IF;
    IF coalesce(v_slot->>'status','OPEN') <> 'OPEN' THEN RAISE EXCEPTION 'SLOT_TAKEN: % dolu', v_sid; END IF;
    v_count := v_count + 1;
  END LOOP;
  IF v_count = 0 THEN RAISE EXCEPTION 'NO_SLOTS: En az bir slot seç'; END IF;

  v_total := coalesce(v_price, 0) * v_count;
  IF v_total > 0 THEN PERFORM public.process_match_payment(v_uid, p_match_id, v_total); END IF;

  SELECT jsonb_build_object(
    'id', id, 'name', coalesce(name, full_name, 'Oyuncu'),
    'avatar', coalesce(avatar_url, ''), 'rating', coalesce(rating, 4.5), 'position', ''
  ) INTO v_player FROM public.profiles WHERE id = v_uid;

  FOREACH v_sid IN ARRAY p_slot_ids LOOP
    v_slots := coalesce((SELECT jsonb_agg(CASE WHEN s->>'id' = v_sid
        THEN s || jsonb_build_object('status','TAKEN','player',v_player,
             'purchasedBy', v_uid::text, 'occupant', v_uid::text, 'assignmentStatus','SELF')
        ELSE s END) FROM jsonb_array_elements(v_slots) s), '[]'::jsonb);
    v_away := coalesce((SELECT jsonb_agg(CASE WHEN s->>'id' = v_sid
        THEN s || jsonb_build_object('status','TAKEN','player',v_player,
             'purchasedBy', v_uid::text, 'occupant', v_uid::text, 'assignmentStatus','SELF')
        ELSE s END) FROM jsonb_array_elements(v_away) s), '[]'::jsonb);
  END LOOP;
  UPDATE public.matches SET slots = v_slots, "awaySlots" = v_away WHERE id = p_match_id;

  -- YENİ: bekleyen liste-daveti varsa JOINED + davet edene bildirim
  SELECT * INTO v_inv FROM public.match_list_invites
  WHERE match_id = p_match_id AND invited_id = v_uid AND status = 'PENDING'
  FOR UPDATE;
  IF FOUND THEN
    UPDATE public.match_list_invites
    SET status = 'JOINED', responded_at = timezone('utc', now())
    WHERE id = v_inv.id;
    SELECT coalesce(full_name, name::text, 'Bir oyuncu') INTO v_name
    FROM public.profiles WHERE id = v_uid;
    PERFORM public._notify_team_event(
      v_inv.inviter_id, 'match_invite_joined', v_uid, NULL,
      jsonb_build_object('sender_name', v_name),
      false, 'oyna://match/' || p_match_id::text);
  END IF;

  RETURN jsonb_build_object('ok', true, 'count', v_count, 'total', v_total);
END $$;
REVOKE EXECUTE ON FUNCTION public.player_buy_slots(uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.player_buy_slots(uuid, text[]) TO authenticated;

-- ── 4) Maça-özel taktik (M89: atanan > is_active) ──
-- Canlıda aynı adlı, 0 satırlık, kodda REFERANSSIZ bir miras tablo bulundu
-- (id/formation/slots/editorName/updatedAt — eski ortak-tahta denemesi).
-- Yıkım yok: kenara taşınır; Aşama 2'de kaldırılır. editorName kolonu,
-- miras şekli yeni şekilden ayırt eden imzadır (tekrar-çalıştırma güvenli).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'match_tactics'
               AND column_name = 'editorName') THEN
    ALTER TABLE public.match_tactics RENAME TO match_tactics_legacy;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.match_tactics (
  match_id    uuid PRIMARY KEY REFERENCES public.matches(id) ON DELETE CASCADE,
  tactic_id   uuid NOT NULL REFERENCES public.tactics(id) ON DELETE CASCADE,
  team_id     uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);
ALTER TABLE public.match_tactics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mt_select_member ON public.match_tactics;
CREATE POLICY mt_select_member ON public.match_tactics
  FOR SELECT TO authenticated
  USING (public._is_team_member(team_id, (SELECT auth.uid())));
-- Yazım yalnız RPC.

CREATE OR REPLACE FUNCTION public.assign_match_tactic(p_match_id uuid, p_tactic_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = 'public','pg_temp' AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_tactic  record;
  v_match   record;
  v_member  uuid;
  v_team    record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT id, "teamId", name, status INTO v_tactic FROM public.tactics WHERE id = p_tactic_id;
  IF NOT FOUND OR v_tactic."teamId" IS NULL THEN
    RAISE EXCEPTION 'NOT_TEAM_TACTIC: Yalnız takım taktiği atanabilir.';
  END IF;
  IF v_tactic.status <> 'APPROVED' THEN
    RAISE EXCEPTION 'NOT_APPROVED: Yalnız onaylı taktik atanabilir.';
  END IF;
  IF NOT public._is_team_admin(v_tactic."teamId", v_uid) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Taktik atama yönetici yetkisidir.';
  END IF;
  SELECT id, "homeTeamId", "awayTeamId" INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Maç bulunamadı.'; END IF;
  IF v_match."homeTeamId" IS DISTINCT FROM v_tactic."teamId"
     AND v_match."awayTeamId" IS DISTINCT FROM v_tactic."teamId" THEN
    RAISE EXCEPTION 'NOT_TEAM_MATCH: Maç bu takıma ait değil.';
  END IF;

  INSERT INTO public.match_tactics (match_id, tactic_id, team_id, assigned_by)
  VALUES (p_match_id, p_tactic_id, v_tactic."teamId", v_uid)
  ON CONFLICT (match_id) DO UPDATE
    SET tactic_id = EXCLUDED.tactic_id, team_id = EXCLUDED.team_id,
        assigned_by = EXCLUDED.assigned_by, assigned_at = timezone('utc', now());

  -- Takım üyeleri planı bilir (atayan hariç)
  SELECT name INTO v_team FROM public.teams WHERE id = v_tactic."teamId";
  FOR v_member IN
    SELECT tm.user_id FROM public.team_members tm
    WHERE tm.team_id = v_tactic."teamId" AND tm.is_active = true AND tm.user_id <> v_uid
  LOOP
    PERFORM public._notify_team_event(
      v_member, 'match_tactic_assigned', v_uid, v_tactic."teamId",
      jsonb_build_object('team_name', v_team.name, 'tactic_name', v_tactic.name),
      false, 'oyna://match/' || p_match_id::text);
  END LOOP;
  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE EXECUTE ON FUNCTION public.assign_match_tactic(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_match_tactic(uuid,uuid) TO authenticated;

-- ── 5) Süre dolumu: dolu/başlamış maçların bekleyen davetleri (gecelik) ──
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'social_expire_match_invites') THEN
    PERFORM cron.schedule(
      'social_expire_match_invites',
      '35 3 * * *',
      $job$UPDATE public.match_list_invites mli SET status='EXPIRED', responded_at=timezone('utc',now())
           WHERE mli.status='PENDING' AND EXISTS (
             SELECT 1 FROM public.matches m WHERE m.id = mli.match_id
               AND upper(coalesce(m.status,'')) IN ('COMPLETED','FINISHED','SCORED','CANCELLED'))$job$
    );
  END IF;
END $$;
