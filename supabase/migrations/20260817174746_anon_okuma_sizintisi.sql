-- ════════════════════════════════════════════════════════════════════════════
-- DEFTER YER İŞARETİ — içeriği 20260905000013_anon_okuma_sizintisi.sql dosyasındadır
-- ════════════════════════════════════════════════════════════════════════════
--
-- Bu dosya hiçbir şey yapmaz. 17 Ağustos 2026 akşamı, gönderim öncesi
-- veritabanı denetiminde bulunan anonim okuma açığı canlıya uygulandı ve
-- defter (schema_migrations) bu sürümü kaydetti; kalıcı içerik ise
-- 20260905000013_anon_okuma_sizintisi.sql dosyasında duruyor.
--
-- NEDEN GEREKLİ: defterde olup depoda dosyası olmayan bir sürüm, Supabase
-- entegrasyonunu "Remote migration versions not found in local migrations
-- directory" hatasıyla durdurur. Aynı desen bu depoda daha önce de kullanıldı
-- (bkz. 20260817094634 ve 20260804010918 yer işaretleri).
--
-- SIFIRDAN KURULUMDA: bu dosya çalışır ama hiçbir şey değiştirmez; asıl
-- tanımlar 20260905000013_anon_okuma_sizintisi.sql tarafından kurulur.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  RAISE NOTICE '[DEFTER] 20260817174746 yer isareti - icerik 20260905000013_anon_okuma_sizintisi.sql dosyasinda.';
END $$;
