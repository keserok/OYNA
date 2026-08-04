-- ════════════════════════════════════════════════════════════════════════════
-- [CTO-P0-2] İADE ORANI ARTIK SUNUCUDAN HESAPLANIYOR
-- ────────────────────────────────────────────────────────────────────────────
-- SORUN (canlıda doğrulandı):
--   process_tiered_refund(p_intent_id, p_hours_to_match, p_policy)
--   İade kademesini (tam iade / yarım / iade yok) İSTEMCİNİN GÖNDERDİĞİ
--   `p_hours_to_match` değerinden hesaplıyordu (satır 39-45).
--   Fonksiyon `authenticated` rolüne AÇIK.
--
--   Sahiplik kontrolü var (satır 20): başkasının ödemesine dokunulamıyor. İYİ.
--   AMA kullanıcı KENDİ ödemesi için "maça 100 saat var" diyebilir ve maç 1 saat
--   sonra olsa bile TAM İADE alabilirdi. Yani iade politikası sadece istemcinin
--   dürüstlüğüne dayanıyordu.
--
-- ÇÖZÜM:
--   Kalan saat, ödemenin bağlı olduğu kaydın GERÇEK başlangıç zamanından
--   hesaplanır:
--     • match_id varsa   → matches.starts_at
--     • booking_id varsa → booking_date + start_time (Europe/Istanbul)
--   Parametre geriye dönük uyumluluk için KALIR ama artık YOK SAYILIR.
--   Yalnız hiçbir kayda bağlı olmayan niyetlerde (ikisi de NULL) parametre
--   yedek olarak kullanılır — o durumda zaten manipüle edilecek bir kademe yok.
--
-- YÖNTEM: 82 satırlık fonksiyon elle kopyalanmıyor; canlı tanım okunup
--   hesaplama bloğu enjekte ediliyor. Enjeksiyon yapılamazsa migration HATA VERİR.
-- ════════════════════════════════════════════════════════════════════════════

DO $do$
DECLARE
  v_src  text;
  v_yeni text;
  v_ara  text;
  v_blok text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public' AND p.proname='process_tiered_refund';

  IF v_src IS NULL THEN
    RAISE EXCEPTION '[CTO-P0-2] process_tiered_refund bulunamadi.';
  END IF;

  IF position('[CTO-P0-2] SUNUCU SAATI' in v_src) > 0 THEN
    RAISE NOTICE '[CTO-P0-2] Zaten uygulanmis - atlaniyor.';
    RETURN;
  END IF;

  -- Değişken tanımı ekle
  v_ara := E'  v_rc     integer;\nBEGIN';
  IF position(v_ara in v_src) = 0 THEN
    RAISE EXCEPTION '[CTO-P0-2] DECLARE bloku bulunamadi - fonksiyon degismis.';
  END IF;
  v_src := replace(v_src, v_ara, E'  v_rc     integer;\n  v_hours  numeric;\n  v_start  timestamptz;\nBEGIN');

  -- Hesaplama bloğunu, ayarlar okunduktan HEMEN SONRA ve kademe kararından
  -- ÖNCE enjekte et.
  v_ara := E'  INTO s FROM public.settings LIMIT 1;';
  IF position(v_ara in v_src) = 0 THEN
    RAISE EXCEPTION '[CTO-P0-2] settings okuma satiri bulunamadi.';
  END IF;

  v_blok :=
       E'  INTO s FROM public.settings LIMIT 1;\n\n'
    || E'  -- [CTO-P0-2] SUNUCU SAATI: kademe artik istemciden gelen degere DEGIL,\n'
    || E'  -- kaydin gercek baslangic zamanina gore hesaplanir.\n'
    || E'  v_start := NULL;\n'
    || E'  IF v_intent.match_id IS NOT NULL THEN\n'
    || E'    SELECT starts_at INTO v_start FROM public.matches WHERE id = v_intent.match_id;\n'
    || E'  END IF;\n'
    || E'  IF v_start IS NULL AND v_intent.booking_id IS NOT NULL THEN\n'
    || E'    SELECT (booking_date + start_time) AT TIME ZONE ''Europe/Istanbul''\n'
    || E'      INTO v_start FROM public.pitch_bookings WHERE id = v_intent.booking_id;\n'
    || E'  END IF;\n'
    || E'  IF v_start IS NOT NULL THEN\n'
    || E'    v_hours := GREATEST(EXTRACT(EPOCH FROM (v_start - now())) / 3600.0, 0);\n'
    || E'  ELSE\n'
    || E'    -- Hicbir kayda bagli degil: manipule edilecek kademe yok, parametre yedek.\n'
    || E'    v_hours := COALESCE(p_hours_to_match, 0);\n'
    || E'  END IF;\n';

  v_src := replace(v_src, v_ara, v_blok);

  -- Kademe kararlarında parametre yerine sunucu hesabını kullan
  v_yeni := replace(v_src, 'p_hours_to_match >=', 'v_hours >=');

  IF v_yeni = v_src THEN
    RAISE EXCEPTION '[CTO-P0-2] Kademe karsilastirmalari degistirilemedi.';
  END IF;

  EXECUTE v_yeni;
  RAISE NOTICE '[CTO-P0-2] Iade orani artik sunucudan hesaplaniyor.';
END $do$;

-- ── Doğrulama ───────────────────────────────────────────────────────────────
DO $do$
DECLARE v_src text; v_kalan int;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='process_tiered_refund';

  SELECT count(*) INTO v_kalan FROM unnest(string_to_array(v_src, E'\n')) t(txt)
  WHERE txt ~ 'p_hours_to_match\s*>=';

  IF v_kalan > 0 THEN
    RAISE EXCEPTION '[CTO-P0-2] Hala % satirda istemci degeri kademe belirliyor.', v_kalan;
  END IF;
  IF position('v_hours >=' in v_src) = 0 THEN
    RAISE EXCEPTION '[CTO-P0-2] Sunucu hesabi kullanilmiyor.';
  END IF;
  RAISE NOTICE '[CTO-P0-2] Dogrulandi: kademe yalniz sunucu hesabindan.';
END $do$;

-- ════════════════════════════════════════════════════════════════════════════
-- GERİ ALMA (YAPMAYIN — iade politikası yeniden istemciye emanet edilir):
--   v_hours >= yerine p_hours_to_match >= yazılarak yeniden tanımlanır.
-- ════════════════════════════════════════════════════════════════════════════
