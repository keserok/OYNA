-- ════════════════════════════════════════════════════════════════════════════
-- [S4] CHARGEBACK ARACI — intent işaretle + ilgili kazancı dondur (K18)
-- ────────────────────────────────────────────────────────────────────────────
-- Master plan S4: "Chargeback: admin 'intent işaretle + ilgili kazancı dondur'
-- aracı (2 hafta güvence süresi ilk tampon)."
--
-- Chargeback = kart sahibi bankasından itiraz etti; PARA KULLANICIYA BANKADAN
-- döndü. Platform zararda. Bu yüzden kullanıcıya İADE YAPILMAZ (parasını aldı);
-- yalnız ilgili SAHA/HİZMET KAZANCI dondurulur ki platform çifte zarar etmesin.
--
-- Kazanç güvence süresinde (PENDING) ise → İPTAL (owner hiç çekilebilir olmadı;
--   temiz, ledger'a negatif yazılmaz). Bu "2 hafta güvence süresi tampon"un
--   çalışmasıdır: chargeback'lerin çoğu bu pencerede gelir.
-- Kazanç çekilebilir (COMPLETED) ise → telafi (negatif) EARNINGS kaydı (clawback);
--   owner'ın kazanç bakiyesi düşer / gelecekteki kazançtan mahsup edilir.
-- Idempotent: aynı intent iki kez işaretlenemez.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.payment_intents
  ADD COLUMN IF NOT EXISTS chargeback_at     timestamptz,
  ADD COLUMN IF NOT EXISTS chargeback_reason text,
  ADD COLUMN IF NOT EXISTS chargeback_by     uuid;

CREATE OR REPLACE FUNCTION public.admin_mark_chargeback(p_intent_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_intent public.payment_intents;
  v_ref_type text; v_ref_id uuid; v_earn_type text;
  v_frozen numeric := 0; v_clawed numeric := 0; v_owner uuid;
  r RECORD;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  PERFORM public.require_admin_role(ARRAY['FINANCE']);
  PERFORM public.require_admin_write();

  SELECT * INTO v_intent FROM public.payment_intents WHERE id = p_intent_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Ödeme bulunamadı.'; END IF;
  IF upper(COALESCE(v_intent.status,'')) NOT IN ('PAID','CAPTURED') THEN
    RAISE EXCEPTION 'INVALID_STATUS: Yalnız tahsil edilmiş (PAID/CAPTURED) ödemeler chargeback işaretlenebilir.';
  END IF;
  IF v_intent.chargeback_at IS NOT NULL THEN
    RAISE EXCEPTION 'ALREADY_CHARGEBACK: Bu ödeme zaten chargeback işaretli.';
  END IF;

  -- İlgili kazancın kaynağını çöz (booking / match / hizmet)
  IF v_intent.booking_id IS NOT NULL THEN
    v_ref_type := 'BOOKING'; v_ref_id := v_intent.booking_id; v_earn_type := 'BOOKING_EARNING';
  ELSIF v_intent.match_id IS NOT NULL THEN
    v_ref_type := 'MATCH'; v_ref_id := v_intent.match_id; v_earn_type := 'MATCH_EARNING';
  ELSE
    v_ref_type := 'PAYMENT_INTENT'; v_ref_id := v_intent.id; v_earn_type := 'SERVICE_EARNING';
  END IF;

  -- İlgili kazanç satırları üzerinde işlem yap (owner satırını kilitle)
  FOR r IN
    SELECT id, user_id, amount, status FROM public.wallet_transactions
    WHERE reference_type = v_ref_type AND reference_id = v_ref_id
      AND type = v_earn_type AND balance_type = 'EARNINGS'
    FOR UPDATE
  LOOP
    v_owner := r.user_id;
    IF r.status = 'PENDING' THEN
      -- Güvence süresinde → temiz iptal (hiç çekilebilir olmadı).
      UPDATE public.wallet_transactions
        SET status = 'CANCELLED',
            description = COALESCE(description,'') || ' [CHARGEBACK: kazanç donduruldu]'
        WHERE id = r.id;
      v_frozen := v_frozen + r.amount;
    ELSIF r.status = 'COMPLETED' THEN
      -- Çekilebilir/çekilmiş → telafi (negatif) kaydı. Idempotent.
      IF NOT EXISTS (
        SELECT 1 FROM public.wallet_transactions
        WHERE reference_type = 'PAYMENT_INTENT' AND reference_id = v_intent.id
          AND type = 'CHARGEBACK_REVERSAL'
      ) THEN
        INSERT INTO public.wallet_transactions
          (user_id, amount, type, balance_type, status, reference_type, reference_id, description)
        VALUES
          (r.user_id, r.amount, 'CHARGEBACK_REVERSAL', 'EARNINGS', 'COMPLETED', 'PAYMENT_INTENT', v_intent.id,
           format('Chargeback — %s kazancı geri alındı', v_earn_type));
        v_clawed := v_clawed + r.amount;
      END IF;
    END IF;
  END LOOP;

  -- Intent'i chargeback işaretle
  UPDATE public.payment_intents
    SET chargeback_at = now(), chargeback_reason = p_reason, chargeback_by = auth.uid()
  WHERE id = p_intent_id;

  PERFORM public.log_admin_action('PAYMENT_CHARGEBACK', 'payment_intent', p_intent_id, v_owner::text,
    jsonb_build_object('amount', v_intent.amount, 'status', v_intent.status),
    jsonb_build_object('reason', p_reason, 'frozen_pending', v_frozen, 'clawed_completed', v_clawed));

  RETURN jsonb_build_object(
    'intent_id', p_intent_id,
    'frozen_pending', v_frozen,
    'clawed_completed', v_clawed,
    'earning_owner', v_owner,
    'earning_source', v_ref_type
  );
END;
$$;
REVOKE ALL ON FUNCTION public.admin_mark_chargeback(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_mark_chargeback(uuid, text) TO authenticated;

-- ─── admin_fetch_payment_intents — chargeback_at kolonu eklenir (rozet için) ─
DROP FUNCTION IF EXISTS public.admin_fetch_payment_intents(text, text, integer, integer);
CREATE OR REPLACE FUNCTION public.admin_fetch_payment_intents(p_search text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, user_id uuid, user_name text, pitch_id uuid, pitch_name text, match_id uuid, related_entity_type text, amount numeric, commission_amount numeric, owner_amount numeric, status text, provider text, provider_ref text, created_at timestamp with time zone, chargeback_at timestamp with time zone, total_count bigint)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  RETURN QUERY
  SELECT
    pi.id, pi.user_id,
    COALESCE(pr.full_name, pr.name, pr.email)::text AS user_name,
    pi.pitch_id, p.name::text AS pitch_name,
    pi.match_id, pi.related_entity_type,
    pi.amount, pi.commission_amount, pi.owner_amount,
    pi.status, pi.provider, pi.provider_ref,
    pi.created_at, pi.chargeback_at,
    COUNT(*) OVER() AS total_count
  FROM public.payment_intents pi
  LEFT JOIN public.profiles pr ON pr.id = pi.user_id
  LEFT JOIN public.pitches p ON p.id = pi.pitch_id
  WHERE
    (p_status IS NULL OR p_status = '' OR p_status = 'all' OR upper(pi.status) = upper(p_status))
    AND (
      p_search IS NULL OR p_search = '' OR
      pi.id::text ILIKE '%' || p_search || '%' OR
      pi.provider_ref ILIKE '%' || p_search || '%' OR
      pr.full_name ILIKE '%' || p_search || '%' OR
      pr.email ILIKE '%' || p_search || '%' OR
      p.name ILIKE '%' || p_search || '%'
    )
  ORDER BY pi.created_at DESC
  LIMIT GREATEST(p_limit, 1)
  OFFSET GREATEST(p_offset, 0);
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_fetch_payment_intents(text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_fetch_payment_intents(text, text, integer, integer) TO authenticated;
