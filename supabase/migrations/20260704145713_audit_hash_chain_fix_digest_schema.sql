-- [DB GEÇMİŞİNDEN KURTARILDI 2026-07-11] Bu migration canlı veritabanına uygulanmıştı ancak repoda dosyası yoktu; supabase_migrations.schema_migrations.statements kolonundan geri çıkarıldı.

CREATE OR REPLACE FUNCTION public.audit_log_hash_chain()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_prev text;
  v_payload text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('admin_audit_log_hash_chain'));

  SELECT row_hash INTO v_prev
    FROM public.admin_audit_log
   ORDER BY created_at DESC, id DESC
   LIMIT 1;

  v_payload := concat_ws('|',
    NEW.id::text,
    COALESCE(NEW.admin_id::text, ''),
    COALESCE(NEW.action, ''),
    COALESCE(NEW.target_type, ''),
    COALESCE(NEW.target_id::text, ''),
    COALESCE(NEW.target_identifier, ''),
    COALESCE(NEW.old_value::text, ''),
    COALESCE(NEW.new_value::text, ''),
    COALESCE(NEW.created_at::text, now()::text)
  );

  NEW.prev_hash := v_prev;
  NEW.row_hash  := encode(extensions.digest(COALESCE(v_prev, '') || v_payload, 'sha256'), 'hex');
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_verify_audit_chain(p_limit integer DEFAULT 5000)
 RETURNS TABLE(broken_id uuid, broken_at timestamptz, reason text, checked bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
  v_prev text := NULL;
  v_expected text;
  v_payload text;
  v_count bigint := 0;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  PERFORM public.require_admin_role(ARRAY[]::text[]);

  FOR r IN
    SELECT * FROM public.admin_audit_log
     ORDER BY created_at ASC, id ASC
     LIMIT GREATEST(p_limit, 1)
  LOOP
    v_count := v_count + 1;

    IF r.row_hash IS NULL THEN
      v_prev := NULL;
      CONTINUE;
    END IF;

    IF r.prev_hash IS DISTINCT FROM v_prev THEN
      RETURN QUERY SELECT r.id, r.created_at, 'prev_hash zincirle uyuşmuyor'::text, v_count;
      RETURN;
    END IF;

    v_payload := concat_ws('|',
      r.id::text,
      COALESCE(r.admin_id::text, ''),
      COALESCE(r.action, ''),
      COALESCE(r.target_type, ''),
      COALESCE(r.target_id::text, ''),
      COALESCE(r.target_identifier, ''),
      COALESCE(r.old_value::text, ''),
      COALESCE(r.new_value::text, ''),
      COALESCE(r.created_at::text, '')
    );
    v_expected := encode(extensions.digest(COALESCE(r.prev_hash, '') || v_payload, 'sha256'), 'hex');

    IF v_expected IS DISTINCT FROM r.row_hash THEN
      RETURN QUERY SELECT r.id, r.created_at, 'row_hash yeniden hesapla ile uyuşmuyor (satır değiştirilmiş)'::text, v_count;
      RETURN;
    END IF;

    v_prev := r.row_hash;
  END LOOP;

  RETURN QUERY SELECT NULL::uuid, NULL::timestamptz, 'Zincir sağlam'::text, v_count;
END;
$function$;
