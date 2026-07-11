-- [DB GEÇMİŞİNDEN KURTARILDI 2026-07-11] Bu migration canlı veritabanına uygulanmıştı ancak repoda dosyası yoktu; supabase_migrations.schema_migrations.statements kolonundan geri çıkarıldı.

-- RLS Initialization Plan optimizasyonu:
-- auth.uid()/auth.role() çağrılarını (select ...) ile sararak her satırda
-- yeniden hesaplanmalarını önler. Mantık birebir korunur, yalnızca performans iyileşir.

-- friendships
drop policy if exists "fr_delete_participant" on public.friendships;
create policy "fr_delete_participant" on public.friendships for delete to public
  using (((select auth.uid()) = sender_id) or ((select auth.uid()) = receiver_id));
drop policy if exists "fr_insert_sender" on public.friendships;
create policy "fr_insert_sender" on public.friendships for insert to public
  with check ((select auth.uid()) = sender_id);
drop policy if exists "fr_select_participant" on public.friendships;
create policy "fr_select_participant" on public.friendships for select to public
  using (((select auth.uid()) = sender_id) or ((select auth.uid()) = receiver_id));
drop policy if exists "fr_update_participant" on public.friendships;
create policy "fr_update_participant" on public.friendships for update to public
  using (((select auth.uid()) = sender_id) or ((select auth.uid()) = receiver_id));

-- goalkeepers
drop policy if exists "Users can insert their own goalkeeper profile." on public.goalkeepers;
create policy "Users can insert their own goalkeeper profile." on public.goalkeepers for insert to public
  with check ((select auth.uid()) = id);
drop policy if exists "Users can update their own goalkeeper profile." on public.goalkeepers;
create policy "Users can update their own goalkeeper profile." on public.goalkeepers for update to public
  using ((select auth.uid()) = id);

-- referees
drop policy if exists "Users can insert their own referee profile." on public.referees;
create policy "Users can insert their own referee profile." on public.referees for insert to public
  with check ((select auth.uid()) = id);
drop policy if exists "Users can update their own referee profile." on public.referees;
create policy "Users can update their own referee profile." on public.referees for update to public
  using ((select auth.uid()) = id);

-- match_participants
drop policy if exists "Captains can manage their match participants" on public.match_participants;
create policy "Captains can manage their match participants" on public.match_participants for all to authenticated
  using (exists (select 1 from matches m where m.id = match_participants.match_id and m."creatorId" = (select auth.uid())));
drop policy if exists "Users can leave matches" on public.match_participants;
create policy "Users can leave matches" on public.match_participants for delete to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "Users can join matches" on public.match_participants;
create policy "Users can join matches" on public.match_participants for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- service_offers
drop policy if exists "Captains can create offers" on public.service_offers;
create policy "Captains can create offers" on public.service_offers for insert to public
  with check ((select auth.uid()) = captain_id);
drop policy if exists "Anyone can view their own offers" on public.service_offers;
create policy "Anyone can view their own offers" on public.service_offers for select to public
  using (((select auth.uid()) = provider_id) or ((select auth.uid()) = captain_id));
drop policy if exists "Providers can update their offers" on public.service_offers;
create policy "Providers can update their offers" on public.service_offers for update to public
  using ((select auth.uid()) = provider_id);

-- player_ratings
drop policy if exists "player_ratings_insert" on public.player_ratings;
create policy "player_ratings_insert" on public.player_ratings for insert to public
  with check ((select auth.uid()) = rater_id);

-- wallet_transactions
drop policy if exists "wallet_select_own" on public.wallet_transactions;
create policy "wallet_select_own" on public.wallet_transactions for select to public
  using ((select auth.uid()) = user_id);

-- tactics
drop policy if exists "tactics_write_own" on public.tactics;
create policy "tactics_write_own" on public.tactics for all to public
  using ((select auth.uid()) = "userId")
  with check ((select auth.uid()) = "userId");
drop policy if exists "tactics_select_own" on public.tactics;
create policy "tactics_select_own" on public.tactics for select to public
  using ((select auth.uid()) = "userId");

-- match_tactics
drop policy if exists "mt_write_authenticated" on public.match_tactics;
create policy "mt_write_authenticated" on public.match_tactics for all to public
  using ((select auth.role()) = 'authenticated')
  with check ((select auth.role()) = 'authenticated');

-- team_members
drop policy if exists "tm_insert_self_or_captain" on public.team_members;
create policy "tm_insert_self_or_captain" on public.team_members for insert to public
  with check ((user_id = (select auth.uid())) or (exists (select 1 from teams t where t.id = team_members.team_id and t.captain_id = (select auth.uid()))));
drop policy if exists "tm_update_captain" on public.team_members;
create policy "tm_update_captain" on public.team_members for update to public
  using (exists (select 1 from teams t where t.id = team_members.team_id and t.captain_id = (select auth.uid())));
drop policy if exists "tm_delete_self_or_captain" on public.team_members;
create policy "tm_delete_self_or_captain" on public.team_members for delete to public
  using ((user_id = (select auth.uid())) or (exists (select 1 from teams t where t.id = team_members.team_id and t.captain_id = (select auth.uid()))));

-- pitch_slot_holds
drop policy if exists "Users manage own holds" on public.pitch_slot_holds;
create policy "Users manage own holds" on public.pitch_slot_holds for all to public
  using (held_by = (select auth.uid()))
  with check (held_by = (select auth.uid()));

-- push_log
drop policy if exists "Users can view own push logs" on public.push_log;
create policy "Users can view own push logs" on public.push_log for select to authenticated
  using ((select auth.uid()) = user_id);
