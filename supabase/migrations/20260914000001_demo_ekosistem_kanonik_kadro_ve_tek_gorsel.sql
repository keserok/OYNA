-- ════════════════════════════════════════════════════════════════════════════
-- DEMO EKOSİSTEMİ v2 — KANONİK 5+5 KADRO · TEK GÖRSEL · BEDELSİZ NİYET
-- ----------------------------------------------------------------------------
-- KURUCUNUN CANLIDA GÖRDÜĞÜ İKİ HATA (20 Ağustos 2026):
--
-- 1) "Kart 6 boşluk diyor, lobide 20 kişilik maçta 14 açık slot görüyorum."
--    Tohumlayıcı iki tarafın 10 slotunu TEK dizide (`slots`) yazıyordu;
--    `awaySlots` boş kalınca lobi deplasman için şablondan 10 HAYALET slot
--    uyduruyordu (istemci tarafı aynı gün ayrıca düzeltildi: hayalet üretim
--    yasak, tek dizi ikiye bölünür — shared/lobbyEnrichment.normalizeMatchSides).
--    Veri de artık ürünün kanonik biçiminde doğar: 5 ev + 5 deplasman;
--    Taktiksel/Ciddi pozisyonlu (GK-DEF-MID-MID-FWD = utils/formations '1-2-1'
--    dizilişinin birebir rol dağılımı), Rahat pozisyonsuz (OYUNCU).
--
-- 2) "Fotoğraf bir görünüp bir değişiyor; tek fotoğraf sabit görünsün."
--    Tohumlayıcı maça SABİT bir Unsplash adresi basıyordu; ana sayfa şeridi
--    ise sahanın kapağını (pitches.image), rahat lobi galeriyi (images[0])
--    okuyor. Üç yüzey üç kaynak = aynı maç gezinirken üç farklı fotoğraf.
--    Görselin TEK makinesi zaten var: `matches_autofill_image` tetikleyicisi
--    (20260713000020) maça sahanın kapağını basar. Tohumlayıcı artık image
--    GÖNDERMEZ — tetikleyici doldurur; her yüzey aynı kapağı gösterir.
--
-- AYRICA (aynı günkü "etikette yazan ödenir" kararına uyum — 20260914000000):
--    Simüle tahsilat niyetleri de bedelsiz doğar: amount = taban,
--    card_fee_amount = 0, rounding_amount = 0. Vitrindeki geçmiş işlemler,
--    ürünün bugünkü para kuralıyla çelişen rakamlar göstermesin.
--
-- Bu sürüm, canlıdaki gövdenin ÜZERİNE kuruludur: dolu-saat kapısı
-- (20260912000004) ve kaleci/hakem işleri çağrısı (20260913000001 →
-- `_demo_hizmet_talepleri`) korunur. En sonda, son başvuranı da kalmayan
-- `_odeme_yuvarla` düşürülür (19 Ağu yuvarlama motoru — ölü düğme bırakmayız).
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.demo_ekosistem_kur(p_gelecek integer DEFAULT 10, p_gecmis integer DEFAULT 14)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_oyuncular uuid[];
  v_kortlar   record;
  v_gun int; v_kac int; v_i int; v_j int;
  v_mac_id uuid; v_bas timestamptz; v_saat int;
  v_kaptan uuid; v_fiyat numeric; v_oyuncu uuid; v_prof record;
  v_ev jsonb; v_dep jsonb;
  v_zorluk text; v_roller text[];
  v_dolu int; v_ev_dolu int; v_taraf_boy int := 5; v_toplam int := 10;
  v_rez uuid; v_niyet uuid; v_taban numeric;
  v_mac_say int := 0; v_rez_say int := 0;
  v_kaleci uuid; v_hakem uuid;
BEGIN
  PERFORM public.demo_ekosistem_temizle();

  SELECT array_agg(id) INTO v_oyuncular
  FROM public.profiles WHERE is_demo AND role = 'PLAYER';
  IF v_oyuncular IS NULL OR array_length(v_oyuncular, 1) < 4 THEN
    RAISE EXCEPTION 'DEMO_YOK: yeterli demo oyuncu bulunamadi';
  END IF;

  SELECT id INTO v_kaleci FROM public.goalkeepers WHERE verification_status = 'approved' LIMIT 1;
  SELECT id INTO v_hakem  FROM public.referees    WHERE verification_status = 'approved' LIMIT 1;

  FOR v_gun IN -p_gecmis .. p_gelecek LOOP
    v_kac := CASE WHEN EXTRACT(DOW FROM current_date + v_gun) IN (0, 6) THEN 4 ELSE 2 END;

    FOR v_i IN 1 .. v_kac LOOP
      SELECT c.id AS court_id, c.pitch_id, p.name AS pitch_name, c.name AS court_name
        INTO v_kortlar
      FROM public.courts c JOIN public.pitches p ON p.id = c.pitch_id
      ORDER BY random() LIMIT 1;
      CONTINUE WHEN v_kortlar.court_id IS NULL;

      v_saat := 17 + v_i;
      -- Saat zaten doluysa bu turu atla: exclusion kısıtı tüm tohumlamayı
      -- geri aldırıyordu (bkz. 20260912000004).
      CONTINUE WHEN EXISTS (
        SELECT 1 FROM public.pitch_bookings b
        WHERE b.court_id = v_kortlar.court_id
          AND b.booking_date = (current_date + v_gun)
          AND b.start_time = (lpad(v_saat::text, 2, '0') || ':00')::time
          AND b.status <> 'CANCELLED'
      );
      v_bas := ((current_date + v_gun)::timestamp + make_interval(hours => v_saat))
               AT TIME ZONE 'Europe/Istanbul';
      v_kaptan := v_oyuncular[1 + floor(random() * array_length(v_oyuncular, 1))::int];
      v_fiyat := (ARRAY[70, 80, 90, 100, 120])[1 + floor(random() * 5)::int];
      v_mac_id := gen_random_uuid();

      -- İncelemeci üç mentaliteyi de görebilsin diye üçü de üretilir.
      v_zorluk := (ARRAY['Rahat','Taktiksel','Ciddi'])[1 + floor(random() * 3)::int];
      -- Rol dizisi TARAF BAŞINA: pozisyonlu maçlarda utils/formations.ts'teki
      -- 5v5 '1-2-1' dizilişinin rol sırası birebir (GK, DEF, MID, MID, FWD).
      v_roller := CASE WHEN v_zorluk = 'Rahat'
                       THEN ARRAY['OYUNCU','OYUNCU','OYUNCU','OYUNCU','OYUNCU']
                       ELSE ARRAY['GK','DEF','MID','MID','FWD'] END;

      -- Doluluk maç genelinde: geçmiş maç tam dolu; gelecek maçta 4-8 dolu.
      -- İki tarafa dengeli dağıtılır (ev önce: 5'ten taşan deplasmana).
      v_dolu := CASE WHEN v_gun < 0 THEN v_toplam ELSE 4 + floor(random() * 5)::int END;
      -- Ev yarıdan çoğunu alır ama 5'i aşamaz; deplasmana kalan da 5'i aşamaz.
      v_ev_dolu := LEAST(v_taraf_boy, GREATEST((v_dolu + 1) / 2, v_dolu - v_taraf_boy));

      v_ev := '[]'::jsonb; v_dep := '[]'::jsonb;
      FOR v_j IN 0 .. v_toplam - 1 LOOP
        DECLARE
          v_taraf_ev boolean := v_j < v_taraf_boy;
          v_sira int := CASE WHEN v_j < v_taraf_boy THEN v_j ELSE v_j - v_taraf_boy END;
          v_alinmis boolean;
          v_slot jsonb;
        BEGIN
          v_alinmis := CASE WHEN v_taraf_ev THEN v_sira < v_ev_dolu
                            ELSE v_sira < (v_dolu - v_ev_dolu) END;
          IF v_alinmis THEN
            v_oyuncu := v_oyuncular[1 + floor(random() * array_length(v_oyuncular, 1))::int];
            SELECT COALESCE(full_name, name) AS ad, avatar_url, self_skill INTO v_prof
            FROM public.profiles WHERE id = v_oyuncu;
            v_slot := jsonb_build_object(
              'id', 'slot_' || v_j, 'role', v_roller[v_sira + 1], 'status', 'TAKEN',
              'occupant', v_oyuncu::text, 'purchasedBy', v_oyuncu::text,
              'assignmentStatus', 'SELF',
              'player', jsonb_build_object(
                'id', v_oyuncu::text, 'name', COALESCE(v_prof.ad, 'Oyuncu'),
                'avatar', COALESCE(v_prof.avatar_url, ''), 'position', v_roller[v_sira + 1],
                'selfSkill', COALESCE(v_prof.self_skill, 7)));
          ELSE
            v_slot := jsonb_build_object(
              'id', 'slot_' || v_j, 'role', v_roller[v_sira + 1], 'status', 'OPEN');
          END IF;
          IF v_taraf_ev THEN v_ev := v_ev || jsonb_build_array(v_slot);
          ELSE v_dep := v_dep || jsonb_build_array(v_slot); END IF;
        END;
      END LOOP;

      -- image / image_auto BİLEREK GÖNDERİLMİYOR: matches_autofill_image
      -- tetikleyicisi sahanın kapağını (_pitch_image) basar — ana sayfa
      -- şeridi, keşif kartı ve lobi AYNI fotoğrafı gösterir.
      INSERT INTO public.matches (
        id, title, date, time, starts_at, ends_at, duration_minutes, duration,
        pitch_id, court_id, location, price, format, gender, "ageGroup", difficulty,
        "creatorId", captain_id, status, visibility, slots, "awaySlots", min_players,
        "isDemo", cancel_reason, score_status,
        "homeScore", "awayScore", is_successful, commission_model
      ) VALUES (
        v_mac_id,
        v_kortlar.pitch_name || ' Maçı',
        (current_date + v_gun), (lpad(v_saat::text, 2, '0') || ':00')::time,
        v_bas, v_bas + interval '1 hour', 60, '60 Dakika',
        v_kortlar.pitch_id, v_kortlar.court_id,
        v_kortlar.pitch_name || ' · ' || COALESCE(v_kortlar.court_name, '1. Saha'),
        v_fiyat, '5v5', 'Karma', 'Tümü',
        v_zorluk,
        v_kaptan, v_kaptan,
        CASE WHEN v_gun < 0 THEN 'COMPLETED' ELSE 'ACTIVE' END,
        'OPEN', v_ev, v_dep, 8, true,
        '_demo_ekosistem',
        CASE WHEN v_gun < 0 THEN 'ENTERED' ELSE 'PENDING' END,
        CASE WHEN v_gun < 0 THEN floor(random() * 7)::int ELSE NULL END,
        CASE WHEN v_gun < 0 THEN floor(random() * 7)::int ELSE NULL END,
        (v_gun < 0), 'MODEL_A'
      );
      v_mac_say := v_mac_say + 1;

      -- Katılımcının tarafı slotun tarafından okunur (istemci role=home/away'e bakar).
      INSERT INTO public.match_participants (match_id, user_id, role, status, is_buyer, bought_slots)
      SELECT DISTINCT ON ((s->>'occupant')) v_mac_id, (s->>'occupant')::uuid, taraf, 'confirmed', true, 1
      FROM (
        SELECT s, 'home'::text AS taraf FROM jsonb_array_elements(v_ev) s
        UNION ALL
        SELECT s, 'away'::text AS taraf FROM jsonb_array_elements(v_dep) s
      ) t
      WHERE s->>'occupant' IS NOT NULL
      ORDER BY (s->>'occupant'), taraf
      ON CONFLICT (match_id, user_id) DO NOTHING;

      IF v_i = 1 AND v_kaleci IS NOT NULL THEN
        UPDATE public.matches SET gk_id = v_kaleci WHERE id = v_mac_id;
      END IF;
      IF v_i = 2 AND v_hakem IS NOT NULL THEN
        UPDATE public.matches SET "refereeId" = v_hakem WHERE id = v_mac_id;
      END IF;

      -- ETİKETTE YAZAN ÖDENİR (20260914000000): niyet tutarı = taban; bedel ve
      -- yuvarlama diye bir şey artık yok — vitrin verisi de kurala uyar.
      v_taban := round(v_fiyat * v_toplam * 0.30, 2);
      v_rez := gen_random_uuid();

      INSERT INTO public.pitch_bookings (
        id, pitch_id, court_id, user_id, match_id, booking_date, start_time, end_time,
        status, source, price, paid_amount, deposit_amount, payment_status,
        cancellation_reason
      ) VALUES (
        v_rez, v_kortlar.pitch_id, v_kortlar.court_id, v_kaptan, v_mac_id,
        (current_date + v_gun), (lpad(v_saat::text, 2, '0') || ':00')::time,
        (lpad((v_saat + 1)::text, 2, '0') || ':00')::time,
        'CONFIRMED', 'APP_MATCH', v_fiyat * v_toplam, v_taban, v_taban, 'PARTIAL',
        '_demo_ekosistem'
      );
      v_rez_say := v_rez_say + 1;

      v_niyet := gen_random_uuid();
      INSERT INTO public.payment_intents (
        id, user_id, booking_id, match_id, pitch_id, amount, currency, status, provider,
        commission_amount, owner_amount, service_provider_amount, commission_model,
        related_entity_type, card_fee_amount, rounding_amount, paid_at, raw
      ) VALUES (
        v_niyet, v_kaptan, v_rez, v_mac_id, v_kortlar.pitch_id,
        v_taban, 'TRY', 'PAID', 'SIMULATION',
        round(v_taban * 0.15, 2), round(v_taban * 0.85, 2), 0, 'MODEL_A',
        'BOOKING', 0, 0,
        v_bas - interval '2 days',
        jsonb_build_object('kaynak', '_demo_ekosistem', 'flow', 'BOOKING_DEPOSIT',
                           'card_base', v_taban, 'card_fee', 0,
                           'card_rounding', 0, 'card_fee_pct', 0)
      );
    END LOOP;
  END LOOP;

  PERFORM public._demo_hizmet_talepleri();
  RETURN jsonb_build_object('mac', v_mac_say, 'rezervasyon', v_rez_say,
                            'gelecek_gun', p_gelecek, 'gecmis_gun', p_gecmis);
END;
$fn$;

-- ── Yuvarlama motorunun sökümü ─────────────────────────────────────────────
-- Son başvuran da (yukarıdaki tohumlayıcı) bıraktı; prepare_card_payment ve
-- get_card_fee_quote bir önceki göçte bırakmıştı. Ölü yardımcı bırakılmaz —
-- bırakılsaydı bir gün biri "hazır fonksiyon varmış" diye yeniden bağlardı.
DO $sokum$
DECLARE v_kalan text;
BEGIN
  SELECT string_agg(p.proname, ', ') INTO v_kalan
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prokind = 'f'  -- aggregate/window'da pg_get_functiondef hata verir
    AND p.proname <> '_odeme_yuvarla'
    AND pg_get_functiondef(p.oid) LIKE '%\_odeme\_yuvarla%' ESCAPE '\';
  IF v_kalan IS NOT NULL THEN
    RAISE EXCEPTION 'SOKUM DURDU: _odeme_yuvarla hala su fonksiyonlarda geciyor: %', v_kalan;
  END IF;
  DROP FUNCTION IF EXISTS public._odeme_yuvarla(numeric, numeric);
END $sokum$;

-- ── Doğrulama (prensip 7.7) ────────────────────────────────────────────────
DO $dog$
DECLARE v_src text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'demo_ekosistem_kur';
  IF v_src IS NULL THEN RAISE EXCEPTION 'DOGRULAMA: demo_ekosistem_kur yok'; END IF;

  -- 1) Kanonik iki taraf: awaySlots kolonu yaziliyor, uc mentalite de var.
  IF position('"awaySlots"' in v_src) = 0 OR position('Ciddi' in v_src) = 0 THEN
    RAISE EXCEPTION 'DOGRULAMA: tohumlayici kanonik 5+5 / uc mentalite yazmiyor';
  END IF;
  -- 2) Gorsel makineye birakildi: sabit adres yok; INSERT kolon listesi eski
  --    '"isDemo", image, image_auto' dizisini degil yeni '"isDemo", cancel_reason'
  --    dizisini tasiyor. ('image_auto' sozcugu tek basina aranmaz — fonksiyonun
  --    kendi aciklama yorumunda geciyor ve ilk uygulamada dogrulamayi yanlis
  --    dusurdu.)
  IF v_src ILIKE '%unsplash%'
     OR position('"isDemo", image' in v_src) > 0
     OR position('"isDemo", cancel_reason' in v_src) = 0 THEN
    RAISE EXCEPTION 'DOGRULAMA: tohumlayici hala kendi gorselini basiyor';
  END IF;
  -- 3) Onceki yamalar korunmus: dolu-saat kapisi + kaleci/hakem isleri.
  IF position('b.start_time' in v_src) = 0 OR position('_demo_hizmet_talepleri' in v_src) = 0 THEN
    RAISE EXCEPTION 'DOGRULAMA: dolu-saat kapisi veya hizmet talepleri kaybolmus';
  END IF;
  -- 4) Bedelsiz niyet: yuvarlama motoru referansi kalmadi.
  IF v_src LIKE '%\_odeme\_yuvarla%' ESCAPE '\' THEN
    RAISE EXCEPTION 'DOGRULAMA: tohumlayici hala yuvarlama motorunu cagiriyor';
  END IF;
  -- 5) Motor gercekten sokuldu.
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname = '_odeme_yuvarla') THEN
    RAISE EXCEPTION 'DOGRULAMA: _odeme_yuvarla hala duruyor';
  END IF;

  RAISE NOTICE 'DOGRULAMA TAMAM: kanonik 5+5 kadro, tek gorsel makinesi, bedelsiz niyet; yuvarlama motoru sokuldu.';
END $dog$;
