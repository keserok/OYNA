-- ============================================================================
-- YAKINSAMA (Faz 2b) — RLS CANLI-AYNA (60 tablo)
-- ----------------------------------------------------------------------------
-- DRIFT ONARIMI NOTU (2026-07-22): 60 tabloda repo, sertleştirme-öncesi ESKİ
-- RLS politikalarını taşıyordu; canlı ise elle sertleştirilmiş GÜNCEL
-- politikalara sahipti (repoya hiç yazılmamış drift; 118 canlı-only, 109
-- repo-only, 8 kayık). Bu migration her etkilenen tabloyu canlının TAM politika
-- setine eşitler: önce o tabloların tüm politikalarını düşürür (repo-replay'de
-- eski politikaları temizler; canlıda anlık drop+recreate), sonra canlının
-- politikalarını BİREBİR (pg_policies'ten üretildi) yeniden kurar.
-- Canlıda NET NO-OP (aynı politikanın drop+recreate'i, migration transaction'ı
-- içinde atomik). Kazanç: sıfırdan kurulum artık canlının güvenlik duruşunu
-- birebir üretir. Doğrulama: preview RLS'i canlıyla md5-eşit (sıfır fark).
-- ----------------------------------------------------------------------------
-- SIRALAMA NOTU (2026-07-22): Bu dosya 20260810000000 sürümüne alındı. Sebep:
-- canlıya PR-hattı DIŞINDA doğrudan uygulanmış 20260809000001–000004 güvenlik-
-- sertleştirme migration'larının ARDINA gelmesi gerekiyor — hem Supabase'in
-- "son uzak migration'dan önce eklenen yerel migration" deploy hatasını önler,
-- hem de canlının SON (sertleştirme-sonrası) politika durumunu sadık üretir.
-- (O 4 sertleştirme migration'ı Faz 2c'de repoya no-op dosya olarak alınacak.)
-- ============================================================================

-- ── 1) Etkilenen 60 tablonun MEVCUT politikalarını temizle (idempotent) ──────
DO $mig$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname, tablename FROM pg_policies
    WHERE schemaname = 'public' AND tablename = ANY(ARRAY[
      'admin_audit_log','admin_ghost_sessions','admin_team_members','app_config','audit_logs',
      'booking_payments','commission_config','communities','community_creation_requests',
      'community_join_requests','community_members','courts','feature_flags','goalkeepers',
      'individual_matches','match_disputes','match_notes','match_participants','match_registrations',
      'match_score_tokens','match_service_offers','match_tactics','matches','notification_templates',
      'notifications','owner_withdrawal_requests','payout_requests','pitch_availability_exceptions',
      'pitch_bank_accounts','pitch_bookings','pitch_debtors','pitch_expenses','pitch_flash_deals',
      'pitch_slot_holds','pitch_staff_members','pitch_subscriptions','pitch_tariffs','pitches',
      'player_ratings','profiles','promo_codes','promo_redemptions','provider_applications',
      'provider_identities','push_log','referees','service_offers','service_ratings','service_requests',
      'settings','support_ticket_messages','support_tickets','tactics','team_members','teams',
      'tournaments','user_blocks','user_reports','waitlist','wallet_transactions'])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $mig$;

-- ── 2) Canlının politikalarını birebir yeniden kur ───────────────────────────

-- admin_audit_log
CREATE POLICY "No direct inserts" ON public.admin_audit_log AS PERMISSIVE FOR INSERT TO public WITH CHECK (false);
CREATE POLICY audit_log_select_admin ON public.admin_audit_log AS PERMISSIVE FOR SELECT TO authenticated USING (is_platform_admin());

-- admin_ghost_sessions
CREATE POLICY ghost_sessions_select ON public.admin_ghost_sessions AS PERMISSIVE FOR SELECT TO authenticated USING (is_platform_admin());

-- admin_team_members
CREATE POLICY admin_team_platform_admin ON public.admin_team_members AS PERMISSIVE FOR ALL TO authenticated USING (is_platform_admin()) WITH CHECK (is_platform_admin());

-- app_config
CREATE POLICY app_config_delete_admin ON public.app_config AS PERMISSIVE FOR DELETE TO authenticated USING (is_platform_admin());
CREATE POLICY app_config_insert_admin ON public.app_config AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_platform_admin());
CREATE POLICY app_config_select_anon ON public.app_config AS PERMISSIVE FOR SELECT TO anon USING (is_public);
CREATE POLICY app_config_select_auth ON public.app_config AS PERMISSIVE FOR SELECT TO authenticated USING ((is_public OR is_platform_admin()));
CREATE POLICY app_config_update_admin ON public.app_config AS PERMISSIVE FOR UPDATE TO authenticated USING (is_platform_admin()) WITH CHECK (is_platform_admin());

-- audit_logs
CREATE POLICY audit_logs_insert_admin ON public.audit_logs AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY audit_logs_select_admin ON public.audit_logs AS PERMISSIVE FOR SELECT TO authenticated USING (is_admin());

-- booking_payments
CREATE POLICY booking_payments_read ON public.booking_payments AS PERMISSIVE FOR SELECT TO public USING (can_staff_pitch(( SELECT pb.pitch_id FROM pitch_bookings pb WHERE (pb.id = booking_payments.booking_id))));
CREATE POLICY booking_payments_write ON public.booking_payments AS PERMISSIVE FOR ALL TO public USING (can_manage_pitch(( SELECT pb.pitch_id FROM pitch_bookings pb WHERE (pb.id = booking_payments.booking_id)))) WITH CHECK (can_manage_pitch(( SELECT pb.pitch_id FROM pitch_bookings pb WHERE (pb.id = booking_payments.booking_id))));

-- commission_config
CREATE POLICY commission_config_delete_admin ON public.commission_config AS PERMISSIVE FOR DELETE TO authenticated USING (is_platform_admin());
CREATE POLICY commission_config_insert_admin ON public.commission_config AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_platform_admin());
CREATE POLICY commission_config_select ON public.commission_config AS PERMISSIVE FOR SELECT TO authenticated USING (((is_active = true) OR is_platform_admin()));
CREATE POLICY commission_config_update_admin ON public.commission_config AS PERMISSIVE FOR UPDATE TO authenticated USING (is_platform_admin()) WITH CHECK (is_platform_admin());

-- communities
CREATE POLICY "Owners or admins delete communities" ON public.communities AS PERMISSIVE FOR DELETE TO authenticated USING (((owner_id = ( SELECT auth.uid() AS uid)) OR is_platform_admin()));
CREATE POLICY communities_insert ON public.communities AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((owner_id = ( SELECT auth.uid() AS uid)) OR is_platform_admin()));
CREATE POLICY communities_select_anon ON public.communities AS PERMISSIVE FOR SELECT TO anon USING (((is_demo IS NOT TRUE) OR get_config_bool('demo_mode_enabled'::text)));
CREATE POLICY communities_select_auth ON public.communities AS PERMISSIVE FOR SELECT TO authenticated USING (((is_demo IS NOT TRUE) OR get_config_bool('demo_mode_enabled'::text) OR is_platform_admin()));
CREATE POLICY communities_update ON public.communities AS PERMISSIVE FOR UPDATE TO authenticated USING (((owner_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1 FROM community_members cm WHERE ((cm.community_id = communities.id) AND (cm.user_id = ( SELECT auth.uid() AS uid)) AND (cm.role = 'ADMIN'::text)))) OR is_platform_admin())) WITH CHECK (((owner_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1 FROM community_members cm WHERE ((cm.community_id = communities.id) AND (cm.user_id = ( SELECT auth.uid() AS uid)) AND (cm.role = 'ADMIN'::text)))) OR is_platform_admin()));

-- community_creation_requests
CREATE POLICY ccr_admin_delete ON public.community_creation_requests AS PERMISSIVE FOR DELETE TO authenticated USING (is_platform_admin());
CREATE POLICY ccr_admin_update ON public.community_creation_requests AS PERMISSIVE FOR UPDATE TO authenticated USING (is_platform_admin()) WITH CHECK (is_platform_admin());
CREATE POLICY ccr_insert ON public.community_creation_requests AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((requester_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY ccr_select ON public.community_creation_requests AS PERMISSIVE FOR SELECT TO authenticated USING (((requester_id = ( SELECT auth.uid() AS uid)) OR is_platform_admin()));

-- community_join_requests
CREATE POLICY "Platform admins manage join requests" ON public.community_join_requests AS PERMISSIVE FOR ALL TO authenticated USING (is_platform_admin()) WITH CHECK (is_platform_admin());

-- community_members
CREATE POLICY "Members view memberships" ON public.community_members AS PERMISSIVE FOR SELECT TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) OR is_platform_admin() OR (EXISTS ( SELECT 1 FROM communities c WHERE ((c.id = community_members.community_id) AND (c.owner_id = ( SELECT auth.uid() AS uid))))) OR (EXISTS ( SELECT 1 FROM community_members cm2 WHERE ((cm2.community_id = community_members.community_id) AND (cm2.user_id = ( SELECT auth.uid() AS uid)))))));
CREATE POLICY "Users leave or admin removes" ON public.community_members AS PERMISSIVE FOR DELETE TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) OR is_admin() OR (EXISTS ( SELECT 1 FROM communities c WHERE ((c.id = community_members.community_id) AND (c.owner_id = ( SELECT auth.uid() AS uid)))))));
CREATE POLICY "Users update own membership" ON public.community_members AS PERMISSIVE FOR UPDATE TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) OR is_admin())) WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) OR is_admin()));
CREATE POLICY community_members_insert ON public.community_members AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) OR is_platform_admin()));

-- courts
CREATE POLICY "Courts viewable by everyone" ON public.courts AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY courts_write_delete ON public.courts AS PERMISSIVE FOR DELETE TO public USING (can_manage_pitch(pitch_id));
CREATE POLICY courts_write_insert ON public.courts AS PERMISSIVE FOR INSERT TO public WITH CHECK (can_manage_pitch(pitch_id));
CREATE POLICY courts_write_update ON public.courts AS PERMISSIVE FOR UPDATE TO public USING (can_manage_pitch(pitch_id)) WITH CHECK (can_manage_pitch(pitch_id));

-- feature_flags
CREATE POLICY feature_flags_delete_admin ON public.feature_flags AS PERMISSIVE FOR DELETE TO authenticated USING (is_platform_admin());
CREATE POLICY feature_flags_insert_admin ON public.feature_flags AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_platform_admin());
CREATE POLICY feature_flags_public_read ON public.feature_flags AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY feature_flags_update_admin ON public.feature_flags AS PERMISSIVE FOR UPDATE TO authenticated USING (is_platform_admin()) WITH CHECK (is_platform_admin());

-- goalkeepers
CREATE POLICY goalkeepers_delete ON public.goalkeepers AS PERMISSIVE FOR DELETE TO authenticated USING (is_platform_admin());
CREATE POLICY goalkeepers_insert ON public.goalkeepers AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((( SELECT auth.uid() AS uid) = id) OR is_platform_admin()));
-- [2026-08-06 onarım] `goalkeepers_select_anon` ARTIK YARATILMIYOR.
-- Misafirin ham `goalkeepers` tablosunu okuma yolu 20260805233714 ile kapatıldı;
-- giriş yapmamış kullanıcı artık maskeli `public_goalkeepers` görünümünü okur
-- (koordinat, geohash ve kimlik bağı gizli). Canlıda bu kural YOK — doğrulandı.
-- Dosya sırası canlıdaki uygulama sırasının tersi olduğu için burada yeniden
-- yaratılıyordu ve sıfırdan kurulan veritabanında misafire ham tabloyu geri
-- açıyordu. Yani bu satır bir GÜVENLİK GERİLEMESİ üretiyordu.
CREATE POLICY goalkeepers_select_auth ON public.goalkeepers AS PERMISSIVE FOR SELECT TO authenticated USING ((((verification_status = 'approved'::text) AND (("isDemo" IS NOT TRUE) OR get_config_bool('demo_mode_enabled'::text))) OR (id = ( SELECT auth.uid() AS uid)) OR is_platform_admin()));
CREATE POLICY goalkeepers_update ON public.goalkeepers AS PERMISSIVE FOR UPDATE TO authenticated USING (((( SELECT auth.uid() AS uid) = id) OR is_platform_admin())) WITH CHECK (((( SELECT auth.uid() AS uid) = id) OR is_platform_admin()));

-- individual_matches
CREATE POLICY "Matches are viewable by everyone." ON public.individual_matches AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY individual_matches_delete_admin ON public.individual_matches AS PERMISSIVE FOR DELETE TO authenticated USING (is_admin());
CREATE POLICY individual_matches_insert_admin ON public.individual_matches AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY individual_matches_update_admin ON public.individual_matches AS PERMISSIVE FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- match_disputes
CREATE POLICY match_disputes_delete_admin ON public.match_disputes AS PERMISSIVE FOR DELETE TO authenticated USING (is_admin());
CREATE POLICY match_disputes_insert ON public.match_disputes AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((raised_by = ( SELECT auth.uid() AS uid)) OR is_admin()));
CREATE POLICY match_disputes_select ON public.match_disputes AS PERMISSIVE FOR SELECT TO authenticated USING (((raised_by = ( SELECT auth.uid() AS uid)) OR is_admin()));
CREATE POLICY match_disputes_update_admin ON public.match_disputes AS PERMISSIVE FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- match_notes
CREATE POLICY match_notes_delete_own ON public.match_notes AS PERMISSIVE FOR DELETE TO public USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY match_notes_insert_own ON public.match_notes AS PERMISSIVE FOR INSERT TO public WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY match_notes_select_own ON public.match_notes AS PERMISSIVE FOR SELECT TO public USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY match_notes_update_own ON public.match_notes AS PERMISSIVE FOR UPDATE TO public USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

-- match_participants
CREATE POLICY "Service role manages all participants" ON public.match_participants AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Users can view match participants" ON public.match_participants AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY match_participants_delete ON public.match_participants AS PERMISSIVE FOR DELETE TO authenticated USING (((( SELECT auth.uid() AS uid) = user_id) OR (EXISTS ( SELECT 1 FROM matches m WHERE ((m.id = match_participants.match_id) AND (m."creatorId" = ( SELECT auth.uid() AS uid)))))));
CREATE POLICY match_participants_insert ON public.match_participants AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) OR (EXISTS ( SELECT 1 FROM matches m WHERE ((m.id = match_participants.match_id) AND (m."creatorId" = ( SELECT auth.uid() AS uid)))))));
CREATE POLICY match_participants_update_captain ON public.match_participants AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1 FROM matches m WHERE ((m.id = match_participants.match_id) AND (m."creatorId" = ( SELECT auth.uid() AS uid)))))) WITH CHECK ((EXISTS ( SELECT 1 FROM matches m WHERE ((m.id = match_participants.match_id) AND (m."creatorId" = ( SELECT auth.uid() AS uid))))));

-- match_registrations
CREATE POLICY "Registrations are viewable by everyone." ON public.match_registrations AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY match_registrations_delete_admin ON public.match_registrations AS PERMISSIVE FOR DELETE TO authenticated USING (is_admin());
CREATE POLICY match_registrations_insert_admin ON public.match_registrations AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY match_registrations_update_admin ON public.match_registrations AS PERMISSIVE FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- match_score_tokens
CREATE POLICY match_score_tokens_select ON public.match_score_tokens AS PERMISSIVE FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1 FROM matches m WHERE ((m.id = match_score_tokens.match_id) AND ((m.captain_id = ( SELECT auth.uid() AS uid)) OR (m."creatorId" = ( SELECT auth.uid() AS uid)) OR (m."refereeId" = ( SELECT auth.uid() AS uid)))))) OR (EXISTS ( SELECT 1 FROM (pitch_bookings pb JOIN pitches p ON ((p.id = pb.pitch_id))) WHERE ((pb.match_id = match_score_tokens.match_id) AND (p.owner_id = ( SELECT auth.uid() AS uid))))) OR is_admin()));

-- match_service_offers
CREATE POLICY mso_select_own ON public.match_service_offers AS PERMISSIVE FOR SELECT TO authenticated USING (((provider_id = ( SELECT auth.uid() AS uid)) OR (captain_id = ( SELECT auth.uid() AS uid)) OR is_platform_admin()));

-- match_tactics
CREATE POLICY mt_select_member ON public.match_tactics AS PERMISSIVE FOR SELECT TO authenticated USING (_is_team_member(team_id, ( SELECT auth.uid() AS uid)));

-- matches
CREATE POLICY matches_delete ON public.matches AS PERMISSIVE FOR DELETE TO authenticated USING (((( SELECT auth.uid() AS uid) = captain_id) OR is_platform_admin()));
CREATE POLICY matches_insert ON public.matches AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((( SELECT auth.uid() AS uid) = captain_id) OR (captain_id IS NULL) OR is_platform_admin()));
-- [2026-08-06 onarım] `matches_select_anon` ARTIK YARATILMIYOR — yukarıdaki
-- gerekçenin aynısı. Misafir artık maskeli `public_matches` görünümünü okur
-- (kadro isimleri, avatarlar ve saha koordinatı gizli; dolu/boş bilgisi kalır).
-- Kuralı 20260805233918 düşürüyor; canlıda YOK.
CREATE POLICY matches_select_auth ON public.matches AS PERMISSIVE FOR SELECT TO authenticated USING ((("isDemo" IS NOT TRUE) OR get_config_bool('demo_mode_enabled'::text) OR is_platform_admin()));
CREATE POLICY matches_update ON public.matches AS PERMISSIVE FOR UPDATE TO authenticated USING (((( SELECT auth.uid() AS uid) = captain_id) OR is_platform_admin()));

-- notification_templates
CREATE POLICY "Anyone authenticated can read templates" ON public.notification_templates AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role can manage templates" ON public.notification_templates AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY notification_templates_delete_admin ON public.notification_templates AS PERMISSIVE FOR DELETE TO authenticated USING (is_admin());
CREATE POLICY notification_templates_insert_admin ON public.notification_templates AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY notification_templates_update_admin ON public.notification_templates AS PERMISSIVE FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- notifications
CREATE POLICY "Service role can insert notifications" ON public.notifications AS PERMISSIVE FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "Service role can update push status" ON public.notifications AS PERMISSIVE FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY notifications_delete_own ON public.notifications AS PERMISSIVE FOR DELETE TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY notifications_insert_own_sender ON public.notifications AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((sender_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY notifications_insert_self_or_admin ON public.notifications AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) OR is_platform_admin()));
CREATE POLICY notifications_select_own ON public.notifications AS PERMISSIVE FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY notifications_update_own ON public.notifications AS PERMISSIVE FOR UPDATE TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

-- owner_withdrawal_requests
CREATE POLICY withdrawals_delete_superadmin ON public.owner_withdrawal_requests AS PERMISSIVE FOR DELETE TO authenticated USING (is_super_admin(( SELECT auth.uid() AS uid)));
CREATE POLICY withdrawals_insert ON public.owner_withdrawal_requests AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((owner_id = ( SELECT auth.uid() AS uid)) OR is_super_admin(( SELECT auth.uid() AS uid))));
CREATE POLICY withdrawals_select ON public.owner_withdrawal_requests AS PERMISSIVE FOR SELECT TO authenticated USING (((owner_id = ( SELECT auth.uid() AS uid)) OR is_super_admin(( SELECT auth.uid() AS uid))));
CREATE POLICY withdrawals_update_superadmin ON public.owner_withdrawal_requests AS PERMISSIVE FOR UPDATE TO authenticated USING (is_super_admin(( SELECT auth.uid() AS uid))) WITH CHECK (is_super_admin(( SELECT auth.uid() AS uid)));

-- payout_requests
CREATE POLICY payout_requests_delete ON public.payout_requests AS PERMISSIVE FOR DELETE TO authenticated USING (is_platform_admin());
CREATE POLICY payout_requests_insert ON public.payout_requests AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((((user_id = ( SELECT auth.uid() AS uid)) AND (status = 'PENDING'::text)) OR is_platform_admin()));
CREATE POLICY payout_requests_select ON public.payout_requests AS PERMISSIVE FOR SELECT TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) OR is_platform_admin()));
CREATE POLICY payout_requests_update ON public.payout_requests AS PERMISSIVE FOR UPDATE TO authenticated USING (is_platform_admin()) WITH CHECK (is_platform_admin());

-- pitch_availability_exceptions
CREATE POLICY "Exceptions publicly viewable" ON public.pitch_availability_exceptions AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY pitch_exceptions_delete ON public.pitch_availability_exceptions AS PERMISSIVE FOR DELETE TO public USING (can_manage_pitch(pitch_id));
CREATE POLICY pitch_exceptions_insert ON public.pitch_availability_exceptions AS PERMISSIVE FOR INSERT TO public WITH CHECK (can_manage_pitch(pitch_id));
CREATE POLICY pitch_exceptions_update ON public.pitch_availability_exceptions AS PERMISSIVE FOR UPDATE TO public USING (can_manage_pitch(pitch_id)) WITH CHECK (can_manage_pitch(pitch_id));

-- pitch_bank_accounts
CREATE POLICY "Owners manage pitch bank accounts" ON public.pitch_bank_accounts AS PERMISSIVE FOR ALL TO authenticated USING (((EXISTS ( SELECT 1 FROM pitches p WHERE ((p.id = pitch_bank_accounts.pitch_id) AND ((p.owner_id = ( SELECT auth.uid() AS uid)) OR ((p.is_demo = true) AND has_role('OWNER'::text)))))) OR is_admin())) WITH CHECK (((EXISTS ( SELECT 1 FROM pitches p WHERE ((p.id = pitch_bank_accounts.pitch_id) AND ((p.owner_id = ( SELECT auth.uid() AS uid)) OR ((p.is_demo = true) AND has_role('OWNER'::text)))))) OR is_admin()));

-- pitch_bookings
CREATE POLICY pitch_bookings_delete ON public.pitch_bookings AS PERMISSIVE FOR DELETE TO public USING (can_manage_pitch(pitch_id));
CREATE POLICY pitch_bookings_insert ON public.pitch_bookings AS PERMISSIVE FOR INSERT TO public WITH CHECK (can_manage_pitch(pitch_id));
CREATE POLICY pitch_bookings_select ON public.pitch_bookings AS PERMISSIVE FOR SELECT TO public USING (((user_id = ( SELECT auth.uid() AS uid)) OR can_staff_pitch(pitch_id) OR (EXISTS ( SELECT 1 FROM pitches p WHERE ((p.id = pitch_bookings.pitch_id) AND (p.is_demo = true))))));
CREATE POLICY pitch_bookings_update ON public.pitch_bookings AS PERMISSIVE FOR UPDATE TO public USING (can_manage_pitch(pitch_id)) WITH CHECK (can_manage_pitch(pitch_id));

-- pitch_debtors
CREATE POLICY pitch_debtors_read ON public.pitch_debtors AS PERMISSIVE FOR SELECT TO public USING (can_staff_pitch(pitch_id));
CREATE POLICY pitch_debtors_write ON public.pitch_debtors AS PERMISSIVE FOR ALL TO public USING (can_manage_pitch(pitch_id)) WITH CHECK (can_manage_pitch(pitch_id));

-- pitch_expenses
CREATE POLICY pitch_expenses_manage ON public.pitch_expenses AS PERMISSIVE FOR ALL TO public USING (can_manage_pitch(pitch_id)) WITH CHECK (can_manage_pitch(pitch_id));

-- pitch_flash_deals
CREATE POLICY "Flash deals publicly viewable" ON public.pitch_flash_deals AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY pitch_flash_deals_delete ON public.pitch_flash_deals AS PERMISSIVE FOR DELETE TO public USING (can_manage_pitch(pitch_id));
CREATE POLICY pitch_flash_deals_insert ON public.pitch_flash_deals AS PERMISSIVE FOR INSERT TO public WITH CHECK (can_manage_pitch(pitch_id));
CREATE POLICY pitch_flash_deals_update ON public.pitch_flash_deals AS PERMISSIVE FOR UPDATE TO public USING (can_manage_pitch(pitch_id)) WITH CHECK (can_manage_pitch(pitch_id));

-- pitch_slot_holds
CREATE POLICY "Holds are viewable by everyone" ON public.pitch_slot_holds AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY slot_holds_delete ON public.pitch_slot_holds AS PERMISSIVE FOR DELETE TO public USING ((held_by = ( SELECT auth.uid() AS uid)));
CREATE POLICY slot_holds_insert ON public.pitch_slot_holds AS PERMISSIVE FOR INSERT TO public WITH CHECK ((held_by = ( SELECT auth.uid() AS uid)));
CREATE POLICY slot_holds_update ON public.pitch_slot_holds AS PERMISSIVE FOR UPDATE TO public USING ((held_by = ( SELECT auth.uid() AS uid))) WITH CHECK ((held_by = ( SELECT auth.uid() AS uid)));

-- pitch_staff_members
CREATE POLICY "Owners manage pitch staff" ON public.pitch_staff_members AS PERMISSIVE FOR ALL TO authenticated USING (((EXISTS ( SELECT 1 FROM pitches p WHERE ((p.id = pitch_staff_members.pitch_id) AND ((p.owner_id = ( SELECT auth.uid() AS uid)) OR ((p.is_demo = true) AND has_role('OWNER'::text)))))) OR is_admin())) WITH CHECK (((EXISTS ( SELECT 1 FROM pitches p WHERE ((p.id = pitch_staff_members.pitch_id) AND ((p.owner_id = ( SELECT auth.uid() AS uid)) OR ((p.is_demo = true) AND has_role('OWNER'::text)))))) OR is_admin()));
CREATE POLICY staff_members_read ON public.pitch_staff_members AS PERMISSIVE FOR SELECT TO public USING (can_manage_pitch(pitch_id));

-- pitch_subscriptions
CREATE POLICY pitch_subscriptions_delete ON public.pitch_subscriptions AS PERMISSIVE FOR DELETE TO public USING (can_manage_pitch(pitch_id));
CREATE POLICY pitch_subscriptions_insert ON public.pitch_subscriptions AS PERMISSIVE FOR INSERT TO public WITH CHECK (can_manage_pitch(pitch_id));
CREATE POLICY pitch_subscriptions_select ON public.pitch_subscriptions AS PERMISSIVE FOR SELECT TO public USING (((user_id = ( SELECT auth.uid() AS uid)) OR can_manage_pitch(pitch_id)));
CREATE POLICY pitch_subscriptions_update ON public.pitch_subscriptions AS PERMISSIVE FOR UPDATE TO public USING (can_manage_pitch(pitch_id)) WITH CHECK (can_manage_pitch(pitch_id));

-- pitch_tariffs
CREATE POLICY "Tariffs are publicly viewable" ON public.pitch_tariffs AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY pitch_tariffs_delete ON public.pitch_tariffs AS PERMISSIVE FOR DELETE TO public USING (can_manage_pitch(pitch_id));
CREATE POLICY pitch_tariffs_insert ON public.pitch_tariffs AS PERMISSIVE FOR INSERT TO public WITH CHECK (can_manage_pitch(pitch_id));
CREATE POLICY pitch_tariffs_update ON public.pitch_tariffs AS PERMISSIVE FOR UPDATE TO public USING (can_manage_pitch(pitch_id)) WITH CHECK (can_manage_pitch(pitch_id));

-- pitches
CREATE POLICY pitches_delete_owner_or_admin ON public.pitches AS PERMISSIVE FOR DELETE TO authenticated USING (((( SELECT auth.uid() AS uid) = owner_id) OR is_admin()));
CREATE POLICY pitches_insert_owner_or_admin ON public.pitches AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((( SELECT auth.uid() AS uid) = owner_id) OR is_admin()));
CREATE POLICY pitches_select_anon ON public.pitches AS PERMISSIVE FOR SELECT TO anon USING (((is_demo IS NOT TRUE) OR get_config_bool('demo_mode_enabled'::text)));
CREATE POLICY pitches_select_auth ON public.pitches AS PERMISSIVE FOR SELECT TO authenticated USING (((is_demo IS NOT TRUE) OR get_config_bool('demo_mode_enabled'::text) OR is_platform_admin()));
CREATE POLICY pitches_update_owner_or_admin ON public.pitches AS PERMISSIVE FOR UPDATE TO public USING (can_manage_pitch(id)) WITH CHECK (can_manage_pitch(id));

-- player_ratings
CREATE POLICY player_ratings_insert ON public.player_ratings AS PERMISSIVE FOR INSERT TO public WITH CHECK ((( SELECT auth.uid() AS uid) = rater_id));
CREATE POLICY player_ratings_no_update ON public.player_ratings AS PERMISSIVE FOR UPDATE TO public USING (false);
CREATE POLICY player_ratings_select_scoped ON public.player_ratings AS PERMISSIVE FOR SELECT TO authenticated USING (((( SELECT auth.uid() AS uid) = rater_id) OR (( SELECT auth.uid() AS uid) = ratee_id) OR is_platform_admin()));

-- profiles
CREATE POLICY "Service role manages all profiles" ON public.profiles AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY profiles_delete_admin ON public.profiles AS PERMISSIVE FOR DELETE TO authenticated USING (is_admin());
CREATE POLICY profiles_insert_own ON public.profiles AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (( SELECT auth.uid() AS uid) = id);
CREATE POLICY profiles_select_own_or_admin ON public.profiles AS PERMISSIVE FOR SELECT TO authenticated USING (((( SELECT auth.uid() AS uid) = id) OR is_admin()));
CREATE POLICY profiles_update ON public.profiles AS PERMISSIVE FOR UPDATE TO authenticated USING (((( SELECT auth.uid() AS uid) = id) OR is_admin())) WITH CHECK ((is_admin() OR ((( SELECT auth.uid() AS uid) = id) AND profile_privileges_unchanged(( SELECT auth.uid() AS uid), (role)::text, is_admin, roles))));

-- promo_codes
CREATE POLICY promo_codes_delete ON public.promo_codes AS PERMISSIVE FOR DELETE TO authenticated USING (is_platform_admin());
CREATE POLICY promo_codes_insert ON public.promo_codes AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_platform_admin());
CREATE POLICY promo_codes_select_anon ON public.promo_codes AS PERMISSIVE FOR SELECT TO anon USING (((is_active = true) AND ((valid_until IS NULL) OR (valid_until > now()))));
CREATE POLICY promo_codes_select_auth ON public.promo_codes AS PERMISSIVE FOR SELECT TO authenticated USING ((is_platform_admin() OR ((is_active = true) AND ((valid_until IS NULL) OR (valid_until > now())))));
CREATE POLICY promo_codes_update ON public.promo_codes AS PERMISSIVE FOR UPDATE TO authenticated USING (is_platform_admin()) WITH CHECK (is_platform_admin());

-- promo_redemptions
CREATE POLICY promo_redemptions_insert_own ON public.promo_redemptions AS PERMISSIVE FOR INSERT TO public WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY promo_redemptions_own ON public.promo_redemptions AS PERMISSIVE FOR SELECT TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) OR is_platform_admin()));

-- provider_applications
CREATE POLICY "Users view own provider_applications" ON public.provider_applications AS PERMISSIVE FOR SELECT TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) OR is_platform_admin()));
CREATE POLICY provider_applications_delete ON public.provider_applications AS PERMISSIVE FOR DELETE TO authenticated USING (is_platform_admin());
CREATE POLICY provider_applications_insert ON public.provider_applications AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((((user_id = ( SELECT auth.uid() AS uid)) AND (status = 'PENDING'::text)) OR is_platform_admin()));
CREATE POLICY provider_applications_update ON public.provider_applications AS PERMISSIVE FOR UPDATE TO authenticated USING (is_platform_admin()) WITH CHECK (is_platform_admin());

-- provider_identities
CREATE POLICY "Users view own provider_identity" ON public.provider_identities AS PERMISSIVE FOR SELECT TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) OR is_platform_admin()));
CREATE POLICY provider_identities_delete_admin ON public.provider_identities AS PERMISSIVE FOR DELETE TO authenticated USING (is_platform_admin());
CREATE POLICY provider_identities_insert_admin ON public.provider_identities AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_platform_admin());
CREATE POLICY provider_identities_update_admin ON public.provider_identities AS PERMISSIVE FOR UPDATE TO authenticated USING (is_platform_admin()) WITH CHECK (is_platform_admin());

-- push_log
CREATE POLICY "Service role manages push logs" ON public.push_log AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Users can view own push logs" ON public.push_log AS PERMISSIVE FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));

-- referees
CREATE POLICY referees_delete ON public.referees AS PERMISSIVE FOR DELETE TO authenticated USING (is_platform_admin());
CREATE POLICY referees_insert ON public.referees AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((( SELECT auth.uid() AS uid) = id) OR is_platform_admin()));
-- [2026-08-06 onarım] `referees_select_anon` ARTIK YARATILMIYOR — yukarıdaki
-- gerekçenin aynısı. Misafir artık maskeli `public_referees` görünümünü okur.
-- Kuralı 20260805233714 düşürüyor; canlıda YOK.
CREATE POLICY referees_select_auth ON public.referees AS PERMISSIVE FOR SELECT TO authenticated USING ((((verification_status = 'approved'::text) AND (("isDemo" IS NOT TRUE) OR get_config_bool('demo_mode_enabled'::text))) OR (id = ( SELECT auth.uid() AS uid)) OR is_platform_admin()));
CREATE POLICY referees_update ON public.referees AS PERMISSIVE FOR UPDATE TO authenticated USING (((( SELECT auth.uid() AS uid) = id) OR is_platform_admin())) WITH CHECK (((( SELECT auth.uid() AS uid) = id) OR is_platform_admin()));

-- service_offers
CREATE POLICY "Anyone can view their own offers" ON public.service_offers AS PERMISSIVE FOR SELECT TO public USING (((( SELECT auth.uid() AS uid) = provider_id) OR (( SELECT auth.uid() AS uid) = captain_id)));
CREATE POLICY "Captains can create offers" ON public.service_offers AS PERMISSIVE FOR INSERT TO public WITH CHECK ((( SELECT auth.uid() AS uid) = captain_id));
CREATE POLICY "Providers can update their offers" ON public.service_offers AS PERMISSIVE FOR UPDATE TO public USING ((( SELECT auth.uid() AS uid) = provider_id));

-- service_ratings
CREATE POLICY "Read service_ratings" ON public.service_ratings AS PERMISSIVE FOR SELECT TO authenticated USING (((provider_id = ( SELECT auth.uid() AS uid)) OR (rater_id = ( SELECT auth.uid() AS uid)) OR is_platform_admin()));
CREATE POLICY service_ratings_delete_admin ON public.service_ratings AS PERMISSIVE FOR DELETE TO authenticated USING (is_platform_admin());
CREATE POLICY service_ratings_insert_admin ON public.service_ratings AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_platform_admin());
CREATE POLICY service_ratings_update_admin ON public.service_ratings AS PERMISSIVE FOR UPDATE TO authenticated USING (is_platform_admin()) WITH CHECK (is_platform_admin());

-- service_requests
CREATE POLICY "Parties view service_requests" ON public.service_requests AS PERMISSIVE FOR SELECT TO authenticated USING (((provider_id = ( SELECT auth.uid() AS uid)) OR (requested_by = ( SELECT auth.uid() AS uid)) OR ((status = 'APPLIED'::text) AND (_hire_side_for(match_id, ( SELECT auth.uid() AS uid)) IS NOT NULL)) OR is_platform_admin()));
CREATE POLICY service_requests_delete_admin ON public.service_requests AS PERMISSIVE FOR DELETE TO authenticated USING (is_platform_admin());
CREATE POLICY service_requests_insert_admin ON public.service_requests AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_platform_admin());
CREATE POLICY service_requests_update_admin ON public.service_requests AS PERMISSIVE FOR UPDATE TO authenticated USING (is_platform_admin()) WITH CHECK (is_platform_admin());

-- settings
CREATE POLICY settings_delete_admin ON public.settings AS PERMISSIVE FOR DELETE TO authenticated USING ((is_platform_admin() OR is_super_admin(( SELECT auth.uid() AS uid))));
CREATE POLICY settings_insert_admin ON public.settings AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((is_platform_admin() OR is_super_admin(( SELECT auth.uid() AS uid))));
CREATE POLICY settings_select_public ON public.settings AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY settings_update_admin ON public.settings AS PERMISSIVE FOR UPDATE TO authenticated USING ((is_platform_admin() OR is_super_admin(( SELECT auth.uid() AS uid)))) WITH CHECK ((is_platform_admin() OR is_super_admin(( SELECT auth.uid() AS uid))));

-- support_ticket_messages
CREATE POLICY support_ticket_messages_owner_select ON public.support_ticket_messages AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1 FROM support_tickets t WHERE ((t.id = support_ticket_messages.ticket_id) AND (t.user_id = auth.uid())))));

-- support_tickets
CREATE POLICY support_tickets_owner_select ON public.support_tickets AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = user_id));

-- tactics
CREATE POLICY tactics_delete ON public.tactics AS PERMISSIVE FOR DELETE TO authenticated USING (( SELECT auth.uid() AS uid) = "userId");
CREATE POLICY tactics_insert ON public.tactics AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((( SELECT auth.uid() AS uid) = "userId") AND (("teamId" IS NULL) OR _is_team_member("teamId", ( SELECT auth.uid() AS uid)))));
CREATE POLICY tactics_select ON public.tactics AS PERMISSIVE FOR SELECT TO authenticated USING (((( SELECT auth.uid() AS uid) = "userId") OR (("teamId" IS NOT NULL) AND _is_team_member("teamId", ( SELECT auth.uid() AS uid))) OR is_platform_admin()));
CREATE POLICY tactics_update ON public.tactics AS PERMISSIVE FOR UPDATE TO authenticated USING (((( SELECT auth.uid() AS uid) = "userId") OR (((status)::text = 'APPROVED'::text) AND ("teamId" IS NOT NULL) AND _is_team_admin("teamId", ( SELECT auth.uid() AS uid))))) WITH CHECK (((( SELECT auth.uid() AS uid) = "userId") OR (((status)::text = 'APPROVED'::text) AND ("teamId" IS NOT NULL) AND _is_team_admin("teamId", ( SELECT auth.uid() AS uid)))));

-- team_members
CREATE POLICY tm_delete_self_or_captain ON public.team_members AS PERMISSIVE FOR DELETE TO public USING (((user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1 FROM teams t WHERE ((t.id = team_members.team_id) AND (t.captain_id = ( SELECT auth.uid() AS uid)))))));
CREATE POLICY tm_insert_self_or_captain ON public.team_members AS PERMISSIVE FOR INSERT TO public WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1 FROM teams t WHERE ((t.id = team_members.team_id) AND (t.captain_id = ( SELECT auth.uid() AS uid)))))));
CREATE POLICY tm_select_anon ON public.team_members AS PERMISSIVE FOR SELECT TO anon USING ((EXISTS ( SELECT 1 FROM teams t WHERE ((t.id = team_members.team_id) AND (t.visibility = 'PUBLIC'::text)))));
CREATE POLICY tm_select_auth ON public.team_members AS PERMISSIVE FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1 FROM teams t WHERE ((t.id = team_members.team_id) AND (t.visibility = 'PUBLIC'::text)))) OR _is_team_member(team_id, ( SELECT auth.uid() AS uid)) OR is_platform_admin()));
CREATE POLICY tm_update_captain ON public.team_members AS PERMISSIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1 FROM teams t WHERE ((t.id = team_members.team_id) AND (t.captain_id = ( SELECT auth.uid() AS uid))))));

-- teams
CREATE POLICY teams_delete ON public.teams AS PERMISSIVE FOR DELETE TO authenticated USING (((( SELECT auth.uid() AS uid) = captain_id) OR is_admin() OR is_platform_admin()));
CREATE POLICY teams_insert_own ON public.teams AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((captain_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY teams_select_public ON public.teams AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY teams_update ON public.teams AS PERMISSIVE FOR UPDATE TO authenticated USING (((( SELECT auth.uid() AS uid) = captain_id) OR _is_team_admin(id, ( SELECT auth.uid() AS uid)) OR is_admin() OR is_platform_admin())) WITH CHECK (((( SELECT auth.uid() AS uid) = captain_id) OR _is_team_admin(id, ( SELECT auth.uid() AS uid)) OR is_admin() OR is_platform_admin()));

-- tournaments
CREATE POLICY tournaments_admin_delete ON public.tournaments AS PERMISSIVE FOR DELETE TO authenticated USING (is_platform_admin());
CREATE POLICY tournaments_admin_insert ON public.tournaments AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_platform_admin());
CREATE POLICY tournaments_admin_update ON public.tournaments AS PERMISSIVE FOR UPDATE TO authenticated USING (is_platform_admin()) WITH CHECK (is_platform_admin());
CREATE POLICY tournaments_select_anon ON public.tournaments AS PERMISSIVE FOR SELECT TO anon USING (((is_demo IS NOT TRUE) OR get_config_bool('demo_mode_enabled'::text)));
CREATE POLICY tournaments_select_auth ON public.tournaments AS PERMISSIVE FOR SELECT TO authenticated USING (((is_demo IS NOT TRUE) OR get_config_bool('demo_mode_enabled'::text) OR is_platform_admin()));

-- user_blocks
CREATE POLICY "Users see blocks involving them" ON public.user_blocks AS PERMISSIVE FOR SELECT TO authenticated USING (((blocker_id = ( SELECT auth.uid() AS uid)) OR (blocked_id = ( SELECT auth.uid() AS uid)) OR is_platform_admin()));
CREATE POLICY user_blocks_delete ON public.user_blocks AS PERMISSIVE FOR DELETE TO authenticated USING ((blocker_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY user_blocks_insert ON public.user_blocks AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((blocker_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY user_blocks_update ON public.user_blocks AS PERMISSIVE FOR UPDATE TO authenticated USING ((blocker_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((blocker_id = ( SELECT auth.uid() AS uid)));

-- user_reports
CREATE POLICY user_reports_delete ON public.user_reports AS PERMISSIVE FOR DELETE TO authenticated USING (is_platform_admin());
CREATE POLICY user_reports_insert ON public.user_reports AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((reporter_id = ( SELECT auth.uid() AS uid)) OR is_platform_admin()));
CREATE POLICY user_reports_select ON public.user_reports AS PERMISSIVE FOR SELECT TO authenticated USING (((reporter_id = ( SELECT auth.uid() AS uid)) OR is_platform_admin()));
CREATE POLICY user_reports_update ON public.user_reports AS PERMISSIVE FOR UPDATE TO authenticated USING (is_platform_admin()) WITH CHECK (is_platform_admin());

-- waitlist
CREATE POLICY "Waitlist viewable by everyone." ON public.waitlist AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY waitlist_delete_admin ON public.waitlist AS PERMISSIVE FOR DELETE TO authenticated USING (is_admin());
CREATE POLICY waitlist_insert_admin ON public.waitlist AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY waitlist_update_admin ON public.waitlist AS PERMISSIVE FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- wallet_transactions
CREATE POLICY wallet_no_direct_insert ON public.wallet_transactions AS PERMISSIVE FOR INSERT TO public WITH CHECK (false);
CREATE POLICY wallet_select ON public.wallet_transactions AS PERMISSIVE FOR SELECT TO authenticated USING (((( SELECT auth.uid() AS uid) = user_id) OR is_platform_admin()));
