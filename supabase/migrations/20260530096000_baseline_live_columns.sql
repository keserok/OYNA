-- ═══════════════════════════════════════════════════════════════════════════
-- BASELINE — profiles/notifications eksik kolonları (canlı introspeksiyon,
-- 2026-07-20). Repo'nun erken CREATE'leri bu tabloları eski/dar şekille
-- kurar; sonraki dosyalar (20260607000000 view'ı: p.full_name; bildirim
-- fonksiyonları: type_key/deep_link/sender_id...) bugünkü kolonları bekler
-- ama birçoğunu hiçbir migration eklemez. Tam canlı kolon seti IF NOT EXISTS
-- ile eklenir: var olanlar no-op, tarihteki ADD COLUMN IF NOT EXISTS'ler
-- no-op'a düşer. ÜRETİMDE: tamamı no-op.
-- Bkz: docs/master/SUPABASE_MIGRATION_RECONCILIATION.md §1.2
-- ═══════════════════════════════════════════════════════════════════════════

-- ── profiles (canlı tam set) ─────────────────────────────────────────────────
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role varchar DEFAULT 'PLAYER';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS trust_score double precision DEFAULT 5.0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS skill_rating double precision DEFAULT 4.0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ratings_history jsonb[] DEFAULT '{}'::jsonb[];
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS reliability_score integer DEFAULT 100;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_verified boolean DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_banned boolean DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS join_date timestamptz DEFAULT now();
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS push_token text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS push_token_platform text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS push_token_updated_at timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS notification_preferences jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_location jsonb;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS wallet_balance numeric DEFAULT 0.0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS rating numeric DEFAULT 5.0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_pro boolean DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS match_count integer DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS wallet numeric DEFAULT 0.0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ban_expires_at timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS communities jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS player_card jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS oyna_id text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS friends jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_looking_for_team boolean DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_available boolean DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS diamonds integer DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS win_count integer DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS total_matches integer DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS roles jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT timezone('utc', now());
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS verification_status text DEFAULT 'approved';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS verification_notes text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_admin boolean DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_active_at timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone_verified boolean DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS verification_reviewed_by uuid;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS verification_reviewed_at timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS account_deletion_requested_at timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS birthdate date;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS card_active boolean DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS card_tier text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS "position" text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bio text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_searchable boolean DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS discoverable_by_phone boolean DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS show_online_status boolean DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS iyzico_card_user_key text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS age_range text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS gender text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS play_style text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS first_name text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_name text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS has_completed_onboarding boolean DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_minor boolean DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS guardian_consent_status text DEFAULT 'NONE';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS guardian_user_id uuid;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS guardian_link_code text;

-- ── pitch_bookings (canlı tam set) ───────────────────────────────────────────
ALTER TABLE public.pitch_bookings ADD COLUMN IF NOT EXISTS match_id uuid;
ALTER TABLE public.pitch_bookings ADD COLUMN IF NOT EXISTS title varchar;
ALTER TABLE public.pitch_bookings ADD COLUMN IF NOT EXISTS court_id uuid;
ALTER TABLE public.pitch_bookings ADD COLUMN IF NOT EXISTS subscription_id uuid;
ALTER TABLE public.pitch_bookings ADD COLUMN IF NOT EXISTS source varchar DEFAULT 'OWNER_MANUAL';
ALTER TABLE public.pitch_bookings ADD COLUMN IF NOT EXISTS payment_status varchar DEFAULT 'PENDING';
ALTER TABLE public.pitch_bookings ADD COLUMN IF NOT EXISTS price numeric DEFAULT 0;
ALTER TABLE public.pitch_bookings ADD COLUMN IF NOT EXISTS paid_amount numeric DEFAULT 0;
ALTER TABLE public.pitch_bookings ADD COLUMN IF NOT EXISTS customer_name varchar;
ALTER TABLE public.pitch_bookings ADD COLUMN IF NOT EXISTS customer_phone varchar;
ALTER TABLE public.pitch_bookings ADD COLUMN IF NOT EXISTS slot_range tsrange;
ALTER TABLE public.pitch_bookings ADD COLUMN IF NOT EXISTS tariff_id uuid;
ALTER TABLE public.pitch_bookings ADD COLUMN IF NOT EXISTS deposit_amount numeric DEFAULT 0;
ALTER TABLE public.pitch_bookings ADD COLUMN IF NOT EXISTS note text;
ALTER TABLE public.pitch_bookings ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
ALTER TABLE public.pitch_bookings ADD COLUMN IF NOT EXISTS cancelled_by uuid;
ALTER TABLE public.pitch_bookings ADD COLUMN IF NOT EXISTS cancellation_reason text;
ALTER TABLE public.pitch_bookings ADD COLUMN IF NOT EXISTS auto_approved_at timestamptz;

-- ── pitches (canlı tam set) ──────────────────────────────────────────────────
ALTER TABLE public.pitches ADD COLUMN IF NOT EXISTS district varchar;
ALTER TABLE public.pitches ADD COLUMN IF NOT EXISTS image text;
ALTER TABLE public.pitches ADD COLUMN IF NOT EXISTS images jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.pitches ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.pitches ADD COLUMN IF NOT EXISTS amenities jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.pitches ADD COLUMN IF NOT EXISTS price_per_person numeric;
ALTER TABLE public.pitches ADD COLUMN IF NOT EXISTS total_price numeric;
ALTER TABLE public.pitches ADD COLUMN IF NOT EXISTS working_hours jsonb DEFAULT '{"open": "10:00", "close": "02:00", "slot_duration": 60}'::jsonb;
ALTER TABLE public.pitches ADD COLUMN IF NOT EXISTS settings jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.pitches ADD COLUMN IF NOT EXISTS rating numeric DEFAULT 5.0;
ALTER TABLE public.pitches ADD COLUMN IF NOT EXISTS verification_status text DEFAULT 'pending';
ALTER TABLE public.pitches ADD COLUMN IF NOT EXISTS verification_notes text;
ALTER TABLE public.pitches ADD COLUMN IF NOT EXISTS is_open boolean DEFAULT true;
ALTER TABLE public.pitches ADD COLUMN IF NOT EXISTS auto_approve_minutes integer DEFAULT 35;
ALTER TABLE public.pitches ADD COLUMN IF NOT EXISTS pricing_mode text DEFAULT 'FULL';
ALTER TABLE public.pitches ADD COLUMN IF NOT EXISTS cancellation_policy jsonb DEFAULT '{"before_0h_refund_percent": 0, "before_12h_refund_percent": 50, "before_24h_refund_percent": 100}'::jsonb;
ALTER TABLE public.pitches ADD COLUMN IF NOT EXISTS iban text;
ALTER TABLE public.pitches ADD COLUMN IF NOT EXISTS platform_commission_rate numeric DEFAULT 10.0;
ALTER TABLE public.pitches ADD COLUMN IF NOT EXISTS google_rating numeric DEFAULT 0;
ALTER TABLE public.pitches ADD COLUMN IF NOT EXISTS google_review_count integer DEFAULT 0;
ALTER TABLE public.pitches ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE public.pitches ADD COLUMN IF NOT EXISTS price_per_match numeric;
ALTER TABLE public.pitches ADD COLUMN IF NOT EXISTS auto_approve_enabled boolean DEFAULT true;
ALTER TABLE public.pitches ADD COLUMN IF NOT EXISTS is_demo boolean DEFAULT false;
ALTER TABLE public.pitches ADD COLUMN IF NOT EXISTS payment_options jsonb DEFAULT '{"cash": true, "online": true, "deposit": false}'::jsonb;
ALTER TABLE public.pitches ADD COLUMN IF NOT EXISTS param_merchant_id text;
ALTER TABLE public.pitches ADD COLUMN IF NOT EXISTS param_client_id text;
ALTER TABLE public.pitches ADD COLUMN IF NOT EXISTS param_api_key text;
ALTER TABLE public.pitches ADD COLUMN IF NOT EXISTS rating_count integer DEFAULT 0;
ALTER TABLE public.pitches ADD COLUMN IF NOT EXISTS is_published boolean DEFAULT true;
ALTER TABLE public.pitches ADD COLUMN IF NOT EXISTS is_featured boolean DEFAULT false;
ALTER TABLE public.pitches ADD COLUMN IF NOT EXISTS flash_deals_enabled boolean DEFAULT false;
ALTER TABLE public.pitches ADD COLUMN IF NOT EXISTS show_availability_badge boolean DEFAULT false;
ALTER TABLE public.pitches ADD COLUMN IF NOT EXISTS map_label text;
ALTER TABLE public.pitches ADD COLUMN IF NOT EXISTS refund_full_hours numeric;
ALTER TABLE public.pitches ADD COLUMN IF NOT EXISTS refund_half_hours numeric;
ALTER TABLE public.pitches ADD COLUMN IF NOT EXISTS refund_half_pct numeric;

-- ── notifications (canlı tam set) ────────────────────────────────────────────
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS payload jsonb;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS is_read boolean DEFAULT false;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS type_key text DEFAULT 'system';
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS match_id uuid;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS team_id uuid;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS sender_id uuid;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS deep_link text;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS push_sent boolean DEFAULT false;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS push_sent_at timestamptz;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS push_error text;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS action_required boolean DEFAULT false;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS action_taken text;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS inbox boolean DEFAULT true;
