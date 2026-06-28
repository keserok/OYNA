-- FAZ 8 (oyuncu): Takım Ayarları — kuruluş sonrası kimlik düzenleme (kaptan).
-- Ad, kısa ad, renkler, arma ve ev sahası sonradan güncellenebilir.
alter table public.teams add column if not exists home_pitch_id uuid;

create or replace function public.update_team_settings(
  p_team_id uuid,
  p_name text default null,
  p_short_name text default null,
  p_color1 text default null,
  p_color2 text default null,
  p_crest text default null,
  p_home_pitch_id uuid default null,
  p_pitch text default null,
  p_coordinates jsonb default null
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'UNAUTHORIZED: oturum yok'; end if;
  if not public._is_team_admin(p_team_id, v_uid) then
    raise exception 'FORBIDDEN: Yalniz takim yoneticisi.';
  end if;
  update public.teams set
    name          = coalesce(nullif(btrim(p_name), ''), name),
    "shortName"   = coalesce(p_short_name, "shortName"),
    color1        = coalesce(p_color1, color1),
    color2        = coalesce(p_color2, color2),
    crest         = coalesce(p_crest, crest),
    home_pitch_id = coalesce(p_home_pitch_id, home_pitch_id),
    pitch         = coalesce(p_pitch, pitch),
    coordinates   = coalesce(p_coordinates, coordinates)
  where id = p_team_id;
end; $$;

revoke execute on function public.update_team_settings(uuid, text, text, text, text, text, uuid, text, jsonb) from public, anon;
grant execute on function public.update_team_settings(uuid, text, text, text, text, text, uuid, text, jsonb) to authenticated;
