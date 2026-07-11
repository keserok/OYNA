-- [DB GEÇMİŞİNDEN KURTARILDI 2026-07-11] Bu migration canlı veritabanına uygulanmıştı ancak repoda dosyası yoktu; supabase_migrations.schema_migrations.statements kolonundan geri çıkarıldı.


CREATE OR REPLACE FUNCTION public.protect_profile_sensitive_fields()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_platform_admin() THEN
    IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
      RAISE EXCEPTION 'SECURITY: is_admin alanı doğrudan değiştirilemez.';
    END IF;
    IF NEW.phone_verified IS DISTINCT FROM OLD.phone_verified THEN
      RAISE EXCEPTION 'SECURITY: phone_verified alanı doğrudan değiştirilemez.';
    END IF;
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'SECURITY: role alanı doğrudan değiştirilemez.';
    END IF;
    IF NEW.roles IS DISTINCT FROM OLD.roles THEN
      RAISE EXCEPTION 'SECURITY: roles alanı doğrudan değiştirilemez.';
    END IF;
    IF NEW.wallet_balance IS DISTINCT FROM OLD.wallet_balance
       AND COALESCE(current_setting('app.wallet_ctx', true), '') <> 'on' THEN
      RAISE EXCEPTION 'SECURITY: wallet_balance doğrudan değiştirilemez.';
    END IF;
    IF NEW.is_banned IS DISTINCT FROM OLD.is_banned THEN
      RAISE EXCEPTION 'SECURITY: is_banned doğrudan değiştirilemez.';
    END IF;
    IF NEW.ban_expires_at IS DISTINCT FROM OLD.ban_expires_at THEN
      RAISE EXCEPTION 'SECURITY: ban_expires_at doğrudan değiştirilemez.';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.process_match_payment(p_user_id uuid, p_match_id uuid, p_amount numeric)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_current_balance numeric;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id AND NOT public.is_admin() THEN
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
  PERFORM set_config('app.wallet_ctx', 'on', true);
  UPDATE public.profiles SET wallet_balance = wallet_balance - p_amount, updated_at = NOW() WHERE id = p_user_id;
  INSERT INTO public.wallet_transactions (user_id, match_id, amount, type, description)
  VALUES (p_user_id, p_match_id, -p_amount, 'MATCH_FEE', 'Maç katılım ücreti');
  RETURN TRUE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.process_match_refund(p_user_id uuid, p_match_id uuid, p_amount numeric)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
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
  SELECT COALESCE(SUM(-amount), 0) INTO v_paid
  FROM public.wallet_transactions
  WHERE user_id = p_user_id AND match_id = p_match_id AND type = 'MATCH_FEE';
  IF v_paid <= 0 THEN
    RAISE EXCEPTION 'ODEME_YOK: Bu maç için bu kullanıcıya ait ödeme bulunamadı.';
  END IF;
  SELECT COALESCE(SUM(amount), 0) INTO v_refunded
  FROM public.wallet_transactions
  WHERE user_id = p_user_id AND match_id = p_match_id AND type = 'REFUND';
  IF v_refunded > 0 THEN
    RAISE EXCEPTION 'ZATEN_IADE: Bu maç için zaten iade yapılmış.';
  END IF;
  IF p_amount <> v_paid THEN
    RAISE EXCEPTION 'TUTAR_UYUSMUYOR: İade tutarı % ödenen tutarla % eşleşmiyor.', p_amount, v_paid;
  END IF;
  PERFORM set_config('app.wallet_ctx', 'on', true);
  UPDATE public.profiles SET wallet_balance = wallet_balance + p_amount, updated_at = NOW() WHERE id = p_user_id;
  INSERT INTO public.wallet_transactions (user_id, match_id, amount, type, description)
  VALUES (p_user_id, p_match_id, p_amount, 'REFUND', 'Maç iptali / Ayrılma iadesi');
  RETURN TRUE;
END;
$function$;
