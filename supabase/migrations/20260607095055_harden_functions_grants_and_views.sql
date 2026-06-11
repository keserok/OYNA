-- ============================================================================
-- OYNA: Harden functions (search_path), tighten EXECUTE grants, fix definer view
-- APPLIED TO PRODUCTION on 2026-06-07 (project iikvzgyccvgcybzdfwlv).
-- ============================================================================

-- 1) Pin search_path on functions flagged as mutable (privilege-escalation guard)
ALTER FUNCTION public.process_match_refund(uuid, uuid, numeric)       SET search_path = public, pg_temp;
ALTER FUNCTION public.update_user_location(uuid, text)                SET search_path = public, pg_temp;
ALTER FUNCTION public.check_match_conflict()                          SET search_path = public, pg_temp;
ALTER FUNCTION public.replace_template_vars(text, jsonb)              SET search_path = public, pg_temp;
ALTER FUNCTION public.protect_provider_sensitive_fields()            SET search_path = public, pg_temp;
ALTER FUNCTION public.protect_profile_sensitive_fields()             SET search_path = public, pg_temp;

-- 2) Trigger / internal functions must NOT be callable as RPC by clients
REVOKE EXECUTE ON FUNCTION public.handle_new_user()                  FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.notify_match_cancelled()           FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.notify_match_joined()              FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.notify_ref_status_change()         FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.notify_send_push_webhook()         FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.check_match_conflict()             FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.protect_profile_sensitive_fields()  FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.protect_provider_sensitive_fields() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.replace_template_vars(text, jsonb)  FROM anon, authenticated, public;

-- 3) Sensitive write RPCs: block anon (keep authenticated; internal auth.uid() checks)
REVOKE EXECUTE ON FUNCTION public.process_match_refund(uuid, uuid, numeric)                          FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.update_user_location(uuid, text)                                   FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.send_match_invite(uuid, uuid, uuid, uuid)                          FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.join_match_slot(uuid, uuid, character varying, character varying)  FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.materialize_subscriptions(integer, uuid)                           FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.cancel_subscription(uuid)                                          FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.update_user_skill_rating()                                         FROM anon, public;

-- 4) profiles_public view: run with caller's RLS (profiles already has public SELECT)
ALTER VIEW public.profiles_public SET (security_invoker = on);
