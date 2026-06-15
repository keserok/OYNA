-- Extend courts table with advanced features if they do not exist
ALTER TABLE public.courts ADD COLUMN IF NOT EXISTS price NUMERIC;
ALTER TABLE public.courts ADD COLUMN IF NOT EXISTS capacity INTEGER DEFAULT 14;
ALTER TABLE public.courts ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.courts ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.courts ADD COLUMN IF NOT EXISTS lighting_grade TEXT;
ALTER TABLE public.courts ADD COLUMN IF NOT EXISTS grass_grade TEXT;
ALTER TABLE public.courts ADD COLUMN IF NOT EXISTS locker_grade TEXT;
