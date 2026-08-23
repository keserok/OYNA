-- ════════════════════════════════════════════════════════════════════════════
-- ÖDEME KAPATILDI + İNCELEMECİ KAPISI SÖKÜLDÜ (23 Ağustos 2026, kurucu kararı)
-- ----------------------------------------------------------------------------
-- Bu göç Apple'ın 5.6 reddinden sonraki iki ağır bulguyu kapatır. İkisi de
-- SUNUCUDAYDI; yeni bir paket göndermek onları düzeltmiyordu.
--
-- ── BULGU 1 · SUNUCU ÇAĞIRANA GÖRE FARKLI CEVAP VERİYORDU ───────────────────
-- `get_nearby_providers` gövdesinde şu koşul duruyordu:
--     (isDemo = false AND is_demo = false) OR public._cagiran_demo_mu()
-- Yani kaleci/hakem vitrini, ÇAĞIRANIN KİM OLDUĞUNA göre farklı cevap
-- veriyordu. 23 Ağustos'ta canlıda ölçüldü — aynı fonksiyon, aynı koordinat,
-- aynı an:
--     demo hesapla    → kaleci 4 · hakem 3
--     gerçek hesapla  → kaleci 0 · hakem 0
-- Apple'ın ret cümlesi buydu: "features that appear to have been intentionally
-- hidden during the review process." Bu, o cümlenin birebir karşılığıdır ve
-- üstelik tersindendir: özellik incelemeciye KAPALI, demo hesaba AÇIK.
--
-- DEPO ZATEN BUNU İSTEMİYORDU: en yeni tanım (20260905000012) kapıyı
-- içermiyor ve o göç canlıda "uygulandı" olarak kayıtlı. Kapı, deftere
-- yazılmayan doğrudan bir SQL çalıştırmasıyla geri gelmiş. Bu yüzden bu göç
-- fonksiyonu YENİDEN yazar ve `_cagiran_demo_mu`yu tümüyle DÜŞÜRÜR — bir daha
-- çağrılabilecek bir şey kalmasın.
--
-- SONUÇ: vitrin herkes için AYNI. Bugün onaylı 7 sağlayıcının 7'si de demo
-- olduğu için vitrin herkes için BOŞ görünecek. Bu kasıtlıdır: kurucu kararı
-- "Ordu'da gerçek kaleci/hakem kaydedelim" yönünde; boş vitrin, sahte vitrinden
-- ve gizli kapıdan iyidir.
--
-- ── BULGU 2 · ÖDEME EKRANI GERÇEKLEŞMEYEN TAHSİLAT VAAT EDİYORDU ────────────
-- Canlı ayar: payment_provider=SIMULATION, simulation_counts_as_live=true,
-- payment_mode_global=ONLINE_ONLY, 6/6 tesis ONLINE_ONLY.
-- Ekranın yazdığı cümle: "Yukarıdaki tutarın tamamı seçtiğin karttan tek
-- seferde tahsil edilir." Gerçekte hiçbir kart çekilmiyor ve HER kart numarası
-- kabul ediliyor. İki ihlal birden: yanıltıcı davranış (5.6) ve yanlış beyanla
-- kart verisi toplama (2.3.1).
--
-- ÇÖZÜM KODDA ZATEN VARDI. `resolve_payment_mode` şunu yapıyor:
--     provider_live := (provider <> 'DISABLED'
--                       AND (provider <> 'SIMULATION' OR sim_canli))
--     IF NOT provider_live THEN → CASH_ONLY, sebep PROVIDER_NOT_LIVE
-- Yani `simulation_counts_as_live` kapanır kapanmaz TÜM platform "sahada
-- ödeme"ye düşer, kart adımı hiç çizilmez (PaymentScreen · cashBooking dalı
-- cardAmount:0 döndürür) ve kullanıcıya gösterilecek cümle de yazılıdır:
-- "Ödeme altyapısı henüz canlıya alınmadı; şu an tüm tesislerde yalnızca
-- sahada ödeme geçerli."
--
-- Üç anahtar birden yazılır. Birincisi tek başına yeterlidir; ötekiler NİYETİ
-- yapılandırmada açık bırakmak içindir — bu proje tam da örtük niyetlerden
-- zarar gördü.
--
-- iyzico canlıya alındığı gün geri açılacak sıra: önce sandbox testi, sonra
-- production anahtarları, sonra bir gerçek işlem + iade, EN SON
-- payment_mode_global=ONLINE_ONLY.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1) ÖDEME ANAHTARLARI ────────────────────────────────────────────────────
UPDATE public.app_config SET value = 'false'::jsonb
 WHERE key = 'simulation_counts_as_live';

UPDATE public.app_config SET value = 'false'::jsonb
 WHERE key = 'match_deposit_enabled';

UPDATE public.app_config SET value = '"CASH_ONLY"'::jsonb
 WHERE key = 'payment_mode_global';

-- ── 2) İNCELEMECİ KAPISI ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_nearby_providers(
  p_lat double precision,
  p_lon double precision,
  p_radius_km double precision DEFAULT 25,
  p_type text DEFAULT 'GK'::text
)
RETURNS TABLE(id uuid, distance_km double precision)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp', 'extensions'
AS $fn$
  SELECT g.id,
         earth_distance(
           ll_to_earth(p_lat, p_lon),
           ll_to_earth((g.coordinates->>'lat')::double precision, (g.coordinates->>'lng')::double precision)
         ) / 1000.0 AS distance_km
  FROM public.goalkeepers g
  JOIN public.profiles p ON p.id = g.id
  WHERE p_type = 'GK'
    AND p.verification_status = 'approved'
    AND COALESCE(p.is_available, true) = true
    -- ÇAĞIRANA BAKILMAZ. Demo sağlayıcı HİÇ KİMSEYE görünmez.
    AND COALESCE(g."isDemo", false) = false
    AND COALESCE(p.is_demo, false) = false
    AND g.coordinates IS NOT NULL
    AND (g.coordinates->>'lat') IS NOT NULL AND (g.coordinates->>'lng') IS NOT NULL
    AND earth_distance(
          ll_to_earth(p_lat, p_lon),
          ll_to_earth((g.coordinates->>'lat')::double precision, (g.coordinates->>'lng')::double precision)
        ) <= p_radius_km * 1000.0

  UNION ALL

  SELECT r.id,
         earth_distance(
           ll_to_earth(p_lat, p_lon),
           ll_to_earth((r.coordinates->>'lat')::double precision, (r.coordinates->>'lng')::double precision)
         ) / 1000.0 AS distance_km
  FROM public.referees r
  JOIN public.profiles p ON p.id = r.id
  WHERE p_type = 'REF'
    AND p.verification_status = 'approved'
    AND COALESCE(p.is_available, true) = true
    AND COALESCE(r."isDemo", false) = false
    AND COALESCE(p.is_demo, false) = false
    AND r.coordinates IS NOT NULL
    AND (r.coordinates->>'lat') IS NOT NULL AND (r.coordinates->>'lng') IS NOT NULL
    AND earth_distance(
          ll_to_earth(p_lat, p_lon),
          ll_to_earth((r.coordinates->>'lat')::double precision, (r.coordinates->>'lng')::double precision)
        ) <= p_radius_km * 1000.0

  ORDER BY 2 ASC;
$fn$;

-- Kapının kendisi düşürülür: çağıracak bir şey kalmasın.
DROP FUNCTION IF EXISTS public._cagiran_demo_mu();

-- ── 3) KENDİNİ DOĞRULAMA ────────────────────────────────────────────────────
-- Göç, düzelttiğini iddia ettiği şeyi KANITLAMADAN bitmez.
DO $dogrula$
DECLARE
  v_kaynak text;
  v_sim    boolean;
  v_kapora boolean;
  v_mod    text;
BEGIN
  -- (a) Kapı gerçekten yok mu?
  SELECT prosrc INTO v_kaynak FROM pg_proc
   WHERE pronamespace = 'public'::regnamespace AND proname = 'get_nearby_providers';
  IF v_kaynak ILIKE '%_cagiran_demo_mu%' THEN
    RAISE EXCEPTION 'DOGRULAMA: get_nearby_providers hâlâ çağıran-bağımlı kapı taşıyor';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc
              WHERE pronamespace='public'::regnamespace AND proname='_cagiran_demo_mu') THEN
    RAISE EXCEPTION 'DOGRULAMA: _cagiran_demo_mu düşürülemedi';
  END IF;

  -- (b) Hiçbir fonksiyon/politika/görünüm artık bu deseni taşımamalı.
  IF EXISTS (SELECT 1 FROM pg_proc
              WHERE pronamespace='public'::regnamespace AND prosrc ILIKE '%_cagiran_demo_mu%') THEN
    RAISE EXCEPTION 'DOGRULAMA: başka bir fonksiyon hâlâ kapıyı çağırıyor';
  END IF;

  -- (c) Ödeme anahtarları kapandı mı?
  SELECT (value)::text::boolean INTO v_sim    FROM public.app_config WHERE key='simulation_counts_as_live';
  SELECT (value)::text::boolean INTO v_kapora FROM public.app_config WHERE key='match_deposit_enabled';
  SELECT (value #>> '{}')       INTO v_mod    FROM public.app_config WHERE key='payment_mode_global';
  IF COALESCE(v_sim, true) THEN
    RAISE EXCEPTION 'DOGRULAMA: simulation_counts_as_live hâlâ açık';
  END IF;
  IF COALESCE(v_kapora, true) THEN
    RAISE EXCEPTION 'DOGRULAMA: match_deposit_enabled hâlâ açık';
  END IF;
  IF COALESCE(v_mod,'') <> 'CASH_ONLY' THEN
    RAISE EXCEPTION 'DOGRULAMA: payment_mode_global CASH_ONLY değil (%)', v_mod;
  END IF;

  -- (d) Etkin ödeme modu gerçekten sahada ödeme mi?
  IF (public.resolve_payment_mode(NULL) ->> 'effective_mode') <> 'CASH_ONLY' THEN
    RAISE EXCEPTION 'DOGRULAMA: resolve_payment_mode hâlâ CASH_ONLY dışında bir mod döndürüyor';
  END IF;
END;
$dogrula$;
