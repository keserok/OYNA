-- ════════════════════════════════════════════════════════════════════════════
-- [P-5 / M-P0-6] get_my_matches() — "Maçlarım" için kapsamlı sunucu sorgusu
-- ────────────────────────────────────────────────────────────────────────────
-- SORUN:
--   Uygulama açılışında TÜM maç tablosu limitsiz iniyor (supabaseMutations.ts:362).
--   Satır ort. 3.457 B → 5.000 maçta 17,3 MB/açılış; 500 eşzamanlı kullanıcıda
--   8,6 GB = ücretsiz planın 5 GB aylık kotasının 1,7 katı, TEK Cuma akşamında.
--
--   Kaldırılamamasının sebebi kodda yazılı (supabaseMutations.ts:355-361):
--   "Maçlarım" ekranı ayrı bir sorgudan değil, bu global listenin TELEFONDA
--   filtrelenmesinden türetiliyor (hooks/useMyMatches.ts:29-43). Limit koyulursa
--   kullanıcının kendi maçı listeden düşebilir. Yorumun kendi ifadesiyle:
--   "ölçek < doğruluk".
--
--   ⚠️ ÇAKIŞMA-1 (kurucu onayı K-10.11): O karar O GÜN DOĞRUYDU. Bu migration
--   limit koymuyor; kararın DAYANDIĞI KISITI kaldırıyor. Sıra kesin:
--     1. ÖNCE bu fonksiyon (additif, hiçbir şeyi bozmaz)  ← BU MIGRATION
--     2. SONRA istemci buna geçer
--     3. EN SON global sorgu daraltılır
--   Ters sırada yapılırsa gerçek bir regresyon olur.
--
-- KAPSAM — useMyMatches.ts:29-43 ile BİREBİR aynı ölçüt:
--   • maçı kuran (creatorId)
--   • slotta oturan (slots/awaySlots → player.id veya occupant)
--   • slotu satın alan (purchasedBy) — REZERVE dolduran alıcı ajandadan düşmez
--   • yedek listesinde olan (reservePlayers → id)
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_my_matches()
RETURNS SETOF public.matches
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT m.*
  FROM public.matches m
  WHERE (SELECT auth.uid()) IS NOT NULL
    AND (
      -- 1) Maçı kuran
      m."creatorId" = (SELECT auth.uid())

      -- 2) Slotta oturan VEYA slotu satın alan (ev sahibi + deplasman)
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements(
               COALESCE(m.slots, '[]'::jsonb) || COALESCE(m."awaySlots", '[]'::jsonb)
             ) AS s
        WHERE (s->'player'->>'id')::uuid = (SELECT auth.uid())
           OR (s->>'occupant')::uuid     = (SELECT auth.uid())
           OR (s->>'purchasedBy')::uuid  = (SELECT auth.uid())
      )

      -- 3) Yedek listesinde
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements(COALESCE(m."reservePlayers", '[]'::jsonb)) AS r
        WHERE (r->>'id')::uuid = (SELECT auth.uid())
      )
    );
$function$;

COMMENT ON FUNCTION public.get_my_matches() IS
  'P-5/M-P0-6: Kullanicinin maclari (kurucu | slotta oturan | slotu satin alan | yedek). Olcut hooks/useMyMatches.ts:29-43 ile birebir ayni. Acilista tum matches tablosunu indirmeyi gereksiz kilar.';

REVOKE ALL ON FUNCTION public.get_my_matches() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_matches() TO authenticated;

-- ── Doğrulama: fonksiyon çalışıyor ve oturumsuzda boş dönüyor mu? ──────────
DO $do$
DECLARE v_adet int;
BEGIN
  SELECT count(*) INTO v_adet FROM public.get_my_matches();
  -- Bu migration postgres olarak calisir; auth.uid() NULL -> 0 satir beklenir.
  IF v_adet <> 0 THEN
    RAISE EXCEPTION '[P-5] Oturumsuz cagri % satir dondurdu, 0 bekleniyordu.', v_adet;
  END IF;
  RAISE NOTICE '[P-5] get_my_matches kuruldu; oturumsuz cagri bos donuyor.';
END $do$;

-- ════════════════════════════════════════════════════════════════════════════
-- GERİ ALMA: DROP FUNCTION IF EXISTS public.get_my_matches();
-- ════════════════════════════════════════════════════════════════════════════
