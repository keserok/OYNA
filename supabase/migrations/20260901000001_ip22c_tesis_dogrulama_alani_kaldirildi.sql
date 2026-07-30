-- IP-22 (3. bölüm) — pitches.verification_status ve verification_notes kaldırıldı.
--
-- Tesis onayı diye bir kavram kalmadı: tesisler yönetici tarafından tanımlanıyor
-- ve görünürlük yalnız "yayında mı / açık mı" ile belirleniyor. Kolonu okuyan
-- HER fonksiyon burada önce yeniden yazılır, kolon EN SONDA düşer.
--
-- profiles.verification_status AYRI bir şeydir (kaleci/hakem başvurusu) ve
-- yerinde kalır — bu göç ona dokunmaz.

-- ---------------------------------------------------------------------------
-- 4) pitches.verification_status / verification_notes tamamen kaldırılır.
--    Kolonu okuyan HER fonksiyon önce yeniden yazılır.
--    (profiles.verification_status AYRI bir şeydir — kaleci/hakem başvurusu —
--     ve yerinde kalır.)
-- ---------------------------------------------------------------------------

-- 4a) Vitrin sorguları: görünürlük artık yalnız yayın + açık + demo-değil.
CREATE OR REPLACE FUNCTION public.get_nearby_pitches(p_lat double precision, p_lon double precision, p_radius_km double precision DEFAULT 25)
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
    AND earth_distance(ll_to_earth(p_lat, p_lon), ll_to_earth(pt.latitude, pt.longitude)) <= p_radius_km * 1000.0
  ORDER BY 2 ASC;
$function$;

CREATE OR REPLACE FUNCTION public.get_showcase_availability(p_date date)
RETURNS TABLE(pitch_id uuid, court_id uuid, kind text, start_time time without time zone, end_time time without time zone, status text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT b.pitch_id, b.court_id, 'BOOKING'::text AS kind,
         b.start_time, b.end_time, b.status::text
  FROM public.pitch_bookings b
  JOIN public.pitches p ON p.id = b.pitch_id
  WHERE b.booking_date = p_date
    AND b.status <> 'CANCELLED'
    AND p.is_published = true
  UNION ALL
  SELECT ex.pitch_id, ex.court_id, 'CLOSURE'::text AS kind,
         ex.start_time, ex.end_time, ex.exception_type::text
  FROM public.pitch_availability_exceptions ex
  JOIN public.pitches p ON p.id = ex.pitch_id
  WHERE p.is_published = true
    AND (
      ex.exception_date = p_date
      OR (ex.is_recurring = true AND ex.day_of_week = (EXTRACT(ISODOW FROM p_date))::int)
    );
$function$;

-- 4b) Tesis kimliği (ad/konum) yalnız yönetici tarafından değiştirilir.
CREATE OR REPLACE FUNCTION public.protect_pitch_identity_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF is_admin() THEN
    RETURN NEW;
  END IF;
  IF NEW.name      IS DISTINCT FROM OLD.name
     OR NEW.city      IS DISTINCT FROM OLD.city
     OR NEW.district  IS DISTINCT FROM OLD.district
     OR NEW.address   IS DISTINCT FROM OLD.address
     OR NEW.latitude  IS DISTINCT FROM OLD.latitude
     OR NEW.longitude IS DISTINCT FROM OLD.longitude THEN
    RAISE EXCEPTION 'PITCH_IDENTITY_CHANGE_REQUIRES_APPROVAL'
      USING HINT = 'Ad/konum değişikliği için değişiklik talebi oluşturun; yönetici onayıyla uygulanır.';
  END IF;
  RETURN NEW;
END;
$function$;

-- 4c) Yönetici sayaçları ve kuyruğu: tesis onayı diye bir kalem kalmadı.
CREATE OR REPLACE FUNCTION public.admin_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result JSONB;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  SELECT jsonb_build_object(
    'total_users',        (SELECT COUNT(*)::int FROM public.profiles),
    'total_pitches',      (SELECT COUNT(*)::int FROM public.pitches),
    'total_matches',      (SELECT COUNT(*)::int FROM public.matches),
    'total_communities',  (SELECT COUNT(*)::int FROM public.communities),
    'pending_verifications', (SELECT COUNT(*)::int FROM public.profiles WHERE verification_status = 'pending'),
    'pending_withdrawals',(SELECT COUNT(*)::int FROM public.payout_requests WHERE status = 'PENDING'),
    'open_disputes',      (SELECT COUNT(*)::int FROM public.match_disputes WHERE status IN ('OPEN','UNDER_REVIEW')),
    'open_user_reports',  (SELECT COUNT(*)::int FROM public.user_reports WHERE status = 'OPEN'),
    'deletion_requests',  (SELECT COUNT(*)::int FROM public.profiles WHERE account_deletion_requested_at IS NOT NULL),
    'pending_community_requests', (SELECT COUNT(*)::int FROM public.community_creation_requests WHERE status = 'PENDING'),
    'banned_users',       (SELECT COUNT(*)::int FROM public.profiles WHERE is_banned = true),
    'active_goalkeepers', (SELECT COUNT(*)::int FROM public.goalkeepers),
    'active_referees',    (SELECT COUNT(*)::int FROM public.referees),
    'total_booking_revenue', COALESCE((SELECT SUM(amount) FROM public.booking_payments), 0),
    'total_wallet_volume', COALESCE((SELECT SUM(ABS(amount)) FROM public.wallet_transactions), 0),
    'active_promo_codes', (SELECT COUNT(*)::int FROM public.promo_codes WHERE is_active = true),
    'open_support_tickets', (SELECT COUNT(*)::int FROM public.support_tickets WHERE channel = 'PLAYER' AND status IN ('OPEN','PENDING')),
    'open_owner_messages',  (SELECT COUNT(*)::int FROM public.support_tickets WHERE channel = 'OWNER'  AND status IN ('OPEN','PENDING')),
    'commission_rate',    (SELECT "commissionRate" FROM public.settings WHERE id = 'main')
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_ops_queue()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  RETURN jsonb_build_object(
    'pending_verifications', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', id, 'name', full_name, 'email', email, 'created_at', created_at
      )), '[]'::jsonb)
      FROM public.profiles
      WHERE verification_status = 'pending'
      LIMIT 20
    ),
    'pending_withdrawals', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', id, 'amount', amount, 'owner_id', user_id, 'created_at', created_at
      )), '[]'::jsonb)
      FROM public.payout_requests
      WHERE status = 'PENDING'
      LIMIT 20
    ),
    'open_disputes', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', id, 'match_id', match_id, 'status', status, 'created_at', created_at
      )), '[]'::jsonb)
      FROM public.match_disputes
      WHERE status IN ('OPEN', 'UNDER_REVIEW')
      LIMIT 20
    ),
    'deletion_requests', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', id, 'name', full_name, 'email', email, 'requested_at', account_deletion_requested_at
      )), '[]'::jsonb)
      FROM public.profiles
      WHERE account_deletion_requested_at IS NOT NULL
      LIMIT 20
    ),
    'community_requests', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', id, 'name', name, 'requester_id', requester_id, 'created_at', created_at
      )), '[]'::jsonb)
      FROM public.community_creation_requests
      WHERE status = 'PENDING'
      LIMIT 20
    ),
    'community_join_requests', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', sub.id,
        'community_id', sub.community_id,
        'community_name', sub.community_name,
        'user_id', sub.user_id,
        'user_name', sub.user_name,
        'created_at', sub.created_at
      )), '[]'::jsonb)
      FROM (
        SELECT
          jr.id,
          jr.community_id,
          c.name AS community_name,
          jr.user_id,
          p.full_name AS user_name,
          jr.created_at
        FROM public.community_join_requests jr
        JOIN public.communities c ON c.id = jr.community_id
        LEFT JOIN public.profiles p ON p.id = jr.user_id
        WHERE jr.status = 'PENDING'
        ORDER BY jr.created_at
        LIMIT 20
      ) sub
    )
  );
END;
$function$;

-- 4d) Tesis listesi: durum süzgeci artık yayın durumu (vitrinde mi, gizli mi).
DROP FUNCTION IF EXISTS public.admin_fetch_pitches(text, text, integer, integer);
CREATE FUNCTION public.admin_fetch_pitches(
  p_search text DEFAULT NULL::text,
  p_status text DEFAULT NULL::text,
  p_limit integer DEFAULT 200,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid, name text, district text, city text,
  latitude double precision, longitude double precision,
  price_per_match numeric, google_rating numeric, google_review_count integer,
  owner_id uuid, image text, is_demo boolean, is_published boolean,
  created_at timestamp with time zone, total_count bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  RETURN QUERY
  SELECT
    p.id,
    p.name::text,
    p.district::text,
    p.city::text,
    p.latitude,
    p.longitude,
    p.price_per_match,
    p.google_rating,
    p.google_review_count,
    p.owner_id,
    p.image::text,
    COALESCE(p.is_demo, false) AS is_demo,
    COALESCE(p.is_published, false) AS is_published,
    p.created_at,
    COUNT(*) OVER() AS total_count
  FROM public.pitches p
  WHERE (
    p_search IS NULL OR p_search = '' OR
    p.name ILIKE '%' || p_search || '%' OR
    p.district ILIKE '%' || p_search || '%' OR
    p.city ILIKE '%' || p_search || '%' OR
    p.id::text ILIKE '%' || p_search || '%'
  )
  AND (
    p_status IS NULL OR p_status = '' OR p_status = 'ALL'
    OR (p_status = 'published' AND COALESCE(p.is_published, false) = true)
    OR (p_status = 'hidden' AND COALESCE(p.is_published, false) = false)
  )
  ORDER BY p.created_at DESC NULLS LAST, p.name ASC
  LIMIT GREATEST(p_limit, 1)
  OFFSET GREATEST(p_offset, 0);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_fetch_pitches(text, text, integer, integer) TO authenticated;

-- 4e) Tesis oluşturma/güncelleme: doğrulama alanı yazılmaz.
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
    owner_id, image, is_demo, address,
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
    image = COALESCE(p_payload->>'image', image),
    description = CASE WHEN p_payload ? 'description' THEN NULLIF(p_payload->>'description', '') ELSE description END,
    amenities = CASE WHEN p_payload ? 'amenities' THEN p_payload->'amenities' ELSE amenities END,
    working_hours = CASE WHEN p_payload ? 'working_hours' THEN p_payload->'working_hours' ELSE working_hours END,
    is_published = COALESCE((p_payload->>'is_published')::boolean, is_published),
    is_featured = COALESCE((p_payload->>'is_featured')::boolean, is_featured),
    flash_deals_enabled = COALESCE((p_payload->>'flash_deals_enabled')::boolean, flash_deals_enabled),
    show_availability_badge = COALESCE((p_payload->>'show_availability_badge')::boolean, show_availability_badge),
    booking_disabled_by_admin = COALESCE((p_payload->>'booking_disabled_by_admin')::boolean, booking_disabled_by_admin),
    map_label = CASE WHEN p_payload ? 'map_label' THEN NULLIF(p_payload->>'map_label', '') ELSE map_label END,
    is_active = COALESCE((p_payload->>'is_active')::boolean, is_active),
    owner_id = CASE WHEN p_payload ? 'owner_id' THEN NULLIF(p_payload->>'owner_id', '')::uuid ELSE owner_id END
  WHERE id = p_pitch_id;
  PERFORM public.log_admin_action('PITCH_UPDATE', 'pitch', p_pitch_id, p_payload->>'name', v_old, p_payload);
  RETURN TRUE;
END;
$function$;

-- 4f) Demo kurucuları.
CREATE OR REPLACE FUNCTION public.seed_owner_demo()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pitch_id UUID := 'd1111111-1111-4111-8111-111111111111';
  v_court1 UUID := 'd2222222-2222-4222-8222-222222222222';
  v_court2 UUID := 'd3333333-3333-4333-8333-333333333333';
  v_court3 UUID := 'd4444444-4444-4444-8444-444444444444';
  v_staff1 UUID := 'd6666666-6666-4666-8666-666666666666';
  v_staff2 UUID := 'd7777777-7777-4777-8777-777777777777';
  v_today DATE := CURRENT_DATE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  PERFORM public.purge_owner_demo();
  INSERT INTO public.pitches (id, name, city, district, address, description, owner_id, is_open, is_demo, price_per_match, platform_commission_rate, amenities, working_hours, rating, payment_options)
  VALUES (v_pitch_id, 'OYNA Demo Arena', 'İstanbul', 'Beşiktaş', 'Demo Mahallesi, Spor Sk. No:1', 'OYNA demo tesis', NULL, true, true, 3200, 10, '["Otopark","Duş","Kafe"]'::jsonb, '[]'::jsonb, 4.8, '{"online": true, "deposit": false, "cash": true}'::jsonb);
  INSERT INTO public.courts (id, pitch_id, name, court_type, size, is_active, sort_order) VALUES
    (v_court1, v_pitch_id, 'Merkez Saha', 'OPEN', '30x50', true, 0),
    (v_court2, v_pitch_id, 'Yan Saha', 'OPEN', '28x48', true, 1),
    (v_court3, v_pitch_id, 'Kapalı Saha', 'CLOSED', '25x45', true, 2);
  INSERT INTO public.pitch_tariffs (pitch_id, name, tariff_type, applies_to_days, start_time, end_time, slot_price, deposit_amount, sort_order) VALUES
    (v_pitch_id, 'Gündüz', 'WEEKDAY', ARRAY[1,2,3,4,5], '08:00', '17:00', 2000, 500, 0),
    (v_pitch_id, 'Akşam', 'WEEKDAY', ARRAY[1,2,3,4,5], '17:00', '00:00', 3200, 1000, 1);
  INSERT INTO public.pitch_bank_accounts (id, pitch_id, bank_name, account_holder, iban, is_primary) VALUES
    ('d8888888-8888-4888-8888-888888888888', v_pitch_id, 'Ziraat Bankası', 'OYNA Demo Arena', 'TR000000000000000000000000', true);
  -- Etiket yetkiden türer: MANAGER → "Müdür", STAFF → "Personel".
  INSERT INTO public.pitch_staff_members (id, pitch_id, name, staff_role, status, avatar_url, sort_order, is_demo) VALUES
    (v_staff1, v_pitch_id, 'Murat S.', 'MANAGER', 'ON_DUTY', 'https://i.pravatar.cc/150?u=murat', 0, true),
    (v_staff2, v_pitch_id, 'Sinan K.', 'STAFF', 'ON_DUTY', 'https://i.pravatar.cc/150?u=sinan', 1, true);
  INSERT INTO public.pitch_staff_tasks (pitch_id, title, assigned_to, assigned_name, priority, status, due_time) VALUES
    (v_pitch_id, 'Aydınlatma Kontrolü', v_staff2, 'Sinan K.', 'HIGH', 'PENDING', '18:00');
  INSERT INTO public.pitch_bookings (pitch_id, court_id, customer_name, customer_phone, booking_date, start_time, end_time, status, source, price, paid_amount, payment_status, title)
  VALUES (v_pitch_id, v_court1, 'Ahmet Y.', '5321112233', v_today, '17:00', '18:00', 'CONFIRMED', 'APP_BOOKING', 3200, 3200, 'PAID', 'Akşam Maçı'),
         (v_pitch_id, v_court2, 'Vadi Gücü FC', '5354445566', v_today, '21:00', '22:00', 'CONFIRMED', 'APP_BOOKING', 3200, 3200, 'PAID', 'Akşam Maçı');
  INSERT INTO public.pitch_expenses (pitch_id, category, title, amount, expense_date) VALUES (v_pitch_id, 'Fatura', 'Elektrik', 4500, v_today - 1);
  INSERT INTO public.pitch_debtors (pitch_id, name, phone, amount_owed, last_match_date, is_resolved) VALUES (v_pitch_id, 'Ahmet Y.', '5321112233', 400, v_today - 2, false);
  RETURN v_pitch_id;
END;
$function$;

-- seed_module_demo: yalnız pitches INSERT'indeki kolon listesi değişir.
CREATE OR REPLACE FUNCTION public.seed_module_demo(p_module text DEFAULT 'all'::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_gk1 UUID := 'a1111111-1111-4111-8111-111111111111';
  v_gk2 UUID := 'a2222222-2222-4222-8222-222222222222';
  v_ref1 UUID := 'a3333333-3333-4333-8333-333333333333';
  v_match1 UUID := 'a4444444-4444-4444-8444-444444444444';
  v_comm UUID := 'a5555555-5555-4555-8555-555555555555';
  v_promo UUID := 'a6666666-6666-4666-8666-666666666666';
  v_tourn UUID := 'a7777777-7777-4777-8777-777777777777';
  v_team UUID := 'a9999999-9999-4999-8999-999999999999';
  v_pitch UUID := 'a8888888-8888-4888-8888-888888888888';
  v_result JSONB := '{}'::jsonb;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  PERFORM public.purge_module_demo(p_module);
  IF p_module IN ('all', 'goalkeepers') THEN
    INSERT INTO public.goalkeepers (id, "authUid", name, height, age, rating, fee, "matchCount", avatar, style, bio, "preferredZones", "isElite", "isDemo", stats, skills, equipment)
    VALUES
      (v_gk1, v_gk1, 'Demo Kaleci — Uğurcan T.', '1.92', 28, 4.8, 300, 42, 'https://images.unsplash.com/photo-1574629310576-6e84c60be5cb?w=400', 'Panter', 'Refleks demo kaleci.', '["Kadıköy"]'::jsonb, true, true, '{"savePercentage":"88"}'::jsonb, '{"reflexes":92}'::jsonb, '{}'::jsonb),
      (v_gk2, v_gk2, 'Demo Kaleci — Altay D.', '1.89', 25, 4.5, 220, 18, 'https://images.unsplash.com/photo-1529900748604-07564a03e7a6?w=400', 'Libero', 'Demo kaleci.', '["Ümraniye"]'::jsonb, false, true, '{"savePercentage":"82"}'::jsonb, '{"reflexes":80}'::jsonb, '{}'::jsonb)
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, "isDemo" = true;
    v_result := v_result || jsonb_build_object('goalkeepers', 2);
  END IF;
  IF p_module IN ('all', 'referees') THEN
    INSERT INTO public.referees (id, "authUid", name, level, rating, fee, "matchCount", avatar, style, bio, "preferredZones", "isElite", "isDemo", stats)
    VALUES (v_ref1, v_ref1, 'Demo Hakem — Cüneyt Ç.', 'FIFA', 4.7, 400, 156, 'https://images.unsplash.com/photo-1580234811497-9df7fd2f357e?w=400', 'Otoriter', 'Demo hakem.', '["İstanbul"]'::jsonb, true, true, '{"authority":90}'::jsonb)
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, "isDemo" = true;
    v_result := v_result || jsonb_build_object('referees', 1);
  END IF;
  IF p_module IN ('all', 'matches') THEN
    INSERT INTO public.matches (id, title, location, date, time, price, difficulty, status, format, "missingPositions", slots, "isDemo")
    VALUES (v_match1, 'Demo Akşam Maçı', 'OYNA Demo Arena', to_char(CURRENT_DATE + 2, 'YYYY-MM-DD'), '20:00', 150, 'Orta', 'OPEN', '7v7', '[{"role":"GK","count":1}]'::jsonb, '[{"id":"s1","status":"OPEN"}]'::jsonb, true)
    ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, "isDemo" = true;
    v_result := v_result || jsonb_build_object('matches', 1);
  END IF;
  IF p_module IN ('all', 'communities') THEN
    INSERT INTO public.communities (id, name, type, description, location, is_verified, member_count, is_demo)
    VALUES (v_comm, '[DEMO] Kadıköy Topluluğu', 'Semt', 'Demo', 'Kadıköy', true, 24, true)
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, is_demo = true;
    v_result := v_result || jsonb_build_object('communities', 1);
  END IF;
  IF p_module IN ('all', 'promo_codes') THEN
    INSERT INTO public.promo_codes (id, code, description, discount_type, discount_value, is_active, is_demo, target_segment)
    VALUES (v_promo, 'DEMO20', 'Demo %20', 'PERCENT', 20, true, true, 'ALL')
    ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, is_demo = true;
    v_result := v_result || jsonb_build_object('promo_codes', 1);
  END IF;
  IF p_module IN ('all', 'tournaments') THEN
    INSERT INTO public.tournaments (id, name, status, max_teams, is_demo, starts_at)
    VALUES (v_tourn, '[DEMO] Yaz Turnuvası', 'OPEN', 8, true, NOW() + INTERVAL '14 days')
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, is_demo = true;
    v_result := v_result || jsonb_build_object('tournaments', 1);
  END IF;
  IF p_module IN ('all', 'teams') THEN
    INSERT INTO public.teams (id, name, is_demo, wins, losses)
    VALUES (v_team, '[DEMO] Beşiktaş Gençler', true, 5, 2)
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, is_demo = true;
    v_result := v_result || jsonb_build_object('teams', 1);
  END IF;
  IF p_module IN ('all', 'pitches') THEN
    INSERT INTO public.pitches (id, name, district, is_demo, is_open, price_per_match)
    VALUES (v_pitch, '[DEMO] Godview Test Sahası', 'Kadıköy', true, true, 1200)
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, is_demo = true;
    v_result := v_result || jsonb_build_object('pitches', 1);
  END IF;
  IF p_module IN ('all', 'texts') THEN
    INSERT INTO public.texts (key, value, category) VALUES ('demo_banner', 'Demo içerik aktif', 'ui')
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
    v_result := v_result || jsonb_build_object('texts', 1);
  END IF;
  IF p_module = 'all' THEN
    PERFORM public.log_admin_action('DEMO_SEED', 'system', NULL, 'godview_demo_all', NULL, jsonb_build_object('seeded_at', NOW()));
  END IF;
  RETURN v_result;
END;
$function$;

-- 4g) Kolonlar düşer. (profiles.verification_status'a DOKUNULMAZ.)
ALTER TABLE public.pitches DROP COLUMN IF EXISTS verification_status;
ALTER TABLE public.pitches DROP COLUMN IF EXISTS verification_notes;
