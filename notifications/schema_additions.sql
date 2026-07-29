-- ═══════════════════════════════════════════════════════════════════
-- OYNA APP — Push Notification Veritabanı Şema Eklemeleri (v2 — Düzeltilmiş)
-- Supabase Dashboard → SQL Editor → RUN
--
-- NOT (IP-06): Canlı kaynak artık
-- supabase/migrations/20260728210000_ip06_bildirim_merkezi.sql; bu dosya yalnız
-- referans. Çakışma olursa migration doğrudur.
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- 1. PROFILES — Yeni Sütunlar
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS push_token TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS push_token_platform TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS push_token_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS last_location JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{
    "match_joined":       { "enabled": true,  "mandatory": true  },
    "match_cancelled":    { "enabled": true,  "mandatory": true  },
    "match_invite":       { "enabled": true,  "mandatory": true  },
    "team_invite":        { "enabled": true,  "mandatory": true  },
    "gk_accepted":        { "enabled": true,  "mandatory": true  },
    "gk_rejected":        { "enabled": true,  "mandatory": true  },
    "ref_accepted":       { "enabled": true,  "mandatory": true  },
    "ref_rejected":       { "enabled": true,  "mandatory": true  },
    "match_reminder_1h":  { "enabled": true,  "mandatory": false },
    "match_reminder_24h": { "enabled": true,  "mandatory": false },
    "nearby_match":       { "enabled": true,  "mandatory": false },
    "promo_offers":       { "enabled": false, "mandatory": false },
    "weekly_summary":     { "enabled": true,  "mandatory": false }
  }'::jsonb;


-- ─────────────────────────────────────────────────────────────────
-- 2. NOTIFICATIONS — Yeni Sütunlar (NOT NULL olmadan — mevcut verilerle uyumlu)
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS type_key TEXT DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS match_id UUID REFERENCES public.matches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sender_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deep_link TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS push_sent BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS push_sent_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS push_error TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS action_required BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS action_taken TEXT DEFAULT NULL;


-- ─────────────────────────────────────────────────────────────────
-- 3. MATCH_PARTICIPANTS — Yeni Tablo
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.match_participants (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'PLAYER',
  status TEXT DEFAULT 'CONFIRMED',
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  UNIQUE(match_id, user_id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND tablename = 'match_participants'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.match_participants;
  END IF;
END$$;


-- ─────────────────────────────────────────────────────────────────
-- 4. PUSH_LOG Tablosu
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.push_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  notification_id UUID REFERENCES public.notifications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  push_token TEXT NOT NULL,
  platform TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  apns_message_id TEXT DEFAULT NULL,
  fcm_message_id TEXT DEFAULT NULL,
  error_code TEXT DEFAULT NULL,
  error_message TEXT DEFAULT NULL,
  retry_count INTEGER DEFAULT 0,
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

CREATE INDEX IF NOT EXISTS idx_push_log_user_id ON public.push_log(user_id);
CREATE INDEX IF NOT EXISTS idx_push_log_status ON public.push_log(status);
CREATE INDEX IF NOT EXISTS idx_push_log_created_at ON public.push_log(created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND tablename = 'push_log'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.push_log;
  END IF;
END$$;


-- ─────────────────────────────────────────────────────────────────
-- 5. NOTIFICATION_TEMPLATES Tablosu
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notification_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type_key TEXT UNIQUE NOT NULL,
  label_tr TEXT NOT NULL,
  title_tr TEXT NOT NULL,
  body_tr TEXT NOT NULL,
  title_en TEXT DEFAULT NULL,
  body_en TEXT DEFAULT NULL,
  category TEXT DEFAULT 'MATCH',
  is_mandatory BOOLEAN DEFAULT false,
  can_user_disable BOOLEAN DEFAULT true,
  sound TEXT DEFAULT 'default',
  badge_increment BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 99,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

INSERT INTO public.notification_templates
  (type_key, label_tr, title_tr, body_tr, category, is_mandatory, can_user_disable, sort_order)
VALUES
  ('match_joined',       'Maça Oyuncu Katıldı',           '⚽ Yeni Oyuncu!',          '{{player_name}}, {{match_date}} tarihli maçına katıldı.',              'MATCH', true,  false, 1),
  ('match_cancelled',    'Maç İptal Edildi',               '❌ Maç İptal',             '{{match_date}} tarihli {{pitch_name}} maçı iptal edildi.',             'MATCH', true,  false, 2),
  ('match_invite',       'Kişisel Maç Daveti',             '📩 Maç Daveti',            '{{sender_name}} seni {{match_date}} maçına davet etti!',               'MATCH', true,  false, 3),
  ('team_invite',        'Takım Maç Daveti',               '🛡️ Takım Daveti',          '{{team_name}} takımından {{match_date}} maçına davet aldın.',           'TEAM',  true,  false, 4),
  ('gk_accepted',        'Kaleci Kabul Etti',              '🧤 Kaleci Onayladı!',      '{{gk_name}}, {{match_date}} maçını kabul etti.',                       'MATCH', true,  false, 5),
  ('gk_rejected',        'Kaleci Reddetti',                '🧤 Kaleci Reddetti',       '{{gk_name}}, {{match_date}} maçına katılamayacağını bildirdi.',        'MATCH', true,  false, 6),
  ('ref_accepted',       'Hakem Kabul Etti',               '🟡 Hakem Onayladı!',       '{{ref_name}}, {{match_date}} maçını kabul etti.',                      'MATCH', true,  false, 7),
  ('ref_rejected',       'Hakem Reddetti',                 '🟡 Hakem Reddetti',        '{{ref_name}}, {{match_date}} maçına katılamayacağını bildirdi.',       'MATCH', true,  false, 8),
  ('match_reminder_1h',  '1 Saat Hatırlatıcı',            '⏰ Maç 1 Saat Kaldı!',    '{{pitch_name}} maçına 1 saat kaldı. Hazır ol!',                        'MATCH', false, true,  9),
  ('match_reminder_24h', '24 Saat Hatırlatıcı',           '📅 Yarın Maç Var!',        'Yarın {{match_time}} saatinde {{pitch_name}} maçın var.',              'MATCH', false, true,  10),
  ('nearby_match',       'Yakında Maç',                    '📍 Yakında Maç!',          '{{distance}} km yakınında açık bir maç var. Hemen katıl!',             'MATCH', false, true,  11),
  ('promo_offers',       'Özel Kampanyalar',               '🎁 Özel Fırsat!',          '{{promo_text}}',                                                       'PROMO', false, true,  12),
  ('weekly_summary',     'Haftalık Performans Özeti',      '📊 Haftalık Özet',         'Bu hafta {{match_count}} maç oynadın. Puan ortalaması: {{rating}}',    'SYSTEM',false, true,  13)
ON CONFLICT (type_key) DO UPDATE SET
  label_tr   = EXCLUDED.label_tr,
  title_tr   = EXCLUDED.title_tr,
  body_tr    = EXCLUDED.body_tr,
  updated_at = NOW();
