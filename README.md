# ⚡ OYNA - Dijital Amatör Futbol ve Halı Saha Ekosistemi

![Version](https://img.shields.io/badge/version-3.0.0-emerald)
![Status](https://img.shields.io/badge/status-production--ready-blue)
![Platform](https://img.shields.io/badge/platform-Web%20%7C%20iOS%20%7C%20Android-orange)
![Tech Stack](https://img.shields.io/badge/stack-React%2019%20%7C%20Supabase%20%7C%20Tailwind%20v4-brightgreen)

**OYNA**, sıradan bir halı saha rezervasyon sisteminin ötesinde; amatör futbol oyuncularını, kalecileri, hakemleri, takımları ve tesis sahiplerini **EA Sports FIFA Ultimate Team (FUT)** ve **Football Manager (FM)** oyunlaştırma dinamikleriyle tek bir dijital çatı altında birleştiren, **premium ve gerçek zamanlı** bir spor ekosistemidir.

---

## 🚀 Öne Çıkan Özellikler & Modüller

### 1. ⚽ Oyuncu & Takım Dünyası (Gamification)
* **FIFA Ultimate Team (FUT) Kartları:** Her oyuncu için hız, şut, pas, fizik, top sürme ve defans niteliklerini barındıran animasyonlu [FifaCard](components/FifaCard.tsx) tasarımı. Maç sonlarında **MOTM (Maçın Oyuncusu)** seçilenlerin özel animasyonlu kart açılışları.
* **Taktik Stüdyosu ([Studio.tsx](views/Studio.tsx)):** 5+1, 6+1 ve 7+1 formasyon desteği (`2-3-1`, `3-2-1` vb.). `framer-motion` tabanlı interaktif sürükle-bırak dizilim sahası ([TeamLineupBoard.tsx](components/TeamLineupBoard.tsx)) ve gerçek zamanlı taktik tahtası.
* **Takım Kurma & Yönetimi ([MyTeam.tsx](views/MyTeam.tsx)):** Kulüp oluşturma, kadro yönetimi ve Supabase ile anlık senkronizasyon.

### 2. 🧤 Hizmet Pazaryeri — Kaleci & Hakem (Talent Hub)
* **Hizmet Motoru (Faz 5):** Lisanslı kaleci ve hakemlerin başvuru, profil ve kazanç akışını yöneten servis katmanı ([ServiceApplication.tsx](views/ServiceApplication.tsx), [ServiceDashboard.tsx](views/ServiceDashboard.tsx), [ServiceProfile.tsx](views/ServiceProfile.tsx), [ServiceSettings.tsx](views/ServiceSettings.tsx)).
* **Kiralama & Teklif Verme:** Kadrolardaki eksikleri tamamlamak için kaleci veya hakem kiralama sistemi.
* **Maç Sonu Puanlama (1–10):** Hizmet veren kaleci ve hakemlerin maç bitiminde 1–10 arası değerlendirilmesi ([RefereeScoreModule.tsx](components/RefereeScoreModule.tsx)).
* **FOMO Arayüzü:** İlanların anlık kaç kişi tarafından incelendiğini gösteren dinamik ibareler (örneğin: *"🔥 12 Kaleci İnceliyor"*).
* **FP (Fair Play) & Güvenilirlik Skoru:** Toksik davranışları önlemek adına maç iptal etme, geç kalma veya sportmenlik dışı hareketlere bağlı olarak düşen/artan dinamik puanlama motoru.

### 3. 🏟️ Harita Destekli Halı Saha & Rezervasyon
* **Airbnb Stili Fiyat Pinli Harita:** Leaflet entegrasyonuyla sahaları konumlarına ve fiyat etiketlerine göre haritada filtreleme ([PitchDiscovery.tsx](views/PitchDiscovery.tsx)).
* **Dinamik Takvim & Rezervasyon:** Saha doluluk durumunun gerçek zamanlı izlenmesi ve rezervasyon isteklerinin onay akışı.
* **Güvenli Ödeme Havuzu (Split Payment):** Maç kiralama bedelinin oyuncular arasında bölüştürülmesi. Kaptan garantörlüğü (`Safety Net`) ile rezervasyon güvencesi.
* **QR Kodlu Dijital Bilet ([MatchTicket.tsx](views/MatchTicket.tsx)):** Ödeme sonrası oluşturulan, tesis girişinde okutulabilir dinamik QR kod.

### 4. 💼 B2B Tesis Yönetim Paneli (OPanel)
* **SaaS Altyapısı:** Saha sahiplerinin fiyatlandırma, doluluk, takvim rezervasyonları, tesis fotoğrafları ve menü ayarlarını doğrudan yönettiği gelişmiş yönetim portalı ([OwnerPanel.tsx](views/OwnerPanel.tsx)).
* **Rezervasyon Onaylama / Reddetme:** Gelen kiralama taleplerinin yönetimi.
* **Payout & Finans (Faz 4):** Saha sahibi ↔ admin ödeme süreçleri tek kaynakta (`payout_requests`) birleştirilmiş; tutarlı finans ve ekip yönetim ekranları.

### 5. ⚖️ Yasal Uyum Sayfaları (Faz 3)
* Üyelik Sözleşmesi ve Kullanım Şartları, Gizlilik Politikası, KVKK Aydınlatma Metni ile Mesafeli Satış Sözleşmesi & İptal/İade Politikaları sisteme entegre edilmiştir ([LegalScreen.tsx](views/LegalScreen.tsx)).

---

## 🛠️ Teknoloji Yığını

* **Ön Yüz (Frontend):** React 19, TypeScript, Vite 6.x, TailwindCSS v4 (Neon Cyberpunk tema: Deep Navy & Cyber Yellow), Zustand (Global State), Recharts, Leaflet, Framer Motion, Lucide React.
* **Arka Yüz (Backend):** Supabase (Authentication, PostgreSQL Database, Realtime, Storage, Edge Functions).
* **Mobil Altyapı:** Capacitor (iOS & Android native entegrasyonu, Push Notifications, Safe Area yapılandırması).
* **Test:** Vitest (birim testleri) ve Playwright (UI ve Admin Panel testleri).

---

## 📂 Proje Yapısı

Proje kök dizini karmaşayı önlemek için optimize edilmiştir:

```bash
OYNA_App/
├── components/          # Paylaşılan premium UI bileşenleri (FifaCard, TeamLineupBoard vb.)
├── views/               # Lazy-loaded ana ekranlar (Dashboard, Marketplace, Studio, OwnerPanel, Service* vb.)
├── services/            # Veritabanı sorguları ve servisleri (geoService, matchService, pitchService)
├── store/               # Zustand store dilimleri (player & admin state)
├── admin-panel/         # OPanel/GodView yönetici arayüzü ve deploy araçları
├── notifications/       # Push bildirim entegrasyonu ve kullanıcı tercihleri
├── hooks/               # Custom React hook'ları (useImageUpload vb.)
├── utils/               # Yardımcı algoritmalar (Geohash, Haversine hesabı, ReputationEngine)
├── supabase/            # Supabase SQL şemaları, tetikleyiciler ve yerel CLI yapılandırması
├── docs/                # Detaylı mimari, tasarım ve veritabanı kılavuzları
├── scripts/             # DB sorgu, RLS policy üretici ve demo veri seed araçları
├── tests/               # Vitest birim testleri ve Playwright entegrasyon testleri
├── App.tsx              # Ana yönlendirici (Router) ve rol bazlı geçişler
├── store.ts             # Zustand global state management
├── types.ts             # TypeScript arayüz ve enum tanımları
├── index.css            # Global CSS ve cyberpunk tema stil tanımları
└── capacitor.config.ts  # Mobil platform derleme ayarları
```

---

## 🚀 Kurulum ve Çalıştırma

### Gereksinimler
* Node.js 18 veya üzeri
* npm
* Supabase CLI (Veritabanı işlemleri için opsiyonel)

### 1. Bağımlılıkları Yükleme
```bash
npm install
```

### 2. Çevre Değişkenleri
Projenin çalışması için kök dizinde bir `.env` dosyası oluşturun. Hazır şablonu kopyalayarak başlayabilirsiniz (tam liste için [.env.example](.env.example)):
```bash
cp .env.example .env
```
Zorunlu değişkenler:
```env
# Supabase (ZORUNLU)
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here

# Edge Function / admin deploy işlemleri için
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```
> Push bildirimleri (APNS/FCM), admin deploy token'ları ve geliştirme bayrakları (`VITE_DEV_MODE`) gibi opsiyonel değişkenler için [.env.example](.env.example) dosyasına bakın.

### 3. Uygulamayı Başlatma
* **Oyuncu Arayüzü (Web — Port 4000):**
  ```bash
  npm run dev
  ```
* **OPanel Yönetici Arayüzü (Admin — Port 4005):**
  ```bash
  npm run dev:admin
  ```

### 4. Mobil Entegrasyon (Capacitor)
Vite build sonrası mobil platform dosyalarını senkronize etmek için:
```bash
npm run build
npx cap sync
```

### 5. Test & Lint
```bash
npm run lint        # tsc --noEmit (tip kontrolü)
npm run test:unit   # Vitest birim testleri
npm run test:admin  # Playwright admin panel testleri
```

---

## 🗄️ Veritabanı & Güvenlik Yönetimi

Veritabanı işlemleri, otomatik migration'lar ve RLS (Row Level Security) kuralları ile ilgili detaylar için [DATABASE_README.md](DATABASE_README.md) dosyasını inceleyebilirsiniz.

Sık kullanılan bazı veritabanı komutları:
* **Bağlantı Testi:**
  ```bash
  npx tsx scripts/db-query.ts --file scripts/db-queries/test-connection.sql
  ```
* **RLS Durum Kontrolü:**
  ```bash
  npx tsx scripts/db-query.ts --file scripts/db-queries/check-rls.sql
  ```
* **Demo Veri Ekleme:**
  ```bash
  npm run owner:demo:seed
  ```

---

## 📚 Ek Dökümantasyonlar

Daha detaylı analiz ve geliştirici rehberleri için `docs/` klasöründeki belgelere göz atabilirsiniz:
* [Yol Haritası](docs/OYNA_YOL_HARITASI.md) - Faz planı ve geliştirme öncelikleri.
* [Master Prensipler](docs/OYNA_MASTER_PRENSIPLER.md) - Ürün ve mimari temel prensipler.
* [Mimari ve Tasarım Belgesi](docs/eski/OYNA_MIMARI_VE_TASARIM_DOKUMANI.md) - Tasarım manifestosu ve master plan (arşiv).
* [Tasarım ve Mimari Kılavuzu](docs/eski/OYNA_TASARIM_VE_MIMARI_KILAVUZU.md) - Arayüz ve durum yönetimi standartları (arşiv).
* [Backend Sistem Mantığı](docs/eski/OYNA_BACKEND_SISTEM_MANTIGI.md) - Veritabanı şeması ve algoritmik detaylar (arşiv).
* [Dosya ve Klasör İşlevleri](DOSYALARIN_ISLEVLERI.md) - Tüm kod dosyalarının işlevsel dökümü.

---
*Developed with ❤️ for OYNA Ecosystem*
