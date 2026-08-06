-- ════════════════════════════════════════════════════════════════════════════
-- ANON VERİ MASKELEMESİ — MAÇ KADROSU  (yol haritası B2 · Seçenek B · Bulgu A)
-- ════════════════════════════════════════════════════════════════════════════
--
-- KAYNAK: sozlesmeler/guvenlik-notu-anon-veri-gorunurlugu.md — "Bulgu A"
--
-- SORUN (canlıda 5 Ağustos 2026'da yeniden doğrulandı): 15 maçın kadrosu,
-- yani içindeki oyuncuların ADI ve AVATARI, giriş yapmamış herkese açıktı.
-- Maçların misafirlere görünmesi kasıtlıdır; ama kadrodaki KİMLİĞİN kayıtsız
-- kişilere ve arama motorlarına açık olması gezinme işlevi için gerekli değil
-- (KVKK m.4 ölçülülük).
--
-- ÇÖZÜM: ham `matches` misafire kapatılır; yerine kolon adları AYNI olan
-- `public_matches` görünümü verilir. Maç meta verisi ve slot DOLULUĞU aynen
-- gelir (keşif ekranı "kaç kişi aranıyor" hesabını bozmadan yapar), ama:
--   • player.name / player.avatar / player.id / player.rating  → SİLİNİR
--     (yalnız player.position kalır: mevki rozeti kimliği ifşa etmez)
--   • occupant / purchasedBy (kullanıcı UUID'leri)             → SİLİNİR
--   • reservePlayers                                            → yalnız SAYI
--   • chatMessages                                              → boş
--
-- Görünümde bölge süzgeci için `pitch_city` / `pitch_district` kolonları var:
-- görünümlerde PostgREST'in gömülü `pitches!inner` bağı çalışmaz.
--
-- KAYITLI kullanıcı hiçbir şey kaybetmez: ham tabloyu okumaya devam eder.
--
-- GERİ ALMA:
--   DROP VIEW IF EXISTS public.public_matches;
--   DROP FUNCTION IF EXISTS public._slots_anon_maskele(jsonb), public._reserve_anon_maskele(jsonb);
--   CREATE POLICY matches_select_anon ON public.matches FOR SELECT TO anon
--     USING (("isDemo" IS NOT TRUE) OR get_config_bool('demo_mode_enabled'));
--   GRANT SELECT ON public.matches TO anon;
-- ════════════════════════════════════════════════════════════════════════════

-- Slot dizisinden KİMLİK bilgisini siler, DOLULUK bilgisini korur.
CREATE OR REPLACE FUNCTION public._slots_anon_maskele(p_slots jsonb)
RETURNS jsonb
LANGUAGE sql IMMUTABLE
SET search_path TO 'public','pg_temp'
AS $fn$
  SELECT COALESCE(jsonb_agg(
    (s - 'occupant' - 'purchasedBy' - 'player')
    || CASE
         WHEN s ? 'player' AND jsonb_typeof(s->'player') = 'object'
           THEN jsonb_build_object('player',
                  jsonb_build_object('position', s->'player'->'position'))
         WHEN s ? 'player'
           THEN jsonb_build_object('player', s->'player')
         ELSE '{}'::jsonb
       END
    ORDER BY ord), '[]'::jsonb)
  FROM jsonb_array_elements(COALESCE(p_slots, '[]'::jsonb)) WITH ORDINALITY AS t(s, ord);
$fn$;

-- Yedek oyuncu listesi: yalnız SAYI korunur, kimlik tamamen düşer.
CREATE OR REPLACE FUNCTION public._reserve_anon_maskele(p jsonb)
RETURNS jsonb
LANGUAGE sql IMMUTABLE
SET search_path TO 'public','pg_temp'
AS $fn$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('gizli', true) ORDER BY ord), '[]'::jsonb)
  FROM jsonb_array_elements(COALESCE(p, '[]'::jsonb)) WITH ORDINALITY AS t(s, ord);
$fn$;

REVOKE ALL ON FUNCTION public._slots_anon_maskele(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._reserve_anon_maskele(jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE VIEW public.public_matches AS
SELECT
  m.id, m.title, m.location, m.time, m.date, m.price, m.difficulty, m."minRating",
  m.image, m.badges, m."missingPositions",
  public._slots_anon_maskele(m.slots) AS slots,
  m.status, m."creatorId", m."communityId", m.format, m.duration, m.gender, m."ageGroup",
  m."refereeId", m."homeTeamId", m."awayTeamId", m."homeScore", m."awayScore",
  m."scoreEnteredAt", m.captain_id, m."isDemo", m.cancel_reason, m.refund_status, m.created_at,
  public._slots_anon_maskele(m."awaySlots") AS "awaySlots",
  public._reserve_anon_maskele(m."reservePlayers") AS "reservePlayers",
  '[]'::jsonb AS "chatMessages",
  m.pitch_id, m.visibility, m.is_successful, m.confirmed_at, m.starts_at, m.gk_id,
  m.reminder_24h_sent, m.reminder_1h_sent, m.commission_model, m.image_auto,
  m.deposit_intent_id, m.deposit_status, m.deposit_amount, m.min_players,
  m.deferred_providers, m.away_gk_id, m.court_id, m.is_platform, m.duration_minutes,
  m.ends_at, m.score_status, m.footwear_rule, m.commission_rate_pct,
  m.commission_markup_pct, m.commission_markup_amount,
  p.city AS pitch_city, p.district AS pitch_district
FROM public.matches m
JOIN public.pitches p ON p.id = m.pitch_id
WHERE ((m."isDemo" IS NOT TRUE) OR public.get_config_bool('demo_mode_enabled'));

REVOKE ALL ON public.public_matches FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.public_matches TO anon, authenticated;

-- Ham tablo misafire kapatılır: konum/kimlik hiçbir yoldan okunamaz.
DROP POLICY IF EXISTS matches_select_anon ON public.matches;
REVOKE SELECT ON public.matches FROM anon;
