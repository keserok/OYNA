-- ============================================================================
-- FAZ 10 (güvenlik) — Trigger fonksiyonunu REST/RPC çağrısına kapat
-- ----------------------------------------------------------------------------
-- tg_matches_timeline_events() bir TRIGGER fonksiyonu (maç güncellenince otomatik
-- çalışır). Yanlışlıkla anon/authenticated rolüne EXECUTE verilmiş; bu da onu
-- /rest/v1/rpc/tg_matches_timeline_events üzerinden DIŞARIDAN çağrılabilir yapıyordu.
-- Trigger fonksiyonları tetikleyici mekanizma tarafından (tablo sahibi olarak)
-- çalıştırılır; doğrudan EXECUTE iznine ASLA ihtiyaç duymazlar. Bu yüzden tüm
-- rollerden EXECUTE iznini geri alıyoruz — trigger çalışmaya devam eder, ama
-- artık API'den çağrılamaz. (Supabase güvenlik danışmanı uyarısının kapatılması.)
-- ============================================================================
REVOKE ALL ON FUNCTION public.tg_matches_timeline_events() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tg_matches_timeline_events() FROM anon;
REVOKE ALL ON FUNCTION public.tg_matches_timeline_events() FROM authenticated;
