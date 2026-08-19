-- ════════════════════════════════════════════════════════════════════════════
-- MAĞAZA İNCELEMESİ İÇİN SİMÜLASYON ÖDEMESİ
-- ----------------------------------------------------------------------------
-- KURUCU KARARI (19 Ağustos 2026): "Sandbox bağlı her kullanıcının kendi hayali
-- kartlarıyla işlem yapabilmesini sağla." Sorulduğunda ödeme motoru olarak
-- SİMÜLASYON seçildi — anahtar gerektirmiyor, bugün çalışıyor.
--
-- ── ÖNCE ÇIKAN ENGEL ───────────────────────────────────────────────────────
-- `resolve_payment_mode` içinde SIMULATION bilerek "canlı değil" sayılıyordu:
--     v_provider_live := (v_provider <> 'SIMULATION' AND v_provider <> 'DISABLED');
-- Yani sağlayıcıyı simülasyona almak online ödemeyi TAMAMEN KAPATIYORDU —
-- istediğimizin tam tersi. Bu kilit DOĞRU ve yerinde: canlı olmayan bir
-- sağlayıcıyla gerçek para teklif edilmemeli.
--
-- ── ÇÖZÜM: KİLİDİ KALDIRMA, ADI KONMUŞ BİR İSTİSNA EKLE ───────────────────
-- `simulation_counts_as_live` — varsayılanı KAPALI, tek satırla geri alınır.
-- Açıkken SIMULATION "canlı" sayılır ve online ödeme teklif edilir; kart
-- ÇEKİLMEZ, her kart kabul edilir.
--
-- CANLIYA GEÇERKEN İKİSİ BİRLİKTE: `payment_provider` IYZICO yapılacak VE bu
-- anahtar kapatılacak. Tek başına biri yapılırsa gerçek para yolunda simülasyon
-- kalabilirdi; bu yüzden anahtarın adı ne yaptığını açıkça söylüyor.
--
-- Göçün doğrulaması bu geri-alınabilirliği KANITLIYOR: anahtar kapatılınca
-- kilidin geri geldiği sınanmadan göç geçmiyor.
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO public.app_config (key, value, value_type, category, label, description, is_public)
VALUES ('simulation_counts_as_live', 'false'::jsonb, 'boolean', 'ODEME',
        'Simülasyon Canlı Sayılsın (YALNIZ DEMO/İNCELEME)',
        'Açıkken SIMULATION sağlayıcısı "canlı" sayılır ve online ödeme teklif edilir. Kart ÇEKİLMEZ, her kart kabul edilir. Yalnız mağaza incelemesi ve demo için açılır; gerçek para alınmaya başlamadan ÖNCE kapatılmalıdır.',
        false)
ON CONFLICT (key) DO UPDATE SET label = EXCLUDED.label, description = EXCLUDED.description;

CREATE OR REPLACE FUNCTION public.resolve_payment_mode(p_pitch_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_global text; v_provider text; v_provider_live boolean; v_sim_canli boolean;
  v_pitch_mode text; v_locked boolean; v_effective text; v_reason text;
BEGIN
  v_global   := COALESCE(public.get_config_text('payment_mode_global', 'CASH_ONLY'), 'CASH_ONLY');
  v_provider := COALESCE(public.get_config_text('payment_provider', 'SIMULATION'), 'SIMULATION');
  v_sim_canli := COALESCE(public.get_config_bool('simulation_counts_as_live', false), false);

  IF v_global NOT IN ('CASH_ONLY','ONLINE_ONLY','HYBRID') THEN
    v_global := 'CASH_ONLY';
  END IF;

  -- GÜVENLİK KİLİDİ: sağlayıcı canlı değilse online ödeme teklif edilemez.
  -- TEK İSTİSNA: `simulation_counts_as_live` açıkken SIMULATION da canlı
  -- sayılır (demo/inceleme). Kilit yerinde; istisna adı konmuş, varsayılanı kapalı.
  v_provider_live := (
    v_provider IS NOT NULL
    AND v_provider <> 'DISABLED'
    AND (v_provider <> 'SIMULATION' OR v_sim_canli)
  );

  IF p_pitch_id IS NOT NULL THEN
    SELECT payment_mode, payment_mode_locked_by_admin
      INTO v_pitch_mode, v_locked
    FROM public.pitches WHERE id = p_pitch_id;
  END IF;

  v_pitch_mode := COALESCE(v_pitch_mode, 'CASH_ONLY');
  v_locked     := COALESCE(v_locked, false);

  IF NOT v_provider_live THEN
    v_effective := 'CASH_ONLY'; v_reason := 'PROVIDER_NOT_LIVE';
  ELSIF v_global = 'CASH_ONLY' THEN
    v_effective := 'CASH_ONLY'; v_reason := 'GLOBAL_CASH_ONLY';
  ELSIF v_global = 'ONLINE_ONLY' THEN
    v_effective := 'ONLINE_ONLY'; v_reason := 'GLOBAL_ONLINE_ONLY';
  ELSE
    v_effective := v_pitch_mode;
    v_reason    := CASE WHEN p_pitch_id IS NULL THEN 'GLOBAL_HYBRID' ELSE 'PITCH_CHOICE' END;
  END IF;

  RETURN jsonb_build_object(
    'effective_mode', v_effective,
    'global_mode',    v_global,
    'pitch_mode',     CASE WHEN p_pitch_id IS NULL THEN NULL ELSE v_pitch_mode END,
    'locked',         v_locked,
    'provider',       v_provider,
    'provider_live',  v_provider_live,
    'simulation',     (v_provider = 'SIMULATION'),
    'cash_allowed',   (v_effective IN ('CASH_ONLY','HYBRID')),
    'online_allowed', (v_effective IN ('ONLINE_ONLY','HYBRID')),
    'reason',         v_reason
  );
END;
$fn$;

-- ── İNCELEME AYARLARI (canlıya geçerken geri alınacak) ─────────────────────
UPDATE public.app_config SET value = '"SIMULATION"'::jsonb WHERE key = 'payment_provider';
UPDATE public.app_config SET value = 'true'::jsonb        WHERE key = 'simulation_counts_as_live';
-- Altı tesisin altısı da CASH_ONLY'ydi: uygulamadan rezervasyon tetikleyici
-- tarafından reddediliyordu, yani incelemeci hiçbir saha tutamazdı.
-- Hepsi tohum veri (sahipleri demo hesaplar); gerçek bir tesisin ayarı değişmiyor.
UPDATE public.pitches SET payment_mode = 'ONLINE_ONLY' WHERE payment_mode <> 'ONLINE_ONLY';

-- ── Doğrulama (prensip 7.7) ────────────────────────────────────────────────
DO $dog$
DECLARE v_m jsonb; v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.pitches LIMIT 1;
  v_m := public.resolve_payment_mode(v_id);
  IF NOT COALESCE((v_m->>'online_allowed')::boolean, false) THEN
    RAISE EXCEPTION 'DOGRULAMA: online odeme hala kapali (%)', v_m;
  END IF;
  IF (v_m->>'provider') <> 'SIMULATION' THEN
    RAISE EXCEPTION 'DOGRULAMA: saglayici SIMULATION degil (%)', v_m->>'provider';
  END IF;

  -- İstisnanın GERİ ALINABİLİR olduğu kanıtlanmadan bu göç geçmemeli.
  UPDATE public.app_config SET value = 'false'::jsonb WHERE key = 'simulation_counts_as_live';
  v_m := public.resolve_payment_mode(v_id);
  IF COALESCE((v_m->>'online_allowed')::boolean, false) THEN
    RAISE EXCEPTION 'DOGRULAMA: anahtar kapaliyken bile online acik — kilit bozulmus';
  END IF;
  UPDATE public.app_config SET value = 'true'::jsonb WHERE key = 'simulation_counts_as_live';

  RAISE NOTICE 'DOGRULAMA TAMAM: simulasyon ile online odeme acik, kilit geri alinabilir.';
END $dog$;
