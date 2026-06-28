-- ============================================================
-- FAZ 8 — Maç skoru bütünlüğü: tek-taraflı skor değiştirmeyi kapat
--
-- !!! ÖNERİ: ÖNCE STAGING'DE UYGULAYIN, skor akışlarını (consensus onayı,
--     QR ile skor, kaptan finalize, admin panel) test edip prod'a alın. !!!
--
-- SORUN (canlı DB'den doğrulandı — 4 ayrı skor-yazma yolu var, yalnız 1'i çift-onaylı):
--   * player_update_match: maça slot alan HERHANGİ bir oyuncu "homeScore"/"awayScore"
--     yazabiliyor (DB-01 / BL-03 — KRİTİK).
--   * finalize_match(p_home,p_away): kaptan/kurucu çift-onay olmadan keyfi skor yazıyor.
--   * submit_match_score(token): tek QR token ile çift-onay atlanıp COMPLETED (BL-04).
--   * propose_match_score + approve_match_score: TEK doğru akış (tüm katılımcı onayı →
--     _finalize_team_match_score). Diğer 3 yol bunu bypass ediyor.
--   * matches UPDATE RLS politikası kolon kısıtlamıyor → kaptan PostgREST ile doğrudan
--     PATCH /matches {homeScore} yapabilir.
--
-- ÇÖZÜM: matches tablosuna TEK kapı (BEFORE UPDATE trigger). Skor (homeScore/awayScore)
-- DEĞİŞİYORSA, değişikliğe yalnızca şu durumlarda izin ver:
--   (a) consensus/QR akışı işlem-içi bayrak bıraktıysa, VEYA
--   (b) çağıran kaptan / kurucu / platform admin ise.
-- Aksi halde reddet. SADECE skor değişimini denetler; status/CANCELLED'a dokunmaz
-- (cron'lar skoru DEĞİŞTİRMEZ: auto_finalize_matches finalize_match'i skorsuz çağırır →
-- COALESCE ile skor sabit kalır; QUORUM_NOT_MET iptalleri yalnız status yazar) →
-- bu yüzden hiçbir sistem/cron yolu kırılmaz.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1) Skor bütünlüğü bekçisi
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.guard_match_score_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF NEW."homeScore" IS DISTINCT FROM OLD."homeScore"
     OR NEW."awayScore" IS DISTINCT FROM OLD."awayScore" THEN

    -- (a) consensus (approve_match_score → _finalize_team_match_score) veya
    --     QR-token (submit_match_score) akışı bu maç için açıkça yetki bıraktı mı?
    IF current_setting('oyna.authorized_score_write', true) = OLD.id::text THEN
      RETURN NEW;
    END IF;

    -- (b) kaptan / kurucu / platform admin mi?
    IF v_uid IS NOT NULL
       AND (v_uid = OLD.captain_id OR v_uid = OLD."creatorId" OR public.is_platform_admin()) THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'SCORE_FORBIDDEN: Skor yalnız kaptan/kurucu, admin ya da çift-onay (consensus) akışından değiştirilebilir.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_match_score ON public.matches;
CREATE TRIGGER trg_guard_match_score
  BEFORE UPDATE ON public.matches
  FOR EACH ROW EXECUTE FUNCTION public.guard_match_score_integrity();

-- ────────────────────────────────────────────────────────────
-- 2) Consensus finalizer'a yetki bayrağı ekle (gövde birebir korunarak)
--    Yalnızca tek satır eklendi: UPDATE'ten ÖNCE set_config(... , true)
--    (true = işlem-içi/transaction-local; istek bitince silinir, sızmaz).
--    İstemci set_config'i PostgREST üzerinden çağıramaz → taklit edilemez.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._finalize_team_match_score(p_match_id uuid, p_home integer, p_away integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE m RECORD; v_home_res text; v_away_res text; v_date text; v_home_name text; v_away_name text;
BEGIN
  SELECT * INTO m FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF m."scoreEnteredAt" IS NOT NULL THEN RETURN; END IF;
  PERFORM set_config('oyna.authorized_score_write', p_match_id::text, true);  -- FAZ 8: consensus yetkisi
  UPDATE public.matches SET
    "homeScore" = p_home, "awayScore" = p_away, "scoreEnteredAt" = now(),
    status = CASE WHEN status IN ('CONFIRMED','LIVE','ACTIVE') THEN 'COMPLETED' ELSE status END,
    is_successful = CASE WHEN cancel_reason IS NULL THEN true ELSE is_successful END
  WHERE id = p_match_id;
  IF m."homeTeamId" IS NOT NULL AND m."awayTeamId" IS NOT NULL THEN
    v_home_res := CASE WHEN p_home > p_away THEN 'WIN' WHEN p_home < p_away THEN 'LOSS' ELSE 'DRAW' END;
    v_away_res := CASE WHEN p_away > p_home THEN 'WIN' WHEN p_away < p_home THEN 'LOSS' ELSE 'DRAW' END;
    v_date := COALESCE(m.date, to_char(now(),'YYYY-MM-DD'));
    SELECT name INTO v_home_name FROM public.teams WHERE id = m."homeTeamId";
    SELECT name INTO v_away_name FROM public.teams WHERE id = m."awayTeamId";
    UPDATE public.teams SET wins = COALESCE(wins,0) + CASE WHEN v_home_res='WIN' THEN 1 ELSE 0 END,
      losses = COALESCE(losses,0) + CASE WHEN v_home_res='LOSS' THEN 1 ELSE 0 END,
      "matchHistory" = COALESCE("matchHistory",'[]'::jsonb) || jsonb_build_array(
        jsonb_build_object('matchId',p_match_id,'opponent',v_away_name,'score',p_home||'-'||p_away,'result',v_home_res,'date',v_date))
    WHERE id = m."homeTeamId";
    UPDATE public.teams SET wins = COALESCE(wins,0) + CASE WHEN v_away_res='WIN' THEN 1 ELSE 0 END,
      losses = COALESCE(losses,0) + CASE WHEN v_away_res='LOSS' THEN 1 ELSE 0 END,
      "matchHistory" = COALESCE("matchHistory",'[]'::jsonb) || jsonb_build_array(
        jsonb_build_object('matchId',p_match_id,'opponent',v_home_name,'score',p_away||'-'||p_home,'result',v_away_res,'date',v_date))
    WHERE id = m."awayTeamId";
  END IF;
END; $function$;

-- ────────────────────────────────────────────────────────────
-- 3) QR-token skor akışına yetki bayrağı ekle (gövde birebir korunarak)
--    NOT: Tek-token ile çift-onayın atlanması (BL-04) ayrı bir iyileştirmedir;
--    bu migration mevcut QR davranışını KORUR (skoru kötüleştirmez), sadece
--    yeni trigger ile uyumlu hale getirir.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.submit_match_score(p_token text, p_home_score integer, p_away_score integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_match_id UUID; v_captain UUID; v_creator UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_home_score IS NULL OR p_away_score IS NULL OR p_home_score < 0 OR p_away_score < 0
     OR p_home_score > 50 OR p_away_score > 50 THEN RAISE EXCEPTION 'INVALID_SCORE'; END IF;
  SELECT match_id INTO v_match_id FROM public.match_score_tokens
    WHERE token = p_token AND expires_at > NOW() AND used_at IS NULL FOR UPDATE;
  IF v_match_id IS NULL THEN RAISE EXCEPTION 'INVALID_TOKEN: QR kodu gecersiz veya suresi dolmus.'; END IF;
  PERFORM set_config('oyna.authorized_score_write', v_match_id::text, true);  -- FAZ 8: QR-token yetkisi
  UPDATE public.matches SET "homeScore" = p_home_score, "awayScore" = p_away_score,
    status = 'COMPLETED', "scoreEnteredAt" = NOW() WHERE id = v_match_id;
  UPDATE public.match_score_tokens SET used_at = NOW(), used_by = auth.uid() WHERE token = p_token;
  SELECT captain_id, "creatorId" INTO v_captain, v_creator FROM public.matches WHERE id = v_match_id;
  INSERT INTO public.notifications (user_id, title, body, type_key, match_id, action_required)
  SELECT uid, 'Mac skoru girildi',
         format('Mac skoru girildi: %s-%s. Onaylar misin?', p_home_score, p_away_score),
         'MATCH_SCORE_CONFIRM', v_match_id, true
  FROM (SELECT DISTINCT uid FROM unnest(ARRAY[v_captain, v_creator]) AS uid WHERE uid IS NOT NULL) q;
  RETURN v_match_id;
END; $function$;
