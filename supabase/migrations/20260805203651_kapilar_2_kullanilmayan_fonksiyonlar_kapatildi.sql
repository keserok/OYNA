-- ═══════════════════════════════════════════════════════════════════════════
-- KAPILAR · ADIM 2 — HİÇ ÇAĞRILMAYAN 47 FONKSİYON DIŞARIYA KAPATILDI
-- ───────────────────────────────────────────────────────────────────────────
-- Bu 47 fonksiyon "giriş yapmış herkes çağırabilir" durumundaydı ama:
--   • uygulama kodunda hiçbir yerden çağrılmıyor,
--   • erişim kurallarının (RLS) içinde geçmiyor,
--   • görünümlerde (view), kolon varsayılanlarında, CHECK kurallarında ve
--     indeks ifadelerinde geçmiyor,
--   • kullanıcıya açık SECURITY INVOKER bir fonksiyonun gövdesinde geçmiyor.
-- Yani dışarıdan çağrılabilir olmalarının hiçbir karşılığı yoktu.
--
-- İÇLERİNDE ÖZELLİKLE TEHLİKELİ OLANLAR:
--   • `join_public_match_slot` ve `player_buy_slots` — ikisi de artık var
--     olmayan bir iç fonksiyonu (`..._inner`) çağırıyor, yani ÇAĞRILIRSA HATA
--     VERİYOR. Buna rağmen kapıları açıktı. `join_public_match_slot` üstelik
--     `p_user_id` parametresi alıyor ve içinde "sen kimsin" kontrolü yok:
--     çalışır durumda olsaydı herhangi biri, başkasını, ücretsiz olarak bir
--     maçın kadrosuna yazabilirdi.
--   • `claim_owner_role` — kendine "tesis sahibi" rolü verme yolu. İçinde
--     gerçek tesis sahibi olma şartı var ama uygulamadan hiç çağrılmıyor;
--     açık durması gereksiz bir yetki yükseltme yüzeyiydi.
--   • `update_player_diamond`, `match_void_deposit`, `record_minor_consent`,
--     `create_match_preauth` — para ve veli onayı alanları.
--
-- SERVICE_ROLE ETKİLENMEZ: uç fonksiyonlar (`supabase/functions/*`) ayrı bir
-- anahtarla bağlanır; onun yetkisi ayrı yazılıdır ve REVOKE ... FROM PUBLIC
-- ile kaybolmaz. Gece işleri (pg_cron) `postgres` ile koşar; sahip yetkisini
-- zaten kaybetmez.
--
-- ── GERİ ALMA ──────────────────────────────────────────────────────────────
--   GRANT EXECUTE ON FUNCTION
--     public.admin_broadcast_notification__core(text,text,text,text,uuid),
--     public.admin_cancel_account_deletion__core(uuid),
--     public.admin_recompute_match_status(uuid), public.admin_set_match_image(uuid,text),
--     public.admin_set_player_card(uuid,boolean,text),
--     public.admin_set_player_card_data(uuid,jsonb,boolean),
--     public.admin_toggle_user_pro(uuid,boolean), public.assert_can_transact(uuid),
--     public.assert_payment_method_allowed(uuid,text), public.bildirim_gonderilsin_mi(uuid,text),
--     public.calculate_commission(numeric,text,uuid,text,numeric,numeric,numeric),
--     public.cancel_match_service_offers(uuid), public.cancel_subscription(uuid),
--     public.check_money_invariants(), public.claim_owner_role(),
--     public.compute_is_minor(date,text), public.create_match_preauth(uuid,numeric,text),
--     public.current_admin_role(), public.demo_isareti_mac(),
--     public.derive_pitch_working_hours(uuid), public.generate_oyna_id(text),
--     public.get_config(text), public.get_court_occupancy(uuid,date),
--     public.get_current_tariff_price(uuid,date,time,uuid),
--     public.get_pitch_slots(uuid,date,uuid), public.get_tactic_by_share_token(uuid),
--     public.hata_temizle_json(jsonb), public.is_feature_enabled(text),
--     public.is_finance_admin(), public.is_maintenance_active(), public.is_moderator(),
--     public.is_pitch_owner(uuid), public.is_registration_open(), public.is_user_minor(uuid),
--     public.is_valid_person_name(text,text), public.is_valid_tr_iban(text),
--     public.join_public_match_slot(uuid,text,uuid,boolean),
--     public.match_void_deposit(uuid,text), public.materialize_subscriptions(integer,uuid),
--     public.player_buy_slots(uuid,text[]),
--     public.record_minor_consent(uuid,text,text,text,text),
--     public.require_admin_role(text[]), public.require_admin_write(),
--     public.require_super_admin(), public.surum_kucuk_mu(text,text),
--     public.update_player_diamond(uuid,boolean,integer),
--     public.update_user_location(uuid,text)
--   TO authenticated;
-- ═══════════════════════════════════════════════════════════════════════════

REVOKE ALL ON FUNCTION public.admin_broadcast_notification__core(text,text,text,text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_cancel_account_deletion__core(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_recompute_match_status(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_set_match_image(uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_set_player_card(uuid,boolean,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_set_player_card_data(uuid,jsonb,boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_toggle_user_pro(uuid,boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_can_transact(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_payment_method_allowed(uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bildirim_gonderilsin_mi(uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.calculate_commission(numeric,text,uuid,text,numeric,numeric,numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_match_service_offers(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_subscription(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.check_money_invariants() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_owner_role() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.compute_is_minor(date,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_match_preauth(uuid,numeric,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.current_admin_role() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.demo_isareti_mac() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.derive_pitch_working_hours(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.generate_oyna_id(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_config(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_court_occupancy(uuid,date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_current_tariff_price(uuid,date,time without time zone,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_pitch_slots(uuid,date,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_tactic_by_share_token(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hata_temizle_json(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_feature_enabled(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_finance_admin() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_maintenance_active() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_moderator() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_pitch_owner(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_registration_open() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_user_minor(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_valid_person_name(text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_valid_tr_iban(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.join_public_match_slot(uuid,text,uuid,boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.match_void_deposit(uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.materialize_subscriptions(integer,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.player_buy_slots(uuid,text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_minor_consent(uuid,text,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.require_admin_role(text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.require_admin_write() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.require_super_admin() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.surum_kucuk_mu(text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_player_diamond(uuid,boolean,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_user_location(uuid,text) FROM PUBLIC, anon, authenticated;

DO $dogrulama$
DECLARE
  v_acik    int;
  v_kapi    jsonb;
  v_deneme  text;
BEGIN
  -- 1) Kırk yedisi de kapanmis olmali.
  SELECT count(*) INTO v_acik
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public'
    AND p.proname IN ('admin_broadcast_notification__core','admin_cancel_account_deletion__core',
      'admin_recompute_match_status','admin_set_match_image','admin_set_player_card',
      'admin_set_player_card_data','admin_toggle_user_pro','assert_can_transact',
      'assert_payment_method_allowed','bildirim_gonderilsin_mi','calculate_commission',
      'cancel_match_service_offers','cancel_subscription','check_money_invariants','claim_owner_role',
      'compute_is_minor','create_match_preauth','current_admin_role','demo_isareti_mac',
      'derive_pitch_working_hours','generate_oyna_id','get_config','get_court_occupancy',
      'get_current_tariff_price','get_pitch_slots','get_tactic_by_share_token','hata_temizle_json',
      'is_feature_enabled','is_finance_admin','is_maintenance_active','is_moderator','is_pitch_owner',
      'is_registration_open','is_user_minor','is_valid_person_name','is_valid_tr_iban',
      'join_public_match_slot','match_void_deposit','materialize_subscriptions','player_buy_slots',
      'record_minor_consent','require_admin_role','require_admin_write','require_super_admin',
      'surum_kucuk_mu','update_player_diamond','update_user_location')
    AND (has_function_privilege('anon', p.oid,'EXECUTE') OR has_function_privilege('authenticated', p.oid,'EXECUTE'));
  IF v_acik > 0 THEN
    RAISE EXCEPTION 'DOGRULAMA: % fonksiyon hala acik.', v_acik;
  END IF;

  -- 2) EN KRITIK: uygulama kapisi hala calisiyor mu? (icinden surum_kucuk_mu cagirir)
  SELECT public.uygulama_kapisi('3.0.0') INTO v_kapi;
  IF v_kapi IS NULL OR (v_kapi->>'bakim')::boolean IS DISTINCT FROM false
                    OR (v_kapi->>'zorunlu_guncelleme')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'DOGRULAMA: uygulama kapisi bozuldu -> %', v_kapi;
  END IF;

  -- 3) Gizlilik elegi (hata_temizle_json) SECURITY DEFINER icinden hala cagrilabiliyor mu?
  PERFORM public.hata_temizle_json('{"a":"deneme"}'::jsonb);

  -- 4) Kapanan bir fonksiyonu giris yapmis kullanici GERCEKTEN cagiramiyor mu?
  PERFORM set_config('role','authenticated',true);
  BEGIN
    PERFORM public.is_valid_tr_iban('TR000000000000000000000000');
    v_deneme := 'HALA CAGIRABILIYOR';
  EXCEPTION WHEN insufficient_privilege THEN
    v_deneme := 'kapali';
  END;
  PERFORM set_config('role','postgres',true);
  IF v_deneme <> 'kapali' THEN
    RAISE EXCEPTION 'DOGRULAMA: kapatilan fonksiyon hala cagrilabiliyor (%).', v_deneme;
  END IF;

  RAISE NOTICE 'Adim 2: 47 kullanilmayan fonksiyon kapatildi; uygulama kapisi ve gizlilik elegi calisiyor.';
END
$dogrulama$;
