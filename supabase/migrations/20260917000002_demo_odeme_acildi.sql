-- ════════════════════════════════════════════════════════════════════════════
-- DEMO ÖDEME AÇILDI — KURUCU KARARI (24 Ağustos 2026)
-- ════════════════════════════════════════════════════════════════════════════
--
-- KARAR: "iyzico'yu şimdilik aktive etmeyeceğiz, demo ödeme sistemiyle
-- ilerleyelim." Amaç, kart sözleşmesi/KYC tamamlanmasını beklemeden ürünün
-- para akışlarını uçtan uca çalışır hâle getirmek (maç kur → kapora → kadro
-- dolunca fazlasının dönmesi → iptal → iade).
--
-- ─── BU ANAHTAR NEDEN VARSAYILAN OLARAK KAPALIYDI ───────────────────────────
-- `resolve_payment_mode` içinde bilinçli bir güvenlik kilidi var: ödeme
-- sağlayıcısı canlı değilken online ödeme HİÇBİR koşulda teklif edilmez.
-- Sebebi tek cümle: simülasyonda kullanıcı "ödedim" sanır ama para hareket
-- etmez; tesis de kimsenin ödediğini görmez.
--
-- `simulation_counts_as_live` o kilidin ADI KONMUŞ tek istisnasıdır ve
-- varsayılanı kapalıdır. Bu göç onu bilinçli olarak açar.
--
-- ─── AÇIK BIRAKILAN RİSK VE NASIL KAPATILDIĞI ───────────────────────────────
-- Risk gerçektir: kullanıcı ödeme ekranını görür, "başarılı" yazısını okur,
-- sahaya gider ve tesis "ödeme görmüyorum" der.
--
-- Kurucu kararı: açılsın AMA kullanıcı YANILMASIN. Ödeme ekranına, ödeme
-- düğmesinin üstünde, kırmızı ve görmezden gelinemez bir uyarı eklendi:
-- "Bu bir TEST ödemesidir — kartından para çekilmez ve tesise ödeme geçmez."
-- (views/PaymentScreen.tsx · `payMode.simulation` koşulu)
--
-- Uyarı SUNUCUDAN sürülür, koda gömülü DEĞİLDİR: `resolve_payment_mode`
-- yanıtındaki `simulation` alanını okur. iyzico canlıya alındığı an
-- (`payment_provider = IYZICO`) uyarı kendiliğinden kaybolur — yeni paket
-- göndermeye gerek kalmaz. Aynı desen `ornek_icerik_uyarisi` için de kullanıldı.
--
-- ─── GERÇEK ÖDEMEYE GEÇİŞ (tek adım) ────────────────────────────────────────
--   UPDATE app_config SET value='"IYZICO"'::jsonb WHERE key='payment_provider';
-- Bu tek satır hem gerçek tahsilatı açar hem test uyarısını kaldırır.
-- `simulation_counts_as_live` o gün ayrıca kapatılmalıdır (temizlik).
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1) Simülasyon "canlı" sayılsın — güvenlik kilidinin adı konmuş istisnası.
UPDATE public.app_config SET value = 'true'::jsonb, updated_at = now()
 WHERE key = 'simulation_counts_as_live';

-- 2) Uygulamadan rezervasyon yalnız kartla kapora ödenerek yapılır (§2.12).
UPDATE public.app_config SET value = '"ONLINE_ONLY"'::jsonb, updated_at = now()
 WHERE key = 'payment_mode_global';

-- 3) Kart kaporası motoru açılır: maçlar kaporalı kurulur.
UPDATE public.app_config SET value = 'true'::jsonb, updated_at = now()
 WHERE key = 'match_deposit_enabled';

-- ═══ DOĞRULAMA (§7.7) ══════════════════════════════════════════════════════
DO $$
DECLARE v jsonb;
BEGIN
  v := public.resolve_payment_mode(NULL);

  IF (v->>'effective_mode') <> 'ONLINE_ONLY' THEN
    RAISE EXCEPTION 'DOGRULAMA: etkin mod ONLINE_ONLY degil (%)', v->>'effective_mode';
  END IF;
  IF (v->>'online_allowed')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'DOGRULAMA: online odeme acilmadi';
  END IF;

  -- EN ÖNEMLİ KONTROL: ekranın uyarıyı çizebilmesi için `simulation` alanı
  -- TRUE dönmeli. Bu alan false dönerse anahtarlar açılır ama kullanıcı
  -- test ödemesi yaptığını HİÇ öğrenmez — kararın en tehlikeli hâli.
  IF (v->>'simulation')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'DOGRULAMA: simulation bayragi TRUE donmuyor — ekran test uyarisini cizemez';
  END IF;

  IF (v->>'provider') <> 'SIMULATION' THEN
    RAISE EXCEPTION 'DOGRULAMA: saglayici SIMULATION degil (%) — bu goc yalniz demo icindir', v->>'provider';
  END IF;

  IF NOT public.get_config_bool('match_deposit_enabled', false) THEN
    RAISE EXCEPTION 'DOGRULAMA: kapora motoru acilmadi';
  END IF;

  RAISE NOTICE 'DOGRULAMA GECTI: ONLINE_ONLY · simulation=true · kapora acik';
END $$;

COMMIT;
