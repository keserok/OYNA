-- ════════════════════════════════════════════════════════════════════════════
-- YÖNETİCİ PANELİ KONTROL SETİ: KULLANICI-MAÇ GÖRÜNÜRLÜĞÜ + KART KIRILIMI
--                               + VELİ ONAYI PANEL AKSİYONLARI
-- ----------------------------------------------------------------------------
-- KURUCU İSTEĞİ (20 Ağustos 2026): "Kullanıcılar kısmında kullanıcıların hangi
-- maçlara girdiğini, hangi ödemeleri hangi kartla yaptığını görebilelim; veli
-- onayı ekranında onay isteyen kullanıcı ve veli yan yana görünsün ve basit bir
-- onay ekranı olsun."
--
-- BU GÖÇ NE YAPAR (3 parça, hepsi geriye uyumlu):
--   1) admin_user_matches(p_user_id): kullanıcının girdiği TÜM maçlar
--      (match_participants ana kaynak) + her maç için o kullanıcıdan yapılan
--      tahsilat kırılımı (payment_intents). Ayrıca panel aynasındaki maç
--      geçmişi hatasını çözer: get_my_match_history auth.uid()'e kilitli
--      olduğundan panelde ADMİNİN KENDİ geçmişini gösteriyordu.
--   2) admin_user_payment_summary v2: işlem satırlarına maç adı + kart bilgisi
--      (son 4 + marka; intent.raw'dan en-iyi-çaba) + booking/match kimlikleri
--      eklenir. İmza (p_user_id, p_recent_limit DEFAULT 10) olur — tek imza
--      kalması için eski tek parametreli sürüm DÜŞÜRÜLÜR (PGRST203 çakışması
--      olmasın diye iki imza aynı anda yaşatılmaz).
--   3) admin_grant/revoke_guardian_consent: veli onayını panelden verme/geri
--      alma. Zorunlu sebep + denetim kaydı. Panel onayı, veli beyanı DEĞİLDİR:
--      kayda consent_text_version='ADMIN-PANEL-v1' ve tc_hash alanlarına
--      'PANEL:' işareti yazılır — hangi onayın panelden geldiği her zaman
--      ayırt edilebilir kalır.
--
-- KART GÜVENLİĞİ: kart numarası/CVV OYNA'da saklanmaz; burada dönen tek kart
-- bilgisi maskeli metadır (marka + son 4). provider_card_token HİÇBİR fonksiyona
-- girmez (20260909000000 kilidi bu göçte de doğrulanır).
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1) admin_user_matches — "bu kullanıcı hangi maçlara girdi?" ─────────────
CREATE OR REPLACE FUNCTION public.admin_user_matches(p_user_id uuid, p_limit int DEFAULT 100)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rows   jsonb;
  v_counts jsonb;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENT'; END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(x) - 'sort_ts' ORDER BY x.sort_ts DESC NULLS LAST), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      m.id                                 AS match_id,
      m.title,
      m.location,
      m.date,
      m."time",
      m.starts_at,
      COALESCE(m.starts_at, mp.joined_at)  AS sort_ts,
      m.status,
      m.format,
      m.price,
      m."isDemo"                           AS is_demo,
      m."homeScore"                        AS home_score,
      m."awayScore"                        AS away_score,
      m.score_status,
      (mp.role = 'away')                   AS is_away,
      mp.status                            AS participant_status,
      mp.joined_at,
      mp.is_buyer,
      COALESCE(mp.bought_slots, 1)         AS bought_slots,
      pay.paid, pay.refunded, pay.blocked,
      pay.failed_count, pay.intent_count,
      pay.last_status, pay.card_last4, pay.card_brand
    FROM public.match_participants mp
    JOIN public.matches m ON m.id = mp.match_id
    -- Maç başına o KULLANICIDAN yapılan tahsilat: kırılım LATERAL'de toplanır;
    -- kart bilgisi intent.raw'dan en-iyi-çaba okunur (eski kayıtlarda olmayabilir).
    LEFT JOIN LATERAL (
      SELECT
        COALESCE(SUM(pi.amount) FILTER (WHERE pi.status IN ('PAID','CAPTURED')), 0) AS paid,
        COALESCE(SUM(pi.amount) FILTER (WHERE pi.status = 'REFUNDED'), 0)           AS refunded,
        COALESCE(SUM(pi.amount) FILTER (WHERE pi.status = 'BLOCKED'), 0)            AS blocked,
        (COUNT(*) FILTER (WHERE pi.status = 'FAILED'))::int                         AS failed_count,
        COUNT(*)::int                                                               AS intent_count,
        (ARRAY_AGG(pi.status ORDER BY pi.created_at DESC))[1]                       AS last_status,
        (ARRAY_AGG(COALESCE(pi.raw->>'card_last4', pi.raw->'card'->>'last4')
                   ORDER BY pi.created_at DESC)
           FILTER (WHERE COALESCE(pi.raw->>'card_last4', pi.raw->'card'->>'last4') IS NOT NULL))[1] AS card_last4,
        (ARRAY_AGG(COALESCE(pi.raw->>'card_brand', pi.raw->'card'->>'brand')
                   ORDER BY pi.created_at DESC)
           FILTER (WHERE COALESCE(pi.raw->>'card_brand', pi.raw->'card'->>'brand') IS NOT NULL))[1] AS card_brand
      FROM public.payment_intents pi
      WHERE pi.match_id = m.id AND pi.user_id = p_user_id
    ) pay ON TRUE
    WHERE mp.user_id = p_user_id
    ORDER BY COALESCE(m.starts_at, mp.joined_at) DESC NULLS LAST
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 100), 300))
  ) x;

  SELECT jsonb_build_object(
    'total',     COUNT(*)::int,
    'upcoming',  (COUNT(*) FILTER (WHERE m.status NOT IN ('COMPLETED','CANCELLED')))::int,
    'completed', (COUNT(*) FILTER (WHERE m.status = 'COMPLETED'))::int,
    'cancelled', (COUNT(*) FILTER (WHERE m.status = 'CANCELLED'))::int
  )
  INTO v_counts
  FROM public.match_participants mp
  JOIN public.matches m ON m.id = mp.match_id
  WHERE mp.user_id = p_user_id;

  RETURN jsonb_build_object('counts', COALESCE(v_counts, '{}'::jsonb), 'matches', v_rows);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_user_matches(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_user_matches(uuid, int) TO authenticated, service_role;

-- ── 2) admin_user_payment_summary v2 — işlem satırında maç + kart ───────────
-- İmza değişiyor (limit parametresi eklendi). İki imza birden kalırsa PostgREST
-- çağrıyı çözemez (PGRST203); eskisi önce düşürülür.
DROP FUNCTION IF EXISTS public.admin_user_payment_summary(uuid);

CREATE OR REPLACE FUNCTION public.admin_user_payment_summary(p_user_id uuid, p_recent_limit int DEFAULT 10)
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
    (COUNT(*) FILTER (WHERE status IN ('PAID','CAPTURED')))::int,
    (COUNT(*) FILTER (WHERE status = 'FAILED'))::int,
    MAX(created_at)               FILTER (WHERE status IN ('PAID','CAPTURED'))
  INTO v_collected, v_fees, v_refunded, v_count, v_failed, v_last
  FROM public.payment_intents
  WHERE user_id = p_user_id;

  -- Son hareketler. `taban` = karttan çekilen − işlem bedeli. v2 eklentileri:
  -- maç adı/kimliği + kart son4/marka (raw'dan en-iyi-çaba) + booking kimliği.
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
      pi.booking_id,
      pi.match_id,
      m.title AS match_title,
      p.name  AS pitch_name,
      COALESCE(pi.raw->>'card_last4', pi.raw->'card'->>'last4') AS card_last4,
      COALESCE(pi.raw->>'card_brand', pi.raw->'card'->>'brand') AS card_brand
    FROM public.payment_intents pi
    LEFT JOIN public.pitches p ON p.id = pi.pitch_id
    LEFT JOIN public.matches m ON m.id = pi.match_id
    WHERE pi.user_id = p_user_id
    ORDER BY pi.created_at DESC
    LIMIT GREATEST(1, LEAST(COALESCE(p_recent_limit, 10), 100))
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

REVOKE ALL ON FUNCTION public.admin_user_payment_summary(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_user_payment_summary(uuid, int) TO authenticated, service_role;

-- ── 3a) admin_grant_guardian_consent — panelden veli onayı verme ────────────
-- Veli akışının (create_guardian_consent) TÜM kapıları korunur: hedef reşit
-- değil, veli reşit, kendi kendine bağlanma yok, tek aktif onay. Fark: TC
-- beyanı alınmaz — kayda panel işareti düşülür; sebep + denetim kaydı zorunlu.
CREATE OR REPLACE FUNCTION public.admin_grant_guardian_consent(
  p_minor_user_id    uuid,
  p_guardian_user_id uuid,
  p_reason           text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_minor    public.profiles%ROWTYPE;
  v_guardian public.profiles%ROWTYPE;
  v_id       uuid;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_minor_user_id IS NULL OR p_guardian_user_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT';
  END IF;
  IF length(COALESCE(trim(p_reason), '')) < 5 THEN
    RAISE EXCEPTION 'REASON_REQUIRED' USING HINT = 'Onay sebebi zorunlu (en az 5 karakter).';
  END IF;
  IF p_minor_user_id = p_guardian_user_id THEN
    RAISE EXCEPTION 'SELF_LINK_FORBIDDEN';
  END IF;

  SELECT * INTO v_minor FROM public.profiles WHERE id = p_minor_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'MINOR_NOT_FOUND'; END IF;
  SELECT * INTO v_guardian FROM public.profiles WHERE id = p_guardian_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'GUARDIAN_NOT_FOUND'; END IF;

  IF NOT public.compute_is_minor(v_minor.birthdate, v_minor.age_range) THEN
    RAISE EXCEPTION 'TARGET_NOT_MINOR' USING HINT = 'Bu hesap reşit görünüyor; veli onayı gerekmez.';
  END IF;
  IF public.compute_is_minor(v_guardian.birthdate, v_guardian.age_range) THEN
    RAISE EXCEPTION 'GUARDIAN_NOT_ADULT' USING HINT = 'Veli olarak seçilen hesap reşit değil.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.guardian_consents
             WHERE minor_user_id = p_minor_user_id AND status = 'ACTIVE') THEN
    RAISE EXCEPTION 'ALREADY_LINKED' USING HINT = 'Bu çocuk için zaten aktif bir veli onayı var.';
  END IF;

  INSERT INTO public.guardian_consents (
    minor_user_id, guardian_user_id,
    guardian_full_name, guardian_tc_hash, guardian_birthdate,
    minor_full_name, minor_tc_hash, minor_birthdate,
    consent_text_version, status, consented_at, ip_address, user_agent
  ) VALUES (
    p_minor_user_id, p_guardian_user_id,
    COALESCE(NULLIF(trim(v_guardian.full_name), ''), v_guardian.name, 'Veli'),
    -- TC beyanı YOK — bu bir hash değil, panel onayı işaretidir (ayırt edilebilir kalsın).
    'PANEL:' || COALESCE((SELECT auth.uid())::text, 'system'),
    v_guardian.birthdate,
    COALESCE(NULLIF(trim(v_minor.full_name), ''), v_minor.name, 'Çocuk'),
    'PANEL:' || p_minor_user_id::text,
    v_minor.birthdate,
    'ADMIN-PANEL-v1',
    'ACTIVE', now(), public._req_ip(), public._req_ua()
  ) RETURNING id INTO v_id;

  UPDATE public.profiles
     SET guardian_consent_status = 'ACTIVE',
         guardian_user_id = p_guardian_user_id,
         updated_at = now()
   WHERE id = p_minor_user_id;

  PERFORM public.log_admin_action(
    'GUARDIAN_CONSENT_GRANT', 'guardian_consent', v_id,
    COALESCE(NULLIF(trim(v_minor.full_name), ''), v_minor.name),
    NULL,
    jsonb_build_object(
      'minor_user_id', p_minor_user_id,
      'guardian_user_id', p_guardian_user_id,
      'reason', trim(p_reason),
      'source', 'ADMIN_PANEL'
    )
  );

  RETURN jsonb_build_object('ok', true, 'consent_id', v_id);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_grant_guardian_consent(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_grant_guardian_consent(uuid, uuid, text) TO authenticated, service_role;

-- ── 3b) admin_revoke_guardian_consent — panelden geri alma ──────────────────
CREATE OR REPLACE FUNCTION public.admin_revoke_guardian_consent(
  p_minor_user_id uuid,
  p_reason        text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id    uuid;
  v_name  text;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_minor_user_id IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENT'; END IF;
  IF length(COALESCE(trim(p_reason), '')) < 5 THEN
    RAISE EXCEPTION 'REASON_REQUIRED' USING HINT = 'Geri alma sebebi zorunlu (en az 5 karakter).';
  END IF;

  UPDATE public.guardian_consents
     SET status = 'REVOKED', revoked_at = now()
   WHERE minor_user_id = p_minor_user_id AND status = 'ACTIVE'
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'NO_ACTIVE_CONSENT' USING HINT = 'Bu çocuk için aktif bir veli onayı yok.';
  END IF;

  -- Veli akışındaki revoke_guardian_consent ile aynı profil davranışı:
  -- durum REVOKED'a düşer, çocuk sınırlı moda döner (assert_can_transact kapatır).
  UPDATE public.profiles
     SET guardian_consent_status = 'REVOKED', updated_at = now()
   WHERE id = p_minor_user_id;

  SELECT COALESCE(NULLIF(trim(full_name), ''), name) INTO v_name
  FROM public.profiles WHERE id = p_minor_user_id;

  PERFORM public.log_admin_action(
    'GUARDIAN_CONSENT_REVOKE', 'guardian_consent', v_id,
    v_name,
    NULL,
    jsonb_build_object('minor_user_id', p_minor_user_id, 'reason', trim(p_reason), 'source', 'ADMIN_PANEL')
  );

  RETURN jsonb_build_object('ok', true, 'consent_id', v_id);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_revoke_guardian_consent(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_revoke_guardian_consent(uuid, text) TO authenticated, service_role;

-- ── Doğrulama (prensip 7.7) ─────────────────────────────────────────────────
DO $$
DECLARE
  fn text;
BEGIN
  -- Dört fonksiyon da kurulmuş olmalı.
  FOREACH fn IN ARRAY ARRAY[
    'admin_user_matches', 'admin_user_payment_summary',
    'admin_grant_guardian_consent', 'admin_revoke_guardian_consent'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = fn
    ) THEN
      RAISE EXCEPTION 'DOGRULAMA: % kurulmadi', fn;
    END IF;
  END LOOP;

  -- Eski tek parametreli özet imzası GERÇEKTEN düşmüş olmalı (PGRST203 kilidi).
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'admin_user_payment_summary'
      AND pg_get_function_identity_arguments(p.oid) = 'p_user_id uuid'
  ) THEN
    RAISE EXCEPTION 'DOGRULAMA: eski admin_user_payment_summary(uuid) imzasi hala duruyor';
  END IF;

  -- anon hiçbirini çalıştıramamalı; authenticated hepsini çalıştırabilmeli.
  IF has_function_privilege('anon', 'public.admin_user_matches(uuid, int)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.admin_user_payment_summary(uuid, int)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.admin_grant_guardian_consent(uuid, uuid, text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.admin_revoke_guardian_consent(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'DOGRULAMA: anon panel fonksiyonlarini calistirabiliyor';
  END IF;
  IF NOT (has_function_privilege('authenticated', 'public.admin_user_matches(uuid, int)', 'EXECUTE')
     AND has_function_privilege('authenticated', 'public.admin_user_payment_summary(uuid, int)', 'EXECUTE')
     AND has_function_privilege('authenticated', 'public.admin_grant_guardian_consent(uuid, uuid, text)', 'EXECUTE')
     AND has_function_privilege('authenticated', 'public.admin_revoke_guardian_consent(uuid, text)', 'EXECUTE')) THEN
    RAISE EXCEPTION 'DOGRULAMA: authenticated panel fonksiyonlarini calistiramiyor';
  END IF;

  -- Token sızıntısı kilidi (20260909000000 ile aynı): yeni fonksiyonlar
  -- provider_card_token'a DOKUNMAZ.
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('admin_user_matches', 'admin_user_payment_summary')
      AND p.prosrc ILIKE '%provider_card_token%'
  ) THEN
    RAISE EXCEPTION 'DOGRULAMA: panel fonksiyonu kart tokenina dokunuyor';
  END IF;
END $$;
