-- ============================================================================
-- YAKINSAMA (Faz 2d) — TAM SIFIR-FARK: repoyu canlının BİREBİR aynası yap
-- ----------------------------------------------------------------------------
-- Kullanıcı kararı: kalan repo-only farkları CANLIYA UYDUR (aynala).
--   1) "communities" otomasyonu (repo-only; canlıda YOK) → DÜŞÜR.
--   2) match_tactics & texts birincil anahtarını canlıya uydur (repo: id/eski PK;
--      canlı: match_id / key). Canlıda bu tabloları referans eden FK YOK (güvenli).
-- Her ifade canlının GÜNCEL durumunu hedefler → CANLIDA NET NO-OP (idempotent;
-- canlı zaten bu durumda). Yalnız sıfırdan (fresh preview) kurulumda repoyu
-- canlıya eşitler. (İnce grant/gövde farkları — varsa — aynı turda eklenecek.)
-- ============================================================================

-- ── 1) communities otomasyonu (repo-only) — düşür (canlıda yok) ─────────────────
DROP TRIGGER IF EXISTS trg_communities_updated_at ON public.communities;
DROP TRIGGER IF EXISTS trg_community_invite_code ON public.communities;
DROP TRIGGER IF EXISTS trg_community_member_count ON public.community_members;
DROP FUNCTION IF EXISTS public.generate_community_invite_code();
DROP FUNCTION IF EXISTS public.update_community_member_count();
DROP FUNCTION IF EXISTS public.set_updated_at();

-- ── 2) match_tactics PK'sini canlıya uydur: PK(match_id), id kolonu yok ──────────
DO $mig$
BEGIN
  ALTER TABLE public.match_tactics DROP CONSTRAINT IF EXISTS match_tactics_pkey;
  ALTER TABLE public.match_tactics DROP COLUMN IF EXISTS id;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='match_tactics_pkey1' AND conrelid='public.match_tactics'::regclass) THEN
    ALTER TABLE public.match_tactics ADD CONSTRAINT match_tactics_pkey1 PRIMARY KEY (match_id);
  END IF;
END $mig$;

-- ── 3) texts PK'sini canlıya uydur: PK(key) ─────────────────────────────────────
DO $mig$
BEGIN
  ALTER TABLE public.texts DROP CONSTRAINT IF EXISTS texts_pkey;
  ALTER TABLE public.texts DROP COLUMN IF EXISTS id;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='texts_pkey1' AND conrelid='public.texts'::regclass) THEN
    ALTER TABLE public.texts ADD CONSTRAINT texts_pkey1 PRIMARY KEY (key);
  END IF;
END $mig$;
