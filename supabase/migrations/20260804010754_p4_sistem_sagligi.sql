-- ════════════════════════════════════════════════════════════════════════════
-- [P-4 / K-11.4] SİSTEM SAĞLIĞI DENETİMİ — tablo + denetçi + günlük iş
-- ────────────────────────────────────────────────────────────────────────────
-- Bu dosya canlıda AYRI AYRI uygulanan dört adımı tek yerde toplar:
--   p4_sistem_sagligi_denetimi · p4_sistem_saglik_calistir
--   p4_saglik_kendini_sayma_duzeltmesi · p4_saglik_gunluk_cron
-- Sonuç şema canlıyla işlevsel olarak BİREBİR aynıdır.
--
-- ⚠️ TEK FARK (bilerek bırakıldı): canlıdaki denetçi gövdesinde, ilk yazımdan
-- kalan İKİ KULLANILMAYAN değişken tanımı var (`PROCEDURE_yok`, `FUNCTION_yok`).
-- Bu dosya onlarsız yazıldı. Davranış birebir aynı; yalnız kaynak metni farklı.
-- Veritabanı sıfırdan kurulursa bu dosyanın (temiz) hâli geçerli olur.
--
-- NEDEN VAR: Sistem her gece kendini denetler; sonuç admin panelindeki
-- "Sistem Sağlığı" bölümüne yazılır (Komuta Merkezi içinde — kurucu kararı S-4=a).
-- Kurucu kararı S-2=b: e-posta YOK, alarm yalnız panelde görünür.
-- Kural K-11.3: "kontrol edilemedi" KIRMIZI sayılır, "sorun yok" sayılmaz.
-- Kural (Çakışma-2 / P-3): para kontrolleri DEMO HARİÇ çalışır.
--
-- DENETÇİ İLK ÇALIŞMASINDA KENDİ HATASINI YAKALADI: K-KIMLIK-1 hayalet durum
-- kelimelerini ararken kendi gövdesinde arama metni olarak geçen kelimeleri
-- bulup yanlış alarm verdi. Aşağıdaki `p.proname <> 'sistem_saglik_calistir'`
-- satırı o düzeltmedir.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1) Sonuç tablosu (30 günlük geçmiş — kurucu kararı S-5=a) ──────────────
CREATE TABLE IF NOT EXISTS public.sistem_saglik_kayitlari (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  calisma_at   timestamptz NOT NULL DEFAULT now(),
  kontrol_id   text        NOT NULL,
  yapi_tasi    text        NOT NULL,
  durum        text        NOT NULL CHECK (durum IN ('YESIL','SARI','KIRMIZI','OLCULEMEDI')),
  olculen      numeric,
  beklenen     text,
  mesaj        text
);

CREATE INDEX IF NOT EXISTS idx_saglik_calisma  ON public.sistem_saglik_kayitlari(calisma_at DESC);
CREATE INDEX IF NOT EXISTS idx_saglik_kontrol  ON public.sistem_saglik_kayitlari(kontrol_id, calisma_at DESC);

ALTER TABLE public.sistem_saglik_kayitlari ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sistem_saglik_kayitlari FROM anon, authenticated;

DROP POLICY IF EXISTS saglik_admin_okur ON public.sistem_saglik_kayitlari;
CREATE POLICY saglik_admin_okur ON public.sistem_saglik_kayitlari
  FOR SELECT TO authenticated USING (public.is_admin());
GRANT SELECT ON public.sistem_saglik_kayitlari TO authenticated;

COMMENT ON TABLE public.sistem_saglik_kayitlari IS
  'P-4: Gunluk sistem sagligi denetiminin sonuclari. 30 gunluk gecmis (K-11.5). Yalniz admin okur.';

-- ── 2) Denetçi ────────────────────────────────────────────────────────────
-- Her kontrol AYRI BEGIN/EXCEPTION bloğunda; biri patlarsa diğerleri ölçülür.
CREATE OR REPLACE FUNCTION public.sistem_saglik_calistir()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp', 'extensions'
AS $function$
DECLARE
  v_calisma timestamptz := now();
  v_kirmizi int := 0;
  v_sari    int := 0;
  v_yesil   int := 0;
BEGIN
  -- K-PARA-1 · Para degismezleri
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

  -- K-PARA-2 · Askida odeme (DEMO HARIC)
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

  -- K-ZAMAN-1 · Mac saatleri tutarli mi
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

  -- K-REZ-1 · Cifte rezervasyon kisiti yerinde mi
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

  -- K-KAPI-3 · search_path sabit mi
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

  -- K-BILDIRIM-1 · Disari giden cagrilar basarili mi
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

  -- K-AYAR-1 · Zorunlu ayarlar dolu mu (3 Agu 2026 arizasinin kok nedeni)
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

  -- K-OTO-1 · Beklenen cron isleri kurulu mu
  BEGIN
    DECLARE v_eksik text := '';
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname='sweep_stale_payments' AND active)
        THEN v_eksik := v_eksik || 'sweep_stale_payments '; END IF;
      IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname='auto_process_matches' AND active)
        THEN v_eksik := v_eksik || 'auto_process_matches '; END IF;
      IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname='send_match_reminders' AND active)
        THEN v_eksik := v_eksik || 'send_match_reminders '; END IF;
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

  -- K-OTO-2 · Zehirli (takilmis) mac var mi
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

  -- K-KIMLIK-1 · Hesap silme kapisi gercek sozlugu kullaniyor mu
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

  -- K-KADRO-1 · Odeme yapan herkes bildirim listesinde mi
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

  -- K-DEMO-1 · Demo veri gercek parayla karisiyor mu
  BEGIN
    DECLARE v_karisik int;
    BEGIN
      SELECT count(*) INTO v_karisik FROM public.payment_intents pi
      WHERE NOT pi.is_demo AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=pi.user_id AND p.is_demo);
      INSERT INTO public.sistem_saglik_kayitlari(calisma_at,kontrol_id,yapi_tasi,durum,olculen,beklenen,mesaj)
      VALUES (v_calisma,'K-DEMO-1','B12 DEMO',CASE WHEN v_karisik=0 THEN 'YESIL' ELSE 'KIRMIZI' END,v_karisik,'0',
              CASE WHEN v_karisik=0 THEN 'Demo ve gercek para ayri' ELSE v_karisik||' demo odeme gercek olarak isaretli' END);
      IF v_karisik=0 THEN v_yesil:=v_yesil+1; ELSE v_kirmizi:=v_kirmizi+1; END IF;
    END;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.sistem_saglik_kayitlari(calisma_at,kontrol_id,yapi_tasi,durum,beklenen,mesaj)
    VALUES (v_calisma,'K-DEMO-1','B12 DEMO','OLCULEMEDI','0','Kontrol calistirilamadi: '||SQLERRM);
    v_kirmizi := v_kirmizi + 1;
  END;

  -- 30 gunden eski kayitlari temizle (K-11.5)
  DELETE FROM public.sistem_saglik_kayitlari WHERE calisma_at < now() - interval '30 days';

  RETURN jsonb_build_object(
    'calisma_at', v_calisma,
    'yesil', v_yesil, 'sari', v_sari, 'kirmizi', v_kirmizi,
    'genel_durum', CASE WHEN v_kirmizi>0 THEN 'KIRMIZI' WHEN v_sari>0 THEN 'SARI' ELSE 'YESIL' END
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.sistem_saglik_calistir() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.sistem_saglik_calistir() IS
  'P-4: Gunluk sistem sagligi denetimi. Her kontrol AYRI hata yakalar; "olculemedi" KIRMIZI sayilir (K-11.3). Para kontrolleri demo haric.';

-- ── 3) Panelin okuduğu özet ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sistem_saglik_ozet()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_son timestamptz; v_sonuc jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: Bu ekran yalniz admin icindir.';
  END IF;

  SELECT max(calisma_at) INTO v_son FROM public.sistem_saglik_kayitlari;
  IF v_son IS NULL THEN
    RETURN jsonb_build_object('hic_calismadi', true);
  END IF;

  SELECT jsonb_build_object(
    'son_calisma', v_son,
    'genel_durum', CASE
      WHEN count(*) FILTER (WHERE durum IN ('KIRMIZI','OLCULEMEDI')) > 0 THEN 'KIRMIZI'
      WHEN count(*) FILTER (WHERE durum='SARI') > 0 THEN 'SARI' ELSE 'YESIL' END,
    'yesil',   count(*) FILTER (WHERE durum='YESIL'),
    'sari',    count(*) FILTER (WHERE durum='SARI'),
    'kirmizi', count(*) FILTER (WHERE durum IN ('KIRMIZI','OLCULEMEDI')),
    'kontroller', jsonb_agg(jsonb_build_object(
        'kontrol_id', kontrol_id, 'yapi_tasi', yapi_tasi,
        'durum', durum, 'olculen', olculen, 'mesaj', mesaj)
      ORDER BY CASE durum WHEN 'KIRMIZI' THEN 0 WHEN 'OLCULEMEDI' THEN 1 WHEN 'SARI' THEN 2 ELSE 3 END, kontrol_id),
    'gecmis_30_gun', (
      SELECT jsonb_agg(g ORDER BY g->>'gun' DESC) FROM (
        SELECT jsonb_build_object(
          'gun', to_char(calisma_at AT TIME ZONE 'Europe/Istanbul','YYYY-MM-DD'),
          'kirmizi', count(*) FILTER (WHERE durum IN ('KIRMIZI','OLCULEMEDI'))) AS g
        FROM public.sistem_saglik_kayitlari
        WHERE calisma_at > now() - interval '30 days'
        GROUP BY 1) t)
  ) INTO v_sonuc
  FROM public.sistem_saglik_kayitlari WHERE calisma_at = v_son;

  RETURN v_sonuc;
END;
$function$;

REVOKE ALL ON FUNCTION public.sistem_saglik_ozet() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sistem_saglik_ozet() TO authenticated;

COMMENT ON FUNCTION public.sistem_saglik_ozet() IS
  'P-4/K-11.4: Admin panelindeki Sistem Sagligi bolumunun okudugu ozet. Son calisma + 30 gunluk gecmis.';

-- ── 4) Günlük iş: 03:40 UTC = 06:40 İstanbul ──────────────────────────────
DO $do$
BEGIN
  PERFORM cron.unschedule('sistem_saglik_gunluk')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='sistem_saglik_gunluk');

  PERFORM cron.schedule('sistem_saglik_gunluk', '40 3 * * *',
    'SELECT public.sistem_saglik_calistir();');
END $do$;

-- ════════════════════════════════════════════════════════════════════════════
-- GERİ ALMA:
--   SELECT cron.unschedule('sistem_saglik_gunluk');
--   DROP FUNCTION IF EXISTS public.sistem_saglik_ozet();
--   DROP FUNCTION IF EXISTS public.sistem_saglik_calistir();
--   DROP TABLE IF EXISTS public.sistem_saglik_kayitlari;
-- ════════════════════════════════════════════════════════════════════════════
