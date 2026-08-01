-- ════════════════════════════════════════════════════════════════════════════
-- KAPORA + KADRO KARARI — tek eşik, iki aşamalı karar, tutulan iade sözü
-- ────────────────────────────────────────────────────────────────────────────
-- NEDEN (2026-08-01 denetimi, canlı veriyle doğrulandı):
--
--  1) SÖZ TUTULMUYORDU. "Maç dolmazsa kaporanın tamamı iade" deniyor ama
--     otomatik karar veren `process_match_at_deadline` parayı KENDİ oynuyordu:
--     kapora niyetini yalnız 'VOIDED' işaretliyor, cüzdana geri koymuyordu.
--     Onay dalında da "kapora − kendi payın" farkı iade edilmiyordu. Aynı işleri
--     DOĞRU yapan `match_void_deposit` / `match_capture_deposit` zaten vardı —
--     otomatik yol onları çağırmıyordu.
--
--  2) EŞİK ÖLÇÜSÜ ÖLÜYDÜ. Karar `match_fill_stats.paid_ratio ≥ %70` ile
--     veriliyordu; `paid` ise slot JSON'unda `player.paymentStatus='PAID'`
--     arıyordu. O alanı HİÇBİR ödeme yolu yazmıyor (ölçüldü: 5 kişinin katıldığı
--     maçta bile paid=0). Yani oran DAİMA 0 çıkıyor, karar DAİMA "iptal" oluyordu.
--
--  3) KARAR ANI ÇOK ERKENDİ. Tek karar anı maçtan 8 saat önceydi; depodaki
--     "90 dakika" mekanizması canlıda hiç kurulmamıştı (gerekli iki ayar boş).
--
--  4) KAPTAN KADRODA YOKTU. Kaporayı ödeyen kurucu hiçbir koltuğa oturmuyordu:
--     lobi olduğundan boş görünüyor, sayımda da yok sayılıyordu.
--
-- KARARLAR (proje sahibi onayı):
--   • Tek eşik: DOLU ≥ TOPLAM − 2. Her kadro boyu için geçerli
--     (10 kişilik → 8, 14 kişilik → 12, 20 kişilik → 18 yani 9+9). Yüzde kuralı
--     (`match_min_player_pct`) KALDIRILDI.
--   • İki aşama: maça 8 SAAT kala "son çağrı" bildirimi (maç iptal EDİLMEZ),
--     90 DAKİKA kala kesin karar (tuttu / iptal).
--   • Kapora ödenince kaptan otomatik olarak kadroya oturur ve sayılır.
--   • Para hareketi tek yerden: iade ve tahsil daima aynı iç fonksiyonlardan.
--
-- ZAMANLAMA: mevcut `auto_process_matches` cron'u (her 10 dk) korunur; yalnız
-- fonksiyonun içi iki aşamalı hâle gelir. Dışarıdaki edge function + gizli
-- anahtar bağımlılığı GEREKMEZ — bu yüzden depodaki 90 dakikalık cron'un aksine
-- bu kurulum "ayar unutuldu" diye sessizce çalışmadan kalamaz.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 0) Ayarlar ──────────────────────────────────────────────────────────────
-- Son çağrı 8 saat, kesin karar 90 dakika. Panelden değiştirilebilir.

INSERT INTO public.app_config (key, value, value_type, category, label, description, is_public, min_value, max_value)
VALUES
  ('match_last_call_hours', '8'::jsonb, 'number', 'MAC',
   'Son çağrı (saat)',
   'Maça kaç saat kala kaptana "kadro yetişmiyor" uyarısı gider. Maç bu adımda İPTAL EDİLMEZ.',
   true, 1, 48),
  ('match_decision_minutes', '90'::jsonb, 'number', 'MAC',
   'Kesin karar (dakika)',
   'Maça kaç dakika kala kadro son kez sayılır: eşiği tutuyorsa maç kesinleşir, tutmuyorsa iptal edilir ve kapora iade edilir.',
   true, 15, 720)
ON CONFLICT (key) DO NOTHING;

-- Yüzde kuralı artık kullanılmıyor; kaydı bırakıyoruz ama ne olduğunu yazıyoruz
-- (silmek eski panel ekranlarını kırabilir).
UPDATE public.app_config
   SET description = 'KULLANIM DIŞI (2026-09). Kadro eşiği artık yüzde değil: TOPLAM − 2.'
 WHERE key = 'match_min_player_pct';

-- Rahat lobisinin "karar saati" cümlesi bu sütundan besleniyor.
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS decision_window_minutes integer NOT NULL DEFAULT 90;

COMMENT ON COLUMN public.settings.decision_window_minutes IS
  'Kesin karar anı: maç başlangıcından kaç dakika önce kadro son kez sayılır.';
COMMENT ON COLUMN public.settings.capture_window_hours IS
  'Son çağrı anı: maç başlangıcından kaç saat önce kaptana uyarı gider (iptal DEĞİL).';


-- ── 1) Kadro sayımı — TEK EŞİK ──────────────────────────────────────────────
-- `matches.min_players` kaydı bozuksa (eski maçlar, elle düzenleme) yüzde
-- kalıntısı sızmasın diye eşik BURADA yeniden dayatılır: her zaman TOPLAM − 2.

CREATE OR REPLACE FUNCTION public._match_player_counts(p_match_id uuid)
RETURNS TABLE(total_slots integer, filled_slots integer, min_players integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_slots jsonb; v_away jsonb;
BEGIN
  SELECT slots, "awaySlots" INTO v_slots, v_away
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
  -- TEK KURAL: toplamın 2 eksiği (en az 2). 20 kişilik maç → 18 (9+9).
  min_players := GREATEST(total_slots - 2, 2);
  RETURN NEXT;
END; $function$;


-- ── 2) Doluluk özeti — "ödenmiş" ölçüsü gerçek veriye bağlandı ──────────────
-- ESKİDEN: `player.paymentStatus = 'PAID'` aranıyordu; bu alanı hiçbir ödeme
-- yolu yazmadığı için sayı daima 0 çıkıyordu. ŞİMDİ: parası alınmış slot,
-- `purchasedBy` (satın alan kişi) yazılı olan slottur — `player_buy_slots_v2`
-- tam olarak bunu yazar. Eski kayıtlar için `paymentStatus` de kabul edilir.

CREATE OR REPLACE FUNCTION public.match_fill_stats(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  m RECORD;
  v_total int := 0;
  v_taken int := 0;
  v_paid  int := 0;
  v_slot  jsonb;
BEGIN
  SELECT slots, "awaySlots" INTO m FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  FOR v_slot IN
    SELECT jsonb_array_elements(COALESCE(m.slots,'[]'::jsonb))
    UNION ALL
    SELECT jsonb_array_elements(COALESCE(m."awaySlots",'[]'::jsonb))
  LOOP
    v_total := v_total + 1;
    IF v_slot->>'status' = 'TAKEN' THEN
      v_taken := v_taken + 1;
      IF COALESCE(NULLIF(v_slot->>'purchasedBy', ''), '') <> ''
         OR v_slot->'player'->>'paymentStatus' = 'PAID' THEN
        v_paid := v_paid + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'total', v_total, 'taken', v_taken, 'paid', v_paid,
    'min_players', GREATEST(v_total - 2, 2),
    'paid_ratio', CASE WHEN v_total > 0 THEN round(v_paid::numeric / v_total, 4) ELSE 0 END
  );
END; $function$;


-- ── 3) Bildirim yardımcısı ──────────────────────────────────────────────────
-- Şablon yoksa SESSİZ geçer: bildirim gönderilemedi diye para işlemi düşmemeli.

CREATE OR REPLACE FUNCTION public._notify_deposit(
  p_user_id uuid, p_match_id uuid, p_type_key text, p_vars jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_t RECORD;
BEGIN
  IF p_user_id IS NULL THEN RETURN; END IF;
  SELECT * INTO v_t FROM public.notification_templates WHERE type_key = p_type_key;
  IF NOT FOUND THEN RETURN; END IF;

  INSERT INTO public.notifications
    (user_id, title, body, type_key, match_id, action_required, deep_link, is_read)
  VALUES (
    p_user_id,
    public.replace_template_vars(v_t.title_tr, p_vars),
    public.replace_template_vars(v_t.body_tr,  p_vars),
    p_type_key, p_match_id, false,
    'oyna://match/' || p_match_id::text, false
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Kapora bildirimi gönderilemedi (% / %): %', p_type_key, p_user_id, SQLERRM;
END; $function$;

REVOKE ALL ON FUNCTION public._notify_deposit(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;


-- ── 4) Kapora serbest bırakma — ortak iç fonksiyon ──────────────────────────
-- Para hareketi TEK yerde toplandı. `match_void_deposit` kimlik kontrolünü
-- yapıp buraya devreder; otomatik karar adımı da (auth.uid() YOK) doğrudan
-- burayı çağırır. Eskiden otomatik yol bu gövdeyi hiç çalıştırmıyor, sadece
-- niyeti 'VOIDED' işaretleyip parayı cüzdana geri koymuyordu.

CREATE OR REPLACE FUNCTION public._match_release_deposit(p_match_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_match RECORD;
  v_geri boolean;
BEGIN
  SELECT id, "creatorId", captain_id, deposit_intent_id, deposit_status, deposit_amount, title
    INTO v_match FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_match.deposit_status <> 'BLOCKED' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'NOT_BLOCKED',
                              'deposit_status', v_match.deposit_status);
  END IF;

  UPDATE public.payment_intents
     SET status = 'VOIDED', voided_at = timezone('utc', now()),
         void_reason = COALESCE(p_reason, 'Kadro tamamlanamadı.')
   WHERE id = v_match.deposit_intent_id;

  -- ASIL İŞ: tutar cüzdana geri konur (idempotent — iz varsa ikinci kez yazmaz).
  v_geri := public._refund_wallet_escrow(v_match.deposit_intent_id,
    'Maç kaporası serbest bırakıldı — tutar cüzdanına geri kondu');

  UPDATE public.matches
     SET deposit_status = 'VOIDED'
   WHERE id = p_match_id;

  -- Kaptana haber ver: parasının nereye gittiğini görmeden bırakma.
  IF v_geri AND COALESCE(v_match."creatorId", v_match.captain_id) IS NOT NULL THEN
    PERFORM public._notify_deposit(
      COALESCE(v_match."creatorId", v_match.captain_id),
      p_match_id, 'match_deposit_released',
      jsonb_build_object(
        'amount', round(COALESCE(v_match.deposit_amount, 0))::text,
        'match_title', COALESCE(v_match.title, 'Maçın'),
        'reason', COALESCE(p_reason, 'Kadro tamamlanamadı.')
      ));
  END IF;

  RETURN jsonb_build_object('ok', true, 'deposit_status', 'VOIDED', 'refunded', v_geri,
                            'amount', COALESCE(v_match.deposit_amount, 0));
END; $function$;

REVOKE ALL ON FUNCTION public._match_release_deposit(uuid, text) FROM PUBLIC, anon, authenticated;


-- ── 5) Bildirim şablonları ──────────────────────────────────────────────────

INSERT INTO public.notification_templates
  (type_key, label_tr, title_tr, body_tr, category, is_mandatory, can_user_disable, badge_increment, sort_order)
VALUES
  ('match_last_call', 'Kadro son çağrısı', 'Son çağrı ⏳',
   '{{match_title}} için kadro {{filled}}/{{total}}. {{needed}} kişi daha gerek — maça {{minutes}} dakika kala dolmazsa maç iptal olur ve kaporan iade edilir.',
   'MATCH', false, true, true, 60),
  ('match_deposit_captured', 'Kapora tahsil edildi', 'Maçın kesinleşti ⚽',
   'Kadro doldu. Kaporandan kendi payın ({{share}}₺) düşüldü, {{refund}}₺ cüzdanına geri kondu.',
   'MATCH', true, false, true, 61),
  ('match_deposit_released', 'Kapora iade edildi', 'Kaporan iade edildi 💰',
   '{{match_title}} iptal oldu ({{reason}}). {{amount}}₺ kaporanın tamamı cüzdanına geri kondu.',
   'MATCH', true, false, true, 62)
ON CONFLICT (type_key) DO UPDATE SET
  title_tr = EXCLUDED.title_tr,
  body_tr  = EXCLUDED.body_tr,
  label_tr = EXCLUDED.label_tr,
  category = EXCLUDED.category;


-- ── 6) Kaptanın iptali — ortak fonksiyona devreder ──────────────────────────

CREATE OR REPLACE FUNCTION public.match_void_deposit(p_match_id uuid, p_reason text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_match RECORD; v_res jsonb;
BEGIN
  SELECT id, "creatorId", captain_id INTO v_match
  FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF COALESCE(v_match."creatorId", v_match.captain_id) IS DISTINCT FROM v_uid AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  v_res := public._match_release_deposit(p_match_id, p_reason);
  IF (v_res->>'ok')::boolean THEN
    UPDATE public.matches
       SET status = 'CANCELLED',
           cancel_reason = COALESCE(p_reason, 'Kadro tamamlanamadı — kapora serbest bırakıldı.')
     WHERE id = p_match_id;
    RETURN jsonb_build_object('ok', true, 'deposit_status', 'VOIDED', 'match_status', 'CANCELLED');
  END IF;
  RETURN v_res;
END; $function$;


-- ── 7) Kapora tahsili — kaptan bilgilendirilir ──────────────────────────────
-- Gövde eskisiyle aynı (kısmi iade hesabı DEĞİŞMEDİ); tek fark: kaptana artık
-- "payın düştü, şu kadar geri döndü" bildirimi gidiyor.

CREATE OR REPLACE FUNCTION public.match_capture_deposit(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_match RECORD;
  v_intent public.payment_intents;
  v_refund numeric := 0;
BEGIN
  SELECT id, deposit_intent_id, deposit_status, deposit_amount, price, "creatorId", captain_id, title
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

      PERFORM public._notify_deposit(
        COALESCE(v_match."creatorId", v_match.captain_id), p_match_id, 'match_deposit_captured',
        jsonb_build_object(
          'match_title', COALESCE(v_match.title, 'Maçın'),
          'share',  round(COALESCE(v_match.price, 0))::text,
          'refund', round(v_refund)::text
        ));
    ELSE
      v_refund := 0; -- iade izi zaten var (idempotent tekrar) ya da tutar yok
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'deposit_status', 'CAPTURED', 'fill_refund', v_refund);
END; $function$;


-- ── 8) Kapora bloke + KAPTANI KADROYA OTURT ─────────────────────────────────
-- Kaptanın payı zaten kaporanın içinde (tahsilde kapora − pay iade ediliyor).
-- O yüzden kaporayı ödeyen kaptan kadroya OTURUR ve sayılır. Aksi hâlde lobi
-- olduğundan boş görünüyor, karar anında da kaptan yok sayılıyordu.

CREATE OR REPLACE FUNCTION public.match_block_deposit(p_match_id uuid, p_amount numeric, p_providers jsonb DEFAULT '[]'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_match RECORD;
  v_intent public.payment_intents;
  v_counts RECORD;
  v_prov jsonb;
  v_pid text;
  v_sugg jsonb;
  v_buckets RECORD;
  v_spendable numeric;
  v_slots jsonb;
  v_hedef text;
  v_prof RECORD;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT: Kapora tutarı pozitif olmalı.'; END IF;

  SELECT id, "creatorId", captain_id, pitch_id, deposit_status, price, commission_model, slots
    INTO v_match FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Maç bulunamadı.'; END IF;
  IF COALESCE(v_match."creatorId", v_match.captain_id) IS DISTINCT FROM v_uid AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: Yalnız maçı kuran kaptan kapora bloke edebilir.';
  END IF;
  IF v_match.deposit_status <> 'NONE' THEN
    RAISE EXCEPTION 'ALREADY_BLOCKED: Bu maçın kaporası zaten işlenmiş (%).', v_match.deposit_status;
  END IF;

  -- CÜZDAN-ÖNCELİKLİ: yeterli bakiye şart; yoksa kullanıcı yüklemeye yönlendirilir.
  SELECT * INTO v_buckets FROM public._wallet_bucket_balances(v_uid);
  v_spendable := COALESCE(v_buckets.topup_balance, 0) + COALESCE(v_buckets.refund_credit_balance, 0);
  IF v_spendable < p_amount THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE: Kapora için %₺ gerekiyor; kullanılabilir bakiyen %₺. Cüzdanına yükleme yapıp tekrar dene.',
      p_amount::int, round(v_spendable, 2);
  END IF;

  PERFORM public.wallet_spend_balance(v_uid, p_amount, 'MATCH', p_match_id, p_match_id,
    'Maç kaporası — cüzdandan güvenceye alındı');

  INSERT INTO public.payment_intents (
    user_id, match_id, pitch_id, amount, currency, status, provider,
    commission_amount, owner_amount, service_provider_amount,
    commission_model, related_entity_type, blocked_at, raw
  ) VALUES (
    v_uid, p_match_id, v_match.pitch_id, p_amount, 'TRY', 'BLOCKED', 'WALLET',
    0, 0, 0, COALESCE(v_match.commission_model,'MODEL_A'), 'MATCH_DEPOSIT', timezone('utc', now()),
    jsonb_build_object('wallet_escrow', true)
  ) RETURNING * INTO v_intent;

  -- ── Kaptanı kadroya oturt (ilk BOŞ ev sahibi koltuğu) ────────────────────
  v_slots := COALESCE(v_match.slots, '[]'::jsonb);
  SELECT s->>'id' INTO v_hedef
  FROM jsonb_array_elements(v_slots) WITH ORDINALITY AS t(s, ord)
  WHERE COALESCE(s->>'status', 'OPEN') = 'OPEN'
  ORDER BY t.ord
  LIMIT 1;

  IF v_hedef IS NOT NULL THEN
    SELECT full_name, avatar_url, self_skill INTO v_prof FROM public.profiles WHERE id = v_uid;
    v_slots := (
      SELECT jsonb_agg(
        CASE WHEN s->>'id' = v_hedef THEN
          s || jsonb_build_object(
            'status', 'TAKEN',
            'purchasedBy', v_uid::text,
            'assignmentStatus', 'ASSIGNED',
            'occupant', v_uid::text,
            'player', jsonb_build_object(
              'id', v_uid::text,
              'name', COALESCE(v_prof.full_name, 'Kaptan'),
              'avatar', COALESCE(v_prof.avatar_url, ''),
              'position', COALESCE(s->>'role', 'OYUNCU'),
              'selfSkill', v_prof.self_skill,
              'x', COALESCE((s->>'x')::numeric, 50),
              'y', COALESCE((s->>'y')::numeric, 50),
              -- Payı kaporanın içinde: bu koltuk ÖDENMİŞ sayılır.
              'paymentStatus', 'PAID'
            ))
        ELSE s END
        ORDER BY t.ord)
      FROM jsonb_array_elements(v_slots) WITH ORDINALITY AS t(s, ord)
    );
    UPDATE public.matches SET slots = v_slots WHERE id = p_match_id;

    INSERT INTO public.match_participants (match_id, user_id, role, status, is_buyer, bought_slots)
    VALUES (p_match_id, v_uid, 'home', 'confirmed', true, 1)
    ON CONFLICT (match_id, user_id) DO UPDATE SET
      is_buyer = true,
      status = 'confirmed';
  END IF;

  SELECT * INTO v_counts FROM public._match_player_counts(p_match_id);

  UPDATE public.matches SET
    deposit_intent_id  = v_intent.id,
    deposit_status     = 'BLOCKED',
    deposit_amount     = p_amount,
    deferred_providers = COALESCE(p_providers, '[]'::jsonb),
    min_players        = v_counts.min_players,
    status             = 'ACTIVE'
  WHERE id = p_match_id;

  FOR v_prov IN SELECT * FROM jsonb_array_elements(COALESCE(p_providers,'[]'::jsonb)) LOOP
    IF (v_prov->>'type') IS NOT NULL THEN
      BEGIN
        v_pid := NULLIF(v_prov->>'providerId', '');
        IF v_pid IS NULL THEN
          v_sugg := public.find_providers_for_match(p_match_id, (v_prov->>'type')::text);
          v_pid  := v_sugg->0->>'id';
        END IF;
        IF v_pid IS NOT NULL THEN
          PERFORM public.create_service_request(p_match_id, v_pid::uuid, (v_prov->>'type')::text);
        END IF;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Ertelenmiş sağlayıcı talebi gönderilemedi (%): %', v_prov, SQLERRM;
      END;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true, 'intent_id', v_intent.id, 'deposit_status', 'BLOCKED',
    'match_status', 'ACTIVE', 'min_players', v_counts.min_players,
    'filled_slots', v_counts.filled_slots,
    'captain_seated', v_hedef IS NOT NULL,
    'total_slots', v_counts.total_slots
  );
END; $function$;


-- ── 9) Kesin karar — para artık ortak fonksiyonlardan geçer ─────────────────
-- DEĞİŞEN: eşik ölçüsü (yüzde yerine TOPLAM − 2) ve para yolu (niyeti elle
-- işaretlemek yerine test edilmiş tahsil/iade fonksiyonları).
-- DEĞİŞMEYEN: saha sahibinin hakediş kaydı ve slot alanların iadesi — bu
-- migration o kuralların hiçbirine dokunmaz.

CREATE OR REPLACE FUNCTION public.process_match_at_deadline(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  m           RECORD;
  v_counts    RECORD;
  v_intent    RECORD;
  v_user      RECORD;
  v_collected numeric;
  v_comm      jsonb;
  v_captured  int := 0;
  v_voided    int := 0;
  v_refunded  int := 0;
  v_amt       numeric;
  v_dep       jsonb;
BEGIN
  SELECT * INTO m FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF m.status IN ('CONFIRMED','CANCELLED','COMPLETED','LIVE') THEN
    RETURN jsonb_build_object('match_id', p_match_id, 'status', m.status, 'idempotent', true);
  END IF;

  SELECT * INTO v_counts FROM public._match_player_counts(p_match_id);

  IF v_counts.filled_slots >= v_counts.min_players THEN
    UPDATE public.matches SET status = 'CONFIRMED', confirmed_at = now() WHERE id = p_match_id;

    SELECT COALESCE(SUM(ABS(amount)), 0) - COALESCE((
      SELECT SUM(amount) FROM public.wallet_transactions
      WHERE match_id = p_match_id AND type IN ('MATCH_REFUND','REFUND')), 0)
    INTO v_collected
    FROM public.wallet_transactions WHERE match_id = p_match_id AND type = 'MATCH_FEE';

    IF v_collected > 0 AND m.pitch_id IS NOT NULL THEN
      v_comm := public.calculate_commission(v_collected, 'PITCH', m.pitch_id);
      INSERT INTO public.wallet_transactions
        (user_id, match_id, amount, type, balance_type, status, reference_type, reference_id, description)
      SELECT p.owner_id, p_match_id, (v_comm->>'net_amount')::numeric, 'MATCH_EARNING', 'EARNINGS', 'PENDING',
             'MATCH', p_match_id, 'Maç onaylandı — kapora tahsilatı (2 hafta beklemede)'
      FROM public.pitches p WHERE p.id = m.pitch_id AND p.owner_id IS NOT NULL;
    END IF;

    -- Kapora: tahsil + "payın dışındaki tutar" iadesi (tek yerden).
    IF m.deposit_status = 'BLOCKED' THEN
      v_dep := public.match_capture_deposit(p_match_id);
      v_captured := v_captured + 1;
    END IF;

    -- Kalan niyetler (slot ödemeleri vb.).
    FOR v_intent IN
      SELECT * FROM public.payment_intents
      WHERE match_id = p_match_id AND status IN ('BLOCKED','PENDING') FOR UPDATE
    LOOP
      UPDATE public.payment_intents SET status = 'CAPTURED', captured_at = now()
      WHERE id = v_intent.id;
      v_captured := v_captured + 1;
    END LOOP;

    RETURN jsonb_build_object('match_id', p_match_id, 'status', 'CONFIRMED',
      'filled', v_counts.filled_slots, 'min_players', v_counts.min_players,
      'collected', v_collected, 'captured_intents', v_captured, 'deposit', v_dep);
  ELSE
    UPDATE public.matches SET status = 'CANCELLED', cancel_reason = 'QUORUM_NOT_MET',
      refund_status = 'PROCESSING' WHERE id = p_match_id;

    -- Slot alanların iadesi (kural değişmedi).
    FOR v_user IN
      SELECT wt.user_id
      FROM public.wallet_transactions wt
      WHERE wt.match_id = p_match_id AND wt.type = 'MATCH_FEE'
      GROUP BY wt.user_id
    LOOP
      v_amt := public._match_refund_partial(v_user.user_id, p_match_id, NULL);
      IF v_amt > 0 THEN v_refunded := v_refunded + 1; END IF;
    END LOOP;

    -- ASIL DÜZELTME: kaptanın kaporası cüzdanına GERİ KONUR (eskiden yalnız
    -- 'VOIDED' işaretleniyor, para havada kalıyordu).
    IF m.deposit_status = 'BLOCKED' THEN
      v_dep := public._match_release_deposit(p_match_id, 'Kadro tamamlanamadı — maç iptal edildi.');
      v_voided := v_voided + 1;
    END IF;

    FOR v_intent IN
      SELECT * FROM public.payment_intents
      WHERE match_id = p_match_id AND status IN ('BLOCKED','PENDING') FOR UPDATE
    LOOP
      UPDATE public.payment_intents SET status = 'VOIDED', voided_at = now(),
        void_reason = 'MATCH_QUORUM_NOT_MET' WHERE id = v_intent.id;
      v_voided := v_voided + 1;
    END LOOP;

    UPDATE public.matches SET refund_status = 'DONE' WHERE id = p_match_id;

    RETURN jsonb_build_object('match_id', p_match_id, 'status', 'CANCELLED',
      'filled', v_counts.filled_slots, 'min_players', v_counts.min_players,
      'refunded', v_refunded, 'voided_intents', v_voided, 'deposit', v_dep);
  END IF;
END; $function$;


-- ── 10) İki aşamalı tarama (her 10 dakikada bir cron) ───────────────────────
-- 1. AŞAMA — SON ÇAĞRI: maça `match_last_call_hours` (8) saatten az kalmış ama
--    karar anına henüz gelmemiş, eşiği tutmayan maçlarda kaptana uyarı gider.
--    Maç İPTAL EDİLMEZ. Aynı maça yalnız bir kez gönderilir (bildirim izinden).
-- 2. AŞAMA — KESİN KARAR: maça `match_decision_minutes` (90) dakikadan az
--    kalmışsa kadro son kez sayılır ve karar verilir.

CREATE OR REPLACE FUNCTION public.auto_process_matches()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uyari_saat  numeric := COALESCE(public.get_config_number('match_last_call_hours', 8), 8);
  v_karar_dk    numeric := COALESCE(public.get_config_number('match_decision_minutes', 90), 90);
  v_match       RECORD;
  v_counts      RECORD;
  v_uyarilan    int := 0;
  v_islenen     int := 0;
BEGIN
  -- 1) SON ÇAĞRI
  FOR v_match IN
    SELECT mm.id, mm.title, mm."creatorId", mm.captain_id
    FROM public.matches mm
    WHERE mm.status = 'ACTIVE'
      AND mm.starts_at IS NOT NULL
      AND mm.starts_at >  now() + make_interval(mins => v_karar_dk::int)
      AND mm.starts_at <= now() + make_interval(mins => (v_uyari_saat * 60)::int)
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.match_id = mm.id AND n.type_key = 'match_last_call')
  LOOP
    SELECT * INTO v_counts FROM public._match_player_counts(v_match.id);
    CONTINUE WHEN v_counts.filled_slots >= v_counts.min_players;

    PERFORM public._notify_deposit(
      COALESCE(v_match."creatorId", v_match.captain_id), v_match.id, 'match_last_call',
      jsonb_build_object(
        'match_title', COALESCE(v_match.title, 'Maçın'),
        'filled', v_counts.filled_slots::text,
        'total',  v_counts.total_slots::text,
        'needed', GREATEST(v_counts.min_players - v_counts.filled_slots, 0)::text,
        'minutes', v_karar_dk::int::text
      ));
    v_uyarilan := v_uyarilan + 1;
  END LOOP;

  -- 2) KESİN KARAR
  FOR v_match IN
    SELECT id FROM public.matches
    WHERE status = 'ACTIVE'
      AND starts_at IS NOT NULL
      AND starts_at <= now() + make_interval(mins => v_karar_dk::int)
  LOOP
    BEGIN
      PERFORM public.process_match_at_deadline(v_match.id);
      v_islenen := v_islenen + 1;
    EXCEPTION WHEN OTHERS THEN
      -- Tek maçın hatası taramanın tamamını düşürmesin.
      RAISE WARNING 'Maç kararı verilemedi (%): %', v_match.id, SQLERRM;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'son_cagri', v_uyarilan, 'karar_verilen', v_islenen,
    'uyari_saat', v_uyari_saat, 'karar_dakika', v_karar_dk);
END; $function$;


-- ── 11) Cüzdan özeti — bloke tutar görünür oldu ─────────────────────────────
-- Eskiden kapora bakiyeden düşüyor ve sıradan bir harcama gibi görünüyordu.
-- Artık "şu an bloke" ayrı bir satır: nerede olduğu belli.

CREATE OR REPLACE FUNCTION public.get_wallet_summary()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_earnings numeric;
  v_reserved numeric;
  v_buckets  RECORD;
  v_blocked  numeric;
  v_blocked_n int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  SELECT COALESCE(SUM(CASE WHEN type IN ('DEPOSIT','MATCH_EARNING','BOOKING_EARNING','SERVICE_EARNING','REFERRAL_BONUS')
                           THEN amount ELSE -amount END), 0)
  INTO v_earnings
  FROM public.wallet_transactions
  WHERE user_id = v_uid AND balance_type = 'EARNINGS' AND status = 'COMPLETED'
    AND type NOT IN ('MATCH_FEE','MATCH_REFUND','REFUND');

  SELECT COALESCE(SUM(amount), 0)
  INTO v_reserved
  FROM public.wallet_transactions
  WHERE user_id = v_uid AND balance_type = 'EARNINGS'
    AND type = 'WITHDRAWAL' AND status = 'PENDING';

  SELECT COALESCE(SUM(amount), 0), COUNT(*)
  INTO v_blocked, v_blocked_n
  FROM public.payment_intents
  WHERE user_id = v_uid AND status = 'BLOCKED'
    AND provider = 'WALLET' AND related_entity_type = 'MATCH_DEPOSIT';

  SELECT * INTO v_buckets FROM public._wallet_bucket_balances(v_uid);

  RETURN jsonb_build_object(
    'earnings_balance',      GREATEST(v_earnings - v_reserved, 0),
    'reserved_balance',      GREATEST(v_reserved, 0),
    'refund_credit_balance', v_buckets.refund_credit_balance,
    'topup_balance',         v_buckets.topup_balance,
    'spendable_balance',     v_buckets.topup_balance + v_buckets.refund_credit_balance,
    -- Harcanabilir bakiyeye DAHİL DEĞİL: para zaten cüzdandan çıkmış, bir maçta
    -- güvencede bekliyor. Sadece "nerede?" sorusunu cevaplar.
    'blocked_balance',       GREATEST(v_blocked, 0),
    'blocked_match_count',   COALESCE(v_blocked_n, 0)
  );
END; $function$;
