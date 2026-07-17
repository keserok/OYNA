-- ════════════════════════════════════════════════════════════════════════════
-- [S4] HESAP SİLME KAPISI — bakiye/çekim de kapsama alınır (K28)
-- ────────────────────────────────────────────────────────────────────────────
-- Master plan S4: "Açık rezervasyon/bakiye varsa silme bekletilir → çöz/çek
-- yönlendirmesi." Mevcut request_account_deletion yalnız aktif rezervasyon/maçı
-- engelliyordu; buraya ÇEKİLEBİLİR BAKİYE (TOP_UP + kazanç) ve BEKLEYEN ÇEKİM
-- talebi engelleri eklenir. İade kredisi (çekilemez, uygulama-içi) sert engel
-- DEĞİL — kaybolacağı UYARIYLA bildirilir (kullanıcıyı kilitlemeyiz).
--
-- Tek kaynak: _account_deletion_status(uid) hem önizleme (preview) hem gerçek
-- silme talebi (request) tarafından kullanılır → gösterilen engel = uygulanan engel.
-- App Store zorunluluğu: silme her zaman ERİŞİLEBİLİR; engel varsa NET yönlendirme.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── Ortak durum: engeller + uyarılar + bakiyeler (SSOT) ─────────────────────
CREATE OR REPLACE FUNCTION public._account_deletion_status(p_uid uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_topup numeric; v_refund numeric; v_earnings numeric; v_reserved numeric;
  v_cashable numeric; v_wait int;
  v_blockers jsonb := '[]'::jsonb; v_warnings jsonb := '[]'::jsonb;
BEGIN
  -- Kovalar (get_wallet_summary ile aynı matematik)
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
  v_cashable := round(v_topup + v_earnings, 2);

  SELECT COALESCE((SELECT (value #>> '{}')::int FROM public.app_config WHERE key = 'account_deletion_wait_days'), 7)
    INTO v_wait;

  -- 1) Aktif (gelecekteki) saha rezervasyonu
  IF EXISTS (
    SELECT 1 FROM public.pitch_bookings
    WHERE user_id = p_uid AND status IN ('PENDING','CONFIRMED')
      AND (booking_date > CURRENT_DATE OR (booking_date = CURRENT_DATE AND end_time > CURRENT_TIME))
  ) THEN
    v_blockers := v_blockers || jsonb_build_object('code','ACTIVE_BOOKING',
      'message','Aktif bir saha rezervasyonun var. Önce iptal et veya tamamlanmasını bekle.');
  END IF;

  -- 2) Yaklaşan maça katılım (bloke/tahsil)
  IF EXISTS (
    SELECT 1 FROM public.payment_intents pi
    JOIN public.matches m ON m.id = pi.match_id
    WHERE pi.user_id = p_uid AND pi.status IN ('PENDING','BLOCKED','CAPTURED')
      AND m.status IN ('GATHERING','CONFIRMED','PLAYING','LIVE')
  ) THEN
    v_blockers := v_blockers || jsonb_build_object('code','ACTIVE_MATCH',
      'message','Yaklaşan bir maça katılımın (blokaj/ödeme) var. Önce maçtan ayrıl.');
  END IF;

  -- 3) Çekilebilir bakiye (TOP_UP + kazanç) — para kaybı olmasın
  IF v_cashable > 0 THEN
    v_blockers := v_blockers || jsonb_build_object('code','CASHABLE_BALANCE',
      'amount', v_cashable,
      'message', format('Cüzdanında çekilebilir %s₺ var. Silmeden önce IBAN''ına çek.',
        trim(to_char(v_cashable, 'FM999G999G990D00'))));
  END IF;

  -- 4) Bekleyen çekim talebi (payout işlemede)
  IF v_reserved > 0 OR EXISTS (
    SELECT 1 FROM public.payout_requests
    WHERE user_id = p_uid AND status IN ('PENDING','PROCESSING')
  ) THEN
    v_blockers := v_blockers || jsonb_build_object('code','PENDING_PAYOUT',
      'message','Bekleyen bir çekim talebin var. Sonuçlanmasını bekle, sonra tekrar dene.');
  END IF;

  -- Uyarı: iade kredisi çekilemez → silinirse kaybolur (sert engel değil)
  IF v_refund > 0 THEN
    v_warnings := v_warnings || jsonb_build_object('code','REFUND_CREDIT_FORFEIT',
      'amount', v_refund,
      'message', format('%s₺ iade kredin var; bu tutar çekilemez, yalnız uygulama içinde harcanır. Hesabını silersen kaybolur.',
        trim(to_char(v_refund, 'FM999G999G990D00'))));
  END IF;

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
REVOKE ALL ON FUNCTION public._account_deletion_status(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._account_deletion_status(uuid) TO service_role;

-- ─── Önizleme: kullanıcı silme butonuna basmadan engelleri/uyarıları görür ───
CREATE OR REPLACE FUNCTION public.preview_account_deletion()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  RETURN public._account_deletion_status(auth.uid());
END;
$$;
REVOKE ALL ON FUNCTION public.preview_account_deletion() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_account_deletion() TO authenticated;

-- ─── Gerçek silme talebi: aynı SSOT engelleri sunucuda ZORUNLU kılınır ───────
CREATE OR REPLACE FUNCTION public.request_account_deletion()
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_st jsonb; v_first jsonb; v_wait_days text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Giriş yapmanız gerekiyor.'; END IF;

  v_st := public._account_deletion_status(v_uid);
  IF NOT (v_st->>'can_delete')::boolean THEN
    -- İlk engelin Türkçe mesajını fırlat (FE tam listeyi preview'dan gösterir)
    v_first := (v_st->'blockers')->0;
    RAISE EXCEPTION '%', COALESCE(v_first->>'message', 'Hesap silme şu an engelli.');
  END IF;

  UPDATE public.profiles SET account_deletion_requested_at = NOW(), updated_at = NOW()
  WHERE id = v_uid;

  v_wait_days := v_st->>'wait_days';

  INSERT INTO public.notifications (user_id, title, body, type_key)
  SELECT id, 'Hesap Silme Talebi',
    'Bir kullanıcı hesap silme talebinde bulundu. ' || v_wait_days || ' gün içinde işleme alınmalı.',
    'ACCOUNT_DELETION_REQUEST'
  FROM public.profiles WHERE is_admin = true;

  RETURN TRUE;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.request_account_deletion() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_account_deletion() TO authenticated;
