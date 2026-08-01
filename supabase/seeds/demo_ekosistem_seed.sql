-- ============================================================================
-- DEMO EKOSİSTEMİ — bakiyeler, cüzdan hareketleri, oynanmış ve oynanacak maçlar
-- ============================================================================
--
-- AMAÇ
--   Uygulamanın TÜM sistemini (cüzdan, maç yaşam döngüsü, skor, geçmiş, saha
--   sahibi kazancı, kaleci/hakem hakedişi) demo hesaplarla uçtan uca test
--   edilebilir hâle getirmek. Mağaza öncesi AAB denemelerinde ekranların boş
--   değil GERÇEKÇİ veriyle açılması hedeflenir.
--
-- KAPSAM — YALNIZ DEMO
--   Sadece `@oyna.app` uzantılı 29 demo hesabı ve `isDemo = true` maçlar
--   etkilenir. Gerçek kullanıcıya, gerçek maça ve saha kataloğuna DOKUNULMAZ.
--
-- DEFTER TUTARLILIĞI (en önemli madde)
--   Bakiye "eldeğmemiş bir sayı" olarak yazılmaz. Her hesabın bakiyesi, o
--   hesap için yazılan `wallet_transactions` satırlarının TOPLAMINA eşittir.
--   Böylece admin panelindeki finans raporları da tutarlı okur. Roller
--   birbirinden farklı hareket tipleri üretir:
--     oyuncu       → TOP_UP (cüzdan yükleme) + MATCH_FEE (maç ücreti)
--     saha sahibi  → BOOKING_EARNING (rezervasyon kazancı)
--     kaleci/hakem → SERVICE_EARNING (görev hakedişi)
--
-- İDEMPOTENT
--   Her koşuda kendi ürettiği kayıtları `meta->>'seed' = 'demo_ekosistem'`
--   etiketinden bulup siler ve yeniden kurar. İki kez çalıştırmak veriyi
--   ikiye katlamaz.
--
-- GERİ ALMA
--   `supabase/seeds/demo_clean_start_purge.sql` tüm demo izini siler.
-- ============================================================================

DO $seed$
DECLARE
  r          record;
  v_pitch    uuid;
  v_district text;
  mid        uuid;
  v_slots    jsonb;
  v_away     jsonb;
  v_uid      uuid;
  i          int;
  v_gun      int;
  v_ev       int;
  v_dep      int;
  v_saat     time;
BEGIN
  -- ══ 0) ÖNCEKİ KOŞUMU GERİ AL (idempotentlik) ══════════════════════════════
  DELETE FROM public.wallet_transactions
   WHERE meta->>'seed' = 'demo_ekosistem';

  -- Bu seed'in ürettiği maçlar (etiketli başlık öneki) ve bağlı satırları
  FOR r IN
    SELECT c.conrelid::regclass::text AS tbl,
           (SELECT attname FROM pg_attribute
             WHERE attrelid = c.conrelid AND attnum = c.conkey[1]) AS col
      FROM pg_constraint c
     WHERE c.confrelid = 'public.matches'::regclass AND c.contype = 'f'
  LOOP
    EXECUTE format(
      'DELETE FROM %s WHERE %I IN (SELECT id FROM public.matches WHERE title LIKE %L)',
      r.tbl, r.col, '[EKO]%');
  END LOOP;
  DELETE FROM public.matches WHERE title LIKE '[EKO]%';

  -- ══ 1) KAYNAKLAR ══════════════════════════════════════════════════════════
  SELECT p.id, p.name, p.district, p.owner_id
    INTO v_pitch, v_pitch_name, v_district, v_owner
    FROM public.pitches p
   WHERE p.latitude IS NOT NULL AND p.longitude IS NOT NULL
   ORDER BY p.created_at
   LIMIT 1;

  IF v_pitch IS NULL THEN
    RAISE EXCEPTION 'Koordinatlı saha bulunamadı — önce saha seed''i çalışmalı.';
  END IF;

  -- ══ 2) BAKİYELER + CÜZDAN HAREKETLERİ ═════════════════════════════════════
  -- Oyuncular: cüzdan yüklemesi yapmış, bir kısmını maç ücretine harcamış.
  FOR i IN 1..20 LOOP
    SELECT p.id INTO v_uid
      FROM public.profiles p JOIN auth.users u ON u.id = p.id
     WHERE u.email = 'oyuncu' || lpad(i::text, 2, '0') || '@oyna.app';
    CONTINUE WHEN v_uid IS NULL;

    -- Yükleme: 800–2700₺ arası, hesaba göre belirli (rastgele değil → tekrar
    -- çalıştırınca aynı sonuç).
    INSERT INTO public.wallet_transactions
      (user_id, amount, type, balance_type, status, reference_type, description, created_at, meta)
    VALUES
      (v_uid, 800 + (i * 100), 'TOP_UP', 'TOP_UP', 'COMPLETED', 'MANUAL',
       'Cüzdan yükleme (demo)', now() - ((30 - i) || ' days')::interval,
       jsonb_build_object('seed', 'demo_ekosistem'));

    -- Harcama: maç ücreti (ilk 12 oyuncu maç oynamış sayılır)
    IF i <= 12 THEN
      INSERT INTO public.wallet_transactions
        (user_id, amount, type, balance_type, status, reference_type, description, created_at, meta)
      VALUES
        (v_uid, -(150 + (i % 4) * 50), 'MATCH_FEE', 'TOP_UP', 'COMPLETED', 'MATCH',
         'Maç ücreti (demo)', now() - ((20 - i) || ' days')::interval,
         jsonb_build_object('seed', 'demo_ekosistem'));
    END IF;
  END LOOP;

  -- Saha sahipleri: rezervasyon kazancı
  FOR i IN 1..4 LOOP
    SELECT p.id INTO v_uid
      FROM public.profiles p JOIN auth.users u ON u.id = p.id
     WHERE u.email = 'saha' || i || '@oyna.app';
    CONTINUE WHEN v_uid IS NULL;
    INSERT INTO public.wallet_transactions
      (user_id, amount, type, balance_type, status, reference_type, description, created_at, meta)
    VALUES
      (v_uid, 4000 + (i * 750), 'BOOKING_EARNING', 'EARNINGS', 'COMPLETED', 'BOOKING',
       'Rezervasyon kazancı (demo)', now() - ((10 + i) || ' days')::interval,
       jsonb_build_object('seed', 'demo_ekosistem'));
  END LOOP;

  -- Kaleciler ve hakemler: görev hakedişi
  FOR i IN 1..3 LOOP
    SELECT p.id INTO v_uid
      FROM public.profiles p JOIN auth.users u ON u.id = p.id
     WHERE u.email = 'kaleci' || i || '@oyna.app';
    CONTINUE WHEN v_uid IS NULL;
    INSERT INTO public.wallet_transactions
      (user_id, amount, type, balance_type, status, reference_type, description, created_at, meta)
    VALUES
      (v_uid, 1500 + (i * 300), 'SERVICE_EARNING', 'EARNINGS', 'COMPLETED', 'MATCH',
       'Kalecilik hakedişi (demo)', now() - ((6 + i) || ' days')::interval,
       jsonb_build_object('seed', 'demo_ekosistem'));
  END LOOP;

  FOR i IN 1..2 LOOP
    SELECT p.id INTO v_uid
      FROM public.profiles p JOIN auth.users u ON u.id = p.id
     WHERE u.email = 'hakem' || i || '@oyna.app';
    CONTINUE WHEN v_uid IS NULL;
    INSERT INTO public.wallet_transactions
      (user_id, amount, type, balance_type, status, reference_type, description, created_at, meta)
    VALUES
      (v_uid, 1100 + (i * 250), 'SERVICE_EARNING', 'EARNINGS', 'COMPLETED', 'MATCH',
       'Hakemlik hakedişi (demo)', now() - ((4 + i) || ' days')::interval,
       jsonb_build_object('seed', 'demo_ekosistem'));
  END LOOP;

  -- Bakiyeyi DEFTERDEN türet — elle sayı yazılmaz, toplam neyse o.
  UPDATE public.profiles p
     SET wallet_balance = COALESCE((
           SELECT SUM(w.amount) FROM public.wallet_transactions w
            WHERE w.user_id = p.id AND w.status = 'COMPLETED'), 0)
   WHERE p.email LIKE '%@oyna.app';

  -- ══ 3) OYNANMIŞ MAÇLAR (geçmiş, skoru girilmiş) ═══════════════════════════
  FOR i IN 1..4 LOOP
    v_gun := i * 4;                         -- 4, 8, 12, 16 gün önce
    v_ev  := 2 + (i % 4);
    v_dep := 1 + ((i + 2) % 4);
    mid   := gen_random_uuid();

    v_slots := public._default_formation_slots('7v7', 'slot');
    v_away  := public._default_formation_slots('7v7', 'away');

    -- Kadroları demo oyuncularla doldur (ev: 01-07, deplasman: 08-14)
    -- ORDER BY ŞART: jsonb_agg sırayı garanti etmez, kadro dizilişi bozulur.
    -- Oyuncu bulunamazsa yer BOŞ kalır (satır düşmez) — kadro eksilmez.
    SELECT jsonb_agg(
             CASE WHEN s.ord <= 7 AND pl.id IS NOT NULL THEN
               s.val || jsonb_build_object(
                 'status','TAKEN','assignmentStatus','SELF',
                 'purchasedBy', pl.id::text, 'occupant', pl.id::text,
                 'player', public._profile_player_json(pl.id, s.val->>'role'))
             ELSE s.val END
             ORDER BY s.ord)
      INTO v_slots
      FROM (SELECT value AS val, row_number() OVER () AS ord
              FROM jsonb_array_elements(v_slots)) s
      LEFT JOIN LATERAL (
        SELECT p.id FROM public.profiles p JOIN auth.users u ON u.id = p.id
         WHERE u.email = 'oyuncu' || lpad(s.ord::text, 2, '0') || '@oyna.app'
      ) pl ON true;

    INSERT INTO public.matches (
      id, title, location, date, "time", price, difficulty, status, format,
      duration, gender, "ageGroup", "minRating", badges, "missingPositions",
      slots, "awaySlots", "creatorId", captain_id, pitch_id, "isDemo",
      visibility, starts_at, image, "homeScore", "awayScore", score_status,
      "scoreEnteredAt", is_successful)
    SELECT
      mid,
      '[EKO] Geçmiş Maç ' || i,
      v_district,
      to_char(current_date - v_gun, 'YYYY-MM-DD'),
      '20:00',
      150, 'Taktiksel', 'COMPLETED', '7v7',
      '60 Dakika', 'Karma', '18-35', 0, '["7v7"]'::jsonb, '[]'::jsonb,
      v_slots, v_away,
      pl.id, pl.id, v_pitch, true,
      'OPEN',
      ((current_date - v_gun) + time '20:00') AT TIME ZONE 'Europe/Istanbul',
      'https://images.unsplash.com/photo-1575361204480-aadea2559ee2?q=80&w=600',
      v_ev, v_dep, 'ENTERED',
      ((current_date - v_gun) + time '22:00') AT TIME ZONE 'Europe/Istanbul',
      true
    FROM public.profiles pl JOIN auth.users u ON u.id = pl.id
    WHERE u.email = 'oyuncu01@oyna.app';

    -- Katılımcılar: ilk 7 oyuncu ev sahibi
    INSERT INTO public.match_participants (match_id, user_id, role, status, is_buyer, bought_slots)
    SELECT mid, p.id, 'home',
           CASE WHEN u.email = 'oyuncu01@oyna.app' THEN 'creator' ELSE 'confirmed' END,
           true, 1
      FROM public.profiles p JOIN auth.users u ON u.id = p.id
     WHERE u.email IN ('oyuncu01@oyna.app','oyuncu02@oyna.app','oyuncu03@oyna.app',
                       'oyuncu04@oyna.app','oyuncu05@oyna.app','oyuncu06@oyna.app',
                       'oyuncu07@oyna.app')
    ON CONFLICT (match_id, user_id) DO NOTHING;
  END LOOP;

  -- ══ 4) OYNANACAK MAÇLAR (gelecek, kayıt açık) ═════════════════════════════
  FOR i IN 1..5 LOOP
    mid    := gen_random_uuid();
    v_saat := CASE WHEN i % 2 = 0 THEN time '21:00' ELSE time '19:30' END;

    v_slots := public._default_formation_slots('7v7', 'slot');
    v_away  := public._default_formation_slots('7v7', 'away');

    -- İlk i kadar yeri dolu göster (kimi maç yarı dolu, kimi neredeyse boş)
    SELECT jsonb_agg(
             CASE WHEN s.ord <= i AND pl.id IS NOT NULL THEN
               s.val || jsonb_build_object(
                 'status','TAKEN','assignmentStatus','SELF',
                 'purchasedBy', pl.id::text, 'occupant', pl.id::text,
                 'player', public._profile_player_json(pl.id, s.val->>'role'))
             ELSE s.val END
             ORDER BY s.ord)
      INTO v_slots
      FROM (SELECT value AS val, row_number() OVER () AS ord
              FROM jsonb_array_elements(v_slots)) s
      LEFT JOIN LATERAL (
        SELECT p.id FROM public.profiles p JOIN auth.users u ON u.id = p.id
         WHERE u.email = 'oyuncu' || lpad((10 + s.ord)::text, 2, '0') || '@oyna.app'
      ) pl ON true;

    INSERT INTO public.matches (
      id, title, location, date, "time", price, difficulty, status, format,
      duration, gender, "ageGroup", "minRating", badges, "missingPositions",
      slots, "awaySlots", "creatorId", captain_id, pitch_id, "isDemo",
      visibility, starts_at, image)
    SELECT
      mid,
      '[EKO] Yaklaşan Maç ' || i,
      v_district,
      to_char(current_date + i, 'YYYY-MM-DD'),
      to_char(v_saat, 'HH24:MI'),
      120 + (i * 20), 'Rahat', 'ACTIVE', '7v7',
      '60 Dakika', 'Karma', '18-35', 0, '["7v7"]'::jsonb, '[]'::jsonb,
      v_slots, v_away,
      pl.id, pl.id, v_pitch, true,
      'OPEN',
      ((current_date + i) + v_saat) AT TIME ZONE 'Europe/Istanbul',
      'https://images.unsplash.com/photo-1529900748604-07564a03e7a6?q=80&w=600'
    FROM public.profiles pl JOIN auth.users u ON u.id = pl.id
    WHERE u.email = 'oyuncu' || lpad((10 + i)::text, 2, '0') || '@oyna.app';

    INSERT INTO public.match_participants (match_id, user_id, role, status, is_buyer, bought_slots)
    SELECT mid, p.id, 'home', 'creator', true, 1
      FROM public.profiles p JOIN auth.users u ON u.id = p.id
     WHERE u.email = 'oyuncu' || lpad((10 + i)::text, 2, '0') || '@oyna.app'
    ON CONFLICT (match_id, user_id) DO NOTHING;
  END LOOP;

  -- ══ 5) MAÇ SAYAÇLARI ══════════════════════════════════════════════════════
  UPDATE public.profiles p
     SET match_count = COALESCE((
           SELECT count(*) FROM public.match_participants mp
             JOIN public.matches m ON m.id = mp.match_id
            WHERE mp.user_id = p.id AND m.status = 'COMPLETED'), 0)
   WHERE p.email LIKE '%@oyna.app';
END $seed$;

-- ── Doğrulama özeti ─────────────────────────────────────────────────────────
SELECT 'bakiye' AS ne,
       count(*) FILTER (WHERE wallet_balance > 0)::text AS deger,
       round(sum(wallet_balance)::numeric, 2)::text AS toplam
  FROM public.profiles WHERE email LIKE '%@oyna.app'
UNION ALL
SELECT 'gecmis_mac', count(*)::text, ''
  FROM public.matches WHERE title LIKE '[EKO]%' AND status = 'COMPLETED'
UNION ALL
SELECT 'gelecek_mac', count(*)::text, ''
  FROM public.matches WHERE title LIKE '[EKO]%' AND status = 'ACTIVE'
UNION ALL
SELECT 'cuzdan_hareketi', count(*)::text, ''
  FROM public.wallet_transactions WHERE meta->>'seed' = 'demo_ekosistem';
