-- ═══════════════════════════════════════════════════════════════════════════
-- KAPILAR · ADIM 1 — İÇ YARDIMCILAR DIŞARIYA KAPATILDI
-- ───────────────────────────────────────────────────────────────────────────
-- SORUN: PostgreSQL'de bir fonksiyon yazıldığında, aksi söylenmedikçe onu
-- HERKES çağırabilir (varsayılan yetki PUBLIC'tir). Bu yüzden yalnız sunucu
-- içinden çağrılmak için yazılmış `_` önekli yardımcılar da internete açıktı:
-- giriş yapmış herhangi bir kullanıcı bunları doğrudan çağırabiliyordu.
--
-- NE YAPIYOR: Bu 20 yardımcının anon (giriş yapmamış) ve authenticated (giriş
-- yapmış) rollerinden çağrılma yetkisini alır.
--
-- NEDEN GÜVENLİ (üçü birden doğrulandı):
--   1. Uygulama kodunda bu adlarla `rpc(...)` çağrısı YOK (yalnız yorum satırı).
--   2. Erişim kurallarının (RLS) içinde geçmiyorlar — geçselerdi ilgili tablo
--      tamamen okunamaz hâle gelirdi. Bu risk canlıda deneyle ölçüldü:
--      `_is_team_member` yetkisi alındığında `team_members` tablosu
--      "42501 permission denied" verdi. O yüzden RLS'te geçen 14 fonksiyona
--      HİÇ dokunulmuyor.
--   3. Çağıran fonksiyonların hepsi SECURITY DEFINER — yani gövdeleri
--      fonksiyon sahibinin (postgres) yetkisiyle çalışır; sahip yetkisini
--      REVOKE ile kaybetmez. Sunucu içinden çağrılar aynen sürer.
--   Ayrıca: `service_role` (uç fonksiyonlar) ve `postgres` (gece işleri)
--   yetkilerini AYRI AYRI tutar; REVOKE ... FROM PUBLIC onları etkilemez.
--
-- ── GERİ ALMA (tek komut, kopyala-yapıştır) ────────────────────────────────
--   GRANT EXECUTE ON FUNCTION
--     public._admin_patch_slot(jsonb,text,jsonb),
--     public._are_friends(uuid,uuid),
--     public._assert_account_old_enough_for_cashout(uuid),
--     public._eval_window_open(uuid),
--     public._gk_side_taken(uuid,text),
--     public._in_quiet_hours(uuid),
--     public._is_blocked_between(uuid,uuid),
--     public._markup_tutari(numeric,numeric,numeric),
--     public._match_both_sides_present(uuid),
--     public._match_participant_ids(uuid),
--     public._normalize_person_name(text),
--     public._notification_pref_enabled(uuid,text),
--     public._owner_screen_demo_authz(uuid),
--     public._provider_has_conflict(uuid,timestamptz,uuid),
--     public._provider_serves_schedule(jsonb,timestamptz),
--     public._provider_serves_zone(jsonb,text),
--     public._req_ip(), public._req_ua(),
--     public._social_config_int(text,integer),
--     public._tc_hash(text,uuid)
--   TO anon, authenticated;
-- ═══════════════════════════════════════════════════════════════════════════

REVOKE ALL ON FUNCTION public._admin_patch_slot(jsonb,text,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._are_friends(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._assert_account_old_enough_for_cashout(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._eval_window_open(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._gk_side_taken(uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._in_quiet_hours(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._is_blocked_between(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._markup_tutari(numeric,numeric,numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._match_both_sides_present(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._match_participant_ids(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._normalize_person_name(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._notification_pref_enabled(uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._owner_screen_demo_authz(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._provider_has_conflict(uuid,timestamptz,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._provider_serves_schedule(jsonb,timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._provider_serves_zone(jsonb,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._req_ip() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._req_ua() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._social_config_int(text,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._tc_hash(text,uuid) FROM PUBLIC, anon, authenticated;

-- ── DOĞRULAMA ─────────────────────────────────────────────────────────────
-- Kapandı mı, açık kalması gerekenler açık mı, tablolar hâlâ okunuyor mu?
DO $dogrulama$
DECLARE
  v_acik_kalan   int;
  v_service_role int;
  v_rls_bozuldu  int;
  v_sayim        int;
BEGIN
  -- 1) Yirmisi de kapanmış olmalı.
  SELECT count(*) INTO v_acik_kalan
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('_admin_patch_slot','_are_friends','_assert_account_old_enough_for_cashout',
      '_eval_window_open','_gk_side_taken','_in_quiet_hours','_is_blocked_between','_markup_tutari',
      '_match_both_sides_present','_match_participant_ids','_normalize_person_name',
      '_notification_pref_enabled','_owner_screen_demo_authz','_provider_has_conflict',
      '_provider_serves_schedule','_provider_serves_zone','_req_ip','_req_ua',
      '_social_config_int','_tc_hash')
    AND (has_function_privilege('anon', p.oid, 'EXECUTE')
      OR has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  IF v_acik_kalan > 0 THEN
    RAISE EXCEPTION 'DOGRULAMA: % yardimci hala disariya acik.', v_acik_kalan;
  END IF;

  -- 2) Uç fonksiyonların (service_role) yetkisi KAYBOLMAMIŞ olmalı.
  SELECT count(*) INTO v_service_role
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname LIKE '\_%'
    AND NOT has_function_privilege('service_role', p.oid, 'EXECUTE');
  IF v_service_role > 0 THEN
    RAISE EXCEPTION 'DOGRULAMA: % yardimcida service_role yetkisi de kaybolmus.', v_service_role;
  END IF;

  -- 3) Erişim kurallarında kullanılan fonksiyonlara DOKUNULMAMIŞ olmalı.
  --    (Biri kapanırsa o tablo tamamen okunamaz hale gelir.)
  SELECT count(*) INTO v_rls_bozuldu
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('_is_team_member','_is_team_admin','_is_match_participant','_hire_side_for',
                      'is_admin','is_platform_admin','is_super_admin','can_manage_pitch',
                      'can_staff_pitch','can_manage_pitch_content','get_config_bool','has_role',
                      'profile_privileges_unchanged','try_uuid')
    AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE');
  IF v_rls_bozuldu > 0 THEN
    RAISE EXCEPTION 'DOGRULAMA: erisim kurallarinda kullanilan % fonksiyon kapanmis.', v_rls_bozuldu;
  END IF;

  -- 4) Kuralları bu fonksiyonlara dayanan tablolar hâlâ okunabiliyor mu?
  SELECT count(*) INTO v_sayim FROM public.team_members;
  SELECT count(*) INTO v_sayim FROM public.matches;
  SELECT count(*) INTO v_sayim FROM public.pitches;

  RAISE NOTICE 'Adim 1: 20 ic yardimci disariya kapatildi.';
END
$dogrulama$;
