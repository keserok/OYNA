-- ════════════════════════════════════════════════════════════════════════════
-- [SG-4] public_profiles view yazma grant temizliği + son search_path düzeltmesi
-- ────────────────────────────────────────────────────────────────────────────
-- 1) public_profiles: Canlıda `authenticated` rolünde view üzerinde
--    INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER grant'ları vardı
--    (Supabase varsayılan privilege kalıntısı; 20260727000000001 yalnız
--    anon+public'ten REVOKE ALL yapmıştı). View SECURITY DEFINER (owner)
--    olarak koştuğundan ve kısmen auto-updatable olabileceğinden bu,
--    profiles RLS'ini atlayan potansiyel bir YAZMA yoluydu. İstemci view'a
--    hiçbir yerde yazmıyor (tüm kullanımlar SELECT) → davranış kırılmaz.
--
--    ⚠️ BİLİNÇLİ İSTİSNA — security_invoker'a ÇEVİRMEYİN:
--    Supabase advisor'ı bu view'ı "security_definer_view" (ERROR) olarak
--    işaretler. invoker'a çevrilirse profiles RLS'i (own_or_admin,
--    20260719000002) devreye girer ve TÜM çapraz-kullanıcı okumaları
--    (arkadaş listeleri, maç kadroları, mesaj gönderen adları) 0 satır döner.
--    Tabloda geniş SELECT politikası açmak da RLS kolon filtreleyemediği için
--    20260719000002'nin kapattığı PII sızıntısını (email/telefon) geri
--    getirir. DEFINER view + güvenli kolon listesi + satır filtresi bilinçli
--    KVKK desenidir; advisor bulgusu bu gerekçeyle istisnadır.
--
-- 2) touch_region_coverage(): advisor'daki SON "function_search_path_mutable"
--    bulgusu (20260712005900'de SET search_path'siz bırakılmıştı). Gövde
--    yalnız now() kullanır; sabitleme güvenli.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1) public_profiles: yalnız SELECT kalsın ────────────────────────────────
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.public_profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.public_profiles TO authenticated;

-- ── 2) touch_region_coverage: search_path sabitle ───────────────────────────
ALTER FUNCTION public.touch_region_coverage() SET search_path = public, pg_temp;
