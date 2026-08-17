-- ════════════════════════════════════════════════════════════════════════════
-- ANON RPC YETKİLERİ DARALTILDI + KÜÇÜK HİJYEN DÜZELTMELERİ
-- ════════════════════════════════════════════════════════════════════════════
--
-- 2026-08-17 veritabanı denetimi bulguları:
--   · Supabase güvenlik danışmanı: anon rolü 16 SECURITY DEFINER fonksiyonu
--     /rest/v1/rpc/ üzerinden oturumsuz çağırabiliyor. Bunlardan 4'ü kesin
--     kasıtsız: _trg_musteri_* tetikleyici yardımcıları (RPC olarak asla
--     açık olmamalı) ve admin_set_pitch_listing_cutoff (admin işlevi).
--     Diğer 12'si giriş-öncesi ekranlar/telemetri için bilinçli açık olabilir;
--     onlara dokunulmadı.
--   · function_search_path_mutable: public._tr_telefon_norm.
--   · unindexed_foreign_keys: pitch_customers.created_by.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1 · Tetikleyici yardımcıları RPC yüzeyinden kaldırılıyor ─────────────────
-- Tetikleyiciler tablo sahibi yetkisiyle çalışır; API rollerinin doğrudan
-- EXECUTE yetkisine ihtiyaç yoktur.
REVOKE ALL ON FUNCTION public._trg_musteri_from_booking() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._trg_musteri_from_debtor() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._trg_musteri_from_subscription() FROM PUBLIC, anon, authenticated;

-- ── 2 · Admin işlevi anon'dan kapatılıyor ────────────────────────────────────
-- İç kontrol (is_platform_admin) duruyor; authenticated grant'ı korunur —
-- yalnız oturumsuz çağrı yüzeyi kapanır.
REVOKE ALL ON FUNCTION public.admin_set_pitch_listing_cutoff(uuid, time without time zone) FROM PUBLIC, anon;

-- ── 3 · _tr_telefon_norm: search_path sabitleniyor ───────────────────────────
-- Gövde yalnız pg_catalog fonksiyonları kullanır; boş search_path güvenlidir.
-- (IMMUTABLE kalır; generated kolon ve ifade indeksi etkilenmez.)
ALTER FUNCTION public._tr_telefon_norm(text) SET search_path = '';

-- ── 4 · İndekssiz tek FK kapatılıyor ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_fk_pitch_customers_created_by
  ON public.pitch_customers (created_by);

-- ── 5 · Doğrulama (7.7) ──────────────────────────────────────────────────────
DO $$
BEGIN
  IF has_function_privilege('anon', 'public._trg_musteri_from_booking()', 'EXECUTE') THEN
    RAISE EXCEPTION 'DOGRULAMA: anon hala _trg_musteri_from_booking calistirabiliyor';
  END IF;
  IF has_function_privilege('anon', 'public.admin_set_pitch_listing_cutoff(uuid, time without time zone)', 'EXECUTE') THEN
    RAISE EXCEPTION 'DOGRULAMA: anon hala admin_set_pitch_listing_cutoff calistirabiliyor';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'idx_fk_pitch_customers_created_by'
  ) THEN
    RAISE EXCEPTION 'DOGRULAMA: idx_fk_pitch_customers_created_by indeksi yok';
  END IF;
END $$;
