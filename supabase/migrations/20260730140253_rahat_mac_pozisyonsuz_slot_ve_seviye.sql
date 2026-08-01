-- ============================================================================
-- RAHAT MAÇ ALTYAPISI — pozisyonsuz slot, ayakkabı kuralı, beyan, takım taşıma
--
-- Rahat maç bir EKRAN değil, bir MAÇ ÇEŞİDİdir: aynı matches tablosu, aynı slot
-- makinesi, aynı ödeme/iade/eşik zinciri. Tek fark: slot POZİSYONSUZdur ve
-- kadro iki takıma (slots = Beyaz, awaySlots = Kırmızı) bölünür.
--
-- ── TASARIM KARARI: neden trigger, neden üç fonksiyonu yeniden yazmıyoruz ───
-- Slot üretimi ÜÇ ayrı yoldan geçiyor: create_match_atomic, player_create_match,
-- admin_create_match__core. Üçünü de kopyalayıp yeniden yazmak ~300 satır
-- çoğaltma ve üç kat sapma riski demek (migration'lar değişmez; kopya kalıcı).
-- Yerine TEK invariant noktası kuruyoruz: matches üzerinde BEFORE trigger.
--   "Rahat bir maçın slotları asla pozisyonlu olamaz."
-- Bu, bugünkü üç yolu da GELECEKTEKİ yolları da kapsar ve yalnız role/x/y'ye
-- dokunur — doluluk, satın alma, occupant, atama durumu ASLA değişmez.
-- (matches üzerinde BEFORE trigger yerleşik desen: trg_matches_autofill_image,
--  trg_matches_format_range_guard, trg_matches_sync_time_and_score_status.)
-- ============================================================================

-- ─── 1) Ayakkabı kuralı ─────────────────────────────────────────────────────
-- NULL = kurucu belirtmedi → HAKKINDA sekmesinde kart HİÇ çizilmez.
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS footwear_rule text;

DO $$ BEGIN
  ALTER TABLE public.matches
    ADD CONSTRAINT matches_footwear_rule_chk
    CHECK (footwear_rule IS NULL OR footwear_rule IN ('CLEATS_OK', 'TURF_SHOES'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN public.matches.footwear_rule IS
  'CLEATS_OK = krampon serbest, TURF_SHOES = halı saha ayakkabısı. '
  'NULL ise kullanıcıya hiçbir ayakkabı bilgisi gösterilmez.';

-- ─── 2) Pozisyonsuz slot dizisi üreteci ─────────────────────────────────────
-- Kanonik _default_formation_slots ile AYNI sözleşme: desteklenmeyen formatta
-- '[]' döner ki çağıranlardaki FORMAT_OUT_OF_RANGE kapısı çalışmaya devam etsin.
CREATE OR REPLACE FUNCTION public._flat_slots(p_size text, p_prefix text)
RETURNS jsonb
LANGUAGE sql IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'id', p_prefix || '_' || (i - 1)::text,
             'role', 'OYUNCU',
             'status', 'OPEN')
           ORDER BY i), '[]'::jsonb)
  FROM generate_series(1, COALESCE(
    (SELECT per FROM (
       SELECT NULLIF(split_part(COALESCE(p_size, ''), 'v', 1), '')::int AS per
       WHERE COALESCE(p_size, '') ~ '^\d{1,2}v\d{1,2}$'
     ) t WHERE per BETWEEN 3 AND 11), 0)) AS g(i);
$$;
REVOKE ALL ON FUNCTION public._flat_slots(text, text) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public._flat_slots(text, text) IS
  'Rahat maç için POZİSYONSUZ slot dizisi: role=OYUNCU, x/y anahtarı YOK. '
  'Desteklenmeyen formatta [] döner (format kapısı bozulmasın).';

-- ─── 3) Tek slot dizisini pozisyonsuz hâle indirger ─────────────────────────
-- Yalnız role/x/y'ye dokunur. status, purchasedBy, occupant, assignmentStatus,
-- player, claimCode, inviteeId, side AYNEN korunur → doluluk matematiği ve
-- satın alma yaşam döngüsü etkilenmez. Dizi SIRASI korunur.
CREATE OR REPLACE FUNCTION public._flatten_slot_array(p_slots jsonb)
RETURNS jsonb
LANGUAGE sql IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(jsonb_agg(
           (s - 'x' - 'y') || jsonb_build_object('role', 'OYUNCU')
           ORDER BY ord), '[]'::jsonb)
  FROM jsonb_array_elements(COALESCE(p_slots, '[]'::jsonb)) WITH ORDINALITY AS t(s, ord);
$$;
REVOKE ALL ON FUNCTION public._flatten_slot_array(jsonb) FROM PUBLIC, anon, authenticated;

-- ─── 4) Invariant trigger: Rahat maçın slotu pozisyonsuzdur ─────────────────
CREATE OR REPLACE FUNCTION public._rahat_slots_positionless()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF COALESCE(NEW.difficulty, '') <> 'Rahat' THEN
    RETURN NEW;
  END IF;
  -- Boş diziyi jsonb_agg NULL'a çevirmesin diye COALESCE _flatten içinde.
  IF NEW.slots IS NOT NULL AND jsonb_typeof(NEW.slots) = 'array' THEN
    NEW.slots := public._flatten_slot_array(NEW.slots);
  END IF;
  IF NEW."awaySlots" IS NOT NULL AND jsonb_typeof(NEW."awaySlots") = 'array' THEN
    NEW."awaySlots" := public._flatten_slot_array(NEW."awaySlots");
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_matches_rahat_positionless ON public.matches;
CREATE TRIGGER trg_matches_rahat_positionless
  BEFORE INSERT OR UPDATE OF slots, "awaySlots", difficulty ON public.matches
  FOR EACH ROW EXECUTE FUNCTION public._rahat_slots_positionless();

-- ─── 5) apply_onboarding: beyan edilen seviye (self_skill) ──────────────────
-- Yeni 8. parametre. DEFAULT'lu bir aşırı yükleme EKLEMEK yerine eski 7'li imza
-- DÜŞÜRÜLÜR: yoksa 7 argümanlı çağrı iki imzaya da uyup "function is not unique"
-- hatası verirdi.
DROP FUNCTION IF EXISTS public.apply_onboarding(text, text, text, text, text, text, boolean);

CREATE OR REPLACE FUNCTION public.apply_onboarding(
  p_age_range text, p_first_name text, p_last_name text,
  p_gender text, p_position text, p_play_style text,
  p_completed boolean DEFAULT true,
  p_self_skill smallint DEFAULT NULL
)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid  uuid := (SELECT auth.uid());
  v_done boolean;
  v_full text;
  v_in_f text; v_in_l text;
  v_cur  RECORD;
  v_eff_f text; v_eff_l text;
  v_eff_skill smallint;
  v_parts text[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  SELECT has_completed_onboarding INTO v_done FROM public.profiles WHERE id = v_uid;
  IF COALESCE(v_done, false) THEN
    RETURN json_build_object('ok', true, 'skipped', true);
  END IF;

  v_in_f := btrim(regexp_replace(COALESCE(p_first_name, ''), '\s+', ' ', 'g'));
  v_in_l := btrim(regexp_replace(COALESCE(p_last_name,  ''), '\s+', ' ', 'g'));

  IF (v_in_f <> '' OR v_in_l <> '') AND NOT public.is_valid_person_name(v_in_f, v_in_l) THEN
    RAISE EXCEPTION 'INVALID_NAME: Ad ve soyad zorunludur; yalnız harflerden oluşmalı ve soyad tek kelime olmalıdır.';
  END IF;

  IF p_self_skill IS NOT NULL AND p_self_skill NOT BETWEEN 1 AND 10 THEN
    RAISE EXCEPTION 'INVALID_SELF_SKILL: Seviye 1 ile 10 arasında olmalı.';
  END IF;

  SELECT first_name, last_name, full_name, name, self_skill INTO v_cur
  FROM public.profiles WHERE id = v_uid;

  -- Forward-only birleşim: boş gelen alan mevcut değeri SİLMEZ.
  v_eff_f := COALESCE(NULLIF(v_in_f, ''), NULLIF(btrim(COALESCE(v_cur.first_name, '')), ''));
  v_eff_l := COALESCE(NULLIF(v_in_l, ''), NULLIF(btrim(COALESCE(v_cur.last_name,  '')), ''));
  v_eff_skill := COALESCE(p_self_skill, v_cur.self_skill);

  IF v_eff_f IS NULL OR v_eff_l IS NULL THEN
    v_parts := string_to_array(
      btrim(regexp_replace(COALESCE(v_cur.full_name, v_cur.name, ''), '\s+', ' ', 'g')), ' ');
    IF array_length(v_parts, 1) >= 2 THEN
      v_eff_f := COALESCE(v_eff_f, array_to_string(v_parts[1:array_length(v_parts,1)-1], ' '));
      v_eff_l := COALESCE(v_eff_l, v_parts[array_length(v_parts,1)]);
    END IF;
  END IF;

  IF p_completed AND NOT public.is_valid_person_name(v_eff_f, v_eff_l) THEN
    RAISE EXCEPTION 'NAME_REQUIRED: Profilini tamamlamak için ad ve soyadını gir.';
  END IF;

  -- Beyan ZORUNLU (E7): ad-soyad kapısının ikizi. Seviye olmadan profil
  -- tamamlanmış sayılamaz — kadroda "seviyesi yok" boşluğu oluşmasın.
  IF p_completed AND v_eff_skill IS NULL THEN
    RAISE EXCEPTION 'SELF_SKILL_REQUIRED: Profilini tamamlamak için seviyeni seç.';
  END IF;

  v_full := NULLIF(btrim(COALESCE(v_eff_f, '') || ' ' || COALESCE(v_eff_l, '')), '');

  UPDATE public.profiles SET
    age_range  = COALESCE(NULLIF(trim(COALESCE(p_age_range, '')),  ''), age_range),
    first_name = COALESCE(v_eff_f, first_name),
    last_name  = COALESCE(v_eff_l, last_name),
    full_name  = COALESCE(v_full, full_name),
    name       = COALESCE(v_full, name),
    gender     = COALESCE(NULLIF(p_gender, ''), gender),
    position   = COALESCE(NULLIF(trim(COALESCE(p_position, '')),   ''), position),
    play_style = COALESCE(NULLIF(p_play_style, ''), play_style),
    self_skill = COALESCE(p_self_skill, self_skill),
    is_minor   = CASE
      WHEN NULLIF(trim(COALESCE(p_age_range, '')), '') IS NOT NULL
        THEN public.compute_is_minor(birthdate, p_age_range)
      ELSE is_minor END,
    guardian_consent_status = CASE
      WHEN NULLIF(trim(COALESCE(p_age_range, '')), '') IS NOT NULL
       AND public.compute_is_minor(birthdate, p_age_range)
       AND guardian_consent_status = 'NONE'
        THEN 'PENDING'
      ELSE guardian_consent_status END,
    has_completed_onboarding = CASE WHEN p_completed THEN true ELSE has_completed_onboarding END,
    updated_at = now()
  WHERE id = v_uid;

  RETURN json_build_object(
    'ok', true,
    'completed', p_completed,
    'is_minor', (SELECT is_minor FROM public.profiles WHERE id = v_uid)
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.apply_onboarding(text, text, text, text, text, text, boolean, smallint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_onboarding(text, text, text, text, text, text, boolean, smallint) TO authenticated;

COMMENT ON FUNCTION public.apply_onboarding(text, text, text, text, text, text, boolean, smallint) IS
  'Onboarding kapısı. p_self_skill (1-10) beyan edilen seviye; p_completed=true '
  'iken NULL olamaz (ad-soyad kapısının ikizi). Forward-only: boş alan silmez. '
  'ÖNEMLİ: self_skill ÖNCESİ tamamlanmış eski profiller etkilenmez (fonksiyon '
  'has_completed_onboarding=true ise erken döner) — onlar beyanı profil '
  'ayarlarından girer, o zamana kadar seviye çipi çizilmez.';

-- ─── 6) Beyanı profil ayarlarından güncelle ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_my_self_skill(p_value smallint)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_value IS NULL OR p_value NOT BETWEEN 1 AND 10 THEN
    RAISE EXCEPTION 'INVALID_SELF_SKILL: Seviye 1 ile 10 arasında olmalı.';
  END IF;
  UPDATE public.profiles SET self_skill = p_value, updated_at = now() WHERE id = v_uid;
  RETURN jsonb_build_object('ok', true, 'selfSkill', p_value);
END;
$$;
REVOKE ALL ON FUNCTION public.set_my_self_skill(smallint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_my_self_skill(smallint) TO authenticated;

-- ─── 7) player_move_slot_team — satın alınan yeri karşı takıma taşı ─────────
-- PARA HAREKETİ YOK: yalnız iki slot dizisi arasında taşıma. Yalnız slotu SATIN
-- ALAN taşıyabilir. Hedef tarafta OPEN yer yoksa reddedilir. FOR UPDATE kilidi
-- iki kişinin aynı son yeri kapmasını engeller.
CREATE OR REPLACE FUNCTION public.player_move_slot_team(
  p_match_id uuid, p_slot_id text, p_target_side text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_slots jsonb; v_away jsonb;
  v_src jsonb; v_dst jsonb;          -- kaynak/hedef diziler
  v_slot jsonb;                       -- taşınacak slot
  v_src_is_home boolean;
  v_target_id text;
  v_payload jsonb;                    -- taşınan yük (id hariç)
  v_occ uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_target_side NOT IN ('home', 'away') THEN RAISE EXCEPTION 'INVALID_SIDE'; END IF;

  SELECT slots, COALESCE("awaySlots", '[]'::jsonb) INTO v_slots, v_away
  FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF v_slots IS NULL THEN RAISE EXCEPTION 'NOT_FOUND: Maç bulunamadı'; END IF;

  -- Slot hangi tarafta?
  SELECT s INTO v_slot FROM jsonb_array_elements(v_slots) s WHERE s->>'id' = p_slot_id;
  IF v_slot IS NOT NULL THEN
    v_src_is_home := true;
  ELSE
    SELECT s INTO v_slot FROM jsonb_array_elements(v_away) s WHERE s->>'id' = p_slot_id;
    IF v_slot IS NULL THEN RAISE EXCEPTION 'SLOT_NOT_FOUND: %', p_slot_id; END IF;
    v_src_is_home := false;
  END IF;

  IF (v_slot->>'purchasedBy') IS DISTINCT FROM v_uid::text THEN
    RAISE EXCEPTION 'NOT_OWNER: Bu yeri sen almadın.';
  END IF;

  -- Zaten hedef taraftaysa sessizce başarılı (idempotent).
  IF (v_src_is_home AND p_target_side = 'home')
     OR (NOT v_src_is_home AND p_target_side = 'away') THEN
    RETURN jsonb_build_object('ok', true, 'moved', false, 'reason', 'ALREADY_THERE');
  END IF;

  v_src := CASE WHEN v_src_is_home THEN v_slots ELSE v_away END;
  v_dst := CASE WHEN v_src_is_home THEN v_away  ELSE v_slots END;

  -- Hedefte ilk OPEN yer (deterministik: dizi sırası).
  SELECT s->>'id' INTO v_target_id
  FROM jsonb_array_elements(v_dst) WITH ORDINALITY AS t(s, ord)
  WHERE COALESCE(s->>'status', 'OPEN') = 'OPEN'
  ORDER BY ord LIMIT 1;
  IF v_target_id IS NULL THEN
    RAISE EXCEPTION 'TARGET_FULL: Karşı takımda boş yer yok.';
  END IF;

  -- Taşınan yük: id/role/x/y HARİÇ her şey (hedefin kendi id'si korunur).
  v_payload := v_slot - 'id' - 'role' - 'x' - 'y';
  v_occ := COALESCE(NULLIF(v_slot->>'occupant', '')::uuid,
                    NULLIF(v_slot->'player'->>'id', '')::uuid);

  -- Kaynak slot boşalır (satın alma izleri temizlenir).
  v_src := (SELECT jsonb_agg(
      CASE WHEN s->>'id' = p_slot_id
        THEN (s - 'player' - 'occupant' - 'inviteeId' - 'claimCode' - 'purchasedBy' - 'assignmentStatus')
             || jsonb_build_object('status', 'OPEN')
        ELSE s END ORDER BY ord)
    FROM jsonb_array_elements(v_src) WITH ORDINALITY AS t(s, ord));

  -- Hedef slot yükü devralır.
  v_dst := (SELECT jsonb_agg(
      CASE WHEN s->>'id' = v_target_id THEN s || v_payload ELSE s END ORDER BY ord)
    FROM jsonb_array_elements(v_dst) WITH ORDINALITY AS t(s, ord));

  IF v_src_is_home THEN
    v_slots := v_src; v_away := v_dst;
  ELSE
    v_away := v_src; v_slots := v_dst;
  END IF;
  UPDATE public.matches SET slots = v_slots, "awaySlots" = v_away WHERE id = p_match_id;

  -- Katılımcı indeksi taraf değiştirir (oturan varsa onun tarafı).
  IF v_occ IS NOT NULL THEN
    UPDATE public.match_participants SET role = p_target_side
     WHERE match_id = p_match_id AND user_id = v_occ;
  END IF;

  RETURN jsonb_build_object('ok', true, 'moved', true,
                            'fromSlot', p_slot_id, 'toSlot', v_target_id,
                            'side', p_target_side);
END;
$$;
REVOKE ALL ON FUNCTION public.player_move_slot_team(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.player_move_slot_team(uuid, text, text) TO authenticated;
