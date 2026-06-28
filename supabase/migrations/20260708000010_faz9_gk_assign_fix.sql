-- FAZ 9 düzeltme: matches.gk_id profiles(id)'e FK'lı (kalecinin kullanıcı hesabı).
-- goalkeepers.id değil, kalecinin authUid'i set edilmeli; ayrıca o authUid'in
-- profiles'ta gerçekten var olduğu kontrol edilir → ham FK hatası yerine net mesaj.
-- (Hakem tarafında refereeId FK'sız; kaleci tarafında FK var — ayrım burada.)
CREATE OR REPLACE FUNCTION public.admin_assign_match_goalkeeper(p_match_id uuid, p_goalkeeper_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  PERFORM public.require_admin_role(ARRAY['MODERATOR']);
  IF p_goalkeeper_id IS NULL THEN
    v_uid := NULL;  -- atamayı kaldır
  ELSE
    SELECT "authUid" INTO v_uid FROM public.goalkeepers WHERE id = p_goalkeeper_id;
    IF v_uid IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid) THEN
      RAISE EXCEPTION 'Bu kalecinin sistemde bağlı kullanıcı hesabı yok; maça doğrudan atanamıyor.';
    END IF;
  END IF;
  UPDATE public.matches SET gk_id = v_uid WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Maç bulunamadı'; END IF;
  PERFORM public.log_admin_action('MATCH_ASSIGN_GK', 'match', p_match_id, COALESCE(p_goalkeeper_id::text,'kaldırıldı'), NULL, NULL);
  RETURN TRUE;
END;
$function$;
