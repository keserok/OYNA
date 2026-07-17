-- ════════════════════════════════════════════════════════════════════════
-- STAFF-1 — PERSONEL GİRİŞİ & YETKİ TEMELİ
-- ------------------------------------------------------------------------
-- Sahip > Müdür > Personel hiyerarşisi için TEK KAYNAK yetki katmanı.
--   • Sahibin müdürden TEK ekstra yetkisi: personel/müdür ekleyip çıkarmak.
--   • Müdür ≈ Sahip (para-çekme + banka hesabı hariç — STAFF-2'de gerekçesiyle).
--   • Personel = kasa altkümesi (rezervasyon/onay/tahsilat/veresiye-ödeme).
--
-- Davet yöntemi: 6 haneli tek-kullanımlık kod, 72 saat geçerli.
-- pitch_staff_members bugüne kadar SADECE bir gösterim listesiydi (user_id
-- hiç bağlanmadı). Bu göç, gerçek giriş/yetki iskeletini kurar — mevcut
-- gösterim satırlarını bozmadan (hepsi 'ROSTER' olarak geriye-doldurulur).
--
-- Bu göç YALNIZCA additive'dir: RLS/RPC yetki genişletmesi STAFF-2'de yapılır.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1) ŞEMA: pitch_staff_members yeni sütunlar ──────────────────────────────
-- staff_role   : yetki katmanı (MANAGER = müdür, STAFF = personel)
-- account_status:
--    ROSTER  → sadece gösterim kartı, girişi yok (eski davranış, varsayılan)
--    INVITED → davet kodu verildi, kabul bekliyor
--    ACTIVE  → kullanıcı bağlandı, panel erişimi var
--    PASSIVE → erişim kaldırıldı/askıya alındı (denetim için satır korunur)
ALTER TABLE public.pitch_staff_members
  ADD COLUMN IF NOT EXISTS staff_role text NOT NULL DEFAULT 'STAFF'
    CHECK (staff_role IN ('MANAGER','STAFF')),
  ADD COLUMN IF NOT EXISTS account_status text NOT NULL DEFAULT 'ROSTER'
    CHECK (account_status IN ('ROSTER','INVITED','ACTIVE','PASSIVE')),
  ADD COLUMN IF NOT EXISTS invite_code text,
  ADD COLUMN IF NOT EXISTS invite_code_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS invited_at timestamptz,
  ADD COLUMN IF NOT EXISTS activated_at timestamptz,
  ADD COLUMN IF NOT EXISTS deactivated_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Bir kullanıcı bir sahada en fazla BİR üyelik (çift kayıt/çift yetki olmaz).
CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_member_user_per_pitch
  ON public.pitch_staff_members (pitch_id, user_id)
  WHERE user_id IS NOT NULL;

-- Yaşayan davet kodları küresel benzersiz (kabul anında kod net çözülür).
CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_live_invite_code
  ON public.pitch_staff_members (invite_code)
  WHERE invite_code IS NOT NULL AND account_status = 'INVITED';

-- Aktif üyelik sorguları (pitch_access_level sıcak yolu) için indeks.
CREATE INDEX IF NOT EXISTS ix_staff_active_by_user
  ON public.pitch_staff_members (user_id, pitch_id)
  WHERE account_status = 'ACTIVE';

-- ── 2) YARDIMCI: pitch_access_level ─────────────────────────────────────────
-- Geçerli kullanıcının bir sahadaki yetki seviyesi: 'OWNER' | 'MANAGER'
-- | 'STAFF' | NULL. TÜM yetki kontrolleri bu tek kaynaktan türetilir.
-- Sahiplik semantiği mevcut kalıpla BİREBİR aynıdır:
--   gerçek sahip (owner_id) VEYA admin VEYA (demo saha + OWNER rolü) => OWNER.
CREATE OR REPLACE FUNCTION public.pitch_access_level(p_pitch_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN p_pitch_id IS NULL THEN NULL
    WHEN (
      is_admin()
      OR EXISTS (
        SELECT 1 FROM pitches p
        WHERE p.id = p_pitch_id
          AND (p.owner_id = (SELECT auth.uid())
               OR (p.is_demo = true AND has_role('OWNER')))
      )
    ) THEN 'OWNER'
    ELSE (
      SELECT s.staff_role
      FROM pitch_staff_members s
      WHERE s.pitch_id = p_pitch_id
        AND s.user_id = (SELECT auth.uid())
        AND s.account_status = 'ACTIVE'
        AND s.staff_role IN ('MANAGER','STAFF')
      ORDER BY CASE s.staff_role WHEN 'MANAGER' THEN 0 ELSE 1 END
      LIMIT 1
    )
  END;
$$;

COMMENT ON FUNCTION public.pitch_access_level(uuid) IS
  'Geçerli kullanıcının sahadaki yetki seviyesi: OWNER|MANAGER|STAFF|NULL (tek kaynak).';

-- Yönetim (sahip VEYA müdür) — rezervasyon iptal, gider, tarife, ayar…
CREATE OR REPLACE FUNCTION public.can_manage_pitch(p_pitch_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT public.pitch_access_level(p_pitch_id) IN ('OWNER','MANAGER'); $$;

-- Kasa (sahip VEYA müdür VEYA personel) — rezervasyon oluştur, tahsilat…
CREATE OR REPLACE FUNCTION public.can_staff_pitch(p_pitch_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT public.pitch_access_level(p_pitch_id) IN ('OWNER','MANAGER','STAFF'); $$;

-- Yalnız sahip (para-çekme, banka hesabı, personel yönetimi).
CREATE OR REPLACE FUNCTION public.is_pitch_owner(p_pitch_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT public.pitch_access_level(p_pitch_id) = 'OWNER'; $$;

-- ── 3) YARDIMCI (dahili): benzersiz 6 haneli davet kodu üret ────────────────
CREATE OR REPLACE FUNCTION public._gen_staff_invite_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_code text;
  v_try  int := 0;
BEGIN
  LOOP
    v_try := v_try + 1;
    -- 000000–999999 arası, baştan sıfır dolgulu 6 hane.
    v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
    -- Yaşayan (INVITED) bir kodla çakışmadığından emin ol.
    IF NOT EXISTS (
      SELECT 1 FROM public.pitch_staff_members
      WHERE invite_code = v_code AND account_status = 'INVITED'
    ) THEN
      RETURN v_code;
    END IF;
    IF v_try > 40 THEN
      RAISE EXCEPTION 'CODE_GEN_FAILED: Davet kodu üretilemedi, tekrar deneyin.';
    END IF;
  END LOOP;
END;
$$;

-- ── 4) RPC: staff_invite — personel/müdür davet et (SAHİP-only) ─────────────
-- Sahibin müdürden tek ekstra yetkisi burada uygulanır: is_pitch_owner kapısı.
-- İki mod:
--   • p_member_id verilirse: mevcut ROSTER/PASSIVE kartı davete çevirir.
--   • verilmezse: yeni bir kayıt oluşturur (p_name zorunlu).
-- Sonuç: { member_id, invite_code, expires_at, staff_role }.
CREATE OR REPLACE FUNCTION public.staff_invite(
  p_pitch_id    uuid,
  p_member_id   uuid    DEFAULT NULL,
  p_name        text    DEFAULT NULL,
  p_role_title  text    DEFAULT NULL,
  p_phone       text    DEFAULT NULL,
  p_staff_role  text    DEFAULT 'STAFF'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_code     text;
  v_expires  timestamptz := now() + interval '72 hours';
  v_member   pitch_staff_members%ROWTYPE;
  v_count    int;
  v_role     text := upper(coalesce(nullif(trim(p_staff_role), ''), 'STAFF'));
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED: Giriş gerekli.'; END IF;
  IF NOT public.is_pitch_owner(p_pitch_id) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Personel yönetimi yalnızca saha sahibine aittir.';
  END IF;
  IF v_role NOT IN ('MANAGER','STAFF') THEN
    RAISE EXCEPTION 'INVALID_ROLE: Rol MANAGER veya STAFF olmalı.';
  END IF;

  -- Kötüye kullanım tavanı: PASSIVE olmayan üye sayısı (davet dahil).
  SELECT count(*) INTO v_count FROM public.pitch_staff_members
  WHERE pitch_id = p_pitch_id AND account_status <> 'PASSIVE';
  IF p_member_id IS NULL AND v_count >= 50 THEN
    RAISE EXCEPTION 'LIMIT_REACHED: En fazla 50 aktif ekip kaydı.';
  END IF;

  v_code := public._gen_staff_invite_code();

  IF p_member_id IS NOT NULL THEN
    -- Mevcut kartı davete çevir.
    SELECT * INTO v_member FROM public.pitch_staff_members
    WHERE id = p_member_id AND pitch_id = p_pitch_id
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Personel bulunamadı.'; END IF;
    IF v_member.account_status = 'ACTIVE' THEN
      RAISE EXCEPTION 'ALREADY_ACTIVE: Bu personelin girişi zaten aktif.';
    END IF;
    UPDATE public.pitch_staff_members
    SET staff_role             = v_role,
        role_title             = coalesce(nullif(trim(p_role_title), ''), role_title),
        phone                  = coalesce(nullif(trim(p_phone), ''), phone),
        account_status         = 'INVITED',
        invite_code            = v_code,
        invite_code_expires_at = v_expires,
        invited_at             = now(),
        created_by             = coalesce(created_by, v_uid)
    WHERE id = p_member_id
    RETURNING * INTO v_member;
  ELSE
    -- Yeni kayıt oluştur.
    IF nullif(trim(p_name), '') IS NULL THEN
      RAISE EXCEPTION 'NAME_REQUIRED: İsim zorunlu.';
    END IF;
    INSERT INTO public.pitch_staff_members (
      pitch_id, name, role_title, phone, status, staff_role,
      account_status, invite_code, invite_code_expires_at, invited_at, created_by
    ) VALUES (
      p_pitch_id, trim(p_name),
      coalesce(nullif(trim(p_role_title), ''), CASE WHEN v_role='MANAGER' THEN 'Müdür' ELSE 'Personel' END),
      nullif(trim(p_phone), ''), 'OFF_DUTY', v_role,
      'INVITED', v_code, v_expires, now(), v_uid
    )
    RETURNING * INTO v_member;
  END IF;

  RETURN jsonb_build_object(
    'member_id',  v_member.id,
    'invite_code', v_member.invite_code,
    'expires_at', v_member.invite_code_expires_at,
    'staff_role', v_member.staff_role,
    'name',       v_member.name
  );
END;
$$;

-- ── 5) RPC: staff_accept_invite — daveti kabul et (herhangi kullanıcı) ──────
-- Kodun sahibi kullanıcı, kendi user_id'sini bağlar. Sonuç: saha kimliği.
CREATE OR REPLACE FUNCTION public.staff_accept_invite(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_member pitch_staff_members%ROWTYPE;
  v_pitch  RECORD;
  v_clean  text := regexp_replace(coalesce(p_code, ''), '\D', '', 'g');
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED: Giriş gerekli.'; END IF;
  IF length(v_clean) <> 6 THEN
    RAISE EXCEPTION 'INVALID_CODE: Kod 6 haneli olmalı.';
  END IF;

  SELECT * INTO v_member FROM public.pitch_staff_members
  WHERE invite_code = v_clean AND account_status = 'INVITED'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVALID_OR_EXPIRED: Kod geçersiz veya kullanılmış.';
  END IF;
  IF v_member.invite_code_expires_at IS NOT NULL
     AND v_member.invite_code_expires_at < now() THEN
    RAISE EXCEPTION 'INVALID_OR_EXPIRED: Davet süresi dolmuş.';
  END IF;

  -- Saha sahibi kendi sahasına personel olamaz.
  SELECT p.id, p.name, p.owner_id INTO v_pitch
  FROM public.pitches p WHERE p.id = v_member.pitch_id;
  IF v_pitch.owner_id = v_uid THEN
    RAISE EXCEPTION 'OWNER_CANNOT_JOIN: Kendi sahanıza personel olamazsınız.';
  END IF;

  -- Aynı sahada zaten (başka satırda) aktif/davetli mi?
  IF EXISTS (
    SELECT 1 FROM public.pitch_staff_members
    WHERE pitch_id = v_member.pitch_id AND user_id = v_uid
      AND id <> v_member.id AND account_status IN ('ACTIVE','INVITED')
  ) THEN
    RAISE EXCEPTION 'ALREADY_MEMBER: Bu sahada zaten kayıtlısınız.';
  END IF;

  BEGIN
    UPDATE public.pitch_staff_members
    SET user_id                = v_uid,
        account_status         = 'ACTIVE',
        activated_at           = now(),
        invite_code            = NULL,
        invite_code_expires_at = NULL
    WHERE id = v_member.id
    RETURNING * INTO v_member;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'ALREADY_MEMBER: Bu sahada zaten kayıtlısınız.';
  END;

  RETURN jsonb_build_object(
    'pitch_id',   v_pitch.id,
    'pitch_name', v_pitch.name,
    'staff_role', v_member.staff_role,
    'member_id',  v_member.id
  );
END;
$$;

-- ── 6) RPC: staff_set_role — müdür↔personel (SAHİP-only) ────────────────────
CREATE OR REPLACE FUNCTION public.staff_set_role(p_member_id uuid, p_staff_role text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_member pitch_staff_members%ROWTYPE;
  v_role   text := upper(coalesce(nullif(trim(p_staff_role), ''), ''));
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED: Giriş gerekli.'; END IF;
  IF v_role NOT IN ('MANAGER','STAFF') THEN
    RAISE EXCEPTION 'INVALID_ROLE: Rol MANAGER veya STAFF olmalı.';
  END IF;
  SELECT * INTO v_member FROM public.pitch_staff_members WHERE id = p_member_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Personel bulunamadı.'; END IF;
  IF NOT public.is_pitch_owner(v_member.pitch_id) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Rol değişikliği yalnızca saha sahibine aittir.';
  END IF;
  UPDATE public.pitch_staff_members SET staff_role = v_role WHERE id = p_member_id
  RETURNING * INTO v_member;
  RETURN jsonb_build_object('member_id', v_member.id, 'staff_role', v_member.staff_role);
END;
$$;

-- ── 7) RPC: staff_remove — girişi kaldır (SAHİP-only) ──────────────────────
-- Hiç giriş yapmamış (user_id NULL) saf kart → sil. Bağlı hesap → PASSIVE
-- (denetim için satır korunur, erişim anında düşer).
CREATE OR REPLACE FUNCTION public.staff_remove(p_member_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_member pitch_staff_members%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED: Giriş gerekli.'; END IF;
  SELECT * INTO v_member FROM public.pitch_staff_members WHERE id = p_member_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Personel bulunamadı.'; END IF;
  IF NOT public.is_pitch_owner(v_member.pitch_id) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Personel kaldırma yalnızca saha sahibine aittir.';
  END IF;

  IF v_member.user_id IS NULL THEN
    DELETE FROM public.pitch_staff_members WHERE id = p_member_id;
    RETURN jsonb_build_object('member_id', p_member_id, 'removed', true);
  END IF;

  UPDATE public.pitch_staff_members
  SET account_status         = 'PASSIVE',
      deactivated_at         = now(),
      invite_code            = NULL,
      invite_code_expires_at = NULL
  WHERE id = p_member_id
  RETURNING * INTO v_member;
  RETURN jsonb_build_object('member_id', v_member.id, 'account_status', v_member.account_status);
END;
$$;

-- ── 8) RPC: staff_regenerate_invite — kodu yenile (SAHİP-only) ─────────────
-- Kaybolan/süresi dolan davet için yeni kod + 72 saat. INVITED kayda uygulanır;
-- PASSIVE/ROSTER kayıt yeniden davete çevrilir.
CREATE OR REPLACE FUNCTION public.staff_regenerate_invite(p_member_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_member pitch_staff_members%ROWTYPE;
  v_code   text;
  v_expires timestamptz := now() + interval '72 hours';
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED: Giriş gerekli.'; END IF;
  SELECT * INTO v_member FROM public.pitch_staff_members WHERE id = p_member_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Personel bulunamadı.'; END IF;
  IF NOT public.is_pitch_owner(v_member.pitch_id) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Yalnızca saha sahibi kod üretebilir.';
  END IF;
  IF v_member.account_status = 'ACTIVE' THEN
    RAISE EXCEPTION 'ALREADY_ACTIVE: Bu personelin girişi zaten aktif.';
  END IF;
  v_code := public._gen_staff_invite_code();
  UPDATE public.pitch_staff_members
  SET account_status         = 'INVITED',
      invite_code            = v_code,
      invite_code_expires_at = v_expires,
      invited_at             = now(),
      user_id                = CASE WHEN account_status = 'PASSIVE' THEN NULL ELSE user_id END
  WHERE id = p_member_id
  RETURNING * INTO v_member;
  RETURN jsonb_build_object(
    'member_id', v_member.id,
    'invite_code', v_member.invite_code,
    'expires_at', v_member.invite_code_expires_at,
    'staff_role', v_member.staff_role,
    'name', v_member.name
  );
END;
$$;

-- ── 9) RPC: get_my_staff_pitches — kullanıcının yönettiği sahalar ──────────
-- Giriş sonrası "Tesis Paneli" giriş noktası bunu okur. Yalnız ACTIVE üyelikler.
CREATE OR REPLACE FUNCTION public.get_my_staff_pitches()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT coalesce(jsonb_agg(row ORDER BY row->>'pitch_name'), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object(
      'pitch_id',    p.id,
      'pitch_name',  p.name,
      'access_level', s.staff_role,
      'role_title',  s.role_title,
      'member_id',   s.id
    ) AS row
    FROM public.pitch_staff_members s
    JOIN public.pitches p ON p.id = s.pitch_id
    WHERE s.user_id = (SELECT auth.uid())
      AND s.account_status = 'ACTIVE'
      AND s.staff_role IN ('MANAGER','STAFF')
  ) t;
$$;

-- ── 10) İZİNLER ─────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public._gen_staff_invite_code() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pitch_access_level(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_pitch(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_staff_pitch(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_pitch_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_invite(uuid, uuid, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_accept_invite(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_set_role(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_remove(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_regenerate_invite(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_staff_pitches() TO authenticated;
