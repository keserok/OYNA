-- ════════════════════════════════════════════════════════════════════════════
-- [S4] PAYOUT ONAYINDA TC/IBAN İSİM EŞLEŞME KONTROLÜ (K16)
-- ────────────────────────────────────────────────────────────────────────────
-- Master plan S4 güvenlik paketi: "Çekim: TC + IBAN sahibi zorunlu; admin onayda
-- EŞLEŞME KONTROLÜ EKRANI; ileride iyzico IBAN-isim doğrulama."
--
-- Admin, bir çekim talebini COMPLETED işaretlemeden önce IBAN sahibi adının
-- talebi açan kullanıcının kayıtlı adıyla eşleştiğini görmeli (başkasının IBAN'ına
-- para kaçırma sinyali). TC ham gösterilmez (yalnız hash saklanır) → kimlik
-- DOĞRULAMA DURUMU (VERIFIED/PENDING/yok) gösterilir. İsim eşleşmesi ADVISORY:
-- normalize edilmiş karşılaştırma ✓/⚠ verir, son kararı admin verir.
-- ════════════════════════════════════════════════════════════════════════════

-- İsim normalizasyonu (TR karakter katlama + küçük harf + alfanümerik dışını at)
CREATE OR REPLACE FUNCTION public._normalize_name_tr(p text)
RETURNS text LANGUAGE sql IMMUTABLE
SET search_path = public, pg_temp AS $$
  SELECT regexp_replace(
    lower(translate(COALESCE(p, ''), 'İIŞĞÜÖÇışğüöç', 'IISGUOCisguoc')),
    '[^a-z0-9]', '', 'g');
$$;
REVOKE ALL ON FUNCTION public._normalize_name_tr(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._normalize_name_tr(text) TO service_role;

-- Bekleyen (ve istenirse tüm) payout talepleri için kimlik/isim eşleşme özeti.
CREATE OR REPLACE FUNCTION public.admin_payout_identity_checks(p_status text DEFAULT 'PENDING', p_limit integer DEFAULT 100)
RETURNS TABLE (
  payout_id uuid,
  requester_name text,
  iban_holder_name text,
  identity_status text,
  name_match boolean
) LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  RETURN QUERY
  SELECT
    po.id AS payout_id,
    COALESCE(pr.full_name, pr.name, pr.email)::text AS requester_name,
    po.iban_holder_name,
    COALESCE(pi.status, 'NONE')::text AS identity_status,
    CASE
      WHEN COALESCE(btrim(po.iban_holder_name),'') = '' THEN NULL
      ELSE (
        public._normalize_name_tr(po.iban_holder_name) = public._normalize_name_tr(COALESCE(pr.full_name, pr.name))
        OR public._normalize_name_tr(po.iban_holder_name) LIKE '%' || public._normalize_name_tr(COALESCE(pr.full_name, pr.name)) || '%'
        OR public._normalize_name_tr(COALESCE(pr.full_name, pr.name)) LIKE '%' || public._normalize_name_tr(po.iban_holder_name) || '%'
      )
    END AS name_match
  FROM public.payout_requests po
  LEFT JOIN public.profiles pr ON pr.id = po.user_id
  LEFT JOIN public.provider_identities pi ON pi.user_id = po.user_id
  WHERE (p_status = 'ALL' OR po.status = p_status)
  ORDER BY po.created_at DESC
  LIMIT GREATEST(p_limit, 1);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_payout_identity_checks(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_payout_identity_checks(text, integer) TO authenticated;
