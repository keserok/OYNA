-- ════════════════════════════════════════════════════════════════════════════
-- [SG-2] Hesap silme: hard-delete artık mali defteri silemez ve patlamaz
-- ────────────────────────────────────────────────────────────────────────────
-- SORUN: admin_process_account_deletion__core (orijinal gövde:
--   20260618000001_godview_phases_456_complete.sql "K. KVKK hesap silme")
--   p_anonymize=false yolunda düz `DELETE FROM profiles` çalıştırıyordu.
--   Admin panelindeki "Sil" düğmesi (DeletionQueuePage) bu yolu tetikler.
--   İki bozuk sonuç:
--     a) Kullanıcının payment_intents / payout_requests satırı varsa (NO
--        ACTION FK) DELETE, FK hatasıyla PATLAR → admin akışı kırılır.
--     b) Yoksa, profiles CASCADE zinciri wallet_transactions + faturalama +
--        KYC kayıtlarını SESSİZCE yok ederdi (muhasebe/denetim kaybı).
--
-- ÇÖZÜM: Hard-delete istendiğinde de ÖNCE anonimleştir (KVKK: kişisel veri
--   gider), sonra DELETE dene; foreign_key_violation yakalanırsa satır anonim
--   hâliyle KALIR ve audit log'a fallback notu düşülür. Fonksiyon hiçbir
--   koşulda hata fırlatmaz, dönüş tipi/şekli değişmez (admin UI uyumlu).
--   Bir sonraki migration (20260807000003) mali defter FK'larını RESTRICT
--   yaparak bu korumayı şema düzeyinde de garanti eder — sıra ÖNEMLİ:
--   önce bu fonksiyon, sonra FK değişikliği.
--
-- NOT: 20260710000006_admin_rbac_wrappers.sql bu fonksiyonu __core olarak
--   yeniden adlandırıp RBAC sarmalayıcısı kurmuştu; sarmalayıcıya DOKUNULMAZ.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_process_account_deletion__core(
  p_user_id uuid,
  p_anonymize boolean DEFAULT true
) RETURNS boolean AS $$
DECLARE
  v_email text;
  v_hard_deleted boolean := false;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT email INTO v_email FROM profiles WHERE id = p_user_id;
  IF v_email IS NULL THEN RAISE EXCEPTION 'Kullanıcı bulunamadı'; END IF;

  -- Her iki yolda da önce anonimleştir (orijinal anonimleştirme bloğu):
  UPDATE profiles SET
    full_name = 'Silinmiş Kullanıcı',
    email = 'deleted_' || substr(p_user_id::text, 1, 8) || '@oyna.deleted',
    avatar_url = NULL,
    phone = NULL,
    is_banned = true,
    account_deletion_requested_at = NULL,
    updated_at = NOW()
  WHERE id = p_user_id;

  IF NOT p_anonymize THEN
    -- Hard-delete denemesi: mali/denetim satırı olan kullanıcıda FK
    -- (RESTRICT/NO ACTION) tetiklenir → satır anonim hâliyle kalır.
    BEGIN
      DELETE FROM profiles WHERE id = p_user_id;
      v_hard_deleted := true;
    EXCEPTION WHEN foreign_key_violation THEN
      v_hard_deleted := false;
    END;
  END IF;

  PERFORM log_admin_action('ACCOUNT_DELETE', 'user', p_user_id, v_email,
    NULL, jsonb_build_object(
      'anonymized', NOT v_hard_deleted,
      'hard_delete_requested', NOT p_anonymize,
      'hard_deleted', v_hard_deleted,
      'note', CASE WHEN NOT p_anonymize AND NOT v_hard_deleted
                   THEN 'HARD_DELETE_FALLBACK_ANONYMIZED' END
    ));
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Yetkiler: yalnız RBAC sarmalayıcısı (DEFINER sahibi üzerinden) çağırır.
REVOKE ALL ON FUNCTION public.admin_process_account_deletion__core(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_process_account_deletion__core(uuid, boolean) TO service_role;
