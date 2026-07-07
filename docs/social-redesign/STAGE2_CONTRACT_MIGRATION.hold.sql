-- ═══════════════════════════════════════════════════════════════════
-- ⛔ UYGULAMA — BEKLETİLEN DOSYA (supabase/migrations DIŞINDA tutulur)
--
-- SOSYAL YENİDEN TASARIM — AŞAMA 2 "DARALT" (contract) MİGRATION'I
-- Foundation Spec §5 Aşama 2 · genişlet→daralt stratejisinin son adımı.
--
-- NE ZAMAN UYGULANIR:
--   Yeni istemci (Küme 1-4) mağazalarda YAYINDA ve eski istemci payı
--   ihmal edilebilir olduğunda. Bu dosyadaki her DROP, eski istemcinin
--   hâlâ okuduğu/yazdığı bir yüzeyi kaldırır — erken uygulanırsa canlı
--   eski sürüm KIRILIR.
--
-- NASIL UYGULANIR:
--   1) Aşağıdaki ÖN-KOŞUL sorgularını çalıştır, hepsi geçmeli.
--   2) Dosyayı supabase/migrations/2026XXXXXXXXXX_social_faz2_contract.sql
--      olarak taşı ve tarih damgasını güncelle.
--   3) Önce staging/branch'te uygula; advisors + smoke test; sonra canlı.
--
-- ÖN-KOŞUL KONTROLLERİ (hepsi 0/boş dönmeli):
--   -- Eski istemci izi: son 14 günde legacy kolonlara yazan var mı?
--   --   (uygulama sürüm telemetrisi / API loglarından doğrula)
--   -- Rol modeli tutarlı mı (captain_id ↔ role=CAPTAIN):
--   SELECT count(*) FROM public.teams t
--   WHERE t.is_archived = false AND t.captain_id IS NOT NULL
--     AND NOT EXISTS (SELECT 1 FROM public.team_members tm
--                     WHERE tm.team_id = t.id AND tm.user_id = t.captain_id
--                       AND tm.role = 'CAPTAIN' AND tm.is_active = true);
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1) Yardımcılar: eski kolon OR-yedeği sökülür (tek hakem = role) ──
CREATE OR REPLACE FUNCTION public._is_team_member(p_team_id uuid, p_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = 'public','pg_temp' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.team_id = p_team_id AND tm.user_id = p_uid AND tm.is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public._is_team_admin(p_team_id uuid, p_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = 'public','pg_temp' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.team_id = p_team_id AND tm.user_id = p_uid
      AND tm.is_active = true AND tm.role IN ('CAPTAIN','ADMIN')
  );
$$;

CREATE OR REPLACE FUNCTION public._team_captain(p_team_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = 'public','pg_temp' AS $$
  SELECT tm.user_id FROM public.team_members tm
  WHERE tm.team_id = p_team_id AND tm.role = 'CAPTAIN' AND tm.is_active = true
  LIMIT 1;
$$;

-- ── 2) team_members RLS: captain_id bağımlılığı role tabanına taşınır ──
DROP POLICY IF EXISTS "tm_insert_self_or_captain" ON public.team_members;
CREATE POLICY "tm_insert_self_or_captain" ON public.team_members FOR INSERT
  WITH CHECK (
    user_id = (SELECT auth.uid())
    OR public._is_team_admin(team_id, (SELECT auth.uid()))
  );
DROP POLICY IF EXISTS "tm_update_captain" ON public.team_members;
CREATE POLICY "tm_update_captain" ON public.team_members FOR UPDATE
  USING (public._is_team_admin(team_id, (SELECT auth.uid())));
DROP POLICY IF EXISTS "tm_delete_self_or_captain" ON public.team_members;
CREATE POLICY "tm_delete_self_or_captain" ON public.team_members FOR DELETE
  USING (
    user_id = (SELECT auth.uid())
    OR public._is_team_admin(team_id, (SELECT auth.uid()))
  );

-- ── 3) RPC'lerdeki çift-yazım sökümü ──
-- set_member_role / transfer_captaincy / leave_team / create_team içindeki
-- captains[]/captain_id/captain güncelleyen satırlar kaldırılarak fonksiyonlar
-- yeniden yaratılır (bkz. 20260713000010 ve 000013 — gövdelerden ilgili
-- UPDATE public.teams SET captain*/captains* satırlarını çıkar).

-- ── 4) teams: enkaz kolonlar (Spec §5 Aşama 2) ──
ALTER TABLE public.teams
  DROP COLUMN IF EXISTS captain,
  DROP COLUMN IF EXISTS captains,
  DROP COLUMN IF EXISTS captain_id,
  DROP COLUMN IF EXISTS colors,
  DROP COLUMN IF EXISTS value,
  DROP COLUMN IF EXISTS level,
  DROP COLUMN IF EXISTS roster,
  DROP COLUMN IF EXISTS players,
  DROP COLUMN IF EXISTS logo,
  DROP COLUMN IF EXISTS logo_url,
  DROP COLUMN IF EXISTS location,        -- kanonik: city
  DROP COLUMN IF EXISTS "matchHistory",  -- geçmiş hep matches'ten
  DROP COLUMN IF EXISTS "winRate",
  DROP COLUMN IF EXISTS invite_token,    -- 000015: token deny-all tabloda
  DROP COLUMN IF EXISTS crest;           -- kanonik: crest_config (jsonb)

-- ── 5) tactics: serbest metin takım adı + miras oy jsonb'si ──
ALTER TABLE public.tactics
  DROP COLUMN IF EXISTS "teamName",  -- ad her zaman teams.name'den okunur
  DROP COLUMN IF EXISTS votes;

-- tactics TEXT→jsonb dönüşümü (slots/subs/opponents/drawings):
--   eski istemci JSON.parse ile okuduğundan Aşama 1'de ertelendi.
--   Bu aşamada güvenli:
-- ALTER TABLE public.tactics
--   ALTER COLUMN slots     TYPE jsonb USING nullif(slots,'')::jsonb,
--   ALTER COLUMN subs      TYPE jsonb USING coalesce(nullif(subs,''),'[]')::jsonb,
--   ALTER COLUMN opponents TYPE jsonb USING coalesce(nullif(opponents,''),'[]')::jsonb,
--   ALTER COLUMN drawings  TYPE jsonb USING coalesce(nullif(drawings,''),'[]')::jsonb;
--   (save_team_tactic/get_tactic_by_share_token gövdeleri ::text çevirimsiz
--    yeniden yaratılır; istemci parseDbTactic JSON.parse yerine doğrudan okur.)

-- ── 6) friendships: eski istemci köprüsü GENERATED kolonlar ──
ALTER TABLE public.friendships
  DROP COLUMN IF EXISTS sender_id,
  DROP COLUMN IF EXISTS receiver_id;

-- ── 7) match_tactics_legacy: sıfır satır, sıfır referans (000011'de
--      yeniden adlandırılmıştı) — tamamen düşer ──
DROP TABLE IF EXISTS public.match_tactics_legacy;

COMMIT;

-- ── 8) Migration SONRASI istemci temizliği (ayrı commit) ──
-- services/teamService.ts: fetchMyTeams/createTeam legacy yolları ölür
--   (kaynak teamSocialService); getFriendsWithStats sender_id/receiver_id
--   sorgusu friendships yeni kolonlarına (requester/addressee) taşınır.
-- store.ts: myTeams/loadMyTeams/createTeam legacy slice gözden geçirilir.
-- Ardından advisors güvenlik+performans taraması tekrarlanır.
