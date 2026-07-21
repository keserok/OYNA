# Saha Sahibi Modülü — Karar Soruları (42 soru)

> 2026-07-20 oturumu: "3 saha / 1 saha" tutarsızlığının kök nedeni çözüldü ve
> net talimat verilen maddeler uygulandı (aşağıda "✅ uygulandı" işaretli).
> Bu doküman kalan kararları netleştirmek için hazırlandı. Her soruda **Önerim**
> işaretli — cevap verilmedikçe önerilen varsayılan uygulanır/korunur.
> Cevap formatı örneği: "1A, 2B, 3: kendi notum..." yeterli.

## A. Saha görünürlüğü ve seçim (kök çözüm) — ✅ çekirdek uygulandı

Uygulanan: Oyuncu tesis detayında sahalar artık tek tek seçilebilir kart
(görsel + fiyat + zemin + ölçü + kapasite); müsaitlik seçili sahanın kendi
verisinden; galeri sahaya özel görsele geçer; sahibin kapattığı saatler
oyuncuda gri KAPALI.

1. **Saha kartı sırası:** Owner panelindeki sıralama (sort_order) esas alındı. Doğru mu, yoksa "en ucuz önce" gibi otomatik sıralama mı istersin? **Önerim: owner sırası (A).**
2. **Görsel yedeği:** Sahanın kendi fotoğrafı yoksa tesis kapak görseli gösteriliyor. (A) Böyle kalsın **(Önerim)**, (B) nötr yer tutucu, (C) saha fotoğrafı yayın şartı olsun.
3. **Onay bekleyen (pending) tesis** oyuncuya tamamen görünmez (mevcut). (A) Kalsın **(Önerim)**, (B) "Yakında" rozetiyle görünsün ama rezervasyon kapalı.
4. **Tesis genel müsaitlik özeti:** Saha seçmeden önce "3 sahadan 2'si şu an boş" gibi bir özet şerit eklensin mi? **Önerim: evet, ikinci turda.**
5. **Pasif saha (is_active=false)** oyuncuda hiç görünmüyor (mevcut). Owner panelinde "pasif" rozetiyle listelenip geri açılabilsin mi? **Önerim: evet — yanlışlıkla silinen saha kurtarılabilmeli.**

## B. Fotoğraf standardı — ✅ 16:9 merkez kırpma uygulandı

6. **Oran:** 16:9 yatay uygulandı (mobil kart + galeri standardı). Onaylıyor musun, yoksa 4:3 mü istersin?
7. **Kırpma deneyimi:** Şu an otomatik MERKEZ kırpma. Yükleme sırasında kullanıcıya elle kırpma aracı (sürükle-konumla) eklensin mi? **Önerim: ikinci turda eklensin — merkez kırpma çoğu saha fotoğrafında yeterli.**
8. **Minimum çözünürlük** 800px. 1280px'e çıkarılsın mı? **Önerim: 1280 — büyük ekranlarda bulanıklığı önler.**
9. **Limitler:** Tesis 12 / saha 8 fotoğraf. Uygun mu?
10. **Kapak kuralı:** İlk fotoğraf kapak (mevcut). Her SAHA için de en az 1 fotoğraf yüklemesi teşvik edilsin mi (rozet/uyarı ile, zorunlu değil)? **Önerim: teşvik, zorunluluk değil.**

## C. Adres ve konum

11. **Geocoding:** Adres yazılınca haritada pin otomatik konsun (elle ince ayar kalır) mı? Şu an yalnız elle pin. **Önerim: evet — MapTiler/Nominatim geocoding eklensin.**
12. **Pin zorunluluğu:** Koordinatsız tesis "yakınımdakiler"de zaten çıkmıyor. Pin, yayının ÖN ŞARTI yapılsın mı? **Önerim: evet — konumsuz tesis yayınlanamasın.**
13. **İl/ilçe girişi:** Serbest metin kirli veri üretiyor (örn. ilçe: "öööö"). Dropdown listeden seçim yapılsın mı? **Önerim: evet — bölge kapsama listesinden (region_coverage) seçim.**
14. **Ters geocoding:** Pin taşındığında adres metni otomatik güncellensin mi? **Önerim: öneri olarak göster, otomatik değiştirme.**

## D. Sahalarım (saha özellikleri)

15. **Kapasite formatı:** Oyuncu tarafında kapasite artık "7v7" gösteriliyor (14 kişi → 7v7). Sahalarım'da giriş de "5v5/6v6/7v7/8v8" seçici olsun mu? **Önerim: evet — serbest sayı yerine format seçici.**
16. **Saha ölçüsü:** "30x50" serbest metin. En/boy iki ayrı sayı alanı olsun mu? **Önerim: evet — birim (m) sabitlenir, kirli veri biter.**
17. **Kalite notları (A+/A/B/C, admin onaylı):** (A) Kalsın **(Önerim)**, (B) onaysız direkt yayınlansın, (C) kaldırılsın.
18. **Saha bazlı ek özellik rozetleri** (ör. ısıtmalı, tribün, kamera kaydı, ayakkabı kiralama): Hangileri eklensin? (çoklu seçim — kendi listeni yazabilirsin) **Önerim: ısıtma + tribün + kamera ile başla.**
19. **Saha açıklaması** oyuncu kartında tek satır gösteriliyor. Yeterli mi, detay sayfasında tam metin mi olsun?

## E. Çalışma saatleri

20. **Düzey:** Çalışma saatleri tesis geneli (mevcut, oyuncu+owner aynı kaynağı okuyor). Saha bazlı saat farkı gerekir mi? **Önerim: tesis geneli kalsın — basitlik; ihtiyaç çıkarsa saha bazlı istisna eklenir.**
21. **Slot süresi:** Her yerde 60 dk. 90 dk / 30 dk seçenekleri gereksin mi? **Önerim: 60 dk sabit kalsın (lansman).**
22. **Kapalı gün oyuncuda:** Saat listesi boş + "Bu gün kapalı" mesajı mı, tesis o günde listeden mi düşsün? **Önerim: görünür + "kapalı" mesajı.**

## F. Rezervasyon kontrolü — ✅ admin anahtarı uygulandı

Uygulanan: `booking_disabled_by_admin` alanı + sunucu guard'ı (BOOKING_DISABLED)
+ admin PitchStudio'da "Online Rezervasyon" aç/kapa + oyuncuda amber uyarı ve kilit.

23. **Kapsam:** Admin kapattığında yalnız OYUNCU rezervasyonları (uygulama) kesiliyor; tesisin kendi manuel kayıtları ve abonmanlar sürüyor. Doğru mu? **Önerim: evet, böyle kalsın.**
24. **Vitrin durumu:** Rezervasyon admin'ce kapalıyken tesis vitrinde görünmeye devam ediyor (uyarıyla). (A) Böyle kalsın **(Önerim)**, (B) tamamen gizlensin.
25. **Otomatik onay varsayılanı:** Yeni tesiste otomatik onay AÇIK (35 dk). Kalsın mı, varsayılan manuel onay mı olsun? **Önerim: açık kalsın.**

## G. Maçlar ve skor — ✅ liste + skor girişi uygulandı

Uygulanan: Menü → Maçlar artık gerçek listede (tesiste kiralanan tüm maçlar,
saha adıyla); sahibi + müdür skor girebiliyor (QR ile aynı güvenli sunucu yolu).

26. **Skor yetkisi:** Sahibi + Müdür girebiliyor; PERSONEL (staff) girebilsin mi? **Önerim: hayır — personel yalnız görsün.**
27. **Skor çakışması:** Oyuncular da skor öneriyor (match_score_proposals akışı var). Tesis girişi "doğrulanmış" mı sayılsın, oyuncu onayı mı beklensin? **Önerim: tesis girişi doğrulanmış sayılsın; itiraz match_disputes'e düşsün.**
28. **matches.court_id:** Maç tablosuna saha bağı kolonu eklensin mi (şu an saha bilgisi rezervasyon üzerinden geliyor; oyuncu maç kartında saha adı gösterilemiyor)? **Önerim: evet — ikinci turda migration + maç kartında "Capo Arena · 2. Saha".**
29. **Maç filtreleri:** Maçlar ekranına tarih aralığı / skorlu-skorsuz filtreleri eklensin mi? **Önerim: basit "Skor bekleyenler" sekmesi yeter.**

## H. Banka ve para çekme

Mevcut durum: `wallet_cashout_enabled=false` (admin kontrollü, kapalı) —
istediğin "otomatik kapalı + admin panelden ayarlanabilir" durumu ZATEN sağlanıyor.
IBAN çekim akışı iyzico bağlantısına hazır bekliyor.

30. **Çekim açıldığında akış:** (A) Talepler kuyruğa düşer, admin onaylar, manuel EFT **(Önerim — lansman)**, (B) iyzico otomatik payout (canlı anahtarlar bağlanınca).
31. **IBAN doğrulama:** (A) Format + hesap sahibi adı beyanı + ilk çekimde admin kontrolü **(Önerim)**, (B) yalnız format doğrulama.
32. **Banka hesabı görünürlüğü:** Yalnız SAHİP ekleyip görüyor (müdür/personel göremez — mevcut). Onaylıyor musun? **Önerim: evet.**

## I. Fiyatlandırma — ✅ sahte fiyat fallback'i kaldırıldı

Uygulanan: Takvimde tarifesiz saat artık "Tarife yok" gösteriyor (eski gömülü
3200₺/2000₺ kaldırıldı); tarifesiz saate manuel rezervasyon fiyatsız yazılamıyor.

33. **Tarife düzeyi:** Tarifeler tesis geneli; `pitch_tariffs.court_id` kolonu hazır ama arayüzde saha-bazlı tarife yok. Saha bazlı fiyat farkı (halı/kapalı) için saha-bazlı tarife editörü eklensin mi? **Önerim: evet — "tüm sahalar" varsayılan + saha bazlı override.**
34. **Kapora:** Tarife bazlı kapora + tarifesizse %30 fallback (10₺ yuvarlama). Kapora oranına admin alt/üst sınırı konsun mu? **Önerim: %10–%50 arası sınır.**
35. **Tarife şablonu:** Hafta içi gündüz/akşam + hafta sonu + özel gün yapısı yeterli mi, saat-saat serbest matris mi istersin? **Önerim: mevcut dilimli yapı — anlaşılır ve yeterli.**

## J. Takvim — ✅ istenen 4 madde uygulandı

Uygulanan: İlk ekran aktif saatlerle açılıyor ("Tüm saatler" anahtarı var);
Tesis + Hafta modları kaldırıldı; 30 günlük kaydırılabilir gün şeridi; aylık
görünümde gün seçince doğrudan o günün saat ekranı açılıyor (gerçek ay grid'i).

36. **Geçmiş günler:** Şerit bugünden ileri 30 gün. Geçmiş günlere bakış yalnız aylık görünümden. Yeterli mi, şeride 7 gün geriye de eklensin mi? **Önerim: aylıktan erişim yeter.**
37. **Aylık gün hücreleri:** Doluluk yoğunluğu (nokta/renk) gösterilsin mi? Ay geneli rezervasyon sorgusu gerektirir. **Önerim: evet, ikinci turda.**
38. **Bugün için geçmiş saatler:** Bugünün ekranında, geçmiş saatler listede duruyor. Otomatik olarak şu anki saate kaydırılsın mı? **Önerim: evet — küçük bir dokunuş, ekleyeyim.**

## K. Özet widget'ları ve bildirimler

39. **Varsayılan açık widget'lar:** Bugünkü Ciro / Doluluk / Onay Bekleyen / Yaklaşan Maçlar — hangileri varsayılan açık olsun? (çoklu seçim) **Önerim: dördü de açık.**
40. **Bildirim tercihleri:** Şu an yalnız cihazda (localStorage). Profile taşınsın (cihazlar arası senkron) ve olay bazlı olsun mu: yeni rezervasyon / iptal / kapora ödendi / günlük özet? **Önerim: evet — profiles tablosuna owner_notification_prefs jsonb.**
41. **Push:** `push_live_enabled=false`. Owner bildirimleri push olarak da gitsin mi (yalnız uygulama içi yerine)? **Önerim: kapora + yeni rezervasyon push, gerisi uygulama içi.**

## L. Alt menü (bottom nav)

42. **Sekme düzeni:** Mevcut: Özet / Takvim / Finans / Ekip / Menü ("Sahalarım" menü içinde). (A) Böyle kalsın, (B) **Özet / Takvim / Sahalarım / Finans / Menü** — Ekip menüye iner **(Önerim: B — sahalar işin kalbi, tek dokunuş uzakta olmalı)**.

---

### Cevap bekleyen kritik 5 soru (öncelik sırası için)
Hepsine vakit yoksa şu beşi yeter: **7 (kırpma aracı), 11 (geocoding), 27 (skor çakışması), 30 (çekim akışı), 42 (alt menü)** — gerisi önerilen varsayılanlarla ilerler.
