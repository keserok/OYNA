-- ════════════════════════════════════════════════════════════════════════
-- HARİTA PİN ETİKETİ (map_label) — admin kontrollü
-- ------------------------------------------------------------------------
-- Vitrin haritasındaki saha pinleri artık fiyat yerine sahanın TEK İSMİNİ
-- gösterir. Bu isim admin panelinden (Saha Kurulum Merkezi) belirlenir:
-- map_label doluysa pinde o gösterilir, boşsa tam ad kullanılır.
-- map_label PUBLIC olarak haritada görünür → admin küratörlüğünde tutulur
-- (kötüye kullanım/yanıltıcı etiket önlenir): protect_pitch_admin_flags
-- trigger'ına eklenir, yazımı admin_update_pitch/admin_create_pitch'ten geçer.
-- Not: admin_*_pitch gövdeleri CANLI (prod) tanımdan okunarak korundu; yalnız
-- map_label satırları eklendi (drift uyumlulaştırma; canlı guard'lar korunur).
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE public.pitches ADD COLUMN IF NOT EXISTS map_label text;
COMMENT ON COLUMN public.pitches.map_label IS
  'Admin kontrollü: harita pininde fiyat yerine gösterilecek kısa isim. NULL/boş ise tam ad (name) kullanılır.';

-- ─── Admin-only koruma trigger'ı: map_label da eklenir ─────────────────────
CREATE OR REPLACE FUNCTION public.protect_pitch_admin_flags()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;
  IF NEW.is_featured             IS DISTINCT FROM OLD.is_featured
     OR NEW.flash_deals_enabled     IS DISTINCT FROM OLD.flash_deals_enabled
     OR NEW.show_availability_badge IS DISTINCT FROM OLD.show_availability_badge
     OR NEW.map_label               IS DISTINCT FROM OLD.map_label THEN
    RAISE EXCEPTION 'PITCH_ADMIN_FLAG_CHANGE_FORBIDDEN'
      USING HINT = 'Öne Çıkan / flash izni / müsaitlik rozeti / harita adı yalnız platform yöneticisi tarafından değiştirilebilir.';
  END IF;
  RETURN NEW;
END;
$$;

-- ─── admin_update_pitch: map_label'ı payload'dan al (canlı gövde korunur) ───
CREATE OR REPLACE FUNCTION public.admin_update_pitch(p_pitch_id uuid, p_payload jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_old JSONB;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  PERFORM public.require_admin_role(ARRAY['MODERATOR']);
  IF p_payload ? 'owner_id' AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Tesis sahipliği devri yalnız SUPER_ADMIN tarafından yapılabilir';
  END IF;
  SELECT to_jsonb(p.*) INTO v_old FROM public.pitches p WHERE id = p_pitch_id;
  IF v_old IS NULL THEN RAISE EXCEPTION 'Saha bulunamadı'; END IF;
  UPDATE public.pitches SET
    name = COALESCE(p_payload->>'name', name),
    district = COALESCE(p_payload->>'district', district),
    city = COALESCE(p_payload->>'city', city),
    address = COALESCE(p_payload->>'address', address),
    latitude = COALESCE((p_payload->>'latitude')::double precision, latitude),
    longitude = COALESCE((p_payload->>'longitude')::double precision, longitude),
    price_per_match = COALESCE((p_payload->>'price_per_match')::numeric, price_per_match),
    google_rating = COALESCE((p_payload->>'google_rating')::numeric, google_rating),
    google_review_count = COALESCE((p_payload->>'google_review_count')::int, google_review_count),
    verification_status = COALESCE(p_payload->>'verification_status', verification_status),
    image = COALESCE(p_payload->>'image', image),
    description = CASE WHEN p_payload ? 'description' THEN NULLIF(p_payload->>'description', '') ELSE description END,
    amenities = CASE WHEN p_payload ? 'amenities' THEN p_payload->'amenities' ELSE amenities END,
    working_hours = CASE WHEN p_payload ? 'working_hours' THEN p_payload->'working_hours' ELSE working_hours END,
    is_published = COALESCE((p_payload->>'is_published')::boolean, is_published),
    is_featured = COALESCE((p_payload->>'is_featured')::boolean, is_featured),
    flash_deals_enabled = COALESCE((p_payload->>'flash_deals_enabled')::boolean, flash_deals_enabled),
    show_availability_badge = COALESCE((p_payload->>'show_availability_badge')::boolean, show_availability_badge),
    map_label = CASE WHEN p_payload ? 'map_label' THEN NULLIF(p_payload->>'map_label', '') ELSE map_label END,
    is_active = COALESCE((p_payload->>'is_active')::boolean, is_active),
    owner_id = CASE WHEN p_payload ? 'owner_id' THEN NULLIF(p_payload->>'owner_id', '')::uuid ELSE owner_id END
  WHERE id = p_pitch_id;
  PERFORM public.log_admin_action('PITCH_UPDATE', 'pitch', p_pitch_id, p_payload->>'name', v_old, p_payload);
  RETURN TRUE;
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_update_pitch(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_pitch(uuid, jsonb) TO authenticated;

-- ─── admin_create_pitch: map_label'ı oluşturmada da kabul et (canlı gövde) ──
CREATE OR REPLACE FUNCTION public.admin_create_pitch(p_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_id UUID := COALESCE(NULLIF(p_payload->>'id', '')::uuid, gen_random_uuid());
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  PERFORM public.require_admin_role(ARRAY['MODERATOR']);
  INSERT INTO public.pitches (
    id, name, district, city, latitude, longitude,
    price_per_match, google_rating, google_review_count,
    verification_status, owner_id, image, is_demo, address,
    description, amenities, working_hours, is_published, map_label
  ) VALUES (
    v_id,
    COALESCE(p_payload->>'name', 'Yeni Saha'),
    p_payload->>'district',
    p_payload->>'city',
    (p_payload->>'latitude')::double precision,
    (p_payload->>'longitude')::double precision,
    COALESCE((p_payload->>'price_per_match')::numeric, 0),
    COALESCE((p_payload->>'google_rating')::numeric, 0),
    COALESCE((p_payload->>'google_review_count')::int, 0),
    COALESCE(p_payload->>'verification_status', 'approved'),
    NULLIF(p_payload->>'owner_id', '')::uuid,
    p_payload->>'image',
    COALESCE((p_payload->>'isDemo')::boolean, false),
    COALESCE(p_payload->>'address', p_payload->>'district', ''),
    NULLIF(p_payload->>'description', ''),
    COALESCE(p_payload->'amenities', '[]'::jsonb),
    CASE WHEN p_payload ? 'working_hours' THEN p_payload->'working_hours'
         ELSE '{"open": "10:00", "close": "02:00", "slot_duration": 60}'::jsonb END,
    COALESCE((p_payload->>'is_published')::boolean, true),
    NULLIF(p_payload->>'map_label', '')
  );
  PERFORM public.log_admin_action('PITCH_CREATE', 'pitch', v_id, p_payload->>'name', NULL, p_payload);
  RETURN v_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_create_pitch(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_pitch(jsonb) TO authenticated;
