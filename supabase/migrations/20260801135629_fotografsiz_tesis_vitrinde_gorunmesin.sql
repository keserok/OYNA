-- ════════════════════════════════════════════════════════════════════════════
-- FOTOĞRAFSIZ TESİS VİTRİNDE GÖRÜNMESİN
-- ════════════════════════════════════════════════════════════════════════════
-- KULLANICI KARARI: "fotoğrafsız tesis mümkün olmasın."
--
-- Uygulanan kural (kademeli): mevcut tesisler ENGELLENMEZ — kimsenin işletmesi
-- bir anda kapanmaz — ama kapak fotoğrafı olmayan tesis oyuncu vitrininde
-- LİSTELENMEZ. Böylece oyuncu asla boş görsel kutusu görmez; tesis sahibi de
-- panelindeki uyarıyı görüp fotoğrafını ekleyince kendiliğinden geri gelir.
--
-- `pitches.image` (kapak) tek kontrol noktasıdır: pitch_media tablosuna
-- fotoğraf eklendiğinde DB trigger'ı bu alanı zaten otomatik dolduruyor.
--
-- ETKİ ÖLÇÜLDÜ: uygulama anında canlıdaki 6 tesisin TAMAMINDA kapak fotoğrafı
-- var (yayındaki 4 tesiste de). Yani bu değişiklik bugün hiçbir tesisi
-- gizlemiyor; ileriye dönük bir korumadır. Uygulama sonrası vitrin sayısı
-- yine 4 ölçüldü.
--
-- Dönüş tipi değişmedi → CREATE OR REPLACE yeterli, yetkiler korunur.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_nearby_pitches(
  p_lat double precision,
  p_lon double precision,
  p_radius_km double precision DEFAULT 25
)
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
    AND earth_distance(ll_to_earth(p_lat, p_lon), ll_to_earth(pt.latitude, pt.longitude)) <= p_radius_km * 1000.0
  ORDER BY 2 ASC;
$function$;
