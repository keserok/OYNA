-- ════════════════════════════════════════════════════════════════════════════
-- DEFTER YER İŞARETİ — içeriği 20260525000000 dosyasındadır
-- ════════════════════════════════════════════════════════════════════════════
--
-- Bu dosya hiçbir şey yapmaz. Canlı defterde `20260805235358` kayıtlı olduğu
-- için depoda da aynı numarada bir dosya bulunmak zorunda; yoksa Supabase
-- "Remote migration versions not found in local migrations directory" deyip
-- hiçbir migration uygulayamıyor.
--
-- İÇERİĞİ NEREDE: `uuid-ossp` ve `pgcrypto` eklentilerinin kurulumu
-- `20260525000000_eksik_eklenti_uuid_ossp.sql` dosyasındadır.
--
-- NEDEN ORADA, BURADA DEĞİL: Bu iki eklenti, onları KULLANAN migration'lardan
-- (ilki `20260530000000`, 4. sıradaki dosya) ÖNCE kurulmuş olmalı. Canlıda
-- ikisi de elle açılmıştı, o yüzden sıra sorun olmadı; ama sıfırdan kurulan bir
-- veritabanında kurulum 4. dosyada "function uuid_generate_v4() does not exist"
-- ile ölüyordu. Bu yüzden gerçek içerik, tüm migration'lardan önce sıralanan
-- 20260525000000 numarasına konuldu.
--
-- Yani aynı iş depoda ERKEN, canlı defterde GEÇ görünüyor. İkisi de doğru;
-- bu dosya sadece defterin deliğini kapatıyor.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  RAISE NOTICE '[DEFTER] 20260805235358 yer isareti - icerik 20260525000000 dosyasinda.';
END $$;
