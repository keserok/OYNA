-- ════════════════════════════════════════════════════════════════════════════
-- [SG-3] Mali defter FK'ları: profiles CASCADE → RESTRICT
-- ────────────────────────────────────────────────────────────────────────────
-- SORUN: Aşağıdaki tabloların kullanıcı FK'ları `ON DELETE CASCADE` idi.
--   Bir profiles satırı hard-delete edildiğinde cüzdan defteri, rezervasyon/
--   tahsilat geçmişi, SaaS faturalama olayları, para çekme talepleri ve
--   promosyon kullanım kayıtları geri dönüşsüz silinirdi (muhasebe + denetim
--   tutarlılığı kaybı). 20260809000002 fonksiyon düzeyinde korumayı kurdu;
--   bu migration aynı korumayı ŞEMA düzeyinde garanti eder.
--
-- KAPSAM (yalnız mali DEFTER tabloları):
--   wallet_transactions.user_id           — cüzdan defteri
--   pitch_bookings.user_id                — rezervasyon/tahsilat geçmişi
--                                           (payment_intents.booking_id CASCADE
--                                            zincirini de dolaylı korur)
--   owner_billing_events.owner_user_id    — SaaS faturalama olayları
--   owner_withdrawal_requests.owner_id    — para çekme talepleri
--   promo_redemptions.user_id             — promosyon kullanım defteri
--   (payment_intents.user_id ve payout_requests.user_id zaten NO ACTION.)
--
-- BİLİNÇLİ CASCADE BIRAKILANLAR:
--   payout_methods, user_saved_cards  → kayıtlı ödeme araçları = kişisel veri;
--     KVKK silme kapsamında, defter değil. Hesap silinirse silinmeleri doğru.
--   pitch_slot_holds                  → geçici tutma kayıtları.
--   sosyal/chat tabloları             → kişisel içerik, defter değil.
--   provider_identities / provider_applications (KYC), match_disputes.raised_by,
--   admin_ghost_sessions (denetim)    → bu turda dokunulmadı; saklama süresi
--     politikası netleşince ayrıca değerlendirilecek.
--
-- NOT: ADD CONSTRAINT mevcut satırları doğrular (kısa tablo taraması + kilit);
--   satırlar zaten geçerli FK'lı olduğundan doğrulama sorunsuz geçer.
-- ROLLBACK: aynı DO deseniyle ON DELETE CASCADE geri eklenebilir.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  t record;
  v_conname text;
BEGIN
  FOR t IN
    SELECT * FROM (VALUES
      ('wallet_transactions',       'user_id'),
      ('pitch_bookings',            'user_id'),
      ('owner_billing_events',      'owner_user_id'),
      ('owner_withdrawal_requests', 'owner_id'),
      ('promo_redemptions',         'user_id')
    ) AS v(tbl, col)
  LOOP
    -- Kolon üzerindeki profiles'a giden, hâlâ CASCADE olan FK'yı bul
    -- (idempotent: RESTRICT'e çevrilmişse v_conname NULL kalır ve atlanır).
    SELECT c.conname INTO v_conname
    FROM pg_constraint c
    WHERE c.contype = 'f'
      AND c.conrelid  = ('public.' || quote_ident(t.tbl))::regclass
      AND c.confrelid = 'public.profiles'::regclass
      AND c.confdeltype = 'c'
      AND array_length(c.conkey, 1) = 1
      AND (SELECT a.attname FROM pg_attribute a
           WHERE a.attrelid = c.conrelid AND a.attnum = c.conkey[1]) = t.col
    LIMIT 1;

    IF v_conname IS NULL THEN
      RAISE NOTICE '[SG-3] %.% zaten CASCADE değil — atlandı', t.tbl, t.col;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', t.tbl, v_conname);
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.profiles(id) ON DELETE RESTRICT',
      t.tbl, t.tbl || '_' || t.col || '_fkey', t.col
    );
    RAISE NOTICE '[SG-3] %.% → ON DELETE RESTRICT', t.tbl, t.col;
  END LOOP;
END $$;
