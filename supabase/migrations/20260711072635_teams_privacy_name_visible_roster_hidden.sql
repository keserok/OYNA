-- ════════════════════════════════════════════════════════════════════════
-- Gizli takım modeli (karar 2026-07-11):
--  * Gizli (PRIVATE) takımın ADI, arması, üye SAYISI ve KAPTANI dışarıya görünür;
--    maç daveti atılabilir; keşif listesinde "Gizli" rozetiyle yer alır.
--  * Üye LİSTESİ (kadro) dışarıya kapalıdır: yalnız üyeler ve platform admini.
--  * Katılma isteği gizli takıma zaten kapalı (request_to_join_team PUBLIC şartı).
--  * Kadro RPC'si (get_team_squad) zaten üye-şartlı; bu migration doğrudan
--    tablo okumalarındaki (PostgREST) sızıntıyı kapatır ve vitrin RPC'lerini
--    gizli takımları kapsayacak şekilde günceller.
-- ════════════════════════════════════════════════════════════════════════

-- ─── 1) team_members: "Herkes takım üyelerini görebilir" (USING true) kalkar.
--        Rol bazlı ayrım: anon yalnız PUBLIC takım üyelerini, oturumlu kullanıcı
--        PUBLIC takımlar + kendi takımları + (admin ise) hepsini görür.
--        (is_platform_admin anon tarafından çalıştırılamaz → rol ayrımı şart.)
drop policy if exists "Herkes takım üyelerini görebilir" on public.team_members;

create policy tm_select_anon on public.team_members for select to anon using (
  exists (select 1 from public.teams t
          where t.id = team_members.team_id and t.visibility = 'PUBLIC')
);

create policy tm_select_auth on public.team_members for select to authenticated using (
  exists (select 1 from public.teams t
          where t.id = team_members.team_id and t.visibility = 'PUBLIC')
  or public._is_team_member(team_id, (select auth.uid()))
  or is_platform_admin()
);

-- ─── 2) teams SELECT: isim/arma herkese görünür (ürün kararı) → USING true
--        politikası KALIR; artık gereksiz ve çelişkili olan visibility
--        politikası kaldırılır (danışman: multiple_permissive_policies).
drop policy if exists teams_select_visibility on public.teams;

-- ─── 3) list_public_teams: gizli takımlar da listelenir (rozet için visibility
--        kolonu eklendi). Dönüş tipi değiştiği için DROP + CREATE.
drop function if exists public.list_public_teams(text, text, text, boolean, integer, integer);

create function public.list_public_teams(
  p_q text default null, p_city text default null, p_format text default null,
  p_recruiting_only boolean default false, p_limit integer default 20, p_offset integer default 0)
returns table(team_id uuid, name text, crest_config jsonb, color1 text, color2 text,
              format text, city text, is_recruiting boolean, member_count integer,
              roster_max integer, wins integer, draws integer, losses integer,
              my_state text, visibility text)
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid   uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_norm  text := public.normalize_tr(coalesce(p_q, ''));
begin
  if v_uid is null then raise exception 'UNAUTHORIZED'; end if;
  return query
  select
    t.id, t.name, t.crest_config, t.color1, t.color2,
    t.format, t.city,
    -- gizli takım oyuncu alımına (katılma isteğine) kapalıdır
    (t.is_recruiting and t.visibility = 'PUBLIC'),
    (select count(*)::int from public.team_members x
     where x.team_id = t.id and x.is_active = true),
    public._social_config_int('team_roster_max', 20),
    coalesce(t.wins, 0), coalesce(t.draws, 0), coalesce(t.losses, 0),
    case
      when public._is_team_member(t.id, v_uid) then 'MEMBER'
      when exists (select 1 from public.team_join_requests r
                   where r.team_id = t.id and r.user_id = v_uid
                     and r.status = 'PENDING') then 'REQUEST_PENDING'
      else 'NONE' end,
    t.visibility
  from public.teams t
  where t.visibility in ('PUBLIC', 'PRIVATE')
    and t.is_archived = false and t.is_demo = false
    and (not p_recruiting_only or (t.is_recruiting = true and t.visibility = 'PUBLIC'))
    and (p_city is null or public.normalize_tr(t.city) = public.normalize_tr(p_city))
    and (p_format is null or t.format = p_format)
    and (length(v_norm) < 2 or public.normalize_tr(t.name) like '%' || v_norm || '%')
  order by t.created_at desc
  limit v_limit offset greatest(coalesce(p_offset, 0), 0);
end $function$;

revoke all on function public.list_public_teams(text, text, text, boolean, integer, integer) from public, anon;
grant execute on function public.list_public_teams(text, text, text, boolean, integer, integer) to authenticated;

-- ─── 4) get_team_public_profile: gizli takım için de sınırlı vitrin döner
--        (isim, arma, üye sayısı, kaptan, W/D/L). Kadro zaten dönmüyor.
create or replace function public.get_team_public_profile(p_team_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid  uuid := auth.uid();
  v_team record;
  v_h2h  jsonb;
begin
  if v_uid is null then raise exception 'UNAUTHORIZED'; end if;
  select * into v_team from public.teams
  where id = p_team_id and is_archived = false and is_demo = false
    and (visibility in ('PUBLIC', 'PRIVATE') or public._is_team_member(id, v_uid));
  if not found then raise exception 'NOT_FOUND: Takım bulunamadı.'; end if;

  select jsonb_build_object(
    'played', count(*),
    'wins',   count(*) filter (where
      (m."homeTeamId" = p_team_id and m."awayScore" > m."homeScore") or
      (m."awayTeamId" = p_team_id and m."homeScore" > m."awayScore")),
    'draws',  count(*) filter (where m."homeScore" = m."awayScore"))
  into v_h2h
  from public.matches m
  where upper(coalesce(m.status, '')) in ('COMPLETED','FINISHED','SCORED')
    and m."homeScore" is not null and m."awayScore" is not null
    and ((m."homeTeamId" = p_team_id and m."awayTeamId" in (
            select team_id from public.team_members
            where user_id = v_uid and is_active = true))
      or (m."awayTeamId" = p_team_id and m."homeTeamId" in (
            select team_id from public.team_members
            where user_id = v_uid and is_active = true)));

  return jsonb_build_object(
    'team_id', v_team.id,
    'name', v_team.name,
    'short_name', v_team."shortName",
    'crest_config', v_team.crest_config,
    'color1', v_team.color1, 'color2', v_team.color2,
    'format', v_team.format, 'city', v_team.city,
    'play_style', v_team."playStyle",
    'visibility', v_team.visibility,
    'is_recruiting', (v_team.is_recruiting and v_team.visibility = 'PUBLIC'),
    'wins', coalesce(v_team.wins, 0),
    'draws', coalesce(v_team.draws, 0),
    'losses', coalesce(v_team.losses, 0),
    'member_count', (select count(*) from public.team_members x
                     where x.team_id = v_team.id and x.is_active = true),
    'roster_max', public._social_config_int('team_roster_max', 20),
    'captain_name', (select coalesce(p.full_name, p.name::text)
                     from public.team_members tm join public.profiles p on p.id = tm.user_id
                     where tm.team_id = v_team.id and tm.role = 'CAPTAIN'
                       and tm.is_active = true limit 1),
    'is_member', public._is_team_member(v_team.id, v_uid),
    'my_request_pending', exists (select 1 from public.team_join_requests r
        where r.team_id = v_team.id and r.user_id = v_uid and r.status = 'PENDING'),
    'h2h', v_h2h);
end $function$;

revoke all on function public.get_team_public_profile(uuid) from public, anon;
grant execute on function public.get_team_public_profile(uuid) to authenticated;
