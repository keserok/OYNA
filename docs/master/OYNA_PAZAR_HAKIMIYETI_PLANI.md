# 🎯 OYNA — Pazar Hakimiyeti Master Planı

> **Ne bu belge?** Uygulamanın **5 bağımsız uzman ajanla** (mimari & kod · backend & ödeme · güvenlik & KVKK · ürün & büyüme · pazar & rekabet) baştan sona **canlı kod + canlı DB** üzerinden yeniden analiz edilmesi; bulguların çelişki/tekrar için karşılaştırılıp **tek bir pazar-hakimiyeti planına** sentezlenmesi.
> **Tarih:** 2026-07-05 · **Yöntem:** 5 paralel ajan + mevcut `docs/master/` dokümanlarıyla çapraz doğrulama + kritik iddiaların elle kanıtlanması.
> **İlişki:** Bu belge mevcut `LANSMAN_ENGELLERI_VE_ASMA_PLANI.md` (adoption katmanı) ve `KATMAN2_SAHA_SAHIBI_COZUM_PLANI.md` (owner katmanı) üzerine biner; onları **rekabet/pazar boyutuyla** ve **doküman-iddiası ↔ kod-gerçeği mutabakatıyla** tamamlar. Çelişkide en yeni tarihli bağlayıcı doküman kazanır (bkz. `OYNA_MASTER.md §15`).
> **Soru:** OYNA piyasaya çıkıp **tüm piyasayı domine etmesinin** önündeki teknik, sosyal, ticari ve hukuki engelleri nasıl aşar?

---

## 0. Yönetici Özeti — 8 Sert Gerçek

Beş ajanın uzlaştığı çekirdek tablo. **İyi haber:** ürün olgun, mimari kavramsal olarak 100k+'a tasarlanmış, güvenlik iskeleti sağlam, rekabet penceresi açık. **Kötü haber:** "kod tarafı tamam" anlatısı **üç ayrı gerçeklikle çelişiyor** — canlı para hataları, ölü büyüme motoru ve simüle değer vaadi.

| # | Sert gerçek | Kaynak | Etki |
|---|---|---|---|
| 1 | **Değer vaadi hâlâ simüle.** Uygulamayı telefona üstün kılan tek şey (öde-kilitle-gerçek bilet) sahte: kart cihazdan çıkmıyor, QR statik ikon + sabit `OYNA-8293-TX`, "kart ekle" rastgele 4 hane üretiyor. | UX + Backend + Lansman dok. | 🔴 Ürünün var oluş sebebi henüz gerçek değil |
| 2 | **"Komisyon SSOT düzeltildi" iddiası yarı-doğru — para hâlâ yanlış akıyor.** Motor (`create_payment_intent`) `commission_config` okuyor ama owner'a **gerçekten para yatıran** trigger hâlâ `platform_commission_rate` (%10) okuyor → platform işlem başına ~%5 kaybediyor, defterler hiç tutmuyor. **Elle kanıtlandı** (`20260706000001_faz44_unify_owner_earnings.sql:99-109`; Faz 7 yalnız EXECUTE'u REVOKE etti, gövdeyi düzeltmedi). | Backend ajanı + elle doğrulama | 🔴 Canlı gelir kaybı + mutabakat imkânsız |
| 3 | **Maç quorum'u üç kaynaktan sayıyor, ödeme yolu PAID yazmıyor.** Canlıda kablolanmış `player_buy_slots` cüzdandan tahsil ediyor ama slota `paymentStatus='PAID'` yazmıyor → ödenen slotlar quorum'da sayılmıyor → maçlar **haksız yere `QUORUM_NOT_MET` ile iptal** olabiliyor. | Backend ajanı | 🔴 Maçlar sistematik çöker (kuzey-yıldız metriğini öldürür) |
| 4 | **İstemci-otoriter slot yazımı sahteciliğe açık.** `handleJoin`, sunucu-kilitli RPC'den sonra tüm `slots` dizisini istemciden geri yazıyor; `matches` UPDATE RLS'inde `WITH CHECK` yok → kaptan **ödeme yapmadan** slota `paymentStatus='PAID'` yazıp maçı CONFIRMED yapabilir. | Backend ajanı | 🔴 Bedava maç / eşzamanlılık kaybı |
| 5 | **Büyüme motoru ölü kod.** Davet et / bağlantı paylaş / arkadaş ekle / saha paylaş butonlarında **onClick yok**; `sendFriendRequest` hiçbir yerden çağrılmıyor; `store.friends` DB'den hiç hydrate edilmiyor. Çift-taraflı pazar **kendi kendini büyütemiyor**. | UX ajanı | 🔴 Viral döngü fiilen yok |
| 6 | **PII kitlesel sızıntısı canlı.** Giriş yapan herhangi bir kullanıcı tüm kullanıcıların e-posta/telefon/konum/push token/cüzdan bakiyesini toplu çekebiliyor (`profiles_select` `USING(true)`, **canlı DB'de doğrulandı**). | Güvenlik ajanı | 🔴 KVKK ihlali + mağaza reddi riski |
| 7 | **Ölçek duvarı 300-500 eşzamanlıda.** Boot'ta limitsiz `select('*')` + filtresiz global `matches-list-sync` realtime fan-out + seçicisiz store aboneliği (26 bileşen) + JSONB slot rewrite. | Mimari + Backend ajanı | 🟡 Domine etmeden önce kırılır |
| 8 | **Rekabet penceresi açık ama dar.** Plei **Türkiye'de yok**; yerel pazar parçalı (SaaS ↔ ilan panosu ↔ lig); kimse tek şehirde **tam likidite + split-payment + ücretli kaleci/hakem arzını** birleştirmedi. | Pazar ajanı | 🟢 Fırsat — ama kopyalanabilir, hız kritik |

> ### ⚠️ Tüm analizin kalbindeki tek cümle
> **OYNA'nın domine etmesinin önündeki gerçek engel "eksik özellik" değil; üç boşluğun kesişimidir: (a) değer vaadi hâlâ simüle, (b) para defterleri canlı hatalarla tutmuyor, (c) büyüme döngüleri ölü kod.** Bu üçü kapatılmadan mağazaya çıkmak, "domine" bir yana, ilk kohortu bile kaybeder. Kapatıldıktan sonra ise rekabet penceresi (Plei yok + parçalı pazar + hazır ödeme altyapısı) gerçek bir hakimiyet fırsatı sunuyor.

---

## 1. Metodoloji & Kapsam

**5 paralel bağımsız ajan** (her biri dokümana değil **gerçek koda** bakacak şekilde görevlendirildi):

| Ajan | Kapsam | Ana yöntem |
|---|---|---|
| 🏗️ Mimari & Kod | `App.tsx`, `store.ts`, `types.ts`, view/service katmanı, test | Kod okuma + statik sayım |
| ⚙️ Backend & Ödeme | 148 migration, 9 edge fn, RLS, ödeme/quorum/payout | Kod + **canlı Supabase advisors (salt-okunur)** |
| 🔐 Güvenlik & KVKK | RLS/PII, CORS, webhook, admin auth, yasal metin | Kod + **canlı `pg_policies`/`pg_proc` (salt-okunur)** |
| 🎯 Ürün & UX | Onboarding, aktivasyon hunisi, viral döngü, retention | Ekran-ekran kod okuma |
| 📊 Pazar & Rekabet | Türkiye halı saha pazarı, rakipler, cold-start, GTM | 16 web araması + kaynaklama |

**Doğrulama:** En yüksek bahisli 3 iddia (komisyon çift-kaynak, migration hijyeni, PII sızıntısı) sentezden önce **elle koddan/canlı DB'den kanıtlandı** — hepsi doğrulandı.

**Kapsam sınırı:** Bu belge bir *analiz + plan*tır, kod değişikliği içermez. Uygulama, mevcut Wave/Sprint dokümanlarındaki idempotent + feature-flag'li dağıtım disiplinine uyar.

---

## 2. Doküman İddiası ↔ Kod Gerçeği (Drift Mutabakatı)

Bu bölüm belgenin en yüksek değerli parçası: mevcut dokümanların "tamam/düzeltildi" dediği ama **kod gerçeğiyle çelişen** kalemler. Domine etmeyi planlarken bu drift kapatılmadan ilerlemek tehlikeli.

| Konu | Doküman diyor ki | Kod gerçeği | Statü |
|---|---|---|---|
| Komisyon SSOT | "✅ CANLI — motor tek kaynak, %10 hardcode bug'ı bitti" (`OPERASYONEL_DURUM §2`) | Motor `commission_config` okuyor **ama owner-kredi trigger'ı hâlâ `platform_commission_rate`** (`20260706000001:99-109`) | 🔴 **Yarı-drift** — para hâlâ yanlış akıyor (`KATMAN2 P3` bunu Sprint-0 işi olarak zaten kabul ediyor; MASTER özeti geride kalmış) |
| iyzico'ya "yalnız 3 HTTP bağlama kaldı" | "Mantık hazır, 3 bağlama" (`OPERASYONEL_DURUM §3`) | Doğru **yalnızca booking kaporası için**. Maç akışı tümüyle iç cüzdanda; `create_match_preauth` + capture/void/refund **ölü kod** (hiç çağrılmıyor) | 🟡 **Kısmi drift** — maç gerçek-para yolu 3 bağlama değil, sıfırdan (L efor) |
| Admin zorunlu MFA | "✅ admin zorunlu MFA (TOTP, AAL2)" (`OYNA_MASTER §0/§6/§9`) | Canlı `app_config.admin_mfa_required = **false**`; `is_platform_admin()` AAL2 kontrol etmiyor | 🔴 **Drift** — MFA fiilen kapalı, sunucuda zorlanmıyor |
| Migration sağlığı | "126+ migration" | **148** migration; **11 çift 14-haneli version öneki**; 2 boş dosya; canlı geçmiş repoyla farklı isimler → repodan temiz kurulum production'ı yeniden üretmez | 🔴 **Drift** — sayı yanlış + yeniden-kurulamaz |
| PII / `public_profiles` | "mobil sürümle koordineli geçiş" (planlı iş) | `profiles` SELECT `USING(true)` **canlıda açık**; e-posta/telefon/konum/push token/bakiye tüm authenticated'a görünür | 🔴 **Açık kritik** — plan var, kod yok |
| RLS 67/67 "tamam" | Güvenlik tamamlandı imasıyla | Doğru ama **eksik**: profiles PII, 39 multiple-permissive policy, 24 unindexed FK, admin MFA kapalı hâlâ açık kalemler | 🟡 RLS *var* ama yeterlilik ≠ tamlık |

**Sonuç:** Dokümanlar dürüst ve detaylı, ama iki farklı sebeple geride kalmış: (1) bazı "düzeltildi" iddiaları yalnız *motoru* kapsıyor, parayı fiilen taşıyan *defteri* değil; (2) özet dokümanlar (MASTER/OPERASYONEL) canlı-config sapmasını (MFA) yansıtmıyor. **Aksiyon:** Sprint 0'da bu drift kapatılmadan hiçbir "domine" iddiası gerçekçi değil.

---

## 3. Beş Boyutlu Bulgu Sentezi

### 3.1 💰 Para & Backend — "Defter tutmadan ölçek olmaz"

**Sağlam olan:** Sunucu-otoriter tutar hesabı (`create_payment_intent` client'a güvenmiyor); para RPC'leri yalnız `service_role`; webhook token'ı iyzico'ya yeniden sorup doğruluyor; `apply_booking_payment` `FOR UPDATE` + idempotent (replay/çift-tahsilat korumalı); cüzdan doğrudan manipülasyona GUC-kapılı; kademeli iade + PSP kesintisi + owner ters-çevirme olgun; kill-switch + audit hash-chain var; canlı advisor **0 ERROR**.

**Kırık olan (öncelik sıralı):**
- 🔴 **Komisyon çift-kaynak** (§0.2, §2) — owner-kredi trigger'ı eski oranı okuyor.
- 🔴 **Quorum üç-kaynak uyumsuzluğu** (§0.3) — `player_buy_slots` PAID yazmıyor → haksız iptal.
- 🔴 **İstemci-otoriter slot yazımı** (§0.4) — `WITH CHECK` yok → kaptan bedava CONFIRMED yapabilir.
- 🟡 **Maç gerçek-para yolu yok** — iyzico pre-auth motoru ölü kod; maç ekonomisi bugün "oyun-parası" (cüzdana gerçek top-up kapısı da yok).
- 🟡 **Payout %100 elle** — gerçek iyzico submerchant/IBAN transfer API'si yok (doğrulandı).
- 🟡 **Reconciliation zayıf** — maç cüzdan parası recon'a hiç girmiyor; #2'deki owner_share tutarsızlığını miras alıyor; harici iyzico settlement mutabakatı yok.
- 🟡 **Webhook tutar doğrulaması yok** + ayrı dedup tablosu yok (yalnız intent status guard'ı).
- 🟡 **Ölçek:** 39 multiple-permissive policy, 24 unindexed FK, realtime tam-satır fan-out + JSONB slot rewrite.

**Stratejik öneri (tek hamle çok sorun çözer):** Üç para modelini (booking intent / cüzdan MATCH_FEE / iyzico pre-auth) **tek `payment_intents` state-machine + append-only `wallet_transactions` ledger**'ında birleştir; `matches.slots` JSONB'yi para gerçeğinden ayır (slot = yalnız kadro görünümü, para = ledger). Bu #2, #3, #4, #reconciliation'ı birden çözer, denetlenebilirlik + yatırımcı güveni kazandırır.

### 3.2 🏗️ Mimari & Ölçek — "Tek kullanıcı iyi, kalabalık kötü"

**Sağlam:** Disiplinli lazy-loading (57KB ana paket), vendor chunk ayrımı, tutarlı optimistic-update+rollback deseni, kritik para akışı sunucuda, observability cephesi + ErrorBoundary, anlamlı CI (tsc+test+build).

**Kırık (öncelik sıralı):**
- 🔴 **Sınırsız veri + global realtime fan-out** → 300-500 eşzamanlıda ilk kırılma. `fbGetMatches` = filtresiz/limitsiz `select('*')`; `matches-list-sync` `event:'*'` filtresiz broadcast; coğrafi/sayfalı sorgu yok.
- 🔴 **Seçicisiz store aboneliği** — 26 bileşen `useAppStore()` selector'suz; `React.memo` kullanımı tüm uygulamada **1** → re-render fırtınası (düşük-orta Android'de hissedilir; hedef kitle).
- 🔴 **TS strict kapalı + 291 `any`** → yanlış güvenlik hissi, null/şema hataları runtime'a kaçıyor.
- 🟡 **Monolitik "god" dosyalar** — `Studio.tsx` 2942, `OwnerPanel.tsx` 2338/66 useState, `MatchJoin.tsx` 2927; yeni geliştirici haftalar kaybeder.
- 🟡 **Tüketici store → admin-panel sıkı bağımlılığı** (katman ihlali).
- 🟡 **İki paralel maç veri modeli** + elle çift-yönlü snake/camel eşleme (drift kaçınılmaz).
- 🟡 **73 sessiz catch + 235 ham console** → prod'da körlük; kritik yollar (ödeme/maç-tamamla) sessiz.
- 🟡 **Çift auth listener** (`App.tsx:148` + `295`).

**Test güvenliği:** Birim testler sığ (saf-util); **ödeme + maç yaşam döngüsü uçtan uca otomatik doğrulanmıyor**; e2e testler CI'a bağlı değil.

### 3.3 🔐 Güvenlik & KVKK/Hukuk — "Güven satacaksan önce güvenli ol"

**Sağlam:** Ödeme parası güvenli, ayrıcalık yükseltme kapalı (`profile_privileges_unchanged`), sistem edge'leri fail-closed + secret'lı, secret hijyeni temiz (git geçmişinde sızıntı yok), silme hakkı gerçek (Apple/Google uyumlu), kayıtta opt-in rıza, advisor 0 ERROR.

**Kırık (öncelik sıralı):**
- 🔴 **`profiles` PII kitlesel sızıntısı** (§0.6) — canlı doğrulandı; KVKK m.12 + mağaza reddi.
- 🔴 **Yasal metinlerde `[ŞİRKET ÜNVANI]` boş** (`LegalScreen.tsx:15`, `gizlilik.html:20`) — KVKK m.10 + Apple 5.1.1 + Google Data Safety → **doğrudan mağaza reddi**.
- 🔴 **Admin MFA kapalı** (§2 drift) + AAL2 sunucuda zorlanmıyor → admin şifresi ele geçerse tam yetki.
- 🟡 **İade politikası kod ↔ metin çelişkisi** — metin "48s %90", kod "24/6 saat kademeli" → 6502/Hakem Heyeti riski.
- 🟡 **PaymentScreen ham PAN+CVV topluyor** — backend hosted-checkout kullanırken; PCI-DSS SAQ-D yükü + Sentry/PostHog replay riski. "Kart saklanmaz" ibaresi mimariyle çelişiyor.
- 🟡 **VERBİS + granüler rıza eksik** — aydınlatma ≠ açık rıza ayrımı yok; analitik için ayrı opt-in yok.
- 🟡 **Yaş kapısı yok** — kayıtta doğum tarihi alınmıyor (KVKK çocuk verisi + mağaza yaş derecesi).
- 🟢 `anon` profiles grant'ları, CORS `*`, leaked-password koruması kapalı.

### 3.4 🎯 Ürün & Büyüme — "Kendi kendini büyütemeyen pazar"

**Sağlam:** Canlı doluluk + realtime rezervasyon (telefonu gerçekten yenen tek yer), misafir "değer kapısı" doğru kurulmuş, blokaj/kapora modeli olgun, maç hatırlatıcıları gerçekten çalışıyor (1s/24s cron), veli onayı yasal olarak sağlam.

**Kırık (öncelik sıralı):**
- 🔴 **Viral döngü ölü kod** (§0.5) — davet/paylaş/arkadaş-ekle butonlarında handler yok; `sendFriendRequest` çağrılmıyor; `friends` DB'den hydrate edilmiyor → "arkadaşını boş pozisyona çağır" hep boş liste.
- 🔴 **İki aktivasyon duvarı** — oyuncu katılımı cüzdandan peşin ödeme; rezervasyonda kayıtlı kart yoksa akış kesilip cüzdana atılıyor (niyet anında terk).
- 🔴 **Şehir scope yok** — herkes aynı 4 Ordu sahasını görüyor; İstanbul kullanıcısı 540 km uzağı "en yakın" görüyor; harita boş-durumu yok; boş liste "filtreni sıfırla" diyor (sorun tedarik yokluğuyken).
- 🔴 **Gamification yanlış yerde** — en büyük kod yatırımı (2942 satır Studio + IQ akademisi + FIFA kartları) en düşük frekanslı/en içe-bakan aktivite; hiçbirinde rezervasyona götüren CTA yok.
- 🟡 **Sahte sosyal kanıt** — hardcoded Unsplash avatar, sahte "+8 oyuncu"; en güçlü mesaj (otomatik iade garantisi) **render edilmeyen** `MatchCountdown` içinde gömülü.
- 🟡 **QR bilet dekoratif** — turnikede okutulamaz.
- 🟡 **GK/Hakem pazaryeri erken + boş + kısmen stub** (BID `console.log`, "VAR uyumu 95" hardcoded) — çekirdek navigasyonda boş vitrin yer kaplıyor.
- **Retention:** Tek gerçek kanca booked-maç hatırlatıcısı (zaten maçı olanı geri getirir); dormant re-engagement yok; "2. hafta neden gelir?" sorusunun net cevabı yok.

### 3.5 📊 Pazar & Rekabet — "Genişlikte değil derinlikte kazan"

**Pazar (kaynaklı):** Organize amatör futbol talebi kanıtlı — RakipBul tek başına 16 şehir / ~200k oyuncu / 25k+ takım / 140 saha. Dijital ödeme altyapısı olgun (109M mobil bankacılık). Saha ekonomisi komisyona müsait (saatlik 500-1200₺, %10-15 = işlem başına ~50-135₺). Ordu/Altınordu = 234k, **Türkiye'nin en hızlı büyüyen ilçesi**, ~5 saha → arzın %100'ü ucuza sahiplenilebilir. *(Toplam saha sayısı / TL pazar hacmi güncel resmi kaynakla doğrulanamadı — tahmin.)*

**Rakip haritası (özet):**

| Rakip | Model | Zayıflık |
|---|---|---|
| **Plei** | Küresel pickup lideri (500k+, adidas/Messi) | **Türkiye'de yok** — pencere açık |
| **RakipBul** | Sponsorlu organize lig (~200k oyuncu) | Marketplace değil; on-demand booking/ödeme yok |
| **SahaCepte** | Rezervasyon + online ön ödeme | Split-payment/kaleci-hakem/derinlik yok |
| **Maçla/Adam Eksik/OyuncuBul** | Ücretsiz "eksik oyuncu" ilan panosu | Entegre ödeme/booking yok, zayıf gelir |
| **Sahamatik/SporPin/BiHalısaha** | Tesis SaaS/agregasyon | Talebi toplamıyor; ağ etkisi zayıf |
| **VAR Sistemi** | Maç kaydı/yayın (Ordu'da aktif) | Marketplace değil |
| **Instagram/WhatsApp/telefon** | Fiili pazar lideri | Ölçeklenmiyor, split-payment yok |

**Neden kimse domine edemedi:** Plei yok; yerel oyuncular parçalı (SaaS ↔ ilan panosu ↔ lig); **kimse tek şehirde tam likidite kurmadı** — hepsi "ulusal ama sığ". Boşluk tam burada.

**OYNA'nın gerçek farklılaştırıcıları (önem sırasıyla):** (1) **Split-payment** — 9 arkadaştan para toplama acısını çözen taraf kilitlenir + disintermediation panzehiri; (2) **ücretli/doğrulanmış kaleci-hakem pazaryeri** — rakipler yalnız *ücretsiz arama* yapıyor, bookable havuz = yeni gelir + switching-cost; (3) **tam yığın tek app**; (4) **oyunlaştırma/lig retention'ı** (RakipBul'un lig kancasını app-native yeniden üret).

---

## 4. Pazar Hakimiyeti Tezi

> **OYNA, "genişlikte" değil "derinlikte" kazanır: tek şehirde (Ordu/Altınordu) tam likidite kurup, ücretli kaleci/hakem arzını sahiplenip, split-payment'i standart yaparak rakiplerin ulaşamadığı yerel ağ etkisini inşa eder; sonra bu şablonu Anadolu şehirlerine kopyalar. Kuzey yıldızı tek metriktir: başarılı oynatılan maç (ödendi → toplandı → oynandı → OYNA + saha parasını aldı).**

Bu tezin üç dayanağı ve her birinin ön koşulu:

1. **Zamanlama penceresi** (Plei yok + pazar parçalı + ödeme altyapısı hazır) → **hız** ön koşul: pencere kopyalanabilir.
2. **Derinlik > genişlik** (Getir/Yemeksepeti şablonu: bir şehri kârlı yapmadan yayılma) → **yerel yoğunluk** ön koşul: arzın %100'ü + süper-düğümler.
3. **Ağ etkisi savunur, özellik savunmaz** (split-payment kilidi + kaleci/hakem arz tekeli + sosyal/lig) → **çalışan büyüme döngüsü** ön koşul: bugün ölü kod.

**Domine etmenin denklemi:** `Domine = (Gerçek değer vaadi) × (Doğru para defteri) × (Çalışan büyüme döngüsü) × (Yerel yoğunluk) × (Hız)`. Herhangi bir çarpan sıfırsa çarpım sıfır. Bugün ilk üçü ≈ 0.

---

## 5. Engel → Aşma Matrisi (Teknik · Sosyal · Ticari · Hukuki)

| Kategori | Engel | Aşma | Öncelik |
|---|---|---|---|
| **Teknik — Para** | Değer vaadi simüle (ödeme/QR sahte) | iyzico hosted checkout'u booking'e bağla (en hazır yol); QR'ı imzalı doğrulanabilir token yap; sahte "kart ekle"yi kaldır/tokenize | 🔴 P0 |
| **Teknik — Para** | Komisyon çift-kaynak + quorum PAID + istemci slot sahteciliği | `credit_owner_booking_earning`'i `calculate_commission`'a bağla; `player_buy_slots` PAID yazsın; slot yazımını sunucuya taşı + `WITH CHECK` ekle | 🔴 P0 |
| **Teknik — Para** | Payout elle + reconciliation zayıf + maç gerçek-para yok | Önce booking'te iyzico'yu oturt; sonra maç pre-auth + otomatik payout + settlement mutabakatı (ikinci dalga) | 🟠 P1 |
| **Teknik — Ölçek** | 300-500 eşzamanlı duvarı | Coğrafi+sayfalı RPC'ye geç; realtime'ı bölge/slot-delta'ya indir; store'u dilimle + selector zorunlu; liste sanallaştırma | 🟠 P1 |
| **Teknik — Kalite** | God dosyalar + strict-off + sessiz catch + test boşluğu | TS strict kademeli; god component parçala; ödeme+maç e2e'yi CI'a bağla; sessiz catch → captureException | 🟡 P2 |
| **Teknik — Altyapı** | Migration yeniden-kurulamaz (148, çift version) | Çift version öneklerini tekilleştir, boş dosyaları sil, CI'da temiz `db reset` + advisor snapshot testi | 🟡 P2 |
| **Sosyal — Talep** | Rakip "telefonla aramak"; değer 30 sn'de net değil | Değer önermesini ana ekrana taşı ("kadro kurmadan katıl · dolmazsa iade"); split-payment'i ana mesaj yap; sahte sosyal kanıtı gerçekle değiştir | 🔴 P0 |
| **Sosyal — Büyüme** | Viral döngü ölü kod | Çalışan davet linki + deep-link (`oyna://match/{id}` var); arkadaş-ekle akışını canlandır (`sendFriendRequest` hazır); saha paylaş `oyna://pitch/{id}`; referans kredisi (`REFERRAL_BONUS` tipi tanımlı) | 🔴 P0 |
| **Sosyal — Owner** | Defteri bırakma güveni yok (offline yok, kilit, payout vaadi yalan) | `KATMAN2` planı: offline-first ön büro + ön-büro asla kilitlenmez + haftalık otomatik payout + şeffaf komisyon + concierge onboarding | 🔴 P0 (owner) |
| **Sosyal — Cold-start** | Boş şehir "bozuk" görünüyor | Şehir scope + "yakında geliyoruz / saha öner / haberdar et" boş-durumu; harita boş-durumu; tek şehir yoğunlaştır | 🔴 P0 |
| **Ticari — Likidite** | İki-taraflı chicken-egg | Önce arz (Ordu ~5 sahanın %100'ü, atıl saat envanteri); owner-led talep; süper-düğüm (WhatsApp grup abisi) transferi; gün-1 kaleci/hakem tohumu | 🔴 P0 |
| **Ticari — Kaçış** | Disintermediation (komisyona direnç gerçek) | Komisyonu "boş saat doldurma/yield" diye çerçevele (dolu saati vergileme); ödemeyi + split-pay'i + kaleci/hakem arzını app-içi kilitle; take-rate'i atlaması zahmete değmeyecek kadar düşük tut | 🟠 P1 |
| **Ticari — Fiyat** | Markup oyuncuya biniyor → app pahalı | "App'te asla daha pahalı değil" kuralı: markup'ı owner net'inden karşıla ya da app'e özel avantaj (anında onay/split-pay/atıl-saat indirimi) | 🟠 P1 |
| **Hukuki — KVKK** | PII sızıntısı + `[ŞİRKET ÜNVANI]` + VERBİS + yaş | `public_profiles` maskeli view + PII REVOKE; ünvan/MERSİS/VERBİS doldur + avukat onayı + public URL; granüler rıza; kayıt yaş kapısı | 🔴 P0 |
| **Hukuki — Tüketici** | İade metni ↔ kod çelişkisi | Kademeli iade yüzdesini rezervasyon ekranında canlı göster; metni koda birebir eşitle | 🟠 P1 |
| **Hukuki — Ödeme** | Ham PAN/CVV toplama (PCI) | Kendi kart formunu kaldır, iyzico hosted form; input maskeleme | 🟠 P1 |
| **Kurucu — Tedarik** | iyzico/hesap/avukat/marka/saha (kritik yol) | Gün-0 paralel başlat (kod hızlandıramaz); kurumsal mağaza hesabı (12-tester tuzağından kaç) | 🔴 P0 |

---

## 6. Fazlı Uygulama Planı

> **[K]** Kurucu (kod-dışı) · **[G]** Geliştirici · **[T]** Tasarım. Her faz feature-flag'li; geri dönüş = bayrağı kapat.

### 🟢 Faz 0 — Kurucu Tedariki + Sessiz Doğruluk (GÜN 0, paralel; kritik yol)
- `[K]` iyzico sözleşme/KYC · şirket ünvanı/MERSİS · **kurumsal** Apple + Google hesapları · APNs/FCM · avukat (4 metin + VERBİS) · marka kiti · **Ordu ~5 saha anlaşması + gerçek fiyat/takvim + atıl saat envanteri.**
- `[G]` **Sessiz para & güvenlik yamaları** (dış bağımlılıksız, hemen): komisyon çift-kaynağı kapat · `player_buy_slots` PAID yaz · slot yazımını sunucuya taşı + `WITH CHECK` · owner self-upgrade RLS deliği · `profiles` PII `public_profiles` view + REVOKE · admin MFA aç + AAL2 zorla · migration çift-version temizle.
- → *Çıktı: para defterleri tutan, PII sızdırmayan, MFA'lı, yeniden-kurulabilir bir taban.*

### 🔴 Faz 1 — "Gerçeğe Geçiş" Sprint'i (mağaza + değer vaadi — P0)
- `[G]` **Ödemeyi gerçek yap** (iyzico hosted checkout → booking + kademeli iade; kendi kart formunu kaldır) · **QR imzalı token** · **şehir scope + cold-start boş-durumları** · sahte doluluk/avatar/"+8" kaldır · `MatchCountdown` değer mesajını öne çıkar · iade metni-kod eşitle · yasal ünvan doldur + public URL · iOS push `production` · reviewer demo hesabı.
- `[T]` Tek birincil CTA (TOP OYNA) + gerçek first-run boş-durumu.
- → *Çıktı: mağaza incelemesini geçen, gerçek para/bilet üreten, değeri 30 sn'de anlaşılan uygulama.*

### 🟠 Faz 2 — Çalışan Büyüme Döngüsü + Owner Güveni (Kapalı Beta, Ordu)
- `[G]` **Viral döngüyü canlandır:** davet linki + deep-link · arkadaş-ekle akışı + `friends` hydrate · saha paylaş `oyna://pitch/{id}` · referans kredisi · split-payment paylaşılabilir linki.
- `[G]` **Owner güveni** (`KATMAN2` S0-S1): offline-first ön büro · ön-büro asla kilitlenmez · haftalık otomatik payout + şeffaf komisyon/mutabakat · uygulama-içi gerçek yorum.
- `[K]` **Concierge onboarding** (owner abonmanlarını defterinden panele gir) + kanarya gerçek ödemeler.
- `[G]` Ölçek quick-win'leri: coğrafi+sayfalı sorgu · realtime bölge-filtreli · unindexed FK index · store dilimle.
- → *Çıktı: kendi kendini büyüten, para akan, owner'ın defterini bıraktığı kanıtlanmış çekirdek.*

### 🟡 Faz 3 — Soft Launch (Ordu geneli) + Yoğunluk Motoru
- `[G]` Public saha sayfası `oyna.app/saha/{slug}` + smart banner · owner QR/afiş büyüme kiti · telefon-OTP · maç gerçek-para (pre-auth) + otomatik payout ikinci dalga.
- `[K]` Süper-düğüm transferi (WhatsApp grup abileri) · Ordu Üniversitesi + esnaf/kurumsal ligler · app-native mini-lig · gün-1 kaleci/hakem havuzu.
- → *Çıktı: ilk gerçek "başarılı maçlar"; mahalle-mahalle doygunluk.*

### ⚪ Faz 4 — Fast-follow + Genişleme
- `[G]` Kantin-lite POS + kalem-veresiye + fiş · personel scoped login · TS strict + god component parçala + e2e CI gate · ledger tabanlı muhasebe · targetSdk 36 (31.08.2026) · universal links · İngilizce i18n.
- `[K]` Birim ekonomisi kanıtlanınca şablonu Samsun/Trabzon/Giresun'a kopyala; sonra büyük şehir.
- → *Genişleme: mimari 100k+'a hazır hâle getirilmiş; admin her şehirden saha ekler.*

---

## 7. Olmazsa-Olmaz P0 Kontrol Listesi (mağaza gönderiminden önce)

**Para doğruluğu**
- [ ] Komisyon tek kaynak — owner-kredi trigger'ı `calculate_commission` okuyor; reconciliation kuruşu kuruşuna tutuyor
- [ ] `player_buy_slots` `paymentStatus='PAID'` yazıyor — quorum haksız iptal etmiyor
- [ ] Slot yazımı sunucu-otoriter + `matches` UPDATE RLS'inde `WITH CHECK` — kaptan bedava CONFIRMED yapamıyor
- [ ] Gerçek ödeme uçtan uca (blokaj→tahsil→payout→kademeli iade), sandbox + kanarya kanıtlı
- [ ] Gerçek QR bilet (imzalı, doğrulanabilir)

**Güvenlik & Hukuk**
- [ ] `profiles` PII daraltıldı (`public_profiles` view; e-posta/telefon/konum/token/bakiye korunuyor)
- [ ] Admin MFA açık (`admin_mfa_required=true`) + kritik RPC'lerde AAL2 zorunlu
- [ ] Yasal metinler: ünvan/MERSİS/VERBİS dolu, public URL'de, avukat onaylı, iade metni=kod
- [ ] Ham kart formu kaldırıldı (iyzico hosted); kayıt yaş kapısı var

**Büyüme & Değer**
- [ ] Çalışan davet linki + arkadaş-ekle + saha paylaş (ölü butonlar bağlandı)
- [ ] Şehir scope + cold-start boş-durumları; sahte doluluk/avatar/"+8" temiz
- [ ] Değer önermesi ana ekranda (kadro kurmadan katıl · dolmazsa iade)

**Altyapı & Tedarik**
- [ ] Migration yeniden-kurulabilir (çift version temiz) + CI advisor snapshot
- [ ] iyzico sözleşmesi canlı + kurumsal mağaza hesapları
- [ ] Push go-live (APNs/FCM + `production`)
- [ ] Ordu ~5 saha zengin/canlı + atıl saat envanteri
- [ ] PITR + Sentry + uptime açık; Go-Live Ön-Uçuş yeşil; demo purge + `demo_mode=KAPALI`

---

## 8. Kuzey Yıldızı & Metrikler

**Kuzey yıldızı:** Başarılı oynatılan maç (ödendi → toplandı → oynandı → OYNA + saha parasını aldı). Otomatik ölçülür.

| Katman | Metrik | Neden |
|---|---|---|
| Aktivasyon | Kayıt → ilk başarılı maç süresi & oranı | Değer vaadinin gerçekliği |
| Likidite | Saha başına haftalık dolu-slot % (özellikle atıl saat) | Arz sağlığı |
| Büyüme | Davet-başına-yeni-kullanıcı (viral katsayı k) | Döngü çalışıyor mu |
| Para | İşlem başına net take-rate + reconciliation delta = 0 | Defter doğruluğu |
| Owner | Kağıda-yazılmayan-hafta oranı (defteri bırakma) | Katman-2 zaferi |
| Retention | 2. hafta / 4. hafta geri dönüş | Alışkanlık döngüsü |
| Anti-kaçış | App-içi kalan GMV / owner'a atlatılan tahmini GMV | Disintermediation kontrolü |

---

## 9. Riskler & Panzehirler

| Risk | Olasılık | Panzehir |
|---|---|---|
| **Disintermediation** (owner/oyuncu WhatsApp'a kaçar) | Yüksek (komisyon direnci gerçek) | Split-pay kilidi + kaleci/hakem arz tekeli + no-show/depozito garantisi + düşük take-rate + "boş saat" çerçevesi |
| **Değer vaadi simüle kalırsa** | Fatal | Faz 1 P0 — bitmeden çıkma |
| **Para defteri hatalı canlıya çıkarsa** | Yüksek | Faz 0 sessiz yamalar + reconciliation delta=0 kapısı |
| **Ölçek duvarı erken kohortta** | Orta | Faz 2 ölçek quick-win'leri yoğunluktan önce |
| **Rakip kopyalar** (SahaCepte/Sahamatik hızlı) | Orta | Yerel density + ağ etkisi savunur (özellik değil); hız |
| **Plei Türkiye'ye girer** | Düşük-orta (Avrupa sonrası) | Şehir yoğunluğunu Plei gelmeden kilitle |
| **Pazar tavanı** (Ordu küçük/küçülüyor) | Yapısal | Ordu'yu kâr merkezi değil **şablon** gör; birim ekonomisi kanıtlanınca kopyala |
| **KVKK/mağaza reddi** | Orta | Faz 0/1 P0 hukuk kalemleri |

---

## 10. Kurucuya Kalan Açık Kararlar

| # | Karar | Sentez önerisi |
|---|---|---|
| 1 | iyzico gecikirse: ödemesiz "keşfet + talep" ile mi çıkalım? | **Hayır** — değer vaadi ödemede; ödemesiz çıkış ilk kohortu yakar. Kurumsal tedariki gün-0 hızlandır. |
| 2 | Gamification'ı lansmanda gizleyelim mi? | **Kısmen** — Studio/IQ akademisi/GK-hakem vitrinini beta'da gizle/waitlist; kaynağı büyüme döngüsüne aktar. Kaleci/hakem *arzını* gün-1 tohumla ama boş vitrini gösterme. |
| 3 | Komisyon birleştirme oranı: %10 mu %15 mi? | **%10** (`KATMAN2` kararı) — cüzdan zaten fiilen %90 kredilendiriyor; %15 mevcut owner'lara zam. |
| 4 | Payout bekletme 14→7 gün? | **Evet** — en güçlü tek güven kolu; tek satır ayar. |
| 5 | Ana pazarlama mesajı ne? | **"Parayı arkadaşlarından tek tıkla topla"** (split-payment) — "saha kirala" değil; telefonun yapamadığı iş. |
| 6 | İlk genişleme şehri? | Birim ekonomisi kanıtlanınca **Samsun/Trabzon/Giresun** (komşu, benzer profil); İstanbul en son. |

---

> **Özet felsefe:** Mevcut dokümanlar "mağazaya nasıl çıkarız"ı çözmüş. Bu sentezin eklediği üç şey: (1) **doküman ↔ kod drift'i** — "düzeltildi" denen para hatalarının hâlâ canlı olduğu; (2) **büyüme motorunun ölü kod** olduğu ve domine etmek için canlandırılması gerektiği; (3) **rekabet penceresinin** (Plei yok + parçalı pazar) gerçek ama dar olduğu. Domine etmenin denklemi net: `gerçek değer × doğru defter × çalışan döngü × yerel yoğunluk × hız`. Bugün ilk üçü sıfıra yakın; Faz 0-2 bunları bire çıkarır, Faz 3-4 yoğunluğu hakimiyete çevirir. **Kuzey yıldızı hep aynı: başarılı oynatılan maç.**
