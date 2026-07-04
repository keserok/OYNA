# OYNA — Arayüz Son-Hal (UI/UX) Soru & Öneri Seti

> **Rol:** Tam Yetkili Tasarım Lideri (Tasarımcı + Frontend Mühendisi + Ürün Yöneticisi)
> **Amaç:** Oyuncu / Kaleci / Hakem / Tesis arayüzlerini ayrı branch'lerde, milyon dolarlık ürün standardına çekmek — ama aynı anda işleyişi **basitleştirip** kullanıcı deneyimini artırmak.
> **Kapsam:** Oyuncu 50 · Kaleci+Hakem 40 · Tesis 30 = **120 karar sorusu** (her biri somut öneriyle birleşik).
> **Tarih:** 2026-06-27

Her madde bir **karar sorusu + önerim** biçimindedir. Cevabını numarayla verebilirsin: `onayla / reddet / değiştir`. Toplu da diyebilirsin (ör. "Oyuncu A+B blokları onaylandı", "14, 17, 21 reddedildi", "hepsini uygula").

---

## 0. Kesişen (Cross-Cutting) Tasarım İlkeleri

Bu ilkeler dört arayüzde de geçerli ve her branch'in temelini oluşturur:

1. **Tek birincil eylem ilkesi** — Her ekranda "kullanıcı şimdi ne yapmalı" tek ve net olsun; ikincil eylemler geri çekilsin.
2. **Sürpriz yok** — Para, depozito, komisyon, iptal politikası her zaman *eylemden önce* net gösterilsin.
3. **Durum tam kapsanır** — Her liste/akış için yükleme (skeleton), boş, hata, başarı state'leri standart (`components/common/StatusState.tsx` üzerinden).
4. **Native hisset** — Capacitor mevcut: haptik geri bildirim, push bildirim, konum, kamera akışlara entegre.
5. **Sakin hareket** — Animasyonlar amaca hizmet etsin; `prefers-reduced-motion` desteklensin; sonsuz pulse/lazer yalnız anlamlıyken.
6. **Tek tasarım dili** — `index.css` token'ları + ortak bileşenler (GlassCard, NeonButton, PageLayout) her yerde; rol renkleri (oyuncu sarı / kaleci yeşil / hakem kırmızı / tesis mavi) kimlik için korunur, işlev ortaklaşır.

---

## A) OYUNCU ARAYÜZÜ — 50 Soru

### A1. Onboarding & İlk Deneyim
1. **Splash + Auth + Rol + Konum dört ayrı ekran;** ilk maça varış süresi uzun. Bunları tek akışkan onboarding'e indirelim mi? ↳ *Öneri:* Rol seçimini "sonra seç"e indirip varsayılan PLAYER ile hızlı başlat; konum iznini maç keşfinde bağlamsal iste.
2. **Yeni oyuncu boş bir Dashboard görüyor.** İlk açılışta "ilk maçını bul" odaklı karşılama ekleyelim mi? ↳ *Öneri:* Örnek/yakın maç kartları + tek dokunuşla katıl + 3 adımlık "nasıl çalışır" mini-tur.
3. **Rol seçim ekranı görsel olarak ağır** (orb/particle). Milyon dolarlık sadelik için hafifletelim mi? ↳ *Öneri:* Tek ekran, 4 net kart + mikro-açıklama; ağır parçacık efektlerini azalt.
4. **Misafir → gerçek hesap geçişinde değer net değil.** Değer önermesini gösterelim mi? ↳ *Öneri:* "Hesap aç → kartın, istatistiğin, maç geçmişin kalıcı" momenti ilk maç sonrası.
5. **Konum reddedilirse deneyim ne olacak?** Fallback tanımlayalım mı? ↳ *Öneri:* Şehir/ilçe manuel seçimi + "konumu aç, daha iyi eşleşme" yumuşak teşvik.
6. **Profil tamamlama (foto/mevki/ayak) ne zaman istensin?** ↳ *Öneri:* İlk maçtan sonra "kartını tamamla" anı — tamamlanma oranı daha yüksek olur.

### A2. Ana Sayfa & Navigasyon
7. **BottomNav'da bildirim rozeti yok.** Sekmelere canlı rozet ekleyelim mi? ↳ *Öneri:* Ana Sayfa/Sosyal'e okunmamış + yaklaşan maç rozeti.
8. **"Maçlarım" butonundaki sürekli lazer/pulse** uzun oturumda yorucu. Koşullu yapalım mı? ↳ *Öneri:* Animasyon yalnız yeni/yaklaşan maç varken; aksi halde sakin statik durum.
9. **Bento grid'de "Maç Oluştur" her oyuncuya uygun değil.** Bağlama göre önceliklendirelim mi? ↳ *Öneri:* Kaptan/sık-oynayan için öne çıkar, yeni oyuncu için "katıl" odaklı düzen.
10. **Sıradaki maç için kalıcı widget yok.** Ekleyelim mi? ↳ *Öneri:* Saha + saat + kadro doluluk + geri sayım kartı (canlı).
11. **Bildirim zili tıklanınca tam merkez açılmıyor** (sadece sayı). Açalım mı? ↳ *Öneri:* `views/Notifications.tsx`'i zile bağla; gruplu, okundu işaretli liste.
12. **Merkez sekme "Sosyal";** oysa oyuncunun #1 işi maç. Değiştirelim mi? ↳ *Öneri:* Merkez yükseltilmiş sekme "Top Oyna / Hızlı Katıl" olsun.
13. **Hızlı eylem (FAB) yok.** Ekleyelim mi? ↳ *Öneri:* "Bugün/yakında maç bul" tek dokunuş FAB ana sayfada.

### A3. Maç Keşfi & Katılım
14. **Filtre sihirbazı metinsel ve uzun.** Hızlı filtre ekleyelim mi? ↳ *Öneri:* Üstte çip filtreler (Yakınımda · Bugün · Boş kontenjan · Bütçe), detay opsiyonel.
15. **Maç kartında maliyet kırılımı yok;** ödemede sürpriz. Gösterelim mi? ↳ *Öneri:* Kartta "kişi başı toplam = açılış + depozito" net.
16. **Maç durumu görsel değil** (DRAFT/ACTIVE/LIVE/FULL). Standart koyalım mı? ↳ *Öneri:* Renk + etiket + "X saat sonra" geri sayım rozeti.
17. **Katılım lobide dağınık** (mevki + kural onayı + ödeme). 3 adıma indirelim mi? ↳ *Öneri:* Mevki → Onay → Öde; net ilerleme çubuğu.
18. **"Dolu / zaten katıldın / ödeme başarısız" durumları yok.** Ekleyelim mi? ↳ *Öneri:* Standart hata/iyileşme state'leri + tekrar dene.
19. **Kodla özel maça katılım keşiften kopuk.** Birleştirelim mi? ↳ *Öneri:* "Kodla katıl" girişini keşif üstüne sabit alan.
20. **Dizilim board'unda dolu/boş/kilitli pozisyon ayrımı belirsiz.** Netleştirelim mi? ↳ *Öneri:* Renk + ikon + etiket; "senin pozisyonun" vurgusu.
21. **Organizatör güven skoru küçük.** Belirginleştirelim mi? ↳ *Öneri:* "Güvenilir organizatör" rozeti + tamamlanan maç sayısı.
22. **Yakındaki maçlar yüklenirken gösterge yok.** Ekleyelim mi? ↳ *Öneri:* Skeleton + pull-to-refresh + "yenileniyor" durumu.
23. **Keşifte harita/liste tutarlılığı belirsiz.** Tutarlı kılalım mı? ↳ *Öneri:* Saha keşfindeki gibi liste↔harita toggle.

### A4. Oyuncu Kimliği & Kart
24. **Tier (gold/silver/bronze) nereden geliyor açıklanmıyor.** Şeffaflık ekleyelim mi? ↳ *Öneri:* Kartta "tier nasıl yükselir" mikro-yol haritası.
25. **Profili düzenleme yok.** Ekleyelim mi? ↳ *Öneri:* Profil ekranından "Profili Düzenle" (foto/mevki/bio).
26. **Kart paylaşımını viral büyüme için cilalayalım mı?** ↳ *Öneri:* Instagram story şablonu + OYNA marka çerçevesi + tek dokunuş paylaş.
27. **"Maç detayı" ile "günlük (diary)" farkı kafa karıştırıcı.** Birleştirelim mi? ↳ *Öneri:* Tek "Maç Raporu" ekranı.
28. **Karttaki stat-video (AI Vision) gerçek mi placeholder mı?** ↳ *Öneri:* Gerçekse öne çıkar; değilse şimdilik gizle, "yakında" demektense hiç gösterme.
29. **İstatistikler admin skoruna bağlı, gecikiyor.** Geçici gösterim ekleyelim mi? ↳ *Öneri:* "Skor onaylanınca güncellenecek" durumu + onaylanınca push.
30. **Karşılaştırma modu yok.** Ekleyelim mi? ↳ *Öneri:* Kartını takım/lig ortalamasıyla kıyasla — angajman artırır.

### A5. Takım & Sosyal
31. **Takımım 4 sekme yoğun.** Üye için sadeleştirelim mi? ↳ *Öneri:* Kaptan-olmayan için kısaltılmış görünüm; yönetim aksiyonları gizli.
32. **Kadro sıralama drag-handle ile gizli.** Görünür kılalım mı? ↳ *Öneri:* Açık sürükle göstergesi + uzun-bas hızlı menü.
33. **Taktik oylama (0-100 slider) tanıdık değil.** Basitleştirelim mi? ↳ *Öneri:* "Beğen / Öner / Aktif yap" üçlüsü.
34. **Takım ayarları (renk/forma/ev sahası) zor erişiliyor.** Öne çıkaralım mı? ↳ *Öneri:* Genel sekmede "Takım Ayarları" girişi.
35. **"Online" noktası gerçek-zaman mı son-görülme mi belirsiz.** Netleştirelim mi? ↳ *Öneri:* "Şimdi aktif" / "son görülme" net etiket.
36. **Karat (KT) skoru hiç açıklanmıyor.** Şeffaflaştıralım mı? ↳ *Öneri:* Tooltip + "nasıl hesaplanır" bilgi sayfası.
37. **Rakip Bul haritasında pinler üst üste biniyor.** Optimize edelim mi? ↳ *Öneri:* Kümeleme (clustering) + "benzer seviye" otofiltre.
38. **"Meydan oku (KARŞILAŞ)" akışı belirsiz** (davet mi maç mı?). Netleştirelim mi? ↳ *Öneri:* Tek net "maç teklif et" akışı + durum takibi.

### A6. Saha Rezervasyonu
39. **Saha keşfinde sıralama yok.** Ekleyelim mi? ↳ *Öneri:* Puan/mesafe/fiyat sıralaması + kayıtlı filtre.
40. **Slot zaman gridi küçük ekranda yoğun.** İyileştirelim mi? ↳ *Öneri:* Daha büyük dokunma hedefleri + sabah/öğlen/akşam segmentli görünüm.
41. **Depozito inline açıklanmıyor.** Ekleyelim mi? ↳ *Öneri:* Slot seçiminde "depozito nedir, ne zaman iade" mikro-açıklama.
42. **Tekrar rezerve hızlı yolu yok.** Ekleyelim mi? ↳ *Öneri:* Favori sahalar + "son rezervasyondan tekrar et".

### A7. Ödeme & Cüzdan
43. **Cüzdan 3 sekme oyuncu için fazla.** Sadeleştirelim mi? ↳ *Öneri:* Oyuncu için "bakiye + işlem geçmişi + filtre"; sağlayıcı detayları gizli.
44. **IBAN alanı formatsız/örneksiz, hata kaynağı.** Düzeltelim mi? ↳ *Öneri:* Maskeleme + canlı doğrulama + örnek format.
45. **Katılımdan önce "tahmini toplam" yok.** Ekleyelim mi? ↳ *Öneri:* Katıl öncesi net fiyat onay ekranı.
46. **Kart yönetimi sade değil.** İyileştirelim mi? ↳ *Öneri:* Kayıtlı kart + varsayılan kart + (opsiyonel) tek-dokunuş ödeme.

### A8. Maç Sonrası
47. **10+ oyuncuyu tek ekranda puanlamak yorucu.** Akıcılaştıralım mı? ↳ *Öneri:* "Hızlı puanla" (kart kart swipe) + opsiyonel atla.
48. **Sparkle animasyonu rekabetçiye çocukça gelebilir.** Olgunlaştıralım mı? ↳ *Öneri:* Daha sade, premium tamamlanma anı (haptik + minimal onay).
49. **Maç raporu stat'ları eksikse "beklemede" görünüyor.** Netleştirelim mi? ↳ *Öneri:* "Skor girilince güncellenecek" durumu + güncellenince bildirim.

### A9. Sistem & Tutarlılık
50. **Haptik / reduced-motion / standart state'ler tutarsız.** Standart uygulayalım mı? ↳ *Öneri:* Tüm oyuncu akışında Capacitor Haptics + `prefers-reduced-motion` + ortak boş/yükleme/hata bileşenleri.

---

## B) KALECİ + HAKEM ARAYÜZÜ — 40 Soru

> Ortak bir servis-sağlayıcı modeli; kimlik renkleri farklı (kaleci yeşil / hakem kırmızı), işleyiş büyük ölçüde ortak.

### B1. Başvuru & Doğrulama
1. **Başvuru formu tek uzun sayfa.** Sihirbaza çevirelim mi? ↳ *Öneri:* Çok adımlı (Kimlik → Uzmanlık/Klasman → Bölge → Ücret) + ilerleme göstergesi.
2. **Gönder öncesi önizleme yok.** Ekleyelim mi? ↳ *Öneri:* Özet/önizleme adımı + düzenle dönüşü.
3. **Onay bekleme ekranında net süre yok.** İyileştirelim mi? ↳ *Öneri:* Tahmini süre + sıradaki konum + "neyi tamamlarsan hızlanır" checklist.
4. **Reddedilince geri bildirim sınırlı.** Netleştirelim mi? ↳ *Öneri:* Net red nedeni + "şunu düzelt → tekrar başvur" yönlendirme.
5. **TC doğrulaması neden gerekiyor açıklanmıyor.** Güven metni ekleyelim mi? ↳ *Öneri:* KVKK + "neden istiyoruz, nasıl korunuyor" açıklaması.
6. **Bekleyen başvuruda belgeler görüntülenemiyor/güncellenemiyor.** Ekleyelim mi? ↳ *Öneri:* "Belgelerimi gör/güncelle" alanı.

### B2. Servis Panosu & Online Durum
7. **Online/meşgul toggle güçlü ama müsaitlik gömülü.** Açalım mı? ↳ *Öneri:* Haftalık "müsaitlik takvimi" (gün+saat) net ekran.
8. **Sekmeler tutarsız** (Wallet nav'da yok, Home içinde). Düzenleyelim mi? ↳ *Öneri:* Nav'ı sadeleştir; Cüzdan tutarlı yerde.
9. **Kaleci kimlik kartı premium, hakemde eşdeğer yok (asimetri).** Eşitleyelim mi? ↳ *Öneri:* Hakem için otorite/klasman kartı (flip).
10. **Fiyat belirlemede pazar kıyası yok.** Ekleyelim mi? ↳ *Öneri:* "Bölge ortalaması X₺, sen Y₺" canlı kıyas.
11. **Komisyon/kazanç teaser'ı net değil.** Şeffaflaştıralım mı? ↳ *Öneri:* Her yerde tutarlı brüt → komisyon → net gösterimi.
12. **Pano boşken yönlendirme yok.** Ekleyelim mi? ↳ *Öneri:* "Görünürlüğünü artır / yakındaki açık maçlara teklif ver" boş-durum CTA'sı.

### B3. Gelen Talepler & Kabul
13. **Talepte geri sayım/son geçerlilik görünmüyor.** Ekleyelim mi? ↳ *Öneri:* `expiresAt` için net geri sayım + aciliyet rengi.
14. **Kabul öncesi maç detayı yok — kör kabul.** Gösterelim mi? ↳ *Öneri:* Saha/konum/takım/format/mesafe-ETA önizleme.
15. **Yanlış dokunmaya karşı koruma yok.** Ekleyelim mi? ↳ *Öneri:* Kabul'de hızlı onay + kısa geri-al (undo).
16. **Kabul sonrası rehber yok.** Ekleyelim mi? ↳ *Öneri:* "Sırada ne var" mini checklist (yol tarifi → varış → skor).
17. **Çakışan kabul engellenmemiş.** Ekleyelim mi? ↳ *Öneri:* Aynı saat çakışma tespiti + uyarı.
18. **"Sorun bildir" sadece maç sonrası çıkıyor.** Öne alalım mı? ↳ *Öneri:* Maç öncesi "geç kalıyorum / iptal" proaktif bildirim.
19. **Yeni talep push'u net değil.** Standartlaştıralım mı? ↳ *Öneri:* Anında push + ses/haptik (Capacitor mevcut).
20. **Teklif verme pano ↔ Marketplace arasında bölünmüş.** Birleştirelim mi? ↳ *Öneri:* Tek tutarlı "iş bul → teklif ver" akışı.

### B4. Maç Günü & Canlı Takip
21. **gkStatus/refereeStatus için UI yok.** Ekleyelim mi? ↳ *Öneri:* Tek dokunuş "Yola çıktım / Vardım" + opsiyonel canlı konum (Geolocation mevcut).
22. **Maç öncesi hazırlık checklist'i yok.** Ekleyelim mi? ↳ *Öneri:* Takım listesi + saha durumu + varış onayı mini ekran.
23. **QR check-in sağlayıcıda kullanılıyor mu belirsiz.** Bağlayalım mı? ↳ *Öneri:* Varışı QR ile mühürle → ödeme tetiği.
24. **Kaptanla maç öncesi iletişim "yakında".** Açalım mı? ↳ *Öneri:* Maça özel kısa mesajlaşma kanalı.
25. **Maç yaklaşırken hatırlatma yok.** Ekleyelim mi? ↳ *Öneri:* "Maça X saat: yola çık" push hatırlatma.
26. **Sağlayıcı iptalinde net politika yok.** Tanımlayalım mı? ↳ *Öneri:* Şeffaf iptal + itibar/ceza akışı UI'ı.

### B5. Hakem Skor Girişi
27. **Skor dışında maç olayı (kart/gol atan) girişi yok.** Ekleyelim mi? ↳ *Öneri:* Genişletilmiş ama **opsiyonel** olay girişi (sarı/kırmızı, golcü).
28. **Skor mühürlenince geri alınamıyor; görsel hata riski.** Koruma artıralım mı? ↳ *Öneri:* Mühür öncesi net özet + kısa geri-al penceresi.
29. **Hakemsiz maçta skoru kim girer belirsiz.** Köprü kuralım mı? ↳ *Öneri:* Hakem yoksa "kaptanlar mutabakatı" akışına geçiş.
30. **Hakemin yönettiği maç arşivi yok.** Ekleyelim mi? ↳ *Öneri:* "Yönettiğim maçlar" + skor geçmişi.

### B6. Kazanç & Ödeme
31. **Kazanç trend grafiği yok.** Ekleyelim mi? ↳ *Öneri:* Haftalık/aylık kazanç grafiği (recharts mevcut).
32. **Ödeme serbest bırakma kaptana bağlı, belirsiz.** Netleştirelim mi? ↳ *Öneri:* "Ödeme durumu zaman çizelgesi" (kabul → maç → capture → ödeme).
33. **Çekim geçmişi/tahmini varış panoda net değil.** Tutarlı kılalım mı? ↳ *Öneri:* Cüzdanla aynı çekim akışı + durum.
34. **Performans metrikleri yok.** Ekleyelim mi? ↳ *Öneri:* Kabul oranı, ortalama puan, kazanç mini-analitik panel.

### B7. Profil, İtibar & Büyüme
35. **1-10 puan sağlayıcıya nerede görünüyor belirsiz.** Ekleyelim mi? ↳ *Öneri:* "Değerlendirmelerim" + düşük puana yanıt/itiraz.
36. **Elite/Pro rozeti tipte var, UI yok.** Ekleyelim mi? ↳ *Öneri:* "Elite nasıl olunur" ilerleme + rozet vitrini.
37. **Rol-özel istatistikler öne çıkmıyor.** Vitrin yapalım mı? ↳ *Öneri:* Kaleci: clean sheet/refleks; Hakem: yönetilen maç/klasman.
38. **RoleAppearanceRule (tesise özel rozet) sağlayıcıya görünmüyor.** Şeffaflaştıralım mı? ↳ *Öneri:* "Bu tesiste şöyle görünüyorsun" bilgisi.

### B8. Rol-Özel Ayrımlar
39. **Kaleci ve hakem aynı şablonu paylaşıyor.** Ne kadar ayrışsın? ↳ *Öneri:* Kimlik rengi/ikonografi rol-özel kalsın, işlev/akış ortak — tutarlılık + kimlik dengesi.
40. **Kaleci fiziksel (boy/yaş) + hakem klasman/deneyim eşleşmede kullanılıyor mu?** ↳ *Öneri:* Eşleşme algoritması + karta yansıt (doğru sağlayıcı–maç eşleşmesi).

---

## C) TESİS (SAHİP / OWNER) ARAYÜZÜ — 30 Soru

### C1. Onboarding
1. **Onboarding iyi ama uzun loading var.** Şeffaflaştıralım mı? ↳ *Öneri:* Granüler ilerleme + "tahmini aylık gelir" WOW'unu daha erken göster.
2. **Onboarding sonrası ilk gün boş panel.** Rehber ekleyelim mi? ↳ *Öneri:* "İlk rezervasyonunu al" kurulum checklist'i (saat + fiyat + foto).
3. **Doğrulama (verification) durumu net değil.** Netleştirelim mi? ↳ *Öneri:* "Onaya kadar ne yapabilirsin" sınırı + ilerleme.
4. **Foto/olanaklar ne zaman istensin?** ↳ *Öneri:* Minimum (isim+konum+fiyat) ile hızlı başlat, gerisi rehberli sonra.

### C2. Dashboard, Navigasyon & Durum
5. **StatusBar çoklu banner "+N" ile katlanıyor (clutter).** Toplayalım mı? ↳ *Öneri:* Tek "durum & yapılacaklar" merkezi.
6. **CommandStrip rozetleri taşıyor (responsive yok).** Düzeltelim mi? ↳ *Öneri:* Önceliklendirilmiş, taşmayan özet şeridi.
7. **KPI kartları sabit.** Özelleştirelim mi? ↳ *Öneri:* Sahibin seçebildiği KPI seti.
8. **Kilitli (plan) sekmeleri nasıl gösterelim?** ↳ *Öneri:* Gizlemek yerine "yükselt" teaser + tek net upgrade ekranı.
9. **Oto-onay geri sayımı kaçırılınca sessizce onaylıyor.** Güvenceye alalım mı? ↳ *Öneri:* Oto-onay sonrası bildirim/log + "duraklat" seçeneği.

### C3. Takvim & Rezervasyon
10. **Günlük 24 saat slot listesi yoğun.** İyileştirelim mi? ↳ *Öneri:* Doluluk ısı haritası + hızlı boş/dolu + tarih kaydırma.
11. **Boş slotta çok küçük aksiyon var.** Sadeleştirelim mi? ↳ *Öneri:* Tek "+" → bağlamsal eylem menüsü (oluştur/flash/özel fiyat/kapat).
12. **İptal 2 adımlı (güvenli ama uzun).** Hızlandıralım mı? ↳ *Öneri:* İptal nedeni şablonları (hızlı seçim).
13. **Abonelik yönetimi overflow (...) menüsünde gömülü.** Öne çıkaralım mı? ↳ *Öneri:* Duraklat/iptal/oto-yenile birincil aksiyonlar.
14. **Çakışma/çift rezervasyon kontrolü net değil.** Ekleyelim mi? ↳ *Öneri:* Hızlı oluşturmada çakışma uyarısı.
15. **Maç check-in onayı (ownerCheckIn) belirsiz.** Basitleştirelim mi? ↳ *Öneri:* QR check-in ile saha onayı tek dokunuş.
16. **Aylık/günlük + saha seçimi ayrı kontroller.** Birleştirelim mi? ↳ *Öneri:* Tek tutarlı üst kontrol şeridi.

### C4. Fiyatlandırma & Kampanya
17. **Tarife modalında "yeni tarife ekle" yok.** Ekleyelim mi? ↳ *Öneri:* Net "+ Tarife ekle" + hafta içi/sonu şablonu.
18. **Flash deal % vs mutlak fiyat kafa karıştırıcı.** Basitleştirelim mi? ↳ *Öneri:* Hazır indirim önayarları (%10/20/30) + canlı "yeni fiyat" önizleme.
19. **Özel fiyat + flash + tarife üç ayrı yerde.** Toplayalım mı? ↳ *Öneri:* Tek "Fiyat & Kampanya" merkezi.
20. **Toplu düzenleme yok.** Ekleyelim mi? ↳ *Öneri:* Haftalık/toplu fiyat & kapatma düzenleme.

### C5. Finans & Çekim
21. **Veresiye (borçlu) yönetimi 3 ayrı modale bölünmüş.** Toplayalım mı? ↳ *Öneri:* Tek "Veresiye Merkezi".
22. **Çekim modalında bekleyen geçmiş/tahmini süre yok.** Ekleyelim mi? ↳ *Öneri:* Çekim durumu zaman çizelgesi.
23. **Gider kategorileri sabit.** Esnetelim mi? ↳ *Öneri:* Özel kategori + renk.
24. **POS/online ödeme ayarı teknik, ipucu yok.** Rehberli kılalım mı? ↳ *Öneri:* Adım adım kurulum + "bağlantıyı test et".

### C6. Ayarlar Sistemi
25. **11+ ayrı ayar modalı bilişsel yük.** Toplayalım mı? ↳ *Öneri:* Sekmeli birkaç "mega ayar" ekranı.
26. **Salt-okunur (read-only) kontrolleri dağınık.** Merkezileştirelim mi? ↳ *Öneri:* Tek yetki/guard + tutarlı "bu planda kilitli" mesajı.
27. **İlişkili ayarlar ayrı modallarda** (saat ↔ tarife ↔ operasyon). Yan yana getirelim mi? ↳ *Öneri:* İlişkili ayarları tek akışta grupla.

### C7. Ekip, Operasyon & Büyüme
28. **Personel yetki seviyesi yok.** Ekleyelim mi? ↳ *Öneri:* Rol-bazlı personel yetkisi (kim neyi görür/yapar).
29. **Demo/mock veri gerçekle karışabiliyor.** Netleştirelim mi? ↳ *Öneri:* Demo → gerçek geçişini "kurulumu tamamla" akışına bağla.
30. **Büyüme aracı yok.** Ekleyelim mi? ↳ *Öneri:* "Boş saatleri doldur" akıllı önerisi (düşük doluluk → otomatik flash deal + müşteri bildirimi).

---

## Sonraki Adım — Çalışma Akışı

1. Cevaplarını topla (madde madde `onayla/reddet/değiştir` veya toplu).
2. Onaylananları **arayüz başına ayrı branch**'lere böl:
   - `feature/ui-player-polish`
   - `feature/ui-keeper-referee-polish`
   - `feature/ui-facility-polish`
3. Her branch'te: önce **akış basitleştirme** (bilgi mimarisi + navigasyon), sonra **görsel cila** (tasarım sistemi tutarlılığı), en son **mikro-etkileşim** (haptik/animasyon/state).
4. Her PR'da öncesi/sonrası ekran karşılaştırması.

> Not: Cevaplarınla bu doküman "onaylı kapsam" haline gelir ve her branch'in yol haritası olur.
