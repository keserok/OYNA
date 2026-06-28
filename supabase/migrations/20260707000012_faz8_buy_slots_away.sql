-- FAZ 8 (oyuncu) S38: player_buy_slots artık hem ev sahibi (slots) hem rakip (awaySlots)
-- tarafındaki slotları dinamik satın alabilir. Rakip takım kodla maça girip away slotlarını öder.
-- Tek kişi birden çok slot ödeyebilir (kaptan şartı yok); minimum, çağıran tarafça belirlenir.
create or replace function public.player_buy_slots(p_match_id uuid, p_slot_ids text[])
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare
  v_uid uuid := auth.uid();
  v_slots jsonb; v_away jsonb; v_price numeric; v_count int := 0; v_total numeric;
  v_player jsonb; v_sid text; v_slot jsonb;
begin
  if v_uid is null then raise exception 'UNAUTHORIZED'; end if;
  select slots, "awaySlots", price into v_slots, v_away, v_price from public.matches where id = p_match_id for update;
  if v_slots is null then raise exception 'NOT_FOUND: Maç bulunamadı'; end if;
  v_away := coalesce(v_away, '[]'::jsonb);

  -- Doğrulama: her slot iki diziden birinde ve OPEN olmalı
  foreach v_sid in array p_slot_ids loop
    select s into v_slot from jsonb_array_elements(v_slots) s where s->>'id' = v_sid;
    if v_slot is null then
      select s into v_slot from jsonb_array_elements(v_away) s where s->>'id' = v_sid;
    end if;
    if v_slot is null then raise exception 'SLOT_NOT_FOUND: %', v_sid; end if;
    if coalesce(v_slot->>'status','OPEN') <> 'OPEN' then raise exception 'SLOT_TAKEN: % dolu', v_sid; end if;
    v_count := v_count + 1;
  end loop;
  if v_count = 0 then raise exception 'NO_SLOTS: En az bir slot seç'; end if;

  v_total := coalesce(v_price,0) * v_count;
  if v_total > 0 then perform public.process_match_payment(v_uid, p_match_id, v_total); end if;

  select jsonb_build_object(
    'id', id, 'name', coalesce(name, full_name, 'Oyuncu'),
    'avatar', coalesce(avatar_url,''), 'rating', coalesce(rating, 4.5), 'position', ''
  ) into v_player from public.profiles where id = v_uid;

  foreach v_sid in array p_slot_ids loop
    v_slots := coalesce((select jsonb_agg(case when s->>'id' = v_sid
        then s || jsonb_build_object('status','TAKEN','player',v_player,
             'purchasedBy', v_uid::text, 'occupant', v_uid::text, 'assignmentStatus','SELF')
        else s end) from jsonb_array_elements(v_slots) s), '[]'::jsonb);
    v_away := coalesce((select jsonb_agg(case when s->>'id' = v_sid
        then s || jsonb_build_object('status','TAKEN','player',v_player,
             'purchasedBy', v_uid::text, 'occupant', v_uid::text, 'assignmentStatus','SELF')
        else s end) from jsonb_array_elements(v_away) s), '[]'::jsonb);
  end loop;
  update public.matches set slots = v_slots, "awaySlots" = v_away where id = p_match_id;
  return jsonb_build_object('ok', true, 'count', v_count, 'total', v_total);
end; $$;

revoke execute on function public.player_buy_slots(uuid, text[]) from public, anon;
grant execute on function public.player_buy_slots(uuid, text[]) to authenticated;
