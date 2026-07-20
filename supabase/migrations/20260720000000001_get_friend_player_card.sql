-- Sade oyuncu bilgi kartı için RLS-güvenli, arkadaş-kapılı veri kaynağı.
-- Sahadaki bir oyuncuya basınca kart bu RPC'den beslenir.
--   • Arkadaş değilse yalnız {is_friend:false} döner (yaş/ayak/fair play sızmaz — "veri temizliği").
--   • Yaş birthdate'ten HESAPLANIR; ham doğum tarihi asla dönmez (PII sertleştirmesi).
--   • matches_together = iki kullanıcının birlikte yer aldığı TAMAMLANMIŞ maç sayısı (gerçek sayım).
create or replace function public.get_friend_player_card(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_is_self boolean;
  v_is_friend boolean;
  v_prof record;
  v_together int;
begin
  if v_uid is null then raise exception 'UNAUTHORIZED'; end if;
  if p_user_id is null then raise exception 'NOT_FOUND'; end if;
  v_is_self := (p_user_id = v_uid);

  v_is_friend := v_is_self or exists (
    select 1 from public.friendships f
    where upper(coalesce(f.status,'')) = 'ACCEPTED'
      and (
        (f.sender_id = v_uid and f.receiver_id = p_user_id) or
        (f.sender_id = p_user_id and f.receiver_id = v_uid) or
        (f.requester_id = v_uid and f.addressee_id = p_user_id) or
        (f.requester_id = p_user_id and f.addressee_id = v_uid)
      )
  );

  if not v_is_friend then
    return jsonb_build_object('is_friend', false, 'is_self', false);
  end if;

  select p.name, p.birthdate, p.preferred_foot, p.reliability_score, p.match_count
    into v_prof
  from public.profiles p where p.id = p_user_id;
  if not found then raise exception 'NOT_FOUND'; end if;

  select count(distinct mp1.match_id) into v_together
  from public.match_participants mp1
  join public.match_participants mp2
    on mp2.match_id = mp1.match_id and mp2.user_id = p_user_id
  join public.matches m on m.id = mp1.match_id
  where mp1.user_id = v_uid
    and upper(coalesce(m.status,'')) in ('COMPLETED','FINISHED','SCORED');

  return jsonb_build_object(
    'is_friend', true,
    'is_self', v_is_self,
    'name', v_prof.name,
    'age', case when v_prof.birthdate is not null
                then date_part('year', age(v_prof.birthdate))::int end,
    'preferred_foot', nullif(v_prof.preferred_foot, ''),
    'fair_play', v_prof.reliability_score,
    'matches_together', coalesce(v_together, 0),
    'total_matches', coalesce(v_prof.match_count, 0)
  );
end;
$function$;

grant execute on function public.get_friend_player_card(uuid) to authenticated;
