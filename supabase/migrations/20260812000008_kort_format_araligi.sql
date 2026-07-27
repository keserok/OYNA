-- ═══════════════════════════════════════════════════════════════════════════
-- KORT FORMAT ARALIĞI — kort başına min/maks "kaça kaç" (örn. 6v6–8v8)
--
-- Tesis sahibi (PitchManager) ve admin (Saha Kurulum Merkezi) kort başına
-- oynanabilir format aralığını ayarlar; vitrin kort satırlarında aralık
-- rozeti olarak görünür ve maç oluşturma akışı bu aralığı temel alacak.
--
-- Gösterim mevcut kapasite konvansiyonuyla aynı: TOPLAM oyuncu sayısı
-- (14 → 7v7). Aralık verilmemişse (NULL) vitrin legacy `capacity`'ye düşer.
-- Yazım yolu mevcut upsertCourt (courts tablosu, RLS owner/admin) — yeni RPC
-- gerekmez.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.courts
  ADD COLUMN IF NOT EXISTS min_capacity integer,
  ADD COLUMN IF NOT EXISTS max_capacity integer;

-- Geçerlilik: 2v2..11v11 (4–22, çift) + min ≤ maks. Idempotent kurulum.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = r.relnamespace
    WHERE n.nspname = 'public' AND r.relname = 'courts' AND c.conname = 'courts_capacity_range_check'
  ) THEN
    ALTER TABLE public.courts ADD CONSTRAINT courts_capacity_range_check CHECK (
      (min_capacity IS NULL OR (min_capacity BETWEEN 4 AND 22 AND min_capacity % 2 = 0))
      AND (max_capacity IS NULL OR (max_capacity BETWEEN 4 AND 22 AND max_capacity % 2 = 0))
      AND (min_capacity IS NULL OR max_capacity IS NULL OR min_capacity <= max_capacity)
    );
  END IF;
END $$;
