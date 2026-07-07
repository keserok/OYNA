-- ================================================================
-- SOSYAL AŞAMA 1.2 — friendships yeniden kurulumu (Spec §5 / Bölüm C)
-- Canlıda tablo BOŞ (0 satır — 2026-07-06 doğrulandı): dönüşüm sıfır riskli.
-- Geriye dönük uyumluluk: eski istemcilerin SELECT ettiği sender_id /
-- receiver_id, GENERATED kolonlar olarak korunur (Aşama 2'de kalkar).
-- Yazım artık YALNIZ RPC'lerle (INSERT/UPDATE/DELETE politikası yok).
-- ================================================================

-- 1) Yeni kolonlar
ALTER TABLE public.friendships
  ADD COLUMN IF NOT EXISTS requester_id uuid,
  ADD COLUMN IF NOT EXISTS addressee_id uuid,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  ADD COLUMN IF NOT EXISTS responded_at timestamptz;

-- 2) Eski kolonlardan aktarım (tablo boş — kural gereği yine de yazılır)
UPDATE public.friendships
SET requester_id = sender_id, addressee_id = receiver_id
WHERE requester_id IS NULL AND sender_id IS NOT NULL;

-- 3) Eski yön kolonları → GENERATED (eski istemci SELECT'leri çalışmayı sürdürür)
--    Önce eski kolonlara bağımlı RLS politikaları düşürülür (bağımlılık sırası).
DROP POLICY IF EXISTS fr_select_participant ON public.friendships;
DROP POLICY IF EXISTS fr_insert_sender ON public.friendships;
DROP POLICY IF EXISTS fr_update_participant ON public.friendships;
DROP POLICY IF EXISTS fr_delete_participant ON public.friendships;
DROP POLICY IF EXISTS fr_update_own_group ON public.friendships;
ALTER TABLE public.friendships DROP CONSTRAINT IF EXISTS friendships_sender_id_receiver_id_key;
ALTER TABLE public.friendships DROP CONSTRAINT IF EXISTS friendships_sender_id_fkey;
ALTER TABLE public.friendships DROP CONSTRAINT IF EXISTS friendships_receiver_id_fkey;
DROP INDEX IF EXISTS public.friendships_sender_receiver_idx;
DROP INDEX IF EXISTS public.idx_fk_friendships_receiver_id_fkey;
ALTER TABLE public.friendships DROP COLUMN IF EXISTS sender_id;
ALTER TABLE public.friendships DROP COLUMN IF EXISTS receiver_id;
ALTER TABLE public.friendships
  ADD COLUMN IF NOT EXISTS sender_id   uuid GENERATED ALWAYS AS (requester_id) STORED,
  ADD COLUMN IF NOT EXISTS receiver_id uuid GENERATED ALWAYS AS (addressee_id) STORED;

-- 4) Kısıtlar (tablo boş → doğrudan uygulanır)
ALTER TABLE public.friendships
  ALTER COLUMN requester_id SET NOT NULL,
  ALTER COLUMN addressee_id SET NOT NULL,
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN status SET DEFAULT 'PENDING';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='friendships_requester_id_fkey') THEN
    ALTER TABLE public.friendships ADD CONSTRAINT friendships_requester_id_fkey
      FOREIGN KEY (requester_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='friendships_addressee_id_fkey') THEN
    ALTER TABLE public.friendships ADD CONSTRAINT friendships_addressee_id_fkey
      FOREIGN KEY (addressee_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='friendships_no_self_check') THEN
    ALTER TABLE public.friendships ADD CONSTRAINT friendships_no_self_check
      CHECK (requester_id <> addressee_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='friendships_status_check') THEN
    ALTER TABLE public.friendships ADD CONSTRAINT friendships_status_check
      CHECK (status IN ('PENDING','ACCEPTED','REJECTED'));
  END IF;
END $$;

-- KANONİK ÇİFT: (A→B) ve (B→A) aynı satıra kilitlenir (Spec C19)
CREATE UNIQUE INDEX IF NOT EXISTS friendships_pair_uidx
  ON public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
CREATE INDEX IF NOT EXISTS friendships_addressee_status_idx ON public.friendships (addressee_id, status);
CREATE INDEX IF NOT EXISTS friendships_requester_status_idx ON public.friendships (requester_id, status);

-- 5) updated_at tetikleyicisi
CREATE OR REPLACE FUNCTION public._touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := timezone('utc', now()); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_friendships_touch ON public.friendships;
CREATE TRIGGER trg_friendships_touch
  BEFORE UPDATE ON public.friendships
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

-- 6) RLS: SELECT katılımcı; yazım politikası bilinçli olarak YOK (sunucu otoritesi)
--    (eski politikalar 3. adımda düşürüldü)
CREATE POLICY fr_select_participant ON public.friendships
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = requester_id OR (SELECT auth.uid()) = addressee_id);

-- 7) _are_friends yeni kolonlara göre yeniden tanımlanır
--    (mesajlaşma RPC'leri get_or_create_conversation / send_message bunu kullanıyor)
CREATE OR REPLACE FUNCTION public._are_friends(a uuid, b uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = 'public','pg_temp' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.friendships
    WHERE status = 'ACCEPTED'
      AND least(requester_id, addressee_id) = least(a, b)
      AND greatest(requester_id, addressee_id) = greatest(a, b)
  );
$$;

-- 8) REJECTED çöp toplama: 90 günden eski ret kayıtları gecelik temizlenir (Spec C3)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'social_purge_rejected_friendships') THEN
    PERFORM cron.schedule(
      'social_purge_rejected_friendships',
      '15 3 * * *',
      $job$DELETE FROM public.friendships WHERE status = 'REJECTED' AND responded_at < now() - interval '90 days'$job$
    );
  END IF;
END $$;
