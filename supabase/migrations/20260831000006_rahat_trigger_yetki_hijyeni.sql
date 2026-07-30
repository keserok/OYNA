-- ============================================================================
-- _rahat_slots_positionless yetki hijyeni
--
-- Supabase güvenlik danışmanı: SECURITY DEFINER trigger fonksiyonu varsayılan
-- PUBLIC EXECUTE ile anon/authenticated'a /rest/v1/rpc üzerinden görünüyordu.
-- Pratik istismar yok (trigger-dönüşlü fonksiyon trigger bağlamı dışında
-- çağrılınca Postgres reddeder) ama yüzeyde durması gereksiz: trigger zaten
-- kurulu, ateşleme EXECUTE kontrolüne tabi değil — revoke güvenli.
-- ============================================================================

REVOKE ALL ON FUNCTION public._rahat_slots_positionless() FROM PUBLIC, anon, authenticated;
