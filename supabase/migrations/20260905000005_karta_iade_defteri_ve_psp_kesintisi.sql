-- ═══════════════════════════════════════════════════════════════════════════
-- KARTA İADE DEFTER SATIRI + PSP KESİNTİSİ (BULGU-2 ve BULGU-3, 17 Ağu 2026)
--
-- BULGU-2 — NE BOZUKTU: Kart dönemi tasarımı, karta dönen iadeleri deftere
-- balance_type = NULL satırlarla yazar (para bakiye OLMAZ; satır yalnız
-- "bu niyet için şu kadar iade edildi" kaydıdır — çifte-iade bekçileri ve
-- v_paid/v_refunded matematiği bu satırları okur). Ama kolonda NOT NULL
-- kısıtı vardı: kaptan iptali dahil TÜM karta-iade yolları 23502 ile
-- çöküyordu. Canlı testte kaptan iptalinde yakalandı.
--
-- ÇÖZÜM: NOT NULL kaldırılır. Mevcut CHECK kısıtı DURUR: dolu değer hâlâ
-- yalnız EARNINGS/REFUND_CREDIT/TOP_UP olabilir (NULL, CHECK'i geçer —
-- SQL standartı). Bakiye hesapları balance_type üzerinden süzer; NULL
-- satır hiçbir bakiye kovasına girmez. Cüzdan kapısı tetikleyicisi de
-- yalnız TOP_UP'ı engeller — NULL'a dokunmaz.
--
-- BULGU-3 — NE BOZUKTU: Kurucu kararı (16 Ağu): iadelere ödeme altyapısı
-- kesintisi yansıtılır. _psp_fee, settings.refund_psp_fee_pct/fixed okur;
-- ikisi de 0'dı — iade kesintisiz yapılırdı, karar ölü kalırdı.
--
-- ÇÖZÜM: refund_psp_fee_pct %2,5 yapılır (tahsilatta oyuncuya yansıtılan
-- card_fee_pct ile aynı hiza). GEÇİCİ VARSAYILAN: iyzico sözleşmesi
-- imzalanınca gerçek kesinti oranına kurucu günceller (LANSMAN_PLANI
-- Faz B-2 notu). Yalnız 0 ise yazılır — kurucunun elle girdiği değer
-- ASLA ezilmez.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.wallet_transactions ALTER COLUMN balance_type DROP NOT NULL;

COMMENT ON COLUMN public.wallet_transactions.balance_type IS
  'Bakiye kovası (EARNINGS/REFUND_CREDIT/TOP_UP). NULL = kart dönemi iade '
  'işaret satırı: para bakiyeye DEĞİL karta döner; satır çifte-iade '
  'bekçileri için tutulur (20260905000005).';

UPDATE public.settings
SET refund_psp_fee_pct = 2.5
WHERE COALESCE(refund_psp_fee_pct, 0) = 0;

-- ── KENDİNİ DOĞRULAMA ─────────────────────────────────────────────────────
DO $$
DECLARE
  v_uid uuid;
  v_fee numeric;
  v_reddetti boolean := false;
BEGIN
  -- 1) NULL balance_type satırı artık yazılabiliyor (kart iadesi deseni)
  SELECT id INTO v_uid FROM public.profiles WHERE is_demo LIMIT 1;
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'DOĞRULAMA: demo profil yok — satır kanıtı atlanamaz';
  END IF;

  INSERT INTO public.wallet_transactions
    (user_id, amount, type, balance_type, status, reference_type, description)
  VALUES (v_uid, 0, 'DEPOSIT', NULL, 'COMPLETED', 'PAYMENT_INTENT',
          '_dogrulama_karta_iade_isareti');
  DELETE FROM public.wallet_transactions
  WHERE user_id = v_uid AND description = '_dogrulama_karta_iade_isareti';

  -- 2) CHECK hâlâ nöbette: saçma balance_type REDDEDİLİYOR
  BEGIN
    INSERT INTO public.wallet_transactions
      (user_id, amount, type, balance_type, status, reference_type, description)
    VALUES (v_uid, 0, 'DEPOSIT', 'SACMA_KOVA', 'COMPLETED', 'PAYMENT_INTENT',
            '_dogrulama_sacma_kova');
  EXCEPTION WHEN check_violation THEN
    v_reddetti := true;
  END;
  IF NOT v_reddetti THEN
    RAISE EXCEPTION 'DOĞRULAMA: CHECK kısıtı saçma balance_type kabul etti!';
  END IF;

  -- 3) PSP kesintisi artık gerçek: 450 ₺ iadeden 11.25 ₺ kesilir (%2,5)
  v_fee := public._psp_fee(450);
  IF v_fee <= 0 THEN
    RAISE EXCEPTION 'DOĞRULAMA: _psp_fee(450) hâlâ % — kesinti kararı ölü', v_fee;
  END IF;

  RAISE NOTICE 'DOĞRULAMA TAMAM: NULL iade satırı serbest, CHECK nöbette, PSP kesintisi %', v_fee;
END $$;
