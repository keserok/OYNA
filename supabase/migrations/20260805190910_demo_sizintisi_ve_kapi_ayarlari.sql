-- ════════════════════════════════════════════════════════════════════════════
-- AÇIK BIRAKILAN RİSKLERİN KAPATILMASI
-- ────────────────────────────────────────────────────────────────────────────
-- Üç ayrı açık, üçü de bir öncekinin üstüne kuruldu:
--
-- 1) DEMO SIZINTISI (kurul bulgusu STR-1 · K-DEMO-1 eksiği)
--    `profiles.is_demo` bir tetikleyiciyle otomatik doluyor (@oyna.app postası).
--    Ama `matches."isDemo"` böyle bir tetikleyiciye SAHİP DEĞİLDİ: demo bir
--    kullanıcının kurduğu maç "gerçek" görünüyordu. Canlıda ölçüldü: 22 maçın
--    1'i tam olarak bu durumda. Yeni kurulan "başarılı maç" metriği onu GERÇEK
--    sayacaktı — yani kuzey yıldızı ilk günden yalan söyleyecekti.
--
-- 2) BAŞARILI MAÇ SAYISI PANELDE ÖLÜ
--    Panelin "Kuzey Yıldızı" kartı `admin_dashboard_stats`ten `successful_matches`
--    okuyor; o alan canlıda ARTIK DÖNMÜYOR. Kart her zaman 0 gösteriyordu.
--    Kurucunun tanımıyla hesaplanan gerçek sayı geri veriliyor.
--
-- 3) MAĞAZA ADRESLERİ KODA GÖMÜLÜYDÜ
--    Zorunlu güncelleme ekranındaki "Mağazadan güncelle" düğmesi koda gömülü
--    adrese gidiyordu. iOS kimliği App Store Connect'te uygulama açılınca
--    belli olacak — ama o gün gelince adresi düzeltmek için YENİ SÜRÜM
--    yayınlamak gerekirdi. Oysa o ekranı gören kullanıcı zaten güncelleyemiyor.
--    Adres artık panelden ayarlanır.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1) DEMO SIZINTISI ───────────────────────────────────────────────────────
-- Kural: maç, KURUCUSU demo ise demodur. "Bir kez demo, hep demo" — elle
-- true yapılmış bir satır tetikleyici yüzünden false'a DÖNMEZ (seed ile
-- oluşturulan, kurucusu olmayan demo maçlar korunur).
CREATE OR REPLACE FUNCTION public.demo_isareti_mac()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_kurucu_demo boolean;
BEGIN
  SELECT p.is_demo INTO v_kurucu_demo
  FROM public.profiles p
  WHERE p.id = COALESCE(NEW.captain_id, NEW."creatorId");

  NEW."isDemo" := COALESCE(NEW."isDemo", false) OR COALESCE(v_kurucu_demo, false);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- İşaretleme, maç kurmayı ASLA engellemez.
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.demo_isareti_mac() IS
  'K-DEMO-1: mac, kurucusu demo ise demo isaretlenir. Bir kez demo, hep demo.';

DROP TRIGGER IF EXISTS trg_demo_isareti_mac ON public.matches;
CREATE TRIGGER trg_demo_isareti_mac
  BEFORE INSERT OR UPDATE OF captain_id, "creatorId" ON public.matches
  FOR EACH ROW EXECUTE FUNCTION public.demo_isareti_mac();

-- Geçmişi düzelt: kurucusu demo olan ama gerçek görünen maçlar.
UPDATE public.matches m
SET "isDemo" = true
FROM public.profiles p
WHERE p.id = COALESCE(m.captain_id, m."creatorId")
  AND p.is_demo IS TRUE
  AND m."isDemo" IS NOT TRUE;

-- ── 2) BAŞARILI MAÇ — demoya karşı ikinci kat koruma + panele geri bağlama ──
-- `basarili_mac_ozeti` zaten `isDemo` bakıyordu; artık KURUCUYA da bakıyor.
-- Tetikleyici bir gün bozulursa metrik yine de kirlenmesin (P-0).
CREATE OR REPLACE FUNCTION public.basarili_mac_ozeti(
  p_gun  int  DEFAULT 30,
  p_ilce text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_pencere interval := make_interval(days => GREATEST(1, LEAST(COALESCE(p_gun, 30), 365)));
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Yetkisiz' USING ERRCODE = '42501';
  END IF;

  RETURN (
    WITH biten AS (
      SELECT m.id,
             m.status,
             m.cancel_reason,
             COALESCE(m.min_players, 0) AS gereken,
             (SELECT count(*) FROM public.match_participants mp
               WHERE mp.match_id = m.id
                 AND COALESCE(mp.status, 'JOINED') <> 'LEFT'
                 AND mp.is_demo IS NOT TRUE)                       AS katilan,
             (SELECT count(*) FROM public.payment_intents pi
               WHERE pi.match_id = m.id
                 AND pi.status IN ('CAPTURED', 'PAID')
                 AND pi.is_demo IS NOT TRUE)                       AS odenmis,
             (SELECT count(*) FROM public.payment_intents pi
               WHERE pi.match_id = m.id
                 AND pi.status IN ('PENDING', 'BLOCKED', 'FAILED')
                 AND pi.is_demo IS NOT TRUE)                       AS bekleyen
      FROM public.matches m
      WHERE m."isDemo" IS NOT TRUE
        -- İKİNCİ KAT: işaret bozulsa bile demo kurucu sayıma girmez.
        AND NOT EXISTS (
              SELECT 1 FROM public.profiles p
              WHERE p.id = COALESCE(m.captain_id, m."creatorId") AND p.is_demo IS TRUE)
        AND m.starts_at IS NOT NULL
        AND m.starts_at < now()
        AND m.starts_at > now() - v_pencere
        AND (p_ilce IS NULL OR EXISTS (
              SELECT 1 FROM public.pitches p
              WHERE p.id = m.pitch_id AND p.district = p_ilce))
    ),
    etiketli AS (
      SELECT *,
             (cancel_reason IS NULL
              AND status <> 'CANCELLED'
              AND gereken > 0 AND katilan >= gereken
              AND odenmis > 0 AND bekleyen = 0)
             AS basarili
      FROM biten
    )
    SELECT jsonb_build_object(
      'gun',            EXTRACT(epoch FROM v_pencere) / 86400,
      'oynanan',        (SELECT count(*) FROM etiketli),
      'basarili',       (SELECT count(*) FROM etiketli WHERE basarili),
      'iptal',          (SELECT count(*) FROM etiketli WHERE cancel_reason IS NOT NULL OR status = 'CANCELLED'),
      'kadro_dolmadi',  (SELECT count(*) FROM etiketli
                          WHERE NOT basarili AND cancel_reason IS NULL AND status <> 'CANCELLED'
                            AND (gereken = 0 OR katilan < gereken)),
      'para_eksik',     (SELECT count(*) FROM etiketli
                          WHERE NOT basarili AND cancel_reason IS NULL AND status <> 'CANCELLED'
                            AND gereken > 0 AND katilan >= gereken
                            AND (odenmis = 0 OR bekleyen > 0)),
      'oran',           CASE WHEN (SELECT count(*) FROM etiketli) = 0 THEN NULL
                             ELSE round(100.0 * (SELECT count(*) FROM etiketli WHERE basarili)
                                              / (SELECT count(*) FROM etiketli))
                        END
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.basarili_mac_ozeti(int,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.basarili_mac_ozeti(int,text) TO authenticated;

-- ── 3) MAĞAZA ADRESLERİ PANELDEN ───────────────────────────────────────────
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS "storeUrlIos"     text,
  ADD COLUMN IF NOT EXISTS "storeUrlAndroid" text;

COMMENT ON COLUMN public.settings."storeUrlIos" IS
  'App Store adresi. Bos ise uygulamadaki yedek adres kullanilir.';
COMMENT ON COLUMN public.settings."storeUrlAndroid" IS
  'Google Play adresi. Bos ise uygulamadaki yedek adres kullanilir.';

-- Kapı bu adresleri de taşır: güncelleme ekranını gören kullanıcı zaten yeni
-- sürüm indiremez; adres yanlışsa onu düzeltmenin tek yolu sunucudur.
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
    'destek',             'destek@oyna.app'
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'bakim', false, 'zorunlu_guncelleme', false, 'onerilen_guncelleme', false,
    'kayit_acik', true, 'destek', 'destek@oyna.app', 'hata', true
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.uygulama_kapisi(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.uygulama_kapisi(text) TO anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- GERİ ALMA:
--   DROP TRIGGER IF EXISTS trg_demo_isareti_mac ON public.matches;
--   DROP FUNCTION IF EXISTS public.demo_isareti_mac();
--   ALTER TABLE public.settings
--     DROP COLUMN IF EXISTS "storeUrlIos", DROP COLUMN IF EXISTS "storeUrlAndroid";
--   (basarili_mac_ozeti ve uygulama_kapisi bir onceki surumlerine dondurulur.)
-- ════════════════════════════════════════════════════════════════════════════
