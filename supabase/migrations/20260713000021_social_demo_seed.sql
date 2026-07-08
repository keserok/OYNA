-- ================================================================
-- DEMO SOSYAL ENTEGRASYON — arkadaşlıklar · takımlar · maçlar
--
-- Ordu lansman demo kadrosu (oyuncuNN@oyna.app) sosyal dokuya bağlanır:
--  · ~30 kabul edilmiş arkadaşlık + 3 bekleyen istek + favoriler
--  · Galaktikos / sd / Doğrulama FC kadrolarına gerçek üyelikler
--  · Yeni rakip takım: Karadeniz Fırtınası (kaptan Ali Koç — oyuncu08)
--  · 3 TAMAMLANMIŞ takım maçı (skorlu; sayaçlar tutarlı) + 1 YAKLAŞAN
--    maç (takım kartlarında "sıradaki maç" canlanır)
--  · Açık bireysel maçların boş slotlarına demo oyuncular
--  · Görselsiz demo sahalara fotoğraf (maç kartları sahayı gösterir)
--
-- Tümü idempotent ve varlık-korumalı: kayıt varsa atlanır; kullanıcı
-- verisi silinmez. Bildirim üretilmez (sessiz tarihsel doku).
-- ================================================================

DO $$
DECLARE
  -- Demo kimlikleri (deterministik lansman seed'i)
  p01 uuid := 'd0e51a00-0000-4000-8000-000000000001'; -- Emre Kaya
  p02 uuid := 'd0e51a00-0000-4000-8000-000000000002'; -- Burak Demir
  p03 uuid := 'd0e51a00-0000-4000-8000-000000000003'; -- Mert Yıldız
  p04 uuid := 'd0e51a00-0000-4000-8000-000000000004';
  p05 uuid := 'd0e51a00-0000-4000-8000-000000000005';
  p06 uuid := 'd0e51a00-0000-4000-8000-000000000006';
  p07 uuid := 'd0e51a00-0000-4000-8000-000000000007';
  p08 uuid := 'd0e51a00-0000-4000-8000-000000000008'; -- Ali Koç
  p09 uuid := 'd0e51a00-0000-4000-8000-000000000009';
  p10 uuid := 'd0e51a00-0000-4000-8000-000000000010';
  p11 uuid := 'd0e51a00-0000-4000-8000-000000000011';
  p12 uuid := 'd0e51a00-0000-4000-8000-000000000012';
  p13 uuid := 'd0e51a00-0000-4000-8000-000000000013';
  p14 uuid := 'd0e51a00-0000-4000-8000-000000000014';
  p15 uuid := 'd0e51a00-0000-4000-8000-000000000015';
  k1  uuid := 'd0e51c00-0000-4000-8000-000000000001'; -- kaleci1
  k2  uuid := 'd0e51c00-0000-4000-8000-000000000002';
  k3  uuid := 'd0e51c00-0000-4000-8000-000000000003';

  pitch_capo uuid := 'a0000001-0001-4001-8001-000000000001';
  pitch_olim uuid := 'a0000002-0002-4002-8002-000000000002';
  pitch_vip  uuid := 'a0000003-0003-4003-8003-000000000003';

  team_kf uuid := 'd0e51f00-0000-4000-8000-000000000001'; -- Karadeniz Fırtınası
  m101 uuid := 'd0e51e00-0000-4000-8000-000000000101';
  m102 uuid := 'd0e51e00-0000-4000-8000-000000000102';
  m103 uuid := 'd0e51e00-0000-4000-8000-000000000103';
  m104 uuid := 'd0e51e00-0000-4000-8000-000000000104';

  team_gala uuid;
  team_sd   uuid;
  team_dfc  uuid;
BEGIN
  -- Demo kadro yoksa (taze ortam) sessizce çık
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p01) THEN
    RAISE NOTICE 'demo seed atlandı: demo profiller yok';
    RETURN;
  END IF;

  -- ── 0) Görselsiz demo sahalara fotoğraf ──
  UPDATE public.pitches SET image = 'https://images.unsplash.com/photo-1529900748604-07564a03e7a6?auto=format&fit=crop&q=80&w=1200'
  WHERE id = pitch_capo AND (image IS NULL OR image = '');
  UPDATE public.pitches SET image = 'https://images.unsplash.com/photo-1575361204480-aadea25e6e68?auto=format&fit=crop&q=80&w=1200'
  WHERE id = pitch_olim AND (image IS NULL OR image = '');
  UPDATE public.pitches SET image = 'https://images.unsplash.com/photo-1556056504-5c7696c4c28d?auto=format&fit=crop&q=80&w=1200'
  WHERE id = pitch_vip AND (image IS NULL OR image = '');

  -- ── 1) Var olan takımları bul (kullanıcının kurdukları) ──
  SELECT id INTO team_gala FROM public.teams WHERE name = 'Galaktikos'   AND captain_id = p01 LIMIT 1;
  SELECT id INTO team_sd   FROM public.teams WHERE name = 'sd'           AND captain_id = p01 LIMIT 1;
  SELECT id INTO team_dfc  FROM public.teams WHERE name = 'Doğrulama FC' AND captain_id = p01 LIMIT 1;

  -- Geçmiş maç hikâyesi tutarlı dursun: bugün kurulan test takımlarının
  -- kuruluş tarihi demo dünyasında 45 gün geriye alınır
  UPDATE public.teams SET created_at = timezone('utc', now()) - interval '45 days'
  WHERE id IN (team_gala, team_sd) AND created_at > timezone('utc', now()) - interval '3 days';

  -- ── 2) Yeni rakip takım: Karadeniz Fırtınası ──
  INSERT INTO public.teams (
    id, name, "shortName", color1, color2, crest_config, format,
    visibility, is_recruiting, city, captain, captain_id, captains,
    wins, draws, losses, created_at
  )
  SELECT team_kf, 'Karadeniz Fırtınası', 'KFRT', '#1E6FD9', '#0A0E14',
         '{"type":"GENERATED","shape":"banner","pattern":"sash","symbol":"waves"}'::jsonb,
         '7v7', 'PUBLIC', true, 'Ordu',
         p08, p08, to_jsonb(array[p08::text]),
         1, 1, 1, timezone('utc', now()) - interval '40 days'
  WHERE NOT EXISTS (SELECT 1 FROM public.teams WHERE id = team_kf);

  -- ── 3) Kadro üyelikleri (gerçek team_members satırları) ──
  -- Karadeniz Fırtınası
  INSERT INTO public.team_members (team_id, user_id, is_active, role, jersey_number, position, joined_at)
  SELECT team_kf, v.uid, true, v.role, v.jersey, v.pos,
         timezone('utc', now()) - (v.d || ' days')::interval
  FROM (VALUES
    (p08, 'CAPTAIN', 10, 'FWD', 40),
    (p12, 'ADMIN',    4, 'DEF', 38),
    (p02, 'MEMBER',   7, 'MID', 36),
    (p10, 'MEMBER',  11, 'FWD', 35),
    (p13, 'MEMBER',   6, 'MID', 30),
    (p14, 'MEMBER',   3, 'DEF', 28),
    (p15, 'MEMBER',   9, 'FWD', 21),
    (k3,  'MEMBER',   1, 'GK',  33)
  ) AS v(uid, role, jersey, pos, d)
  ON CONFLICT (team_id, user_id) DO NOTHING;

  -- Galaktikos (kaptan Emre zaten üye)
  IF team_gala IS NOT NULL THEN
    INSERT INTO public.team_members (team_id, user_id, is_active, role, jersey_number, position, joined_at)
    SELECT team_gala, v.uid, true, v.role, v.jersey, v.pos,
           timezone('utc', now()) - (v.d || ' days')::interval
    FROM (VALUES
      (p03, 'ADMIN',   8, 'MID', 41),
      (p05, 'MEMBER',  5, 'DEF', 39),
      (p07, 'MEMBER',  7, 'MID', 37),
      (p09, 'MEMBER',  9, 'FWD', 34),
      (p11, 'MEMBER', 11, 'FWD', 29),
      (k1,  'MEMBER',  1, 'GK',  42)
    ) AS v(uid, role, jersey, pos, d)
    ON CONFLICT (team_id, user_id) DO NOTHING;
    UPDATE public.teams SET wins = greatest(wins, 1), draws = greatest(coalesce(draws,0), 1), losses = greatest(losses, 1)
    WHERE id = team_gala;
  END IF;

  -- sd
  IF team_sd IS NOT NULL THEN
    INSERT INTO public.team_members (team_id, user_id, is_active, role, jersey_number, position, joined_at)
    SELECT team_sd, v.uid, true, 'MEMBER', v.jersey, v.pos,
           timezone('utc', now()) - (v.d || ' days')::interval
    FROM (VALUES
      (p04,  4, 'DEF', 25),
      (p06,  6, 'MID', 24)
    ) AS v(uid, jersey, pos, d)
    ON CONFLICT (team_id, user_id) DO NOTHING;
  END IF;

  -- Doğrulama FC (Emre + Burak zaten içeride)
  IF team_dfc IS NOT NULL THEN
    INSERT INTO public.team_members (team_id, user_id, is_active, role, jersey_number, position, joined_at)
    SELECT team_dfc, v.uid, true, 'MEMBER', v.jersey, v.pos, timezone('utc', now())
    FROM (VALUES
      (p05, 8, 'MID'),
      (k2,  1, 'GK')
    ) AS v(uid, jersey, pos)
    ON CONFLICT (team_id, user_id) DO NOTHING;
  END IF;

  -- ── 4) Tamamlanmış takım maçları (Galaktikos × Karadeniz Fırtınası) ──
  -- Slot deseni: occupant = sosyal sayaçların kanonik anahtarı;
  -- userId eski lobi bileşenleri için ikili yazılır.
  IF team_gala IS NOT NULL THEN
    INSERT INTO public.matches (
      id, title, location, date, "time", status, format, duration, gender, "ageGroup",
      price, difficulty, badges, "missingPositions", visibility, "isDemo", is_successful,
      "creatorId", pitch_id, "homeTeamId", "awayTeamId", "homeScore", "awayScore",
      "scoreEnteredAt", slots, "awaySlots", created_at
    )
    SELECT * FROM (VALUES
      (m101, 'Galaktikos vs Karadeniz Fırtınası', 'Capo Arena, Altınordu / Ordu',
       '28.06.2026', '21:00', 'COMPLETED', '7v7', '60 Dakika', 'Karma', 'Tümü',
       150::numeric, 'Taktiksel', '["7v7"]'::jsonb, '[]'::jsonb, 'OPEN', false, true,
       p01, pitch_capo, team_gala, team_kf, 3, 2,
       timezone('utc', now()) - interval '9 days',
       jsonb_build_array(
         jsonb_build_object('id','h1','status','TAKEN','userId',k1::text,'occupant',k1::text),
         jsonb_build_object('id','h2','status','TAKEN','userId',p01::text,'occupant',p01::text),
         jsonb_build_object('id','h3','status','TAKEN','userId',p03::text,'occupant',p03::text),
         jsonb_build_object('id','h4','status','TAKEN','userId',p05::text,'occupant',p05::text),
         jsonb_build_object('id','h5','status','TAKEN','userId',p07::text,'occupant',p07::text),
         jsonb_build_object('id','h6','status','TAKEN','userId',p09::text,'occupant',p09::text),
         jsonb_build_object('id','h7','status','TAKEN','userId',p11::text,'occupant',p11::text)),
       jsonb_build_array(
         jsonb_build_object('id','a1','status','TAKEN','userId',k3::text,'occupant',k3::text),
         jsonb_build_object('id','a2','status','TAKEN','userId',p08::text,'occupant',p08::text),
         jsonb_build_object('id','a3','status','TAKEN','userId',p12::text,'occupant',p12::text),
         jsonb_build_object('id','a4','status','TAKEN','userId',p02::text,'occupant',p02::text),
         jsonb_build_object('id','a5','status','TAKEN','userId',p10::text,'occupant',p10::text),
         jsonb_build_object('id','a6','status','TAKEN','userId',p13::text,'occupant',p13::text),
         jsonb_build_object('id','a7','status','TAKEN','userId',p14::text,'occupant',p14::text)),
       timezone('utc', now()) - interval '9 days'),
      (m102, 'Karadeniz Fırtınası vs Galaktikos', 'Olimpiyat, Altınordu / Ordu',
       '21.06.2026', '20:00', 'COMPLETED', '7v7', '60 Dakika', 'Karma', 'Tümü',
       150::numeric, 'Taktiksel', '["7v7"]'::jsonb, '[]'::jsonb, 'OPEN', false, true,
       p08, pitch_olim, team_kf, team_gala, 1, 1,
       timezone('utc', now()) - interval '16 days',
       jsonb_build_array(
         jsonb_build_object('id','h1','status','TAKEN','userId',k3::text,'occupant',k3::text),
         jsonb_build_object('id','h2','status','TAKEN','userId',p08::text,'occupant',p08::text),
         jsonb_build_object('id','h3','status','TAKEN','userId',p12::text,'occupant',p12::text),
         jsonb_build_object('id','h4','status','TAKEN','userId',p10::text,'occupant',p10::text),
         jsonb_build_object('id','h5','status','TAKEN','userId',p14::text,'occupant',p14::text),
         jsonb_build_object('id','h6','status','TAKEN','userId',p15::text,'occupant',p15::text),
         jsonb_build_object('id','h7','status','TAKEN','userId',p13::text,'occupant',p13::text)),
       jsonb_build_array(
         jsonb_build_object('id','a1','status','TAKEN','userId',k1::text,'occupant',k1::text),
         jsonb_build_object('id','a2','status','TAKEN','userId',p01::text,'occupant',p01::text),
         jsonb_build_object('id','a3','status','TAKEN','userId',p03::text,'occupant',p03::text),
         jsonb_build_object('id','a4','status','TAKEN','userId',p05::text,'occupant',p05::text),
         jsonb_build_object('id','a5','status','TAKEN','userId',p07::text,'occupant',p07::text),
         jsonb_build_object('id','a6','status','TAKEN','userId',p09::text,'occupant',p09::text),
         jsonb_build_object('id','a7','status','TAKEN','userId',p11::text,'occupant',p11::text)),
       timezone('utc', now()) - interval '16 days'),
      (m103, 'Karadeniz Fırtınası vs Galaktikos', 'VIP Arena, Altınordu / Ordu',
       '05.07.2026', '22:00', 'COMPLETED', '7v7', '60 Dakika', 'Karma', 'Tümü',
       180::numeric, 'Ciddi', '["7v7"]'::jsonb, '[]'::jsonb, 'OPEN', false, true,
       p08, pitch_vip, team_kf, team_gala, 2, 0,
       timezone('utc', now()) - interval '2 days',
       jsonb_build_array(
         jsonb_build_object('id','h1','status','TAKEN','userId',k3::text,'occupant',k3::text),
         jsonb_build_object('id','h2','status','TAKEN','userId',p08::text,'occupant',p08::text),
         jsonb_build_object('id','h3','status','TAKEN','userId',p12::text,'occupant',p12::text),
         jsonb_build_object('id','h4','status','TAKEN','userId',p02::text,'occupant',p02::text),
         jsonb_build_object('id','h5','status','TAKEN','userId',p10::text,'occupant',p10::text),
         jsonb_build_object('id','h6','status','TAKEN','userId',p14::text,'occupant',p14::text),
         jsonb_build_object('id','h7','status','TAKEN','userId',p15::text,'occupant',p15::text)),
       jsonb_build_array(
         jsonb_build_object('id','a1','status','TAKEN','userId',k1::text,'occupant',k1::text),
         jsonb_build_object('id','a2','status','TAKEN','userId',p01::text,'occupant',p01::text),
         jsonb_build_object('id','a3','status','TAKEN','userId',p05::text,'occupant',p05::text),
         jsonb_build_object('id','a4','status','TAKEN','userId',p07::text,'occupant',p07::text),
         jsonb_build_object('id','a5','status','TAKEN','userId',p09::text,'occupant',p09::text),
         jsonb_build_object('id','a6','status','TAKEN','userId',p11::text,'occupant',p11::text),
         jsonb_build_object('id','a7','status','TAKEN','userId',p03::text,'occupant',p03::text)),
       timezone('utc', now()) - interval '2 days')
    ) AS v
    WHERE NOT EXISTS (SELECT 1 FROM public.matches WHERE id = (v.column1)::uuid);

    -- Yaklaşan takım maçı: takım kartlarında "sıradaki maç" canlanır
    INSERT INTO public.matches (
      id, title, location, date, "time", status, format, duration, gender, "ageGroup",
      price, difficulty, badges, "missingPositions", visibility, "isDemo",
      "creatorId", pitch_id, "homeTeamId", "awayTeamId", slots, "awaySlots", created_at
    )
    SELECT m104, 'Galaktikos vs Karadeniz Fırtınası', 'Capo Arena, Altınordu / Ordu',
       '12.07.2026', '21:00', 'CONFIRMED', '7v7', '60 Dakika', 'Karma', 'Tümü',
       150, 'Taktiksel', '["7v7"]'::jsonb, '[]'::jsonb, 'OPEN', false,
       p01, pitch_capo, team_gala, team_kf,
       jsonb_build_array(
         jsonb_build_object('id','h1','status','TAKEN','userId',k1::text,'occupant',k1::text),
         jsonb_build_object('id','h2','status','TAKEN','userId',p01::text,'occupant',p01::text),
         jsonb_build_object('id','h3','status','TAKEN','userId',p03::text,'occupant',p03::text),
         jsonb_build_object('id','h4','status','TAKEN','userId',p05::text,'occupant',p05::text),
         jsonb_build_object('id','h5','status','OPEN'),
         jsonb_build_object('id','h6','status','OPEN'),
         jsonb_build_object('id','h7','status','OPEN')),
       jsonb_build_array(
         jsonb_build_object('id','a1','status','TAKEN','userId',k3::text,'occupant',k3::text),
         jsonb_build_object('id','a2','status','TAKEN','userId',p08::text,'occupant',p08::text),
         jsonb_build_object('id','a3','status','TAKEN','userId',p12::text,'occupant',p12::text),
         jsonb_build_object('id','a4','status','OPEN'),
         jsonb_build_object('id','a5','status','OPEN'),
         jsonb_build_object('id','a6','status','OPEN'),
         jsonb_build_object('id','a7','status','OPEN')),
       timezone('utc', now())
    WHERE NOT EXISTS (SELECT 1 FROM public.matches WHERE id = m104);
  END IF;

  -- ── 5) Açık bireysel maçların slotlarına demo oyuncular ──
  -- VIP Arena demo maçı sahaya bağlı değildi → bağla (kart saha fotoğrafını
  -- otomatik alsın; tetikleyici pitch_id dolunca görseli yazar)
  UPDATE public.matches SET pitch_id = pitch_vip
  WHERE id = 'd0e51e00-0000-4000-8000-000000000003' AND pitch_id IS NULL;

  UPDATE public.matches SET slots = jsonb_build_array(
    jsonb_build_object('id','h1','status','TAKEN','userId',p01::text,'occupant',p01::text),
    jsonb_build_object('id','h2','status','TAKEN','userId',p02::text,'occupant',p02::text),
    jsonb_build_object('id','h3','status','TAKEN','userId',p03::text,'occupant',p03::text),
    jsonb_build_object('id','h4','status','TAKEN','userId',p05::text,'occupant',p05::text),
    jsonb_build_object('id','h5','status','TAKEN','userId',p07::text,'occupant',p07::text),
    jsonb_build_object('id','h6','status','OPEN'),
    jsonb_build_object('id','h7','status','OPEN'))
  WHERE id = 'd0e51e00-0000-4000-8000-000000000001' AND status = 'OPEN';

  UPDATE public.matches SET slots = jsonb_build_array(
    jsonb_build_object('id','h1','status','TAKEN','userId',p11::text,'occupant',p11::text),
    jsonb_build_object('id','h2','status','TAKEN','userId',p09::text,'occupant',p09::text),
    jsonb_build_object('id','h3','status','TAKEN','userId',p13::text,'occupant',p13::text),
    jsonb_build_object('id','h4','status','TAKEN','userId',p06::text,'occupant',p06::text),
    jsonb_build_object('id','h5','status','OPEN'),
    jsonb_build_object('id','h6','status','OPEN'),
    jsonb_build_object('id','h7','status','OPEN'))
  WHERE id = 'd0e51e00-0000-4000-8000-000000000002' AND status = 'OPEN';

  UPDATE public.matches SET slots = jsonb_build_array(
    jsonb_build_object('id','h1','status','TAKEN','userId',p13::text,'occupant',p13::text),
    jsonb_build_object('id','h2','status','TAKEN','userId',p14::text,'occupant',p14::text),
    jsonb_build_object('id','h3','status','TAKEN','userId',p15::text,'occupant',p15::text),
    jsonb_build_object('id','h4','status','OPEN'),
    jsonb_build_object('id','h5','status','OPEN'))
  WHERE id = 'd0e51e00-0000-4000-8000-000000000004' AND status = 'OPEN';

  -- ── 6) Arkadaşlık ağı (kabul edilmiş; "birlikte" sayacı gerçek maçlardan) ──
  INSERT INTO public.friendships (requester_id, addressee_id, status, created_at, responded_at, matches_together)
  SELECT v.a, v.b, 'ACCEPTED',
         timezone('utc', now()) - (v.d || ' days')::interval,
         timezone('utc', now()) - (v.d || ' days')::interval + interval '3 hours',
         public._count_matches_together(v.a, v.b)
  FROM (VALUES
    (p01, p02, 44), (p01, p03, 43), (p02, p03, 42),
    (p01, p04, 40), (p01, p06, 39), (p01, p07, 38), (p01, p11, 36), (p01, p13, 35),
    (p02, p04, 34), (p02, p05, 33), (p02, p08, 32), (p02, p10, 31),
    (p03, p05, 30), (p03, p07, 29), (p03, p09, 28), (p03, p12, 27),
    (p04, p06, 26), (p04, p10, 25),
    (p05, p07, 24), (p05, p11, 23),
    (p06, p08, 22), (p06, p12, 21),
    (p07, p09, 20), (p07, p13, 19),
    (p08, p10, 18), (p08, p14, 17),
    (p09, p11, 16), (p09, p15, 15),
    (p10, p12, 14),
    (p08, p12, 11),
    (p11, p13, 12),
    (p12, p14, 10),
    (p13, p15, 8),
    (p14, p15, 6),
    (k1,  p01, 41), (k1,  p08, 13)
  ) AS v(a, b, d)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.friendships f
    WHERE (f.requester_id = v.a AND f.addressee_id = v.b)
       OR (f.requester_id = v.b AND f.addressee_id = v.a)
  );

  -- Bekleyen istekler (İstekler sekmesi canlı görünsün)
  INSERT INTO public.friendships (requester_id, addressee_id, status, created_at)
  SELECT v.a, v.b, 'PENDING', timezone('utc', now()) - (v.d || ' hours')::interval
  FROM (VALUES (p05, p01, 26), (p09, p01, 7), (p15, p02, 3)) AS v(a, b, d)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.friendships f
    WHERE (f.requester_id = v.a AND f.addressee_id = v.b)
       OR (f.requester_id = v.b AND f.addressee_id = v.a)
  );

  -- Var olan arkadaşlıkların "birlikte" sayacını gerçek maçlardan tazele
  UPDATE public.friendships
  SET matches_together = public._count_matches_together(requester_id, addressee_id)
  WHERE status = 'ACCEPTED';

  -- ── 7) Favoriler ──
  INSERT INTO public.friend_prefs (owner_id, friend_id, is_favorite)
  SELECT v.o, v.f, true
  FROM (VALUES (p01, p02), (p01, p03), (p02, p01), (p08, p12)) AS v(o, f)
  ON CONFLICT (owner_id, friend_id) DO UPDATE SET is_favorite = true;

  -- ── 8) Görsel geriye doldurma: saha fotoğrafları artık mevcut ──
  UPDATE public.matches
  SET image = public._pitch_image(pitch_id)
  WHERE image_auto AND (image IS NULL OR image = '') AND pitch_id IS NOT NULL;
END $$;
