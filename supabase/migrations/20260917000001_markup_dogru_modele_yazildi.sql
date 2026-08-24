-- ════════════════════════════════════════════════════════════════════════════
-- DÜZELTME: %10 oyuncu payı YANLIŞ MODELE yazılmıştı (24 Ağustos 2026)
-- ════════════════════════════════════════════════════════════════════════════
--
-- 20260917000000 numaralı göç, maça katılım markup'ını GLOBAL/MODEL_B satırına
-- yazdı. Ama maç fiyatını hesaplayan zincir MODEL_B'yi HİÇ OKUMUYOR:
--
--   create_match_atomic
--     → _pitch_agreement(pitch_id)
--         → önce scope='PITCH' satırı (sahaya özel anlaşma)
--         → yoksa scope='GLOBAL' AND model='MODEL_A'      ← DAİMA BURAYA DÜŞER
--     → _markup_tutari(slot_ucreti, anlasma.markup_pct, …)
--     → per_person = CEIL((slot_ucreti + markup) / (oyuncu_sayisi))
--
-- Yani sahaya özel bir anlaşma yoksa (bugün hiçbir sahada yok) markup MODEL_A'dan
-- okunuyor; MODEL_B satırındaki 10 hiçbir zaman kullanılmıyordu. Sonuç: kurucunun
-- "300'den 330 olsun" kararı sessizce uygulanmıyor, oyuncu 300 ödemeye devam
-- ediyordu. Test rakamları doğru çıktığı için de fark edilmesi zordu:
-- `calculate_commission(300, …, 'MODEL_B')` doğrudan çağrıldığında 330 dönüyor,
-- ama GERÇEK maç akışı o çağrıyı hiç yapmıyor.
--
-- DÜZELTME: %10 her iki modele de yazılır. Bu, modelleri birbirine EŞİTLER —
-- ki zaten kurucu kararının amacı buydu: "lansmana TEK model ile çıkalım".
-- İki ad (MODEL_A/MODEL_B) tarihsel olarak duruyor; ikisi de aynı ticari
-- anlaşmayı anlatıyor.
--
-- KAPORA YİNE MARKUP'SIZ — bu düzeltme onu bozmaz. Doğrulandı: kaporayı
-- `_resolve_court_quote` üretir (tarifedeki `deposit_amount`) ve o zincirde
-- `_markup_tutari` HİÇ ÇAĞRILMAZ. Doğrudan saha rezervasyonu da markup okumaz.
-- Markup yalnız `create_match_atomic` içindeki KİŞİ BAŞI hesabına girer.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

UPDATE public.commission_config
   SET markup_pct = 10.0,
       markup_amount = 0,
       notes = 'Tesisten %8,5 kesinti (5,0 OYNA + 3,5 iyzico) + maça katılan '
               'oyuncunun kişi başı ücretine %10 ekleme. Kapora markupsızdır. '
               'Kurucu kararı 24 Ağu 2026.',
       updated_at = now()
 WHERE is_active AND scope = 'GLOBAL' AND model IN ('MODEL_A', 'MODEL_B');

-- Sabit kodlu son çare de aynı anlaşmayı söylemeli.
CREATE OR REPLACE FUNCTION public._pitch_agreement(p_pitch_id uuid)
 RETURNS TABLE(model text, rate_pct numeric, markup_pct numeric, markup_amount numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v RECORD;
BEGIN
  IF p_pitch_id IS NOT NULL THEN
    SELECT c.model, c.rate_pct, c.markup_pct, c.markup_amount INTO v
    FROM public.commission_config c
    WHERE c.is_active AND c.scope = 'PITCH' AND c.scope_id = p_pitch_id
    ORDER BY c.updated_at DESC NULLS LAST
    LIMIT 1;
    IF FOUND THEN
      model := v.model; rate_pct := v.rate_pct;
      markup_pct := COALESCE(v.markup_pct, 0); markup_amount := COALESCE(v.markup_amount, 0);
      RETURN NEXT; RETURN;
    END IF;
  END IF;

  SELECT c.model, c.rate_pct, c.markup_pct, c.markup_amount INTO v
  FROM public.commission_config c
  WHERE c.is_active AND c.scope = 'GLOBAL' AND c.model = 'MODEL_A'
  LIMIT 1;
  IF FOUND THEN
    model := v.model; rate_pct := v.rate_pct;
    markup_pct := COALESCE(v.markup_pct, 0); markup_amount := COALESCE(v.markup_amount, 0);
    RETURN NEXT; RETURN;
  END IF;

  -- SON ÇARE: yürürlükteki karar (8,5 kesinti · %10 oyuncu payı).
  model := 'MODEL_A'; rate_pct := 8.5; markup_pct := 10.0; markup_amount := 0;
  RETURN NEXT;
END; $function$;

-- ═══ DOĞRULAMA — GERÇEK zincir üzerinden (§7.7) ════════════════════════════
-- Önceki göçün doğrulaması `calculate_commission`'ı DOĞRUDAN çağırdığı için
-- kusuru göremedi. Bu sefer maç akışının okuduğu yerden okuyoruz.
DO $$
DECLARE
  v_a RECORD; v_kisi numeric; v_saha uuid;
BEGIN
  -- Maç akışının okuduğu anlaşma gerçekten %10 taşıyor mu?
  SELECT * INTO v_a FROM public._pitch_agreement(NULL);
  IF v_a.markup_pct <> 10.0 THEN
    RAISE EXCEPTION 'DOGRULAMA: mac akisinin okudugu markup 10 degil (%)', v_a.markup_pct;
  END IF;
  IF v_a.rate_pct <> 8.5 THEN
    RAISE EXCEPTION 'DOGRULAMA: mac akisinin okudugu kesinti 8,5 degil (%)', v_a.rate_pct;
  END IF;

  -- Var olan HER saha için de aynı sonuç çıkmalı (sahaya özel anlaşma yok).
  FOR v_saha IN SELECT id FROM public.pitches WHERE is_active LOOP
    SELECT * INTO v_a FROM public._pitch_agreement(v_saha);
    IF v_a.markup_pct <> 10.0 OR v_a.rate_pct <> 8.5 THEN
      RAISE EXCEPTION 'DOGRULAMA: % sahasinda anlasma 8,5/10 degil (% / %)',
        v_saha, v_a.rate_pct, v_a.markup_pct;
    END IF;
  END LOOP;

  -- create_match_atomic'in kisi basi hesabinin birebir ikizi:
  -- 2400 TL slot, 4v4 (8 oyuncu) → (2400 + %10) / 8 = 330
  SELECT * INTO v_a FROM public._pitch_agreement(NULL);
  v_kisi := CEIL((2400 + public._markup_tutari(2400, v_a.markup_pct, v_a.markup_amount)) / 8);
  IF v_kisi <> 330 THEN
    RAISE EXCEPTION 'DOGRULAMA: 2400 TL slot / 8 oyuncu icin kisi basi 330 degil (%)', v_kisi;
  END IF;

  -- Kapora markupsız kalmalı: tarifedeki deposit_amount'a dokunulmadı.
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='_resolve_court_quote'
       AND pg_get_functiondef(p.oid) LIKE '%_markup_tutari%'
  ) THEN
    RAISE EXCEPTION 'DOGRULAMA: kapora zincirine markup sizmis';
  END IF;

  RAISE NOTICE 'DOGRULAMA GECTI: mac akisi 8,5/10 · 2400/8 -> 330 · kapora markupsiz';
END $$;

COMMIT;
