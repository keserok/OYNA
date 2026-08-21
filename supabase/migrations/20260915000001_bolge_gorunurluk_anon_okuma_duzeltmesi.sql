-- ════════════════════════════════════════════════════════════════════════════
-- BÖLGE GÖRÜNÜRLÜK KURALLARI — ANON OKUMA DÜZELTMESİ
-- ----------------------------------------------------------------------------
-- SORUN: 20260915000000'daki tek politika `is_active OR is_platform_admin()`
-- biçimindeydi. is_platform_admin'in EXECUTE yetkisi anon'dan (güvenlik
-- sertleştirmesiyle) alınmış durumda; anon bir satırı okurken politika o
-- fonksiyona dokununca sorgu 42501 ile düşüyordu. Uygulama keşfi girişli
-- kullanıcıyla çalıştığı için canlıda görünmüyor ama sözleşme "aktif kurallar
-- herkese okunur" idi — sözleşme tutturulur.
--
-- ÇÖZÜM: iki ayrı SELECT politikası (permissive OR birleşir):
--   1) herkes: yalnız aktif satırlar — hiçbir fonksiyon çağrılmaz.
--   2) authenticated: admin tüm satırları görür (panel pasif kuralları da yönetir).
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "region_visibility_read" ON public.region_visibility_rules;

DROP POLICY IF EXISTS "region_visibility_read_active" ON public.region_visibility_rules;
CREATE POLICY "region_visibility_read_active" ON public.region_visibility_rules
  FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "region_visibility_read_admin" ON public.region_visibility_rules;
CREATE POLICY "region_visibility_read_admin" ON public.region_visibility_rules
  FOR SELECT TO authenticated USING (public.is_platform_admin());

-- ── Doğrulama ───────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'region_visibility_rules'
      AND policyname = 'region_visibility_read_active'
  ) THEN
    RAISE EXCEPTION 'DOGRULAMA: aktif-okuma politikasi kurulmadi';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'region_visibility_rules'
      AND policyname = 'region_visibility_read'
  ) THEN
    RAISE EXCEPTION 'DOGRULAMA: eski karma politika hala duruyor';
  END IF;
END $$;
