-- [DB GEÇMİŞİNDEN KURTARILDI 2026-07-11] Bu migration canlı veritabanına uygulanmıştı ancak repoda dosyası yoktu; supabase_migrations.schema_migrations.statements kolonundan geri çıkarıldı.

-- ============================================================
-- OYNA — Rol Sistemi / Faz 1: Güvenlik Temeli (düzeltilmiş)
-- ============================================================

-- 0) Hatalı eski trigger'ı kaldır (admin atamasını bloklamasın)
DROP TRIGGER IF EXISTS trg_protect_profile_sensitive_fields ON public.profiles;

-- 1) İlk SUPER_ADMIN'i ata (artık trigger yok, geçer)
UPDATE public.profiles
SET role  = 'SUPER_ADMIN',
    roles = '["OWNER","SUPER_ADMIN"]'::jsonb
WHERE role = 'OWNER';

-- 2) Yetki yardımcı fonksiyonları (SECURITY DEFINER => RLS özyinelemesi yok)
CREATE OR REPLACE FUNCTION public.has_role(check_role text)
RETURNS boolean LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = (SELECT auth.uid())
      AND (role = check_role OR roles ? check_role)
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = (SELECT auth.uid())
      AND (role IN ('ADMIN','SUPER_ADMIN')
           OR roles ?| array['ADMIN','SUPER_ADMIN'])
  );
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = (SELECT auth.uid())
      AND (role = 'SUPER_ADMIN' OR roles ? 'SUPER_ADMIN')
  );
$$;

-- 3) Yeni profil koruma trigger fonksiyonu (sessiz geri al, jsonb + SUPER_ADMIN + backend-muaf)
CREATE OR REPLACE FUNCTION public.protect_profile_columns()
RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Backend/servis bağlamı (JWT yok) veya service_role veya admin => tam yetki
  IF (SELECT auth.uid()) IS NULL
     OR auth.role() = 'service_role'
     OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  -- Admin olmayan son kullanıcı: korumalı kolonlar eski değerine döner (sessiz, NULL-güvenli)
  NEW.role           := OLD.role;
  NEW.roles          := OLD.roles;
  NEW.is_banned      := OLD.is_banned;
  NEW.ban_expires_at := OLD.ban_expires_at;
  NEW.is_verified    := OLD.is_verified;
  NEW.trust_score    := OLD.trust_score;
  NEW.skill_rating   := OLD.skill_rating;
  NEW.wallet_balance := OLD.wallet_balance;
  RETURN NEW;
END;
$$;

-- 4) Yeni trigger'ı bağla
DROP TRIGGER IF EXISTS trg_protect_profile_columns ON public.profiles;
CREATE TRIGGER trg_protect_profile_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_columns();

-- 5) Artık kullanılmayan eski fonksiyonu temizle
DROP FUNCTION IF EXISTS public.protect_profile_sensitive_fields();
