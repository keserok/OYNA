-- ════════════════════════════════════════════════════════════════════════════
-- [RAF-2 devamı] Dışa aktarma aracına TABLO SEÇİMİ ekle
-- ────────────────────────────────────────────────────────────────────────────
-- NEDEN: Tam dışa aktarım 813 KB. İçindekilerin bir kısmı **yeniden
-- üretilebilir** (denetim kayıtları, bildirim geçmişi, sağlık günlüğü, demo
-- veri). Yeri doldurulamaz olan ise AYAR ve KATALOG verisidir:
--
--   app_config             → platformun tüm davranış anahtarları (55 kayıt)
--   region_coverage        → Ordu'nun 19 ilçesi, kapsama haritası
--   notification_templates → 51 bildirim metni
--   commission_config      → saha anlaşmaları (komisyon oranları)
--   pitches / courts       → saha ve kort kataloğu
--   pitch_tariffs          → fiyatlandırma
--   pitch_media            → saha görselleri
--
-- Bu veri kaybolursa kod hiçbir işe yaramaz: sistem ayarsız açılır.
-- Tek araç, tek kod yolu — parametresiz çağrı yine HER ŞEYİ verir.
-- ════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.veri_disari_aktar();

CREATE OR REPLACE FUNCTION public.veri_disari_aktar(p_tablolar text[] DEFAULT NULL)
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
  v_cikti := v_cikti || '-- Kapsam: ' ||
             COALESCE(array_to_string(p_tablolar, ', '), 'TUM TABLOLAR') || E'\n';
  v_cikti := v_cikti || E'-- Geri yukleme: BOS bir veritabaninda once tum migration''lari uygulayin,\n';
  v_cikti := v_cikti || E'-- sonra bu dosyayi calistirin.\n\n';
  v_cikti := v_cikti || E'BEGIN;\nSET session_replication_role = replica;\n\n';

  FOR r IN
    SELECT c.oid, c.relname
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND (p_tablolar IS NULL OR c.relname = ANY(p_tablolar))
    ORDER BY c.relname
  LOOP
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

  v_cikti := v_cikti || E'-- Dizileri guncelle\n';
  FOR r IN
    SELECT quote_ident(ns.nspname) || '.' || quote_ident(c.relname) AS dizi,
           quote_ident(tn.nspname) || '.' || quote_ident(t.relname) AS tablo,
           quote_ident(a.attname) AS sutun,
           t.relname AS tablo_adi
    FROM pg_class c
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
    JOIN pg_depend d ON d.objid = c.oid AND d.classid = 'pg_class'::regclass AND d.deptype IN ('a','i')
    JOIN pg_class t ON t.oid = d.refobjid
    JOIN pg_namespace tn ON tn.oid = t.relnamespace
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = d.refobjsubid
    WHERE c.relkind = 'S' AND tn.nspname = 'public'
      AND (p_tablolar IS NULL OR t.relname = ANY(p_tablolar))
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

REVOKE ALL ON FUNCTION public.veri_disari_aktar(text[]) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.veri_disari_aktar(text[]) IS
  'RAF-2: Veriyi calistirilabilir SQL olarak uretir. Parametresiz = tum tablolar. Dizi verilirse yalniz o tablolar.';

-- ════════════════════════════════════════════════════════════════════════════
-- KULLANIM (Supabase SQL Editor):
--   -- Yalniz ayar/katalog (kucuk, git'te saklanan kopyanin ayni):
--   SELECT public.veri_disari_aktar(ARRAY['app_config','region_coverage',
--     'notification_templates','commission_config','pitches','courts',
--     'pitch_tariffs','pitch_media']);
--
--   -- HER SEY (demo + gecmis dahil):
--   SELECT public.veri_disari_aktar();
-- ════════════════════════════════════════════════════════════════════════════
