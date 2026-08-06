-- ════════════════════════════════════════════════════════════════════════════
-- [SON-4 / STR-1] K-DEMO-1 denetimi MAÇLARA da baksın
-- Kurucu onayı: SON_KARARLAR 30
-- ────────────────────────────────────────────────────────────────────────────
-- BULGU: Denetim yalnız `payment_intents` ↔ `profiles` karşılaştırması
-- yapıyordu. Canlıda 3 maç "gerçek" işaretliyken onları DEMO kullanıcılar
-- kurmuştu — denetim bunu görmüyor, panel YEŞİL gösteriyordu.
--
-- Sonuç: "4 gerçek maç" diye okunan sayının 3'ü sahteydi ve sistem bunu
-- doğruluyordu. Yanlış sayıya bakan bir kurucu, yanlış karar verir.
--
-- NOT: Bu dosya sistem_saglik_calistir()'in TAMAMINI yeniden yazar
-- (CREATE OR REPLACE tek parça çalışır). İçerik farkı yalnız K-DEMO-1'dir.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.sistem_saglik_calistir()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp', 'extensions'
AS $function$
DECLARE
  v_calisma  timestamptz := now();
  v_sonuc    jsonb := '[]'::jsonb;
  v_kirmizi  int := 0;
  v_sari     int := 0;
  v_yesil    int := 0;
BEGIN
  -- ── K-PARA-1 · Para degismezleri ────────────────────────────────────────
  BEGIN
    IF (public.check_money_invariants()->>'ok')::boolean THEN
      INSERT INTO public.sistem_saglik_kayitlari(calisma_at,kontrol_id,yapi_tasi,durum,beklenen,mesaj)
      VALUES (v_calisma,'K-PARA-1','B01 PARA','YESIL','ok=true','8 para degismezi tutuyor');
      v_yesil := v_yesil + 1;
    ELSE
      INSERT INTO public.sistem_saglik_kayitlari(calisma_at,kontrol_id,yapi_tasi,durum,beklenen,mesaj)
      VALUES (v_calisma,'K-PARA-1','B01 PARA','KIRMIZI','ok=true','Para degismezleri BOZUK');
      v_kirmizi := v_kirmizi + 1;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.sistem_saglik_kayitlari(calisma_at,kontrol_id,yapi_tasi,durum,beklenen,mesaj)
    VALUES (v_calisma,'K-PARA-1','B01 PARA','OLCULEMEDI','ok=true','Kontrol calistirilamadi: '||SQLERRM);
    v_kirmizi := v_kirmizi + 1;
  END;

  -- ── K-PARA-2 · Askida odeme (DEMO HARIC) ────────────────────────────────
  BEGIN
    DECLARE v_adet int;
    BEGIN
      SELECT count(*) INTO v_adet FROM public.payment_intents
      WHERE NOT is_demo AND status IN ('PENDING','BLOCKED') AND created_at < now() - interval '30 minutes';
      INSERT INTO public.sistem_saglik_kayitlari(calisma_at,kontrol_id,yapi_tasi,durum,olculen,beklenen,mesaj)
      VALUES (v_calisma,'K-PARA-2','B01 PARA',CASE WHEN v_adet=0 THEN 'YESIL' ELSE 'KIRMIZI' END,v_adet,'0',
              CASE WHEN v_adet=0 THEN 'Askida odeme yok' ELSE v_adet||' odeme 30+ dakikadir askida' END);
      IF v_adet=0 THEN v_yesil:=v_yesil+1; ELSE v_kirmizi:=v_kirmizi+1; END IF;
    END;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.sistem_saglik_kayitlari(calisma_at,kontrol_id,yapi_tasi,durum,beklenen,mesaj)
    VALUES (v_calisma,'K-PARA-2','B01 PARA','OLCULEMEDI','0','Kontrol calistirilamadi: '||SQLERRM);
    v_kirmizi := v_kirmizi + 1;
  END;

  -- ── K-ZAMAN-1 · Mac saatleri tutarli mi ─────────────────────────────────
  BEGIN
    DECLARE v_adet int;
    BEGIN
      SELECT count(*) INTO v_adet FROM public.matches
      WHERE starts_at IS NOT NULL
        AND (date <> to_char(starts_at AT TIME ZONE 'Europe/Istanbul','YYYY-MM-DD')
          OR "time" <> to_char(starts_at AT TIME ZONE 'Europe/Istanbul','HH24:MI'));
      INSERT INTO public.sistem_saglik_kayitlari(calisma_at,kontrol_id,yapi_tasi,durum,olculen,beklenen,mesaj)
      VALUES (v_calisma,'K-ZAMAN-1','B03 ZAMAN',CASE WHEN v_adet=0 THEN 'YESIL' ELSE 'KIRMIZI' END,v_adet,'0',
              CASE WHEN v_adet=0 THEN 'Saat sapmasi yok' ELSE v_adet||' macta yazili saat gercek saatle uyusmuyor' END);
      IF v_adet=0 THEN v_yesil:=v_yesil+1; ELSE v_kirmizi:=v_kirmizi+1; END IF;
    END;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.sistem_saglik_kayitlari(calisma_at,kontrol_id,yapi_tasi,durum,beklenen,mesaj)
    VALUES (v_calisma,'K-ZAMAN-1','B03 ZAMAN','OLCULEMEDI','0','Kontrol calistirilamadi: '||SQLERRM);
    v_kirmizi := v_kirmizi + 1;
  END;

  -- ── K-REZ-1 · Cifte rezervasyon kisiti yerinde mi ───────────────────────
  BEGIN
    DECLARE v_var int;
    BEGIN
      SELECT count(*) INTO v_var FROM pg_constraint WHERE conname='pitch_bookings_no_overlap';
      INSERT INTO public.sistem_saglik_kayitlari(calisma_at,kontrol_id,yapi_tasi,durum,olculen,beklenen,mesaj)
      VALUES (v_calisma,'K-REZ-1','B04 REZERVASYON',CASE WHEN v_var=1 THEN 'YESIL' ELSE 'KIRMIZI' END,v_var,'1',
              CASE WHEN v_var=1 THEN 'Cifte rezervasyon kisiti yerinde' ELSE 'KISIT KAYIP - ayni saate iki rezervasyon yapilabilir' END);
      IF v_var=1 THEN v_yesil:=v_yesil+1; ELSE v_kirmizi:=v_kirmizi+1; END IF;
    END;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.sistem_saglik_kayitlari(calisma_at,kontrol_id,yapi_tasi,durum,beklenen,mesaj)
    VALUES (v_calisma,'K-REZ-1','B04 REZERVASYON','OLCULEMEDI','1','Kontrol calistirilamadi: '||SQLERRM);
    v_kirmizi := v_kirmizi + 1;
  END;

  -- ── K-KAPI-3 · search_path sabit mi ─────────────────────────────────────
  BEGIN
    DECLARE v_acik int;
    BEGIN
      SELECT count(*) INTO v_acik FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.prosecdef
        AND (p.proconfig IS NULL OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'));
      INSERT INTO public.sistem_saglik_kayitlari(calisma_at,kontrol_id,yapi_tasi,durum,olculen,beklenen,mesaj)
      VALUES (v_calisma,'K-KAPI-3','B05 KAPILAR',CASE WHEN v_acik=0 THEN 'YESIL' ELSE 'KIRMIZI' END,v_acik,'0',
              CASE WHEN v_acik=0 THEN 'Tum yetkili fonksiyonlar korumali' ELSE v_acik||' fonksiyonda search_path sabit degil' END);
      IF v_acik=0 THEN v_yesil:=v_yesil+1; ELSE v_kirmizi:=v_kirmizi+1; END IF;
    END;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.sistem_saglik_kayitlari(calisma_at,kontrol_id,yapi_tasi,durum,beklenen,mesaj)
    VALUES (v_calisma,'K-KAPI-3','B05 KAPILAR','OLCULEMEDI','0','Kontrol calistirilamadi: '||SQLERRM);
    v_kirmizi := v_kirmizi + 1;
  END;

  -- ── K-BILDIRIM-1 · Disari giden cagrilar basarili mi ────────────────────
  BEGIN
    DECLARE v_basarisiz int;
    BEGIN
      SELECT count(*) INTO v_basarisiz FROM net._http_response
      WHERE created > now() - interval '24 hours' AND status_code NOT BETWEEN 200 AND 299;
      INSERT INTO public.sistem_saglik_kayitlari(calisma_at,kontrol_id,yapi_tasi,durum,olculen,beklenen,mesaj)
      VALUES (v_calisma,'K-BILDIRIM-1','B06 BILDIRIM',CASE WHEN v_basarisiz=0 THEN 'YESIL' ELSE 'KIRMIZI' END,v_basarisiz,'0',
              CASE WHEN v_basarisiz=0 THEN 'Son 24 saatte disari giden tum cagrilar basarili'
                   ELSE v_basarisiz||' cagri basarisiz - bildirim gitmiyor olabilir' END);
      IF v_basarisiz=0 THEN v_yesil:=v_yesil+1; ELSE v_kirmizi:=v_kirmizi+1; END IF;
    END;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.sistem_saglik_kayitlari(calisma_at,kontrol_id,yapi_tasi,durum,beklenen,mesaj)
    VALUES (v_calisma,'K-BILDIRIM-1','B06 BILDIRIM','OLCULEMEDI','0','Kontrol calistirilamadi: '||SQLERRM);
    v_kirmizi := v_kirmizi + 1;
  END;

  -- ── K-AYAR-1 · Zorunlu ayarlar dolu mu (3 Agu 2026 arizasinin kok nedeni) ─
  BEGIN
    DECLARE v_eksik text := '';
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name='webhook_secret' AND decrypted_secret <> '')
        THEN v_eksik := v_eksik || 'webhook_secret '; END IF;
      IF NOT EXISTS (SELECT 1 FROM public.app_config WHERE key='functions_base_url' AND (value #>> '{}') <> '')
        THEN v_eksik := v_eksik || 'functions_base_url '; END IF;
      INSERT INTO public.sistem_saglik_kayitlari(calisma_at,kontrol_id,yapi_tasi,durum,beklenen,mesaj)
      VALUES (v_calisma,'K-AYAR-1','B11 AYARLAR',CASE WHEN v_eksik='' THEN 'YESIL' ELSE 'KIRMIZI' END,'bos ayar yok',
              CASE WHEN v_eksik='' THEN 'Zorunlu ayarlarin hepsi dolu' ELSE 'EKSIK AYAR: '||v_eksik END);
      IF v_eksik='' THEN v_yesil:=v_yesil+1; ELSE v_kirmizi:=v_kirmizi+1; END IF;
    END;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.sistem_saglik_kayitlari(calisma_at,kontrol_id,yapi_tasi,durum,beklenen,mesaj)
    VALUES (v_calisma,'K-AYAR-1','B11 AYARLAR','OLCULEMEDI','bos ayar yok','Kontrol calistirilamadi: '||SQLERRM);
    v_kirmizi := v_kirmizi + 1;
  END;

  -- ── K-OTO-1 · Beklenen cron isleri kurulu mu ────────────────────────────
  BEGIN
    DECLARE v_eksik text := '';
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname='sweep_stale_payments' AND active)
        THEN v_eksik := v_eksik || 'sweep_stale_payments '; END IF;
      IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname='auto_process_matches' AND active)
        THEN v_eksik := v_eksik || 'auto_process_matches '; END IF;
      IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname='send_match_reminders' AND active)
        THEN v_eksik := v_eksik || 'send_match_reminders '; END IF;
      -- SRE-1: yedek isi de zorunlu islerden biri artik.
      IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname='gecelik_yedek' AND active)
        THEN v_eksik := v_eksik || 'gecelik_yedek '; END IF;
      INSERT INTO public.sistem_saglik_kayitlari(calisma_at,kontrol_id,yapi_tasi,durum,beklenen,mesaj)
      VALUES (v_calisma,'K-OTO-1','B10 OTOMASYON',CASE WHEN v_eksik='' THEN 'YESIL' ELSE 'KIRMIZI' END,'eksik is yok',
              CASE WHEN v_eksik='' THEN 'Zamanlanmis islerin hepsi kurulu' ELSE 'EKSIK IS: '||v_eksik END);
      IF v_eksik='' THEN v_yesil:=v_yesil+1; ELSE v_kirmizi:=v_kirmizi+1; END IF;
    END;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.sistem_saglik_kayitlari(calisma_at,kontrol_id,yapi_tasi,durum,beklenen,mesaj)
    VALUES (v_calisma,'K-OTO-1','B10 OTOMASYON','OLCULEMEDI','eksik is yok','Kontrol calistirilamadi: '||SQLERRM);
    v_kirmizi := v_kirmizi + 1;
  END;

  -- ── K-OTO-2 · Zehirli (takilmis) mac var mi ─────────────────────────────
  BEGIN
    DECLARE v_adet int;
    BEGIN
      SELECT count(*) INTO v_adet FROM public.matches
      WHERE status='ACTIVE' AND starts_at < now() - interval '3 hours' AND "isDemo" IS NOT TRUE;
      INSERT INTO public.sistem_saglik_kayitlari(calisma_at,kontrol_id,yapi_tasi,durum,olculen,beklenen,mesaj)
      VALUES (v_calisma,'K-OTO-2','B10 OTOMASYON',CASE WHEN v_adet=0 THEN 'YESIL' ELSE 'SARI' END,v_adet,'0',
              CASE WHEN v_adet=0 THEN 'Takilmis mac yok' ELSE v_adet||' mac saati gectigi halde ACTIVE kalmis' END);
      IF v_adet=0 THEN v_yesil:=v_yesil+1; ELSE v_sari:=v_sari+1; END IF;
    END;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.sistem_saglik_kayitlari(calisma_at,kontrol_id,yapi_tasi,durum,beklenen,mesaj)
    VALUES (v_calisma,'K-OTO-2','B10 OTOMASYON','OLCULEMEDI','0','Kontrol calistirilamadi: '||SQLERRM);
    v_kirmizi := v_kirmizi + 1;
  END;

  -- ── K-KIMLIK-1 · Hesap silme kapisi gercek sozlugu kullaniyor mu ────────
  BEGIN
    DECLARE v_hayalet int;
    BEGIN
      SELECT count(*) INTO v_hayalet FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public'
        AND p.proname <> 'sistem_saglik_calistir'  -- denetci kendini saymaz
        AND (pg_get_functiondef(p.oid) ILIKE '%''GATHERING''%' OR pg_get_functiondef(p.oid) ILIKE '%''PLAYING''%');
      INSERT INTO public.sistem_saglik_kayitlari(calisma_at,kontrol_id,yapi_tasi,durum,olculen,beklenen,mesaj)
      VALUES (v_calisma,'K-KIMLIK-1','B08 KIMLIK',CASE WHEN v_hayalet=0 THEN 'YESIL' ELSE 'KIRMIZI' END,v_hayalet,'0',
              CASE WHEN v_hayalet=0 THEN 'Kapilar gercek durum sozlugunu kullaniyor'
                   ELSE v_hayalet||' fonksiyon sistemde olmayan durum kelimesi ariyor (kapi hic tetiklenmez)' END);
      IF v_hayalet=0 THEN v_yesil:=v_yesil+1; ELSE v_kirmizi:=v_kirmizi+1; END IF;
    END;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.sistem_saglik_kayitlari(calisma_at,kontrol_id,yapi_tasi,durum,beklenen,mesaj)
    VALUES (v_calisma,'K-KIMLIK-1','B08 KIMLIK','OLCULEMEDI','0','Kontrol calistirilamadi: '||SQLERRM);
    v_kirmizi := v_kirmizi + 1;
  END;

  -- ── K-KADRO-1 · Odeme yapan herkes bildirim listesinde mi ───────────────
  BEGIN
    DECLARE v_adet int;
    BEGIN
      SELECT count(*) INTO v_adet FROM public.matches m
      WHERE m."isDemo" IS NOT TRUE AND m.status IN ('DRAFT','ACTIVE','CONFIRMED','LIVE')
        AND EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(m.slots,'[]')||COALESCE(m."awaySlots",'[]')) s
                    WHERE s->>'status'='TAKEN' AND s->>'purchasedBy' IS NOT NULL)
        AND COALESCE(array_length(public._match_participant_ids(m.id),1),0) = 0;
      INSERT INTO public.sistem_saglik_kayitlari(calisma_at,kontrol_id,yapi_tasi,durum,olculen,beklenen,mesaj)
      VALUES (v_calisma,'K-KADRO-1','B02 KADRO',CASE WHEN v_adet=0 THEN 'YESIL' ELSE 'KIRMIZI' END,v_adet,'0',
              CASE WHEN v_adet=0 THEN 'Odeme yapan herkes bildirim kapsaminda'
                   ELSE v_adet||' macta odeme yapilmis ama bildirim gidecek kimse yok' END);
      IF v_adet=0 THEN v_yesil:=v_yesil+1; ELSE v_kirmizi:=v_kirmizi+1; END IF;
    END;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.sistem_saglik_kayitlari(calisma_at,kontrol_id,yapi_tasi,durum,beklenen,mesaj)
    VALUES (v_calisma,'K-KADRO-1','B02 KADRO','OLCULEMEDI','0','Kontrol calistirilamadi: '||SQLERRM);
    v_kirmizi := v_kirmizi + 1;
  END;

  -- ── K-DEMO-1 · Demo veri gercek parayla karisiyor mu ────────────────────
  BEGIN
    DECLARE v_karisik int; v_mac_karisik int;
    BEGIN
      -- (1) demo kisinin GERCEK isaretli odemesi
      SELECT count(*) INTO v_karisik FROM public.payment_intents pi
      WHERE NOT pi.is_demo AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=pi.user_id AND p.is_demo);
      -- (2) demo kisinin GERCEK isaretli maci  ← STR-1: eskiden bakilmiyordu
      SELECT count(*) INTO v_mac_karisik FROM public.matches m
      WHERE m."isDemo" IS NOT TRUE
        AND EXISTS (SELECT 1 FROM public.profiles p
                    WHERE p.id = COALESCE(m."creatorId", m.captain_id) AND p.is_demo);
      v_karisik := v_karisik + v_mac_karisik;
      INSERT INTO public.sistem_saglik_kayitlari(calisma_at,kontrol_id,yapi_tasi,durum,olculen,beklenen,mesaj)
      VALUES (v_calisma,'K-DEMO-1','B12 DEMO',CASE WHEN v_karisik=0 THEN 'YESIL' ELSE 'KIRMIZI' END,v_karisik,'0',
              CASE WHEN v_karisik=0 THEN 'Demo ve gercek veri ayri'
                   ELSE v_karisik||' kayit yanlis isaretli (odeme ve/veya mac)' END);
      IF v_karisik=0 THEN v_yesil:=v_yesil+1; ELSE v_kirmizi:=v_kirmizi+1; END IF;
    END;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.sistem_saglik_kayitlari(calisma_at,kontrol_id,yapi_tasi,durum,beklenen,mesaj)
    VALUES (v_calisma,'K-DEMO-1','B12 DEMO','OLCULEMEDI','0','Kontrol calistirilamadi: '||SQLERRM);
    v_kirmizi := v_kirmizi + 1;
  END;

  -- ── K-YEDEK-1 · Gecelik yedek gercekten alindi mi (YENI · SRE-1) ────────
  -- Yedegin kendisi denetlenmezse, sessizce durdugunda kimse fark etmez.
  BEGIN
    DECLARE
      v_durum   jsonb;
      v_tarih   date;
      v_beklenen int;
      v_alinan  int;
      v_bugun   date := (now() AT TIME ZONE 'Europe/Istanbul')::date;
      v_renk    text;
      v_mesaj   text;
    BEGIN
      v_durum    := public.yedek_durumu();
      v_tarih    := (v_durum->>'son_yedek_tarihi')::date;
      v_beklenen := (v_durum->>'beklenen_tablo')::int;
      v_alinan   := (v_durum->>'son_gun_tablo')::int;

      IF v_tarih IS NULL THEN
        v_renk := 'KIRMIZI'; v_mesaj := 'HIC YEDEK YOK - kaza olursa geri donus imkansiz';
      ELSIF v_alinan < v_beklenen THEN
        v_renk := 'KIRMIZI';
        v_mesaj := 'Son yedekte '||v_beklenen||' tablodan sadece '||v_alinan||' tanesi alinmis';
      ELSIF v_tarih = v_bugun THEN
        v_renk := 'YESIL';
        v_mesaj := 'Bugunun yedegi tam ('||v_alinan||' tablo, '||(v_durum->>'saklanan_gun')||' gun saklaniyor)';
      ELSIF v_tarih = v_bugun - 1 THEN
        v_renk := 'SARI'; v_mesaj := 'Yedek dun alinmis, bu gece atlanmis olabilir';
      ELSE
        v_renk := 'KIRMIZI';
        v_mesaj := 'Son yedek '||(v_bugun - v_tarih)||' gun once - yedek durmus';
      END IF;

      INSERT INTO public.sistem_saglik_kayitlari(calisma_at,kontrol_id,yapi_tasi,durum,olculen,beklenen,mesaj)
      VALUES (v_calisma,'K-YEDEK-1','B16 KURTARMA',v_renk,v_alinan,v_beklenen::text,v_mesaj);

      IF    v_renk='YESIL'   THEN v_yesil   := v_yesil + 1;
      ELSIF v_renk='SARI'    THEN v_sari    := v_sari + 1;
      ELSE                        v_kirmizi := v_kirmizi + 1;
      END IF;
    END;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.sistem_saglik_kayitlari(calisma_at,kontrol_id,yapi_tasi,durum,beklenen,mesaj)
    VALUES (v_calisma,'K-YEDEK-1','B16 KURTARMA','OLCULEMEDI','8','Kontrol calistirilamadi: '||SQLERRM);
    v_kirmizi := v_kirmizi + 1;
  END;

  -- ── K-COKME-1 · Uygulama kimsede cokuyor mu (YENI · SRE-3) ─────────────
  -- Yeni bir surumden sonra ani artis, o surumun bir seyi bozdugunu gosterir.
  BEGIN
    DECLARE
      v_son24    int;
      v_kisi     int;
      v_ortalama numeric;
      v_esik     int;
      v_renk     text;
      v_mesaj    text;
    BEGIN
      SELECT count(*), count(DISTINCT kullanici_id)
        INTO v_son24, v_kisi
      FROM public.istemci_hatalari WHERE olustu_at > now() - interval '24 hours';

      -- Onceki 7 gunun GUNLUK ortalamasi (bugun haric).
      SELECT COALESCE(count(*)::numeric / 7, 0) INTO v_ortalama
      FROM public.istemci_hatalari
      WHERE olustu_at > now() - interval '8 days' AND olustu_at <= now() - interval '24 hours';

      v_esik := GREATEST(20, ceil(v_ortalama * 3))::int;

      IF v_son24 = 0 THEN
        v_renk := 'YESIL'; v_mesaj := 'Son 24 saatte hic cokme kaydi yok';
      ELSIF v_son24 < 5 THEN
        v_renk := 'YESIL';
        v_mesaj := 'Son 24 saatte '||v_son24||' cokme ('||v_kisi||' kisi) - dusuk seviye';
      ELSIF v_son24 <= v_esik THEN
        v_renk := 'SARI';
        v_mesaj := 'Son 24 saatte '||v_son24||' cokme ('||v_kisi||' kisi) - panelden bakilmali';
      ELSE
        v_renk := 'KIRMIZI';
        v_mesaj := 'Son 24 saatte '||v_son24||' cokme ('||v_kisi||' kisi) - normalin '
                   ||v_esik||' ustunde, muhtemelen yeni bir surum bozdu';
      END IF;

      INSERT INTO public.sistem_saglik_kayitlari(calisma_at,kontrol_id,yapi_tasi,durum,olculen,beklenen,mesaj)
      VALUES (v_calisma,'K-COKME-1','B17 GORUNURLUK',v_renk,v_son24,v_esik::text,v_mesaj);

      IF    v_renk='YESIL' THEN v_yesil   := v_yesil + 1;
      ELSIF v_renk='SARI'  THEN v_sari    := v_sari + 1;
      ELSE                      v_kirmizi := v_kirmizi + 1;
      END IF;
    END;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.sistem_saglik_kayitlari(calisma_at,kontrol_id,yapi_tasi,durum,beklenen,mesaj)
    VALUES (v_calisma,'K-COKME-1','B17 GORUNURLUK','OLCULEMEDI','0','Kontrol calistirilamadi: '||SQLERRM);
    v_kirmizi := v_kirmizi + 1;
  END;

  -- 30 gunden eski kayitlari temizle (K-11.5: 30 gunluk gecmis)
  DELETE FROM public.sistem_saglik_kayitlari WHERE calisma_at < now() - interval '30 days';

  v_sonuc := jsonb_build_object(
    'calisma_at', v_calisma,
    'yesil', v_yesil, 'sari', v_sari, 'kirmizi', v_kirmizi,
    'genel_durum', CASE WHEN v_kirmizi>0 THEN 'KIRMIZI' WHEN v_sari>0 THEN 'SARI' ELSE 'YESIL' END
  );
  RETURN v_sonuc;
END;
$function$;
