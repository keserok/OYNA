-- ═══════════════════════════════════════════════════════════════════════════
-- OYNA — KAPSAMLI CANLI TEST TEMİZLİĞİ (tohum.sql'in tersi)
--
-- CERRAHİ SİLME: yalnız 'cafe7e57' önekli kimlikler ve onlardan türeyen
-- satırlar silinir. Gerçek veriye ve ESKİ demo verisine (oyuncuNN@,
-- d0e51a00/d0e51b00, a000000N sahaları) DOKUNULMAZ.
--
-- Sıra: türev satırlar → tesis → kimlik. FK hatası kalmasın diye en geniş
-- zincirden daralır; çoğu FK zaten CASCADE ama buna GÜVENİLMEZ (7.6).
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;

CREATE TEMP TABLE _cafe_users ON COMMIT DROP AS
  SELECT id FROM auth.users WHERE id::text LIKE 'cafe7e57-%';
CREATE TEMP TABLE _cafe_pitches ON COMMIT DROP AS
  SELECT id FROM public.pitches WHERE id::text LIKE 'cafe7e57-%';
CREATE TEMP TABLE _cafe_matches ON COMMIT DROP AS
  SELECT id FROM public.matches
  WHERE captain_id IN (SELECT id FROM _cafe_users)
     OR "creatorId" IN (SELECT id FROM _cafe_users)
     OR pitch_id   IN (SELECT id FROM _cafe_pitches);
CREATE TEMP TABLE _cafe_intents ON COMMIT DROP AS
  SELECT id FROM public.payment_intents
  WHERE user_id IN (SELECT id FROM _cafe_users)
     OR match_id IN (SELECT id FROM _cafe_matches);

-- ── Maç zinciri ────────────────────────────────────────────────────────────
DELETE FROM public.match_service_offers  WHERE match_id IN (SELECT id FROM _cafe_matches);
DELETE FROM public.service_requests     WHERE match_id IN (SELECT id FROM _cafe_matches)
                                            OR requester_id IN (SELECT id FROM _cafe_users);
DELETE FROM public.match_participants   WHERE match_id IN (SELECT id FROM _cafe_matches)
                                            OR user_id IN (SELECT id FROM _cafe_users);
DELETE FROM public.match_registrations  WHERE match_id IN (SELECT id FROM _cafe_matches)
                                            OR user_id IN (SELECT id FROM _cafe_users);
DELETE FROM public.match_private_codes  WHERE match_id IN (SELECT id FROM _cafe_matches);
DELETE FROM public.match_list_invites   WHERE match_id IN (SELECT id FROM _cafe_matches);
DELETE FROM public.match_events         WHERE match_id IN (SELECT id FROM _cafe_matches);
DELETE FROM public.match_notes          WHERE match_id IN (SELECT id FROM _cafe_matches);
DELETE FROM public.match_disputes       WHERE match_id IN (SELECT id FROM _cafe_matches);

-- ── Para zinciri (kural 7.10: demo parası gerçek defterde iz bırakmaz) ────
DELETE FROM public.card_refund_queue    WHERE intent_id IN (SELECT id FROM _cafe_intents)
                                            OR user_id IN (SELECT id FROM _cafe_users);
DELETE FROM public.wallet_transactions  WHERE user_id IN (SELECT id FROM _cafe_users);
DELETE FROM public.booking_payments     WHERE booking_id IN (
  SELECT id FROM public.pitch_bookings WHERE pitch_id IN (SELECT id FROM _cafe_pitches)
     OR user_id IN (SELECT id FROM _cafe_users));
DELETE FROM public.pitch_bookings       WHERE pitch_id IN (SELECT id FROM _cafe_pitches)
                                            OR user_id IN (SELECT id FROM _cafe_users)
                                            OR match_id IN (SELECT id FROM _cafe_matches);
DELETE FROM public.matches              WHERE id IN (SELECT id FROM _cafe_matches);
DELETE FROM public.payment_intents      WHERE id IN (SELECT id FROM _cafe_intents);

-- ── Sosyal / bildirim türevleri ───────────────────────────────────────────
DELETE FROM public.notifications  WHERE user_id IN (SELECT id FROM _cafe_users);
DELETE FROM public.messages       WHERE sender_id IN (SELECT id FROM _cafe_users);
DELETE FROM public.friendships    WHERE user_id IN (SELECT id FROM _cafe_users)
                                      OR friend_id IN (SELECT id FROM _cafe_users);
DELETE FROM public.team_members   WHERE user_id IN (SELECT id FROM _cafe_users);
DELETE FROM public.teams          WHERE captain_id IN (SELECT id FROM _cafe_users);
DELETE FROM public.pitch_favorites WHERE user_id IN (SELECT id FROM _cafe_users);
DELETE FROM public.pitch_ratings   WHERE user_id IN (SELECT id FROM _cafe_users)
                                       OR pitch_id IN (SELECT id FROM _cafe_pitches);
DELETE FROM public.pitch_customers WHERE pitch_id IN (SELECT id FROM _cafe_pitches);
DELETE FROM public.pitch_views     WHERE pitch_id IN (SELECT id FROM _cafe_pitches);
DELETE FROM public.user_saved_cards WHERE user_id IN (SELECT id FROM _cafe_users);

-- ── Tesis ──────────────────────────────────────────────────────────────────
DELETE FROM public.pitch_slot_holds WHERE pitch_id IN (SELECT id FROM _cafe_pitches);
DELETE FROM public.pitch_availability_exceptions WHERE pitch_id IN (SELECT id FROM _cafe_pitches);
DELETE FROM public.pitch_tariffs WHERE pitch_id IN (SELECT id FROM _cafe_pitches);
DELETE FROM public.courts        WHERE pitch_id IN (SELECT id FROM _cafe_pitches);
DELETE FROM public.pitches       WHERE id IN (SELECT id FROM _cafe_pitches);
DELETE FROM public.owner_accounts WHERE owner_user_id IN (SELECT id FROM _cafe_users);

-- ── Kimlik (profiles → identities → users) ────────────────────────────────
DELETE FROM public.profiles WHERE id IN (SELECT id FROM _cafe_users);
DELETE FROM auth.identities WHERE user_id IN (SELECT id FROM _cafe_users);
DELETE FROM auth.users      WHERE id IN (SELECT id FROM _cafe_users);

-- ── KENDİNİ DOĞRULAMA: önekli hiçbir şey kalmadı ──────────────────────────
DO $$
DECLARE v_kalan int;
BEGIN
  SELECT (SELECT count(*) FROM auth.users WHERE id::text LIKE 'cafe7e57-%')
       + (SELECT count(*) FROM public.profiles WHERE id::text LIKE 'cafe7e57-%')
       + (SELECT count(*) FROM public.pitches WHERE id::text LIKE 'cafe7e57-%')
       + (SELECT count(*) FROM public.courts WHERE id::text LIKE 'cafe7e57-%')
       + (SELECT count(*) FROM public.pitch_tariffs WHERE id::text LIKE 'cafe7e57-%')
  INTO v_kalan;
  IF v_kalan <> 0 THEN
    RAISE EXCEPTION 'TEMİZLİK DOĞRULAMA: % önekli satır kaldı — elle bak', v_kalan;
  END IF;
  RAISE NOTICE 'TEMİZLİK TAMAM: cafe7e57 önekli tüm veri silindi.';
END $$;

COMMIT;
