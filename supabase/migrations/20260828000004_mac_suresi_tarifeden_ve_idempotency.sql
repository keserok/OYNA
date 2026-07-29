-- ============================================================================
-- MAÇ KUR — SÜRE TARİFEDEN GELİR + YAYIN İDEMPOTENCY
--
-- SORUN 1 (KRİTİK — yanlış kaynak):
--   Ürün kararı E1a/E12a/E5a: bir slotun süresinin TEK GERÇEK KAYNAĞI
--   pitch_tariffs.slot_minutes'tır (tarife satırı bazında: saat aralığı + gün +
--   kort — sabah 60, akşam 90 olabilir). Ama create_match_atomic süreyi
--   pitches.working_hours->>'slot_duration' alanından okuyordu; bu TESİS GENELİ
--   TEK DEĞER ve eski modelden kalma. Sonuç: akşamı 90 dakika olan sahada
--   kurulan maç veritabanına 60 dakika yazılıyor, ends_at 30 dakika erken
--   hesaplanıyor ve SKOR ZAMAN KAPISI maç bitmeden açılıyordu.
--
--   ÇÖZÜM: _resolve_court_quote artık slot_minutes'i de döndürür
--   (get_current_tariff_price zaten üretiyordu, sadece dışarı taşınmıyordu) ve
--   create_match_atomic süreyi şu sırayla türetir:
--     1) Tohumlu dal (p_seed_booking_id): rezervasyonun KENDİ süresi
--        (end_time - start_time; gece taşmasında +24 saat).
--     2) Tohumsuz dal: tarifenin slot_minutes'i.
--     3) Yedek: working_hours->>'slot_duration' (eski model — yalnız en son).
--     4) Hiçbiri yoksa 60 (E15/5a: rezervasyonsuz maçın varsayılan süresi).
--   İstemcinin gönderdiği 'duration'/'duration_minutes' ARTIK KAZANAMAZ; süre
--   sunucu SSOT'udur. Gerisi kendiliğinden doğrudur: matches_sync_time_and_
--   score_status trigger'ı (20260728113125) 'duration' metninden duration_minutes
--   ve ends_at üretir.
--
-- SORUN 2 (idempotency): create_match_atomic'in kendi anahtarı yoktu. Zayıf
--   şebekede timeout sonrası tekrar deneme İKİNCİ maç + İKİNCİ rezervasyon +
--   İKİNCİ kapora bloğu yaratabiliyordu. Kalıp owner_create_manual_booking /
--   staff_record_payment ile birebir aynı: owner_client_ops claim/replay.
--   İşlem hata verirse claim satırı da geri alınır → aynı anahtarla tekrar
--   deneme temiz çalışır. İşlem başarılıysa aynı anahtarla gelen ikinci çağrı
--   YENİ MAÇ YARATMAZ, ilk sonucun aynısını döner.
--
-- İMZA NOTU (20260802000001 ile aynı gerekçe): parametre eklemek yeni bir
--   overload yaratır; eski imza DB'de kalırsa PostgREST adlı-parametre
--   eşlemesinde çift-eşleşme (PGRST203) üretir ve MEVCUT ÇAĞRILAR KIRILIR.
--   Bu yüzden eski 7 parametreli imza DROP edilir ve tek yeni imza kurulur.
--   p_client_request_id DEFAULT NULL olduğu için eski istemciler (anahtarsız,
--   7 anahtarlı çağrı) tek yeni imzayla sorunsuz eşleşir — davranış birebir
--   bugünküyle aynı kalır.
-- ============================================================================

-- ── 1 · Tarife çözücü: slot süresini de dışarı ver ──────────────────────────
-- RETURNS TABLE değiştiği için CREATE OR REPLACE yetmez; önce DROP.
-- Bu fonksiyonu yalnız plpgsql gövdeleri çağırır (get_court_day_quote,
-- create_match_atomic) — plpgsql bağımlılık kaydı tutmaz, DROP güvenlidir.
-- Bilinen imza + (savunma) canlıda kalmış BAŞKA imzalar: hepsi düşürülür ki
-- geriye yetim overload kalmasın.
DO $do$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = '_resolve_court_quote'
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig;
  END LOOP;
END $do$;

-- ── SIFIRDAN REPLAY GUARD'I (2026-07-29) ────────────────────────────────────
-- Bu tanım dönüş şekline `slot_minutes` EKLİYOR (5 kolon → 6). Aynı imzayı
-- 20260827000001 beş kolonla bırakıyor ve CREATE OR REPLACE dönüş tipini
-- değiştiremez:
--   ERROR: cannot change return type of existing function (SQLSTATE 42P13)
-- Canlıda etkisiz (fonksiyon zaten bu şekilde), yalnız sıfırdan replay'i onarır.
DROP FUNCTION IF EXISTS public._resolve_court_quote(uuid, date, time without time zone);

CREATE OR REPLACE FUNCTION public._resolve_court_quote(
  p_court_id uuid, p_date date, p_start_time time without time zone
) RETURNS TABLE(total numeric, deposit numeric, tariff_id uuid, deal_id uuid,
                base_price numeric, slot_minutes integer)
LANGUAGE plpgsql STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pitch uuid;
  v_flash boolean;
  v_tid uuid; v_price numeric; v_dep numeric; v_min int;
  v_deal_id uuid; v_deal_price numeric;
BEGIN
  SELECT c.pitch_id, COALESCE(p.flash_deals_enabled, false)
    INTO v_pitch, v_flash
  FROM public.courts c JOIN public.pitches p ON p.id = c.pitch_id
  WHERE c.id = p_court_id;
  IF v_pitch IS NULL THEN RETURN; END IF;

  -- t.slot_minutes NİTELENMİŞ okunur: aynı adlı OUT parametresiyle karışmasın.
  SELECT t.tariff_id, t.price, t.deposit, t.slot_minutes
    INTO v_tid, v_price, v_dep, v_min
  FROM public.get_current_tariff_price(v_pitch, p_date, p_start_time, p_court_id) t;

  IF v_flash THEN
    SELECT fd.id, fd.deal_price INTO v_deal_id, v_deal_price
    FROM public.pitch_flash_deals fd
    WHERE fd.pitch_id = v_pitch
      AND (fd.court_id = p_court_id OR fd.court_id IS NULL)
      AND fd.booking_date = p_date
      AND fd.start_time = p_start_time
      AND NOT COALESCE(fd.is_claimed, false)
      AND (fd.expires_at IS NULL OR fd.expires_at > now())
    ORDER BY (fd.court_id IS NOT NULL) DESC, fd.created_at DESC
    LIMIT 1;
  END IF;

  total        := COALESCE(v_deal_price, v_price);
  base_price   := v_price;
  tariff_id    := v_tid;
  deal_id      := v_deal_id;
  -- Kapora süreyle ölçeklenmez (E13): sahip ne yazdıysa o, yoksa toplamın %20'si.
  deposit      := CASE WHEN COALESCE(v_dep, 0) > 0 THEN v_dep
                       ELSE CEIL(COALESCE(total, 0) * 0.20) END;
  -- Slot süresi TARİFEDEN gelir; tarife bulunamadıysa NULL döner ve çağıran
  -- kendi yedeğine düşer (uydurma 60 BURADA basılmaz).
  slot_minutes := v_min;
  RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION public._resolve_court_quote(uuid, date, time without time zone)
  FROM PUBLIC, anon, authenticated;

-- ── 2 · create_match_atomic v3: süre tarifeden + idempotency ────────────────
-- Eski 7 parametreli imza (ve canlıda kalmış başka imzalar) düşürülür: iki imza
-- birden var olursa PostgREST adlı-parametre eşlemesinde çift-eşleşme (PGRST203)
-- olur ve MEVCUT ÇAĞRILAR KIRILIR. Tek imza + DEFAULT NULL, eski istemcileri
-- (7 anahtarlı çağrı) sorunsuz karşılar.
DO $do$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'create_match_atomic'
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig;
  END LOOP;
END $do$;

CREATE OR REPLACE FUNCTION public.create_match_atomic(
  p_court_id   uuid,
  p_date       date,
  p_start_time time without time zone,
  p_format     text,
  p_visibility text DEFAULT 'OPEN',
  p_payload    jsonb DEFAULT '{}'::jsonb,
  p_seed_booking_id uuid DEFAULT NULL,
  p_client_request_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_court RECORD;
  v_seed RECORD;
  v_per int;
  v_q RECORD;
  v_total numeric; v_deposit numeric; v_deal uuid;
  v_per_person numeric;
  v_dur int;
  v_slots jsonb; v_away jsonb;
  v_title text;
  v_payload jsonb;
  v_match_id uuid;
  v_booking_id uuid;
  v_end time;
  v_providers jsonb := '[]'::jsonb;
  v_prov jsonb; v_pid text;
  v_counts RECORD;
  v_minp int;
  v_block jsonb;
  v_code text;
  v_wh jsonb;
  v_night boolean;
  v_eff timestamp;
  v_claimed int;
  v_op_claimed int := 0;
  v_existing jsonb;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_visibility NOT IN ('OPEN', 'PRIVATE') THEN p_visibility := 'OPEN'; END IF;

  -- ── İdempotency claim ────────────────────────────────────────────────────
  -- Anahtar YOKSA davranış eskisiyle birebir aynı (geriye dönük uyum).
  -- UNIQUE anahtar eşzamanlı tekrar gönderimleri serialize eder: ikinci INSERT
  -- ilk transaction commit/rollback edene dek bloke olur. İlk çağrı HATA ile
  -- düştüyse claim satırı da geri alınır → tekrar deneme temiz claim alır.
  IF p_client_request_id IS NOT NULL THEN
    INSERT INTO public.owner_client_ops (client_request_id, op_type, created_by)
    VALUES (p_client_request_id, 'CREATE_MATCH_ATOMIC', v_uid)
    ON CONFLICT (client_request_id) DO NOTHING;
    GET DIAGNOSTICS v_op_claimed = ROW_COUNT;
    IF v_op_claimed = 0 THEN
      SELECT result INTO v_existing FROM public.owner_client_ops
      WHERE client_request_id = p_client_request_id;
      IF v_existing IS NOT NULL AND (v_existing->>'match_id') IS NOT NULL THEN
        RETURN v_existing;          -- tekrar gönderim → İLK maçın sonucu
      END IF;
      -- İlk istek hâlâ uçuşta: İKİNCİ MAÇ YARATMA, çağırana durumu bildir.
      RAISE EXCEPTION 'DUPLICATE_IN_FLIGHT: Bu yayın isteği hâlâ işleniyor.';
    END IF;
  END IF;

  IF p_seed_booking_id IS NOT NULL THEN
    SELECT b.* INTO v_seed FROM public.pitch_bookings b
    WHERE b.id = p_seed_booking_id AND b.user_id = v_uid
      AND b.status <> 'CANCELLED' AND b.match_id IS NULL
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'SEED_NOT_FOUND: Çevrilecek rezervasyon bulunamadı ya da zaten maça bağlı.'; END IF;
    -- Onaysız VE ödemesiz rezervasyon maça çevrilemez: saha güvencesi yok,
    -- kaporasız ACTIVE maç doğardı.
    IF v_seed.status <> 'CONFIRMED' AND COALESCE(v_seed.paid_amount, 0) <= 0 THEN
      RAISE EXCEPTION 'SEED_NOT_READY: Rezervasyon onaylanmadan ya da kaporası ödenmeden maça çevrilemez.';
    END IF;
    p_court_id   := v_seed.court_id;
    p_date       := v_seed.booking_date;
    p_start_time := v_seed.start_time;
  END IF;

  SELECT c.*, p.id AS pid, p.name AS pitch_name, p.working_hours AS wh
    INTO v_court
  FROM public.courts c JOIN public.pitches p ON p.id = c.pitch_id
  WHERE c.id = p_court_id AND COALESCE(c.is_active, true);
  IF NOT FOUND THEN RAISE EXCEPTION 'COURT_NOT_FOUND: Saha bulunamadı.'; END IF;

  v_per := NULLIF(split_part(COALESCE(p_format, ''), 'v', 1), '')::int;
  IF v_per IS NULL OR v_per < COALESCE(v_court.min_capacity, 3) OR v_per > COALESCE(v_court.max_capacity, 11) THEN
    RAISE EXCEPTION 'FORMAT_OUT_OF_RANGE: % sahası %v% desteklemiyor (%v% – %v%).',
      v_court.name, v_per, v_per,
      COALESCE(v_court.min_capacity, 3), COALESCE(v_court.min_capacity, 3),
      COALESCE(v_court.max_capacity, 11), COALESCE(v_court.max_capacity, 11);
  END IF;

  -- Gece konvansiyonu: (D, 00:00) fiziksel olarak D gecesi (D+1 sabahı) demektir.
  v_night := EXTRACT(HOUR FROM p_start_time)::int < 6;
  v_eff := (p_date + p_start_time) + CASE WHEN v_night THEN interval '1 day' ELSE interval '0' END;
  IF v_eff < (now() AT TIME ZONE 'Europe/Istanbul') THEN
    RAISE EXCEPTION 'PAST_TIME: Geçmiş bir saat için maç kurulamaz.';
  END IF;

  -- ── Fiyat / kapora / SÜRE ────────────────────────────────────────────────
  IF p_seed_booking_id IS NOT NULL THEN
    -- Rezervasyondan çevirme: fiyat rezervasyonun, ikinci kapora YOK.
    v_total := COALESCE(v_seed.price, 0);
    v_deposit := 0;
    -- SÜRE rezervasyonun KENDİ süresidir; rezervasyon o saatte gerçekten ne
    -- kadar sahayı tutuyorsa maç da o kadar sürer. Gece taşmasında (23:00→00:30)
    -- fark negatife düşer → +24 saat.
    IF v_seed.start_time IS NOT NULL AND v_seed.end_time IS NOT NULL THEN
      v_dur := (EXTRACT(EPOCH FROM (
                  CASE WHEN v_seed.end_time <= v_seed.start_time
                       THEN v_seed.end_time::interval + interval '24 hours'
                       ELSE v_seed.end_time::interval END
                  - v_seed.start_time::interval)) / 60)::int;
      IF COALESCE(v_dur, 0) <= 0 THEN v_dur := NULL; END IF;
    END IF;
    -- Rezervasyondan süre çıkmazsa tarifeye düş.
    IF v_dur IS NULL THEN
      SELECT * INTO v_q FROM public._resolve_court_quote(p_court_id, p_date, p_start_time);
      v_dur := v_q.slot_minutes;
    END IF;
  ELSE
    SELECT * INTO v_q FROM public._resolve_court_quote(p_court_id, p_date, p_start_time);
    IF v_q.tariff_id IS NULL THEN
      RAISE EXCEPTION 'NO_TARIFF: Bu saha için fiyat tarifesi tanımlanmamış; şimdilik maç kurulamıyor.';
    END IF;
    v_total := v_q.total;
    v_deposit := v_q.deposit;
    v_deal := v_q.deal_id;
    -- TEK GERÇEK KAYNAK (E1a): süre tarifenin kendi slot_minutes'idir.
    v_dur := v_q.slot_minutes;
  END IF;

  -- Yedek 1 (ESKİ MODEL — yalnız en son): tesis geneli working_hours.slot_duration.
  IF COALESCE(v_dur, 0) <= 0 THEN
    v_wh := v_court.wh;
    IF v_wh IS NOT NULL AND jsonb_typeof(v_wh) = 'object' THEN
      v_dur := NULLIF(v_wh->>'slot_duration', '')::int;
    END IF;
  END IF;
  -- Yedek 2 (E15/5a): hiçbir kaynak yoksa varsayılan 60.
  IF COALESCE(v_dur, 0) <= 0 THEN v_dur := 60; END IF;

  v_per_person := CEIL(COALESCE(v_total, 0) / (v_per * 2) * 1.05);

  v_slots := public._default_formation_slots(p_format, 'slot');
  v_away  := public._default_formation_slots(p_format, 'away');
  IF jsonb_array_length(v_slots) = 0 THEN
    RAISE EXCEPTION 'FORMAT_OUT_OF_RANGE: % desteklenmeyen format.', p_format;
  END IF;

  v_title := COALESCE(NULLIF(trim(p_payload->>'title'), ''), v_court.pitch_name || ' Maçı');

  -- 'duration'/'duration_minutes' istemciden GELSE BİLE ezilir: süre sunucu
  -- SSOT'udur. 'idempotencyKey' de düşürülür — player_create_match'in kendi
  -- claim'i bizim anahtarımızla ÇAKIŞIP DUPLICATE_IN_FLIGHT üretmesin.
  v_payload := (p_payload - 'slots' - 'awaySlots' - 'deferredProviders'
                          - 'invitedFriends' - 'duration' - 'duration_minutes'
                          - 'idempotencyKey')
    || jsonb_build_object(
      'title', v_title,
      'location', v_court.pitch_name || ' · ' || v_court.name,
      'date', to_char(p_date, 'YYYY-MM-DD'),
      'time', to_char(p_start_time, 'HH24:MI'),
      'price', v_per_person,
      'format', p_format,
      'visibility', p_visibility,
      'pitch_id', v_court.pid::text,
      'duration', v_dur::text || ' Dakika',
      'slots', v_slots,
      'awaySlots', v_away
    );
  v_match_id := public.player_create_match(v_payload);
  UPDATE public.matches SET
    court_id = p_court_id,
    -- Gece maçında fiziksel başlangıç ertesi gündür (otomatik bitiş/eşik doğru işlesin)
    starts_at = CASE WHEN v_night THEN ((p_date + 1) + p_start_time)::timestamptz ELSE starts_at END
  WHERE id = v_match_id;

  IF p_seed_booking_id IS NOT NULL THEN
    UPDATE public.pitch_bookings
       SET match_id = v_match_id, title = v_title
     WHERE id = p_seed_booking_id;
    v_booking_id := p_seed_booking_id;
  ELSE
    v_end := p_start_time + make_interval(mins => v_dur);
    v_booking_id := public.create_pitch_booking(
      v_court.pid, p_court_id, p_date, p_start_time, v_end,
      'APP_MATCH', NULL, NULL, NULL, v_title);
    UPDATE public.pitch_bookings
       SET match_id = v_match_id,
           status = 'CONFIRMED',
           auto_approved_at = COALESCE(auto_approved_at, now()),
           price = COALESCE(v_total, price)
     WHERE id = v_booking_id;
    IF v_deal IS NOT NULL THEN
      UPDATE public.pitch_flash_deals
         SET is_claimed = true, claimed_by = v_uid, claimed_at = now()
       WHERE id = v_deal AND NOT COALESCE(is_claimed, false);
      GET DIAGNOSTICS v_claimed = ROW_COUNT;
      -- Tesis geneli indirim başka kortta az önce kullanılmış olabilir:
      -- indirimli fiyatla İKİNCİ maç kurulmasın, her şey geri alınsın.
      IF v_claimed = 0 THEN
        RAISE EXCEPTION 'SLOT_TAKEN: Son dakika indirimi az önce kullanıldı — saati yeniden seçip dene.';
      END IF;
    END IF;
  END IF;

  FOR v_prov IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'deferredProviders', '[]'::jsonb)) LOOP
    IF v_prov->>'type' IS NOT NULL THEN
      IF jsonb_array_length(COALESCE(v_prov->'providerIds', '[]'::jsonb)) > 0 THEN
        FOR v_pid IN SELECT jsonb_array_elements_text(v_prov->'providerIds') LOOP
          v_providers := v_providers || jsonb_build_object('type', v_prov->>'type', 'providerId', v_pid);
        END LOOP;
      ELSE
        v_providers := v_providers || jsonb_build_object('type', v_prov->>'type');
      END IF;
    END IF;
  END LOOP;

  IF v_deposit > 0 THEN
    v_block := public.match_block_deposit(v_match_id, v_deposit, v_providers);
    v_minp := (v_block->>'min_players')::int;
  ELSE
    SELECT * INTO v_counts FROM public._match_player_counts(v_match_id);
    v_minp := v_counts.min_players;
    UPDATE public.matches SET
      deposit_status = 'NONE',
      deferred_providers = v_providers,
      min_players = v_minp,
      status = 'ACTIVE'
    WHERE id = v_match_id;
    FOR v_prov IN SELECT * FROM jsonb_array_elements(v_providers) LOOP
      BEGIN
        v_pid := NULLIF(v_prov->>'providerId', '');
        IF v_pid IS NOT NULL THEN
          PERFORM public.create_service_request(v_match_id, v_pid::uuid, (v_prov->>'type')::text);
        END IF;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Sağlayıcı talebi gönderilemedi (%): %', v_prov, SQLERRM;
      END;
    END LOOP;
  END IF;

  SELECT code INTO v_code FROM public.match_private_codes WHERE match_id = v_match_id;

  v_result := jsonb_build_object(
    'match_id', v_match_id,
    'booking_id', v_booking_id,
    'deposit', COALESCE(v_deposit, 0),
    'per_person', v_per_person,
    'total_price', COALESCE(v_total, 0),
    'private_code', v_code,
    'min_players', v_minp,
    'duration_minutes', v_dur,
    'deposit_status', COALESCE(v_block->>'deposit_status', 'NONE')
  );

  -- Claim'i sonuçla kapat: aynı anahtarla gelen tekrar gönderim artık bu
  -- sonucun aynısını alır, ikinci maç/rezervasyon/kapora oluşmaz.
  IF p_client_request_id IS NOT NULL THEN
    UPDATE public.owner_client_ops SET result = v_result
    WHERE client_request_id = p_client_request_id;
  END IF;

  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.create_match_atomic(uuid, date, time without time zone, text, text, jsonb, uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_match_atomic(uuid, date, time without time zone, text, text, jsonb, uuid, uuid)
  TO authenticated;
