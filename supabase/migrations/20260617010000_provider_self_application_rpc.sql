-- ============================================================
-- OYNA — Kaleci/Hakem başvuru akışı için kendi rolünü ayarlama RPC'si
-- ------------------------------------------------------------
-- protect_profile_columns() trigger'ı admin olmayan kullanıcıların
-- profiles.role / profiles.roles kolonlarını değiştirmesini sessizce
-- engelliyor (NEW.role/NEW.roles eski değerine döndürülüyor). Bu, yeni
-- ServiceApplication formundan gelen "kendi rolünü GOALKEEPER/REFEREE
-- yap" güncellemesinin sessizce hiçbir etki yapmadan başarılı dönmesine
-- yol açıyordu.
--
-- Bu migration:
--   1) apply_for_provider_role(p_role) RPC'sini ekler: yalnız çağıran
--      kullanıcının kendi rolünü GOALKEEPER veya REFEREE yapmasına izin
--      verir (başka role/kullanıcıya izin yok — ayrıcalık yükseltme riski
--      taşımaz).
--   2) protect_profile_columns() trigger'ını, bu RPC'nin set ettiği
--      transaction-local bayrağı (app.bypass_role_protection) tanıyacak
--      şekilde günceller.
-- ============================================================

CREATE OR REPLACE FUNCTION public.protect_profile_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF (SELECT auth.uid()) IS NULL
     OR auth.role() = 'service_role'
     OR public.is_admin()
     OR current_setting('app.bypass_role_protection', true) = 'true' THEN
    RETURN NEW;
  END IF;
  -- Admin değilse ve bypass bayrağı yoksa: elle düzenlenen kolonlar eski değerine döner
  NEW.role           := OLD.role;
  NEW.roles          := OLD.roles;
  NEW.is_banned      := OLD.is_banned;
  NEW.ban_expires_at := OLD.ban_expires_at;
  NEW.is_verified    := OLD.is_verified;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.apply_for_provider_role(p_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := (SELECT auth.uid());
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Oturum bulunamadı';
  END IF;

  IF p_role NOT IN ('GOALKEEPER', 'REFEREE') THEN
    RAISE EXCEPTION 'Geçersiz rol: %', p_role;
  END IF;

  PERFORM set_config('app.bypass_role_protection', 'true', true);

  UPDATE public.profiles
     SET role = p_role,
         roles = jsonb_build_array(p_role),
         updated_at = now()
   WHERE id = v_uid;
END;
$function$;

REVOKE ALL ON FUNCTION public.apply_for_provider_role(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_for_provider_role(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.apply_for_provider_role(text) TO authenticated;
