-- ═══════════════════════════════════════════════════════════════
-- Social View — Arkadaşlık tablosuna grup ve favori kolonları
-- ═══════════════════════════════════════════════════════════════

-- Friendships tablosuna grup ve favori kolonları ekleniyor
ALTER TABLE public.friendships
  ADD COLUMN IF NOT EXISTS sender_group TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS receiver_group TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS sender_is_favorite BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS receiver_is_favorite BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS matches_together INTEGER DEFAULT 0;

-- RLS politikası: Taraflar kendi bilgilerini güncelleyebilir
DROP POLICY IF EXISTS "fr_update_own_group" ON public.friendships;
CREATE POLICY "fr_update_own_group" ON public.friendships
  FOR UPDATE USING (
    auth.uid() = sender_id OR auth.uid() = receiver_id
  )
  WITH CHECK (
    auth.uid() = sender_id OR auth.uid() = receiver_id
  );

-- Performans için index
CREATE INDEX IF NOT EXISTS friendships_sender_receiver_idx
  ON public.friendships(sender_id, receiver_id);
CREATE INDEX IF NOT EXISTS friendships_status_idx
  ON public.friendships(status);
