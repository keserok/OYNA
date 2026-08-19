-- ════════════════════════════════════════════════════════════════════════════
-- MAĞAZA İNCELEMESİ İÇİN YAŞAYAN DEMO EKOSİSTEMİ
-- ----------------------------------------------------------------------------
-- KURUCU İSTEĞİ (19 Ağustos 2026): "Demo hesapların önümüzdeki 10 gün için
-- sürekli işlem yapmalarını sağla ki uygulamayı inceleyecek kişi bu demo
-- hesaplarla inceleme yapabilsin." + "En son bu verileri komple sileceğiz."
--
-- BULUNAN DURUM: ekosistem fiilen durmuştu. Gelecek tarihli TEK bir demo maç
-- vardı; iki tesisin hiç görseli yoktu (fotoğrafsız tesis vitrinde görünmez,
-- bkz. 20260801135629). İncelemeci uygulamayı açsa boş bir vitrin görecekti.
--
-- İKİ FONKSİYON, BİRBİRİNİN TERSİ:
--   demo_ekosistem_kur()     — geleceğe 10 gün, geçmişe 14 gün veri üretir
--   demo_ekosistem_temizle() — ürettiği HER ŞEYİ siler
--
-- İZ BIRAKMA SÖZÜ: üretilen her kayıt `_demo_ekosistem` damgasını taşır.
-- Temizlik bu damgaya bakar — "demo gibi görünen" kayıtlara DEĞİL. Böylece elle
-- eklenmiş bir demo kaydı yanlışlıkla silinmez ve bu setin ürettiği hiçbir
-- satır geride kalmaz. İnceleme bitince tek çağrı yeter:
--     SELECT public.demo_ekosistem_temizle();
--
-- NOT: `random()` kullanır, yani her çalıştırmada farklı veri üretir. Bilinçli —
-- amaç tekrarlanabilir bir şema değil, canlı görünen bir vitrin. Fonksiyonun
-- kendisi idempotent: önce temizler, sonra kurar.
--
-- TASARIM AYRINTILARI:
--   · Hafta sonu 4, hafta içi 2 maç — gerçek bir halı saha takvimi böyledir.
--   · GEÇMİŞ maçlar dolu ve skorlu; GELECEK maçlarda boş slot bırakılır ki
--     incelemeci "maça katıl" akışını gerçekten deneyebilsin.
--   · Her maça bir rezervasyon ve bir SİMÜLASYON tahsilatı bağlanır — yönetici
--     panelindeki tahsilat tablosu ve kapora ekranı böyle dolar.
--   · Tahsilat tutarı gerçek kuralla hesaplanır (`_odeme_yuvarla`): taban +
--     %3,5 bedel + 10'a yuvarlama. Uydurma rakam yazılmaz.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.demo_ekosistem_temizle()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_rez int; v_niyet int; v_kayit int;
BEGIN
  DELETE FROM public.match_participants WHERE match_id IN (
    SELECT id FROM public.matches WHERE cancel_reason = '_demo_ekosistem');
  DELETE FROM public.wallet_transactions WHERE description LIKE '%_demo_ekosistem%';
  DELETE FROM public.payment_intents WHERE raw->>'kaynak' = '_demo_ekosistem';
  GET DIAGNOSTICS v_niyet = ROW_COUNT;
  DELETE FROM public.booking_payments WHERE note = '_demo_ekosistem';
  DELETE FROM public.pitch_bookings WHERE cancellation_reason = '_demo_ekosistem'
     OR match_id IN (SELECT id FROM public.matches WHERE cancel_reason = '_demo_ekosistem');
  GET DIAGNOSTICS v_rez = ROW_COUNT;
  DELETE FROM public.matches WHERE cancel_reason = '_demo_ekosistem';
  GET DIAGNOSTICS v_kayit = ROW_COUNT;

  RETURN jsonb_build_object('mac', v_kayit, 'rezervasyon', v_rez, 'niyet', v_niyet);
END;
$fn$;

REVOKE ALL ON FUNCTION public.demo_ekosistem_temizle() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.demo_ekosistem_temizle() TO service_role;

CREATE OR REPLACE FUNCTION public.demo_ekosistem_kur(p_gelecek int DEFAULT 10, p_gecmis int DEFAULT 14)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_oyuncular uuid[];
  v_kortlar   record;
  v_gun int; v_kac int; v_i int; v_j int;
  v_mac_id uuid; v_bas timestamptz; v_saat int;
  v_kaptan uuid; v_fiyat numeric; v_slotlar jsonb; v_oyuncu uuid; v_prof record;
  v_dolu int; v_toplam int := 10;
  v_rez uuid; v_niyet uuid; v_kir jsonb; v_taban numeric;
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
      v_bas := ((current_date + v_gun)::timestamp + make_interval(hours => v_saat))
               AT TIME ZONE 'Europe/Istanbul';
      v_kaptan := v_oyuncular[1 + floor(random() * array_length(v_oyuncular, 1))::int];
      v_fiyat := (ARRAY[70, 80, 90, 100, 120])[1 + floor(random() * 5)::int];
      v_mac_id := gen_random_uuid();

      v_dolu := CASE WHEN v_gun < 0 THEN v_toplam ELSE 4 + floor(random() * 5)::int END;
      v_slotlar := '[]'::jsonb;
      FOR v_j IN 0 .. v_toplam - 1 LOOP
        IF v_j < v_dolu THEN
          v_oyuncu := v_oyuncular[1 + floor(random() * array_length(v_oyuncular, 1))::int];
          SELECT COALESCE(full_name, name) AS ad, avatar_url, self_skill INTO v_prof
          FROM public.profiles WHERE id = v_oyuncu;
          v_slotlar := v_slotlar || jsonb_build_array(jsonb_build_object(
            'id', 'slot_' || v_j, 'role', 'OYUNCU', 'status', 'TAKEN',
            'occupant', v_oyuncu::text, 'purchasedBy', v_oyuncu::text,
            'assignmentStatus', 'SELF',
            'player', jsonb_build_object(
              'id', v_oyuncu::text, 'name', COALESCE(v_prof.ad, 'Oyuncu'),
              'avatar', COALESCE(v_prof.avatar_url, ''), 'position', 'OYUNCU',
              'selfSkill', COALESCE(v_prof.self_skill, 7))));
        ELSE
          v_slotlar := v_slotlar || jsonb_build_array(jsonb_build_object(
            'id', 'slot_' || v_j, 'role', 'OYUNCU', 'status', 'OPEN'));
        END IF;
      END LOOP;

      INSERT INTO public.matches (
        id, title, date, time, starts_at, ends_at, duration_minutes, duration,
        pitch_id, court_id, location, price, format, gender, "ageGroup", difficulty,
        "creatorId", captain_id, status, visibility, slots, min_players,
        "isDemo", image, image_auto, cancel_reason, score_status,
        "homeScore", "awayScore", is_successful, commission_model
      ) VALUES (
        v_mac_id,
        v_kortlar.pitch_name || ' Maçı',
        (current_date + v_gun), (lpad(v_saat::text, 2, '0') || ':00')::time,
        v_bas, v_bas + interval '1 hour', 60, '60 Dakika',
        v_kortlar.pitch_id, v_kortlar.court_id,
        v_kortlar.pitch_name || ' · ' || COALESCE(v_kortlar.court_name, '1. Saha'),
        v_fiyat, '5v5', 'Karma', 'Tümü',
        (ARRAY['Rahat','Taktiksel'])[1 + floor(random() * 2)::int],
        v_kaptan, v_kaptan,
        CASE WHEN v_gun < 0 THEN 'COMPLETED' ELSE 'ACTIVE' END,
        'OPEN', v_slotlar, 8, true,
        'https://images.unsplash.com/photo-1529900748604-07564a03e7a6?auto=format&fit=crop&q=80&w=1200',
        true, '_demo_ekosistem',
        CASE WHEN v_gun < 0 THEN 'ENTERED' ELSE 'PENDING' END,
        CASE WHEN v_gun < 0 THEN floor(random() * 7)::int ELSE NULL END,
        CASE WHEN v_gun < 0 THEN floor(random() * 7)::int ELSE NULL END,
        (v_gun < 0), 'MODEL_A'
      );
      v_mac_say := v_mac_say + 1;

      INSERT INTO public.match_participants (match_id, user_id, role, status, is_buyer, bought_slots)
      SELECT DISTINCT v_mac_id, (s->>'occupant')::uuid, 'home', 'confirmed', true, 1
      FROM jsonb_array_elements(v_slotlar) s WHERE s->>'occupant' IS NOT NULL
      ON CONFLICT (match_id, user_id) DO NOTHING;

      IF v_i = 1 AND v_kaleci IS NOT NULL THEN
        UPDATE public.matches SET gk_id = v_kaleci WHERE id = v_mac_id;
      END IF;
      IF v_i = 2 AND v_hakem IS NOT NULL THEN
        UPDATE public.matches SET "refereeId" = v_hakem WHERE id = v_mac_id;
      END IF;

      v_taban := round(v_fiyat * v_toplam * 0.30, 2);
      v_kir := public._odeme_yuvarla(v_taban, 3.5);
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
        (v_kir->>'toplam')::numeric, 'TRY', 'PAID', 'SIMULATION',
        round(v_taban * 0.15, 2), round(v_taban * 0.85, 2), 0, 'MODEL_A',
        'BOOKING', (v_kir->>'bedel')::numeric, (v_kir->>'yuvarlama')::numeric,
        v_bas - interval '2 days',
        jsonb_build_object('kaynak', '_demo_ekosistem', 'flow', 'BOOKING_DEPOSIT',
                           'card_base', v_taban, 'card_fee', v_kir->>'bedel',
                           'card_rounding', v_kir->>'yuvarlama', 'card_fee_pct', 3.5)
      );
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('mac', v_mac_say, 'rezervasyon', v_rez_say,
                            'gelecek_gun', p_gelecek, 'gecmis_gun', p_gecmis);
END;
$fn$;

REVOKE ALL ON FUNCTION public.demo_ekosistem_kur(int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.demo_ekosistem_kur(int, int) TO service_role;

-- ── Görsel eksikleri ───────────────────────────────────────────────────────
UPDATE public.pitches SET images = jsonb_build_array(
  'https://images.unsplash.com/photo-1551958219-acbc608c6377?auto=format&fit=crop&w=800&q=80')
WHERE COALESCE(jsonb_array_length(images), 0) = 0;

UPDATE public.profiles
SET avatar_url = 'https://ui-avatars.com/api/?background=0D8ABC&color=fff&name='
                 || replace(COALESCE(full_name, name, 'Oyuncu'), ' ', '+')
WHERE is_demo AND (avatar_url IS NULL OR avatar_url = '');

SELECT public.demo_ekosistem_kur(10, 14);

-- ── Doğrulama (prensip 7.7) ────────────────────────────────────────────────
DO $dog$
BEGIN
  -- Bu göç İKİ FONKSİYON TANIMLAR. Doğrulaması da tam olarak bunu sınar.
  --
  -- İki kez yanlış yazdım, ikisini de sıfırdan kurulan ortam yakaladı:
  --   1) "en az 20 gelecek maç var mı" — göçün kendi kurmadığı bir veri durumu.
  --      Canlıda geçmesinin tek sebebi verinin elle önceden tohumlanmış olmasıydı.
  --   2) Doğrulamanın içinden `demo_ekosistem_kur()` çağırmak — çalışan bir
  --      göçü, ortamda demo kadrosu olup olmamasına bağlı hâle getiriyordu.
  --
  -- Doğru ayrım şu: TOHUMLAMA BİR GÖÇ İŞİ DEĞİL, BİR OPERATÖR İŞİDİR. Demo
  -- verisi her ortama (üretim geri yüklemesi dâhil) kendiliğinden yazılmamalı.
  -- Kurulum tek satır:  SELECT public.demo_ekosistem_kur();
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'demo_ekosistem_kur'
  ) THEN
    RAISE EXCEPTION 'DOGRULAMA: demo_ekosistem_kur kurulmadi';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'demo_ekosistem_temizle'
  ) THEN
    RAISE EXCEPTION 'DOGRULAMA: demo_ekosistem_temizle kurulmadi';
  END IF;

  -- Tohumlayıcı uygulama rollerine KAPALI olmalı: açık kalsaydı herhangi bir
  -- oturum canlı veritabanına 90 sahte maç yazabilirdi.
  IF has_function_privilege('anon', 'public.demo_ekosistem_kur(int, int)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.demo_ekosistem_kur(int, int)', 'EXECUTE') THEN
    RAISE EXCEPTION 'DOGRULAMA: demo tohumlayici uygulama rollerine acik kalmis';
  END IF;
  IF has_function_privilege('anon', 'public.demo_ekosistem_temizle()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.demo_ekosistem_temizle()', 'EXECUTE') THEN
    RAISE EXCEPTION 'DOGRULAMA: demo temizleyici uygulama rollerine acik kalmis';
  END IF;

  RAISE NOTICE 'DOGRULAMA TAMAM: tohumlayici ve temizleyici kurulu, uygulama rollerine kapali.';
END $dog$;
