-- ════════════════════════════════════════════════════════════════════════════
-- [RAF-1] CRON GÜNLÜĞÜ TEMİZLİĞİ — veritabanının yarısını geri alır
-- ────────────────────────────────────────────────────────────────────────────
-- SORUN: `cron.job_run_details` tablosu zamanlanmış işlerin geçmişini tutuyor
-- ve **kendiliğinden temizlenmiyor**. Ölçtük:
--
--     191.676 satır · 37 MB · veritabanının TOPLAMI 70 MB
--
-- Yani veritabanının **yarısından fazlası** iş günlüğünden ibaret. Günde 2.136
-- satır ekleniyor. Uygulama rafta beklerken bile bu büyüme durmaz:
--     6 ay rafta  ≈ +385.000 satır ≈ +75 MB  (veritabanı ikiye katlanır)
--
-- Supabase bunu açıkça uyarıyor: aşırı büyümüş bir `job_run_details` tablosu
-- ileride yapılacak sürüm yükseltmesini yavaşlatır, hatta başarısız kılar.
--
-- ÇÖZÜM: 7 günlük pencere tut, gerisini her gece sil. Teşhis için bir hafta
-- fazlasıyla yeterli — zaten sağlık denetimi 30 günlük kendi geçmişini tutuyor.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.cron_gunlugu_temizle(p_gun int DEFAULT 7)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_silinen bigint;
  v_kalan   bigint;
BEGIN
  DELETE FROM cron.job_run_details
  WHERE start_time < now() - make_interval(days => GREATEST(1, p_gun));
  GET DIAGNOSTICS v_silinen = ROW_COUNT;

  SELECT count(*) INTO v_kalan FROM cron.job_run_details;

  RETURN jsonb_build_object(
    'silinen', v_silinen,
    'kalan', v_kalan,
    'pencere_gun', GREATEST(1, p_gun)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.cron_gunlugu_temizle(int) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.cron_gunlugu_temizle(int) IS
  'RAF-1: cron.job_run_details tablosunu 7 gunluk pencereye indirir. Kendiliginden temizlenmedigi icin gerekli.';

-- Her gece 04:10 UTC (07:10 İstanbul) — yedek ve denetimden SONRA.
DO $do$
BEGIN
  PERFORM cron.unschedule('cron_gunlugu_temizligi')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cron_gunlugu_temizligi');

  PERFORM cron.schedule('cron_gunlugu_temizligi', '10 4 * * *',
                        'SELECT public.cron_gunlugu_temizle(7);');
END $do$;

-- İlk temizliği hemen yap.
SELECT public.cron_gunlugu_temizle(7);

-- ════════════════════════════════════════════════════════════════════════════
-- NOT: DELETE, yeri "tekrar kullanılabilir" yapar ama işletim sistemine geri
-- vermez. Dosya boyutunun da küçülmesi için ayrıca `VACUUM FULL` gerekir; o
-- komut migration içinde çalışmaz, ayrıca çalıştırılır.
--
-- GERİ ALMA:
--   SELECT cron.unschedule('cron_gunlugu_temizligi');
--   DROP FUNCTION IF EXISTS public.cron_gunlugu_temizle(int);
-- ════════════════════════════════════════════════════════════════════════════
