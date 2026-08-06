-- ════════════════════════════════════════════════════════════════════════════
-- [RAF-2] VERİYİ PLATFORM DIŞINA ÇIKARMA ARACI
-- ────────────────────────────────────────────────────────────────────────────
-- NEDEN GEREKLİ: Supabase **ücretsiz planda panelden yedek indirmeye izin
-- vermiyor** ("Database backups are not available for download for Free Plan
-- projects"). Yani bugün elimizde platformun DIŞINDA hiçbir kopya yok.
--
-- SRE-1'de kurduğumuz gecelik yedek aynı veritabanının içinde duruyor —
-- proje silinir ya da 90 günlük geri yükleme penceresi kaçırılırsa o da gider.
--
-- Bu araç, tüm veriyi **çalıştırılabilir SQL** olarak üretir. Çıktı git'e
-- konur; git, Supabase'den bağımsız ikinci bir yerdir. Şema zaten migration
-- dosyalarında duruyor — şema + bu veri = tam yeniden kurulum.
--
-- TASARIM NOTLARI:
--   • Üretilmiş (generated) sütunlar dışlanır — onlara INSERT yapılamaz.
--   • Geri yüklerken tetikleyiciler ve yabancı anahtar kontrolleri kapatılır
--     (`session_replication_role = replica`); yoksa koruma tetikleyicileri
--     kendi verimizi reddeder ve tablo sırası önem kazanırdı.
--   • Diziler (sequence) sonda güncellenir; yoksa yeni kayıt eski numaradan
--     başlar ve çakışır.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.veri_disari_aktar()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  r          record;
  v_sutunlar text;
  v_degerler text;
  v_govde    text;
  v_cikti    text := '';
  v_satir    bigint;
  v_tablo    int := 0;
  v_toplam   bigint := 0;
BEGIN
  v_cikti := v_cikti || E'-- OYNA veri disa aktarimi\n';
  v_cikti := v_cikti || '-- Uretildi: ' || now()::text || E'\n';
  v_cikti := v_cikti || E'-- Geri yukleme: BOS bir veritabaninda once tum migration''lari uygulayin,\n';
  v_cikti := v_cikti || E'-- sonra bu dosyayi calistirin.\n\n';
  v_cikti := v_cikti || E'BEGIN;\nSET session_replication_role = replica;\n\n';

  FOR r IN
    SELECT c.oid, c.relname
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY c.relname
  LOOP
    -- Uretilmis sutunlar HARIC, sira numarasina gore sutun listesi
    SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum),
           string_agg(format('quote_nullable(%I::text)', a.attname), ' || '', '' || ' ORDER BY a.attnum)
      INTO v_sutunlar, v_degerler
    FROM pg_attribute a
    WHERE a.attrelid = r.oid AND a.attnum > 0 AND NOT a.attisdropped
      AND a.attgenerated = '';

    CONTINUE WHEN v_sutunlar IS NULL;

    EXECUTE format(
      'SELECT string_agg(''INSERT INTO public.%I (%s) VALUES ('' || %s || '');'', E''\n''), count(*) FROM public.%I',
      r.relname, v_sutunlar, v_degerler, r.relname
    ) INTO v_govde, v_satir;

    CONTINUE WHEN COALESCE(v_satir, 0) = 0;

    v_cikti  := v_cikti || '-- ' || r.relname || ' (' || v_satir || E' satir)\n' || v_govde || E'\n\n';
    v_tablo  := v_tablo + 1;
    v_toplam := v_toplam + v_satir;
  END LOOP;

  -- Dizileri (sequence) son kullanilan degere getir.
  v_cikti := v_cikti || E'-- Dizileri guncelle\n';
  FOR r IN
    SELECT quote_ident(ns.nspname) || '.' || quote_ident(c.relname) AS dizi,
           quote_ident(tn.nspname) || '.' || quote_ident(t.relname) AS tablo,
           quote_ident(a.attname) AS sutun
    FROM pg_class c
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
    JOIN pg_depend d ON d.objid = c.oid AND d.classid = 'pg_class'::regclass AND d.deptype IN ('a','i')
    JOIN pg_class t ON t.oid = d.refobjid
    JOIN pg_namespace tn ON tn.oid = t.relnamespace
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = d.refobjsubid
    WHERE c.relkind = 'S' AND tn.nspname = 'public'
  LOOP
    v_cikti := v_cikti || format(
      'SELECT setval(%L, COALESCE((SELECT max(%s) FROM %s), 1), true);',
      r.dizi, r.sutun, r.tablo) || E'\n';
  END LOOP;

  v_cikti := v_cikti || E'\nSET session_replication_role = DEFAULT;\nCOMMIT;\n';
  v_cikti := v_cikti || '-- ozet: ' || v_tablo || ' tablo, ' || v_toplam || E' satir\n';

  RETURN v_cikti;
END;
$function$;

REVOKE ALL ON FUNCTION public.veri_disari_aktar() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.veri_disari_aktar() IS
  'RAF-2: Tum public verisini calistirilabilir SQL olarak uretir. Ucretsiz planda panelden yedek indirilemedigi icin platform disi tek kopya yolu budur.';

-- ════════════════════════════════════════════════════════════════════════════
-- KULLANIM (Supabase SQL Editor):
--   SELECT public.veri_disari_aktar();
-- Cikan metni bir .sql dosyasina kaydedin.
--
-- GERİ ALMA:
--   DROP FUNCTION IF EXISTS public.veri_disari_aktar();
-- ════════════════════════════════════════════════════════════════════════════
