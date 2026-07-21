-- Deploy hattı probe B (drift onarımı doğrulaması): davranışsal etkisi yoktur.
-- Amaç: DOLU remote ledger'a artımlı db push'un sonucunu kanıtlamak
-- (probe A boş-remote tam replay'de yeşildi; hata yalnız artımlıda bekleniyor).
SELECT 1;
