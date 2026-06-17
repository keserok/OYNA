-- ==============================================================================
-- OYNA Owner Panel — Faz 0-2 sertleştirme
-- 1) ensure_owner_account trigger + backfill
-- 2) Demo tesis flash deal / slot kapatma RLS
-- 3) owner_has_entitlement anon erişimini kapat
-- 4) owner_cancel_confirmed_booking RPC (iptal + iade tek noktada)
-- 5) owner_accounts billing_email UPDATE politikası
-- ==============================================================================

-- ─── SaaS hesabı otomatik açılışı ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ensure_owner_account()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role = 'OWNER' OR (NEW.roles IS NOT NULL AND NEW.roles @> '["OWNER"]'::jsonb) THEN
    INSERT INTO public.owner_accounts (owner_user_id)
    VALUES (NEW.id)
    ON CONFLICT (owner_user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_owner_account ON public.profiles;
CREATE TRIGGER trg_ensure_owner_account
AFTER INSERT OR UPDATE OF role, roles ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.ensure_owner_account();

INSERT INTO public.owner_accounts (owner_user_id)
SELECT id FROM public.profiles
WHERE role = 'OWNER' OR (roles IS NOT NULL AND roles @> '["OWNER"]'::jsonb)
ON CONFLICT (owner_user_id) DO NOTHING;

-- ─── owner_accounts: billing email güncelleme ───────────────────────────────
DROP POLICY IF EXISTS "Owners update own billing email" ON public.owner_accounts;
CREATE POLICY "Owners update own billing email" ON public.owner_accounts FOR UPDATE
USING (owner_user_id = auth.uid())
WITH CHECK (owner_user_id = auth.uid());

-- Admin politikası is_admin() ile uyumlu
DROP POLICY IF EXISTS "Admins manage owner accounts" ON public.owner_accounts;
CREATE POLICY "Admins manage owner accounts" ON public.owner_accounts FOR ALL
USING (public.is_admin() OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'ADMIN');

-- ─── Demo tesis: flash deal + availability exception ──────────────────────────
DROP POLICY IF EXISTS "Owners manage demo flash deals" ON public.pitch_flash_deals;
CREATE POLICY "Owners manage demo flash deals" ON public.pitch_flash_deals FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.pitches p
    WHERE p.id = pitch_flash_deals.pitch_id AND p.is_demo = true
  )
  AND public.has_role('OWNER')
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.pitches p
    WHERE p.id = pitch_flash_deals.pitch_id AND p.is_demo = true
  )
  AND public.has_role('OWNER')
);

DROP POLICY IF EXISTS "Owners manage demo availability exceptions" ON public.pitch_availability_exceptions;
CREATE POLICY "Owners manage demo availability exceptions" ON public.pitch_availability_exceptions FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.pitches p
    WHERE p.id = pitch_availability_exceptions.pitch_id AND p.is_demo = true
  )
  AND public.has_role('OWNER')
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.pitches p
    WHERE p.id = pitch_availability_exceptions.pitch_id AND p.is_demo = true
  )
  AND public.has_role('OWNER')
);

-- ─── owner_has_entitlement: yalnızca authenticated ────────────────────────────
REVOKE ALL ON FUNCTION public.owner_has_entitlement(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owner_has_entitlement(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.owner_has_entitlement(TEXT) TO authenticated, service_role;

-- ─── Onaylı rezervasyon iptali (owner) ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.owner_cancel_confirmed_booking(
  p_booking_id UUID,
  p_reason TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_booking RECORD;
  v_refund_amount NUMERIC;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  SELECT
    b.id,
    b.pitch_id,
    b.user_id,
    b.match_id,
    b.paid_amount,
    b.price,
    b.payment_status,
    b.status,
    p.owner_id,
    p.is_demo
  INTO v_booking
  FROM public.pitch_bookings b
  JOIN public.pitches p ON p.id = b.pitch_id
  WHERE b.id = p_booking_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;

  IF v_booking.status = 'CANCELLED' THEN
    RAISE EXCEPTION 'ALREADY_CANCELLED';
  END IF;

  IF NOT (
    v_booking.owner_id = v_uid
    OR public.is_admin()
    OR (
      v_booking.is_demo = true
      AND public.has_role('OWNER')
    )
  ) THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  v_refund_amount := COALESCE(v_booking.paid_amount, 0);

  UPDATE public.pitch_bookings
  SET
    status = 'CANCELLED',
    cancellation_reason = NULLIF(TRIM(p_reason), ''),
    cancelled_at = NOW(),
    cancelled_by = v_uid,
    payment_status = CASE
      WHEN v_refund_amount > 0 THEN 'REFUNDED'
      ELSE payment_status
    END
  WHERE id = p_booking_id;

  IF v_booking.user_id IS NOT NULL AND v_refund_amount > 0 THEN
    PERFORM public.process_match_refund(
      v_booking.user_id,
      v_booking.match_id,
      v_refund_amount
    );
  END IF;

  IF v_booking.user_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, title, body, type_key)
    VALUES (
      v_booking.user_id,
      'Rezervasyonunuz İptal Edildi',
      CASE
        WHEN v_refund_amount > 0 THEN
          'Rezervasyonunuz iptal edildi. ' || v_refund_amount::text || '₺ cüzdanınıza iade edildi.'
        ELSE 'Rezervasyonunuz tesis tarafından iptal edildi.'
      END,
      'BOOKING_CANCELLED'
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.owner_cancel_confirmed_booking(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_cancel_confirmed_booking(UUID, TEXT) TO authenticated, service_role;
