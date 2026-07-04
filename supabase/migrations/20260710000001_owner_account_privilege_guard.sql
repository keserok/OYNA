-- ==============================================================================
-- Güvenlik: owner_accounts ayrıcalık-yükseltme açığını kapat
-- ------------------------------------------------------------------------------
-- Sorun: `owner_accounts_update` RLS policy'si (20260701000003) owner'ın KENDİ
-- satırının HER sütununu güncellemesine izin veriyor — plan_tier / status /
-- entitlements dahil. Böylece bir owner PostgREST ile kendini 'enterprise' yapıp
-- yetkileri kendine açabiliyor (client-only gating'in tek gerçek savunması bu
-- katmandaydı ve yoktu).
--
-- Çözüm (additive, davranış-koruyan): billing_email gibi zararsız alanların
-- owner tarafından yazılabilir kalması için POLICY'ye dokunulmaz; bunun yerine
-- hassas alanların değişimini yalnız admin'e bırakan bir BEFORE UPDATE guard
-- trigger'ı eklenir. Admin yolları (admin_update_owner_account SECURITY DEFINER +
-- doğrudan admin PostgREST) auth.uid() korunduğu için is_admin()/is_platform_admin()
-- ile muaf tutulur. ensure_owner_account yalnız INSERT ... ON CONFLICT DO NOTHING
-- yaptığından bu trigger'ı tetiklemez.
--
-- Not (gelir modeli kararı, 4 Tem): OYNA'da saha sahibi abonelik ÖDEMEZ; bu alanlar
-- yalnız ileride opsiyonel-premium ihtimali için dormant durur. Bu guard, o iskeletin
-- kötüye kullanılmasını şimdiden kapatır (defense-in-depth), davranışı değiştirmez.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.guard_owner_account_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Admin (herhangi bir admin yolu) her alanı değiştirebilir.
  IF public.is_admin() OR public.is_platform_admin() THEN
    RETURN NEW;
  END IF;

  -- Admin olmayan (owner'ın kendisi): yalnız zararsız alanlar (billing_email,
  -- updated_at) yazılabilir. Aşağıdaki hassas alanların değişimi reddedilir.
  IF NEW.owner_user_id      IS DISTINCT FROM OLD.owner_user_id
     OR NEW.plan_tier           IS DISTINCT FROM OLD.plan_tier
     OR NEW.status              IS DISTINCT FROM OLD.status
     OR NEW.entitlements        IS DISTINCT FROM OLD.entitlements
     OR NEW.trial_ends_at       IS DISTINCT FROM OLD.trial_ends_at
     OR NEW.external_customer_id IS DISTINCT FROM OLD.external_customer_id
  THEN
    RAISE EXCEPTION 'FORBIDDEN: owner hesabının plan/durum/yetki alanları yalnız yönetici tarafından değiştirilebilir'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_owner_account_update ON public.owner_accounts;
CREATE TRIGGER trg_guard_owner_account_update
BEFORE UPDATE ON public.owner_accounts
FOR EACH ROW EXECUTE FUNCTION public.guard_owner_account_update();
