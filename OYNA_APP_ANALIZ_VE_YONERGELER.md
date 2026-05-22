# OYNA Uygulaması Analiz ve Geliştirici Yönergeleri

Bu belge, "Oyna" uygulamasının genel çalışma mantığını, hedef kitleye (halı sahalar, kaleciler ve hakemler) sunulurken dikkat edilmesi gereken ayarlamaları ve geliştiriciler için temel teknik gereksinimleri içermektedir.

## 1. Uygulamanın Genel Çalışma Analizi ve Akışı
"Oyna" uygulaması; futbol/halı saha oyuncularını, kalecileri, hakemleri ve tesis sahiplerini tek bir platformda buluşturan kapsamlı bir pazar yeridir.
Uygulama temel olarak şu dinamikler üzerine kuruludur:
- **Kullanıcı Tipleri (Roller):** Oyuncu, Kaleci, Hakem ve Tesis Yöneticisi (Halı Saha).
- **Hızlı Kiralama & Maç Organizasyonu:** Airbnb konseptinde, tesislerin anında rezerve edilmesini (Quick Rent) sağlayan ve maçlara oyuncu, kaleci veya hakem bulunmasını kolaylaştıran bir sistem.
- **Pazar Yeri (Marketplace):** Oyuncuların eksik kadroları için dışarıdan kaleci ve hakem kiralayabildiği, kaleci ve hakemlerin ise kendi profillerini sergileyerek maçlara katılabildikleri bir alan.
- **Gerçek Zamanlı İletişim & Bildirimler:** Yaklaşan maçların gün/saat/dakika geri sayım barı, rezervasyon ve maç bildirimleri ile kullanıcıların maçları takip edebilmesi.
- **Firebase Entegrasyonu:** Gerçek zamanlı veri senkronizasyonu, yetkilendirme (Auth) ve veri tabanı (Firestore) işlemleri.

## 2. Halı Saha Tesisleri İçin Gereksinimler ve Ayarlamalar
Halı sahaların platformu aktif olarak kullanabilmesi ve maç organizasyonlarını yönetebilmeleri için aşağıdaki detayların eksiksiz olması gerekmektedir:
- **Tesis Paneli (Dashboard):** Tesis sahipleri kendilerine özel bir ekran görebilmeli. Bu ekranda aktif/yaklaşan rezervasyonlar, iptaller, saha doluluk oranları yönetilebilmelidir.
- **Ödeme Altyapısı (100% Upfront Payment):** "Hızlı Kiralama" (QuickRent) özelliği kapsamında kullanıcıların %100 ön ödeme yaparak sahaları ayırtabilmesi için ödeme (payment gateway) entegrasyonu (Iyzico, Stripe vb.) tesis esasına göre yapılandırılmalıdır.
- **Saha Kalite Analizleri ve Öne Çıkarma:** Sahaların zemin durumu, aydınlatma kalitesi, duş/kafeterya vb. imkanlarının birer metrik/rozet olarak sergilenmesi ayarlanmalıdır (Örn: "Premium Zemin", "Ücretsiz Otopark" logoları UI üzerinde).
- **Rol Yetkilendirmeleri:** `role === 'facility'` olan hesapların profil ayarlarında "Saha Yönetimi", "Fiyatlandırma", "Çalışma Saatleri" tanımlama yetkileri aktif edilmelidir.

## 3. Kaleci ve Hakemler İçin Gereksinimler ve Ayarlamalar
Dışarıdan çağrılacak yetenekler (Kaleci ve Hakemler) için platformun bir yetenek vitrini (Showcase) mantığında çalışması planlanmalıdır:
- **Profil Vitrini (Showcase Profile):** Kaleci ve hakem rolleri (`role === 'goalkeeper' | 'referee'`) için standart kullanıcıdan farklı olarak bir "İstatistik/Değerlendirme" sayfası olmalıdır (Oynanan maç sayısı, gol yememe/başarı oranı, puanlama vb.).
- **Uygunluk ve Takvim (Availability):** Kaleci ve hakemler, hangi saatlerde ve hangi bölgelerde (lokasyon) maça çıkabileceklerini takvimleri üzerinden belirleyebilmelidir.
- **Ücretlendirme (Rate Setting):** Maç başı ücret tanımlama opsiyonu. Uygulama içi ödeme veya elden ödeme modelinin net bir şekilde profilde seçilebilir olması gerekir.
- **Filtreleme & Keşfet (Discovery):** Oyuncular "Kaleci Bul" veya "Hakem Çağır" özellikleri üzerinden filtreleme yaparken listelenme algoritmasında yüksek puanlı kaleci ve hakemlerin üstte yer alması sağlanmalıdır.

## 4. Geliştiriciler İçin Notlar ve Proje Kurulumu
- **Teknoloji Yığını:** React + TypeScript + Vite. Stil yönetimi TailwindCSS benzeri veya projeye entegre UI sistemleri ile sağlanır.
- **Bağımlılıklar:** Kurulum gereksinimlerini hafifletmek için paketler `package.json` üzerinden tanımlanmıştır.
- **Backend/DB:** Firebase (Firestore, Functions, Auth). Veritabanı kuralları ve fonksiyonlar geliştirme ortamında test edilmelidir.
- **Responsive Tasarım:** Uygulama mobil odaklı cihaz boyutları (PWA/Capacitor uyumu vb.) dikkate alınarak iOS/Android standartlarına göre optimize edilmiştir.

**Uygulamayı Çalıştırma:**
```bash
# 1. Bağımlılıkları yükleyin
npm install

# 2. Geliştirme sunucusunu başlatın
npm run dev

# 3. Üretim (Production) derlemesi almak için
npm run build
```
