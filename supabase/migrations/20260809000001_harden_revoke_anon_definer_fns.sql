-- ════════════════════════════════════════════════════════════════════════════
-- [SG-1] SECURITY DEFINER fonksiyonlarında anon yetki sertleştirmesi
-- ────────────────────────────────────────────────────────────────────────────
-- SORUN: Supabase security advisor'ı 35 SECURITY DEFINER fonksiyonun `anon`
--   rolüyle çalıştırılabildiğini raporladı (varsayılan EXECUTE grant sızıntısı).
--   En kritiği: _refund_service_captain(service_requests) — içinde HİÇBİR auth
--   kontrolü yok ve doğrudan wallet_transactions'a REFUND_CREDIT yazıyor.
--   PostgREST'in composite argümanlı fonksiyonu dışarı açıp açmadığına
--   güvenilmez; tek savunma hattı EXECUTE yetkisi olmalı.
--
-- SINIFLANDIRMA (her fonksiyon istemci çağrıları, trigger tanımları, RLS
-- politika kullanımı ve auth korumaları denetlenerek 3 gruba ayrıldı):
--
--   GRUP 1 — anon'da KALIR (bu dosyada YOK, dokunulmaz):
--     get_showcase_availability(date)  → misafir modu saha vitrini (AuthScreen)
--     is_maintenance_active()          → login-öncesi bakım kapısı
--     is_registration_open()           → login-öncesi kayıt kapısı
--     (Üçü de 20260806000001'de bilinçli GRANT ... TO anon almıştı.)
--
--   GRUP 2 — saf dahili/trigger: PUBLIC + anon + authenticated'dan çekilir.
--     İstemciden asla çağrılmıyor, RLS politikalarında geçmiyor. Diğer
--     SECURITY DEFINER fonksiyonların içinden yapılan çağrılar fonksiyon
--     SAHİBİNİN yetkisiyle koştuğu için kırılmaz; trigger'lar için EXECUTE
--     denetimi DML anında yapılmaz (20260708000011_faz10 deseniyle aynı).
--
--   GRUP 3 — authenticated istemci RPC'leri + RLS yardımcıları: yalnız
--     PUBLIC + anon'dan çekilir, authenticated AÇIKÇA korunur.
--     ⚠️ can_manage_pitch / can_staff_pitch / is_pitch_owner ~15 tablonun RLS
--     USING/WITH CHECK ifadelerinde doğrudan kullanılıyor
--     (20260727000003_staff2a_rls_matrix.sql). RLS ifadeleri SORGULAYAN rolün
--     EXECUTE yetkisiyle denetlendiğinden bunları authenticated'dan çekmek tüm
--     tesis CRUD'unu kırar — bu yüzden Grup 3'teler, Grup 2'de DEĞİL.
--
-- ROLLBACK (gerekirse):
--   Grup 2: GRANT EXECUTE ON FUNCTION public.<fn>(<args>) TO authenticated;
--   Grup 3: GRANT EXECUTE ON FUNCTION public.<fn>(<args>) TO anon;
-- ════════════════════════════════════════════════════════════════════════════

-- ── GRUP 2: saf dahili yardımcılar + trigger fonksiyonları ──────────────────
-- Para yazan korumasız yardımcı (bu migration'ın ana gerekçesi):
REVOKE ALL ON FUNCTION public._refund_service_captain(public.service_requests) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._refund_service_captain(public.service_requests) TO service_role;

-- Yalnız diğer DEFINER fonksiyonların içinden çağrılan erişim yardımcısı:
REVOKE ALL ON FUNCTION public.pitch_access_level(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pitch_access_level(uuid) TO service_role;

-- Trigger fonksiyonları (doğrudan EXECUTE gereksinimi yok):
REVOKE ALL ON FUNCTION public.pitches_guard_owner_cols() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pitches_guard_owner_cols() TO service_role;

REVOKE ALL ON FUNCTION public.protect_pitch_admin_flags() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.protect_pitch_admin_flags() TO service_role;

REVOKE ALL ON FUNCTION public.recompute_debtor_balance() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_debtor_balance() TO service_role;

REVOKE ALL ON FUNCTION public.tg_payment_intents_minor_gate() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tg_payment_intents_minor_gate() TO service_role;

-- ── GRUP 3a: RLS politika yardımcıları — authenticated KALMAK ZORUNDA ───────
REVOKE ALL ON FUNCTION public.can_manage_pitch(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_pitch(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.can_staff_pitch(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_staff_pitch(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_pitch_owner(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_pitch_owner(uuid) TO authenticated, service_role;

-- ── GRUP 3b: authenticated istemci RPC'leri (hepsinde iç auth guard var) ────
REVOKE ALL ON FUNCTION public.booking_to_debtor(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.booking_to_debtor(uuid, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.debtor_create(uuid, text, text, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.debtor_create(uuid, text, text, numeric, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.debtor_add_payment(uuid, numeric, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.debtor_add_payment(uuid, numeric, text, text, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.fund_service_request(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fund_service_request(uuid, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.respond_service_request(uuid, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_service_request(uuid, boolean, boolean) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.provider_dispute_no_show(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.provider_dispute_no_show(uuid, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_available_provider_ids(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_available_provider_ids(text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_friend_player_card(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_friend_player_card(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_my_staff_pitches() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_staff_pitches() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_pitch_finance_summary(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_pitch_finance_summary(uuid, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_pitch_team(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_pitch_team(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.staff_accept_invite(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_accept_invite(text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.staff_approve_booking(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_approve_booking(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.staff_delete_roster(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_delete_roster(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.staff_invite(uuid, uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_invite(uuid, uuid, text, text, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.staff_record_payment(uuid, numeric, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_record_payment(uuid, numeric, text, text, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.staff_regenerate_invite(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_regenerate_invite(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.staff_reject_pending(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_reject_pending(uuid, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.staff_remove(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_remove(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.staff_set_duty(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_set_duty(uuid, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.staff_set_role(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_set_role(uuid, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.staff_toggle_task(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_toggle_task(uuid, boolean) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.staff_upsert_roster(uuid, uuid, text, text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_upsert_roster(uuid, uuid, text, text, text, integer) TO authenticated, service_role;
