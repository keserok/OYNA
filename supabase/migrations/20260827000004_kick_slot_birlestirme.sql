-- ============================================================================
-- player_kick_slot — iki dalın BİRLEŞTİRİLMESİ (merge sonrası tek doğru sürüm)
--
-- Tek-lobi dalı 3 dallı semantiği getirmişti (misafir çıkarılınca slot alıcının
-- REZERVİNE döner, para alıcıda kalır); main dalı ise üç sertleştirme ekledi:
--   (a) CANNOT_KICK_SELF — kaptan kendini çıkaramaz (ayrılma akışı kaptanlık
--       devrini işletir; kick yolu onu atlıyordu),
--   (b) yetki kapısı is_platform_admin() (is_admin() değil),
--   (c) çıkarılan oyuncunun BAŞKA slotu kalmadıysa match_participants
--       status='left' — türetilmiş katılım indeksi hayalet kayıt tutmaz.
-- Bu migration ikisini tek gövdede birleştirir; canlıda hangi sürüm duruyorsa
-- onu bu birleşimle değiştirir.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.player_kick_slot(p_match_id uuid, p_slot_id text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_banned boolean;
  v_slots jsonb; v_away jsonb; v_slot jsonb; v_is_away boolean := false;
  v_creator uuid; v_title text; v_price numeric;
  v_owner uuid; v_occ uuid; v_refunded numeric := 0; v_occ_name text;
  v_still_in boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT is_banned INTO v_is_banned FROM public.profiles WHERE id = v_uid;
  IF COALESCE(v_is_banned, false) THEN RAISE EXCEPTION 'Kullanıcı banlı!'; END IF;

  SELECT slots, COALESCE("awaySlots",'[]'::jsonb), "creatorId", title, COALESCE(price, 0)
  INTO v_slots, v_away, v_creator, v_title, v_price
  FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF v_slots IS NULL THEN RAISE EXCEPTION 'NOT_FOUND: Maç bulunamadı'; END IF;
  -- (b) main ile hizalı yetki kapısı
  IF v_creator IS DISTINCT FROM v_uid AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: Yalnız maç kaptanı oyuncu çıkarabilir.';
  END IF;

  SELECT s INTO v_slot FROM jsonb_array_elements(v_slots) s WHERE s->>'id' = p_slot_id;
  IF v_slot IS NULL THEN
    SELECT s INTO v_slot FROM jsonb_array_elements(v_away) s WHERE s->>'id' = p_slot_id;
    v_is_away := v_slot IS NOT NULL;
  END IF;
  IF v_slot IS NULL THEN RAISE EXCEPTION 'SLOT_NOT_FOUND'; END IF;

  v_owner := NULLIF(v_slot->>'purchasedBy','')::uuid;
  v_occ   := COALESCE(NULLIF(v_slot->>'occupant','')::uuid, NULLIF(v_slot->'player'->>'id','')::uuid);
  IF v_occ IS NULL AND v_owner IS NULL THEN RAISE EXCEPTION 'SLOT_EMPTY: Bu slotta çıkarılacak oyuncu yok.'; END IF;
  -- (a) Kendini çıkarma yasağı: ayrılma akışı kaptanlık devrini işletir
  IF v_occ IS NOT NULL AND v_occ = v_uid THEN
    RAISE EXCEPTION 'CANNOT_KICK_SELF: Kendini çıkarmak için maçtan ayrılma akışını kullan (kaptanlık devri orada işler).';
  END IF;

  IF v_owner IS NOT NULL AND (v_occ IS NULL OR v_occ = v_owner) THEN
    -- Alıcının kendi slotu: tam serbest bırakma + iade → vitrine döner.
    IF v_is_away THEN
      v_away := (SELECT jsonb_agg(CASE WHEN s->>'id' = p_slot_id
          THEN (s - 'player' - 'occupant' - 'inviteeId' - 'claimCode' - 'purchasedBy' - 'assignmentStatus')
               || jsonb_build_object('status','OPEN')
          ELSE s END) FROM jsonb_array_elements(v_away) s);
    ELSE
      v_slots := (SELECT jsonb_agg(CASE WHEN s->>'id' = p_slot_id
          THEN (s - 'player' - 'occupant' - 'inviteeId' - 'claimCode' - 'purchasedBy' - 'assignmentStatus')
               || jsonb_build_object('status','OPEN')
          ELSE s END) FROM jsonb_array_elements(v_slots) s);
    END IF;
    v_refunded := public._match_refund_partial(v_owner, p_match_id, v_price);
    PERFORM public._notify_team_event(
      v_owner, 'match_kicked', v_uid, NULL,
      jsonb_build_object('match_title', COALESCE(v_title,'Maç'),
        'refund_note', CASE WHEN v_refunded > 0 THEN ' Ödemen iade kredisi olarak cüzdanına döndü.' ELSE '' END),
      false, 'oyna://match/' || p_match_id::text);
  ELSIF v_owner IS NOT NULL THEN
    -- Misafir oyuncu: slot alıcının rezervine döner (para hareketi yok).
    IF v_is_away THEN
      v_away := (SELECT jsonb_agg(CASE WHEN s->>'id' = p_slot_id
          THEN (s - 'player' - 'occupant' - 'inviteeId' - 'claimCode')
               || jsonb_build_object('status','TAKEN','assignmentStatus','RESERVED')
          ELSE s END) FROM jsonb_array_elements(v_away) s);
    ELSE
      v_slots := (SELECT jsonb_agg(CASE WHEN s->>'id' = p_slot_id
          THEN (s - 'player' - 'occupant' - 'inviteeId' - 'claimCode')
               || jsonb_build_object('status','TAKEN','assignmentStatus','RESERVED')
          ELSE s END) FROM jsonb_array_elements(v_slots) s);
    END IF;
    SELECT COALESCE(name, full_name, 'Oyuncu') INTO v_occ_name FROM public.profiles WHERE id = v_occ;
    PERFORM public._notify_team_event(v_occ, 'match_kicked', v_uid, NULL,
      jsonb_build_object('match_title', COALESCE(v_title,'Maç'), 'refund_note', ''),
      false, 'oyna://match/' || p_match_id::text);
    PERFORM public._notify_team_event(v_owner, 'match_slot_vacated', v_uid, NULL,
      jsonb_build_object('player_name', COALESCE(v_occ_name,'Oyuncu'), 'match_title', COALESCE(v_title,'Maç')),
      false, 'oyna://match/' || p_match_id::text);
  ELSE
    -- Legacy: satın alınmamış dolu slot → boşalt + varsa oyuncunun parasını iade et.
    IF v_is_away THEN
      v_away := (SELECT jsonb_agg(CASE WHEN s->>'id' = p_slot_id
          THEN (s - 'player' - 'occupant' - 'inviteeId' - 'claimCode' - 'purchasedBy' - 'assignmentStatus')
               || jsonb_build_object('status','OPEN')
          ELSE s END) FROM jsonb_array_elements(v_away) s);
    ELSE
      v_slots := (SELECT jsonb_agg(CASE WHEN s->>'id' = p_slot_id
          THEN (s - 'player' - 'occupant' - 'inviteeId' - 'claimCode' - 'purchasedBy' - 'assignmentStatus')
               || jsonb_build_object('status','OPEN')
          ELSE s END) FROM jsonb_array_elements(v_slots) s);
    END IF;
    v_refunded := public._match_refund_partial(v_occ, p_match_id, NULL);
    PERFORM public._notify_team_event(v_occ, 'match_kicked', v_uid, NULL,
      jsonb_build_object('match_title', COALESCE(v_title,'Maç'),
        'refund_note', CASE WHEN v_refunded > 0 THEN ' Ödemen iade kredisi olarak cüzdanına döndü.' ELSE '' END),
      false, 'oyna://match/' || p_match_id::text);
  END IF;

  UPDATE public.matches SET slots = v_slots, "awaySlots" = v_away WHERE id = p_match_id;

  -- (c) Çıkarılan oyuncunun BAŞKA yeri kalmadıysa katılım indeksinden düşür.
  IF v_occ IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_slots || v_away) s
      WHERE NULLIF(s->>'occupant','')::uuid = v_occ
         OR NULLIF(s->'player'->>'id','')::uuid = v_occ
         OR NULLIF(s->>'purchasedBy','')::uuid = v_occ
    ) INTO v_still_in;
    IF NOT v_still_in THEN
      UPDATE public.match_participants SET status = 'left'
      WHERE match_id = p_match_id AND user_id = v_occ;
    END IF;
  END IF;

  PERFORM public._notify_first_reserve(p_match_id);
  RETURN jsonb_build_object('ok', true, 'refunded', v_refunded);
END;
$$;
REVOKE ALL ON FUNCTION public.player_kick_slot(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.player_kick_slot(uuid, text) TO authenticated;
