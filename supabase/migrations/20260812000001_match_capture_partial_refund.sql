-- ============================================================================
-- MAÇ DOLUNCA KAPORA KISMİ İADESİ (kaptan yalnız kendi payını öder)
--
-- Kural (ürün kararı): maç eşiğe ulaşıp kesinleştiğinde (LIVE + capture),
-- kaporayı ödeyen kaptana ödediği tutardan 1 KİŞİLİK katılım ücreti düşülerek
-- kalanı OTOMATİK iade kredisi olarak döner:
--     iade = kapora (deposit_amount) − kişi başı ücret (matches.price), min 0.
-- Böylece UI'daki "Kapora & İade Kuralları" metni gerçek sunucu davranışıdır.
--
-- Uygulama notları:
--  • Yalnız CÜZDAN güvenceli intent'ler (provider='WALLET'): para platform
--    defterinde olduğundan iade kredisi saf ledger işlemidir (PSP çağrısı yok).
--    [IYZICO-TODO] Kart-blokeli eski akış canlıya bağlanırsa kısmi iade
--    refund-payment edge function'ı ile sistem bağlamından yapılmalı.
--  • İDEMPOTENT: _refund_wallet_escrow ile AYNI korkuluk paylaşılır
--    (reference PAYMENT_INTENT + balance_type REFUND_CREDIT tekil izi) —
--    tekrar capture, tetikleyici + istemci yarışı veya capture sonrası yanlış
--    bir "tam iade" çağrısı İKİNCİ bir para hareketi yaratamaz.
--  • Ödül hedefi HER ZAMAN intent sahibi (kaptan) — çağırandan bağımsız.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.match_capture_deposit(p_match_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE
  v_match RECORD;
  v_intent public.payment_intents;
  v_refund numeric := 0;
BEGIN
  SELECT id, deposit_intent_id, deposit_status, deposit_amount, price
    INTO v_match
  FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_match.deposit_status <> 'BLOCKED' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'NOT_BLOCKED', 'deposit_status', v_match.deposit_status);
  END IF;

  UPDATE public.payment_intents
    SET status = 'CAPTURED', captured_at = timezone('utc', now())
    WHERE id = v_match.deposit_intent_id
    RETURNING * INTO v_intent;
  UPDATE public.matches SET deposit_status = 'CAPTURED' WHERE id = p_match_id;

  -- Kısmi iade: kapora − kişi başı ücret (yalnız cüzdan güvencesi + pozitifse).
  IF v_intent.id IS NOT NULL AND v_intent.provider = 'WALLET' THEN
    v_refund := round(GREATEST(COALESCE(v_match.deposit_amount, 0) - COALESCE(v_match.price, 0), 0), 2);
    IF v_refund > 0 AND NOT EXISTS (
      SELECT 1 FROM public.wallet_transactions
      WHERE reference_type = 'PAYMENT_INTENT' AND reference_id = v_intent.id
        AND balance_type = 'REFUND_CREDIT'
    ) THEN
      INSERT INTO public.wallet_transactions
        (user_id, match_id, amount, type, balance_type, status, reference_type, reference_id, description)
      VALUES (v_intent.user_id, v_intent.match_id, v_refund, 'DEPOSIT', 'REFUND_CREDIT', 'COMPLETED',
              'PAYMENT_INTENT', v_intent.id,
              format('Maç doldu — kapora payın dışındaki tutar iade edildi (%s₺ kapora − %s₺ katılım payı)',
                     round(COALESCE(v_match.deposit_amount, 0)), round(COALESCE(v_match.price, 0))));
      PERFORM public._sync_wallet_mirror(v_intent.user_id);
    ELSE
      v_refund := 0; -- iade izi zaten var (idempotent tekrar) ya da tutar yok
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'deposit_status', 'CAPTURED', 'fill_refund', v_refund);
END; $$;

COMMENT ON FUNCTION public.match_capture_deposit(uuid) IS
  'Eşik dolunca kaporayı tahsil eder; cüzdan güvenceli kaporada (kapora − kişi başı ücret) farkını kaptana iade kredisi olarak döndürür (idempotent).';
