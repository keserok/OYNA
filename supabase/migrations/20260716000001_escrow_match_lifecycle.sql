-- ════════════════════════════════════════════════════════════════════════════
-- ESCROW MAÇ YAŞAM DÖNGÜSÜ — kapora blokaj → eşik → capture / void + iade
-- ────────────────────────────────────────────────────────────────────────────
-- Model (kullanıcı kararları): maç oluşturma arayüzünden kurulan maçlar için
--   • Kişi başı ücret = saha_toplam ÷ (perTeam×2) × 1.05 (frontend'de hesaplanır).
--   • Kaptan "Yayınla" → KAPORA kartta BLOKE edilir (çekilmez) → maç ACTIVE olur,
--     saha rezerve edilir, ertelenmiş kaleci/hakem talepleri gönderilir.
--   • Eşik = toplam gereken oyuncu − 2 (ör. 14 → 12) dolunca maç LIVE olur ve
--     kapora TAHSİL (capture) edilir — iyzico komisyonu YALNIZ burada kesilir.
--   • Eşik dolmazsa / iptal → kapora VOID (blokaj serbest, çekim yok, komisyon yok).
--   • Kaptan iptali: maça ≥24s varsa iade (kapora çekildiyse iyzico komisyonu
--     kesilerek), <24s ise iade yok (no-show maliyeti) + güvenilirlik düşer.
--
-- ⚠️⚠️ FIXME / BURADA TEST EDİLMEDİ ⚠️⚠️
--   Bu migration SIMULATION modunda DB olarak eksiksizdir; ANCAK gerçek iyzico
--   ÖN PROVİZYON (block) / PROVİZYON KAPATMA (capture) / İPTAL (void) / İADE (refund)
--   API çağrıları `create-payment` edge function'ında YAPILMALIDIR (aşağıda
--   [IYZICO-TODO] ile işaretli noktalar). Supabase branching Pro plan gerektirdiği
--   için dev-branch'te test EDİLEMEDİ — PROD'A ALMADAN ÖNCE Pro dev-branch veya
--   staging ortamında SIMULATION ile uçtan uca test edin (payment_provider='SIMULATION').
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1) matches: escrow alanları ────────────────────────────────────────────
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS deposit_intent_id  uuid,
  ADD COLUMN IF NOT EXISTS deposit_status     text NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS deposit_amount     numeric,
  ADD COLUMN IF NOT EXISTS min_players        int,
  ADD COLUMN IF NOT EXISTS deferred_providers jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'matches_deposit_status_chk') THEN
    ALTER TABLE public.matches ADD CONSTRAINT matches_deposit_status_chk
      CHECK (deposit_status IN ('NONE','BLOCKED','CAPTURED','VOIDED','REFUNDED'));
  END IF;
END $$;

COMMENT ON COLUMN public.matches.deposit_status IS
  'Kapora escrow durumu: NONE|BLOCKED(bloke, çekilmedi)|CAPTURED(tahsil)|VOIDED(serbest)|REFUNDED(iade).';
COMMENT ON COLUMN public.matches.deferred_providers IS
  'Aktivasyonda teklif gönderilecek sağlayıcılar: [{type:GK|REF, providerIds:[uuid], all:bool}].';

-- payment_intents.related_entity_type CHECK'ine kapora escrow tipini ekle.
-- (Aksi halde match_block_deposit INSERT'i CHECK ihlaliyle patlar → kapora akışı kırılır.)
ALTER TABLE public.payment_intents DROP CONSTRAINT IF EXISTS payment_intents_related_entity_type_check;
ALTER TABLE public.payment_intents ADD CONSTRAINT payment_intents_related_entity_type_check
  CHECK (related_entity_type IN ('BOOKING','MATCH','GK_SERVICE','REF_SERVICE','MATCH_DEPOSIT'));

-- ─── 2) Yardımcı: maçın toplam/dolu/eşik oyuncu sayısı ──────────────────────
CREATE OR REPLACE FUNCTION public._match_player_counts(p_match_id uuid)
RETURNS TABLE(total_slots int, filled_slots int, min_players int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_slots jsonb; v_away jsonb; v_min int;
BEGIN
  SELECT slots, "awaySlots", matches.min_players INTO v_slots, v_away, v_min
  FROM public.matches WHERE id = p_match_id;
  v_slots := COALESCE(v_slots, '[]'::jsonb);
  v_away  := COALESCE(v_away,  '[]'::jsonb);
  total_slots := jsonb_array_length(v_slots) + jsonb_array_length(v_away);
  filled_slots := (
    SELECT count(*) FROM (
      SELECT s FROM jsonb_array_elements(v_slots) s WHERE s->>'status' = 'TAKEN'
      UNION ALL
      SELECT s FROM jsonb_array_elements(v_away) s WHERE s->>'status' = 'TAKEN'
    ) q
  );
  -- Eşik: kayıtlı min_players varsa o; yoksa toplam − 2 (en az 2).
  min_players := COALESCE(v_min, GREATEST(total_slots - 2, 2));
  RETURN NEXT;
END; $$;

-- ─── 3) match_block_deposit — kaptan kaporayı BLOKE eder → maç ACTIVE ───────
-- [IYZICO-TODO] Gerçek modda: burada iyzico ÖN PROVİZYON çağrısı (create-payment
--   edge function action:'block') yapılıp dönen intent status'ü 'BLOCKED' olmalı.
--   SIMULATION'da intent doğrudan 'BLOCKED' yazılır (gerçek para yok).
CREATE OR REPLACE FUNCTION public.match_block_deposit(
  p_match_id uuid, p_amount numeric, p_providers jsonb DEFAULT '[]'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_match RECORD;
  v_provider text;
  v_intent public.payment_intents;
  v_counts RECORD;
  v_prov jsonb;
  v_pid text;
  v_sugg jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT: Kapora tutarı pozitif olmalı.'; END IF;

  SELECT id, "creatorId", captain_id, pitch_id, deposit_status, price, commission_model
    INTO v_match FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Maç bulunamadı.'; END IF;
  IF COALESCE(v_match."creatorId", v_match.captain_id) IS DISTINCT FROM v_uid AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: Yalnız maçı kuran kaptan kapora bloke edebilir.';
  END IF;
  IF v_match.deposit_status <> 'NONE' THEN
    RAISE EXCEPTION 'ALREADY_BLOCKED: Bu maçın kaporası zaten işlenmiş (%).', v_match.deposit_status;
  END IF;

  v_provider := COALESCE(public.get_config_text('payment_provider', NULL), 'SIMULATION');

  -- Blokaj intent'i (kapora). related_entity_type='MATCH_DEPOSIT' ile ayrışır.
  -- [IYZICO-TODO] SIMULATION dışında status'ü edge function iyzico ön-provizyon
  --   sonucundan set edin; burada iyimser BLOCKED yazıyoruz.
  INSERT INTO public.payment_intents (
    user_id, match_id, pitch_id, amount, currency, status, provider,
    commission_amount, owner_amount, service_provider_amount,
    commission_model, related_entity_type, blocked_at
  ) VALUES (
    v_uid, p_match_id, v_match.pitch_id, p_amount, 'TRY', 'BLOCKED', v_provider,
    0, 0, 0, COALESCE(v_match.commission_model,'MODEL_A'), 'MATCH_DEPOSIT', timezone('utc', now())
  ) RETURNING * INTO v_intent;

  SELECT * INTO v_counts FROM public._match_player_counts(p_match_id);

  UPDATE public.matches SET
    deposit_intent_id  = v_intent.id,
    deposit_status     = 'BLOCKED',
    deposit_amount     = p_amount,
    deferred_providers = COALESCE(p_providers, '[]'::jsonb),
    min_players        = v_counts.min_players,
    status             = 'ACTIVE'
  WHERE id = p_match_id;

  -- Ertelenmiş kaleci/hakem talepleri: providerId verilmişse gerçekten gönder.
  -- (create_service_request kaptan-başlatan; escrow'u kendi içinde kurar.)
  FOR v_prov IN SELECT * FROM jsonb_array_elements(COALESCE(p_providers,'[]'::jsonb)) LOOP
    IF (v_prov->>'type') IS NOT NULL THEN
      BEGIN
        v_pid := NULLIF(v_prov->>'providerId', '');
        IF v_pid IS NULL THEN
          -- Tür seçili, belirli sağlayıcı yok → en uygun öneriyi otomatik seç.
          v_sugg := public.find_providers_for_match(p_match_id, (v_prov->>'type')::text);
          v_pid  := v_sugg->0->>'id';
        END IF;
        IF v_pid IS NOT NULL THEN
          PERFORM public.create_service_request(p_match_id, v_pid::uuid, (v_prov->>'type')::text);
        END IF;
      EXCEPTION WHEN OTHERS THEN
        -- Best-effort: bir sağlayıcı talebi başarısız olsa da aktivasyon sürer.
        RAISE WARNING 'Ertelenmiş sağlayıcı talebi gönderilemedi (%): %', v_prov, SQLERRM;
      END;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true, 'intent_id', v_intent.id, 'deposit_status', 'BLOCKED',
    'match_status', 'ACTIVE', 'min_players', v_counts.min_players,
    'total_slots', v_counts.total_slots
  );
END; $$;

-- ─── 4) match_capture_deposit — kapora TAHSİL (eşik dolunca) ────────────────
-- [IYZICO-TODO] Gerçek modda: edge function action:'capture' (provizyon kapatma).
CREATE OR REPLACE FUNCTION public.match_capture_deposit(p_match_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_match RECORD;
BEGIN
  SELECT id, deposit_intent_id, deposit_status INTO v_match
  FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_match.deposit_status <> 'BLOCKED' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'NOT_BLOCKED', 'deposit_status', v_match.deposit_status);
  END IF;

  UPDATE public.payment_intents
    SET status = 'CAPTURED', captured_at = timezone('utc', now())
    WHERE id = v_match.deposit_intent_id;
  UPDATE public.matches SET deposit_status = 'CAPTURED' WHERE id = p_match_id;

  RETURN jsonb_build_object('ok', true, 'deposit_status', 'CAPTURED');
END; $$;

-- ─── 5) match_void_deposit — kapora blokajını SERBEST bırak (dolmadı/iptal) ─
-- [IYZICO-TODO] Gerçek modda: edge function action:'void' (ön provizyon iptali).
--   Ayrıca [PITCH-TODO] varsa saha rezervasyonunu (create_pitch_booking sonucu) iptal et.
CREATE OR REPLACE FUNCTION public.match_void_deposit(p_match_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_uid uuid := auth.uid(); v_match RECORD;
BEGIN
  SELECT id, "creatorId", captain_id, deposit_intent_id, deposit_status INTO v_match
  FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF COALESCE(v_match."creatorId", v_match.captain_id) IS DISTINCT FROM v_uid AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF v_match.deposit_status <> 'BLOCKED' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'NOT_BLOCKED', 'deposit_status', v_match.deposit_status);
  END IF;

  UPDATE public.payment_intents
    SET status = 'VOIDED', voided_at = timezone('utc', now()),
        void_reason = COALESCE(p_reason, 'Kadro tamamlanamadı.')
    WHERE id = v_match.deposit_intent_id;
  UPDATE public.matches
    SET deposit_status = 'VOIDED', status = 'CANCELLED',
        cancel_reason = COALESCE(p_reason, 'Kadro tamamlanamadı — kapora serbest bırakıldı.')
    WHERE id = p_match_id;

  RETURN jsonb_build_object('ok', true, 'deposit_status', 'VOIDED', 'match_status', 'CANCELLED');
END; $$;

-- ─── 6) match_check_threshold — eşik dolunca LIVE + capture ─────────────────
-- Katılım/ayrılış sonrası çağrılır (uygulama + [TRIGGER-TODO] ileride tetikleyici).
CREATE OR REPLACE FUNCTION public.match_check_threshold(p_match_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_status text; v_dep text; v_counts RECORD; v_live boolean := false;
BEGIN
  SELECT status, deposit_status INTO v_status, v_dep FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  SELECT * INTO v_counts FROM public._match_player_counts(p_match_id);

  IF v_status = 'ACTIVE' AND v_counts.filled_slots >= v_counts.min_players THEN
    UPDATE public.matches
      SET status = 'LIVE', confirmed_at = timezone('utc', now()), is_successful = true
      WHERE id = p_match_id;
    -- Kapora bloke ise eşikte TAHSİL (karar 1A: eşik dolunca capture).
    IF v_dep = 'BLOCKED' THEN PERFORM public.match_capture_deposit(p_match_id); END IF;
    v_live := true;
  END IF;

  RETURN jsonb_build_object(
    'live', v_live, 'filled', v_counts.filled_slots,
    'min_players', v_counts.min_players, 'total', v_counts.total_slots
  );
END; $$;

-- ─── 7) match_cancel_by_captain — 24s kuralı + no-show ──────────────────────
-- ≥24s: kapora bloke ise void (para yok); tahsil edildiyse iyzico komisyonu
--   kesilerek iade (REFUNDED). <24s: iade yok (no-show), güvenilirlik düşer.
-- [IYZICO-TODO] Gerçek iade (komisyon hariç) edge function action:'refund' ile.
CREATE OR REPLACE FUNCTION public.match_cancel_by_captain(p_match_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_match RECORD; v_hours numeric; v_far boolean;
BEGIN
  SELECT id, "creatorId", captain_id, deposit_intent_id, deposit_status,
         deposit_amount, starts_at
    INTO v_match FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF COALESCE(v_match."creatorId", v_match.captain_id) IS DISTINCT FROM v_uid AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  v_hours := CASE WHEN v_match.starts_at IS NULL THEN 999
                  ELSE EXTRACT(EPOCH FROM (v_match.starts_at - timezone('utc', now()))) / 3600 END;
  v_far := v_hours >= 24;

  IF v_match.deposit_status = 'BLOCKED' THEN
    -- Henüz tahsil edilmedi → her hâlükârda serbest bırak (çekim yok).
    PERFORM public.match_void_deposit(p_match_id, 'Kaptan iptali.');
    RETURN jsonb_build_object('ok', true, 'outcome', 'VOIDED', 'refund', 0);
  ELSIF v_match.deposit_status = 'CAPTURED' THEN
    IF v_far THEN
      -- ≥24s: iyzico komisyonu kesilerek iade. Komisyonu commission engine hesaplar.
      -- [IYZICO-TODO] gerçek iade (net = tutar − iyzico komisyonu) edge function'da.
      UPDATE public.payment_intents SET status = 'REFUNDED', voided_at = timezone('utc', now()),
        void_reason = 'Kaptan iptali (≥24s) — komisyon hariç iade.'
        WHERE id = v_match.deposit_intent_id;
      UPDATE public.matches SET deposit_status = 'REFUNDED', status = 'CANCELLED',
        cancel_reason = 'Kaptan iptali (≥24s) — komisyon hariç iade.' WHERE id = p_match_id;
      RETURN jsonb_build_object('ok', true, 'outcome', 'REFUNDED_MINUS_COMMISSION');
    ELSE
      -- <24s: iade yok (no-show maliyeti) + güvenilirlik düşür.
      UPDATE public.matches SET status = 'CANCELLED',
        cancel_reason = 'Kaptan iptali (<24s) — iade yok (no-show).' WHERE id = p_match_id;
      UPDATE public.profiles
        SET trust_score = GREATEST(COALESCE(trust_score,5.0) - 0.5, 0)
        WHERE id = v_uid;
      RETURN jsonb_build_object('ok', true, 'outcome', 'NO_REFUND_PENALTY');
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', false, 'reason', 'NO_DEPOSIT', 'deposit_status', v_match.deposit_status);
END; $$;

-- ─── 8) ADMIN — tam yetkiyle force capture / void / iade ────────────────────
-- Admin panelinin bu escrow'a TAM YETKİ ile erişmesi için (kullanıcı isteği).
CREATE OR REPLACE FUNCTION public.admin_match_deposit_action(
  p_match_id uuid, p_action text, p_reason text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_res jsonb;
BEGIN
  -- Platform admin kapısı (mevcut RBAC).
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'FORBIDDEN: admin gerekli.'; END IF;

  IF p_action = 'CAPTURE' THEN
    v_res := public.match_capture_deposit(p_match_id);
  ELSIF p_action = 'VOID' THEN
    v_res := public.match_void_deposit(p_match_id, COALESCE(p_reason, 'Admin void.'));
  ELSIF p_action = 'REFUND' THEN
    UPDATE public.payment_intents SET status = 'REFUNDED', voided_at = timezone('utc', now()),
      void_reason = COALESCE(p_reason, 'admin_refund')
      WHERE match_id = p_match_id AND related_entity_type = 'MATCH_DEPOSIT'
        AND status IN ('BLOCKED','CAPTURED');
    UPDATE public.matches SET deposit_status = 'REFUNDED' WHERE id = p_match_id;
    v_res := jsonb_build_object('ok', true, 'deposit_status', 'REFUNDED');
  ELSE
    RAISE EXCEPTION 'INVALID_ACTION: CAPTURE|VOID|REFUND bekleniyor.';
  END IF;

  -- Denetim izi (mevcut admin log altyapısı).
  BEGIN
    PERFORM public.log_admin_action('MATCH_DEPOSIT_' || p_action, 'MATCH', p_match_id, p_match_id::text,
      NULL, jsonb_build_object('reason', p_reason, 'result', v_res));
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN v_res;
END; $$;

-- ─── 9) Grants / RLS ────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.match_block_deposit(uuid, numeric, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.match_capture_deposit(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.match_void_deposit(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.match_check_threshold(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.match_cancel_by_captain(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_match_deposit_action(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public._match_player_counts(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.match_block_deposit(uuid, numeric, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.match_capture_deposit(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.match_void_deposit(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.match_check_threshold(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.match_cancel_by_captain(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_match_deposit_action(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._match_player_counts(uuid) TO authenticated, service_role;
