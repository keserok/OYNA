-- ════════════════════════════════════════════════════════════════════════════
-- TC KİMLİK TOPLAMA TAMAMEN KAPANDI (kurucu kararı 2.15 · 20 Ağustos 2026)
-- ----------------------------------------------------------------------------
-- "TC kimlik numarası HİÇBİR yerde istenmez ve saklanmaz."
-- Arayüzdeki TC modülü söküldü; bu göç sunucu tarafını kapatır:
--   1) Saklanan tc_no_hash / birth_year değerleri SİLİNİR (hash bile olsa
--      11 haneli uzay kaba kuvvetle çözülebilir — kişisel veridir).
--   2) submit_provider_identity yeni gönderimi REDDEDER (fail-closed).
--   3) Onay akışı DOKUNULMAZ: status/full_name/verified_* aynen kalır;
--      sağlayıcı onayını yönetici, belge istemeden verir.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.provider_identities
  ALTER COLUMN tc_no_hash DROP NOT NULL;

UPDATE public.provider_identities
   SET tc_no_hash = NULL, birth_year = NULL
 WHERE tc_no_hash IS NOT NULL OR birth_year IS NOT NULL;

DROP FUNCTION IF EXISTS public.submit_provider_identity(text, text, integer);
CREATE OR REPLACE FUNCTION public.submit_provider_identity(
  p_tc_no text, p_full_name text, p_birth_year int DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  RAISE EXCEPTION 'IDENTITY_COLLECTION_DISABLED: Kimlik numarası istenmez. Profil onayın yönetici tarafından, belge gerekmeden verilir.';
END;
$fn$;

-- ── DOĞRULAMA ────────────────────────────────────────────────────────────────
DO $dogrula$
DECLARE v_kalan int; v_txt text;
BEGIN
  SELECT count(*) INTO v_kalan FROM public.provider_identities
   WHERE tc_no_hash IS NOT NULL OR birth_year IS NOT NULL;
  IF v_kalan > 0 THEN
    RAISE EXCEPTION 'DOGRULAMA: % satırda kimlik izi kaldı', v_kalan;
  END IF;
  SELECT pg_get_functiondef(p.oid) INTO v_txt FROM pg_proc p
   JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public' AND p.proname='submit_provider_identity';
  IF position('IDENTITY_COLLECTION_DISABLED' in v_txt) = 0 THEN
    RAISE EXCEPTION 'DOGRULAMA: gönderim kapısı yerinde değil';
  END IF;
  RAISE NOTICE 'DOGRULAMA TAMAM — kimlik izleri silindi, kapı kapandı.';
END;
$dogrula$;
