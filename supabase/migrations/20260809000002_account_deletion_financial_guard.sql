-- ════════════════════════════════════════════════════════════════════════════
-- [SG-2] Hesap silme: hard-delete artık mali defteri silemez ve patlamaz
-- ────────────────────────────────────────────────────────────────────────────
-- SORUN: admin_process_account_deletion__core'un hard-delete yolu (p_anonymize
--   =false) `DELETE FROM auth.users` çalıştırıyor. profiles.id → auth.users
--   ON DELETE CASCADE olduğundan bu, profiles satırını ve oradan CASCADE ile
--   wallet_transactions + faturalama + KYC kayıtlarını siler. Fonksiyonun
--   hard-delete dalında exception handler YOK → mali defter geri dönüşsüz
--   yok olur; RESTRICT eklenince (SG-3) ise FK hatasıyla tüm işlem PATLAR.
--
-- ÇÖZÜM: Hard-delete artık BEGIN/EXCEPTION içinde denenir; herhangi bir
--   foreign_key_violation'da (SG-3 RESTRICT'leri veya mevcut NO ACTION FK'lar)
--   anonimleştirmeye düşer. Para/denetim geçmişi ASLA silinmez, admin akışı
--   hata fırlatmaz. SG-3 (FK RESTRICT) ile birlikte iki katmanlı savunma.
--
-- ⚠️ TABAN: Bu gövde, CANLI (production) __core tanımından türetildi
--   (convergence_rbac migration'ları sonrası, 2026-08 durumu). Mevcut TÜM
--   korumalar birebir korunur:
--     • is_platform_admin() yetki kapısı
--     • admin hesabı silinemez
--     • aktif saha rezervasyonu olan kullanıcı silinemez
--     • yaklaşan maçta blokaj/ödemesi olan kullanıcı silinemez
--     • anonymize yolunda auth.users da anonimleştirilir (best-effort)
--   Yalnız hard-delete dalına FK-güvenli fallback EKLENDİ; başka değişiklik yok.
--
-- NOT: 20260710000006_admin_rbac_wrappers.sql'in kurduğu RBAC sarmalayıcısına
--   (admin_process_account_deletion → require_admin_role → __core) DOKUNULMAZ.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_process_account_deletion__core(
  p_user_id uuid,
  p_anonymize boolean DEFAULT true
) RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_email        text;
  v_is_admin     boolean;
  v_hard_deleted boolean := false;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT email, (COALESCE(is_admin,false) OR role IN ('ADMIN','SUPER_ADMIN')) INTO v_email, v_is_admin
  FROM public.profiles WHERE id = p_user_id;
  IF v_email IS NULL THEN RAISE EXCEPTION 'Kullanıcı bulunamadı'; END IF;
  IF v_is_admin THEN RAISE EXCEPTION 'Admin hesabı silinemez. Önce yönetici yetkilerini kaldırın.'; END IF;

  -- Aktif saha rezervasyonu olan kullanıcı silinemez (mevcut koruma).
  IF EXISTS (SELECT 1 FROM public.pitch_bookings WHERE user_id = p_user_id AND status IN ('PENDING','CONFIRMED')
      AND (booking_date > CURRENT_DATE OR (booking_date = CURRENT_DATE AND end_time > CURRENT_TIME))) THEN
    RAISE EXCEPTION 'Kullanıcının aktif saha rezervasyonu var — silme reddedildi. Önce rezervasyon çözülmeli.';
  END IF;
  -- Yaklaşan maçta blokaj/ödemesi olan kullanıcı silinemez (mevcut koruma).
  IF EXISTS (SELECT 1 FROM public.payment_intents pi JOIN public.matches m ON m.id = pi.match_id
      WHERE pi.user_id = p_user_id AND pi.status IN ('PENDING','BLOCKED','CAPTURED')
      AND m.status IN ('GATHERING','CONFIRMED','PLAYING','LIVE')) THEN
    RAISE EXCEPTION 'Kullanıcının yaklaşan maçta blokaj/ödemesi var — silme reddedildi.';
  END IF;

  IF NOT p_anonymize THEN
    -- HARD DELETE denemesi. auth.users silinince profiles CASCADE ile gider;
    -- profiles ise mali defter FK'ları (wallet_transactions vb. RESTRICT —
    -- 20260809000003; ayrıca NO ACTION olan payment_intents/payout_requests)
    -- tarafından tutulur → foreign_key_violation. O durumda anonimleştirmeye
    -- düş: para/denetim geçmişi ASLA silinmez, akış patlamaz.
    BEGIN
      DELETE FROM auth.users WHERE id = p_user_id;
      DELETE FROM public.profiles WHERE id = p_user_id;
      v_hard_deleted := true;
    EXCEPTION WHEN foreign_key_violation THEN
      v_hard_deleted := false;
    END;
  END IF;

  -- Anonimleştirme: anonymize istendiğinde VEYA hard-delete FK'ya takıldığında.
  IF NOT v_hard_deleted THEN
    UPDATE public.profiles SET
      full_name='Silinmiş Kullanıcı', name='Silinmiş Kullanıcı',
      email='deleted_'||substr(p_user_id::text,1,8)||'@oyna.deleted',
      phone=NULL, avatar_url=NULL, is_banned=true,
      account_deletion_requested_at=NULL, updated_at=NOW()
    WHERE id=p_user_id;
    BEGIN
      UPDATE auth.users SET
        email='deleted_'||substr(p_user_id::text,1,8)||'@oyna.deleted',
        phone=NULL, raw_user_meta_data='{}'::jsonb,
        banned_until='2999-01-01'::timestamptz, updated_at=NOW()
      WHERE id=p_user_id;
    EXCEPTION WHEN others THEN
      RAISE WARNING 'admin_process_account_deletion: auth.users anonimleştirilemedi (%): %', p_user_id, SQLERRM;
    END;
  END IF;

  PERFORM public.log_admin_action('ACCOUNT_DELETE','user',p_user_id,v_email,NULL,
    jsonb_build_object(
      'anonymized',            NOT v_hard_deleted,
      'hard_delete_requested', NOT p_anonymize,
      'hard_deleted',          v_hard_deleted,
      'note', CASE WHEN (NOT p_anonymize) AND (NOT v_hard_deleted)
                   THEN 'HARD_DELETE_FALLBACK_ANONYMIZED' END
    ));
  RETURN true;
END; $function$;

-- Yetkiler: yalnız RBAC sarmalayıcısı (DEFINER sahibi üzerinden) çağırır.
REVOKE ALL ON FUNCTION public.admin_process_account_deletion__core(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_process_account_deletion__core(uuid, boolean) TO service_role;
