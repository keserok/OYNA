-- Admin panel yeniden tasarımı: OWNER_ACCOUNTS (SaaS Hesapları) sayfası
-- kapsam-dışı modül olarak feature flag arkasına alındı (Karar #43/#47 deseni).
-- Master prensipler: ücretli plan/entitlement lansmanda YOK → varsayılan kapalı.
-- Kod silinmez; bayrak Parametreler ekranından açılırsa sayfa geri gelir.

INSERT INTO public.feature_flags (key, enabled, label, description, category)
VALUES (
  'module_owner_saas',
  false,
  'SaaS Hesapları',
  'Tesis sahibi SaaS abonelik yönetimi ekranı (kapsam dışı — lansmanda ücretli plan yok).',
  'modules'
)
ON CONFLICT (key) DO NOTHING;
