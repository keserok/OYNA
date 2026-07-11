-- ============================================================================
-- Rezervasyon-ödeme-bildirim hattı:
--  1) record_app_deposit_payment: oyuncunun ödediği kapora booking_payments'e
--     işlenir, paid_amount/payment_status güncellenir (önceden kapora hiçbir
--     yere kaydedilmiyordu — owner panelinde 0₺ görünüyordu)
--  2) notify_pitch_owner: tesis sahibine bildirim yazan iç yardımcı
--  3) review_pitch_change_request: karar sonrası owner'a bildirim
--  4) Kalite notu onayı (grades_status→approved) → owner'a bildirim (trigger)
--  5) Tesis doğrulama sonucu (verification_status değişimi) → owner'a bildirim (trigger)
-- ============================================================================

-- ─── 1) Uygulama içi kapora kaydı ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_app_deposit_payment(
  p_booking_id uuid,
  p_amount numeric
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_b public.pitch_bookings%ROWTYPE;
  v_new_paid numeric;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Giriş gerekli.';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT';
  END IF;

  SELECT * INTO v_b FROM pitch_bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND';
  END IF;
  -- Yalnızca rezervasyonun sahibi kendi kaporasını işleyebilir
  IF v_b.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Bu rezervasyon size ait değil.';
  END IF;
  IF v_b.status = 'CANCELLED' THEN
    RAISE EXCEPTION 'BOOKING_CANCELLED';
  END IF;
  -- Kapora üst sınırı: toplam fiyatı aşan tahsilat kaydedilemez
  IF COALESCE(v_b.paid_amount, 0) + p_amount > COALESCE(v_b.price, 0) THEN
    RAISE EXCEPTION 'AMOUNT_EXCEEDS_PRICE';
  END IF;

  INSERT INTO booking_payments (booking_id, amount, payment_method, note, recorded_by)
  VALUES (p_booking_id, p_amount, 'CARD', 'Uygulama içi kapora ödemesi', auth.uid());

  v_new_paid := COALESCE(v_b.paid_amount, 0) + p_amount;
  UPDATE pitch_bookings SET
    paid_amount = v_new_paid,
    payment_status = CASE WHEN v_new_paid >= COALESCE(price, 0) THEN 'PAID' ELSE 'PARTIAL' END
  WHERE id = p_booking_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_app_deposit_payment(uuid, numeric) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_app_deposit_payment(uuid, numeric) TO authenticated;

-- ─── 2) Owner bildirim yardımcısı ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_pitch_owner(
  p_pitch_id uuid,
  p_type_key text,
  p_title text,
  p_body text,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_owner uuid;
BEGIN
  SELECT owner_id INTO v_owner FROM pitches WHERE id = p_pitch_id;
  IF v_owner IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO notifications (id, user_id, type_key, title, body, payload, deep_link, is_read)
  VALUES (
    gen_random_uuid(), v_owner, p_type_key, p_title, p_body,
    p_payload || jsonb_build_object('pitch_id', p_pitch_id),
    'OWNER_PANEL', false
  );
EXCEPTION WHEN others THEN
  -- Bildirim yazılamaması ana işlemi asla bozmasın
  RAISE WARNING 'notify_pitch_owner: %', SQLERRM;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_pitch_owner(uuid, text, text, text, jsonb) FROM anon, authenticated, PUBLIC;

-- ─── 3) Change request kararı → bildirim ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.review_pitch_change_request(
  p_request_id uuid,
  p_approve boolean,
  p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_req public.pitch_change_requests%ROWTYPE;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Bu işlem için admin yetkisi gerekli';
  END IF;
  SELECT * INTO v_req FROM pitch_change_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Değişiklik talebi bulunamadı';
  END IF;
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'Talep zaten sonuçlandırılmış';
  END IF;

  IF p_approve THEN
    UPDATE pitches SET
      name      = COALESCE(v_req.changes->>'name', name),
      city      = COALESCE(v_req.changes->>'city', city),
      district  = COALESCE(v_req.changes->>'district', district),
      address   = COALESCE(v_req.changes->>'address', address),
      latitude  = COALESCE((v_req.changes->>'latitude')::double precision, latitude),
      longitude = COALESCE((v_req.changes->>'longitude')::double precision, longitude)
    WHERE id = v_req.pitch_id;
  END IF;

  UPDATE pitch_change_requests SET
    status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
    review_note = p_note,
    reviewed_by = (SELECT auth.uid()),
    reviewed_at = now()
  WHERE id = p_request_id;

  INSERT INTO pitch_content_audit (pitch_id, actor_id, action, detail)
  VALUES (
    v_req.pitch_id,
    (SELECT auth.uid()),
    CASE WHEN p_approve THEN 'change_request_approved' ELSE 'change_request_rejected' END,
    jsonb_build_object('request_id', p_request_id, 'changes', v_req.changes, 'note', p_note)
  );

  PERFORM notify_pitch_owner(
    v_req.pitch_id,
    'pitch_change_request_result',
    CASE WHEN p_approve THEN 'Değişiklik talebin onaylandı' ELSE 'Değişiklik talebin reddedildi' END,
    CASE WHEN p_approve
      THEN 'Tesisinin ad/konum değişikliği uygulandı ve vitrine yansıdı.'
      ELSE 'Tesisinin ad/konum değişikliği reddedildi.' || COALESCE(' Sebep: ' || p_note, '')
    END,
    jsonb_build_object('request_id', p_request_id, 'approved', p_approve)
  );
END;
$$;

-- ─── 4) Kalite notu onayı → bildirim ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_on_grade_approval()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.grades_status = 'approved' AND OLD.grades_status IS DISTINCT FROM 'approved' THEN
    PERFORM notify_pitch_owner(
      NEW.pitch_id,
      'pitch_grades_approved',
      'Kalite notların onaylandı',
      NEW.name || ' için beyan ettiğin kalite notları OYNA ekibince onaylandı; artık vitrinde rozet olarak görünüyor.',
      jsonb_build_object('court_id', NEW.id)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_grade_approval ON public.courts;
CREATE TRIGGER trg_notify_grade_approval
  AFTER UPDATE ON public.courts
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_grade_approval();

-- ─── 5) Tesis doğrulama sonucu → bildirim ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_on_pitch_verification()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.verification_status IS DISTINCT FROM OLD.verification_status
     AND NEW.verification_status IN ('approved', 'rejected') THEN
    PERFORM notify_pitch_owner(
      NEW.id,
      'pitch_verification_result',
      CASE WHEN NEW.verification_status = 'approved'
        THEN 'Tesisin onaylandı 🎉' ELSE 'Tesis başvurun reddedildi' END,
      CASE WHEN NEW.verification_status = 'approved'
        THEN NEW.name || ' artık Saha Vitrini''nde yayında. Vitrin Skoru''nu yükselterek daha üst sıralarda görünebilirsin.'
        ELSE NEW.name || ' başvurusu reddedildi.' || COALESCE(' Sebep: ' || NEW.verification_notes, '')
      END,
      jsonb_build_object('verification_status', NEW.verification_status)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_pitch_verification ON public.pitches;
CREATE TRIGGER trg_notify_pitch_verification
  AFTER UPDATE ON public.pitches
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_pitch_verification();

REVOKE EXECUTE ON FUNCTION public.notify_on_grade_approval() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_on_pitch_verification() FROM anon, authenticated, PUBLIC;
