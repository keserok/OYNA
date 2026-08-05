-- ════════════════════════════════════════════════════════════════════════════
-- AÇILIŞ YÜKÜ ÖLÇÜMÜ + K-YUK-4  (B09 YUK yapı taşı)
-- ════════════════════════════════════════════════════════════════════════════
--
-- NEDEN:
-- Uygulama açılışında atılan istek sayısı, ölçülmediği için yıllarca sessizce
-- büyüdü: kullanılmayan bir takım listesi, panelin yönetici fonksiyonu, ülke
-- geneli saha/maç sorguları... Hepsi düzeltildi (10 istek → 7). Ama düzeltmenin
-- kendisi bir koruma değildir; koruma, BOZULDUĞUNDA HABER VERENDİR (P-0).
--
-- Bu migration o haber verme yolunu kurar:
--   1. `acilis_olcumu` — uygulama açılışta kaç istek attığını ve ne kadar
--      sürdüğünü buraya yazar (örnekleme ile, her açılışta değil).
--   2. K-YUK-4 — gece denetimi bu ölçümleri okur ve Sistem Sağlığı kartına
--      yeşil/sarı/kırmızı olarak yazar. Biri açılışa yeni bir istek eklerse
--      ertesi sabah kartta görünür.
--
-- B09 YUK yapı taşının bugüne dek HİÇ çalışan kontrolü yoktu; bu ilk olanı.
--
-- GERİ ALMA:
--   DROP FUNCTION IF EXISTS public.acilis_olcumu_yaz(int,int,boolean,text,text);
--   DROP TABLE IF EXISTS public.acilis_olcumu;
--   -- sistem_saglik_ek_kontroller için bir önceki sürüm:
--   -- supabase/migrations/20260805204225_kapi_denetimi_ve_varsayilan_kapali.sql
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1) ÖLÇÜM TABLOSU ───────────────────────────────────────────────────────
-- Kişisel veri YOK: kim olduğu değil, açılışın kaça mal olduğu tutulur.
CREATE TABLE IF NOT EXISTS public.acilis_olcumu (
  id              bigserial PRIMARY KEY,
  olustu_at       timestamptz NOT NULL DEFAULT now(),
  istek_sayisi    int         NOT NULL,
  sure_ms         int         NOT NULL,
  bolge_biliniyor boolean     NOT NULL DEFAULT false,
  platform        text,
  surum           text,
  CONSTRAINT acilis_olcumu_makul_istek CHECK (istek_sayisi BETWEEN 0 AND 200),
  CONSTRAINT acilis_olcumu_makul_sure  CHECK (sure_ms      BETWEEN 0 AND 600000)
);

CREATE INDEX IF NOT EXISTS acilis_olcumu_zaman_idx
  ON public.acilis_olcumu (olustu_at DESC);

ALTER TABLE public.acilis_olcumu ENABLE ROW LEVEL SECURITY;

-- OKUMA: yalnız yönetici. Ölçüm kullanıcıya ait değildir, operasyon verisidir.
DROP POLICY IF EXISTS acilis_olcumu_select_admin ON public.acilis_olcumu;
CREATE POLICY acilis_olcumu_select_admin ON public.acilis_olcumu
  FOR SELECT TO authenticated
  USING (public.is_platform_admin());

-- YAZMA: doğrudan INSERT'e kapalı. Yazım yalnız aşağıdaki fonksiyonla yapılır;
-- böylece uydurma/aşırı kayıt tek noktadan sınırlanabilir.
-- (Politika yazılmadığı için normal kullanıcı INSERT edemez.)

REVOKE ALL ON public.acilis_olcumu FROM anon, authenticated;
-- SELECT geri verilir: REVOKE ALL tablo iznini de kaldirdigi icin yukaridaki
-- RLS politikasi islevsiz kalir, yonetici bile ham olcume bakamazdi.
-- Satir kurali zaten yalniz yoneticiye aciyor. INSERT bilerek VERILMEZ —
-- yazim tek kapidan, acilis_olcumu_yaz() ile yapilir.
GRANT SELECT ON public.acilis_olcumu TO authenticated;

-- ── 2) YAZIM KAPISI ────────────────────────────────────────────────────────
-- Uygulama bunu çağırır. Giriş yapılmamış olsa da çalışır (açılış ölçümü
-- misafirleri de kapsamalı), ama YALNIZ ölçüm satırı yazar; başka yetki vermez.
CREATE OR REPLACE FUNCTION public.acilis_olcumu_yaz(
  p_istek_sayisi    int,
  p_sure_ms         int,
  p_bolge_biliniyor boolean,
  p_platform        text DEFAULT NULL,
  p_surum           text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $fn$
BEGIN
  -- Saçma değerleri sessizce ele: ölçüm hiçbir koşulda çağıranı bozmaz.
  IF p_istek_sayisi IS NULL OR p_istek_sayisi < 0 OR p_istek_sayisi > 200 THEN RETURN; END IF;
  IF p_sure_ms      IS NULL OR p_sure_ms      < 0 OR p_sure_ms      > 600000 THEN RETURN; END IF;

  INSERT INTO public.acilis_olcumu
    (istek_sayisi, sure_ms, bolge_biliniyor, platform, surum)
  VALUES
    (p_istek_sayisi, p_sure_ms, COALESCE(p_bolge_biliniyor,false),
     left(COALESCE(p_platform,''), 20), left(COALESCE(p_surum,''), 20));
END; $fn$;

-- Kapı politikası (§ kapi_kayitli_durum): bu fonksiyon BİLEREK açıktır —
-- misafir dahil her açılış ölçülebilmeli. Yetki vermez, yalnız sayı yazar.
GRANT EXECUTE ON FUNCTION public.acilis_olcumu_yaz(int,int,boolean,text,text)
  TO anon, authenticated;

-- ── 3) K-YUK-4 · gece denetimine ekle ──────────────────────────────────────
-- NOT: büyük `sistem_saglik_calistir()` fonksiyonuna DOKUNULMADI. Sistemin
-- kendi genişletme noktası olan `sistem_saglik_ek_kontroller()` kullanıldı;
-- eski kontroller birebir korunur, sonuna K-YUK-4 eklenir.
CREATE OR REPLACE FUNCTION public.sistem_saglik_ek_kontroller()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_calisma timestamptz;
  v_adet    int;
  v_renk    text;
  v_mesaj   text;
  v_eklenen int := 0;
  v_kapi    jsonb;
  v_ortanca numeric;
  v_sure    numeric;
  v_beklenen CONSTANT int := 7;   -- bugünkü açılış: oturum+saha+maç+maçlarım+metin + kaleci+hakem
BEGIN
  SELECT max(calisma_at) INTO v_calisma FROM public.sistem_saglik_kayitlari;
  IF v_calisma IS NULL THEN
    RETURN jsonb_build_object('atlandi', 'ana denetim hic calismamis', 'eklenen_kontrol', 0);
  END IF;

  DELETE FROM public.sistem_saglik_kayitlari
   WHERE calisma_at = v_calisma
     AND kontrol_id IN ('K-SUPURUCU-1','K-BILDIRIM-2','K-BILDIRIM-3','K-KAPI-4','K-YUK-4');

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

  -- ── K-YUK-4 · acilista atilan istek sayisi arttı mı ───────────────────────
  -- ORTANCA kullanilir, ortalama degil: tek bir kotu ag kosulu ortalamayi
  -- bozar ama ortancayi bozmaz.
  BEGIN
    SELECT percentile_disc(0.5) WITHIN GROUP (ORDER BY istek_sayisi),
           percentile_disc(0.9) WITHIN GROUP (ORDER BY sure_ms),
           count(*)
      INTO v_ortanca, v_sure, v_adet
      FROM public.acilis_olcumu
     WHERE olustu_at > now() - interval '24 hours';

    IF v_adet = 0 THEN
      -- DIKKAT: burada KIRMIZI YAZILMAZ. "24 saattir kimse uygulamayi acmadi"
      -- bir ariza degildir; kirmizi yazsaydik kart yalanci alarm uretir ve
      -- zamanla kimse bakmaz olurdu (K-11.3'un amaci bunun tersi).
      v_renk := 'SARI';
      v_mesaj := 'Son 24 saatte acilis olcumu gelmedi - uygulama hic acilmamis olabilir';
      INSERT INTO public.sistem_saglik_kayitlari(calisma_at,kontrol_id,yapi_tasi,durum,olculen,beklenen,mesaj)
      VALUES (v_calisma,'K-YUK-4','B09 YUK',v_renk,NULL,v_beklenen::text,v_mesaj);
    ELSE
      IF v_ortanca <= v_beklenen THEN
        v_renk := 'YESIL';
        v_mesaj := 'Acilis '||v_ortanca||' istek (beklenen '||v_beklenen||'), yarisi '
                   ||round(v_sure/1000.0,1)||' sn altinda - '||v_adet||' olcum';
      ELSIF v_ortanca <= v_beklenen + 2 THEN
        v_renk := 'SARI';
        v_mesaj := 'Acilis '||v_ortanca||' istege cikti (beklenen '||v_beklenen
                   ||') - yeni bir istek eklenmis olabilir';
      ELSE
        v_renk := 'KIRMIZI';
        v_mesaj := 'Acilis '||v_ortanca||' istek - beklenenin ('||v_beklenen
                   ||') cok ustunde, acilis yolu sismis';
      END IF;
      INSERT INTO public.sistem_saglik_kayitlari(calisma_at,kontrol_id,yapi_tasi,durum,olculen,beklenen,mesaj)
      VALUES (v_calisma,'K-YUK-4','B09 YUK',v_renk,v_ortanca,v_beklenen::text,v_mesaj);
    END IF;
    v_eklenen := v_eklenen + 1;

    -- Saklama: olcum operasyon verisidir, 14 gunden eskisi tutulmaz.
    DELETE FROM public.acilis_olcumu WHERE olustu_at < now() - interval '14 days';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.sistem_saglik_kayitlari(calisma_at,kontrol_id,yapi_tasi,durum,beklenen,mesaj)
    VALUES (v_calisma,'K-YUK-4','B09 YUK','OLCULEMEDI',v_beklenen::text,'Kontrol calistirilamadi: '||SQLERRM);
    v_eklenen := v_eklenen + 1;
  END;

  RETURN jsonb_build_object('calisma_at', v_calisma, 'eklenen_kontrol', v_eklenen);
END; $function$;
