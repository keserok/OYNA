-- ==============================================================================
-- OYNA: Complete RLS Policies for all tables
-- ==============================================================================

-- PROFILES tablosu RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Profiles are viewable by everyone" ON public.profiles
FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles
FOR INSERT WITH CHECK (auth.uid() = id);


-- PITCHES tablosu RLS
ALTER TABLE public.pitches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Pitches are viewable by everyone" ON public.pitches;
CREATE POLICY "Pitches are viewable by everyone" ON public.pitches
FOR SELECT USING (true);

DROP POLICY IF EXISTS "Owners can insert pitches" ON public.pitches;
CREATE POLICY "Owners can insert pitches" ON public.pitches
FOR INSERT WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Owners or Admins can update pitches" ON public.pitches;
CREATE POLICY "Owners or Admins can update pitches" ON public.pitches
FOR UPDATE USING (
  auth.uid() = owner_id OR
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'ADMIN'
);

DROP POLICY IF EXISTS "Owners or Admins can delete pitches" ON public.pitches;
CREATE POLICY "Owners or Admins can delete pitches" ON public.pitches
FOR DELETE USING (
  auth.uid() = owner_id OR
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'ADMIN'
);


-- PITCH_SLOTS tablosu RLS
-- Replay-güvenlik guard'ı: pitch_slots hiçbir migration'da yaratılmıyor ve
-- üretimde de YOK (ölü referans — muhtemelen repo-dışı silindi). Sıfırdan
-- kurulumda (Preview/db reset) bu blok patlıyordu; tablo varsa aynen çalışır,
-- yoksa atlanır. (#107'nin service_offers guard'ı ile aynı desen.)
DO $pitch_slots_guard$
BEGIN
  IF to_regclass('public.pitch_slots') IS NULL THEN
    RAISE NOTICE 'pitch_slots yok — RLS bloğu atlandı (replay-güvenli)';
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE public.pitch_slots ENABLE ROW LEVEL SECURITY';

  EXECUTE 'DROP POLICY IF EXISTS "Pitch slots are viewable by everyone" ON public.pitch_slots';
  EXECUTE 'CREATE POLICY "Pitch slots are viewable by everyone" ON public.pitch_slots
    FOR SELECT USING (true)';

  EXECUTE 'DROP POLICY IF EXISTS "Pitch owners can manage slots" ON public.pitch_slots';
  EXECUTE 'CREATE POLICY "Pitch owners can manage slots" ON public.pitch_slots
    FOR ALL USING (
      auth.uid() IN (SELECT owner_id FROM public.pitches WHERE id = pitch_id)
      OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = ''ADMIN''
    )';

  EXECUTE 'DROP POLICY IF EXISTS "Authenticated users can book slots" ON public.pitch_slots';
  EXECUTE 'CREATE POLICY "Authenticated users can book slots" ON public.pitch_slots
    FOR UPDATE USING (auth.role() = ''authenticated'')
    WITH CHECK (auth.role() = ''authenticated'')';
END
$pitch_slots_guard$;


-- NOTIFICATIONS tablosu RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
CREATE POLICY "Users can view own notifications" ON public.notifications
FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;
CREATE POLICY "System can insert notifications" ON public.notifications
FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
CREATE POLICY "Users can update own notifications" ON public.notifications
FOR UPDATE USING (auth.uid() = user_id);


-- Profil silme sadece admin
DROP POLICY IF EXISTS "Only admins can delete profiles" ON public.profiles;
CREATE POLICY "Only admins can delete profiles" ON public.profiles
FOR DELETE USING (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('ADMIN', 'SUPER_ADMIN')
);

-- STORAGE BUCKET for images
INSERT INTO storage.buckets (id, name, public)
VALUES ('images', 'images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Anyone can view images" ON storage.objects;
CREATE POLICY "Anyone can view images" ON storage.objects
FOR SELECT USING (bucket_id = 'images');

DROP POLICY IF EXISTS "Authenticated users can upload images" ON storage.objects;
CREATE POLICY "Authenticated users can upload images" ON storage.objects
FOR INSERT WITH CHECK (bucket_id = 'images' AND auth.role() = 'authenticated');
