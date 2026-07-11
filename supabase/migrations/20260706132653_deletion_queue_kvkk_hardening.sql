-- [DB GEÇMİŞİNDEN KURTARILDI 2026-07-11] Bu migration canlı veritabanına uygulanmıştı ancak repoda dosyası yoktu; supabase_migrations.schema_migrations.statements kolonundan geri çıkarıldı.

CREATE OR REPLACE FUNCTION public.admin_process_account_deletion__core(p_user_id uuid, p_anonymize boolean DEFAULT true)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_email text; v_is_admin boolean;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT email, (COALESCE(is_admin,false) OR role IN ('ADMIN','SUPER_ADMIN')) INTO v_email, v_is_admin
  FROM public.profiles WHERE id = p_user_id;
  IF v_email IS NULL THEN RAISE EXCEPTION 'Kullanıcı bulunamadı'; END IF;
  IF v_is_admin THEN RAISE EXCEPTION 'Admin hesabı silinemez. Önce yönetici yetkilerini kaldırın.'; END IF;
  IF EXISTS (SELECT 1 FROM public.pitch_bookings WHERE user_id = p_user_id AND status IN ('PENDING','CONFIRMED')
      AND (booking_date > CURRENT_DATE OR (booking_date = CURRENT_DATE AND end_time > CURRENT_TIME))) THEN
    RAISE EXCEPTION 'Kullanıcının aktif saha rezervasyonu var — silme reddedildi. Önce rezervasyon çözülmeli.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.payment_intents pi JOIN public.matches m ON m.id = pi.match_id
      WHERE pi.user_id = p_user_id AND pi.status IN ('PENDING','BLOCKED','CAPTURED')
      AND m.status IN ('GATHERING','CONFIRMED','PLAYING','LIVE')) THEN
    RAISE EXCEPTION 'Kullanıcının yaklaşan maçta blokaj/ödemesi var — silme reddedildi.';
  END IF;
  IF p_anonymize THEN
    UPDATE public.profiles SET full_name='Silinmiş Kullanıcı', name='Silinmiş Kullanıcı',
      email='deleted_'||substr(p_user_id::text,1,8)||'@oyna.deleted', phone=NULL, avatar_url=NULL,
      is_banned=true, account_deletion_requested_at=NULL, updated_at=NOW() WHERE id=p_user_id;
    BEGIN
      UPDATE auth.users SET email='deleted_'||substr(p_user_id::text,1,8)||'@oyna.deleted',
        phone=NULL, raw_user_meta_data='{}'::jsonb, banned_until='2999-01-01'::timestamptz, updated_at=NOW()
      WHERE id=p_user_id;
    EXCEPTION WHEN others THEN RAISE WARNING 'admin_process_account_deletion: auth.users anonimleştirilemedi (%): %', p_user_id, SQLERRM;
    END;
  ELSE
    DELETE FROM auth.users WHERE id = p_user_id;
    DELETE FROM public.profiles WHERE id = p_user_id;
  END IF;
  PERFORM public.log_admin_action('ACCOUNT_DELETE','user',p_user_id,v_email,NULL,jsonb_build_object('anonymized',p_anonymize));
  RETURN true;
END; $function$;

CREATE OR REPLACE FUNCTION public.admin_cancel_account_deletion__core(p_user_id uuid)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_email text;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT email INTO v_email FROM public.profiles WHERE id = p_user_id AND account_deletion_requested_at IS NOT NULL;
  IF v_email IS NULL THEN RAISE EXCEPTION 'Bekleyen silme talebi bulunamadı'; END IF;
  UPDATE public.profiles SET account_deletion_requested_at = NULL, updated_at = NOW() WHERE id = p_user_id;
  INSERT INTO public.notifications (user_id, title, body, type_key)
  VALUES (p_user_id, 'Silme Talebin İptal Edildi',
    'Hesap silme talebin yönetici tarafından iptal edildi. Hesabın aktif kalmaya devam ediyor.',
    'ACCOUNT_DELETION_CANCELLED');
  PERFORM public.log_admin_action('ACCOUNT_DELETE_CANCEL','user',p_user_id,v_email,NULL,NULL);
  RETURN true;
END; $function$;

CREATE OR REPLACE FUNCTION public.admin_cancel_account_deletion(p_user_id uuid)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN PERFORM public.require_admin_role('{MODERATOR}'::text[]); RETURN public.admin_cancel_account_deletion__core(p_user_id); END; $function$;
GRANT EXECUTE ON FUNCTION public.admin_cancel_account_deletion(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_cancel_account_deletion(uuid) FROM anon;

INSERT INTO public.app_config (key, value, value_type, category, label, description, is_public)
VALUES ('account_deletion_auto_process', 'false'::jsonb, 'boolean', 'GENEL',
  'Otomatik Hesap Silme İşleme',
  'Açıkken, bekleme süresi dolan hesap silme talepleri her gün otomatik anonimleştirilir. Kapalıyken talepler yalnız panelden manuel işlenir.',
  false)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.process_expired_account_deletions()
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_wait int; v_count int := 0; r record;
BEGIN
  IF NOT public.get_config_bool('account_deletion_auto_process', false) THEN RETURN 0; END IF;
  SELECT COALESCE((value)::int, 7) INTO v_wait FROM public.app_config WHERE key = 'account_deletion_wait_days';
  v_wait := COALESCE(v_wait, 7);
  FOR r IN
    SELECT id FROM public.profiles
    WHERE account_deletion_requested_at IS NOT NULL
      AND now() >= account_deletion_requested_at + (v_wait || ' days')::interval
      AND COALESCE(is_admin, false) = false AND role NOT IN ('ADMIN','SUPER_ADMIN')
  LOOP
    IF EXISTS (SELECT 1 FROM public.pitch_bookings WHERE user_id = r.id AND status IN ('PENDING','CONFIRMED')
               AND (booking_date > CURRENT_DATE OR (booking_date = CURRENT_DATE AND end_time > CURRENT_TIME)))
       OR EXISTS (SELECT 1 FROM public.payment_intents pi JOIN public.matches m ON m.id = pi.match_id
               WHERE pi.user_id = r.id AND pi.status IN ('PENDING','BLOCKED','CAPTURED')
               AND m.status IN ('GATHERING','CONFIRMED','PLAYING','LIVE')) THEN
      CONTINUE;
    END IF;
    UPDATE public.profiles SET full_name='Silinmiş Kullanıcı', name='Silinmiş Kullanıcı',
      email='deleted_'||substr(r.id::text,1,8)||'@oyna.deleted', phone=NULL, avatar_url=NULL,
      is_banned=true, account_deletion_requested_at=NULL, updated_at=NOW() WHERE id=r.id;
    BEGIN
      UPDATE auth.users SET email='deleted_'||substr(r.id::text,1,8)||'@oyna.deleted',
        phone=NULL, raw_user_meta_data='{}'::jsonb, banned_until='2999-01-01'::timestamptz, updated_at=NOW()
      WHERE id=r.id;
    EXCEPTION WHEN others THEN RAISE WARNING 'process_expired_account_deletions: auth temizlenemedi (%): %', r.id, SQLERRM;
    END;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END; $function$;

REVOKE ALL ON FUNCTION public.process_expired_account_deletions() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_expired_account_deletions() FROM anon;
REVOKE ALL ON FUNCTION public.process_expired_account_deletions() FROM authenticated;

SELECT cron.schedule('process-expired-account-deletions', '0 3 * * *',
  $cron$ SELECT public.process_expired_account_deletions(); $cron$);
