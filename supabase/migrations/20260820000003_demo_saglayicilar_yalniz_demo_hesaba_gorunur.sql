-- ═══════════════════════════════════════════════════════════════════════════
-- DEMO KALECİ/HAKEMLER YALNIZ DEMO HESABA GÖRÜNÜR (kurucu kararı, 20 Ağu 2026)
--
-- SORUN: `get_nearby_providers` demo sağlayıcıları HERKESTEN gizliyordu. Kural
-- doğruydu — gerçek bir oyuncu sahte bir kaleciye talep gönderemez. Ama bugün
-- sistemdeki TÜM kaleci/hakemler demo olduğundan pazar yeri HERKES için boştu:
-- mağaza incelemecisi "KALECİ · Müsait yok" görüp bu özelliği hiç test edemiyor
-- ve uygulamanın yarısı ona kapalı kalıyordu.
--
-- ÇÖZÜM — ÇAĞIRANA GÖRE: demo sağlayıcı YALNIZ demo hesapla giren birine
-- görünür. Gerçek kullanıcı için hiçbir şey değişmez; sahte kaleci ona ASLA
-- listelenmez. Yani inceleme deneyimi tamamlanırken gerçek kullanıcı garantisi
-- olduğu gibi korunur.
--
-- NEDEN İSTEMCİDE DEĞİL SUNUCUDA: arayüzde "demo isem göster" demek, kuralı
-- pakete taşımak olurdu — paketi değiştiren biri filtreyi kaldırabilirdi.
-- Kapı sunucuda (prensip 6.1: kapı arayüze güvenmez).
-- ═══════════════════════════════════════════════════════════════════════════

-- Çağıran demo hesap mı? SECURITY DEFINER — profiles RLS'i bu kontrolü engellemesin.
CREATE OR REPLACE FUNCTION public._cagiran_demo_mu()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles me
    WHERE me.id = auth.uid() AND COALESCE(me.is_demo, false) = true
  );
$$;

REVOKE ALL ON FUNCTION public._cagiran_demo_mu() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._cagiran_demo_mu() TO authenticated, service_role;

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
    -- DEMO KAPISI: demo sağlayıcı yalnız demo hesaba görünür.
    AND (
      (COALESCE(g."isDemo", false) = false AND COALESCE(p.is_demo, false) = false)
      OR public._cagiran_demo_mu()
    )
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
    AND (
      (COALESCE(r."isDemo", false) = false AND COALESCE(p.is_demo, false) = false)
      OR public._cagiran_demo_mu()
    )
    AND r.coordinates IS NOT NULL
    AND (r.coordinates->>'lat') IS NOT NULL AND (r.coordinates->>'lng') IS NOT NULL
    AND earth_distance(
          ll_to_earth(p_lat, p_lon),
          ll_to_earth((r.coordinates->>'lat')::double precision, (r.coordinates->>'lng')::double precision)
        ) <= p_radius_km * 1000.0

  ORDER BY 2 ASC;
$function$;

-- ── Kendi kendini doğrulama ────────────────────────────────────────────────
DO $$
DECLARE v_def text; v_anon int; v_demo int; v_demo_id uuid;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='get_nearby_providers';
  IF v_def NOT LIKE '%_cagiran_demo_mu%' THEN
    RAISE EXCEPTION 'DOĞRULAMA: demo kapısı eklenmemiş.';
  END IF;

  -- Oturumsuz (gerçek kullanıcı benzeri): demo sağlayıcı GÖRÜNMEMELİ.
  SELECT count(*) INTO v_anon FROM public.get_nearby_providers(40.9862, 37.8797, 25, 'GK');
  IF v_anon <> 0 THEN
    RAISE EXCEPTION 'DOĞRULAMA: oturumsuz çağrıda demo kaleci sızıyor (%).', v_anon;
  END IF;

  -- Demo hesap kimliğiyle: görünmeli.
  SELECT id INTO v_demo_id FROM public.profiles WHERE is_demo AND role = 'PLAYER' LIMIT 1;
  PERFORM set_config('request.jwt.claim.sub', v_demo_id::text, true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_demo_id, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO v_demo FROM public.get_nearby_providers(40.9862, 37.8797, 25, 'GK');
  IF v_demo < 1 THEN
    RAISE EXCEPTION 'DOĞRULAMA: demo hesaba kaleci görünmüyor (%).', v_demo;
  END IF;

  RAISE NOTICE 'Demo kapısı: oturumsuz % kaleci, demo hesapta % kaleci.', v_anon, v_demo;
END $$;
