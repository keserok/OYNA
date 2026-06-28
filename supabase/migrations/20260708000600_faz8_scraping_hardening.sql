-- ============================================================
-- FAZ 8 — Scraping yüzeyini daralt (VEC2-02)  [🟡 ÖNCE STAGING'DE DOĞRULA]
--
-- Tespit: pitch_tariffs SELECT politikası 'Tariffs are publicly viewable' = USING(true)
-- {public} → rakip, tek anon key ile TÜM sahaların fiyat/tarife verisini toplu çeker.
-- Çözüm: tarife okumayı yalnız 'authenticated'a aç (uygulama girişli kullanır).
--
-- !!! DOĞRULAMA: Uygulama, GİRİŞ YAPMAMIŞ kullanıcıya saha fiyatı gösteriyorsa bu onu
--     kırar. Önce anon akışını test edin; gerekiyorsa fiyatı maskeli bir RPC/VIEW ile verin.
--     pitches/courts SELECT'leri uygulama keşfi için 'public' BIRAKILDI (PII içermez).
--
-- EK (panel): Supabase Dashboard → Settings → API → 'Max rows' = 100
--   → tek istekte tüm tablo çekilemez; tüm tabloyu kazımak çok sayfa = WAF/rate-limit yakalar.
-- ============================================================

DROP POLICY IF EXISTS "Tariffs are publicly viewable" ON public.pitch_tariffs;

-- Girişli kullanıcı tüm aktif tarifeleri görebilir (UI fiyat gösterimi korunur)
CREATE POLICY "Tariffs viewable by authenticated"
  ON public.pitch_tariffs FOR SELECT TO authenticated
  USING (true);

-- (Opsiyonel sıkılaştırma — yalnız aktif tarifeler görünür kalsın istenirse:
--  USING (is_active) yapıp sahip/admin için ayrı bir tam-erişim policy eklenebilir.)
