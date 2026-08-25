-- ════════════════════════════════════════════════════════════════════════════
-- ANONİMLEŞTİRME TAMAMLANDI: SIZAN TESİS ADLARI (24 Ağustos 2026)
-- ════════════════════════════════════════════════════════════════════════════
--
-- 16 Eylül göçü (20260916000001) gerçek tesis adlarını hukuki/ticari gerekçeyle
-- uydurma adlarla değiştirdi. Denetimde korumanın İKİ yerden delindiği çıktı:
--
-- 1) TÜRKÇE KARAKTER KAÇAĞI. Göç şunu arıyordu:
--        WHERE name = 'Cumhuriet Genclik'     (ç yok)
--    Canlıdaki değer ise ç'liydi: 'Cumhuriet Gençlik'. Eşitlik tutmadı, satır
--    güncellenmedi ve göçün kendi doğrulaması da aynı yazımı aradığı için
--    kaçağı GÖREMEDİ. Koruma sessizce delindi.
--
-- 2) MAÇ BAŞLIKLARI HİÇ ELLENMEMİŞTİ. `pitches.name` değişti ama
--    `matches.title` eski adı taşımaya devam etti. Sonuç, aynı kartta:
--        başlık "Ahmet Kuru Tesisleri Maçı"  ·  saha "Yesil Vadi Hali Saha"
--    Gelecek tarihli maçlarda hâlâ 'Capo Arena', 'Olimpiyat', 'VIP Arena',
--    'Orduspor' (gerçek bir kulüp adı) geçiyordu.
--
-- İki ayrı zarar: (a) hukuki — silinmesine karar verilen adlar yayında;
-- (b) mağaza — Apple 2.1 açısından verisi kendi içinde tutarsız, yarım
-- bırakılmış bir ürün görüntüsü.
--
-- ─── DÜZELTME ───────────────────────────────────────────────────────────────
-- Saha adı düzeltilir ve maç başlıkları saha adından YENİDEN TÜRETİLİR.
-- Doğrulama bu sefer eşitlikle değil, yasak adların HİÇBİR YERDE geçmediğini
-- arayarak yapılır — Türkçe karakter farkı bir daha aynı kaçağı üretemesin.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1) Kaçan saha adı (ç'li yazım)
--
-- `trg_protect_pitch_identity` saha adı/konum değişikliğini yönetici onayına
-- bağlar (is_admin()). Doğru bir korumadır ve KALMALIDIR: tesis sahibinin
-- vitrindeki kimliği tek başına değiştirmesini engeller. Göç bağlamında
-- `auth.uid()` NULL olduğu için is_admin() false döner; koruma bu tek
-- ifade boyunca bilinçli olarak devre dışı bırakılıp HEMEN geri açılır.
ALTER TABLE public.pitches DISABLE TRIGGER trg_protect_pitch_identity;

UPDATE public.pitches
   SET name = 'Meydan Gençlik Sahası'
 WHERE name ILIKE 'Cumhuri%Gen%lik';

ALTER TABLE public.pitches ENABLE TRIGGER trg_protect_pitch_identity;

-- 2) Maç başlıkları saha adından türetilir
UPDATE public.matches m
   SET title = p.name || ' Maçı'
  FROM public.pitches p
 WHERE p.id = m.pitch_id
   AND m.title IS DISTINCT FROM (p.name || ' Maçı');

-- ═══ DOĞRULAMA (§7.7) ══════════════════════════════════════════════════════
DO $$
DECLARE
  v_ad text; v_kalan int;
BEGIN
  -- Yasak adların HİÇBİRİ ne sahada ne maç başlığında geçmemeli.
  -- Eşitlik DEĞİL, içerme araması: 16 Eylül göçünün hatası tam olarak
  -- eşitliğe güvenmekti.
  FOREACH v_ad IN ARRAY ARRAY['Capo', 'Olimpiyat', 'Ahmet Kuru', 'VIP Arena',
                              'Orduspor', 'Cumhuriet'] LOOP
    SELECT count(*) INTO v_kalan FROM public.pitches WHERE name ILIKE '%' || v_ad || '%';
    IF v_kalan > 0 THEN
      RAISE EXCEPTION 'DOGRULAMA: "%" adi % sahada hala geciyor', v_ad, v_kalan;
    END IF;

    SELECT count(*) INTO v_kalan FROM public.matches WHERE title ILIKE '%' || v_ad || '%';
    IF v_kalan > 0 THEN
      RAISE EXCEPTION 'DOGRULAMA: "%" adi % mac basliginda hala geciyor', v_ad, v_kalan;
    END IF;
  END LOOP;

  -- Başlık ile saha adı ayrışmış maç kalmamalı.
  SELECT count(*) INTO v_kalan
  FROM public.matches m JOIN public.pitches p ON p.id = m.pitch_id
  WHERE m.title IS DISTINCT FROM (p.name || ' Maçı');
  IF v_kalan > 0 THEN
    RAISE EXCEPTION 'DOGRULAMA: % macta baslik ile saha adi hala ayrisik', v_kalan;
  END IF;

  -- Koruma GERİ AÇILMIŞ olmalı: kapalı bırakılırsa tesis sahibi vitrindeki
  -- adını tek başına değiştirebilir hâle gelir.
  IF EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
              WHERE c.relname = 'pitches' AND t.tgname = 'trg_protect_pitch_identity'
                AND t.tgenabled = 'D') THEN
    RAISE EXCEPTION 'DOGRULAMA: saha kimligi korumasi KAPALI kaldi';
  END IF;

  RAISE NOTICE 'DOGRULAMA GECTI: sizan ad kalmadi, basliklar saha adiyla ayni';
END $$;

COMMIT;
