-- ═══════════════════════════════════════════════════════════════════════════
-- DEMO SAĞLAYICI SIZINTISI — sahte kaleci/hakem gerçek vitrinde görünüyordu
--
-- NEDEN (17 Ağustos 2026, ödeme açıldıktan sonra vitrin denetlenirken bulundu):
-- Kaleci/hakem vitrini (`get_nearby_providers`) demo süzgecini YANLIŞ yerden
-- okuyordu: `goalkeepers."isDemo"` / `referees."isDemo"` sütunlarına bakıyordu.
-- Oysa demo işareti KİMLİKTE tutulur — `@oyna.app` adresli bir hesap açıldığında
-- tetikleyici `profiles.is_demo`'yu true yapar (kural 7.10). O işaret bu iki
-- tabloya HİÇ taşınmamıştı: canlıda 3 kaleci ve 2 hakem satırının profili demo,
-- tablo sütunu false idi.
--
-- Sonuç: gerçek kullanıcı — ve mağaza incelemecisi — Ordu vitrininde 1 sahte
-- kaleci ve 2 sahte hakem görüyordu. Saha vitrini (`get_nearby_pitches`) bu
-- kontrolü profilden yaptığı için aynı sorunu yaşamıyordu; iki vitrin farklı
-- kurala göre çalışıyordu.
--
-- İKİ KATLI DÜZELTME (biri olmadan diğeri yetmez):
--   1. YAPISAL: vitrin artık profili sorar. Kimlik tek doğruluk kaynağıdır;
--      yarın yeni bir demo hesap açıldığında kimse tabloyu güncellemeyi
--      unutamaz.
--   2. VERİ: mevcut satırlardaki işaret profille eşitlenir — tablo sütununu
--      okuyan BAŞKA yüzeyler (yönetim paneli, raporlar) de doğruyu görsün.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. VERİ: işareti kimlikten tabloya taşı ────────────────────────────────
UPDATE public.goalkeepers g
   SET "isDemo" = true
  FROM public.profiles p
 WHERE p.id = g.id
   AND COALESCE(p.is_demo, false) = true
   AND COALESCE(g."isDemo", false) = false;

UPDATE public.referees r
   SET "isDemo" = true
  FROM public.profiles p
 WHERE p.id = r.id
   AND COALESCE(p.is_demo, false) = true
   AND COALESCE(r."isDemo", false) = false;

-- ── 2. YAPISAL: vitrin profili sorsun ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_nearby_providers(
  p_lat double precision,
  p_lon double precision,
  p_radius_km double precision DEFAULT 25,
  p_type text DEFAULT 'GK'::text
)
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
    AND COALESCE(g."isDemo", false) = false
    -- Demo işaretinin ASIL kaynağı: kimlik. Tablo sütunu geride kalabilir.
    AND COALESCE(p.is_demo, false) = false
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
    AND COALESCE(r."isDemo", false) = false
    AND COALESCE(p.is_demo, false) = false
    AND r.coordinates IS NOT NULL
    AND (r.coordinates->>'lat') IS NOT NULL AND (r.coordinates->>'lng') IS NOT NULL
    AND earth_distance(
          ll_to_earth(p_lat, p_lon),
          ll_to_earth((r.coordinates->>'lat')::double precision, (r.coordinates->>'lng')::double precision)
        ) <= p_radius_km * 1000.0

  ORDER BY 2 ASC;
$function$;

-- ── KENDİNİ DOĞRULAMA ──────────────────────────────────────────────────────
DO $$
DECLARE
  v_src text;
  v_kacak int;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_nearby_providers';

  -- İki koldan İKİSİNDE de profil kontrolü olmalı (tek kola koymak yarım iştir).
  IF (length(v_src) - length(replace(v_src, 'COALESCE(p.is_demo, false) = false', ''))) / 34 < 2 THEN
    RAISE EXCEPTION 'DOGRULAMA: profil demo kontrolu iki kolda birden yok.';
  END IF;

  -- Tabloda profille çelişen satır kalmamalı.
  SELECT (SELECT count(*) FROM public.goalkeepers g JOIN public.profiles p ON p.id = g.id
           WHERE COALESCE(p.is_demo,false) AND NOT COALESCE(g."isDemo",false))
       + (SELECT count(*) FROM public.referees r JOIN public.profiles p ON p.id = r.id
           WHERE COALESCE(p.is_demo,false) AND NOT COALESCE(r."isDemo",false))
  INTO v_kacak;
  IF v_kacak <> 0 THEN
    RAISE EXCEPTION 'DOGRULAMA: % satirda tablo isareti profille celisiyor.', v_kacak;
  END IF;
END $$;
