-- ============================================================================
-- Tesis onayları: mükerrer bildirim düzeltmesi
-- ----------------------------------------------------------------------------
-- SORUN: admin_moderate_pitch__core, verification_status'u değiştirdikten sonra
-- sahibe MANUEL bir bildirim (PITCH_APPROVED/PITCH_REJECTED) yazıyordu. Ancak
-- pitches üzerindeki trg_notify_pitch_verification trigger'ı da AYNI değişimde
-- 'pitch_verification_result' bildirimini gönderiyor → sahibe İKİ bildirim.
--
-- ÇÖZÜM: Kanonik kaynak trigger'dır (owner'ın kendi self-servis değişimlerinde
-- de tetiklenir). __core'daki manuel INSERT kaldırıldı. Geri kalan davranış
-- (durum + not yazımı, audit) korunur.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_moderate_pitch__core(p_pitch_id uuid, p_approved boolean, p_notes text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pitch_name TEXT;
  v_owner_id   UUID;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  SELECT name, owner_id INTO v_pitch_name, v_owner_id
  FROM public.pitches WHERE id = p_pitch_id;

  IF v_pitch_name IS NULL THEN
    RAISE EXCEPTION 'Tesis bulunamadı.';
  END IF;

  -- Not: Onaya geçişte reddin sebebi (verification_notes) yazılır; onayda temizlenir.
  -- Sahibe bildirim, trg_notify_pitch_verification trigger'ından TEK sefer gider.
  UPDATE public.pitches SET
    verification_status = CASE WHEN p_approved THEN 'approved' ELSE 'rejected' END,
    verification_notes  = CASE WHEN p_approved THEN NULL ELSE p_notes END,
    updated_at          = NOW()
  WHERE id = p_pitch_id;

  PERFORM public.log_admin_action(
    CASE WHEN p_approved THEN 'PITCH_APPROVE' ELSE 'PITCH_REJECT' END,
    'pitch', p_pitch_id, v_pitch_name,
    jsonb_build_object('status', 'pending'),
    jsonb_build_object('status', CASE WHEN p_approved THEN 'approved' ELSE 'rejected' END, 'notes', p_notes)
  );

  RETURN TRUE;
END;
$function$;
