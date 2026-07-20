-- ============================================================================
-- B2 — minRating kapısını SUNUCUYA taşı (plan: OYUNCU_EDGE_CASE_PLANI §7.4)
--
-- SORUN: minRating yalnız keşif kartında (client) kontrol ediliyordu; özel
-- kod/takvim/doğrudan lobi gibi yan kapılardan giren oyuncu barajı atlıyordu.
--
-- TASARIM:
--  * Ortak guard: assert_match_min_rating(match, user) → 'MIN_RATING' hatası.
--  * Halka açık katılım yolları KAPILANIR: join_public_match_slot,
--    player_buy_slots, player_buy_slots_v2, join_public_match_reserve.
--  * Kaptan iradeli davetler MUAF (bilinçli ürün kararı): join_by_invite_token,
--    player_claim_slot_code, player_assign_slot — açık davet barajı ezer.
--  * Teknik: mevcut fonksiyon gövdesine DOKUNMADAN "rename → __inner + aynı
--    imzalı sarmalayıcı" deseni. Sarmalayıcı guard'ı çalıştırıp inner'ı çağırır.
--    Rollback: sarmalayıcıyı DROP et, __inner'ı eski adına RENAME et.
--  * Veri düzeltmesi: eski maçlardaki sabit-4.0 minRating hiçbir zaman kurucu
--    iradesi değildi (hooks/useMatchCreate.ts eski hardcode'u) → 0'a normalize
--    edilir (yalnız oynanabilir durumlar). Yeni maçlar zaten 0 yazıyor (B1).
--
-- İdempotent: __inner var mı kontrolleriyle yeniden çalıştırılabilir.
-- ============================================================================

-- ── 1) Ortak guard ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.assert_match_min_rating(p_match_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_min numeric;
  v_rating numeric;
BEGIN
  SELECT COALESCE("minRating", 0) INTO v_min FROM public.matches WHERE id = p_match_id;
  IF v_min IS NULL OR v_min <= 0 THEN
    RETURN; -- baraj yok (varsayılan; B1/K2 kararı)
  END IF;
  SELECT COALESCE(rating, 0) INTO v_rating FROM public.profiles WHERE id = p_user_id;
  IF COALESCE(v_rating, 0) < v_min THEN
    RAISE EXCEPTION 'MIN_RATING: Bu maç minimum % puan istiyor.', v_min;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.assert_match_min_rating(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_match_min_rating(uuid, uuid) TO authenticated;

-- ── 2) join_public_match_slot ───────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname = 'join_public_match_slot__inner') THEN
    ALTER FUNCTION public.join_public_match_slot(uuid, text, uuid, boolean)
      RENAME TO join_public_match_slot__inner;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.join_public_match_slot(p_match_id uuid, p_slot_id text, p_user_id uuid, p_is_away boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.assert_match_min_rating(p_match_id, p_user_id);
  PERFORM public.join_public_match_slot__inner(p_match_id, p_slot_id, p_user_id, p_is_away);
END;
$$;
REVOKE ALL ON FUNCTION public.join_public_match_slot__inner(uuid, text, uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.join_public_match_slot(uuid, text, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_public_match_slot(uuid, text, uuid, boolean) TO authenticated;

-- ── 3) join_public_match_reserve ────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname = 'join_public_match_reserve__inner') THEN
    ALTER FUNCTION public.join_public_match_reserve(uuid, uuid)
      RENAME TO join_public_match_reserve__inner;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.join_public_match_reserve(p_match_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.assert_match_min_rating(p_match_id, p_user_id);
  PERFORM public.join_public_match_reserve__inner(p_match_id, p_user_id);
END;
$$;
REVOKE ALL ON FUNCTION public.join_public_match_reserve__inner(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.join_public_match_reserve(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_public_match_reserve(uuid, uuid) TO authenticated;

-- ── 4) player_buy_slots (ücretsiz hızlı yol) ────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname = 'player_buy_slots__inner') THEN
    ALTER FUNCTION public.player_buy_slots(uuid, text[])
      RENAME TO player_buy_slots__inner;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.player_buy_slots(p_match_id uuid, p_slot_ids text[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  PERFORM public.assert_match_min_rating(p_match_id, auth.uid());
  RETURN public.player_buy_slots__inner(p_match_id, p_slot_ids);
END;
$$;
REVOKE ALL ON FUNCTION public.player_buy_slots__inner(uuid, text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.player_buy_slots(uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.player_buy_slots(uuid, text[]) TO authenticated;

-- ── 5) player_buy_slots_v2 (bakiye+kart birleşik yol) ───────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname = 'player_buy_slots_v2__inner') THEN
    ALTER FUNCTION public.player_buy_slots_v2(uuid, text[], boolean, uuid)
      RENAME TO player_buy_slots_v2__inner;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.player_buy_slots_v2(p_match_id uuid, p_slot_ids text[], p_use_balance boolean DEFAULT true, p_card_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  PERFORM public.assert_match_min_rating(p_match_id, auth.uid());
  RETURN public.player_buy_slots_v2__inner(p_match_id, p_slot_ids, p_use_balance, p_card_id);
END;
$$;
REVOKE ALL ON FUNCTION public.player_buy_slots_v2__inner(uuid, text[], boolean, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.player_buy_slots_v2(uuid, text[], boolean, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.player_buy_slots_v2(uuid, text[], boolean, uuid) TO authenticated;

-- ── 6) Veri düzeltmesi: eski sabit-4.0 barajı (kurucu iradesi değildi) ──────
UPDATE public.matches
   SET "minRating" = 0
 WHERE "minRating" = 4.0
   AND status IN ('OPEN', 'ACTIVE', 'DRAFT');

-- ── ROLLBACK NOTU ───────────────────────────────────────────────────────────
-- DROP FUNCTION public.join_public_match_slot(uuid,text,uuid,boolean);
-- ALTER FUNCTION public.join_public_match_slot__inner(uuid,text,uuid,boolean) RENAME TO join_public_match_slot;
-- (diğer 3 fonksiyon için aynı desen) + GRANT'ları eski haline getir.
