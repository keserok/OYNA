-- ═══════════════════════════════════════════════════════════════════════════
-- ADMIN KAPORA İADESİ KART DÖNEMİNE GEÇİRİLDİ (kurucu onayı, 20 Ağustos 2026)
--
-- BULUNAN HATA: admin_match_deposit_action('REFUND') cüzdan döneminden kalmaydı:
--   • Niyeti match_id + related_entity_type='MATCH_DEPOSIT' + status IN
--     ('BLOCKED','CAPTURED') ile arıyordu. Kart döneminde kapora niyeti
--     apply_card_payment sonrası 'PAID' durumundadır → SORGU HİÇBİR ŞEY BULMAZ.
--   • Buna rağmen matches.deposit_status = 'REFUNDED' yazıyordu. Yani admin
--     "İade Et" dediğinde ekran "iade edildi" derken KAPTANA TEK KURUŞ
--     DÖNMÜYORDU. Sessiz para kaybı — kabul edilemez.
--   • İade hedefi de eskiden cüzdan iade kredisiydi; karar (16-20 Ağu): iadeler
--     KARTA döner, ödeme altyapısı kesintisi düşülür.
--
-- DOĞRU DAVRANIŞ (bu migration):
--   • Niyet, matches.deposit_intent_id üzerinden bulunur (tek doğru işaretçi);
--     eski kayıtlar için match_id + MATCH_DEPOSIT yedeği PAID dahil aranır.
--   • Para hareketi _refund_wallet_escrow'a devredilir: kart niyeti →
--     karta iade kuyruğu (çekilen − _psp_fee), eski cüzdan emaneti →
--     iade kredisi. İkisi de idempotent.
--   • Niyet bulunamazsa ya da iade uygulanamazsa (tahsilat yok) HATA fırlar —
--     deposit_status asla "yalan" REFUNDED olamaz.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_match_deposit_action(
  p_match_id uuid, p_action text, p_reason text DEFAULT NULL::text
) RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_res jsonb;
  v_intent_id uuid;
  v_ok boolean;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'FORBIDDEN: admin gerekli.'; END IF;

  IF p_action = 'CAPTURE' THEN
    v_res := public.match_capture_deposit(p_match_id);
  ELSIF p_action = 'VOID' THEN
    v_res := public.match_void_deposit(p_match_id, COALESCE(p_reason, 'Admin void.'));
  ELSIF p_action = 'REFUND' THEN
    -- Tek doğru işaretçi: matches.deposit_intent_id (kart dönemi).
    SELECT deposit_intent_id INTO v_intent_id FROM public.matches WHERE id = p_match_id;
    IF v_intent_id IS NULL THEN
      -- Eski kayıtlar: işaretçi yoksa niyeti maç + tür üzerinden ara (PAID dahil —
      -- kart döneminde tahsil edilmiş kapora PAID durur, BLOCKED değil).
      SELECT id INTO v_intent_id FROM public.payment_intents
        WHERE match_id = p_match_id AND related_entity_type = 'MATCH_DEPOSIT'
          AND status IN ('BLOCKED', 'CAPTURED', 'PAID')
        ORDER BY created_at DESC LIMIT 1;
    END IF;
    IF v_intent_id IS NULL THEN
      RAISE EXCEPTION 'NO_DEPOSIT_INTENT: bu maçın kapora tahsilatı bulunamadı — iade işaretlenmedi.';
    END IF;

    -- Para hareketi TEK yerden: kart → karta iade kuyruğu (PSP kesintisi düşülür),
    -- eski cüzdan emaneti → iade kredisi. İkisi de idempotent (mükerrer eklemez).
    v_ok := public._refund_wallet_escrow(v_intent_id, COALESCE(p_reason, 'Admin iadesi — kapora'));

    IF NOT v_ok
       AND NOT EXISTS (SELECT 1 FROM public.card_refund_queue
                        WHERE intent_id = v_intent_id AND status <> 'FAILED')
       AND NOT EXISTS (SELECT 1 FROM public.wallet_transactions
                        WHERE reference_type = 'PAYMENT_INTENT' AND reference_id = v_intent_id
                          AND balance_type = 'REFUND_CREDIT') THEN
      -- Ne şimdi uygulandı ne de daha önce uygulanmış: iade edilecek tahsilat yok.
      RAISE EXCEPTION 'REFUND_NOT_APPLICABLE: niyet iade edilebilir durumda değil (tahsilat yok ya da tutar 0).';
    END IF;

    -- Eski BLOCKED/CAPTURED niyetler burada kapanır; kart niyetini
    -- _refund_wallet_escrow zaten REFUNDED yazar.
    UPDATE public.payment_intents
       SET status = 'REFUNDED', voided_at = timezone('utc', now()),
           void_reason = COALESCE(p_reason, 'admin_refund')
     WHERE id = v_intent_id AND status IN ('BLOCKED', 'CAPTURED');

    UPDATE public.matches SET deposit_status = 'REFUNDED' WHERE id = p_match_id;
    v_res := jsonb_build_object('ok', true, 'deposit_status', 'REFUNDED', 'intent_id', v_intent_id);
  ELSE
    RAISE EXCEPTION 'INVALID_ACTION: CAPTURE|VOID|REFUND bekleniyor.';
  END IF;

  BEGIN
    PERFORM public.log_admin_action('MATCH_DEPOSIT_' || p_action, 'MATCH', p_match_id, p_match_id::text,
      NULL, jsonb_build_object('reason', p_reason, 'result', v_res));
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN v_res;
END; $function$;

-- ── Kendi kendini doğrulama ──────────────────────────────────────────────────
DO $$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'admin_match_deposit_action';

  IF v_def NOT LIKE '%deposit_intent_id%' THEN
    RAISE EXCEPTION 'DOĞRULAMA: REFUND dalı deposit_intent_id kullanmıyor.';
  END IF;
  IF v_def NOT LIKE '%_refund_wallet_escrow%' THEN
    RAISE EXCEPTION 'DOĞRULAMA: REFUND dalı _refund_wallet_escrow''a devretmiyor.';
  END IF;
  IF v_def NOT LIKE '%REFUND_NOT_APPLICABLE%' THEN
    RAISE EXCEPTION 'DOĞRULAMA: uygulanamayan iade sessizce geçiyor.';
  END IF;
  IF v_def NOT LIKE '%''PAID''%' THEN
    RAISE EXCEPTION 'DOĞRULAMA: PAID niyetler hâlâ kapsam dışı.';
  END IF;
END $$;
