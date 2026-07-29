-- Kaleci ve Hakem tablolarını oluşturur, ayarlar ve çalışma saatleri gibi özellikleri içerir.

CREATE TABLE IF NOT EXISTS public.goalkeepers (
  id UUID PRIMARY KEY, -- profiller ile eşleşecek (auth_uid veya profilde id)
  name TEXT NOT NULL,
  height TEXT,
  age INTEGER,
  rating NUMERIC DEFAULT 0,
  fee INTEGER DEFAULT 0,
  -- [2026-07-29 onarım] Üretimde ve uygulama kodunda bu kolon "matchCount"
  -- (camelCase, tırnaklı). Repo burada snake_case yaratıyordu; sıfırdan
  -- replay'de 20260816000001 ve 20260627000001 bu kolonu bulamıyordu.
  -- Doğru olan üretim: services/matchService.ts:279 "matchCount" sorguluyor.
  "matchCount" INTEGER DEFAULT 0,
  avatar TEXT,
  recent_awards TEXT,
  style TEXT,
  bio TEXT,
  preferred_zones JSONB,
  is_elite BOOLEAN DEFAULT FALSE,
  coordinates JSONB, -- { lat, lng }
  stats JSONB,
  skills JSONB,
  equipment JSONB,
  is_available BOOLEAN DEFAULT true,
  working_hours JSONB, -- { activeDays: [], activeHours: '' }
  settings JSONB, -- { notifNewOffer: true, ... }
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.referees (
  id UUID PRIMARY KEY, -- profiller ile eşleşecek
  auth_uid UUID,
  name TEXT NOT NULL,
  level TEXT,
  -- [2026-07-29 onarım] Üretimde ve uygulama kodunda bu kolon "matchCount"
  -- (camelCase, tırnaklı). Repo burada snake_case yaratıyordu; sıfırdan
  -- replay'de 20260816000001 ve 20260627000001 bu kolonu bulamıyordu.
  -- Doğru olan üretim: services/matchService.ts:279 "matchCount" sorguluyor.
  "matchCount" INTEGER DEFAULT 0,
  fee INTEGER DEFAULT 0,
  avatar TEXT,
  rating NUMERIC DEFAULT 0,
  style TEXT,
  bio TEXT,
  preferred_zones JSONB,
  is_elite BOOLEAN DEFAULT FALSE,
  coordinates JSONB, -- { lat, lng }
  stats JSONB,
  is_available BOOLEAN DEFAULT true,
  working_hours JSONB,
  settings JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.service_offers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  match_id UUID, -- maçın id'si (null olabilir eğer direkt değilse, şimdilik text/UUID)
  provider_id UUID NOT NULL, -- kaleci veya hakem id'si
  provider_type TEXT NOT NULL, -- 'GK' veya 'REF'
  offered_by UUID, -- teklifi gönderen kaptanın id'si
  amount INTEGER NOT NULL, -- teklif edilen ücret
  status TEXT DEFAULT 'PENDING', -- PENDING, ACCEPTED, REJECTED
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS ayarları
ALTER TABLE public.goalkeepers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Herkes kalecileri okuyabilir" ON public.goalkeepers FOR SELECT USING (true);
CREATE POLICY "Kullanıcı kendi kaleci profilini düzenleyebilir" ON public.goalkeepers FOR ALL USING (auth.uid() = id);

CREATE POLICY "Herkes hakemleri okuyabilir" ON public.referees FOR SELECT USING (true);
CREATE POLICY "Kullanıcı kendi hakem profilini düzenleyebilir" ON public.referees FOR ALL USING (auth.uid() = id);

CREATE POLICY "Teklifler tarafı olanlara görünür" ON public.service_offers FOR SELECT USING (auth.uid() = provider_id OR auth.uid() = offered_by);
CREATE POLICY "Kullanıcılar teklif oluşturabilir" ON public.service_offers FOR INSERT WITH CHECK (auth.uid() = offered_by);
CREATE POLICY "Teklif alan güncelleyebilir" ON public.service_offers FOR UPDATE USING (auth.uid() = provider_id);

-- Realtime için yayınlara ekle
ALTER PUBLICATION supabase_realtime ADD TABLE goalkeepers;
ALTER PUBLICATION supabase_realtime ADD TABLE referees;
ALTER PUBLICATION supabase_realtime ADD TABLE service_offers;
