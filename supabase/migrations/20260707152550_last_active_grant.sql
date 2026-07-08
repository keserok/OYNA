-- ==============================================================================
-- last_active_at kolon yetkisi
-- KÖK NEDEN: App girişte profiles.last_active_at + updated_at günceller
-- (fire-and-forget). last_active_at authenticated UPDATE grant listesinde
-- olmadığından istek her girişte sessizce 42501/403 alıyordu → SocialView'daki
-- "Şimdi aktif / Son görülme" bilgisi hiç güncellenmiyordu. RLS satırı kendi
-- profiliyle sınırlar; kolon zararsızdır.
-- ==============================================================================

GRANT UPDATE (last_active_at) ON public.profiles TO authenticated;
