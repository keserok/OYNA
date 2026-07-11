-- [DB GEÇMİŞİNDEN KURTARILDI 2026-07-11] Bu migration canlı veritabanına uygulanmıştı ancak repoda dosyası yoktu; supabase_migrations.schema_migrations.statements kolonundan geri çıkarıldı.

-- ============================================================
-- OYNA — Faz 5: Ekonomi Sertleştirme (kolon kilidi + fonksiyon doğrulama)
-- ============================================================

-- 1) KOLON-SEVİYESİ KİLİT
--    Para/istatistik kolonlarını authenticated'in doğrudan UPDATE'inden çıkar.
--    Definer RPC'ler postgres olarak çalıştığı için bunları yine değiştirebilir.
DO $$
DECLARE cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ')
  INTO cols
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='profiles'
    AND column_name NOT IN (
      'wallet_balance','diamonds','win_count','total_matches',
      'match_count','player_card','skill_rating','trust_score','reliability_score'
    );

  EXECUTE 'REVOKE UPDATE ON public.profiles FROM authenticated';
  EXECUTE 'GRANT UPDATE (' || cols || ') ON public.profiles TO authenticated';
  EXECUTE 'REVOKE UPDATE ON public.profiles FROM anon';
END $$;

-- 2) Trigger'ı sadeleştir: kolon-kilidine geçen 3 kolonu çıkar
CREATE OR REPLACE FUNCTION public.protect_profile_columns()
RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL
     OR auth.role() = 'service_role'
     OR public.is_admin() THEN
    RETURN NEW;
  END IF;
  -- Admin değilse: admin'in elle düzenlediği kolonlar eski değerine döner
  NEW.role           := OLD.role;
  NEW.roles          := OLD.roles;
  NEW.is_banned      := OLD.is_banned;
  NEW.ban_expires_at := OLD.ban_expires_at;
  NEW.is_verified    := OLD.is_verified;
  RETURN NEW;
END;
$$;

-- 3) process_match_payment: pozitif tutar + is_admin
CREATE OR REPLACE FUNCTION public.process_match_payment(p_user_id uuid, p_match_id uuid, p_amount numeric)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_current_balance numeric;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Başka bir kullanıcının cüzdanından ödeme yapamazsınız.';
  END IF;
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'GECERSIZ_TUTAR: Ödeme tutarı pozitif olmalıdır.';
  END IF;
  SELECT wallet_balance INTO v_current_balance FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF v_current_balance IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND: Kullanıcı bulunamadı.';
  END IF;
  IF v_current_balance < p_amount THEN
    RAISE EXCEPTION 'Yetersiz bakiye. Gerekli: % ₺, Mevcut: % ₺', p_amount, v_current_balance;
  END IF;
  UPDATE public.profiles SET wallet_balance = wallet_balance - p_amount, updated_at = NOW() WHERE id = p_user_id;
  INSERT INTO public.wallet_transactions (user_id, match_id, amount, type, description)
  VALUES (p_user_id, p_match_id, -p_amount, 'MATCH_FEE', 'Maç katılım ücreti');
  RETURN TRUE;
END;
$$;

-- 4) process_match_refund: tam sıkı doğrulama
CREATE OR REPLACE FUNCTION public.process_match_refund(p_user_id uuid, p_match_id uuid, p_amount numeric)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE
  v_paid     numeric;
  v_refunded numeric;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Başka bir kullanıcının cüzdanına iade yapamazsınız.';
  END IF;
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'GECERSIZ_TUTAR: İade tutarı pozitif olmalıdır.';
  END IF;

  -- Bu maç için bu kullanıcının ödediği toplam (MATCH_FEE negatif kayıtlı)
  SELECT COALESCE(SUM(-amount), 0) INTO v_paid
  FROM public.wallet_transactions
  WHERE user_id = p_user_id AND match_id = p_match_id AND type = 'MATCH_FEE';
  IF v_paid <= 0 THEN
    RAISE EXCEPTION 'ODEME_YOK: Bu maç için bu kullanıcıya ait ödeme bulunamadı.';
  END IF;

  -- Daha önce iade yapıldı mı?
  SELECT COALESCE(SUM(amount), 0) INTO v_refunded
  FROM public.wallet_transactions
  WHERE user_id = p_user_id AND match_id = p_match_id AND type = 'REFUND';
  IF v_refunded > 0 THEN
    RAISE EXCEPTION 'ZATEN_IADE: Bu maç için zaten iade yapılmış.';
  END IF;

  -- Tutar eşleşmesi
  IF p_amount <> v_paid THEN
    RAISE EXCEPTION 'TUTAR_UYUSMUYOR: İade tutarı % ödenen tutarla % eşleşmiyor.', p_amount, v_paid;
  END IF;

  UPDATE public.profiles SET wallet_balance = wallet_balance + p_amount, updated_at = NOW() WHERE id = p_user_id;
  INSERT INTO public.wallet_transactions (user_id, match_id, amount, type, description)
  VALUES (p_user_id, p_match_id, p_amount, 'REFUND', 'Maç iptali / Ayrılma iadesi');
  RETURN TRUE;
END;
$$;

-- 5) update_player_diamond: admin kontrolünü is_admin()'e çevir (geri kalan aynı)
CREATE OR REPLACE FUNCTION public.update_player_diamond(p_user_id uuid, p_is_win boolean, p_flat_modifier integer DEFAULT 0)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE
  v_current_wins INTEGER;
  v_current_total INTEGER;
  v_new_wins INTEGER;
  v_new_total INTEGER;
  v_win_rate NUMERIC;
  v_new_diamond INTEGER;
  v_card JSONB;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Oyuncu istatistikleri yalnızca sistem tarafından güncellenebilir.';
  END IF;

  SELECT win_count, total_matches, player_card
    INTO v_current_wins, v_current_total, v_card
  FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Kullanıcı profili bulunamadı.';
  END IF;

  v_current_wins  := COALESCE(v_current_wins, 0);
  v_current_total := COALESCE(v_current_total, 0);
  v_card          := COALESCE(v_card, '{}'::jsonb);

  v_new_total := v_current_total + 1;
  IF p_is_win THEN v_new_wins := v_current_wins + 1; ELSE v_new_wins := v_current_wins; END IF;

  IF v_new_total > 0 THEN v_win_rate := v_new_wins::NUMERIC / v_new_total::NUMERIC; ELSE v_win_rate := 0; END IF;
  v_new_diamond := ROUND(POWER(v_new_wins, 2) * v_win_rate * 1000) + p_flat_modifier;
  IF v_new_diamond < 0 THEN v_new_diamond := 0; END IF;

  v_card := jsonb_set(v_card, '{diamondValue}', to_jsonb(v_new_diamond));
  v_card := jsonb_set(v_card, '{winCount}', to_jsonb(v_new_wins));
  v_card := jsonb_set(v_card, '{totalMatches}', to_jsonb(v_new_total));
  IF p_flat_modifier <> 0 THEN
    v_card := jsonb_set(v_card, '{flatModifier}', to_jsonb(p_flat_modifier));
  END IF;

  UPDATE public.profiles
  SET win_count = v_new_wins, total_matches = v_new_total, diamonds = v_new_diamond,
      match_count = v_new_total, player_card = v_card, updated_at = NOW()
  WHERE id = p_user_id;
END;
$$;
