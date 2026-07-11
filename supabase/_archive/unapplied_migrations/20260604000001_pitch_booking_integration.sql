-- Saha kiralama: pitch_bookings genişletme, pitches courts, oyuncu INSERT RLS

ALTER TABLE public.pitches ADD COLUMN IF NOT EXISTS courts JSONB DEFAULT '[]';
ALTER TABLE public.pitches ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT true;
ALTER TABLE public.pitches ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

ALTER TABLE public.pitch_bookings ADD COLUMN IF NOT EXISTS court_id TEXT;
ALTER TABLE public.pitch_bookings ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'OWNER';
ALTER TABLE public.pitch_bookings ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT 'PENDING';
ALTER TABLE public.pitch_bookings ADD COLUMN IF NOT EXISTS price DECIMAL(10,2);
ALTER TABLE public.pitch_bookings ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Oyuncu uygulama üzerinden PENDING rezervasyon oluşturabilir
DROP POLICY IF EXISTS "Players can insert own app bookings" ON public.pitch_bookings;
CREATE POLICY "Players can insert own app bookings"
ON public.pitch_bookings FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (user_id IS NULL OR user_id = auth.uid())
  AND status IN ('PENDING', 'CONFIRMED')
);

-- Oyuncu kendi bekleyen rezervasyonunu iptal edebilir
DROP POLICY IF EXISTS "Players can cancel own pending bookings" ON public.pitch_bookings;
CREATE POLICY "Players can cancel own pending bookings"
ON public.pitch_bookings FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
