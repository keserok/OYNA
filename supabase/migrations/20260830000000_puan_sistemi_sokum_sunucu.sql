-- ============================================================================
-- OYUNCU PUAN SİSTEMİ SÖKÜMÜ — SUNUCU AYAĞI (karar: F1=a, F2=a, 2=a)
--
-- Ürün kararı: oyuncunun kamuya açık beceri göstergesi artık AKRAN ORTALAMASI
-- değil, oyuncunun KENDİ BEYANI (profiles.self_skill, 1–10). Akran puanı
-- toplanmaya devam eder ama hiçbir kamusal sayıyı beslemez.
--
-- ── ÖLEN ────────────────────────────────────────────────────────────────────
--  1) minRating barajı: assert_match_min_rating + DÖRT sarmalayıcı çağrısı
--     (join_public_match_slot, join_public_match_reserve, player_buy_slots,
--     player_buy_slots_v2). Beyan barajda kullanılamaz — herkes 10 yazıp geçer.
--  2) on_player_rating_added trigger'ı (update_user_skill_rating): akran puanını
--     5'lik ölçeğe indirip profiles.ratings_history'ye yazıyordu. Artık yazmaz.
--  3) _profile_player_json'ın slot JSON'una bastığı 'rating' alanı → yerine
--     'selfSkill' (kadroda seviye bandını çizen tek kaynak).
--
-- ── YAŞAYAN (bilerek dokunulmadı) ───────────────────────────────────────────
--  • player_ratings.skill_score — ÖLÜ VERİ DEĞİL: match_motm görünümü maç başına
--    en yüksek ortalamadan MVP'yi türetiyor, get_player_motm_count profilde
--    gösteriyor. Ayrıca admin_player_peer_scores ile admin panelinde okunur.
--  • player_ratings.fair_play_score — centilmenlik.
--  • profiles.reliability_score — geç-ayrılma yaptırımı (tek yazarı ip04).
--  • pitches.rating / googleRating / submit_pitch_rating — saha vitrini.
--  • goalkeepers.rating / referees.rating / submit_service_rating — SAĞLAYICI
--    PAYOUT KAPISI. Bunlara dokunmak para akışını kırar.
--
-- ── GERİ DÖNÜŞ ──────────────────────────────────────────────────────────────
-- profiles.rating ve profiles.ratings_history KOLONLARI DÜŞÜRÜLMEDİ (karar 2=a:
-- "kolon kalır ama okunmaz"). Geri almak için: bu dosyadaki dört sarmalayıcıyı
-- b2_min_rating_join_gate sürümüne döndür + trigger'ı yeniden kur. Veri kaybı yok.
-- ============================================================================

-- ─── 0) profiles.self_skill — beyan edilen seviye (1–10) ────────────────────
-- Onboarding'de ZORUNLU (E7); profil ayarlarından değiştirilebilir (E8).
-- NULL = henüz beyan yok → kadroda seviye çipi HİÇ çizilmez (uydurma yok).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS self_skill smallint;

DO $$ BEGIN
  ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_self_skill_range CHECK (self_skill BETWEEN 1 AND 10);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN public.profiles.self_skill IS
  'Oyuncunun BEYAN ettiği seviye (1-10). Kamusal seviye bandının tek kaynağı. '
  'Barajda/kapıda ASLA kullanılmaz (beyan manipüle edilebilir).';

-- ─── 1) minRating barajı sökülür: sarmalayıcılar guard''sız kalır ───────────
-- Sarmalayıcı/__inner topolojisi KORUNUR (başka migration''lar buna dayanıyor);
-- yalnız guard çağrısı düşer. Böylece geri dönüş tek CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION public.join_public_match_slot(p_match_id uuid, p_slot_id text, p_user_id uuid, p_is_away boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.join_public_match_slot__inner(p_match_id, p_slot_id, p_user_id, p_is_away);
END;
$$;

CREATE OR REPLACE FUNCTION public.join_public_match_reserve(p_match_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.join_public_match_reserve__inner(p_match_id, p_user_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.player_buy_slots(p_match_id uuid, p_slot_ids text[])
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  RETURN public.player_buy_slots__inner(p_match_id, p_slot_ids);
END;
$$;

CREATE OR REPLACE FUNCTION public.player_buy_slots_v2(p_match_id uuid, p_slot_ids text[], p_use_balance boolean DEFAULT true, p_card_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  RETURN public.player_buy_slots_v2__inner(p_match_id, p_slot_ids, p_use_balance, p_card_id);
END;
$$;

-- Yetkiler sarmalayıcı yeniden yazıldığında sıfırlanmaz ama idempotent teyit:
REVOKE ALL ON FUNCTION public.join_public_match_slot(uuid, text, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_public_match_slot(uuid, text, uuid, boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.join_public_match_reserve(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_public_match_reserve(uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.player_buy_slots(uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.player_buy_slots(uuid, text[]) TO authenticated;
REVOKE ALL ON FUNCTION public.player_buy_slots_v2(uuid, text[], boolean, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.player_buy_slots_v2(uuid, text[], boolean, uuid) TO authenticated;

-- Guard artık çağrılmıyor → düşür. (Kalırsa "baraj var" yanılsaması yaratır.)
DROP FUNCTION IF EXISTS public.assert_match_min_rating(uuid, uuid);

-- Veride barajı AÇIKÇA kapat: kalan minRating değerleri okunmasa da sıfırlanır ki
-- eski bir okuyucu ya da rapor "4.0 baraj var" diye yorumlamasın.
UPDATE public.matches
   SET "minRating" = 0
 WHERE COALESCE("minRating", 0) <> 0;

COMMENT ON COLUMN public.matches."minRating" IS
  'KULLANIMDAN KALDIRILDI (20260830000000). Baraj sökülmüştür, sunucu zorlamaz. '
  'Kolon geri dönüş için tutuluyor; okunmamalı, yazılmamalı.';

-- ─── 2) Akran puanı → profiles.ratings_history trigger''ı sökülür ────────────
-- Trigger adı canlıda on_player_rating_added; ada güvenmek yerine FONKSİYONA
-- bağlı TÜM trigger''lar düşürülür (yeniden adlandırılmış kopya kalmasın).
DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT tg.tgname
    FROM pg_trigger tg
    JOIN pg_class c ON c.oid = tg.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_proc p ON p.oid = tg.tgfoid
    WHERE n.nspname = 'public'
      AND c.relname = 'player_ratings'
      AND p.proname = 'update_user_skill_rating'
      AND NOT tg.tgisinternal
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.player_ratings', t.tgname);
  END LOOP;
END $$;

DROP FUNCTION IF EXISTS public.update_user_skill_rating();

COMMENT ON COLUMN public.profiles.rating IS
  'KULLANIMDAN KALDIRILDI (20260830000000). Akran ortalamasından türeyen eski '
  'kamusal puan; artık hiçbir şey yazmıyor ve hiçbir kapı okumuyor. Kamusal '
  'seviye göstergesi: profiles.self_skill. Kolon geri dönüş için tutuluyor.';

-- ─── 3) Slot JSON''u: ''rating'' çıkar, ''selfSkill'' gir ───────────────────────
-- Kadro satırı seviye bandını buradan okur; ikinci sorgu gerekmez. Beyan yoksa
-- alan NULL kalır ve istemci çipi hiç çizmez.
CREATE OR REPLACE FUNCTION public._profile_player_json(p_user_id uuid, p_role text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'id', id,
    'name', COALESCE(name, full_name, 'Oyuncu'),
    'avatar', COALESCE(avatar_url, ''),
    'selfSkill', self_skill,
    'position', COALESCE(p_role, ''))
  FROM public.profiles WHERE id = p_user_id;
$$;
REVOKE ALL ON FUNCTION public._profile_player_json(uuid, text) FROM PUBLIC, anon, authenticated;

-- ─── 4) Admin: bir oyuncunun ALDIĞI akran puanları ──────────────────────────
-- Karar (1=a eki): "admin panelinden kişinin aldığı puanlar gözükebilsin."
-- Puanlayan KİMLİĞİ dönmez — player_ratings_select_rater_only politikasının
-- koruduğu anonimlik (BULGU-106 misilleme riski) RPC''de de korunur.
CREATE OR REPLACE FUNCTION public.admin_player_peer_scores(p_user_id uuid, p_limit int DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count int; v_avg numeric; v_recent jsonb; v_motm int;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Bu veriyi yalnız platform admini görebilir.';
  END IF;

  SELECT count(*)::int, round(avg(skill_score)::numeric, 2)
    INTO v_count, v_avg
  FROM public.player_ratings
  WHERE ratee_id = p_user_id AND skill_score IS NOT NULL;

  SELECT COALESCE(jsonb_agg(r ORDER BY r->>'at' DESC), '[]'::jsonb) INTO v_recent
  FROM (
    SELECT jsonb_build_object(
             'score', pr.skill_score,
             'fairPlay', pr.fair_play_score,
             'at', pr.created_at,
             'matchId', pr.match_id,
             'matchTitle', m.title
           ) AS r
    FROM public.player_ratings pr
    LEFT JOIN public.matches m ON m.id = pr.match_id
    WHERE pr.ratee_id = p_user_id AND pr.skill_score IS NOT NULL
    ORDER BY pr.created_at DESC
    LIMIT GREATEST(COALESCE(p_limit, 20), 1)
  ) s;

  SELECT count(*)::int INTO v_motm FROM public.match_motm WHERE ratee_id = p_user_id;

  RETURN jsonb_build_object(
    'count', COALESCE(v_count, 0),
    'average', v_avg,          -- puan yoksa NULL → panel "—" gösterir, 0 DEĞİL
    'motmCount', COALESCE(v_motm, 0),
    'selfSkill', (SELECT self_skill FROM public.profiles WHERE id = p_user_id),
    'recent', v_recent
  );
END;
$$;
REVOKE ALL ON FUNCTION public.admin_player_peer_scores(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_player_peer_scores(uuid, int) TO authenticated;
