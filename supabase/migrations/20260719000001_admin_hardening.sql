-- ============================================================================
-- ADMİN SERTLEŞTİRME PAKETİ (Faz A2/A3)
--
-- 1) is_registration_open(): panel "Kayıt Kapalı" yaptığında kayıt akışının
--    sunucudan doğrulanabilmesi (istemci signUp öncesi kontrol eder).
-- 2) support_ticket_create spam koruması: kullanıcı başına kanal başına en
--    fazla 5 açık talep + iki talep arası 60 sn bekleme.
-- 3) Panel MFA'sı zorunlu (admin_mfa_required=true): faktörü olmayan admin
--    ilk girişte QR ile kurulum yapar; kimse kilitlenmez.
-- ============================================================================

-- ─── 1) Kayıt açık mı? ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_registration_open()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(s."registrationOpen", true) FROM public.settings s WHERE s.id = 'main';
$$;

REVOKE ALL ON FUNCTION public.is_registration_open() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_registration_open() TO authenticated, anon;

-- ─── 2) Destek talebi spam koruması ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.support_ticket_create(
  p_subject  text,
  p_body     text,
  p_category text DEFAULT 'GENERAL',
  p_channel  text DEFAULT 'PLAYER'
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_name      text;
  v_ticket    uuid;
  v_open_cnt  int;
  v_last_at   timestamptz;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_channel NOT IN ('PLAYER','OWNER') THEN p_channel := 'PLAYER'; END IF;
  p_subject := btrim(COALESCE(p_subject, ''));
  p_body    := btrim(COALESCE(p_body, ''));
  IF length(p_subject) < 3 THEN RAISE EXCEPTION 'Konu en az 3 karakter olmalıdır.'; END IF;
  IF length(p_body) < 1 THEN RAISE EXCEPTION 'Mesaj boş olamaz.'; END IF;

  -- Spam koruması: en fazla 5 açık talep (kanal başına)
  SELECT count(*) INTO v_open_cnt FROM public.support_tickets
  WHERE user_id = v_uid AND channel = p_channel AND status IN ('OPEN','PENDING');
  IF v_open_cnt >= 5 THEN
    RAISE EXCEPTION 'En fazla 5 açık talebiniz olabilir. Lütfen mevcut taleplerinizin yanıtlanmasını bekleyin.';
  END IF;

  -- Spam koruması: iki yeni talep arası en az 60 sn
  SELECT max(created_at) INTO v_last_at FROM public.support_tickets WHERE user_id = v_uid;
  IF v_last_at IS NOT NULL AND now() - v_last_at < interval '60 seconds' THEN
    RAISE EXCEPTION 'Çok hızlı talep açıyorsunuz. Lütfen 1 dakika bekleyin.';
  END IF;

  SELECT COALESCE(full_name, name, email) INTO v_name FROM public.profiles WHERE id = v_uid;

  INSERT INTO public.support_tickets (user_id, channel, subject, category, last_sender_role, unread_for_admin)
  VALUES (v_uid, p_channel, left(p_subject, 160), COALESCE(NULLIF(btrim(p_category), ''), 'GENERAL'), 'USER', true)
  RETURNING id INTO v_ticket;

  INSERT INTO public.support_ticket_messages (ticket_id, sender_id, sender_role, sender_name, body)
  VALUES (v_ticket, v_uid, 'USER', v_name, left(p_body, 4000));

  RETURN v_ticket;
END;
$$;

-- ─── 3) Panel MFA zorunlu ────────────────────────────────────────────────────
UPDATE public.app_config
SET value = 'true'::jsonb
WHERE key = 'admin_mfa_required';
