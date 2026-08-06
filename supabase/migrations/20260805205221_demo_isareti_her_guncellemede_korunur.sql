-- ═══════════════════════════════════════════════════════════════════════════
-- DÜZELTME: demo işareti YALNIZCA kaptan değişince korunuyordu
-- ───────────────────────────────────────────────────────────────────────────
-- NASIL YAKALANDI: kapı temizliğinden sonra "her şey hâlâ çalışıyor mu" diye
-- canlıda uçtan uca sınanırken. Demo bir maçın `isDemo` alanı doğrudan false
-- yapıldı ve tetiğin bunu geri koyması bekleniyordu — koymadı.
--
-- SEBEP: tetik `BEFORE INSERT OR UPDATE OF captain_id, "creatorId"` olarak
-- kurulmuştu. Yani yalnız maç kurulurken ya da kaptan değişirken uyanıyordu.
-- `isDemo` alanına dokunan bir güncelleme tetiği HİÇ uyandırmıyordu:
-- "bir kez demo, hep demo" garantisi aslında yarım kuruluydu.
--
-- NE KADAR TEHLİKELİYDİ: normal kullanıcı `matches` tablosuna doğrudan yazamaz
-- (canlıda ölçüldü: 42501). Yani dışarıdan sömürülebilir bir açık değildi. Ama
-- bizim kendi yönetim işlemlerimizden biri demo işaretini silseydi, o demo maç
-- sessizce "gerçek maç" sayılır ve kurucunun kuzey yıldızı ölçüsünü
-- ("başarılı maç") şişirirdi. Ölçünün yalan söylemesi, ölçmemekten kötüdür.
--
-- ÇÖZÜM: aynı fonksiyon, artık HER güncellemede koşuyor. Fonksiyon kuralı
-- değişmedi: kaptanı demo olan maç her zaman demo kalır.
--
-- ── GERİ ALMA ──────────────────────────────────────────────────────────────
--   DROP TRIGGER IF EXISTS trg_demo_isareti_mac ON public.matches;
--   CREATE TRIGGER trg_demo_isareti_mac
--     BEFORE INSERT OR UPDATE OF captain_id, "creatorId" ON public.matches
--     FOR EACH ROW EXECUTE FUNCTION public.demo_isareti_mac();
-- ═══════════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_demo_isareti_mac ON public.matches;
CREATE TRIGGER trg_demo_isareti_mac
  BEFORE INSERT OR UPDATE ON public.matches
  FOR EACH ROW EXECUTE FUNCTION public.demo_isareti_mac();

DO $dogrulama$
DECLARE v_demo uuid; v_mac uuid; v_sonra boolean; v_gercek int;
BEGIN
  SELECT p.id INTO v_demo FROM public.profiles p WHERE COALESCE(p.is_demo,false) LIMIT 1;
  SELECT m.id INTO v_mac FROM public.matches m WHERE m.captain_id = v_demo AND m."isDemo" IS TRUE LIMIT 1;

  -- ── CANLI DENEME: yalnız sınanacak veri VARSA yapılabilir ─────────────────
  -- Bu blok tetikleyiciyi gerçek bir satır üzerinde deniyor: demo işaretini
  -- silmeye çalışıyor ve tetiğin geri koymasını bekliyor. Sıfırdan kurulan bir
  -- veritabanında (her PR önizlemesi) hiç demo maç yoktur; eski hali burada
  -- "sinanacak demo mac bulunamadi" diyerek kurulumu çökertiyordu.
  --
  -- Deneme kaldırılmadı, KOŞULA bağlandı: demo verisi olan bir veritabanında
  -- tetik korumazsa migration yine durur.
  IF v_mac IS NULL THEN
    RAISE NOTICE 'DOGRULAMA: sinanacak demo mac yok (bos veritabani) - canli deneme atlandi.';
  ELSE
    -- Demo isaretini silmeye calis: tetik geri koymali.
    UPDATE public.matches SET "isDemo" = false WHERE id = v_mac;
    SELECT "isDemo" INTO v_sonra FROM public.matches WHERE id = v_mac;
    IF v_sonra IS NOT TRUE THEN
      RAISE EXCEPTION 'DOGRULAMA: demo isareti silinebildi - tetik hala korumuyor.';
    END IF;
  END IF;

  -- Gercek (demo olmayan) mac YANLISLIKLA demo isaretlenmemeli.
  SELECT count(*) INTO v_gercek FROM public.matches m
   JOIN public.profiles p ON p.id = COALESCE(m.captain_id, m."creatorId")
   WHERE COALESCE(p.is_demo,false) = false AND m."isDemo" IS TRUE;
  IF v_gercek > 0 THEN
    RAISE EXCEPTION 'DOGRULAMA: % gercek mac yanlislikla demo isaretli.', v_gercek;
  END IF;

  RAISE NOTICE 'Demo isareti artik her guncellemede korunuyor.';
END
$dogrulama$;
