-- ÖRNEK TESİS ADLARI UYDURMA ADLARA ÇEVRİLDİ (23 Ağustos 2026, kurucu kararı)
--
-- Kurucu: "hepsi örnek veri, gerçek anlaşma yok". Yayındaki adlar (Capo Arena,
-- Olimpiyat, VIP Arena, Ahmet Kuru Tesisleri, Orduspor, Cumhuriet Gençlik)
-- gerçek işletme adlarıysa, o işletmeler adına rezervasyon kabul ediyormuş gibi
-- görünmüş oluruz; "Orduspor" ayrıca bir kulüp adıdır. Bu, Apple 3.2.2'den önce
-- ticari ve hukuki bir risktir.
--
-- TETİKLEYİCİ NEDEN KAPATILIYOR: trg_protect_pitch_identity, ad/konum
-- değişikliğini yönetici onayına bağlıyor (doğru bir korumadır; saha sahibi
-- kendi kendine ad değiştiremesin diye kondu). Bu bir BAKIM göçüdür, kullanıcı
-- eylemi değil; koruma yalnız bu UPDATE'ler süresince kapatılır ve hemen geri
-- açılır. Doğrulama bloğu geri açıldığını KANITLAR — kapalı bırakmak sessiz bir
-- güvenlik açığı olurdu.

ALTER TABLE public.pitches DISABLE TRIGGER trg_protect_pitch_identity;

UPDATE public.pitches SET name = 'Ruzgar Arena'            WHERE name = 'Capo Arena';
UPDATE public.pitches SET name = 'Yildiz Vadi Hali Saha'   WHERE name = 'Olimpiyat';
UPDATE public.pitches SET name = 'Panorama Spor Tesisleri' WHERE name = 'VIP Arena';
UPDATE public.pitches SET name = 'Yesil Vadi Hali Saha'    WHERE name = 'Ahmet Kuru Tesisleri';
UPDATE public.pitches SET name = 'Safak Hali Saha'         WHERE name = 'Orduspor';
UPDATE public.pitches SET name = 'Meydan Genclik Sahasi'   WHERE name = 'Cumhuriet Genclik';

ALTER TABLE public.pitches ENABLE TRIGGER trg_protect_pitch_identity;

-- Sahiplerin adları tesis adlarından türüyordu (Hakan Capo, Kemal Olimpiyat,
-- Volkan Vip, Ahmet Kuru). Aynı gerekçeyle nötrleştirilir.
UPDATE public.profiles SET full_name = 'Ornek Tesis Sahibi 1', name = 'Ornek Tesis Sahibi 1' WHERE email = 'saha1@oyna.app';
UPDATE public.profiles SET full_name = 'Ornek Tesis Sahibi 2', name = 'Ornek Tesis Sahibi 2' WHERE email = 'saha2@oyna.app';
UPDATE public.profiles SET full_name = 'Ornek Tesis Sahibi 3', name = 'Ornek Tesis Sahibi 3' WHERE email = 'saha3@oyna.app';
UPDATE public.profiles SET full_name = 'Ornek Tesis Sahibi 4', name = 'Ornek Tesis Sahibi 4' WHERE email = 'saha4@oyna.app';

DO $dogrula$
DECLARE v_kalan int; v_tetik char;
BEGIN
  SELECT count(*) INTO v_kalan FROM public.pitches
   WHERE name IN ('Capo Arena','Olimpiyat','VIP Arena','Ahmet Kuru Tesisleri','Orduspor','Cumhuriet Genclik');
  IF v_kalan > 0 THEN
    RAISE EXCEPTION 'DOGRULAMA: % tesis eski adiyla duruyor', v_kalan;
  END IF;
  SELECT tgenabled INTO v_tetik FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
   WHERE c.relname='pitches' AND t.tgname='trg_protect_pitch_identity';
  IF v_tetik <> 'O' THEN
    RAISE EXCEPTION 'DOGRULAMA: trg_protect_pitch_identity geri acilmadi (%)', v_tetik;
  END IF;
END;
$dogrula$;
