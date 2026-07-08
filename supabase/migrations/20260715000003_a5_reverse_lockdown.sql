-- ==============================================================================
-- A5 güvenlik sertleştirme: reverse_booking_earnings'i authenticated'a KAPAT
-- ------------------------------------------------------------------------------
-- reverse_booking_earnings iç auth kontrolü OLMAYAN saf bir yardımcıdır: verilen
-- booking_id'nin owner kazancını geri alır. Yalnız owner_cancel_confirmed_booking
-- ve cancel_app_booking (ikisi de SECURITY DEFINER + yetki kontrollü) İÇİNDEN
-- çağrılmalıdır. authenticated'a doğrudan EXECUTE verilmesi, kötü niyetli bir
-- kullanıcının PostgREST /rpc ile rastgele bir owner'ın kazancını iptal etmesine
-- izin verir (advisor: authenticated_security_definer_function_executable).
--
-- SECURITY DEFINER çağıran fonksiyonlar OWNER (postgres) yetkisiyle çalıştığından,
-- authenticated grant'i iç çağrılar için GEREKLİ DEĞİLDİR; yalnız saldırı yüzeyidir.
-- ==============================================================================

REVOKE EXECUTE ON FUNCTION public.reverse_booking_earnings(uuid) FROM authenticated;
