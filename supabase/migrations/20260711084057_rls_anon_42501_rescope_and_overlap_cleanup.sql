-- ════════════════════════════════════════════════════════════════════════
-- SQL denetimi faz 2 (2026-07-11): iki desen hatasının toplu temizliği.
--
-- Desen 1 — "public rolünde admin fonksiyonu": anon'un EXECUTE yetkisi olmayan
--   is_platform_admin()/is_admin()/has_role() çağıran politikalar misafir
--   sorgularını RLS reddi yerine 42501 hatasıyla kırıyordu → politika ilgili
--   role (authenticated / anon-authenticated ayrımı) daraltıldı. Anlam değişmez:
--   anon bu satırlara zaten erişemiyordu (hata alarak); şimdi temiz "erişim yok".
--
-- Desen 2 — "admin ALL + kullanıcı-kendi çakışması" (danışman:
--   multiple_permissive_policies): ALL politikası komut bazına indirilip
--   kullanıcı koşuluyla OR'lanarak tek permissive politikaya birleştirildi.
--   Erişim birleşimi birebir korunur.
-- ════════════════════════════════════════════════════════════════════════

-- ─── admin_audit_log ────────────────────────────────────────────────────────
drop policy if exists "Only admins can view audit logs" on public.admin_audit_log;
create policy audit_log_select_admin on public.admin_audit_log
  for select to authenticated using (is_platform_admin());

-- ─── admin_ghost_sessions ───────────────────────────────────────────────────
drop policy if exists ghost_sessions_select on public.admin_ghost_sessions;
create policy ghost_sessions_select on public.admin_ghost_sessions
  for select to authenticated using (is_platform_admin());

-- ─── admin_team_members ─────────────────────────────────────────────────────
drop policy if exists admin_team_platform_admin on public.admin_team_members;
create policy admin_team_platform_admin on public.admin_team_members
  for all to authenticated using (is_platform_admin()) with check (is_platform_admin());

-- ─── courts: yazma politikaları authenticated'a (SELECT 'true' herkese kalır) ─
drop policy if exists courts_write_insert on public.courts;
create policy courts_write_insert on public.courts for insert to authenticated
  with check ((exists (select 1 from public.pitches p
    where p.id = courts.pitch_id
      and (p.owner_id = (select auth.uid()) or (p.is_demo = true and has_role('OWNER')))))
    or is_admin());
drop policy if exists courts_write_update on public.courts;
create policy courts_write_update on public.courts for update to authenticated
  using ((exists (select 1 from public.pitches p
    where p.id = courts.pitch_id
      and (p.owner_id = (select auth.uid()) or (p.is_demo = true and has_role('OWNER')))))
    or is_admin())
  with check ((exists (select 1 from public.pitches p
    where p.id = courts.pitch_id
      and (p.owner_id = (select auth.uid()) or (p.is_demo = true and has_role('OWNER')))))
    or is_admin());
drop policy if exists courts_write_delete on public.courts;
create policy courts_write_delete on public.courts for delete to authenticated
  using ((exists (select 1 from public.pitches p
    where p.id = courts.pitch_id
      and (p.owner_id = (select auth.uid()) or (p.is_demo = true and has_role('OWNER')))))
    or is_admin());

-- ─── match_service_offers ───────────────────────────────────────────────────
drop policy if exists mso_select_own on public.match_service_offers;
create policy mso_select_own on public.match_service_offers
  for select to authenticated
  using (provider_id = (select auth.uid()) or captain_id = (select auth.uid()) or is_platform_admin());

-- ─── matches: yazma authenticated'a, SELECT anon/auth ayrımıyla birleşik ────
drop policy if exists "Authenticated users can create matches" on public.matches;
create policy matches_insert on public.matches for insert to authenticated
  with check (((select auth.uid()) = captain_id) or (captain_id is null) or is_platform_admin());
drop policy if exists "Creators or platform admins can update matches" on public.matches;
create policy matches_update on public.matches for update to authenticated
  using (((select auth.uid()) = captain_id) or is_platform_admin());
drop policy if exists "Creators or platform admins can delete matches" on public.matches;
create policy matches_delete on public.matches for delete to authenticated
  using (((select auth.uid()) = captain_id) or is_platform_admin());
drop policy if exists matches_select_public on public.matches;
drop policy if exists matches_select_admin_demo on public.matches;
create policy matches_select_anon on public.matches for select to anon
  using (("isDemo" is not true) or get_config_bool('demo_mode_enabled'));
create policy matches_select_auth on public.matches for select to authenticated
  using ((("isDemo" is not true) or get_config_bool('demo_mode_enabled')) or is_platform_admin());

-- ─── pitch yönetim tabloları: ALL politikaları authenticated'a ──────────────
drop policy if exists "Owners manage pitch bank accounts" on public.pitch_bank_accounts;
create policy "Owners manage pitch bank accounts" on public.pitch_bank_accounts
  for all to authenticated
  using ((exists (select 1 from public.pitches p
    where p.id = pitch_bank_accounts.pitch_id
      and (p.owner_id = (select auth.uid()) or (p.is_demo = true and has_role('OWNER')))))
    or is_admin())
  with check ((exists (select 1 from public.pitches p
    where p.id = pitch_bank_accounts.pitch_id
      and (p.owner_id = (select auth.uid()) or (p.is_demo = true and has_role('OWNER')))))
    or is_admin());
drop policy if exists pitch_debtors_manage on public.pitch_debtors;
create policy pitch_debtors_manage on public.pitch_debtors
  for all to authenticated
  using ((exists (select 1 from public.pitches p
    where p.id = pitch_debtors.pitch_id
      and (p.owner_id = (select auth.uid()) or (p.is_demo = true and has_role('OWNER')))))
    or is_admin())
  with check ((exists (select 1 from public.pitches p
    where p.id = pitch_debtors.pitch_id
      and (p.owner_id = (select auth.uid()) or (p.is_demo = true and has_role('OWNER')))))
    or is_admin());
drop policy if exists pitch_expenses_manage on public.pitch_expenses;
create policy pitch_expenses_manage on public.pitch_expenses
  for all to authenticated
  using ((exists (select 1 from public.pitches p
    where p.id = pitch_expenses.pitch_id
      and (p.owner_id = (select auth.uid()) or (p.is_demo = true and has_role('OWNER')))))
    or is_admin())
  with check ((exists (select 1 from public.pitches p
    where p.id = pitch_expenses.pitch_id
      and (p.owner_id = (select auth.uid()) or (p.is_demo = true and has_role('OWNER')))))
    or is_admin());
drop policy if exists "Owners manage pitch staff" on public.pitch_staff_members;
create policy "Owners manage pitch staff" on public.pitch_staff_members
  for all to authenticated
  using ((exists (select 1 from public.pitches p
    where p.id = pitch_staff_members.pitch_id
      and (p.owner_id = (select auth.uid()) or (p.is_demo = true and has_role('OWNER')))))
    or is_admin())
  with check ((exists (select 1 from public.pitches p
    where p.id = pitch_staff_members.pitch_id
      and (p.owner_id = (select auth.uid()) or (p.is_demo = true and has_role('OWNER')))))
    or is_admin());
drop policy if exists "Owners manage pitch tasks" on public.pitch_staff_tasks;
create policy "Owners manage pitch tasks" on public.pitch_staff_tasks
  for all to authenticated
  using ((exists (select 1 from public.pitches p
    where p.id = pitch_staff_tasks.pitch_id
      and (p.owner_id = (select auth.uid()) or (p.is_demo = true and has_role('OWNER')))))
    or is_admin())
  with check ((exists (select 1 from public.pitches p
    where p.id = pitch_staff_tasks.pitch_id
      and (p.owner_id = (select auth.uid()) or (p.is_demo = true and has_role('OWNER')))))
    or is_admin());

-- ─── pitch_subscriptions: yazma üçlüsü authenticated'a ──────────────────────
drop policy if exists pitch_subscriptions_insert on public.pitch_subscriptions;
create policy pitch_subscriptions_insert on public.pitch_subscriptions for insert to authenticated
  with check ((exists (select 1 from public.pitches p
    where p.id = pitch_subscriptions.pitch_id
      and (p.owner_id = (select auth.uid()) or (p.is_demo = true and has_role('OWNER')))))
    or is_admin());
drop policy if exists pitch_subscriptions_update on public.pitch_subscriptions;
create policy pitch_subscriptions_update on public.pitch_subscriptions for update to authenticated
  using ((exists (select 1 from public.pitches p
    where p.id = pitch_subscriptions.pitch_id
      and (p.owner_id = (select auth.uid()) or (p.is_demo = true and has_role('OWNER')))))
    or is_admin())
  with check ((exists (select 1 from public.pitches p
    where p.id = pitch_subscriptions.pitch_id
      and (p.owner_id = (select auth.uid()) or (p.is_demo = true and has_role('OWNER')))))
    or is_admin());
drop policy if exists pitch_subscriptions_delete on public.pitch_subscriptions;
create policy pitch_subscriptions_delete on public.pitch_subscriptions for delete to authenticated
  using ((exists (select 1 from public.pitches p
    where p.id = pitch_subscriptions.pitch_id
      and (p.owner_id = (select auth.uid()) or (p.is_demo = true and has_role('OWNER')))))
    or is_admin());

-- ─── pitch_tariffs: yazma üçlüsü authenticated'a (SELECT herkese kalır) ─────
drop policy if exists pitch_tariffs_insert on public.pitch_tariffs;
create policy pitch_tariffs_insert on public.pitch_tariffs for insert to authenticated
  with check ((exists (select 1 from public.pitches p
    where p.id = pitch_tariffs.pitch_id
      and (p.owner_id = (select auth.uid()) or (p.is_demo = true and has_role('OWNER')))))
    or is_admin());
drop policy if exists pitch_tariffs_update on public.pitch_tariffs;
create policy pitch_tariffs_update on public.pitch_tariffs for update to authenticated
  using ((exists (select 1 from public.pitches p
    where p.id = pitch_tariffs.pitch_id
      and (p.owner_id = (select auth.uid()) or (p.is_demo = true and has_role('OWNER')))))
    or is_admin())
  with check ((exists (select 1 from public.pitches p
    where p.id = pitch_tariffs.pitch_id
      and (p.owner_id = (select auth.uid()) or (p.is_demo = true and has_role('OWNER')))))
    or is_admin());
drop policy if exists pitch_tariffs_delete on public.pitch_tariffs;
create policy pitch_tariffs_delete on public.pitch_tariffs for delete to authenticated
  using ((exists (select 1 from public.pitches p
    where p.id = pitch_tariffs.pitch_id
      and (p.owner_id = (select auth.uid()) or (p.is_demo = true and has_role('OWNER')))))
    or is_admin());

-- ─── promo_codes: SELECT anon/auth ayrımı (anon aktif promoları görebilir,
--     eskiden 42501 alıyordu) ─────────────────────────────────────────────────
drop policy if exists promo_codes_select on public.promo_codes;
create policy promo_codes_select_anon on public.promo_codes for select to anon
  using ((is_active = true) and (valid_until is null or valid_until > now()));
create policy promo_codes_select_auth on public.promo_codes for select to authenticated
  using (is_platform_admin() or ((is_active = true) and (valid_until is null or valid_until > now())));

-- ─── promo_redemptions ──────────────────────────────────────────────────────
drop policy if exists promo_redemptions_own on public.promo_redemptions;
create policy promo_redemptions_own on public.promo_redemptions for select to authenticated
  using ((user_id = (select auth.uid())) or is_platform_admin());

-- ─── app_config: admin ALL + public_read çakışması → rol/komut ayrımı ───────
drop policy if exists app_config_admin_all on public.app_config;
drop policy if exists app_config_public_read on public.app_config;
create policy app_config_select_anon on public.app_config for select to anon using (is_public);
create policy app_config_select_auth on public.app_config for select to authenticated
  using (is_public or is_platform_admin());
create policy app_config_insert_admin on public.app_config for insert to authenticated
  with check (is_platform_admin());
create policy app_config_update_admin on public.app_config for update to authenticated
  using (is_platform_admin()) with check (is_platform_admin());
create policy app_config_delete_admin on public.app_config for delete to authenticated
  using (is_platform_admin());

-- ─── commission_config ──────────────────────────────────────────────────────
drop policy if exists "Admin manages commission_config" on public.commission_config;
drop policy if exists "Authenticated reads commission_config" on public.commission_config;
create policy commission_config_select on public.commission_config for select to authenticated
  using ((is_active = true) or is_platform_admin());
create policy commission_config_insert_admin on public.commission_config for insert to authenticated
  with check (is_platform_admin());
create policy commission_config_update_admin on public.commission_config for update to authenticated
  using (is_platform_admin()) with check (is_platform_admin());
create policy commission_config_delete_admin on public.commission_config for delete to authenticated
  using (is_platform_admin());

-- ─── communities: SELECT anon/auth ayrımı ───────────────────────────────────
drop policy if exists "Communities viewable by authenticated" on public.communities;
drop policy if exists communities_select_admin_demo on public.communities;
create policy communities_select_anon on public.communities for select to anon
  using ((is_demo is not true) or get_config_bool('demo_mode_enabled'));
create policy communities_select_auth on public.communities for select to authenticated
  using (((is_demo is not true) or get_config_bool('demo_mode_enabled')) or is_platform_admin());

-- ─── feature_flags: admin ALL → yalnız yazma komutları (SELECT true kalır) ──
drop policy if exists feature_flags_admin_all on public.feature_flags;
create policy feature_flags_insert_admin on public.feature_flags for insert to authenticated
  with check (is_platform_admin());
create policy feature_flags_update_admin on public.feature_flags for update to authenticated
  using (is_platform_admin()) with check (is_platform_admin());
create policy feature_flags_delete_admin on public.feature_flags for delete to authenticated
  using (is_platform_admin());

-- ─── payout_requests: admin ALL + kendi INSERT/SELECT → komut başına birleşim ─
drop policy if exists "Admin manages payout_requests" on public.payout_requests;
drop policy if exists "Users create own payout_requests" on public.payout_requests;
drop policy if exists "Users view own payout_requests" on public.payout_requests;
create policy payout_requests_select on public.payout_requests for select to authenticated
  using ((user_id = (select auth.uid())) or is_platform_admin());
create policy payout_requests_insert on public.payout_requests for insert to authenticated
  with check (((user_id = (select auth.uid())) and (status = 'PENDING')) or is_platform_admin());
create policy payout_requests_update on public.payout_requests for update to authenticated
  using (is_platform_admin()) with check (is_platform_admin());
create policy payout_requests_delete on public.payout_requests for delete to authenticated
  using (is_platform_admin());

-- ─── pitches: SELECT anon/auth ayrımı ───────────────────────────────────────
drop policy if exists pitches_select_public on public.pitches;
drop policy if exists pitches_select_admin_demo on public.pitches;
create policy pitches_select_anon on public.pitches for select to anon
  using ((is_demo is not true) or get_config_bool('demo_mode_enabled'));
create policy pitches_select_auth on public.pitches for select to authenticated
  using (((is_demo is not true) or get_config_bool('demo_mode_enabled')) or is_platform_admin());

-- ─── provider_applications ──────────────────────────────────────────────────
drop policy if exists "Admin manages provider_applications" on public.provider_applications;
drop policy if exists "Users create own provider_applications" on public.provider_applications;
create policy provider_applications_insert on public.provider_applications for insert to authenticated
  with check (((user_id = (select auth.uid())) and (status = 'PENDING')) or is_platform_admin());
create policy provider_applications_update on public.provider_applications for update to authenticated
  using (is_platform_admin()) with check (is_platform_admin());
create policy provider_applications_delete on public.provider_applications for delete to authenticated
  using (is_platform_admin());
-- "Users view own provider_applications" (kendi VEYA admin) tek SELECT olarak kalır.

-- ─── provider_identities ────────────────────────────────────────────────────
drop policy if exists "Admin manages provider_identities" on public.provider_identities;
create policy provider_identities_insert_admin on public.provider_identities for insert to authenticated
  with check (is_platform_admin());
create policy provider_identities_update_admin on public.provider_identities for update to authenticated
  using (is_platform_admin()) with check (is_platform_admin());
create policy provider_identities_delete_admin on public.provider_identities for delete to authenticated
  using (is_platform_admin());
-- Kullanıcı kimlik kaydı submit_provider_identity RPC'siyle (SECURITY DEFINER) yazılır.

-- ─── service_ratings ────────────────────────────────────────────────────────
drop policy if exists "Admin manages service_ratings" on public.service_ratings;
create policy service_ratings_insert_admin on public.service_ratings for insert to authenticated
  with check (is_platform_admin());
create policy service_ratings_update_admin on public.service_ratings for update to authenticated
  using (is_platform_admin()) with check (is_platform_admin());
create policy service_ratings_delete_admin on public.service_ratings for delete to authenticated
  using (is_platform_admin());
-- Kullanıcı puanlama RPC'lerle yazılır; "Read service_ratings" tek SELECT olarak kalır.

-- ─── service_requests ───────────────────────────────────────────────────────
drop policy if exists "Admin manages service_requests" on public.service_requests;
create policy service_requests_insert_admin on public.service_requests for insert to authenticated
  with check (is_platform_admin());
create policy service_requests_update_admin on public.service_requests for update to authenticated
  using (is_platform_admin()) with check (is_platform_admin());
create policy service_requests_delete_admin on public.service_requests for delete to authenticated
  using (is_platform_admin());
-- Talep oluşturma/yanıtlar RPC'lerle; "Parties view service_requests" tek SELECT olarak kalır.

-- ─── tournaments: SELECT anon/auth ayrımı ───────────────────────────────────
drop policy if exists tournaments_public_read on public.tournaments;
drop policy if exists tournaments_select_admin_demo on public.tournaments;
create policy tournaments_select_anon on public.tournaments for select to anon
  using ((is_demo is not true) or get_config_bool('demo_mode_enabled'));
create policy tournaments_select_auth on public.tournaments for select to authenticated
  using (((is_demo is not true) or get_config_bool('demo_mode_enabled')) or is_platform_admin());

-- ─── user_blocks: kendi-ALL + görüş-SELECT çakışması → komut ayrımı ─────────
drop policy if exists "Users manage own blocks" on public.user_blocks;
create policy user_blocks_insert on public.user_blocks for insert to authenticated
  with check (blocker_id = (select auth.uid()));
create policy user_blocks_update on public.user_blocks for update to authenticated
  using (blocker_id = (select auth.uid())) with check (blocker_id = (select auth.uid()));
create policy user_blocks_delete on public.user_blocks for delete to authenticated
  using (blocker_id = (select auth.uid()));
-- "Users see blocks involving them" (kendi/karşı/admin) tek SELECT olarak kalır.
