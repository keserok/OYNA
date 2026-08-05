-- ════════════════════════════════════════════════════════════════════════════
-- `acilis_olcumu_yaz` KAPISI ONAYLI LİSTEYE KAYDEDİLDİ
-- ════════════════════════════════════════════════════════════════════════════
--
-- Gece kapı denetimi (K-KAPI-4) yeni eklenen fonksiyonu yakaladı ve SARI yaktı:
--   "1 yeni fonksiyon eklendi - gözden geçirilmeli (acilis_olcumu_yaz(...))"
-- Bu DOĞRU davranıştır; bağışıklık sistemi çalışıyor. Buradaki iş, o uyarıya
-- "evet, bu bilinçliydi" cevabını kalıcı olarak vermektir.
--
-- NEDEN BİLEREK AÇIK: açılış yükü ölçümü misafirleri de kapsamalı. Kapalı
-- olsaydı "giriş yapmadan uygulamayı açanların yükü" hiç ölçülemezdi — oysa
-- ölçmek istediğimiz yükün önemli bir kısmı tam olarak o.
--
-- NEDEN GÜVENLİ: fonksiyon yetki VERMEZ, veri OKUTMAZ. Yalnızca bir ölçüm
-- satırı yazar ve değerleri sınırlar (0..200 istek, 0..600000 ms). Tabloyu
-- okumak yalnız yöneticiye açıktır (acilis_olcumu_select_admin).
--
-- NEDEN `kapi_temeli_guncelle()` KULLANILMADI: o fonksiyon onaylı listeyi o
-- anki CANLI duruma göre SIFIRDAN kurar; yani kaydedilmemiş başka bir sapma
-- varsa onu da sessizce onaylardı. Tek satır, elle kaydedildi.
-- ════════════════════════════════════════════════════════════════════════════
INSERT INTO public.kapi_kayitli_durum (fonksiyon, anon_acik, authenticated_acik, aciklama)
SELECT p.oid::regprocedure::text, true, true,
       'Acilis yuku olcumu (K-YUK-4). Misafir dahil her acilis olculebilmeli; yetki vermez.'
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'acilis_olcumu_yaz'
ON CONFLICT (fonksiyon) DO UPDATE
  SET anon_acik = EXCLUDED.anon_acik,
      authenticated_acik = EXCLUDED.authenticated_acik,
      aciklama = EXCLUDED.aciklama;
