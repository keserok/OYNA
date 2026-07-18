-- ════════════════════════════════════════════════════════════════════════════
-- [S2.1] CÜZDANDAN KARTA/IBAN'A ÇEKİM — yüklenen bakiye, %10 kesinti
-- ────────────────────────────────────────────────────────────────────────────
-- KARARLAR (kullanıcı):
--   • Yalnız KENDİ YÜKLEDİĞİ bakiye (TOP_UP kovası) çekilebilir. İade kredisi
--     (REFUND_CREDIT) ve kazanç (EARNINGS) BU akışta değildir — iade kredisi
--     yalnız uygulama içinde harcanır (yükle→iade ettir→kesintisiz çek kaçağı
--     kapatılır); kazanç ayrı payout akışını kullanır.
--   • %10 kesinti (config'ten). 300₺ çekersen fee 30₺, hesabına net 270₺ geçer.
--   • Kayıtlı IBAN + ilk çekimde TC kimlik doğrulaması (provider deseni, reuse).
--   • Aynı anda tek bekleyen talep. Min 100₺. Kill-switch KAPALI doğar.
--
-- PARA GÜVENLİĞİ (money-out):
--   • Talep anında TOP_UP KESİN düşülür (COMPLETED WITHDRAWAL) → harcanabilir
--     bakiye HEMEN azalır; bekleyen çekimi maçta/kaporada tekrar harcamak
--     (çift-kullanım) İMKÂNSIZ. Rezerv mantığı gerektirmez (paylaşılan bakiye
--     okuma/spend/G1 değişmez).
--   • Admin reddederse (FAILED/CANCELLED): gross TOP_UP'a GERİ kredilenir
--     (telafi kaydı, idempotent — silme yok). Admin COMPLETED işaretlerse banka
--     transfer referansı zorunlu (faz11 kuralı korunur).
--   • Kesinti (fee) ayrı sütunda (fee_amount) iz bırakır; net_amount bankaya gider.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 0) payout_requests: kesinti/net + WALLET_CASHOUT tipi ────────────────────
ALTER TABLE public.payout_requests
  ADD COLUMN IF NOT EXISTS fee_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_amount numeric;

ALTER TABLE public.payout_requests DROP CONSTRAINT IF EXISTS payout_requests_payout_type_check;
ALTER TABLE public.payout_requests ADD CONSTRAINT payout_requests_payout_type_check
  CHECK (payout_type IN ('OWNER_BIWEEKLY','PROVIDER_INSTANT','MANUAL','WALLET_CASHOUT'));

-- ─── 1) Config (kill-switch KAPALI doğar) ────────────────────────────────────
INSERT INTO public.app_config (key, value, value_type, category, label, description, is_public, min_value, max_value) VALUES
  ('wallet_cashout_enabled', 'false'::jsonb, 'boolean', 'ODEME',
   'Cüzdandan Çekim',
   'AÇIK iken kullanıcılar yükledikleri bakiyeyi (yalnız TOP_UP) kayıtlı IBAN''a çekebilir. KAPALI doğar; iyzico payout hazır olunca ve güvenlik testleri geçince açın.',
   false, NULL, NULL),
  ('wallet_cashout_fee_pct', '10'::jsonb, 'number', 'ODEME',
   'Çekim Kesintisi (%)',
   'Cüzdandan çekimde uygulanan kesinti yüzdesi (ödeme altyapısı komisyonlarını karşılar). 300₺ çekimde %10 = 30₺ kesinti, net 270₺.',
   false, 0, 50),
  ('wallet_cashout_min', '100'::jsonb, 'number', 'ODEME',
   'Min Çekim (₺)',
   'Cüzdandan çekim için minimum tutar.',
   false, 1, 100000),
  ('wallet_cashout_require_identity', 'true'::jsonb, 'boolean', 'ODEME',
   'Çekimde Kimlik Zorunlu',
   'AÇIK iken para çekmeden önce TC kimlik doğrulaması gerekir (dolandırıcılık/çalıntı hesap koruması).',
   false, NULL, NULL)
ON CONFLICT (key) DO NOTHING;

-- ─── 2) SSOT: kesinti/net hesabı (preview + request ortak — ayrışamaz) ───────
CREATE OR REPLACE FUNCTION public._wallet_cashout_quote(p_gross numeric)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_pct numeric := COALESCE(public.get_config_number('wallet_cashout_fee_pct', 10), 10);
  v_g numeric := round(GREATEST(COALESCE(p_gross,0), 0), 2);
  v_fee numeric; v_net numeric;
BEGIN
  v_fee := round(v_g * v_pct / 100.0, 2);
  v_net := round(v_g - v_fee, 2);
  RETURN jsonb_build_object('gross', v_g, 'fee_pct', v_pct, 'fee', v_fee, 'net', v_net);
END;
$$;
REVOKE ALL ON FUNCTION public._wallet_cashout_quote(numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._wallet_cashout_quote(numeric) TO service_role;

-- ─── 3) preview_wallet_cashout — FE gösterir (sunucunun kendi rakamı) ────────
CREATE OR REPLACE FUNCTION public.preview_wallet_cashout(p_gross numeric)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_q jsonb;
  v_topup numeric;
  v_buckets RECORD;
  v_min numeric := COALESCE(public.get_config_number('wallet_cashout_min', 100), 100);
  v_enabled boolean := public.get_config_bool('wallet_cashout_enabled', false);
  v_req_id boolean := public.get_config_bool('wallet_cashout_require_identity', true);
  v_id_ok boolean;
  v_has_pending boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT * INTO v_buckets FROM public._wallet_bucket_balances(v_uid);
  v_topup := COALESCE(v_buckets.topup_balance, 0);
  v_q := public._wallet_cashout_quote(p_gross);
  v_id_ok := (NOT v_req_id) OR EXISTS (SELECT 1 FROM public.provider_identities WHERE user_id = v_uid AND status = 'VERIFIED');
  v_has_pending := EXISTS (SELECT 1 FROM public.payout_requests WHERE user_id = v_uid AND status = 'PENDING');
  RETURN v_q || jsonb_build_object(
    'enabled', v_enabled,
    'min', v_min,
    'topup_balance', v_topup,
    'identity_ok', v_id_ok,
    'identity_required', v_req_id,
    'has_pending', v_has_pending
  );
END;
$$;
REVOKE ALL ON FUNCTION public.preview_wallet_cashout(numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_wallet_cashout(numeric) TO authenticated, service_role;

-- ─── 4) request_wallet_cashout — çekim talebi (TOP_UP anında düşülür) ────────
CREATE OR REPLACE FUNCTION public.request_wallet_cashout(p_gross numeric, p_method_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_method public.payout_methods;
  v_buckets RECORD;
  v_topup numeric;
  v_min numeric := COALESCE(public.get_config_number('wallet_cashout_min', 100), 100);
  v_req_id boolean := public.get_config_bool('wallet_cashout_require_identity', true);
  v_q jsonb; v_fee numeric; v_net numeric; v_gross numeric;
  v_payout public.payout_requests;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED: Giriş gerekli.'; END IF;

  -- Kill-switch
  IF NOT public.get_config_bool('wallet_cashout_enabled', false) THEN
    RAISE EXCEPTION 'CASHOUT_DISABLED: Para çekme şu an kapalı.';
  END IF;

  v_gross := round(COALESCE(p_gross, 0), 2);
  IF v_gross < v_min THEN
    RAISE EXCEPTION 'MIN_CASHOUT: En az %₺ çekebilirsin.', v_min::int;
  END IF;

  -- Yöntem: yalnız IBAN + kullanıcıya ait
  SELECT * INTO v_method FROM public.payout_methods WHERE id = p_method_id AND user_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'METHOD_NOT_FOUND: Kayıtlı IBAN bulunamadı.'; END IF;
  IF v_method.kind <> 'IBAN' THEN
    RAISE EXCEPTION 'IBAN_REQUIRED: Çekim yalnız kayıtlı IBAN''a yapılabilir.';
  END IF;

  -- Kimlik (ilk çekim koruması)
  IF v_req_id AND NOT EXISTS (SELECT 1 FROM public.provider_identities WHERE user_id = v_uid AND status = 'VERIFIED') THEN
    RAISE EXCEPTION 'IDENTITY_REQUIRED: Para çekmeden önce TC kimlik doğrulaması gerekli.';
  END IF;

  -- Eşzamanlılık kilidi + tek bekleyen talep
  PERFORM 1 FROM public.profiles WHERE id = v_uid FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.payout_requests WHERE user_id = v_uid AND status = 'PENDING') THEN
    RAISE EXCEPTION 'PENDING_PAYOUT: Bekleyen bir çekim talebin var. Sonuçlanınca yeni talep açabilirsin.';
  END IF;

  -- Yalnız TOP_UP kovası (iade kredisi/kazanç HARİÇ)
  SELECT * INTO v_buckets FROM public._wallet_bucket_balances(v_uid);
  v_topup := COALESCE(v_buckets.topup_balance, 0);
  IF v_topup < v_gross THEN
    RAISE EXCEPTION 'INSUFFICIENT_TOPUP: Çekilebilir (yüklenen) bakiyen %₺, istenen %₺.', round(v_topup,2), v_gross;
  END IF;

  v_q := public._wallet_cashout_quote(v_gross);
  v_fee := (v_q->>'fee')::numeric;
  v_net := (v_q->>'net')::numeric;
  IF v_net <= 0 THEN RAISE EXCEPTION 'INVALID_NET: Net çekim tutarı sıfırdan büyük olmalı.'; END IF;

  -- Talep (PENDING) — admin bankaya net'i transfer edip COMPLETED işaretler.
  INSERT INTO public.payout_requests
    (user_id, amount, fee_amount, net_amount, iban, iban_holder_name, status, payout_type, payout_method_id, method_kind)
  VALUES
    (v_uid, v_gross, v_fee, v_net, v_method.iban, v_method.holder_name, 'PENDING', 'WALLET_CASHOUT', v_method.id, 'IBAN')
  RETURNING * INTO v_payout;

  -- TOP_UP'ı ANINDA düş (COMPLETED) — harcanabilir bakiye hemen azalır.
  INSERT INTO public.wallet_transactions
    (user_id, amount, type, balance_type, status, reference_type, reference_id, description)
  VALUES
    (v_uid, v_gross, 'WITHDRAWAL', 'TOP_UP', 'COMPLETED', 'PAYOUT', v_payout.id,
     format('Cüzdandan çekim — kesinti %s₺, net %s₺ IBAN''a', v_fee, v_net));
  PERFORM public._sync_wallet_mirror(v_uid);

  RETURN jsonb_build_object(
    'payout_id', v_payout.id, 'gross', v_gross, 'fee', v_fee, 'net', v_net,
    'status', 'PENDING', 'iban_last4', right(v_method.iban, 4)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.request_wallet_cashout(numeric, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_wallet_cashout(numeric, uuid) TO authenticated, service_role;

-- ─── 5) admin_process_payout — faz11 gövdesi + WALLET_CASHOUT red geri-kredisi
-- Davranış değişmezi: kazanç payout'ları AYNEN işlenir. Yalnız EK: cashout
-- reddedilirse (FAILED/CANCELLED) gross TOP_UP'a geri kredilenir (idempotent).
CREATE OR REPLACE FUNCTION public.admin_process_payout(p_payout_id uuid, p_status text, p_ref text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_payout public.payout_requests;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  PERFORM public.require_admin_role(ARRAY['FINANCE']);
  PERFORM public.require_admin_write();
  IF p_status NOT IN ('PROCESSING','COMPLETED','FAILED','CANCELLED') THEN
    RAISE EXCEPTION 'INVALID_STATUS';
  END IF;
  IF p_status = 'COMPLETED' AND COALESCE(btrim(p_ref), '') = '' THEN
    RAISE EXCEPTION 'PAYOUT_REF_REQUIRED: COMPLETED işaretlemek için banka/iyzico transfer referansı zorunludur (iz ve mutabakat için).';
  END IF;
  SELECT * INTO v_payout FROM public.payout_requests WHERE id = p_payout_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  UPDATE public.payout_requests SET
    status = p_status,
    iyzico_payout_ref = COALESCE(p_ref, iyzico_payout_ref),
    admin_notes = COALESCE(p_notes, admin_notes),
    processed_at = CASE WHEN p_status IN ('COMPLETED','FAILED','CANCELLED') THEN now() ELSE processed_at END,
    processed_by = auth.uid()
  WHERE id = p_payout_id;
  IF p_status = 'COMPLETED' THEN
    UPDATE public.wallet_transactions SET status = 'COMPLETED'
    WHERE reference_type = 'PAYOUT' AND reference_id = p_payout_id AND status = 'PENDING';
  ELSIF p_status IN ('FAILED','CANCELLED') THEN
    UPDATE public.wallet_transactions SET status = 'CANCELLED'
    WHERE reference_type = 'PAYOUT' AND reference_id = p_payout_id AND status = 'PENDING';
    -- WALLET_CASHOUT: TOP_UP talep anında COMPLETED düşülmüştü → gross'u geri kredile.
    -- Idempotent: bu payout için zaten geri-kredi varsa tekrar yazma.
    IF v_payout.payout_type = 'WALLET_CASHOUT'
       AND NOT EXISTS (
         SELECT 1 FROM public.wallet_transactions
         WHERE reference_type = 'PAYOUT' AND reference_id = p_payout_id
           AND type = 'TOP_UP' AND balance_type = 'TOP_UP'
       ) THEN
      INSERT INTO public.wallet_transactions
        (user_id, amount, type, balance_type, status, reference_type, reference_id, description)
      VALUES (v_payout.user_id, v_payout.amount, 'TOP_UP', 'TOP_UP', 'COMPLETED', 'PAYOUT', p_payout_id,
              'Çekim talebi reddedildi — tutar cüzdana iade edildi');
      PERFORM public._sync_wallet_mirror(v_payout.user_id);
    END IF;
  END IF;
  PERFORM public.log_admin_action('PAYOUT_PROCESS', 'payout', p_payout_id, v_payout.user_id::text,
    jsonb_build_object('old_status', v_payout.status, 'amount', v_payout.amount),
    jsonb_build_object('status', p_status, 'ref', p_ref, 'notes', p_notes));
  RETURN jsonb_build_object('payout_id', p_payout_id, 'status', p_status);
END;
$function$;
