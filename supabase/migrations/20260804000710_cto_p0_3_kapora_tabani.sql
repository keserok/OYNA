-- ════════════════════════════════════════════════════════════════════════════
-- [CTO-P0-3] KAPORA ALT SINIRI SUNUCUDA ZORLANIYOR
-- ────────────────────────────────────────────────────────────────────────────
-- SORUN (canlıda doğrulandı):
--   record_app_deposit_payment yalnız İKİ kontrol yapıyordu:
--     satır 22: p_amount > 0
--     satır 36: paid_amount + p_amount <= price   (yalnız TAVAN)
--   ALT SINIR YOKTU.
--
--   %30 kapora kuralı yalnız istemcide yaşıyordu:
--     views/PitchDiscovery.tsx:980
--       const fallbackDeposit = (price) => Math.round(price * 0.3 / 10) * 10;
--
--   `direct_booking_deposit_default_pct` ayarı (değer: 30) app_config'te
--   duruyordu ama 554 fonksiyonun HİÇBİRİ okumuyordu — panelden değiştirsen
--   hiçbir şey olmuyordu (ölü ayar).
--
--   SONUÇ: Kullanıcı 1000 ₺'lik bir sahayı 10 ₺ kapora ile tutabilirdi.
--
-- ÇÖZÜM:
--   İLK ödemede taban zorlanır. Sonraki tamamlama ödemeleri serbest kalır
--   (kullanıcı kalanı parça parça ödeyebilmeli).
--
-- YUVARLAMA PAYI — önemli:
--   İstemci `Math.round(price*0.3/10)*10` kullanıyor; bu bazen ham %30'un
--   ALTINA düşer (örn. 1010 ₺ → istemci 300, ham %30 = 303).
--   Sunucu tabanı ham %30 olsaydı MEŞRU ödemeler reddedilirdi.
--   Bu yüzden taban 10'un altına YUVARLANARAK hesaplanır:
--     taban = floor(price * pct / 100 / 10) * 10
--   1000 ₺ → 300 · 1010 ₺ → 300 · 1050 ₺ → 310
--   Böylece meşru ödeme hiç reddedilmez, ama 10 ₺'lik kapora engellenir.
-- ════════════════════════════════════════════════════════════════════════════

DO $do$
DECLARE
  v_src text; v_yeni text; v_ara text; v_blok text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public' AND p.proname='record_app_deposit_payment';

  IF v_src IS NULL THEN
    RAISE EXCEPTION '[CTO-P0-3] record_app_deposit_payment bulunamadi.';
  END IF;

  IF position('[CTO-P0-3] KAPORA TABANI' in v_src) > 0 THEN
    RAISE NOTICE '[CTO-P0-3] Zaten uygulanmis - atlaniyor.';
    RETURN;
  END IF;

  v_ara := E'    RAISE EXCEPTION ''AMOUNT_EXCEEDS_PRICE'';\n  END IF;';
  IF position(v_ara in v_src) = 0 THEN
    RAISE EXCEPTION '[CTO-P0-3] Tavan kontrolu bulunamadi - fonksiyon degismis.';
  END IF;

  v_blok :=
       E'    RAISE EXCEPTION ''AMOUNT_EXCEEDS_PRICE'';\n  END IF;\n\n'
    || E'  -- [CTO-P0-3] KAPORA TABANI (yalniz ILK odemede)\n'
    || E'  IF COALESCE(v_b.paid_amount, 0) = 0 AND COALESCE(v_b.price, 0) > 0 THEN\n'
    || E'    DECLARE\n'
    || E'      v_pct   numeric;\n'
    || E'      v_floor numeric;\n'
    || E'    BEGIN\n'
    || E'      SELECT COALESCE((value #>> ''{}'')::numeric, 30) INTO v_pct\n'
    || E'        FROM public.app_config WHERE key = ''direct_booking_deposit_default_pct'';\n'
    || E'      v_pct   := COALESCE(v_pct, 30);\n'
    || E'      -- Istemcinin yuvarlamasini kapsamak icin 10''un altina yuvarla\n'
    || E'      v_floor := floor(v_b.price * v_pct / 100.0 / 10.0) * 10;\n'
    || E'      IF v_floor > 0 AND p_amount < v_floor THEN\n'
    -- [DÜZELTME] Eski satır iki değer (v_floor, v_pct) veriyordu ama biçim
    -- dizisinde tek bir yer tutucu vardı: `%%` ve `%%%%` PostgreSQL'de düz
    -- yüzde işaretidir, yer tutucu değildir. Sonuç: fonksiyon DERLENMİYOR
    -- ("too many parameters specified for RAISE") ve migration çöküyordu.
    -- Canlıda bu dosya hiç çalışmadı; oraya elle DOĞRU hali uygulanmıştı.
    -- Aşağıdaki satır canlıdaki gövdenin birebir aynısıdır.
    || E'        RAISE EXCEPTION ''DEPOSIT_BELOW_MINIMUM: En az % TL kapora gerekli.'', v_floor;\n'
    || E'      END IF;\n'
    || E'    END;\n'
    || E'  END IF;';

  v_yeni := replace(v_src, v_ara, v_blok);
  IF v_yeni = v_src THEN
    RAISE EXCEPTION '[CTO-P0-3] Enjeksiyon gerceklesmedi.';
  END IF;

  EXECUTE v_yeni;
  RAISE NOTICE '[CTO-P0-3] Kapora tabani sunucuda zorlaniyor.';
END $do$;

-- ── Doğrulama ───────────────────────────────────────────────────────────────
DO $do$
DECLARE v_src text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='record_app_deposit_payment';

  IF position('direct_booking_deposit_default_pct' in v_src) = 0 THEN
    RAISE EXCEPTION '[CTO-P0-3] Ayar okunmuyor.';
  END IF;
  IF position('DEPOSIT_BELOW_MINIMUM' in v_src) = 0 THEN
    RAISE EXCEPTION '[CTO-P0-3] Taban kontrolu yok.';
  END IF;
  RAISE NOTICE '[CTO-P0-3] Dogrulandi.';
END $do$;

-- ════════════════════════════════════════════════════════════════════════════
-- GERİ ALMA: eklenen "[CTO-P0-3] KAPORA TABANI" bloğu silinerek yeniden tanımlanır.
-- (YAPMAYIN — 1000 ₺'lik saha 10 ₺ ile tutulabilir hale gelir.)
-- ════════════════════════════════════════════════════════════════════════════
