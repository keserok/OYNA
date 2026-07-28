-- ============================================================================
-- K1 — CÜZDAN İADESİ + %5 KESİNTİLİ ÇEKİM
-- ----------------------------------------------------------------------------
-- Ürün kararı: İade parası kullanıcının OYNA cüzdanına geçer. Kullanıcı bu
-- parayı uygulama içinde harcayabilir VEYA %5 hizmet bedeliyle banka hesabına
-- çekebilir. Karta iade yoktur.
--
-- Bugüne kadar iade `REFUND_CREDIT` kovasına yazılıyor ve o kova çekime
-- BİLEREK kapalıydı ("yükle -> iade ettir -> kesintisiz çek" kaçağı için,
-- 20260728000000:5-8). %5 hizmet bedeli o kaçağı kapattığı için kova artık
-- çekime açılabilir.
--
-- DB kovaları (TOP_UP / REFUND_CREDIT / EARNINGS) AYNEN KALIR — muhasebe,
-- chargeback eşlemesi ve I4 değişmezi bunlara bağlı. Değişen: kullanıcıya
-- kaç isim gösterildiği ve hangisinin çekilebilir olduğu.
--
--   Cüzdan Bakiyesi = TOP_UP + REFUND_CREDIT  -> çekilebilir, %5 hizmet bedeli
--   Kazancım        = EARNINGS                -> çekilebilir, KESİNTİSİZ
--                                                (komisyon zaten alınmış)
--
-- ⚠️ `wallet_cashout_enabled` BU MİGRASYONDA AÇILMAZ. Açılmadan önce
--    kapatılması gereken açıklar migrasyonun sonundaki KAPI notunda.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. KOVA DAĞILIMI KOLONLARI
-- ----------------------------------------------------------------------------
-- Çekim artık iki kovadan birden düşebilir. Hangi kovadan ne kadar düştüğü
-- kaydedilmezse, talep reddedildiğinde geri kredi doğru kovaya yazılamaz;
-- kartla hiç yüklenmemiş para "yüklenmiş" görünür ve chargeback eşlemesi
-- yanlışlanır.
ALTER TABLE public.payout_requests
  ADD COLUMN IF NOT EXISTS from_topup_amount         numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS from_refund_credit_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cancelled_by_user         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reject_reason             text;

COMMENT ON COLUMN public.payout_requests.from_topup_amount IS
  'WALLET_CASHOUT: brüt tutarın TOP_UP kovasından düşen kısmı. from_topup + from_refund_credit = amount (değişmez I8).';
COMMENT ON COLUMN public.payout_requests.from_refund_credit_amount IS
  'WALLET_CASHOUT: brüt tutarın REFUND_CREDIT kovasından düşen kısmı. Harcama sırasıyla aynı kural: önce iade kredisi.';
COMMENT ON COLUMN public.payout_requests.cancelled_by_user IS
  'Talebi admin değil kullanıcının kendisi iptal ettiyse true (cancel_wallet_cashout).';

-- Mevcut WALLET_CASHOUT satırları tamamen TOP_UP kovasındandı (eski kural).
UPDATE public.payout_requests
   SET from_topup_amount = amount
 WHERE payout_type = 'WALLET_CASHOUT'
   AND from_topup_amount = 0 AND from_refund_credit_amount = 0
   AND COALESCE(amount, 0) > 0;

-- ----------------------------------------------------------------------------
-- 2. CONFIG
-- ----------------------------------------------------------------------------
-- %10 -> %5. Yüzde tek kaynakta (app_config) tutulur; istemci asla hesaplamaz.
UPDATE public.app_config
   SET value = '5'::jsonb,
       label = 'Çekim Hizmet Bedeli (%)',
       description = 'Cüzdan bakiyesi IBAN''a çekilirken alınan hizmet bedeli (%). 100₺ çekimde %5 = 5₺, net 95₺. Kazanç çekiminde uygulanmaz.'
 WHERE key = 'wallet_cashout_fee_pct';

-- Açıklama "yalnız TOP_UP" diyordu; artık iade bakiyesi de çekilebiliyor.
UPDATE public.app_config
   SET description = 'AÇIK iken kullanıcılar cüzdan bakiyesini (yüklenen + iade) kayıtlı IBAN''a %5 hizmet bedeliyle çekebilir. KAPALI doğar; oyuncu kimlik doğrulama ekranı ve sözleşme metinleri yayınlanmadan AÇILMAZ.'
 WHERE key = 'wallet_cashout_enabled';

-- Tam-bakiye istisnası: bakiyenin TAMAMI çekiliyorsa min eşiği aranmaz.
-- Yoksa 100₺ altı bakiyesi olan kullanıcı ne parasını çekebilir ne hesabını
-- silebilir (silme kapısı çekilebilir bakiye > 0 iken engelliyor).
INSERT INTO public.app_config (key, value, value_type, category, label, description, is_public)
VALUES ('wallet_cashout_allow_full_balance', 'true'::jsonb, 'boolean', 'ODEME',
        'Tam Bakiye Çekimi',
        'AÇIK iken, bakiyenin tamamı çekildiğinde minimum çekim eşiği aranmaz. Kapalıysa eşik altındaki bakiye kilitlenir (ne çekilebilir ne hesap silinebilir).',
        false)
ON CONFLICT (key) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 3. IBAN MOD-97 (ISO 7064) — sunucu tarafı tek gerçek savunma
-- ----------------------------------------------------------------------------
-- İstemci doğrulaması atlanabilir. Biçimi doğru ama checksum'ı yanlış bir
-- IBAN'a para gönderilmeye çalışılır, banka reddeder, talep FAILED'a düşer;
-- hem kullanıcı hem operasyon boşuna döner.
CREATE OR REPLACE FUNCTION public._iban_mod97(p_numeric text)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'pg_temp'
AS $$
DECLARE
  v_rem bigint := 0;
  i int;
BEGIN
  -- Basamak basamak: sayı bigint'e sığmayacak kadar uzun.
  FOR i IN 1..length(p_numeric) LOOP
    v_rem := (v_rem * 10 + substr(p_numeric, i, 1)::int) % 97;
  END LOOP;
  RETURN v_rem::int;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_valid_tr_iban(p_iban text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_iban text := upper(regexp_replace(COALESCE(p_iban, ''), '\s', '', 'g'));
  v_rearranged text;
  v_numeric text := '';
  v_ch text;
  i int;
BEGIN
  IF v_iban !~ '^TR[0-9]{24}$' THEN RETURN false; END IF;
  -- utils/iban.ts:19 ile birebir: ilk 4 karakteri sona taşı.
  v_rearranged := substr(v_iban, 5) || substr(v_iban, 1, 4);
  FOR i IN 1..length(v_rearranged) LOOP
    v_ch := substr(v_rearranged, i, 1);
    IF v_ch ~ '[0-9]' THEN
      v_numeric := v_numeric || v_ch;
    ELSE
      v_numeric := v_numeric || (ascii(v_ch) - 55)::text;  -- A=10 .. Z=35
    END IF;
  END LOOP;
  RETURN public._iban_mod97(v_numeric) = 1;
END;
$$;

-- Ad karşılaştırması: Türkçe karakter ve boşluk duyarsız normalize.
-- Para yalnız kullanıcının KENDİ hesabına gönderilebilir (MASAK + dolandırıcılık).
CREATE OR REPLACE FUNCTION public._normalize_person_name(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'pg_temp'
AS $$
  SELECT regexp_replace(
           translate(
             upper(trim(COALESCE(p_name, ''))),
             'ÇĞİIÖŞÜÂÎÛçğıiöşüâîû',
             'CGIIOSUAIUCGIIOSUAIU'
           ),
           '[^A-Z]', '', 'g');
$$;

-- ----------------------------------------------------------------------------
-- 4. ÇEKİLEBİLİR BAKİYE — artık topup + refund_credit
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._wallet_withdrawable(p_user_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_b RECORD;
BEGIN
  SELECT * INTO v_b FROM public._wallet_bucket_balances(p_user_id);
  RETURN round(COALESCE(v_b.topup_balance, 0) + COALESCE(v_b.refund_credit_balance, 0), 2);
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. add_payout_method — mod-97 + ad eşleşmesi
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_payout_method(p_kind text, p_holder_name text, p_label text DEFAULT NULL::text, p_iban text DEFAULT NULL::text, p_card_number text DEFAULT NULL::text, p_card_brand text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_iban   text;
  v_digits text;
  v_row    public.payout_methods;
  v_count  int;
  v_full   text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_kind NOT IN ('IBAN','CARD') THEN RAISE EXCEPTION 'INVALID_KIND'; END IF;
  IF p_holder_name IS NULL OR length(trim(p_holder_name)) < 3 THEN
    RAISE EXCEPTION 'NAME_REQUIRED: Hesap/kart sahibinin adı gerekli.';
  END IF;

  SELECT count(*) INTO v_count FROM public.payout_methods WHERE user_id = v_uid;
  IF v_count >= 5 THEN
    RAISE EXCEPTION 'METHOD_LIMIT: En fazla 5 ödeme yöntemi kaydedebilirsin.';
  END IF;

  -- Hesap sahibi adı, kullanıcının kendi adıyla eşleşmeli. Profilinde ad yoksa
  -- kapı uygulanamaz; o durumda engellemek yerine geçilir (profil doldurma
  -- akışı ayrı bir iş) — ama çekim anında yeniden denetlenir.
  SELECT full_name INTO v_full FROM public.profiles WHERE id = v_uid;
  IF COALESCE(public._normalize_person_name(v_full), '') <> ''
     AND public._normalize_person_name(p_holder_name) IS DISTINCT FROM public._normalize_person_name(v_full) THEN
    RAISE EXCEPTION 'HOLDER_NAME_MISMATCH: Hesap sahibi adı, hesabındaki adla eşleşmiyor. Para yalnız kendi hesabına gönderilebilir.';
  END IF;

  IF p_kind = 'IBAN' THEN
    v_iban := upper(regexp_replace(COALESCE(p_iban,''), '\s', '', 'g'));
    IF v_iban !~ '^TR[0-9]{24}$' THEN
      RAISE EXCEPTION 'INVALID_IBAN: IBAN "TR" ile başlamalı ve 26 karakter olmalı.';
    END IF;
    IF NOT public.is_valid_tr_iban(v_iban) THEN
      RAISE EXCEPTION 'INVALID_IBAN: IBAN doğrulama basamağı geçersiz — kontrol edin.';
    END IF;
    INSERT INTO public.payout_methods (user_id, kind, label, holder_name, iban, is_default)
    VALUES (v_uid, 'IBAN', NULLIF(trim(COALESCE(p_label,'')),''), trim(p_holder_name), v_iban, v_count = 0)
    RETURNING * INTO v_row;
  ELSE
    v_digits := regexp_replace(COALESCE(p_card_number,''), '\s', '', 'g');
    IF v_digits !~ '^[0-9]{12,19}$' THEN
      RAISE EXCEPTION 'INVALID_CARD: Kart numarası 12-19 haneli olmalı.';
    END IF;
    INSERT INTO public.payout_methods (user_id, kind, label, holder_name, card_last4, card_brand, card_token, is_default)
    VALUES (v_uid, 'CARD', NULLIF(trim(COALESCE(p_label,'')),''), trim(p_holder_name),
            right(v_digits, 4),
            COALESCE(NULLIF(trim(COALESCE(p_card_brand,'')),''),
                     CASE left(v_digits,1) WHEN '4' THEN 'VISA' WHEN '5' THEN 'MASTERCARD' ELSE 'KART' END),
            'SIM_' || replace(gen_random_uuid()::text, '-', ''),
            v_count = 0)
    RETURNING * INTO v_row;
  END IF;

  RETURN jsonb_build_object('id', v_row.id, 'kind', v_row.kind, 'is_default', v_row.is_default);
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. preview_wallet_cashout — çekilebilir bakiye + yeni alanlar
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.preview_wallet_cashout(p_gross numeric)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid uuid := auth.uid(); v_q jsonb; v_buckets RECORD;
  v_withdrawable numeric;
  v_min numeric := COALESCE(public.get_config_number('wallet_cashout_min', 100), 100);
  v_enabled boolean := public.get_config_bool('wallet_cashout_enabled', false);
  v_req_id boolean := public.get_config_bool('wallet_cashout_require_identity', true);
  v_allow_full boolean := public.get_config_bool('wallet_cashout_allow_full_balance', true);
  v_id_ok boolean; v_has_pending boolean; v_min_waived boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT * INTO v_buckets FROM public._wallet_bucket_balances(v_uid);
  v_withdrawable := round(COALESCE(v_buckets.topup_balance,0) + COALESCE(v_buckets.refund_credit_balance,0), 2);
  v_q := public._wallet_cashout_quote(p_gross);
  v_id_ok := (NOT v_req_id) OR EXISTS (SELECT 1 FROM public.provider_identities WHERE user_id = v_uid AND status = 'VERIFIED');
  -- PROCESSING de bekleyen sayılır; admin talebi işleme aldığında kullanıcı
  -- ikinci talep açabiliyordu.
  v_has_pending := EXISTS (SELECT 1 FROM public.payout_requests WHERE user_id = v_uid AND status IN ('PENDING','PROCESSING'));
  v_min_waived := v_allow_full AND v_withdrawable > 0
                  AND round(COALESCE(p_gross,0),2) = v_withdrawable;

  RETURN v_q || jsonb_build_object(
    'enabled', v_enabled, 'min', v_min,
    'withdrawable_balance', v_withdrawable,
    -- Geriye dönük uyum: eski istemciler topup_balance okuyor.
    'topup_balance', v_withdrawable,
    'from_refund_credit', LEAST(COALESCE(v_buckets.refund_credit_balance,0), round(COALESCE(p_gross,0),2)),
    'identity_ok', v_id_ok, 'identity_required', v_req_id,
    'has_pending', v_has_pending, 'min_waived', v_min_waived);
END;
$$;

-- ----------------------------------------------------------------------------
-- 7. request_wallet_cashout — kovalar, kapılar, iki satırlı düşüm
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_wallet_cashout(p_gross numeric, p_method_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_method public.payout_methods;
  v_buckets RECORD;
  v_withdrawable numeric; v_from_refund numeric; v_from_topup numeric;
  v_min numeric := COALESCE(public.get_config_number('wallet_cashout_min', 100), 100);
  v_req_id boolean := public.get_config_bool('wallet_cashout_require_identity', true);
  v_allow_full boolean := public.get_config_bool('wallet_cashout_allow_full_balance', true);
  v_q jsonb; v_fee numeric; v_net numeric; v_gross numeric;
  v_payout public.payout_requests;
  v_full text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED: Giriş gerekli.'; END IF;

  IF NOT public.get_config_bool('wallet_cashout_enabled', false) THEN
    RAISE EXCEPTION 'CASHOUT_DISABLED: Para çekme şu an kapalı.';
  END IF;

  -- Reşit olmayan kullanıcı kapısı: yükleme veli onayına bağlıydı, çekim değildi.
  PERFORM public.assert_can_transact(v_uid);

  -- [S4] Yeni hesap çekim kilidi
  PERFORM public._assert_account_old_enough_for_cashout(v_uid);

  SELECT * INTO v_method FROM public.payout_methods WHERE id = p_method_id AND user_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'METHOD_NOT_FOUND: Kayıtlı IBAN bulunamadı.'; END IF;
  IF v_method.kind <> 'IBAN' THEN
    RAISE EXCEPTION 'IBAN_REQUIRED: Çekim yalnız kayıtlı IBAN''a yapılabilir.';
  END IF;
  IF NOT public.is_valid_tr_iban(v_method.iban) THEN
    RAISE EXCEPTION 'INVALID_IBAN: Kayıtlı IBAN geçersiz. Lütfen yeniden ekle.';
  END IF;

  -- Para yalnız kullanıcının KENDİ hesabına gönderilebilir.
  SELECT full_name INTO v_full FROM public.profiles WHERE id = v_uid;
  IF COALESCE(public._normalize_person_name(v_full), '') = '' THEN
    RAISE EXCEPTION 'PROFILE_NAME_REQUIRED: Para çekmeden önce profilindeki ad soyad alanını doldur.';
  END IF;
  IF public._normalize_person_name(v_method.holder_name) IS DISTINCT FROM public._normalize_person_name(v_full) THEN
    RAISE EXCEPTION 'HOLDER_NAME_MISMATCH: IBAN sahibi adı, hesabındaki adla eşleşmiyor. Para yalnız kendi hesabına gönderilebilir.';
  END IF;

  IF v_req_id AND NOT EXISTS (SELECT 1 FROM public.provider_identities WHERE user_id = v_uid AND status = 'VERIFIED') THEN
    RAISE EXCEPTION 'IDENTITY_REQUIRED: Para çekmeden önce TC kimlik doğrulaması gerekli.';
  END IF;

  PERFORM 1 FROM public.profiles WHERE id = v_uid FOR UPDATE;
  -- PROCESSING de bekleyen sayılır (eski kontroldeki delik).
  IF EXISTS (SELECT 1 FROM public.payout_requests WHERE user_id = v_uid AND status IN ('PENDING','PROCESSING')) THEN
    RAISE EXCEPTION 'PENDING_PAYOUT: Bekleyen bir çekim talebin var. Sonuçlanınca yeni talep açabilirsin.';
  END IF;

  SELECT * INTO v_buckets FROM public._wallet_bucket_balances(v_uid);
  v_withdrawable := round(COALESCE(v_buckets.topup_balance,0) + COALESCE(v_buckets.refund_credit_balance,0), 2);
  v_gross := round(COALESCE(p_gross, 0), 2);

  IF v_gross <= 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT: Tutar sıfırdan büyük olmalı.'; END IF;
  IF v_withdrawable < v_gross THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE: Çekilebilir bakiyen %₺, istenen %₺.', round(v_withdrawable,2), v_gross;
  END IF;

  -- Tam bakiye çekiliyorsa min eşiği aranmaz; yoksa küçük bakiye kilitlenir.
  IF v_gross < v_min AND NOT (v_allow_full AND v_gross = v_withdrawable) THEN
    RAISE EXCEPTION 'MIN_CASHOUT: En az %₺ çekebilirsin (ya da bakiyenin tamamını).', v_min::int;
  END IF;

  v_q := public._wallet_cashout_quote(v_gross);
  v_fee := (v_q->>'fee')::numeric;
  v_net := (v_q->>'net')::numeric;
  IF v_net <= 0 THEN RAISE EXCEPTION 'INVALID_NET: Net çekim tutarı sıfırdan büyük olmalı.'; END IF;

  -- Kova dağılımı — harcama sırasıyla aynı kural: ÖNCE iade kredisi.
  v_from_refund := LEAST(round(COALESCE(v_buckets.refund_credit_balance,0),2), v_gross);
  v_from_topup  := round(v_gross - v_from_refund, 2);

  INSERT INTO public.payout_requests
    (user_id, amount, fee_amount, net_amount, iban, iban_holder_name, status, payout_type,
     payout_method_id, method_kind, from_topup_amount, from_refund_credit_amount)
  VALUES
    (v_uid, v_gross, v_fee, v_net, v_method.iban, v_method.holder_name, 'PENDING', 'WALLET_CASHOUT',
     v_method.id, 'IBAN', v_from_topup, v_from_refund)
  RETURNING * INTO v_payout;

  -- Düşüm iki satır: her kova kendi hesabından düşer, yoksa I4 (kova başına
  -- negatif yasağı) ihlal olur.
  IF v_from_refund > 0 THEN
    INSERT INTO public.wallet_transactions
      (user_id, amount, type, balance_type, status, reference_type, reference_id, description)
    VALUES
      (v_uid, v_from_refund, 'WITHDRAWAL', 'REFUND_CREDIT', 'COMPLETED', 'PAYOUT', v_payout.id,
       format('Cüzdandan çekim (iade bakiyesi) — hizmet bedeli %s₺, net %s₺', v_fee, v_net));
  END IF;
  IF v_from_topup > 0 THEN
    INSERT INTO public.wallet_transactions
      (user_id, amount, type, balance_type, status, reference_type, reference_id, description)
    VALUES
      (v_uid, v_from_topup, 'WITHDRAWAL', 'TOP_UP', 'COMPLETED', 'PAYOUT', v_payout.id,
       format('Cüzdandan çekim (yüklenen bakiye) — hizmet bedeli %s₺, net %s₺', v_fee, v_net));
  END IF;
  PERFORM public._sync_wallet_mirror(v_uid);

  RETURN jsonb_build_object(
    'payout_id', v_payout.id, 'gross', v_gross, 'fee', v_fee, 'net', v_net,
    'from_topup', v_from_topup, 'from_refund_credit', v_from_refund,
    'status', 'PENDING', 'iban_last4', right(v_method.iban, 4)
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 8. Kova bazında geri kredi — ortak yardımcı
-- ----------------------------------------------------------------------------
-- Reddedilen/iptal edilen talepte BRÜT tutar geri döner; hizmet bedeli
-- ALINMAZ. Gerekçe: hizmet bedeli TRANSFERİN karşılığıdır, transfer olmadıysa
-- bedelin dayanağı yoktur.
CREATE OR REPLACE FUNCTION public._wallet_cashout_restore(p_payout_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_p public.payout_requests;
  v_refund numeric; v_topup numeric; v_restored numeric := 0;
BEGIN
  SELECT * INTO v_p FROM public.payout_requests WHERE id = p_payout_id;
  IF NOT FOUND OR v_p.payout_type <> 'WALLET_CASHOUT' THEN RETURN 0; END IF;

  -- Eski satırlarda kova dağılımı yoksa tamamı TOP_UP sayılır.
  v_refund := round(COALESCE(v_p.from_refund_credit_amount, 0), 2);
  v_topup  := round(COALESCE(v_p.from_topup_amount, 0), 2);
  IF v_refund = 0 AND v_topup = 0 THEN v_topup := round(COALESCE(v_p.amount,0), 2); END IF;

  -- İdempotency: her kova için ayrı kontrol.
  IF v_refund > 0 AND NOT EXISTS (
    SELECT 1 FROM public.wallet_transactions
    WHERE reference_type = 'PAYOUT' AND reference_id = p_payout_id
      AND type = 'REFUND' AND balance_type = 'REFUND_CREDIT'
  ) THEN
    INSERT INTO public.wallet_transactions
      (user_id, amount, type, balance_type, status, reference_type, reference_id, description)
    VALUES (v_p.user_id, v_refund, 'REFUND', 'REFUND_CREDIT', 'COMPLETED', 'PAYOUT', p_payout_id,
            'Çekim talebi sonuçlanmadı — tutar cüzdana geri yüklendi (hizmet bedeli alınmadı)');
    v_restored := v_restored + v_refund;
  END IF;

  IF v_topup > 0 AND NOT EXISTS (
    SELECT 1 FROM public.wallet_transactions
    WHERE reference_type = 'PAYOUT' AND reference_id = p_payout_id
      AND type = 'TOP_UP' AND balance_type = 'TOP_UP'
  ) THEN
    INSERT INTO public.wallet_transactions
      (user_id, amount, type, balance_type, status, reference_type, reference_id, description)
    VALUES (v_p.user_id, v_topup, 'TOP_UP', 'TOP_UP', 'COMPLETED', 'PAYOUT', p_payout_id,
            'Çekim talebi sonuçlanmadı — tutar cüzdana geri yüklendi (hizmet bedeli alınmadı)');
    v_restored := v_restored + v_topup;
  END IF;

  IF v_restored > 0 THEN PERFORM public._sync_wallet_mirror(v_p.user_id); END IF;
  RETURN v_restored;
END;
$$;

-- ----------------------------------------------------------------------------
-- 9. cancel_wallet_cashout — kullanıcının kendi talebini iptali
-- ----------------------------------------------------------------------------
-- Yarış durumu (admin aynı anda onaylıyor olabilir) yalnız satır kilidiyle
-- çözülür; istemcide imkânsız.
CREATE OR REPLACE FUNCTION public.cancel_wallet_cashout(p_payout_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_p public.payout_requests;
  v_restored numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED: Giriş gerekli.'; END IF;

  SELECT * INTO v_p FROM public.payout_requests
   WHERE id = p_payout_id AND user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Çekim talebi bulunamadı.'; END IF;
  IF v_p.payout_type <> 'WALLET_CASHOUT' THEN
    RAISE EXCEPTION 'INVALID_TYPE: Bu talep cüzdan çekimi değil.';
  END IF;
  IF v_p.status <> 'PENDING' THEN
    RAISE EXCEPTION 'ALREADY_PROCESSING: Talebin işleme alındı, artık iptal edilemez.';
  END IF;

  UPDATE public.payout_requests
     SET status = 'CANCELLED', cancelled_by_user = true,
         processed_at = now(), reject_reason = 'Kullanıcı iptal etti'
   WHERE id = p_payout_id;

  UPDATE public.wallet_transactions SET status = 'CANCELLED'
   WHERE reference_type = 'PAYOUT' AND reference_id = p_payout_id AND status = 'PENDING';

  v_restored := public._wallet_cashout_restore(p_payout_id);

  RETURN jsonb_build_object('payout_id', p_payout_id, 'status', 'CANCELLED', 'restored', v_restored);
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_wallet_cashout(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_wallet_cashout(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 10. get_wallet_cashout_state — ekranın tek çağrıda ihtiyacı olan her şey
-- ----------------------------------------------------------------------------
-- Bugün ekran bunu 3 ayrı çağrıyla topluyor ve para yükleme ekranında kesinti
-- yüzdesi hiç bilinmiyor.
CREATE OR REPLACE FUNCTION public.get_wallet_cashout_state()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_b RECORD; v_withdrawable numeric; v_pending jsonb := NULL;
  v_req_id boolean := public.get_config_bool('wallet_cashout_require_identity', true);
  v_p RECORD; v_full text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT * INTO v_b FROM public._wallet_bucket_balances(v_uid);
  v_withdrawable := round(COALESCE(v_b.topup_balance,0) + COALESCE(v_b.refund_credit_balance,0), 2);
  SELECT full_name INTO v_full FROM public.profiles WHERE id = v_uid;

  SELECT id, amount, fee_amount, net_amount, status, iban, created_at, reject_reason, cancelled_by_user
    INTO v_p
    FROM public.payout_requests
   WHERE user_id = v_uid AND payout_type = 'WALLET_CASHOUT'
     AND status IN ('PENDING','PROCESSING')
   ORDER BY created_at DESC LIMIT 1;

  IF FOUND THEN
    v_pending := jsonb_build_object(
      'id', v_p.id, 'gross', v_p.amount, 'fee', v_p.fee_amount, 'net', v_p.net_amount,
      'status', v_p.status, 'iban_last4', right(COALESCE(v_p.iban,''), 4),
      'created_at', v_p.created_at, 'can_cancel', (v_p.status = 'PENDING'));
  END IF;

  RETURN jsonb_build_object(
    'enabled', public.get_config_bool('wallet_cashout_enabled', false),
    'fee_pct', COALESCE(public.get_config_number('wallet_cashout_fee_pct', 5), 5),
    'min', COALESCE(public.get_config_number('wallet_cashout_min', 100), 100),
    'allow_full_balance', public.get_config_bool('wallet_cashout_allow_full_balance', true),
    'withdrawable', v_withdrawable,
    'topup_balance', round(COALESCE(v_b.topup_balance,0),2),
    'refund_credit_balance', round(COALESCE(v_b.refund_credit_balance,0),2),
    'identity_required', v_req_id,
    'identity_ok', (NOT v_req_id) OR EXISTS (SELECT 1 FROM public.provider_identities WHERE user_id = v_uid AND status = 'VERIFIED'),
    'profile_name_ok', (COALESCE(public._normalize_person_name(v_full),'') <> ''),
    'pending_request', v_pending);
END;
$$;

REVOKE ALL ON FUNCTION public.get_wallet_cashout_state() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_wallet_cashout_state() TO authenticated;

-- ----------------------------------------------------------------------------
-- 11. admin_process_payout — geri kredi kova bazında
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_process_payout(p_payout_id uuid, p_status text, p_ref text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_payout public.payout_requests;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  PERFORM public.require_admin_role(ARRAY['FINANCE']);
  PERFORM public.require_admin_write();
  IF p_status NOT IN ('PROCESSING','COMPLETED','FAILED','CANCELLED') THEN RAISE EXCEPTION 'INVALID_STATUS'; END IF;
  IF p_status = 'COMPLETED' AND COALESCE(btrim(p_ref), '') = '' THEN
    RAISE EXCEPTION 'PAYOUT_REF_REQUIRED: COMPLETED işaretlemek için banka/iyzico transfer referansı zorunludur.';
  END IF;
  SELECT * INTO v_payout FROM public.payout_requests WHERE id = p_payout_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  UPDATE public.payout_requests SET status = p_status, iyzico_payout_ref = COALESCE(p_ref, iyzico_payout_ref),
    admin_notes = COALESCE(p_notes, admin_notes),
    reject_reason = CASE WHEN p_status IN ('FAILED','CANCELLED') THEN COALESCE(p_notes, reject_reason) ELSE reject_reason END,
    processed_at = CASE WHEN p_status IN ('COMPLETED','FAILED','CANCELLED') THEN now() ELSE processed_at END,
    processed_by = auth.uid()
  WHERE id = p_payout_id;
  IF p_status = 'COMPLETED' THEN
    UPDATE public.wallet_transactions SET status = 'COMPLETED'
    WHERE reference_type = 'PAYOUT' AND reference_id = p_payout_id AND status = 'PENDING';
  ELSIF p_status IN ('FAILED','CANCELLED') THEN
    UPDATE public.wallet_transactions SET status = 'CANCELLED'
    WHERE reference_type = 'PAYOUT' AND reference_id = p_payout_id AND status = 'PENDING';
    -- Kova bazında geri kredi (eski hali her şeyi körlemesine TOP_UP'a yazıyordu).
    IF v_payout.payout_type = 'WALLET_CASHOUT' THEN
      PERFORM public._wallet_cashout_restore(p_payout_id);
    END IF;
  END IF;
  PERFORM public.log_admin_action('PAYOUT_PROCESS', 'payout', p_payout_id, v_payout.user_id::text,
    jsonb_build_object('old_status', v_payout.status, 'amount', v_payout.amount),
    jsonb_build_object('status', p_status, 'ref', p_ref, 'notes', p_notes));
  RETURN jsonb_build_object('payout_id', p_payout_id, 'status', p_status);
END;
$$;

-- ----------------------------------------------------------------------------
-- 12. request_payout_with_method — tek-talep kontrolü PROCESSING'i de kapsar
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_payout_with_method(p_amount numeric, p_method_id uuid)
RETURNS payout_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid         uuid := auth.uid();
  v_method      public.payout_methods;
  v_wallet      jsonb;
  v_balance     numeric;
  v_payout      public.payout_requests;
  v_role        text;
  v_roles       jsonb;
  v_idstat      text;
  v_is_provider boolean;
  v_iban_disp   text;
  v_min         numeric := COALESCE(public.get_config_number('earnings_payout_min', 100), 100);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT: Tutar sifirdan buyuk olmali.'; END IF;
  IF p_amount < v_min THEN
    RAISE EXCEPTION 'MIN_PAYOUT: En az %₺ çekebilirsin.', v_min::int;
  END IF;

  -- [S4] Yeni hesap çekim kilidi
  PERFORM public._assert_account_old_enough_for_cashout(v_uid);

  SELECT * INTO v_method FROM public.payout_methods WHERE id = p_method_id AND user_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'METHOD_NOT_FOUND: Kayitli odeme yontemi bulunamadi.'; END IF;

  SELECT role, roles INTO v_role, v_roles FROM public.profiles WHERE id = v_uid;
  v_is_provider := v_role IN ('GOALKEEPER','REFEREE')
                   OR (COALESCE(v_roles,'[]'::jsonb) ? 'GOALKEEPER')
                   OR (COALESCE(v_roles,'[]'::jsonb) ? 'REFEREE');
  IF v_is_provider THEN
    SELECT status INTO v_idstat FROM public.provider_identities WHERE user_id = v_uid;
    IF v_idstat IS DISTINCT FROM 'VERIFIED' THEN
      RAISE EXCEPTION 'IDENTITY_REQUIRED: Odeme almadan once TC kimlik dogrulamasi gerekli.';
    END IF;
  END IF;

  v_wallet  := public.get_wallet_summary();
  v_balance := (v_wallet->>'earnings_balance')::numeric;
  IF v_balance < p_amount THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE: Bakiye yetersiz. Mevcut: %', v_balance;
  END IF;
  -- PROCESSING de bekleyen sayılır (eski kontroldeki delik).
  IF EXISTS (SELECT 1 FROM public.payout_requests WHERE user_id = v_uid AND status IN ('PENDING','PROCESSING')) THEN
    RAISE EXCEPTION 'PENDING_PAYOUT: Bekleyen odeme talebiniz mevcut.';
  END IF;

  v_iban_disp := CASE WHEN v_method.kind = 'IBAN' THEN v_method.iban
                      ELSE 'KART **** ' || v_method.card_last4 || ' (' || COALESCE(v_method.card_brand,'KART') || ')' END;

  INSERT INTO public.payout_requests
    (user_id, amount, iban, iban_holder_name, payout_type, payout_method_id, method_kind)
  VALUES
    (v_uid, p_amount, v_iban_disp, v_method.holder_name,
     CASE WHEN v_is_provider THEN 'PROVIDER_INSTANT' ELSE 'MANUAL' END,
     v_method.id, v_method.kind)
  RETURNING * INTO v_payout;

  INSERT INTO public.wallet_transactions (user_id, amount, type, balance_type, status, reference_type, reference_id, description)
  VALUES (v_uid, p_amount, 'WITHDRAWAL', 'EARNINGS', 'PENDING', 'PAYOUT', v_payout.id,
          CASE WHEN v_method.kind = 'IBAN' THEN 'IBAN''a çekim talebi' ELSE 'Kayıtlı karta çekim talebi' END);

  RETURN v_payout;
END;
$$;

-- ----------------------------------------------------------------------------
-- 13. admin_mark_chargeback — TOP_UP dalı (NAKDE ÇIKIŞ AÇIĞI)
-- ----------------------------------------------------------------------------
-- Eski hali yalnız KAZANÇ satırlarını donduruyordu. Bir TOP_UP intent'inde
-- booking_id ve match_id NULL olduğu için SERVICE_EARNING aranıyor, yükleme
-- satırı (type='TOP_UP', balance_type='TOP_UP') hiç eşleşmiyordu.
-- Çekim açıldığında bu doğrudan bir nakde çıkış yolu olurdu:
-- çalıntı kartla yükle -> çek -> chargeback aç.
CREATE OR REPLACE FUNCTION public.admin_mark_chargeback(p_intent_id uuid, p_reason text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_intent public.payment_intents;
  v_ref_type text; v_ref_id uuid; v_earn_type text;
  v_frozen numeric := 0; v_clawed numeric := 0; v_owner uuid;
  v_topup_clawed numeric := 0; v_topup_short numeric := 0;
  v_is_topup boolean := false; v_bal numeric;
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

  IF v_intent.booking_id IS NOT NULL THEN
    v_ref_type := 'BOOKING'; v_ref_id := v_intent.booking_id; v_earn_type := 'BOOKING_EARNING';
  ELSIF v_intent.match_id IS NOT NULL THEN
    v_ref_type := 'MATCH'; v_ref_id := v_intent.match_id; v_earn_type := 'MATCH_EARNING';
  ELSE
    v_ref_type := 'PAYMENT_INTENT'; v_ref_id := v_intent.id; v_earn_type := 'SERVICE_EARNING';
  END IF;

  FOR r IN
    SELECT id, user_id, amount, status FROM public.wallet_transactions
    WHERE reference_type = v_ref_type AND reference_id = v_ref_id
      AND type = v_earn_type AND balance_type = 'EARNINGS'
    FOR UPDATE
  LOOP
    v_owner := r.user_id;
    IF r.status = 'PENDING' THEN
      UPDATE public.wallet_transactions
        SET status = 'CANCELLED',
            description = COALESCE(description,'') || ' [CHARGEBACK: kazanç donduruldu]'
        WHERE id = r.id;
      v_frozen := v_frozen + r.amount;
    ELSIF r.status = 'COMPLETED' THEN
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

  -- ── YENİ: cüzdana yükleme (TOP_UP) chargeback'i ──────────────────────────
  FOR r IN
    SELECT id, user_id, amount, status FROM public.wallet_transactions
    WHERE reference_type = 'PAYMENT_INTENT' AND reference_id = v_intent.id
      AND type = 'TOP_UP' AND balance_type = 'TOP_UP' AND status = 'COMPLETED'
    FOR UPDATE
  LOOP
    v_is_topup := true;
    v_owner := COALESCE(v_owner, r.user_id);
    IF NOT EXISTS (
      SELECT 1 FROM public.wallet_transactions
      WHERE reference_type = 'PAYMENT_INTENT' AND reference_id = v_intent.id
        AND type = 'CHARGEBACK_REVERSAL' AND balance_type = 'TOP_UP'
    ) THEN
      INSERT INTO public.wallet_transactions
        (user_id, amount, type, balance_type, status, reference_type, reference_id, description)
      VALUES
        (r.user_id, r.amount, 'CHARGEBACK_REVERSAL', 'TOP_UP', 'COMPLETED', 'PAYMENT_INTENT', v_intent.id,
         'Chargeback — cüzdana yüklenen tutar geri alındı');
      v_topup_clawed := v_topup_clawed + r.amount;

      -- Bakiye yetmiyorsa (para harcanmış/çekilmişse) açık kalan kısmı raporla.
      -- I4 gereği kova negatife düşemez; kalan tutar operasyonel takip konusudur.
      SELECT topup_balance INTO v_bal FROM public._wallet_bucket_balances(r.user_id);
      IF COALESCE(v_bal, 0) < 0 THEN
        v_topup_short := v_topup_short + abs(v_bal);
      END IF;
      PERFORM public._sync_wallet_mirror(r.user_id);
    END IF;
  END LOOP;

  UPDATE public.payment_intents
    SET chargeback_at = now(), chargeback_reason = p_reason, chargeback_by = auth.uid()
  WHERE id = p_intent_id;

  PERFORM public.log_admin_action('PAYMENT_CHARGEBACK', 'payment_intent', p_intent_id, v_owner::text,
    jsonb_build_object('amount', v_intent.amount, 'status', v_intent.status),
    jsonb_build_object('reason', p_reason, 'frozen_pending', v_frozen, 'clawed_completed', v_clawed,
                       'topup_clawed', v_topup_clawed, 'topup_shortfall', v_topup_short));

  RETURN jsonb_build_object(
    'intent_id', p_intent_id,
    'frozen_pending', v_frozen,
    'clawed_completed', v_clawed,
    'topup_clawed', v_topup_clawed,
    'topup_shortfall', v_topup_short,
    'was_topup', v_is_topup,
    'earning_owner', v_owner,
    'earning_source', v_ref_type
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 14. Hesap silme — iade kredisi artık kaybolmuyor
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._account_deletion_status(p_uid uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_topup numeric; v_refund numeric; v_earnings numeric; v_reserved numeric;
  v_cashable numeric; v_wait int;
  v_blockers jsonb := '[]'::jsonb; v_warnings jsonb := '[]'::jsonb;
BEGIN
  SELECT topup_balance, refund_credit_balance INTO v_topup, v_refund
    FROM public._wallet_bucket_balances(p_uid);
  SELECT COALESCE(SUM(CASE WHEN type IN ('DEPOSIT','MATCH_EARNING','BOOKING_EARNING','SERVICE_EARNING','REFERRAL_BONUS')
                           THEN amount ELSE -amount END), 0)
    INTO v_earnings FROM public.wallet_transactions
    WHERE user_id = p_uid AND balance_type = 'EARNINGS' AND status = 'COMPLETED'
      AND type NOT IN ('MATCH_FEE','MATCH_REFUND','REFUND');
  SELECT COALESCE(SUM(amount), 0) INTO v_reserved FROM public.wallet_transactions
    WHERE user_id = p_uid AND balance_type = 'EARNINGS' AND type = 'WITHDRAWAL' AND status = 'PENDING';
  v_earnings := GREATEST(v_earnings - v_reserved, 0);
  -- K1: iade kredisi de çekilebilir olduğu için çekilebilir toplama dahil.
  v_cashable := round(v_topup + v_refund + v_earnings, 2);

  SELECT COALESCE((SELECT (value #>> '{}')::int FROM public.app_config WHERE key = 'account_deletion_wait_days'), 7)
    INTO v_wait;

  IF EXISTS (
    SELECT 1 FROM public.pitch_bookings
    WHERE user_id = p_uid AND status IN ('PENDING','CONFIRMED')
      AND (booking_date > CURRENT_DATE OR (booking_date = CURRENT_DATE AND end_time > CURRENT_TIME))
  ) THEN
    v_blockers := v_blockers || jsonb_build_object('code','ACTIVE_BOOKING',
      'message','Aktif bir saha rezervasyonun var. Önce iptal et veya tamamlanmasını bekle.');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.payment_intents pi
    JOIN public.matches m ON m.id = pi.match_id
    WHERE pi.user_id = p_uid AND pi.status IN ('PENDING','BLOCKED','CAPTURED')
      AND m.status IN ('GATHERING','CONFIRMED','PLAYING','LIVE')
  ) THEN
    v_blockers := v_blockers || jsonb_build_object('code','ACTIVE_MATCH',
      'message','Yaklaşan bir maça katılımın (blokaj/ödeme) var. Önce maçtan ayrıl.');
  END IF;

  IF v_cashable > 0 THEN
    v_blockers := v_blockers || jsonb_build_object('code','CASHABLE_BALANCE',
      'amount', v_cashable,
      'message', format('Cüzdanında çekilebilir %s₺ var. Silmeden önce hesabına çek.',
        trim(to_char(v_cashable, 'FM999G999G990D00'))));
  END IF;

  IF v_reserved > 0 OR EXISTS (
    SELECT 1 FROM public.payout_requests
    WHERE user_id = p_uid AND status IN ('PENDING','PROCESSING')
  ) THEN
    v_blockers := v_blockers || jsonb_build_object('code','PENDING_PAYOUT',
      'message','Bekleyen bir çekim talebin var. Sonuçlanmasını bekle, sonra tekrar dene.');
  END IF;

  -- REFUND_CREDIT_FORFEIT uyarısı KALDIRILDI: iade kredisi artık kaybolmuyor,
  -- çekilebiliyor. Uyarı yerine yukarıdaki CASHABLE_BALANCE engeli çalışıyor.

  RETURN jsonb_build_object(
    'can_delete', (jsonb_array_length(v_blockers) = 0),
    'blockers', v_blockers,
    'warnings', v_warnings,
    'wait_days', v_wait,
    'balances', jsonb_build_object(
      'topup', v_topup, 'earnings', v_earnings, 'refund_credit', v_refund,
      'reserved', v_reserved, 'cashable', v_cashable)
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 15. Bildirim metinleri — "iade kredisi" terimi ölür
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._notify_refund_credit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF public.get_config_bool('refund_notify_enabled', true)
     AND NEW.balance_type = 'REFUND_CREDIT' AND NEW.status = 'COMPLETED'
     AND NEW.type IN ('DEPOSIT','REFUND','MATCH_REFUND') AND COALESCE(NEW.amount, 0) > 0 THEN
    INSERT INTO public.notifications (user_id, title, body, type_key, deep_link, inbox)
    VALUES (NEW.user_id, 'Paran cüzdanına döndü',
      format('%s₺ cüzdanına eklendi. Uygulamada harcayabilir veya hesabına çekebilirsin.',
             trim(trailing '.' FROM trim(trailing '0' FROM to_char(NEW.amount, 'FM999999990.00')))),
      'REFUND', 'oyna://wallet', true);
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public._notify_payout_result()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_amt text;
BEGIN
  v_amt := trim(to_char(COALESCE(NEW.amount,0), 'FM999G999G990D00'));
  IF NEW.status = 'COMPLETED' AND OLD.status IS DISTINCT FROM 'COMPLETED' THEN
    INSERT INTO public.notifications (user_id, title, body, type_key)
    VALUES (NEW.user_id, 'Ödemen gönderildi 💸',
            COALESCE(trim(to_char(NEW.net_amount, 'FM999G999G990D00')), v_amt) || '₺ ' ||
            CASE WHEN NEW.method_kind = 'CARD' THEN 'kayıtlı kartına' ELSE 'IBAN hesabına' END || ' aktarıldı.',
            'payout_completed');
  ELSIF NEW.status IN ('FAILED','CANCELLED') AND OLD.status NOT IN ('FAILED','CANCELLED') THEN
    INSERT INTO public.notifications (user_id, title, body, type_key)
    VALUES (NEW.user_id,
            CASE WHEN NEW.status = 'FAILED' THEN 'Çekim tamamlanamadı' ELSE 'Çekim talebin iptal edildi' END,
            v_amt || '₺ cüzdanına geri yüklendi. Hizmet bedeli alınmadı.',
            'payout_failed');
  END IF;
  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- 16. DEĞİŞMEZ I8 — kova dağılımı toplamı brüt tutara eşit
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_money_invariants()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE i1 int; i2 int; i3 int; i4 int; i5 int; i6 int; i7 int; i8 int; v_ok boolean;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  WITH b AS (
    SELECT user_id,
      GREATEST(COALESCE(SUM(CASE WHEN balance_type='TOP_UP' AND status='COMPLETED' THEN (CASE WHEN type='TOP_UP' THEN amount ELSE -amount END) ELSE 0 END),0),0)
      + GREATEST(COALESCE(SUM(CASE WHEN balance_type='REFUND_CREDIT' AND status='COMPLETED' THEN (CASE WHEN type IN ('DEPOSIT','REFUND','MATCH_REFUND') THEN amount ELSE -amount END) ELSE 0 END),0),0) AS computed
    FROM public.wallet_transactions GROUP BY user_id
  )
  SELECT count(*) INTO i1 FROM public.profiles p LEFT JOIN b ON b.user_id = p.id
  WHERE round(COALESCE(p.wallet_balance,0),2) <> round(COALESCE(b.computed,0),2);
  SELECT count(*) INTO i2 FROM (SELECT user_id, idempotency_key FROM public.payment_intents WHERE idempotency_key IS NOT NULL GROUP BY user_id, idempotency_key HAVING count(*) > 1) d;
  SELECT count(*) INTO i3 FROM (SELECT reference_id FROM public.wallet_transactions WHERE reference_type='PAYMENT_INTENT' AND type='TOP_UP' AND status='COMPLETED' GROUP BY reference_id HAVING count(*) > 1) d;
  SELECT count(*) INTO i4 FROM (
    SELECT user_id,
      SUM(CASE WHEN balance_type='TOP_UP' AND status='COMPLETED' THEN (CASE WHEN type='TOP_UP' THEN amount ELSE -amount END) ELSE 0 END) AS topup_raw,
      SUM(CASE WHEN balance_type='REFUND_CREDIT' AND status='COMPLETED' THEN (CASE WHEN type IN ('DEPOSIT','REFUND','MATCH_REFUND') THEN amount ELSE -amount END) ELSE 0 END) AS refund_raw
    FROM public.wallet_transactions GROUP BY user_id) s WHERE s.topup_raw < -0.005 OR s.refund_raw < -0.005;
  SELECT count(*) INTO i5 FROM public.wallet_transactions wt WHERE wt.balance_type='REFUND_CREDIT' AND wt.reference_type='PAYMENT_INTENT'
    AND NOT EXISTS (SELECT 1 FROM public.payment_intents pi WHERE pi.id::text = wt.reference_id::text);
  SELECT count(*) INTO i6 FROM public.payment_intents WHERE status='PENDING' AND provider='IYZICO'
    AND (raw->>'flow') IN ('BOOKING_DEPOSIT','TOP_UP','MATCH_JOIN') AND created_at < now() - interval '6 hour';
  SELECT count(*) INTO i7 FROM public.payout_requests WHERE payout_type = 'WALLET_CASHOUT'
    AND round(COALESCE(amount,0),2) <> round(COALESCE(fee_amount,0) + COALESCE(net_amount,0),2);
  -- I8: WALLET_CASHOUT kova dağılımı toplamı brüt tutara eşit olmalı.
  SELECT count(*) INTO i8 FROM public.payout_requests WHERE payout_type = 'WALLET_CASHOUT'
    AND round(COALESCE(amount,0),2)
        <> round(COALESCE(from_topup_amount,0) + COALESCE(from_refund_credit_amount,0),2);
  v_ok := (i1=0 AND i2=0 AND i3=0 AND i4=0 AND i5=0 AND i7=0 AND i8=0);
  RETURN jsonb_build_object('ok', v_ok, 'invariants', jsonb_build_object(
    'I1_wallet_mirror_mismatch', i1, 'I2_idempotency_dup', i2, 'I3_double_topup_credit', i3,
    'I4_negative_bucket', i4, 'I5_orphan_refund', i5, 'I7_cashout_fee_consistency', i7,
    'I8_cashout_bucket_split', i8),
    'info', jsonb_build_object('I6_stale_pending_over_6h', i6));
END; $$;

-- ============================================================================
-- LANSMAN KAPISI — `wallet_cashout_enabled = true` yapılmadan önce
-- ----------------------------------------------------------------------------
-- Bu migrasyonda KAPANDI:
--   ✔ Chargeback TOP_UP dalı (madde 13)
--   ✔ IBAN sahibi adı ↔ hesap adı kontrolü (madde 5 + 7)
--   ✔ IBAN mod-97 checksum (madde 3 + 5)
--   ✔ assert_can_transact — reşit olmayan kapısı (madde 7)
--   ✔ Tek-talep kontrolü PROCESSING'i de kapsıyor (madde 6, 7, 12)
--   ✔ Tam-bakiye istisnası (madde 2 + 7)
--   ✔ Kova bazında geri kredi (madde 8, 11)
--   ✔ Değişmez I8 (madde 16)
--
-- HÂLÂ AÇIK — açılmadan önce yapılmalı:
--   ✗ Oyuncuya kimlik doğrulama EKRANI. `wallet_cashout_require_identity`
--     true ve provider_identities.status='VERIFIED' arıyor; ama
--     submit_provider_identity'yi çağıran tek ekran kaleci/hakem paneli.
--     Sıradan oyuncunun kimlik doğrulama yolu YOK. Ya ekran eklenir ya da
--     bu bayrak bilinçli olarak false yapılır.
--   ✗ Sözleşme metinleri + LegalScreen aynı sürümde yayınlanmalı.
--   ✗ Vergi/muhasebe kararı: hizmet bedeli için fatura kesilecek mi.
-- ============================================================================
