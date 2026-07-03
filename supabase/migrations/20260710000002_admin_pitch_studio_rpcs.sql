-- Saha Kurulum Merkezi (admin vitrin editörü) için RPC genişletmesi.
-- Kaynak: canlı fonksiyon tanımları okunarak güncellendi (kararlar belgesi notu:
-- "canlı kaynak okunmadan eski dal kopyası uygulanmaz").
--
-- admin_create_pitch değişiklikleri:
--  * description / amenities / working_hours / is_published payload'dan alınır.
--  * Uydurma varsayılanlar kaldırıldı: google_rating artık 4.5 değil kolon
--    varsayılanı; koordinat verilmediyse İstanbul (41.0/29.0) yazılmaz, NULL kalır
--    (vitrin skoru "pin eksik" görevini doğru gösterir).
-- admin_update_pitch değişiklikleri:
--  * address güncellenebilir (eksikti), description / amenities / working_hours /
--    is_published / is_featured / is_active eklendi. Yalnız payload'da gelen
--    anahtarlar değişir.

DROP FUNCTION IF EXISTS public.admin_create_pitch(jsonb);
CREATE OR REPLACE FUNCTION public.admin_create_pitch(p_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_id UUID := COALESCE(NULLIF(p_payload->>'id', '')::uuid, gen_random_uuid());
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  INSERT INTO public.pitches (
    id, name, district, city, latitude, longitude,
    price_per_match, google_rating, google_review_count,
    verification_status, owner_id, image, is_demo, address,
    description, amenities, working_hours, is_published
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
    COALESCE((p_payload->>'is_published')::boolean, true)
  );
  PERFORM public.log_admin_action('PITCH_CREATE', 'pitch', v_id, p_payload->>'name', NULL, p_payload);
  RETURN v_id;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.admin_create_pitch(jsonb) TO authenticated;

DROP FUNCTION IF EXISTS public.admin_update_pitch(uuid, jsonb);
CREATE OR REPLACE FUNCTION public.admin_update_pitch(p_pitch_id uuid, p_payload jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_old JSONB;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
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
    is_active = COALESCE((p_payload->>'is_active')::boolean, is_active),
    owner_id = CASE WHEN p_payload ? 'owner_id' THEN NULLIF(p_payload->>'owner_id', '')::uuid ELSE owner_id END
  WHERE id = p_pitch_id;
  PERFORM public.log_admin_action('PITCH_UPDATE', 'pitch', p_pitch_id, p_payload->>'name', v_old, p_payload);
  RETURN TRUE;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.admin_update_pitch(uuid, jsonb) TO authenticated;
