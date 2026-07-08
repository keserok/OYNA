-- ════════════════════════════════════════════════════════════════════════
-- Rol geçişi & açılış ekranı düzeltmesi — profiles.roles backfill + kalıcı akış
-- ------------------------------------------------------------------------
-- Amaç: kaleci/hakem/saha sahibi hesaplarında uygulama-içi "Rol Değiştir"in
-- (set_active_role RPC) çalışması ve girişin doğru panele düşmesi için,
-- profiles.roles dizisinin sahip olunan TÜM (geçilebilir) rolleri içermesini
-- garanti etmek. Ayrıca bunu YENİ kullanıcılar için de sürdürmek (tek seferlik
-- backfill yetmez): sağlayıcı başvurusu PLAYER'ı düşürmesin + tesis sahipliği
-- OWNER rolünü kazandırsın.
--
-- set_active_role yalnız roles[]'te bulunan bir role izin verir (ROLE_NOT_OWNED).
--
-- Güvenlik: profiles üzerindeki koruma trigger'ı (protect_profile_columns) role/
-- roles değişimini yalnız `app.bypass_role_protection='true'` bayrağıyla, admin,
-- service_role ya da auth.uid()=NULL iken serbest bırakır. Migration postgres
-- rolüyle koşar (auth.uid()=NULL) → aşağıdaki doğrudan UPDATE'ler serbesttir.
-- RPC'ler ise apply_for_provider_role'ün KANITLANMIŞ desenini kullanır (bypass
-- bayrağını set ederek). Idempotent: her adım yalnız eksikse ekler.
-- ════════════════════════════════════════════════════════════════════════

-- ─── 1) Mevcut satırlar için backfill ──────────────────────────────────────

-- 1a) "Kayıt olan herkes oyuncu" → herkeste PLAYER bulunmalı. Yönetici satırları
--     hariç: ADMIN/SUPER_ADMIN'e PLAYER eklemek, girişte rolün PLAYER'a
--     düşürülmesi riskini artırır (frontend'de ayrıca korunur, ama burada da
--     dokunmuyoruz).
UPDATE public.profiles
SET roles = COALESCE(roles, '[]'::jsonb) || '["PLAYER"]'::jsonb
WHERE NOT (COALESCE(roles, '[]'::jsonb) ? 'PLAYER')
  AND COALESCE(role, '') NOT IN ('ADMIN', 'SUPER_ADMIN');

-- 1b) Aktif rol daima sahip olunan roller içinde olmalı (o role geri dönebilmek
--     için). Yalnız geçilebilir roller (PLAYER/GOALKEEPER/REFEREE/OWNER).
UPDATE public.profiles
SET roles = COALESCE(roles, '[]'::jsonb) || jsonb_build_array(role)
WHERE role IN ('PLAYER', 'GOALKEEPER', 'REFEREE', 'OWNER')
  AND NOT (COALESCE(roles, '[]'::jsonb) ? role);

-- 1c) Saha sahibi: GERÇEK (demo olmayan) en az bir tesise sahip olan herkes
--     'OWNER' rolünü taşımalı (owner bazı yerlerde yalnız pitches.owner_id ile
--     izlendiğinden). Demo tesisler hariç → gereksiz owner_accounts satırı açılmaz.
UPDATE public.profiles p
SET roles = COALESCE(p.roles, '[]'::jsonb) || '["OWNER"]'::jsonb
WHERE EXISTS (
    SELECT 1 FROM public.pitches pt
    WHERE pt.owner_id = p.id AND NOT COALESCE(pt.is_demo, false)
  )
  AND NOT (COALESCE(p.roles, '[]'::jsonb) ? 'OWNER');

-- ─── 2) Sağlayıcı başvurusu artık PLAYER'ı DÜŞÜRMEZ ────────────────────────
-- Eski apply_for_provider_role: roles = jsonb_build_array(p_role) → PLAYER silinir,
-- sağlayıcı bir daha "Oyuncu Moduna" geçemezdi. Yeni: mevcut roller + PLAYER +
-- p_role birleşimi (tekilleştirilmiş). Aktif rol yine p_role olur.
CREATE OR REPLACE FUNCTION public.apply_for_provider_role(p_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := (SELECT auth.uid());
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Oturum bulunamadı';
  END IF;

  IF p_role NOT IN ('GOALKEEPER', 'REFEREE') THEN
    RAISE EXCEPTION 'Geçersiz rol: %', p_role;
  END IF;

  PERFORM set_config('app.bypass_role_protection', 'true', true);

  UPDATE public.profiles
     SET role = p_role,
         roles = (
           SELECT COALESCE(jsonb_agg(DISTINCT e), '[]'::jsonb)
           FROM jsonb_array_elements_text(
             COALESCE(roles, '[]'::jsonb) || jsonb_build_array('PLAYER', p_role)
           ) AS t(e)
         ),
         updated_at = now()
   WHERE id = v_uid;
END;
$function$;

REVOKE ALL ON FUNCTION public.apply_for_provider_role(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_for_provider_role(text) TO authenticated;

-- ─── 3) Tesis onboarding'i OWNER rolünü kazandırır ────────────────────────
-- PartnerOnboarding tesisi oluşturduktan sonra bu RPC'yi çağırır. Böylece YENİ
-- saha sahibi bir sonraki girişte OwnerPanel'e düşer (pickLandingRole OWNER'ı
-- seçer) ve "Rol Değiştir" ile oyuncu moduna geçebilir. Yalnız gerçekten (demo
-- olmayan) tesise sahip olan çağırır; aktif rol yalnız PLAYER ise OWNER'a alınır
-- (mevcut GK/REF/ADMIN aktif rolü ezilmez), OWNER + PLAYER daima roles'a eklenir.
CREATE OR REPLACE FUNCTION public.claim_owner_role()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := (SELECT auth.uid());
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Oturum bulunamadı';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.pitches
    WHERE owner_id = v_uid AND NOT COALESCE(is_demo, false)
  ) THEN
    RAISE EXCEPTION 'NO_PITCH: Tesis sahibi değilsin.';
  END IF;

  PERFORM set_config('app.bypass_role_protection', 'true', true);

  UPDATE public.profiles
     SET roles = (
           SELECT COALESCE(jsonb_agg(DISTINCT e), '[]'::jsonb)
           FROM jsonb_array_elements_text(
             COALESCE(roles, '[]'::jsonb) || '["PLAYER","OWNER"]'::jsonb
           ) AS t(e)
         ),
         role = CASE WHEN COALESCE(role, 'PLAYER') = 'PLAYER' THEN 'OWNER' ELSE role END,
         updated_at = now()
   WHERE id = v_uid;

  RETURN 'OWNER';
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_owner_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_owner_role() TO authenticated;
