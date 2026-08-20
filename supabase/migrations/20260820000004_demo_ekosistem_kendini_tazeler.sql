-- ═══════════════════════════════════════════════════════════════════════════
-- DEMO EKOSİSTEMİ KENDİNİ TAZELER (kurucu kararı, 20 Ağu 2026)
--
-- SORUN: `demo_ekosistem_kur` maçları BUGÜNE GÖRE üretiyor (-14 … +10 gün).
-- Bir kez çalıştırıldığında ekosistem canlı görünür; ama takvim ilerledikçe
-- maçlar geçmişte kalır. Bugün en son maç 9 Eylül'de bitiyordu — o tarihten
-- sonra mağaza incelemecisi (ya da kurucu) girdiğinde vitrin BOŞ açılacaktı ve
-- uygulama "içi boş" görünecekti. Kimse bunu hatırlamak zorunda kalmamalı.
--
-- ÇÖZÜM: günlük çalışan bir bekçi. Gelecekteki demo maç sayısı eşiğin altına
-- düşerse ekosistemi yeniden kurar; düşmediyse HİÇBİR ŞEY YAPMAZ.
--
-- NEDEN HER GÜN KÖRÜ KÖRÜNE KURMUYORUZ: `demo_ekosistem_kur` önce mevcut demo
-- ekosistemini siler. Her gece silip yeniden kurmak, incelemecinin dün katıldığı
-- maçı altından çekerdi. Eşik kontrolü, ekosistem gerçekten tükenmedikçe
-- dokunmamayı sağlar (kendi kendini iyileştiren ama huzursuz etmeyen bekçi).
--
-- GÜVENLİK: `demo_ekosistem_temizle` YALNIZ '_demo_ekosistem' etiketli satırları
-- ve `demo_ekosistem_kayit` tablosundaki maçları siler — gerçek kullanıcı
-- verisine dokunmaz. Fonksiyonlar anon/authenticated'a KAPALI; yalnız cron
-- (postgres) ve service_role çağırabilir.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.demo_ekosistem_tazele(p_esik integer DEFAULT 6)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_gelecek int;
  v_sonuc jsonb;
BEGIN
  SELECT count(*) INTO v_gelecek
  FROM public.matches m
  WHERE m.cancel_reason = '_demo_ekosistem'
    AND m.starts_at > now()
    AND COALESCE(m.status, '') <> 'CANCELLED';

  IF v_gelecek >= GREATEST(COALESCE(p_esik, 6), 1) THEN
    RETURN jsonb_build_object('tazelendi', false, 'gelecek_mac', v_gelecek,
                              'sebep', 'ekosistem yeterince dolu');
  END IF;

  -- Tükendi: yeniden kur (geçmiş 14 gün + gelecek 10 gün).
  v_sonuc := public.demo_ekosistem_kur(10, 14);

  SELECT count(*) INTO v_gelecek
  FROM public.matches m
  WHERE m.cancel_reason = '_demo_ekosistem'
    AND m.starts_at > now()
    AND COALESCE(m.status, '') <> 'CANCELLED';

  RETURN jsonb_build_object('tazelendi', true, 'gelecek_mac', v_gelecek, 'kurulum', v_sonuc);
END;
$function$;

REVOKE ALL ON FUNCTION public.demo_ekosistem_tazele(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.demo_ekosistem_tazele(integer) TO service_role;

-- ── Günlük bekçi: 00:20 UTC = 03:20 Europe/Istanbul (en sakin saat) ────────
SELECT cron.unschedule('demo_ekosistem_tazeleme')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'demo_ekosistem_tazeleme');

SELECT cron.schedule(
  'demo_ekosistem_tazeleme',
  '20 0 * * *',
  $$SELECT public.demo_ekosistem_tazele(6);$$
);

-- ── Kendi kendini doğrulama ────────────────────────────────────────────────
DO $$
DECLARE v_var boolean; v_yetki boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'demo_ekosistem_tazeleme' AND active)
    INTO v_var;
  IF NOT v_var THEN RAISE EXCEPTION 'DOĞRULAMA: tazeleme cron''u kurulmadı.'; END IF;

  SELECT has_function_privilege('authenticated', 'public.demo_ekosistem_tazele(integer)', 'EXECUTE')
    INTO v_yetki;
  IF v_yetki THEN
    RAISE EXCEPTION 'DOĞRULAMA: tazeleme fonksiyonu son kullanıcıya açık kalmış.';
  END IF;
END $$;
