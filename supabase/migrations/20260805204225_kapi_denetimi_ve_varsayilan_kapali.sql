-- ═══════════════════════════════════════════════════════════════════════════
-- KAPILAR · KALICILIK — "peki bu koruma bozulursa kim söyleyecek?" (P-0)
-- ───────────────────────────────────────────────────────────────────────────
-- Adım 1-3 bugünkü açık kapıları kapattı. Ama kapı temizliği tek seferlik bir
-- iş olarak kalırsa altı ay sonra aynı yere geri döneriz. Bu dosya iki kalıcı
-- koruma kurar:
--
--   1) YENİ FONKSİYONLAR ARTIK KAPALI DOĞAR.
--      Bugüne kadar `postgres` rolünün public şemasında yazdığı her fonksiyon,
--      hiçbir şey söylenmese bile `authenticated` (giriş yapmış herkes) için
--      AÇIK doğuyordu — 424 açık kapının asıl sebebi buydu. Artık doğmuyor.
--      ⚠ SONUÇ: bundan sonra uygulamadan çağrılacak her yeni fonksiyonun
--        migration'ında açıkça `GRANT EXECUTE ... TO authenticated;` yazmak
--        gerekir. Unutulursa o özellik çalışmaz (aşağıdaki gece denetimi bunu
--        "yeni fonksiyon eklendi" diye SARI olarak bildirir).
--      service_role (uç fonksiyonlar) ve postgres (gece işleri) değişmez.
--
--   2) GECE DENETİMİ + PANEL ALARMI (K-KAPI-4).
--      `kapi_kayitli_durum` tablosu, hangi fonksiyonun açık olmasının
--      ONAYLANDIĞINI tutar. Her gece `kapi_denetimi()` canlı durumu bu listeyle
--      karşılaştırır ve Sistem Sağlığı kartına yazar:
--        • kapalı olması onaylanmışken AÇILMIŞ  → KIRMIZI (gerçek tehlike)
--        • açık olması onaylanmışken KAPANMIŞ   → SARI (bir ekran bozulmuş olabilir)
--        • listede hiç olmayan YENİ fonksiyon   → SARI (gözden geçirilmeli)
--      Bilerek yapılan bir değişiklikten sonra `kapi_temeli_guncelle()` çağrılır
--      ve yeni durum onaylanmış temel olur.
--
-- ── GERİ ALMA ──────────────────────────────────────────────────────────────
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
--     GRANT EXECUTE ON FUNCTIONS TO authenticated;
--   DROP FUNCTION IF EXISTS public.kapi_denetimi();
--   DROP FUNCTION IF EXISTS public.kapi_temeli_guncelle(text);
--   DROP TABLE IF EXISTS public.kapi_kayitli_durum;
--   -- (sistem_saglik_ek_kontroller için bir önceki sürüm:
--   --  supabase/migrations/20260804330000_ek_saglik_damga_duzeltmesi.sql)
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1) YENI FONKSIYONLAR ARTIK "KAPALI" DOGAR ─────────────────────────────
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM authenticated;

-- ── 2) ONAYLANMIS KAPI DURUMU (temel) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.kapi_kayitli_durum (
  fonksiyon          text PRIMARY KEY,
  anon_acik          boolean     NOT NULL,
  authenticated_acik boolean     NOT NULL,
  onaylandi_at       timestamptz NOT NULL DEFAULT now(),
  aciklama           text
);

ALTER TABLE public.kapi_kayitli_durum ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.kapi_kayitli_durum FROM anon, authenticated;

DROP POLICY IF EXISTS "kapi durumunu sadece yonetici okur" ON public.kapi_kayitli_durum;
CREATE POLICY "kapi durumunu sadece yonetici okur"
  ON public.kapi_kayitli_durum FOR SELECT TO authenticated
  USING (public.is_admin());

COMMENT ON TABLE public.kapi_kayitli_durum IS
  'Hangi fonksiyonun disariya acik olmasinin ONAYLANDIGI liste. Gece denetimi canli durumu bununla karsilastirir.';

-- ── 3) TEMELI GUNCELLEME (bilerek yapilan degisiklikten sonra cagrilir) ───
CREATE OR REPLACE FUNCTION public.kapi_temeli_guncelle(p_aciklama text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $fn$
DECLARE v_adet int;
BEGIN
  DELETE FROM public.kapi_kayitli_durum;
  INSERT INTO public.kapi_kayitli_durum(fonksiyon, anon_acik, authenticated_acik, aciklama)
  SELECT p.oid::regprocedure::text,
         has_function_privilege('anon', p.oid, 'EXECUTE'),
         has_function_privilege('authenticated', p.oid, 'EXECUTE'),
         p_aciklama
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  LEFT JOIN pg_depend d ON d.objid = p.oid AND d.classid = 'pg_proc'::regclass AND d.deptype = 'e'
  WHERE n.nspname = 'public' AND d.objid IS NULL;
  GET DIAGNOSTICS v_adet = ROW_COUNT;
  RETURN v_adet;
END;
$fn$;
REVOKE ALL ON FUNCTION public.kapi_temeli_guncelle(text) FROM PUBLIC, anon, authenticated;

-- ── 4) GECE DENETIMI — kapilar kendiliginden acildi mi? ───────────────────
-- P-0: "Peki bu koruma bozulursa kim soyleyecek?" -> bu fonksiyon soyler.
CREATE OR REPLACE FUNCTION public.kapi_denetimi()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $fn$
DECLARE
  v_temel_adet   int;
  v_acilan       text[];
  v_kapanan      text[];
  v_yeni         text[];
  v_durum        text;
  v_mesaj        text;
BEGIN
  SELECT count(*) INTO v_temel_adet FROM public.kapi_kayitli_durum;
  IF v_temel_adet = 0 THEN
    RETURN jsonb_build_object('durum','KIRMIZI','olculen',0,
      'mesaj','Onaylanmis kapi listesi BOS - denetim yapilamiyor, koruma calismiyor demektir.');
  END IF;

  WITH canli AS (
    SELECT p.oid::regprocedure::text AS fonksiyon,
           has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_acik,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_acik
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    LEFT JOIN pg_depend d ON d.objid = p.oid AND d.classid='pg_proc'::regclass AND d.deptype='e'
    WHERE n.nspname='public' AND d.objid IS NULL
  )
  SELECT
    -- Kapali olmasi onaylanmisken ACILMIS olanlar: gercek tehlike.
    array_agg(c.fonksiyon) FILTER (
      WHERE t.fonksiyon IS NOT NULL
        AND ((c.anon_acik AND NOT t.anon_acik) OR (c.auth_acik AND NOT t.authenticated_acik))),
    -- Acik olmasi onaylanmisken KAPANMIS olanlar: bir ekran bozulmus olabilir.
    array_agg(c.fonksiyon) FILTER (
      WHERE t.fonksiyon IS NOT NULL
        AND ((t.anon_acik AND NOT c.anon_acik) OR (t.authenticated_acik AND NOT c.auth_acik))),
    -- Temelden sonra eklenmis fonksiyonlar: gozden gecirilmeli.
    array_agg(c.fonksiyon) FILTER (WHERE t.fonksiyon IS NULL)
  INTO v_acilan, v_kapanan, v_yeni
  FROM canli c
  LEFT JOIN public.kapi_kayitli_durum t ON t.fonksiyon = c.fonksiyon;

  v_acilan  := COALESCE(v_acilan,  '{}');
  v_kapanan := COALESCE(v_kapanan, '{}');
  v_yeni    := COALESCE(v_yeni,    '{}');

  IF array_length(v_acilan,1) > 0 THEN
    v_durum := 'KIRMIZI';
    v_mesaj := array_length(v_acilan,1) || ' fonksiyonun kapisi KENDILIGINDEN ACILMIS: '
            || array_to_string(v_acilan[1:5], ', ');
  ELSIF array_length(v_kapanan,1) > 0 OR array_length(v_yeni,1) > 0 THEN
    v_durum := 'SARI';
    v_mesaj := COALESCE(array_length(v_yeni,1),0) || ' yeni fonksiyon eklendi, '
            || COALESCE(array_length(v_kapanan,1),0) || ' fonksiyonun kapisi kapandi - gozden gecirilmeli'
            || CASE WHEN array_length(v_yeni,1) > 0
                    THEN ' (' || array_to_string(v_yeni[1:5], ', ') || ')' ELSE '' END;
  ELSE
    v_durum := 'YESIL';
    v_mesaj := 'Butun veritabani kapilari onaylanmis listeyle ayni.';
  END IF;

  RETURN jsonb_build_object(
    'durum', v_durum,
    'olculen', COALESCE(array_length(v_acilan,1),0),
    'mesaj', v_mesaj,
    'kendiliginden_acilan', to_jsonb(v_acilan),
    'kapanan', to_jsonb(v_kapanan),
    'yeni_fonksiyon', to_jsonb(v_yeni));
END;
$fn$;
REVOKE ALL ON FUNCTION public.kapi_denetimi() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.kapi_denetimi() IS
  'K-KAPI-4: canli fonksiyon yetkilerini onaylanmis listeyle karsilastirir. Kendiliginden acilan kapi = KIRMIZI.';

-- ── 5) BUGUNKU DURUMU ONAYLANMIS TEMEL OLARAK KAYDET ─────────────────────
SELECT public.kapi_temeli_guncelle('Kapi temizligi sonrasi ilk temel — 67+4 fonksiyon disariya kapatildi.');

-- ── 6) GECE SAGLIK DENETIMINE BAGLA (panel bunu otomatik gosterir) ───────
CREATE OR REPLACE FUNCTION public.sistem_saglik_ek_kontroller()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_calisma timestamptz;
  v_adet    int;
  v_renk    text;
  v_mesaj   text;
  v_eklenen int := 0;
  v_kapi    jsonb;
BEGIN
  SELECT max(calisma_at) INTO v_calisma FROM public.sistem_saglik_kayitlari;
  IF v_calisma IS NULL THEN
    RETURN jsonb_build_object('atlandi', 'ana denetim hic calismamis', 'eklenen_kontrol', 0);
  END IF;

  DELETE FROM public.sistem_saglik_kayitlari
   WHERE calisma_at = v_calisma
     AND kontrol_id IN ('K-SUPURUCU-1','K-BILDIRIM-2','K-BILDIRIM-3','K-KAPI-4');

  -- K-SUPURUCU-1 - elle bakilmasi gereken mac var mi
  BEGIN
    SELECT count(*) INTO v_adet FROM public.matches WHERE elle_bakilmali;
    IF v_adet = 0 THEN
      v_renk := 'YESIL'; v_mesaj := 'Otomatik is takildigi mac yok';
    ELSE
      v_renk := 'SARI';
      v_mesaj := v_adet||' mac 3 denemede islenemedi - panelden bakilmali';
    END IF;
    INSERT INTO public.sistem_saglik_kayitlari(calisma_at,kontrol_id,yapi_tasi,durum,olculen,beklenen,mesaj)
    VALUES (v_calisma,'K-SUPURUCU-1','B10 OTOMASYON',v_renk,v_adet,'0',v_mesaj);
    v_eklenen := v_eklenen + 1;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.sistem_saglik_kayitlari(calisma_at,kontrol_id,yapi_tasi,durum,beklenen,mesaj)
    VALUES (v_calisma,'K-SUPURUCU-1','B10 OTOMASYON','OLCULEMEDI','0','Kontrol calistirilamadi: '||SQLERRM);
    v_eklenen := v_eklenen + 1;
  END;

  -- K-BILDIRIM-2 - bildirim modu bekcisi ayakta mi
  BEGIN
    SELECT count(*) INTO v_adet FROM pg_trigger
     WHERE tgrelid = 'public.notifications'::regclass
       AND tgname = 'b_bildirim_modu_bekcisi' AND NOT tgisinternal AND tgenabled <> 'D';
    IF v_adet = 1 THEN
      IF (SELECT count(DISTINCT mod_seviyesi) FROM public.notification_templates) < 2 THEN
        v_renk := 'SARI';
        v_mesaj := 'Bekci ayakta ama tum bildirimler ayni seviyede - modlar ise yaramiyor';
      ELSE
        v_renk := 'YESIL';
        v_mesaj := 'Bildirim modu bekcisi ayakta, seviyeler tanimli';
      END IF;
    ELSE
      v_renk := 'KIRMIZI';
      v_mesaj := 'Bildirim modu bekcisi YOK/DEVRE DISI - kullanici tercihleri uygulanmiyor';
    END IF;
    INSERT INTO public.sistem_saglik_kayitlari(calisma_at,kontrol_id,yapi_tasi,durum,olculen,beklenen,mesaj)
    VALUES (v_calisma,'K-BILDIRIM-2','B06 BILDIRIM',v_renk,v_adet,'1',v_mesaj);
    v_eklenen := v_eklenen + 1;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.sistem_saglik_kayitlari(calisma_at,kontrol_id,yapi_tasi,durum,beklenen,mesaj)
    VALUES (v_calisma,'K-BILDIRIM-2','B06 BILDIRIM','OLCULEMEDI','1','Kontrol calistirilamadi: '||SQLERRM);
    v_eklenen := v_eklenen + 1;
  END;

  -- K-BILDIRIM-3 - bildirim adresleri gecerli mi
  BEGIN
    SELECT count(*) INTO v_adet FROM public.notifications
     WHERE deep_link IS NOT NULL AND deep_link NOT LIKE 'oyna://%';
    IF v_adet = 0 THEN
      v_renk := 'YESIL'; v_mesaj := 'Tum bildirim adresleri gecerli bicimde';
    ELSE
      v_renk := 'KIRMIZI';
      v_mesaj := v_adet||' bildirimin adresi gecersiz - tiklandiginda hicbir sey olmaz';
    END IF;
    INSERT INTO public.sistem_saglik_kayitlari(calisma_at,kontrol_id,yapi_tasi,durum,olculen,beklenen,mesaj)
    VALUES (v_calisma,'K-BILDIRIM-3','B06 BILDIRIM',v_renk,v_adet,'0',v_mesaj);
    v_eklenen := v_eklenen + 1;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.sistem_saglik_kayitlari(calisma_at,kontrol_id,yapi_tasi,durum,beklenen,mesaj)
    VALUES (v_calisma,'K-BILDIRIM-3','B06 BILDIRIM','OLCULEMEDI','0','Kontrol calistirilamadi: '||SQLERRM);
    v_eklenen := v_eklenen + 1;
  END;

  -- K-KAPI-4 - veritabani kapilari kendiliginden acildi mi
  BEGIN
    v_kapi := public.kapi_denetimi();
    INSERT INTO public.sistem_saglik_kayitlari(calisma_at,kontrol_id,yapi_tasi,durum,olculen,beklenen,mesaj)
    VALUES (v_calisma,'K-KAPI-4','B05 KAPILAR',
            v_kapi->>'durum', (v_kapi->>'olculen')::int, '0', v_kapi->>'mesaj');
    v_eklenen := v_eklenen + 1;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.sistem_saglik_kayitlari(calisma_at,kontrol_id,yapi_tasi,durum,beklenen,mesaj)
    VALUES (v_calisma,'K-KAPI-4','B05 KAPILAR','OLCULEMEDI','0','Kontrol calistirilamadi: '||SQLERRM);
    v_eklenen := v_eklenen + 1;
  END;

  RETURN jsonb_build_object('calisma_at', v_calisma, 'eklenen_kontrol', v_eklenen);
END; $$;

REVOKE ALL ON FUNCTION public.sistem_saglik_ek_kontroller() FROM PUBLIC, anon, authenticated;

-- ── 7) DOGRULAMA ─────────────────────────────────────────────────────────
DO $dogrulama$
DECLARE
  v_temel int; v_kapi jsonb; v_ek int; v_toplam int; v_kirmizi int; v_varsayilan text;
BEGIN
  SELECT count(*) INTO v_temel FROM public.kapi_kayitli_durum;
  IF v_temel < 600 THEN RAISE EXCEPTION 'DOGRULAMA: temel liste eksik (% satir).', v_temel; END IF;

  v_kapi := public.kapi_denetimi();
  IF v_kapi->>'durum' <> 'YESIL' THEN
    RAISE EXCEPTION 'DOGRULAMA: temel yeni kaydedildi ama denetim yesil degil -> %', v_kapi;
  END IF;

  SELECT defaclacl::text INTO v_varsayilan FROM pg_default_acl d
   JOIN pg_namespace n ON n.oid = d.defaclnamespace
   WHERE n.nspname='public' AND d.defaclobjtype='f' AND pg_get_userbyid(d.defaclrole)='postgres';
  IF v_varsayilan LIKE '%authenticated=X%' THEN
    RAISE EXCEPTION 'DOGRULAMA: yeni fonksiyonlar hala ACIK doguyor -> %', v_varsayilan;
  END IF;
  IF v_varsayilan NOT LIKE '%service_role=X%' THEN
    RAISE EXCEPTION 'DOGRULAMA: service_role varsayilani da kaybolmus -> %', v_varsayilan;
  END IF;

  PERFORM public.sistem_saglik_calistir();
  PERFORM public.sistem_saglik_ek_kontroller();

  SELECT count(*), count(*) FILTER (WHERE durum IN ('KIRMIZI','OLCULEMEDI'))
    INTO v_toplam, v_kirmizi FROM public.sistem_saglik_kayitlari
   WHERE calisma_at = (SELECT max(calisma_at) FROM public.sistem_saglik_kayitlari);

  SELECT count(*) INTO v_ek FROM public.sistem_saglik_kayitlari
   WHERE calisma_at = (SELECT max(calisma_at) FROM public.sistem_saglik_kayitlari)
     AND kontrol_id IN ('K-SUPURUCU-1','K-BILDIRIM-2','K-BILDIRIM-3','K-KAPI-4');

  IF v_ek <> 4 THEN RAISE EXCEPTION 'DOGRULAMA: ek kontroller ana tura baglanmadi (% adet).', v_ek; END IF;
  IF v_toplam < 18 THEN RAISE EXCEPTION 'DOGRULAMA: son turda % kontrol var, 18 bekleniyordu.', v_toplam; END IF;
  IF v_kirmizi > 0 THEN RAISE EXCEPTION 'DOGRULAMA: % kontrol kirmizi.', v_kirmizi; END IF;

  RAISE NOTICE 'Kapi denetimi kuruldu: % fonksiyon onayli temelde, saglik turunda % kontrol, 0 kirmizi.', v_temel, v_toplam;
END
$dogrulama$;
