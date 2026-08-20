-- ════════════════════════════════════════════════════════════════════════════
-- REALTIME YAYINI — PANELİN ABONE OLDUĞU 5 EKSİK TABLO (20 Ağu 2026)
-- ----------------------------------------------------------------------------
-- ÇAPRAZ İNCELEME BULGUSU: kod bu tablolara postgres_changes aboneliği kuruyor
-- ama tablolar supabase_realtime yayınında YOKTU — abonelik sessizce hiç
-- tetiklenmiyordu:
--   · profiles                    → Komuta Merkezi oto-tazeleme,
--                                   Bekleyen Doğrulamalar rozeti (panel),
--                                   PendingVerificationView (uygulama —
--                                   kullanıcı onaylandığını canlı görsün)
--   · pitches                     → Komuta Merkezi oto-tazeleme
--   · match_disputes              → Komuta Merkezi oto-tazeleme
--   · community_creation_requests → Komuta Merkezi oto-tazeleme
--   · community_join_requests     → Komuta Merkezi oto-tazeleme
--
-- GÜVENLİK NOTU: postgres_changes olayları abonenin RLS'inden geçer — bir
-- kullanıcı yalnız SELECT edebildiği satırların olayını alır. profiles'ı
-- yayına eklemek veri açmaz; yalnız zaten görülebilen satırların değişim
-- sinyalini iletir. WAL trafiği artışı profil güncelleme hacmine bağlıdır ve
-- mevcut ölçekte ihmal edilebilir.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'profiles', 'pitches', 'match_disputes',
    'community_creation_requests', 'community_join_requests'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

-- ── Doğrulama (prensip 7.7) ─────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'profiles', 'pitches', 'match_disputes',
    'community_creation_requests', 'community_join_requests'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      RAISE EXCEPTION 'DOGRULAMA: % tablosu realtime yayininda degil', t;
    END IF;
  END LOOP;
END $$;
