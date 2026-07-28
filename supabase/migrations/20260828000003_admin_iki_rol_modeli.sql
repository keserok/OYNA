-- ============================================================================
-- ADMİN PANELİ: İKİ ROL MODELİ (SUPER_ADMIN + ADMIN)
--
-- KARAR: Beş rollü model (SUPER_ADMIN / ADMIN / MODERATOR / FINANCE / SUPPORT)
-- pratikte hiç kullanılmadı — `admin_team_members` tablosunda bu üç rolde tek
-- bir satır bile yok. Model ikiye iniyor:
--
--   SUPER_ADMIN → platformun sahibi. Her şeyi yapar. Ekip ve yetki yönetimi
--                 YALNIZ onda: admin atama/çıkarma, rol değiştirme, MFA sıfırlama.
--   ADMIN       → panelden yetkilendirilen yönetici. Günlük operasyonun
--                 tamamını yürütür (finans, moderasyon, destek, içerik, ayarlar);
--                 yalnız ekip/yetki yönetimine dokunamaz.
--
-- Bu migration üç işi birden yapar:
--   A) Rol modelini ikiye indirir (veri göçü + CHECK kısıtı + RPC doğrulaması).
--   B) Ekip/yetki/MFA işlemlerini gerçekten SUPER_ADMIN'e kilitler. Bugün
--      `require_admin_role()` ADMIN'i her listede baypas ettiği için
--      `admin_reset_mfa` ve `admin_revoke_platform_role` ADMIN'e de açıktı —
--      yani atanan bir admin süper admini yetkiden düşürebiliyordu.
--   C) SUPER_ADMIN hesaplarının PII'ını (e-posta/telefon) diğer adminlerden
--      erişilemez kılar: maskeleme değil, tam kapatma. Süper admin satırı
--      normal ADMIN'e ne okunur, ne güncellenir, ne silinir.
--
-- İdempotent: tekrar uygulanması güvenlidir.
--
-- LEDGER NOTU (MIGRATION_PLAYBOOK Altın Kural 1): bu dosyanın SQL'i, kurucunun
-- talebiyle canlıya erken uygulandı — ancak `apply_migration` ile DEĞİL, ledger'a
-- hiç dokunmayan düz sorgu ile. `supabase_migrations.schema_migrations` bu
-- dosyayı görmediği için normal PR + otomatik deploy yolundan geçmeye devam
-- eder; o çalıştırmada tüm ifadeler idempotent olduğundan sonuç no-op'tur.
-- Böylece ledger ile repo arasında sürüklenme (drift) oluşmaz.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- A1) Veri göçü: kalkan roller ADMIN'e devrolur (bugün boş, güvenlik ağı)
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE public.admin_team_members
   SET admin_role = 'ADMIN'
 WHERE admin_role IN ('MODERATOR', 'FINANCE', 'SUPPORT');

-- ─────────────────────────────────────────────────────────────────────────────
-- A2) CHECK kısıtı: yalnız iki rol
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.admin_team_members
  DROP CONSTRAINT IF EXISTS admin_team_members_admin_role_check;

ALTER TABLE public.admin_team_members
  ADD CONSTRAINT admin_team_members_admin_role_check
  CHECK (admin_role IN ('SUPER_ADMIN', 'ADMIN'));

-- ─────────────────────────────────────────────────────────────────────────────
-- B1) require_super_admin(): ekip/yetki işlemlerinin tek kapısı
--
-- `require_admin_role()`'dan farkı: ADMIN'i BAYPAS ETMEZ. Süper admine özel
-- bırakılan her işlem bunu çağırır.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.require_super_admin()
RETURNS void
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: oturum yok';
  END IF;
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: bu işlem yalnız SUPER_ADMIN tarafından yapılabilir';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.require_super_admin() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.require_super_admin() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- A3) Eski rol yardımcıları — iki rollü modelde ikisi de "platform admin"
--
-- 60+ RPC bu iki fonksiyonu çağırıyor; imzaları korunuyor, gövdeleri sadeleşti.
-- SUPER_ADMIN ve ADMIN zaten her ikisinin de listesindeydi, dolayısıyla bu
-- değişiklik hiçbir çağrı noktasının davranışını değiştirmez.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_moderator()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  -- Geriye dönük ad: iki rollü modelde her admin moderasyon yapabilir.
  SELECT public.is_platform_admin();
$$;

CREATE OR REPLACE FUNCTION public.is_finance_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  -- Geriye dönük ad: iki rollü modelde her admin finans işlemi yapabilir.
  SELECT public.is_platform_admin();
$$;

-- require_admin_role(): imza korunur (60+ RPC çağırıyor). İki rollü modelde
-- p_allowed listesi anlamsızlaştı — platform admin olmak yeterli.
CREATE OR REPLACE FUNCTION public.require_admin_role(p_allowed text[])
RETURNS void
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED: admin yetkisi gerekli';
  END IF;
  -- İki rollü modelde SUPER_ADMIN ve ADMIN'in ikisi de tam operasyon yetkisine
  -- sahiptir. Süper admine özel işlemler require_super_admin() kullanır.
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- A4/B2) admin_set_platform_role: iki rol + profiles.role'e dokunmama
--
-- Eski davranış `profiles.role`'ü 'ADMIN'/'SUPER_ADMIN' yazıyordu. Bu, kişinin
-- oyuncu/saha sahibi rolünü eziyor ve ana uygulamada rol geçişini bozuyordu
-- (shared/roles.ts bu iki değeri geçilebilir rol olarak tanımıyor). Artık
-- yalnız `is_admin` bayrağı işaretlenir; admin kimliğinin kanonik kaynağı
-- `admin_team_members` tablosudur. Böylece admin, ana uygulamada oyuncu olarak
-- kalmaya devam eder.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_set_platform_role(
  p_user_id uuid,
  p_admin_role text,
  p_grant_platform_admin boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_email text;
BEGIN
  PERFORM public.require_super_admin();

  IF p_admin_role NOT IN ('SUPER_ADMIN', 'ADMIN') THEN
    RAISE EXCEPTION 'Geçersiz rol: % (yalnız SUPER_ADMIN veya ADMIN)', p_admin_role;
  END IF;

  -- Kilitlenme önleme: tek süper admin düşürülemez.
  IF p_admin_role <> 'SUPER_ADMIN'
     AND EXISTS (SELECT 1 FROM public.admin_team_members
                  WHERE user_id = p_user_id AND admin_role = 'SUPER_ADMIN')
     AND (SELECT count(*) FROM public.admin_team_members
           WHERE admin_role = 'SUPER_ADMIN') <= 1 THEN
    RAISE EXCEPTION 'Son SUPER_ADMIN düşürülemez (kilitlenme önleme).';
  END IF;

  SELECT email INTO v_email FROM public.profiles WHERE id = p_user_id;
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'Kullanıcı bulunamadı (önce bu e-postayla giriş yapılmalı).';
  END IF;

  INSERT INTO public.admin_team_members (user_id, admin_role, invited_by)
  VALUES (p_user_id, p_admin_role, auth.uid())
  ON CONFLICT (user_id) DO UPDATE SET admin_role = EXCLUDED.admin_role;

  -- Yalnız admin bayrağı; kişinin oyuncu/sağlayıcı rolü korunur.
  UPDATE public.profiles SET is_admin = true WHERE id = p_user_id;

  PERFORM public.log_admin_action(
    'ROLE_CHANGE', 'user', p_user_id, v_email, NULL,
    jsonb_build_object('admin_role', p_admin_role, 'is_admin', true)
  );
  RETURN true;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- B3) admin_revoke_platform_role: artık SUPER_ADMIN'e kilitli
--
-- ÖNCESİ: `is_platform_admin()` yeterliydi — atanan bir ADMIN, süper admin
-- dışındaki tüm adminleri (ve tek süper admin olmadığı sürece süper adminleri
-- de) yetkiden düşürebiliyordu.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_revoke_platform_role(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_email TEXT;
BEGIN
  PERFORM public.require_super_admin();

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Kendi admin yetkinizi kaldıramazsınız.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.admin_team_members
              WHERE user_id = p_user_id AND admin_role = 'SUPER_ADMIN')
     AND (SELECT count(*) FROM public.admin_team_members
           WHERE admin_role = 'SUPER_ADMIN') <= 1 THEN
    RAISE EXCEPTION 'Son SUPER_ADMIN''in yetkisi kaldırılamaz.';
  END IF;

  SELECT email INTO v_email FROM public.profiles WHERE id = p_user_id;
  IF v_email IS NULL THEN RAISE EXCEPTION 'Kullanıcı bulunamadı.'; END IF;

  DELETE FROM public.admin_team_members WHERE user_id = p_user_id;
  -- role alanına dokunulmaz: kişi oyuncu/sağlayıcı olarak kalır, yalnız
  -- admin bayrağı düşer.
  UPDATE public.profiles SET is_admin = false WHERE id = p_user_id;

  PERFORM public.log_admin_action('ROLE_REVOKE', 'user', p_user_id, v_email, NULL,
    jsonb_build_object('revoked_at', NOW()));
  RETURN TRUE;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- B4) admin_reset_mfa: SUPER_ADMIN'e kilitli
--
-- ÖNCESİ: `require_admin_role(ARRAY['SUPER_ADMIN'])` çağırıyordu ama o fonksiyon
-- ADMIN'i erken dönüşle geçiriyordu — yani ADMIN başka bir adminin (ve süper
-- adminin) 2FA'sını sıfırlayıp hesabını devralabilirdi.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_reset_mfa(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
DECLARE v_uid uuid := auth.uid(); v_deleted int := 0; v_name text;
BEGIN
  PERFORM public.require_super_admin();
  IF p_user_id = v_uid THEN
    RAISE EXCEPTION 'SELF_RESET_FORBIDDEN: Kendi MFA''nızı sıfırlayamazsınız (başka bir SUPER_ADMIN yapmalı).';
  END IF;
  SELECT COALESCE(name, full_name, email) INTO v_name FROM public.profiles WHERE id = p_user_id;
  DELETE FROM auth.mfa_factors WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  DELETE FROM public.admin_mfa_recovery_codes WHERE user_id = p_user_id;
  PERFORM public.log_admin_action('MFA_RESET', 'user', p_user_id, v_name, NULL,
    jsonb_build_object('factors_removed', v_deleted));
  RETURN jsonb_build_object('ok', true, 'factors_removed', v_deleted);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- C1) admin_reveal_pii: SUPER_ADMIN'in PII'ı hiçbir admine açılmaz
--
-- Süper adminin e-postası/telefonu yalnız kendisine görünür. Atanan bir ADMIN
-- bu RPC ile süper adminin e-postasını maskeden çıkaramaz.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_reveal_pii(p_target_user_id uuid, p_field text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_value text;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_field NOT IN ('email', 'phone') THEN RAISE EXCEPTION 'Geçersiz alan'; END IF;

  -- Süper admin PII'ı korumalıdır: yalnız hesabın sahibi görebilir.
  IF public.is_super_admin(p_target_user_id) AND p_target_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'FORBIDDEN: SUPER_ADMIN hesabının iletişim bilgisi açılamaz.';
  END IF;

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
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- C2) admin_fetch_profiles: SUPER_ADMIN satırlarında PII tamamen boş
--
-- Diğer kullanıcılarda mevcut maskeleme (ab•••@g•••.com) korunur; süper admin
-- satırında e-posta/telefon hiç dönmez — maskeli hali bile sızıntı yüzeyidir.
-- Çağıran kendisi süper adminse her şeyi maskeli haliyle görmeye devam eder.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_fetch_profiles(
  p_offset integer DEFAULT 0,
  p_limit integer DEFAULT 500,
  p_search text DEFAULT NULL::text,
  p_status text DEFAULT NULL::text,
  p_role text DEFAULT NULL::text
)
RETURNS TABLE(id uuid, full_name text, name text, email text, phone text,
              avatar_url text, role text, roles jsonb, rating numeric,
              match_count integer, is_verified boolean, is_banned boolean,
              is_pro boolean, wallet_balance numeric,
              ban_expires_at timestamp with time zone,
              created_at timestamp with time zone, total_count bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_caller_is_super boolean;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  v_caller_is_super := public.is_super_admin();

  RETURN QUERY
  SELECT
    p.id, p.full_name::text, p.name::text,
    CASE
      WHEN NOT v_caller_is_super AND public.is_super_admin(p.id) THEN '•••'::text
      WHEN p.email IS NULL OR p.email = '' THEN p.email::text
      WHEN position('@' in p.email) = 0 THEN '•••'
      ELSE left(split_part(p.email, '@', 1), 2) || '•••@'
           || left(split_part(p.email, '@', 2), 1) || '•••'
           || CASE WHEN position('.' in split_part(p.email, '@', 2)) > 0
                   THEN '.' || split_part(split_part(p.email, '@', 2), '.', -1)
                   ELSE '' END
    END AS email,
    CASE
      WHEN NOT v_caller_is_super AND public.is_super_admin(p.id) THEN '•••'::text
      WHEN p.phone IS NULL OR p.phone = '' THEN p.phone::text
      WHEN length(regexp_replace(p.phone, '\D', '', 'g')) < 6 THEN '•••'
      ELSE left(p.phone, 4) || ' ••• •• ' || right(regexp_replace(p.phone, '\D', '', 'g'), 2)
    END AS phone,
    p.avatar_url::text, p.role::text, p.roles, p.rating, p.match_count,
    p.is_verified, p.is_banned, p.is_pro, p.wallet_balance, p.ban_expires_at,
    COALESCE(p.created_at, p.join_date, NOW()) AS created_at,
    COUNT(*) OVER() AS total_count
  FROM public.profiles p
  WHERE
    (p_search IS NULL OR p_search = '' OR
      p.full_name ILIKE '%' || p_search || '%' OR
      p.name ILIKE '%' || p_search || '%' OR
      -- Süper adminin e-postası arama ile de yoklanamaz.
      (p.email ILIKE '%' || p_search || '%'
        AND (v_caller_is_super OR NOT public.is_super_admin(p.id))) OR
      p.role ILIKE '%' || p_search || '%' OR
      p.id::text ILIKE '%' || p_search || '%')
    AND (
      p_status IS NULL OR p_status = '' OR p_status = 'all' OR
      (p_status = 'banned' AND p.is_banned = true) OR
      (p_status = 'pro' AND p.is_pro = true) OR
      (p_status = 'active' AND COALESCE(p.is_banned, false) = false)
    )
    AND (
      p_role IS NULL OR p_role = '' OR p_role = 'all' OR p.role = p_role
    )
  ORDER BY COALESCE(p.created_at, p.join_date) DESC NULLS LAST
  LIMIT GREATEST(p_limit, 1)
  OFFSET GREATEST(p_offset, 0);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- C3) profiles RLS: SUPER_ADMIN satırı normal ADMIN'e kapalı
--
-- RPC'lerdeki maskeleme, doğrudan tablo erişimiyle baypas edilebiliyordu:
-- `select email from profiles where id = <süper admin>` bir ADMIN için
-- çalışıyordu. Üç politika da (SELECT/UPDATE/DELETE) süper admin satırlarını
-- yalnız süper adminlere ve satırın sahibine bırakır.
--
-- `is_super_admin(uuid)` SECURITY DEFINER'dır; alt sorgudaki admin_team_members
-- okuması RLS'e takılmaz.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS profiles_select_own_or_admin ON public.profiles;
CREATE POLICY profiles_select_own_or_admin ON public.profiles
  FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) = id
    OR (
      public.is_admin()
      AND (
        (SELECT public.is_super_admin())
        OR NOT public.is_super_admin(profiles.id)
      )
    )
  );

DROP POLICY IF EXISTS profiles_update ON public.profiles;
CREATE POLICY profiles_update ON public.profiles
  FOR UPDATE TO authenticated
  USING (
    (SELECT auth.uid()) = id
    OR (
      public.is_admin()
      AND (
        (SELECT public.is_super_admin())
        OR NOT public.is_super_admin(profiles.id)
      )
    )
  )
  WITH CHECK (
    -- Süper admin: sınırsız.
    (SELECT public.is_super_admin())
    -- ADMIN: başkasının satırını düzenleyebilir ama YETKİ ALANLARINA dokunamaz.
    -- ÖNCESİ: `is_admin()` tek başına yeterliydi; bir ADMIN doğrudan
    -- `update profiles set role='SUPER_ADMIN' where id = auth.uid()` diyerek
    -- kendini süper admine yükseltebiliyordu (is_super_admin profiles.role'e de
    -- bakar). Panelin rol/yetki yazan tüm akışları zaten SECURITY DEFINER
    -- RPC'lerinden geçtiği için bu sıkılaştırma hiçbir ekranı bozmaz.
    OR (
      public.is_admin()
      AND NOT public.is_super_admin(profiles.id)
      AND public.profile_privileges_unchanged(profiles.id, (role)::text, is_admin, roles)
    )
    -- Sıradan kullanıcı: yalnız kendi satırı, yetki alanları sabit.
    OR (
      (SELECT auth.uid()) = id
      AND public.profile_privileges_unchanged(
            (SELECT auth.uid()), (role)::text, is_admin, roles)
    )
  );

DROP POLICY IF EXISTS profiles_delete_admin ON public.profiles;
CREATE POLICY profiles_delete_admin ON public.profiles
  FOR DELETE TO authenticated
  USING (
    public.is_admin()
    AND (
      (SELECT public.is_super_admin())
      OR NOT public.is_super_admin(profiles.id)
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- D) SUPER_ADMIN hesapları oyuncu tarafında GÖRÜNMEZ
--
-- Süper admin hesabı bir yönetim hesabıdır; ana uygulamanın oyuncu-yüzü keşif
-- yüzeylerinde yer almaz. Dört keşif RPC'sine yapısal dışlama eklenir:
--
--   search_users           → isim/@oyna_id araması
--   get_friend_suggestions → "tanıyor olabileceğin kişiler"
--   get_recent_teammates   → birlikte oynadıkların
--   match_contacts         → rehber (telefon hash'i) eşleştirmesi
--
-- Yalnız gizlilik bayrağı (is_searchable=false) yeterli değildi: bayrak
-- ayarlar ekranından geri açılabilir. Dışlama fonksiyonun kendisinde durur ve
-- gelecekteki süper adminler için de kendiliğinden geçerlidir. D1'deki bayrak
-- güncellemesi bunun görünen yüzünü (gizlilik ekranı) de tutarlı tutar.
--
-- NOT: aşağıdaki dört gövde, eklenen tek satır dışında canlıdaki tanımların
-- birebir aynısıdır. Bu fonksiyonlar ileride düzenlenirse
-- `AND NOT public.is_super_admin(...)` satırının korunması gerekir.
-- ─────────────────────────────────────────────────────────────────────────────

-- D1) Mevcut süper adminlerin gizlilik bayrakları (anlık etki + ekran tutarlılığı)
UPDATE public.profiles p
   SET is_searchable = false,
       discoverable_by_phone = false
 WHERE public.is_super_admin(p.id)
   AND (COALESCE(p.is_searchable, true) OR COALESCE(p.discoverable_by_phone, true));

-- D2) search_users: isim / @oyna_id araması
CREATE OR REPLACE FUNCTION public.search_users(p_q text, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
RETURNS TABLE(user_id uuid, full_name text, avatar_url text, oyna_id text, pos text, relationship text, request_id uuid, mutual_friends integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_uid     uuid := auth.uid();
  v_q       text := trim(coalesce(p_q, ''));
  v_norm    text;
  v_id_mode boolean := false;
  v_limit   integer := least(greatest(coalesce(p_limit, 20), 1), 50);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF left(v_q, 1) = '@' THEN v_id_mode := true; v_q := substr(v_q, 2); END IF;
  v_norm := public.normalize_tr(v_q);
  IF length(v_norm) < 2 THEN RETURN; END IF;

  RETURN QUERY
  WITH my_friends AS (
    SELECT CASE WHEN f.requester_id = v_uid THEN f.addressee_id ELSE f.requester_id END AS fid
    FROM public.friendships f
    WHERE f.status = 'ACCEPTED' AND (f.requester_id = v_uid OR f.addressee_id = v_uid)
  )
  SELECT
    p.id,
    coalesce(p.full_name, p.name::text, 'Oyuncu'),
    p.avatar_url,
    p.oyna_id,
    p.player_card->>'position',
    (public._friendship_state(v_uid, p.id)->>'state'),
    nullif(public._friendship_state(v_uid, p.id)->>'request_id', '')::uuid,
    (SELECT count(*)::int FROM public.friendships f2
     WHERE f2.status = 'ACCEPTED'
       AND ((f2.requester_id = p.id AND f2.addressee_id IN (SELECT fid FROM my_friends))
         OR (f2.addressee_id = p.id AND f2.requester_id IN (SELECT fid FROM my_friends))))
  FROM public.profiles p
  WHERE p.id <> v_uid
    AND coalesce(p.is_banned, false) = false
    AND coalesce(p.is_searchable, true) = true
    AND NOT public.is_super_admin(p.id)   -- yönetim hesabı: oyuncu tarafında görünmez
    AND NOT public._is_blocked_between(v_uid, p.id)
    AND (
      (v_id_mode AND lower(coalesce(p.oyna_id, '')) LIKE v_norm || '%')
      OR (NOT v_id_mode AND (
            lower(coalesce(p.oyna_id, '')) LIKE v_norm || '%'
            OR public.normalize_tr(p.full_name) LIKE '%' || v_norm || '%'
            OR public.normalize_tr(p.name::text) LIKE '%' || v_norm || '%'))
    )
  ORDER BY
    (lower(coalesce(p.oyna_id, '')) = v_norm) DESC,
    (lower(coalesce(p.oyna_id, '')) LIKE v_norm || '%') DESC,
    coalesce(p.full_name, p.name::text)
  LIMIT v_limit OFFSET greatest(coalesce(p_offset, 0), 0);
END $fn$;

-- D3) get_friend_suggestions: "tanıyor olabileceğin kişiler"
CREATE OR REPLACE FUNCTION public.get_friend_suggestions(p_limit integer DEFAULT 10)
RETURNS TABLE(user_id uuid, full_name text, avatar_url text, oyna_id text, pos text, mutual_friends integer, relationship text, request_id uuid)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_uid   uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 10), 1), 30);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  RETURN QUERY
  WITH my_friends AS (
    SELECT CASE WHEN f.requester_id = v_uid THEN f.addressee_id ELSE f.requester_id END AS fid
    FROM public.friendships f
    WHERE f.status = 'ACCEPTED' AND (f.requester_id = v_uid OR f.addressee_id = v_uid)
  ),
  cand AS (
    SELECT
      CASE WHEN f.requester_id = mf.fid THEN f.addressee_id ELSE f.requester_id END AS pid,
      count(*)::int AS mutual
    FROM public.friendships f
    JOIN my_friends mf
      ON f.status = 'ACCEPTED' AND (f.requester_id = mf.fid OR f.addressee_id = mf.fid)
    GROUP BY 1
  )
  SELECT
    p.id,
    coalesce(p.full_name, p.name::text, 'Oyuncu'),
    p.avatar_url,
    p.oyna_id,
    p.player_card->>'position',
    c.mutual,
    (public._friendship_state(v_uid, p.id)->>'state'),
    nullif(public._friendship_state(v_uid, p.id)->>'request_id', '')::uuid
  FROM cand c
  JOIN public.profiles p ON p.id = c.pid
  WHERE c.pid <> v_uid
    AND c.pid NOT IN (SELECT fid FROM my_friends)
    AND coalesce(p.is_banned, false) = false
    AND coalesce(p.is_searchable, true) = true
    AND NOT public.is_super_admin(p.id)   -- yönetim hesabı: oyuncu tarafında görünmez
    AND NOT public._is_blocked_between(v_uid, p.id)
  ORDER BY c.mutual DESC, coalesce(p.full_name, p.name::text)
  LIMIT v_limit;
END $fn$;

-- D4) get_recent_teammates: birlikte oynadığın kişiler
CREATE OR REPLACE FUNCTION public.get_recent_teammates(p_limit integer DEFAULT 20)
RETURNS TABLE(user_id uuid, full_name text, avatar_url text, oyna_id text, pos text, shared_matches integer, relationship text, request_id uuid)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_uid   uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  RETURN QUERY
  WITH parts AS (
    SELECT m.id AS mid, x.pid
    FROM public.matches m
    CROSS JOIN LATERAL (
      SELECT DISTINCT
        CASE
          WHEN s->>'occupant' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            THEN (s->>'occupant')::uuid
          WHEN s->'player'->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            THEN (s->'player'->>'id')::uuid
        END AS pid
      FROM jsonb_array_elements(coalesce(m.slots,'[]'::jsonb) || coalesce(m."awaySlots",'[]'::jsonb)) s
    ) x
    WHERE upper(coalesce(m.status, '')) IN ('COMPLETED','FINISHED','SCORED')
      AND x.pid IS NOT NULL
  ),
  my AS (SELECT mid FROM parts WHERE pid = v_uid),
  mates AS (
    SELECT pr.pid, count(*)::int AS shared
    FROM parts pr JOIN my ON my.mid = pr.mid
    WHERE pr.pid <> v_uid
    GROUP BY pr.pid
  )
  SELECT
    p.id,
    coalesce(p.full_name, p.name::text, 'Oyuncu'),
    p.avatar_url,
    p.oyna_id,
    p.player_card->>'position',
    mt.shared,
    (public._friendship_state(v_uid, p.id)->>'state'),
    nullif(public._friendship_state(v_uid, p.id)->>'request_id', '')::uuid
  FROM mates mt
  JOIN public.profiles p ON p.id = mt.pid
  WHERE coalesce(p.is_banned, false) = false
    AND coalesce(p.is_searchable, true) = true
    AND NOT public.is_super_admin(p.id)   -- yönetim hesabı: oyuncu tarafında görünmez
    AND NOT public._is_blocked_between(v_uid, p.id)
    AND NOT public._are_friends(v_uid, p.id)
  ORDER BY mt.shared DESC, coalesce(p.full_name, p.name::text)
  LIMIT v_limit;
END $fn$;

-- D5) match_contacts: rehber (telefon hash'i) eşleştirmesi
CREATE OR REPLACE FUNCTION public.match_contacts(p_hashes text[])
RETURNS TABLE(user_id uuid, full_name text, avatar_url text, oyna_id text, relationship text, request_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_uid       uuid := auth.uid();
  v_batch     integer := coalesce(array_length(p_hashes, 1), 0);
  v_daily_max integer := public._social_config_int('contact_hash_daily_max', 5000);
  v_used      integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF v_batch = 0 THEN RETURN; END IF;
  IF v_batch > 500 THEN
    RAISE EXCEPTION 'BATCH_TOO_LARGE: Tek seferde en fazla 500 kayıt gönderilebilir.';
  END IF;

  INSERT INTO public.social_rate_usage (user_id, bucket, day, count)
  VALUES (v_uid, 'contact_hash', (timezone('utc', now()))::date, v_batch)
  ON CONFLICT (user_id, bucket, day)
    DO UPDATE SET count = public.social_rate_usage.count + EXCLUDED.count
  RETURNING count INTO v_used;
  IF v_used > v_daily_max THEN
    RAISE EXCEPTION 'QUOTA: Günlük rehber eşleştirme kotası aşıldı.';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    coalesce(p.full_name, p.name::text, 'Oyuncu'),
    p.avatar_url,
    p.oyna_id,
    (public._friendship_state(v_uid, p.id)->>'state'),
    nullif(public._friendship_state(v_uid, p.id)->>'request_id', '')::uuid
  FROM public.profile_contact_hash h
  JOIN public.profiles p ON p.id = h.user_id
  WHERE h.phone_sha256 = ANY (p_hashes)
    AND p.id <> v_uid
    AND coalesce(p.is_banned, false) = false
    AND coalesce(p.discoverable_by_phone, true) = true
    AND NOT public.is_super_admin(p.id)   -- yönetim hesabı: rehberden de bulunamaz
    AND NOT public._is_blocked_between(v_uid, p.id);
END $fn$;

COMMENT ON FUNCTION public.require_super_admin() IS
  'Ekip/yetki/MFA işlemlerinin kapısı. require_admin_role()''dan farkı: ADMIN''i baypas etmez.';
COMMENT ON CONSTRAINT admin_team_members_admin_role_check ON public.admin_team_members IS
  'İki rol modeli: SUPER_ADMIN (ekip yönetimi dahil her şey) ve ADMIN (ekip yönetimi hariç her şey).';
