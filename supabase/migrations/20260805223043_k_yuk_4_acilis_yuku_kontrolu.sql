-- ════════════════════════════════════════════════════════════════════════════
-- K-YUK-4 · AÇILIŞ YÜKÜ KONTROLÜ  (B09 YUK yapı taşının İLK çalışan kontrolü)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Gece denetimi, `acilis_olcumu` tablosuna düşen ölçümleri okur ve Sistem
-- Sağlığı kartına yeşil/sarı/kırmızı olarak yazar. Biri açılışa yeni bir istek
-- eklerse ertesi sabah kartta görünür.
--
-- ORTANCA kullanılır, ortalama değil: tek bir kötü ağ koşulu ortalamayı bozar
-- ama ortancayı bozmaz.
--     <= 7 YEŞİL · 8-9 SARI · >= 10 KIRMIZI
--
-- "24 saattir ölçüm gelmedi" KIRMIZI değil SARI yazar. Kimsenin uygulamayı
-- açmamış olması arıza değildir; kırmızı yazsaydık kart yalancı alarm üretir
-- ve zamanla kimse bakmaz olurdu (K-11.3'ün amacı bunun tersi).
--
-- NOT: 18 KB'lık `sistem_saglik_calistir()` fonksiyonuna DOKUNULMADI. Sistemin
-- kendi genişletme noktası `sistem_saglik_ek_kontroller()` kullanıldı; önceki
-- dört kontrol (K-SUPURUCU-1, K-BILDIRIM-2/3, K-KAPI-4) birebir korunur.
--
-- ÖNCEKİ SÜRÜM: supabase/migrations/20260805204225_kapi_denetimi_ve_varsayilan_kapali.sql
-- ════════════════════════════════════════════════════════════════════════════
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
  v_beklenen CONSTANT int := 7;   -- oturum+saha+maç+maçlarım+metin + kaleci+hakem
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

  -- K-YUK-4 - acilista atilan istek sayisi artti mi
  BEGIN
    SELECT percentile_disc(0.5) WITHIN GROUP (ORDER BY istek_sayisi),
           percentile_disc(0.9) WITHIN GROUP (ORDER BY sure_ms),
           count(*)
      INTO v_ortanca, v_sure, v_adet
      FROM public.acilis_olcumu
     WHERE olustu_at > now() - interval '24 hours';

    IF v_adet = 0 THEN
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
