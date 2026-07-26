-- ═══════════════════════════════════════════════════════════════════════════
-- ADMIN AYNA ALANLARI — Kullanıcı Profili Aynası + Maç Kokpiti alan tamamlama
--
-- 1) admin_update_user_profile__core: admin panel artık kullanıcı profilini
--    UYGULAMADAKİ profil ekranının birebir aynasıyla düzenliyor. Uygulamanın
--    "Profili Düzenle" alt sayfasının yazdığı alanlar (position, bio,
--    birthdate, gender, play_style) + profil ekranında görünen yönetimsel
--    alanlar (trust_score, skill_rating, age_range, has_completed_onboarding)
--    RPC'ye eklendi. Ayrıca full_name verildiğinde legacy NOT NULL `name`
--    kolonu senkron tutulur (updateProfileName ile aynı davranış).
--
-- 2) admin_update_match__core: MatchFormModal "Saha" seçimi güncellemede
--    sessizce düşüyordu — pitch_id yalnız admin_create_match'te yazılıyordu.
--    pitch_id artık güncellemede de yazılır (boş dize → NULL'a çevirmez,
--    mevcut değeri korur; açıkça null gönderilirse temizler).
--    ⚠️ CANLI ŞEMA GERÇEĞİ: matches.date ve matches.time TEXT'tir. Önceki
--    tanımlardaki (p_payload->>'date')::date cast'i COALESCE(date,text) tip
--    uyuşmazlığıyla fonksiyonun TAMAMINI planlama anında patlatıyordu (42804,
--    canlıda ROLLBACK'li smoke ile yakalandı). Tarih artık text + ISO regex
--    doğrulamasıyla yazılır.
--
-- İkisi de yalnız __core gövdesini değiştirir; RBAC sarmalayıcıları
-- (20260710000006) aynı imzayla çağırmaya devam eder.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1) admin_update_user_profile__core v3 — uygulama profil alanları ────────

CREATE OR REPLACE FUNCTION public.admin_update_user_profile__core(p_user_id uuid, p_payload jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_old JSONB;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT to_jsonb(p.*) INTO v_old FROM public.profiles p WHERE id = p_user_id;
  IF v_old IS NULL THEN RAISE EXCEPTION 'Kullanıcı bulunamadı'; END IF;

  UPDATE public.profiles SET
    full_name = COALESCE(p_payload->>'full_name', full_name),
    -- Legacy NOT NULL `name` full_name ile senkron kalır (updateProfileName paritesi)
    name = COALESCE(NULLIF(p_payload->>'full_name',''), name),
    email = CASE WHEN p_payload ? 'email' AND position('•' in COALESCE(p_payload->>'email','')) = 0
                 THEN COALESCE(NULLIF(p_payload->>'email',''), email) ELSE email END,
    phone = CASE WHEN p_payload ? 'phone' AND position('•' in COALESCE(p_payload->>'phone','')) = 0
                 THEN COALESCE(NULLIF(p_payload->>'phone',''), phone) ELSE phone END,
    avatar_url = COALESCE(p_payload->>'avatar_url', avatar_url),
    role = COALESCE(p_payload->>'role', role),
    roles = CASE WHEN p_payload ? 'role' THEN jsonb_build_array(p_payload->>'role') ELSE roles END,
    is_verified = COALESCE((p_payload->>'is_verified')::boolean, is_verified),
    is_pro = COALESCE((p_payload->>'is_pro')::boolean, is_pro),
    wallet_balance = COALESCE((p_payload->>'wallet_balance')::numeric, wallet_balance),
    match_count = COALESCE((p_payload->>'match_count')::int, match_count),
    rating = COALESCE((p_payload->>'rating')::numeric, rating),
    player_card = CASE
      WHEN p_payload ? 'player_card' AND jsonb_typeof(p_payload->'player_card') = 'object'
      THEN COALESCE(player_card, '{}'::jsonb) || (p_payload->'player_card')
      ELSE player_card
    END,
    card_tier = COALESCE(NULLIF(p_payload->>'card_tier',''), card_tier),
    card_active = COALESCE((p_payload->>'card_active')::boolean, card_active),
    -- ── Uygulama profil aynası alanları (ProfileEditSheet paritesi) ──────────
    -- position/bio uygulamayla birebir: gönderilen değer ('' dahil) aynen yazılır.
    position = CASE WHEN p_payload ? 'position' THEN p_payload->>'position' ELSE position END,
    bio = CASE WHEN p_payload ? 'bio' THEN p_payload->>'bio' ELSE bio END,
    birthdate = CASE WHEN p_payload ? 'birthdate' THEN NULLIF(p_payload->>'birthdate','')::date ELSE birthdate END,
    gender = CASE WHEN p_payload ? 'gender' THEN NULLIF(p_payload->>'gender','') ELSE gender END,
    play_style = CASE WHEN p_payload ? 'play_style' THEN NULLIF(p_payload->>'play_style','') ELSE play_style END,
    age_range = CASE WHEN p_payload ? 'age_range' THEN NULLIF(p_payload->>'age_range','') ELSE age_range END,
    -- Güven puanı & beceri puanı DB ölçeği 0–5'e kırpılır (UI 0–100 → /20 gönderir)
    trust_score = CASE WHEN p_payload ? 'trust_score'
      THEN LEAST(5, GREATEST(0, (p_payload->>'trust_score')::numeric)) ELSE trust_score END,
    skill_rating = CASE WHEN p_payload ? 'skill_rating'
      THEN LEAST(5, GREATEST(0, (p_payload->>'skill_rating')::numeric)) ELSE skill_rating END,
    has_completed_onboarding = COALESCE((p_payload->>'has_completed_onboarding')::boolean, has_completed_onboarding),
    updated_at = NOW()
  WHERE id = p_user_id;

  PERFORM public.log_admin_action(
    'USER_UPDATE', 'user', p_user_id,
    COALESCE(v_old->>'email', p_user_id::text),
    v_old, p_payload
  );
  RETURN TRUE;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_update_user_profile__core(p_user_id uuid, p_payload jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_user_profile__core(p_user_id uuid, p_payload jsonb) TO service_role;

-- ─── 2) admin_update_match__core v2 — pitch_id güncellemede de yazılır ──────

CREATE OR REPLACE FUNCTION public.admin_update_match__core(p_match_id uuid, p_payload jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_old JSONB;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT to_jsonb(m.*) INTO v_old FROM public.matches m WHERE id = p_match_id;
  IF v_old IS NULL THEN RAISE EXCEPTION 'Maç bulunamadı'; END IF;
  UPDATE public.matches SET
    title = COALESCE(p_payload->>'title', title),
    location = COALESCE(p_payload->>'location', location),
    date = CASE WHEN p_payload ? 'date' AND (p_payload->>'date') ~ '^\d{4}-\d{2}-\d{2}$'
                THEN p_payload->>'date' ELSE date END,
    "time" = COALESCE(p_payload->>'time', "time"),
    price = COALESCE((p_payload->>'price')::numeric, price),
    difficulty = COALESCE(p_payload->>'difficulty', difficulty),
    status = COALESCE(p_payload->>'status', status),
    format = COALESCE(p_payload->>'format', format),
    image = COALESCE(p_payload->>'image', image),
    "minRating" = COALESCE((p_payload->>'minRating')::numeric, "minRating"),
    badges = COALESCE(p_payload->'badges', badges),
    "missingPositions" = COALESCE(p_payload->'missingPositions', "missingPositions"),
    slots = CASE WHEN p_payload ? 'slots' THEN p_payload->'slots' ELSE slots END,
    "awaySlots" = CASE WHEN p_payload ? 'awaySlots' OR p_payload ? 'away_slots'
      THEN COALESCE(p_payload->'awaySlots', p_payload->'away_slots') ELSE "awaySlots" END,
    "refereeId" = COALESCE(NULLIF(p_payload->>'refereeId', '')::uuid, "refereeId"),
    duration = CASE WHEN p_payload ? 'duration' THEN NULLIF(p_payload->>'duration','') ELSE duration END,
    gender = CASE WHEN p_payload ? 'gender' THEN NULLIF(p_payload->>'gender','') ELSE gender END,
    "ageGroup" = CASE WHEN p_payload ? 'ageGroup' THEN NULLIF(p_payload->>'ageGroup','') ELSE "ageGroup" END,
    visibility = CASE WHEN p_payload ? 'visibility' AND (p_payload->>'visibility') IN ('OPEN','PRIVATE')
                      THEN p_payload->>'visibility' ELSE visibility END,
    private_code = CASE
      WHEN NULLIF(p_payload->>'private_code','') IS NOT NULL THEN upper(p_payload->>'private_code')
      WHEN COALESCE(NULLIF(p_payload->>'visibility',''), visibility) = 'PRIVATE' AND private_code IS NULL
      THEN upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
      ELSE private_code END,
    -- Saha bağı: oluşturma ile parite (boş dize mevcut değeri korur; jsonb null temizler)
    pitch_id = CASE
      WHEN p_payload ? 'pitch_id' AND jsonb_typeof(p_payload->'pitch_id') = 'null' THEN NULL
      WHEN NULLIF(p_payload->>'pitch_id','') IS NOT NULL THEN (p_payload->>'pitch_id')::uuid
      ELSE pitch_id END
  WHERE id = p_match_id;
  PERFORM public.log_admin_action('MATCH_UPDATE', 'match', p_match_id, p_payload->>'title', v_old, p_payload);
  RETURN TRUE;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_update_match__core(p_match_id uuid, p_payload jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_match__core(p_match_id uuid, p_payload jsonb) TO service_role;
