-- ════════════════════════════════════════════════════════════════════════════
-- DEFTER YER İŞARETİ — içeriği 20260905000005_karta_iade_defteri_ve_psp_kesintisi.sql dosyasındadır
-- ════════════════════════════════════════════════════════════════════════════
--
-- Bu dosya hiçbir şey yapmaz. 16-17 Ağustos 2026 lansman gecesinde bu iş
-- canlıya parça parça uygulandı ve defter (schema_migrations) bu sürümü
-- kaydetti; kalıcı içerik ise tek parça halinde 20260905000005_karta_iade_defteri_ve_psp_kesintisi.sql
-- dosyasında toplandı. Defterde olup depoda dosyası olmayan sürüm, Supabase
-- entegrasyonunu "Remote migration versions not found in local migrations
-- directory" hatasıyla durdurduğu için bu köprü dosyası gereklidir
-- (aynı desen: 20260804010918 yer işareti, PR #166).
--
-- SIFIRDAN KURULUMDA: bu dosya çalışır ama hiçbir şey değiştirmez; asıl
-- tanımlar 20260905000005_karta_iade_defteri_ve_psp_kesintisi.sql tarafından kurulur.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  RAISE NOTICE '[DEFTER] 20260817002217 yer isareti - icerik 20260905000005_karta_iade_defteri_ve_psp_kesintisi.sql dosyasinda.';
END $$;
