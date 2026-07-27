-- ============================================================
-- F1.8 — Kaptanın oyuncu çıkarması: player_kick_slot (atomik, iadeli, yetkili)
-- ============================================================
-- Tespitler (canlıdan, 2026-07-27):
--  * Client kick'i (MatchJoin.handleRemovePlayer) tüm slot dizisini
--    player_update_match'e gönderiyordu; canlı player_update_match slot
--    anahtarlarını YOK SAYIYOR (sertleştirilmiş) → kick üretimde SESSİZ
--    NO-OP'tu: arayüz başarı gösteriyor, yenileyince oyuncu geri geliyordu.
--  * Ödemiş oyuncu çıkarıldığında hiçbir iade yazılmıyordu.
--  * Kaptan kapısı yalnız UI'daydı.
-- Bu RPC üçünü birden çözer. Semantik canlı leave_public_match_slot ile
-- birebir hizalı: slot temizliği aynı anahtar setiyle, iade idempotent
-- _match_refund_partial ile, boşalan yer için _notify_first_reserve
-- (yedek OTOMATİK terfi ettirilmez — canlı leave da ettirmiyor).

CREATE OR REPLACE FUNCTION public.player_kick_slot(p_match_id uuid, p_slot_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_banned boolean;
  v_slots jsonb; v_away jsonb; v_creator uuid; v_title text; v_price numeric;
  v_new_slots jsonb := '[]'::jsonb; v_new_away jsonb := '[]'::jsonb;
  v_slot jsonb;
  v_side text := NULL;
  v_kicked uuid := NULL;
  v_payer uuid := NULL;
  v_refunded numeric := 0;
  v_still_in boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT is_banned INTO v_is_banned FROM public.profiles WHERE id = v_uid;
  IF COALESCE(v_is_banned, false) THEN RAISE EXCEPTION 'Kullanıcı banlı!'; END IF;

  SELECT COALESCE(slots,'[]'::jsonb), COALESCE("awaySlots",'[]'::jsonb), "creatorId", title, COALESCE(price,0)
  INTO v_slots, v_away, v_creator, v_title, v_price
  FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Maç bulunamadı.'; END IF;

  IF v_creator IS DISTINCT FROM v_uid AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: Yalnız maç kaptanı oyuncu çıkarabilir.';
  END IF;

  -- Ev sahibi tarafı
  FOR v_slot IN SELECT jsonb_array_elements(v_slots) LOOP
    IF v_side IS NULL AND v_slot->>'id' = p_slot_id THEN
      v_side := 'HOME';
      v_kicked := COALESCE(NULLIF(v_slot->>'occupant','')::uuid, NULLIF(v_slot->'player'->>'id','')::uuid);
      v_payer  := COALESCE(NULLIF(v_slot->>'purchasedBy','')::uuid, v_kicked);
      IF v_kicked IS NULL AND v_payer IS NULL THEN
        RAISE EXCEPTION 'SLOT_EMPTY: Bu slotta çıkarılacak oyuncu yok.';
      END IF;
      IF v_kicked = v_uid THEN
        RAISE EXCEPTION 'CANNOT_KICK_SELF: Kendini çıkarmak için maçtan ayrılma akışını kullan (kaptanlık devri orada işler).';
      END IF;
      v_slot := (v_slot - 'player' - 'occupant' - 'inviteeId' - 'claimCode' - 'purchasedBy' - 'assignmentStatus')
                || jsonb_build_object('status','OPEN');
    END IF;
    v_new_slots := v_new_slots || jsonb_build_array(v_slot);
  END LOOP;

  -- Deplasman tarafı (slot ev sahibinde bulunmadıysa)
  FOR v_slot IN SELECT jsonb_array_elements(v_away) LOOP
    IF v_side IS NULL AND v_slot->>'id' = p_slot_id THEN
      v_side := 'AWAY';
      v_kicked := COALESCE(NULLIF(v_slot->>'occupant','')::uuid, NULLIF(v_slot->'player'->>'id','')::uuid);
      v_payer  := COALESCE(NULLIF(v_slot->>'purchasedBy','')::uuid, v_kicked);
      IF v_kicked IS NULL AND v_payer IS NULL THEN
        RAISE EXCEPTION 'SLOT_EMPTY: Bu slotta çıkarılacak oyuncu yok.';
      END IF;
      IF v_kicked = v_uid THEN
        RAISE EXCEPTION 'CANNOT_KICK_SELF: Kendini çıkarmak için maçtan ayrılma akışını kullan (kaptanlık devri orada işler).';
      END IF;
      v_slot := (v_slot - 'player' - 'occupant' - 'inviteeId' - 'claimCode' - 'purchasedBy' - 'assignmentStatus')
                || jsonb_build_object('status','OPEN');
    END IF;
    v_new_away := v_new_away || jsonb_build_array(v_slot);
  END LOOP;

  IF v_side IS NULL THEN
    RAISE EXCEPTION 'SLOT_NOT_FOUND: % id''li slot bu maçta yok.', p_slot_id;
  END IF;

  UPDATE public.matches SET slots = v_new_slots, "awaySlots" = v_new_away WHERE id = p_match_id;

  -- İade: slotu satın alan kişiye, gerçekten ödediği-iade edilmemiş tutar
  -- kadar (idempotent; _match_refund_partial paid−refunded hesabını yapar).
  IF v_payer IS NOT NULL THEN
    v_refunded := public._match_refund_partial(v_payer, p_match_id, v_price);
  END IF;

  -- Çıkarılan oyuncunun başka slotu kalmadıysa katılım kaydını kapat
  IF v_kicked IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_new_slots) s
      WHERE NULLIF(s->>'occupant','')::uuid = v_kicked
         OR NULLIF(s->'player'->>'id','')::uuid = v_kicked
         OR NULLIF(s->>'purchasedBy','')::uuid = v_kicked
      UNION ALL
      SELECT 1 FROM jsonb_array_elements(v_new_away) s
      WHERE NULLIF(s->>'occupant','')::uuid = v_kicked
         OR NULLIF(s->'player'->>'id','')::uuid = v_kicked
         OR NULLIF(s->>'purchasedBy','')::uuid = v_kicked
    ) INTO v_still_in;
    IF NOT v_still_in THEN
      UPDATE public.match_participants SET status = 'left'
      WHERE match_id = p_match_id AND user_id = v_kicked;
    END IF;

    INSERT INTO public.notifications (user_id, title, body, type_key, match_id, deep_link)
    VALUES (v_kicked, 'Kadrodan çıkarıldın',
            COALESCE(v_title,'Bir maç') || ' kadrosundan kaptan tarafından çıkarıldın.' ||
            CASE WHEN v_refunded > 0 THEN ' ' || v_refunded || '₺ iade kredin cüzdanına işlendi.' ELSE '' END,
            'match_kicked', p_match_id, 'oyna://match/' || p_match_id::text);
  END IF;

  -- Boşalan yer için ilk yedeğe haber ver (canlı leave davranışıyla aynı)
  PERFORM public._notify_first_reserve(p_match_id);

  RETURN jsonb_build_object('ok', true, 'side', v_side,
    'kicked_user_id', v_kicked, 'refunded', v_refunded);
END;
$function$;

REVOKE ALL ON FUNCTION public.player_kick_slot(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.player_kick_slot(uuid, text) TO authenticated, service_role;

-- ------------------------------------------------------------
-- Drift aynası: canlıdaki sertleştirilmiş player_update_match gövdesi
-- (2026-07-27'de pg_get_functiondef ile alındı) repoda hiçbir dosyada yoktu;
-- repo'daki son tanım (20260705000002) hâlâ slot dizilerini kabul ediyordu.
-- MIGRATION_DRIFT_POLITIKASI gereği canlı gövde repoya birebir işlenir —
-- davranış değişikliği YOK, yalnız kayıt eşitleme. (Preview replay'de de
-- doğru — sertleştirilmiş — sürüm kurulmuş olur.)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.player_update_match(p_match_id uuid, p_payload jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_is_banned boolean;
  v_is_participant boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT is_banned INTO v_is_banned FROM public.profiles WHERE id = v_uid;
  IF v_is_banned THEN RAISE EXCEPTION 'Kullanıcı banlı!'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.matches m
    WHERE m.id = p_match_id
    AND (
      m."creatorId" = v_uid
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(m.slots, '[]'::jsonb)) s
                 WHERE NULLIF(s->'player'->>'id','')::uuid = v_uid OR NULLIF(s->>'occupant','')::uuid = v_uid OR NULLIF(s->>'purchasedBy','')::uuid = v_uid)
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(m."awaySlots", '[]'::jsonb)) s
                 WHERE NULLIF(s->'player'->>'id','')::uuid = v_uid OR NULLIF(s->>'occupant','')::uuid = v_uid OR NULLIF(s->>'purchasedBy','')::uuid = v_uid)
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(m."reservePlayers", '[]'::jsonb)) s WHERE (s->>'id')::uuid = v_uid)
    )
  ) INTO v_is_participant;

  IF NOT v_is_participant AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  UPDATE public.matches SET
    "homeTeamId" = CASE WHEN p_payload ? 'homeTeamId' THEN NULLIF(p_payload->>'homeTeamId', '')::uuid ELSE "homeTeamId" END,
    "awayTeamId" = CASE WHEN p_payload ? 'awayTeamId' THEN NULLIF(p_payload->>'awayTeamId', '')::uuid ELSE "awayTeamId" END,
    status = CASE
      WHEN p_payload ? 'status' AND (p_payload->>'status') = 'COMPLETED'
           AND status IN ('LIVE','ACTIVE','CONFIRMED')
           AND p_payload ? 'scoreEnteredAt'
           AND EXISTS (SELECT 1 FROM public.matches mm WHERE mm.id = p_match_id AND mm."creatorId" = v_uid)
      THEN 'COMPLETED'
      WHEN p_payload ? 'status'
           AND status IN ('DRAFT','ACTIVE')
           AND (p_payload->>'status') IN ('DRAFT','ACTIVE','CANCELLED')
      THEN p_payload->>'status'
      ELSE status END,
    visibility = CASE WHEN p_payload ? 'visibility' AND (p_payload->>'visibility') IN ('OPEN','PRIVATE')
                      THEN p_payload->>'visibility' ELSE visibility END,
    pitch_id = CASE WHEN p_payload ? 'pitch_id' THEN NULLIF(p_payload->>'pitch_id','')::uuid ELSE pitch_id END,
    format = CASE WHEN p_payload ? 'format' THEN p_payload->>'format' ELSE format END,
    duration = CASE WHEN p_payload ? 'duration' THEN p_payload->>'duration' ELSE duration END,
    gender = CASE WHEN p_payload ? 'gender' THEN p_payload->>'gender' ELSE gender END,
    "ageGroup" = CASE WHEN p_payload ? 'ageGroup' THEN p_payload->>'ageGroup' ELSE "ageGroup" END,
    "homeScore" = CASE WHEN p_payload ? 'homeScore' THEN (p_payload->>'homeScore')::int ELSE "homeScore" END,
    "awayScore" = CASE WHEN p_payload ? 'awayScore' THEN (p_payload->>'awayScore')::int ELSE "awayScore" END,
    "scoreEnteredAt" = CASE WHEN p_payload ? 'scoreEnteredAt' THEN (p_payload->>'scoreEnteredAt')::timestamptz ELSE "scoreEnteredAt" END
  WHERE id = p_match_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Maç bulunamadı'; END IF;

  IF COALESCE(p_payload->>'visibility','') = 'PRIVATE' THEN
    INSERT INTO public.match_private_codes (match_id, code)
    VALUES (p_match_id, upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)))
    ON CONFLICT (match_id) DO NOTHING;
  END IF;

  RETURN TRUE;
END;
$function$;
