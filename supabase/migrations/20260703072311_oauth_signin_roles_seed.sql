-- Google/Apple (OAuth) girişi — veritabanı uyumluluğu
-- handle_new_user artık roles jsonb dizisini de '["PLAYER"]' ile doldurur;
-- boş roles satırları legacy role kolonundan geri doldurulur.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email, avatar_url, role, roles, created_at, updated_at)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      split_part(COALESCE(NEW.email, NEW.phone::text, ''), '@', 1)
    ),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', ''),
    'PLAYER',
    '["PLAYER"]'::jsonb,
    now(),
    now()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

UPDATE public.profiles
   SET roles = jsonb_build_array(COALESCE(NULLIF(role, ''), 'PLAYER')),
       updated_at = now()
 WHERE roles IS NULL OR roles = '[]'::jsonb;