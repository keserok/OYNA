-- ════════════════════════════════════════════════════════════════════════════
-- İÇ YARDIMCILAR ANON YÜZEYİNDEN KALDIRILDI + AŞIRI YÜK TUZAĞI TEMİZLENDİ
-- ----------------------------------------------------------------------------
-- Canlı denetimde (Supabase güvenlik danışmanı + elle doğrulama) dört bulgu
-- çıktı. ÜÇÜ 11–12 Eylül göçlerinde BENİM AÇTIĞIM açıklardı.
--
-- ── 1) `_booking_cancel_quote` AŞIRI YÜKLENDİ, DEĞİŞMEDİ ──────────────────
-- 20260911000001 bu fonksiyona `p_psp_taban` parametresini eklerken onu
-- DEĞİŞTİRDİĞİNİ sanıyordu; PostgreSQL'de parametre eklemek YENİ BİR FONKSİYON
-- yaratır. Sonuç: iki aşırı yük yan yana durdu ve İKİSİNİN DE son parametresi
-- DEFAULT'lu olduğu için 3 argümanlı her çağrı belirsiz hâle geldi:
--
--   ERROR 42725: function public._booking_cancel_quote(numeric, timestamp
--   without time zone, uuid) is not unique
--
-- Bugün canlıda patlamıyor, çünkü iki çağıran da (`cancel_app_booking`,
-- `preview_booking_cancel`) 4 argüman veriyor. Ama bu bir ZAMAN AYARLI TUZAK:
-- 3 argümanlı tek bir yeni çağrı — ya da eski bir çağıranı geri getiren bir
-- göç — iptal/iade yolunu çalışma anında kırardı. Eski imza kaldırılıyor.
--
-- ── 2) Yeni imza anon'a AÇIK kalmıştı ─────────────────────────────────────
-- Yeni fonksiyon nesnesi varsayılan olarak PUBLIC EXECUTE ile doğar; eski
-- imzadaki REVOKE'u devralmaz. Yani oturumsuz bir istek /rest/v1/rpc üzerinden
-- SECURITY DEFINER bir iç fiyat yardımcısını çağırabiliyordu.
--
-- ── 3) `_odeme_yuvarla` search_path'siz ve anon'a açıktı ──────────────────
-- 20260911000000'de eklendi. SECURITY DEFINER DEĞİL (yani yükseltme riski
-- düşük) ama kardeşleri (`_psp_fee`) gibi kapalı ve sabit search_path'li
-- olmalı; danışman da `function_search_path_mutable` diye işaretliyor.
--
-- ── 4) `b_nakit_rezervasyon_kapisi` bir TETİKLEYİCİ fonksiyonu ────────────
-- (Benim değil, önceden vardı.) Tetikleyiciler tablo sahibi yetkisiyle çalışır;
-- API rollerinin EXECUTE yetkisine ihtiyacı YOKTUR. RPC yüzeyinde durması
-- 20260908000001'de kapatılan `_trg_musteri_*` ile aynı sınıf. search_path'ine
-- `pg_temp` de ekleniyor.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1) Öksüz aşırı yük ──────────────────────────────────────────────────────
-- Bağımlı bir nesne varsa DROP zaten hata verir; sessizce bir şey kaybolmaz.
DROP FUNCTION IF EXISTS public._booking_cancel_quote(numeric, timestamp without time zone, uuid);

-- ── 2–4) Yüzey daraltma ─────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public._booking_cancel_quote(numeric, timestamp without time zone, uuid, numeric)
  FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public._odeme_yuvarla(numeric, numeric) SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public._odeme_yuvarla(numeric, numeric) FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.b_nakit_rezervasyon_kapisi() SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.b_nakit_rezervasyon_kapisi() FROM PUBLIC, anon, authenticated;

-- ── Doğrulama (prensip 7.7) ────────────────────────────────────────────────
DO $dog$
DECLARE v_adet int; v_ok boolean;
BEGIN
  -- (1) Tek imza kaldı mı? Belirsizlik ancak böyle kalkar.
  SELECT count(*) INTO v_adet
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public' AND p.proname='_booking_cancel_quote';
  IF v_adet <> 1 THEN
    RAISE EXCEPTION 'DOGRULAMA: _booking_cancel_quote % imzayla duruyor, 1 bekleniyordu', v_adet;
  END IF;

  -- (1b) 3 argümanlı çağrı ARTIK ÇALIŞMALI (belirsizlik kalktı).
  BEGIN
    PERFORM public._booking_cancel_quote(420::numeric, (now() + interval '48 hours')::timestamp, NULL::uuid);
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'DOGRULAMA: 3 argumanli cagri hala calismiyor [%] %', SQLSTATE, SQLERRM;
  END;

  -- (2–4) Hiçbiri uygulama rollerine açık kalmamalı.
  FOR v_ok IN
    SELECT has_function_privilege(r.rol, p.oid, 'EXECUTE')
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace,
         (VALUES ('anon'),('authenticated')) AS r(rol)
    WHERE n.nspname='public'
      AND p.proname IN ('_booking_cancel_quote','_odeme_yuvarla','b_nakit_rezervasyon_kapisi')
  LOOP
    IF v_ok THEN
      RAISE EXCEPTION 'DOGRULAMA: ic yardimcilardan biri hala uygulama rollerine acik';
    END IF;
  END LOOP;

  -- (3) search_path artık sabit.
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND p.proname IN ('_odeme_yuvarla','b_nakit_rezervasyon_kapisi')
      AND (p.proconfig IS NULL OR NOT (p.proconfig && ARRAY['search_path=public, pg_temp']))
  ) THEN
    RAISE EXCEPTION 'DOGRULAMA: search_path sabitlenmemis fonksiyon kaldi';
  END IF;

  -- Kapatma, ÜRÜNÜ kırmamalı: tahsilat teklifi hâlâ çalışıyor mu?
  -- (get_card_fee_quote SECURITY DEFINER; sahibi olarak _odeme_yuvarla'yi çağırır.)
  IF (public.get_card_fee_quote(400)->>'total')::numeric <> 420 THEN
    RAISE EXCEPTION 'DOGRULAMA: kapatma sonrasi ekran teklifi bozuldu';
  END IF;

  RAISE NOTICE 'DOGRULAMA TAMAM: tek imza, kapali yuzey, sabit search_path, teklif calisiyor.';
END $dog$;
