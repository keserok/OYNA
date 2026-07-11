-- [DB GEÇMİŞİNDEN KURTARILDI 2026-07-11] Bu migration canlı veritabanına uygulanmıştı ancak repoda dosyası yoktu; supabase_migrations.schema_migrations.statements kolonundan geri çıkarıldı.

-- Çoklu-slot satın alma + arkadaşa/koda atama — matches.slots (jsonb) üzerinde.
-- Hepsi SECURITY DEFINER + auth.uid() kontrollü; mevcut process_match_payment /
-- send_match_invite ile uyumlu. Slot durumu hep 'TAKEN' kalır (kontenjan doğru);
-- atama yalnız 'player/occupant'ı değiştirir.

-- 1) Çoklu slot satın al (kontenjana kadar) — ödeme = adet × fiyat
create or replace function public.player_buy_slots(p_match_id uuid, p_slot_ids text[])
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare
  v_uid uuid := auth.uid();
  v_slots jsonb; v_price numeric; v_count int := 0; v_total numeric;
  v_player jsonb; v_sid text; v_slot jsonb;
begin
  if v_uid is null then raise exception 'UNAUTHORIZED'; end if;
  select slots, price into v_slots, v_price from public.matches where id = p_match_id for update;
  if v_slots is null then raise exception 'NOT_FOUND: Maç bulunamadı'; end if;

  foreach v_sid in array p_slot_ids loop
    select s into v_slot from jsonb_array_elements(v_slots) s where s->>'id' = v_sid;
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
    v_slots := (select jsonb_agg(case when s->>'id' = v_sid
        then s || jsonb_build_object('status','TAKEN','player',v_player,
             'purchasedBy', v_uid::text, 'occupant', v_uid::text, 'assignmentStatus','SELF')
        else s end) from jsonb_array_elements(v_slots) s);
  end loop;
  update public.matches set slots = v_slots where id = p_match_id;
  return jsonb_build_object('ok', true, 'count', v_count, 'total', v_total);
end; $$;

-- 2) Satın alınan slotu arkadaşa ata (davet) — slotta hâlâ alıcı görünür, 'davet edildi'
create or replace function public.player_assign_slot(p_match_id uuid, p_slot_id text, p_friend_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_uid uuid := auth.uid(); v_slots jsonb; v_slot jsonb;
begin
  if v_uid is null then raise exception 'UNAUTHORIZED'; end if;
  select slots into v_slots from public.matches where id = p_match_id for update;
  select s into v_slot from jsonb_array_elements(v_slots) s where s->>'id' = p_slot_id;
  if v_slot is null then raise exception 'SLOT_NOT_FOUND'; end if;
  if (v_slot->>'purchasedBy') is distinct from v_uid::text then raise exception 'NOT_OWNER: Bu slotu sen almadın'; end if;
  if coalesce(v_slot->>'assignmentStatus','SELF') = 'ACCEPTED' then raise exception 'ALREADY_ASSIGNED'; end if;

  v_slots := (select jsonb_agg(case when s->>'id' = p_slot_id
      then s || jsonb_build_object('assignmentStatus','INVITED','inviteeId', p_friend_id::text)
      else s end) from jsonb_array_elements(v_slots) s);
  update public.matches set slots = v_slots where id = p_match_id;
  perform public.send_match_invite(p_match_id, p_friend_id, v_uid, null);
  return jsonb_build_object('ok', true);
end; $$;

-- 3) Slot için paylaşılabilir devralma kodu üret
create or replace function public.player_make_slot_code(p_match_id uuid, p_slot_id text)
returns text language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_uid uuid := auth.uid(); v_slots jsonb; v_slot jsonb; v_code text;
begin
  if v_uid is null then raise exception 'UNAUTHORIZED'; end if;
  select slots into v_slots from public.matches where id = p_match_id for update;
  select s into v_slot from jsonb_array_elements(v_slots) s where s->>'id' = p_slot_id;
  if v_slot is null then raise exception 'SLOT_NOT_FOUND'; end if;
  if (v_slot->>'purchasedBy') is distinct from v_uid::text then raise exception 'NOT_OWNER'; end if;
  if coalesce(v_slot->>'assignmentStatus','SELF') = 'ACCEPTED' then raise exception 'ALREADY_ASSIGNED'; end if;

  v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
  v_slots := (select jsonb_agg(case when s->>'id' = p_slot_id
      then s || jsonb_build_object('assignmentStatus','LINK_PENDING','claimCode', v_code)
      else s end) from jsonb_array_elements(v_slots) s);
  update public.matches set slots = v_slots where id = p_match_id;
  return v_code;
end; $$;

-- 4) Davet edilen arkadaş slotu kabul eder → slotta arkadaş görünür
create or replace function public.player_accept_slot(p_match_id uuid, p_slot_id text)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_uid uuid := auth.uid(); v_slots jsonb; v_slot jsonb; v_player jsonb;
begin
  if v_uid is null then raise exception 'UNAUTHORIZED'; end if;
  select slots into v_slots from public.matches where id = p_match_id for update;
  select s into v_slot from jsonb_array_elements(v_slots) s where s->>'id' = p_slot_id;
  if v_slot is null then raise exception 'SLOT_NOT_FOUND'; end if;
  if (v_slot->>'inviteeId') is distinct from v_uid::text then raise exception 'NOT_INVITED: Bu slota davet edilmedin'; end if;

  select jsonb_build_object('id', id, 'name', coalesce(name, full_name, 'Oyuncu'),
    'avatar', coalesce(avatar_url,''), 'rating', coalesce(rating,4.5), 'position', coalesce(v_slot->>'role','')
  ) into v_player from public.profiles where id = v_uid;

  v_slots := (select jsonb_agg(case when s->>'id' = p_slot_id
      then (s - 'inviteeId') || jsonb_build_object('status','TAKEN','player',v_player,'occupant', v_uid::text,'assignmentStatus','ACCEPTED')
      else s end) from jsonb_array_elements(v_slots) s);
  update public.matches set slots = v_slots where id = p_match_id;
  return jsonb_build_object('ok', true);
end; $$;

-- 5) Kodla slot devralma (kayıtlı olmayan da kaydolduktan sonra çağırır)
create or replace function public.player_claim_slot_code(p_code text)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_uid uuid := auth.uid(); v_match record; v_slots jsonb; v_slot jsonb; v_sid text; v_player jsonb;
begin
  if v_uid is null then raise exception 'UNAUTHORIZED'; end if;
  select id, slots into v_match from public.matches
    where slots @> jsonb_build_array(jsonb_build_object('claimCode', p_code)) for update;
  if v_match.id is null then raise exception 'INVALID_CODE: Kod geçersiz veya kullanılmış'; end if;
  v_slots := v_match.slots;
  select s->>'id' into v_sid from jsonb_array_elements(v_slots) s where s->>'claimCode' = p_code limit 1;

  select jsonb_build_object('id', id, 'name', coalesce(name, full_name, 'Oyuncu'),
    'avatar', coalesce(avatar_url,''), 'rating', coalesce(rating,4.5), 'position', ''
  ) into v_player from public.profiles where id = v_uid;

  v_slots := (select jsonb_agg(case when s->>'id' = v_sid
      then (s - 'claimCode') || jsonb_build_object('status','TAKEN','player',v_player,'occupant', v_uid::text,'assignmentStatus','ACCEPTED')
      else s end) from jsonb_array_elements(v_slots) s);
  update public.matches set slots = v_slots where id = v_match.id;
  return jsonb_build_object('ok', true, 'match_id', v_match.id);
end; $$;

grant execute on function public.player_buy_slots(uuid, text[]) to authenticated;
grant execute on function public.player_assign_slot(uuid, text, uuid) to authenticated;
grant execute on function public.player_make_slot_code(uuid, text) to authenticated;
grant execute on function public.player_accept_slot(uuid, text) to authenticated;
grant execute on function public.player_claim_slot_code(text) to authenticated;
