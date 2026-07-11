-- ================================================================
-- Güvenlik temizliği — admin RPC'lerinde anon EXECUTE kalıntısı
-- (Sosyal Küme 2 advisor taramasında yakalandı; sosyal dışı ama
-- açık yanlış: admin uçları anonim çağrılabilir olmamalı.)
-- İç guard'lar (is_platform_admin) zaten var; bu, savunma katmanını
-- API yüzeyine de çeker. Admin her zaman authenticated'dır — anon
-- yetkisini kaldırmak hiçbir meşru akışı bozamaz.
-- ================================================================

REVOKE EXECUTE ON FUNCTION public.admin_broadcast_notification__core(text, text, text, text, uuid)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_cancel_account_deletion__core(uuid)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_fetch_profiles(integer, integer, text, text, text)
  FROM PUBLIC, anon;
