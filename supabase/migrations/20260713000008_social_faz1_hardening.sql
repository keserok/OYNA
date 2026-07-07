-- ================================================================
-- SOSYAL AŞAMA 1.7 — Advisor sertleştirmesi (2026-07-06 taraması)
-- Bulgular: iç yardımcılar RPC'den çağrılabiliyordu (sahte bildirim /
-- ilişki-durumu sızıntısı riski) + 2 fonksiyonda oynak search_path.
-- Not: profile_contact_hash / social_rate_usage "RLS var, politika yok"
-- uyarıları BİLİNÇLİ tasarımdır (deny-all; yalnız SECURITY DEFINER okur).
-- ================================================================

-- 1) Bildirim üreticileri yalnız iç kullanım (definer fonksiyonlar owner
--    olarak çağırır; role grant'ına ihtiyaçları yok)
REVOKE EXECUTE ON FUNCTION public._notify_friend_request(uuid,uuid)  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._notify_friend_accepted(uuid,uuid) FROM PUBLIC, anon, authenticated;

-- 2) İlişki-durumu / birlikte-maç yardımcıları dış çağrıya kapanır
--    (aksi hâlde iki YABANCI kullanıcının ilişkisi sorgulanabilirdi)
REVOKE EXECUTE ON FUNCTION public._friendship_state(uuid,uuid)       FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._count_matches_together(uuid,uuid) FROM PUBLIC, anon, authenticated;

-- 3) Trigger fonksiyonları RPC yüzeyinden tamamen kaldırılır (hijyen)
REVOKE EXECUTE ON FUNCTION public.friend_lists_enforce_max()        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.friend_list_members_guard()       FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.friend_prefs_guard()              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.matches_update_friend_counters()  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.profiles_sync_contact_hash()      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.profiles_set_oyna_id()            FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._touch_updated_at()               FROM PUBLIC, anon, authenticated;

-- 4) Oynak search_path sabitlenir
ALTER FUNCTION public.normalize_tr(text)   SET search_path = '';
ALTER FUNCTION public._touch_updated_at()  SET search_path = '';
