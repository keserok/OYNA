-- Doğrulama kuyruğu SLA (Kararlar Soru 92): talep bu süreyi aşarsa panelde
-- kırmızı işaretlenir. Tek kaynak app_config, panelden ayarlanabilir.
INSERT INTO public.app_config (key, value, value_type, category, label, description, is_public, min_value, max_value)
VALUES ('verification_sla_hours', '48'::jsonb, 'number', 'OPERASYON',
  'Doğrulama SLA (saat)',
  'Kaleci/hakem/kimlik doğrulama talebi bu süreyi aşarsa kuyrukta kırmızı işaretlenir.',
  false, 1, 336)
ON CONFLICT (key) DO NOTHING;
