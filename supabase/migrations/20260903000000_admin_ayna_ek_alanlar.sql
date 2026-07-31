-- ═══════════════════════════════════════════════════════════════════════════
-- ADMIN AYNA — EK DÜZENLENEBİLİR ALANLAR (v4)
--
-- Kullanıcı kararı: admin panelindeki Kullanıcı Profili Aynası, kullanıcının
-- profilinde duran alanların TAMAMINA yakınını düzenleyebilsin. Riskli üçlü
-- (cüzdanı doğrudan yazma, admin yetkisi verme, doğrulama durumunu elle
-- değiştirme) BİLEREK KAPSAM DIŞIDIR ve bu dosyaya girmez.
--
-- v3'e (20260812000004) göre EKLENENLER — dört alan:
--   1. self_skill                → oyuncunun seviye beyanı (1–10)
--   2. is_searchable             ┐
--   3. discoverable_by_phone     ├ gizlilik tercihleri
--   4. show_online_status        ┘
--   5. notification_preferences  → bildirim tercihleri (jsonb, BİRLEŞTİRİLİR)
--
-- v3'teki hiçbir alan çıkarılmadı, hiçbir davranış değiştirilmedi; gövde
-- yalnız yukarıdaki satırlarla genişledi. RBAC sarmalayıcısı
-- (admin_update_user_profile) aynı imzayla çağırmaya devam eder.
--
-- ─── Neden bu üç koruma korunuyor ────────────────────────────────────────────
-- • self_skill NULL'a ÇEKİLEMEZ: beyan geri alınamaz kuralı (kullanıcının kendi
--   yolu olan set_my_self_skill de NULL'u reddediyor). Admin de silemez, yalnız
--   düzeltir. Değer 1–10'a kırpılır — profiles_self_skill_range CHECK'i
--   (canlıda doğrulandı) aksi halde 23514 ile patlardı.
-- • notification_preferences EZİLMEZ, BİRLEŞTİRİLİR: admin tek bir anahtarı
--   kapatırken kullanıcının diğer tüm tercihlerini sıfırlamasın (player_card
--   ile aynı desen).
-- • Gizlilik anahtarları NOT NULL kolonlardır; gönderilmeyen alan mevcut
--   değerini korur (COALESCE deseni).
--
-- Her kayıt v3'teki gibi admin_audit_log'a USER_UPDATE olarak düşmeye devam
-- eder — eski değerin tamamı (v_old) kayda yazılır.
-- ═══════════════════════════════════════════════════════════════════════════

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
    -- Güven puanı 0–5'e kırpılır (UI 0–100 → /20 gönderir); beceri puanı
    -- profiles_skill_rating_check kısıtı gereği 1–5'e kırpılır (taban 0 olsaydı
    -- 0≤x<1 girişleri 23514 ile patlardı — canlı kısıt doğrulandı).
    trust_score = CASE WHEN p_payload ? 'trust_score'
      THEN LEAST(5, GREATEST(0, (p_payload->>'trust_score')::numeric)) ELSE trust_score END,
    skill_rating = CASE WHEN p_payload ? 'skill_rating'
      THEN LEAST(5, GREATEST(1, (p_payload->>'skill_rating')::numeric)) ELSE skill_rating END,
    has_completed_onboarding = COALESCE((p_payload->>'has_completed_onboarding')::boolean, has_completed_onboarding),
    -- ── v4 · Seviye beyanı ──────────────────────────────────────────────────
    -- Boş/NULL gönderim beyanı SİLMEZ (geri alınamaz kuralı); değer 1–10'a kırpılır.
    self_skill = CASE
      WHEN p_payload ? 'self_skill' AND NULLIF(p_payload->>'self_skill','') IS NOT NULL
      THEN LEAST(10, GREATEST(1, (p_payload->>'self_skill')::int))::smallint
      ELSE self_skill
    END,
    -- ── v4 · Gizlilik tercihleri (NOT NULL kolonlar) ────────────────────────
    is_searchable = COALESCE((p_payload->>'is_searchable')::boolean, is_searchable),
    discoverable_by_phone = COALESCE((p_payload->>'discoverable_by_phone')::boolean, discoverable_by_phone),
    show_online_status = COALESCE((p_payload->>'show_online_status')::boolean, show_online_status),
    -- ── v4 · Bildirim tercihleri — EZME, BİRLEŞTİR ──────────────────────────
    notification_preferences = CASE
      WHEN p_payload ? 'notification_preferences' AND jsonb_typeof(p_payload->'notification_preferences') = 'object'
      THEN COALESCE(notification_preferences, '{}'::jsonb) || (p_payload->'notification_preferences')
      ELSE notification_preferences
    END,
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
