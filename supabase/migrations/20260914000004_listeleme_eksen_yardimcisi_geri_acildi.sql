-- ════════════════════════════════════════════════════════════════════════════
-- `_listeleme_eksen_dk` GERİ AÇILDI — bir önceki kapatma bir ekranı kırmıştı
-- ----------------------------------------------------------------------------
-- 20260914000003 sekiz iç yardımcıyı uygulama rollerine kapattı. Bunlardan
-- `_listeleme_eksen_dk` KAPATILMAMALIYDI: onu çağıran iki yer SECURITY
-- INVOKER'dır —
--   · `get_pitch_slots`         (saha saat listeleme; anon+authenticated RPC)
--   · `_listeleme_siniri_bekcisi` (tetikleyici, INVOKER)
-- INVOKER zincirinde yardımcı ÇAĞIRAN KULLANICININ haklarıyla koşar; yetki
-- kapanınca rezervasyon ekranı "permission denied for function
-- _listeleme_eksen_dk" ile komple çalışmaz hâle geldi. Canlıda önce arıza
-- kanıtlandı (authenticated rolüyle çağrı), sonra bu göç uygulandı ve aynı
-- çağrının geçtiği doğrulandı.
--
-- ── DEPO KURALI (bu olaydan çıkan ders) ────────────────────────────────────
-- Bir iç yardımcıyı uygulama rollerine kapatmadan ÖNCE çağıranlarının
-- SECURITY DEFINER olduğu doğrulanır:
--     DEFINER zinciri → kapatmak güvenli (fonksiyon sahibin haklarıyla koşar)
--     INVOKER zinciri → kapatmak çağıran ekranı sessizce yıkar
-- Sorgu: pg_proc.prosecdef=false olan çağıran var mı?
--
-- GÜVENLİK ETKİSİ YOK: `_listeleme_eksen_dk(time)` saf dönüştürücüdür — verilen
-- saati listeleme ekseninde dakikaya çevirir; veri okumaz, yazmaz, kimlik
-- görmez. Asıl tehlike olan YEDİ yardımcı (iade yazıcıları dâhil) KAPALI kalır.
-- ════════════════════════════════════════════════════════════════════════════

GRANT EXECUTE ON FUNCTION public._listeleme_eksen_dk(p_t time without time zone) TO anon, authenticated;

-- ── Doğrulama (prensip 7.7) ────────────────────────────────────────────────
DO $dog$
DECLARE v_pitch uuid; v_hata text;
BEGIN
  SELECT id INTO v_pitch FROM public.pitches LIMIT 1;
  IF v_pitch IS NOT NULL THEN
    SET LOCAL ROLE authenticated;
    BEGIN
      PERFORM public.get_pitch_slots(v_pitch, current_date + 1);
      v_hata := NULL;
    EXCEPTION WHEN OTHERS THEN
      v_hata := SQLERRM;
    END;
    RESET ROLE;
    IF v_hata IS NOT NULL THEN
      RAISE EXCEPTION 'DOGRULAMA: saha saat listeleme hala kirik: %', v_hata;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND p.proname IN ('_match_refund_exact','_match_refund_partial','_match_charge_profile')
      AND (has_function_privilege('anon', p.oid,'EXECUTE')
        OR has_function_privilege('authenticated', p.oid,'EXECUTE'))
  ) THEN
    RAISE EXCEPTION 'DOGRULAMA: iade yazicilari yeniden acilmis';
  END IF;

  RAISE NOTICE 'DOGRULAMA TAMAM: listeleme ekseni onarildi, iade yazicilari kapali.';
END $dog$;
