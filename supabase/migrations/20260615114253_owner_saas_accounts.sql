-- ==============================================================================
-- OYNA B2B — Saha sahibi SaaS hesabı (faturalama UI olmadan altyapı)
-- plan_tier + entitlements webhook/ admin ile güncellenir
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.owner_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan_tier TEXT NOT NULL DEFAULT 'starter'
    CHECK (plan_tier IN ('starter', 'pro', 'enterprise')),
  status TEXT NOT NULL DEFAULT 'trialing'
    CHECK (status IN ('trialing', 'active', 'past_due', 'suspended', 'cancelled')),
  trial_ends_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '14 days'),
  entitlements JSONB NOT NULL DEFAULT '{
    "max_facilities": 1,
    "max_courts": 5,
    "max_staff": 10,
    "flash_deals": true,
    "finance": true,
    "team": true,
    "withdrawals": true
  }'::jsonb,
  billing_email TEXT,
  external_customer_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_owner_accounts_user ON public.owner_accounts(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_owner_accounts_status ON public.owner_accounts(status);

ALTER TABLE public.owner_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners read own account" ON public.owner_accounts;
CREATE POLICY "Owners read own account" ON public.owner_accounts FOR SELECT
USING (owner_user_id = auth.uid());

DROP POLICY IF EXISTS "Owners update own billing email" ON public.owner_accounts;
CREATE POLICY "Owners update own billing email" ON public.owner_accounts FOR UPDATE
USING (owner_user_id = auth.uid())
WITH CHECK (owner_user_id = auth.uid());

DROP POLICY IF EXISTS "Admins manage owner accounts" ON public.owner_accounts;
CREATE POLICY "Admins manage owner accounts" ON public.owner_accounts FOR ALL
USING (public.is_admin() OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'ADMIN');

-- Yeni OWNER profili oluşturulunca SaaS hesabı aç
CREATE OR REPLACE FUNCTION public.ensure_owner_account()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role = 'OWNER' OR (NEW.roles IS NOT NULL AND NEW.roles @> '["OWNER"]'::jsonb) THEN
    INSERT INTO public.owner_accounts (owner_user_id)
    VALUES (NEW.id)
    ON CONFLICT (owner_user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_owner_account ON public.profiles;
CREATE TRIGGER trg_ensure_owner_account
AFTER INSERT OR UPDATE OF role, roles ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.ensure_owner_account();

-- Mevcut OWNER kullanıcılar için backfill
INSERT INTO public.owner_accounts (owner_user_id)
SELECT id FROM public.profiles
WHERE role = 'OWNER' OR (roles IS NOT NULL AND roles @> '["OWNER"]'::jsonb)
ON CONFLICT (owner_user_id) DO NOTHING;

-- Entitlement kontrolü (SECURITY DEFINER — RLS bypass yalnızca okuma)
CREATE OR REPLACE FUNCTION public.owner_has_entitlement(p_feature TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
  v_ent JSONB;
BEGIN
  SELECT status, entitlements INTO v_status, v_ent
  FROM public.owner_accounts
  WHERE owner_user_id = auth.uid();

  IF NOT FOUND THEN
    RETURN true;
  END IF;

  IF v_status IN ('suspended', 'cancelled') THEN
    RETURN false;
  END IF;

  IF p_feature = 'active' THEN
    RETURN v_status IN ('trialing', 'active', 'past_due');
  END IF;

  RETURN COALESCE((v_ent ->> p_feature)::boolean, true);
END;
$$;

REVOKE ALL ON FUNCTION public.owner_has_entitlement(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_has_entitlement(TEXT) TO authenticated, service_role;
