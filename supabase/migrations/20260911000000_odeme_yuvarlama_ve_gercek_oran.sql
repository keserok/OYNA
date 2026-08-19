-- ════════════════════════════════════════════════════════════════════════════
-- KULLANICI HER ZAMAN 10'UN KATINI ÖDER + KART BEDELİ GERÇEK ORANA ÇEKİLDİ
-- ----------------------------------------------------------------------------
-- KURUCU KARARLARI (19 Ağustos 2026):
--   1. "Kullanıcı asla buçuklu rakamlar ödemeyecek ve her seferinde onlar
--      basamağı yuvarlanmış rakamı ödeyecek, her seferinde yukarıya."
--      Örnek: 1.000 ₺ saha · %40 kapora = 400 ₺ · %3,5 bedel = 14 ₺
--             → ham 414 ₺ → ekranda ve kartta 420 ₺.
--   2. "Yuvarlama farkı OYNA'da kalsın."
--   3. "Kullanıcıdan aldığımız kart işlem bedeli iyzico'nun BSMV dahil normal
--      oranı olsun."  → card_fee_pct 2,5 → 3,5
--
-- ÜÇ RAKAM AYRI TUTULUR — bu ayrım para için hayati:
--   taban     : hizmetin bedeli. Tesise yazılan, komisyonun hesaplandığı tutar
--               BUDUR; yuvarlama onu DEĞİŞTİRMEZ (karar 2).
--   bedel     : gerçek oranla hesaplanan altyapı bedeli. iyzico'nun bizden
--               kestiğiyle karşılaştırılabilir kalmalı — yuvarlama buraya
--               karışırsa "eklediğimiz bedel maliyeti karşılıyor mu" sorusu
--               bir daha ölçülemez (19 Ağu'da eklenen psp görünürlüğü boşa gider).
--   yuvarlama : yalnız 10'a tamamlayan fark. Yeni kolonda ayrı durur.
--
-- İSTEMCİ İKİZİ: shared/odemeYuvarlama.ts. İkisi aynı yuvarlamayı ve aynı kuruş
-- kırpmasını uygular; ekranda yazan tutar ile karttan çekilen tutar ayrışamaz
-- (prensip 2.9).
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1 · Yuvarlama farkı için ayrı kolon ─────────────────────────────────────
ALTER TABLE public.payment_intents
  ADD COLUMN IF NOT EXISTS rounding_amount numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.payment_intents.rounding_amount IS
  '10''un katına tamamlayan fark. amount = card_base + card_fee_amount + rounding_amount. Tesise gitmez, komisyona girmez; OYNA''da kalır (kurucu kararı 19 Ağu 2026).';

-- ── 2 · Yuvarlamanın sunucu tarafı — tek kaynak ─────────────────────────────
CREATE OR REPLACE FUNCTION public._odeme_yuvarla(p_taban numeric, p_oran numeric)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $fn$
DECLARE
  v_t numeric := round(GREATEST(COALESCE(p_taban, 0), 0), 2);
  v_o numeric := GREATEST(COALESCE(p_oran, 0), 0);
  v_bedel numeric;
  v_ham numeric;
  v_toplam numeric;
BEGIN
  IF v_t <= 0 THEN
    RETURN jsonb_build_object('taban', 0, 'bedel', 0, 'yuvarlama', 0, 'toplam', 0, 'oran', v_o);
  END IF;
  v_bedel := CASE WHEN v_o > 0 THEN round(v_t * v_o / 100.0, 2) ELSE 0 END;
  v_ham   := round(v_t + v_bedel, 2);
  -- YUKARI yuvarlama. Zaten 10'un katıysa yerinde kalır (ceil(40.0)=40).
  v_toplam := ceil(v_ham / 10.0) * 10;
  RETURN jsonb_build_object(
    'taban', v_t, 'bedel', v_bedel,
    'yuvarlama', round(v_toplam - v_ham, 2),
    'toplam', v_toplam, 'oran', v_o
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public._odeme_yuvarla(numeric, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._odeme_yuvarla(numeric, numeric) TO authenticated, anon, service_role;

-- ── 3 · Oranlar gerçek maliyete çekildi ─────────────────────────────────────
-- card_fee_pct: kullanıcıdan alınan (iyzico BSMV dahil normal oran).
UPDATE public.app_config SET value = '3.5'::jsonb WHERE key = 'card_fee_pct';
-- refund_psp_fee_pct: iadede düşülen. AYNI oran olmalı — iyzico iade edilen
-- işlemin komisyonunu geri vermiyor; farklı olsalardı aradaki farkı OYNA
-- üstlenirdi (kurucu kararı: "bizden kesilen komisyon olmasın").
UPDATE public.settings SET refund_psp_fee_pct = 3.5, refund_psp_fee_fixed = 0;

-- ── 4 · Ekranın okuduğu teklif: artık yuvarlanmış toplamı döner ─────────────
CREATE OR REPLACE FUNCTION public.get_card_fee_quote(p_amount numeric)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_pct numeric := COALESCE(public.get_config_number('card_fee_pct', 3.5), 3.5);
  v_k jsonb;
BEGIN
  v_k := public._odeme_yuvarla(p_amount, v_pct);
  RETURN jsonb_build_object(
    'pct',       v_pct,
    'base',      v_k->'taban',
    'fee',       v_k->'bedel',
    'rounding',  v_k->'yuvarlama',
    'total',     v_k->'toplam',
    'enabled',   v_pct > 0
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.get_card_fee_quote(numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_card_fee_quote(numeric) TO authenticated, anon;

-- ── 5 · prepare_card_payment: dört akışın dördü de yuvarlamayı kullanır ────
-- YÖNTEM NOTU: fonksiyon 10 KB ve dört akış (rezervasyon kaporası, cüzdan
-- yükleme, maça katılma, maç kaporası) aynı üç satırı tekrar ediyor. Gövdeyi
-- buraya elle kopyalamak yerine, KURULU tanım okunup üzerinde adı adına
-- değiştirme yapılıyor. Sebebi tek: bu depo daha önce canlıyla ayrıştı ve elle
-- kopyalanan bir gövde, canlıdaki daha yeni bir düzeltmeyi sessizce ezerdi.
-- Bu yol ne kurulu ise onun üzerine yazar. Her değişikliğin BEKLENEN SAYIDA
-- olduğu tek tek doğrulanır; biri tutmazsa göç durur ve hiçbir şey değişmez.
DO $mig$
DECLARE
  v_def text;
  v_n   int;

  -- Değiştirilecek kalıplar ve yerlerine geçecekler
  k1_eski CONSTANT text := $p$v_card_fee := CASE WHEN v_fee_pct > 0 THEN round(v_card_base * v_fee_pct / 100.0, 2) ELSE 0 END;$p$;
  k1_yeni CONSTANT text := $p$v_kir := public._odeme_yuvarla(v_card_base, v_fee_pct);
    v_card_fee := (v_kir->>'bedel')::numeric;
    v_rounding := (v_kir->>'yuvarlama')::numeric;$p$;

  k2_eski CONSTANT text := $p$v_card_amount := round(v_card_base + v_card_fee, 2);$p$;
  k2_yeni CONSTANT text := $p$v_card_amount := (v_kir->>'toplam')::numeric;$p$;

  k3_eski CONSTANT text := $p$commission_model, related_entity_type, raw, idempotency_key, card_fee_amount$p$;
  k3_yeni CONSTANT text := $p$commission_model, related_entity_type, raw, idempotency_key, card_fee_amount, rounding_amount$p$;

  k4_eski CONSTANT text := $p$p_idempotency_key, v_card_fee$p$;
  k4_yeni CONSTANT text := $p$p_idempotency_key, v_card_fee, v_rounding$p$;

  k5_eski CONSTANT text := $p$'card_base', v_card_base, 'card_fee', v_card_fee, 'card_fee_pct', v_fee_pct)$p$;
  k5_yeni CONSTANT text := $p$'card_base', v_card_base, 'card_fee', v_card_fee, 'card_fee_pct', v_fee_pct, 'card_rounding', v_rounding)$p$;

  k6_eski CONSTANT text := $p$COALESCE(public.get_config_number('card_fee_pct', 2.5), 2.5)$p$;
  k6_yeni CONSTANT text := $p$COALESCE(public.get_config_number('card_fee_pct', 3.5), 3.5)$p$;

  k7_eski CONSTANT text := $p$  v_min numeric; v_max numeric;$p$;
  k7_yeni CONSTANT text := $p$  v_min numeric; v_max numeric;
  v_kir jsonb;                      -- _odeme_yuvarla çıktısı
  v_rounding numeric := 0;          -- 10'a tamamlayan fark (OYNA'da kalır)$p$;

  k8_eski CONSTANT text := $p$    'card_fee', v_card_fee,
    'card_fee_pct', v_fee_pct,
    'balance_applied', v_balance_applied,$p$;
  k8_yeni CONSTANT text := $p$    'card_fee', v_card_fee,
    'card_rounding', v_rounding,
    'card_fee_pct', v_fee_pct,
    'balance_applied', v_balance_applied,$p$;

  k9_eski CONSTANT text := $p$        'card_fee', COALESCE(v_existing.card_fee_amount, 0),$p$;
  k9_yeni CONSTANT text := $p$        'card_fee', COALESCE(v_existing.card_fee_amount, 0),
        'card_rounding', COALESCE(v_existing.rounding_amount, 0),$p$;

  -- (kalıp, yerine, beklenen adet)
  kaliplar text[][];
  i int;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'prepare_card_payment';
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'DOGRULAMA: prepare_card_payment kurulu degil — once temel goc uygulanmali';
  END IF;

  kaliplar := ARRAY[
    ARRAY[k1_eski, k1_yeni, '4'],
    ARRAY[k2_eski, k2_yeni, '4'],
    ARRAY[k3_eski, k3_yeni, '4'],
    ARRAY[k4_eski, k4_yeni, '4'],
    ARRAY[k5_eski, k5_yeni, '4'],
    ARRAY[k6_eski, k6_yeni, '1'],
    ARRAY[k7_eski, k7_yeni, '1'],
    ARRAY[k8_eski, k8_yeni, '1'],
    ARRAY[k9_eski, k9_yeni, '1']
  ];

  FOR i IN 1 .. array_length(kaliplar, 1) LOOP
    v_n := (length(v_def) - length(replace(v_def, kaliplar[i][1], ''))) / length(kaliplar[i][1]);
    IF v_n <> kaliplar[i][3]::int THEN
      RAISE EXCEPTION 'DOGRULAMA: % nolu kalip % kez bulundu, % bekleniyordu — govde degismis, elle bakilmali',
        i, v_n, kaliplar[i][3];
    END IF;
    v_def := replace(v_def, kaliplar[i][1], kaliplar[i][2]);
  END LOOP;

  EXECUTE v_def;
END $mig$;

-- ── Doğrulama (prensip 7.7) ────────────────────────────────────────────────
DO $dog$
DECLARE
  v_k jsonb;
  v_pct numeric;
BEGIN
  -- 1) Kurucunun kendi örneği birebir çıkıyor mu?
  v_k := public._odeme_yuvarla(400, 3.5);
  IF (v_k->>'toplam')::numeric <> 420
     OR (v_k->>'bedel')::numeric <> 14
     OR (v_k->>'yuvarlama')::numeric <> 6
     OR (v_k->>'taban')::numeric <> 400 THEN
    RAISE EXCEPTION 'DOGRULAMA: 400 taban + %%3,5 icin 420/14/6/400 bekleniyordu, % geldi', v_k;
  END IF;

  -- 2) Hiçbir tabanda küsuratlı toplam çıkmıyor mu?
  FOR v_pct IN SELECT unnest(ARRAY[0, 2.5, 3.5, 15]::numeric[]) LOOP
    IF EXISTS (
      SELECT 1 FROM generate_series(1, 997, 7) g
      WHERE ((public._odeme_yuvarla(g::numeric, v_pct)->>'toplam')::numeric) % 10 <> 0
    ) THEN
      RAISE EXCEPTION 'DOGRULAMA: yuzde % oraninda 10un kati olmayan toplam uretildi', v_pct;
    END IF;
  END LOOP;

  -- 3) Yuvarlama HER ZAMAN yukarı — toplam ham tutardan küçük olamaz.
  IF EXISTS (
    SELECT 1 FROM generate_series(1, 997, 3) g
    CROSS JOIN LATERAL public._odeme_yuvarla(g::numeric, 3.5) k
    WHERE (k->>'toplam')::numeric < (k->>'taban')::numeric + (k->>'bedel')::numeric
  ) THEN
    RAISE EXCEPTION 'DOGRULAMA: asagi yuvarlanan tutar var';
  END IF;

  -- 4) Oranlar gerçekten güncellendi mi?
  IF COALESCE(public.get_config_number('card_fee_pct', 0), 0) <> 3.5 THEN
    RAISE EXCEPTION 'DOGRULAMA: card_fee_pct 3.5 olmadi';
  END IF;
  IF (SELECT COALESCE(refund_psp_fee_pct, 0) FROM public.settings LIMIT 1) <> 3.5 THEN
    RAISE EXCEPTION 'DOGRULAMA: refund_psp_fee_pct 3.5 olmadi';
  END IF;

  -- 5) Ekran teklifi ile sunucu hesabı AYNI toplamı veriyor mu? (prensip 2.9)
  IF (public.get_card_fee_quote(400)->>'total')::numeric <> 420 THEN
    RAISE EXCEPTION 'DOGRULAMA: ekran teklifi 420 dondurmedi — ekran ile kart ayrisir';
  END IF;

  -- 6) prepare_card_payment gerçekten yuvarlamayı çağırıyor mu?
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'prepare_card_payment'
      AND p.prosrc LIKE '%_odeme_yuvarla%'
  ) THEN
    RAISE EXCEPTION 'DOGRULAMA: prepare_card_payment hala eski hesabi kullaniyor';
  END IF;

  RAISE NOTICE 'DOGRULAMA TAMAM: kullanici artik hep 10un katini oduyor; oran %%3,5.';
END $dog$;
