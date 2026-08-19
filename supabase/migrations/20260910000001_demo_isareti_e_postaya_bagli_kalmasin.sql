-- ════════════════════════════════════════════════════════════════════════════
-- DEMO İŞARETİ ARTIK E-POSTAYA BAĞLI DEĞİL
-- ----------------------------------------------------------------------------
-- BULGU (19 Ağu 2026): `demo_isareti_profil` tetikleyicisinin gövdesi tek satır:
--     NEW.is_demo := COALESCE(NEW.email ILIKE '%@oyna.app', false);
-- ve tetikleyici BEFORE INSERT OR UPDATE olarak çalışıyor. Yani demo olup
-- olmama kararı YALNIZ e-posta adresine bakıyor ve her yazımda yeniden veriliyor.
--
-- BU NEDEN BOZULDU: telefon birincil giriş yolu oldu (4.6) ve şifre/e-posta
-- yolu kaldırıldı (4.7). Telefonla açılan hesabın e-postası YOKTUR → ifade
-- daima false döner. Sonuçları:
--   1. Telefonla açılan hiçbir demo/test hesabı bir daha demo işareti ALAMAZ.
--      Kurucunun 500 000 00 00 demo hesabı da gerçek kullanıcı sayılıyordu.
--   2. Daha kötüsü UPDATE'te de çalıştığı için, e-postası bir kez temizlenen
--      MEVCUT bir demo hesabı sessizce "gerçek kullanıcı"ya dönüşür ve
--      raporlara, KPI'lara, finansal tablolara karışır.
--
-- YENİ KURAL (üç satır, sırayla):
--   a) Ayrıcalıklı bağlam (göç/service_role → auth.uid() IS NULL, ya da platform
--      yöneticisi) ne yazdıysa O GEÇERLİDİR. Demo tohumlama ve bu göç böyle
--      çalışır.
--   b) Değilse, @oyna.app e-postası hâlâ OTOMATİK demo işareti verir (eski
--      davranış korunur; kadro hesapları etkilenmez).
--   c) Ve bir kez konmuş demo işareti sıradan bir UPDATE ile DÜŞMEZ.
--
-- NEDEN (a) ŞARTA BAĞLI: `is_demo` masum bir etiket değil — demo tesisler
-- sahiplik kontrolünden muaf (_pitches_owner_guard) ve purge_* fonksiyonları
-- demo kayıtları siler. Sıradan kullanıcı kendini demo işaretleyebilseydi hem
-- bir kapıyı atlar hem de kendi verisini silinebilir hâle getirirdi.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.demo_isareti_profil()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ayricalikli boolean;
  v_epostadan   boolean;
BEGIN
  -- (a) Göç / service_role / platform yöneticisi ne dediyse o.
  v_ayricalikli := (auth.uid() IS NULL) OR public.is_platform_admin();
  IF v_ayricalikli THEN
    NEW.is_demo := COALESCE(NEW.is_demo, false);
    RETURN NEW;
  END IF;

  -- (b) Eski otomatik kural: @oyna.app kadro hesapları demodur.
  v_epostadan := COALESCE(NEW.email ILIKE '%@oyna.app', false);

  -- (c) Konmuş işaret düşmez: UPDATE'te eski değer de hesaba katılır.
  NEW.is_demo := v_epostadan
                 OR COALESCE(CASE WHEN TG_OP = 'UPDATE' THEN OLD.is_demo END, false);
  RETURN NEW;
END;
$$;

-- Kurucunun demo hesabı: telefonla açıldığı için eski kural onu gerçek
-- kullanıcı sayıyordu. Yeni kural altında işaretini alsın.
UPDATE public.profiles SET is_demo = true
WHERE id = 'd0e51e00-0000-4000-8000-000000000001';

-- ── Doğrulama (prensip 7.7) ────────────────────────────────────────────────
DO $$
DECLARE
  v_kadro_demo boolean;
BEGIN
  -- 1) Telefonla açılan demo hesabı artık demo işaretli mi?
  IF NOT COALESCE((SELECT is_demo FROM public.profiles
                   WHERE id = 'd0e51e00-0000-4000-8000-000000000001'), false) THEN
    RAISE EXCEPTION 'DOGRULAMA: telefonla acilan demo hesap hala demo isaretli degil';
  END IF;

  -- 2) @oyna.app kadrosu etkilenmedi mi? (eski otomatik kural yerinde)
  SELECT bool_and(is_demo) INTO v_kadro_demo
  FROM public.profiles WHERE email ILIKE '%@oyna.app';
  IF NOT COALESCE(v_kadro_demo, true) THEN
    RAISE EXCEPTION 'DOGRULAMA: @oyna.app kadro hesaplarindan bazilari demo isaretini kaybetti';
  END IF;

  -- 3) Sıradan bir güncelleme işareti düşürmüyor mu?
  UPDATE public.profiles SET name = name
  WHERE id = 'd0e51e00-0000-4000-8000-000000000001';
  IF NOT COALESCE((SELECT is_demo FROM public.profiles
                   WHERE id = 'd0e51e00-0000-4000-8000-000000000001'), false) THEN
    RAISE EXCEPTION 'DOGRULAMA: siradan bir UPDATE demo isaretini dusurdu';
  END IF;

  RAISE NOTICE 'DOGRULAMA TAMAM: demo isareti artik e-postaya bagli degil.';
END $$;
