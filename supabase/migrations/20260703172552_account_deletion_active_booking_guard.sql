-- ═══════════════════════════════════════════════════════════════════════
-- Master Prensipler §3.1 uyumu: "Hesap silme — aktif rezervasyon varken
-- engellenir." + admin bildirimindeki süre metnini app_config'teki gerçek
-- bekleme süresiyle (varsayılan 7 gün) hizala.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.request_account_deletion()
RETURNS BOOLEAN AS $$
DECLARE
  v_wait_days TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Giriş yapmanız gerekiyor.';
  END IF;

  -- §3.1: Gelecekte aktif (iptal edilmemiş) saha rezervasyonu varken silinemez
  IF EXISTS (
    SELECT 1 FROM public.pitch_bookings
    WHERE user_id = auth.uid()
      AND status IN ('PENDING', 'CONFIRMED')
      AND (booking_date > CURRENT_DATE
           OR (booking_date = CURRENT_DATE AND end_time > CURRENT_TIME))
  ) THEN
    RAISE EXCEPTION 'Aktif bir saha rezervasyonun varken hesabını silemezsin. Önce rezervasyonunu iptal et veya tamamlanmasını bekle.';
  END IF;

  -- Aktif (bloke/tahsil edilmiş) maç katılımı varken de silinemez
  IF EXISTS (
    SELECT 1
    FROM public.payment_intents pi
    JOIN public.matches m ON m.id = pi.match_id
    WHERE pi.user_id = auth.uid()
      AND pi.status IN ('PENDING', 'BLOCKED', 'CAPTURED')
      AND m.status IN ('GATHERING', 'CONFIRMED', 'PLAYING', 'LIVE')
  ) THEN
    RAISE EXCEPTION 'Yaklaşan bir maça katılımın (blokaj/ödeme) varken hesabını silemezsin. Önce maçtan ayrıl.';
  END IF;

  UPDATE public.profiles SET
    account_deletion_requested_at = NOW(),
    updated_at = NOW()
  WHERE id = auth.uid();

  -- Bekleme süresi tek kaynaktan (app_config.value jsonb), metin sabiti değil
  SELECT COALESCE(
    (SELECT value #>> '{}' FROM public.app_config WHERE key = 'account_deletion_wait_days'),
    '7'
  ) INTO v_wait_days;

  INSERT INTO public.notifications (user_id, title, body, type_key)
  SELECT
    id,
    'Hesap Silme Talebi',
    'Bir kullanıcı hesap silme talebinde bulundu. ' || v_wait_days || ' gün içinde işleme alınmalı.',
    'ACCOUNT_DELETION_REQUEST'
  FROM public.profiles
  WHERE is_admin = true;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
