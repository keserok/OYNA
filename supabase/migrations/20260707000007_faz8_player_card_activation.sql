-- FAZ 8 (oyuncu): Premium oyuncu kartı admin-aktifli + admin-atamalı tier.
-- Varsayılan: kart kapalı (sade profil: foto + mevki + bio + oynanan maçlar).
-- Admin aktive edince premium kart açılır ve tier (bronze/silver/gold) atanır.
alter table public.profiles
  add column if not exists card_active boolean not null default false,
  add column if not exists card_tier text;

do $$ begin
  alter table public.profiles add constraint profiles_card_tier_chk
    check (card_tier is null or card_tier in ('bronze','silver','gold'));
exception when duplicate_object then null; end $$;

create or replace function public.admin_set_player_card(p_user_id uuid, p_active boolean, p_tier text default null)
returns void language plpgsql security definer set search_path to 'public','pg_temp' as $$
begin
  if not public.is_admin() then raise exception 'UNAUTHORIZED: yalnız admin'; end if;
  if p_tier is not null and p_tier not in ('bronze','silver','gold') then raise exception 'INVALID_TIER'; end if;
  update public.profiles
    set card_active = p_active,
        card_tier = case when p_active then coalesce(p_tier, card_tier, 'bronze') else null end
    where id = p_user_id;
end; $$;

revoke execute on function public.admin_set_player_card(uuid, boolean, text) from public, anon;
grant execute on function public.admin_set_player_card(uuid, boolean, text) to authenticated;
