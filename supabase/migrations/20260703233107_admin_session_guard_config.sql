-- Admin oturum güvenliği (Karar #24): 15 dk hareketsizlikte otomatik çıkış +
-- 8 saat mutlak oturum yaşı. Değerler app_config'ten okunur — panelden
-- (Sistem Parametreleri) deploy'suz ayarlanabilir. is_public=false: bu
-- anahtarlar yalnız admin yüzeyini ilgilendirir.

INSERT INTO public.app_config (key, value, value_type, category, label, description, is_public, min_value, max_value)
VALUES
  ('admin_idle_timeout_minutes', '15'::jsonb, 'number', 'GUVENLIK',
   'Admin hareketsizlik zaman aşımı (dk)',
   'Admin panelinde bu süre boyunca hiçbir etkileşim olmazsa oturum otomatik kapatılır.',
   false, 5, 120),
  ('admin_session_max_hours', '8'::jsonb, 'number', 'GUVENLIK',
   'Admin mutlak oturum yaşı (saat)',
   'Aktif kullanılsa bile admin oturumu bu süreden uzun yaşayamaz; yeniden giriş gerekir.',
   false, 1, 24)
ON CONFLICT (key) DO NOTHING;
