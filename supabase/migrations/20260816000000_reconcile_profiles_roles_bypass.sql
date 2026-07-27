-- ============================================================================
-- FAZ 2c düzeltmesi — profiles.roles yazımını GUC bayrağıyla serbest bırak
-- ----------------------------------------------------------------------------
-- Kök neden: 20260811000000_convergence_faz2c.sql:144 sensitive-fields trigger'ını
-- kaldırmayı amaçladı ama YANLIŞ adı düşürdü (trg_protect_profile_sensitive_fields,
-- zaten yoktu) → protect_profile_sensitive_fields_trigger aktif kaldı ve
-- trg_protect_profile_columns ile birlikte çift-koruma oluştu. BEFORE ROW trigger'lar
-- alfabetik koştuğundan 'p…' < 't…' → sensitive-fields önce koşup RAISE eder.
--
-- Sonuç: bayrağı (app.bypass_role_protection='true') transaction-local kuran
-- SECURITY DEFINER RPC'ler profiles.roles yazınca non-admin çağıran için çöküyordu:
--   claim_owner_role            (views/PartnerOnboarding.tsx:126),
--   apply_for_provider_role     (services/serviceProviderService.ts:42),
--   _sync_role_from_provider_status (goalkeepers/referees onay trigger'ı).
-- set_active_role çalışıyordu çünkü yalnız `role` yazar (o dalda bypass zaten var).
--
-- Düzeltme: `role` dalıyla SİMETRİK olarak `roles` dalına da app.bypass_role_protection
-- bypass'ı eklenir. Bayrak yalnız transaction-local set_config ile kurulur; PostgREST
-- her isteği ayrı transaction'da koşar ve SET sunmaz → istemci bayrağı kuramaz, doğrudan
-- istemci UPDATE'i hâlâ bloklu (RAISE + protect_profile_columns revert + RLS
-- profile_privileges_unchanged). is_admin / phone_verified / wallet_balance / is_banned /
-- ban_expires_at korumaları AYNEN sürer; roles'a yalnız ilgili RPC'lerin eklediği
-- kendine-verilebilir roller (PLAYER/GOALKEEPER/REFEREE/OWNER) geçer.
--
-- Bu, aynı trigger'daki `role` (FAZ 7) ve `wallet_balance` (FAZ 5 round4) GUC
-- bypass'larıyla aynı sınıf düzeltmedir (bkz. tests/integration/README.md).
--
-- Not: Trigger DDL gerekmez — CREATE OR REPLACE FUNCTION mevcut
-- protect_profile_sensitive_fields_trigger bağını korur; iki trigger da yerinde kalır
-- (role/roles/is_banned/ban_expires_at üzerindeki fazlalık zararsız ve idempotenttir).
-- Trigger'ları tek bir korumada birleştirme (ve faz2c'deki yanlış-ad DROP'unu düzeltme)
-- lansman sonrasına bırakılmıştır — bu değişiklik cerrahi ve düşük risklidir.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.protect_profile_sensitive_fields()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_platform_admin() THEN
    IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
      RAISE EXCEPTION 'SECURITY: is_admin alanı doğrudan değiştirilemez.';
    END IF;
    IF NEW.phone_verified IS DISTINCT FROM OLD.phone_verified THEN
      RAISE EXCEPTION 'SECURITY: phone_verified alanı doğrudan değiştirilemez.';
    END IF;
    IF NEW.role IS DISTINCT FROM OLD.role
       AND COALESCE(current_setting('app.bypass_role_protection', true), '') <> 'true' THEN
      RAISE EXCEPTION 'SECURITY: role alanı doğrudan değiştirilemez.';
    END IF;
    IF NEW.roles IS DISTINCT FROM OLD.roles
       AND COALESCE(current_setting('app.bypass_role_protection', true), '') <> 'true' THEN   -- <== TEK DEĞİŞİKLİK: role ile simetrik bypass
      RAISE EXCEPTION 'SECURITY: roles alanı doğrudan değiştirilemez.';
    END IF;
    IF NEW.wallet_balance IS DISTINCT FROM OLD.wallet_balance
       AND COALESCE(current_setting('app.wallet_ctx', true), '') <> 'on' THEN
      RAISE EXCEPTION 'SECURITY: wallet_balance doğrudan değiştirilemez.';
    END IF;
    IF NEW.is_banned IS DISTINCT FROM OLD.is_banned THEN
      RAISE EXCEPTION 'SECURITY: is_banned doğrudan değiştirilemez.';
    END IF;
    IF NEW.ban_expires_at IS DISTINCT FROM OLD.ban_expires_at THEN
      RAISE EXCEPTION 'SECURITY: ban_expires_at doğrudan değiştirilemez.';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- Trigger fonksiyonu doğrudan çağrılamaz kalmalı (idempotent replay için yeniden):
REVOKE EXECUTE ON FUNCTION public.protect_profile_sensitive_fields() FROM anon, authenticated, public;
