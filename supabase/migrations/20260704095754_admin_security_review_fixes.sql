-- Güvenlik incelemesi düzeltmeleri (adversarial review bulguları):
--
-- 1) PII reveal artık göstermelik değil: admin_log_pii_reveal (yalnız log)
--    kaldırıldı; yerine admin_reveal_pii değeri SUNUCUDA okur ve aynı çağrıda
--    audit'e yazar — log düşmeden değer dönmez. UI maskeli değeri değil bu
--    RPC'nin döndürdüğünü gösterir.
-- 2) admin_update_pitch: owner_id devri finansal etki taşır — yalnız
--    SUPER_ADMIN (is_super_admin()) değiştirebilir; diğer platform adminleri
--    için payload'daki owner_id reddedilir.

DROP FUNCTION IF EXISTS public.admin_log_pii_reveal(uuid, text);

CREATE OR REPLACE FUNCTION public.admin_reveal_pii(p_target_user_id uuid, p_field text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_value text;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_field NOT IN ('email', 'phone') THEN RAISE EXCEPTION 'Geçersiz alan'; END IF;

  SELECT CASE p_field WHEN 'email' THEN email ELSE phone END
    INTO v_value
    FROM public.profiles
   WHERE id = p_target_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Kullanıcı bulunamadı'; END IF;

  PERFORM public.log_admin_action(
    'PII_REVEAL', 'user', p_target_user_id, p_field,
    NULL, jsonb_build_object('field', p_field)
  );
  RETURN v_value;
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_reveal_pii(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reveal_pii(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_update_pitch(p_pitch_id uuid, p_payload jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_old JSONB;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  -- Tesis sahipliği devri yalnız SUPER_ADMIN yetkisindedir (gelir/panel devri).
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
    is_active = COALESCE((p_payload->>'is_active')::boolean, is_active),
    owner_id = CASE WHEN p_payload ? 'owner_id' THEN NULLIF(p_payload->>'owner_id', '')::uuid ELSE owner_id END
  WHERE id = p_pitch_id;
  PERFORM public.log_admin_action('PITCH_UPDATE', 'pitch', p_pitch_id, p_payload->>'name', v_old, p_payload);
  RETURN TRUE;
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_update_pitch(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_pitch(uuid, jsonb) TO authenticated;
