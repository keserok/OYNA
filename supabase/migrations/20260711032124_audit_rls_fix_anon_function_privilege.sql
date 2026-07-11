-- OYNA SQL denetimi (2026-07-11) — düzeltme: public rollü politikada anon'un EXECUTE
-- yetkisi olmayan is_platform_admin() çağrısı misafir sorgularını 42501 ile kırıyordu.
-- Çözüm: politika rol bazında ayrılır — anon yalnız vitrin koşulunu görür,
-- authenticated tam birleşimi görür. Rol başına tek permissive politika korunur.
-- (Aynı desen hatası projede başka public rollü politikalarda da mevcut ve eskiden
-- beri var; envanter ve plan için docs/SQL_DENETIM_2026-07-11.md'ye bakınız.)

-- goalkeepers
drop policy if exists goalkeepers_select on public.goalkeepers;
create policy goalkeepers_select_anon on public.goalkeepers for select to anon using (
  (verification_status = 'approved') and (("isDemo" is not true) or get_config_bool('demo_mode_enabled'))
);
create policy goalkeepers_select_auth on public.goalkeepers for select to authenticated using (
  ((verification_status = 'approved') and (("isDemo" is not true) or get_config_bool('demo_mode_enabled')))
  or (id = (select auth.uid()))
  or is_platform_admin()
);

-- referees
drop policy if exists referees_select on public.referees;
create policy referees_select_anon on public.referees for select to anon using (
  (verification_status = 'approved') and (("isDemo" is not true) or get_config_bool('demo_mode_enabled'))
);
create policy referees_select_auth on public.referees for select to authenticated using (
  ((verification_status = 'approved') and (("isDemo" is not true) or get_config_bool('demo_mode_enabled')))
  or (id = (select auth.uid()))
  or is_platform_admin()
);

-- user_reports: raporlama zaten yalnız oturumlu kullanıcı işi; politikalar
-- authenticated'a daraltılır (anon için davranış değişmez: erişim yok).
drop policy if exists user_reports_select on public.user_reports;
drop policy if exists user_reports_insert on public.user_reports;
drop policy if exists user_reports_update on public.user_reports;
drop policy if exists user_reports_delete on public.user_reports;
create policy user_reports_select on public.user_reports for select to authenticated
  using (reporter_id = (select auth.uid()) or is_platform_admin());
create policy user_reports_insert on public.user_reports for insert to authenticated
  with check (reporter_id = (select auth.uid()) or is_platform_admin());
create policy user_reports_update on public.user_reports for update to authenticated
  using (is_platform_admin()) with check (is_platform_admin());
create policy user_reports_delete on public.user_reports for delete to authenticated
  using (is_platform_admin());
