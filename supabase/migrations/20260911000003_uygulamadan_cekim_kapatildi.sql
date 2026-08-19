-- ════════════════════════════════════════════════════════════════════════════
-- UYGULAMADAN PARA ÇEKME KAPATILDI · TC İSTENMEZ · GELMEME CEZASI DEFTERE
-- ----------------------------------------------------------------------------
-- KURUCU KARARLARI (19 Ağustos 2026):
--   "Tesislerin hak edişlerini uygulamadan çekme gibi bir durumları şu anlık
--    olmayacak; biz kendimiz bize ödenen miktardan onlara ödeme yapacağız."
--    "Bir tesiste saha kiralanıp maç ayarlanıp oynandıktan sonra tesis bizden
--    ödemesini alabilecek."
--   "Kaleci ve hakemlerin işlemlerini biz halledeceğiz manuel olarak,
--    uygulamadan çekim yapamasınlar."
--   "TC istenmesin."
--   "Yalnızca maçlara katılabilmeleri için sistemlerinde maça gelmemeleri
--    hâlinde ödeyecekleri minimum tutar konulmak zorunda olsun."
--
-- KAPANAN TEK ŞEY ÇEKİM TALEBİ AÇMAK. Hakediş defteri aynen duruyor: kim ne
-- kazandı, ne zaman ödenebilir hâle geldi — hepsi okunmaya devam ediyor.
-- Ekranlar bakiyeyi göstermeye devam eder, yanına "OYNA tarafından ödenir"
-- yazar. Böylece kullanıcı parasının nerede olduğunu görür; yalnız düğme yok.
--
-- TC KAPISI: `request_payout_with_method` kaleci/hakem için
-- `provider_identities.status = VERIFIED` şartı arıyordu — yani pazar yeri
-- açıldığı gün kaleci kazandığı parayı çekemeyecekti ve bu, kurucunun "TC hiç
-- kimseden istenmesin" kararıyla çelişiyordu. Çekim yolu kapandığı için kapı
-- da gövdeyle birlikte kalktı. Kimlik denetimini zaten IBAN'ın ucundaki banka
-- yapıyor.
--
-- GELMEME CEZASI: provizyon/karttan çekim yok (aynı gün alınan karar). Ceza
-- sağlayıcının defterine BORÇ olarak yazılır ve OYNA'nın ona yapacağı manuel
-- ödemeden düşülür. Asgari tutar panelden yönetilir; sağlayıcı bu rakamı işi
-- kabul ederken görür (ayar `is_public`).
--
-- İKİ KATMAN (prensip 6.1): arayüz düğmeyi hiç göstermez
-- (shared/featureFlags.ts · CEKIM_UYGULAMADAN_ACIK = false), sunucu yine de
-- kapıyı tutar. Arayüze güvenilmez.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.request_payout_with_method(p_amount numeric, p_method_id uuid)
RETURNS public.payout_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  RAISE EXCEPTION 'PAYOUT_MANUAL: Kazancın hesabına OYNA tarafından aktarılır — uygulamadan çekim talebi açılmaz. Maç oynandıktan sonra ödemen yapılır; sorun için destek ekibine yazabilirsin.';
END;
$fn$;

CREATE OR REPLACE FUNCTION public.request_payout(
  p_amount numeric,
  p_iban text DEFAULT NULL,
  p_iban_holder_name text DEFAULT NULL,
  p_payout_type text DEFAULT NULL
)
RETURNS public.payout_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  RAISE EXCEPTION 'PAYOUT_MANUAL: Kazancın hesabına OYNA tarafından aktarılır — uygulamadan çekim talebi açılmaz. Maç oynandıktan sonra ödemen yapılır; sorun için destek ekibine yazabilirsin.';
END;
$fn$;

INSERT INTO public.app_config (key, value, value_type, category, label, description, is_public, min_value, max_value)
VALUES ('provider_noshow_penalty_min', '500'::jsonb, 'number', 'ODEME',
        'Gelmeme Cezası — En Az (₺)',
        'Kaleci/hakem kabul ettiği maça gelmezse defterine yazılan en az borç. OYNA''nın sağlayıcıya yapacağı manuel ödemeden düşülür. Sağlayıcı bu tutarı işi kabul ederken görür.',
        true, 0, 5000)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, label = EXCLUDED.label,
                                description = EXCLUDED.description, is_public = true;

-- ── Doğrulama (prensip 7.7) ────────────────────────────────────────────────
DO $dog$
DECLARE v_hata text;
BEGIN
  BEGIN
    PERFORM public.request_payout(100, 'TR000000000000000000000000', 'Deneme', 'MANUAL');
    RAISE EXCEPTION 'DOGRULAMA: request_payout hala calisiyor';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_hata = MESSAGE_TEXT;
    IF v_hata NOT LIKE 'PAYOUT_MANUAL:%' THEN
      RAISE EXCEPTION 'DOGRULAMA: beklenmeyen hata (%)', v_hata;
    END IF;
  END;

  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('request_payout','request_payout_with_method')
      AND p.prosrc LIKE '%IDENTITY_REQUIRED%'
  ) THEN
    RAISE EXCEPTION 'DOGRULAMA: TC kimlik kapisi hala cekim yolunda';
  END IF;

  IF COALESCE(public.get_config_number('provider_noshow_penalty_min', 0), 0) <= 0 THEN
    RAISE EXCEPTION 'DOGRULAMA: gelmeme cezasi asgari tutari kurulmadi';
  END IF;

  RAISE NOTICE 'DOGRULAMA TAMAM: uygulamadan cekim kapali, TC istenmiyor.';
END $dog$;
