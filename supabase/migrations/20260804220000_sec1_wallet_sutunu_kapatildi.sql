-- ════════════════════════════════════════════════════════════════════════════
-- [SEC-1 / K-17.1] `profiles.wallet` sütunu kullanıcı yazımına kapatıldı
-- ────────────────────────────────────────────────────────────────────────────
-- BULGU (Güvenlik turu, canlıda kanıtlandı): Sıradan bir üye kendi profilinde
--     UPDATE profiles SET wallet = wallet + 999999 WHERE id = <kendi id>
-- yazabiliyordu. Test edildi, çalıştı, sonra geri alındı.
--
-- NEDEN OLUYORDU: Hassas sütunları koruyan iki tetikleyici var —
-- `protect_profile_columns` ve `protect_profile_sensitive_fields`. İkisi de
-- `wallet_balance`'ı koruyor ama **`wallet`** ikisinin de listesinde yok.
-- Yetki tarafı da açıktı.
--
-- BUGÜN PARA ÇALINAMIYORDU: sütun 33 profilin 33'ünde de 0, hiçbir kod onu
-- okumuyor, gerçek bakiye `wallet_balance` ve harcama defteri kontrol ediyor.
-- Yani bu bir **kapsam hatası**, aktif bir açık değil.
--
-- NEDEN YİNE DE ŞİMDİ KAPATIYORUZ: Uygulama bir süre rafa kaldırılıyor.
-- Kimsenin bakmadığı bir dönemde, adı "wallet" olan ve kullanıcının
-- yazabildiği bir sütun bırakmak doğru değil. Düzeltme tek satır, riski yok.
--
-- KURUCU KARARI K-17.1: yetki geri alınır + korumaya eklenir; sütun SİLİNMEZ
-- (geri dönülebilir seçenek tercih edildi).
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Katman: yetki ────────────────────────────────────────────────────────
REVOKE UPDATE (wallet) ON public.profiles FROM anon, authenticated;

-- ── 2. Katman: tetikleyici ──────────────────────────────────────────────────
-- `protect_profile_columns` zaten sessizce eski değere döndürme yöntemini
-- kullanıyor; `wallet` de aynı listeye ekleniyor. Böylece yetki bir gün
-- yanlışlıkla geri verilse bile sütun korunmuş kalır.
CREATE OR REPLACE FUNCTION public.protect_profile_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF (SELECT auth.uid()) IS NULL
     OR auth.role() = 'service_role'
     OR public.is_admin()
     OR current_setting('app.bypass_role_protection', true) = 'true' THEN
    RETURN NEW;
  END IF;
  NEW.role           := OLD.role;
  NEW.roles          := OLD.roles;
  NEW.is_banned      := OLD.is_banned;
  NEW.ban_expires_at := OLD.ban_expires_at;
  NEW.is_verified    := OLD.is_verified;
  NEW.wallet         := OLD.wallet;   -- SEC-1: eksik olan satir
  RETURN NEW;
END;
$function$;

-- ── Doğrulama: kapanmadıysa migration burada durur ──────────────────────────
DO $dogrula$
BEGIN
  IF has_column_privilege('authenticated', 'public.profiles', 'wallet', 'UPDATE')
     OR has_column_privilege('anon', 'public.profiles', 'wallet', 'UPDATE') THEN
    RAISE EXCEPTION 'SEC-1 kapanmadi: profiles.wallet hala yazilabilir';
  END IF;

  IF pg_get_functiondef('public.protect_profile_columns()'::regprocedure) !~ 'NEW\.wallet' THEN
    RAISE EXCEPTION 'SEC-1 kapanmadi: koruma tetikleyicisinde wallet satiri yok';
  END IF;
END
$dogrula$;

-- ════════════════════════════════════════════════════════════════════════════
-- GERİ ALMA:
--   GRANT UPDATE (wallet) ON public.profiles TO authenticated;
--   (ve tetikleyiciden NEW.wallet := OLD.wallet satırını çıkarın)
-- ════════════════════════════════════════════════════════════════════════════
