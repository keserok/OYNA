-- ═══════════════════════════════════════════════════════════════════════════
-- KAPILAR · ADIM 3 — ÖKSÜZ KALAN YARDIMCILAR
-- ───────────────────────────────────────────────────────────────────────────
-- Adım 1 ve 2'de bir fonksiyonun dış kapısını kapatınca, YALNIZCA o fonksiyon
-- tarafından kullanılan yardımcılar da öksüz kaldı:
--   `is_valid_tr_iban`     kapandı → `_iban_mod97` öksüz
--   `is_valid_person_name` kapandı → `_name_part_ok` öksüz
--   tarife/çalışma saati fonksiyonları kapandı → `_tr_day_index` öksüz
--   `hata_temizle_json`    kapandı → `hata_temizle_metin` öksüz
--
-- Hepsi yalnız SECURITY DEFINER fonksiyonların (çöküş kaydı, ölçüm, tarife)
-- içinden çağrılıyor; o gövdeler fonksiyon sahibinin yetkisiyle koştuğu için
-- kapı kapanması onları etkilemez. Doğrulama bunu canlı olarak sınar:
-- `hata_bildir` çağrılır, kaydın yazıldığı görülür, sonra kayıt silinir.
--
-- ── GERİ ALMA ──────────────────────────────────────────────────────────────
--   GRANT EXECUTE ON FUNCTION
--     public._iban_mod97(text), public._name_part_ok(text),
--     public._tr_day_index(text), public.hata_temizle_metin(text,integer)
--   TO anon, authenticated;
-- ═══════════════════════════════════════════════════════════════════════════

REVOKE ALL ON FUNCTION public._iban_mod97(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._name_part_ok(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._tr_day_index(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hata_temizle_metin(text,integer) FROM PUBLIC, anon, authenticated;

DO $dogrulama$
DECLARE v_acik int; v_kalan int;
BEGIN
  SELECT count(*) INTO v_acik
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname IN ('_iban_mod97','_name_part_ok','_tr_day_index','hata_temizle_metin')
    AND (has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE'));
  IF v_acik > 0 THEN RAISE EXCEPTION 'DOGRULAMA: % yardimci hala acik.', v_acik; END IF;

  -- Gizlilik elegi hala calisiyor mu? (cokme kaydi ve olcum bunu kullanir)
  PERFORM public.hata_bildir('deneme-kapi-denetimi','migration','', 'test','3.0.0','test','{}'::jsonb);
  DELETE FROM public.istemci_hatalari WHERE mesaj = 'deneme-kapi-denetimi';

  -- Erisim kurallarinda kullanilan 4 yardimci ACIK kalmali.
  SELECT count(*) INTO v_kalan
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname IN ('_hire_side_for','_is_match_participant','_is_team_admin','_is_team_member')
    AND has_function_privilege('authenticated',p.oid,'EXECUTE');
  IF v_kalan <> 4 THEN
    RAISE EXCEPTION 'DOGRULAMA: erisim kurallarinin kullandigi yardimcilardan % tanesi acik (4 olmali).', v_kalan;
  END IF;

  RAISE NOTICE 'Adim 3: 4 oksuz yardimci kapatildi; gizlilik elegi ve RLS yardimcilari saglam.';
END
$dogrulama$;
