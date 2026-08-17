-- ═══════════════════════════════════════════════════════════════════════════
-- KAPTAN İPTALİ ONARIMI (BULGU-4/5/6, 17 Ağu 2026 canlı testi)
--
-- Canlı testte kaptan iptali üç ayrı yara verdi:
--
-- BULGU-4: BLOCKED dalı cevapta 'refund': 0 döndürüyordu — kuyruğa 449,72 ₺
--   yazılmışken. Ekran bu sayıyı gösterirse yalan söyler (kural 2.9: verilen
--   söz = sunucu davranışı).
--
-- BULGU-5 (CİDDİ): Hiçbir iptal dalı bağlı APP_MATCH rezervasyonunu iptal
--   etmiyordu. Maç iptal oluyor, SLOT sahibin takviminde DOLU kalıyordu —
--   hayalet rezervasyon: başka oyuncu o saati kiralayamaz, sahip elle
--   temizlemek zorunda. (Süpürücü kendi yolunda rezervasyonu kapatıyordu;
--   kaptan yolu unutulmuştu.)
--
-- BULGU-6: deposit_status NONE / AWAITING_PAYMENT / NULL maçlarda iptal
--   ok:false 'NO_DEPOSIT' dönüyordu — yani KAPORASIZ maç hiç iptal
--   edilemiyordu. Lansman öncesi kapora kapalıyken (match_deposit_enabled
--   = false) bu, TÜM kaptan iptallerinin kırık olması demekti. Ödeme
--   ekranından vazgeçen kaptan da (AWAITING_PAYMENT) 30 dk süpürücüyü
--   beklemek zorundaydı.
--
-- ÇÖZÜM: match_cancel_by_captain yeniden yazılır —
--   • her başarı dalında bağlı rezervasyon(lar) iptal edilir (süpürücüyle
--     aynı desen), slot sahibin takviminde anında açılır;
--   • gerçek iade tutarı defterden okunup cevapta döner (kart kuyruğu ve
--     eski iade-kredisi yolunun ikisini de kapsar);
--   • kaporasız/ödenmemiş maçlar para oynatmadan iptal olur (yeni
--     outcome'lar: CANCELLED_NO_DEPOSIT, CANCELLED_UNPAID, geç kalan
--     BLOCKED iptali NO_REFUND_LATE olarak adlandırılır);
--   • aynı maça ikinci iptal çağrısı idempotent (ALREADY_CANCELLED).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.match_cancel_by_captain(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_match RECORD;
  v_serbest numeric; v_hours numeric; v_far boolean;
  v_iptal int := 0;
  v_res jsonb; v_refund numeric := 0; v_outcome text;
BEGIN
  SELECT id, "creatorId", captain_id, deposit_intent_id, deposit_status,
         deposit_amount, starts_at, pitch_id, status
    INTO v_match FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF COALESCE(v_match."creatorId", v_match.captain_id) IS DISTINCT FROM v_uid AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  -- İdempotent: zaten iptalse ikinci çağrı hata değil, tekrar da değil.
  IF v_match.status = 'CANCELLED' THEN
    RETURN jsonb_build_object('ok', true, 'outcome', 'ALREADY_CANCELLED', 'refund', 0);
  END IF;

  SELECT full_hours INTO v_serbest FROM public._pitch_refund_tiers(v_match.pitch_id);
  v_serbest := COALESCE(v_serbest, 24);
  v_hours := CASE WHEN v_match.starts_at IS NULL THEN 999
                  ELSE EXTRACT(EPOCH FROM (v_match.starts_at - timezone('utc', now()))) / 3600 END;
  v_far := v_hours >= v_serbest;

  IF v_match.deposit_status = 'BLOCKED' THEN
    -- Para kuralını match_void_deposit uygular (≥serbest saat: PSP kesintili
    -- iade; geç: kapora yanar). Gerçek iade tutarı defterden okunur.
    v_res := public.match_void_deposit(p_match_id, 'Kaptan iptali.');
    IF NOT COALESCE((v_res->>'ok')::boolean, false) THEN
      RETURN v_res;  -- para dalı başarısızsa rezervasyona DOKUNMA (yarım iş yok)
    END IF;
    v_outcome := CASE WHEN COALESCE((v_res->>'late')::boolean, false)
                      THEN 'NO_REFUND_LATE' ELSE 'VOIDED' END;
    SELECT w.amount INTO v_refund
    FROM public.wallet_transactions w
    WHERE w.reference_type = 'PAYMENT_INTENT'
      AND w.reference_id = v_match.deposit_intent_id
      AND w.type = 'DEPOSIT'
    ORDER BY w.created_at DESC LIMIT 1;
    v_refund := COALESCE(v_refund, 0);

  ELSIF v_match.deposit_status = 'CAPTURED' THEN
    IF v_far THEN
      UPDATE public.payment_intents SET status = 'REFUNDED', voided_at = timezone('utc', now()),
        void_reason = format('Kaptan iptali (≥%ss) — iade.', v_serbest)
        WHERE id = v_match.deposit_intent_id;
      PERFORM public._refund_wallet_escrow(v_match.deposit_intent_id,
        'Kaptan iptali — kapora iade edildi');
      UPDATE public.wallet_transactions
         SET status = 'CANCELLED'
       WHERE match_id = p_match_id AND type = 'MATCH_EARNING' AND status = 'PENDING';
      GET DIAGNOSTICS v_iptal = ROW_COUNT;
      UPDATE public.matches SET deposit_status = 'REFUNDED', status = 'CANCELLED',
        cancel_reason = format('Kaptan iptali (≥%ss) — kapora iade edildi.', v_serbest)
       WHERE id = p_match_id;
      v_outcome := 'REFUNDED';
      SELECT w.amount INTO v_refund
      FROM public.wallet_transactions w
      WHERE w.reference_type = 'PAYMENT_INTENT'
        AND w.reference_id = v_match.deposit_intent_id
        AND w.type = 'DEPOSIT'
      ORDER BY w.created_at DESC LIMIT 1;
      v_refund := COALESCE(v_refund, 0);
    ELSE
      UPDATE public.matches SET status = 'CANCELLED',
        cancel_reason = format('Kaptan iptali (<%ss) — iade yok (no-show).', v_serbest)
       WHERE id = p_match_id;
      UPDATE public.profiles
        SET trust_score = GREATEST(COALESCE(trust_score,5.0) - 0.5, 0)
        WHERE id = v_uid;
      v_outcome := 'NO_REFUND_PENALTY';
    END IF;

  ELSIF v_match.deposit_status = 'AWAITING_PAYMENT' THEN
    -- Ödeme ekranından vazgeçen kaptan süpürücüyü BEKLEMEZ: para hiç
    -- çekilmedi, niyet kapanır, maç düşer (süpürücüyle aynı desen).
    UPDATE public.payment_intents
       SET status = 'VOIDED', voided_at = timezone('utc', now()),
           void_reason = 'Kaptan kapora ödemeden iptal etti.'
     WHERE match_id = p_match_id AND related_entity_type = 'MATCH_DEPOSIT' AND status = 'PENDING';
    UPDATE public.matches
       SET status = 'CANCELLED', deposit_status = 'NONE',
           cancel_reason = 'Kaptan iptali — kapora ödenmemişti.'
     WHERE id = p_match_id;
    v_outcome := 'CANCELLED_UNPAID';

  ELSE
    -- Kaporasız maç (NONE/NULL): para oynamaz, iptal engellenmez.
    UPDATE public.matches
       SET status = 'CANCELLED',
           cancel_reason = 'Kaptan iptali.'
     WHERE id = p_match_id;
    v_outcome := 'CANCELLED_NO_DEPOSIT';
  END IF;

  -- HER başarı dalında: bağlı rezervasyon iptal — slot sahibin takviminde
  -- anında açılır (BULGU-5; süpürücünün deseniyle birebir).
  UPDATE public.pitch_bookings
     SET status = 'CANCELLED', cancelled_at = now(),
         cancellation_reason = 'Maç iptal edildi (kaptan).'
   WHERE match_id = p_match_id AND status <> 'CANCELLED';

  RETURN jsonb_build_object(
    'ok', true, 'outcome', v_outcome, 'refund', v_refund,
    'free_hours', v_serbest,
    'owner_earning_cancelled', CASE WHEN v_iptal > 0 THEN v_iptal ELSE NULL END
  );
END;
$function$;

-- ── KENDİNİ DOĞRULAMA: kaporasız maç + rezervasyon, kaptan olarak iptal ───
DO $$
DECLARE
  v_captain uuid; v_pitch uuid; v_court uuid;
  v_mid uuid := '00000000-dead-4bee-8f00-000000000002';
  v_bid uuid := '00000000-dead-4bee-8f00-000000000003';
  v_res jsonb; v_mstat text; v_dstat text; v_bstat text;
BEGIN
  SELECT p.id INTO v_captain FROM public.profiles p WHERE p.is_demo LIMIT 1;
  SELECT s.id, c.id INTO v_pitch, v_court
  FROM public.pitches s JOIN public.courts c ON c.pitch_id = s.id
  WHERE s.is_demo LIMIT 1;
  IF v_captain IS NULL OR v_pitch IS NULL THEN
    RAISE EXCEPTION 'DOĞRULAMA: demo profil/saha yok — kanıt kurulamadı';
  END IF;

  INSERT INTO public.matches (id, title, location, time, date, price, status,
    captain_id, "creatorId", format, deposit_status, deposit_amount, "isDemo",
    pitch_id, court_id, starts_at)
  VALUES (v_mid, '_iptal_kaniti', '-', '21:00', current_date + 2, 0, 'ACTIVE',
    v_captain, v_captain, '7v7', 'NONE', 0, true,
    v_pitch, v_court, timezone('utc', now()) + interval '48 hours');

  INSERT INTO public.pitch_bookings (id, pitch_id, court_id, match_id, user_id,
    booking_date, start_time, end_time, status, source, price)
  VALUES (v_bid, v_pitch, v_court, v_mid, v_captain,
    current_date + 2, '21:00', '22:00', 'CONFIRMED', 'APP_MATCH', 0);

  -- Kaptan kimliğine bürün (auth.uid() bu claim'den okur)
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_captain, 'role', 'authenticated')::text, true);

  v_res := public.match_cancel_by_captain(v_mid);

  SELECT m.status, m.deposit_status INTO v_mstat, v_dstat FROM public.matches m WHERE m.id = v_mid;
  SELECT b.status INTO v_bstat FROM public.pitch_bookings b WHERE b.id = v_bid;

  IF NOT COALESCE((v_res->>'ok')::boolean, false)
     OR (v_res->>'outcome') <> 'CANCELLED_NO_DEPOSIT' THEN
    RAISE EXCEPTION 'DOĞRULAMA: kaporasız iptal beklenen sonucu vermedi: %', v_res;
  END IF;
  IF v_mstat <> 'CANCELLED' THEN
    RAISE EXCEPTION 'DOĞRULAMA: maç CANCELLED olmadı (%)', v_mstat;
  END IF;
  IF v_bstat <> 'CANCELLED' THEN
    RAISE EXCEPTION 'DOĞRULAMA: bağlı rezervasyon iptal edilmedi (%) — hayalet slot!', v_bstat;
  END IF;

  -- İkinci çağrı idempotent mi?
  v_res := public.match_cancel_by_captain(v_mid);
  IF (v_res->>'outcome') <> 'ALREADY_CANCELLED' THEN
    RAISE EXCEPTION 'DOĞRULAMA: ikinci iptal idempotent değil: %', v_res;
  END IF;

  DELETE FROM public.pitch_bookings WHERE id = v_bid;
  DELETE FROM public.matches WHERE id = v_mid;
  PERFORM set_config('request.jwt.claims', NULL, true);

  RAISE NOTICE 'DOĞRULAMA TAMAM: kaporasız iptal + rezervasyon kapanışı + idempotenlik kanıtlandı.';
END $$;
