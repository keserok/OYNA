-- FAZ 1 sıkılaştırma takibi
-- Canlıya 2026-06-13'te apply_migration ile uygulandı: faz1_hardening_followup

-- 1) Kullanılmayan SECURITY DEFINER view (advisor ERROR) — kodda referans yok
DROP VIEW IF EXISTS public.profiles_public;

-- 2) Trigger fonksiyonu RPC olarak çağrılamasın (yalnız trigger'dan çalışır)
REVOKE ALL ON FUNCTION public.notify_booking_events() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_booking_events() FROM anon;
REVOKE ALL ON FUNCTION public.notify_booking_events() FROM authenticated;
