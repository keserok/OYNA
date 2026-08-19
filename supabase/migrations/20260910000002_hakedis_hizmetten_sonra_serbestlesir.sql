-- ════════════════════════════════════════════════════════════════════════════
-- HAKEDİŞ, ÖDEMEDEN 14 GÜN SONRA DEĞİL, HİZMETTEN 14 GÜN SONRA SERBESTLEŞİR
-- ----------------------------------------------------------------------------
-- BULGU (19 Ağu 2026 — para kaçağı denetimi). `release_owner_earnings` bekleme
-- süresini İŞLEMİN OLUŞTUĞU ANDAN sayıyordu:
--     AND wt.created_at <= now() - make_interval(days => v_days)
-- Oysa rezervasyon takvimi BUGÜN + 90 GÜN açık (Karar #12) ve iptal hakkı maçın
-- saatine kadar sürüyor. İki sayı birbirini tutmuyor.
--
-- SOMUT KAÇAK ZİNCİRİ:
--   Gün  0 · Oyuncu 60 gün sonrası için saha tutar, kartla %30 kapora öder.
--   Gün 14 · Bekleme dolar; tesisin hakedişi COMPLETED olur.
--   Gün 15 · Tesis çekim talebi açar, yönetici IBAN'a havaleyi yapar.
--   Gün 50 · Oyuncu iptal eder. Maça 24 saatten fazla var → TAM İADE, kesinti
--            yok (2.13). Kart iadesi kuyruğa girer.
--   Gün 50 · reverse_booking_earnings negatif satır yazar; tesisin defteri
--            eksiye düşer.
--   SONUÇ  · OYNA oyuncuya tamamını iade etti, tesise parayı ÖDEDİ, komisyon
--            kazanmadı, üstelik iyzico iade edilen işlemin komisyonunu geri
--            vermez. Tesisin bir daha kazancı olmazsa (ya da hesabı kapanırsa)
--            eksi bakiye TAHSİL EDİLEMEZ.
--   Örnek büyüklük: 1.000 ₺ saha · %30 kapora 300 ₺ · tesis payı 255 ₺ →
--   olay başına ~265 ₺ kayıp; hiç elimizde durmamış bir para için.
--
--   Bu bir kaza olabileceği gibi KASITLI da işletilebilir: sahte tesis + sahte
--   oyuncu, uzak tarihe rezervasyon, 15. günde çekim, sonra iptal.
--
-- KÖK SEBEP: 14 günlük bekleme bir İTİRAZ PENCERESİDİR. İtiraz penceresi para
-- geldiğinde değil, HİZMET VERİLDİĞİNDE başlar. Sayaç yanlış olaydan başlıyordu.
--
-- YENİ KURAL: serbestleşme anı = (hizmetin bittiği an) + N gün; hizmet tarihi
-- bilinmiyorsa eski davranış (oluşma anı + N gün) korunur ve serbestleşme HİÇBİR
-- durumda oluşma anı + N gün'den ERKEN olamaz.
--   · BOOKING_EARNING → booking_payments → pitch_bookings.(booking_date+end_time)
--   · MATCH_EARNING / SERVICE_EARNING → matches.starts_at
--     (reference_type MATCH ise doğrudan, PAYMENT_INTENT ise niyet üzerinden)
--
-- ETKİSİ: yakın tarihli rezervasyonlarda ödeme günü ile maç günü arasındaki
-- fark kadar (çoğunlukla 0-3 gün) gecikme olur. Uzak tarihli rezervasyonlarda
-- ise hakediş, maç oynanmadan ASLA ödenmez — kaçağın kapandığı yer burasıdır.
--
-- DEĞİŞMEYEN: bekleme gün sayısı (settings.owner_payout_days, varsayılan 14),
-- negatif düzeltme mantığı, chargeback aracı, çekim akışı. Yalnız SAYACIN
-- BAŞLADIĞI AN değişir.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Hizmetin bittiği an — tek kaynak ───────────────────────────────────────
-- Hakediş satırından hizmet tarihine giden üç yolu tek yerde toplar. NULL
-- dönerse "hizmet tarihi bilinmiyor" demektir ve eski davranış uygulanır.
CREATE OR REPLACE FUNCTION public._hakedis_hizmet_sonu(
  p_type text, p_reference_type text, p_reference_id uuid
) RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    -- Saha kiralama geliri: referans booking_payments satırıdır.
    WHEN p_type = 'BOOKING_EARNING' AND p_reference_type = 'BOOKING' THEN (
      SELECT (b.booking_date + b.end_time)::timestamptz
      FROM public.booking_payments bp
      JOIN public.pitch_bookings b ON b.id = bp.booking_id
      WHERE bp.id = p_reference_id
    )
    -- Maç/hizmet geliri: doğrudan maça bağlı.
    WHEN p_reference_type = 'MATCH' THEN (
      SELECT m.starts_at FROM public.matches m WHERE m.id = p_reference_id
    )
    -- Maç/hizmet geliri: ödeme niyeti üzerinden maça bağlı.
    WHEN p_reference_type = 'PAYMENT_INTENT' THEN (
      SELECT m.starts_at
      FROM public.payment_intents i
      JOIN public.matches m ON m.id = i.match_id
      WHERE i.id = p_reference_id
    )
    ELSE NULL
  END;
$$;

REVOKE ALL ON FUNCTION public._hakedis_hizmet_sonu(text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._hakedis_hizmet_sonu(text, text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.release_owner_earnings()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_days     integer;
  v_released integer;
BEGIN
  SELECT COALESCE(owner_payout_days, 14) INTO v_days FROM public.settings LIMIT 1;
  v_days := COALESCE(v_days, 14);

  WITH released AS (
    UPDATE public.wallet_transactions wt SET status = 'COMPLETED'
    WHERE wt.balance_type = 'EARNINGS'
      AND wt.status = 'PENDING'
      AND wt.type IN ('MATCH_EARNING','BOOKING_EARNING')
      -- Sayaç, hizmetin bittiği andan işler. Hizmet tarihi bilinmiyorsa eski
      -- davranışa (oluşma anı) düşülür; hiçbir durumda oluşma anı + N gün'den
      -- erken serbestleşmez.
      AND GREATEST(
            wt.created_at,
            COALESCE(
              public._hakedis_hizmet_sonu(wt.type, wt.reference_type, wt.reference_id),
              wt.created_at)
          ) <= now() - make_interval(days => v_days)
    RETURNING wt.id
  )
  SELECT COUNT(*) INTO v_released FROM released;

  RETURN jsonb_build_object('released_count', v_released, 'payout_days', v_days);
END;
$$;

REVOKE ALL ON FUNCTION public.release_owner_earnings() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_owner_earnings() TO service_role;

-- ── Doğrulama (prensip 7.7): kaçak zinciri gerçek veriyle kurulup kapatılır ──
DO $$
DECLARE
  v_user uuid; v_pitch uuid; v_court uuid; v_owner uuid;
  v_b uuid := '00000000-dead-4bee-8f00-00000000000a';
  v_bp uuid;
  v_wt uuid;
  v_durum text;
BEGIN
  SELECT p.id INTO v_user FROM public.profiles p WHERE p.is_demo LIMIT 1;
  SELECT s.id, c.id, s.owner_id INTO v_pitch, v_court, v_owner
  FROM public.pitches s JOIN public.courts c ON c.pitch_id = s.id
  WHERE s.owner_id IS NOT NULL LIMIT 1;

  IF v_user IS NULL OR v_pitch IS NULL THEN
    RAISE NOTICE 'DOGRULAMA ATLANDI: demo profil/saha yok (sifirdan kurulum)';
    RETURN;
  END IF;

  -- 60 gün sonrası için bir rezervasyon ve ona bağlı bir hakediş kur.
  INSERT INTO public.pitch_bookings (id, pitch_id, court_id, user_id, booking_date,
    start_time, end_time, status, source, price, paid_amount, deposit_amount)
  VALUES (v_b, v_pitch, v_court, v_user, current_date + 60, '10:00', '11:00',
          'CONFIRMED', 'APP_BOOKING', 1000, 300, 300);

  -- source NULL bırakılır: credit_owner_booking_earning yalnız OWNER_MANUAL'i
  -- eler, NULL onun için "uygulama ödemesi"dir.
  INSERT INTO public.booking_payments (booking_id, amount, payment_method)
  VALUES (v_b, 300, 'CARD')
  RETURNING id INTO v_bp;

  -- Hakedişi 20 GÜN ÖNCE oluşmuş gibi yaz: eski kural bunu SERBEST bırakırdı
  -- (20 > 14), yeni kural maç oynanmadığı için bırakmamalı.
  INSERT INTO public.wallet_transactions
    (user_id, amount, type, balance_type, status, reference_type, reference_id, description, created_at)
  VALUES (v_owner, 255, 'BOOKING_EARNING', 'EARNINGS', 'PENDING', 'BOOKING', v_bp,
          '_kacak_kaniti', now() - interval '20 days')
  RETURNING id INTO v_wt;

  PERFORM public.release_owner_earnings();

  SELECT status INTO v_durum FROM public.wallet_transactions WHERE id = v_wt;
  IF v_durum <> 'PENDING' THEN
    RAISE EXCEPTION 'DOGRULAMA: 60 gun sonraki mac icin hakedis serbest birakildi (%) — kacak acik', v_durum;
  END IF;

  -- Aynı satır, maçı GEÇMİŞE alınca serbestleşmeli (kural fazla kısıtlamıyor).
  UPDATE public.pitch_bookings SET booking_date = current_date - 20 WHERE id = v_b;
  PERFORM public.release_owner_earnings();

  SELECT status INTO v_durum FROM public.wallet_transactions WHERE id = v_wt;
  IF v_durum <> 'COMPLETED' THEN
    RAISE EXCEPTION 'DOGRULAMA: 20 gun once oynanmis mac icin hakedis hala serbest degil (%)', v_durum;
  END IF;

  -- Tetikleyicinin kendi ürettiği hakediş satırı da dahil, iz bırakmadan sil.
  DELETE FROM public.wallet_transactions
   WHERE reference_type = 'BOOKING' AND reference_id = v_bp;
  DELETE FROM public.booking_payments WHERE id = v_bp;
  DELETE FROM public.pitch_bookings WHERE id = v_b;

  RAISE NOTICE 'DOGRULAMA TAMAM: hakedis artik hizmetten sonra serbestlesiyor.';
END $$;
