-- ════════════════════════════════════════════════════════════════════════════
-- YAKIN SAĞLAYICI SAYACI RLS KURALINA HİZALANDI (26 Ağustos 2026)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Kurucu kararı: kaleci/hakem VİTRİNİ açıldı ve örnek sağlayıcılar herkese
-- görünüyor. Görünürlüğün tek kuralı RLS'te:
--
--   "isDemo" IS NOT TRUE  OR  get_config_bool('demo_mode_enabled')
--
-- `get_nearby_providers` ise kendi içinde KOŞULSUZ `isDemo=false` süzüyordu.
-- İki kural ayrışınca ana sayfa kartı "Müsait yok" derken vitrin 3 sağlayıcı
-- listeliyordu — aynı ekranda iki farklı gerçek (Apple 2.1'in tam tarifi).
--
-- Düzeltme: RPC, RLS ile AYNI ifadeyi kullanır. `demo_mode_enabled` bir
-- sunucu ayarıdır ve herkes için aynı çalışır (5.6 uyumu); gerçek tesisler
-- geldiğinde ayar kapatılır ve örnek sağlayıcılar HER İKİ yüzeyden birden
-- kaybolur — kural tek yerde yaşar.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_nearby_providers(
  p_lat double precision, p_lon double precision,
  p_radius_km double precision DEFAULT 25, p_type text DEFAULT 'GK'::text)
 RETURNS TABLE(id uuid, distance_km double precision)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp', 'extensions'
AS $function$
  SELECT g.id,
         earth_distance(
           ll_to_earth(p_lat, p_lon),
           ll_to_earth((g.coordinates->>'lat')::double precision, (g.coordinates->>'lng')::double precision)
         ) / 1000.0 AS distance_km
  FROM public.goalkeepers g
  JOIN public.profiles p ON p.id = g.id
  WHERE p_type = 'GK'
    AND p.verification_status = 'approved'
    AND COALESCE(p.is_available, true) = true
    -- RLS'teki görünürlük kuralının birebir aynısı (goalkeepers_select_auth):
    AND (COALESCE(g."isDemo", false) = false OR public.get_config_bool('demo_mode_enabled'))
    AND (COALESCE(p.is_demo, false) = false OR public.get_config_bool('demo_mode_enabled'))
    AND g.coordinates IS NOT NULL
    AND (g.coordinates->>'lat') IS NOT NULL AND (g.coordinates->>'lng') IS NOT NULL
    AND earth_distance(
          ll_to_earth(p_lat, p_lon),
          ll_to_earth((g.coordinates->>'lat')::double precision, (g.coordinates->>'lng')::double precision)
        ) <= p_radius_km * 1000.0

  UNION ALL

  SELECT r.id,
         earth_distance(
           ll_to_earth(p_lat, p_lon),
           ll_to_earth((r.coordinates->>'lat')::double precision, (r.coordinates->>'lng')::double precision)
         ) / 1000.0 AS distance_km
  FROM public.referees r
  JOIN public.profiles p ON p.id = r.id
  WHERE p_type = 'REF'
    AND p.verification_status = 'approved'
    AND COALESCE(p.is_available, true) = true
    AND (COALESCE(r."isDemo", false) = false OR public.get_config_bool('demo_mode_enabled'))
    AND (COALESCE(p.is_demo, false) = false OR public.get_config_bool('demo_mode_enabled'))
    AND r.coordinates IS NOT NULL
    AND (r.coordinates->>'lat') IS NOT NULL AND (r.coordinates->>'lng') IS NOT NULL
    AND earth_distance(
          ll_to_earth(p_lat, p_lon),
          ll_to_earth((r.coordinates->>'lat')::double precision, (r.coordinates->>'lng')::double precision)
        ) <= p_radius_km * 1000.0

  ORDER BY 2 ASC;
$function$;

-- ═══ DOĞRULAMA (§7.7) ══════════════════════════════════════════════════════
DO $$
DECLARE v_gk int; v_ref int;
BEGIN
  -- demo_mode_enabled bugün AÇIK: Altınordu merkezli aramada örnek
  -- sağlayıcılar sayılmalı (koordinatı olan 2 kaleci + 2 hakem demo).
  SELECT count(*) INTO v_gk  FROM public.get_nearby_providers(40.9839, 37.8764, 50, 'GK');
  SELECT count(*) INTO v_ref FROM public.get_nearby_providers(40.9839, 37.8764, 50, 'REF');
  IF v_gk < 1 OR v_ref < 1 THEN
    RAISE EXCEPTION 'DOGRULAMA: sayac hala bos donuyor (GK=%, REF=%)', v_gk, v_ref;
  END IF;
  RAISE NOTICE 'DOGRULAMA GECTI: yakin sayaci GK=% REF=% donduruyor', v_gk, v_ref;
END $$;
