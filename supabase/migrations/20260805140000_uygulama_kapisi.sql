-- ════════════════════════════════════════════════════════════════════════════
-- UYGULAMA KAPISI — bakım modu + zorunlu güncelleme
-- ────────────────────────────────────────────────────────────────────────────
-- SORUN: Bozuk bir sürüm yayınlanırsa onu durduracak HİÇBİR ARAÇ yoktu.
--   • Yönetim panelindeki "Bakım Modu" anahtarı vardı ama kullanıcı uygulaması
--     onu HİÇ OKUMUYORDU — açsan da hiçbir şey olmuyordu.
--   • "Kayıt açık/kapalı" anahtarı da aynı durumdaydı.
--   • Zorunlu güncelleme kapısı HİÇ YOKTU.
-- Mobil, geri alınamayan tek platformdur: bozuk sürüm, her kullanıcı tek tek
-- güncelleyene kadar telefonunda durur. Mağazaya yeni sürüm göndermek 1-3 gün.
--
-- KURUCU KARARLARI (5 Ağustos 2026):
--   1A · Bakım modu = TAM KİLİT. Uygulama açılır açılmaz bekleme ekranı gelir.
--   2A · Güncelleme = İKİ KADEME. "Önerilen sürüm"in altı → kapatılabilir
--        şerit. "En düşük sürüm"ün altı → kapatılamaz Güncelle ekranı.
--   3  · Güncelleme ekranında mağaza düğmesi + destek bağlantısı bulunur.
--   4  · Frenler HERKESE uygulanır (oyuncu · tesis sahibi · kaleci/hakem).
--
-- ── EN ÖNEMLİ TASARIM KURALI: KAPI AÇIK ARIZALANIR ────────────────────────
-- Bu kapı çalışmazsa (sunucu ulaşılamaz, sorgu patlar, ağ yok) uygulama
-- NORMAL AÇILIR. Aksi hâlde tek bir Supabase kesintisi = bütün kullanıcılar
-- kilitli. Kilit yalnız "sunucu AÇIKÇA kilitle dedi" durumunda kapanır.
--
-- ── YÖNETİM PANELİ KİLİTLENMEZ ────────────────────────────────────────────
-- Kapı yalnız kullanıcı uygulamasına takılır. Panel ayrı bir giriştir; bakım
-- modunu açan kişi onu KAPATABİLMELİ. Kendini dışarıda bırakan bir anahtar,
-- anahtar değildir.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1) AYAR ALANLARI ────────────────────────────────────────────────────────
-- Var olan `settings` tablosuna eklenir: bakım anahtarı ve zamanlı bakım
-- penceresi ZATEN orada (maintenanceMode / maintenanceStartsAt / EndsAt).
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS "minSupportedVersion" text,
  ADD COLUMN IF NOT EXISTS "recommendedVersion"  text,
  ADD COLUMN IF NOT EXISTS "maintenanceMessage"  text,
  ADD COLUMN IF NOT EXISTS "updateMessage"       text;

COMMENT ON COLUMN public.settings."minSupportedVersion" IS
  'Bu surumun ALTINDAKI uygulamalar kapatilamaz "Guncelle" ekrani gorur. Bos = kapi kapali.';
COMMENT ON COLUMN public.settings."recommendedVersion" IS
  'Bu surumun altindakiler kapatilabilir "yeni surum var" seridi gorur. Bos = serit cikmaz.';
COMMENT ON COLUMN public.settings."maintenanceMessage" IS
  'Bakim ekraninda gosterilen kisa cumle. Bos ise genel metin kullanilir.';
COMMENT ON COLUMN public.settings."updateMessage" IS
  'Guncelleme ekraninda gosterilen kisa cumle ("Odemede bir sorun duzeltildi").';

-- ── 2) SÜRÜM KARŞILAŞTIRMA ──────────────────────────────────────────────────
-- "3.0.10" > "3.0.9" olmalı. Düz metin karşılaştırması bunu YANLIŞ yapar
-- ('3.0.10' < '3.0.9' çıkar) — bu yüzden parça parça sayısal karşılaştırılır.
-- Bozuk/eksik girdi 0 sayılır: sürüm okunamıyorsa kimse kilitlenmez.
CREATE OR REPLACE FUNCTION public.surum_kucuk_mu(p_surum text, p_esik text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  a int[]; b int[]; i int; x int; y int;
BEGIN
  IF p_esik IS NULL OR btrim(p_esik) = '' THEN RETURN false; END IF;
  IF p_surum IS NULL OR btrim(p_surum) = '' THEN RETURN false; END IF;

  -- OKUNAMAYAN SÜRÜM KİLİTLEMEZ.
  -- İlk yazımda bu satır yoktu ve canlıda yakalandı: 'bozuk' gibi rakamsız bir
  -- metin, rakamları silinince boş kalıyor, boş da 0 sayılıyor ve "0 < 3" =
  -- true çıkıyordu. Yani sürüm bilgisi bir şekilde bozulan HER kullanıcı
  -- zorunlu güncelleme ekranına düşerdi — kapının yapmaması gereken tek şey.
  -- Karşılaştırılamayan sürüm artık "eşiğin üstünde" sayılır.
  IF p_surum !~ '\d' OR p_esik !~ '\d' THEN RETURN false; END IF;

  SELECT array_agg(COALESCE(NULLIF(regexp_replace(t, '\D', '', 'g'), '')::int, 0))
    INTO a FROM unnest(string_to_array(split_part(p_surum, '-', 1), '.')) AS t;
  SELECT array_agg(COALESCE(NULLIF(regexp_replace(t, '\D', '', 'g'), '')::int, 0))
    INTO b FROM unnest(string_to_array(split_part(p_esik,  '-', 1), '.')) AS t;

  FOR i IN 1..GREATEST(COALESCE(array_length(a,1),0), COALESCE(array_length(b,1),0)) LOOP
    x := COALESCE(a[i], 0);
    y := COALESCE(b[i], 0);
    IF x < y THEN RETURN true;  END IF;
    IF x > y THEN RETURN false; END IF;
  END LOOP;
  RETURN false;   -- esit
EXCEPTION WHEN OTHERS THEN
  -- Karsilastirma patlarsa KIMSE kilitlenmez.
  RETURN false;
END;
$function$;

REVOKE ALL ON FUNCTION public.surum_kucuk_mu(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.surum_kucuk_mu(text,text) TO anon, authenticated;

COMMENT ON FUNCTION public.surum_kucuk_mu(text,text) IS
  'Surum karsilastirmasi (3.0.10 > 3.0.9). Bozuk girdide false doner — kimse kilitlenmez.';

-- ── 3) KAPI — uygulamanın açılışta sorduğu TEK soru ─────────────────────────
-- Oturum GEREKTİRMEZ: kapı giriş ekranından ÖNCE sorulmalı. `anon`'a açıktır
-- ve yalnız açık bilgi döner (bakım durumu + sürüm eşikleri + metinler).
CREATE OR REPLACE FUNCTION public.uygulama_kapisi(p_surum text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  s public.settings%ROWTYPE;
BEGIN
  SELECT * INTO s FROM public.settings WHERE id = 'main';

  RETURN jsonb_build_object(
    -- Bakım: elle açılan anahtar VEYA planlanmış pencere (var olan kural).
    'bakim',              COALESCE(public.is_maintenance_active(), false),
    'bakim_mesaj',        NULLIF(btrim(COALESCE(s."maintenanceMessage", '')), ''),
    'bakim_bitis',        s."maintenanceEndsAt",
    -- Güncelleme iki kademe. Eşik boşsa o kademe KAPALIDIR.
    'zorunlu_guncelleme', public.surum_kucuk_mu(p_surum, s."minSupportedVersion"),
    'onerilen_guncelleme',public.surum_kucuk_mu(p_surum, s."recommendedVersion"),
    'en_dusuk_surum',     NULLIF(btrim(COALESCE(s."minSupportedVersion", '')), ''),
    'onerilen_surum',     NULLIF(btrim(COALESCE(s."recommendedVersion", '')), ''),
    'guncelleme_mesaj',   NULLIF(btrim(COALESCE(s."updateMessage", '')), ''),
    -- Kayıt kapalıysa uygulama yeni kayıt ekranını göstermez (var olan anahtar).
    'kayit_acik',         COALESCE(public.is_registration_open(), true),
    'destek',             'destek@oyna.app'
  );
EXCEPTION WHEN OTHERS THEN
  -- KAPI AÇIK ARIZALANIR: sorgu patlarsa uygulama normal açılır.
  RETURN jsonb_build_object(
    'bakim', false, 'zorunlu_guncelleme', false, 'onerilen_guncelleme', false,
    'kayit_acik', true, 'destek', 'destek@oyna.app', 'hata', true
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.uygulama_kapisi(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.uygulama_kapisi(text) TO anon, authenticated;

COMMENT ON FUNCTION public.uygulama_kapisi(text) IS
  'Acilis kapisi: bakim modu + surum esikleri + kayit durumu. Oturum gerektirmez. Hata halinde ACIK doner.';

-- ── 4) P-0 · KAPININ KENDİ DENETİMİ ────────────────────────────────────────
-- Bu korumanın sessiz bozulma yolu: bakım açık kalır ve kimse fark etmez —
-- uygulama günlerce kapalı durur, kurucu "kullanıcı gelmiyor" sanır.
-- Panel bu fonksiyonu okuyup uyarı gösterir.
CREATE OR REPLACE FUNCTION public.kapi_sagligi()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  s public.settings%ROWTYPE;
  v_bakim boolean;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Yetkisiz' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO s FROM public.settings WHERE id = 'main';
  v_bakim := COALESCE(public.is_maintenance_active(), false);

  RETURN jsonb_build_object(
    'bakim_acik',        v_bakim,
    'bakim_bitis',       s."maintenanceEndsAt",
    -- Süresiz bakım TEHLİKELİDİR: bitiş saati yoksa kapatmayı unutmak kolaydır.
    'bakim_suresiz',     (v_bakim AND s."maintenanceEndsAt" IS NULL),
    'kayit_kapali',      NOT COALESCE(public.is_registration_open(), true),
    'en_dusuk_surum',    NULLIF(btrim(COALESCE(s."minSupportedVersion", '')), ''),
    'onerilen_surum',    NULLIF(btrim(COALESCE(s."recommendedVersion", '')), ''),
    -- Eşik, yayındaki sürümün İLERİSİNDEyse HERKESİ kilitlersin.
    'esik_tutarsiz',     (NULLIF(btrim(COALESCE(s."minSupportedVersion", '')), '') IS NOT NULL
                          AND NULLIF(btrim(COALESCE(s."recommendedVersion", '')), '') IS NOT NULL
                          AND public.surum_kucuk_mu(s."recommendedVersion", s."minSupportedVersion"))
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.kapi_sagligi() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kapi_sagligi() TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- GERİ ALMA:
--   DROP FUNCTION IF EXISTS public.kapi_sagligi();
--   DROP FUNCTION IF EXISTS public.uygulama_kapisi(text);
--   DROP FUNCTION IF EXISTS public.surum_kucuk_mu(text,text);
--   ALTER TABLE public.settings
--     DROP COLUMN IF EXISTS "minSupportedVersion",
--     DROP COLUMN IF EXISTS "recommendedVersion",
--     DROP COLUMN IF EXISTS "maintenanceMessage",
--     DROP COLUMN IF EXISTS "updateMessage";
-- ════════════════════════════════════════════════════════════════════════════
