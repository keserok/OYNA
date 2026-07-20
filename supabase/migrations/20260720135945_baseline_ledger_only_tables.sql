-- ═══════════════════════════════════════════════════════════════════════════
-- BASELINE — yalnız-defterde tablolar (canlı introspeksiyon, 2026-07-20)
-- match_participants / push_log / support_tickets / support_ticket_messages /
-- owner_daily_summary (view): CREATE'leri yalnız canlı defterin repo-dışı
-- kayıtlarında; hiçbir repo migration'ı yaratmıyordu. Replay'i KIRMIYORLARDI
-- (DDL-zamanında kimse başvurmuyor) ama sıfırdan kurulan DB'de eksik
-- kalıyorlardı (bildirim/destek/katılımcı akışları çalışmazdı). Bu dosya
-- sadakat farkını sıfırlar. ÜRETİMDE: hepsi zaten var → tam no-op.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.match_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text DEFAULT 'PLAYER',
  status text DEFAULT 'CONFIRMED',
  joined_at timestamptz DEFAULT timezone('utc', now())
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='match_participants_match_id_fkey') THEN
    ALTER TABLE public.match_participants ADD CONSTRAINT match_participants_match_id_fkey
      FOREIGN KEY (match_id) REFERENCES public.matches(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='match_participants_match_id_user_id_key') THEN
    ALTER TABLE public.match_participants ADD CONSTRAINT match_participants_match_id_user_id_key
      UNIQUE (match_id, user_id);
  END IF;
END $$;
ALTER TABLE public.match_participants ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.push_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid,
  user_id uuid NOT NULL,
  push_token text NOT NULL,
  platform text NOT NULL,
  status text DEFAULT 'pending',
  apns_message_id text,
  fcm_message_id text,
  error_code text,
  error_message text,
  retry_count integer DEFAULT 0,
  sent_at timestamptz,
  created_at timestamptz DEFAULT timezone('utc', now())
);
ALTER TABLE public.push_log ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  channel text NOT NULL DEFAULT 'PLAYER',
  subject text NOT NULL,
  category text NOT NULL DEFAULT 'GENERAL',
  status text NOT NULL DEFAULT 'OPEN',
  priority text NOT NULL DEFAULT 'NORMAL',
  last_sender_role text NOT NULL DEFAULT 'USER',
  unread_for_admin boolean NOT NULL DEFAULT true,
  unread_for_user boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid
);
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.support_ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL,
  sender_id uuid,
  sender_role text NOT NULL,
  sender_name text,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='support_ticket_messages_ticket_id_fkey') THEN
    ALTER TABLE public.support_ticket_messages ADD CONSTRAINT support_ticket_messages_ticket_id_fkey
      FOREIGN KEY (ticket_id) REFERENCES public.support_tickets(id) ON DELETE CASCADE;
  END IF;
END $$;
ALTER TABLE public.support_ticket_messages ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE VIEW public.owner_daily_summary AS
 SELECT id AS pitch_id,
    name AS pitch_name,
    owner_id,
    CURRENT_DATE AS summary_date,
    ( SELECT count(*) FROM public.pitch_bookings pb
       WHERE pb.pitch_id = p.id AND pb.booking_date = CURRENT_DATE) AS total_bookings_today,
    ( SELECT count(*) FROM public.pitch_bookings pb
       WHERE pb.pitch_id = p.id AND pb.booking_date = CURRENT_DATE AND pb.status::text = 'CONFIRMED') AS confirmed_today,
    ( SELECT count(*) FROM public.pitch_bookings pb
       WHERE pb.pitch_id = p.id AND pb.booking_date = CURRENT_DATE AND pb.status::text = 'PENDING') AS pending_today,
    ( SELECT COALESCE(sum(pb.price), 0::numeric) FROM public.pitch_bookings pb
       WHERE pb.pitch_id = p.id AND pb.booking_date = CURRENT_DATE AND pb.status::text = 'CONFIRMED') AS expected_revenue_today,
    ( SELECT COALESCE(sum(pb.paid_amount), 0::numeric) FROM public.pitch_bookings pb
       WHERE pb.pitch_id = p.id AND pb.booking_date = CURRENT_DATE) AS collected_today,
    ( SELECT count(*) FROM public.courts c WHERE c.pitch_id = p.id) AS total_courts,
    ( SELECT count(*) FROM public.courts c WHERE c.pitch_id = p.id AND c.is_active = true) AS active_courts
   FROM public.pitches p;
