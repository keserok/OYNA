-- Security: Revoke PUBLIC execute on 77 anon-accessible SECURITY DEFINER functions
-- Fix security_definer_view on pending_provider_verifications
-- Fix function_search_path_mutable on 3 utility functions

-- ═══ 1. REVOKE PUBLIC EXECUTE — removes =X/postgres; authenticated grant untouched ═══════

REVOKE EXECUTE ON FUNCTION public._sync_profile_communities(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_assign_match_referee(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_assign_to_slot(uuid, text, uuid, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_ban_user(uuid, boolean, timestamp with time zone, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_broadcast_notification(text, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_cancel_match(uuid, text, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_create_community(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_create_goalkeeper(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_create_match(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_create_pitch(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_create_promo_code(text, text, numeric, text, integer, timestamp with time zone, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_create_referee(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_dashboard_stats() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_delete_community(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_delete_goalkeeper(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_delete_match(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_delete_pitch(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_delete_promo_code(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_delete_referee(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_fetch_booking_payments(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_fetch_cms_texts() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_fetch_communities(text, boolean, text, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_fetch_goalkeepers(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_fetch_matches(text, text, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_fetch_owner_billing_events(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_fetch_pending_verifications() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_fetch_pitches(text, text, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_fetch_profile_names(uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_fetch_profiles(integer, integer, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_fetch_referees(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_fetch_revenue_trend(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_fetch_wallet_ledger(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_fetch_withdrawal_requests(text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_finance_stats(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_get_community(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_get_match(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_get_my_role() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_kick_from_slot(uuid, text, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_log_impersonation(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_manage_community_member(uuid, uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_moderate_community_creation(uuid, boolean, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_moderate_join_request(uuid, boolean, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_moderate_pitch(uuid, boolean, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_notify_community(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_ops_queue() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_process_account_deletion(uuid, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_process_withdrawal(uuid, boolean, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_resolve_dispute(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_revoke_platform_role(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_segment_preview(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_set_match_status(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_set_platform_role(uuid, text, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_set_promo_code_active(uuid, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_toggle_user_pro(uuid, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_update_community(uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_update_goalkeeper(uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_update_match(uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_update_owner_account(uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_update_pitch(uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_update_referee(uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_update_settings(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_update_texts(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_update_user_profile(uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_upsert_user_profile(uuid, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_verify_user(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.approve_provider_verification(uuid, boolean, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ensure_owner_account() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_super_admin(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_admin_action(text, text, uuid, text, jsonb, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.player_create_match(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.player_update_match(uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.profile_privileges_unchanged(uuid, text, boolean, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.protect_profile_sensitive_fields() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.purge_godview_demo() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.purge_module_demo(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.request_account_deletion() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.seed_godview_demo() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.seed_module_demo(text) FROM PUBLIC;

-- ═══ 2. Fix security_definer_view: pending_provider_verifications ═══════════════════════

CREATE OR REPLACE VIEW public.pending_provider_verifications
WITH (security_invoker = on)
AS
 SELECT p.id,
    COALESCE(p.full_name, p.name::text) AS full_name,
    p.email,
    p.avatar_url,
    p.role AS primary_role,
    p.roles,
    p.verification_status,
    p.created_at,
    g.id AS gk_profile_id,
    g.bio AS gk_bio,
    g.fee AS gk_fee,
    r.id AS ref_profile_id,
    r.bio AS ref_bio,
    r.fee AS ref_fee
   FROM profiles p
     LEFT JOIN goalkeepers g ON g.id = p.id OR g."authUid" = p.id
     LEFT JOIN referees r ON r.id = p.id OR r."authUid" = p.id
  WHERE p.verification_status = 'pending'::text
    AND ((p.role::text = ANY (ARRAY['GOALKEEPER'::text, 'REFEREE'::text]))
         OR COALESCE(p.roles, '[]'::jsonb) ? 'GOALKEEPER'::text
         OR COALESCE(p.roles, '[]'::jsonb) ? 'REFEREE'::text);

-- ═══ 3. Fix function_search_path_mutable — add SET search_path = public ═══════════════

CREATE OR REPLACE FUNCTION public._admin_patch_slot(p_slots jsonb, p_slot_id text, p_patch jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $function$
  SELECT COALESCE(jsonb_agg(
    CASE WHEN elem->>'id' = p_slot_id THEN elem || p_patch ELSE elem END
  ), '[]'::jsonb)
  FROM jsonb_array_elements(COALESCE(p_slots, '[]'::jsonb)) AS elem;
$function$;

CREATE OR REPLACE FUNCTION public._is_match_participant(p_match_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.matches m
    WHERE m.id = p_match_id
    AND (
      m."creatorId" = p_user_id OR
      m.captain_id = p_user_id OR
      EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(m.slots, '[]'::jsonb)) s WHERE (s->'player'->>'id')::uuid = p_user_id) OR
      EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(m."awaySlots", '[]'::jsonb)) s WHERE (s->'player'->>'id')::uuid = p_user_id) OR
      EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(m."reservePlayers", '[]'::jsonb)) s WHERE (s->>'id')::uuid = p_user_id)
    )
  );
$function$;

CREATE OR REPLACE FUNCTION public.sync_admin_flags()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  IF NEW.role IN ('ADMIN', 'SUPER_ADMIN')
     OR COALESCE(NEW.roles, '[]'::jsonb) ? 'ADMIN'
     OR COALESCE(NEW.roles, '[]'::jsonb) ? 'SUPER_ADMIN'
  THEN
    NEW.is_admin := true;
  END IF;
  RETURN NEW;
END;
$function$;
