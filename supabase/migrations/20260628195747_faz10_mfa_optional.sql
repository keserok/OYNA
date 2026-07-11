-- FAZ 10 — Panel 2FA'sını panelden açılıp-kapanabilir yap (admin_mfa_required).
-- Kullanıcı talebiyle ŞİMDİLİK KAPALI (false): erişim sorunu sırasında şifre-yalnız giriş.
-- is_public=true → giriş anında (aal1) get_config_bool ile okunabilir.
-- Frontend (signInAdmin + checkPlatformAdmin) bu bayrak AÇIK değilse 2FA istemez.
INSERT INTO public.app_config (key, value, value_type, category, label, description, is_public, min_value, max_value)
VALUES ('admin_mfa_required', 'false'::jsonb, 'boolean', 'GUVENLIK',
  'Panel 2FA (İki Adımlı Doğrulama) Zorunlu',
  'AÇIK iken panele girişte authenticator 6 haneli kod istenir. KAPALI iken yalnız e-posta+şifre yeterli. Güvenlik için açık tutulması önerilir.',
  true, NULL, NULL)
ON CONFLICT (key) DO UPDATE SET is_public = true;
