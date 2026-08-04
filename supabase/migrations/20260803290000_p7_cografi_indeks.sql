-- ════════════════════════════════════════════════════════════════════════════
-- [P-7 / M-11] COĞRAFİ SORGU İNDEKSLE UYUMLU HALE GETİRİLDİ
-- ────────────────────────────────────────────────────────────────────────────
-- SORUN (canlı EXPLAIN ile ölçüldü):
--   Seq Scan on pitches pt
--     Filter: (sec_to_gc(cube_distance(...)) <= '25000'::double precision)
--
--   `pitches_geo_idx` (GiST, ll_to_earth(latitude, longitude)) HİÇ KULLANILMIYOR.
--   İndeks kullanım sayacı: pitches_geo_idx = 164, pitches_pkey = 38.239.
--
--   Sebep: `earth_distance(a, b) <= r` yazımı GiST indeksiyle eşleşmez.
--   İndeksin beklediği form: `ll_to_earth(lat, lon) <@ earth_box(merkez, r)`
--
--   Bugün 4 saha var, sorgu 1,9 ms — sorun görünmüyor. 5.000 sahada tahmini
--   60–120 ms/çağrı ve maliyet YARIÇAPTAN BAĞIMSIZ: 5 km aramak 100 km
--   aramakla aynı. Ana sayfa açılışında bölge başına çağrılıyor.
--
-- ÇÖZÜM — iki aşamalı filtre:
--   1. `<@ earth_box(...)` → İNDEKSLİ ön eleme (küp şeklinde kaba alan)
--   2. `earth_distance(...) <=` → kesin daire filtresi (küp fazlasını atar)
--   Sonuç aynı, ama tarama artık indeksten geçiyor.
--
--   NOT: earth_box küp olduğu için daireden geniştir; 2. filtre ŞART, aksi
--   halde yarıçap dışındaki köşe sahalar da dönerdi.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_nearby_pitches(
  p_lat double precision, p_lon double precision, p_radius_km double precision DEFAULT 25)
RETURNS TABLE(id uuid, distance_km double precision)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp', 'extensions'
AS $function$
  SELECT pt.id,
         earth_distance(ll_to_earth(p_lat, p_lon), ll_to_earth(pt.latitude, pt.longitude)) / 1000.0 AS distance_km
  FROM public.pitches pt
  WHERE pt.is_open IS TRUE
    AND pt.is_published IS DISTINCT FROM false
    AND COALESCE(pt.is_demo, false) = false
    AND pt.latitude IS NOT NULL AND pt.longitude IS NOT NULL
    -- Fotoğrafsız tesis vitrine çıkmaz (kullanıcı kararı).
    AND COALESCE(NULLIF(btrim(pt.image), ''), NULL) IS NOT NULL
    -- [P-7/M-11] 1. AŞAMA: indeksli kaba eleme (pitches_geo_idx bunu kullanır)
    AND ll_to_earth(pt.latitude, pt.longitude)
        <@ earth_box(ll_to_earth(p_lat, p_lon), p_radius_km * 1000.0)
    -- 2. AŞAMA: kesin daire filtresi (earth_box kup oldugu icin fazlasi atilir)
    AND earth_distance(ll_to_earth(p_lat, p_lon), ll_to_earth(pt.latitude, pt.longitude)) <= p_radius_km * 1000.0
  ORDER BY 2 ASC;
$function$;

COMMENT ON FUNCTION public.get_nearby_pitches(double precision, double precision, double precision) IS
  'P-7/M-11: earth_box on elemesi pitches_geo_idx GiST indeksini kullanir; earth_distance kesin filtre olarak kalir. Sonuc kumesi degismez.';

-- ════════════════════════════════════════════════════════════════════════════
-- GERİ ALMA: earth_box satırı silinerek yeniden tanımlanır (yalnız yavaşlar).
-- ════════════════════════════════════════════════════════════════════════════
