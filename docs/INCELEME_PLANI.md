# 🔍 OYNA — Modül Modül İnceleme Planı (Tam Kapsamlı)

> **Amaç:** Uygulamayı piyasaya "sıfır sıkıntıyla" çıkarabilmek için her modülü tek tek,
> teknik bilgi gerektirmeden, anlaşılır bir dille inceleyip durumunu raporlamak.
>
> **Bu belge bir yol haritasıdır.** Her modül incelendikçe durum işareti güncellenir.
> Oturumlar arası kaybolmaması için repoya kaydedilmiştir.

---

## 📊 Genel İlerleme Tablosu

| # | Modül | Kapsam | Durum |
|---|-------|--------|-------|
| 1 | Çekirdek & Açılış Altyapısı | App.tsx, store, types, açılış, Supabase bağlantısı | ✅ İncelendi (küçük notlar var) |
| 2 | Kimlik & Üyelik (Onboarding) | Giriş, kayıt, rol seçimi, doğrulama, konum izni | ⬜ Bekliyor |
| 3 | Oyuncu Profili & Oyunlaştırma | Profil, FIFA kartları, çaylak, liderlik tablosu | ⬜ Bekliyor |
| 4 | Saha Keşfi & Rezervasyon | Haritalı saha bulma, ilan detay, rezervasyon, takvim | ⬜ Bekliyor |
| 5 | Maç Sistemi | Maç kurma, keşif, katılım, lobi, bilet, maç sonu | ⬜ Bekliyor |
| 6 | Takım & Taktik | Takım kurma, kadro, Studio taktik tahtası, transfer | ⬜ Bekliyor |
| 7 | Pazaryeri & Hizmetler | Kaleci/Hakem ilanları, teklif, hizmet panosu | ⬜ Bekliyor |
| 8 | Ödeme & Cüzdan | Ödeme ekranı, cüzdan, bölünmüş ödeme, premium, sadakat | ⬜ Bekliyor |
| 9 | B2B Saha Sahibi Paneli (OPanel) | Doluluk, fiyat/tarife, finans, demo, moderasyon | ⬜ Bekliyor |
| 10 | Topluluk Sistemi | Topluluk görünümü, başvuru, topluluk yönetimi | ⬜ Bekliyor |
| 11 | İtibar & Adalet Motoru | Fair Play puanı, kart cezaları, sportmenlik kuralları | ⬜ Bekliyor |
| 12 | Bildirimler (Push & Uygulama İçi) | Push servisi, tercihler, Edge Function, tetikleyiciler | ⬜ Bekliyor |
| 13 | AI & Ekstra Deneyim | AI Koç (Gemini), OYNA TV, sohbet | ⬜ Bekliyor |
| 14 | Admin & Yönetim Paneli | God View, kullanıcı/saha yönetimi, denetim kaydı | ⬜ Bekliyor |
| 15 | Veritabanı & Güvenlik (Derin Denetim) | Tablolar, RLS, para güvenliği, migration'lar | ⬜ Bekliyor |

**Durum işaretleri:** ⬜ Bekliyor · 🔄 İnceleniyor · ✅ Sağlam · ⚠️ Eksik/Riskli · ❌ Çalışmıyor

---

## 🧭 Her Modülde Bakılacaklar (Standart Kontrol Listesi)

Her modül için aynı 6 başlık değerlendirilecek:

1. **Ne işe yarar?** — Modülün amacı, kullanıcı için anlamı (sade dil).
2. **Hangi dosyalar/ekranlar var?** — Modülü oluşturan parçalar.
3. **Nasıl çalışıyor?** — Kullanıcının izlediği akış, adım adım.
4. **Veri & bağlantı** — Hangi veritabanı tablolarına bağlı, veri nasıl akıyor.
5. **Durum tespiti** — Çalışıyor mu? Eksik var mı? Risk var mı? (özellikle para/güvenlik)
6. **Piyasa öncesi yapılacaklar** — Çıkıştan önce tamamlanması/test edilmesi gerekenler.

---

## 📦 Modüllerin Detaylı Kapsamı

### 1. Çekirdek & Açılış Altyapısı
- `App.tsx` (yönlendirici/router, rol bazlı geçişler, ghost/impersonation modu)
- `index.tsx`, `index.html`, `index.css` (uygulamanın başlatılması, tema)
- `store.ts` (anlık hafıza / global durum yönetimi)
- `types.ts`, `constants.ts` (veri tipleri, sabitler, mock veriler)
- `supabaseClient.ts` (veritabanı bağlantısı, "beni hatırla" oturum yönetimi)
- `vite.config.ts`, `tsconfig.json`, `capacitor.config.ts` (derleme, mobil ayarlar)
- **DEV_MODE** mantığı (Supabase yokken otomatik geliştirme modu)

### 2. Kimlik & Üyelik (Onboarding)
- `SplashScreen`, `AuthScreen`, `RoleSelection`, `LocationPrompt`
- `PendingVerificationView`, `PartnerOnboarding`
- `supabaseAuth.ts` (giriş/kayıt/çıkış), Apple Sign-In
- Rol sistemi: PLAYER, CAPTAIN, GOALKEEPER, REFEREE, OWNER, COMMUNITY_ADMIN, SUPER_ADMIN

### 3. Oyuncu Profili & Oyunlaştırma
- `ProfileScreen`, `RookieShowcase`, `Leaderboards`
- `FifaCard`, `PlayerCard`, `RookiePlayerCard` bileşenleri
- Oyuncu nitelikleri (hız, şut, pas, fizik vb.), MOTM
- `profileAdapter.ts`, `userService.ts`, `avatarHelper.ts`

### 4. Saha Keşfi & Rezervasyon
- `PitchDiscovery` (Leaflet haritası, fiyat pinli keşif), `ListingDetails`
- `MyBookings`, `BookingAddons`, `MatchCalendar`
- `pitchBookingService.ts`, `availabilityService.ts`, `usePitchAvailability.ts`
- `geoService.ts`, `utils/geo.ts` (Geohash, Haversine mesafe)
- Tablolar: pitches/courts, pitch_bookings, pitch_slot_holds, pitch_availability_exceptions

### 5. Maç Sistemi
- `MatchCreate`, `MatchDiscovery`, `MatchJoin`, `MatchesView`, `UpcomingMatchesView`
- `MatchTicket` (QR bilet), `MatchCalendar`, `MatchDiaryDetail`
- `PostMatchEval`, `PostMatchReport`, `MotmReveal`, `VotingScreen`
- `matchService.ts`, `useMatchCreate.ts`
- Tablolar: matches/individual_matches, match_registrations, player_ratings, match_score_tokens

### 6. Takım & Taktik
- `MyTeam`, `TeamCreator`, `TeamBuilder`, `Studio` (taktik tahtası)
- `LiveTacticBoard`, `TeamLineupBoard`, `SharedPitch`, `TeamCreatorWizard`, `TeamDashboard`
- `OpponentFinder`, `TransferCenter`, `TournamentBracket`
- `teamService.ts`, formasyon mantığı (5+1, 6+1, 7+1)

### 7. Pazaryeri & Hizmetler
- `Marketplace`, `MyListings`, `ListingDetails`
- `ServiceDashboard`, `ServiceProfile`, `ServiceSettings`, `ScoutDashboard`
- `MarketplaceCard`, `MarketplaceMap`, `RefereeScoreModule`
- Kaleci/Hakem kiralama, teklif verme, FOMO arayüzü
- Tablolar: goalkeepers, referees, service_offers

### 8. Ödeme & Cüzdan
- `PaymentScreen`, `WalletScreen`, `LoyaltyCard`, `PremiumScreen`
- `PitchDepositCheckout`, `paymentService.ts`
- Bölünmüş ödeme (split payment), kaptan garantörlüğü (Safety Net)
- Tablolar: wallet_transactions, payment_intents, booking_payments, owner_withdrawal_requests
- **⚠️ En kritik modül — gerçek para akışı**

### 9. B2B Saha Sahibi Paneli (OPanel)
- `OwnerPanel`, `owner/OwnerFinanceView`
- `pitchOwnerService.ts`, `tariffService.ts`, `ownerDemoService.ts`
- Doluluk/fiyat/tarife yönetimi, gelir takibi, demo veri sistemi
- Tablolar: pitch_tariffs, pitch_expenses, pitch_debtors, pitch_flash_deals, owner_pitches

### 10. Topluluk Sistemi
- `CommunityView`, `CommunityHub`, `CommunityAdminDashboard`
- `CommunityApplicationWizard`
- Tablolar: communities, community_members, community_join_requests, community_creation_requests

### 11. İtibar & Adalet Motoru
- `utils/reputationEngine.ts`, `utils/gameRules.ts`, `utils/justice.ts`
- Fair Play (FP) puanı, güvenilirlik skoru, kart cezaları, maç iptali yaptırımları
- Tablolar: match_disputes, player_ratings

### 12. Bildirimler (Push & Uygulama İçi)
- `notifications/pushService.ts`, `notifications/notificationPreferences.ts`
- `views/Notifications.tsx`
- `supabase/functions/send-push/` (Edge Function — APNs/FCM)
- SQL: triggers, rls_policies, schema_additions
- Tablolar: notifications

### 13. AI & Ekstra Deneyim
- `AICoach` (Gemini API entegrasyonu)
- `OynaTv`, `ChatScreen`

### 14. Admin & Yönetim Paneli
- `AdminDashboard`, `AdminPanel`, `admin/` klasörü (GodView, EntityTabs, UsersTab,
  PitchManager, OwnerModerationTab, PendingVerificationsTab, DeepEditModals vb.)
- `AdminLogin`, denetim kaydı
- Tablolar: admin_audit_log

### 15. Veritabanı & Güvenlik (Derin Denetim)
- Tüm `supabase/migrations/` dosyaları (30+ migration)
- RLS (Row Level Security) politikaları — kimin neyi görebileceği
- Para/cüzdan koruması, fonksiyon güvenliği (security hardening)
- `supabaseMutations.ts` (veri ekleme/güncelleme katmanı)
- `get_advisors` ile güvenlik & performans tavsiyelerinin denetimi
- **⚠️ Yatay kesen modül — tüm modülleri etkiler**

---

## 📝 İnceleme Sırası ve Mantığı

İnceleme, hem **bağımlılık sırasına** hem **kullanıcı yolculuğuna** göre dizilmiştir:

1. Önce **temel** (Modül 1) — her şeyin üzerine kurulduğu altyapı.
2. Sonra **kullanıcı yolculuğu sırası** (Modül 2–10) — bir kullanıcının uygulamada
   izlediği doğal akış: giriş → profil → saha bul → maç kur → takım → pazaryeri → ödeme.
3. Sonra **iş mantığı motorları** (Modül 11–13) — itibar, bildirim, AI.
4. En son **yönetim ve derin güvenlik denetimi** (Modül 14–15) — tüm sistemi tepeden gören katmanlar.

---

*Bu plan canlı bir belgedir; her modül tamamlandığında durum tablosu ve ilgili bölüm güncellenecektir.*

---

# 🧩 İNCELEME BULGULARI

## ✅ Modül 1 — Çekirdek & Açılış Altyapısı (Tamamlandı)

**1) Ne işe yarar?**
Bu modül uygulamanın "iskeleti"dir. Uygulama açıldığında ne olacağını, kullanıcının
hangi ekrana gideceğini, kimliğin nasıl doğrulanacağını ve tüm parçaların ortak
hafızaya (store) nasıl bağlanacağını yönetir. Görünür bir ekran değildir ama her şey
buna dayanır.

**2) Hangi dosyalar?**
`index.tsx` (başlatıcı) → `App.tsx` (657 satır, yönlendirici) → `store.ts` (964 satır,
ortak hafıza) → `types.ts` (949 satır, veri tipleri) → `constants.ts` (1312 satır,
mock/sabit veriler) → `supabaseClient.ts` (veritabanı bağlantısı). Ayar dosyaları:
`vite.config.ts`, `capacitor.config.ts`, `tsconfig.json`.

**3) Nasıl çalışıyor? (açılış akışı)**
1. `index.tsx` uygulamayı başlatır, bir **ErrorBoundary** ile sarar (bir ekran çökse
   bile tüm uygulama çökmez — iyi bir koruma).
2. `App.tsx` açılışta DEV_MODE'u kontrol eder. Supabase ayarı yoksa veya geliştirme
   modu açıksa **doğrudan Dashboard'a** girer (login atlanır). Gerçek (production)
   derlemede bu mod **asla** çalışmaz — doğru kurgulanmış.
3. Gerçek modda `SPLASH` ekranıyla başlar, sonra `onAuthStateChanged` kullanıcının
   giriş durumunu dinler.
4. **Yeni kullanıcı** ise `profiles` tablosuna kayıt açılır. Kaleci/Hakem/Saha Sahibi
   ise "onay bekliyor" (PENDING_VERIFICATION) ekranına; normal oyuncu ise konum izni
   ekranına yönlendirilir.
5. **Mevcut kullanıcı** ise rolüne göre uygun panele yönlendirilir.

**4) Veri & bağlantı**
`profiles` tablosuna bağlı (rol, doğrulama durumu, cüzdan bakiyesi, telefon/e-posta).
`supabaseClient` "Beni hatırla" özelliğini akıllıca yönetiyor: açıksa oturum kalıcı
(localStorage), kapalıysa tarayıcı kapanınca silinir (sessionStorage).

**5) Durum tespiti**
- ✅ Sağlam yönlendirme, rol bazlı geçişler, hata yakalama (ErrorBoundary).
- ✅ Performans için ekranlar "lazy-load" (ilk açılış hızlı kalsın diye parça parça yükleniyor).
- ✅ Derleme paketi `react-vendor`, `supabase-vendor`, `ui-vendor` olarak bölünmüş — iyi.
- ✅ Capacitor mobil ayarları (iOS/Android, splash, status bar, push) eksiksiz tanımlı.
- ⚠️ **Not 1:** Yeni kullanıcı profili istemci (tarayıcı) tarafından açılıyor. Güvenlik
  açısından bunun veritabanı kuralları (RLS) ile korunduğu Modül 15'te doğrulanmalı.
- ⚠️ **Not 2:** Bu ortamda `node_modules` kurulu olmadığı için tam derleme testi (`tsc`)
  yapılamadı; çıkan 2 uyarı kod hatası değil, kurulum eksikliği. Gerçek "derleniyor mu?"
  testi için bağımlılıklar kurulup `npm run lint` çalıştırılmalı.

**6) Piyasa öncesi yapılacaklar**
- [ ] `npm install` sonrası `npm run lint` ile tam derleme hatasız mı doğrula.
- [ ] Production derlemesinde `.env` değişkenlerinin (Supabase URL/key) kesinlikle
      dolu olduğunu garanti et (boşsa uygulama mock moda düşer).
- [ ] Profil oluşturma akışının RLS ile korunduğu Modül 15'te teyit edilecek.

