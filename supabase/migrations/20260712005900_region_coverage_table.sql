-- Bölge kapsama + idari sınırlar. Harita (sarı sınır çizimi), keşif filtresi
-- ve bölge seçici bu tablodan beslenir; admin panelden yönetilir.
CREATE TABLE IF NOT EXISTS public.region_coverage (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city        text NOT NULL,
  district    text,                          -- NULL = tüm il
  is_active   boolean NOT NULL DEFAULT true, -- admin hizmet kapsamını buradan açar/kapatır
  boundary    jsonb,                         -- GeoJSON geometry (Polygon/MultiPolygon)
  center_lat  double precision,
  center_lng  double precision,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES public.profiles(id)
);

-- Aynı il/ilçe iki kez olamaz (district NULL için de tekillik).
CREATE UNIQUE INDEX IF NOT EXISTS uq_region_coverage_city_district
  ON public.region_coverage (city, COALESCE(district, ''));

CREATE INDEX IF NOT EXISTS idx_region_coverage_active
  ON public.region_coverage (is_active) WHERE is_active = true;

ALTER TABLE public.region_coverage ENABLE ROW LEVEL SECURITY;

-- Herkes AKTİF kapsamı okuyabilir (harita/keşif public gösterim).
DROP POLICY IF EXISTS "region_coverage_read_active" ON public.region_coverage;
CREATE POLICY "region_coverage_read_active" ON public.region_coverage
  FOR SELECT USING (is_active = true OR public.is_platform_admin());

-- Yalnız platform admin yazar (kapsama aç/kapat, sınır güncelle).
DROP POLICY IF EXISTS "region_coverage_admin_write" ON public.region_coverage;
CREATE POLICY "region_coverage_admin_write" ON public.region_coverage
  FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- updated_at otomatik
CREATE OR REPLACE FUNCTION public.touch_region_coverage()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_touch_region_coverage ON public.region_coverage;
CREATE TRIGGER trg_touch_region_coverage BEFORE UPDATE ON public.region_coverage
  FOR EACH ROW EXECUTE FUNCTION public.touch_region_coverage();
