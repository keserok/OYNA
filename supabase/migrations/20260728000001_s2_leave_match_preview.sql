-- ════════════════════════════════════════════════════════════════════════════
-- [S2.4] SLOT AYRILMA İADE ÖNİZLEMESİ — sunucu formülüyle birebir
-- ────────────────────────────────────────────────────────────────────────────
-- MatchJoin "Maçtan Ayrıl" modalı artık "ödediğin X₺ iade kredisine döner"
-- rakamını FE'de tahmin etmez; leave_public_match_slot'ın İADE ETTİĞİ tutarı
-- (MATCH_FEE toplamı, zaten iade edildiyse 0) sunucudan okur → asla tutmayan
-- rakam gösterilmez (C5/C7 deseni).
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.preview_leave_match(p_match_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_paid numeric; v_already numeric; v_refundable numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  -- leave_public_match_slot ile BİREBİR: ödenen MATCH_FEE (işaretli negatif) toplamı;
  -- daha önce iade edildiyse (MATCH_REFUND/REFUND) yeni iade yok.
  SELECT COALESCE(SUM(-amount), 0) INTO v_paid FROM public.wallet_transactions
    WHERE user_id = v_uid AND match_id = p_match_id AND type = 'MATCH_FEE';
  SELECT COALESCE(SUM(amount), 0) INTO v_already FROM public.wallet_transactions
    WHERE user_id = v_uid AND match_id = p_match_id AND type IN ('MATCH_REFUND','REFUND');
  v_refundable := CASE WHEN v_paid > 0 AND v_already = 0 THEN v_paid ELSE 0 END;
  RETURN jsonb_build_object(
    'refundable', round(v_refundable, 2),
    'paid', round(v_paid, 2),
    'already_refunded', (v_already > 0)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.preview_leave_match(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_leave_match(uuid) TO authenticated, service_role;
