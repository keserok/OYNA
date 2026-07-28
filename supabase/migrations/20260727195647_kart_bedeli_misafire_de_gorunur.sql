-- ÜRETİMDEN GERİ ÇEKİLDİ (defter sapması onarımı, 2026-07-28)
-- Kart işlem bedeli kotası misafire de açık olmalı: kullanıcı üye olmadan
-- ödeme ekranını görebiliyor (ödeme anında üyelik kapısı çıkıyor). Kota anon'a
-- kapalı kaldığında ekran bedeli GÖSTERMİYOR ama sunucu bedeli EKLİYORDU —
-- yani ekranda yazan tutar ile karttan çekilecek tutar ayrışıyordu.
-- Fonksiyon yalnız herkese açık bir yapılandırma sayısını (card_fee_pct)
-- okuyup aritmetik yapar; kullanıcı verisine dokunmaz.
GRANT EXECUTE ON FUNCTION public.get_card_fee_quote(numeric) TO anon;
