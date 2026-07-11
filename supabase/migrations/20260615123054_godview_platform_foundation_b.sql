-- [DB GEÇMİŞİNDEN KURTARILDI 2026-07-11] Bu migration canlı veritabanına uygulanmıştı ancak repoda dosyası yoktu; supabase_migrations.schema_migrations.statements kolonundan geri çıkarıldı.

CREATE OR REPLACE FUNCTION public.log_admin_action(p_action TEXT, p_target_type TEXT, p_target_id UUID, p_target_identifier TEXT, p_old_value JSONB DEFAULT NULL, p_new_value JSONB DEFAULT NULL) RETURNS UUID AS $$
DECLARE v_log_id UUID; v_admin_name TEXT;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT COALESCE(full_name, email, 'Admin') INTO v_admin_name FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.admin_audit_log (admin_id, admin_name, action, target_type, target_id, target_identifier, old_value, new_value)
  VALUES (auth.uid(), v_admin_name, p_action, p_target_type, p_target_id, p_target_identifier, p_old_value, p_new_value) RETURNING id INTO v_log_id;
  RETURN v_log_id;
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
CREATE OR REPLACE FUNCTION public.approve_provider_verification(p_user_id UUID, p_approved BOOLEAN, p_notes TEXT DEFAULT NULL) RETURNS BOOLEAN AS $$
DECLARE v_user_email TEXT;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT email INTO v_user_email FROM public.profiles WHERE id = p_user_id;
  UPDATE public.profiles SET verification_status = CASE WHEN p_approved THEN 'approved' ELSE 'rejected' END, verification_notes = p_notes, verification_reviewed_by = auth.uid(), verification_reviewed_at = NOW(), updated_at = NOW() WHERE id = p_user_id;
  INSERT INTO public.notifications (user_id, title, body, type_key) VALUES (p_user_id, CASE WHEN p_approved THEN 'Profilin Onaylandı!' ELSE 'Profil Onayı Reddedildi' END, CASE WHEN p_approved THEN 'Tebrikler! Kaleci/Hakem profilin onaylandı.' ELSE COALESCE('Profilin onaylanamadı. Sebep: ' || p_notes, 'Profilin onaylanamadı.') END, CASE WHEN p_approved THEN 'VERIFICATION_APPROVED' ELSE 'VERIFICATION_REJECTED' END);
  PERFORM public.log_admin_action(CASE WHEN p_approved THEN 'VERIFICATION_APPROVE' ELSE 'VERIFICATION_REJECT' END, 'user', p_user_id, v_user_email, jsonb_build_object('status', 'pending'), jsonb_build_object('status', CASE WHEN p_approved THEN 'approved' ELSE 'rejected' END, 'notes', p_notes));
  RETURN TRUE;
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
CREATE OR REPLACE FUNCTION public.admin_moderate_pitch(p_pitch_id UUID, p_approved BOOLEAN, p_notes TEXT DEFAULT NULL) RETURNS BOOLEAN AS $$
DECLARE v_pitch_name TEXT; v_owner_id UUID;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT name, owner_id INTO v_pitch_name, v_owner_id FROM public.pitches WHERE id = p_pitch_id;
  IF v_pitch_name IS NULL THEN RAISE EXCEPTION 'Tesis bulunamadı.'; END IF;
  UPDATE public.pitches SET verification_status = CASE WHEN p_approved THEN 'approved' ELSE 'rejected' END, verification_notes = CASE WHEN p_approved THEN NULL ELSE p_notes END, updated_at = NOW() WHERE id = p_pitch_id;
  IF v_owner_id IS NOT NULL THEN INSERT INTO public.notifications (user_id, title, body, type_key) VALUES (v_owner_id, CASE WHEN p_approved THEN 'Tesisiniz Onaylandı' ELSE 'Tesisiniz Onaylanmadı' END, CASE WHEN p_approved THEN v_pitch_name || ' tesisiniz onaylandı.' ELSE v_pitch_name || ': ' || COALESCE(p_notes, 'Onaylanamadı.') END, CASE WHEN p_approved THEN 'PITCH_APPROVED' ELSE 'PITCH_REJECTED' END); END IF;
  PERFORM public.log_admin_action(CASE WHEN p_approved THEN 'PITCH_APPROVE' ELSE 'PITCH_REJECT' END, 'pitch', p_pitch_id, v_pitch_name, jsonb_build_object('status', 'pending'), jsonb_build_object('status', CASE WHEN p_approved THEN 'approved' ELSE 'rejected' END, 'notes', p_notes));
  RETURN TRUE;
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
CREATE OR REPLACE FUNCTION public.admin_process_withdrawal(p_request_id UUID, p_approved BOOLEAN, p_notes TEXT DEFAULT NULL) RETURNS BOOLEAN AS $$
DECLARE v_owner_id UUID; v_amount NUMERIC; v_pitch_name TEXT;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT w.owner_id, w.amount, p.name INTO v_owner_id, v_amount, v_pitch_name FROM public.owner_withdrawal_requests w LEFT JOIN public.pitches p ON p.id = w.pitch_id WHERE w.id = p_request_id;
  IF v_owner_id IS NULL THEN RAISE EXCEPTION 'Talep bulunamadı.'; END IF;
  UPDATE public.owner_withdrawal_requests SET status = CASE WHEN p_approved THEN 'APPROVED' ELSE 'REJECTED' END, admin_notes = p_notes, processed_at = NOW(), processed_by = auth.uid() WHERE id = p_request_id;
  INSERT INTO public.notifications (user_id, title, body, type_key) VALUES (v_owner_id, CASE WHEN p_approved THEN 'Para Çekme Talebiniz Onaylandı' ELSE 'Para Çekme Talebiniz Reddedildi' END, CASE WHEN p_approved THEN COALESCE(v_amount::text, '0') || '₺ tutarındaki talebiniz onaylandı.' ELSE COALESCE(p_notes, 'Talep reddedildi.') END, CASE WHEN p_approved THEN 'WITHDRAWAL_APPROVED' ELSE 'WITHDRAWAL_REJECTED' END);
  PERFORM public.log_admin_action(CASE WHEN p_approved THEN 'WITHDRAWAL_APPROVE' ELSE 'WITHDRAWAL_REJECT' END, 'withdrawal', p_request_id, COALESCE(v_pitch_name, 'withdrawal'), jsonb_build_object('status', 'PENDING'), jsonb_build_object('status', CASE WHEN p_approved THEN 'APPROVED' ELSE 'REJECTED' END, 'notes', p_notes, 'amount', v_amount));
  RETURN TRUE;
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
