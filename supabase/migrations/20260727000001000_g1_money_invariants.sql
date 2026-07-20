-- ════════════════════════════════════════════════════════════════════════════
-- [S1 / G1] PARA DEĞİŞMEZLERİ — kalıcı guard (check_money_invariants)
-- ────────────────────────────────────────────────────────────────────────────
-- "önem ver" (K30). Para matematiğini bozan bir durum sessizce birikemesin diye
-- canlı veriye karşı çalışan bir DEĞİŞMEZ DENETÇİSİ. İstendiğinde (admin panel),
-- S4 sağlık akışında ve regresyon testinde çağrılır; jsonb rapor döndürür.
--
-- Sert değişmezler (biri bile bozuksa ok=false):
--   I1  Cüzdan aynası tutar: profiles.wallet_balance == floor(TOP_UP)+floor(REFUND)
--   I2  İdempotency: (user_id, idempotency_key) benzersiz (anahtar başına ≤1 intent)
--   I3  Çift TOP_UP kredisi yok: bir intent'e ≤1 COMPLETED TOP_UP wallet satırı
--   I4  Negatif kova yok: hiçbir kullanıcının ham TOP_UP/REFUND toplamı < 0
--       (over-spend sızıntısı — floor öncesi negatif = para matematiği bozuk)
--   I5  Yetim iade yok: REFUND_CREDIT/PAYMENT_INTENT satırı var olan intent'e bağlı
-- Bilgilendirici (ok'u bozmaz):
--   I6  6 saatten eski askıda in-app PENDING sayısı (süpürücü hedefi)
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.check_money_invariants()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  i1 int; i2 int; i3 int; i4 int; i5 int; i6 int;
  v_ok boolean;
BEGIN
  -- Yetki: service_role (auth.uid() NULL) veya platform admin. Tüm kullanıcıları
  -- taradığı için sıradan kullanıcıya kapalı.
  IF auth.uid() IS NOT NULL AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  -- I1 — cüzdan aynası tutarlılığı (kova başına floor, sonra topla)
  WITH b AS (
    SELECT user_id,
      GREATEST(COALESCE(SUM(CASE WHEN balance_type='TOP_UP' AND status='COMPLETED'
                  THEN (CASE WHEN type='TOP_UP' THEN amount ELSE -amount END) ELSE 0 END),0),0)
      + GREATEST(COALESCE(SUM(CASE WHEN balance_type='REFUND_CREDIT' AND status='COMPLETED'
                  THEN (CASE WHEN type IN ('DEPOSIT','REFUND','MATCH_REFUND') THEN amount ELSE -amount END) ELSE 0 END),0),0)
      AS computed
    FROM public.wallet_transactions GROUP BY user_id
  )
  SELECT count(*) INTO i1
  FROM public.profiles p LEFT JOIN b ON b.user_id = p.id
  WHERE round(COALESCE(p.wallet_balance,0),2) <> round(COALESCE(b.computed,0),2);

  -- I2 — idempotency: aynı (user_id, key) için birden çok intent
  SELECT count(*) INTO i2 FROM (
    SELECT user_id, idempotency_key FROM public.payment_intents
    WHERE idempotency_key IS NOT NULL
    GROUP BY user_id, idempotency_key HAVING count(*) > 1
  ) d;

  -- I3 — bir intent'e birden çok TOP_UP kredisi
  SELECT count(*) INTO i3 FROM (
    SELECT reference_id FROM public.wallet_transactions
    WHERE reference_type='PAYMENT_INTENT' AND type='TOP_UP' AND status='COMPLETED'
    GROUP BY reference_id HAVING count(*) > 1
  ) d;

  -- I4 — negatif ham kova (over-spend sızıntısı)
  SELECT count(*) INTO i4 FROM (
    SELECT user_id,
      SUM(CASE WHEN balance_type='TOP_UP' AND status='COMPLETED'
              THEN (CASE WHEN type='TOP_UP' THEN amount ELSE -amount END) ELSE 0 END) AS topup_raw,
      SUM(CASE WHEN balance_type='REFUND_CREDIT' AND status='COMPLETED'
              THEN (CASE WHEN type IN ('DEPOSIT','REFUND','MATCH_REFUND') THEN amount ELSE -amount END) ELSE 0 END) AS refund_raw
    FROM public.wallet_transactions GROUP BY user_id
  ) s WHERE s.topup_raw < -0.005 OR s.refund_raw < -0.005;

  -- I5 — yetim iade (var olmayan intent'e bağlı REFUND_CREDIT)
  SELECT count(*) INTO i5 FROM public.wallet_transactions wt
  WHERE wt.balance_type='REFUND_CREDIT' AND wt.reference_type='PAYMENT_INTENT'
    AND NOT EXISTS (SELECT 1 FROM public.payment_intents pi WHERE pi.id::text = wt.reference_id::text);

  -- I6 — bilgilendirici: 6 saatten eski askıda in-app PENDING
  SELECT count(*) INTO i6 FROM public.payment_intents
  WHERE status='PENDING' AND provider='IYZICO'
    AND (raw->>'flow') IN ('BOOKING_DEPOSIT','TOP_UP','MATCH_JOIN')
    AND created_at < now() - interval '6 hour';

  v_ok := (i1=0 AND i2=0 AND i3=0 AND i4=0 AND i5=0);

  RETURN jsonb_build_object(
    'ok', v_ok,
    'invariants', jsonb_build_object(
      'I1_wallet_mirror_mismatch', i1,
      'I2_idempotency_dup', i2,
      'I3_double_topup_credit', i3,
      'I4_negative_bucket', i4,
      'I5_orphan_refund', i5
    ),
    'info', jsonb_build_object('I6_stale_pending_over_6h', i6)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.check_money_invariants() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_money_invariants() TO authenticated, service_role;
