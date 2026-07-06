-- ============================================================================
-- Grant sağlamlaştırma — yeni RPC'leri proje konvansiyonuna hizala
-- ----------------------------------------------------------------------------
-- Yeni eklenen admin RPC'leri GRANT TO authenticated + REVOKE FROM anon ile
-- geldi; ancak varsayılan PUBLIC EXECUTE grant'ı yerinde kaldığından anon rolü
-- (PUBLIC üzerinden) hâlâ çağırabiliyordu (gövdedeki is_platform_admin guard'ı
-- engelliyordu ama diğer admin RPC'lerle tutarsızdı). PUBLIC'ten revoke edip
-- yalnız authenticated'e bırakıyoruz. Trigger fonksiyonu doğrudan çağrılamamalı.
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.admin_broadcast_notification(text, text, text, text, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_broadcast_notification(text, text, text, text, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_cancel_account_deletion(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_cancel_account_deletion(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_send_template_test(text, jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_send_template_test(text, jsonb) TO authenticated;

-- Trigger fonksiyonu: doğrudan çağrıya kapat (yalnız trigger bağlamında çalışır)
REVOKE EXECUTE ON FUNCTION public.sync_provider_verification_status() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_provider_verification_status() FROM anon;
REVOKE EXECUTE ON FUNCTION public.sync_provider_verification_status() FROM authenticated;
