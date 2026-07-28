-- ÜRETİMDEN GERİ ÇEKİLDİ (defter sapması onarımı, 2026-07-28)
-- NOT: Defterdeki uyarı "repo dosyasında DROP FUNCTION satırı eksik, temiz
-- kurulumda hata verir" diyordu. Üretimdeki sürümde o satır VAR; bu dosya
-- üretimden birebir alındığı için sorun onarılmış oldu.
--
-- Kadro daveti (arkadaş + takım arkadaşı) + oyuncu tarafı sağlayıcı listesi
DROP FUNCTION IF EXISTS public.invite_friends_to_match(uuid, uuid[]);

CREATE OR REPLACE FUNCTION public.invite_friends_to_match(p_match_id uuid, p_friend_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_match RECORD;
  v_sender text;
  v_fid uuid;
  v_sent int := 0;
  v_skipped int := 0;
  v_ok boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT id, "creatorId", title, date, "time" INTO v_match
  FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Maç bulunamadı.'; END IF;
  IF v_match."creatorId" IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'FORBIDDEN: Yalnız maçı kuran davet gönderebilir.';
  END IF;

  SELECT COALESCE(NULLIF(trim(full_name), ''), NULLIF(trim(name), ''), 'Bir arkadaşın')
    INTO v_sender FROM public.profiles WHERE id = v_uid;

  FOREACH v_fid IN ARRAY COALESCE(p_friend_ids, '{}') LOOP
    IF v_fid = v_uid THEN CONTINUE; END IF;

    v_ok := public._are_friends(v_uid, v_fid) OR EXISTS (
      SELECT 1
      FROM public.team_members me
      JOIN public.team_members other ON other.team_id = me.team_id
      WHERE me.user_id = v_uid AND other.user_id = v_fid
        AND COALESCE(me.is_active, true) AND COALESCE(other.is_active, true)
    );
    IF NOT v_ok THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    PERFORM public._notify_team_event(
      v_fid, 'match_invite', v_uid, NULL,
      jsonb_build_object('sender_name', v_sender,
                         'match_date', COALESCE(v_match.date || ' ' || v_match."time", '')),
      true, 'oyna://match/' || p_match_id);
    v_sent := v_sent + 1;
  END LOOP;

  RETURN jsonb_build_object('sent', v_sent, 'skipped', v_skipped);
END;
$$;

REVOKE ALL ON FUNCTION public.invite_friends_to_match(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invite_friends_to_match(uuid, uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_bookable_providers(p_type text)
RETURNS TABLE(id uuid, name text, avatar text, rating numeric, fee numeric, is_elite boolean, zone text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_type NOT IN ('GK', 'REF') THEN RAISE EXCEPTION 'INVALID_TYPE'; END IF;

  IF p_type = 'GK' THEN
    RETURN QUERY
      SELECT g.id, g.name::text, g.avatar::text, g.rating::numeric, g.fee::numeric,
             COALESCE(g."isElite", false),
             NULLIF(btrim(COALESCE(g."preferredZones"->>0, '')), '')
      FROM public.goalkeepers g
      WHERE g.id IN (SELECT * FROM public.get_available_provider_ids('GK'))
      ORDER BY COALESCE(g."isElite", false) DESC, g.rating DESC NULLS LAST, g.fee ASC;
  ELSE
    RETURN QUERY
      SELECT r.id, r.name::text, r.avatar::text, r.rating::numeric, r.fee::numeric,
             COALESCE(r."isElite", false),
             NULL::text
      FROM public.referees r
      WHERE r.id IN (SELECT * FROM public.get_available_provider_ids('REF'))
      ORDER BY COALESCE(r."isElite", false) DESC, r.rating DESC NULLS LAST, r.fee ASC;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.list_bookable_providers(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_bookable_providers(text) TO authenticated;
