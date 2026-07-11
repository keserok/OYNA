-- ==============================================================================
-- OYNA: Supabase Veritabanı Güvenlik Sıkılaştırma Migration Betiği
-- ==============================================================================
-- Bu SQL betiği, Database Advisors ve linter raporlarındaki tüm kritik 
-- ve yüksek öncelikli uyarıları idempotent ve kesin bir şekilde çözer.
-- ==============================================================================

-- 1) profiles_public View Güvenliği (SECURITY INVOKER)
-- Eğer view SECURITY DEFINER ise sorgulayanın değil, oluşturanın yetkilerini taşır.
DO $$
BEGIN
    -- profiles_public view'unun olup olmadığını kontrol et ve security_invoker yap
    IF EXISTS (SELECT 1 FROM pg_views WHERE viewname = 'profiles_public' AND schemaname = 'public') THEN
        ALTER VIEW public.profiles_public SET (security_invoker = true);
    END IF;
END $$;


-- 2) player_ratings Tablosu RLS Politikaları Sıkılaştırma
ALTER TABLE public.player_ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "player_ratings_select" ON public.player_ratings;
DROP POLICY IF EXISTS "player_ratings_select_secure" ON public.player_ratings;
CREATE POLICY "player_ratings_select_secure" ON public.player_ratings
  FOR SELECT TO authenticated USING (true); -- Sadece giriş yapanlar okuyabilir

DROP POLICY IF EXISTS "player_ratings_insert" ON public.player_ratings;
DROP POLICY IF EXISTS "player_ratings_insert_secure" ON public.player_ratings;
CREATE POLICY "player_ratings_insert_secure" ON public.player_ratings
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = rater_id); -- Sadece kendisi adına puan verebilir

DROP POLICY IF EXISTS "player_ratings_no_update" ON public.player_ratings;
DROP POLICY IF EXISTS "player_ratings_no_update_secure" ON public.player_ratings;
CREATE POLICY "player_ratings_no_update_secure" ON public.player_ratings
  FOR UPDATE USING (false); -- Puanlar sonradan değiştirilemez

DROP POLICY IF EXISTS "player_ratings_no_delete" ON public.player_ratings;
CREATE POLICY "player_ratings_no_delete" ON public.player_ratings
  FOR DELETE USING (false); -- Puanlar sonradan silinemez


-- 3) wallet_transactions Tablosu RLS Politikaları Sıkılaştırma
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wallet_select_own" ON public.wallet_transactions;
DROP POLICY IF EXISTS "wallet_select_own_secure" ON public.wallet_transactions;
DROP POLICY IF EXISTS "Kullanıcılar kendi işlemlerini görebilir" ON public.wallet_transactions;
CREATE POLICY "wallet_select_own_secure" ON public.wallet_transactions
  FOR SELECT TO authenticated USING (auth.uid() = user_id); -- Yalnızca kendi işlemlerini görebilir

DROP POLICY IF EXISTS "wallet_no_direct_insert" ON public.wallet_transactions;
DROP POLICY IF EXISTS "wallet_no_direct_insert_secure" ON public.wallet_transactions;
DROP POLICY IF EXISTS "Sistem işlem ekleyebilir" ON public.wallet_transactions;
CREATE POLICY "wallet_no_direct_insert_secure" ON public.wallet_transactions
  FOR INSERT WITH CHECK (false); -- İstemci doğrudan para/işlem ekleyemez (RPC veya trigger kullanmalı)

DROP POLICY IF EXISTS "wallet_no_direct_update" ON public.wallet_transactions;
CREATE POLICY "wallet_no_direct_update" ON public.wallet_transactions
  FOR UPDATE USING (false); -- İşlemler güncellenemez

DROP POLICY IF EXISTS "wallet_no_direct_delete" ON public.wallet_transactions;
CREATE POLICY "wallet_no_direct_delete" ON public.wallet_transactions
  FOR DELETE USING (false); -- İşlemler silinemez


-- 4) audit_logs Tablosu RLS Sıkılaştırma (Yalnızca Admin Okuyabilir)
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Admins see all audit logs" ON public.audit_logs;
CREATE POLICY "Admins see all audit logs" ON public.audit_logs
  FOR SELECT TO authenticated USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'ADMIN'
  );


-- 5) friendships Tablosu RLS Sıkılaştırma (Yalnızca Taraf Kullanıcılar Görebilir)
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Friendships are viewable by everyone" ON public.friendships;
DROP POLICY IF EXISTS "Users view own friendships" ON public.friendships;
CREATE POLICY "Users view own friendships" ON public.friendships
  FOR SELECT TO authenticated USING (
    auth.uid() = user_id1 OR auth.uid() = user_id2
  );


-- 6) SECURITY DEFINER Fonksiyonların anon ve public İzinlerinin Kaldırılması (Kritik Yetki Azaltımı)
-- Bu RPC'ler süper yetkilerle çalıştığından anonim veya giriş yapmamış kişilerin erişimi engellenmelidir.

DO $$
DECLARE
    func_record RECORD;
BEGIN
    -- process_match_payment
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'process_match_payment') THEN
        REVOKE EXECUTE ON FUNCTION public.process_match_payment(uuid, uuid, numeric) FROM anon, public;
        ALTER FUNCTION public.process_match_payment(uuid, uuid, numeric) SET search_path = public, pg_temp;
    END IF;

    -- join_match_slot
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'join_match_slot') THEN
        REVOKE EXECUTE ON FUNCTION public.join_match_slot(uuid, uuid, varchar, varchar) FROM anon, public;
        ALTER FUNCTION public.join_match_slot(uuid, uuid, varchar, varchar) SET search_path = public, pg_temp;
    END IF;

    -- send_match_invite
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'send_match_invite') THEN
        REVOKE EXECUTE ON FUNCTION public.send_match_invite(uuid, uuid) FROM anon, public;
        ALTER FUNCTION public.send_match_invite(uuid, uuid) SET search_path = public, pg_temp;
        GRANT EXECUTE ON FUNCTION public.send_match_invite(uuid, uuid) TO authenticated;
    END IF;

    -- update_player_diamond
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_player_diamond') THEN
        REVOKE EXECUTE ON FUNCTION public.update_player_diamond(uuid, integer) FROM anon, public;
        ALTER FUNCTION public.update_player_diamond(uuid, integer) SET search_path = public, pg_temp;
    END IF;

    -- update_user_skill_rating
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_user_skill_rating') THEN
        REVOKE EXECUTE ON FUNCTION public.update_user_skill_rating() FROM anon, public;
        ALTER FUNCTION public.update_user_skill_rating() SET search_path = public, pg_temp;
    END IF;

    -- notify_match_joined
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'notify_match_joined') THEN
        REVOKE EXECUTE ON FUNCTION public.notify_match_joined() FROM anon, public;
        ALTER FUNCTION public.notify_match_joined() SET search_path = public, pg_temp;
    END IF;

    -- notify_match_cancelled
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'notify_match_cancelled') THEN
        REVOKE EXECUTE ON FUNCTION public.notify_match_cancelled() FROM anon, public;
        ALTER FUNCTION public.notify_match_cancelled() SET search_path = public, pg_temp;
    END IF;

    -- notify_ref_status_change
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'notify_ref_status_change') THEN
        REVOKE EXECUTE ON FUNCTION public.notify_ref_status_change() FROM anon, public;
        ALTER FUNCTION public.notify_ref_status_change() SET search_path = public, pg_temp;
    END IF;

    -- notify_send_push_webhook
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'notify_send_push_webhook') THEN
        REVOKE EXECUTE ON FUNCTION public.notify_send_push_webhook() FROM anon, public;
        ALTER FUNCTION public.notify_send_push_webhook() SET search_path = public, pg_temp;
    END IF;
END $$;
