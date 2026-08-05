-- ════════════════════════════════════════════════════════════════════════════
-- SİSTEM SAĞLIĞI KARTI HİÇ AÇILMIYORDU — 30 günlük geçmiş sorgusu hatalıydı
-- ════════════════════════════════════════════════════════════════════════════
--
-- NASIL BULUNDU: açılış yükü ölçümü (K-YUK-4) karta bağlanırken
-- `sistem_saglik_ozet()` çağrıldı ve fonksiyon HATA fırlattı.
--
-- HATA: `gecmis_30_gun` alt sorgusu önce
--     jsonb_build_object('gun', ..., 'kirmizi', count(*) FILTER (...)) AS g
-- nesnesini kuruyor, sonra `GROUP BY 1` ile O NESNEYE göre gruplamaya
-- çalışıyordu. PostgreSQL bunu reddeder:
--     ERROR: aggregate functions are not allowed in GROUP BY
--
-- ETKİSİ: `sistem_saglik_ozet()` HER çağrıda hata veriyordu. Yani panelin
-- Sistem Sağlığı kartı, kurulduğu 4 Ağustos 2026'dan beri hiç açılmadı —
-- 17 gece kontrolü çalışıyor ve veritabanına yazıyordu ama kimse göremiyordu.
--
-- NEDEN BU KADAR SESSİZ KALDI: kartın kendisi ALARM MEKANİZMASIYDI. Bozulan
-- şeyin bozulduğunu söyleyecek bir üst merci yoktu. P-0'ın ("peki bu koruma
-- bozulursa kim söyleyecek?") tam olarak uyardığı durum budur.
--
-- DÜZELTME: önce ham kolonlara göre grupla, nesneyi SONRA kur.
-- Fonksiyonun başka hiçbir davranışı değişmedi (admin kapısı dahil).
--
-- GERİ ALMA: supabase/migrations/20260804010000_p4_sistem_sagligi.sql
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.sistem_saglik_ozet()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_son timestamptz; v_sonuc jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: Bu ekran yalniz admin icindir.';
  END IF;

  SELECT max(calisma_at) INTO v_son FROM public.sistem_saglik_kayitlari;
  IF v_son IS NULL THEN
    RETURN jsonb_build_object('hic_calismadi', true);
  END IF;

  SELECT jsonb_build_object(
    'son_calisma', v_son,
    'genel_durum', CASE
      WHEN count(*) FILTER (WHERE durum IN ('KIRMIZI','OLCULEMEDI')) > 0 THEN 'KIRMIZI'
      WHEN count(*) FILTER (WHERE durum='SARI') > 0 THEN 'SARI' ELSE 'YESIL' END,
    'yesil',   count(*) FILTER (WHERE durum='YESIL'),
    'sari',    count(*) FILTER (WHERE durum='SARI'),
    'kirmizi', count(*) FILTER (WHERE durum IN ('KIRMIZI','OLCULEMEDI')),
    'kontroller', jsonb_agg(jsonb_build_object(
        'kontrol_id', kontrol_id, 'yapi_tasi', yapi_tasi,
        'durum', durum, 'olculen', olculen, 'mesaj', mesaj)
      ORDER BY CASE durum WHEN 'KIRMIZI' THEN 0 WHEN 'OLCULEMEDI' THEN 1 WHEN 'SARI' THEN 2 ELSE 3 END, kontrol_id),
    'gecmis_30_gun', (
      -- DÜZELTİLDİ: gruplama ham kolonlar üzerinde yapılır, nesne SONRA kurulur.
      SELECT jsonb_agg(jsonb_build_object('gun', gun, 'kirmizi', kirmizi) ORDER BY gun DESC)
      FROM (
        SELECT to_char(calisma_at AT TIME ZONE 'Europe/Istanbul','YYYY-MM-DD') AS gun,
               count(*) FILTER (WHERE durum IN ('KIRMIZI','OLCULEMEDI')) AS kirmizi
        FROM public.sistem_saglik_kayitlari
        WHERE calisma_at > now() - interval '30 days'
        GROUP BY 1
      ) t)
  ) INTO v_sonuc
  FROM public.sistem_saglik_kayitlari WHERE calisma_at = v_son;

  RETURN v_sonuc;
END;
$function$;
