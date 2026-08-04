-- ════════════════════════════════════════════════════════════════════════════
-- [P-2d / CTO-P0-1] MAÇ SÜTUN KORUMASI — istemci artık fiyat/komisyon yazamaz
-- ────────────────────────────────────────────────────────────────────────────
-- SORUN (canlıda ölçüldü):
--   `matches_update` RLS politikasında WITH CHECK YOK ve `authenticated` rolü
--   matches tablosunda **58 SÜTUNUN TAMAMINA** UPDATE yetkili. Bunlar arasında:
--     price, commission_rate_pct, commission_markup_pct/amount, commission_model,
--     slots, awaySlots, status, deposit_status, deposit_amount, is_platform...
--
--   Yani teorik olarak bir kullanıcı, uygulamayı hiç kullanmadan doğrudan
--   veritabanına bağlanıp kendi maçının FİYATINI 1 ₺ yapabilir, komisyon
--   oranını sıfırlayabilir, ya da slotlarını dolu gösterebilirdi.
--
-- NEDEN TETİKLEYİCİ DEĞİL, SÜTUN İZNİ?
--   profiles tablosundaki kanıtlanmış desen (protect_profile_columns) burada
--   ÇALIŞMAZ: o desen `auth.uid()` doluysa değişikliği geri alır. Ama matches'in
--   bu sütunlarını MEŞRU RPC'ler de değiştiriyor (player_buy_slots_v2 slots
--   yazıyor, process_match_at_deadline status yazıyor) ve onlar da kullanıcının
--   oturumuyla çağrılıyor — tetikleyici onları da geri alırdı.
--
--   Sütun izni doğru katmandır: SECURITY DEFINER fonksiyonlar sahibinin
--   (postgres) yetkisiyle çalışır, `authenticated` rolüne verilen izinler onları
--   ETKİLEMEZ. Yani RPC'ler çalışmaya devam eder, doğrudan istemci yazması durur.
--
-- ÖNCE DOĞRULANDI — istemci matches'e DOĞRUDAN YAZMIYOR:
--   Kod tabanında `from('matches').update/insert` yalnız 2 yerde:
--     supabaseMutations.ts:61 (fbAddMatch), :67 (fbUpdateMatch)
--   İkisinin de kod tabanında **HİÇ ÇAĞIRANI YOK** (grep: 0 sonuç).
--   Her yazma RPC üzerinden gidiyor. Bu yüzden izin kaldırmak güvenli.
--
-- KAPSAM: para, kimlik, durum, zamanlama ve sistem bayrakları.
--   Kozmetik alanlar (title, image, difficulty, visibility, chatMessages...)
--   bilerek AÇIK bırakıldı — blast radius'u küçük tutmak için.
-- ════════════════════════════════════════════════════════════════════════════

-- ⚠️ İLK DENEMEDE ÖĞRENİLDİ: sütun düzeyinde REVOKE İŞE YARAMAZ, çünkü izin
--    TABLO düzeyinde verilmiş. Tablo izni durdukça sütun geri alması etkisizdir.
--    (Migration'ın kendi doğrulaması bunu yakaladı ve işlem geri alındı.)
--    Doğru yöntem: tablo iznini kaldır, sonra YALNIZ zararsız sütunlara ver.

-- 1) Tablo düzeyindeki toptan UPDATE iznini kaldır
REVOKE UPDATE ON public.matches FROM authenticated;

-- 2) anon rolü maça hiç yazmamalı (RLS zaten engelliyor — bu ikinci kapı)
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.matches FROM anon;

-- 3) Yalnızca kozmetik/zararsız sütunlarda UPDATE geri ver.
--    Para, kimlik, durum, zaman ve sistem sütunları BİLEREK DIŞARIDA.
GRANT UPDATE (
  title, image, image_auto, location, difficulty, gender, "ageGroup",
  "minRating", min_players, visibility, format, footwear_rule, duration,
  badges, "chatMessages", "missingPositions", "reservePlayers",
  "communityId", cancel_reason
) ON public.matches TO authenticated;

COMMENT ON TABLE public.matches IS
  'P-2d/CTO-P0-1: Para, kimlik, durum, zaman ve sistem sutunlarinda authenticated rolunun UPDATE yetkisi KALDIRILDI. Yazma yalnizca SECURITY DEFINER RPC uzerinden yapilir. Yeni bir hassas sutun eklenirse buraya da eklenmelidir.';

-- ── Doğrulama: kritik sütunlar gerçekten kapandı mı? ────────────────────────
DO $do$
DECLARE
  v_acik text;
BEGIN
  SELECT string_agg(column_name, ', ' ORDER BY column_name) INTO v_acik
  FROM information_schema.column_privileges
  WHERE table_schema = 'public' AND table_name = 'matches'
    AND grantee = 'authenticated' AND privilege_type = 'UPDATE'
    AND column_name IN ('price','slots','awaySlots','status','commission_rate_pct',
                        'commission_markup_pct','commission_markup_amount','commission_model',
                        'deposit_status','deposit_amount','is_platform','creatorId');

  IF v_acik IS NOT NULL THEN
    RAISE EXCEPTION '[P-2d] Su kritik sutunlar HALA acik: %', v_acik;
  END IF;

  RAISE NOTICE '[P-2d] Kritik sutunlarin tamami kapatildi.';
END $do$;

-- ════════════════════════════════════════════════════════════════════════════
-- GERİ ALMA (bir ekran bozulursa — ama once HANGI sutunun gerektigini bulun):
--   GRANT UPDATE (sutun_adi) ON public.matches TO authenticated;
-- ════════════════════════════════════════════════════════════════════════════
