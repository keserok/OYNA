-- ════════════════════════════════════════════════════════════════════════
-- STAFF-2a — YETKİ MATRİSİ (RLS)
-- ------------------------------------------------------------------------
-- Müdür = Sahip (yönetim); Personel = kasa altkümesi (salt okuma + RPC'ler).
-- Yaklaşım: sahip-kapılı politikaların yükünü tek-kaynak yardımcılara devret:
--   can_manage_pitch  → OWNER + MANAGER (+admin/demo, eski davranış korunur)
--   can_staff_pitch   → OWNER + MANAGER + STAFF
-- Sahip-only kalanlar (DOKUNULMADI): pitch_bank_accounts,
-- owner_withdrawal_requests, pitches INSERT/DELETE, personel yazma
-- (login yetkisi). Personelin para/rezervasyon YAZMASI yalnız denetimli
-- SECURITY DEFINER RPC'lerden geçer (STAFF-2b) — ham tabloya yazamaz.
-- ════════════════════════════════════════════════════════════════════════

-- ── COURTS (yönetim) ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS courts_write_insert ON public.courts;
DROP POLICY IF EXISTS courts_write_update ON public.courts;
DROP POLICY IF EXISTS courts_write_delete ON public.courts;
CREATE POLICY courts_write_insert ON public.courts FOR INSERT
  WITH CHECK (public.can_manage_pitch(pitch_id));
CREATE POLICY courts_write_update ON public.courts FOR UPDATE
  USING (public.can_manage_pitch(pitch_id)) WITH CHECK (public.can_manage_pitch(pitch_id));
CREATE POLICY courts_write_delete ON public.courts FOR DELETE
  USING (public.can_manage_pitch(pitch_id));

-- ── UYGUNLUK İSTİSNALARI (yönetim) ──────────────────────────────────────────
DROP POLICY IF EXISTS pitch_exceptions_insert ON public.pitch_availability_exceptions;
DROP POLICY IF EXISTS pitch_exceptions_update ON public.pitch_availability_exceptions;
DROP POLICY IF EXISTS pitch_exceptions_delete ON public.pitch_availability_exceptions;
CREATE POLICY pitch_exceptions_insert ON public.pitch_availability_exceptions FOR INSERT
  WITH CHECK (public.can_manage_pitch(pitch_id));
CREATE POLICY pitch_exceptions_update ON public.pitch_availability_exceptions FOR UPDATE
  USING (public.can_manage_pitch(pitch_id)) WITH CHECK (public.can_manage_pitch(pitch_id));
CREATE POLICY pitch_exceptions_delete ON public.pitch_availability_exceptions FOR DELETE
  USING (public.can_manage_pitch(pitch_id));

-- ── GİDER + GİDER ŞABLONLARI (yönetim; personel GÖREMEZ/yazamaz) ────────────
DROP POLICY IF EXISTS pitch_expenses_manage ON public.pitch_expenses;
CREATE POLICY pitch_expenses_manage ON public.pitch_expenses FOR ALL
  USING (public.can_manage_pitch(pitch_id)) WITH CHECK (public.can_manage_pitch(pitch_id));
DROP POLICY IF EXISTS expense_templates_manage ON public.pitch_expense_templates;
CREATE POLICY expense_templates_manage ON public.pitch_expense_templates FOR ALL
  USING (public.can_manage_pitch(pitch_id)) WITH CHECK (public.can_manage_pitch(pitch_id));

-- ── FLAŞ FIRSAT (yönetim/pazarlama) ─────────────────────────────────────────
DROP POLICY IF EXISTS pitch_flash_deals_insert ON public.pitch_flash_deals;
DROP POLICY IF EXISTS pitch_flash_deals_update ON public.pitch_flash_deals;
DROP POLICY IF EXISTS pitch_flash_deals_delete ON public.pitch_flash_deals;
CREATE POLICY pitch_flash_deals_insert ON public.pitch_flash_deals FOR INSERT
  WITH CHECK (public.can_manage_pitch(pitch_id));
CREATE POLICY pitch_flash_deals_update ON public.pitch_flash_deals FOR UPDATE
  USING (public.can_manage_pitch(pitch_id)) WITH CHECK (public.can_manage_pitch(pitch_id));
CREATE POLICY pitch_flash_deals_delete ON public.pitch_flash_deals FOR DELETE
  USING (public.can_manage_pitch(pitch_id));

-- ── ABONMAN (yönetim) ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS pitch_subscriptions_insert ON public.pitch_subscriptions;
DROP POLICY IF EXISTS pitch_subscriptions_update ON public.pitch_subscriptions;
DROP POLICY IF EXISTS pitch_subscriptions_delete ON public.pitch_subscriptions;
DROP POLICY IF EXISTS pitch_subscriptions_select ON public.pitch_subscriptions;
CREATE POLICY pitch_subscriptions_select ON public.pitch_subscriptions FOR SELECT
  USING ((user_id = (SELECT auth.uid())) OR public.can_manage_pitch(pitch_id));
CREATE POLICY pitch_subscriptions_insert ON public.pitch_subscriptions FOR INSERT
  WITH CHECK (public.can_manage_pitch(pitch_id));
CREATE POLICY pitch_subscriptions_update ON public.pitch_subscriptions FOR UPDATE
  USING (public.can_manage_pitch(pitch_id)) WITH CHECK (public.can_manage_pitch(pitch_id));
CREATE POLICY pitch_subscriptions_delete ON public.pitch_subscriptions FOR DELETE
  USING (public.can_manage_pitch(pitch_id));

-- ── TARİFE (fiyatlama = yönetim; personel fiyat DEĞİŞTİREMEZ) ────────────────
DROP POLICY IF EXISTS pitch_tariffs_insert ON public.pitch_tariffs;
DROP POLICY IF EXISTS pitch_tariffs_update ON public.pitch_tariffs;
DROP POLICY IF EXISTS pitch_tariffs_delete ON public.pitch_tariffs;
CREATE POLICY pitch_tariffs_insert ON public.pitch_tariffs FOR INSERT
  WITH CHECK (public.can_manage_pitch(pitch_id));
CREATE POLICY pitch_tariffs_update ON public.pitch_tariffs FOR UPDATE
  USING (public.can_manage_pitch(pitch_id)) WITH CHECK (public.can_manage_pitch(pitch_id));
CREATE POLICY pitch_tariffs_delete ON public.pitch_tariffs FOR DELETE
  USING (public.can_manage_pitch(pitch_id));

-- ── SAHA PROFİLİ (yönetim UPDATE; INSERT/DELETE sahip-only kalır) ────────────
-- Müdür profil/ayar düzenler AMA sahiplik ele geçiremez: owner_id/is_demo
-- değişimini trigger yalnız sahibe/admine bırakır (yetki yükselmesi kapalı).
DROP POLICY IF EXISTS pitches_update_owner_or_admin ON public.pitches;
CREATE POLICY pitches_update_owner_or_admin ON public.pitches FOR UPDATE
  USING (public.can_manage_pitch(id)) WITH CHECK (public.can_manage_pitch(id));

CREATE OR REPLACE FUNCTION public.pitches_guard_owner_cols()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF (NEW.owner_id IS DISTINCT FROM OLD.owner_id OR NEW.is_demo IS DISTINCT FROM OLD.is_demo) THEN
    IF NOT (public.is_admin() OR OLD.owner_id = (SELECT auth.uid())) THEN
      RAISE EXCEPTION 'UNAUTHORIZED: sahiplik/demo alanlarını yalnızca saha sahibi değiştirebilir.';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_pitches_guard_owner_cols ON public.pitches;
CREATE TRIGGER trg_pitches_guard_owner_cols BEFORE UPDATE ON public.pitches
  FOR EACH ROW EXECUTE FUNCTION public.pitches_guard_owner_cols();

-- ── REZERVASYONLAR (personel GÖRÜR; yazma yönetim + RPC) ────────────────────
DROP POLICY IF EXISTS pitch_bookings_select ON public.pitch_bookings;
DROP POLICY IF EXISTS pitch_bookings_insert ON public.pitch_bookings;
DROP POLICY IF EXISTS pitch_bookings_update ON public.pitch_bookings;
DROP POLICY IF EXISTS pitch_bookings_delete ON public.pitch_bookings;
CREATE POLICY pitch_bookings_select ON public.pitch_bookings FOR SELECT
  USING (
    (user_id = (SELECT auth.uid()))
    OR public.can_staff_pitch(pitch_id)
    OR EXISTS (SELECT 1 FROM public.pitches p WHERE p.id = pitch_bookings.pitch_id AND p.is_demo = true)
  );
CREATE POLICY pitch_bookings_insert ON public.pitch_bookings FOR INSERT
  WITH CHECK (public.can_manage_pitch(pitch_id));
CREATE POLICY pitch_bookings_update ON public.pitch_bookings FOR UPDATE
  USING (public.can_manage_pitch(pitch_id)) WITH CHECK (public.can_manage_pitch(pitch_id));
CREATE POLICY pitch_bookings_delete ON public.pitch_bookings FOR DELETE
  USING (public.can_manage_pitch(pitch_id));

-- ── ÖDEME KAYITLARI (personel GÖRÜR + RPC ile tahsil eder; ham yazma yönetim)─
-- Para izi silinemez: personel UPDATE/DELETE yapamaz (yalnız yönetim). Tahsilat
-- personel için staff_record_payment RPC'sinden (recorded_by sunucuda damgalı).
DROP POLICY IF EXISTS booking_payments_manage ON public.booking_payments;
CREATE POLICY booking_payments_read ON public.booking_payments FOR SELECT
  USING (public.can_staff_pitch(
    (SELECT pb.pitch_id FROM public.pitch_bookings pb WHERE pb.id = booking_payments.booking_id)));
CREATE POLICY booking_payments_write ON public.booking_payments FOR ALL
  USING (public.can_manage_pitch(
    (SELECT pb.pitch_id FROM public.pitch_bookings pb WHERE pb.id = booking_payments.booking_id)))
  WITH CHECK (public.can_manage_pitch(
    (SELECT pb.pitch_id FROM public.pitch_bookings pb WHERE pb.id = booking_payments.booking_id)));

-- ── VERESİYE (personel GÖRÜR + RPC ile ödeme alır; ham yazma yönetim) ───────
DROP POLICY IF EXISTS pitch_debtors_manage ON public.pitch_debtors;
CREATE POLICY pitch_debtors_read ON public.pitch_debtors FOR SELECT
  USING (public.can_staff_pitch(pitch_id));
CREATE POLICY pitch_debtors_write ON public.pitch_debtors FOR ALL
  USING (public.can_manage_pitch(pitch_id)) WITH CHECK (public.can_manage_pitch(pitch_id));

DROP POLICY IF EXISTS debtor_entries_manage ON public.pitch_debtor_entries;
CREATE POLICY debtor_entries_read ON public.pitch_debtor_entries FOR SELECT
  USING (public.can_staff_pitch(pitch_id));
CREATE POLICY debtor_entries_write ON public.pitch_debtor_entries FOR ALL
  USING (public.can_manage_pitch(pitch_id)) WITH CHECK (public.can_manage_pitch(pitch_id));

-- ── PERSONEL LİSTESİ (yazma sahip-only KALIR; müdür okur, personel RPC ile) ──
-- "Owners manage pitch staff" (ALL, sahip-only) DOKUNULMADI → login yetkisi
-- vermek/almak yalnız sahibin. Müdüre ham okuma (davet kodu paylaşımı için).
CREATE POLICY staff_members_read ON public.pitch_staff_members FOR SELECT
  USING (public.can_manage_pitch(pitch_id));

-- ── PERSONEL GÖREVLERİ (personel GÖRÜR + RPC ile tamamlar; yazma yönetim) ────
DROP POLICY IF EXISTS "Owners manage pitch tasks" ON public.pitch_staff_tasks;
CREATE POLICY staff_tasks_read ON public.pitch_staff_tasks FOR SELECT
  USING (public.can_staff_pitch(pitch_id));
CREATE POLICY staff_tasks_write ON public.pitch_staff_tasks FOR ALL
  USING (public.can_manage_pitch(pitch_id)) WITH CHECK (public.can_manage_pitch(pitch_id));
