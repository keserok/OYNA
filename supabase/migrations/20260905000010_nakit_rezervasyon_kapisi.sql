-- ═══════════════════════════════════════════════════════════════════════════
-- NAKİT REZERVASYON KAPISI (kurucu kararı, 17 Ağu 2026 — BULGU-11 çözümü)
--
-- KARAR: Uygulamadan saha rezervasyonu YALNIZ kartla kapora ödenerek
-- yapılır. "Tesiste ödemeli" (nakit) rezervasyon uygulamadan alınmaz —
-- online ödemesi kapalı sahada oyuncu tesisi arar. Böylece:
--   • "Kapora bekliyor" diye asılı duran, hiçbir zaman uygulama içinde
--     ödenemeyecek rezervasyon durumu DOĞAMAZ (bulgunun kökü),
--   • no-show riski taşıyan teminatsız rezervasyon kalmaz,
--   • rezervasyon = güvence altına alınmış slot sözü korunur.
--
-- KAPSAM (bilinçli dar):
--   • YALNIZ source='APP_BOOKING' kısılır (oyuncunun saha kiralaması).
--   • APP_MATCH serbest: maç rezervasyonunun güvencesi maç kaporası
--     motorudur (kapora açıkken karttan tahsil edilir; kapora kapalı
--     lansman-öncesi dönemde maç kurma akışı kırılmamalıdır).
--   • OWNER_MANUAL/abonelik serbest: sahibin elle yönetimi (2.11).
--
-- TEK KAYNAK: "online ödeme var mı" kararını resolve_payment_mode verir
-- (sağlayıcı canlı mı × global mod × saha modu). Kapı aynı fonksiyonu
-- okur; istemci ekranı ile sunucu kapısı AYNI cevabı görür (2.9).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.b_nakit_rezervasyon_kapisi()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_mode jsonb;
BEGIN
  IF NEW.source = 'APP_BOOKING' THEN
    v_mode := public.resolve_payment_mode(NEW.pitch_id);
    IF NOT COALESCE((v_mode->>'online_allowed')::boolean, false) THEN
      RAISE EXCEPTION 'CASH_BOOKING_DISABLED: Uygulamadan rezervasyon kartla kapora ödenerek yapılır; bu tesiste online ödeme şu anda kapalı. Rezervasyon için tesisi arayabilirsin.';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS b_nakit_rezervasyon_kapisi ON public.pitch_bookings;
CREATE TRIGGER b_nakit_rezervasyon_kapisi
  BEFORE INSERT ON public.pitch_bookings
  FOR EACH ROW EXECUTE FUNCTION public.b_nakit_rezervasyon_kapisi();

-- ── KENDİNİ DOĞRULAMA ─────────────────────────────────────────────────────
-- Canlı şu an bekleme duruşunda (global CASH_ONLY) → online_allowed=false:
-- APP_BOOKING reddedilmeli, OWNER_MANUAL ve APP_MATCH serbest kalmalı.
DO $$
DECLARE
  v_user uuid; v_pitch uuid; v_court uuid;
  v_b uuid := '00000000-dead-4bee-8f00-000000000009';
  v_reddetti boolean := false;
  v_online boolean;
BEGIN
  SELECT p.id INTO v_user FROM public.profiles p WHERE p.is_demo LIMIT 1;
  SELECT s.id, c.id INTO v_pitch, v_court
  FROM public.pitches s JOIN public.courts c ON c.pitch_id = s.id
  WHERE s.name LIKE 'Denek%' LIMIT 1;
  IF v_user IS NULL OR v_pitch IS NULL THEN
    -- Sıfırdan kurulum (preview replay): demo veri yok — veri kanıtı atlanır.
    -- Canlıda bu iş 20260817094824 olarak veriyle kanıtlandı.
    RAISE NOTICE 'DOĞRULAMA ATLANDI: demo profil/saha yok (sıfırdan kurulum) — veri kanıtı canlıda verildi';
    RETURN;
  END IF;

  v_online := COALESCE((public.resolve_payment_mode(v_pitch)->>'online_allowed')::boolean, false);

  -- 1) APP_BOOKING: online kapalıysa kapı reddetmeli; açıksa kabul etmeli.
  BEGIN
    INSERT INTO public.pitch_bookings (id, pitch_id, court_id, user_id, booking_date,
      start_time, end_time, status, source, price)
    VALUES (v_b, v_pitch, v_court, v_user, current_date + 3, '09:00', '10:00',
      'CONFIRMED', 'APP_BOOKING', 0);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'CASH_BOOKING_DISABLED%' THEN RAISE; END IF;
    v_reddetti := true;
  END;
  IF v_online AND v_reddetti THEN
    RAISE EXCEPTION 'DOĞRULAMA: online AÇIKKEN kapı APP_BOOKING''i reddetti — kapı fazla sıkı!';
  END IF;
  IF NOT v_online AND NOT v_reddetti THEN
    RAISE EXCEPTION 'DOĞRULAMA: online KAPALIYKEN APP_BOOKING kabul edildi — kapı çalışmıyor!';
  END IF;

  -- 2) OWNER_MANUAL her durumda serbest (sahibin elle yönetimi, 2.11)
  INSERT INTO public.pitch_bookings (id, pitch_id, court_id, user_id, booking_date,
    start_time, end_time, status, source, price, customer_name)
  VALUES ('00000000-dead-4bee-8f00-00000000000a', v_pitch, v_court, v_user,
    current_date + 3, '10:00', '11:00', 'CONFIRMED', 'OWNER_MANUAL', 0, '_kapi_kaniti');

  -- 3) APP_MATCH her durumda serbest (maç güvencesi kapora motorunda)
  INSERT INTO public.pitch_bookings (id, pitch_id, court_id, user_id, booking_date,
    start_time, end_time, status, source, price)
  VALUES ('00000000-dead-4bee-8f00-00000000000b', v_pitch, v_court, v_user,
    current_date + 3, '11:00', '12:00', 'CONFIRMED', 'APP_MATCH', 0);

  DELETE FROM public.pitch_bookings WHERE id IN (v_b,
    '00000000-dead-4bee-8f00-00000000000a', '00000000-dead-4bee-8f00-00000000000b');

  RAISE NOTICE 'DOĞRULAMA TAMAM: kapı doğru (online=% iken APP_BOOKING red=%), elle yönetim ve maç serbest.', v_online, v_reddetti;
END $$;
