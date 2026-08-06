-- ════════════════════════════════════════════════════════════════════════════
-- K-PARA-4 · SÜPÜRÜCÜ BAĞLANTISI KONTROLÜ  (B01 PARA)
-- ════════════════════════════════════════════════════════════════════════════
--
-- NE İŞE YARAR (sade): Yarıda kalan ödemeleri toplayan gece işçisinin
-- ("süpürücü") gerçekten bağlı olup olmadığını her gece kontrol eder.
-- Bağlı değilse Sistem Sağlığı kartı KIRMIZI yanar.
--
-- NEDEN GEREKLİ:
-- Süpürücünün çalışması üç şeye bağlı — adres, parola, saat başı iş kaydı.
-- Bugüne kadar bunlar YALNIZCA kurulum anında, bir kez denetleniyordu
-- (20260803210001 dosyasındaki sert durdurma). O denetim canlıda çoktan
-- geçti ve bir daha çalışmaz. Yani şu an:
--   · cron işi silinse            → kimse haber vermez
--   · parola yanlış yenilense     → kimse haber vermez
--   · adres boşaltılsa            → kimse haber vermez
-- Üçünde de sonuç aynı: para bankada bloke kalır, saha boş kalır, kullanıcı
-- ne parasını görür ne yerini. K-PARA-4 bu üç sessizliği de bozar.
--
-- YER TUTUCU DURUMU: Temiz kurulan bir veritabanında gerçek parola olmaz;
-- 20260525000001 oraya tanınabilir bir yer tutucu koyar. Bu kontrol yer
-- tutucuyu GÖRÜRSE kırmızı yanar — yani "kuruldu ama gerçekte çalışmıyor"
-- durumu gizlenemez. Sırrın kendisi hiçbir yere yazılmaz, yalnız yer
-- tutucuya eşit mi diye bakılır.
--
-- SARI/KIRMIZI AYRIMI:
--   KIRMIZI → süpürücü açık ama bağlantı eksik (para gerçekten takılı kalır)
--   SARI    → süpürücü kapalı ve bağlantı da eksik (henüz açılmamış, acil değil)
--   YEŞİL   → üçü de yerinde
-- Süpürücü kapalıyken kırmızı yakmıyoruz; yalancı alarm kartı değersizleştirir
-- (K-11.3'ün amacı bunun tersi).
--
-- NOT: 18 KB'lık `sistem_saglik_calistir()` fonksiyonuna DOKUNULMADI. Sistemin
-- kendi genişletme noktası `sistem_saglik_ek_kontroller()` kullanıldı; önceki
-- beş kontrol (K-SUPURUCU-1, K-BILDIRIM-2/3, K-KAPI-4, K-YUK-4) birebir korunur.
--
-- ÖNCEKİ SÜRÜM: supabase/migrations/20260805223043_k_yuk_4_acilis_yuku_kontrolu.sql
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
  -- K-PARA-4 için
  v_adres_var   boolean;
  v_parola_ok   boolean;
  v_cron_var    boolean;
  v_cron_aktif  boolean;
  v_supurucu_acik boolean;
  v_eksik   text[];
  v_yer_tutucu CONSTANT text := 'OYNA-KURULMADI-YER-TUTUCU';
BEGIN
  SELECT max(calisma_at) INTO v_calisma FROM public.sistem_saglik_kayitlari;
  IF v_calisma IS NULL THEN
    RETURN jsonb_build_object('atlandi', 'ana denetim hic calismamis', 'eklenen_kontrol', 0);
  END IF;

  DELETE FROM public.sistem_saglik_kayitlari
   WHERE calisma_at = v_calisma
     AND kontrol_id IN ('K-SUPURUCU-1','K-BILDIRIM-2','K-BILDIRIM-3','K-KAPI-4','K-YUK-4','K-PARA-4');

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

  -- ── K-PARA-4 · YENI · supurucu gercekten bagli mi ────────────────────────
  BEGIN
    v_eksik := ARRAY[]::text[];

    -- 1) Adres
    SELECT coalesce(value #>> '{}', '') <> ''
      INTO v_adres_var
      FROM public.app_config WHERE key = 'functions_base_url';
    v_adres_var := coalesce(v_adres_var, false);
    IF NOT v_adres_var THEN v_eksik := v_eksik || 'adres'; END IF;

    -- 2) Parola - degerin kendisi HICBIR YERE yazilmaz, yalniz yer tutucu mu
    --    diye bakilir.
    BEGIN
      SELECT EXISTS (
        SELECT 1 FROM vault.decrypted_secrets
         WHERE name = 'webhook_secret'
           AND coalesce(decrypted_secret,'') <> ''
           AND decrypted_secret <> v_yer_tutucu
      ) INTO v_parola_ok;
    EXCEPTION WHEN OTHERS THEN
      v_parola_ok := NULL;   -- Vault okunamadi: "yok" demek yanlis olur
    END;
    IF v_parola_ok IS FALSE THEN v_eksik := v_eksik || 'parola'; END IF;

    -- 3) Saat basi is kaydi
    SELECT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sweep_stale_payments'),
           EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sweep_stale_payments' AND active)
      INTO v_cron_var, v_cron_aktif;
    IF NOT v_cron_var THEN
      v_eksik := v_eksik || 'saat basi is';
    ELSIF NOT v_cron_aktif THEN
      v_eksik := v_eksik || 'is duraklatilmis';
    END IF;

    -- Supurucu acik mi? Acikken eksik olmasi ACIL; kapaliyken degil.
    SELECT coalesce((value #>> '{}') = 'true', false)
      INTO v_supurucu_acik
      FROM public.app_config WHERE key = 'sweeper_enabled';
    v_supurucu_acik := coalesce(v_supurucu_acik, false);

    IF v_parola_ok IS NULL THEN
      v_renk  := 'OLCULEMEDI';
      v_mesaj := 'Supurucu parolasi okunamadi - baglanti dogrulanamadi';
    ELSIF array_length(v_eksik, 1) IS NULL THEN
      v_renk  := 'YESIL';
      v_mesaj := 'Yarim kalan odemeleri toplayan gece iscisi bagli ve calisiyor';
    ELSIF v_supurucu_acik THEN
      v_renk  := 'KIRMIZI';
      v_mesaj := 'Supurucu ACIK ama baglanti eksik ('||array_to_string(v_eksik,', ')
                 ||') - yarim kalan odemeler toplanmiyor, para bloke kaliyor';
    ELSE
      v_renk  := 'SARI';
      v_mesaj := 'Supurucu kapali ve baglanti eksik ('||array_to_string(v_eksik,', ')
                 ||') - acilmadan once tamamlanmali';
    END IF;

    INSERT INTO public.sistem_saglik_kayitlari(calisma_at,kontrol_id,yapi_tasi,durum,olculen,beklenen,mesaj)
    VALUES (v_calisma,'K-PARA-4','B01 PARA',v_renk,
            coalesce(array_length(v_eksik,1),0),'0',v_mesaj);
    v_eklenen := v_eklenen + 1;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.sistem_saglik_kayitlari(calisma_at,kontrol_id,yapi_tasi,durum,beklenen,mesaj)
    VALUES (v_calisma,'K-PARA-4','B01 PARA','OLCULEMEDI','0','Kontrol calistirilamadi: '||SQLERRM);
    v_eklenen := v_eklenen + 1;
  END;

  RETURN jsonb_build_object('calisma_at', v_calisma, 'eklenen_kontrol', v_eklenen);
END; $function$;
