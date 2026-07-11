-- [DB GEÇMİŞİNDEN KURTARILDI 2026-07-11] Bu migration canlı veritabanına uygulanmıştı ancak repoda dosyası yoktu; supabase_migrations.schema_migrations.statements kolonundan geri çıkarıldı.

-- Çoklu permissive politika temizliği.
-- Desen: "FOR ALL yönetim politikası" + ayrı bir SELECT politikası aynı SELECT'i iki kez
-- değerlendiriyordu. Yönetim politikaları yalnızca yazma komutlarına indirildi; her
-- (rol, aksiyon) için tek permissive politika kaldı. Yetki mantığı korundu.

-- ========== courts ==========
drop policy if exists "courts_manage" on public.courts;
create policy "courts_write_insert" on public.courts for insert to authenticated
  with check ((exists (select 1 from pitches p where p.id = courts.pitch_id and p.owner_id = (select auth.uid()))) or is_admin());
create policy "courts_write_update" on public.courts for update to authenticated
  using ((exists (select 1 from pitches p where p.id = courts.pitch_id and p.owner_id = (select auth.uid()))) or is_admin())
  with check ((exists (select 1 from pitches p where p.id = courts.pitch_id and p.owner_id = (select auth.uid()))) or is_admin());
create policy "courts_write_delete" on public.courts for delete to authenticated
  using ((exists (select 1 from pitches p where p.id = courts.pitch_id and p.owner_id = (select auth.uid()))) or is_admin());

-- ========== individual_matches ==========
drop policy if exists "individual_matches_manage_admin" on public.individual_matches;
create policy "individual_matches_insert_admin" on public.individual_matches for insert to authenticated with check (is_admin());
create policy "individual_matches_update_admin" on public.individual_matches for update to authenticated using (is_admin()) with check (is_admin());
create policy "individual_matches_delete_admin" on public.individual_matches for delete to authenticated using (is_admin());

-- ========== match_registrations ==========
drop policy if exists "match_registrations_manage_admin" on public.match_registrations;
create policy "match_registrations_insert_admin" on public.match_registrations for insert to authenticated with check (is_admin());
create policy "match_registrations_update_admin" on public.match_registrations for update to authenticated using (is_admin()) with check (is_admin());
create policy "match_registrations_delete_admin" on public.match_registrations for delete to authenticated using (is_admin());

-- ========== notification_templates ==========
drop policy if exists "notification_templates_manage_admin" on public.notification_templates;
create policy "notification_templates_insert_admin" on public.notification_templates for insert to authenticated with check (is_admin());
create policy "notification_templates_update_admin" on public.notification_templates for update to authenticated using (is_admin()) with check (is_admin());
create policy "notification_templates_delete_admin" on public.notification_templates for delete to authenticated using (is_admin());

-- ========== pitch_availability_exceptions ==========
drop policy if exists "pitch_exceptions_manage" on public.pitch_availability_exceptions;
create policy "pitch_exceptions_insert" on public.pitch_availability_exceptions for insert to authenticated
  with check ((exists (select 1 from pitches where pitches.id = pitch_availability_exceptions.pitch_id and pitches.owner_id = (select auth.uid()))) or is_admin());
create policy "pitch_exceptions_update" on public.pitch_availability_exceptions for update to authenticated
  using ((exists (select 1 from pitches where pitches.id = pitch_availability_exceptions.pitch_id and pitches.owner_id = (select auth.uid()))) or is_admin())
  with check ((exists (select 1 from pitches where pitches.id = pitch_availability_exceptions.pitch_id and pitches.owner_id = (select auth.uid()))) or is_admin());
create policy "pitch_exceptions_delete" on public.pitch_availability_exceptions for delete to authenticated
  using ((exists (select 1 from pitches where pitches.id = pitch_availability_exceptions.pitch_id and pitches.owner_id = (select auth.uid()))) or is_admin());

-- ========== pitch_flash_deals ==========
drop policy if exists "pitch_flash_deals_manage" on public.pitch_flash_deals;
create policy "pitch_flash_deals_insert" on public.pitch_flash_deals for insert to authenticated
  with check ((exists (select 1 from pitches where pitches.id = pitch_flash_deals.pitch_id and pitches.owner_id = (select auth.uid()))) or is_admin());
create policy "pitch_flash_deals_update" on public.pitch_flash_deals for update to authenticated
  using ((exists (select 1 from pitches where pitches.id = pitch_flash_deals.pitch_id and pitches.owner_id = (select auth.uid()))) or is_admin())
  with check ((exists (select 1 from pitches where pitches.id = pitch_flash_deals.pitch_id and pitches.owner_id = (select auth.uid()))) or is_admin());
create policy "pitch_flash_deals_delete" on public.pitch_flash_deals for delete to authenticated
  using ((exists (select 1 from pitches where pitches.id = pitch_flash_deals.pitch_id and pitches.owner_id = (select auth.uid()))) or is_admin());

-- ========== pitch_tariffs ==========
drop policy if exists "pitch_tariffs_manage" on public.pitch_tariffs;
create policy "pitch_tariffs_insert" on public.pitch_tariffs for insert to authenticated
  with check ((exists (select 1 from pitches where pitches.id = pitch_tariffs.pitch_id and pitches.owner_id = (select auth.uid()))) or is_admin());
create policy "pitch_tariffs_update" on public.pitch_tariffs for update to authenticated
  using ((exists (select 1 from pitches where pitches.id = pitch_tariffs.pitch_id and pitches.owner_id = (select auth.uid()))) or is_admin())
  with check ((exists (select 1 from pitches where pitches.id = pitch_tariffs.pitch_id and pitches.owner_id = (select auth.uid()))) or is_admin());
create policy "pitch_tariffs_delete" on public.pitch_tariffs for delete to authenticated
  using ((exists (select 1 from pitches where pitches.id = pitch_tariffs.pitch_id and pitches.owner_id = (select auth.uid()))) or is_admin());

-- ========== settings ==========
drop policy if exists "settings_manage_superadmin" on public.settings;
create policy "settings_insert_superadmin" on public.settings for insert to authenticated with check (is_super_admin());
create policy "settings_update_superadmin" on public.settings for update to authenticated using (is_super_admin()) with check (is_super_admin());
create policy "settings_delete_superadmin" on public.settings for delete to authenticated using (is_super_admin());

-- ========== texts ==========
drop policy if exists "texts_manage_admin" on public.texts;
create policy "texts_insert_admin" on public.texts for insert to authenticated with check (is_admin());
create policy "texts_update_admin" on public.texts for update to authenticated using (is_admin()) with check (is_admin());
create policy "texts_delete_admin" on public.texts for delete to authenticated using (is_admin());

-- ========== waitlist ==========
drop policy if exists "waitlist_manage_admin" on public.waitlist;
create policy "waitlist_insert_admin" on public.waitlist for insert to authenticated with check (is_admin());
create policy "waitlist_update_admin" on public.waitlist for update to authenticated using (is_admin()) with check (is_admin());
create policy "waitlist_delete_admin" on public.waitlist for delete to authenticated using (is_admin());

-- ========== match_disputes (SELECT + INSERT birleştir) ==========
drop policy if exists "match_disputes_manage_admin" on public.match_disputes;
drop policy if exists "match_disputes_insert_own" on public.match_disputes;
drop policy if exists "match_disputes_select_own" on public.match_disputes;
create policy "match_disputes_select" on public.match_disputes for select to authenticated
  using ((raised_by = (select auth.uid())) or is_admin());
create policy "match_disputes_insert" on public.match_disputes for insert to authenticated
  with check ((raised_by = (select auth.uid())) or is_admin());
create policy "match_disputes_update_admin" on public.match_disputes for update to authenticated using (is_admin()) with check (is_admin());
create policy "match_disputes_delete_admin" on public.match_disputes for delete to authenticated using (is_admin());

-- ========== owner_withdrawal_requests (SELECT + INSERT birleştir) ==========
drop policy if exists "withdrawals_manage_superadmin" on public.owner_withdrawal_requests;
drop policy if exists "withdrawals_insert_owner" on public.owner_withdrawal_requests;
drop policy if exists "withdrawals_select_own" on public.owner_withdrawal_requests;
create policy "withdrawals_select" on public.owner_withdrawal_requests for select to authenticated
  using ((owner_id = (select auth.uid())) or is_super_admin());
create policy "withdrawals_insert" on public.owner_withdrawal_requests for insert to authenticated
  with check ((owner_id = (select auth.uid())) or is_super_admin());
create policy "withdrawals_update_superadmin" on public.owner_withdrawal_requests for update to authenticated using (is_super_admin()) with check (is_super_admin());
create policy "withdrawals_delete_superadmin" on public.owner_withdrawal_requests for delete to authenticated using (is_super_admin());

-- ========== pitch_bookings (yalnızca SELECT çiftti) ==========
drop policy if exists "Players view own bookings" on public.pitch_bookings;
drop policy if exists "pitch_bookings_select" on public.pitch_bookings;
create policy "pitch_bookings_select" on public.pitch_bookings for select to authenticated
  using ((user_id = (select auth.uid()))
         or (exists (select 1 from pitches p where p.id = pitch_bookings.pitch_id and p.owner_id = (select auth.uid())))
         or is_admin());

-- ========== pitch_subscriptions (SELECT birleştir) ==========
drop policy if exists "pitch_subscriptions_manage" on public.pitch_subscriptions;
drop policy if exists "pitch_subscriptions_select_own" on public.pitch_subscriptions;
create policy "pitch_subscriptions_select" on public.pitch_subscriptions for select to authenticated
  using ((user_id = (select auth.uid()))
         or (exists (select 1 from pitches p where p.id = pitch_subscriptions.pitch_id and p.owner_id = (select auth.uid())))
         or is_admin());
create policy "pitch_subscriptions_insert" on public.pitch_subscriptions for insert to authenticated
  with check ((exists (select 1 from pitches p where p.id = pitch_subscriptions.pitch_id and p.owner_id = (select auth.uid()))) or is_admin());
create policy "pitch_subscriptions_update" on public.pitch_subscriptions for update to authenticated
  using ((exists (select 1 from pitches p where p.id = pitch_subscriptions.pitch_id and p.owner_id = (select auth.uid()))) or is_admin())
  with check ((exists (select 1 from pitches p where p.id = pitch_subscriptions.pitch_id and p.owner_id = (select auth.uid()))) or is_admin());
create policy "pitch_subscriptions_delete" on public.pitch_subscriptions for delete to authenticated
  using ((exists (select 1 from pitches p where p.id = pitch_subscriptions.pitch_id and p.owner_id = (select auth.uid()))) or is_admin());

-- ========== profiles (yalnızca UPDATE çiftti) ==========
drop policy if exists "profiles_update_admin" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update" on public.profiles for update to authenticated
  using (((select auth.uid()) = id) or is_admin())
  with check (((select auth.uid()) = id) or is_admin());

-- ========== match_participants (SELECT/INSERT/DELETE birleştir) ==========
drop policy if exists "Captains can manage their match participants" on public.match_participants;
drop policy if exists "Users can leave matches" on public.match_participants;
drop policy if exists "Users can join matches" on public.match_participants;
create policy "match_participants_insert" on public.match_participants for insert to authenticated
  with check (((select auth.uid()) = user_id)
              or (exists (select 1 from matches m where m.id = match_participants.match_id and m."creatorId" = (select auth.uid()))));
create policy "match_participants_update_captain" on public.match_participants for update to authenticated
  using (exists (select 1 from matches m where m.id = match_participants.match_id and m."creatorId" = (select auth.uid())))
  with check (exists (select 1 from matches m where m.id = match_participants.match_id and m."creatorId" = (select auth.uid())));
create policy "match_participants_delete" on public.match_participants for delete to authenticated
  using (((select auth.uid()) = user_id)
         or (exists (select 1 from matches m where m.id = match_participants.match_id and m."creatorId" = (select auth.uid()))));

-- ========== match_tactics ==========
drop policy if exists "mt_write_authenticated" on public.match_tactics;
create policy "mt_insert" on public.match_tactics for insert to public with check ((select auth.role()) = 'authenticated');
create policy "mt_update" on public.match_tactics for update to public using ((select auth.role()) = 'authenticated') with check ((select auth.role()) = 'authenticated');
create policy "mt_delete" on public.match_tactics for delete to public using ((select auth.role()) = 'authenticated');

-- ========== tactics ==========
drop policy if exists "tactics_write_own" on public.tactics;
create policy "tactics_insert" on public.tactics for insert to public with check ((select auth.uid()) = "userId");
create policy "tactics_update" on public.tactics for update to public using ((select auth.uid()) = "userId") with check ((select auth.uid()) = "userId");
create policy "tactics_delete" on public.tactics for delete to public using ((select auth.uid()) = "userId");

-- ========== pitch_slot_holds ==========
drop policy if exists "Users manage own holds" on public.pitch_slot_holds;
create policy "slot_holds_insert" on public.pitch_slot_holds for insert to public with check (held_by = (select auth.uid()));
create policy "slot_holds_update" on public.pitch_slot_holds for update to public using (held_by = (select auth.uid())) with check (held_by = (select auth.uid()));
create policy "slot_holds_delete" on public.pitch_slot_holds for delete to public using (held_by = (select auth.uid()));
