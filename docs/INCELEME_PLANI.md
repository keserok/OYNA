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
| 1 | Çekirdek & Açılış Altyapısı | App.tsx, store, types, açılış, Supabase bağlantısı | ✅ Doğrulandı — ÇALIŞIYOR |
| 2 | Kimlik & Üyelik (Onboarding) | Giriş, kayıt, rol seçimi, doğrulama, konum izni | ✅ İncelendi — 1 kod düzeltildi, 1 DB notu |
| 3 | Oyuncu Profili & Oyunlaştırma | Profil, FIFA kartları, çaylak, liderlik tablosu | ✅ İncelendi — 1 kritik kod düzeltildi, 2 büyük not |
| 4 | Saha Keşfi & Rezervasyon | Haritalı saha bulma, ilan detay, rezervasyon, takvim | ✅ İncelendi — 1 kritik para hatası düzeltildi, 1 tutarlılık hatası düzeltildi |
| 5 | Maç Sistemi | Maç kurma, keşif, katılım, lobi, bilet, maç sonu | ✅ İncelendi — 3 kod hatası düzeltildi, 3 büyük not |
| 6 | Takım & Taktik | Takım kurma, kadro, Studio taktik tahtası, transfer | ✅ İncelendi — 1 kod hatası düzeltildi, 3 büyük not |
| 7 | Pazaryeri & Hizmetler | Kaleci/Hakem ilanları, teklif, hizmet panosu | ✅ İncelendi — 4 kod hatası düzeltildi, 3 büyük not |
| 8 | Ödeme & Cüzdan | Ödeme ekranı, cüzdan, bölünmüş ödeme, premium, sadakat | ✅ İncelendi — 2 kod hatası düzeltildi, 4 kritik açık not |
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
- [x] `npm install` + `npm run lint` (tsc) → **0 hata.** ✅
- [x] `npm run build` (production derleme) → **başarılı, 11.7 sn'de tamamlandı.** ✅
- [x] `npm run preview` → sunucu **HTTP 200** döndü, `<title>OYNA</title>` ve React
      `#root` mount noktası sayfada mevcut. **Uygulama açılıyor.** ✅
- [ ] Production derlemesinde `.env` değişkenlerinin (Supabase URL/key) kesinlikle
      dolu olduğunu garanti et (boşsa uygulama otomatik mock/offline moda düşer —
      kod hatası değil, dağıtım/kurulum adımı).
- [ ] Profil oluşturma akışının RLS ile korunduğu Modül 15'te teyit edilecek.

**🔎 Bu kısımda düzeltilen kod hatası:** YOK. Çekirdek modülde uygulamayı çalışmaktan
alıkoyan bir kod sorunu bulunamadı. Derleme, build ve sunucu testlerinin üçü de temiz
geçti. Önceki incelemedeki 2 uyarı yalnızca `node_modules` kurulu olmamasındandı; kurulum
sonrası kayboldu.

**💡 Gelecek için optimizasyon notu (engelleyici değil):** Build sırasında bazı paketlerin
500 kB'ı aştığı uyarısı çıkıyor (`index` ~637 kB, `ui-vendor` ~580 kB, `QRScannerView`
~385 kB). Uygulama çalışıyor ama mobilde ilk açılışı hızlandırmak için ileride paket
bölme (code-splitting) iyileştirilebilir. Acil değil, lansman engelleyicisi değil.

---

## ✅ Modül 2 — Kimlik & Üyelik / Onboarding (Tamamlandı)

**1) Ne işe yarar?**
Kullanıcının uygulamaya ilk adımı: açılış (Splash) → rol seçimi → giriş/kayıt
(e-posta/telefon kodu, Google, Apple, misafir) → konum izni → (Kaleci/Hakem ise)
admin onayı bekleme. 7 farklı kullanıcı tipini doğru kapıya yönlendirir.

**2) Hangi dosyalar?**
`SplashScreen`, `AuthScreen`, `RoleSelection`, `LocationPrompt`, `PendingVerificationView`,
`PartnerOnboarding` + `supabaseAuth.ts` (giriş/kayıt/çıkış) + `services/userService.ts`
(profil senkronizasyonu, rol güncelleme).

**3) Nasıl çalışıyor?**
- **AuthScreen:** E-posta veya SMS ile 6 haneli kod (OTP) gönderip doğruluyor;
  Google/Apple ile sosyal giriş ve "misafir" girişi var. KVKK + sözleşme onay kutusu
  giriş için zorunlu — yasal açıdan doğru kurgu.
- **RoleSelection:** Oyuncu doğrudan; Kaleci/Hakem/Tesis ek bilgi (TC, telefon, fiziksel
  künye) adımlarından geçiyor. Kaleci/Hakem seçilince "onay bekliyor" moduna giriyor.
- **PendingVerificationView:** Supabase Realtime ile `verification_status` değişimini
  canlı dinliyor; admin onaylayınca konfeti + otomatik yönlendirme. Çok iyi tasarlanmış.
- **LocationPrompt:** Tarayıcı/cihaz konumunu alıp veritabanına yazıyor.

**4) Veri & bağlantı**
`profiles` tablosu (role, roles, verification_status, full_name, email, phone, konum).
Roller: PLAYER, CAPTAIN, GOALKEEPER, REFEREE, OWNER, COMMUNITY_ADMIN, SUPER_ADMIN.

**5) Durum tespiti**
- ✅ Giriş, OTP, sosyal giriş, onay-bekleme akışları sağlam ve profesyonel.
- ✅ Canlı veritabanı doğrulandı: onboarding'in yazdığı roller (PLAYER/GOALKEEPER/
  REFEREE/OWNER) canlı `role` kısıtında geçerli → **kayıt akışı canlıda çalışıyor.**
- 🔧 **DÜZELTİLDİ (kod):** `App.tsx → handleRoleSelect`, rol seçimindeki form verisini
  (camelCase: `fullName`, `tcNumber`, `age`, `height`, `weight`, `position`) doğrudan
  `profiles` tablosuna yazmaya çalışıyordu. Bu sütunlar tabloda yok (`full_name` var,
  `fullName` değil). Özellikle **Tesis Sahibi kaydında** her seferinde sessiz hata +
  veri kaybı oluyordu. Artık yalnızca gerçekten var olan sütunlar (`full_name`, `email`,
  `phone`) yazılıyor. tsc + build temiz.
- ⚠️ **DB NOTU (Modül 10 & 14'ü etkiler):** Canlı veritabanının `role` kısıtı yalnızca
  `PLAYER, GOALKEEPER, REFEREE, ADMIN, SUPER_ADMIN, OWNER` değerlerine izin veriyor;
  ama uygulama `CAPTAIN` ve `COMMUNITY_ADMIN` rollerini de kullanıyor (migration dosyası
  bunları içermesi gerektiğini söylüyor — **canlı DB migration ile uyumsuz**). Onboarding
  bunları yazmadığı için Modül 2 etkilenmiyor; fakat **admin panelinden rol değiştirme**
  ve **topluluk yöneticisi atama** akışları canlıda kısıt ihlaliyle kırılır. Düzeltme,
  canlı kısıta `CAPTAIN`/`COMMUNITY_ADMIN` (ve `ORGANIZER`) eklemek — yalnızca genişletme
  olduğu için güvenli ve geri alınabilir. **✅ ÇÖZÜLDÜ:** Kullanıcı onayıyla canlı DB'ye
  uygulandı ve migration olarak kaydedildi (`20260617000000`).
- ⚠️ **Küçük not:** "Misafir girişi" hiç oturum açmadan uygulamaya sokuyor; bazı
  ekranlar `auth.currentUser` beklediği için misafir akışında hatalar görülebilir.
  Ürünsel bir karar; ileride netleştirilecek.

**6) Piyasa öncesi yapılacaklar**
- [x] `handleRoleSelect` sütun uyuşmazlığı düzeltildi.
- [x] Canlı `role`/`roles` kısıtına `CAPTAIN` + `COMMUNITY_ADMIN` (+ `ORGANIZER`)
      eklendi. Canlı DB'ye uygulandı ve `migrations/20260617000000_align_profiles_role_constraints.sql`
      olarak repoya kaydedildi. Doğrulandı: her iki kısıt da 9 rolü kapsıyor. ✅
- [ ] "Misafir" akışının kapsamı netleştirilsin (salt görüntüleme mi, yoksa kaldırılsın mı).

---

## ✅ Modül 3 — Oyuncu Profili & Oyunlaştırma (Tamamlandı)

**1) Ne işe yarar?**
Oyuncunun kendi kimlik ekranı: FIFA tarzı oyuncu kartı (güç puanı, nitelikler), cüzdan
bakiyesi kısayolu, takımlarım kısayolu, maç/galibiyet/güven özeti ve geçmiş maç listesi.
Ayrıca "Çaylak Vitrini" (yeni kullanıcı kartı tanıtım ekranı) ve "Liderlik Tablosu" bu
modülde.

**2) Hangi dosyalar?**
`ProfileScreen.tsx`, `RookieShowcase.tsx`, `Leaderboards.tsx`, `FifaCard.tsx` (admin
düzenleme önizlemesinde kullanılıyor), `PlayerCard.tsx`, `RookiePlayerCard.tsx`,
`services/userService.ts`, `utils/avatarHelper.ts`. (`services/profileAdapter.ts`
incelemede bulundu ve **silindi** — bkz. madde 5.)

**3) Nasıl çalışıyor?**
- **ProfileScreen:** Kart önü/arkası 3D çevirme animasyonu, cüzdan/takım kısayolları,
  filtrelenebilir maç geçmişi listesi.
- **RookieShowcase:** Yeni oyunculara "Elmas/Karat" sistemini tanıtan statik bir
  vitrin ekranı (sabit demo verisiyle — bu doğru, çünkü amacı ürün tanıtımı).
- **Leaderboards:** Takım/oyuncu sıralaması, TP/Fair Play/Gol kategorileri, podyum
  animasyonu.

**4) Veri & bağlantı**
`profiles` tablosu — canlı veritabanı şeması incelendi (`execute_sql` ile gerçek sütun
listesi çekildi). Önemli bulgu: tablo **iki paralel sütun seti** içeriyor (muhtemelen
geçmişteki Firebase→Supabase geçişinden kalma):
- **Güncel/aktif kullanılan:** `full_name`, `wallet_balance`, `is_verified`, `is_banned`,
  `stats` (jsonb), `verification_status`, `avatar_url`. Bunlar `App.tsx` ve
  `supabaseMutations.ts`'teki gerçek admin yazma akışı tarafından kullanılıyor.
- **Eski/kullanılmayan kopyalar:** `name`, `wallet`, `rating`, `match_count`,
  `reliability_score`, `skill_rating`, `trust_score`, `win_count`, `total_matches`,
  `diamonds`, `oyna_id`, `friends`, `communities`, `is_looking_for_team`, `player_card`.
  Bu sütunlar DB'de var ve gerçek isimlendirmeyle (`win_count`, `total_matches`,
  `player_card`, `diamonds`) **Modül 3'ün ihtiyaç duyduğu tam alanlar** — ama hiçbir
  aktif kod yolu bunlara yazmıyordu (yalnızca silinen `profileAdapter.ts` bunlara
  yazmaya çalışıyordu, o da hiçbir yerden çağrılmıyordu).

**5) Durum tespiti**
- 🔧 **DÜZELTİLDİ (kritik kod hatası):** `ProfileScreen.tsx` giriş yapan kullanıcının
  gerçek verisini **hiç çekmiyordu**. İsim ("Burak Kaptan"), fotoğraf, yaş (26), ayak
  tercihi ("Sağ"), cüzdan bakiyesi ("1.250 ₺"), güven puanı ("100") ve kart gücü (88
  overall, altın seviye) **tamamen sabit/sahte değerlerdi** — uygulamaya giren **her
  kullanıcı, kendi profilinde aynı sahte oyuncuyu görüyordu.** Bu, ürünün en temel kimlik
  ekranında ciddi bir güven ve doğruluk sorunuydu.
  **Yapılan düzeltme:** Ekran artık `profiles` tablosundan gerçek `full_name`,
  `avatar_url`, `wallet_balance`, `reliability_score`, `win_count`, `total_matches`,
  `player_card` değerlerini çekiyor. Sahte yaş/ayak rozetleri kaldırıldı (hiçbir
  kullanıcı için gerçek karşılığı olmadığından). Kart gücü için gerçek `player_card`
  verisi varsa o kullanılıyor; yoksa abartılı sahte "88 altın kart" yerine dürüst,
  mütevazı bir "çaylak" varsayım kartı (60 overall, bronz) gösteriliyor. Maç
  geçmişi listesi gerçek `total_matches` 0 olduğunda artık sahte 5 maçlık demo
  listesini göstermiyor (boş durum mesajı çıkıyor) — tutarsız "0 maç ama 5 maç
  listesi" görünümü önlendi. `tsc` + `build` temiz.
- 🗑️ **SİLİNDİ (ölü/yanıltıcı kod):** `services/profileAdapter.ts` hiçbir yerden
  çağrılmıyordu (sadece kendi dosyasında tanımlıydı) ve dosyanın kendi yorumu "DB'ye
  yazarken HER ZAMAN bunu kullan" diyerek yanlış sütun adlarına (`name`, `wallet`,
  `is_verified`) yönlendiriyordu — bunlar DB'de var ama **eski/pasif kopyalar.**
  İleride bir geliştirici (veya AI) bu dosyayı "doğru yöntem" zannedip kullansaydı,
  veriler gerçek (`full_name`/`wallet_balance`) sütunlarından sessizce ayrışırdı. Şu an
  hiçbir çağrı noktası olmadığından silinmesi güvenli; `tsc`/`build` temiz kaldı.
- ⚠️ **AÇIK NOT 1 — Geçmiş maç listesi hâlâ tasarım/demo verisi (`MATCH_HISTORY`):**
  Gerçek, kullanıcıya özel maç geçmişini veritabanından çekecek bir servis/sorgu henüz
  yok (bu, henüz incelenmemiş **Modül 5 — Maç Sistemi** kapsamına giriyor: `matches`,
  `match_registrations`, `player_ratings` tabloları). Bu yüzden bilinçli olarak kapsamı
  Modül 3'te genişletmedim; Modül 5'te ele alınacak.
- ⚠️ **AÇIK NOT 2 — `profiles` tablosunda sütun ikilemesi (Modül 15'i ilgilendirir):**
  `name`/`full_name`, `wallet`/`wallet_balance` gibi çift sütunlar canlı DB'de duruyor.
  Hangisinin "tek doğru kaynak" olduğu artık nettir (`full_name`/`wallet_balance`) ama
  eski sütunları temizlemek (DROP COLUMN) veri kaybı riski taşıdığından kullanıcı onayı
  gerektirir — bu karar Modül 15'e (Veritabanı & Güvenlik Derin Denetim) bırakıldı,
  şimdilik dokunulmadı.
- ✅ FIFA kartı bileşeni (`PlayerCard.tsx`) ve "Çaylak Vitrini" (`RookieShowcase.tsx`)
  görsel/etkileşim açısından sağlam; `RookieShowcase` zaten kasıtlı olarak sabit tanıtım
  verisiyle çalışıyor, bu bir hata değil.
- ⚠️ **Liderlik Tablosu (`Leaderboards.tsx`) tamamen sabit demo verisiyle çalışıyor**
  (`TEAMS_DATA`, `PLAYERS_DATA`, `MY_RANK`). Gerçek puan/sıralama hesaplaması Modül 11
  (İtibar & Adalet Motoru) ve Modül 5'in tamamlanmasına bağlı; bu modülde erken/yanlış
  bir bağlama yapmak yerine net biçimde "demo veri" olarak işaretliyorum.

**6) Piyasa öncesi yapılacaklar**
- [x] `ProfileScreen` gerçek kullanıcı verisine bağlandı (isim, foto, cüzdan, güven,
      maç/galibiyet sayıları, kart verisi varsa kullanılıyor).
- [x] Sahte yaş/ayak rozetleri ve sahte "88 overall altın kart" kaldırıldı.
- [x] Ölü/yanıltıcı `profileAdapter.ts` silindi.
- [ ] Modül 5'te gerçek maç geçmişi sorgusu yazılıp `ProfileScreen` + `MATCH_HISTORY`
      kullanan diğer ekranlara (PostMatchReport, MatchDiaryDetail) bağlanmalı.
- [ ] Modül 15'te `profiles` tablosundaki çift/eski sütunların (`name`, `wallet`, vb.)
      temizliği için kullanıcı onayıyla bir plan yapılmalı.
- [ ] `Leaderboards.tsx` gerçek puan kaynağına (TP/Fair Play hesaplaması) bağlanmalı —
      Modül 11 tamamlandıktan sonra.
- [ ] `player_card` jsonb alanının nasıl/ne zaman doldurulacağına dair bir ürün kararı
      gerekiyor (örn. maç sonu derecelendirmelerden otomatik hesaplama mı, admin
      onayıyla mı). Şu an gerçek kullanıcılarda bu alan boş (`{}`).

---

## ✅ Modül 4 — Saha Keşfi & Rezervasyon (Tamamlandı)

Bu modül iki taraflı incelendi: **oyuncu** (saha bulma + rezervasyon) ve **saha sahibi**
(takvim, onay/red, manuel rezervasyon, fiyatlandırma).

**1) Ne işe yarar?**
Oyuncunun haritada/listede saha bulup belirli bir gün/saat için rezervasyon yapması ve
kapora ödemesi; saha sahibinin de gelen rezervasyon taleplerini görüp onaylaması,
reddetmesi veya kendi takviminden telefonla gelen müşteri için manuel rezervasyon
girmesi.

**2) Hangi dosyalar?**
- Oyuncu tarafı: `PitchDiscovery.tsx`, `PitchDepositCheckout.tsx`, `MyBookings.tsx`,
  `BookingAddons.tsx`, `services/playerBookingService.ts`, `services/paymentService.ts`,
  `services/availabilityService.ts`, `services/pitchBookingService.ts`,
  `services/tariffService.ts`.
- Saha sahibi tarafı: `OwnerPanel.tsx` (Takvim sekmesi + Onay Bekleyen Talepler),
  `services/pitchOwnerService.ts`.
- Backend: `supabase/migrations/20260613090000_faz1_player_booking_flow.sql` (RPC'ler:
  `get_pitch_availability`, `create_pitch_booking`, `cancel_app_booking`,
  `auto_approve_pending_bookings` + pg_cron), `20260615091000_faz2_payment_intents_and_rpcs.sql`
  (`create_payment_intent`, `apply_booking_payment`), `supabase/functions/create-payment/`.

**3) Nasıl çalışıyor?**
- Oyuncu `PitchDiscovery`'de haritadan/listeden gerçek, onaylı (`verification_status =
  approved`, `is_open = true`) sahaları görür, saat seçer, fiyat/kapora `pitch_tariffs`
  tablosundan canlı hesaplanır. Kart eklenmişse `PitchDepositCheckout` açılır; kart
  yoksa önce `WALLET` ekranına yönlendirilip kart eklettirilir.
- Rezervasyon `create_pitch_booking` RPC'siyle oluşturulur (çakışma kontrolü DB
  seviyesinde exclusion constraint ile yapılır → `SLOT_TAKEN`). Saha sahibi
  `auto_approve_enabled` açıksa belirlenen dakika (varsayılan 35) sonunda pg_cron job'ı
  rezervasyonu otomatik `CONFIRMED` yapar; kapalıysa sahibi elle onaylar/reddeder.
- Saha sahibi `OwnerPanel` → Takvim sekmesinde günlük/haftalık dolulukları görür, telefonla
  gelen müşteri için "Hızlı Oluştur" ile manuel rezervasyon girip nakit/kapora durumunu
  işaretleyebilir (`createManualBooking` + `recordBookingPayment` RPC'leri — gerçek
  sahalar için doğru bağlı). "Onay Bekleyen Talepler" ekranı uygulamadan gelen
  `PENDING` rezervasyonları canlı (realtime) listeler, sahibi "Erken Onayla"/"Reddet"
  yapabilir.

**4) Veri & bağlantı**
`pitches`, `courts`, `pitch_tariffs`, `pitch_bookings`, `pitch_availability_exceptions`,
`payment_intents`, `booking_payments` tabloları. Tüm yazma işlemleri SECURITY DEFINER
RPC'ler üzerinden gidiyor (oyuncu tarafı `create_pitch_booking`/`cancel_app_booking`;
ödeme tarafı `create_payment_intent`/`apply_booking_payment` — bunlar yalnızca
service-role/edge function tarafından çağrılabiliyor, istemciden direkt çağrılamıyor).
Saha sahibi onay/red işlemleri ise RLS korumalı doğrudan tablo güncellemesiyle yapılıyor
(`approveBooking`/`rejectBooking`).

**5) Durum tespiti**
- 🔧 **DÜZELTİLDİ (kritik, parayla ilgili kod hatası):** `PitchDepositCheckout.tsx` —
  oyuncu "Kapora Öde & Onayla" butonuna bastığında ekran sadece rezervasyonu oluşturuyordu
  (`create_pitch_booking` RPC'si çağrılıyordu, dönen rezervasyon ID'si **kullanılmadan
  atılıyordu**); ardından gerçek bir ödeme işlemi **hiç başlatılmıyor**, sadece sahte bir
  ilerleme çubuğu animasyonu oynatılıp "Rezervasyon Onaylandı! X₺ kapora alındı" mesajı
  gösteriliyordu. Gerçekte veritabanında o rezervasyonun `paid_amount` değeri `0`,
  `payment_status` değeri `'PENDING'` kalıyordu — yani **hem oyuncuya hem dolaylı olarak
  saha sahibine yalan bilgi veriliyordu**: oyuncu parasının kapora olarak alındığını
  düşünüyor, saha sahibi de no-show'a karşı bir güvence olduğunu zannediyordu, ama hiçbiri
  gerçek değildi. Bu, "Rezervasyonlarım" ekranındaki (`MyBookings.tsx`) doğru çalışan
  ödeme akışıyla doğrudan çelişiyordu (orada gerçek `payBookingDeposit()` çağrılıyor).
  **Yapılan düzeltme:** `createBooking()` artık RPC'nin döndürdüğü rezervasyon ID'sini
  yakalıyor; ardından `services/paymentService.ts`'teki gerçek `payBookingDeposit(bookingId)`
  çağrılıyor (gerçek sağlayıcıya yönlendirme veya SIMULATION modunda anlık onay — proje
  şu an `PAYMENT_PROVIDER=SIMULATION` ile çalışıyor, gerçek para hareketi yok ama akış
  uçtan uca doğru). Ödeme gerçekten `'PAID'` durumuna geçmeden "Onaylandı" ekranı artık
  gösterilmiyor; ödeme tamamlanamazsa kullanıcıya "rezervasyon oluştu ama ödeme
  tamamlanamadı, kaporayı Rezervasyonlarım'dan ödeyebilirsin" mesajı net şekilde
  gösteriliyor. Hata mesajları da rezervasyon RPC'sinden mi (`SLOT_TAKEN`, `NO_TARIFF`...)
  yoksa ödeme adımından mı (`PROVIDER_NOT_CONFIGURED`...) geldiğine göre doğru Türkçe
  metne çevriliyor. `tsc`/`build`/`lint` temiz.
- 🔧 **DÜZELTİLDİ (tutarlılık hatası, saha sahibi tarafı):** `pitchOwnerService.ts` →
  `rejectBooking()` bir rezervasyonu reddederken `status`'u `CANCELLED` yapıyordu ama
  oyuncu zaten kapora ödemişse `payment_status` alanını güncellemiyordu — yukarıdaki
  düzeltmeyle artık gerçek ödemeler olacağından, reddedilen-ama-"ödendi" görünen
  rezervasyonlar saha sahibinin finans ekranında yanlış gelir gösterebilirdi ve oyuncuya
  iade borcu olduğu hiçbir yerde görünmüyordu. Düzeltme: `paid_amount > 0` ise
  `payment_status` artık `'REFUNDED'` olarak işaretleniyor — oyuncunun `cancel_app_booking`
  RPC'sindeki aynı mantığa paralel.
- ✅ Backend (RPC'ler, exclusion constraint, 48 saatlik iptal kuralı, %90 iade hesabı,
  auto-approve pg_cron job'ı, tarife zorunluluğu trigger'ı) zaten sağlam ve doğru
  tasarlanmıştı — bulunan hata tamamen frontend'in mevcut ödeme adımını atlamasıydı, DB
  tarafında hiçbir değişiklik gerekmedi.
- ✅ Saha sahibi takvim/manuel rezervasyon/onay-red akışları (`OwnerPanel.tsx`) gerçek
  sahalar için doğru RPC'lere bağlı; sadece saha sahibinin **henüz hiç gerçek sahası
  yoksa** (yeni kayıt/onboarding öncesi) `localStorage` tabanlı demo veriyle çalışıyor —
  bu kasıtlı ve doğru bir davranış (boş/yanıltıcı ekran yerine demo deneyimi).
- ⚠️ **AÇIK NOT — Gerçek para iadesi henüz otomatik değil:** `cancel_app_booking` RPC'si
  iade tutarını (%90) hesaplayıp `payment_status = 'REFUNDED'` olarak işaretliyor, ama
  proje şu an SIMULATION modunda olduğundan gerçek bir ödeme sağlayıcısına iade isteği
  göndermiyor (kod içinde bunun bilerek "ödeme entegrasyonu geldiğinde tetiklenecek"
  şeklinde not edildiği görüldü). Gerçek sağlayıcı (iyzico/PayTR vb.) bağlandığında bu
  iade adımının da otomatikleştirilmesi gerekecek — bu, Modül 8 (Ödeme & Cüzdan)
  kapsamına giren ayrı bir görev.
  Aynı not, saha sahibinin reddettiği rezervasyonlar için de geçerli.
- ⚠️ **AÇIK NOT — `BOOKING_ADDONS` (kaleci/hakem ek hizmet) akışı şu an ulaşılamıyor:**
  `PitchDiscovery.tsx`'in `onBook` prop'u (App.tsx'te `BOOKING_ADDONS` ekranına
  yönlendirecek şekilde bağlı) kod içinde hiçbir yerden çağrılmıyor — oyuncu doğrudan
  `PitchDepositCheckout`'a gidiyor, kadro takviyesi (kaleci/hakem kiralama) adımına asla
  uğramıyor. Bu, ürün kararı gerektiren bir konu: (a) bu adım rezervasyon akışına geri
  bağlanmalı mı (slot seçiminden sonra, ödemeden önce), yoksa (b) kaleci/hakem kiralama
  zaten ayrı bir akışla (Pazaryeri/Modül 7) çözüldüğü için bu eski/yedek kod tamamen
  kaldırılmalı mı? Kod çalışır durumda ve hata vermiyor; sadece ulaşılamıyor —
  bilinçli olarak bu modülde silinmedi/değiştirilmedi, ürün kararı gerektirir.

**6) Piyasa öncesi yapılacaklar**
- [x] `PitchDepositCheckout.tsx` gerçek ödeme adımını (`payBookingDeposit`) çağıracak
      şekilde düzeltildi — artık "ödendi" demeden önce gerçekten ödeniyor.
- [x] Saha sahibinin reddettiği, kaporası ödenmiş rezervasyonlarda `payment_status`
      artık `'REFUNDED'` olarak işaretleniyor.
- [ ] Gerçek bir ödeme sağlayıcısı (iyzico/PayTR) bağlandığında otomatik iade akışı
      kurulmalı (şu an manuel/SIMULATION) — Modül 8'de ele alınacak.
- [ ] `BOOKING_ADDONS` (kaleci/hakem ek hizmet) akışının rezervasyon yolculuğuna geri
      bağlanıp bağlanmayacağına dair bir ürün kararı verilmeli.

---

## ✅ Modül 5 — Maç Sistemi (Tamamlandı)

**1) Ne işe yarar?**
Kaptanın saha tutup maç kurması, kadro doldurması; diğer oyuncuların maç keşfedip
katılması; maç günü lobi/bilet ekranları; maç sonrası değerlendirme (puan, maçın adamı,
skor onayı).

**2) Hangi dosyalar?**
`MatchCreate.tsx` + `hooks/useMatchCreate.ts`, `MatchDiscovery.tsx`, `MatchJoin.tsx`,
`MatchCalendar.tsx`, `UpcomingMatchesView.tsx`, `Dashboard.tsx`, `Marketplace.tsx`,
`MatchTicket.tsx`, `PostMatchEval.tsx`, `VotingScreen.tsx`, `MotmReveal.tsx`,
`PostMatchReport.tsx`, `services/matchService.ts`, `store.ts` (`addMatch`/`updateMatch`),
`supabaseMutations.ts`. Backend: `matches` tablosu (`supabase_schema.sql`),
`join_public_match_slot`/`leave_public_match_slot`/`pay_public_match_deposit` RPC'leri
(`20260608_match_join_rpc_fixes.sql`), `player_ratings` tablosu ve
`match_score_tokens` + `get_or_create_match_score_token`/`submit_match_score` RPC'leri
(`20260526000000_plei_fubles_schema.sql`, `20260607000001_owner_module_complete.sql`).

**3) Nasıl çalışıyor?**
Kaptan `MatchCreate`'de saha/saat/format seçip kadroyu (arkadaş davetiyle) doldurur,
`publishMatch()` ile `matches` tablosuna gerçek bir satır eklenir (`addMatch` →
`fbAddMatch` → gerçek Supabase insert, optimistic update + hata durumunda rollback).
Diğer oyuncular `MatchDiscovery`/`Marketplace`'te bu maçları görüp `MatchJoin`'den
katılır; katılım `join_public_match_slot` RPC'si üzerinden `SELECT ... FOR UPDATE`
ile atomik şekilde yapılıyor ve `process_match_payment` ile cüzdandan kapora
düşülüyor (yetersiz bakiyede otomatik rollback) — bu kısım sağlam ve para güvenliği
açısından doğru tasarlanmış, bu modülde dokunulmadı.

**4) Veri & bağlantı**
`matches` tablosu (`status` kolonu `TEXT`, CHECK constraint yok, varsayılan `'OPEN'`).
`player_ratings` ve `match_score_tokens` tabloları RLS ile sıkı korunuyor ve teknik
olarak kullanıma hazır, ama hiçbir ekran şu an bunlara gerçek yazma/okuma yapmıyor.

**5) Durum tespiti**
- 🔧 **DÜZELTİLDİ (kritik, herkesi etkileyen kod hatası):** `Dashboard.tsx` ve
  `UpcomingMatchesView.tsx` içinde "şu anki kullanıcı" `const currentUserUid = 'u1'`
  şeklinde **sabit/hardcoded** tutuluyordu — yani hangi gerçek kullanıcı giriş yapmış
  olursa olsun, "Maçlarım", "Taslaklarım", "Yaklaşan Maçlarım" gibi bütün filtreler
  hep aynı sahte `u1` kullanıcısına göre çalışıyordu. Gerçek kullanıcılar kendi
  maçlarını listede hiç göremeyecekti. Düzeltme: `store.ts`'in başka yerlerinde
  zaten kullanılan doğru kalıba (`auth.currentUser?.uid || 'u1'`) geçirildi — artık
  gerçek oturum açan kullanıcının kimliği kullanılıyor, demo/local test için eski
  `'u1'` sadece fallback olarak kaldı.
- 🔧 **DÜZELTİLDİ (kritik, sahte veri gösteren ekran):** `MatchCalendar.tsx`
  ("Maç Takvimim" ekranı) tamamen **3 satır sabit/mock maç verisiyle** çalışıyordu
  (`useState<UpcomingMatch[]>([...])`) — Supabase/store'a hiç bağlı değildi, her
  kullanıcıya birebir aynı 3 sahte maç ("Akşam Kapışması", "Haftalık Rutin", "Derbi
  Maçı") gösteriliyordu. Ayrıca maça tıklanınca lobiye giderken maçın kimliği
  (`match.id`) hiç iletilmiyordu (`onNavigate('MATCH_LOBBY')` parametresiz) — lobi
  ekranı hangi maçın gösterileceğini bilemeyecekti. Düzeltme: ekran artık
  `UpcomingMatchesView.tsx`'teki doğru kalıbı izleyerek gerçek `adminMatches`'ten
  kullanıcının içinde olduğu, iptal/tamamlanmamış maçları süresine göre sıralı
  listeliyor; tıklamada `setSelectedMatch(match)` çağrılıp gerçek maç state'e
  yazıldıktan sonra lobiye gidiliyor.
- 🔧 **DÜZELTİLDİ (ölü kod temizliği):** `services/matchService.ts`'teki
  `createMatch` ve `joinMatchSlot` fonksiyonlarının hiçbir çağıranı yoktu (gerçek
  maç oluşturma `store.ts`/`addMatch` üzerinden, gerçek slota katılım
  `join_public_match_slot` RPC'si üzerinden yapılıyor — bu iki eski fonksiyon hiç
  kullanılmıyordu). `MatchJoin.tsx`'teki `joinMatchSlot` import'u da hiç
  çağrılmadan duruyordu (ölü import). Üçü de kaldırıldı; kullanılmayan
  `PositionSlot` import'u da temizlendi.
- ⚠️ **AÇIK NOT — "Taslak maç" özelliği koddan tamamen erişilemez durumda:**
  `useMatchCreate.ts`'teki `activeDraftId`/`draftMatch`/`isDraftMode` mekanizması
  (bir maçı "taslak" olarak yarıda kaydedip sonra düzenleyerek yayınlama) ve
  `Dashboard.tsx`/`Marketplace.tsx`/`UpcomingMatchesView.tsx`'teki `status ===
  'DRAFT'` filtreleri kodda duruyor, ama `setActiveDraftId(...)` fonksiyonu
  **hiçbir yerden gerçek bir maç ID'siyle çağrılmıyor** — yani bu "taslak"
  moduna girmenin koddan hiçbir yolu yok, tamamen erişilemez/ölü bir dal. Aynı
  şekilde gerçek bir maç hiçbir zaman `status: 'DRAFT'` ile oluşturulmuyor (sadece
  `constants.ts`'teki başlangıç mock verisinde var, gerçek veri yüklenince
  kaybolur). Bu, ürün kararı gerektiren bir konu: (a) "taslak kaydet, sonra
  düzenle" akışı tamamlanıp `MatchCreate.tsx`'e gerçek bir "Taslak Olarak Kaydet"
  butonu eklenmeli, yoksa (b) bu özellik hiç bitirilmediyse ölü kod olarak
  tamamen kaldırılmalı. Şu an çalışan hiçbir akışı bozmuyor, sadece kullanılamıyor
  — bu modülde tek başına silinmedi, kapsamı netleşsin diye not edildi.
- ⚠️ **AÇIK NOT — Maç sonu ekranları (`PostMatchEval`, `VotingScreen`,
  `MotmReveal`, `MatchTicket`, `PostMatchReport`) gerçek veriye hiç bağlı değil:**
  Bu beş ekran tamamen sabit/demo veriyle çalışıyor:
  - `PostMatchEval.tsx`/`VotingScreen.tsx`: oyuncu listesi (`PLAYERS`,
    `MY_TEAM.roster`) sabit, puanlama tamamen local state'te kalıyor; arka planda
    hazır ve RLS ile korunan `player_ratings` tablosuna (DB'de zaten var,
    `UNIQUE(match_id, rater_id, ratee_id)` kısıtlı, sağlam tasarlanmış) hiçbir
    INSERT gitmiyor.
  - `PostMatchEval.tsx`'in "Skor Onayı" ekranı skor olarak sabit `5-3` gösteriyor;
    arka planda hazır olan `get_or_create_match_score_token`/`submit_match_score`
    RPC'leri (tek kullanımlık token, kaptan/hakem/saha sahibi yetkisiyle skor
    girişi — sağlam tasarlanmış) hiç çağrılmıyor.
  - `MotmReveal.tsx` "Maçın Adamı" olarak her zaman sabit "BURAK" ismini ve sabit
    bir avatarı gösteriyor; DB'de gerçek bir MOTM/MVP hesaplama mekanizması
    (ör. `player_ratings` üzerinden agregasyon) hiç yok.
  - `MatchTicket.tsx` sahte bir QR ikonu ve sabit `ID: OYNA-8293-TX` metni
    gösteriyor; gerçek, doğrulanabilir bir bilet kimliği üretilmiyor.
  - `PostMatchReport.tsx` "Simulate API Save" yorumuyla sahte bir kayıt
    animasyonu oynatıyor, gerçek bir tabloya yazmıyor.
  Bunların hepsi "bug" değil, **bilinçli olarak yarım bırakılmış / iskelet
  (mockup) ekranlar** — gerçek veriye bağlamak küçük bir düzeltme değil, her biri
  kendi başına bir özellik inşası (gerçek kadro/rakip oyuncu listesini nereden
  çekeceğiz, MOTM nasıl hesaplanacak, bilet kimliği neye dayanacak gibi ürün
  kararları gerektiriyor). Bu yüzden bu turda yarım/riskli bir şekilde
  bağlanmadı; ayrı bir iş kalemi olarak burada kayda geçirildi.
- ✅ Maça gerçek katılım/kapora akışı (`join_public_match_slot`,
  `leave_public_match_slot`, `pay_public_match_deposit` RPC'leri,
  `process_match_payment` ile cüzdan düşümü) zaten sağlam, atomik ve para
  güvenliği açısından doğru — bu modülde hiçbir değişiklik gerekmedi.

**6) Piyasa öncesi yapılacaklar**
- [x] `Dashboard.tsx`/`UpcomingMatchesView.tsx` artık gerçek oturum açan kullanıcının
      kimliğini kullanıyor (`'u1'` sabit değeri kaldırıldı).
- [x] `MatchCalendar.tsx` artık gerçek maç verisiyle çalışıyor, lobiye doğru maç
      kimliğiyle yönlendiriyor.
- [x] `matchService.ts`'teki ölü/kullanılmayan fonksiyonlar temizlendi.
- [ ] "Taslak maç" özelliği için ürün kararı: tamamla ya da kaldır.
- [ ] Maç sonu ekranlarının (puanlama, MOTM, skor onayı, bilet, rapor) gerçek
      veriye bağlanması — her biri ayrı bir özellik inşası olarak planlanmalı.

---

## ✅ Modül 6 — Takım & Taktik (Tamamlandı)

**1) Ne işe yarar?**
Kullanıcının kendi sabit takımını kurması, kadrosunu (roster) oluşturup oyunculara
saha üzerinde pozisyon/talimat ataması, taktik tahtasında (Studio) plan hazırlayıp
kaydetmesi; ayrıca diğer takımlarla oyuncu/transfer ilanları üzerinden eşleşmesi.

**2) Hangi dosyalar?**
`TeamCreator.tsx`, `MyTeam.tsx`, `TeamBuilder.tsx`, `Studio.tsx`, `TransferCenter.tsx`,
`services/teamService.ts`, `supabaseClient.ts` (`getTeamRolesAndInstructions`,
`updateTeamRolesAndInstructions`, `sbRemovePlayerFromTeam`), `store.ts` (`createTeam`,
`myTeams` state), `CommunityView.tsx` (TransferCenter'a giriş noktası). Backend:
`teams`, `team_members`, `tactics` tabloları.

**3) Nasıl çalışıyor?**
`TeamCreator` 3 adımlı sihirbazla yeni takım bilgisini toplar; `onComplete`
callback'i `App.tsx` üzerinden `store.createTeam()`'i tetikler → bu da
`services/teamService.ts` ile gerçek `teams` + `team_members` insert'i yapar.
`MyTeam` ekranı gerçek `myTeams` store state'inden aktif takımı bulur, roster'ı
Supabase'den gelen pozisyon/talimat verisiyle zenginleştirir
(`getTeamRolesAndInstructions`); sürükle-bırak ile pozisyon değiştirildiğinde veya
talimat atandığında her değişiklik `updateTeamRolesAndInstructions` ile gerçek
zamanlı Supabase'e yazılıyor; oyuncu çıkarma `sbRemovePlayerFromTeam` ile gerçek
silme yapıyor. `Studio` ekranı taktik planlarını (`tactics` tablosu) kullanıcının
kendi `userId`'sine bağlı olarak yükler/kaydeder.

**4) Veri & bağlantı**
`teams`, `team_members`, `tactics` tabloları gerçek ve RLS korumalı
(`userId = auth.uid()`). `transfers`/`transfer_offers` gibi bir tablo şemada
**hiç yok** — `TransferCenter.tsx` ekranının arkasında hiçbir backend altyapısı
bulunmuyor.

**5) Durum tespiti**
- 🔧 **DÜZELTİLDİ (sahte veri, yanlış kadro dolduran kod hatası):** `Studio.tsx`'te
  "Seçili Takımı Onayla" otomatik kadro doldurma butonu gerçek bir takımı
  seçtiriyordu (`myTeams`'ten) ama saha üzerindeki kadroyu her zaman 10 satırlık
  sabit `MOCK_POOL` ("Ahmet Y.", "Mehmet K." ... gibi var olmayan oyuncular)
  listesiyle dolduruyordu — yani kullanıcı kendi gerçek takımını seçse de sahaya,
  o takımda hiç olmayan hayalet oyuncular diziliyordu. Düzeltme: artık seçilen
  takımın gerçek `roster`'ı kullanılıyor, varsa arkadaş listesinden (`friends`)
  pozisyon/rating eşleşmesiyle zenginleştiriliyor — modaldeki "Takımlar"
  sekmesinde zaten kullanılan doğru kalıpla birebir aynı hale getirildi.
  Kullanılmayan `MOCK_POOL` ve `MOCK_TEAMS` sabitleri de koddan temizlendi.
- ✅ **Doğrulandı (sağlam, dokunulmadı):** `TeamCreator.tsx → store.createTeam() →
  services/teamService.ts` gerçek Supabase insert zinciri eksiksiz çalışıyor;
  `MyTeam.tsx`'in roster/pozisyon/talimat kaydetme ve oyuncu çıkarma akışları
  gerçek Supabase fonksiyonlarını çağırıyor.
- ⚠️ **AÇIK NOT — `TeamBuilder.tsx` ekranına ulaşan hiçbir giriş noktası yok:**
  `App.tsx`'te `case 'TEAM_BUILDER'` yönlendirmesi tanımlı (yani ekran "ölü kod"
  değil, router'a bağlı), ama kod tabanının hiçbir yerinde
  `onNavigate('TEAM_BUILDER')` çağıran bir buton/link bulunmuyor — kullanıcı bu
  ekrana hiçbir şekilde ulaşamıyor. Ekran ayrıca sabit `MOCK_FRIENDS` listesiyle
  çalışıyor, gerçek arkadaş/roster verisine bağlı değil. Erişim noktası
  eklenip eklenmeyeceği bir ürün kararı; ekrana kimse ulaşamazken sahte veri
  kaynağını değiştirmenin kullanıcıya hiçbir faydası olmayacağından bu turda
  dokunulmadı.
- ⚠️ **AÇIK NOT — `TransferCenter.tsx` tamamen sahte veriyle çalışıyor, gerçek
  backend yok:** `CommunityView.tsx` üzerinden canlıda erişilebilir bir ekran,
  ama "takım arıyor" ilanları, haber bandı, teklif/mesajlaşma — hepsi sabit
  diziler (`LFP_LISTINGS`, `TICKER_ITEMS` vb.). Şemada `transfers` ya da
  `transfer_offers` gibi bir tablo hiç yok. Gerçek hale getirmek yeni bir
  özellik inşası demek (yeni tablo + RLS + muhtemelen bildirim/mesajlaşma) —
  canlı veritabanı şema değişikliği gerektirdiğinden kullanıcı onayı almadan
  yapılmadı, burada iş kalemi olarak not edildi.
- ⚠️ **AÇIK NOT — `MyTeam.tsx`'teki "Oyuncu Davet Et" modalı tamamen sahte:**
  Modal canlıda "Ekle" butonuyla erişilebiliyor, ama sabit iki isim ("Ahmet K.",
  "Mehmet Y.") gösteriyor; arama kutusu hiçbir şey yapmıyor, "Davet Et" ve
  "Bağlantı Paylaş" butonlarının ikisi de işlevsiz. Gerçek bir davet sistemi
  (kullanıcı arama + bildirim/davet kaydı) yeni bir özellik inşası gerektiriyor;
  yarım/riskli bağlanmadı, burada not edildi.
- 🔁 **Yeniden değerlendirildi, hata değil:** Önceki araştırma turunda
  `TeamBuilder.tsx`'teki `generateBalancedTeams()` fonksiyonunun `sumA <= sumB`
  karşılaştırmasının "eşitlik durumunda dengesiz takım üreten bir hata" olduğu
  öne sürülmüştü. Kendi simülasyonumla kontrol edildi (`[90,80,70,60,50,40]` gibi
  örnek kadrolarla) — algoritma beklenen şekilde dengeli sonuç üretiyor (örn.
  200'e 190 gibi yakın toplamlar). Gerçek bir hata olmadığından değiştirilmedi;
  bu, otomatik ön-araştırmanın yanlış pozitif bir tespitiydi.

**6) Piyasa öncesi yapılacaklar**
- [x] `Studio.tsx`'teki "Takımı Onayla" otomatik kadro doldurma artık gerçek
      takım roster'ını kullanıyor, sahte oyuncu listesi kaldırıldı.
- [ ] `TeamBuilder.tsx` için erişim noktası eklenecek mi, yoksa ekran tamamen
      kaldırılacak mı — ürün kararı gerekiyor.
- [ ] `TransferCenter.tsx`'i gerçek bir transfer/ilan sistemine bağlamak için
      yeni tablo + RLS tasarımı gerekiyor (canlı DB şema değişikliği — onay
      gerektirir).
- [ ] `MyTeam.tsx`'teki oyuncu davet modalı gerçek arama + davet mekanizmasına
      bağlanmalı.

## ✅ Modül 7 — Pazaryeri & Hizmetler (Tamamlandı)

**1) Ne işe yarar?**
Kaptanların maçları için kaleci/hakem bulup teklif vermesi ya da direkt
kiralaması; kaleci ve hakemlerin kendi hizmet panolarından (Service Dashboard)
gelen teklifleri yönetmesi, müsaitlik/ayar/profil bilgilerini düzenlemesi.

**2) Hangi dosyalar?**
`Marketplace.tsx`, `ServiceDashboard.tsx`, `ServiceSettings.tsx`,
`ServiceProfile.tsx`, `MyListings.tsx`, `ListingDetails.tsx`,
`ScoutDashboard.tsx`, `components/Marketplace/MarketplaceCard.tsx`,
`components/Marketplace/MarketplaceMap.tsx`, `RefereeScoreModule.tsx` (sadece
`RookieShowcase.tsx` tanıtım ekranında kullanılıyor, gerçek akışın parçası
değil). Backend: `goalkeepers`, `referees`, `service_offers` tabloları;
`supabaseMutations.ts` (`fbCreateOffer`, `fbUpdateOfferStatus`,
`fbGetProviderOffers`), `store.ts` (`updateGoalkeeper`, `updateReferee`).

**3) Nasıl çalışıyor?**
Kaptan `Marketplace.tsx`'te kaleci/hakem listesini (`adminGoalkeepers`/
`adminReferees`) filtreleyip seçtiği profille "Direkt Kirala" ya da "Teklif
Gönder" akışını başlatıyor. Direkt kiralamada maç kaydı (`updateMatch`)
güncelleniyor; teklif modunda artık gerçek bir `service_offers` satırı
ekleniyor (bu turda eklendi, aşağıda detay var). Kaleci/hakem tarafında
`ServiceDashboard.tsx` kendi `userProfile`'ını gerçek diziden buluyor, açık
maçları `subscribeToOpenMatches` ile realtime dinliyor, gelen teklifleri
`service_offers` tablosundan PENDING durumda çekiyor. `ServiceSettings.tsx`
bildirim/gizlilik/görünüm tercihlerini `me.settings` JSONB alanına gerçek
zamanlı kaydediyor. `ServiceProfile.tsx` isim/ücret/tarz/biyografi/fotoğraf
gibi profil alanlarını ve konum yarıçapını düzenliyor.

**4) Veri & bağlantı**
`goalkeepers`/`referees` tabloları gerçek, RLS `auth.uid() = id` ile korunuyor.
`service_offers` tablosunun **canlı şeması, repodaki ilk migration dosyasından
(`20260530000000_service_integration.sql`) farklı**: gerçek sütunlar `id,
match_id, provider_id, captain_id, amount, status, created_at, offer_date,
offer_time` (migration dosyasındaki `offered_by`/`provider_type` değil,
`captain_id` kullanılıyor — muhtemelen sonraki bir migration ile değiştirilmiş
ama repodaki migration geçmişi bunu yansıtmıyor; Modül 15'te derinlemesine
incelenecek bir not). RLS INSERT politikası `auth.uid() = captain_id` şartını
arıyor; bu turun düzeltmesi canlı şema doğrulanarak buna göre yazıldı.

**5) Durum tespiti**
- 🔧 **DÜZELTİLDİ — ServiceDashboard.tsx:** tehlikeli `[0]` profil yedeği
  kaldırıldı (bulunamayınca başka birinin gerçek profiline düşülüyordu),
  `matchCount || 42` sahte varsayılanı düzeltildi, kullanılmayan
  `walletBalance: 1250` literal'i silindi.
- 🔧 **DÜZELTİLDİ — ServiceSettings.tsx:** aynı tehlikeli `[0]` yedeği
  kaldırıldı; toggle state'leri artık `me` değiştiğinde (`useEffect` ile)
  gerçek kayıtlı ayarlarla yeniden senkronize oluyor; hesap özeti kartındaki
  sabit "CÜNEYT A./UĞURCAN Ç. — 4.9 — 150/42 maç" yerine gerçek
  `me.name/me.rating/me.matchCount` gösteriliyor.
- 🔧 **DÜZELTİLDİ — ServiceProfile.tsx:** ana "KAYDET" butonu (`handleSave`)
  sadece `bio`'yu yerel state'e yazıp sahte "Kaydedildi" gösteriyor, hiçbir
  Supabase güncellemesi yapmıyordu — kullanıcı isim/ücret/tarz/fotoğraf
  değiştirip kaydetse de hiçbiri kalıcı olmuyordu (ekrandan çıkınca kaybolur).
  Artık `updateGoalkeeper`/`updateReferee` ile gerçek kayıt yapıyor.
- 🔧 **DÜZELTİLDİ — Marketplace.tsx:** "Teklif Gönder" (BID) modu sadece
  `console.log` yapıp kullanıcıya sahte "TEKLİFİNİZ GÖNDERİLDİ" başarı ekranı
  gösteriyordu — hiçbir teklif veritabanına yazılmıyordu. Artık gerçek
  `service_offers` satırı ekleniyor (canlı şema doğrulanarak: `match_id,
  provider_id, captain_id, amount`); ekleme başarısız olursa sahte başarı
  ekranı gösterilmiyor, kullanıcı uyarılıyor.
- ⚠️ **AÇIK NOT — `MyListings.tsx` + `ListingDetails.tsx`:** "İlan ver / teklif
  al" akışı (kaptanın açık ilan vermesi, kalecilerin/hakemlerin teklif vermesi)
  uçtan uca sahte veriyle çalışıyor (`mockListings`, `MOCK_BIDS`); "Yeni İlan
  Oluştur" butonunun hiçbir onClick'i yok. Bu, Marketplace.tsx'teki (kaptanın
  doğrudan bir profile teklif gönderdiği) akıştan farklı, ters yönlü bir akış
  — şemada bunu karşılayan bir "ilan" tablosu da yok. Gerçek hale getirmek
  yeni bir özellik inşası (yeni tablo + RLS) demek; canlı şema değişikliği
  gerektirdiğinden kullanıcı onayı alınmadan yapılmadı.
- ⚠️ **AÇIK NOT — `ScoutDashboard.tsx`:** saha sahibi yönlendirme/komisyon
  ("Scout") paneli tamamen sahte (`REFERRED_PITCHES`, sabit "1.080₺" bakiye,
  sabit referans kodu). Komisyon/yönlendirme sistemi için şemada hiçbir tablo
  yok — yeni özellik inşası gerektiriyor, canlı şema değişikliği onayı
  gerektirdiğinden bu turda yapılmadı.
- ⚠️ **AÇIK NOT — `ServiceDashboard.tsx`'in dekoratif istatistik/cüzdan
  görünümleri:** kimlik kartındaki Hakem için "YÖNETİM 150", "VAR %98" gibi
  şemada karşılığı olmayan icat istatistik kategorileri ve cüzdan sekmesindeki
  sabit "Toplam Kazanç 4.250₺" + `WALLET_HISTORY` mock import — gerçek
  para/kazanç akışı kavramsal olarak Modül 8'in (Ödeme & Cüzdan) kapsamına
  giriyor, orada birlikte ele alınacak.
- ✅ **Doğrulandı, hata değil:** daha önceki bir araştırma turunun "ServiceProfile
  /ScoutDashboard kaydetme butonları sadece local store'a yazıyor, Supabase'e
  değil" iddiası **yanlış** çıktı — `store.ts`'teki `updateGoalkeeper`/
  `updateReferee` aslında optimistic-update + gerçek Supabase yazma + hata
  durumunda geri alma yapan gerçek fonksiyonlar. (ServiceProfile.tsx'in ana
  KAYDET butonu gerçekten bozuktu ama sebebi farklıydı: bu fonksiyonları hiç
  çağırmıyordu — "sadece local'e yazıyor" iddiası teknik olarak yanlıştı.)
- ✅ **Doğrulandı, dokunulmadı:** `ServiceProfile.tsx`'teki kimlik eşleştirme
  (`r.authUid === currentUser.uid || r.id === currentUser.uid`) ve "LOKASYONU
  KAYDET" butonu zaten doğru/gerçek Supabase çağrısı yapıyor.
  `MarketplaceCard.tsx`/`MarketplaceMap.tsx`: gerçek hata yok, sadece kozmetik
  yer tutucular (favori kalp ikonu kalıcı değil, harita yakınlaştırma
  butonlarının onClick'i yok) — bilinçli stilize tasarım, dokunulmadı.
  `RefereeScoreModule.tsx`: sadece `RookieShowcase.tsx` (Modül 3'te zaten
  "kasıtlı statik tanıtım ekranı" olarak belgelenmiş) içinde kullanılıyor,
  gerçek maç skor akışının parçası değil — `alert()` kalıntısı kozmetik,
  dokunulmadı.

**6) Piyasa öncesi yapılacaklar**
- [x] ServiceDashboard.tsx, ServiceSettings.tsx, ServiceProfile.tsx,
      Marketplace.tsx'teki gerçek kod hataları düzeltildi.
- [ ] `service_offers` tablosunun canlı şemasıyla repodaki migration
      dosyasının neden farklı olduğu Modül 15'te (Veritabanı & Güvenlik Derin
      Denetim) araştırılmalı.
- [ ] `MyListings.tsx` + `ListingDetails.tsx` ("açık ilan" akışı) gerçek bir
      özellik olarak inşa edilecek mi — ürün kararı + yeni tablo/RLS gerekiyor.
- [ ] `ScoutDashboard.tsx` (saha sahibi yönlendirme komisyonu) gerçek bir
      özellik olarak inşa edilecek mi — ürün kararı + yeni tablo/RLS gerekiyor.
- [ ] ServiceDashboard.tsx'in icat istatistik kategorileri ve cüzdan sekmesi
      Modül 8 ile birlikte ele alınacak.

## ✅ Modül 8 — Ödeme & Cüzdan (Tamamlandı)

**1) Ne işe yarar?**
Kullanıcının nakit cüzdanını görmesi ve yüklemesi, saha kaporası/maç havuzu
ödemelerini yapması, PRO üyeliğe yükselmesi ve sadakat kartını takip etmesi.
Para ile ilgili olduğu için bu uygulamanın en hassas modülü.

**2) Hangi dosyalar?**
`WalletScreen.tsx`, `PaymentScreen.tsx`, `PremiumScreen.tsx`, `LoyaltyCard.tsx`,
`OpponentFinder.tsx` (PaymentScreen'e giden ikinci giriş noktası olduğu için
bu turda incelendi), `services/paymentService.ts`, `supabaseMutations.ts`
(`fbToggleUserPro`). Backend: `wallet_transactions`, `payment_intents`,
`booking_payments` tabloları, `create-payment`/`payment-webhook` Edge
Function'ları, `process_match_payment`/`process_match_refund` RPC'leri
(Modül 5'te zaten doğrulanmıştı).

**3) Nasıl çalışıyor?**
- **Cüzdan (`WalletScreen`):** Nakit bakiye gösterir, kart ekleme/çıkarma
  (SIMULATION modu — gerçek tokenizasyon yok, uygulamanın her yerinde aynı
  kalıp) ve "Bakiye Yükle" butonu sunar.
- **Ödeme (`PaymentScreen`):** "Kaptan Garantisi" ile kapora ödeyip rezervasyon
  oluşturma, ardından "Maç Havuzu" (diğer oyuncularla bölüşüm) ekranı.
- **PRO (`PremiumScreen`):** Aylık/yıllık plan seçip "HEMEN YÜKSELT" ile
  yükseltme.
- **Sadakat (`LoyaltyCard`):** 10 damgalık sadakat kartı, dolunca ücretsiz
  maç bileti QR'ı.

**4) Veri & bağlantı**
Canlı veritabanı doğrulandı (`execute_sql` ile): `wallet_transactions`,
`payment_intents`, `booking_payments`, `owner_withdrawal_requests` tabloları
gerçek ve mevcut. `wallet_transactions` üzerinde **doğrudan client INSERT
artık kapalı** (`wallet_no_direct_insert_secure` politikası) — yalnızca
`process_match_payment`/`process_match_refund` gibi `SECURITY DEFINER`
RPC'ler satır ekleyebiliyor; bu, Modül 5'te bulunan sağlam tasarımla uyumlu.
Cüzdana **gerçek para yükleme (top-up) için canlı veritabanında veya kodda
hiçbir RPC/Edge Function yok** — `create-payment` Edge Function'ı sadece
saha kaporası akışını destekliyor (`action: 'create' | 'confirm-sim'`,
`bookingId` zorunlu).

**5) Durum tespiti**
- 🔧 **DÜZELTİLDİ (kod hatası):** `WalletScreen.tsx` nakit bakiyeyi sabit
  `450.0`₺ olarak gösteriyordu — gerçek bakiyeyle hiçbir ilişkisi yoktu,
  her kullanıcı aynı sahte rakamı görüyordu. Artık `profiles.wallet_balance`
  gerçek değeri yükleniyor.
- 🔧 **DÜZELTİLDİ (kod hatası):** `App.tsx` giriş akışında `profiles.is_pro`
  hiç okunmuyordu — `isUserPro` store alanı oturum başına her zaman `false`
  ile başlıyordu, yani PRO bir kullanıcı bile uygulamayı her açtığında
  "standart" kullanıcı gibi davranılıyordu (komisyon indirimi rozeti,
  öncelik vb. hiç görünmüyordu). Artık girişte gerçek `is_pro` değeri okunup
  store'a yazılıyor.
- ❗ **KRİTİK AÇIK NOT 1 — "Bakiye Yükle" tamamen sahte, gerçek altyapı hiç
  yok:** `WalletScreen.tsx → handleTopUpSubmit` bir `setTimeout` ile sahte
  "İşlem Onaylanıyor" → "Ödeme Başarılı" animasyonu oynatıp seçilen tutarı
  **yalnızca ekran içi local state'e** ekliyor (`setCashBalance(prev =>
  prev + amountToAdd)`). Veritabanında **hiçbir satır eklenmiyor, hiçbir
  RPC çağrılmıyor, `wallet_balance` hiç değişmiyor.** Kullanıcı "500₺
  yüklendi" görüp ekrandan çıkıp geri girdiğinde bakiye gerçek (değişmemiş)
  değerine sessizce dönüyor — kullanıcıya yanlış bilgi veriliyor. Bunu
  düzeltmek Modül 4'teki kapora hatası gibi küçük bir bağlantı eksikliği
  değil: canlı veritabanında cüzdana para yükleme için **hiçbir RPC/Edge
  Function/`wallet_transactions` INSERT yetkisi yok** — gerçek bir ödeme
  sağlayıcısı entegrasyonu + yeni bir `SECURITY DEFINER` "top-up" RPC'si
  gerektiren ayrı bir özellik inşası. Bu turda yapılmadı, ürün/ödeme
  sağlayıcısı kararı bekliyor.
- ❗ **KRİTİK AÇIK NOT 2 — PRO satın alma da tamamen sahte, DB'ye hiç
  yazılmıyor; düzeltmesi Modül 15'teki güvenlik açığına bağlı:**
  `PremiumScreen.tsx → handlePurchase` hiçbir ödeme/yetki kontrolü yapmadan
  3 saniye sonra `onUpgrade()` çağırıyor; `App.tsx` bunu yalnızca
  `setIsUserPro(true)` ile **local store'a** yazıyor, `profiles.is_pro`
  hiç güncellenmiyor — kullanıcı "ARTIK EFSANESİN!" ekranını görse de bir
  sayfa yenilemesinde PRO durumu kaybolur. Bunu basitçe
  `supabaseMutations.ts`'teki mevcut `fbToggleUserPro(id, true)` ile
  DB'ye yazdırmak **bilerek yapılmadı**: önceki turda canlı veritabanında
  tespit edilen `protect_profile_columns` tetikleyicisinin yalnızca
  `role/roles/is_banned/ban_expires_at/is_verified` alanlarını koruduğu,
  **`is_pro`, `wallet_balance`, `trust_score`, `skill_rating` gibi hassas
  alanları HİÇ korumadığı** doğrulandı (kullanıcı bu bulguyu Modül 15'e
  bırakmayı seçti). O boşluk açıkken PRO satın alma butonunu doğrudan bu
  yazmaya bağlamak, "ödeme yapmadan PRO ol" açığını UI üzerinden daha da
  görünür/kullanılabilir hale getirir. Doğru sıralama: **(1) Modül 15'te
  `protect_profile_columns` bu alanları da kapsayacak şekilde güncellenmeli,
  (2) ardından gerçek bir ödeme adımıyla birlikte `is_pro` yazımı sunucu
  tarafında (yeni bir `SECURITY DEFINER` RPC ile) yapılmalı.** Bu sıralama
  bozulmadan iki görev de tamamlanana kadar buton bilerek "sahte" bırakıldı.
- ❗ **AÇIK NOT 3 — `PaymentScreen.tsx` kapora adımı da hiç para tahsil
  etmiyor (Modül 4'teki hatayla aynı sınıf, ayrı bir bileşende):**
  `handleDepositPay` yalnızca `create_pitch_booking` RPC'sini çağırıp
  rezervasyon oluşturuyor (`createBookingInDatabase`), Modül 4'te
  `PitchDepositCheckout.tsx`'e eklenen gerçek `payBookingDeposit()` çağrısı
  burada **yok**. Ayrıca `bookingPitch/bookingCourt/bookingDate/bookingSlot`
  store'da boşsa fonksiyon sessizce hiçbir şey yapmadan geri dönüyor, ama
  ekran yine de "REZERVE EDİLİYOR..." gösterip kullanıcıyı "Maç Havuzu"
  adımına geçiriyor. Bu ekrana ulaşan iki yol var: (a) `PitchDiscovery`'nin
  `onBook` prop'u — Modül 4'te zaten "hiçbir yerden çağrılmıyor" olarak not
  edilmişti, hâlâ öyle; (b) `OpponentFinder.tsx`'teki "rakip takım bul ve
  meydan oku" akışının sonu — ama bu akış `MOCK_TEAMS` sabit verisiyle
  çalışıyor (gerçek rakip/maç eşleşme backend'i yok), yani şu an **gerçek
  hiçbir kullanıcı bu ekrana gerçek bir rezervasyonla ulaşamıyor.** Ardından
  gelen "Maç Havuzu" (bölünmüş ödeme) ekranı da tamamen `useState` ile
  yönetiliyor — `wallet_transactions`'a veya başka bir tabloya hiçbir yazma
  yapılmıyor, kimsenin cüzdanından gerçekten para çekilmiyor; bu özelliğin
  arkasında hiçbir backend tablosu (örn. "havuz katkı" kaydı) yok. Şu an
  kimseyi etkilemediği için bu turda dokunulmadı, ama PitchDiscovery'nin
  `onBook` akışı ileride bağlanırsa (Modül 4'ün açık notu) bu ekran da
  birlikte ele alınmalı; "Havuz" özelliğinin gerçek hale getirilmesi ayrı
  bir özellik inşası (yeni tablo + RLS) gerektiriyor.
- ❗ **AÇIK NOT 4 — `LoyaltyCard.tsx` koddan tamamen erişilemez ve hiçbir
  backend'i yok:** `types.ts`'te `'LOYALTY_CARD'` bir `AppView` olarak
  tanımlı, ama `App.tsx`'in router'ında bu view için **hiçbir `case` yok**
  ve kod tabanının başka hiçbir yerinde `LoyaltyCard` import edilmiyor —
  ekrana ulaşmanın koddan hiçbir yolu yok. İçeriği de tamamen sabit
  (`useState(9)` damga sayısı). Sadakat puanlama mantığı (gerçek maç sayısına
  göre damga biriktirme) için şemada hiçbir tablo/alan da yok. Ürün kararı:
  (a) router'a bağlanıp gerçek bir sadakat sistemi inşa edilsin, ya da
  (b) tamamen ölü kod olduğundan kaldırılsın.
- ⚠️ **Küçük not — `OpponentFinder.tsx`:** Modül 6'nın kapsamında listelenmiş
  olmasına rağmen o turda fiilen incelenmemişti; bu turda `PaymentScreen`'e
  giden ikinci yol olduğu için incelendi. Tüm rakip takım listesi/profili/
  "meydan okuma" akışı `MOCK_TEAMS` sabit verisiyle çalışıyor — Modül 6'daki
  `TransferCenter.tsx` ile aynı kategoride (gerçek backend'i olmayan, sahte
  veriyle çalışan bir eşleşme özelliği). Aynı ürün kararına bağlı olarak
  birlikte ele alınmalı.
- ✅ **Doğrulandı, sağlam:** `services/paymentService.ts` (saha kaporası
  ödeme akışı, Modül 4'te doğrulanmıştı) ve `process_match_payment`/
  `process_match_refund` RPC'leri (Modül 5'te doğrulanmıştı) bu modülün
  gerçek, çalışan tek para hareketi yolları — değişiklik gerekmedi.
  `wallet_transactions` tablosundaki RLS de canlıda doğru: kullanıcı kendi
  geçmişini görebiliyor ama doğrudan satır ekleyemiyor/değiştiremiyor/
  silemiyor; tüm yazmalar `SECURITY DEFINER` fonksiyonlar üzerinden gidiyor.

**6) Piyasa öncesi yapılacaklar**
- [x] `WalletScreen.tsx` gerçek `wallet_balance` değerini gösteriyor.
- [x] `App.tsx` girişte gerçek `is_pro` değerini okuyup store'a yazıyor.
- [ ] **Modül 15'te** `protect_profile_columns` tetikleyicisi `is_pro`,
      `wallet_balance`, `trust_score`, `skill_rating`, `reliability_score`,
      `win_count`, `total_matches` alanlarını da kapsayacak şekilde
      genişletilmeli (kullanıcı onayı bekliyor).
- [ ] Modül 15'teki açık kapatıldıktan **sonra**: PRO satın alma için gerçek
      ödeme + sunucu tarafı `SECURITY DEFINER` RPC ile `is_pro` yazımı
      kurulmalı.
- [ ] Cüzdana gerçek para yükleme (top-up) için ödeme sağlayıcısı + yeni
      `SECURITY DEFINER` RPC/Edge Function tasarlanmalı — şu an hiçbir
      backend yok.
- [ ] `PaymentScreen.tsx`'in kapora adımına Modül 4'teki gibi gerçek
      `payBookingDeposit()` çağrısı eklenmeli — ama önce bu ekrana giden
      yolların (`PitchDiscovery.onBook`, `OpponentFinder`) gerçek hale
      getirilip getirilmeyeceğine karar verilmeli.
- [ ] "Maç Havuzu" (bölünmüş ödeme) özelliği gerçek bir backend'e
      (katkı kayıtları + cüzdan düşümü) bağlanmalı — yeni tablo/RLS gerekiyor.
- [ ] `LoyaltyCard.tsx` için erişim noktası eklenip gerçek bir sadakat
      sistemi mi kurulacak, yoksa ekran tamamen kaldırılacak mı — ürün
      kararı gerekiyor.
- [ ] `OpponentFinder.tsx`'in "rakip bul / meydan oku" akışı gerçek bir
      backend'e bağlanmalı (Modül 6'daki `TransferCenter` kararıyla birlikte
      ele alınmalı) — yeni tablo/RLS gerekiyor.

