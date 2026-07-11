-- ════════════════════════════════════════════════════════════════════════
-- SQL denetimi faz 2 (2026-07-11):
-- 1) is_super_admin çift imzası tekilleştirilir. Parametresiz eski sürüm yalnız
--    profiles'a bakıyordu (admin_team_members'daki SUPER_ADMIN'leri tanımıyordu)
--    ve uuid'li sürümün DEFAULT'u yüzünden is_super_admin() yazan her yeni SQL
--    "function is not unique" hatasıyla kırılıyordu. Eski sürüm düşürülür;
--    is_super_admin() çağrıları artık tek adaya (uuid DEFAULT auth.uid())
--    çözülür ve güncel RBAC anlamını taşır.
-- 2) Sıfır satırlı, kodda referanssız legacy tablolar düşürülür.
-- ════════════════════════════════════════════════════════════════════════

-- ─── 1a) Eski sürüme bağımlı 4 politika (owner_withdrawal_requests) uuid'li
--         sürüme açık imzayla taşınır. Anlam GENİŞLER: admin_team_members
--         üzerinden SUPER_ADMIN olanlar da artık tanınır (amaçlanan RBAC).
drop policy if exists withdrawals_select on public.owner_withdrawal_requests;
create policy withdrawals_select on public.owner_withdrawal_requests
  for select to authenticated
  using ((owner_id = (select auth.uid())) or public.is_super_admin((select auth.uid())));

drop policy if exists withdrawals_insert on public.owner_withdrawal_requests;
create policy withdrawals_insert on public.owner_withdrawal_requests
  for insert to authenticated
  with check ((owner_id = (select auth.uid())) or public.is_super_admin((select auth.uid())));

drop policy if exists withdrawals_update_superadmin on public.owner_withdrawal_requests;
create policy withdrawals_update_superadmin on public.owner_withdrawal_requests
  for update to authenticated
  using (public.is_super_admin((select auth.uid())))
  with check (public.is_super_admin((select auth.uid())));

drop policy if exists withdrawals_delete_superadmin on public.owner_withdrawal_requests;
create policy withdrawals_delete_superadmin on public.owner_withdrawal_requests
  for delete to authenticated
  using (public.is_super_admin((select auth.uid())));

-- ─── 1b) Eski parametresiz sürüm düşer ──────────────────────────────────────
drop function public.is_super_admin();

-- ─── 2) Legacy tablolar (0 satır, kodda referans yok — denetimde doğrulandı) ─
drop table if exists public.texts_legacy;
drop table if exists public.match_tactics_legacy;
