# 🎯 OYNA — Piyasaya Çıkış: Kesin Plan (v2)

> **Ne bu belge?** v1'in (05.07) **main'in güncel haline karşı tam yeniden doğrulanmış** hâli. `main` bu belgenin ilk sürümünden bu yana **166 commit, 174 dosya, +27.485/-11.143 satır** ilerledi — ödeme sistemi baştan yazıldı, sosyal/takım sistemi komple yenilendi, kaleci/hakem pazaryeri "Faz 8" ile genişledi, harita motoru değişti. **11 bağımsız uzman ajan** (v1'in 5 orijinal analizi + bu turun 6 hedefli doğrulaması) her iddiayı gerçek kod ve **canlı Supabase DB**'ye (salt-okunur) karşı tek tek kanıtladı.
> **Tarih:** 2026-07-12 · **Yöntem:** git delta analizi → ekibin kendi yeni planlama dokümanlarını okuma → 6 paralel doğrulama ajanı (ödeme, sosyal/büyüme, kaleci/hakem, saha sahibi paneli, güvenlik+canlı DB, harita/mimari) → sentez.
> **v1'den fark:** v1 "para simülasyonda, büyüme motoru ölü kod" diyordu. **Artık doğru değil** — para gerçekten akıyor. Ama akarken **iki aktif, şu an sömürülebilir güvenlik açığı** taşıyor. Bu belge önce onları, sonra kesin lansman planını verir.

---

## 0. 🚨 ACİL — Bugün Kapatılması Gereken 2 Aktif Prodüksiyon Açığı

Bunlar "yol haritasında bir madde" değil — **şu an, bu saniye, prodüksiyon veritabanında sömürülebilir** iki açık. Piyasaya çıkış planının her şeyi bunların kapatılmasını bekler.

### 🔴 Açık #1 — `match_capture_deposit` yetkisiz tahsilat (doğrudan para çalma vektörü)
**Kanıt:** `supabase/migrations/20260716000001_escrow_match_lifecycle.sql` içindeki `match_capture_deposit(uuid)` fonksiyonu, kardeş fonksiyonları `match_void_deposit`/`match_cancel_by_captain`'in (satır 160-178) aksine **hiçbir `auth.uid()` sahiplik kontrolü yapmadan** `authenticated` rolüne `GRANT EXECUTE` edilmiş. Canlı Supabase security advisor bunu `authenticated_security_definer_function_executable` uyarısıyla doğruladı.
**Sömürü senaryosu:** Kimliği doğrulanmış herhangi bir kullanıcı, `POST /rest/v1/rpc/match_capture_deposit` ile **başka bir kullanıcının bloke edilmiş (henüz tahsil edilmemiş) kaporasını** zorla CAPTURE ettirebilir — parayı erken ve yetkisiz şekilde çektirir.
**Aksiyon:** Fonksiyona `match_void_deposit` ile aynı desende sahiplik/yetki kontrolü ekleyen tek satırlık bir migration. **Efor: saatler, bugün kapatılabilir.**

### 🔴 Açık #2 — `profiles` tablosu toplu PII sızıntısı
**Kanıt:** Canlı `pg_policies` sorgusu: `profiles_select_authenticated | PERMISSIVE | {authenticated} | SELECT | qual: true`. v1'de tespit edilmişti; bu turda **canlı DB'de yeniden doğrulandı** — 166 commit boyunca hiç dokunulmamış.
**Sömürü senaryosu:** Giriş yapmış herhangi bir kullanıcı `GET /rest/v1/profiles?select=*` ile tüm kullanıcı tabanının e-posta, telefon, hassas konum, push-token, `wallet_balance`, `iyzico_card_user_key` (!) bilgisini toplu çeker. Ödeme sistemi artık gerçek olduğu için bu artık yalnız KVKK riski değil, **iyzico kart-kullanıcı anahtarı sızıntısı** riski de taşıyor.
**Aksiyon:** SELECT politikasını `auth.uid() = id` + gerekli genel-görünür alanlar için ayrı whitelist view'e daralt; `email/phone/last_location/wallet_balance/iyzico_card_user_key/push_token` sütunlarını `anon`'dan REVOKE et. **Efor: 1 gün.**

> **Bu ikisi kapanmadan:** mağaza incelemesine gönderim, pazarlama kampanyası veya kullanıcı tabanını büyütecek herhangi bir adım **tavsiye edilmez**. İkisi de dış bağımlılık gerektirmiyor — bugün başlanabilir.

### 🟠 Bu Hafta (aktif değil ama gizli/zamanlanmış risk)
- **Komisyon çift-kaynağı hâlâ yaşıyor ve yeniden kopyalandı:** `credit_owner_booking_earning` trigger'ı, 15.07'de yazılan **yeni** bir migration'da bile (`20260715000001_a2_booking_payment_source_and_credit_guard.sql:61-62`) hâlâ deprecated `pitches.platform_commission_rate` kolonunu okuyor — migration'ın kendi açıklamasına göre eski gövdeden "birebir kopyalanmış". Bugün `commission_config.rate_pct=15.0` ile bu kolon (=15) tesadüfen eşit olduğu için bug gizli; admin `commission_config`'i güncellediği an owner kazançları sessizce yanlış hesaplanmaya başlar. **Aksiyon:** trigger'ı `calculate_commission()` motoruna bağla.
- **`matches` RLS'de `WITH CHECK` hâlâ yok** (`20260624000001_admin_match_control.sql:24-27`). Bugün mitigasyonu var (canlı UI kodu artık doğrudan `matches.slots` yazmıyor, yalnız RPC kullanıyor) ama DB seviyesinde değil — birisi REST API'yi doğrudan çağırırsa hâlâ sahtecilik mümkün.
- **`anon` rolü `profiles` üzerinde geniş GRANT'lere sahip** (SELECT/INSERT/DELETE/TRUNCATE) — RLS bugün SELECT/INSERT/DELETE'i fiilen engelliyor ama **TRUNCATE Postgres'te RLS'e tabi değil**; teorik ama gerçek bir artık risk.

---

## 1. Gerçek Durum Fotoğrafı — v1'den Bu Yana Ne Değişti

| Alan | v1 (05.07) durumu | v2 (12.07) doğrulanmış durumu |
|---|---|---|
| **Ödeme** | SIMULATION, gerçek para yok | 🟢🔴 **CANLI** — gerçek iyzico 3DS işlemleri prodüksiyonda kanıtlı (`payment_intents`'te gerçek PAID/FAILED kayıtları). Ama 2 aktif açık + escrow capture/void/refund'un gerçek iyzico API'sine köprüsü hâlâ kurulmamış (yalnız cüzdan defteri hareket ediyor) |
| **Büyüme/Sosyal** | Davet/arkadaş sistemi tamamen ölü kod | 🟢🟡 **Büyük ölçüde yeniden yazıldı ve çoğu çalışıyor** (gerçek arkadaş/takım/sohbet/taktik RPC'leri) — ama maç lobisinden davet (`MatchJoin.tsx`) hiç migrate edilmemiş, hâlâ kırık; paylaşılan davet linklerinin tüketim tarafı (route/redirect) yok |
| **Saha Sahibi Paneli** | 6 problem (P1-P6) hepsi açık | 🟡 **Takvim/tarih hataları gerçekten düzeldi**; ama billing-lockout, payout yalanı, komisyon gizliliği, çok-kort görünümü, offline-first, personel girişi **hâlâ aynı** |
| **Kaleci/Hakem** | Vitrin/stub, BID sahte | 🟢🟡 **Faz 8A gerçek** (bidding, payout güvenliği, bildirim) — ama eski `service_offers` yolu hâlâ escrow'u atlıyor, sahte istatistikler duruyor, itibar/vitrin katmanı hiç yapılmamış |
| **Harita/Ölçek** | Limitsiz sorgu + realtime fan-out + monolitik store | 🔴 **Değişmedi.** Harita motoru (MapLibre) değişti ama bu yalnız kozmetik — ölçek riskleri birebir aynı, hazırlanan `get_nearby_pitches` RPC'si hâlâ bağlanmamış |
| **Güvenlik** | PII sızıntısı + MFA kapalı + migration drift | 🟡🔴 **MFA bayrağı açıldı** (gerçek client TOTP akışı var) ama sunucuda AAL2 hiç zorlanmıyor; **PII sızıntısı aynen duruyor**; migration drift **büyüdü** (kapanmadı) |

**Genel yargı:** Ekip hızlı ve gerçek ilerleme kaydetmiş — bu kozmetik değil, çoğu alan gerçekten üretim-kalitesinde kod. Ama tam da bu hız yüzünden **iki yeni kritik açık** doğmuş (biri IDOR, biri PCI-kapsam genişlemesi) ve **dokümantasyon kod'un gerisinde kalmaya devam ediyor** (`OYNA_OPERASYONEL_DURUM.md` hâlâ "Para SIMULATION modunda" diyor; `IYZICO_SANDBOX_SETUP.md` yanlış mimariyi — hosted checkout — tarif ediyor).

---

## 2. 11 Analizin Alan Bazlı Sentezi

### 2.1 💳 Ödeme Sistemi — Gerçek ama Delikli

**Gerçekten değişen:** Kart artık DB'de ham saklanmıyor (`user_saved_cards` yalnız `provider_card_token` + `last4`); wallet top-up gerçek iyzico'ya bağlı (canlı DB'de PAID/FAILED kanıtlı); quorum/PAID senkronizasyonu sunucu tetikleyicisiyle (`match_threshold_trigger`) atomik hale geldi — v1'in "haksız iptal" riski kapandı; istemci artık doğrudan slot yazmıyor (`joinMatchSlot` ölü kod, gerçek akış RPC üzerinden).

**Hâlâ/yeni kırık:**
- Mimari **hosted checkout'tan in-app 3DS'e** kaymış — bu PCI-DSS kapsamını **SAQ-A'dan SAQ A-EP'ye** yükseltiyor (frontend dahil ağır uyumluluk yükü); bu süreç başlamış görünmüyor.
- Escrow capture/void/refund'un gerçek iyzico API köprüsü kurulmamış — migration'ların kendi yorumu "[IYZICO-TODO]/FIXME" diye itiraf ediyor. İptal edilen bir maçta/rezervasyonda kart parası **hâlâ gerçekten iyzico'ya geri gitmiyor**, yalnız OYNA cüzdan kredisi yazılıyor.
- Komisyon çift-kaynağı (bkz. §0).
- `match_capture_deposit` IDOR'u (bkz. §0).
- Dört farklı payment-intent yaşam döngüsü aynı tabloyu paylaşıyor ama gerçekte birleşik değil — "unified" adı yanıltıcı.

**Go-live'a kalan gerçek mesafe:** Küçük düzeltmeler (komisyon bağlama, IDOR, doküman güncelleme) saatler-1 gün; RPC→edge köprüsü (escrow capture/void/refund gerçek API'ye bağlama) 1-2 hafta asıl blokaj; PCI SAQ A-EP süreci ayrı ve daha uzun bir hat, paralel başlatılmalı.

### 2.2 🌱 Sosyal/Büyüme — Gerçek Sıçrama, Son Halka Eksik

**Gerçekten çalışan:** Arkadaş ekleme/istek/kabul, takım kurma/katılma, uygulama-içi takım daveti, gerçek zamanlı takım sohbeti, taktik onay/paylaşım — hepsi gerçek SECURITY DEFINER RPC'lere, RLS'e, bildirim/push omurgasına bağlı. Bir güvenlik açığı da bu arada kapatılmış (`invite_token` genel okumadan sızıyordu, ayrı deny-all tabloya taşındı).

**Hâlâ kırık — tam da viral döngünün iki ucu:**
1. **Maç lobisinden arkadaş davet etme** (`MatchJoin.tsx`) hiç migrate edilmemiş — hâlâ ölü `store.friends` slice'ını okuyor, hâlâ "Arkadaş Bulunamadı" gösteriyor. Orijinal v1 bulgusunun aynısı, tek bir ekranda hayatta kalmış.
2. **Paylaşılan davet linklerinin tüketimi yok** — `oyna.app/takim/{token}` ve `oyna.app/davet/{code}` üretiliyor, kopyalanıyor, paylaşılıyor ama bu repoda hiçbir route/redirect/landing bunları takıma/referansa çevirmiyor. Link üretimi var, **link tüketimi yok** — asıl viral büyümeyi sağlayacak dış-halka eksik.

**Değerlendirme:** "OYNA içi sosyal" gerçekten düzeldi; "OYNA dışına açılan davet" (K-faktörü üreten kısım) hâlâ eksik.

### 2.3 🏟️ Saha Sahibi Paneli — Operasyonel Doğruluk Arttı, Güven Katmanı Aynı

**Gerçekten düzelen:** UTC tarih kayması (gece yarısı civarı yanlış gün gösterme), çok-saatlik rezervasyonun yalnız başlangıç hücresinde görünmesi (çifte-satış riski), uydurma doluluk formülü, realtime kanal çakışması — dördü de gerçek operasyonel hatalardı, gerçekten kapandı.

**Hiç değişmeyen — v1'in üç "güven kırıcı" bulgusu birebir duruyor:**
1. Askıya alınmış bir hesap hâlâ **nakit kapı rezervasyonunu bile** engelliyor (yalnız uyarı metni kaldırıldı, kilit mekanizması aynı).
2. Onboarding hâlâ "her Pazartesi otomatik ödeme" vaat ediyor, gerçek hâlâ 14 gün + manuel admin onayı.
3. Owner'a komisyon oranı hâlâ `0` olarak gösteriliyor (yalan).
4. Çok-kort tesis görünümü, offline-first, personel girişi, kantin/POS — hiçbiri başlamamış.

### 2.4 🧤 Kaleci/Hakem Pazaryeri — Çekirdek Gerçek, Kenarlar Riskli

**Gerçekten düzelen (Faz 8A):** Teklif verme artık gerçek DB yazımı; payout güvenlik açığı (wallet_balance sıfırlama bypass'ı) kapandı; boş durum ekranı gerçek; dinamik TTL + süpürücü çalışıyor.

**Yeni risk:** Eski `service_offers` yolu hâlâ canlı ve kullanıcı arayüzünde gösteriliyor — bir sağlayıcı bunu kabul ettiğinde escrow/komisyon motorunu **tamamen atlayıp** doğrudan tabloyu güncelliyor. Ayrıca iki hardcoded sahte istatistik (VAR Uyumu 95, LVL 8/A-CLASS) hâlâ ekranda. Ekip, planın onay sürecinden geçirmeden iki yeni özellik daha eklemiş (`captain_service_offers`, `provider_match_applications|) — biri kendi migration dosyasında "test edilemedi" diye itiraf ediyor.

### 2.5 🗺️ Harita/Mimari/Ölçek — Kozmetik İlerleme, Yapısal Risk Aynı

**Gerçekten düzelen:** `MatchCreate.tsx`'teki ~1700 satırlık ölü sihirbaz kodu temizlendi (446 satıra indi); harita atfı yasal hale geldi; sahte koordinatlar kaldırıldı; WebGL fallback eklendi.

**Hiç dokunulmayan (v1'in tüm ölçek bulguları):** Boot'ta limitsiz `select('*')`; filtresiz global realtime fan-out (üstelik ikinci bir örneği bulundu — `ServiceDashboard`); `store.ts` hâlâ tam 1292 satır, hiç dilimlenmemiş; selector'suz `useAppStore()` kullanımı hâlâ ~%40 (36/90). **Hazırlanmış `get_nearby_pitches` RPC'si bağlanmadan bırakılmış** — sunucu-taraflı coğrafi filtreleme altyapısı var ama kullanılmıyor. Ayrıca artık iki harita kütüphanesi birden bundle'da (Leaflet+CARTO hâlâ 4 ekranda, MapLibre yalnız 1 ekranda).

### 2.6 🔐 Güvenlik — Bir Adım İleri, Drift Büyüyor

**Gerçekten düzelen:** MFA bayrağı `true`, gerçek TOTP enroll/challenge akışı var; 0-byte migration dosyaları temizlendi; `reverse_booking_earnings` fonksiyonundaki ciddi bir IDOR (herhangi bir kullanıcı rastgele booking_id ile başka birinin kazancını iptal edebiliyordu) kapatıldı; admin RPC'lerinde dar kapsamlı bir anon-revoke yapıldı.

**Değişmeyen/kötüleşen:** `profiles` PII sızıntısı aynen duruyor (§0); admin MFA sunucuda hiç zorlanmıyor (yalnız istemci kapısı — `is_platform_admin()` AAL seviyesine bakmıyor); migration drift **kapanmak yerine büyüdü** (repo-defter farkı önceki turdan daha geniş, 11 çift-version-öneki grubu hiç dokunulmamış); yasal `[ŞİRKET ÜNVANI]` hâlâ boş; `anon` rolünün `profiles` üzerindeki geniş GRANT'leri hâlâ duruyor.

---

## 3. Doküman ↔ Kod Drift — Genişletilmiş Tablo

| Doküman | İddia | Kod gerçeği | Statü |
|---|---|---|---|
| `OYNA_OPERASYONEL_DURUM.md` | "Para = SIMULATION modunda çalışıyor" | Canlı DB'de gerçek IYZICO PAID/FAILED işlem kayıtları var | 🔴 **Ciddi drift** — doküman ekibin kendi go-live'ını kaçırmış |
| `IYZICO_SANDBOX_SETUP.md` | "Hosted Checkout Form — PAN sunucunuza gelmez" | Kod artık in-app 3DS ile PAN'ı OYNA'nın kendi edge fonksiyonuna POST ediyor (PCI SAQ A-EP) | 🔴 **Yanlış mimari tarif ediliyor** — operasyon ekibi yanlış zihin modeliyle hareket edebilir |
| `KALECI_HAKEM_PAZARYERI_PLANI.md` | "Onay bekliyor" (07.07) | Faz 8A çoktan kodlanmış VE plana hiç girmemiş iki ek özellik (20260716) daha eklenmiş | 🟡 Doküman hem geride hem eksik |
| `SAHA_SAHIBI_PANEL_DENETIM/KATALOG/UYGULAMA_PLANI` (3 doküman) | 07.07 statik enstantane | Kısmen uygulanmış (B3/B8/F4-kozmetik) + plan-dışı ek düzeltmeler; en ağır kalemler (A1/A3/A8/B1/F3/E1) hâlâ doğru şekilde "yapılmadı" | 🟢 Nispeten güncel, dürüst |
| `HARITA_MASTER_PLANI.md` | "Dalga 3 kabul kriteri: Leaflet package.json'dan sökülür" | Leaflet hâlâ `package.json`'da, hâlâ 4 ekranda kullanımda | 🔴 Kabul kriteri karşılanmamış |
| `MIGRATION_DRIFT_POLITIKASI.md` | İleri-yönlü kurallar + "tek çakışma çözüldü" | 11 çift-version-öneki grubu hiç ele alınmamış, drift büyümüş | 🟡 Politika iyi, geriye dönük temizlik yapılmamış |
| `docs/README.md` | Bu depo "34+ doküman"ı düzenli listeler | 9 yeni doküman eklenmiş (bazıları birbiriyle örtüşen/eskiyen) — konsolidasyon ihtiyacı büyüyor | 🟡 Doküman sprawl'ı izlenmeli |

**Kalıcı örüntü:** Ekip kodu dokümandan daha hızlı yazıyor. Bu genel olarak sağlıklı bir sinyal (gerçek ilerleme) ama iki somut riski var: (a) yeni geliştiriciler/kurucu yanlış zihin modeliyle karar alabilir (özellikle ödeme mimarisi konusunda), (b) onay süreçlerinin dışına çıkan özellikler (kaleci/hakem'deki iki plan-dışı migration gibi) test/güvenlik gözden geçirmesini atlıyor olabilir.

---

## 4. Kesin Aşamalı Plan

> **[K]** Kurucu (kod-dışı) · **[G]** Geliştirici · **[T]** Tasarım. Faz 0 dış bağımlılık beklemiyor, bugün başlar.

### 🚨 Faz 0 — Acil Güvenlik Yaması (0-2 gün, HER ŞEYDEN ÖNCE)
`[G]` `match_capture_deposit` yetki kontrolü · `profiles` PII view/REVOKE · `credit_owner_booking_earning` → `calculate_commission` bağlama · `matches` RLS `WITH CHECK` · `anon`/`profiles` gereksiz GRANT'leri revoke.
→ *Çıktı: aktif sömürülebilir açık yok. Bundan önce hiçbir büyüme/pazarlama adımı atılmaz.*

### 🔴 Faz 1 — Para Motorunu Tamamla + Dokümanı Gerçekle Eşitle (1-2 hafta)
`[G]` Escrow capture/void/refund'un gerçek iyzico API köprüsü (pg_net/cron, idempotency'li) · sandbox uçtan-uca test (iddia değil kanıt) · `OYNA_OPERASYONEL_DURUM.md` + `IYZICO_SANDBOX_SETUP.md`'yi gerçek mimariye göre yeniden yaz · eski `service_offers` yolunu kapat (escrow'u atlayan tehlikeli akış) · sahte istatistikleri (VAR Uyumu, LVL/A-CLASS) kaldır.
`[K]` PCI-DSS SAQ A-EP değerlendirme sürecini paralel başlat (hukuk/uyumluluk).
→ *Çıktı: iddia edilen ödeme sistemi ile gerçek ödeme sistemi aynı; iptal/iade gerçekten karta gidiyor.*

### 🟠 Faz 2 — Büyüme Döngüsünü Kapat + Owner Güvenini Tamamla (2-3 hafta)
`[G]` `MatchJoin.tsx`'i yeni arkadaş sistemine migrate et (ölü `store.friends` slice'ı sil) · davet linki tüketim route'unu (`/takim/{token}`, `/davet/{code}`) ekle · owner billing-lockout'u `ops_locked`'a indir (nakit rezervasyon asla kilitlenmesin) · payout vaadini gerçekle eşitle (ya haftalık otomatik yap ya metni düzelt) · owner'a gerçek komisyon oranını göster.
→ *Çıktı: davet zinciri uçtan uca çalışıyor; saha sahibi güven kırıcı üç yalanla karşılaşmıyor.*

### 🟡 Faz 3 — Ölçek Borcunu Öde (2 hafta, büyümeden önce zorunlu)
`[G]` `get_nearby_pitches` RPC'sini `PitchDiscovery`'e bağla (coğrafi sorgu sunucuya taşınsın) · boot'taki limitsiz `select('*')`'ları sayfalı/filtreli yap · global `matches-list-sync` + `ServiceDashboard` realtime kanallarını bölge/durum filtreli hale getir · `store.ts`'i dilimle + en az en sık re-render eden 10 bileşene selector ekle · Leaflet'i tamamen sök (yalnız MapLibre kalsın).
→ *Çıktı: 300-500 eşzamanlı kullanıcı senaryosunda ilk kırılma noktaları kapandı.*

### ⚪ Faz 4 — Migration Hijyeni + Kalan Hukuk/Güven (paralel yürütülebilir)
`[G]` 11 çift-version-öneki grubunu çöz, `regenerate-migrations-from-ledger.mjs`'i gerçek kimlik bilgisiyle çalıştır · admin RPC'lere sunucu-taraflı AAL2 kontrolü ekle.
`[K]` `[ŞİRKET ÜNVANI]` doldur + avukat onayı + public URL yayını.
→ *Çıktı: felaket-kurtarma güvenilir; admin MFA gerçekten sunucuda zorunlu; mağaza incelemesi hukuki engeli kalkıyor.*

### 🟢 Faz 5 — Pazara Çıkış (Faz 0-3 bittikten sonra)
Bu noktada v1 planındaki pazar/rekabet stratejisi (bkz. §5) devreye girer: Ordu/Altınordu'da tek-şehir yoğunlaşma, split-payment ana mesaj, süper-düğüm transferi, concierge onboarding.

---

## 5. Pazar & Rekabet Stratejisi (v1'den taşındı — bu turda kod değişmedi, tez geçerli)

Bu bölümdeki analiz v1'de 16 web araması ile üretildi ve bu turda yeniden doğrulanmadı (pazar dinamikleri 7 günde değişmez) — tez aynen geçerli:

**Kazanma tezi:** OYNA, genişlikte değil derinlikte kazanır. Rekabet penceresi açık ama dar: **Plei Türkiye'de yok**; yerel pazar parçalı (SaaS ↔ ilan panosu ↔ lig); kimse tek şehirde **tam likidite + split-payment + ücretli kaleci/hakem arzını** birleştirmedi. Ordu/Altınordu (234k, Türkiye'nin en hızlı büyüyen ilçesi, ~5 saha) bir kafa köprüsü — arzın %100'ü ucuza sahiplenilip likiditeye ulaşılabilir; sonra şablon Anadolu şehirlerine kopyalanır.

**Ana pazarlama mesajı:** *"Parayı arkadaşlarından tek tıkla topla"* (split-payment) — "saha kirala" değil. Bu artık **gerçek bir özellik** (ödeme sistemi canlı), yalnız §0-§2'deki güvenlik/güven açıkları kapanana kadar bu mesajı yüksek sesle pazarlamak riskli.

**Disintermediation panzehiri:** Ödemeyi + split-pay'i + kaleci/hakem arzını app-içi kilitle; take-rate'i düşük tut; "boş saat doldurma" çerçevesi.

*(Rakip haritası, pazar büyüklüğü verileri, GTM oyun kitabı detayları için bu bölümün v1 içeriği — git geçmişinde `a77a072` öncesi — referans alınabilir; büyük bölümü hâlâ geçerli, yalnızca burada tekrar edilmedi çünkü bu turun kapsamı kod doğrulamasıydı.)*

---

## 6. Olmazsa-Olmaz P0 Kontrol Listesi (güncellenmiş)

**Acil güvenlik (bugün-yarın)**
- [ ] `match_capture_deposit` yetki kontrolü eklendi
- [ ] `profiles` PII daraltıldı (view + REVOKE)
- [ ] Komisyon tek kaynağa bağlandı (`credit_owner_booking_earning` → `calculate_commission`)

**Para doğruluğu (Faz 1)**
- [ ] Escrow capture/void/refund gerçek iyzico API'sine bağlı, sandbox'ta kanıtlı
- [ ] Eski `service_offers` escrow-atlayan yolu kapatıldı
- [ ] `OYNA_OPERASYONEL_DURUM.md` + `IYZICO_SANDBOX_SETUP.md` gerçek mimariyle eşitlendi
- [ ] PCI SAQ A-EP değerlendirme süreci başladı

**Büyüme (Faz 2)**
- [ ] `MatchJoin.tsx` yeni arkadaş sistemine bağlı, "Arkadaş Bulunamadı" hatası düzeldi
- [ ] Davet linki tüketim route'u çalışıyor
- [ ] Owner billing-lockout nakit rezervasyonu asla engellemiyor
- [ ] Payout vaadi = gerçek davranış

**Ölçek (Faz 3, büyümeden önce)**
- [ ] `get_nearby_pitches` bağlandı, boot sorguları sayfalı/filtreli
- [ ] Realtime kanalları bölge/durum filtreli
- [ ] `store.ts` dilimlendi

**Hukuk/hijyen (Faz 4)**
- [ ] Migration drift kapandı (11 çift-version grubu çözüldü)
- [ ] Admin MFA sunucuda (AAL2) zorunlu
- [ ] `[ŞİRKET ÜNVANI]` dolu + avukat onaylı

---

## 7. Kuzey Yıldızı & Metrikler (v1'den değişmedi)

**Kuzey yıldızı:** Başarılı oynatılan maç (ödendi → toplandı → oynandı → OYNA + saha parasını aldı).

| Katman | Metrik | v2 notu |
|---|---|---|
| Güvenlik | Aktif kritik açık sayısı | **Hedef: 0, bugün 2** |
| Para | Reconciliation delta = 0 | Komisyon çift-kaynağı kapanmadan ölçülemez |
| Büyüme | Davet-başına-yeni-kullanıcı (k-faktör) | Link tüketimi kapanmadan k-faktör hesaplanamaz |
| Owner | Kağıda-yazılmayan-hafta oranı | 3 güven-kırıcı sorun kapanmadan hareket etmez |
| Ölçek | p95 boot süresi, realtime mesaj/sn | Faz 3 öncesi ölçülmeye değmez (darboğaz bilinen) |

---

## 8. Riskler (güncellenmiş — yeni acil kategori eklendi)

| Risk | Olasılık | Panzehir |
|---|---|---|
| **Aktif açık sömürülür (para çalma/PII sızıntısı)** | 🔴 Şu an mevcut | Faz 0 — bugün kapat |
| **PCI uyumsuzluğu keşfedilir** (SAQ A-EP kapsamına habersiz girildi) | Orta-yüksek | Faz 1'de süreç başlat, gerekirse hosted checkout'a geri dön |
| **Doküman-kod driftı karar hatası yaratır** (kurucu/yeni geliştirici yanlış mimariye göre karar alır) | Orta | §3'teki drift tablosunu kapat, dokümanları Faz 1'de güncelle |
| **Onay sürecini atlayan özellikler** (kaleci/hakem'deki iki plan-dışı migration gibi) birikir | Orta | Yeni büyük migration'lar için hafif bir "değişti mi, dokümana işlendi mi" kontrolü |
| **Ölçek duvarı erken kohortta** | Orta (Faz 3 yapılmazsa yüksek) | Faz 3'ü büyüme kampanyasından önce bitir |
| Disintermediation, rakip kopyalama, pazar tavanı | (v1'den değişmedi) | v1 §9'daki panzehirler geçerli |

---

## 9. Kurucuya Kalan Kararlar (güncellenmiş)

| # | Karar | Sentez önerisi |
|---|---|---|
| 1 | Faz 0 (2 acil açık) beklemeden herhangi bir pazarlama/lansman adımı atılsın mı? | **Hayır** — bugün kapat, sonra devam et. |
| 2 | PCI SAQ A-EP süreci mi, hosted checkout'a geri dönüş mü? | Hukuk/uyumluluk maliyetini değerlendir; hosted checkout'a dönüş daha hızlı olabilir — mimari kararı gerektirir. |
| 3 | Kaleci/hakem'deki onay-sürecini-atlayan iki yeni özellik (`captain_service_offers`, `provider_match_applications`) canlıda kalsın mı? | Gözden geçirilip ya resmen onaylanmalı (plana işlenmeli) ya da flag arkasına alınmalı — özellikle biri "test edilemedi" diye kendi kendini işaretlemiş. |
| 4 | (v1'den) Ana pazarlama mesajı split-payment mi? | Evet — ama Faz 0-2 kapanmadan yüksek sesle pazarlanmasın. |
| 5 | (v1'den) İlk genişleme şehri? | Değişmedi — birim ekonomisi kanıtlanınca Samsun/Trabzon/Giresun. |

---

> **Özet:** v1 "simülasyondan gerçeğe geçiş" planıydı. v2'nin bulduğu gerçek: **geçiş zaten yapıldı, ama güvenli şekilde değil.** Ekip 7 günde inanılmaz hacimde gerçek işlevsellik teslim etmiş — bu iyi haber. Kötü haber: bu hızda iki tane "bugün kapatılmalı" seviyesinde açık ve dokümanların koddan geride kaldığı çok sayıda nokta doğdu. **Piyasaya çıkışın kesin planı şu sırayla:** (0) bugün 2 açığı kapat, (1) para motorunu gerçekten bitir + dokümanı eşitle, (2) büyüme döngüsünün son halkasını tamamla + owner güvenini kur, (3) ölçek borcunu öde, (4) hukuk/hijyeni kapat, (5) ancak o zaman v1'in pazar-hakimiyeti stratejisiyle çık. Kuzey yıldızı hep aynı: **başarılı oynatılan maç.**
