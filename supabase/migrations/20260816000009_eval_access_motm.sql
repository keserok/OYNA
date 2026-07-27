-- ============================================================
-- F2 — Değerlendirme döngüsü: tamamlanan maç bildirimi + türetilmiş MVP
-- ============================================================
-- 2.1: PostMatchEval ekranı tam yazılmış ama repo tarihinde ona giden tek bir
-- navigasyon çağrısı hiç olmamıştı; maç COMPLETED olunca kullanıcıya hiçbir
-- sinyal gitmiyordu. Bu dosya sunucu ayağını kurar: bildirim şablonu +
-- finalize_match'e katılımcı bildirimi (deep link: oyna://match/<id>/eval).
-- UI ayağı (Maçlarım CTA + deep link case'i) aynı fazın frontend commit'lerinde.
--
-- 2.2: MVP (MOTM) seçimi UI'da toplanıp hiçbir yere yazılmıyordu. Ürün kararı
-- (OYNA_MASTER_PRENSIPLER §: "MOTM ödülsüz kozmetik etiket; değerlendirme
-- puanlarından belirlenir") gereği AYRI OY SAKLANMAZ — maçın MVP'si
-- player_ratings ortalamasından TÜRETİLİR. UI'daki ölü MOTM butonu kaldırıldı;
-- profil sayacı get_player_motm_count RPC'sinden okunur.

-- ------------------------------------------------------------
-- 1) Bildirim şablonu
-- ------------------------------------------------------------
INSERT INTO public.notification_templates
  (type_key, label_tr, title_tr, body_tr, category, is_mandatory, can_user_disable, sort_order)
VALUES
  ('match_completed_evaluate', 'Maç değerlendirme hatırlatması',
   'Maç tamamlandı — değerlendir ⭐',
   '{match_title} sona erdi. Takım arkadaşlarını ve hizmet aldığın kaleci/hakemi değerlendir; puanlar profilleri ve ödemeleri günceller.',
   'MATCH', false, true, 62)
ON CONFLICT (type_key) DO NOTHING;

-- ------------------------------------------------------------
-- 2) finalize_match — canlı gövde (2026-07-27 teyidi) + değerlendirme bildirimi
--    Bildirim yalnız v_award anında (maçın İLK başarılı kapanışı) ve maç son
--    7 gün içindeyse gider: 15 dk'lık auto_finalize_matches cron'u ilk
--    deploy'da eski maçları kapatırken toplu bildirim patlaması yaşanmaz.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finalize_match(p_match_id uuid, p_home_score integer DEFAULT NULL::integer, p_away_score integer DEFAULT NULL::integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  m            RECORD;
  v_uid        uuid := auth.uid();
  v_successful boolean;
  v_award      boolean := false;
  v_slot       jsonb;
  v_player_ids uuid[] := '{}';
  v_pid        uuid;
BEGIN
  SELECT * INTO m FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  -- Yetki: mac sahibi/kaptan/ATANMIS HAKEM veya admin (cron'da auth.uid()=NULL -> izinli)
  IF v_uid IS NOT NULL
     AND m."creatorId" IS DISTINCT FROM v_uid
     AND m.captain_id   IS DISTINCT FROM v_uid
     AND m."refereeId"  IS DISTINCT FROM v_uid
     AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  v_successful := (m.confirmed_at IS NOT NULL) AND (m.cancel_reason IS NULL);
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

    -- F2.1: katılımcılara değerlendirme çağrısı (yalnız güncel maçlarda)
    IF m.starts_at IS NOT NULL AND m.starts_at > now() - interval '7 days' THEN
      FOREACH v_pid IN ARRAY v_player_ids LOOP
        INSERT INTO public.notifications (user_id, title, body, type_key, match_id, deep_link)
        VALUES (v_pid, 'Maç tamamlandı — değerlendir ⭐',
                COALESCE(m.title,'Maçın') || ' sona erdi. Takım arkadaşlarını ve kaleci/hakemi değerlendir.',
                'match_completed_evaluate', p_match_id, 'oyna://match/' || p_match_id::text || '/eval');
      END LOOP;
    END IF;
  END IF;

  RETURN jsonb_build_object('match_id', p_match_id, 'status', 'COMPLETED',
    'is_successful', v_successful, 'awarded', v_award,
    'participants', array_length(v_player_ids, 1));
END;
$function$;

-- ------------------------------------------------------------
-- 3) Türetilmiş MVP: maç başına en yüksek ortalama skill_score
--    (eşitlikte oy sayısı, sonra ratee_id ile deterministik)
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.match_motm
WITH (security_invoker = false) AS
SELECT DISTINCT ON (match_id) match_id, ratee_id, avg_skill, votes
FROM (
  SELECT match_id, ratee_id,
         round(avg(skill_score)::numeric, 2) AS avg_skill,
         count(*) AS votes
  FROM public.player_ratings
  GROUP BY match_id, ratee_id
) t
ORDER BY match_id, avg_skill DESC, votes DESC, ratee_id;

-- Görünüm doğrudan API'ye açılmaz (player_ratings RLS'i rater/ratee/admin ile
-- sınırlı; MVP sayacı herkese açık bir metrik olduğu için kontrollü RPC'den verilir).
REVOKE ALL ON public.match_motm FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_player_motm_count(p_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT count(*)::int FROM public.match_motm WHERE ratee_id = p_user_id;
$$;

REVOKE ALL ON FUNCTION public.get_player_motm_count(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_player_motm_count(uuid) TO authenticated, service_role;
