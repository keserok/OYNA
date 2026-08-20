-- ════════════════════════════════════════════════════════════════════════════
-- MAÇ KUR KARTI GÖRSEL YUVASI — home_banners'a ikinci yuva
-- ----------------------------------------------------------------------------
-- KURUCU KARARI (20 Ağustos 2026): ana ekranda "Maç Kur" kartı, "Saha Kirala"
-- kartıyla AYNI yapıya geçti — arkadaki arena çizimi ve sağdaki amblem
-- kaldırıldı, sağda yönetici panelinden bölge bölge atanan fotoğraf bandı var.
--
-- Altyapı ZATEN yuva-parametrik kurulmuştu (20260804190741):
--   · home_banners.slot kolonu ve (slot, il, ilçe) tekilliği,
--   · home_banner_for_region(p_slot), admin_upsert_home_banner(p_slot).
-- Tek kilit tablo kısıtıydı: slot IN ('PITCH_RENT'). Bu göç kısıta
-- 'MATCH_CREATE' yuvasını ekler; RPC'lere dokunmak GEREKMEZ.
--
-- Yeni yuvada kayıt yoksa uygulama kartı fotoğrafsız çizer (Saha Kirala ile
-- aynı davranış) — görseli kurucu panelden seçer, göç veri tohumlamaz.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.home_banners DROP CONSTRAINT IF EXISTS home_banners_slot_chk;
ALTER TABLE public.home_banners
  ADD CONSTRAINT home_banners_slot_chk CHECK (slot IN ('PITCH_RENT', 'MATCH_CREATE'));

COMMENT ON COLUMN public.home_banners.slot IS
  'Ana sayfadaki görsel yuvası: PITCH_RENT = Saha Kirala kartı, MATCH_CREATE = Maç Kur kartı (20 Ağu 2026).';

-- ── Doğrulama (prensip 7.7) ────────────────────────────────────────────────
DO $dog$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def
  FROM pg_constraint
  WHERE conname = 'home_banners_slot_chk' AND conrelid = 'public.home_banners'::regclass;
  IF v_def IS NULL OR position('MATCH_CREATE' in v_def) = 0 THEN
    RAISE EXCEPTION 'DOGRULAMA: slot kisiti MATCH_CREATE icermiyor: %', COALESCE(v_def, 'YOK');
  END IF;

  -- Okuma RPC'si yeni yuvayla hatasiz calismali (kayit yokken bos doner).
  PERFORM * FROM public.home_banner_for_region(NULL, NULL, 'MATCH_CREATE');

  RAISE NOTICE 'DOGRULAMA TAMAM: MATCH_CREATE yuvasi acik, okuma RPC''si calisiyor.';
END $dog$;
