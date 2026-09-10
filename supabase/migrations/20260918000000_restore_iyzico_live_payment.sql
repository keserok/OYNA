-- ════════════════════════════════════════════════════════════════════════════
-- TEK TIKLA ÖDEME ALTYAPISINA (IYZICO) DÖNÜŞ VE SİMÜLASYONUN KAPATILMASI
-- ----------------------------------------------------------------------------
-- Kurucu Kararı (11 Eylül 2026): İban koyduğumuz işlemi iptal edip ödeme 
-- altyapılarıyla tek tıkla ödeme yapısına dönmemeizi istiyorum eski ekranları 
-- da geri getirerek bunu en mükkemmel şekilde yap. Veritabanını da yaptığın 
-- işlemle mükkemmel uyumlu olacak şekilde ayarla.
-- 
-- Apple App Store Guideline 5.6 ret sebebi olan "simülasyon" modunu kalıcı
-- olarak kapatır ve uygulamayı IYZICO canlı ödeme altyapısına bağlar.
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Ödeme sağlayıcısını SIMULATION'dan IYZICO'ya geçir
UPDATE public.app_config 
SET value = '"IYZICO"'::jsonb 
WHERE key = 'payment_provider';

-- 2. Simülasyonun canlı sayılması istisnasını kapat (Güvenlik kilidi devrede)
UPDATE public.app_config 
SET value = 'false'::jsonb 
WHERE key = 'simulation_counts_as_live';

-- 3. Küresel ödeme modunu ONLINE_ONLY olarak bırak (zaten öyleydi, teyit)
UPDATE public.app_config 
SET value = '"ONLINE_ONLY"'::jsonb 
WHERE key = 'payment_mode_global';

-- ── Doğrulama ──────────────────────────────────────────────────────────────
DO $dog$
DECLARE v_m jsonb; v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.pitches LIMIT 1;
  v_m := public.resolve_payment_mode(v_id);
  
  IF NOT COALESCE((v_m->>'online_allowed')::boolean, false) THEN
    RAISE EXCEPTION 'DOGRULAMA: online odeme IYZICO ile acilamadi (%)', v_m;
  END IF;
  
  IF (v_m->>'provider') <> 'IYZICO' THEN
    RAISE EXCEPTION 'DOGRULAMA: saglayici IYZICO degil (%)', v_m->>'provider';
  END IF;

  IF (v_m->>'simulation')::boolean = true THEN
    RAISE EXCEPTION 'DOGRULAMA: sistem hala simulasyon modunda (%)', v_m;
  END IF;

  RAISE NOTICE 'DOGRULAMA TAMAM: IYZICO ile canli online odeme devrede.';
END $dog$;
