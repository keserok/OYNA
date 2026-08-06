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

-- ⚠️ HENÜZ DOĞMAMIŞ FONKSİYON SORUNU (sıfırdan kurulum)
-- Aşağıdaki liste canlıda çalıştığında hepsi mevcuttu. Sıfırdan kurulan bir
-- veritabanında (her PR önizlemesi) bir kısmı DAHA SONRAKİ migration'larda
-- yaratılıyor; düz `REVOKE` "function does not exist" deyip kurulumu
-- çökertiyordu. Bu blok var olanın kapısını kapatır, olmayanı atlar.
--
-- GÜVENLİK KAYBI YOK: atlanan fonksiyon açıkta kalmaz — 20260805204225 ile
-- kurulan "yeni fonksiyonlar KAPALI doğar" tetikleyicisi, sonradan yaratılan
-- her fonksiyonun PUBLIC yetkisini doğduğu anda geri alır.
DO $kapilar$
DECLARE
  r record;
  v_atlanan int := 0;
  v_kapanan int := 0;
  v_liste constant text[][] := ARRAY[
    ['public._iban_mod97(text)', 'PUBLIC, anon, authenticated'],
    ['public._name_part_ok(text)', 'PUBLIC, anon, authenticated'],
    ['public._tr_day_index(text)', 'PUBLIC, anon, authenticated'],
    ['public.hata_temizle_metin(text,integer)', 'PUBLIC, anon, authenticated']
  ];
  v_sema text;
  v_ad   text;
  v_bulundu boolean;
BEGIN
  FOR i IN 1 .. array_length(v_liste, 1) LOOP
    -- İmzadan şema ve ad ayrıştırılır: 'public.foo(uuid,text)' -> public / foo
    v_sema := split_part(split_part(v_liste[i][1], '(', 1), '.', 1);
    v_ad   := split_part(split_part(v_liste[i][1], '(', 1), '.', 2);
    v_bulundu := false;

    -- AYNI ADI taşıyan TÜM sürümler kapatılır. Doğrulama da ada göre baktığı
    -- için tek bir sürümü atlamak yanlış alarm değil, GERÇEK bir açık olurdu.
    FOR r IN
      SELECT p.oid::regprocedure::text AS imza
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = v_sema AND p.proname = v_ad AND p.prokind = 'f'
    LOOP
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %s', r.imza, v_liste[i][2]);
      v_kapanan := v_kapanan + 1;
      v_bulundu := true;
    END LOOP;

    IF NOT v_bulundu THEN
      v_atlanan := v_atlanan + 1;
    END IF;
  END LOOP;
  RAISE NOTICE '[KAPILAR] % kapi kapatildi, % fonksiyon henuz yok (atlandi).',
               v_kapanan, v_atlanan;
END $kapilar$;

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
