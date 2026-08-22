-- ════════════════════════════════════════════════════════════════════════════
-- DESTEK ADRESİ — sunucuda GÖMÜLÜ değil, YAPILANDIRILABİLİR
-- ----------------------------------------------------------------------------
-- KURUCU KARARI (22 Ağustos 2026): destek adresi `destek@oyna.app`ten kurucunun
-- çalışan kişisel adresine çekildi.
--
-- NEDEN: `oyna.app` alan adında posta kutusu yok — o adrese yazan kimseye
-- ulaşamıyordu. Oysa adres üç yerde vaat ediliyor: Topluluk Kuralları m.8
-- (şikâyet yolu), Kullanım Şartları ve bu fonksiyonun döndürdüğü `destek`
-- alanı. App Store Kural 1.2, kullanıcı içeriği barındıran uygulamadan
-- ÇALIŞAN bir iletişim adresi ister ve incelemeci bu adresi deneyebilir.
-- Ulaşılamayan bir adres, hiç olmamasından beterdir.
--
-- NEDEN YAPILANDIRMAYA TAŞINIYOR: adres fonksiyona İKİ kez harfi harfine
-- gömülüydü (normal dönüş + EXCEPTION dalı). Alan adı postası kurulduğunda
-- yeniden göç yazmak gerekecekti ve ikinci kopyayı unutmak kolaydı. Artık
-- `app_config.destek_eposta` okunur; değiştirmek tek satırlık bir UPDATE.
-- Anahtar yoksa ya da boşsa varsayılan devreye girer — fonksiyon hiçbir
-- koşulda boş `destek` döndürmez.
--
-- FONKSİYONUN GERİ KALANI BİREBİR KORUNDU: bakım kapısı
-- (is_maintenance_active), sürüm karşılaştırması (surum_kucuk_mu), settings
-- satırının okunuşu (id = 'main') ve EXCEPTION dalının fail-open davranışı
-- ('hata', true dahil) değiştirilmedi. Bu fonksiyon uygulamanın AÇILIŞ
-- kapısıdır; burada yapılacak bir yan etki uygulamayı kilitler.
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO public.app_config (key, value, value_type, category, label, description, is_public)
VALUES (
  'destek_eposta',
  to_jsonb('mirackeremcuruksulu@gmail.com'::text),
  'text',
  'GENEL',
  'Destek e-posta adresi',
  'Kullanıcıya gösterilen destek/şikâyet adresi. Yasal metinlerdeki adresle AYNI olmalı (Topluluk Kuralları m.8, Kullanım Şartları). Alan adı postası kurulunca buradan değiştirilir.',
  true
)
ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value, updated_at = now();

CREATE OR REPLACE FUNCTION public.uygulama_kapisi(p_surum text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  s public.settings%ROWTYPE;
  -- EXCEPTION dalı da bu değeri kullanır; bu yüzden settings okumasından ÖNCE
  -- doldurulur. Sonrasında doldurulsaydı hata dalında boş kalırdı.
  v_destek text := COALESCE(
    NULLIF(btrim(public.get_config_text('destek_eposta', '')), ''),
    'mirackeremcuruksulu@gmail.com'
  );
BEGIN
  SELECT * INTO s FROM public.settings WHERE id = 'main';

  RETURN jsonb_build_object(
    'bakim',              COALESCE(public.is_maintenance_active(), false),
    'bakim_mesaj',        NULLIF(btrim(COALESCE(s."maintenanceMessage", '')), ''),
    'bakim_bitis',        s."maintenanceEndsAt",
    'zorunlu_guncelleme', public.surum_kucuk_mu(p_surum, s."minSupportedVersion"),
    'onerilen_guncelleme',public.surum_kucuk_mu(p_surum, s."recommendedVersion"),
    'en_dusuk_surum',     NULLIF(btrim(COALESCE(s."minSupportedVersion", '')), ''),
    'onerilen_surum',     NULLIF(btrim(COALESCE(s."recommendedVersion", '')), ''),
    'guncelleme_mesaj',   NULLIF(btrim(COALESCE(s."updateMessage", '')), ''),
    'kayit_acik',         COALESCE(public.is_registration_open(), true),
    'magaza_ios',         NULLIF(btrim(COALESCE(s."storeUrlIos", '')), ''),
    'magaza_android',     NULLIF(btrim(COALESCE(s."storeUrlAndroid", '')), ''),
    'destek',             v_destek
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'bakim', false, 'zorunlu_guncelleme', false, 'onerilen_guncelleme', false,
    'kayit_acik', true, 'destek', v_destek, 'hata', true
  );
END;
$function$;

-- ── Doğrulama (prensip 7.7) ────────────────────────────────────────────────
DO $dog$
DECLARE
  v      jsonb;
  v_bekl text := 'mirackeremcuruksulu@gmail.com';
BEGIN
  v := public.uygulama_kapisi('1.0.0');

  IF v->>'destek' IS DISTINCT FROM v_bekl THEN
    RAISE EXCEPTION 'DOGRULAMA: destek adresi beklenen degil: %', COALESCE(v->>'destek', 'YOK');
  END IF;

  -- Açılış kapısının geri kalanı bozulmamalı: 1.0.0 paketi girebilmeli.
  IF (v->>'kayit_acik')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'DOGRULAMA: kayit_acik bozuldu';
  END IF;
  IF (v->>'zorunlu_guncelleme')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'DOGRULAMA: 1.0.0 paketi zorunlu guncellemeye dusuyor';
  END IF;
  IF v->>'en_dusuk_surum' IS NULL THEN
    RAISE EXCEPTION 'DOGRULAMA: en_dusuk_surum kayboldu (settings okunamiyor)';
  END IF;
  IF v ? 'hata' THEN
    RAISE EXCEPTION 'DOGRULAMA: fonksiyon EXCEPTION daligina dustu';
  END IF;

  -- Eski gomulu adres fonksiyonda HIC kalmamali (iki dal da temiz olmali).
  IF position('destek@oyna.app' in pg_get_functiondef('public.uygulama_kapisi(text)'::regprocedure)) > 0 THEN
    RAISE EXCEPTION 'DOGRULAMA: fonksiyonda hala destek@oyna.app var';
  END IF;

  RAISE NOTICE 'DOGRULAMA TAMAM: destek adresi yapilandirmadan okunuyor (%).', v->>'destek';
END $dog$;
