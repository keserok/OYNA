-- ════════════════════════════════════════════════════════════════════════════
-- SIZAN AD TEMİZLİĞİ 3. TUR: KONUM, REZERVASYON, BİLDİRİM (26 Ağustos 2026)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Aynı hatanın ÜÇÜNCÜ örneği. 16 Eylül göçü gerçek tesis adlarını sahalarda
-- değiştirdi; 20260917000004 maç BAŞLIKLARININ da eski adı taşıdığını buldu.
-- Bugün maç lobisinin başlık satırında "Olimpiyat · 2. Saha" görüldü:
-- `matches.location` alanı da hiç ellenmemişti. Tarama üç alan buldu:
--
--   matches.location      73 satır   lobi başlığı + maç kartları (herkese)
--   pitch_bookings.title   6 satır   tesis panelindeki rezervasyon listesi
--   notifications.body   715 satır   kullanıcının bildirim akışı
--
-- Ders aynı ders: bir adı "her yerde değiştirdim" demek için adın GEÇTİĞİ
-- her sütunu aramak gerekir, yazıldığı sütunları değil. Doğrulama bloğu bu
-- yüzden üç alanda da İÇERİK araması yapar.
--
-- ─── YÖNTEM ────────────────────────────────────────────────────────────────
-- · location: kaynağından yeniden türetilir (saha adı + ' · ' + kort eki).
--   Kirli satırların hepsinin pitch_id'si var; metin ameliyatı değil kaynak
--   türetmesi — 16 Eylül'ün eşitlik hatasını tekrarlamamak için.
-- · booking.title / notification.body: geçmiş kayıtlardır, kaynakları yok;
--   eski ad → yeni ad eşlemesiyle (16 Eylül göçündeki tablo) yerinde
--   değiştirilir. UZUN adlar önce: 'Ahmet Kuru Tesisleri', 'Ahmet Kuru'dan
--   önce değiştirilmeli ki yarım eşleşme artık bırakmasın.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1) MAÇ KONUMLARI — sahadan yeniden türet, kort ekini koru.
--
-- Kapsam bilinçli olarak yasak adlardan GENİŞ: sahasıyla uyuşmayan HER konum
-- yeniden türetilir. İlk deneme yalnız yasak adları düzeltiyordu ve doğrulama
-- bloğu 17 maçı yakalayıp işlemi GERİ ALDI: konumu yalnız "Altınordu" yazan
-- maçlar — yasak değil ama sahasız, karttaki başlıkla çelişen bir konum.
-- Kural tekse veri de tek olmalı: konum = saha adı (+ varsa kort eki).
UPDATE public.matches m
   SET location = p.name || CASE
         WHEN position(' · ' in m.location) > 0
         THEN ' · ' || split_part(m.location, ' · ', 2)
         ELSE '' END
  FROM public.pitches p
 WHERE p.id = m.pitch_id
   AND m.location IS NOT NULL
   AND position(p.name in m.location) <> 1;

-- 2+3) REZERVASYON BAŞLIKLARI ve BİLDİRİM GÖVDELERİ — eşleme tablosuyla
CREATE TEMP TABLE _ad_eslemesi(eski text, yeni text, sira int) ON COMMIT DROP;
INSERT INTO _ad_eslemesi VALUES
  ('Ahmet Kuru Tesisleri', 'Yesil Vadi Hali Saha',    1),
  ('Cumhuriet Gençlik',    'Meydan Gençlik Sahası',   2),
  ('Cumhuriet Genclik',    'Meydan Gençlik Sahası',   3),
  ('Capo Arena',           'Ruzgar Arena',            4),
  ('VIP Arena',            'Panorama Spor Tesisleri', 5),
  ('Olimpiyat',            'Yildiz Vadi Hali Saha',   6),
  ('Orduspor',             'Safak Hali Saha',         7);

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT eski, yeni FROM _ad_eslemesi ORDER BY sira LOOP
    UPDATE public.pitch_bookings SET title = replace(title, r.eski, r.yeni)
     WHERE title LIKE '%' || r.eski || '%';
    UPDATE public.notifications  SET body  = replace(body,  r.eski, r.yeni)
     WHERE body  LIKE '%' || r.eski || '%';
  END LOOP;
END $$;

-- ═══ DOĞRULAMA (§7.7) ══════════════════════════════════════════════════════
DO $$
DECLARE v_ad text; v_kalan int;
BEGIN
  -- 'Cumhuri' değil 'Cumhuriet' aranır: 'Cumhuriyet Mahallesi' gerçek bir
  -- sokak adıdır ve yasak değildir — geniş desen yanlış alarm üretir.
  FOREACH v_ad IN ARRAY ARRAY['Olimpiyat','Capo Arena','Ahmet Kuru',
                              'Orduspor','VIP Arena','Cumhuriet'] LOOP
    SELECT (SELECT count(*) FROM public.matches        WHERE location ILIKE '%'||v_ad||'%')
         + (SELECT count(*) FROM public.pitch_bookings WHERE title    ILIKE '%'||v_ad||'%')
         + (SELECT count(*) FROM public.notifications  WHERE body     ILIKE '%'||v_ad||'%')
      INTO v_kalan;
    IF v_kalan > 0 THEN
      RAISE EXCEPTION 'DOGRULAMA: "%" adi % satirda hala geciyor', v_ad, v_kalan;
    END IF;
  END LOOP;

  -- Konumlar sahayla tutarlı olmalı: her maçın konumu kendi sahasının
  -- adıyla BAŞLAMALI (kort eki serbest).
  SELECT count(*) INTO v_kalan
    FROM public.matches m JOIN public.pitches p ON p.id = m.pitch_id
   WHERE m.location IS NOT NULL AND position(p.name in m.location) <> 1;
  IF v_kalan > 0 THEN
    RAISE EXCEPTION 'DOGRULAMA: % macin konumu kendi sahasiyla baslamiyor', v_kalan;
  END IF;

  RAISE NOTICE 'DOGRULAMA GECTI: konum, rezervasyon ve bildirimlerde yasak ad kalmadi';
END $$;

COMMIT;
