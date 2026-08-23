-- ÖRNEK İÇERİK UYARISI (23 Ağustos 2026, kurucu kararı)
--
-- Kurucu, örnek verinin uygulamada kalmasına ve AÇIKÇA BEYAN EDİLMESİNE karar
-- verdi. Ama Apple'a söylemek, KULLANICIYA söylemiş olmuyor: bugün uygulamayı
-- indiren biri vitrindeki sahayı gerçek sanıp saat ayırtabilir, sahaya gider ve
-- rezervasyon bulamaz. Bu, Apple kuralından önce gerçek bir zarardır.
--
-- Uyarı metni KODA GÖMÜLMEZ, yapılandırmada durur: demo ekosistem silindiği gün
-- anahtar boşaltılır ve uyarı kendiliğinden kaybolur — yeni paket derlemeye,
-- mağaza incelemesi beklemeye gerek kalmaz.
--
-- BOŞ DEĞER = UYARI YOK. Anahtar okunamazsa da uygulama uyarı çizmez.

INSERT INTO public.app_config (key, value, value_type, category, label, description)
VALUES (
  'ornek_icerik_uyarisi',
  '"Ordu''da yeni açılıyoruz. Şu anda gördüğün sahalar, maçlar ve oyuncular örnek içeriktir; gerçek tesisler eklendikçe burada görünecek."'::jsonb,
  'text',
  'SISTEM',
  'Örnek içerik uyarısı',
  'Ana ekranda gösterilen örnek içerik uyarısı. BOŞ bırakılırsa uyarı çizilmez. Demo ekosistem silindiğinde boşaltılmalıdır.'
)
ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value, value_type = EXCLUDED.value_type,
      label = EXCLUDED.label, description = EXCLUDED.description;

DO $dogrula$
DECLARE v_metin text;
BEGIN
  SELECT public.get_config_text('ornek_icerik_uyarisi', NULL) INTO v_metin;
  IF v_metin IS NULL OR length(trim(v_metin)) = 0 THEN
    RAISE EXCEPTION 'DOGRULAMA: ornek_icerik_uyarisi okunamiyor';
  END IF;
END;
$dogrula$;
