-- ═══════════════════════════════════════════════════════════════════════════
-- DÜZELTME — ek kontroller paneli parçalıyordu · 4 Ağustos 2026
--
-- HATA (kendi hatam; migration'ın kendi doğrulaması yakaladı):
--   Bir önceki dosyadaki sistem_saglik_ek_kontroller(), son denetim 2 saatten
--   eskiyse YENİ bir calisma_at damgası atıyordu. Panel (sistem_saglik_ozet)
--   son turu max(calisma_at) ile bulduğu için ek kontroller kendi başına bir
--   "tur" oluşturup diğer 14 kontrolü ekrandan siliyordu — panel 17 yerine
--   3 kontrol gösteriyordu.
--
-- ÇÖZÜM:
--   1) Ek kontroller ARTIK KENDİ DAMGASINI ATMIYOR; yalnız var olan son turun
--      üzerine yazar. Tur yoksa hiçbir şey yapmaz.
--   2) Aynı tura ikinci kez yazmayı önleyen DELETE eklendi.
--   3) Ayrı cron kaldırıldı; iki iş TEK komutta ardışık çalışıyor — damga
--      her zaman aynı olur.
--   4) Yanlış damgayla yazılmış öksüz satırlar temizlendi.
--
-- SONUÇ (canlıda ölçüldü): tek turda 17 kontrol, 17 yeşil, 0 kırmızı.
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
  SELECT max(calisma_at) INTO v_calisma FROM public.sistem_saglik_kayitlari;

  -- Kendi damgasini ASLA atma: ana denetim kosmadiysa hicbir sey yazma.
  -- (Aksi halde panel bu 3 kontrolu tek tur sanip diger 14'unu gizler.)
  IF v_calisma IS NULL THEN
    RETURN jsonb_build_object('atlandi', 'ana denetim hic calismamis', 'eklenen_kontrol', 0);
  END IF;

  -- Ayni tur icin ikinci kez yazma (cron iki kez tetiklenirse).
  DELETE FROM public.sistem_saglik_kayitlari
   WHERE calisma_at = v_calisma
     AND kontrol_id IN ('K-SUPURUCU-1','K-BILDIRIM-2','K-BILDIRIM-3');

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

  RETURN jsonb_build_object('calisma_at', v_calisma, 'eklenen_kontrol', v_eklenen);
END; $$;

REVOKE ALL ON FUNCTION public.sistem_saglik_ek_kontroller() FROM PUBLIC, anon, authenticated;

-- Ayri cron kaldirildi; ana denetimle TEK KOMUTTA ardisik calisir (damga garantisi).
SELECT cron.unschedule('sistem_saglik_ek')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sistem_saglik_ek');

SELECT cron.unschedule('sistem_saglik_gunluk')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sistem_saglik_gunluk');

SELECT cron.schedule('sistem_saglik_gunluk', '40 3 * * *',
  'SELECT public.sistem_saglik_calistir(); SELECT public.sistem_saglik_ek_kontroller();');

-- Yanlis damgayla yazilmis oksuz satirlari temizle.
DELETE FROM public.sistem_saglik_kayitlari a
 WHERE a.kontrol_id IN ('K-SUPURUCU-1','K-BILDIRIM-2','K-BILDIRIM-3')
   AND NOT EXISTS (
     SELECT 1 FROM public.sistem_saglik_kayitlari b
      WHERE b.calisma_at = a.calisma_at AND b.kontrol_id = 'K-PARA-1');

-- DOGRULAMA
DO $$
DECLARE v_toplam int; v_kirmizi int; v_ek int;
BEGIN
  PERFORM public.sistem_saglik_calistir();
  PERFORM public.sistem_saglik_ek_kontroller();

  SELECT count(*), count(*) FILTER (WHERE durum IN ('KIRMIZI','OLCULEMEDI'))
    INTO v_toplam, v_kirmizi
    FROM public.sistem_saglik_kayitlari
   WHERE calisma_at = (SELECT max(calisma_at) FROM public.sistem_saglik_kayitlari);

  SELECT count(*) INTO v_ek FROM public.sistem_saglik_kayitlari
   WHERE calisma_at = (SELECT max(calisma_at) FROM public.sistem_saglik_kayitlari)
     AND kontrol_id IN ('K-SUPURUCU-1','K-BILDIRIM-2','K-BILDIRIM-3');

  IF v_ek <> 3 THEN
    RAISE EXCEPTION 'DOGRULAMA: ek kontroller ana tura baglanmadi (% adet).', v_ek;
  END IF;
  IF v_toplam < 17 THEN
    RAISE EXCEPTION 'DOGRULAMA: son turda % kontrol var, 17 bekleniyordu.', v_toplam;
  END IF;
  IF v_kirmizi > 0 THEN
    RAISE EXCEPTION 'DOGRULAMA: % kontrol kirmizi.', v_kirmizi;
  END IF;

  RAISE NOTICE 'Saglik denetimi: % kontrol tek turda, 0 kirmizi.', v_toplam;
END $$;
