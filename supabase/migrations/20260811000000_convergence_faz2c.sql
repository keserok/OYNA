-- ============================================================================
-- YAKINSAMA (Faz 2c) — KALAN DRIFT: indeks / kısıt / trigger / fonksiyon / kolon
-- ----------------------------------------------------------------------------
-- Faz 2b (RLS + 4 sertleştirme) sonrası taze preview ↔ canlı KAPSAMLI diff'i
-- (fonksiyon, trigger, kolon, kısıt, indeks, grant, policy, view, enum) ile
-- kalan repo↔canlı farkları giderir. HER ifade canlının GÜNCEL durumunu yeniden
-- doğrular → CANLIDA NET NO-OP (idempotent CREATE/ADD IF NOT EXISTS, prod'da zaten
-- var). Yalnız sıfırdan (fresh preview) kurulumda eksikleri tamamlar ve repo'yu
-- canlının BİREBİR aynası yapar. Doğrulama: fresh preview envanteri canlıyla md5-eş.
-- ============================================================================

-- ── 1) İNDEKSLER: canlıda olup repoda olmayan bağımsız (kısıt-dışı) indeksler ──
--    Ağırlıklı olarak FK-kolonlarını kapsayan performans indeksleri (idx_fk_*).
CREATE INDEX IF NOT EXISTS courts_pitch_id_idx ON public.courts USING btree (pitch_id);
CREATE INDEX IF NOT EXISTS idx_fk_app_config_updated_by ON public.app_config USING btree (updated_by);
CREATE INDEX IF NOT EXISTS idx_fk_audit_logs_admin_id_fkey ON public.audit_logs USING btree (admin_id);
CREATE INDEX IF NOT EXISTS idx_fk_booking_payments_recorded_by_fkey ON public.booking_payments USING btree (recorded_by);
CREATE INDEX IF NOT EXISTS idx_fk_commission_config_created_by ON public.commission_config USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_fk_feature_flags_updated_by ON public.feature_flags USING btree (updated_by);
CREATE INDEX IF NOT EXISTS idx_fk_friend_prefs_friend_id ON public.friend_prefs USING btree (friend_id);
CREATE INDEX IF NOT EXISTS idx_fk_individual_matches_pitch_id_fkey ON public.individual_matches USING btree (pitch_id);
CREATE INDEX IF NOT EXISTS idx_fk_match_disputes_match_id_fkey ON public.match_disputes USING btree (match_id);
CREATE INDEX IF NOT EXISTS idx_fk_match_disputes_raised_by_fkey ON public.match_disputes USING btree (raised_by);
CREATE INDEX IF NOT EXISTS idx_fk_match_disputes_resolved_by_fkey ON public.match_disputes USING btree (resolved_by);
CREATE INDEX IF NOT EXISTS idx_fk_match_notes_user_id ON public.match_notes USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_fk_match_participants_user_id_fkey ON public.match_participants USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_fk_match_registrations_user_id_fkey ON public.match_registrations USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_fk_match_score_approvals_user_id ON public.match_score_approvals USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_fk_match_score_proposals_proposed_by ON public.match_score_proposals USING btree (proposed_by);
CREATE INDEX IF NOT EXISTS idx_fk_match_score_tokens_used_by_fkey ON public.match_score_tokens USING btree (used_by);
CREATE INDEX IF NOT EXISTS idx_fk_matches_captain_id_fkey ON public.matches USING btree (captain_id);
CREATE INDEX IF NOT EXISTS idx_fk_minor_payment_consents_minor_user_id ON public.minor_payment_consents USING btree (minor_user_id);
CREATE INDEX IF NOT EXISTS idx_fk_minor_payment_consents_payment_intent_id ON public.minor_payment_consents USING btree (payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_fk_notifications_match_id_fkey ON public.notifications USING btree (match_id);
CREATE INDEX IF NOT EXISTS idx_fk_notifications_sender_id_fkey ON public.notifications USING btree (sender_id);
CREATE INDEX IF NOT EXISTS idx_fk_notifications_team_id_fkey ON public.notifications USING btree (team_id);
CREATE INDEX IF NOT EXISTS idx_fk_notifications_user_id_fkey ON public.notifications USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_fk_owner_withdrawal_requests_pitch_id_fkey ON public.owner_withdrawal_requests USING btree (pitch_id);
CREATE INDEX IF NOT EXISTS idx_fk_owner_withdrawal_requests_processed_by_fkey ON public.owner_withdrawal_requests USING btree (processed_by);
CREATE INDEX IF NOT EXISTS idx_fk_payout_requests_payout_method_id ON public.payout_requests USING btree (payout_method_id);
CREATE INDEX IF NOT EXISTS idx_fk_payout_requests_processed_by ON public.payout_requests USING btree (processed_by);
CREATE INDEX IF NOT EXISTS idx_fk_pitch_availability_exceptions_court_id_fkey ON public.pitch_availability_exceptions USING btree (court_id);
CREATE INDEX IF NOT EXISTS idx_fk_pitch_bookings_cancelled_by_fkey ON public.pitch_bookings USING btree (cancelled_by);
CREATE INDEX IF NOT EXISTS idx_fk_pitch_bookings_match_id_fkey ON public.pitch_bookings USING btree (match_id);
CREATE INDEX IF NOT EXISTS idx_fk_pitch_bookings_tariff_id_fkey ON public.pitch_bookings USING btree (tariff_id);
CREATE INDEX IF NOT EXISTS idx_fk_pitch_bookings_user_id_fkey ON public.pitch_bookings USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_fk_pitch_change_requests_pitch_id ON public.pitch_change_requests USING btree (pitch_id);
CREATE INDEX IF NOT EXISTS idx_fk_pitch_change_requests_requested_by ON public.pitch_change_requests USING btree (requested_by);
CREATE INDEX IF NOT EXISTS idx_fk_pitch_change_requests_reviewed_by ON public.pitch_change_requests USING btree (reviewed_by);
CREATE INDEX IF NOT EXISTS idx_fk_pitch_content_audit_actor_id ON public.pitch_content_audit USING btree (actor_id);
CREATE INDEX IF NOT EXISTS idx_fk_pitch_debtors_oyna_user_id_fkey ON public.pitch_debtors USING btree (oyna_user_id);
CREATE INDEX IF NOT EXISTS idx_fk_pitch_expenses_created_by_fkey ON public.pitch_expenses USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_fk_pitch_flash_deals_claimed_by_fkey ON public.pitch_flash_deals USING btree (claimed_by);
CREATE INDEX IF NOT EXISTS idx_fk_pitch_flash_deals_court_id_fkey ON public.pitch_flash_deals USING btree (court_id);
CREATE INDEX IF NOT EXISTS idx_fk_pitch_media_uploaded_by ON public.pitch_media USING btree (uploaded_by);
CREATE INDEX IF NOT EXISTS idx_fk_pitch_ratings_rater_id ON public.pitch_ratings USING btree (rater_id);
CREATE INDEX IF NOT EXISTS idx_fk_pitch_slot_holds_court_id_fkey ON public.pitch_slot_holds USING btree (court_id);
CREATE INDEX IF NOT EXISTS idx_fk_pitch_slot_holds_held_by_fkey ON public.pitch_slot_holds USING btree (held_by);
CREATE INDEX IF NOT EXISTS idx_fk_pitch_staff_members_user_id ON public.pitch_staff_members USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_fk_pitch_subscriptions_user_id_fkey ON public.pitch_subscriptions USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_fk_pitch_tariffs_court_id_fkey ON public.pitch_tariffs USING btree (court_id);
CREATE INDEX IF NOT EXISTS idx_fk_pitch_views_viewer_id ON public.pitch_views USING btree (viewer_id);
CREATE INDEX IF NOT EXISTS idx_fk_player_ratings_ratee_id_fkey ON public.player_ratings USING btree (ratee_id);
CREATE INDEX IF NOT EXISTS idx_fk_player_ratings_rater_id_fkey ON public.player_ratings USING btree (rater_id);
CREATE INDEX IF NOT EXISTS idx_fk_provider_applications_reviewed_by ON public.provider_applications USING btree (reviewed_by);
CREATE INDEX IF NOT EXISTS idx_fk_provider_identities_verified_by ON public.provider_identities USING btree (verified_by);
CREATE INDEX IF NOT EXISTS idx_fk_push_log_notification_id_fkey ON public.push_log USING btree (notification_id);
CREATE INDEX IF NOT EXISTS idx_fk_service_offers_captain_id_fkey ON public.service_offers USING btree (captain_id);
CREATE INDEX IF NOT EXISTS idx_fk_service_offers_match_id_fkey ON public.service_offers USING btree (match_id);
CREATE INDEX IF NOT EXISTS idx_fk_service_offers_provider_id_fkey ON public.service_offers USING btree (provider_id);
CREATE INDEX IF NOT EXISTS idx_fk_service_ratings_rater_id ON public.service_ratings USING btree (rater_id);
CREATE INDEX IF NOT EXISTS idx_fk_tactic_favorites_user_id ON public.tactic_favorites USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_fk_tactic_votes_user_id ON public.tactic_votes USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_fk_user_blocks_blocked_id ON public.user_blocks USING btree (blocked_id);
CREATE INDEX IF NOT EXISTS idx_fk_user_reports_resolved_by ON public.user_reports USING btree (resolved_by);
CREATE INDEX IF NOT EXISTS idx_fk_waitlist_user_id_fkey ON public.waitlist USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_fk_wallet_transactions_match_id_fkey ON public.wallet_transactions USING btree (match_id);
CREATE INDEX IF NOT EXISTS idx_fk_wallet_transactions_user_id_fkey ON public.wallet_transactions USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_push_log_created_at ON public.push_log USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_push_log_status ON public.push_log USING btree (status);
CREATE INDEX IF NOT EXISTS idx_push_log_user_id ON public.push_log USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_support_ticket_messages_ticket ON public.support_ticket_messages USING btree (ticket_id, created_at);
CREATE INDEX IF NOT EXISTS idx_support_tickets_channel_status ON public.support_tickets USING btree (channel, status, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON public.support_tickets USING btree (user_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS pitch_bookings_court_date_idx ON public.pitch_bookings USING btree (court_id, booking_date);
CREATE INDEX IF NOT EXISTS pitch_bookings_subscription_idx ON public.pitch_bookings USING btree (subscription_id);
CREATE INDEX IF NOT EXISTS pitch_subscriptions_court_idx ON public.pitch_subscriptions USING btree (court_id);
CREATE INDEX IF NOT EXISTS pitch_subscriptions_pitch_idx ON public.pitch_subscriptions USING btree (pitch_id);

-- ── 2) KISITLAR: canlıda olup repoda olmayan FK / CHECK / UNIQUE / EXCLUDE ──────
--    (Her biri idempotent guard'lı; canlıda zaten var → NET NO-OP.)
--    NOT: match_tactics_pkey1 ve texts_pkey1 (canlıda repodan FARKLI birincil
--    anahtar tanımı) burada BİLEREK atlandı — 2. PK eklenemez; manuel inceleme
--    gerektirir (repo: match_tactics PK(id)/texts PK(...); canlı: PK(match_id)/PK(key)).
DO $cx$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint x WHERE x.conname='match_participants_user_id_fkey' AND x.conrelid='match_participants'::regclass) THEN ALTER TABLE public.match_participants ADD CONSTRAINT match_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE; END IF; END $cx$;
DO $cx$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint x WHERE x.conname='matches_commission_model_check' AND x.conrelid='matches'::regclass) THEN ALTER TABLE public.matches ADD CONSTRAINT matches_commission_model_check CHECK ((commission_model = ANY (ARRAY['MODEL_A'::text, 'MODEL_B'::text]))); END IF; END $cx$;
DO $cx$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint x WHERE x.conname='matches_gk_id_fkey' AND x.conrelid='matches'::regclass) THEN ALTER TABLE public.matches ADD CONSTRAINT matches_gk_id_fkey FOREIGN KEY (gk_id) REFERENCES profiles(id) ON DELETE SET NULL; END IF; END $cx$;
DO $cx$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint x WHERE x.conname='matches_pitch_id_fkey' AND x.conrelid='matches'::regclass) THEN ALTER TABLE public.matches ADD CONSTRAINT matches_pitch_id_fkey FOREIGN KEY (pitch_id) REFERENCES pitches(id) ON DELETE SET NULL; END IF; END $cx$;
DO $cx$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint x WHERE x.conname='matches_visibility_check' AND x.conrelid='matches'::regclass) THEN ALTER TABLE public.matches ADD CONSTRAINT matches_visibility_check CHECK ((visibility = ANY (ARRAY['OPEN'::text, 'PRIVATE'::text]))); END IF; END $cx$;
DO $cx$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint x WHERE x.conname='notifications_match_id_fkey' AND x.conrelid='notifications'::regclass) THEN ALTER TABLE public.notifications ADD CONSTRAINT notifications_match_id_fkey FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE SET NULL; END IF; END $cx$;
DO $cx$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint x WHERE x.conname='notifications_sender_id_fkey' AND x.conrelid='notifications'::regclass) THEN ALTER TABLE public.notifications ADD CONSTRAINT notifications_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES profiles(id) ON DELETE SET NULL; END IF; END $cx$;
DO $cx$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint x WHERE x.conname='notifications_team_id_fkey' AND x.conrelid='notifications'::regclass) THEN ALTER TABLE public.notifications ADD CONSTRAINT notifications_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL; END IF; END $cx$;
DO $cx$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint x WHERE x.conname='pitch_bookings_cancelled_by_fkey' AND x.conrelid='pitch_bookings'::regclass) THEN ALTER TABLE public.pitch_bookings ADD CONSTRAINT pitch_bookings_cancelled_by_fkey FOREIGN KEY (cancelled_by) REFERENCES profiles(id) ON DELETE SET NULL; END IF; END $cx$;
DO $cx$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint x WHERE x.conname='pitch_bookings_court_id_fkey' AND x.conrelid='pitch_bookings'::regclass) THEN ALTER TABLE public.pitch_bookings ADD CONSTRAINT pitch_bookings_court_id_fkey FOREIGN KEY (court_id) REFERENCES courts(id) ON DELETE CASCADE; END IF; END $cx$;
DO $cx$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint x WHERE x.conname='pitch_bookings_no_overlap' AND x.conrelid='pitch_bookings'::regclass) THEN ALTER TABLE public.pitch_bookings ADD CONSTRAINT pitch_bookings_no_overlap EXCLUDE USING gist (court_id WITH =, slot_range WITH &&) WHERE (((status)::text <> 'CANCELLED'::text)); END IF; END $cx$;
DO $cx$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint x WHERE x.conname='pitch_bookings_source_check' AND x.conrelid='pitch_bookings'::regclass) THEN ALTER TABLE public.pitch_bookings ADD CONSTRAINT pitch_bookings_source_check CHECK (((source)::text = ANY ((ARRAY['OWNER_MANUAL'::character varying, 'APP_BOOKING'::character varying, 'SUBSCRIPTION'::character varying, 'APP_MATCH'::character varying])::text[]))); END IF; END $cx$;
DO $cx$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint x WHERE x.conname='pitch_bookings_subscription_id_fkey' AND x.conrelid='pitch_bookings'::regclass) THEN ALTER TABLE public.pitch_bookings ADD CONSTRAINT pitch_bookings_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES pitch_subscriptions(id) ON DELETE CASCADE; END IF; END $cx$;
DO $cx$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint x WHERE x.conname='pitch_bookings_tariff_id_fkey' AND x.conrelid='pitch_bookings'::regclass) THEN ALTER TABLE public.pitch_bookings ADD CONSTRAINT pitch_bookings_tariff_id_fkey FOREIGN KEY (tariff_id) REFERENCES pitch_tariffs(id) ON DELETE SET NULL; END IF; END $cx$;
DO $cx$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint x WHERE x.conname='profiles_guardian_user_id_fkey' AND x.conrelid='profiles'::regclass) THEN ALTER TABLE public.profiles ADD CONSTRAINT profiles_guardian_user_id_fkey FOREIGN KEY (guardian_user_id) REFERENCES profiles(id) ON DELETE SET NULL; END IF; END $cx$;
DO $cx$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint x WHERE x.conname='profiles_oyna_id_key' AND x.conrelid='profiles'::regclass) THEN ALTER TABLE public.profiles ADD CONSTRAINT profiles_oyna_id_key UNIQUE (oyna_id); END IF; END $cx$;
DO $cx$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint x WHERE x.conname='profiles_wallet_balance_non_negative' AND x.conrelid='profiles'::regclass) THEN ALTER TABLE public.profiles ADD CONSTRAINT profiles_wallet_balance_non_negative CHECK ((wallet_balance >= (0)::numeric)); END IF; END $cx$;
DO $cx$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint x WHERE x.conname='push_log_notification_id_fkey' AND x.conrelid='push_log'::regclass) THEN ALTER TABLE public.push_log ADD CONSTRAINT push_log_notification_id_fkey FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE; END IF; END $cx$;
DO $cx$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint x WHERE x.conname='push_log_user_id_fkey' AND x.conrelid='push_log'::regclass) THEN ALTER TABLE public.push_log ADD CONSTRAINT push_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE; END IF; END $cx$;
DO $cx$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint x WHERE x.conname='service_offers_match_id_fkey' AND x.conrelid='service_offers'::regclass) THEN ALTER TABLE public.service_offers ADD CONSTRAINT service_offers_match_id_fkey FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE; END IF; END $cx$;
DO $cx$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint x WHERE x.conname='support_ticket_messages_sender_role_check' AND x.conrelid='support_ticket_messages'::regclass) THEN ALTER TABLE public.support_ticket_messages ADD CONSTRAINT support_ticket_messages_sender_role_check CHECK ((sender_role = ANY (ARRAY['USER'::text, 'ADMIN'::text]))); END IF; END $cx$;
DO $cx$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint x WHERE x.conname='support_tickets_channel_check' AND x.conrelid='support_tickets'::regclass) THEN ALTER TABLE public.support_tickets ADD CONSTRAINT support_tickets_channel_check CHECK ((channel = ANY (ARRAY['PLAYER'::text, 'OWNER'::text]))); END IF; END $cx$;
DO $cx$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint x WHERE x.conname='support_tickets_last_sender_role_check' AND x.conrelid='support_tickets'::regclass) THEN ALTER TABLE public.support_tickets ADD CONSTRAINT support_tickets_last_sender_role_check CHECK ((last_sender_role = ANY (ARRAY['USER'::text, 'ADMIN'::text]))); END IF; END $cx$;
DO $cx$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint x WHERE x.conname='support_tickets_priority_check' AND x.conrelid='support_tickets'::regclass) THEN ALTER TABLE public.support_tickets ADD CONSTRAINT support_tickets_priority_check CHECK ((priority = ANY (ARRAY['LOW'::text, 'NORMAL'::text, 'HIGH'::text, 'URGENT'::text]))); END IF; END $cx$;
DO $cx$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint x WHERE x.conname='support_tickets_status_check' AND x.conrelid='support_tickets'::regclass) THEN ALTER TABLE public.support_tickets ADD CONSTRAINT support_tickets_status_check CHECK ((status = ANY (ARRAY['OPEN'::text, 'PENDING'::text, 'RESOLVED'::text, 'CLOSED'::text]))); END IF; END $cx$;
DO $cx$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint x WHERE x.conname='support_tickets_user_id_fkey' AND x.conrelid='support_tickets'::regclass) THEN ALTER TABLE public.support_tickets ADD CONSTRAINT support_tickets_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE; END IF; END $cx$;
DO $cx$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint x WHERE x.conname='wallet_transactions_match_id_fkey' AND x.conrelid='wallet_transactions'::regclass) THEN ALTER TABLE public.wallet_transactions ADD CONSTRAINT wallet_transactions_match_id_fkey FOREIGN KEY (match_id) REFERENCES matches(id); END IF; END $cx$;
DO $cx$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint x WHERE x.conname='wallet_transactions_status_check' AND x.conrelid='wallet_transactions'::regclass) THEN ALTER TABLE public.wallet_transactions ADD CONSTRAINT wallet_transactions_status_check CHECK ((status = ANY (ARRAY['PENDING'::text, 'COMPLETED'::text, 'FAILED'::text, 'CANCELLED'::text]))); END IF; END $cx$;

-- ── 3) TRIGGER'LAR: canlıda olup repoda olmayan trigger'lar (idempotent) ────────
--    (Çağırdıkları fonksiyonlar repoda mevcut.)
DROP TRIGGER IF EXISTS on_match_participant_joined ON public.match_participants;
CREATE TRIGGER on_match_participant_joined AFTER INSERT ON public.match_participants FOR EACH ROW EXECUTE FUNCTION notify_match_joined();
DROP TRIGGER IF EXISTS on_match_cancelled ON public.matches;
CREATE TRIGGER on_match_cancelled AFTER UPDATE OF status ON public.matches FOR EACH ROW EXECUTE FUNCTION notify_match_cancelled();
DROP TRIGGER IF EXISTS on_match_ref_change ON public.matches;
CREATE TRIGGER on_match_ref_change AFTER UPDATE OF "refereeId" ON public.matches FOR EACH ROW EXECUTE FUNCTION notify_ref_status_change();
DROP TRIGGER IF EXISTS send_push_on_notification ON public.notifications;
CREATE TRIGGER send_push_on_notification AFTER INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION notify_send_push_webhook();
DROP TRIGGER IF EXISTS trg_protect_profile_columns ON public.profiles;
CREATE TRIGGER trg_protect_profile_columns BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION protect_profile_columns();

-- Repoda olup canlıda olmayan profiles trigger'ı (canlı, protect_profile_columns
-- kullanır; bu adı-farklı ikizi kaldırılır → canlıyla eşitlenir, canlıda NO-OP):
DROP TRIGGER IF EXISTS trg_protect_profile_sensitive_fields ON public.profiles;

-- ── NOT (Faz 2c artığı — bilinçli bırakıldı): "communities" otomasyonu ──────────
--    Repo, canlıda OLMAYAN topluluk otomasyonu içeriyor (generate_community_invite_code,
--    update_community_member_count, set_updated_at fonksiyonları + communities/
--    community_members üzerindeki 3 trigger). Canlıda topluluk TABLOLARI + RLS var
--    ama bu otomasyon YOK. Bunları düşürmek canlıyı AYNALAR ama bir özelliği repodan
--    siler; DEPLOY etmek ise canlıya davranış EKLER. Karar kullanıcıya ait → bu
--    yakınsamada DOKUNULMADI (bilinçli kalan fark).

