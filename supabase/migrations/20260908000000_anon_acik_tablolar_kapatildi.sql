-- ════════════════════════════════════════════════════════════════════════════
-- ANON'A AÇIK TABLOLAR KAPATILDI — kişisel veri numaralandırması önlendi
-- ════════════════════════════════════════════════════════════════════════════
--
-- 2026-08-17 veritabanı denetimi bulgusu (YÜKSEK): match_registrations,
-- waitlist ve pitch_slot_holds tablolarında qual='true' SELECT politikaları
-- vardı ve anon SELECT grant'ı duruyordu. Oturum açmamış bir istemci PostgREST
-- üzerinden tüm kullanıcı UUID'lerini, maç kayıtlarını, ödeme durumlarını ve
-- slot tutma hareketlerini listeleyebiliyordu.
--
-- GÜVENLİ KAPATMA KANITI (denetimde doğrulandı):
--   · İstemci kodunda bu üç tabloya tek bir .from()/realtime referansı yok
--     (store.ts'te yalnız "abonelikler kaldırıldı" notu var).
--   · Bu tabloları okuyan TÜM veritabanı fonksiyonları SECURITY DEFINER —
--     RLS'i zaten geçtikleri için bu değişiklikten etkilenmezler
--     (pg_proc taraması: SECURITY INVOKER referans sayısı 0).
--
-- Yeni durum: anon hiçbir şey göremez; authenticated yalnız kendi slot
-- tutmalarını (held_by = auth.uid()) ve adminler her kaydı görür.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1 · Her-zaman-doğru SELECT politikaları kaldırılıyor ─────────────────────
DROP POLICY IF EXISTS "Registrations are viewable by everyone." ON public.match_registrations;
DROP POLICY IF EXISTS "Waitlist viewable by everyone." ON public.waitlist;
DROP POLICY IF EXISTS "Holds are viewable by everyone" ON public.pitch_slot_holds;

-- ── 2 · Kapsamlı (scoped) SELECT politikaları ────────────────────────────────
DROP POLICY IF EXISTS match_registrations_select_admin ON public.match_registrations;
CREATE POLICY match_registrations_select_admin ON public.match_registrations
  FOR SELECT TO authenticated USING (is_admin());

DROP POLICY IF EXISTS waitlist_select_admin ON public.waitlist;
CREATE POLICY waitlist_select_admin ON public.waitlist
  FOR SELECT TO authenticated USING (is_admin());

DROP POLICY IF EXISTS slot_holds_select_own ON public.pitch_slot_holds;
CREATE POLICY slot_holds_select_own ON public.pitch_slot_holds
  FOR SELECT TO authenticated
  USING (held_by = (SELECT auth.uid()) OR is_admin());

-- ── 3 · anon'un tablo yetkileri tamamen geri alınıyor ────────────────────────
REVOKE ALL ON public.match_registrations FROM anon;
REVOKE ALL ON public.waitlist FROM anon;
REVOKE ALL ON public.pitch_slot_holds FROM anon;

-- ── 4 · Doğrulama (7.7: göç kendi kanıtını taşır) ────────────────────────────
DO $$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('match_registrations', 'waitlist', 'pitch_slot_holds')
    AND cmd = 'SELECT'
    AND qual = 'true';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'DOGRULAMA: her-zaman-dogru SELECT politikasi hala duruyor (% adet)', v_n;
  END IF;

  IF has_table_privilege('anon', 'public.pitch_slot_holds', 'SELECT') THEN
    RAISE EXCEPTION 'DOGRULAMA: anon hala pitch_slot_holds okuyabiliyor';
  END IF;
END $$;
