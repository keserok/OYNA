-- ════════════════════════════════════════════════════════════════════════════
-- DEFTER YER İŞARETİ — içeriği 20260804010754 dosyasındadır
-- ════════════════════════════════════════════════════════════════════════════
--
-- Bu dosya hiçbir şey yapmaz. Canlı defterde `20260804011039` kayıtlı olduğu
-- için depoda da aynı numarada bir dosya bulunmak zorunda; yoksa Supabase
-- "Remote migration versions not found in local migrations directory" deyip
-- hiçbir migration uygulayamıyor.
--
-- Ayrıntılı gerekçe için kardeş dosyaya bakınız:
--   20260804010918_p4_sistem_saglik_calistir.sql
--
-- İçerik (gece denetimi cron kaydı dahil):
--   `20260804010754_p4_sistem_sagligi.sql`
-- Cron kaydı ayrıca `20260804174206_ek_saglik_damga_duzeltmesi.sql` içinde
-- tek komuta indirilerek yeniden kurulur.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  RAISE NOTICE '[DEFTER] 20260804011039 yer isareti - icerik 20260804010754 dosyasinda.';
END $$;
