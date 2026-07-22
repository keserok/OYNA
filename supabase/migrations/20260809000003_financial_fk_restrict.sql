-- ============================================================================
-- SERTLEŞTİRME — GERİ KAZANIM (Faz 2b.5): financial_fk_restrict
-- ----------------------------------------------------------------------------
-- Canlıya PR-hattı DIŞINDA doğrudan uygulanmış (ledger'da 20260809000003 KAYITLI,
-- statements NULL, repo'da dosyası yoktu). Canlının güncel durumundan yeniden
-- üretildi. Canlıda ledger'da mevcut → merge'de ATLANIR (NET NO-OP); yalnız fresh
-- preview'de çalışır.
--
-- Amaç: finansal/sahiplik bütünlüğü olan tabloların profiles/pitches'e giden
-- yabancı anahtarlarını ON DELETE RESTRICT yap — bakiyesi/kaydı olan bir kullanıcı
-- ya da rezervasyonu olan bir saha, bağlı finansal kayıtlar dururken silinemesin
-- (kaza eseri CASCADE/SET NULL ile finansal iz kaybını önler).
-- ============================================================================

DO $mig$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('individual_matches',        'individual_matches_pitch_id_fkey',        'pitch_id',      'pitches'),
      ('owner_billing_events',      'owner_billing_events_owner_user_id_fkey', 'owner_user_id', 'profiles'),
      ('owner_withdrawal_requests', 'owner_withdrawal_requests_owner_id_fkey', 'owner_id',      'profiles'),
      ('pitch_bookings',            'pitch_bookings_user_id_fkey',             'user_id',       'profiles'),
      ('player_ratings',            'player_ratings_rater_id_fkey',            'rater_id',      'profiles'),
      ('promo_redemptions',         'promo_redemptions_user_id_fkey',          'user_id',       'profiles'),
      ('wallet_transactions',       'wallet_transactions_user_id_fkey',        'user_id',       'profiles')
    ) AS t(tbl, con, col, reftbl)
  LOOP
    IF to_regclass('public.'||r.tbl) IS NOT NULL AND to_regclass('public.'||r.reftbl) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', r.tbl, r.con);
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.%I(id) ON DELETE RESTRICT',
        r.tbl, r.con, r.col, r.reftbl);
    END IF;
  END LOOP;
END $mig$;
