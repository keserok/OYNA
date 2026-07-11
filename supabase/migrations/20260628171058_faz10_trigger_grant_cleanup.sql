-- ============================================================================
-- FAZ 10 (güvenlik) — Gereksiz anon/authenticated EXECUTE izinlerini temizle
-- ----------------------------------------------------------------------------
-- enforce_tariff_before_open() ve sync_admin_flags() TRIGGER fonksiyonlarıdır
-- (RETURNS trigger). Tetikleyici mekanizma tarafından çalıştırılırlar; doğrudan
-- /rest/v1/rpc çağrısına ihtiyaç duymazlar. Yanlışlıkla anon/authenticated'a
-- verilmiş EXECUTE iznini geri alıyoruz (saldırı yüzeyi temizliği).
--
-- NOT: cash_dist() bir EXTENSION fonksiyonudur (earthdistance/cube ailesi) —
-- ona DOKUNULMAZ (extension upgrade'inde grant geri gelir, zararsızdır).
-- ============================================================================
REVOKE ALL ON FUNCTION public.enforce_tariff_before_open() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_tariff_before_open() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_tariff_before_open() FROM authenticated;

REVOKE ALL ON FUNCTION public.sync_admin_flags() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_admin_flags() FROM anon;
REVOKE ALL ON FUNCTION public.sync_admin_flags() FROM authenticated;
