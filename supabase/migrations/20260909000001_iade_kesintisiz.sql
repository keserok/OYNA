-- ════════════════════════════════════════════════════════════════════════════
-- İADEDEN KESİNTİ KALDIRILDI — ÖDEME ALTYAPISI BEDELİNİ DE OYNA ÜSTLENİR
-- ----------------------------------------------------------------------------
-- KURUCU KARARI (17 Ağustos 2026): "ödeme altyapısı kesintisinin de iadeye
-- yansıtılıp kullanıcıya iade yapılmasını istiyorum."
--
-- BU KARAR BİR ÖNCEKİNİ TERSİNE ÇEVİRİR. 16 Ağustos'ta alınan karar
-- (20260905000005_karta_iade_defteri_ve_psp_kesintisi) iadelerden ödeme
-- altyapısının kestiği bedeli düşüyordu: `settings.refund_psp_fee_pct = 2.5`.
-- 17 Ağustos kararı bunun tersidir — kullanıcı ödediği rakamın AYNISINI geri
-- alır; PSP maliyetini OYNA üstlenir.
--
-- NEDEN ÖNEMLİ: iade kademelerinin oranları (%100 / %50 / %0) DEĞİŞMEDİ ve
-- kullanıcıya ödeme ÖNCESİNDE gösterilmeye devam ediyor (kurucu kararı A2).
-- Değişen tek şey, o orandan SONRA bir kesinti daha yapılıp yapılmadığı.
-- Örnek: 1.000 ₺ ödeyip 24 saatten önce iptal eden kullanıcı
--   ESKİ:  1.000 − 25 (PSP) = 975 ₺ alıyordu
--   YENİ:  1.000 ₺ alır.
--
-- NASIL UYGULANIR: `_psp_fee` fonksiyonunun gövdesine DOKUNULMAZ; o zaten
-- `settings` tablosundaki oranları okur. Oranlar sıfırlanır → fonksiyon 0
-- döndürür → tüm iade yolları (kademeli iade, kaptan iptali, slot iadesi,
-- kapora çözme) kendiliğinden kesintisiz olur. Tek yerden, tek satırla.
--
-- GERİ ALMA: kesinti geri istenirse `refund_psp_fee_pct` yeniden 2.5 yapılır.
-- Fonksiyon ve defter yapısı yerinde durduğu için başka bir iş gerekmez.
-- ════════════════════════════════════════════════════════════════════════════

UPDATE public.settings
SET refund_psp_fee_pct   = 0,
    refund_psp_fee_fixed = 0;

-- ── Doğrulama (prensip 7.7) ─────────────────────────────────────────────────
DO $$
DECLARE
  v_fee numeric;
BEGIN
  -- 1) Ayar gerçekten sıfırlandı mı?
  IF EXISTS (
    SELECT 1 FROM public.settings
    WHERE COALESCE(refund_psp_fee_pct, 0) <> 0
       OR COALESCE(refund_psp_fee_fixed, 0) <> 0
  ) THEN
    RAISE EXCEPTION 'DOGRULAMA: iade kesintisi hala sifirlanmadi';
  END IF;

  -- 2) Fonksiyon da 0 döndürüyor mu? (ayarı okumayan bir gövde kalmış olabilir)
  v_fee := public._psp_fee(1000);
  IF COALESCE(v_fee, 0) <> 0 THEN
    RAISE EXCEPTION 'DOGRULAMA: _psp_fee(1000) hala % dondurdu — iade kesintisiz degil', v_fee;
  END IF;
END $$;
