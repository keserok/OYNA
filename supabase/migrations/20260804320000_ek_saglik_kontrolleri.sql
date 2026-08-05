-- ═══════════════════════════════════════════════════════════════════════════
-- EK SAĞLIK KONTROLLERİ — "peki bu koruma bozulursa kim söyleyecek?" (P-0)
-- CEO kararı, 4 Ağustos 2026
--
-- Bugün iki yeni koruma kuruldu:
--   • bildirim modu bekçisi (S2)
--   • bozuk maç rafı (D)
-- Altın kural gereği ikisinin de bir denetleyicisi olmalı; yoksa koruma
-- yarım kurulmuştur.
--
-- NEDEN AYRI FONKSİYON: sistem_saglik_calistir() 18 bin karakter. Yeni kontrol
-- eklemek için tamamını yeniden yazmak, tek bir kopyalama hatasının 14 kontrolü
-- birden bozması demek. Panel (sistem_saglik_ozet) zaten TABLODAN okuyor ve
-- son çalışmayı max(calisma_at) ile buluyor — bu yüzden ek kontroller aynı
-- calisma_at ile yazarsa panelde kendiliğinden görünür. Ana fonksiyona hiç
-- dokunulmuyor.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.sistem_saglik_ek_kontroller()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_calisma timestamptz;
  v_adet    int;
  v_renk    text;
  v_mesaj   text;
  v_eklenen int := 0;
BEGIN
  -- Ana denetimin bu turdaki damgasını kullan; yoksa şimdi.
  SELECT max(calisma_at) INTO v_calisma FROM public.sistem_saglik_kayitlari;
  IF v_calisma IS NULL OR v_calisma < now() - interval '2 hours' THEN
    v_calisma := now();
  END IF;

  -- ── K-SUPURUCU-1 · Elle bakılması gereken maç var mı ────────────────────
  BEGIN
    SELECT count(*) INTO v_adet FROM public.matches WHERE elle_bakilmali;
    IF v_adet = 0 THEN
      v_renk := 'YESIL'; v_mesaj := 'Otomatik is takildigi mac yok';
    ELSE
      -- SARI, KIRMIZI degil: is duruyor ama para/veri bozulmus degil.
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

  -- ── K-BILDIRIM-2 · Bildirim modu bekçisi ayakta mı ──────────────────────
  -- Bekçi sessizce kaybolursa kimse fark etmez: bildirimler yine gider,
  -- yalnız kullanicinin tercihi bir daha uygulanmaz. Tam da bu yuzden denetlenir.
  BEGIN
    SELECT count(*) INTO v_adet FROM pg_trigger
     WHERE tgrelid = 'public.notifications'::regclass
       AND tgname = 'b_bildirim_modu_bekcisi' AND NOT tgisinternal AND tgenabled <> 'D';

    IF v_adet = 1 THEN
      -- Bekçi var; seviyeler de anlamli mi? Hepsi 1 olsaydi hicbir mod ise yaramazdi.
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

  -- ── K-BILDIRIM-3 · Bildirim adresleri gecerli mi ────────────────────────
  -- 36 mac hatirlatmasi '/match/<id>' yaziyordu ve tiklandiginda hicbir sey
  -- olmuyordu. Ayni hatanin sessizce geri gelmesini bu kontrol engeller.
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

  RETURN jsonb_build_object('calisma_at', v_calisma, 'eklenen_kontrol', v_eklenen);
END; $$;

REVOKE ALL ON FUNCTION public.sistem_saglik_ek_kontroller() FROM PUBLIC, anon, authenticated;

-- ─── Gunluk denetime bagla ────────────────────────────────────────────────
-- Ana denetimden HEMEN SONRA calisir ve onun calisma_at damgasini kullanir;
-- boylece panelde tek bir denetim turu olarak gorunur.
SELECT cron.unschedule('sistem_saglik_ek')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sistem_saglik_ek');

SELECT cron.schedule('sistem_saglik_ek', '42 3 * * *',
                     'SELECT public.sistem_saglik_ek_kontroller();');

-- ─── DOGRULAMA ────────────────────────────────────────────────────────────
DO $$
DECLARE v_sonuc jsonb; v_supurucu text; v_bekci text; v_adres text;
BEGIN
  v_sonuc := public.sistem_saglik_ek_kontroller();
  IF (v_sonuc->>'eklenen_kontrol')::int <> 3 THEN
    RAISE EXCEPTION 'DOGRULAMA: 3 kontrol beklenirken % eklendi.', v_sonuc->>'eklenen_kontrol';
  END IF;

  SELECT durum INTO v_supurucu FROM public.sistem_saglik_kayitlari
   WHERE kontrol_id='K-SUPURUCU-1' ORDER BY calisma_at DESC LIMIT 1;
  SELECT durum INTO v_bekci FROM public.sistem_saglik_kayitlari
   WHERE kontrol_id='K-BILDIRIM-2' ORDER BY calisma_at DESC LIMIT 1;
  SELECT durum INTO v_adres FROM public.sistem_saglik_kayitlari
   WHERE kontrol_id='K-BILDIRIM-3' ORDER BY calisma_at DESC LIMIT 1;

  IF v_bekci <> 'YESIL' THEN
    RAISE EXCEPTION 'DOGRULAMA: bildirim bekcisi kontrolu % dondu (YESIL bekleniyordu).', v_bekci;
  END IF;
  IF v_adres <> 'YESIL' THEN
    RAISE EXCEPTION 'DOGRULAMA: adres kontrolu % dondu (YESIL bekleniyordu).', v_adres;
  END IF;
  IF v_supurucu <> 'YESIL' THEN
    RAISE EXCEPTION 'DOGRULAMA: supurucu kontrolu % dondu (YESIL bekleniyordu).', v_supurucu;
  END IF;

  RAISE NOTICE 'Ek saglik kontrolleri: 3 kontrol calisiyor, ucu de YESIL.';
END $$;
