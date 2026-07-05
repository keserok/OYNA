-- Faz 4 RLS güvenlik sıkılaştırma
-- 1) admin_fetch_matches anon erişimini kaldır (SECURITY DEFINER + anon = kritik açık)
REVOKE EXECUTE ON FUNCTION public.admin_fetch_matches FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_fetch_matches FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_fetch_matches TO authenticated;

-- 2) cube/earthdistance/btree_gist extension'larını extensions schema'ya taşımak
--    mevcut objeleri bozabileceğinden sadece log bırakıyoruz; breaking change riski var.
--    Taşıma için: supabase dashboard > extensions > move (manuel).

COMMENT ON FUNCTION public.admin_fetch_matches IS
  'Admin RPC — yalnızca authenticated kullanıcılar. anon erişimi kaldırıldı (faz4_rls_security_hardening).';
