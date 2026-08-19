-- ════════════════════════════════════════════════════════════════════════════
-- YÖNETİCİ PANELİ: "KİMDEN NE KADAR TAHSİL EDİLDİ" GÖRÜNÜRLÜĞÜ
-- ----------------------------------------------------------------------------
-- KURUCU İSTEĞİ (17 Ağustos 2026): "kartların güvenliğini sağlayan bilgiler,
-- kimden ne kadar para alındığı gibi fonksiyonlar hem admin panelinin kullanıcı
-- arayüzüne hem de finans kısmına eklensin."
--
-- NEDEN GEREKLİ: cüzdan kapandıktan sonra panelde bir kullanıcıya bakınca
-- görülen tek para bilgisi "cüzdan bakiyesi"ydi — ve o değer artık HER ZAMAN 0.
-- Yani panel, para hakkında yalnız anlamsız bir sıfır gösteriyordu. Gerçek soru
-- şu: bu kişiden bugüne dek ne kadar tahsil ettik, ne kadarını iade ettik,
-- hangi kartla ödüyor?
--
-- BU GÖÇ NE YAPAR: tek bir okuma fonksiyonu ekler. Hiçbir tablo, hiçbir yetki
-- ve hiçbir para yolu değişmez; yalnız var olan kayıtlar admin için özetlenir.
--
-- KART GÜVENLİĞİ: kart numarası ve CVV zaten OYNA'da hiç saklanmaz (PAN yalnız
-- ödeme anında iyzico'ya geçer). Bu fonksiyon da yalnız MASKELİ meta döndürür:
-- marka + son 4 hane + son kullanma. Sağlayıcı token'ı (provider_card_token)
-- BİLEREK DIŞARIDA BIRAKILDI — admin panelinde görünmesinin hiçbir faydası
-- yok, sızması hâlinde ise o kartla ödeme alınabilir.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_user_payment_summary(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_collected numeric := 0;   -- tahsil edilen brüt (karttan çekilen toplam)
  v_fees      numeric := 0;   -- bunun içindeki kart işlem bedeli
  v_refunded  numeric := 0;   -- iade edilen
  v_count     integer := 0;   -- başarılı işlem adedi
  v_failed    integer := 0;   -- başarısız deneme adedi (kart reddi vb.)
  v_last      timestamptz;
  v_recent    jsonb;
  v_cards     jsonb;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENT'; END IF;

  SELECT
    COALESCE(SUM(amount)          FILTER (WHERE status IN ('PAID','CAPTURED')), 0),
    COALESCE(SUM(card_fee_amount) FILTER (WHERE status IN ('PAID','CAPTURED')), 0),
    COALESCE(SUM(amount)          FILTER (WHERE status = 'REFUNDED'), 0),
    -- NOT: cast, FILTER'dan SONRA gelmeli. `COUNT(*)::int FILTER (...)` sözdizimi
    -- hatasıdır ve göçü ilk uygulamada durdurur.
    (COUNT(*) FILTER (WHERE status IN ('PAID','CAPTURED')))::int,
    (COUNT(*) FILTER (WHERE status = 'FAILED'))::int,
    MAX(created_at)               FILTER (WHERE status IN ('PAID','CAPTURED'))
  INTO v_collected, v_fees, v_refunded, v_count, v_failed, v_last
  FROM public.payment_intents
  WHERE user_id = p_user_id;

  -- Son 10 hareket. `taban` = karttan çekilenden işlem bedeli düşülmüş hâli;
  -- kullanıcı ekranda tek rakam görür, panel kırılımı burada görür.
  SELECT COALESCE(jsonb_agg(x ORDER BY x.created_at DESC), '[]'::jsonb)
  INTO v_recent
  FROM (
    SELECT
      pi.id,
      pi.amount,
      COALESCE(pi.card_fee_amount, 0)                        AS card_fee,
      round(pi.amount - COALESCE(pi.card_fee_amount, 0), 2)  AS taban,
      pi.status,
      pi.provider,
      pi.related_entity_type,
      pi.created_at,
      p.name AS pitch_name
    FROM public.payment_intents pi
    LEFT JOIN public.pitches p ON p.id = pi.pitch_id
    WHERE pi.user_id = p_user_id
    ORDER BY pi.created_at DESC
    LIMIT 10
  ) x;

  -- Kayıtlı kartlar — YALNIZ maskeli meta. Token asla dönmez.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'brand', c.brand,
           'last4', c.last4,
           'exp_month', c.exp_month,
           'exp_year', c.exp_year,
           'is_default', c.is_default,
           'created_at', c.created_at
         ) ORDER BY c.is_default DESC, c.created_at DESC), '[]'::jsonb)
  INTO v_cards
  FROM public.user_saved_cards c
  WHERE c.user_id = p_user_id;

  RETURN jsonb_build_object(
    'collected',  v_collected,
    'card_fees',  v_fees,
    'net',        round(v_collected - v_fees, 2),
    'refunded',   v_refunded,
    'count',      v_count,
    'failed',     v_failed,
    'last_paid_at', v_last,
    'recent',     v_recent,
    'cards',      v_cards
  );
END;
$$;

-- Yalnız oturumlu admin çağırabilir; iç kontrol is_platform_admin ile.
-- anon KESİNLİKLE dışarıda (prensip 6.3: önce PUBLIC'ten al, sonra ihtiyacı olana ver).
REVOKE ALL ON FUNCTION public.admin_user_payment_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_user_payment_summary(uuid) TO authenticated, service_role;

-- ── Doğrulama (prensip 7.7) ─────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'admin_user_payment_summary'
  ) THEN
    RAISE EXCEPTION 'DOGRULAMA: admin_user_payment_summary kurulmadi';
  END IF;
  IF has_function_privilege('anon', 'public.admin_user_payment_summary(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'DOGRULAMA: anon admin_user_payment_summary calistirabiliyor';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.admin_user_payment_summary(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'DOGRULAMA: authenticated admin_user_payment_summary calistiramiyor';
  END IF;
  -- Token sızıntısı kilidi: fonksiyon gövdesinde provider_card_token GEÇMEMELİ.
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'admin_user_payment_summary'
      AND p.prosrc ILIKE '%provider_card_token%'
  ) THEN
    RAISE EXCEPTION 'DOGRULAMA: ozet fonksiyonu kart tokenina dokunuyor';
  END IF;
END $$;
