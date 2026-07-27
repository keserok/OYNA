# 🗂️ OYNA Projesi Dosya ve Klasör İşlevleri Kılavuzu

Bu belge, **OYNA** projesinin kök dizinindeki karmaşıklığı azaltmak ve proje düzenini artırmak amacıyla hazırlanmıştır. Projenin işleyişini bozmamak adına tüm çekirdek kodlar ve çalışma dizinleri korunmuş, geliştirme aşamasındaki yardımcı scriptler ile kullanılmayan eski kod klasörleri `arsiv/` klasörüne, tüm dökümanlar ise `docs/` klasörüne taşınmıştır.

Aşağıda projenin tüm bileşenleri, klasörleri ve dosyaları işlevlerine göre gruplandırılmıştır.

---

## 📁 1. Ana Uygulama Klasörleri (Core Application Folders)

Bu klasörler, uygulamanın çalışması için gereken ön yüz (frontend) bileşenlerini, ekran tasarımlarını ve istemci mantığını barındırır.

*   **`components/`**: Uygulama genelinde paylaşılan premium UI bileşenleridir.
    *   [BottomNav.tsx](file:///Users/kerem/Desktop/Oyna_App_Kaynak%20Back%20Anti%20kopyas%C4%B1/components/BottomNav.tsx): Mobil uyumlu alt navigasyon barı.
    *   [FifaCard.tsx](file:///Users/kerem/Desktop/Oyna_App_Kaynak%20Back%20Anti%20kopyas%C4%B1/components/FifaCard.tsx): FIFA Ultimate Team (FUT) tarzı animasyonlu kart tasarımı.
    *   [PlayerCard.tsx](file:///Users/kerem/Desktop/Oyna_App_Kaynak%20Back%20Anti%20kopyas%C4%B1/components/PlayerCard.tsx), [RookiePlayerCard.tsx](file:///Users/kerem/Desktop/Oyna_App_Kaynak%20Back%20Anti%20kopyas%C4%B1/components/RookiePlayerCard.tsx): Oyuncu profili kartları.
    *   [LiveTacticBoard.tsx](file:///Users/kerem/Desktop/Oyna_App_Kaynak%20Back%20Anti%20kopyas%C4%B1/components/LiveTacticBoard.tsx), [TeamLineupBoard.tsx](file:///Users/kerem/Desktop/Oyna_App_Kaynak%20Back%20Anti%20kopyas%C4%B1/components/TeamLineupBoard.tsx), [SharedPitch.tsx](file:///Users/kerem/Desktop/Oyna_App_Kaynak%20Back%20Anti%20kopyas%C4%B1/components/SharedPitch.tsx): Taktik Stüdyo'da çalışan, `framer-motion` ile sürükle-bırak destekli interaktif taktik sahalarıdır.
    *   [TeamCreatorWizard.tsx](file:///Users/kerem/Desktop/Oyna_App_Kaynak%20Back%20Anti%20kopyas%C4%B1/components/TeamCreatorWizard.tsx), [CommunityApplicationWizard.tsx](file:///Users/kerem/Desktop/Oyna_App_Kaynak%20Back%20Anti%20kopyas%C4%B1/components/CommunityApplicationWizard.tsx): Adım adım sihirbaz formları.
*   **`views/`**: Kök dizinde yer alan ve [App.tsx](file:///Users/kerem/Desktop/Oyna_App_Kaynak%20Back%20Anti%20kopyas%C4%B1/App.tsx) içinde lazy-load edilerek render edilen **ana ekranlardır (views)**. Öne çıkanlar:
    *   [Dashboard.tsx](file:///Users/kerem/Desktop/Oyna_App_Kaynak%20Back%20Anti%20kopyas%C4%B1/views/Dashboard.tsx): Oyuncunun ana akış ekranı (aktif maçlar, hızlı kiralama, duyurular vb.).
    *   [MatchDiscovery.tsx](file:///Users/kerem/Desktop/Oyna_App_Kaynak%20Back%20Anti%20kopyas%C4%B1/views/MatchDiscovery.tsx): Aktif açık maç listeleri.
    *   [MatchJoin.tsx](file:///Users/kerem/Desktop/Oyna_App_Kaynak%20Back%20Anti%20kopyas%C4%B1/views/MatchJoin.tsx): Maç slotlarına katılım, kaleci/hakem davet arayüzü.
    *   [Studio.tsx](file:///Users/kerem/Desktop/Oyna_App_Kaynak%20Back%20Anti%20kopyas%C4%B1/views/Studio.tsx): Formasyon belirleme, taktik tahtası çizim aracı.
    *   [PitchDiscovery.tsx](file:///Users/kerem/Desktop/Oyna_App_Kaynak%20Back%20Anti%20kopyas%C4%B1/views/PitchDiscovery.tsx): Leaflet entegrasyonlu, Airbnb stili fiyat pinli harita.
    *   [OwnerPanel.tsx](file:///Users/kerem/Desktop/Oyna_App_Kaynak%20Back%20Anti%20kopyas%C4%B1/views/OwnerPanel.tsx): Halı saha sahiplerinin doluluk ve fiyat yönettiği B2B panel.
    *   [ServiceDashboard.tsx](file:///Users/kerem/Desktop/Oyna_App_Kaynak%20Back%20Anti%20kopyas%C4%B1/views/ServiceDashboard.tsx): Kaleci ve Hakemlerin gelen teklifleri onayladığı portal.
*   **`services/`**: Veritabanı sorguları ve harita tabanlı arama servislerinin yer aldığı katmandır.
    *   [db.ts](file:///Users/kerem/Desktop/Oyna_App_Kaynak%20Back%20Anti%20kopyas%C4%B1/services/db.ts): Genel veritabanı bağlantı yardımcıları.
    *   [geoService.ts](file:///Users/kerem/Desktop/Oyna_App_Kaynak%20Back%20Anti%20kopyas%C4%B1/services/geoService.ts): Geohash tabanlı yakınlık sorgularını (`getPitchesWithinRadius`) paralel çalıştırarak en yakın sahaları getiren kritik bileşendir.
    *   [matchService.ts](file:///Users/kerem/Desktop/Oyna_App_Kaynak%20Back%20Anti%20kopyas%C4%B1/services/matchService.ts), [pitchService.ts](file:///Users/kerem/Desktop/Oyna_App_Kaynak%20Back%20Anti%20kopyas%C4%B1/services/pitchService.ts), [userService.ts](file:///Users/kerem/Desktop/Oyna_App_Kaynak%20Back%20Anti%20kopyas%C4%B1/services/userService.ts): Maç, tesis ve kullanıcı verilerini çeken sorgu motorlarıdır.
*   **`utils/`**: Matematiksel ve mantıksal yardımcı araçlar.
    *   [geo.ts](file:///Users/kerem/Desktop/Oyna_App_Kaynak%20Back%20Anti%20kopyas%C4%B1/utils/geo.ts): Haversine mesafe hesabı, Geohash kodlama ve komşu grid koordinat bulma motorudur.
    *   [reputationEngine.ts](file:///Users/kerem/Desktop/Oyna_App_Kaynak%20Back%20Anti%20kopyas%C4%B1/utils/reputationEngine.ts), [justice.ts](file:///Users/kerem/Desktop/Oyna_App_Kaynak%20Back%20Anti%20kopyas%C4%B1/utils/justice.ts): Puanlama, kart cezaları ve sportmenlik mantığını barındırır.
*   **`hooks/`**: React custom hookları.
    *   [useImageUpload.ts](file:///Users/kerem/Desktop/Oyna_App_Kaynak%20Back%20Anti%20kopyas%C4%B1/hooks/useImageUpload.ts): Supabase Storage veya yerel depolama için görsel yükleme yönetimi.

---

## 🗄️ 2a. Veritabanı Modülleri (Database Modules)

Uygulamanın veritabanı (Supabase) katmanı ile olan iletişimini ve yerel şema güncellemelerini yönetir.

*   **`supabaseClient.ts`**: Supabase veritabanı bağlantısını başlatan ana istemci yapılandırmasıdır.
*   **`supabaseAuth.ts`**: Supabase kimlik doğrulama (Authentication) API'lerini saran güvenli giriş/çıkış katmanıdır.
*   **`supabaseMutations.ts`**: Supabase veritabanındaki tablolara (pitches, matches, profiles, teams, vb.) veri ekleme, silme, güncelleme işlemlerini yapan ve cüzdan/konum güncelleme RPC fonksiyonlarını tetikleyen mutasyon katmanıdır.
*   **`firebaseSync.ts`**: Supabase Realtime veritabanı kanallarını dinleyerek eşzamanlı güncellemeleri (örneğin anlık slot dolulukları) Zustand store'a aktarır.
*   **`supabase/`**: Supabase yerel CLI ve şema yönetimi dizinidir.
    *   `supabase/migrations/`: Veritabanında otomatik çalıştırılan SQL şema geçiş dosyaları.
    *   `supabase/sql/`: Projede kullanılan SQL tetikleyicileri ve konum/cüzdan prosedür kodlarının yedekleri.

---

## 🔔 2b. Bildirim Modülleri (Notification Modules)

Mobil cihazlar (Capacitor) ve web için anlık (push) ve uygulama içi bildirimlerin uçtan uca akışını yönetir.

*   **`supabase/functions/send-push/`**: Supabase Edge Functions üzerinde çalışan, tetiklendiğinde Apple APNs veya Google FCM sunucularına push isteği atan TypeScript kodudur.
*   **`notifications/`**: İstemci tarafında bildirimleri yöneten klasördür.
    *   [pushService.ts](file:///Users/kerem/Desktop/Oyna_App_Kaynak%20Back%20Anti%20kopyas%C4%B1/notifications/pushService.ts): Cihaz bildirim jetonunun (token) alınması, push izinlerinin başlatılması ve Supabase Realtime aboneliğini sağlar.
    *   [notificationPreferences.ts](file:///Users/kerem/Desktop/Oyna_App_Kaynak%20Back%20Anti%20kopyas%C4%B1/notifications/notificationPreferences.ts): Kullanıcının hangi bildirimleri alacağını belirlediği tercih tablosunu yönetir.

---

## ⚙️ 3. Kök Dizin Yapılandırması ve Çekirdek Dosyalar

Uygulamanın çalışmasını başlatan, konfigürasyonu sağlayan ve projenin ayakta durmasını sağlayan kök dizin dosyalarıdır.

*   [App.tsx](file:///Users/kerem/Desktop/Oyna_App_Kaynak%20Back%20Anti%20kopyas%C4%B1/App.tsx): **Uygulama yönlendiricisi (Router) ve ana giriş kapısıdır.** Sayfa geçişleri, rol bazlı navigasyon ve impersonation (ghost mode) ayarlarını yönetir.
*   [store.ts](file:///Users/kerem/Desktop/Oyna_App_Kaynak%20Back%20Anti%20kopyas%C4%B1/store.ts): Zustand tabanlı **global state management (durum yönetimi)** dosyasıdır.
*   [types.ts](file:///Users/kerem/Desktop/Oyna_App_Kaynak%20Back%20Anti%20kopyas%C4%B1/types.ts): Proje genelinde kullanılan TypeScript tip ve arayüz tanımlarıdır.
*   [constants.ts](file:///Users/kerem/Desktop/Oyna_App_Kaynak%20Back%20Anti%20kopyas%C4%B1/constants.ts): Mock veriler ve başlangıç sabitlerini tutar.
*   [index.html](file:///Users/kerem/Desktop/Oyna_App_Kaynak%20Back%20Anti%20kopyas%C4%B1/index.html): Viewport, Google Fonts fontları ve React DOM mount div'ini barındıran HTML şablonu.
*   [index.tsx](file:///Users/kerem/Desktop/Oyna_App_Kaynak%20Back%20Anti%20kopyas%C4%B1/index.tsx): React uygulamasını başlatan ana script.
*   [index.css](file:///Users/kerem/Desktop/Oyna_App_Kaynak%20Back%20Anti%20kopyas%C4%B1/index.css): Cyberpunk neon tema renklerinin, mesh gradient animasyonlarının yapıldığı global stil dosyasıdır.
*   [vite.config.ts](file:///Users/kerem/Desktop/Oyna_App_Kaynak%20Back%20Anti%20kopyas%C4%B1/vite.config.ts): Vite derleme, alias (`@/`), port (4000) ve chunk optimizasyon ayarları.
*   [tsconfig.json](file:///Users/kerem/Desktop/Oyna_App_Kaynak%20Back%20Anti%20kopyas%C4%B1/tsconfig.json): TypeScript derleyici kuralları.
*   [capacitor.config.ts](file:///Users/kerem/Desktop/Oyna_App_Kaynak%20Back%20Anti%20kopyas%C4%B1/capacitor.config.ts): Capacitor native iOS ve Android derleme ayarları.
*   [package.json](file:///Users/kerem/Desktop/Oyna_App_Kaynak%20Back%20Anti%20kopyas%C4%B1/package.json) & `package-lock.json`: Projenin bağımlılıkları ve npm komut betikleri listesi.
*   [start.sh](file:///Users/kerem/Desktop/Oyna_App_Kaynak%20Back%20Anti%20kopyas%C4%B1/start.sh): Projeyi yerel ortamda tek tıklamayla hızlıca başlatmak için kullanılan shell scripttir.

---

## 🔀 4. Dökümanlar ve Yol Haritaları (Documents & Roadmaps)

Geliştiriciler ve yapay zeka ajanları için uygulamanın teknik tasarımını, kurallarını ve planlarını içeren Markdown dosyalarıdır. Kök dizini sade tutmak için hepsi `docs/` klasöründe toplanmıştır.

*   [docs/README.md](file:///Users/kerem/Desktop/Oyna_App_Kaynak%20Back%20Anti%20kopyas%C4%B1/docs/README.md): Genel kurulum ve proje özet belgesi.
*   [docs/OYNA_MIMARI_VE_TASARIM_DOKUMANI.md](file:///Users/kerem/Desktop/Oyna_App_Kaynak%20Back%20Anti%20kopyas%C4%B1/docs/OYNA_MIMARI_VE_TASARIM_DOKUMANI.md): Tasarım manifestosu ve Master vizyon belgesi.
*   [docs/OYNA_TASARIM_VE_MIMARI_KILAVUZU.md](file:///Users/kerem/Desktop/Oyna_App_Kaynak%20Back%20Anti%20kopyas%C4%B1/docs/OYNA_TASARIM_VE_MIMARI_KILAVUZU.md): Arayüz ve durum yönetimi prensipleri kodlama kılavuzu.
*   [docs/OYNA_MAP_GEOFIRESTORE_PLANI.md](file:///Users/kerem/Desktop/Oyna_App_Kaynak%20Back%20Anti%20kopyas%C4%B1/docs/OYNA_MAP_GEOFIRESTORE_PLANI.md): Geofirestore harita entegrasyon belgesi.
*   [docs/OYNA_BACKEND_SISTEM_MANTIGI.md](file:///Users/kerem/Desktop/Oyna_App_Kaynak%20Back%20Anti%20kopyas%C4%B1/docs/OYNA_BACKEND_SISTEM_MANTIGI.md): Veri modeli şeması ve algoritmik formül detayları.
*   [docs/OYNA_BACKEND_SORULARI.md](file:///Users/kerem/Desktop/Oyna_App_Kaynak%20Back%20Anti%20kopyas%C4%B1/docs/OYNA_BACKEND_SORULARI.md): Mimari geçiş planı soru manifestosu.
*   [docs/fikirler.md](file:///Users/kerem/Desktop/Oyna_App_Kaynak%20Back%20Anti%20kopyas%C4%B1/docs/fikirler.md) & [docs/fikirler/](file:///Users/kerem/Desktop/Oyna_App_Kaynak%20Back%20Anti%20kopyas%C4%B1/docs/fikirler): Gelecek planları ve kullanıcı analiz dökümanları.

---

## 📦 5. Arşivlenmiş Scriptler ve Yardımcı Araçlar (Archived Files)

Projenin derleme ve çalışma performansını etkilemeyen, geçmiş aşamalarda tek seferlik düzenlemeler ve testler için kullanılmış olan scriptler ile kullanılmayan eski kod klasörleri `/arsiv` klasöründe muhafaza edilmektedir:

*   `arsiv/src/` (Eski atıl frontend servisleri ve CardBuilder görünümü).
*   `arsiv/oyna/` (Atıl durumdaki Java entegrasyon kodları).
*   `arsiv/firebase-applet-config.json` (Eski Firebase bağlantı ayarları dosyası).
*   `arsiv/generate_pdf.cjs` (Kod çıktısı alan PDF oluşturucu script).
*   `arsiv/clean_profile_friends.py`: ProfileScreen'i düzenleyen script.
*   `arsiv/clean_services.py`: MatchCreate ve ServiceDashboard'u düzenleyen script.
*   `arsiv/remove_features.py`: Cüzdan ve Sadakat kartını kaldıran script.
*   `arsiv/update_comm_friends.py`: CommunityView arkadaş modülünü ekleyen script.
*   `arsiv/update_community_view.py`: CommunityView'e tabları ekleyen script.
*   `arsiv/test_formations.py`: Studio formasyon slot koordinatlarını test eden script.
*   `arsiv/test_hakem.js` & `arsiv/check.cjs`: Playwright UI test scriptleri.
*   `arsiv/check_db.mjs` & `arsiv/create_tables.mjs`: Supabase tablo doğrulama ve check scriptleri.
*   `arsiv/seed-script-runner.mjs` & `arsiv/seed_cli.ts`: Veritabanı seed scriptleri.
*   `arsiv/export.py` & `arsiv/export_codebase.py`: Kod çıktısı alan export scriptleri.
*   `arsiv/oyna_codebase.txt`: Kod birleştirme çıktısı.
*   `arsiv/Oyna_App_Kaynak.zip` & `arsiv/Oyna_App_Kodlar.pdf`: Eski kod yedekleri.
*   `arsiv/firestore.rules`: Eski Firebase kuralları dosyası.
*   `arsiv/vite_output.log`: Vite çıktı log dosyası.
