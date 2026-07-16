-- ==============================================================================
-- HR-A — Hakem resmi skor girişi: finalize_match yetkisine atanmış hakemi ekle
-- ------------------------------------------------------------------------------
-- SORUN: Hakem paneli "MAÇ SONU RAPORU" ekranında skor giriyordu ama hiçbir
-- sunucu yazımı yapılmıyor, üstelik "her iki kaptana skor onayı iletildi" diye
-- sahte başarı bildiriliyordu. Oysa finalize_match SECURITY DEFINER RPC'si
-- YALNIZCA maç sahibi (creatorId) / kaptan (captain_id) / admin'e izin veriyordu;
-- atanmış hakem (refereeId) yetkisiz kalıyordu — hakem skoru asla yazılamıyordu.
--
-- KARAR: Faz-6 yorumundaki "Hakem skoru zaten Faz-5'te resmi" niyetini gerçekten
-- hayata geçir. Atanmış hakem, tarafsız otorite olarak maçı finalize_match ile
-- RESMİ olarak sonlandırabilir (oyuncu onay döngüsü GEREKMEZ — hakem skoru kesin).
-- Ödül/güvenilirlik mantığı, is_successful kapısı ve idempotentlik AYNEN korunur;
-- tek değişiklik yetki yüklemine `refereeId = auth.uid()` eklenmesidir.
--
-- refereeId = profiles.id = auth.uid() (demo + prod'da hakem oturumu bu kimlikle
-- gelir), dolayısıyla `m."refereeId" = v_uid` doğru kapıdır.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.finalize_match(
  p_match_id   uuid,
  p_home_score integer DEFAULT NULL,
  p_away_score integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  m            RECORD;
  v_uid        uuid := auth.uid();
  v_successful boolean;
  v_award      boolean := false;
  v_slot       jsonb;
  v_player_ids uuid[] := '{}';
BEGIN
  SELECT * INTO m FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  -- Yetki: maç sahibi/kaptan/ATANMIŞ HAKEM veya admin (cron'da auth.uid()=NULL → izinli)
  IF v_uid IS NOT NULL
     AND m."creatorId" IS DISTINCT FROM v_uid
     AND m.captain_id   IS DISTINCT FROM v_uid
     AND m."refereeId"  IS DISTINCT FROM v_uid
     AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  -- "Başarılı maç": GERÇEK onay (confirmed_at) + iptal değil — status string'e GÜVENME
  v_successful := (m.confirmed_at IS NOT NULL) AND (m.cancel_reason IS NULL);
  -- Ödül yalnız bir kez (idempotent): daha önce işaretlenmemişse
  v_award := v_successful AND (m.is_successful IS NOT TRUE);

  UPDATE public.matches SET
    status = 'COMPLETED',
    "homeScore" = COALESCE(p_home_score, "homeScore"),
    "awayScore" = COALESCE(p_away_score, "awayScore"),
    "scoreEnteredAt" = CASE WHEN p_home_score IS NOT NULL THEN now() ELSE "scoreEnteredAt" END,
    is_successful = v_successful
  WHERE id = p_match_id;

  IF v_award THEN
    FOR v_slot IN
      SELECT jsonb_array_elements(COALESCE(m.slots,'[]'::jsonb))
      UNION ALL
      SELECT jsonb_array_elements(COALESCE(m."awaySlots",'[]'::jsonb))
    LOOP
      IF v_slot->>'status' = 'TAKEN' AND (v_slot->'player'->>'id') IS NOT NULL THEN
        v_player_ids := array_append(v_player_ids, (v_slot->'player'->>'id')::uuid);
      END IF;
    END LOOP;

    UPDATE public.profiles SET
      match_count = COALESCE(match_count, 0) + 1,
      reliability_score = LEAST(100, COALESCE(reliability_score, 100) + 1)
    WHERE id = ANY(v_player_ids);
  END IF;

  RETURN jsonb_build_object('match_id', p_match_id, 'status', 'COMPLETED',
    'is_successful', v_successful, 'awarded', v_award,
    'participants', array_length(v_player_ids, 1));
END;
$$;
REVOKE ALL ON FUNCTION public.finalize_match(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_match(uuid, integer, integer) TO authenticated, service_role;
