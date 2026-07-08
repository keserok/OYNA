-- ==============================================================================
-- WP5 — Finans & Ekip ekranları için SİLİNEBİLİR demo veri
-- ------------------------------------------------------------------------------
-- Owner boş ekranlar yerine dolu ekranlar görsün diye gerçek (DB) demo satırları
-- eklenir; is_demo=true ile işaretlenir ve tek dokunuşla topluca temizlenir.
-- Gerçek kayıtlarla karışmaz (is_demo filtresi + UI'da DEMO rozeti).
-- ==============================================================================

ALTER TABLE public.pitch_expenses      ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.pitch_debtors       ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.pitch_staff_members ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.pitch_staff_tasks   ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

-- Yetki: owner ya da admin.
CREATE OR REPLACE FUNCTION public._owner_screen_demo_authz(p_pitch_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.pitches WHERE id = p_pitch_id AND owner_id = auth.uid())
      OR public.is_admin();
$$;

CREATE OR REPLACE FUNCTION public.purge_owner_screen_demo(p_pitch_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public._owner_screen_demo_authz(p_pitch_id) THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;
  DELETE FROM public.pitch_staff_tasks   WHERE pitch_id = p_pitch_id AND is_demo = true;
  DELETE FROM public.pitch_staff_members WHERE pitch_id = p_pitch_id AND is_demo = true;
  DELETE FROM public.pitch_debtors       WHERE pitch_id = p_pitch_id AND is_demo = true;
  DELETE FROM public.pitch_expenses      WHERE pitch_id = p_pitch_id AND is_demo = true;
END;
$$;

CREATE OR REPLACE FUNCTION public.seed_owner_screen_demo(p_pitch_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public._owner_screen_demo_authz(p_pitch_id) THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  -- Idempotent: önce mevcut demo satırlarını temizle, sonra taze ekle.
  PERFORM public.purge_owner_screen_demo(p_pitch_id);

  INSERT INTO public.pitch_expenses (pitch_id, category, title, amount, expense_date, note, created_by, is_demo) VALUES
    (p_pitch_id, 'Fatura',   'Elektrik faturası (demo)', 3200, CURRENT_DATE - 3, 'Demo kayıt', auth.uid(), true),
    (p_pitch_id, 'Personel', 'Kasiyer maaşı (demo)',    12000, CURRENT_DATE - 5, 'Demo kayıt', auth.uid(), true),
    (p_pitch_id, 'Bakım',    'Çim bakımı (demo)',        1800, CURRENT_DATE - 1, 'Demo kayıt', auth.uid(), true);

  INSERT INTO public.pitch_debtors (pitch_id, name, phone, amount_owed, notes, is_resolved, is_demo) VALUES
    (p_pitch_id, 'Ahmet Yılmaz (demo)',  '0500 111 22 33', 450, 'Demo veresiye', false, true),
    (p_pitch_id, 'Mehmet Kaya (demo)',   '0500 444 55 66', 300, 'Demo veresiye', false, true);

  INSERT INTO public.pitch_staff_members (pitch_id, name, role_title, status, is_demo) VALUES
    (p_pitch_id, 'Kasiyer Ali (demo)', 'Resepsiyon', 'ON_DUTY',  true),
    (p_pitch_id, 'Müdür Veli (demo)',  'Müdür',      'OFF_DUTY', true);

  INSERT INTO public.pitch_staff_tasks (pitch_id, title, priority, status, is_demo) VALUES
    (p_pitch_id, 'Sahaları maç öncesi kontrol et (demo)', 'HIGH',   'PENDING', true),
    (p_pitch_id, 'Kantin stoğunu say (demo)',             'MEDIUM', 'PENDING', true);
END;
$$;

REVOKE ALL ON FUNCTION public._owner_screen_demo_authz(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.seed_owner_screen_demo(uuid)   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.purge_owner_screen_demo(uuid)  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seed_owner_screen_demo(uuid)  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.purge_owner_screen_demo(uuid) TO authenticated, service_role;
