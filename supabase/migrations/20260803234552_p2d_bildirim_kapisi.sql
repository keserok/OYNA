-- ════════════════════════════════════════════════════════════════════════════
-- [P-2d / CTO-P0-5] BİLDİRİM YAZMA KAPISI
-- ────────────────────────────────────────────────────────────────────────────
-- SORUN: `notifications_insert_own_sender` politikası yalnız şunu istiyordu:
--     WITH CHECK (sender_id = auth.uid())
--   `user_id` (ALICI) serbestti. Yani bir kullanıcı, kendini gönderen
--   göstererek BAŞKA HERKESE bildirim yazabilirdi.
--
-- ⚠️ NEDEN ŞİMDİ ACİL: Bu bulgu CTO turunda "push açılmadan önce şart" diye
--   işaretlenmişti. P-0 ile bildirim köprüsü ONARILDI — yani bu satır artık
--   gerçekten telefona push'a dönüşüyor. Açık teorik olmaktan çıktı.
--
-- ÖNCE DOĞRULANDI — istemci bildirim YAZMIYOR:
--   `from('notifications').insert` yalnız supabaseMutations.ts:210
--   (fbAddNotification). Onu store.ts:1126 sarıyor. O sarmalayıcının da
--   kod tabanında HİÇ ÇAĞIRANI YOK (yalnız tip tanımı var, store.ts:412).
--   Gerçek bildirimlerin tamamı SECURITY DEFINER RPC'lerden üretiliyor ve
--   onlar RLS'i baypas eder — bu politika onları etkilemez.
--
-- ÇÖZÜM: Kullanıcı yalnız KENDİNE bildirim yazabilir.
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS notifications_insert_own_sender ON public.notifications;

CREATE POLICY notifications_insert_self_only ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND (sender_id IS NULL OR sender_id = (SELECT auth.uid()))
  );

COMMENT ON POLICY notifications_insert_self_only ON public.notifications IS
  'P-2d/CTO-P0-5: Kullanici yalniz KENDINE bildirim yazabilir. Baskasina bildirim gonderen tum akislar SECURITY DEFINER RPC uzerinden gider (RLS baypas).';

-- ── Doğrulama ───────────────────────────────────────────────────────────────
DO $do$
DECLARE v_check text;
BEGIN
  SELECT with_check INTO v_check FROM pg_policies
  WHERE schemaname='public' AND tablename='notifications' AND policyname='notifications_insert_self_only';

  IF v_check IS NULL OR position('user_id' in v_check) = 0 THEN
    RAISE EXCEPTION '[P-2d] Bildirim kapisi DOGRULANAMADI.';
  END IF;
  RAISE NOTICE '[P-2d] Bildirim kapisi kuruldu: %', v_check;
END $do$;

-- ════════════════════════════════════════════════════════════════════════════
-- GERİ ALMA (YAPMAYIN — eski hali herkese bildirim yazmaya izin veriyordu):
--   DROP POLICY IF EXISTS notifications_insert_self_only ON public.notifications;
--   CREATE POLICY notifications_insert_own_sender ON public.notifications
--     FOR INSERT TO authenticated WITH CHECK (sender_id = (SELECT auth.uid()));
-- ════════════════════════════════════════════════════════════════════════════
