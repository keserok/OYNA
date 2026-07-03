-- ============================================================================
-- Vitrin fonksiyonları sıkılaştırması (Supabase security advisor bulguları):
--  * SECURITY DEFINER fonksiyonlarında anon/PUBLIC EXECUTE kaldırıldı
--  * try_uuid'e sabit search_path eklendi
-- Trigger fonksiyonları REST'ten zaten çağrılamaz; yine de erişim daraltıldı.
-- ============================================================================

ALTER FUNCTION public.try_uuid(text) SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.can_manage_pitch_content(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.try_uuid(text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_pitch_engagement(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.review_pitch_change_request(uuid, boolean, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_pitch_media_arrays() FROM anon, PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_court_grade_review() FROM anon, PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.protect_pitch_identity_fields() FROM anon, PUBLIC, authenticated;

GRANT EXECUTE ON FUNCTION public.can_manage_pitch_content(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.try_uuid(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pitch_engagement(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_pitch_change_request(uuid, boolean, text) TO authenticated;
