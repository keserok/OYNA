-- ============================================================================
-- TEK MAÇ LOBİSİ — TEMİZ BAŞLANGIÇ + 6'LI DEMO VİTRİN SETİ
--
-- Kullanıcı kararı (geri bildirim turu): TÜM mevcut maçlar silinir (eski yapı
-- kalıntısı sıfırlanır), yerine yeni slot makinesiyle kurulmuş 6 demo maç gelir:
--   M1  7v7 · 150₺ · YARI DOLU (SELF + ASSIGNED oyuncular avatarla, 1 REZERVE "DOLU")
--   M2  7v7 · 180₺ · boş
--   M3  5v5 · ÜCRETSİZ · boş (kurucu: Emre Kaya)
--   M4  8v8 · 120₺ · boş
--   M5  7v7 · ÖZEL (kod: OYNA26) · boş
--   M6  7v7 · OYNA platform maçı (admin_create_match__core ile)
-- Tarihler çalıştırma gününe göre +1..+6 gün; starts_at üretilir (vitrin şartı).
-- İdempotent: her koşuda tüm maçları silip seti yeniden kurar.
-- ============================================================================

DO $seed$
DECLARE
  r record;
  v_pitch uuid; v_pitch_name text; v_pitch_district text;
  u1 uuid; u2 uuid; u3 uuid; u4 uuid; u5 uuid; u7 uuid;
  adm uuid;
  mid uuid;
  v_slots jsonb; v_away jsonb;
BEGIN
  -- ── 0) TEMİZ BAŞLANGIÇ: maçlara bağlı tüm satırlar + maçlar ──
  FOR r IN
    SELECT c.conrelid::regclass::text AS tbl,
           (SELECT attname FROM pg_attribute WHERE attrelid = c.conrelid AND attnum = c.conkey[1]) AS col
    FROM pg_constraint c
    WHERE c.confrelid = 'public.matches'::regclass AND c.contype = 'f'
  LOOP
    EXECUTE format('DELETE FROM %s WHERE %I IS NOT NULL', r.tbl, r.col);
  END LOOP;
  DELETE FROM public.matches;

  -- ── 1) Kaynaklar ──
  SELECT id, name, district INTO v_pitch, v_pitch_name, v_pitch_district
  FROM public.pitches WHERE latitude IS NOT NULL AND longitude IS NOT NULL LIMIT 1;

  SELECT p.id INTO u1 FROM public.profiles p JOIN auth.users u ON u.id=p.id WHERE u.email='oyuncu01@oyna.app'; -- Emre Kaya
  SELECT p.id INTO u2 FROM public.profiles p JOIN auth.users u ON u.id=p.id WHERE u.email='oyuncu02@oyna.app'; -- Burak Demir
  SELECT p.id INTO u3 FROM public.profiles p JOIN auth.users u ON u.id=p.id WHERE u.email='oyuncu03@oyna.app'; -- Mert Yıldız
  SELECT p.id INTO u4 FROM public.profiles p JOIN auth.users u ON u.id=p.id WHERE u.email='oyuncu04@oyna.app'; -- Can Aydın
  SELECT p.id INTO u5 FROM public.profiles p JOIN auth.users u ON u.id=p.id WHERE u.email='oyuncu05@oyna.app'; -- Ozan Şahin
  SELECT p.id INTO u7 FROM public.profiles p JOIN auth.users u ON u.id=p.id WHERE u.email='oyuncu07@oyna.app'; -- Kaan Çelik
  SELECT p.id INTO adm FROM public.profiles p WHERE public.is_platform_admin(p.id) LIMIT 1;

  -- ── M1: 7v7 · 150₺ · YARI DOLU ──
  mid := gen_random_uuid();
  v_slots := public._default_formation_slots('7v7', 'slot');
  v_away  := public._default_formation_slots('7v7', 'away');
  -- slot_0 (GK): Ozan kendini ekledi (SELF)
  v_slots := (SELECT jsonb_agg(CASE WHEN s->>'id'='slot_0'
      THEN s || jsonb_build_object('status','TAKEN','purchasedBy',u5::text,'occupant',u5::text,
           'assignmentStatus','SELF','player', public._profile_player_json(u5, s->>'role'))
      ELSE s END) FROM jsonb_array_elements(v_slots) s);
  -- slot_4 (MID): kurucu Burak kendini ekledi (SELF)
  v_slots := (SELECT jsonb_agg(CASE WHEN s->>'id'='slot_4'
      THEN s || jsonb_build_object('status','TAKEN','purchasedBy',u2::text,'occupant',u2::text,
           'assignmentStatus','SELF','player', public._profile_player_json(u2, s->>'role'))
      ELSE s END) FROM jsonb_array_elements(v_slots) s);
  -- slot_6 (FWD): Burak satın aldı, arkadaşı Emre'yi atadı (ASSIGNED — avatarla görünür)
  v_slots := (SELECT jsonb_agg(CASE WHEN s->>'id'='slot_6'
      THEN s || jsonb_build_object('status','TAKEN','purchasedBy',u2::text,'occupant',u1::text,
           'assignmentStatus','ASSIGNED','player', public._profile_player_json(u1, s->>'role'))
      ELSE s END) FROM jsonb_array_elements(v_slots) s);
  -- slot_2 (DEF): Can satın aldı, HENÜZ kimseyi atamadı (REZERVE → "DOLU" örneği)
  v_slots := (SELECT jsonb_agg(CASE WHEN s->>'id'='slot_2'
      THEN s || jsonb_build_object('status','TAKEN','purchasedBy',u4::text,'assignmentStatus','RESERVED')
      ELSE s END) FROM jsonb_array_elements(v_slots) s);
  -- away_4 (MID): Mert deplasmanda kendini ekledi (SELF)
  v_away := (SELECT jsonb_agg(CASE WHEN s->>'id'='away_4'
      THEN s || jsonb_build_object('status','TAKEN','purchasedBy',u3::text,'occupant',u3::text,
           'assignmentStatus','SELF','player', public._profile_player_json(u3, s->>'role'))
      ELSE s END) FROM jsonb_array_elements(v_away) s);

  INSERT INTO public.matches (id, title, location, date, "time", price, difficulty, status, format,
    duration, gender, "ageGroup", "minRating", badges, "missingPositions",
    slots, "awaySlots", "creatorId", captain_id, pitch_id, "isDemo", visibility, starts_at, image)
  VALUES (mid, 'Perşembe Klasiği', v_pitch_district, to_char(current_date+1,'YYYY-MM-DD'), '21:00',
    150, 'Taktiksel', 'ACTIVE', '7v7', '60 Dakika', 'Karma', '18-35', 0, '["7v7"]'::jsonb, '[]'::jsonb,
    v_slots, v_away, u2, u2, v_pitch, true, 'OPEN',
    ((current_date+1) + time '21:00')::timestamptz,
    'https://images.unsplash.com/photo-1575361204480-aadea2559ee2?q=80&w=600');

  INSERT INTO public.match_participants (match_id, user_id, role, status, is_buyer, bought_slots) VALUES
    (mid, u2, 'home', 'creator', true, 2),
    (mid, u5, 'home', 'confirmed', true, 1),
    (mid, u4, 'home', 'confirmed', true, 1),
    (mid, u1, 'home', 'confirmed', false, 0),
    (mid, u3, 'away', 'confirmed', true, 1)
  ON CONFLICT (match_id, user_id) DO NOTHING;

  -- ── M2: 7v7 · 180₺ · boş ──
  INSERT INTO public.matches (id, title, location, date, "time", price, difficulty, status, format,
    duration, gender, "ageGroup", "minRating", badges, "missingPositions",
    slots, "awaySlots", "creatorId", captain_id, pitch_id, "isDemo", visibility, starts_at, image)
  VALUES (gen_random_uuid(), 'Cumartesi Derbisi', v_pitch_district, to_char(current_date+3,'YYYY-MM-DD'), '20:00',
    180, 'Ciddi', 'ACTIVE', '7v7', '60 Dakika', 'Erkek', '18-35', 0, '["7v7"]'::jsonb, '[]'::jsonb,
    public._default_formation_slots('7v7','slot'), public._default_formation_slots('7v7','away'),
    u3, u3, v_pitch, true, 'OPEN', ((current_date+3) + time '20:00')::timestamptz,
    'https://images.unsplash.com/photo-1529900748604-07564a03e7a6?q=80&w=600');

  -- ── M3: 5v5 · ÜCRETSİZ · kurucu Emre Kaya ──
  INSERT INTO public.matches (id, title, location, date, "time", price, difficulty, status, format,
    duration, gender, "ageGroup", "minRating", badges, "missingPositions",
    slots, "awaySlots", "creatorId", captain_id, pitch_id, "isDemo", visibility, starts_at, image)
  VALUES (gen_random_uuid(), 'Ücretsiz 5v5 Antrenman', v_pitch_district, to_char(current_date+2,'YYYY-MM-DD'), '19:00',
    0, 'Rahat', 'ACTIVE', '5v5', '60 Dakika', 'Karma', 'Tümü', 0, '["5v5"]'::jsonb, '[]'::jsonb,
    public._default_formation_slots('5v5','slot'), public._default_formation_slots('5v5','away'),
    u1, u1, v_pitch, true, 'OPEN', ((current_date+2) + time '19:00')::timestamptz,
    'https://images.unsplash.com/photo-1543326727-cf6c39e8f84c?q=80&w=600');
  INSERT INTO public.match_participants (match_id, user_id, role, status)
  SELECT m.id, u1, 'home', 'creator' FROM public.matches m WHERE m.title='Ücretsiz 5v5 Antrenman'
  ON CONFLICT (match_id, user_id) DO NOTHING;

  -- ── M4: 8v8 · 120₺ · boş ──
  INSERT INTO public.matches (id, title, location, date, "time", price, difficulty, status, format,
    duration, gender, "ageGroup", "minRating", badges, "missingPositions",
    slots, "awaySlots", "creatorId", captain_id, pitch_id, "isDemo", visibility, starts_at, image)
  VALUES (gen_random_uuid(), '8v8 Akşam Maçı', v_pitch_district, to_char(current_date+4,'YYYY-MM-DD'), '22:00',
    120, 'Taktiksel', 'ACTIVE', '8v8', '90 Dakika', 'Karma', '18-35', 0, '["8v8"]'::jsonb, '[]'::jsonb,
    public._default_formation_slots('8v8','slot'), public._default_formation_slots('8v8','away'),
    u7, u7, v_pitch, true, 'OPEN', ((current_date+4) + time '22:00')::timestamptz,
    'https://images.unsplash.com/photo-1574629810360-7efbbe195018?q=80&w=600');

  -- ── M5: 7v7 · ÖZEL (kod: OYNA26) ──
  mid := gen_random_uuid();
  INSERT INTO public.matches (id, title, location, date, "time", price, difficulty, status, format,
    duration, gender, "ageGroup", "minRating", badges, "missingPositions",
    slots, "awaySlots", "creatorId", captain_id, pitch_id, "isDemo", visibility, starts_at, image)
  VALUES (mid, 'Özel Turnuva Maçı', v_pitch_district, to_char(current_date+5,'YYYY-MM-DD'), '21:00',
    160, 'Ciddi', 'ACTIVE', '7v7', '60 Dakika', 'Karma', '18-35', 0, '["7v7"]'::jsonb, '[]'::jsonb,
    public._default_formation_slots('7v7','slot'), public._default_formation_slots('7v7','away'),
    u5, u5, v_pitch, true, 'PRIVATE', ((current_date+5) + time '21:00')::timestamptz,
    'https://images.unsplash.com/photo-1518604666860-9ed391f76460?q=80&w=600');
  INSERT INTO public.match_private_codes (match_id, code) VALUES (mid, 'OYNA26')
  ON CONFLICT (match_id) DO UPDATE SET code = EXCLUDED.code;

  -- ── M6: OYNA platform maçı — GERÇEK admin RPC'siyle (tam sistem yolu) ──
  IF adm IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', adm, 'role','authenticated')::text, true);
    mid := public.admin_create_match__core(jsonb_build_object(
      'title', 'OYNA Çarşamba Ligi', 'location', v_pitch_district,
      'date', to_char(current_date+6,'YYYY-MM-DD'), 'time', '20:00',
      'price', 100, 'format', '7v7', 'difficulty', 'Taktiksel',
      'duration', '60 Dakika', 'gender', 'Karma', 'ageGroup', '18-35',
      'pitch_id', v_pitch::text, 'creatorId', adm::text, 'isDemo', true));
  END IF;
END $seed$;

-- Doğrulama özeti
SELECT m.title, m.format, m.price, m.visibility, m.is_platform,
       (SELECT count(*) FROM jsonb_array_elements(m.slots) s WHERE s->>'status'='OPEN')
     + (SELECT count(*) FROM jsonb_array_elements(m."awaySlots") s WHERE s->>'status'='OPEN') AS acik_slot,
       (SELECT count(*) FROM jsonb_array_elements(m.slots) s WHERE s ? 'player') AS oyunculu,
       (SELECT count(*) FROM jsonb_array_elements(m.slots) s
         WHERE s->>'status'='TAKEN' AND NOT (s ? 'player')) AS rezerve_dolu
FROM public.matches m ORDER BY m.starts_at;
