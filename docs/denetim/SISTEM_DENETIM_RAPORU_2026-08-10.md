# OYNA — Kapsamlı Sistem Denetim Raporu

**Tarih:** 10 Ağustos 2026
**Kapsam:** UI/Tasarım Sistemi · UX/Etkileşim · Mobil Frontend Mimari & Performans · Backend/API · Veritabanı/Cache/Real-time · Mobil Güvenlik (OWASP MASVS)
**Metodoloji:** 6 boyutlu paralel denetim + her Critical/High bulgunun bağımsız adversarial doğrulaması (dosya:satır teyidi, mitigasyon taraması, severity kalibrasyonu). 17 Critical/High adayından 12'si CONFIRMED, 4'ü severity düşürülerek ADJUSTED, 1'i REFUTED (yanlış pozitif) olarak elendi.

> Satır numaraları denetim tarihindeki `main` tabanlı çalışma kopyasına aittir.

---

## 1. ÖZET SKOR TABLOSU

| Katman | Puan (10) | Critical | High | Medium | Bir cümlelik teşhis |
|---|---|---|---|---|---|
| **UI / Tasarım Sistemi** | **5.5** | 0 | 2 | 7 | Token altyapısı örnek seviyede tanımlı, ama benimseme ~%6 — 3.240 hardcoded hex, 4 paralel toast / 7 paralel modal sistemi |
| **UX / Etkileşim** | **6.5** | 0 | 1 | 6 | StatusState/errorMap/outbox altyapısı güçlü; benimseme tutarsız — para üreten yayınlama akışı zaman aşımı korumasız |
| **Frontend Mimari & Performans** | **6.0** | 0 | 3 | 4 | 63 lazy-import ile iyi bölünmüş; ama TS strict tamamen kapalı ve 34 ekran tüm store'a abone |
| **Backend / API** | **6.0** | 0 | 2 | 6 | Ödeme edge function'ları olgun (idempotency, imzalı doğrulama, sweep); üretimde varsayılan-açık demo girişi ve merkezi HTTP hata katmanının yokluğu gölgeliyor |
| **Veritabanı / Cache / Real-time** | **6.0** | 0 | 3 | 3 | FK indeksleme ve SECURITY DEFINER hijyeni tam; realtime katmanında yeniden bağlanma/telafi hiç yok, son RLS aynasında anon'a açık aktivite tabloları |
| **Güvenlik (MASVS)** | **6.0** | 0 | 1\* | 3 | Secret hijyeni ve para akışı sunucu savunması güçlü; ancak tesis sahibi PSP anahtarları RLS ile herkese açık (\*Critical'e yakın) |
| **GENEL** | **≈6.0** | **0** | **12** | **29** | Bilinçli mühendislik kararlarıyla kurulmuş sağlam bir çekirdek; sorunlar tanım katmanında değil, standartların **benimsenme ve tamamlanma** katmanında |

**Genel değerlendirme:** Kod tabanı "kötü yazılmış" değil — tam tersine, birçok altyapı parçası (idempotent offline outbox, iyzico sunucu-tarafı doğrulamalı webhook, PKCE + üçlü oturum aynası, K-12.1 gibi ölçülmüş realtime kararları, 619 SECURITY DEFINER fonksiyonun tamamında `search_path` hijyeni) sektör ortalamasının üstünde. Tekrarlayan desen şu: **doğru çözüm bir kez inşa edilmiş, sonra kod tabanının geri kalanına yayılmamış.** ActionSheet varken 104 el yapımı overlay, errorMap varken servis-dışı ham hatalar, submitGuard varken korumasız yayınlama, VirtualList varken düz `.map()`, matches tablosunda sütun-düzeyi RLS varken pitches'ta yok.

Sıfır "Critical" görünse de iki High **koşullu Critical**: `SEC-1` (PSP kolonları production'da doluysa doğrudan finansal kimlik hırsızlığı) ve `BE-12` (iki env yanlış kombinasyonu ödemesiz "ödendi" üretir).

---

## 2. KRİTİK BULGULAR (Severity: Critical'e yakın / High)

Tüm bulgular bağımsız bir doğrulayıcı tarafından dosya:satır düzeyinde teyit edilmiştir.

### 2.1 · SEC-1 — Tesis sahibi Param PSP anahtarları RLS ile anon dahil herkese açık ⚠️ *Critical'e yakın*
**Dosya:** `supabase/migrations/20260810000000_convergence_rls_faz2b.sql:258-259` · okuma yolu `services/pitchOwnerService.ts:1768`

`pitches` tablosunun SELECT politikaları yalnız satır bazlı filtreliyor (`is_demo`), sütun maskesi yok. `param_api_key`, `param_merchant_id`, `param_client_id` sütunları için hiçbir migration'da sütun-düzeyi `REVOKE SELECT` bulunmuyor. Sonuç: bundle'a gömülü anon anahtarla **kimliksiz** bir istemci bile tüm gerçek sahaların ödeme sağlayıcı kimlik bilgilerini sorgulayabilir. Sütunun kendi tanımı (`20260615000001:14`) "yalnızca tesis sahibi RLS ile erişir" vaadinde bulunuyor ama vaat tutulmamış. Ekip aynı korumayı `matches` için `20260803234421`'de doğru uygulamış — desen mevcut, pitches'a uygulanmamış. Kolonlar üretimde doluysa bu **doğrudan finansal kimlik hırsızlığı** vektörüdür.

### 2.2 · BE-1 — Üretimde varsayılan-AÇIK demo hesap girişi + bundle'a gömülü sabit şifre
**Dosya:** `supabaseAuth.ts:298` (`DEMO_PASSWORD = 'password123'`), `:336-338` (fail-open kill-switch), `:273-279` (`?demo=1`)

Kill-switch ters kurulmuş: `import.meta.env.VITE_DEMO_ACCOUNTS !== 'false'` — env **açıkça** `'false'` yapılmadıkça seçici üretimde açık; `.env.example` ve `vercel.json`'da bu değişken hiç tanımlı değil. `loginDemoAccount` üretim Supabase'indeki gerçek `@oyna.app` hesaplarına standart `signInWithPassword` ile girer. Bundle'ı okuyan herkes demo hesaplara (kaleci/hakem/tesis rolleri dahil) gerçek RLS yetkileriyle girip cüzdan/rezervasyon akışlarını tetikleyebilir. `?demo=1` URL anahtarı ayrıca herhangi bir domain'de dev-mode demoLogin'i açıyor.

### 2.3 · BE-12 — SIMULATION webhook'u imzasız gövdeyle `apply_booking_payment` çalıştırabiliyor (latent Critical)
**Dosya:** `supabase/functions/payment-webhook/index.ts:100-115`

`PROVIDER=SIMULATION` + `SIMULATION_WEBHOOK_ALLOW` birlikte setliyken hiçbir imza/secret kontrolü olmadan POST gövdesindeki `conversationId` → `intentId` alınıp ödeme "ödendi" işaretleniyor. İki env yanlışlıkla canlıda kalırsa intent UUID'sini bilen herkes kimliksiz POST ile ödemesiz booking onaylatabilir. Para kaybı senaryosunun kapısı yalnız env hijyenine emanet.

### 2.4 · SEC-2 — Admin MFA yalnız istemci tarafında zorlanıyor (ADJUSTED: High → Medium, latent High)
**Dosya:** `supabase/migrations/20260617000001_godview_platform_foundation.sql:7`; `admin-panel/views/AdminMfaGate.tsx`

`is_platform_admin()` yalnız `profiles` bayraklarına bakıyor, oturumun `aal2` seviyesini kontrol etmiyor. Admin edge function'ları (`admin-create-user:31`, `admin-owner-credentials:34`) yetkiyi sadece bu RPC ile doğruluyor; MFA kapısı tamamen istemcide. **Severity Medium'a düşürüldü** çünkü `admin_mfa_required` bayrağı bugün varsayılan `false` (deponun RAF.md/OYNA_PRENSIPLER.md notlarıyla teyitli) — atlatılacak ikinci faktör fiilen yok. Ama bayrak açıldığı gün sunucu tarafı aal2 kontrolü olmadığı için **sahte güvenlik** doğurur; o an High olur.

### 2.5 · BE-2 — Mesaj listesi en eski 100 kayıtta kesiliyor
**Dosya:** `services/messageService.ts:72-78`

`.order('created_at', { ascending: true }).limit(100)` — artan sıralama + limit, konuşmanın **ilk** 100 mesajını döndürür. 100'ü aşan DM'lerde en güncel mesajlar sorguya hiç girmez (yalnız realtime ile canlı gelenler görünür). `teamChatService.ts:60-71` aynı işi doğru yapıyor (descending + reverse). Kolay tetiklenen, sessiz veri-görünürlüğü hatası.

### 2.6 · DB-4 — Kullanıcı-aktivite tabloları anon dahil herkese okunur
**Dosya:** `supabase/migrations/20260810000000_convergence_rls_faz2b.sql:153, 234, 378`

En yeni RLS aynasında `match_registrations` (`user_id`, `payment_status`), `pitch_slot_holds` (`held_by` UUID + hangi saha/slot), `waitlist` (`user_id`) hâlâ `TO public USING (true)`. `pitch_slot_holds` güncel rezervasyon akışında **aktif**. Anon istemci REST üzerinden kimin hangi maça kayıtlı olduğunu, ödeme durumunu ve kimin hangi slotu tuttuğunu sorgulayabilir — rakip gözetlemesi + davranış verisi sızıntısı.

### 2.7 · DB-2 — Hiçbir realtime abonelikte reconnect / kaçan-olay telafisi yok
**Dosya:** `services/teamChatService.ts:131`, `messageService.ts:133`, `matchService.ts:431`, `pitchBookingService.ts:96`, `notificationService.ts:121`, `socialService.ts:381`

Tüm kod tabanında `subscribe((status) => ...)` kullanımı **sıfır**. Capacitor uygulaması arka plana alındığında/ağ değiştiğinde websocket düşer; kopukluk sırasındaki INSERT'ler (sohbet, DM, lobi slot, saha müsaitliği) sessizce kaybolur, ekran yeniden açılana kadar bayat kalır. Kullanıcı dolu slotu boş sanıp rezervasyona kalkışabilir. (supabase-js soket düzeyinde reconnect yapar, ama kopukluk penceresindeki kaçan olaylar için refetch tetiklenmez.)

### 2.8 · DB-3 / FE-3 / BE-3 — `subscribeToOpenMatches`: sınırsız `select('*')` + her olayda tam refetch
**Dosya:** `services/matchService.ts:36-46` · tüketici `views/ServiceDashboard.tsx:401`

Limit yok, bölge filtresi yok, tüm kolonlar; her `status=OPEN` değişiminde tüm tablo debounce'suz yeniden iniyor. Deponun kendi K-12.1 kararı bu deseni "500 abone × 3,5KB" ölçümüyle store'da kapatmış ama bu yol açık kalmış. Ayrıca `postgres_changes` filtresi OPEN→CLOSED geçişinde olay üretmediği için dolan maç iş listesinde "açık" kalıyor — kaleci var olmayan işe başvurur. (BE tarafında severity ADJUSTED: etki yüzeyi yalnız çevrimiçi kaleci/hakem panelleriyle sınırlı, ama sınırsız büyüyen tam-tablo indirme + işlevsel bayatlık birlikte High'i hak ediyor.)

### 2.9 · FE-1 — 34 selektörsüz `useAppStore()` çağrısı, App kökü dahil
**Dosya:** `App.tsx:150-185` (~35 alan tek destructure); ayrıca `MatchDiscovery:53`, `PaymentScreen:89`, `MatchJoin:310`, `WalletScreen:118`, `Notifications:143`

Zustand v5'te selektörsüz çağrı tüm store'a abone eder. 1407 satırlık store'un **her** `set()` çağrısı (bildirim gelişi, rozet artışı) App kökünü ve o an açık ağır ekranı yeniden render eder. Repoda `useShallow`/`shallow` yok, yalnız 3 `React.memo` var. 3DS ödeme sırasında jank + pil tüketimi riski.

### 2.10 · FE-2 — TypeScript strict tamamen kapalı + 227 `: any` / 126 `as any`
**Dosya:** `tsconfig.json` (hiç strict bayrağı yok; `supabase` + `notifications` exclude'lu)

En yoğun: `views/MatchJoin.tsx` (63), `views/ServiceDashboard.tsx` (39), `views/PaymentScreen.tsx` (17 — RPC yanıtları `data as any`). Ödeme tutarı/intent durumu gibi kritik alanlarda derleyici hiçbir null/tip hatası yakalamıyor; snake_case→camelCase eşleme hataları ancak çalışma anında patlıyor. 42KB'lık `types.ts`'in güvencesi fiilen devre dışı.

### 2.11 · UI-1 — Renk token sistemi tanımlı ama TSX'te uygulanmıyor (~%6 benimseme)
**Dosya:** `views/Studio.tsx:87` + geneli

index.css 81 token tanımlıyor ama TSX'te 3.240 hardcoded hex var; ilk dördü tam token kopyası (`#39FF14`×935, `#0A0E14`×475, `#161B22`×323, `#FACC15`×290). `var(--)` kullanımı yalnız 178. 224 farklı hex → paralel ton türemiş (aynı "başarı" üç farklı yeşille). Tema/marka rengi tek yerden değiştirilemez. En çok ihlal: Studio.tsx (170), RahatMatchLobby (132), MatchCreate (123), MatchJoin (100), ServiceDashboard (97).

### 2.12 · UI-2 — index.css'in kendi yasakladığı düşük-kontrast metin sınıfları 265 yerde
**Dosya:** `views/owner/calendar/FinancialCalendarView.tsx:478` + geneli

index.css:256 açıkça `text-gray-500 (4.00:1)` yasaklıyor ama 265 kullanım var, en yoğunu **para gösteren** tesis paneli ekranlarında (10px puntoda tahsilat/bekleyen tutarları). WCAG AA (4.5:1) ihlali; güneş altında sahada okunmaz. En izinli soluk `--color-ink-4 (#8B949E, 5.62:1)` mevcut, kullanılmıyor.

### 2.13 · UX-3 — `submitGuard` çevrimdışı kapısı + timeout yalnız PaymentScreen'de
**Dosya:** `views/MatchCreate.tsx:412, 438` · ölü sabitler `shared/submitGuard.ts:57-63`

Kapora tahsilatlı maç yayınlama `isOnline()` kapısı ve `withSubmitTimeout` olmadan `createMatchAtomic` çağrısında **süresiz** bekliyor. `OFFLINE_PUBLISH`/`TIMEOUT_PUBLISH` sabitleri 0 kullanımla ölü; `withSubmitTimeout` tüm uygulamada yalnız `PaymentScreen.tsx:582`'de çağrılıyor. Yarı-kopuk ağda kaptan yayınlama ekranında kilitli kalır. (Sunucu idempotency çift kaporayı önlüyor, ama UX kilidi çözülmemiş.)

---

## 3. İYİLEŞTİRME KOD ÖRNEKLERİ (Refactoring)

### Örnek 1 — BE-1: Demo kill-switch fail-open → fail-safe (tek satır, en yüksek ROI)

```typescript
// ❌ MEVCUT — supabaseAuth.ts:336  (üretimde VARSAYILAN AÇIK)
export const isDemoAccountPickerEnabled = (): boolean => {
  // env AÇIKÇA 'false' yapılmadıkça seçici görünür.
  // .env.example ve vercel.json'da bu değişken TANIMLI DEĞİL → prod'da açık.
  return import.meta.env.VITE_DEMO_ACCOUNTS !== 'false';
};
```

```typescript
// ✅ ÖNERİLEN — fail-safe: yalnız açıkça 'true' ise aç
export const isDemoAccountPickerEnabled = (): boolean => {
  // Varsayılan KAPALI. Demo ortamı build'inde bilinçli açılır:
  //   VITE_DEMO_ACCOUNTS=true  (yalnız staging/preview)
  // Prod build env vermez → seçici hiç görünmez, sabit şifre işe yaramaz.
  return import.meta.env.VITE_DEMO_ACCOUNTS === 'true';
};

// ?demo=1 URL kapısını (supabaseAuth.ts:273) prod build'de tamamen kapat:
const isDemoLoginEnabled = (): boolean =>
  import.meta.env.VITE_DEMO_ACCOUNTS === 'true' && import.meta.env.DEV;
```
> Ek olarak lansman öncesi `@oyna.app` hesaplarının şifrelerini rotasyonla değiştirin ve demo hesapları ayrı bir staging projesine taşıyın — sabit `password123` bundle'dan okunabilir olduğu sürece asıl risk sürer.

### Örnek 2 — SEC-1: PSP secret kolonlarını RLS + kolon-grant ile kapatma (matches deseninin aynısı)

```sql
-- ❌ MEVCUT — 20260810000000_convergence_rls_faz2b.sql:258
-- Satır-bazlı filtre var, kolon maskesi YOK → anon bile param_api_key okur.
CREATE POLICY pitches_select_anon ON public.pitches
  FOR SELECT TO anon USING ((is_demo IS NOT TRUE) OR get_config_bool('demo_mode_enabled'));
```

```sql
-- ✅ ÖNERİLEN — yeni migration: tablo-düzeyi REVOKE + zararsız kolonlara GRANT
--    (matches'te 20260803234421'de uygulanan desenin aynısı)

-- 1) Genel SELECT grant'ını kaldır (RLS politikası kalır; grant olmadan kolon okunamaz)
REVOKE SELECT ON public.pitches FROM anon, authenticated;

-- 2) Yalnız zararsız kolonlara tekrar GRANT ver — PSP secret'ları HARİÇ
GRANT SELECT (
  id, owner_id, name, city, district, location, photos, amenities,
  price_per_hour, is_demo, created_at, updated_at, rating, court_count
  -- param_api_key, param_merchant_id, param_client_id KASITEN YOK
) ON public.pitches TO anon, authenticated;

-- 3) Sahibin kendi ayarlarını okuması için sahip-only SECURITY DEFINER RPC
CREATE OR REPLACE FUNCTION public.get_pitch_payment_settings(p_pitch_id uuid)
RETURNS TABLE (param_merchant_id text, param_client_id text, param_api_key text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT param_merchant_id, param_client_id, param_api_key
  FROM public.pitches
  WHERE id = p_pitch_id AND owner_id = auth.uid();  -- yalnız sahibi
$$;
```
> İstemcide `pitchOwnerService.ts:1768`'deki doğrudan `.select('... param_api_key')` çağrısını bu RPC'ye taşıyın. İdeali: secret'ları ayrı, RLS'i sahip-only bir `pitch_payment_credentials` tablosuna çıkarmak.

### Örnek 3 — FE-1: Selektörsüz store aboneliğini dar selektöre çevirme (sistemik re-render'ı keser)

```tsx
// ❌ MEVCUT — App.tsx:150  (kök bileşen TÜM store'a abone)
const {
  currentView, setCurrentView, myRoles,
  addUserNotification, setNotificationPreferences,
  updateSingleNotificationPref, navOverlayOpen,
  /* ...~35 alan... */
} = useAppStore();
// → store'daki HER set() (rozet, bildirim, herhangi bir booking alanı) App'i
//   ve o an açık ağır ekranı (PaymentScreen/MatchJoin) yeniden render eder.
```

```tsx
// ✅ ÖNERİLEN — yalnız render'ı etkileyen state'e dar abonelik; aksiyonlar getState ile
import { useShallow } from 'zustand/react/shallow';

// Yalnız görünümü değiştiren bayraklara abone ol (referans-stabil):
const { currentView, navOverlayOpen } = useAppStore(
  useShallow((s) => ({ currentView: s.currentView, navOverlayOpen: s.navOverlayOpen }))
);

// Aksiyonlar abonelik gerektirmez — çağrı anında getState'ten al:
const addUserNotification = useAppStore.getState().addUserNotification;
// veya kararlı referans isteniyorsa (aksiyon referansı zaten stabildir):
const setCurrentView = useAppStore((s) => s.setCurrentView);

// Böylece bir bildirim gelişi App kökünü YENIDEN RENDER ETMEZ;
// yalnız gerçekten o veriye abone olan yaprak bileşen (<NotificationBadge>) günceller.
```
> Aynı dönüşümü `MatchDiscovery:53`, `PaymentScreen:89`, `MatchJoin:310`, `WalletScreen:118` için yapın. Kalıcı çözüm: ESLint `no-restricted-syntax` ile selektörsüz `useAppStore()` çağrısını CI'da yasaklayın.

---

## 4. ÖNCELİKLİ EYLEM PLANI

### Faz 0 — Lansman-engelleyici (bu hafta, düşük efor / yüksek etki)
1. **BE-1:** `isDemoAccountPickerEnabled`'ı fail-safe yap (`=== 'true'`), `?demo=1`'i prod'da kapat, `@oyna.app` şifrelerini rotasyonla. *(1 dosya, ~30 dk)*
2. **SEC-1:** `pitches` PSP kolonlarına REVOKE+GRANT migration'ı yaz, istemciyi sahip-only RPC'ye taşı. *(1 migration + 1 servis)*
3. **BE-12:** SIMULATION webhook'una Bearer secret kontrolü ekle; `PROVIDER=IYZICO` iken `SIMULATION_WEBHOOK_ALLOW` setliyse yok say + uyar.
4. **DB-4:** `pitch_slot_holds` SELECT'ini `held_by = auth.uid() OR saha sahibi`'ne daralt; kullanılmayan `match_registrations`/`waitlist`/`match_participants` politikalarını authenticated+own-row'a çek veya arşivle.

### Faz 1 — Veri doğruluğu & güvenilirlik (1-2 hafta)
5. **BE-2:** `getMessages`'i descending+limit+reverse desenine geçir, cursor sayfalaması ekle. *(sessiz veri kaybı)*
6. **DB-2:** Ortak `subscribeWithResync` sarmalayıcısı yaz — `SUBSCRIBED` sonrası refetch + `visibilitychange`'te son-mesaj-id resync. Tüm 6 abonelik noktasına uygula.
7. **DB-3/FE-3/BE-3:** `subscribeToOpenMatches`'i bölge+limit'li RPC'ye çevir, refetch'i debounce'la, artımlı merge kullan (store.ts:663 deseni hazır).
8. **UX-3:** `publish` (MatchCreate) ve MatchJoin yazma handler'larına `isOnline()` kapısı + `withSubmitTimeout` ekle; ölü `OFFLINE_PUBLISH`/`TIMEOUT_PUBLISH` sabitlerini bağla.
9. **BE-6:** `appStateChange` listener + `startAutoRefresh/stopAutoRefresh` ekle (foreground token yenilemesi).

### Faz 2 — Performans & mimari (2-4 hafta)
10. **FE-1:** 34 selektörsüz `useAppStore()` çağrısını `useShallow`/dar selektöre çevir; ESLint kuralıyla kilitle.
11. **FE-2:** `strictNullChecks` + `noImplicitAny` aç, baseline dondur, ödeme/rezervasyon servislerinden başlayarak `as any`'leri tek dönüştürücüde topla; `supabase gen types` kullan.
12. **BE-5:** Servis katmanına ortak hata sarmalayıcısı (AUTH/NETWORK/SERVER); 401'de otomatik logout+yönlendirme. "error yutup `[]` dön" desenini `{data, error}` sözleşmesine taşı.
13. **FE-4:** Presence heartbeat listener sızıntısını (`socialService.ts:400-417`) modül-içi tek listener'la düzelt.
14. **DB-7/DB-8:** Ana sayfa sayaçlarını çok-merkezli count RPC'sine taşı; çift bildirim kanalını tek küresel aboneliğe indir.

### Faz 3 — Tasarım sistemi & UX borcu (sürekli, codemod-ağırlıklı)
15. **UI-1/UI-2/UI-8:** Codemod ile token-kopyası hex'leri (`#39FF14`→`bg-primary`) ve yasaklı kontrast sınıflarını (`text-gray-500`→`text-ink-4`) topluca dönüştür; sabit-px puntoları rem token'a çevir. ESLint'e hex/yasaklı-sınıf koruması ekle.
16. **UI-4/UI-5/UI-6/UI-7:** Toast'u tek kanala (GlobalToast), modal/sheet'leri ActionSheet/GlassModal re-export'una, EmptyState'i StatusState'e indir; `PageLayout`'u zorunlu kabuk yap.
17. **UX-1/UX-5/UX-8:** MatchDiscovery/MyMatchesHub/MessagesView'a Loading+Error+Retry ekle (PitchDiscovery deseni hazır); hata ile boş-durumu ayır.
18. **UX-2:** View katmanındaki gerçek ham-hata sızıntı noktalarını (`socialService`, `useImageUpload`, `outbox` kaynaklı 5-6 nokta) `mapError(e, ...)` ile geçir.

---

## Ek — Doğrulamada elenen / düzeltilen bulgular

| ID | Karar | Not |
|---|---|---|
| **DB-1** (lobi kaptan kimliği bozuluyor) | **REFUTED** | Şema kaptan kimliğini iki kolona da yazıyor (`"creatorId"` + `captain_id`); realtime payload'ında `creatorId` dolu gelir, hata gerçekleşmez. |
| **UX-1** (MatchDiscovery koşulsuz boş kalır) | High → **Medium** | RPC hatasında liste `adminMatches`'e düşüyor; yanıltıcı boşluk yalnız GPS-only kohortu için geçerli. |
| **UX-2** (34 noktada ham hata) | High → **Low** | Çeviri servis katmanında (throw anında) yapılıyor; gerçek sızıntı 5-6 dar hata-yolunda. |
| **BE-3** (subscribeToOpenMatches) | High → **Medium** | Tek canlı tüketici ServiceDashboard; MatchDiscovery'deki import ölü. |
| **SEC-2** (admin MFA) | High → **Medium** | `admin_mfa_required` bugün `false`; latent risk (bayrak açılınca High). |

---

## Ek — Korunması gereken güçlü yanlar

Ödeme mimarisi (idempotency + iyzico HMAC imzalı server-to-server doğrulama + mutabakatlı `sweep-stale-payments`), `matches` tablosunda sütun-düzeyi UPDATE kilidi, istemcide `service_role` **yok**, dar gitleaks allowlist, 619 SECURITY DEFINER fonksiyonun tamamında `search_path` hijyeni, sistematik FK indeksleme (279 index), idempotent offline outbox (FIFO + `client_request_id`), safe-area/klavye altyapısı (`keyboardManager.ts`, `viewport-fit=cover`) ve 63 `lazy()` ile code-splitting — bunlar sektör ortalamasının üzerinde. Bu raporun işi, mevcut sağlam temeli **tutarlı kullanıma** çekmektir.
