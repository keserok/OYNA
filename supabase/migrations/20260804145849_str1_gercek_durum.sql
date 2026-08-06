-- ════════════════════════════════════════════════════════════════════════════
-- [SON-6 / STR-1] "GERÇEK DURUM" — kurucunun baktığı sayılar doğru olsun
-- Kurucu onayı: SON_KARARLAR 29
-- ────────────────────────────────────────────────────────────────────────────
-- SORUN: Panelde okunan üç sayı da yanıltıcıydı:
--   "33 kullanıcı"    → 29'u demo
--   "4 gerçek maç"    → 3'ünü demo kullanıcılar kurmuştu
--   "1.920 ₺ para"    → 2 BAŞARISIZ ödeme denemesi (`status='FAILED'`)
--
-- Bu bir kod hatası değil, **karar hatası** üretir. Yanlış sayıya bakan bir
-- kurucu lansmanı yanlış zamanlar.
--
-- Bu fonksiyon demo ile gerçeği YAN YANA gösterir; hiçbir sayı diğerine
-- karışmaz ve "başarılı ödeme" ile "deneme" ayrı ayrı yazılır.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.gercek_durum()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Yetkisiz' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'kullanici', jsonb_build_object(
      'gercek',      (SELECT count(*) FROM profiles WHERE is_demo IS NOT TRUE),
      'demo',        (SELECT count(*) FROM profiles WHERE is_demo IS TRUE),
      'son30_aktif', (SELECT count(*) FROM profiles
                      WHERE is_demo IS NOT TRUE AND last_active_at > now() - interval '30 days')
    ),
    'mac', jsonb_build_object(
      'gercek',    (SELECT count(*) FROM matches WHERE "isDemo" IS NOT TRUE),
      'demo',      (SELECT count(*) FROM matches WHERE "isDemo" IS TRUE),
      'gelecek',   (SELECT count(*) FROM matches
                    WHERE "isDemo" IS NOT TRUE AND starts_at > now() AND status <> 'CANCELLED')
    ),
    'para', jsonb_build_object(
      -- SADECE gercekten tahsil edilmis para. Deneme/basarisiz AYRI satirda.
      'tahsil_edilen',  (SELECT COALESCE(sum(amount),0) FROM payment_intents
                         WHERE NOT is_demo AND status = 'PAID'),
      'tahsil_adedi',   (SELECT count(*) FROM payment_intents
                         WHERE NOT is_demo AND status = 'PAID'),
      'basarisiz_deneme',(SELECT COALESCE(sum(amount),0) FROM payment_intents
                         WHERE NOT is_demo AND status = 'FAILED'),
      'askida',         (SELECT count(*) FROM payment_intents
                         WHERE NOT is_demo AND status IN ('PENDING','BLOCKED')),
      'demo_hacim',     (SELECT COALESCE(sum(amount),0) FROM payment_intents
                         WHERE is_demo AND status = 'PAID')
    ),
    'saha', jsonb_build_object(
      'toplam',  (SELECT count(*) FROM pitches),
      'yayinda', (SELECT count(*) FROM pitches WHERE COALESCE(is_published,false)),
      'ilce',    (SELECT count(*) FROM region_coverage)
    ),
    'anahtarlar', jsonb_build_object(
      'demo_modu',    COALESCE(public.get_config_text('demo_mode_enabled','?'), '?'),
      'odeme_modu',   COALESCE(public.get_config_text('payment_mode_global','?'), '?'),
      'saglayici',    COALESCE(public.get_config_text('payment_provider','?'), '?')
    ),
    'olcum_at', now()
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.gercek_durum() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gercek_durum() TO authenticated;

COMMENT ON FUNCTION public.gercek_durum() IS
  'STR-1: Demo ile gercek veriyi YAN YANA gosterir. Basarili odeme ile basarisiz deneme ayri satirdadir.';
