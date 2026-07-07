-- ================================================================
-- SOSYAL AŞAMA 1.15 — Davet linki sertleştirme (güvenlik düzeltmesi)
--
-- SORUN: teams_select_visibility politikası PUBLIC takımların TÜM
-- kolonlarını (invite_token dahil) her giriş yapmış kullanıcıya açar.
-- Token'ı tablo okumasıyla ele geçiren herkes join_by_invite_token
-- ile istek/onay kapısını atlayıp kadroya doğrudan girebilirdi.
--
-- ÇÖZÜM (ekleyici, genişlet-daralt): token deny-all RLS'li ayrı
-- tabloya taşınır; teams.invite_token boşaltılır ve artık yazılmaz
-- (kolon Aşama 2'de düşer). Yönetici mevcut linki yalnız
-- get_team_invite_link RPC'siyle okur.
-- ================================================================

CREATE TABLE IF NOT EXISTS public.team_invite_links (
  team_id    uuid PRIMARY KEY REFERENCES public.teams(id) ON DELETE CASCADE,
  token      uuid NOT NULL UNIQUE,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

-- Bilinçli deny-all: hiç policy yok — erişim yalnız SECURITY DEFINER RPC'ler
-- (profile_contact_hash ile aynı desen; advisor INFO bulgusu kasıtlıdır).
ALTER TABLE public.team_invite_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.team_invite_links FROM PUBLIC, anon, authenticated;

-- Var olan token'ları taşı, sızdıran kolonu boşalt
INSERT INTO public.team_invite_links (team_id, token)
SELECT id, invite_token FROM public.teams WHERE invite_token IS NOT NULL
ON CONFLICT (team_id) DO NOTHING;

UPDATE public.teams SET invite_token = NULL WHERE invite_token IS NOT NULL;

-- ── set_team_invite_link: yeni tabloya yazar (teams kolonuna asla) ──
-- p_enabled=true her çağrıda YENİ token üretir (yenile = eskisi ölür).
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
    INSERT INTO public.team_invite_links (team_id, token, created_by)
    VALUES (p_team_id, v_token, v_uid)
    ON CONFLICT (team_id) DO UPDATE
      SET token = EXCLUDED.token,
          created_by = EXCLUDED.created_by,
          created_at = timezone('utc', now());
    RETURN jsonb_build_object('ok', true, 'invite_token', v_token);
  ELSE
    DELETE FROM public.team_invite_links WHERE team_id = p_team_id;
    RETURN jsonb_build_object('ok', true, 'invite_token', NULL);
  END IF;
END $$;

-- ── get_team_invite_link: mevcut linki yalnız yönetici okur ──
CREATE OR REPLACE FUNCTION public.get_team_invite_link(p_team_id uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = 'public','pg_temp' AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF NOT public._is_team_admin(p_team_id, v_uid) THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  RETURN (SELECT token FROM public.team_invite_links WHERE team_id = p_team_id);
END $$;
REVOKE EXECUTE ON FUNCTION public.get_team_invite_link(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_team_invite_link(uuid) TO authenticated;

-- ── join_by_invite_token: yeni tablodan çözümlenir ──
CREATE OR REPLACE FUNCTION public.join_by_invite_token(p_token uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = 'public','pg_temp' AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_team record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT t.* INTO v_team
  FROM public.team_invite_links l
  JOIN public.teams t ON t.id = l.team_id
  WHERE l.token = p_token AND t.is_archived = false
  FOR UPDATE OF t;
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
