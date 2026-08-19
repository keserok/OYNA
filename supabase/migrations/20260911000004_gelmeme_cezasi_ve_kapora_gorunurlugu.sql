-- ════════════════════════════════════════════════════════════════════════════
-- GELMEME CEZASI DEFTERE BORÇ · KAPORA YÖNETİCİ GÖRÜNÜRLÜĞÜ
-- ----------------------------------------------------------------------------
-- KURUCU KARARLARI (19 Ağustos 2026):
--   "Yalnızca maçlara katılabilmeleri için sistemlerinde maça gelmemeleri
--    hâlinde ödeyecekleri minimum tutar konulmak zorunda olsun."
--   Ceza tahsili sorulduğunda: "Deftere borç yazılsın, manuel ödemeden düşülsün."
--   "Uygulamadan yapılan kapora ödemelerinin admin panelinden çok net görünmesi
--    şart."
--
-- ── BULGU: CEZA FİİLEN HİÇ UYGULANMIYORDU ──────────────────────────────────
-- `captain_report_no_show` cezayı `wallet_spend_balance` ile tahsil etmeye
-- çalışıyordu. Cüzdan kapalı (20260905000001) olduğu için o çağrı hata veriyor,
-- hata da BOŞ bir EXCEPTION bloğuyla yutuluyordu:
--
--     EXCEPTION WHEN OTHERS THEN v_charged := false;
--
-- Yani sağlayıcı maça gelmediğinde ekranda "ceza kesildi" yazıyor, gerçekte
-- hiçbir şey olmuyordu. Sessiz yutma, hatanın kendisinden kötüdür: kimse fark
-- etmez.
--
-- ── İKİNCİ BULGU: CEZA TABANI SIFIRA DÜŞEBİLİYORDU ─────────────────────────
-- Taban `matches.price` idi — bu KİŞİ BAŞI slot ücretidir. Ücretsiz ya da çok
-- ucuz bir maçta gelmemenin bedeli sıfıra iniyordu.
--
-- ── YENİ DAVRANIŞ ──────────────────────────────────────────────────────────
--   ceza = EN BÜYÜK(maç payı, provider_noshow_penalty_min)
-- ve sağlayıcının hakediş defterine NEGATİF satır olarak yazılır. OYNA ona elle
-- ödeme yaparken bu borç düşülür. Kart yok, provizyon yok (ikisi de kaldırıldı).
-- Aynı maç için ikinci kez yazılmaz (çift-ceza koruması).
--
-- Bildirim metni de değişti: sağlayıcı "ne kadar" ve "nasıl tahsil edileceğini"
-- birlikte okur.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.captain_report_no_show(p_request_id uuid, p_note text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_uid uuid := auth.uid(); v_req public.service_requests; v_match RECORD;
  v_penalty numeric; v_min numeric; v_hours numeric; v_gk_name text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT * INTO v_req FROM public.service_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  SELECT * INTO v_match FROM public.matches WHERE id = v_req.match_id;
  IF v_req.requested_by IS DISTINCT FROM v_uid
     AND public._hire_side_for(v_req.match_id, v_uid) IS NULL
     AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: Yalniz mac kaptani no-show bildirebilir.';
  END IF;
  IF v_req.status <> 'CAPTURED' THEN
    RAISE EXCEPTION 'INVALID_STATE: No-show yalniz tahsil edilmis (aktif) hizmet icin bildirilebilir (mevcut: %).', v_req.status;
  END IF;

  v_min := COALESCE(public.get_config_number('provider_noshow_penalty_min', 500), 500);
  v_penalty := GREATEST(COALESCE(v_match.price, 0), v_min);
  v_hours := public.get_config_number('gk_noshow_dispute_hours', 48);
  SELECT COALESCE(name, full_name, 'Saglayici') INTO v_gk_name FROM public.profiles WHERE id = v_req.provider_id;

  UPDATE public.wallet_transactions SET status = 'CANCELLED'
    WHERE reference_id = v_req.payment_intent_id AND balance_type = 'EARNINGS' AND status = 'PENDING';

  PERFORM public._refund_service_captain(v_req);

  INSERT INTO public.wallet_transactions
    (user_id, match_id, amount, type, balance_type, status, reference_type, reference_id, description)
  SELECT v_req.provider_id, v_req.match_id, -v_penalty, 'MATCH_EARNING', 'EARNINGS', 'COMPLETED',
         'MATCH', v_req.match_id,
         'Maça gelmeme cezası (' || COALESCE(v_match.title, 'maç') || ') — ödemenden düşülecek'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.wallet_transactions w
    WHERE w.user_id = v_req.provider_id AND w.reference_type = 'MATCH'
      AND w.reference_id = v_req.match_id AND w.amount < 0 AND w.balance_type = 'EARNINGS'
  );

  UPDATE public.service_requests
    SET status = 'NOSHOW_REPORTED', reported_at = now(),
        dispute_deadline = now() + make_interval(hours => v_hours::int),
        penalty_amount = v_penalty, payout_released = true
    WHERE id = p_request_id;

  INSERT INTO public.notifications (user_id, title, body, type_key, match_id, deep_link)
  VALUES (v_req.provider_id, 'Maça gelmediğin bildirildi',
          COALESCE(v_match.title,'Bir maç') || ' için katılmadığın bildirildi. ' || v_penalty ||
          '₺ ceza hesabına borç olarak yazıldı ve OYNA''nın sana yapacağı ödemeden düşülecek. İtiraz etmek için ' ||
          v_hours || ' saatin var.',
          'service_noshow_reported', v_req.match_id, 'oyna://match/' || v_req.match_id);

  RETURN jsonb_build_object('request_id', p_request_id, 'status', 'NOSHOW_REPORTED',
    'penalty', v_penalty, 'penalty_charged', true, 'penalty_kind', 'LEDGER_DEBT',
    'dispute_deadline', now() + make_interval(hours => v_hours::int));
END;
$fn$;

-- ── Kapora tablosu: kim, hangi maç için, ne kadar ödedi ────────────────────
CREATE OR REPLACE FUNCTION public.admin_kapora_ozeti(
  p_durum text DEFAULT NULL,
  p_limit integer DEFAULT 200
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_satirlar jsonb;
  v_ozet jsonb;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  SELECT COALESCE(jsonb_agg(x ORDER BY x.odendi DESC NULLS LAST), '[]'::jsonb)
  INTO v_satirlar
  FROM (
    SELECT
      m.id AS mac_id, m.title AS mac_adi, m.starts_at AS mac_saati,
      m.deposit_status AS durum, m.deposit_amount AS kapora_taban,
      i.id AS niyet_id, i.amount AS cekilen,
      COALESCE(i.card_fee_amount, 0) AS kart_bedeli,
      COALESCE(i.rounding_amount, 0) AS yuvarlama,
      i.status AS niyet_durumu, i.provider AS saglayici, i.paid_at AS odendi,
      i.raw->>'refund_reason' AS iade_sebebi,
      COALESCE(i.raw->'psp'->>'komisyon_oransal', '') AS iyzico_komisyon,
      p.id AS kaptan_id, COALESCE(p.full_name, p.name) AS kaptan, p.phone AS kaptan_telefon,
      pt.name AS tesis
    FROM public.matches m
    LEFT JOIN public.payment_intents i ON i.id = m.deposit_intent_id
    LEFT JOIN public.profiles p  ON p.id = COALESCE(m."creatorId", m.captain_id)
    LEFT JOIN public.pitches pt  ON pt.id = m.pitch_id
    WHERE m.deposit_status <> 'NONE'
      AND (p_durum IS NULL OR m.deposit_status = p_durum)
    ORDER BY i.paid_at DESC NULLS LAST
    LIMIT GREATEST(COALESCE(p_limit, 200), 1)
  ) x;

  SELECT jsonb_object_agg(d.durum, jsonb_build_object('adet', d.adet, 'tutar', d.tutar))
  INTO v_ozet
  FROM (
    SELECT m.deposit_status AS durum, count(*)::int AS adet,
           COALESCE(SUM(i.amount) FILTER (WHERE i.status IN ('PAID','CAPTURED')), 0) AS tutar
    FROM public.matches m
    LEFT JOIN public.payment_intents i ON i.id = m.deposit_intent_id
    WHERE m.deposit_status <> 'NONE'
    GROUP BY m.deposit_status
  ) d;

  RETURN jsonb_build_object('satirlar', v_satirlar, 'ozet', COALESCE(v_ozet, '{}'::jsonb));
END;
$fn$;

REVOKE ALL ON FUNCTION public.admin_kapora_ozeti(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_kapora_ozeti(text, integer) TO authenticated, service_role;

-- ── Doğrulama (prensip 7.7) ────────────────────────────────────────────────
DO $dog$
DECLARE v_src text;
BEGIN
  SELECT p.prosrc INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='captain_report_no_show';

  IF v_src LIKE '%wallet_spend_balance%' THEN
    RAISE EXCEPTION 'DOGRULAMA: ceza hala kapali cuzdandan tahsil edilmeye calisiliyor';
  END IF;
  IF v_src NOT LIKE '%provider_noshow_penalty_min%' THEN
    RAISE EXCEPTION 'DOGRULAMA: asgari ceza tutari uygulanmiyor';
  END IF;
  IF v_src NOT LIKE '%-v_penalty%' THEN
    RAISE EXCEPTION 'DOGRULAMA: ceza deftere negatif satir olarak yazilmiyor';
  END IF;
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='captain_report_no_show') <> 1 THEN
    RAISE EXCEPTION 'DOGRULAMA: captain_report_no_show birden fazla imzayla duruyor';
  END IF;

  IF has_function_privilege('anon', 'public.admin_kapora_ozeti(text, integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'DOGRULAMA: anon kapora ozetini okuyabiliyor';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.admin_kapora_ozeti(text, integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'DOGRULAMA: authenticated kapora ozetini okuyamiyor';
  END IF;

  RAISE NOTICE 'DOGRULAMA TAMAM: ceza deftere yaziliyor, kapora panelde gorunur.';
END $dog$;
