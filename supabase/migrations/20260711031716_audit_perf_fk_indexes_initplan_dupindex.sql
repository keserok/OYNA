-- OYNA SQL denetimi (2026-07-11) — performans düzeltmeleri (Supabase danışman bulguları)

-- 1) Mükerrer unique indeks: uq_player_ratings_unique, constraint destekli
--    unique_rating_per_match ile birebir aynı (match_id, rater_id, ratee_id) → kaldır.
drop index if exists public.uq_player_ratings_unique;

-- 2) Kapsayan indeksi olmayan 26 foreign key (danışman: unindexed_foreign_keys)
create index if not exists idx_fk_app_config_updated_by on public.app_config (updated_by);
create index if not exists idx_fk_commission_config_created_by on public.commission_config (created_by);
create index if not exists idx_fk_feature_flags_updated_by on public.feature_flags (updated_by);
create index if not exists idx_fk_friend_prefs_friend_id on public.friend_prefs (friend_id);
create index if not exists idx_fk_match_notes_user_id on public.match_notes (user_id);
create index if not exists idx_fk_match_score_approvals_user_id on public.match_score_approvals (user_id);
create index if not exists idx_fk_match_score_proposals_proposed_by on public.match_score_proposals (proposed_by);
create index if not exists idx_fk_minor_payment_consents_minor_user_id on public.minor_payment_consents (minor_user_id);
create index if not exists idx_fk_minor_payment_consents_payment_intent_id on public.minor_payment_consents (payment_intent_id);
create index if not exists idx_fk_payout_requests_payout_method_id on public.payout_requests (payout_method_id);
create index if not exists idx_fk_payout_requests_processed_by on public.payout_requests (processed_by);
create index if not exists idx_fk_pitch_change_requests_pitch_id on public.pitch_change_requests (pitch_id);
create index if not exists idx_fk_pitch_change_requests_requested_by on public.pitch_change_requests (requested_by);
create index if not exists idx_fk_pitch_change_requests_reviewed_by on public.pitch_change_requests (reviewed_by);
create index if not exists idx_fk_pitch_content_audit_actor_id on public.pitch_content_audit (actor_id);
create index if not exists idx_fk_pitch_media_uploaded_by on public.pitch_media (uploaded_by);
create index if not exists idx_fk_pitch_ratings_rater_id on public.pitch_ratings (rater_id);
create index if not exists idx_fk_pitch_staff_members_user_id on public.pitch_staff_members (user_id);
create index if not exists idx_fk_pitch_views_viewer_id on public.pitch_views (viewer_id);
create index if not exists idx_fk_provider_applications_reviewed_by on public.provider_applications (reviewed_by);
create index if not exists idx_fk_provider_identities_verified_by on public.provider_identities (verified_by);
create index if not exists idx_fk_service_ratings_rater_id on public.service_ratings (rater_id);
create index if not exists idx_fk_tactic_favorites_user_id on public.tactic_favorites (user_id);
create index if not exists idx_fk_tactic_votes_user_id on public.tactic_votes (user_id);
create index if not exists idx_fk_user_blocks_blocked_id on public.user_blocks (blocked_id);
create index if not exists idx_fk_user_reports_resolved_by on public.user_reports (resolved_by);

-- 3) RLS initplan: auth.uid() satır başına yeniden hesaplanıyordu →
--    (select auth.uid()) ile sorgu başına tek sefere iner (danışman: auth_rls_initplan).
--    Anlam değişmez, yalnız performans.
alter policy match_notes_select_own on public.match_notes using (user_id = (select auth.uid()));
alter policy match_notes_insert_own on public.match_notes with check (user_id = (select auth.uid()));
alter policy match_notes_update_own on public.match_notes using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy match_notes_delete_own on public.match_notes using (user_id = (select auth.uid()));
alter policy mso_select_own on public.match_service_offers using (provider_id = (select auth.uid()) or captain_id = (select auth.uid()) or is_platform_admin());

-- 4) matches_autofill_image bir trigger fonksiyonu; REST RPC yüzeyinden çağrılabilir
--    olması gereksiz (danışman: anon_security_definer_function_executable).
--    Trigger'lar EXECUTE yetkisiz de tetiklenir; grant temizliği güvenlidir.
revoke execute on function public.matches_autofill_image() from public, anon, authenticated;
