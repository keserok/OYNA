-- ═══════════════════════════════════════════════════════════════════════════
-- BASELINE — defter-öncesi eksikler (yapısal drift onarımı, 3. parti)
-- ---------------------------------------------------------------------------
-- Canlı defter (schema_migrations) 2026-06-06'da başlar; aşağıdaki nesnelere
-- ise Mayıs-Haziran repo dosyaları başvurur ama ya HİÇBİR migration yaratmaz
-- (pitch_subscriptions, notification_templates, goalkeepers."authUid") ya da
-- yaratan dosya başvurudan SONRA gelir (settings→20260708, friendships/
-- tactics→20260713, owner_accounts→20260616). Sıfırdan kurulum (Supabase
-- Preview / db reset) bu yüzden kırılıyordu.
--
-- Kaynaklar: kanonik repo tanımlarının birebir kopyası (settings, friendships,
-- tactics, owner_accounts — IF NOT EXISTS sayesinde orijinal dosyalar no-op'a
-- düşer) + canlı şema introspeksiyonu 2026-07-20 (pitch_subscriptions,
-- notification_templates, authUid). ÜRETİMDE: her şey zaten var → tam no-op.
-- Bkz: docs/master/SUPABASE_MIGRATION_RECONCILIATION.md §1.2
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────── settings (20260708 kanoniği) ─────────────────────
CREATE TABLE IF NOT EXISTS public.settings (
  id text PRIMARY KEY DEFAULT 'main',
  CONSTRAINT settings_singleton CHECK (id = 'main')
);
-- Canlı kolon seti (2026-07-20 introspeksiyon) — 20260623 admin paneli
-- "payoutMode" vb. bekler; hiçbir migration bu kolonları eklemiyordu.
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS "appName" text DEFAULT 'OYNA';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS "maintenanceMode" boolean DEFAULT false;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS "registrationOpen" boolean DEFAULT true;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS "proPrice" numeric DEFAULT 199;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS "commissionRate" numeric DEFAULT 10;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS "minRatingToPlay" numeric DEFAULT 2.5;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS "maxMatchsPerDay" integer DEFAULT 3;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS "featuredPitchId" text;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS "announcementBanner" text;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS "showAnnouncementBanner" boolean DEFAULT true;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS "payoutMode" text;
-- Tarihsel snake_case ikizi: 20260623000001 bunu "payoutMode"a taşıyıp DÜŞÜRÜR
-- (tarih aynen oynasın diye burada var; üretimde çoktan yok → IF NOT EXISTS
-- üretime dokunmaz, replay'de yaratılır ve tarih onu temizler).
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS payout_mode text;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS "tacticStudio" boolean DEFAULT true;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS "motmReveal" boolean DEFAULT true;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS "aiCoach" boolean DEFAULT true;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS "scoutSystem" boolean DEFAULT true;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS iyzico_sandbox_mode boolean DEFAULT true;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS capture_window_hours numeric DEFAULT 8;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS min_quorum_pct numeric DEFAULT 70;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS owner_payout_days integer DEFAULT 14;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS refund_free_hours numeric DEFAULT 8;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS refund_credit_hours numeric DEFAULT 3;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS service_request_expiry_hours numeric DEFAULT 24;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS booking_refund_full_hours numeric DEFAULT 24;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS booking_refund_half_hours numeric DEFAULT 6;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS booking_refund_half_pct numeric DEFAULT 50;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS refund_psp_fee_pct numeric DEFAULT 0;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS refund_psp_fee_fixed numeric DEFAULT 0;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS "maintenanceStartsAt" timestamptz;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS "maintenanceEndsAt" timestamptz;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- ──────────────────────── friendships (20260713 kanoniği) ───────────────────
CREATE TABLE IF NOT EXISTS public.friendships (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id            uuid,
  receiver_id          uuid,
  status               text DEFAULT 'PENDING',
  created_at           timestamptz NOT NULL DEFAULT timezone('utc', now()),
  sender_group         text,
  receiver_group       text,
  sender_is_favorite   boolean DEFAULT false,
  receiver_is_favorite boolean DEFAULT false,
  matches_together     integer DEFAULT 0
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='friendships_sender_id_fkey') THEN
    ALTER TABLE public.friendships ADD CONSTRAINT friendships_sender_id_fkey
      FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='friendships_receiver_id_fkey') THEN
    ALTER TABLE public.friendships ADD CONSTRAINT friendships_receiver_id_fkey
      FOREIGN KEY (receiver_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='friendships_sender_id_receiver_id_key') THEN
    ALTER TABLE public.friendships ADD CONSTRAINT friendships_sender_id_receiver_id_key
      UNIQUE (sender_id, receiver_id);
  END IF;
END $$;
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

-- ────────────────────────── tactics (20260713 kanoniği) ─────────────────────
CREATE TABLE IF NOT EXISTS public.tactics (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId"     uuid NOT NULL,
  mode         text,
  name         text NOT NULL,
  "teamName"   text,
  size         text,
  formation    text,
  slots        text,
  subs         text,
  "captainId"  text,
  notes        text,
  opponents    text,
  mentality    text,
  tempo        text,
  identity     text,
  drawings     text,
  "createdAt"  timestamptz NOT NULL DEFAULT timezone('utc', now()),
  "updatedAt"  timestamptz NOT NULL DEFAULT timezone('utc', now()),
  "teamId"     uuid,
  status       varchar DEFAULT 'APPROVED',
  "proposedBy" uuid,
  priority     integer DEFAULT 0,
  votes        jsonb DEFAULT '[]'::jsonb,
  is_active    boolean NOT NULL DEFAULT false
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tactics_userId_fkey') THEN
    ALTER TABLE public.tactics ADD CONSTRAINT "tactics_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tactics_teamId_fkey') THEN
    ALTER TABLE public.tactics ADD CONSTRAINT "tactics_teamId_fkey"
      FOREIGN KEY ("teamId") REFERENCES public.teams(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tactics_proposedBy_fkey') THEN
    ALTER TABLE public.tactics ADD CONSTRAINT "tactics_proposedBy_fkey"
      FOREIGN KEY ("proposedBy") REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;
ALTER TABLE public.tactics ENABLE ROW LEVEL SECURITY;

-- ──────────────────── owner_accounts (20260616000001 kanoniği) ──────────────
CREATE TABLE IF NOT EXISTS public.owner_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan_tier TEXT NOT NULL DEFAULT 'starter'
    CHECK (plan_tier IN ('starter', 'pro', 'enterprise')),
  status TEXT NOT NULL DEFAULT 'trialing'
    CHECK (status IN ('trialing', 'active', 'past_due', 'suspended', 'cancelled')),
  trial_ends_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '14 days'),
  entitlements JSONB NOT NULL DEFAULT '{
    "max_facilities": 1,
    "max_courts": 5,
    "max_staff": 10,
    "flash_deals": true,
    "finance": true,
    "team": true,
    "withdrawals": true
  }'::jsonb,
  billing_email TEXT,
  external_customer_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.owner_accounts ENABLE ROW LEVEL SECURITY;

-- ───────────── pitch_subscriptions (canlı introspeksiyon; tek tanım) ────────
CREATE TABLE IF NOT EXISTS public.pitch_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  court_id uuid NOT NULL,
  pitch_id uuid NOT NULL,
  customer_name varchar,
  customer_phone varchar,
  weekday integer NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  price numeric DEFAULT 0,
  status varchar DEFAULT 'ACTIVE',
  start_date date DEFAULT CURRENT_DATE,
  end_date date,
  materialized_until date,
  notes text,
  created_at timestamptz DEFAULT now(),
  user_id uuid,
  auto_renew boolean DEFAULT true,
  renewal_reminder_sent_at timestamptz
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='pitch_subscriptions_court_id_fkey') THEN
    ALTER TABLE public.pitch_subscriptions ADD CONSTRAINT pitch_subscriptions_court_id_fkey
      FOREIGN KEY (court_id) REFERENCES public.courts(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='pitch_subscriptions_pitch_id_fkey') THEN
    ALTER TABLE public.pitch_subscriptions ADD CONSTRAINT pitch_subscriptions_pitch_id_fkey
      FOREIGN KEY (pitch_id) REFERENCES public.pitches(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='pitch_subscriptions_user_id_fkey') THEN
    ALTER TABLE public.pitch_subscriptions ADD CONSTRAINT pitch_subscriptions_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='pitch_subscriptions_status_check') THEN
    ALTER TABLE public.pitch_subscriptions ADD CONSTRAINT pitch_subscriptions_status_check
      CHECK (status::text = ANY (ARRAY['ACTIVE','PAUSED','CANCELLED']));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='pitch_subscriptions_weekday_check') THEN
    ALTER TABLE public.pitch_subscriptions ADD CONSTRAINT pitch_subscriptions_weekday_check
      CHECK (weekday >= 0 AND weekday <= 6);
  END IF;
END $$;
ALTER TABLE public.pitch_subscriptions ENABLE ROW LEVEL SECURITY;

-- ─────────── notification_templates (canlı introspeksiyon; tek tanım) ───────
CREATE TABLE IF NOT EXISTS public.notification_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type_key text NOT NULL,
  label_tr text NOT NULL,
  title_tr text NOT NULL,
  body_tr text NOT NULL,
  title_en text,
  body_en text,
  category text DEFAULT 'MATCH',
  is_mandatory boolean DEFAULT false,
  can_user_disable boolean DEFAULT true,
  sound text DEFAULT 'default',
  badge_increment boolean DEFAULT true,
  sort_order integer DEFAULT 99,
  created_at timestamptz DEFAULT timezone('utc', now()),
  updated_at timestamptz DEFAULT timezone('utc', now())
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='notification_templates_type_key_key') THEN
    ALTER TABLE public.notification_templates ADD CONSTRAINT notification_templates_type_key_key
      UNIQUE (type_key);
  END IF;
END $$;
ALTER TABLE public.notification_templates ENABLE ROW LEVEL SECURITY;

-- ─────────────── match_tactics (20260713000011 kanoniği; 20260606 başvurur) ─
CREATE TABLE IF NOT EXISTS public.match_tactics (
  match_id    uuid PRIMARY KEY REFERENCES public.matches(id) ON DELETE CASCADE,
  tactic_id   uuid NOT NULL REFERENCES public.tactics(id) ON DELETE CASCADE,
  team_id     uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);
ALTER TABLE public.match_tactics ENABLE ROW LEVEL SECURITY;

-- ─────────────────── texts (20260618 kanoniği; 20260606 başvurur) ───────────
CREATE TABLE IF NOT EXISTS public.texts (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL DEFAULT '',
  category    TEXT DEFAULT 'ui',
  updated_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL
);
ALTER TABLE public.texts ENABLE ROW LEVEL SECURITY;

-- ─────── goalkeepers."authUid" (hiçbir migration eklemiyordu; canlı: uuid) ───
ALTER TABLE public.goalkeepers ADD COLUMN IF NOT EXISTS "authUid" uuid;
ALTER TABLE public.referees    ADD COLUMN IF NOT EXISTS "authUid" uuid;

-- ── service_offers: canlıdaki kolonlar (eski repo yaratımı captain_id'siz) ───
ALTER TABLE public.service_offers ADD COLUMN IF NOT EXISTS captain_id uuid;
ALTER TABLE public.service_offers ADD COLUMN IF NOT EXISTS offer_date date;
ALTER TABLE public.service_offers ADD COLUMN IF NOT EXISTS offer_time time;

-- ───────────── audit_logs (canlı introspeksiyon; 20260603'te başvurulur) ─────
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL,
  action text NOT NULL,
  target_id uuid,
  details text,
  "timestamp" timestamptz NOT NULL DEFAULT timezone('utc', now())
);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
