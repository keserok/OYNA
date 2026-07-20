-- KB-8: find_providers_for_match artık sağlayıcının UYGUNLUK PENCERESİNİ onurlandırır:
--   • BÖLGE (preferredZones) — maç konumu (matches.location) sağlayıcının hizmet
--     bölgeleriyle örtüşüyor mu?
--   • GÜN + SAAT (working_hours) — maçın günü/saati sağlayıcının aktif penceresinde mi?
--
-- TASARIM: DEFANSİF filtre. Veri yoksa / göreli ("Bugün") / ayrıştırılamıyorsa
-- ELEMEZ (dahil eder) — yanlış-dışlama (false negative) sağlayıcıyı görünmez yapmaktan
-- daha kötü olurdu. Yalnız veri İYİ TANIMLIYSA hard-filtre uygulanır.

-- ─── Bölge örtüşmesi ─────────────────────────────────────────────────────────
-- preferredZones DB'de JSONB dizidir (text[] değil): ["Ordu / Altınordu", ...].
CREATE OR REPLACE FUNCTION public._provider_serves_zone(p_zones jsonb, p_location text)
 RETURNS boolean
 LANGUAGE sql IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE
    WHEN p_zones IS NULL OR jsonb_typeof(p_zones) <> 'array' OR jsonb_array_length(p_zones) = 0 THEN true  -- bölge yok → her yer
    WHEN p_location IS NULL OR btrim(p_location) = '' THEN true                  -- konum yok → eleme yok
    ELSE
      -- zone parçalarından (şehir/ilçe, ≥3 harf) herhangi biri konumda KELİME olarak
      -- geçiyor mu? Kelime-sınırı (\y) şart: aksi halde "Ordu" ⊂ "Altınordu" gibi
      -- alt-dize yanlış-eşleşmesi olur (substring değil, tam kelime).
      EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(p_zones) z, unnest(string_to_array(z, '/')) part
        WHERE length(btrim(part)) >= 3
          AND lower(p_location) ~ ('\y' || lower(btrim(part)) || '\y')
      )
  END;
$function$;

-- ─── Gün + Saat penceresi ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._provider_serves_schedule(p_wh jsonb, p_starts_at timestamptz)
 RETURNS boolean
 LANGUAGE plpgsql IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_days jsonb; v_hours text; v_start text; v_end text;
  v_match_t time; v_s time; v_e time; v_dow int; v_tr_day text;
  v_day_ok boolean := true; v_time_ok boolean := true;
BEGIN
  IF p_wh IS NULL OR p_starts_at IS NULL THEN RETURN true; END IF;

  -- ── GÜN ──
  v_days := p_wh->'activeDays';
  IF v_days IS NOT NULL AND jsonb_typeof(v_days) = 'array' AND jsonb_array_length(v_days) > 0 THEN
    v_dow := extract(dow from (p_starts_at AT TIME ZONE 'Europe/Istanbul'))::int; -- 0=Pazar..6=Cumartesi
    v_tr_day := (ARRAY['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi'])[v_dow + 1];
    -- Göreli/özel değerler ('Bugün','Hafta içi'...) → gün elemesini ATLA (dahil et).
    IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_days) d
               WHERE d IN ('Bugün','Yarın','Hafta içi','Hafta sonu','Her gün','Hergün')) THEN
      v_day_ok := true;
    ELSE
      v_day_ok := EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_days) d
                          WHERE lower(btrim(d)) = lower(v_tr_day));
    END IF;
  END IF;

  -- ── SAAT ── "HH:MM - HH:MM"
  v_hours := p_wh->>'activeHours';
  IF v_hours IS NOT NULL AND v_hours ~ '\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}' THEN
    v_start := btrim(split_part(v_hours, '-', 1));
    v_end   := btrim(split_part(v_hours, '-', 2));
    BEGIN
      v_s := v_start::time; v_e := v_end::time;
      v_match_t := (p_starts_at AT TIME ZONE 'Europe/Istanbul')::time;
      IF v_e >= v_s THEN
        v_time_ok := (v_match_t >= v_s AND v_match_t <= v_e);
      ELSE -- gece-aşan pencere (ör. 22:00 - 02:00)
        v_time_ok := (v_match_t >= v_s OR v_match_t <= v_e);
      END IF;
    EXCEPTION WHEN OTHERS THEN v_time_ok := true; -- ayrıştırılamadı → eleme yok
    END;
  END IF;

  RETURN v_day_ok AND v_time_ok;
END;
$function$;

-- ─── find_providers_for_match: bölge + gün/saat filtreleri (showProfile korunur) ─
CREATE OR REPLACE FUNCTION public.find_providers_for_match(p_match_id uuid, p_provider_type text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_match RECORD; v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_provider_type NOT IN ('GK','REF') THEN RAISE EXCEPTION 'INVALID_TYPE'; END IF;
  SELECT id, starts_at, status, "creatorId", captain_id, location INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_match."creatorId" IS DISTINCT FROM v_uid AND v_match.captain_id IS DISTINCT FROM v_uid AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: Yalniz mac sahibi/kaptan saglayici arayabilir.'; END IF;
  IF p_provider_type = 'GK' THEN
    SELECT jsonb_agg(row_to_json(t) ORDER BY t.rating DESC, t.match_count DESC, t.fee ASC) INTO v_result FROM (
      SELECT g.id, g.name, g.avatar, g.rating, g.fee, g."matchCount" AS match_count, g.style,
             g.height, g.age, g.skills, g.stats,
             g."preferredZones" AS preferred_zones, g.coordinates, g."isElite" AS is_elite
      FROM public.goalkeepers g JOIN public.profiles p ON p.id = g.id
      WHERE p.verification_status = 'approved' AND COALESCE(p.is_available, true) = true AND COALESCE(g."isDemo", false) = false
        AND COALESCE((g.settings->>'showProfile')::boolean, true) = true
        AND public._provider_serves_zone(g."preferredZones", v_match.location)
        AND public._provider_serves_schedule(g.working_hours, v_match.starts_at)
        AND NOT public._provider_has_conflict(g.id, v_match.starts_at, p_match_id)) t;
  ELSE
    SELECT jsonb_agg(row_to_json(t) ORDER BY t.rating DESC, t.match_count DESC, t.fee ASC) INTO v_result FROM (
      SELECT r.id, r.name, r.avatar, r.rating, r.fee, r."matchCount" AS match_count, r.level, r.style,
             r.stats,
             r."preferredZones" AS preferred_zones, r.coordinates, r."isElite" AS is_elite
      FROM public.referees r JOIN public.profiles p ON p.id = r.id
      WHERE p.verification_status = 'approved' AND COALESCE(p.is_available, true) = true AND COALESCE(r."isDemo", false) = false
        AND COALESCE((r.settings->>'showProfile')::boolean, true) = true
        AND public._provider_serves_zone(r."preferredZones", v_match.location)
        AND public._provider_serves_schedule(r.working_hours, v_match.starts_at)
        AND NOT public._provider_has_conflict(r.id, v_match.starts_at, p_match_id)) t;
  END IF;
  RETURN COALESCE(v_result, '[]'::jsonb);
END; $function$;
