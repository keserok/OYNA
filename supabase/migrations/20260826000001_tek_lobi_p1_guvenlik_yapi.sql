-- ============================================================================
-- TEK MAÇ LOBİSİ — PAKET 1: Güvenlik + Yapı (private_code koruması, yazım
-- disiplini, participants kolonları, kişi başı taktik önerileri, bildirimler)
--
-- Doğrulama filosu bulgularına dayanır (2026-08):
--  • private_code her istemcinin select('*')'ına ve get_nearby_matches dönüşüne
--    iniyordu → kod ayrı, istemciye tamamen kapalı tabloya taşınır.
--  • player_update_match slots/awaySlots/reservePlayers/chatMessages'ı payload'dan
--    OLDUĞU GİBİ yazıyordu (SSOT'u delen ana kapı) → bu anahtarlar sökülür.
--  • match_participants UNIQUE(match_id,user_id) → alıcı/oyuncu ayrımı satır
--    çoğaltmadan is_buyer/bought_slots kolonlarıyla yapılır.
--  • Kişi başı 1 taktik önerisi: (match_id, proposer_id) PK'lı yeni tablo.
-- Tümü idempotent (IF NOT EXISTS / CREATE OR REPLACE / WHERE NOT EXISTS).
-- ============================================================================

-- ─── 1) match_private_codes — kod artık istemcinin okuyamayacağı yerde ──────
CREATE TABLE IF NOT EXISTS public.match_private_codes (
  match_id   uuid PRIMARY KEY REFERENCES public.matches(id) ON DELETE CASCADE,
  code       text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.match_private_codes ENABLE ROW LEVEL SECURITY;
-- Hiçbir istemci rolü okuyamaz/yazamaz; yalnız SECURITY DEFINER fonksiyonlar erişir.
REVOKE ALL ON public.match_private_codes FROM PUBLIC, anon, authenticated;

-- Mevcut kodları taşı (idempotent).
INSERT INTO public.match_private_codes (match_id, code)
SELECT id, private_code FROM public.matches
WHERE private_code IS NOT NULL
ON CONFLICT (match_id) DO NOTHING;

-- ─── 2) get_nearby_matches — private_code dönüşten çıkar ────────────────────
-- RETURNS TABLE şekli değiştiği için DROP + CREATE zorunlu (42P13 emsali).
DROP FUNCTION IF EXISTS public.get_nearby_matches(double precision, double precision, double precision);

CREATE FUNCTION public.get_nearby_matches(
  p_lat double precision, p_lon double precision, p_radius_km double precision DEFAULT 25
)
RETURNS TABLE(
  id uuid, title text, location text, "time" text, date text, price numeric,
  difficulty text, "minRating" numeric, image text, badges jsonb,
  "missingPositions" jsonb, slots jsonb, status text, "creatorId" uuid,
  "communityId" text, format text, duration text, gender text, "ageGroup" text,
  "refereeId" uuid, "homeTeamId" uuid, "awayTeamId" uuid, "homeScore" integer,
  "awayScore" integer, "scoreEnteredAt" timestamp with time zone, captain_id uuid,
  "isDemo" boolean, cancel_reason text, refund_status text,
  created_at timestamp with time zone, "awaySlots" jsonb, "reservePlayers" jsonb,
  "chatMessages" jsonb, pitch_id uuid, visibility text,
  is_successful boolean, confirmed_at timestamp with time zone,
  starts_at timestamp with time zone, gk_id uuid, reminder_24h_sent boolean,
  reminder_1h_sent boolean, commission_model text,
  distance_meters double precision, distance_km double precision
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp', 'extensions'
AS $function$
  SELECT m.id, m.title, m.location, m."time", m.date, m.price, m.difficulty,
         m."minRating", m.image, m.badges, m."missingPositions", m.slots,
         m.status, m."creatorId", m."communityId", m.format, m.duration,
         m.gender, m."ageGroup", m."refereeId", m."homeTeamId", m."awayTeamId",
         m."homeScore", m."awayScore", m."scoreEnteredAt", m.captain_id,
         m."isDemo", m.cancel_reason, m.refund_status, m.created_at,
         m."awaySlots", m."reservePlayers", m."chatMessages", m.pitch_id,
         m.visibility, m.is_successful, m.confirmed_at,
         m.starts_at, m.gk_id, m.reminder_24h_sent, m.reminder_1h_sent,
         m.commission_model,
         earth_distance(ll_to_earth(p_lat, p_lon), ll_to_earth(pt.latitude, pt.longitude))          AS distance_meters,
         earth_distance(ll_to_earth(p_lat, p_lon), ll_to_earth(pt.latitude, pt.longitude)) / 1000.0 AS distance_km
  FROM public.matches m
  JOIN public.pitches pt ON pt.id = m.pitch_id
  WHERE m.status IN ('OPEN', 'ACTIVE') AND m.visibility = 'OPEN'
    AND pt.latitude IS NOT NULL AND pt.longitude IS NOT NULL
    AND m.starts_at IS NOT NULL AND m.starts_at > now()
    AND earth_distance(ll_to_earth(p_lat, p_lon), ll_to_earth(pt.latitude, pt.longitude)) <= p_radius_km * 1000.0
  ORDER BY earth_distance(ll_to_earth(p_lat, p_lon), ll_to_earth(pt.latitude, pt.longitude)) ASC
  LIMIT 100;
$function$;

REVOKE ALL ON FUNCTION public.get_nearby_matches(double precision, double precision, double precision) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_nearby_matches(double precision, double precision, double precision) TO authenticated;

-- ─── 3) resolve_private_match — kod yeni tablodan çözülür ───────────────────
CREATE OR REPLACE FUNCTION public.resolve_private_match(p_code text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE m RECORD;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_code IS NULL OR length(trim(p_code)) < 4 THEN RAISE EXCEPTION 'INVALID_CODE'; END IF;
  SELECT mt.id, mt.title, mt.status INTO m
  FROM public.match_private_codes c
  JOIN public.matches mt ON mt.id = c.match_id
  WHERE c.code = upper(trim(p_code)) AND mt.visibility = 'PRIVATE'
  ORDER BY c.created_at DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Bu koda ait özel maç bulunamadı.'; END IF;
  RETURN jsonb_build_object('match_id', m.id, 'title', m.title, 'status', m.status);
END;
$$;
REVOKE ALL ON FUNCTION public.resolve_private_match(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_private_match(text) TO authenticated;

-- ─── 4) get_my_match_private_code — kodu YALNIZ kurucu görür ────────────────
CREATE OR REPLACE FUNCTION public.get_my_match_private_code(p_match_id uuid)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_uid uuid := auth.uid(); v_code text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT c.code INTO v_code
  FROM public.match_private_codes c
  JOIN public.matches m ON m.id = c.match_id
  WHERE c.match_id = p_match_id AND (m."creatorId" = v_uid OR public.is_admin());
  RETURN v_code; -- kurucu değilse / kod yoksa NULL
END;
$$;
REVOKE ALL ON FUNCTION public.get_my_match_private_code(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_match_private_code(uuid) TO authenticated;

-- ─── 5) private_code kolonu kalkar (sızıntı yüzeyi kapanır) ─────────────────
ALTER TABLE public.matches DROP COLUMN IF EXISTS private_code;

-- ─── 6) player_update_match — slot/kadro anahtarları SÖKÜLDÜ ────────────────
-- Doluluk artık YALNIZ dar slot RPC'lerinden değişir. Bu fonksiyon meta alanlar
-- (başlık düzeyi bilgiler, skor, görünürlük, durum) ile sınırlıdır.
CREATE OR REPLACE FUNCTION public.player_update_match(p_match_id uuid, p_payload jsonb)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_is_banned boolean;
  v_is_participant boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT is_banned INTO v_is_banned FROM public.profiles WHERE id = v_uid;
  IF v_is_banned THEN RAISE EXCEPTION 'Kullanıcı banlı!'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.matches m
    WHERE m.id = p_match_id
    AND (
      m."creatorId" = v_uid
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(m.slots, '[]'::jsonb)) s
                 WHERE NULLIF(s->'player'->>'id','')::uuid = v_uid OR NULLIF(s->>'occupant','')::uuid = v_uid OR NULLIF(s->>'purchasedBy','')::uuid = v_uid)
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(m."awaySlots", '[]'::jsonb)) s
                 WHERE NULLIF(s->'player'->>'id','')::uuid = v_uid OR NULLIF(s->>'occupant','')::uuid = v_uid OR NULLIF(s->>'purchasedBy','')::uuid = v_uid)
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(m."reservePlayers", '[]'::jsonb)) s WHERE (s->>'id')::uuid = v_uid)
    )
  ) INTO v_is_participant;

  IF NOT v_is_participant AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  -- KADRO ANAHTARLARI BİLİNÇLİ OLARAK YOK: slots / awaySlots / reservePlayers /
  -- chatMessages payload'da gelse bile SESSİZCE YOK SAYILIR (SSOT: dar RPC'ler).
  UPDATE public.matches SET
    "homeTeamId" = CASE WHEN p_payload ? 'homeTeamId' THEN NULLIF(p_payload->>'homeTeamId', '')::uuid ELSE "homeTeamId" END,
    "awayTeamId" = CASE WHEN p_payload ? 'awayTeamId' THEN NULLIF(p_payload->>'awayTeamId', '')::uuid ELSE "awayTeamId" END,
    status = CASE
      -- Skor girilerek tamamlanma: LIVE/ACTIVE/CONFIRMED → COMPLETED (yalnız kurucu)
      WHEN p_payload ? 'status' AND (p_payload->>'status') = 'COMPLETED'
           AND status IN ('LIVE','ACTIVE','CONFIRMED')
           AND p_payload ? 'scoreEnteredAt'
           AND EXISTS (SELECT 1 FROM public.matches mm WHERE mm.id = p_match_id AND mm."creatorId" = v_uid)
      THEN 'COMPLETED'
      WHEN p_payload ? 'status'
           AND status IN ('DRAFT','ACTIVE')
           AND (p_payload->>'status') IN ('DRAFT','ACTIVE','CANCELLED')
      THEN p_payload->>'status'
      ELSE status END,
    visibility = CASE WHEN p_payload ? 'visibility' AND (p_payload->>'visibility') IN ('OPEN','PRIVATE')
                      THEN p_payload->>'visibility' ELSE visibility END,
    pitch_id = CASE WHEN p_payload ? 'pitch_id' THEN NULLIF(p_payload->>'pitch_id','')::uuid ELSE pitch_id END,
    format = CASE WHEN p_payload ? 'format' THEN p_payload->>'format' ELSE format END,
    duration = CASE WHEN p_payload ? 'duration' THEN p_payload->>'duration' ELSE duration END,
    gender = CASE WHEN p_payload ? 'gender' THEN p_payload->>'gender' ELSE gender END,
    "ageGroup" = CASE WHEN p_payload ? 'ageGroup' THEN p_payload->>'ageGroup' ELSE "ageGroup" END,
    "homeScore" = CASE WHEN p_payload ? 'homeScore' THEN (p_payload->>'homeScore')::int ELSE "homeScore" END,
    "awayScore" = CASE WHEN p_payload ? 'awayScore' THEN (p_payload->>'awayScore')::int ELSE "awayScore" END,
    "scoreEnteredAt" = CASE WHEN p_payload ? 'scoreEnteredAt' THEN (p_payload->>'scoreEnteredAt')::timestamptz ELSE "scoreEnteredAt" END
  WHERE id = p_match_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Maç bulunamadı'; END IF;

  -- PRIVATE'a geçişte kod yoksa yeni tabloda üret.
  IF COALESCE(p_payload->>'visibility','') = 'PRIVATE' THEN
    INSERT INTO public.match_private_codes (match_id, code)
    VALUES (p_match_id, upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)))
    ON CONFLICT (match_id) DO NOTHING;
  END IF;

  RETURN TRUE;
END;
$$;
REVOKE ALL ON FUNCTION public.player_update_match(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.player_update_match(uuid, jsonb) TO authenticated;

-- ─── 7) player_create_match — OLUŞTURMA = YAPI (doluluk yalnız satın almayla) ─
-- İstemciden gelen slot dizileri normalize edilir: yalnız yapı anahtarları
-- (id, role, x, y, side) korunur; status her zaman OPEN, player/purchasedBy/
-- occupant/assignmentStatus/inviteeId/claimCode SIYRILIR. Eski istemci veya elle
-- hazırlanmış payload TAKEN'lı maç yaratamaz.
CREATE OR REPLACE FUNCTION public.player_create_match(p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id        uuid := gen_random_uuid();
  v_uid       uuid := auth.uid();
  v_is_banned boolean;
  v_visibility text;
  v_code      text;
  v_starts_at timestamptz;
  v_date      text;
  v_time      text;
  v_time_norm text;
  v_uuid_re   text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  v_pitch_id  uuid;
  v_home_team uuid;
  v_away_team uuid;
  v_slots     jsonb;
  v_away      jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT is_banned INTO v_is_banned FROM public.profiles WHERE id = v_uid;
  IF v_is_banned THEN RAISE EXCEPTION 'Kullanıcı banlı!'; END IF;

  v_visibility := COALESCE(p_payload->>'visibility', 'OPEN');
  IF v_visibility = 'PRIVATE' THEN
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  END IF;

  v_date := p_payload->>'date';
  v_time := p_payload->>'time';
  v_time_norm := (SELECT (regexp_match(replace(COALESCE(v_time, ''), '.', ':'), '\d{1,2}:\d{2}'))[1]);
  v_starts_at := CASE
    WHEN v_date ~ '^\d{4}-\d{2}-\d{2}$' AND v_time_norm IS NOT NULL
    THEN (v_date::date + (v_time_norm||':00')::time)::timestamptz ELSE NULL END;

  v_pitch_id  := CASE WHEN COALESCE(p_payload->>'pitch_id','')   ~ v_uuid_re THEN (p_payload->>'pitch_id')::uuid   ELSE NULL END;
  v_home_team := CASE WHEN COALESCE(p_payload->>'homeTeamId','') ~ v_uuid_re THEN (p_payload->>'homeTeamId')::uuid ELSE NULL END;
  v_away_team := CASE WHEN COALESCE(p_payload->>'awayTeamId','') ~ v_uuid_re THEN (p_payload->>'awayTeamId')::uuid ELSE NULL END;

  -- YAPI NORMALİZASYONU: her slot OPEN + yalnız yapı anahtarları.
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id',   COALESCE(s->>'id', 'slot_' || (ord - 1)::text),
      'role', COALESCE(s->>'role', 'ORT'),
      'x',    COALESCE((s->>'x')::numeric, 50),
      'y',    COALESCE((s->>'y')::numeric, 50),
      'status', 'OPEN'
    ) || CASE WHEN s ? 'side' THEN jsonb_build_object('side', s->>'side') ELSE '{}'::jsonb END
    ORDER BY ord
  ), '[]'::jsonb) INTO v_slots
  FROM jsonb_array_elements(COALESCE(p_payload->'slots', '[]'::jsonb)) WITH ORDINALITY AS t(s, ord);

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id',   COALESCE(s->>'id', 'away_' || (ord - 1)::text),
      'role', COALESCE(s->>'role', 'ORT'),
      'x',    COALESCE((s->>'x')::numeric, 50),
      'y',    COALESCE((s->>'y')::numeric, 50),
      'status', 'OPEN'
    ) || CASE WHEN s ? 'side' THEN jsonb_build_object('side', s->>'side') ELSE '{}'::jsonb END
    ORDER BY ord
  ), '[]'::jsonb) INTO v_away
  FROM jsonb_array_elements(COALESCE(p_payload->'awaySlots', '[]'::jsonb)) WITH ORDINALITY AS t(s, ord);

  INSERT INTO public.matches (
    id, title, location, date, "time", price, difficulty, status, format,
    duration, gender, "ageGroup", image, badges, "minRating", "missingPositions",
    slots, "awaySlots", "creatorId", captain_id, "isDemo",
    pitch_id, visibility, starts_at,
    "homeTeamId", "awayTeamId"
  ) VALUES (
    v_id,
    COALESCE(p_payload->>'title', 'Yeni Maç'),
    COALESCE(p_payload->>'location', ''),
    CASE WHEN v_date ~ '^\d{4}-\d{2}-\d{2}$' THEN v_date::date ELSE CURRENT_DATE END,
    COALESCE(v_time_norm, '20:00'),
    COALESCE((p_payload->>'price')::numeric, 0),
    COALESCE(p_payload->>'difficulty', 'Rahat'),
    COALESCE(p_payload->>'status', 'ACTIVE'),
    COALESCE(p_payload->>'format', '7v7'),
    p_payload->>'duration',
    p_payload->>'gender',
    p_payload->>'ageGroup',
    p_payload->>'image',
    COALESCE(p_payload->'badges', '[]'::jsonb),
    COALESCE((p_payload->>'minRating')::numeric, 0),
    COALESCE(p_payload->'missingPositions', '[]'::jsonb),
    v_slots,
    v_away,
    v_uid, v_uid, false,
    v_pitch_id,
    v_visibility,
    v_starts_at,
    v_home_team,
    v_away_team
  );

  IF v_code IS NOT NULL THEN
    INSERT INTO public.match_private_codes (match_id, code) VALUES (v_id, v_code)
    ON CONFLICT (match_id) DO NOTHING;
  END IF;

  -- Kurucu, sorgu indeksine katılımcı (kurucu) olarak yazılır.
  INSERT INTO public.match_participants (match_id, user_id, role, status)
  VALUES (v_id, v_uid, 'home', 'creator')
  ON CONFLICT (match_id, user_id) DO NOTHING;

  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.player_create_match(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.player_create_match(jsonb) TO authenticated;

-- ─── 8) match_participants — alıcı/oyuncu ayrımı kolonla ────────────────────
ALTER TABLE public.match_participants
  ADD COLUMN IF NOT EXISTS is_buyer boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bought_slots integer NOT NULL DEFAULT 0;

-- ─── 9) match_tactic_proposals — kişi başı 1 taktik önerisi ─────────────────
CREATE TABLE IF NOT EXISTS public.match_tactic_proposals (
  match_id    uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  proposer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tactic_id   uuid NOT NULL REFERENCES public.tactics(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id, proposer_id)
);
ALTER TABLE public.match_tactic_proposals ENABLE ROW LEVEL SECURITY;

-- Okuma: maçın katılımcıları (participants indeksi) + kurucu.
DROP POLICY IF EXISTS mtp_select ON public.match_tactic_proposals;
CREATE POLICY mtp_select ON public.match_tactic_proposals FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.match_participants mp
          WHERE mp.match_id = match_tactic_proposals.match_id AND mp.user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.matches m
             WHERE m.id = match_tactic_proposals.match_id AND m."creatorId" = auth.uid())
);
-- Yazım yalnız RPC'lerden (SECURITY DEFINER); doğrudan insert/update/delete yok.

CREATE OR REPLACE FUNCTION public.propose_match_tactic(p_match_id uuid, p_tactic_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_uid uuid := auth.uid(); v_is_participant boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  -- Taktik önerenin kendi Stüdyo taktiği olmalı.
  IF NOT EXISTS (SELECT 1 FROM public.tactics t WHERE t.id = p_tactic_id AND t."userId" = v_uid) THEN
    RAISE EXCEPTION 'NOT_YOUR_TACTIC: Yalnız kendi taktiğini önerebilirsin.';
  END IF;

  -- Öneren maçın katılımcısı olmalı (kurucu / alıcı / oyuncu / yedek).
  SELECT EXISTS (
    SELECT 1 FROM public.match_participants mp WHERE mp.match_id = p_match_id AND mp.user_id = v_uid
  ) OR EXISTS (
    SELECT 1 FROM public.matches m WHERE m.id = p_match_id AND m."creatorId" = v_uid
  ) INTO v_is_participant;
  IF NOT v_is_participant THEN
    RAISE EXCEPTION 'NOT_PARTICIPANT: Taktik önermek için maçın kadrosunda olmalısın.';
  END IF;

  INSERT INTO public.match_tactic_proposals (match_id, proposer_id, tactic_id)
  VALUES (p_match_id, v_uid, p_tactic_id)
  ON CONFLICT (match_id, proposer_id) DO UPDATE SET tactic_id = EXCLUDED.tactic_id, created_at = now();

  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.propose_match_tactic(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.propose_match_tactic(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.withdraw_match_tactic(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  DELETE FROM public.match_tactic_proposals WHERE match_id = p_match_id AND proposer_id = v_uid;
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.withdraw_match_tactic(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.withdraw_match_tactic(uuid) TO authenticated;

-- Önerileri profil bilgisiyle listele (RLS'e ek olarak katılımcı kapısı içeride).
CREATE OR REPLACE FUNCTION public.get_match_tactic_proposals(p_match_id uuid)
RETURNS TABLE(proposer_id uuid, proposer_name text, proposer_avatar text,
              tactic_id uuid, tactic_name text, formation text, size text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p.proposer_id,
         COALESCE(pr.name, pr.full_name, 'Oyuncu') AS proposer_name,
         COALESCE(pr.avatar_url, '') AS proposer_avatar,
         p.tactic_id, t.name AS tactic_name, t.formation, t.size, p.created_at
  FROM public.match_tactic_proposals p
  JOIN public.tactics t ON t.id = p.tactic_id
  JOIN public.profiles pr ON pr.id = p.proposer_id
  WHERE p.match_id = p_match_id
    AND (
      EXISTS (SELECT 1 FROM public.match_participants mp
              WHERE mp.match_id = p_match_id AND mp.user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.matches m
                 WHERE m.id = p_match_id AND m."creatorId" = auth.uid())
    )
  ORDER BY p.created_at ASC;
$$;
REVOKE ALL ON FUNCTION public.get_match_tactic_proposals(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_match_tactic_proposals(uuid) TO authenticated;

-- ─── 10) Bildirim şablonları (slot yaşam döngüsü + erteleme) ────────────────
INSERT INTO public.notification_templates (type_key, label_tr, title_tr, body_tr, category, is_mandatory, can_user_disable, sort_order)
SELECT 'match_slot_assigned', 'Slot ataması', 'Kadrodasın! ⚽',
       '{sender_name} seni "{match_title}" maçının kadrosuna ekledi. İstemezsen slottan ayrılabilirsin.', 'SOCIAL', false, true, 30
WHERE NOT EXISTS (SELECT 1 FROM public.notification_templates WHERE type_key = 'match_slot_assigned');

INSERT INTO public.notification_templates (type_key, label_tr, title_tr, body_tr, category, is_mandatory, can_user_disable, sort_order)
SELECT 'match_slot_vacated', 'Slot boşaldı', 'Slotun boşaldı 📭',
       '{player_name}, "{match_title}" maçında senin aldığın slottan ayrıldı. Slot yeniden senin rezervinde.', 'SOCIAL', false, true, 31
WHERE NOT EXISTS (SELECT 1 FROM public.notification_templates WHERE type_key = 'match_slot_vacated');

INSERT INTO public.notification_templates (type_key, label_tr, title_tr, body_tr, category, is_mandatory, can_user_disable, sort_order)
SELECT 'match_spot_opened', 'Yer açıldı', 'Sıra sende olabilir! 🔥',
       '"{match_title}" maçında bir yer boşaldı. Yedek listesindesin — hemen slotu satın alarak kadroya girebilirsin.', 'SOCIAL', false, true, 32
WHERE NOT EXISTS (SELECT 1 FROM public.notification_templates WHERE type_key = 'match_spot_opened');

INSERT INTO public.notification_templates (type_key, label_tr, title_tr, body_tr, category, is_mandatory, can_user_disable, sort_order)
SELECT 'match_kicked', 'Kadrodan çıkarılma', 'Kadro değişikliği',
       '"{match_title}" maçında kadrodan çıkarıldın.{refund_note}', 'SOCIAL', false, false, 33
WHERE NOT EXISTS (SELECT 1 FROM public.notification_templates WHERE type_key = 'match_kicked');

INSERT INTO public.notification_templates (type_key, label_tr, title_tr, body_tr, category, is_mandatory, can_user_disable, sort_order)
SELECT 'match_time_changed', 'Maç saati değişti', 'Maç saati güncellendi 🕒',
       '"{match_title}" maçının zamanı değişti: {new_datetime}. Uymuyorsa maçtan ayrılabilirsin.', 'SOCIAL', true, false, 34
WHERE NOT EXISTS (SELECT 1 FROM public.notification_templates WHERE type_key = 'match_time_changed');
