-- ================================================================
-- (1) "Profili Düzenle"den cinsiyet + oyun stili yazma yetkisi
-- (2) Eski/serbest pozisyon verisini 4 kanonik kovaya normalize et
-- ================================================================
-- (1) authenticated rolünün profiles üzerindeki kolon-bazlı UPDATE yetkisi
--     gender/play_style'ı içermiyordu → profil düzenleme PATCH'i 42501 ile
--     düşerdi. Satır güvenliği RLS'te (yalnız kendi satırı) + yetki-yükseltme
--     koruması trigger'da; bu iki alan gate-kritik değil, güvenle açılır.
-- (2) profiles.position artık 4 kanonik etikete oturur: Kaleci / Savunma /
--     Orta Saha / Hücum. Eski enum/serbest değerler tek seferlik map'lenir;
--     tanınmayanlar (HAKEM, serbest metin) NULL'a çekilir.
-- ================================================================

-- (1) Yetki
GRANT UPDATE (gender, play_style) ON public.profiles TO authenticated;

-- (2) Pozisyon normalizasyonu — önce bilinenleri map'le
UPDATE public.profiles SET position = 'Kaleci'
  WHERE position IN ('KALECI', 'kaleci');
UPDATE public.profiles SET position = 'Savunma'
  WHERE position IN ('STOPER', 'DEFANS', 'BEK', 'LIBERO', 'defans', 'Defans', 'Stoper');
UPDATE public.profiles SET position = 'Orta Saha'
  WHERE position IN ('ORTA_SAHA', 'ORTA SAHA', 'orta', 'Ortasaha');
UPDATE public.profiles SET position = 'Hücum'
  WHERE position IN ('FORVET', 'SANTRFOR', 'SAG_KANAT', 'SOL_KANAT', 'KANAT', 'forvet', 'Forvet');

-- Kalan tanınmayan/serbest değerler (ör. HAKEM, Lsm, Kırıcı) → NULL
UPDATE public.profiles
  SET position = NULL
  WHERE position IS NOT NULL
    AND position NOT IN ('Kaleci', 'Savunma', 'Orta Saha', 'Hücum');
