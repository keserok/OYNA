# OYNA APP — Tam Kapsamlı UX/UI Olgunlaştırma Promptu

> Bu dosyayı yapay zeka ajanına vererek Oyna uygulamasının Airbnb/Uber seviyesine taşınması için kapsamlı refactor çalışmasını başlatabilirsiniz.

---

## Rol ve hedef

Sen **Oyna** adlı halı saha marketplace uygulamasında çalışan kıdemli bir full-stack React mühendisisin. Proje: React 19 + Vite + Tailwind 4 + Zustand + Capacitor + Supabase.

**Ana hedef:** Uygulamayı Airbnb/Uber seviyesinde **güvenilir, tutarlı ve ölçeklenebilir** bir marketplace deneyimine taşımak.

**Kritik kısıt — UI değişiklikleri minimal ama etkili olmalı:**

- Mevcut neon/gaming görsel kimliği (`#0A0E14`, `#39FF14`, `#FFFF00`, glassmorphism, Framer Motion) **korunacak**
- Yeni renk paleti, font veya "flat corporate" redesign **yapma**
- Animasyonları azaltma veya kaldırma **yapma** (sadece `prefers-reduced-motion` desteği ekle)
- Dashboard kartlarının görsel stilini yeniden tasarlamak **yapma**
- Odak: navigasyon, gerçek veri, hata yönetimi, tipografi okunabilirliği (sadece okunamaz boyutları düzelt), akış tutarlılığı, teknik borç

---

## Proje bağlamı (mevcut durum)

### Güçlü yanlar (dokunma / koru)

- `PitchDiscovery` harita pin UX (Airbnb tarzı)
- `MatchDiscovery` filtre wizard
- Safe area CSS (`index.css`)
- Push notification + deep link altyapısı
- Lazy loading + ErrorBoundary

### Bilinen kritik sorunlar (çözülecek)

| Alan | Sorun |
|------|--------|
| Navigasyon | 50+ `AppView`, tek `switch` in `App.tsx`, geri yığını yok |
| Veri | Mock/demo (`constants.ts`, `store.ts`, `pravatar.cc`) production UI ile karışık |
| Auth | Apple Sign In mock; logout redirect yorum satırında |
| Ödeme | `PaymentScreen` tamamen simüle |
| Hata UX | `alert()` yaygın; tutarsız toast |
| a11y | `aria-*` yok; 7–9px metinler var |
| Kod | `MatchJoin.tsx` (~3000), `OwnerPanel.tsx` (~3600) monolitik |
| Bug | `LocationPrompt.tsx` satır 140–141 syntax hatası |
| Onboarding | Splash 2.6s zorunlu bekleme |
| Bottom nav | Sadece 5 ekranda görünüyor |

---

## Faz planı (sırayla uygula, her faz bitince lint/build geçmeli)

### FAZ 0 — Acil düzeltmeler (bloker)

1. **`views/LocationPrompt.tsx` syntax hatasını düzelt** — dosya derlenebilir olmalı
2. **`App.tsx` logout akışını düzelt** — kullanıcı çıkışında `SPLASH` veya `ROLE_SELECTION`'a güvenli yönlendirme
3. **Global toast sistemi oluştur** (minimal UI):
   - `components/Toast.tsx` + `hooks/useToast.ts` veya Zustand slice
   - Success / error / info varyantları; mevcut renklerle uyumlu (koyu zemin, `#39FF14` success, kırmızı error)
   - Tüm `alert()` çağrılarını toast ile değiştir (öncelik: `ServiceDashboard`, `SettingsScreen`, kullanıcı-facing ekranlar)
4. **Okunamaz tipografi düzeltmesi (minimal)**:
   - `text-[7px]` ve `text-[8px]` → minimum `text-[10px]` veya `text-xs` (11–12px)
   - Sadece okunabilirlik sorunu olan yerler; layout bozulmasın diye `leading-tight` kullan
   - Body metinlerde `text-sm` (14px) tercih et; başlık stillerine dokunma

---

### FAZ 1 — Navigasyon altyapısı (UI görünümü değişmeden)

**Amaç:** State-based view switching yerine gerçek router; native back gesture desteği.

1. **`react-router-dom` ekle** (v6+)
2. **Route yapısı oluştur** — `routes/index.tsx` veya `AppRoutes.tsx`:

```
/                          → Splash (veya redirect)
/onboarding/role           → RoleSelection
/onboarding/auth           → AuthScreen
/onboarding/location       → LocationPrompt

/ (tab layout)             → BottomNav wrapper
  /home                    → Dashboard
  /matches                 → MatchDiscovery
  /tactics                 → Studio
  /pitches                 → PitchDiscovery
  /profile                 → ProfileScreen

/pitches/:id/book          → BookingAddons
/payment                   → PaymentScreen
/matches/:id               → MatchJoin
/matches/create            → MatchCreate
/marketplace/gk            → Marketplace (type=GK)
/marketplace/ref           → Marketplace (type=REF)
/settings                  → SettingsScreen
/wallet                    → WalletScreen
/chat                      → ChatScreen
... (diğer stack ekranlar)
```

3. **`App.tsx` refactor:**
   - `view` state + büyük `switch` → `<Routes>` + `<Route>`
   - `setView('X')` → `navigate('/path')` wrapper veya hook (`useAppNavigate`)
   - `marketplaceReturnView`, `matchJoinReturnView` → `location.state.from` veya `navigate(-1)`
   - Bottom nav: route path'e göre active state; **aynı görsel component** (`BottomNav.tsx`), sadece `currentView` yerine `useLocation().pathname`

4. **Geri buton davranışı standardize et:**
   - Tüm stack ekranlarda header sol üst `ArrowLeft` → `navigate(-1)`
   - `onBack` prop'ları kademeli olarak `navigate(-1)` ile değiştir

5. **`prefers-reduced-motion`:**
   - `index.css` veya hook: reduced motion aktifse Framer Motion `transition={{ duration: 0 }}` veya animasyonları devre dışı bırak
   - Mevcut animasyonları silme, sadece koşullu kıs

**UI kısıtı:** BottomNav, header, kartlar **aynı görünsün** — sadece routing mantığı değişsin.

---

### FAZ 2 — Veri katmanı: mock vs gerçek ayrımı

**Amaç:** Production UI'da demo veri gösterilmesin; boş state + gerçek API.

1. **`lib/dataMode.ts` oluştur:**

   ```ts
   export const IS_DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';
   ```

2. **Mock veriyi izole et:**
   - `constants.ts` demo datası → `constants.demo.ts` veya `fixtures/`
   - `store.ts` içindeki hardcoded users/matches → sadece `IS_DEMO_MODE` true iken yükle

3. **Her kritik ekran için veri kaynağı netleştir:**

| Ekran | Gerçek kaynak | Demo fallback |
|-------|---------------|---------------|
| MatchDiscovery | `fetchNearbyMatches()` | Sadece demo mode |
| PitchDiscovery | Supabase `pitches` | Sadece demo mode |
| Marketplace GK/REF | Supabase profiles | Sadece demo mode |
| Dashboard countdown | Kullanıcının yaklaşan maçı | Empty state |
| Profile | `profiles` + match history | Empty state |
| CommunityView | Supabase communities | **Hardcoded props kaldır** (`App.tsx` satır 477–481) |

4. **Avatar fallback:**
   - `pravatar.cc` → initials avatar component (`components/InitialsAvatar.tsx`)
   - Gerçek `avatar_url` yoksa renkli daire + isim baş harfleri (mevcut palette ile)

5. **Empty state standardı** — `components/EmptyState.tsx` (minimal, mevcut stil):
   - İkon + kısa başlık + 1 CTA
   - Örnek: "Yakınında maç yok" → "Yarıçapı genişlet" / "Maç oluştur"
   - `MatchDiscovery`, `PitchDiscovery`, `UpcomingMatchesView`, `Marketplace` için uygula

6. **Loading state standardı** — `components/ViewSkeleton.tsx`:
   - Dashboard'daki mevcut skeleton pattern'i paylaşımlı component yap
   - Liste ekranlarında tutarlı kullan

---

### FAZ 3 — Auth ve onboarding olgunlaştırma

1. **Splash optimizasyonu (minimal UX):**
   - 2600ms sabit bekleme → max 1200ms VEYA `isHydrated && isAuthReady` olunca hemen geç
   - Skip butonu ekle (küçük, alt köşe, mevcut stil)

2. **AuthScreen:**
   - Apple Sign In: mock kaldır; gerçek Supabase OAuth veya Capacitor Sign in with Apple
   - Başarısız login → toast error (Türkçe, anlamlı mesaj)
   - Loading state butonlarda (spinner, disabled)

3. **RoleSelection:**
   - Basılı tutma + progress bar **kaldır**
   - Tek tap ile rol seçimi; haptic feedback koru
   - Progress animasyonu yerine anında `onComplete` (200ms max micro-feedback yeterli)

4. **LocationPrompt:**
   - DENIED state'te Settings'e yönlendirme linki (iOS/Android)
   - Konum DB kaydı fail → toast warning, akış devam edebilsin

---

### FAZ 4 — Kritik marketplace akışı (tek funnel kusursuz)

**Öncelikli akış:** Saha bul → Rezervasyon → Ödeme → Bilet/Onay → Maça katıl

Bu akış Airbnb booking + Uber trip confirm kalitesinde olmalı. Diğer özellikler (Studio, Community, OynaTV) ikinci planda.

1. **PitchDiscovery → BookingAddons → Payment → MatchTicket:**
   - Seçilen saha/saat state'i route params veya Zustand booking slice ile taşınsın
   - Her adımda **progress indicator** (minimal: 4 nokta veya "Adım 2/4" — mevcut header stiline uygun)
   - Fiyat breakdown her adımda tutarlı (PaymentScreen'deki mock sabitler → seçilen sahadan gelen gerçek fiyat)

2. **PaymentScreen:**
   - Mock ödeme simülasyonunu `services/paymentService.ts` abstraction'ına taşı
   - Env ile: `VITE_PAYMENT_PROVIDER=mock|iyzico|stripe`
   - Mock modda bile: loading → success/error state net olsun
   - Success sonrası otomatik `MatchTicket` + "Ana sayfaya dön" CTA

3. **MatchJoin refactor (davranış koru, kod böl):**

   ```
   views/match-join/
     MatchJoin.tsx          (orchestrator, <400 satır)
     MatchJoinHeader.tsx
     MatchJoinRoster.tsx
     MatchJoinChat.tsx
     MatchJoinActions.tsx
     hooks/useMatchJoin.ts
   ```

   - UI görünümü **değişmesin**; sadece parçala
   - Mevcut tüm özellikler çalışmaya devam etsin

4. **MatchDiscovery → MatchJoin:**
   - Deep link `oyna://match/:id` router ile uyumlu: `/matches/:id`
   - Geri dönüş: discovery'den geldiyse oraya, dashboard'dan geldiyse oraya

---

### FAZ 5 — Güven sinyalleri ve tutarlılık (minimal UI eklemeleri)

Yeni büyük bileşenler ekleme; mevcut kartlara küçük trust elementleri:

1. **`components/TrustBadge.tsx`** (tek satır, küçük):
   - Doğrulanmış kullanıcı ✓
   - Puan + yorum sayısı
   - MarketplaceCard, MatchDiscovery kartlarında kullan

2. **Ödeme ekranında** mevcut `ShieldCheck` yanına tek satır: "Güvenli ödeme altyapısı" (provider adı env'den)

3. **Dashboard hierarchy (minimal):**
   - En üstte **tek birincil CTA**: kullanıcının durumuna göre dinamik
     - Yaklaşan maç varsa → countdown kart (mevcut, dokunma)
     - Yoksa → "Maç Bul" veya "Maç Oluştur" (mevcut kartlardan birini öne çıkar, yeni kart ekleme)
   - Diğer kartların sırasını değiştir; görsel stil aynı kalsın

4. **Bottom nav tutarlılığı:**
   - Tab ekranlarında nav görünsün
   - Stack ekranlarda (payment, match detail) gizlensin — **mevcut mantık koru**, route tabanlı yap

---

### FAZ 6 — Erişilebilirlik (minimal, zorunlu)

Tam WCAG audit değil; kritik minimum:

1. **BottomNav butonları:** `aria-label="Ana Sayfa"` vb.
2. **Geri butonları:** `aria-label="Geri"`
3. **Form inputları:** `<label>` veya `aria-label`
4. **Toast:** `role="alert"` + `aria-live="polite"`
5. **Focus visible:** `index.css`'e minimal `:focus-visible { outline: 2px solid #39FF14; }`
6. **Kontrast:** yeni renk ekleme; sadece `text-gray-500` olan kritik bilgileri `text-gray-400` yap (okunabilirlik)

---

### FAZ 7 — Kod kalitesi ve bakım

1. **OwnerPanel.tsx parçala** (MatchJoin ile aynı strateji) — UI değişmesin
2. **`Dashboard_backup.tsx` sil** (kullanılmıyorsa)
3. **`types.ts` AppView** → route path enum/helper ile senkronize et veya kademeli deprecate
4. **Merkezi design token dosyası** (minimal):

   ```ts
   // theme/tokens.ts
   export const colors = { bg: '#0A0E14', primary: '#39FF14', accent: '#FFFF00', surface: '#161B22' };
   export const spacing = { card: 'rounded-[32px]', nav: 'rounded-[32px]' };
   ```

   - Yeni kodda inline hex yerine token kullan
   - Mevcut dosyaları toplu refactor etme (sadece dokunduğun dosyalarda)

5. **`npm run lint` (tsc) hatasız geçmeli**
6. **`npm run build` başarılı olmalı**

---

## Dokunma listesi (YAPMA)

- Neon/gaming estetiğini corporate/minimal Airbnb klonuna çevirme
- Framer Motion animasyonlarını toplu kaldırma
- Dashboard kart görsellerini yeniden tasarlama
- Yeni font ekleme (Inter kalsın)
- Community, Studio, OynaTV, Admin panel özelliklerini silme veya büyük redesign
- Tüm `constants.ts` mock datasını bir anda silme (demo mode'a taşı)
- Git commit/push (kullanıcı istemedikçe)

---

## Kabul kriterleri (Definition of Done)

### Navigasyon

- [ ] Browser/Android back butonu beklenen ekrana döner
- [ ] Deep link `/matches/:id` çalışır
- [ ] Bottom nav 5 tab'da aktif state doğru

### Veri

- [ ] `VITE_DEMO_MODE=false` iken pravatar/demo isimler görünmez
- [ ] API boş dönünce anlamlı empty state + CTA var
- [ ] CommunityView hardcoded props yok

### Auth

- [ ] Google + Apple gerçek login (veya Apple env yoksa buton disabled + açıklama)
- [ ] Logout temiz state reset

### Ödeme akışı

- [ ] Pitch → Book → Pay → Ticket uçtan uca state kaybı yok
- [ ] Fiyat seçilen sahadan geliyor (mock provider'da bile tutarlı)

### UX

- [ ] Kullanıcı-facing `alert()` kalmadı
- [ ] 7–8px metin kalmadı
- [ ] Splash max ~1.2s veya auth ready'de geçiş
- [ ] Rol seçimi tek tap

### Teknik

- [ ] `LocationPrompt.tsx` derleniyor
- [ ] `MatchJoin` <500 satır orchestrator + alt modüller
- [ ] lint + build geçiyor

---

## Önerilen uygulama sırası (tek oturumda hepsini yapma)

```
Oturuş 1: Faz 0 + Faz 1 (bloker + router)
Oturuş 2: Faz 2 + Faz 3 (veri + auth)
Oturuş 3: Faz 4 (booking funnel + MatchJoin split)
Oturuş 4: Faz 5 + 6 + 7 (trust, a11y, cleanup)
```

Her oturuş sonunda: değişiklik özeti + test edilen akışlar listesi ver.

---

## Test planı (manuel)

1. **Cold start:** Splash → Role → Google Auth → Location → Dashboard
2. **Maç keşfi:** Konum açık/kapalı, filtre, empty state, maça tıkla → MatchJoin → geri
3. **Rezervasyon:** PitchDiscovery harita → saha seç → addon → ödeme → bilet
4. **Logout/login:** State temiz mi?
5. **Deep link:** `/matches/{id}` doğrudan açılış
6. **Demo mode kapalı:** Mock veri görünmüyor mu?
7. **Reduced motion:** OS ayarı açıkken animasyonlar kısılıyor mu?

---

## Çıktı formatı (ajandan beklenen)

Her faz tamamlandığında şu formatta rapor ver:

```markdown
## Faz X — Tamamlandı

### Yapılanlar
- ...

### Değişen dosyalar
- path/to/file.tsx — kısa açıklama

### UI değişikliği
- Minimal / Yok / Sadece X ekranında Y

### Test edildi
- [ ] akış 1
- [ ] akış 2

### Bilinen kalan işler
- ...
```

---

## Ortam değişkenleri (`.env.example` güncelle)

```env
VITE_DEMO_MODE=false
VITE_PAYMENT_PROVIDER=mock
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

---

## Ajan başlangıç komutu

Aşağıdaki metni ajan promptunun sonuna ekle:

> **Başla:** Önce repoyu tara, Faz 0'dan başla. UI'da sadece okunabilirlik, toast, empty state ve progress indicator ekle; görsel kimliği koru. Her faz bitince lint/build çalıştır ve rapor ver. Commit atma.
