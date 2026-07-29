-- S2 — "Sahipsiz tesis diye bir durum yok."
--
-- Üç katman, tek kaynak:
--   1) VERİ ONARIMI  — sahipsiz ve yayında olan gerçek tesis vitrinden çekilir.
--   2) CHECK         — sahipsiz gerçek tesis bir daha ASLA yayına giremez.
--                      Vitrini besleyen her sorgu zaten is_published üzerinden
--                      filtreliyor (PitchDiscovery, get_nearby_pitches,
--                      get_showcase_availability); bu kısıt sayesinde hiçbirine
--                      ayrı bir "owner_id IS NOT NULL" filtresi eklemek gerekmez.
--   3) TRIGGER       — yeni sahipsiz tesis doğamaz, mevcut sahip silinemez;
--                      atanan kullanıcı gerçekten var mı doğrulanır ve OWNER
--                      yetkisi yoksa verilir (rol seti; aktif rolüne dokunulmaz).
--
-- DEMO İSTİSNASI: seed_owner_demo demo tesisi bilerek owner_id = NULL ile kurar
-- ve pitch_access_level demo tesise OWNER rolü olan herkese erişim verir. Demo
-- kayıtlar zaten demo_mode_enabled + RLS ile kapalı; kurala dahil edilmez.

-- ── 1) Veri onarımı ──────────────────────────────────────────────────────────
-- NOT: Sahibi olmayan tesise sahip UYDURULMAZ. Yapılan tek şey vitrinden çekmek;
-- admin panelinde görünmeye devam eder ve sahip atanınca yeniden yayınlanabilir.
UPDATE public.pitches SET is_published = false
WHERE owner_id IS NULL AND is_demo IS NOT TRUE AND COALESCE(is_published, false);

-- ── 2) Vitrin kapısı ─────────────────────────────────────────────────────────
ALTER TABLE public.pitches DROP CONSTRAINT IF EXISTS pitches_published_needs_owner;
ALTER TABLE public.pitches
  ADD CONSTRAINT pitches_published_needs_owner
  CHECK (
    owner_id IS NOT NULL
    OR is_demo IS TRUE
    OR NOT COALESCE(is_published, false)
  );

COMMENT ON CONSTRAINT pitches_published_needs_owner ON public.pitches IS
  'Sahipsiz gerçek tesis vitrine çıkamaz. Demo tesisler muaftır (demo_mode_enabled + RLS ile kapalı).';

-- ── 3) Sahiplik bekçisi ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._pitches_owner_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE v_exists boolean;
BEGIN
  -- Demo tesisler kural dışı.
  IF COALESCE(NEW.is_demo, false) THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' AND NEW.owner_id IS NULL THEN
    RAISE EXCEPTION 'OWNER_REQUIRED: Tesis sahibi zorunludur — sahipsiz tesis oluşturulamaz.';
  END IF;

  -- Mevcut sahip boşaltılamaz. (owner_id'si zaten NULL olan eski kayıtlar
  -- düzenlenebilir kalır ki admin onlara sahip atayabilsin.)
  IF TG_OP = 'UPDATE' AND NEW.owner_id IS NULL AND OLD.owner_id IS NOT NULL THEN
    RAISE EXCEPTION 'OWNER_REQUIRED: Tesis sahipsiz bırakılamaz — devredeceğin yeni sahibi seç.';
  END IF;

  IF NEW.owner_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.owner_id IS DISTINCT FROM OLD.owner_id) THEN
    SELECT true INTO v_exists FROM public.profiles WHERE id = NEW.owner_id;
    IF NOT COALESCE(v_exists, false) THEN
      RAISE EXCEPTION 'OWNER_NOT_FOUND: Seçilen tesis sahibi kullanıcı bulunamadı.';
    END IF;

    -- Tesis sahibi yapmak = OWNER yetkisi vermek. Yalnız yetki SETİNE eklenir;
    -- profiles.role (aktif rol) değiştirilmez, kullanıcı açılış ekranını kaybetmez.
    UPDATE public.profiles
       SET roles = COALESCE(roles, '[]'::jsonb) || '["OWNER"]'::jsonb
     WHERE id = NEW.owner_id
       AND NOT COALESCE(roles, '[]'::jsonb) @> '["OWNER"]'::jsonb;
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_pitches_owner_guard ON public.pitches;
CREATE TRIGGER trg_pitches_owner_guard
BEFORE INSERT OR UPDATE OF owner_id, is_demo ON public.pitches
FOR EACH ROW EXECUTE FUNCTION public._pitches_owner_guard();

COMMENT ON FUNCTION public._pitches_owner_guard() IS
  'S2: sahipsiz gerçek tesis doğmasını ve sahibin boşaltılmasını engeller; atanan sahibe OWNER yetkisini verir.';
