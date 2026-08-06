-- ════════════════════════════════════════════════════════════════════════════
-- DEFTER YER İŞARETİ — içeriği 20260804010754 dosyasındadır
-- ════════════════════════════════════════════════════════════════════════════
--
-- NE İŞE YARAR: Bu dosya hiçbir şey yapmaz. Var olma sebebi tek: canlı
-- veritabanının migration defterinde `20260804010918` sürümü KAYITLI, ama
-- depoda aynı numarayı taşıyan bir dosya yoktu.
--
-- NEDEN SORUNDU: Supabase, canlıya bağlanınca defteri depo klasörüyle
-- karşılaştırır. Defterde olup klasörde olmayan bir sürüm görürse
--     "Remote migration versions not found in local migrations directory"
-- deyip DURUR — yani hiçbir yeni migration uygulanamaz. `main` dalının
-- Supabase entegrasyonu tam olarak bu yüzden çalışmıyordu.
--
-- İÇERİĞİ NEREDE: Sistem sağlığı denetiminin bu bölümü, aynı çalışmanın
-- tamamını taşıyan `20260804010754_p4_sistem_sagligi.sql` dosyasındadır.
-- Canlıya bu iş dört ayrı adımda uygulanmış (010754 / 010918 / 011005 /
-- 011039), depoda ise tek dosyada toplanmıştı. İçerik AYNI; yalnız defterdeki
-- adım sayısı farklıydı.
--
-- SIFIRDAN KURULUMDA: bu dosya çalışır ama hiçbir şey değiştirmez; asıl
-- tanımlar 20260804010754 tarafından zaten kurulmuş olur.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  RAISE NOTICE '[DEFTER] 20260804010918 yer isareti - icerik 20260804010754 dosyasinda.';
END $$;
