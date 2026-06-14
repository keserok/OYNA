-- ==============================================================================
-- OYNA: Tesis Sahibi (Owner) ve Slot Yönetim Entegrasyonu
-- ==============================================================================

-- 1. Pitches (Tesisler) Tablosuna Tesis Sahibini ve Özellikleri Ekleme
ALTER TABLE public.pitches ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.pitches ADD COLUMN IF NOT EXISTS district VARCHAR(100);
ALTER TABLE public.pitches ADD COLUMN IF NOT EXISTS image TEXT;
ALTER TABLE public.pitches ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]';
ALTER TABLE public.pitches ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.pitches ADD COLUMN IF NOT EXISTS amenities JSONB DEFAULT '[]'; -- ["Shower", "Wifi", "Cafe"]
ALTER TABLE public.pitches ADD COLUMN IF NOT EXISTS price_per_person DECIMAL(10,2);
ALTER TABLE public.pitches ADD COLUMN IF NOT EXISTS total_price DECIMAL(10,2);
ALTER TABLE public.pitches ADD COLUMN IF NOT EXISTS working_hours JSONB DEFAULT '{"open": "10:00", "close": "02:00", "slot_duration": 60}';
ALTER TABLE public.pitches ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}';
ALTER TABLE public.pitches ADD COLUMN IF NOT EXISTS rating NUMERIC DEFAULT 5.0;

-- 2. Pitch Bookings (Slot Rezervasyonları) Tablosu
-- Bu tablo bir sahanın belirli tarihteki belirli saat dilimlerinin kapalı/dolu olduğunu gösterir.
CREATE TABLE IF NOT EXISTS public.pitch_bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pitch_id UUID NOT NULL REFERENCES public.pitches(id) ON DELETE CASCADE,
    match_id UUID REFERENCES public.matches(id) ON DELETE SET NULL, -- Eğer uygulama üzerinden maç alındıysa
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- Alan oyuncu (Eğer Oyna uygulamasından aldıysa)
    title VARCHAR(150), -- "Dışarıdan Abone", "Vadi Gücü FC Maçı" vb.
    booking_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    status VARCHAR(30) DEFAULT 'CONFIRMED' CHECK (status IN ('PENDING', 'CONFIRMED', 'CANCELLED')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_pitch_booking_time UNIQUE (pitch_id, booking_date, start_time)
);

-- RLS İzinleri (Row Level Security)
ALTER TABLE public.pitch_bookings ENABLE ROW LEVEL SECURITY;

-- Herkes dolu saatleri okuyabilir (Müsaitlik kontrolü için)
CREATE POLICY "Public pitch bookings are viewable by everyone." 
ON public.pitch_bookings FOR SELECT USING (true);

-- Tesis sahibi kendi sahalarına ait rezervasyonları ekleyebilir, güncelleyebilir veya iptal edebilir
CREATE POLICY "Owners can insert bookings for their pitches"
ON public.pitch_bookings FOR INSERT 
WITH CHECK (
    EXISTS (SELECT 1 FROM public.pitches WHERE id = pitch_bookings.pitch_id AND owner_id = auth.uid())
);

CREATE POLICY "Owners can update bookings for their pitches"
ON public.pitch_bookings FOR UPDATE
USING (
    EXISTS (SELECT 1 FROM public.pitches WHERE id = pitch_bookings.pitch_id AND owner_id = auth.uid())
);

CREATE POLICY "Owners can delete bookings for their pitches"
ON public.pitch_bookings FOR DELETE
USING (
    EXISTS (SELECT 1 FROM public.pitches WHERE id = pitch_bookings.pitch_id AND owner_id = auth.uid())
);

-- Sahibi kendi sahasını güncelleyebilir
CREATE POLICY "Owners can update their own pitches"
ON public.pitches FOR UPDATE 
USING (owner_id = auth.uid());
