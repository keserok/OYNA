-- ═══════════════════════════════════════════════════════════════════════════
-- ANONİM OKUMA SIZINTISI — üç tabloda "herkes okuyabilir" kapısı açıktı
--
-- NEDEN (17 Ağustos 2026, gönderim öncesi veritabanı denetiminde bulundu):
-- Üç tabloda politika `FOR SELECT TO public USING (true)` biçimindeydi; yani
-- GİRİŞ YAPMAMIŞ herkes içeriği okuyabiliyordu. Uygulamanın kendi anonim
-- anahtarıyla canlıya yoklama yapıldı ve üçü de HTTP 200 döndü:
--     /rest/v1/match_registrations  → 200
--     /rest/v1/waitlist             → 200
--     /rest/v1/pitch_slot_holds     → 200
--
-- BUGÜN GÖRÜNMÜYOR ÇÜNKÜ ÜÇÜ DE BOŞ (0 satır). Mağazadan ilk indirmeler gelip
-- insanlar maça kaydolmaya başladığı gün, oturum bile açmamış biri kimin hangi
-- maça yazıldığını, bekleme listesini ve kimin hangi saati tuttuğunu toplu
-- hâlde çekebilirdi. Bu bir KVKK ihlalidir — ve boş tablo, kapının kapalı
-- olduğu anlamına gelmez.
--
-- KAPATMAK NEDEN GÜVENLİ: istemci kodunda bu üç tabloya tek bir doğrudan
-- okuma yok (üçü için de `from('<tablo>')` arandı → 0 sonuç). Tabloları okuyan
-- her şey SECURITY DEFINER fonksiyonlardan geçiyor; onlar RLS'e takılmaz.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Açık kapıları kaldır ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "Registrations are viewable by everyone." ON public.match_registrations;
DROP POLICY IF EXISTS "Waitlist viewable by everyone."          ON public.waitlist;
DROP POLICY IF EXISTS "Holds are viewable by everyone"          ON public.pitch_slot_holds;

-- ── Yerine dar kapılar ─────────────────────────────────────────────────────
-- Kayıtlar ve bekleme listesi: kullanıcının kendi satırı + yönetici.
-- (Uygulama bunları zaten fonksiyonlardan okuyor; bu politika "ileride biri
--  doğrudan okumak isterse" doğru davranışı tanımlar.)
CREATE POLICY match_registrations_select_own ON public.match_registrations
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.is_admin());

CREATE POLICY waitlist_select_own ON public.waitlist
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.is_admin());

-- Saat tutma: yalnız tutan kişi (ve yönetici). Başkasının hangi saati
-- tuttuğunu bilmek rakip tesis için değerli, kullanıcı için gereksizdir.
CREATE POLICY slot_holds_select_own ON public.pitch_slot_holds
  FOR SELECT TO authenticated
  USING (held_by = (SELECT auth.uid()) OR public.is_admin());

-- ── Anonim rolün masadaki yetkisini de al ──────────────────────────────────
-- Politika kapatmak yeterli görünse de GRANT ayrı bir katmandır; ikisi birden
-- kapanmazsa yarın eklenen gevşek bir politika kapıyı yeniden açar.
REVOKE ALL ON public.match_registrations FROM anon;
REVOKE ALL ON public.waitlist            FROM anon;
REVOKE ALL ON public.pitch_slot_holds    FROM anon;

-- ── KENDİNİ DOĞRULAMA ──────────────────────────────────────────────────────
DO $$
DECLARE v_acik int;
BEGIN
  -- Bu üç tabloda 'public' rolüne açık (USING true) SELECT politikası KALMAMALI.
  SELECT count(*) INTO v_acik
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('match_registrations', 'waitlist', 'pitch_slot_holds')
    AND cmd = 'SELECT'
    AND roles::text LIKE '%public%'
    AND coalesce(qual, 'true') = 'true';
  IF v_acik <> 0 THEN
    RAISE EXCEPTION 'DOGRULAMA: hala % adet herkese acik okuma politikasi var.', v_acik;
  END IF;

  -- anon rolünün SELECT yetkisi de kalkmış olmalı.
  IF has_table_privilege('anon', 'public.match_registrations', 'SELECT')
     OR has_table_privilege('anon', 'public.waitlist', 'SELECT')
     OR has_table_privilege('anon', 'public.pitch_slot_holds', 'SELECT') THEN
    RAISE EXCEPTION 'DOGRULAMA: anon rolunun SELECT yetkisi hala duruyor.';
  END IF;
END $$;
