-- ════════════════════════════════════════════════════════════════════════════
-- [S1 latent / C11] SIMULATION KONTROLLÜ RED MODU — hata UX'i QA edilebilsin
-- ────────────────────────────────────────────────────────────────────────────
-- Sorun: SIMULATION modunda 3DS yoktur ve ödeme her zaman BAŞARILI olur; kart
--   reddi / hata ekranı akışını (inline hata şeridi, cüzdan banner'ı, tekrar
--   dene) QA etmek imkânsızdı. (Canlı IYZICO'da iyzico sandbox'ın red test
--   kartları bunu sağlar; bu yalnız SIMULATION geliştirme modu içindir.)
--
-- Çözüm: app_config 'sim_decline_amount' (varsayılan 0 = KAPALI). > 0 iken,
--   SIMULATION modunda kart tutarı TAM bu değere eşit olan ödeme, gerçek bir
--   kart reddi gibi 402 hata döndürür (para uygulanmaz). Tester değeri set eder,
--   o tutarı öder, hata UX'ini görür, sonra 0'a çeker. YALNIZ SIMULATION'da
--   etkilidir; IYZICO modunda hiç okunmaz (canlıda kör-nokta yok).
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO public.app_config (key, value, value_type, category, label, description, is_public, min_value, max_value) VALUES
  ('sim_decline_amount', '0'::jsonb, 'number', 'ODEME',
   'SIMULATION Red Tutarı (QA)',
   'YALNIZ SIMULATION modunda etkilidir. 0 = kapalı. > 0 iken, kart tutarı tam bu değere eşit olan ödeme reddedilmiş gibi hata döndürür — kart-reddi/hata ekranını test etmek için. IYZICO modunda okunmaz.',
   false, 0, 100000)
ON CONFLICT (key) DO NOTHING;
