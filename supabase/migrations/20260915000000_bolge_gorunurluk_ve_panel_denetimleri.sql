-- ════════════════════════════════════════════════════════════════════════════
-- BÖLGE GÖRÜNÜRLÜK KURALLARI + PANEL DENETİM SETİ (20 Ağustos 2026)
-- ----------------------------------------------------------------------------
-- KURUCU İSTEKLERİ:
--   1) "Beşiktaş'taki kullanıcı Sarıyer'deki maçları görsün ama Beylikdüzü'nü
--      görmesin — bu sistemi Bölge Kapsama ekranından kurabilelim."
--      → region_visibility_rules tablosu + admin_set_region_visibility RPC.
--      Kural YOKSA davranış değişmez (mevcut yarıçap keşfi aynen sürer) —
--      sistem ilçe başına isteğe bağlı devreye girer, lansmanı kıramaz.
--   2) "Finans merkezinde ödeme sağlayıcı kuruluşa giden parayı göster."
--      → admin_psp_costs: intent.raw->psp (19 Ağu'dan beri yazılıyor)
--      üzerinden iyzico kesintileri + bizim kart bedeli gelirimiz + fark.
--   3) "Bildirimlerin kullanıcının işlemine göre doğru gittiğinden emin ol."
--      → admin_notification_type_stats: şablon başına GERÇEK gönderim kanıtı.
--   4) "Maç Stüdyosu'na saha müsaitlik kontrolü."
--      → admin_court_slot_check: kort + tarih + saat çakışma listesi.
--   5) "Komisyonun ana uygulamayla bağlantısı mükemmel olsun."
--      → admin_commission_health: _pitch_agreement çözüm sırasının birebir
--      aynısıyla etkin kuralı gösterir + yapılandırma hatalarını yakalar.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1) BÖLGE GÖRÜNÜRLÜK KURALLARI ───────────────────────────────────────────
-- Yön: (city, district)'TEKİ KULLANICI → (visible_city, visible_district)'teki
-- maç/sahaları GÖREBİLİR. Bir ilçe için EN AZ BİR aktif kural varsa izin listesi
-- devrededir (kendi ilçesi her zaman dahildir); hiç kural yoksa kısıt yoktur.
CREATE TABLE IF NOT EXISTS public.region_visibility_rules (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city             text NOT NULL,
  district         text NOT NULL,
  visible_city     text NOT NULL,
  visible_district text NOT NULL,
  is_active        boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_by       uuid REFERENCES public.profiles(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_region_visibility_pair
  ON public.region_visibility_rules (city, district, visible_city, visible_district);
CREATE INDEX IF NOT EXISTS idx_region_visibility_source
  ON public.region_visibility_rules (city, district) WHERE is_active;

ALTER TABLE public.region_visibility_rules ENABLE ROW LEVEL SECURITY;

-- Okuma: uygulama keşif süzgeci için herkes AKTİF kuralları okuyabilir
-- (region_coverage ile aynı desen — kural gizli bilgi değildir).
DROP POLICY IF EXISTS "region_visibility_read" ON public.region_visibility_rules;
CREATE POLICY "region_visibility_read" ON public.region_visibility_rules
  FOR SELECT USING (is_active = true OR public.is_platform_admin());

-- Yazma yolu YOK: tek yazma kapısı audit'li admin_set_region_visibility RPC'si.
-- (Yeni tablolar Data API'ye otomatik açılmaz; SELECT açıkça verilir.)
GRANT SELECT ON public.region_visibility_rules TO anon, authenticated;

-- Kural setini TEK seferde değiştir: kaynağın mevcut kuralları silinir, yenisi
-- yazılır. Boş liste = kural yok = kısıtlama kalkar. Her çağrı denetime düşer.
CREATE OR REPLACE FUNCTION public.admin_set_region_visibility(
  p_city     text,
  p_district text,
  p_visible  jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_city     text := trim(COALESCE(p_city, ''));
  v_district text := trim(COALESCE(p_district, ''));
  v_old      jsonb;
  v_count    integer := 0;
  v_item     jsonb;
  v_vc       text;
  v_vd       text;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF v_city = '' OR v_district = '' THEN RAISE EXCEPTION 'INVALID_ARGUMENT'; END IF;
  IF jsonb_typeof(COALESCE(p_visible, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT' USING HINT = 'p_visible bir dizi olmalı.';
  END IF;
  IF jsonb_array_length(COALESCE(p_visible, '[]'::jsonb)) > 200 THEN
    RAISE EXCEPTION 'TOO_MANY_RULES' USING HINT = 'Bir ilçe için en fazla 200 hedef tanımlanabilir.';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('city', visible_city, 'district', visible_district)), '[]'::jsonb)
  INTO v_old
  FROM public.region_visibility_rules
  WHERE city = v_city AND district = v_district;

  DELETE FROM public.region_visibility_rules
  WHERE city = v_city AND district = v_district;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_visible, '[]'::jsonb)) LOOP
    v_vc := trim(COALESCE(v_item->>'city', ''));
    v_vd := trim(COALESCE(v_item->>'district', ''));
    IF v_vc = '' OR v_vd = '' THEN CONTINUE; END IF;
    -- Kendi ilçesi izin listesine yazılmaz — uygulama onu zaten daima dahil eder.
    IF v_vc = v_city AND v_vd = v_district THEN CONTINUE; END IF;
    INSERT INTO public.region_visibility_rules (city, district, visible_city, visible_district, is_active, updated_by)
    VALUES (v_city, v_district, v_vc, v_vd, true, (SELECT auth.uid()))
    ON CONFLICT (city, district, visible_city, visible_district) DO UPDATE SET is_active = true;
    v_count := v_count + 1;
  END LOOP;

  PERFORM public.log_admin_action(
    'REGION_VISIBILITY_SET', 'region', NULL,
    v_city || ' / ' || v_district,
    jsonb_build_object('visible', v_old),
    jsonb_build_object('visible', COALESCE(p_visible, '[]'::jsonb), 'count', v_count)
  );

  RETURN jsonb_build_object('ok', true, 'count', v_count);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_region_visibility(text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_region_visibility(text, text, jsonb) TO authenticated, service_role;

-- ── 2) KORT MÜSAİTLİK KONTROLÜ (Maç Stüdyosu) ───────────────────────────────
-- Seçilen kort + tarih + saat aralığında çakışan rezervasyon/maç listesi.
-- Yalnız UYARI amaçlıdır: stüdyo kaydı engellemez, admin bilerek üstüne yazabilir.
CREATE OR REPLACE FUNCTION public.admin_court_slot_check(
  p_court_id         uuid,
  p_date             date,
  p_time             text,
  p_duration_minutes int DEFAULT 60,
  p_exclude_match_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_time_norm text;
  v_start     timestamp;
  v_end       timestamp;
  v_conflicts jsonb;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_court_id IS NULL OR p_date IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENT'; END IF;

  v_time_norm := (SELECT (regexp_match(replace(COALESCE(p_time, ''), '.', ':'), '\d{1,2}:\d{2}'))[1]);
  IF v_time_norm IS NULL THEN RAISE EXCEPTION 'INVALID_TIME' USING HINT = 'Saat SS:DD biçiminde olmalı.'; END IF;

  v_start := p_date + (v_time_norm || ':00')::time;
  v_end   := v_start + make_interval(mins => GREATEST(30, LEAST(COALESCE(p_duration_minutes, 60), 300)));

  WITH booking_conflicts AS (
    SELECT
      b.id, b.match_id,
      COALESCE(NULLIF(trim(b.title), ''), b.customer_name, 'Rezervasyon') AS title,
      COALESCE(lower(b.slot_range), b.booking_date + b.start_time)        AS starts,
      COALESCE(upper(b.slot_range), b.booking_date + b.end_time)          AS ends,
      b.status
    FROM public.pitch_bookings b
    WHERE b.court_id = p_court_id
      AND upper(COALESCE(b.status, '')) NOT IN ('CANCELLED', 'REJECTED', 'NO_SHOW')
      AND (p_exclude_match_id IS NULL OR b.match_id IS DISTINCT FROM p_exclude_match_id)
      AND COALESCE(lower(b.slot_range), b.booking_date + b.start_time) < v_end
      AND COALESCE(upper(b.slot_range), b.booking_date + b.end_time)   > v_start
  ),
  match_conflicts AS (
    SELECT m.id, m.title, m.starts_at::timestamp AS starts, m.ends_at::timestamp AS ends, m.status
    FROM public.matches m
    WHERE m.court_id = p_court_id
      AND m.status NOT IN ('CANCELLED', 'COMPLETED')
      AND (p_exclude_match_id IS NULL OR m.id <> p_exclude_match_id)
      AND m.starts_at IS NOT NULL
      AND m.starts_at::timestamp < v_end
      AND COALESCE(m.ends_at::timestamp, m.starts_at::timestamp + interval '60 minutes') > v_start
      -- Rezervasyonu zaten listelenen maçı ikinci kez sayma.
      AND m.id NOT IN (SELECT match_id FROM booking_conflicts WHERE match_id IS NOT NULL)
  )
  SELECT COALESCE(jsonb_agg(x ORDER BY x.starts), '[]'::jsonb) INTO v_conflicts
  FROM (
    SELECT 'BOOKING' AS kind, id, title, starts, ends, status FROM booking_conflicts
    UNION ALL
    SELECT 'MATCH' AS kind, id, title, starts, ends, status FROM match_conflicts
  ) x;

  RETURN jsonb_build_object(
    'available', jsonb_array_length(v_conflicts) = 0,
    'starts', v_start,
    'ends', v_end,
    'conflicts', v_conflicts
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_court_slot_check(uuid, date, text, int, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_court_slot_check(uuid, date, text, int, uuid) TO authenticated, service_role;

-- ── 3) ÖDEME KURULUŞU (PSP) MALİYETİ ────────────────────────────────────────
-- iyzico'nun kestiği tutarlar 19 Ağu 2026'dan beri intent.raw->psp'ye yazılıyor
-- (iyzico-3ds-callback). Bu fonksiyon o kayıtları toplar: kuruluşa giden para,
-- bize kalan net, bizim eklediğimiz kart işlem bedeli ve ikisi arasındaki fark.
-- PSP verisi OLMAYAN eski işlemler ayrıca sayılır — kapsama dürüstçe görünür.
CREATE OR REPLACE FUNCTION public.admin_psp_costs(p_days int DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_since   timestamptz := now() - make_interval(days => GREATEST(1, LEAST(COALESCE(p_days, 30), 365)));
  v_totals  jsonb;
  v_days    jsonb;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  WITH base AS (
    SELECT
      pi.created_at,
      pi.amount,
      COALESCE(pi.card_fee_amount, 0)                                   AS card_fee,
      (pi.raw->'psp'->>'komisyon_oransal')::numeric                     AS psp_oransal,
      (pi.raw->'psp'->>'komisyon_sabit')::numeric                       AS psp_sabit,
      (pi.raw->'psp'->>'net_odenecek')::numeric                         AS psp_net,
      (pi.raw->'psp'->>'cekilen')::numeric                              AS psp_cekilen,
      (pi.raw ? 'psp')                                                  AS has_psp,
      upper(COALESCE(pi.provider, ''))                                  AS provider
    FROM public.payment_intents pi
    WHERE pi.created_at >= v_since
      AND pi.status IN ('PAID', 'CAPTURED', 'REFUNDED')
      AND COALESCE(pi.is_demo, false) = false
  )
  SELECT jsonb_build_object(
    'islem',            COUNT(*),
    'gercek_islem',     COUNT(*) FILTER (WHERE provider = 'IYZICO'),
    'simulasyon_islem', COUNT(*) FILTER (WHERE provider <> 'IYZICO'),
    'psp_verili',       COUNT(*) FILTER (WHERE has_psp),
    'psp_verisiz',      COUNT(*) FILTER (WHERE provider = 'IYZICO' AND NOT has_psp),
    'cekilen',          COALESCE(SUM(COALESCE(psp_cekilen, amount)) FILTER (WHERE provider = 'IYZICO'), 0),
    'psp_kesinti',      COALESCE(SUM(COALESCE(psp_oransal, 0) + COALESCE(psp_sabit, 0)) FILTER (WHERE has_psp), 0),
    'psp_net',          COALESCE(SUM(psp_net) FILTER (WHERE has_psp), 0),
    'kart_bedeli',      COALESCE(SUM(card_fee) FILTER (WHERE provider = 'IYZICO'), 0),
    'fark',             round(
                          COALESCE(SUM(card_fee) FILTER (WHERE has_psp), 0)
                          - COALESCE(SUM(COALESCE(psp_oransal, 0) + COALESCE(psp_sabit, 0)) FILTER (WHERE has_psp), 0)
                        , 2)
  )
  INTO v_totals
  FROM base;

  WITH base AS (
    SELECT
      date_trunc('day', pi.created_at)::date                            AS gun,
      pi.amount,
      COALESCE(pi.card_fee_amount, 0)                                   AS card_fee,
      (pi.raw->'psp'->>'komisyon_oransal')::numeric                     AS psp_oransal,
      (pi.raw->'psp'->>'komisyon_sabit')::numeric                       AS psp_sabit,
      (pi.raw->'psp'->>'net_odenecek')::numeric                         AS psp_net,
      (pi.raw->'psp'->>'cekilen')::numeric                              AS psp_cekilen,
      (pi.raw ? 'psp')                                                  AS has_psp,
      upper(COALESCE(pi.provider, ''))                                  AS provider
    FROM public.payment_intents pi
    WHERE pi.created_at >= v_since
      AND pi.status IN ('PAID', 'CAPTURED', 'REFUNDED')
      AND COALESCE(pi.is_demo, false) = false
      AND upper(COALESCE(pi.provider, '')) = 'IYZICO'
  )
  SELECT COALESCE(jsonb_agg(x ORDER BY x.gun DESC), '[]'::jsonb)
  INTO v_days
  FROM (
    SELECT
      gun,
      COUNT(*)                                                          AS islem,
      COALESCE(SUM(COALESCE(psp_cekilen, amount)), 0)                   AS cekilen,
      COALESCE(SUM(COALESCE(psp_oransal, 0) + COALESCE(psp_sabit, 0)) FILTER (WHERE has_psp), 0) AS psp_kesinti,
      COALESCE(SUM(psp_net) FILTER (WHERE has_psp), 0)                  AS psp_net,
      COALESCE(SUM(card_fee), 0)                                        AS kart_bedeli
    FROM base
    GROUP BY gun
  ) x;

  RETURN jsonb_build_object('totals', v_totals, 'days', v_days, 'since', v_since);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_psp_costs(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_psp_costs(int) TO authenticated, service_role;

-- ── 4) BİLDİRİM TÜRÜ İSTATİSTİKLERİ ─────────────────────────────────────────
-- "Bildirimler kullanıcının işlemine göre doğru gidiyor mu?" sorusunun kanıtı:
-- şablon başına pencere içindeki gerçek gönderim/push/okunma sayıları.
CREATE OR REPLACE FUNCTION public.admin_notification_type_stats(p_days int DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_since timestamptz := now() - make_interval(days => GREATEST(1, LEAST(COALESCE(p_days, 30), 365)));
  v_rows  jsonb;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  SELECT COALESCE(jsonb_agg(x ORDER BY x.sent DESC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      COALESCE(NULLIF(trim(n.type_key), ''), 'TIPSIZ')     AS type_key,
      COUNT(*)::int                                        AS sent,
      (COUNT(*) FILTER (WHERE n.push_sent))::int           AS pushed,
      (COUNT(*) FILTER (WHERE n.is_read))::int             AS read,
      MAX(n.created_at)                                    AS last_sent_at
    FROM public.notifications n
    WHERE n.created_at >= v_since
      AND COALESCE(n.is_demo, false) = false
    GROUP BY 1
  ) x;

  RETURN jsonb_build_object('since', v_since, 'rows', v_rows);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_notification_type_stats(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_notification_type_stats(int) TO authenticated, service_role;

-- ── 5) KOMİSYON SAĞLIK RAPORU ───────────────────────────────────────────────
-- Panel ↔ para yolu bağlantısının kanıtı ve yapılandırma hatası avcısı.
-- ETKİN kural, _pitch_agreement'ın çözüm sırasının BİREBİR aynısıyla bulunur:
-- sahaya özel aktif kayıt → aktif GLOBAL MODEL_A → sunucu varsayılanı (15/5).
CREATE OR REPLACE FUNCTION public.admin_commission_health()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_global      jsonb;
  v_global_cnt  integer;
  v_issues      jsonb := '[]'::jsonb;
  v_kanit       jsonb;
  v_pitch_cnt   integer;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  -- Etkin GLOBAL MODEL_A (çözücünün göreceği satır — LIMIT 1, sırasız!)
  SELECT COUNT(*)::int INTO v_global_cnt
  FROM public.commission_config
  WHERE is_active AND scope = 'GLOBAL' AND model = 'MODEL_A';

  SELECT to_jsonb(t) INTO v_global
  FROM (
    SELECT c.id, c.rate_pct, c.markup_pct, c.markup_amount, c.notes
    FROM public.commission_config c
    WHERE c.is_active AND c.scope = 'GLOBAL' AND c.model = 'MODEL_A'
    LIMIT 1
  ) t;

  IF v_global_cnt = 0 THEN
    v_issues := v_issues || jsonb_build_object(
      'code', 'GLOBAL_MISSING', 'level', 'CRITICAL',
      'message', 'Aktif GLOBAL Model A kuralı yok — sunucu gömülü varsayılana (%15 + %5) düşüyor; panelde gördüğün oranların hiçbiri geçerli değil.');
  ELSIF v_global_cnt > 1 THEN
    v_issues := v_issues || jsonb_build_object(
      'code', 'GLOBAL_DUPLICATE', 'level', 'CRITICAL',
      'message', v_global_cnt || ' adet aktif GLOBAL Model A kuralı var — çözücü sırasız LIMIT 1 ile rastgele birini seçer. Yalnız biri aktif kalmalı.');
  END IF;

  -- Ölü PITCH kuralı: scope_id yoksa hiçbir sahaya eşleşmez.
  IF EXISTS (SELECT 1 FROM public.commission_config WHERE is_active AND scope = 'PITCH' AND scope_id IS NULL) THEN
    v_issues := v_issues || jsonb_build_object(
      'code', 'PITCH_NULL_SCOPE', 'level', 'WARN',
      'message', 'scope_id boş bırakılmış aktif SAHA kuralı var — hiçbir sahaya uygulanmaz (ölü kural).');
  END IF;

  -- Öksüz PITCH kuralı: scope_id pitches'ta yok.
  IF EXISTS (
    SELECT 1 FROM public.commission_config c
    WHERE c.is_active AND c.scope = 'PITCH' AND c.scope_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.pitches p WHERE p.id = c.scope_id)
  ) THEN
    v_issues := v_issues || jsonb_build_object(
      'code', 'PITCH_ORPHAN', 'level', 'WARN',
      'message', 'Var olmayan bir sahaya bağlı aktif SAHA kuralı var (saha silinmiş olabilir).');
  END IF;

  -- Hizmet komisyonları: kaleci/hakem hakedişi bu kayıtlardan okunur.
  IF NOT EXISTS (SELECT 1 FROM public.commission_config WHERE is_active AND scope = 'SERVICE_GK') THEN
    v_issues := v_issues || jsonb_build_object(
      'code', 'SERVICE_GK_MISSING', 'level', 'WARN',
      'message', 'Aktif KALECİ hizmet komisyonu kuralı yok — hizmet motoru varsayılana düşer.');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.commission_config WHERE is_active AND scope = 'SERVICE_REF') THEN
    v_issues := v_issues || jsonb_build_object(
      'code', 'SERVICE_REF_MISSING', 'level', 'WARN',
      'message', 'Aktif HAKEM hizmet komisyonu kuralı yok — hizmet motoru varsayılana düşer.');
  END IF;

  -- Bilgi: sabit tutar doluysa yüzde yok sayılır (_markup_tutari kuralı).
  IF EXISTS (SELECT 1 FROM public.commission_config WHERE is_active AND markup_amount > 0 AND markup_pct > 0) THEN
    v_issues := v_issues || jsonb_build_object(
      'code', 'MARKUP_BOTH', 'level', 'INFO',
      'message', 'Hem sabit tutar hem yüzde fiyat farkı girilmiş kural(lar) var — sabit tutar doluyken yüzde YOK SAYILIR.');
  END IF;

  SELECT COUNT(*)::int INTO v_pitch_cnt
  FROM public.commission_config WHERE is_active AND scope = 'PITCH' AND scope_id IS NOT NULL;

  -- KANIT: son 30 günde panel kuralları paraya gerçekten dokundu mu?
  SELECT jsonb_build_object(
    'intent_komisyon_toplam', COALESCE((
      SELECT SUM(commission_amount) FROM public.payment_intents
      WHERE created_at >= now() - interval '30 days'
        AND status IN ('PAID', 'CAPTURED')
        AND COALESCE(is_demo, false) = false), 0),
    'intent_komisyonlu_adet', COALESCE((
      SELECT COUNT(*) FROM public.payment_intents
      WHERE created_at >= now() - interval '30 days'
        AND status IN ('PAID', 'CAPTURED')
        AND commission_amount > 0
        AND COALESCE(is_demo, false) = false), 0),
    'mac_dondurulmus_adet', COALESCE((
      SELECT COUNT(*) FROM public.matches
      WHERE created_at >= now() - interval '30 days'
        AND commission_rate_pct IS NOT NULL
        AND COALESCE("isDemo", false) = false), 0),
    'mac_model_dagilimi', COALESCE((
      SELECT jsonb_object_agg(COALESCE(commission_model, 'YOK'), adet)
      FROM (
        SELECT commission_model, COUNT(*)::int AS adet
        FROM public.matches
        WHERE created_at >= now() - interval '30 days'
          AND COALESCE("isDemo", false) = false
        GROUP BY commission_model
      ) t), '{}'::jsonb)
  ) INTO v_kanit;

  RETURN jsonb_build_object(
    'etkin_global', COALESCE(v_global, jsonb_build_object('rate_pct', 15.0, 'markup_pct', 5.0, 'markup_amount', 0, 'kaynak', 'SUNUCU_VARSAYILANI')),
    'global_aktif_adet', v_global_cnt,
    'saha_kural_adet', v_pitch_cnt,
    'sorunlar', v_issues,
    'kanit', v_kanit
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_commission_health() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_commission_health() TO authenticated, service_role;

-- ── Doğrulama (prensip 7.7) ─────────────────────────────────────────────────
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'admin_set_region_visibility', 'admin_court_slot_check',
    'admin_psp_costs', 'admin_notification_type_stats', 'admin_commission_health'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = fn
    ) THEN
      RAISE EXCEPTION 'DOGRULAMA: % kurulmadi', fn;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'region_visibility_rules'
  ) THEN
    RAISE EXCEPTION 'DOGRULAMA: region_visibility_rules tablosu yok';
  END IF;

  -- anon: kural tablosunu OKUYABİLİR (keşif süzgeci) ama RPC'leri çalıştıramaz.
  IF has_function_privilege('anon', 'public.admin_set_region_visibility(text, text, jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.admin_psp_costs(int)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.admin_notification_type_stats(int)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.admin_commission_health()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.admin_court_slot_check(uuid, date, text, int, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'DOGRULAMA: anon panel denetim fonksiyonlarini calistirabiliyor';
  END IF;
  IF NOT has_table_privilege('anon', 'public.region_visibility_rules', 'SELECT') THEN
    RAISE EXCEPTION 'DOGRULAMA: anon gorunurluk kurallarini okuyamiyor (kesif suzgeci bozulur)';
  END IF;
END $$;
