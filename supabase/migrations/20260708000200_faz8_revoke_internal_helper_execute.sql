-- ============================================================
-- FAZ 8 — İç yardımcı (SECURITY DEFINER) fonksiyonların REST yüzeyini kapat
--
-- Tespit: Supabase advisor 176x "authenticated_security_definer_function_executable".
-- '_' önekli iç predikatlar (owner=postgres, RLS bypass) /rest/v1/rpc/<ad> ile
-- doğrudan çağrılabiliyor → herhangi iki kullanıcı için arkadaşlık/blok durumu,
-- maç katılımcı id listesi, sağlayıcı çakışması vb. sızdırılabilir.
--
-- ÖNEMLİ — kırılmazlık doğrulaması (canlı DB'de yapıldı):
--   * Aşağıdaki 10 fonksiyonun HİÇBİRİ bir RLS policy ifadesinde geçmiyor
--     (pg_policy taraması), bu yüzden authenticated'tan EXECUTE almak RLS'i bozmaz.
--   * Hiçbiri istemci kodunda supabase.rpc('_...') ile çağrılmıyor (grep ile teyit).
--   * Hepsi yalnızca DİĞER SECURITY DEFINER fonksiyonların içinden (owner=postgres
--     bağlamında) çağrılır; o çağrılarda EXECUTE owner'a göre denetlenir → çalışmaya devam eder.
--   * '_is_team_member' BİLEREK hariç tutuldu: bir RLS policy'sinde kullanılıyor,
--     EXECUTE alınırsa policy değerlendirmesi 'permission denied' verir.
--   * Para/skor yazan _finalize_team_match_score, _capture_services_on_confirm,
--     _void_*, _psp_fee zaten authenticated'a kapalı (auth_exec=false) — dokunulmadı.
-- ============================================================

REVOKE EXECUTE ON FUNCTION public._are_friends(uuid, uuid)                                   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._in_quiet_hours(uuid)                                      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._is_blocked_between(uuid, uuid)                            FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._is_team_admin(uuid, uuid)                                 FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._match_both_sides_present(uuid)                            FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._match_participant_ids(uuid)                               FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._provider_has_conflict(uuid, timestamptz, uuid)           FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._recompute_provider_rating(uuid, text)                     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._release_service_payout(uuid, uuid)                        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._sync_profile_communities(uuid)                            FROM PUBLIC, anon, authenticated;

-- Gelecekte oluşturulacak fonksiyonların authenticated'a otomatik sızmaması için
-- varsayılan ayrıcalığı kapat (mevcut migration yalnız anon'u kapatıyordu).
-- DİKKAT: Bundan sonra eklenecek "gerçek" RPC'lere açıkça
--   GRANT EXECUTE ON FUNCTION public.<ad>(...) TO authenticated;
-- verilmelidir (kod tabanındaki mevcut RPC'ler zaten açık GRANT alıyor).
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM authenticated;
