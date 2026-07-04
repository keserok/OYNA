-- Ghost mode sunucu taraflı oturum (Kararlar Soru 31-32 + 38):
-- her ghost girişi zorunlu sebep + 30 dk TTL ile sunucuda kayda geçer;
-- kim-kimi-neden izledi sorusu admin_audit_log + bu tablodan yanıtlanır.

CREATE TABLE IF NOT EXISTS public.admin_ghost_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (char_length(btrim(reason)) >= 5),
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 minutes',
  ended_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_ghost_sessions_admin ON public.admin_ghost_sessions (admin_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_ghost_sessions_target ON public.admin_ghost_sessions (target_user_id, started_at DESC);

ALTER TABLE public.admin_ghost_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ghost_sessions_select ON public.admin_ghost_sessions;
CREATE POLICY ghost_sessions_select ON public.admin_ghost_sessions
  FOR SELECT USING (public.is_platform_admin());
-- Yazma yalnız SECURITY DEFINER RPC'lerden: doğrudan INSERT/UPDATE/DELETE policy yok.

CREATE OR REPLACE FUNCTION public.admin_start_ghost(p_target_user_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_session_id uuid; v_expires timestamptz;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  PERFORM public.require_admin_role(ARRAY['MODERATOR','SUPPORT']);
  IF p_target_user_id = auth.uid() THEN RAISE EXCEPTION 'Kendi hesabınıza ghost girişi anlamsız'; END IF;
  IF char_length(btrim(COALESCE(p_reason, ''))) < 5 THEN
    RAISE EXCEPTION 'Ghost girişi için sebep zorunlu (en az 5 karakter)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_target_user_id) THEN
    RAISE EXCEPTION 'Kullanıcı bulunamadı';
  END IF;

  -- Aynı adminin açık oturumları kapanır (tek aktif ghost)
  UPDATE public.admin_ghost_sessions
     SET ended_at = now()
   WHERE admin_id = auth.uid() AND ended_at IS NULL;

  INSERT INTO public.admin_ghost_sessions (admin_id, target_user_id, reason)
  VALUES (auth.uid(), p_target_user_id, btrim(p_reason))
  RETURNING id, expires_at INTO v_session_id, v_expires;

  PERFORM public.log_admin_action(
    'GHOST_START', 'user', p_target_user_id, btrim(p_reason),
    NULL, jsonb_build_object('session_id', v_session_id, 'expires_at', v_expires)
  );
  RETURN jsonb_build_object('session_id', v_session_id, 'expires_at', v_expires);
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_start_ghost(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_start_ghost(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_end_ghost()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_count int;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  UPDATE public.admin_ghost_sessions
     SET ended_at = now()
   WHERE admin_id = auth.uid() AND ended_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count > 0 THEN
    PERFORM public.log_admin_action('GHOST_END', 'user', auth.uid(), NULL, NULL,
      jsonb_build_object('closed_sessions', v_count));
  END IF;
  RETURN v_count > 0;
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_end_ghost() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_end_ghost() TO authenticated;
