-- ═══════════════════════════════════════════════════════════════════════════
-- BASELINE — public.matches (yapısal defter drift'i onarımı)
-- ---------------------------------------------------------------------------
-- SORUN: Çekirdek `public.matches` tablosu hiçbir migration'da YARATILMIYOR
-- (tarihsel olarak repo-dışı/panelden kuruldu); ama 20260530000002'den itibaren
-- onlarca dosya ona başvuruyor. Sonuç: sıfırdan kurulum (Supabase Preview
-- branch, `db reset`, felaket-kurtarma) ilk başvuruda kırılıyordu.
-- Bkz: docs/master/SUPABASE_MIGRATION_RECONCILIATION.md
--
-- ÇÖZÜM: Canlı üretim şemasından birebir çıkarılan kolon seti (2026-07-19
-- introspection) + PRIMARY KEY. BİLEREK dahil edilmeyenler: CHECK/FK
-- kısıtları, index'ler, policy'ler — bunları tarihteki migration'lar zaten
-- kendileri ekliyor; burada da eklemek replay'de çakışma yaratırdı.
-- Sonraki tüm `ADD COLUMN IF NOT EXISTS`'ler bu tabloda no-op olur.
--
-- ÜRETİMDE: tablo zaten var → IF NOT EXISTS ile bu dosya tamamen no-op.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.matches (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title              text NOT NULL,
  location           text,
  "time"             text,
  date               text,
  price              numeric DEFAULT 0,
  difficulty         text,
  "minRating"        numeric DEFAULT 0,
  image              text,
  badges             jsonb DEFAULT '[]'::jsonb,
  "missingPositions" jsonb DEFAULT '[]'::jsonb,
  slots              jsonb DEFAULT '[]'::jsonb,
  status             text DEFAULT 'DRAFT'::text,
  "creatorId"        uuid,
  "communityId"      text,
  format             text,
  duration           text,
  gender             text,
  "ageGroup"         text,
  "refereeId"        uuid,
  "homeTeamId"       uuid,
  "awayTeamId"       uuid,
  "homeScore"        integer,
  "awayScore"        integer,
  "scoreEnteredAt"   timestamptz,
  captain_id         uuid,
  "isDemo"           boolean NOT NULL DEFAULT false,
  cancel_reason      text,
  refund_status      text,
  created_at         timestamptz DEFAULT now(),
  "awaySlots"        jsonb DEFAULT '[]'::jsonb,
  "reservePlayers"   jsonb DEFAULT '[]'::jsonb,
  "chatMessages"     jsonb NOT NULL DEFAULT '[]'::jsonb,
  pitch_id           uuid,
  visibility         text NOT NULL DEFAULT 'OPEN'::text,
  private_code       text,
  is_successful      boolean NOT NULL DEFAULT false,
  confirmed_at       timestamptz,
  starts_at          timestamptz,
  gk_id              uuid,
  reminder_24h_sent  boolean NOT NULL DEFAULT false,
  reminder_1h_sent   boolean NOT NULL DEFAULT false,
  commission_model   text NOT NULL DEFAULT 'MODEL_A'::text,
  image_auto         boolean NOT NULL DEFAULT true,
  deposit_intent_id  uuid,
  deposit_status     text NOT NULL DEFAULT 'NONE'::text,
  deposit_amount     numeric,
  min_players        integer,
  deferred_providers jsonb NOT NULL DEFAULT '[]'::jsonb
);

ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
