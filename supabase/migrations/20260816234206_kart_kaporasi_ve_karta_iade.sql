-- ════════════════════════════════════════════════════════════════════════════
-- DEFTER YER İŞARETİ — içeriği 20260905000003_kart_kaporasi_ve_karta_iade.sql dosyasındadır
-- ════════════════════════════════════════════════════════════════════════════
--
-- Bu dosya hiçbir şey yapmaz. 16-17 Ağustos 2026 lansman gecesinde bu iş
-- canlıya parça parça uygulandı ve defter (schema_migrations) bu sürümü
-- kaydetti; kalıcı içerik ise tek parça halinde 20260905000003_kart_kaporasi_ve_karta_iade.sql
-- dosyasında toplandı. Defterde olup depoda dosyası olmayan sürüm, Supabase
-- entegrasyonunu "Remote migration versions not found in local migrations
-- directory" hatasıyla durdurduğu için bu köprü dosyası gereklidir
-- (aynı desen: 20260804010918 yer işareti, PR #166).
--
-- SIFIRDAN KURULUMDA: bu dosya çalışır ama hiçbir şey değiştirmez; asıl
-- tanımlar 20260905000003_kart_kaporasi_ve_karta_iade.sql tarafından kurulur.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  RAISE NOTICE '[DEFTER] 20260816234206 yer isareti - icerik 20260905000003_kart_kaporasi_ve_karta_iade.sql dosyasinda.';
END $$;
