-- ════════════════════════════════════════════════════════════════════════════
-- DEMO EKOSİSTEMİNE KALECİ/HAKEM İŞLERİ EKLENDİ
-- ----------------------------------------------------------------------------
-- BULUNAN EKSİK (canlı doğrulama, 19 Ağustos 2026): kurucunun isteği
-- "bu demo hesapla TÜM kaleci/hakem arayüzlerini test edebileyim"di. Hesap ve
-- roller kuruldu, kaleci/hakem kayıtları onaylandı — ama `service_requests`
-- tablosu BOŞTU (0 satır).
--
-- Sağlayıcı panelinin bütün içeriği bu tablodan gelir: gelen iş talepleri,
-- kabul/ret, yaklaşan görevler, geçmiş ve hakediş. Boş tabloyla panel açılıyor
-- ama İÇİ BOŞ — yani "arayüzü test etmek" mümkün değil. İncelemeci için de
-- aynısı: kaleci hesabına girip hiçbir şey göremezdi.
--
-- ── EKLENEN ───────────────────────────────────────────────────────────────
-- `_demo_hizmet_talepleri()` — demo maçlara sağlayıcı işleri bağlar ve
-- panelin render ettiği HER durumu üretir:
--   · PENDING  → gelen talep (kabul/ret düğmeleri denenebilir)
--   · ACCEPTED → yaklaşan görev (iptal/canlı durum akışı)
--   · COMPLETED→ geçmiş + hakediş (kazanç ekranı dolu)
-- Ücret gerçek kuralla bölünür: 400 ₺ → %15 komisyon → sağlayıcıya 340 ₺.
--
-- Tohumlayıcı bunu SONUNDA çağırır; ayrı bir düğme yok — kurucunun elinde tek
-- komut kalsın diye (`SELECT public.demo_ekosistem_kur();`).
--
-- TEMİZLİK: ayrı bir iş gerekmiyor. `service_requests.match_id` FK'si
-- ON DELETE CASCADE; demo maç silinince işler de gider.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._demo_hizmet_talepleri()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_gk uuid[]; v_ref uuid[]; v_say int := 0; v_i int := 0; r record;
  v_durum text; v_tip text; v_saglayici uuid;
BEGIN
  -- ONAYLI sağlayıcıların TAMAMI. Tek hesaba yığmak yanlıştı: incelemeci
  -- telefonla giremezse demo seçiciden `kaleci1@oyna.app` ile girer; işler
  -- yalnız telefon hesabındaysa o panel yine boş açılır.
  SELECT array_agg(id ORDER BY id) INTO v_gk
    FROM public.goalkeepers WHERE verification_status = 'approved';
  SELECT array_agg(id ORDER BY id) INTO v_ref
    FROM public.referees WHERE verification_status = 'approved';
  IF v_gk IS NULL AND v_ref IS NULL THEN RETURN 0; END IF;

  -- Kendi ürettiklerini temizle: fonksiyon tekrar çağrılabilir olmalı.
  DELETE FROM public.service_requests sr
   USING public.demo_ekosistem_kayit d
   WHERE d.match_id = sr.match_id;

  FOR r IN
    -- GEÇMİŞ 6 + GELECEK 12. İlk yazımda yalnız `ORDER BY starts_at LIMIT 15`
    -- vardı; tohumlayıcı 14 gün geçmiş ürettiği için hepsi geçmişe düşüyor ve
    -- panelde YALNIZ tamamlanmış iş çıkıyordu — kabul/ret denenemiyordu.
    (SELECT m.id, m."creatorId" AS kaptan, m.starts_at
       FROM public.matches m JOIN public.demo_ekosistem_kayit d ON d.match_id = m.id
      WHERE m."creatorId" IS NOT NULL AND m.starts_at <= now()
      ORDER BY m.starts_at DESC LIMIT 6)
    UNION ALL
    (SELECT m.id, m."creatorId", m.starts_at
       FROM public.matches m JOIN public.demo_ekosistem_kayit d ON d.match_id = m.id
      WHERE m."creatorId" IS NOT NULL AND m.starts_at > now()
      ORDER BY m.starts_at ASC LIMIT 12)
  LOOP
    v_i := v_i + 1;

    IF r.starts_at <= now() THEN
      v_durum := 'COMPLETED';                       -- geçmiş → hakediş/geçmiş ekranı
    ELSIF (v_i / 2) % 2 = 0 THEN
      -- DURUM ve TİP ayrı sayaçtan: ikisi de `v_i % 2`ye bağlıyken kaleciler
      -- hep ACCEPTED, hakemler hep PENDING alıyordu — yani demo seçiciden
      -- kaleci1 ile giren biri kabul/ret akışını hiç deneyemiyordu.
      v_durum := 'PENDING';                         -- gelen talep → kabul/ret
    ELSE
      v_durum := 'ACCEPTED';                        -- yaklaşan görev
    END IF;

    -- Kaleci ve hakem dönüşümlü; sağlayıcılar arasında sırayla dağıt.
    IF v_i % 2 = 0 AND v_ref IS NOT NULL THEN
      v_tip := 'REF'; v_saglayici := v_ref[1 + (v_i % array_length(v_ref, 1))];
    ELSIF v_gk IS NOT NULL THEN
      v_tip := 'GK';  v_saglayici := v_gk[1 + (v_i % array_length(v_gk, 1))];
    ELSE
      CONTINUE;
    END IF;

    CONTINUE WHEN r.kaptan = v_saglayici;           -- kaptan kendine iş veremez

    INSERT INTO public.service_requests (
      match_id, provider_id, provider_type, requested_by,
      fee, commission_amount, provider_amount,
      status, initiated_by, team_side,
      accepted_at, completed_at, provider_confirmed, captain_confirmed,
      payout_released, created_at)
    VALUES (
      r.id, v_saglayici, v_tip, r.kaptan,
      400, 60, 340,
      v_durum, 'CAPTAIN', 'HOME',
      CASE WHEN v_durum IN ('ACCEPTED','COMPLETED') THEN r.starts_at - interval '2 days' END,
      CASE WHEN v_durum = 'COMPLETED' THEN r.starts_at + interval '1 hour' END,
      (v_durum = 'COMPLETED'), (v_durum = 'COMPLETED'),
      (v_durum = 'COMPLETED'),
      r.starts_at - interval '3 days')
    ON CONFLICT DO NOTHING;

    v_say := v_say + 1;
  END LOOP;

  RETURN v_say;
END;
$fn$;

REVOKE ALL ON FUNCTION public._demo_hizmet_talepleri() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._demo_hizmet_talepleri() TO service_role;

-- Telefon demo hesabının adı boştu: kaleci/hakem panelinde ve maç kadrosunda
-- isimsiz görünüyordu. İncelemecinin GİRDİĞİ hesap bu.
UPDATE public.profiles
   SET full_name = COALESCE(full_name, 'Demo Kaleci-Hakem'),
       name      = COALESCE(name, 'Demo Kaleci-Hakem')
 WHERE id = 'd0e51e00-0000-4000-8000-000000000001';

-- ── Tohumlayıcı sonunda bunu da çağırsın (yerinde dönüşüm) ─────────────────
DO $gov$
DECLARE
  v_def text;
  v_capa CONSTANT text := '  RETURN jsonb_build_object(''mac'', v_mac_say, ''rezervasyon'', v_rez_say,';
  v_yeni CONSTANT text := '  PERFORM public._demo_hizmet_talepleri();
  RETURN jsonb_build_object(''mac'', v_mac_say, ''rezervasyon'', v_rez_say,';
  v_adet int;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public' AND p.proname='demo_ekosistem_kur';
  IF v_def IS NULL THEN RAISE EXCEPTION 'DOGRULAMA: demo_ekosistem_kur yok'; END IF;

  IF position('_demo_hizmet_talepleri' in v_def) > 0 THEN
    RAISE NOTICE 'Cagri zaten var — dokunulmadi.';
    RETURN;
  END IF;

  v_adet := (length(v_def) - length(replace(v_def, v_capa, ''))) / length(v_capa);
  IF v_adet <> 1 THEN
    RAISE EXCEPTION 'DOGRULAMA: capa % kez bulundu, 1 bekleniyordu', v_adet;
  END IF;
  EXECUTE replace(v_def, v_capa, v_yeni);
END $gov$;

-- ── Doğrulama (prensip 7.7) ────────────────────────────────────────────────
-- ÇALIŞTIRMADAN sınanır: tohumlama bir operatör işidir, göç yalnız kodu kurar
-- (bkz. 20260912000001'de üç kez öğrenilen ders).
DO $dog$
DECLARE v_src text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='_demo_hizmet_talepleri'
  ) THEN
    RAISE EXCEPTION 'DOGRULAMA: yardimci kurulmadi';
  END IF;

  IF has_function_privilege('anon','public._demo_hizmet_talepleri()','EXECUTE')
     OR has_function_privilege('authenticated','public._demo_hizmet_talepleri()','EXECUTE') THEN
    RAISE EXCEPTION 'DOGRULAMA: demo yardimcisi uygulama rollerine acik';
  END IF;

  SELECT p.prosrc INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='demo_ekosistem_kur';
  IF position('_demo_hizmet_talepleri' in v_src) = 0 THEN
    RAISE EXCEPTION 'DOGRULAMA: tohumlayici yardimciyi cagirmiyor';
  END IF;

  RAISE NOTICE 'DOGRULAMA TAMAM: saglayici isleri tohumlayiciya baglandi.';
END $dog$;
