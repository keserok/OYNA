-- pgcrypto guardı: extensions.digest dört yerde kullanılıyor (TC kimlik hash'i,
-- telefon hash'i, audit hash zinciri) ama hiçbir migration eklentiyi kurmuyordu.
-- Prod'da hazır kurulu; bu guard lokal/CI/branch ortamlarının aynı şekilde
-- çalışmasını garanti eder. Duman testi migration anında patlatır, kullanıcı
-- formunda değil.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

DO $$
BEGIN
  PERFORM extensions.digest('smoke', 'sha256');
END $$;

-- verification_sla_hours prod'da mevcut; taze ortamlar için idempotent seed
-- (PendingVerificationsTab bu anahtarı okur, yoksa 48'e düşer).
INSERT INTO public.app_config (key, value, value_type, category, label, description, is_public, min_value, max_value)
VALUES (
  'verification_sla_hours', to_jsonb(48), 'number', 'OPERASYON',
  'Doğrulama SLA (saat)',
  'Kaleci/hakem/kimlik doğrulama talebi bu süreyi aşarsa kuyrukta kırmızı işaretlenir.',
  false, 1, 336
)
ON CONFLICT (key) DO NOTHING;
