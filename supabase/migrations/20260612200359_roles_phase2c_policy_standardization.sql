-- [DB GEÇMİŞİNDEN KURTARILDI 2026-07-11] Bu migration canlı veritabanına uygulanmıştı ancak repoda dosyası yoktu; supabase_migrations.schema_migrations.statements kolonundan geri çıkarıldı.

-- ============================================================
-- OYNA — Rol Sistemi / Faz 2c: Politika standardizasyonu (is_admin/is_super_admin)
-- ============================================================

-- ===================== audit_logs =====================
DROP POLICY IF EXISTS "audit_insert_admin" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_select_admin" ON public.audit_logs;
CREATE POLICY "audit_logs_insert_admin" ON public.audit_logs
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "audit_logs_select_admin" ON public.audit_logs
  FOR SELECT TO authenticated USING (public.is_admin());

-- ===================== booking_payments =====================
DROP POLICY IF EXISTS "Owners manage booking payments" ON public.booking_payments;
CREATE POLICY "booking_payments_manage" ON public.booking_payments
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM pitch_bookings pb JOIN pitches p ON p.id = pb.pitch_id
            WHERE pb.id = booking_payments.booking_id AND p.owner_id = (SELECT auth.uid()))
    OR public.is_admin()
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM pitch_bookings pb JOIN pitches p ON p.id = pb.pitch_id
            WHERE pb.id = booking_payments.booking_id AND p.owner_id = (SELECT auth.uid()))
    OR public.is_admin()
  );

-- ===================== courts (iki ALL -> tek) =====================
DROP POLICY IF EXISTS "Admins manage courts" ON public.courts;
DROP POLICY IF EXISTS "Owners manage their courts" ON public.courts;
CREATE POLICY "courts_manage" ON public.courts
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM pitches p WHERE p.id = courts.pitch_id AND p.owner_id = (SELECT auth.uid()))
    OR public.is_admin()
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM pitches p WHERE p.id = courts.pitch_id AND p.owner_id = (SELECT auth.uid()))
    OR public.is_admin()
  );
-- "Courts viewable by everyone" (public true) korunuyor

-- ===================== individual_matches =====================
DROP POLICY IF EXISTS "Admins can manage matches." ON public.individual_matches;
CREATE POLICY "individual_matches_manage_admin" ON public.individual_matches
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
-- "Matches are viewable by everyone." korunuyor

-- ===================== match_disputes =====================
DROP POLICY IF EXISTS "Admins manage disputes" ON public.match_disputes;
DROP POLICY IF EXISTS "Participants create disputes" ON public.match_disputes;
DROP POLICY IF EXISTS "Participants view own disputes" ON public.match_disputes;
CREATE POLICY "match_disputes_manage_admin" ON public.match_disputes
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "match_disputes_insert_own" ON public.match_disputes
  FOR INSERT TO authenticated WITH CHECK (raised_by = (SELECT auth.uid()));
CREATE POLICY "match_disputes_select_own" ON public.match_disputes
  FOR SELECT TO authenticated USING (raised_by = (SELECT auth.uid()));

-- ===================== match_registrations =====================
DROP POLICY IF EXISTS "Admins can manage registrations." ON public.match_registrations;
CREATE POLICY "match_registrations_manage_admin" ON public.match_registrations
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
-- "Registrations are viewable by everyone." korunuyor

-- ===================== match_score_tokens =====================
DROP POLICY IF EXISTS "Tokens readable by participants and owner" ON public.match_score_tokens;
CREATE POLICY "match_score_tokens_select" ON public.match_score_tokens
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM matches m WHERE m.id = match_score_tokens.match_id
            AND (m.captain_id = (SELECT auth.uid()) OR m."creatorId" = (SELECT auth.uid()) OR m."refereeId" = (SELECT auth.uid())))
    OR EXISTS (SELECT 1 FROM pitch_bookings pb JOIN pitches p ON p.id = pb.pitch_id
               WHERE pb.match_id = match_score_tokens.match_id AND p.owner_id = (SELECT auth.uid()))
    OR public.is_admin()
  );

-- ===================== matches (çift SELECT temizliği + admin) =====================
DROP POLICY IF EXISTS "Creators or Admins can delete matches" ON public.matches;
DROP POLICY IF EXISTS "Creators or Admins can update matches" ON public.matches;
DROP POLICY IF EXISTS "Authenticated users can create matches" ON public.matches;
DROP POLICY IF EXISTS "Herkes maçları görebilir" ON public.matches;
DROP POLICY IF EXISTS "Matches are viewable by everyone" ON public.matches;
CREATE POLICY "matches_select_public" ON public.matches
  FOR SELECT TO public USING (true);
CREATE POLICY "matches_insert_authenticated" ON public.matches
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "matches_update_creator_or_admin" ON public.matches
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = captain_id OR public.is_admin())
  WITH CHECK ((SELECT auth.uid()) = captain_id OR public.is_admin());
CREATE POLICY "matches_delete_creator_or_admin" ON public.matches
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = captain_id OR public.is_admin());

-- ===================== notification_templates =====================
DROP POLICY IF EXISTS "Admins can manage templates" ON public.notification_templates;
CREATE POLICY "notification_templates_manage_admin" ON public.notification_templates
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
-- service_role + "Anyone authenticated can read templates" korunuyor

-- ===================== notifications (çift UPDATE temizliği + perf) =====================
DROP POLICY IF EXISTS "Users can delete own notifications" ON public.notifications;
DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can mark own notifications read" ON public.notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
CREATE POLICY "notifications_delete_own" ON public.notifications
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "notifications_insert_authenticated" ON public.notifications
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "notifications_select_own" ON public.notifications
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "notifications_update_own" ON public.notifications
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
-- service_role insert/update politikaları korunuyor

-- ===================== owner_withdrawal_requests (SUPER_ADMIN) =====================
DROP POLICY IF EXISTS "Admins manage all requests" ON public.owner_withdrawal_requests;
DROP POLICY IF EXISTS "Owners create requests" ON public.owner_withdrawal_requests;
DROP POLICY IF EXISTS "Owners view own requests" ON public.owner_withdrawal_requests;
CREATE POLICY "withdrawals_manage_superadmin" ON public.owner_withdrawal_requests
  FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY "withdrawals_insert_owner" ON public.owner_withdrawal_requests
  FOR INSERT TO authenticated WITH CHECK (owner_id = (SELECT auth.uid()));
CREATE POLICY "withdrawals_select_own" ON public.owner_withdrawal_requests
  FOR SELECT TO authenticated USING (owner_id = (SELECT auth.uid()));

-- ===================== pitch_availability_exceptions =====================
DROP POLICY IF EXISTS "Owners manage exceptions" ON public.pitch_availability_exceptions;
CREATE POLICY "pitch_exceptions_manage" ON public.pitch_availability_exceptions
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM pitches WHERE pitches.id = pitch_availability_exceptions.pitch_id AND pitches.owner_id = (SELECT auth.uid()))
    OR public.is_admin()
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM pitches WHERE pitches.id = pitch_availability_exceptions.pitch_id AND pitches.owner_id = (SELECT auth.uid()))
    OR public.is_admin()
  );
-- "Exceptions publicly viewable" korunuyor

-- ===================== pitch_bookings (admin-ALL owner per-action ile birleşti) =====================
DROP POLICY IF EXISTS "Admins manage bookings" ON public.pitch_bookings;
DROP POLICY IF EXISTS "Owners can delete bookings for their pitches" ON public.pitch_bookings;
DROP POLICY IF EXISTS "Owners can insert bookings for their pitches" ON public.pitch_bookings;
DROP POLICY IF EXISTS "Owners view their bookings" ON public.pitch_bookings;
DROP POLICY IF EXISTS "Owners can update bookings for their pitches" ON public.pitch_bookings;
CREATE POLICY "pitch_bookings_select" ON public.pitch_bookings
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM pitches p WHERE p.id = pitch_bookings.pitch_id AND p.owner_id = (SELECT auth.uid())) OR public.is_admin());
CREATE POLICY "pitch_bookings_insert" ON public.pitch_bookings
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM pitches p WHERE p.id = pitch_bookings.pitch_id AND p.owner_id = (SELECT auth.uid())) OR public.is_admin());
CREATE POLICY "pitch_bookings_update" ON public.pitch_bookings
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM pitches p WHERE p.id = pitch_bookings.pitch_id AND p.owner_id = (SELECT auth.uid())) OR public.is_admin())
  WITH CHECK (EXISTS (SELECT 1 FROM pitches p WHERE p.id = pitch_bookings.pitch_id AND p.owner_id = (SELECT auth.uid())) OR public.is_admin());
CREATE POLICY "pitch_bookings_delete" ON public.pitch_bookings
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM pitches p WHERE p.id = pitch_bookings.pitch_id AND p.owner_id = (SELECT auth.uid())) OR public.is_admin());

-- ===================== pitch_debtors =====================
DROP POLICY IF EXISTS "Owners manage their debtors" ON public.pitch_debtors;
CREATE POLICY "pitch_debtors_manage" ON public.pitch_debtors
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM pitches WHERE pitches.id = pitch_debtors.pitch_id AND pitches.owner_id = (SELECT auth.uid())) OR public.is_admin())
  WITH CHECK (EXISTS (SELECT 1 FROM pitches WHERE pitches.id = pitch_debtors.pitch_id AND pitches.owner_id = (SELECT auth.uid())) OR public.is_admin());

-- ===================== pitch_expenses =====================
DROP POLICY IF EXISTS "Owners manage their expenses" ON public.pitch_expenses;
CREATE POLICY "pitch_expenses_manage" ON public.pitch_expenses
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM pitches WHERE pitches.id = pitch_expenses.pitch_id AND pitches.owner_id = (SELECT auth.uid())) OR public.is_admin())
  WITH CHECK (EXISTS (SELECT 1 FROM pitches WHERE pitches.id = pitch_expenses.pitch_id AND pitches.owner_id = (SELECT auth.uid())) OR public.is_admin());

-- ===================== pitch_flash_deals =====================
DROP POLICY IF EXISTS "Owners manage flash deals" ON public.pitch_flash_deals;
CREATE POLICY "pitch_flash_deals_manage" ON public.pitch_flash_deals
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM pitches WHERE pitches.id = pitch_flash_deals.pitch_id AND pitches.owner_id = (SELECT auth.uid())) OR public.is_admin())
  WITH CHECK (EXISTS (SELECT 1 FROM pitches WHERE pitches.id = pitch_flash_deals.pitch_id AND pitches.owner_id = (SELECT auth.uid())) OR public.is_admin());
-- "Flash deals publicly viewable" korunuyor

-- ===================== pitch_subscriptions =====================
DROP POLICY IF EXISTS "Admins manage subscriptions" ON public.pitch_subscriptions;
DROP POLICY IF EXISTS "Owners manage their subscriptions" ON public.pitch_subscriptions;
DROP POLICY IF EXISTS "Subscribers view own subscriptions" ON public.pitch_subscriptions;
CREATE POLICY "pitch_subscriptions_manage" ON public.pitch_subscriptions
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM pitches p WHERE p.id = pitch_subscriptions.pitch_id AND p.owner_id = (SELECT auth.uid())) OR public.is_admin())
  WITH CHECK (EXISTS (SELECT 1 FROM pitches p WHERE p.id = pitch_subscriptions.pitch_id AND p.owner_id = (SELECT auth.uid())) OR public.is_admin());
CREATE POLICY "pitch_subscriptions_select_own" ON public.pitch_subscriptions
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

-- ===================== pitch_tariffs =====================
DROP POLICY IF EXISTS "Owners manage their tariffs" ON public.pitch_tariffs;
CREATE POLICY "pitch_tariffs_manage" ON public.pitch_tariffs
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM pitches WHERE pitches.id = pitch_tariffs.pitch_id AND pitches.owner_id = (SELECT auth.uid())) OR public.is_admin())
  WITH CHECK (EXISTS (SELECT 1 FROM pitches WHERE pitches.id = pitch_tariffs.pitch_id AND pitches.owner_id = (SELECT auth.uid())) OR public.is_admin());
-- "Tariffs are publicly viewable" korunuyor

-- ===================== pitches (en dağınık tablo - tam temizlik) =====================
DROP POLICY IF EXISTS "Admins can manage pitches." ON public.pitches;
DROP POLICY IF EXISTS "Owners or Admins can delete pitches" ON public.pitches;
DROP POLICY IF EXISTS "Owners can insert pitches" ON public.pitches;
DROP POLICY IF EXISTS "Owners can insert their own pitches" ON public.pitches;
DROP POLICY IF EXISTS "Pitches are viewable by everyone" ON public.pitches;
DROP POLICY IF EXISTS "Pitches are viewable by everyone." ON public.pitches;
DROP POLICY IF EXISTS "Owners can update their own pitches" ON public.pitches;
DROP POLICY IF EXISTS "Owners or Admins can update pitches" ON public.pitches;
CREATE POLICY "pitches_select_public" ON public.pitches
  FOR SELECT TO public USING (true);
CREATE POLICY "pitches_insert_owner_or_admin" ON public.pitches
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = owner_id OR public.is_admin());
CREATE POLICY "pitches_update_owner_or_admin" ON public.pitches
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = owner_id OR public.is_admin())
  WITH CHECK ((SELECT auth.uid()) = owner_id OR public.is_admin());
CREATE POLICY "pitches_delete_owner_or_admin" ON public.pitches
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = owner_id OR public.is_admin());

-- ===================== settings (SUPER_ADMIN) + çift SELECT =====================
DROP POLICY IF EXISTS "Only Admins can update settings" ON public.settings;
DROP POLICY IF EXISTS "Herkes ayarları görebilir" ON public.settings;
DROP POLICY IF EXISTS "Settings are viewable by everyone" ON public.settings;
CREATE POLICY "settings_manage_superadmin" ON public.settings
  FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY "settings_select_public" ON public.settings
  FOR SELECT TO public USING (true);

-- ===================== teams (çift SELECT + admin) =====================
DROP POLICY IF EXISTS "Captains or Admins can delete teams" ON public.teams;
DROP POLICY IF EXISTS "Authenticated users can create teams" ON public.teams;
DROP POLICY IF EXISTS "Herkes takımları görebilir" ON public.teams;
DROP POLICY IF EXISTS "Teams are viewable by everyone" ON public.teams;
DROP POLICY IF EXISTS "Captains or Admins can update teams" ON public.teams;
CREATE POLICY "teams_select_public" ON public.teams
  FOR SELECT TO public USING (true);
CREATE POLICY "teams_insert_authenticated" ON public.teams
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "teams_update_captain_or_admin" ON public.teams
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = captain_id OR public.is_admin())
  WITH CHECK ((SELECT auth.uid()) = captain_id OR public.is_admin());
CREATE POLICY "teams_delete_captain_or_admin" ON public.teams
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = captain_id OR public.is_admin());

-- ===================== texts =====================
DROP POLICY IF EXISTS "texts_admin_write" ON public.texts;
CREATE POLICY "texts_manage_admin" ON public.texts
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
-- "Herkes metinleri görebilir" korunuyor

-- ===================== waitlist =====================
DROP POLICY IF EXISTS "Admins can manage waitlist." ON public.waitlist;
CREATE POLICY "waitlist_manage_admin" ON public.waitlist
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
-- "Waitlist viewable by everyone." korunuyor

-- ===================== goalkeepers (çift SELECT temizliği) =====================
DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON public.goalkeepers;
-- "Herkes kalecileri görebilir" (SELECT true) tek başına yeterli, korunuyor

-- ===================== referees (çift SELECT temizliği) =====================
DROP POLICY IF EXISTS "Public referee profiles are viewable by everyone." ON public.referees;
-- "Herkes hakemleri görebilir" (SELECT true) korunuyor
