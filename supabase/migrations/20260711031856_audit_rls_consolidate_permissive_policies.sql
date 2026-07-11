-- OYNA SQL denetimi (2026-07-11) — çakışan permissive RLS politikalarının birleştirilmesi
-- (danışman: multiple_permissive_policies). Her birleştirme mevcut politikaların
-- OR'lanmış karşılığıdır; politika sayısı ve satır başına değerlendirme maliyeti düşer.
-- auth.uid() çağrıları initplan dostu (select auth.uid()) biçimine çevrildi.
-- NOT: is_super_admin() çift imzalı (overload) olduğundan açık imza kullanıldı;
-- uuid'li sürüm admin_team_members SUPER_ADMIN kayıtlarını da tanır (güncel RBAC).
-- NOT: goalkeepers/referees SELECT birleşimi bir sonraki migration'da
-- (audit_rls_fix_anon_function_privilege) rol bazında anon/authenticated olarak ayrıldı.

-- goalkeepers: 3 SELECT politikası → 1
drop policy if exists "Public read goalkeepers" on public.goalkeepers;
drop policy if exists "goalkeepers_select_admin_demo" on public.goalkeepers;
drop policy if exists "goalkeepers_select_own" on public.goalkeepers;
create policy goalkeepers_select on public.goalkeepers for select to public using (
  ((verification_status = 'approved') and (("isDemo" is not true) or get_config_bool('demo_mode_enabled')))
  or (id = (select auth.uid()))
  or is_platform_admin()
);

-- referees: 3 SELECT politikası → 1
drop policy if exists "Public read referees" on public.referees;
drop policy if exists "referees_select_admin_demo" on public.referees;
drop policy if exists "referees_select_own" on public.referees;
create policy referees_select on public.referees for select to public using (
  ((verification_status = 'approved') and (("isDemo" is not true) or get_config_bool('demo_mode_enabled')))
  or (id = (select auth.uid()))
  or is_platform_admin()
);

-- user_reports: ALL(admin) + SELECT(own) + INSERT(own) çakışması → komut başına tek politika
drop policy if exists "Admins manage user_reports" on public.user_reports;
drop policy if exists "Reporters view own reports" on public.user_reports;
drop policy if exists "Users create own reports" on public.user_reports;
create policy user_reports_select on public.user_reports for select to public
  using (reporter_id = (select auth.uid()) or is_platform_admin());
create policy user_reports_insert on public.user_reports for insert to public
  with check ((((select auth.uid()) is not null) and reporter_id = (select auth.uid())) or is_platform_admin());
create policy user_reports_update on public.user_reports for update to public
  using (is_platform_admin()) with check (is_platform_admin());
create policy user_reports_delete on public.user_reports for delete to public
  using (is_platform_admin());

-- settings: ALL(platform admin) + komut başına super_admin politikaları çakışması →
-- SELECT'i mevcut public politikası (settings_select_public, USING true) karşılıyor;
-- yazma komutları admin VEYA super_admin birleşimiyle tek politikaya iner.
drop policy if exists settings_admin_all on public.settings;
drop policy if exists settings_insert_superadmin on public.settings;
drop policy if exists settings_update_superadmin on public.settings;
drop policy if exists settings_delete_superadmin on public.settings;
create policy settings_insert_admin on public.settings for insert to authenticated
  with check (is_platform_admin() or public.is_super_admin((select auth.uid())));
create policy settings_update_admin on public.settings for update to authenticated
  using (is_platform_admin() or public.is_super_admin((select auth.uid())))
  with check (is_platform_admin() or public.is_super_admin((select auth.uid())));
create policy settings_delete_admin on public.settings for delete to authenticated
  using (is_platform_admin() or public.is_super_admin((select auth.uid())));

-- teams: UPDATE ve DELETE'te ikişer çakışan politika → birleşim (kaptan ∪ takım admini ∪ admin)
drop policy if exists teams_delete_admin_only on public.teams;
drop policy if exists teams_delete_captain_or_admin on public.teams;
create policy teams_delete on public.teams for delete to authenticated
  using (((select auth.uid()) = captain_id) or is_admin() or is_platform_admin());
drop policy if exists teams_update_admin on public.teams;
drop policy if exists teams_update_captain_or_admin on public.teams;
create policy teams_update on public.teams for update to authenticated
  using (((select auth.uid()) = captain_id) or _is_team_admin(id, (select auth.uid())) or is_admin() or is_platform_admin())
  with check (((select auth.uid()) = captain_id) or _is_team_admin(id, (select auth.uid())) or is_admin() or is_platform_admin());
-- NOT: teams üzerinde SELECT'te "teams_select_public (USING true)" ile
-- "teams_select_visibility" çakışması bilinçli bir ürün kararı gerektirdiğinden
-- (gizli takımlar herkese görünür mü?) bu migration'da DOKUNULMADI — denetim raporuna bakınız.
