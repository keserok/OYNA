# OYNA — Lansman & Kitlesel Benimsenme Engelleri ve Aşma Planı

> **Tarih:** 4 Temmuz 2026
> **Kaynak:** Kod tabanının uçtan uca canlı analizi + 3 paralel bağımsız denetim (mağaza hazırlığı · saha sahibi operasyon bütünlüğü · oyuncu akışı & ödeme gerçekliği).
> **Soru:** OYNA'yı Google Play + App Store'a yüklemenin, **saha sahiplerinin TÜM operasyonlarını** uygulamaya taşımasının ve **saha kiralayacak tüm oyuncuların** uygulamayı kullanmasının önündeki engeller nelerdir; nasıl aşarız?
> **İlişki:** Bu belge, mevcut `docs/master/STORE_LANSMAN_PLANI.md` (teknik mağaza checklist'i) üzerine biner ve onu **benimsenme (adoption) katmanıyla** tamamlar. Teknik plan "nasıl mağazaya çıkarız"a; bu belge "mağazaya çıktıktan sonra saha sahibi ve oyuncu neden gerçekten kullanır"a odaklanır.

---

## 0. Yönetici Özeti — 30 Saniyede Tablo

Engeller üç katmanda toplanıyor. **İyi haber:** teknik mağaza engellerinin kod tarafı büyük ölçüde çözülmüş durumda (PR #28 main'de). **Kötü haber:** asıl zorluk kodda değil, **üç adet insan/güven denklemi**nde:

| Katman | Soru | Durum | Tek cümlelik gerçek |
|---|---|---|---|
| **1 — Mağaza** | Store'a çıkabilir miyiz? | 🟡 Kod %90, kurucu %20 | Kod engelleri çözüldü; kalan engeller **kurucu tedariki** (iyzico, hesap, avukat, marka) + 3 küçük kod kalıntısı. |
| **2 — Saha Sahibi** | Tüm operasyonunu taşır mı? | 🟠 Özellik var, güven yok | Panel özellik olarak zengin; taşımayı engelleyen şey **özellik eksikliği değil, güvenilirlik ve güven** (internet kesilince çöküyor, faturayla kilitleniyor, para vaadi tutmuyor). |
| **3 — Oyuncu** | Uygulamayı kullanır mı? | 🔴 En kritik boşluk | Uygulama şu an **telefonla aramayı yenecek TEK şeyi yapmıyor: gerçek para hareketi + gerçek bilet.** Her şey simülasyon. |

> ### ⚠️ Tüm analizin kalbindeki tek cümle
> **OYNA bugün, bir oyuncunun "sahayı telefonla aramak yerine neden uygulamayı açayım?" sorusuna yanıt veren tek özelliği — anında ödeyip yeri kilitlemeyi ve gerçek bir bilet almayı — SİMÜLE ediyor.** Kart verisi cihazdan çıkmıyor (`PaymentScreen.tsx:169-171`), QR bilet sabit bir ikon + sabit `OYNA-8293-TX` metni (`MatchTicket.tsx:96-112`), "kart ekle" rastgele 4 hane üretiyor (`WalletScreen.tsx:131-141`). Bu bir "eksik" değil, **ürünün var oluş sebebinin henüz gerçek olmaması**. Lansmanın #1 önceliği budur; geri kalan her şey bunun üstüne kurulur.

---

## 1. Durum Fotoğrafı — Nereden Başlıyoruz?

**Hazır ve sağlam (kanıtlanmış):**
- Web/ürün katmanı: `tsc` temiz, production build başarılı, 70/70 birim testi geçiyor.
- Backend: Supabase, ~73 tablo, 126+ migration, RLS yaygın, admin paneli (MFA/AAL2), 8 aktif Edge Function.
- Mağaza kod işleri (PR #28 ile main'de): OYNA markalı gerçek ikon/splash, Android izinleri + portre kilidi + `oyna://` deep link + `colors.xml`, release imzalama config'i, iOS `com.oyna.app` bundle + `App.entitlements` (Push + Apple Sign-In), `ic_stat_oyna` bildirim ikonu, hesap silme akışı (`request_account_deletion`), fail-closed `admin-broadcast`, silinen legacy `push-notification`, dev-mode sızıntısı kapatıldı, targetSdk 35 / iOS 15.
- İş mantığı: komisyon SSOT motoru (4 seviye), kademeli iade, Model B (owner %95 + markup), kaleci/hakem anında payout, maç yaşam döngüsü (T-8s onay/iptal), bildirim merkezi — **hepsi kod olarak hazır, SIMULATION modunda bekliyor.**

**Simülasyon / sahte olan (canlıya kadar gerçek değil):**
- Ödeme (kart hiçbir yere gitmiyor), QR bilet (statik), kart ekleme (rastgele last4), saha doluluk % (rating'den uydurma), uygulama-içi yorumlar (yok — sadece Google).

Yani mimari **"env doldur + birkaç HTTP bağla"** noktasında; ama o birkaç bağlama tam da ürünün değer vaadini oluşturan kısım.

---

## 2. KATMAN 1 — Mağazaya Çıkış Engelleri (Teknik + Kurucu)

### 2.1 Kalan mağaza engelleri (kod)

| # | Engel | Etki | Kanıt | Aşma |
|---|---|---|---|---|
| 1 | **Profil PII herkese açık** — `profiles` SELECT `USING (true)`; her giriş yapan kullanıcı diğerlerinin e-posta/telefon/konumunu okuyabiliyor. Güvenli `public_profiles` view'ı düşürülmüş, yeniden kurulmamış. | 🔴 **KVKK ihlali riski + mağaza reddi** | `20260701000003_rls_policy_consolidation.sql:302`; view drop: `20260613090000` | Sütun-kısıtlı `public_profiles` view'ı yeniden kur; hassas alanları (e-posta/telefon/konum) yalnız sahibi + admin görsün. Mobil sürümle **koordineli** yap (mağaza sürümü bu fırsat penceresi). |
| 2 | **Yasal metin yer tutucusu** — `[ŞİRKET ÜNVANI]` hem uygulamada hem gizlilik sayfasında dolmamış. | 🔴 Mağaza reddi + KVKK (veri sorumlusu kimliği) | `LegalScreen.tsx:15`, `public/gizlilik.html` | Şirket ünvanı/MERSİS/adres doldur; `public/gizlilik.html` + `public/hesap-silme.html`'i **public URL'de yayınla** (her iki mağaza konsolu ister). Avukat onayı. |
| 3 | **Yasal metin ↔ gerçek davranış çelişkisi** — Kullanım Şartları "≥48s → %90 iade" diyor; gerçek motor kademeli (≥24s %100 / 6–24s %50 / <6s yok); `PaymentScreen` "1-3 gün blokaj serbest" diyor. Üç farklı iade anlatısı. | 🟠 Mesafeli satış uyumu + güven | `LegalScreen.tsx:38`, `playerBookingService.ts:3,44-53,202-207`, `PaymentScreen.tsx:209` | Tek iade politikası: motorun gerçek kademesi metne, metin de UI'a birebir eşitlensin. |
| 4 | **iOS push ortamı `development`** — App Store/TestFlight push'u için `production` olmalı. | 🟡 Küçük (push çalışmaz) | `App.entitlements` `aps-environment=development` | `production`'a çevir (veya Xcode otomatik imzalamanın ezdiğini doğrula). |
| 5 | **Reviewer erişimi** — şifresiz OTP akışı Apple/Google incelemecisi için tuzak. | 🟡 İnceleme takılması | `AuthScreen.tsx` OTP | Review için OTP-bypass'lı demo hesabı veya sabit-kod test kullanıcısı; App Review notlarına yaz. |

### 2.2 Kurucu tedarik engelleri (kod-dışı, **kritik yol — gün 0'da başla**)

Bunlar en uzun sürenler ve tümü sizin (kurucu) elinizde:

| Kalem | Neden kritik | Süre riski |
|---|---|---|
| **iyzico pazaryeri sözleşmesi + KYC + canlı anahtarlar** | Gerçek para akışının önkoşulu; şirket kuruluşu gerekiyorsa en uzun kalem | 🔴 Haftalar |
| **Şirket kuruluşu / ünvan** | iyzico + kurumsal mağaza hesapları + yasal metinler buna bağlı | 🔴 Haftalar |
| **Google Play Console** ($25) — **kurumsal hesap** | ⚠️ Kişisel hesapta **12 tester × kesintisiz 14 gün** zorunlu kapalı test; kurumsal hesap muaf | 🟠 2 hafta (kişiselse) |
| **Apple Developer** ($99/yıl) — şirketse D-U-N-S | D-U-N-S alımı 1-2 hafta | 🟠 |
| **APNs `.p8` + Firebase FCM `google-services.json`** | Push go-live | 🟡 |
| **Avukat onaylı 4 metin + VERBİS değerlendirmesi** | KVKK + mesafeli satış | 🟠 |
| **Marka kiti** (ekran görüntüleri, feature graphic, mağaza metinleri) | Mağaza listeleme | 🟡 |
| **Ordu 4 saha gerçek anlaşma + fiyat/takvim** | Arz cold-start'ı (Katman 3'ün önkoşulu) | 🟠 |

### 2.3 Katman 1 Sonucu
Mağaza reddini engelleyen kod işleri **1 haftalık** bir sprint (PII view + legal doldurma + push env + reviewer hesabı). Asıl takvim kurucu tedarikte; **ilk gün paralel başlatılmalı.** Not: iyzico gecikirse ilk sürüm **ödemesiz "keşfet + rezervasyon talebi"** olarak feature-flag'le çıkabilir — mağaza lansmanını sözleşmeden ayrıştırır (aşağıda Aşama planına bakınız).

---

## 3. KATMAN 2 — Saha Sahibi "Tüm Operasyonu Taşıma" Engelleri (Arz)

### 3.1 İyi haber: özellik genişliği gerçekten var
Denetim, panelin **kağıt üstünde şaşırtıcı derecede tam** olduğunu doğruladı. Var olanlar (hepsi kod + DB'de canlı):
- **Manuel/offline rezervasyon** (telefonla/kapıdan gelen müşteri) — birinci sınıf; `user_id` olmadan isim+telefon+nakit/kapora (`pitchOwnerService.ts:328-348`).
- **Abonman/sabit saat** (haftalık otomatik üretim, 12 hafta ufuk), **tarifeler** (hafta içi/sonu/tatil/özel), **flash indirim + prime-time özel fiyat**, **bakım/kapalı saat**, **gider takibi** (Fatura/Personel/Bakım), **veresiye defteri**, **finans/kazanç grafikleri**, **payout/çekim + banka hesapları**, **personel + görev**, **çok kort**, **kantin amenity işareti**, **QR skor**, **çalışma saatleri**.
- **Onboarding** (`PartnerOnboarding.tsx`): 3 adımlık akıcı sihirbaz (tesis adı → tek fiyat → IBAN), belge/vergi no istemiyor.

**Sonuç: engel özellik eksikliği DEĞİL.** Engel, saha sahibinin defterini/WhatsApp'ını **emekliye ayırmasını** engelleyen güvenilirlik ve güven boşlukları.

### 3.2 Gerçek engeller (öncelik sırasıyla)

| # | Engel | Neden "tüm operasyonu taşımayı" bloklar | Kanıt |
|---|---|---|---|
| **1** | **Offline yok — sadece online.** Yazma işlemlerinde `navigator.onLine` kontrolü, kuyruk, optimistik tampon veya yerel önbellek yok. `OfflineBanner` yalnızca pasif uyarı şeridi. | Halı sahalar geceleri sık sık zayıf bağlantılı. İnternet kesikken kapıdan gelen müşteriyi girmeye çalışınca **rezervasyon kaybolur**. Bu tek başına saha sahibini **kağıt yedeği tutmaya** zorlar → %100 taşıma imkânsız. | `pitchOwnerService.ts` (kuyruk/önbellek yok), `components/OfflineBanner.tsx` |
| **2** | **SaaS-fatura read-only kilidi ön büroyu kilitliyor.** `owner_accounts.status` = suspended/cancelled → tüm panel `isReadOnly`, `guardWrite()` **nakit kapı rezervasyonunu bile** bloklar. | Ödenmemiş bir SaaS faturası yüzünden ön büronun kilitlenebileceği bir araca hiçbir işletme **tüm operasyonunu** emanet etmez. | `OwnerPanel.tsx:718-724`, `useOwnerEntitlements.ts:52-58` |
| **3** | **Payout vaadi ↔ gerçek çelişkisi.** Onboarding "Ödemeler her Pazartesi otomatik hesabınıza geçer" diyor; gerçek: kart kazancı **~14 gün PENDING** → owner **manuel çekim talebi** → **admin onayı** → IBAN. | Para söz verildiği gün gelmeyince güven çöker — üstelik keşfi kolay, yıkıcı bir hayal kırıklığı. | Vaat: `PartnerOnboarding.tsx:331`; gerçek: `OwnerWithdrawalsModal.tsx:107-113`, `release_owner_earnings` (14g) |
| **4** | **Komisyon şeffaf değil + nakit/kart mutabakatı yok.** Gerçek oran (%10 rezervasyon, %15 maç/hizmet) owner UI'ında hiç yüzeye çıkmıyor (`getOwnerBalance` client'a `commissionRate: 0` dönüyor). Nakit hiç cüzdana girmiyor; "Net Kazanç" eldeki nakiti + OYNA'nın tuttuğu kartı karıştırıyor. | Owner banka ekstresiyle uzlaştıramadığı bir bakiyeye güvenemez; "İlk 30 gün %0" teaser'ı sonra ne olacağını da söylemiyor. | `pitches.platform_commission_rate` (%10), `commission_config` (%15), `credit_owner_booking_earning` (yalnız kart) |
| **5** | **Tesisin bu gecesi tek ekranda yok.** Takvim yalnızca **1 kort × 1 gün** (24 saatlik dilim); aylık görünüm sadece abonman listesi. | Çok kortlu owner "bu akşam tüm tesis" panosunu göremiyor — kağıt haftalık ızgaradan/beyaz tahtadan **geriye** düşüş. | `OwnerPanel.tsx:459-463, 546-590` |
| **6** | **Kantin/POS yok.** Menü/ürün/satış tablosu yok; "Kantin" sadece amenity kutusu. | Kafe/büfe gerçek gelir kalemi olan tesisler ayrı sistem tutmaya devam eder. | `shared/amenities.ts:44-46` |
| **7** | **Veresiye çok sığ.** `pitch_debtors` kişi başına tek düz `amount_owed`; kalem-kalem defter, kısmi ödeme, rezervasyona/kantin hesabına bağlama yok. | Kağıt veresiye defterinin yerini tutamaz. | `OwnerFinanceView.tsx:302-337` |
| **8** | **Self-servis yok + personel login yok + fiş yok.** Plan yükseltme "destek@oyna.app'e yaz"; masadaki görevli kısıtlı erişimle çalışamıyor; nakit müşteri fiş alamıyor. | Owner her onay/plan/fatura için OYNA personeline bağımlı; tek hesap = tek konsol. | `OwnerPanel.tsx:1450-1454`, `OwnerMenuView.tsx:318-326` |
| **9** | **Manuel rezervasyon katılığı + admin onay kapısı.** Hızlı-oluştur 1 saat + %25 kapora sabit; tesis admin onayı olmadan (24s SLA, insan bağımlı) app-booking alamıyor. | Esnek saat/özel kapora yok; canlıya çıkış OYNA personeline bağlı. | `OwnerPanel.tsx:862-864, 880, 1770` |

### 3.3 Psikolojik engel: "Neden defterimi bırakayım?"
Bir halı saha sahibi için mevcut sistem (defter + WhatsApp + nakit + telefon) **çalışıyor ve bedava**. Yeni bir araca geçmenin bilişsel maliyeti yüksek. Onu ikna eden şey "daha çok özellik" değil; **(a) hiçbir rezervasyonu kaybetmeme garantisi, (b) parasının kesin ve öngörülebilir gelmesi, (c) sıfır risk — kötü giderse defterine dönebilmesi.** Şu anki kod bu üç güveni de tam veremiyor.

### 3.4 Aşma Planı (yaratıcı) — Saha Sahibi

1. **🔌 "Kağıt Defteri Emekliye Ayırma" garantisi = Offline-first ön büro.** Rezervasyon yazma işlemleri yerel kuyruğa (IndexedDB) yazılıp bağlantı gelince senkronlansın; UI optimistik. Slogan: *"İnternet kesilse bile OYNA rezervasyon kaybetmez."* Bu, #1 engeli kaldırır ve tam taşımanın tek en büyük kilidini açar.
2. **🔓 Ön büro asla read-only olmaz.** Fatura/SaaS gecikmesi yalnızca **premium analitiği** kıssın; nakit/kapı rezervasyonu + takvim **her zaman** açık kalsın. `guardWrite`'ı "para toplama çekirdeği" ile "premium modüller" olarak ikiye ayır.
3. **🤝 Concierge onboarding + veri taşıma (white-glove).** Kapalı beta'da OYNA ekibi, sahanın **mevcut abonman/sabit saatlerini defterinden panele girer.** Owner sıfır emekle "tüm sabit takımlarım zaten sistemde" görür — geçiş sürtünmesi biter. Ölçeklenince "abonmanları toplu içe aktar (CSV/foto→OCR)" aracına dönüşür.
4. **🗓️ "Tesisin Bu Gecesi" tek ekran.** Çok kort × saat matrisi (renk kodlu, tüm kaynaklar birleşik) — owner'ın kağıt haftalık ızgarasının dijital, daha iyi hâli. Günlük kullanım kancası budur.
5. **💰 Şeffaf kazanç + mutabakat.** Gerçek komisyon oranını göster; "Nakit (sende): X · Kart (OYNA'da, komisyon sonrası net): Y · Sıradaki payout: Z ₺, [tarih]" tek kartta. **Onboarding'deki "her Pazartesi" vaadini ya gerçekten haftalık otomatik payout'a çevir ya da metni gerçek modelle eşitle.** (Öneri: güven için gerçekten haftalık otomatik payout hedefle.)
6. **🧾 Kantin-lite POS + kalem-bazlı veresiye (fast-follow).** Basit ürün listesi + satış + veresiyeye kalem yazma; nakit müşteriye fiş/QR makbuz. Tam POS değil ama "ayrı defter tutmama" eşiğini geçirir.
7. **👥 Personel login (scoped rol) + self-servis plan.** Masadaki görevli için kısıtlı hesap; owner panelden plan görebilsin/değiştirebilsin — OYNA personeline bağımlılığı azalt.
8. **📣 Owner-led büyüme kiti** (Katman 3'e köprü): saha sahibine hazır **QR afiş + paylaşılabilir public saha sayfası** ver ki oyuncularını sürtünmesiz OYNA'ya yönlendirsin (bkz. §4.3 ve §5).

---

## 4. KATMAN 3 — Oyuncu Kitlesel Benimsenme Engelleri (Talep)

### 4.1 Çekirdek gerçek: Rakip "telefonla aramak"
Bir oyuncu için alternatif ücretsiz, tanıdık ve anında: **sahayı ara, saati söyle, git oyna.** OYNA'nın kazanması için ya **telefonun yapamadığı bir işi** yapması ya da **aynı işi belirgin şekilde daha iyi/ucuz** yapması gerekir. Önemli mimari tespit: **tek bir oyuncu, arkadaş olmadan tek başına saha kiralayabiliyor** (Path A: PitchDiscovery → kapora) — yani sosyal ağ zorunluluğu bir engel değil. Asıl engel (a) ödeme/biletin sahte olması ve (b) arz cold-start'ı.

### 4.2 Engeller (kod-temelli, öncelik sırasıyla)

| # | Engel | Neden bloklar | Kanıt |
|---|---|---|---|
| **1** | **Ödeme + bilet vaporware.** İki ayrı kiralama yolu (PitchDiscovery kapora / PaymentScreen blokaj) ve **ikisi de simülasyon.** Kart cihazdan çıkmıyor; QR statik ikon + sabit ID; turnike okuyamaz. | Uygulamayı telefona üstün kılan tek şey (öde-kilitle-bilet-al) sahte. Şu hâliyle telefonun yapmadığı hiçbir şey yapmıyor. | `PaymentScreen.tsx:169-171`, `PitchDepositCheckout.tsx:74-114`, `MatchTicket.tsx:96-112`, `create-payment/index.ts:21` (SIMULATION) |
| **2** | **Cold-start boş şehir.** `fetchPitches` yalnız approved+open+published döner; onaylı sahası olmayan şehirde liste boş, harita boş, "temizle" butonu işe yaramaz. "Henüz sahan yok / saha öner / haberdar et" yok. | Kullanıcının şehrinde 0 saha görünürse "sahayı ara" her zaman kazanır; ilk kullanıcı ölü uygulama görür. | `PitchDiscovery.tsx:552-554` |
| **3** | **Zorunlu "kart ekle" detour + sahte kart.** Path A kiralamadan önce kullanıcıyı Cüzdan'a "kart ekle"ye yolluyor; o ekran kart bilgisi bile almıyor (rastgele last4, localStorage). | Sıfır gerçek işlev için ekstra sürtünme; misafir sonra ham `UNAUTHORIZED` hatası yiyor. | `PitchDiscovery.tsx:827-859`, `WalletScreen.tsx:131-141`, `PitchDepositCheckout.tsx:70` |
| **4** | **Onay kutusu misafiri bile kilitliyor.** KVKK + üyelik sözleşmesi işaretlenmeden Google/Apple/OTP **ve misafir gezinme** hepsi kapalı. "Önce göz at" vaadi bir hukuki sözleşmenin arkasına gizlenmiş. | Meraklı kullanıcı "sadece maçlara bakayım" bile diyemiyor → ilk temas sürtünmesi. | `AuthScreen.tsx:309-310` |
| **5** | **Sadece e-posta OTP (telefon girişi yok).** Halı saha kitlesi telefon numarası merkezli; e-posta + gelen kutusu turu awkward. | Google/Apple kullanmayan için ekstra sürtünme. | `AuthScreen.tsx:162,190-247` |
| **6** | **Güven boşluğu.** Uygulama-içi yorum yok (sadece Google puanı); doluluk % **rating'den uydurma**; iade kuralları 3 yerde çelişik; "iyzico güvencesi · kart saklanmaz" metni ödeme gerçek değilken gösteriliyor. | Tereddütlü ilk kullanıcıya güvenmemek için birkaç sebep; telefona geri döner. | `PitchDiscovery.tsx:148-149` (uydurma doluluk), yorum kodu yok, `PaymentScreen.tsx:360` |
| **7** | **Fiyat: markup oyuncuya bindiriliyor → uygulama pahalı.** Komisyon "Hizmet Bedeli %15" olarak oyuncunun toplamına **EKLENİYOR**; Model B'de markup oyuncuya EK. | Oyuncu aynı sahayı **uygulamadan telefonla aramaktan pahalıya** kiralıyor → doğrudan disintermediation motivasyonu (bkz. §5). | `PaymentScreen.tsx:187`, Model B (`OYNA_GO_LIVE_IYZICO.md §5`) |

### 4.3 Aşma Planı (yaratıcı) — Oyuncu

1. **💳 Ödeme + bileti GERÇEK yap (mutlak #1).** iyzico Checkout'u iki yola da bağla; QR'ı gerçek imzalı token'a çevir (turnike/owner okutabilsin); sahte "kart ekle"yi kaldır ya da gerçek tokenizasyona çevir. **Bu bitmeden lansmanın anlamı yok.**
2. **🎯 Wedge = telefonun YAPAMADIĞI iş.** İki gerçek wedge:
   - **Split payment / kaptan garantörlüğü:** 10 arkadaştan para toplamak gerçek bir acı; telefon bunu çözemez, OYNA çözer. Ana pazarlama mesajı "saha kirala" değil, **"parayı arkadaşlarından tek tıkla topla"** olmalı.
   - **Eksik oyuncu/kaleci/hakem bulma:** kadro dolduramamak halı sahanın #1 derdi; keşif + hizmet pazaryeri bunu çözer.
   *(Bu ikisi kuzey-yıldız metriği "başarılı maç" ile birebir örtüşür.)*
3. **⚖️ Fiyat pariteti/avantajı — "app'te asla daha pahalı değil."** Görünür markup'ı oyuncuya bindirmek yerine: ya komisyonu owner'ın Model B net'inden karşıla, ya app'e **özel avantaj** ver (anında onay, split-pay, uygulamaya özel boş-saat indirimi, sadakat). Kural: **uygulamadan kiralamak telefondan en az bir boyutta daha iyi (ucuz/hızlı/garantili) olmalı**, yoksa oyuncu owner'ı direkt arar.
4. **🌱 Cold-start'ı yoğunlukla çöz.** Tek şehir (Ordu) derinlemesine: 4 sahayı zengin içerikle (foto/fiyat/gerçek takvim) doldur; boş şehirde "Şehrinde henüz saha yok → **beni haberdar et** / **saha öner**" affordance'ı ekle; ilk hafta owner'lar oyuncularını yönlendirsin (owner-led). Talebi dağıtma, **yoğunlaştır**.
5. **⭐ Sahte güven sinyallerini gerçekle değiştir.** Uydurma doluluk %'sini **gerçek müsaitlikle**, "Google puanı"nı **uygulama-içi gerçek yorumlarla** (maç sonrası saha puanı → vitrin) değiştir; çelişen iade kurallarını tek net politikaya indir.
6. **🚪 Misafiri serbest bırak, sadece işlemde kapıla.** KVKK onayını gezinmeden çıkar; yalnızca **kayıt/ödeme anında** iste. "Önce göz at" gerçekten önce göz atma olsun (mevcut `SignupGate` zaten nazik — Path A'ya da uygula, ham `UNAUTHORIZED` yerine).
7. **📱 Telefon numarasıyla giriş** (OTP SMS) opsiyonu ekle — hedef kitleye uygun.
8. **🔗 Public saha sayfası + QR** (owner-led büyüme motoru — Katman 5): `oyna.app/saha/{slug}` indirmeden görülebilen, "app-store smart banner"lı sayfa. Owner QR afişini asar; oyuncu QR'ı okutur, sahayı **indirmeden** görür, kiralamak isteyince app'e/PWA'ya düşer. Şu an tüm rotalar SPA'ya gidiyor; **public, SEO'lu, girişsiz saha sayfası yok** (`vercel.json` hepsi → index.html). Bu, viral döngünün eksik halkası.

---

## 5. Katmanlar-arası Stratejik Risk: İki Taraflı Pazar & Disintermediation

İki yapısal risk üç katmanı da keser:

1. **Chicken-and-egg (arz ↔ talep).** Oyuncu, saha olmayan uygulamaya gelmez; saha, oyuncu olmayan uygulamaya operasyonunu taşımaz. **Çözüm = "önce arz, tek şehir, yoğun":** Ordu'da 4 sahayı gerçekten canlı + zengin yap, owner'lar kendi oyuncularını getirsin (owner-led). Şehir şehir değil, **mahalle mahalle doygunluk.**
2. **Disintermediation (aracıdan kaçış).** Bir pazaryerinin ölüm sebebi: taraflar tanışıp platformu atlaması. OYNA'da somut risk: owner, OYNA'nın getirdiği oyuncuya *"bir dahakine beni direkt ara, daha ucuz"* der — çünkü markup oyuncuya bindiği için **app pahalı**, owner da komisyondan kaçmak ister. **Panzehir:** (a) app'i oyuncu için telefondan **daha iyi/ucuz** yap (§4.3.3), (b) owner'ın app-dışı yapamayacağı değeri app'e bağla (split-pay ile garantili tahsilat, no-show koruması, otomatik abonman üretimi, doluluk optimizasyonu), (c) "başarılı maç" başına değer ver — owner app üzerinden gelen parayı **daha kolay ve garantili** alsın.
3. **Kuzey-yıldız hizası.** Her iki taraf da tek metriğe hizmetkâr: **başarılı oynatılan maç** (ödendi → toplandı → oynandı → OYNA+saha parasını aldı). Tüm engel aşma önceliklendirmesi bu metriği artırana göre yapılmalı.

---

## 6. Öncelikli Aşma Planı (Fazlı, Net)

> **[K]** = Kurucu (kod-dışı) · **[G]** = Geliştirici (kod) · **[T]** = Tasarım

### 🟢 Aşama 0 — Kurucu Tedariki (GÜN 0, paralel başlar; kritik yol)
`[K]` iyzico sözleşme/KYC · şirket kuruluşu/ünvan · **kurumsal** Google Play + Apple hesapları (12-tester tuzağından kaç) · APNs/FCM · avukat (4 metin + VERBİS) · marka kiti · **Ordu 4 saha anlaşması + gerçek fiyat/takvim.**
→ *Bu kalemler haftalar sürer; hiçbir kod bunları hızlandıramaz. İlk gün başlamazsa lansman kayar.*

### 🔴 Aşama 1 — "Gerçeğe Geçiş" Sprint'i (mağaza + iş engeli — P0)
`[G]` **Ödemeyi gerçek yap** (iyzico Checkout → iki kiralama yolu + pre-auth/capture/void/refund bağla) · **QR bileti gerçek imzalı token** · sahte "kart ekle"yi kaldır/tokenize · **PII `public_profiles` view'ı** · yasal `[ŞİRKET ÜNVANI]` doldur + public URL yayınla + iade metni-motor eşitle · iOS push `production` · reviewer demo hesabı · misafir onay kutusu kapısını işlem anına taşı · cold-start "haberdar et/saha öner" affordance'ı · uydurma doluluk %'sini kaldır.
→ *Çıktı: mağaza incelemesini geçebilen ve gerçek para/bilet üreten uygulama.*

### 🟠 Aşama 2 — Kapalı Beta (Ordu, 4 saha + davetli oyuncular)
`[G]` **Offline-first ön büro** (kuyruk+senkron) · **ön büro asla read-only** (guardWrite ikiye böl) · **"Tesisin bu gecesi" çok-kort ekranı** · **şeffaf kazanç/mutabakat + payout vaadini gerçekle** · **uygulama-içi gerçek yorum** (maç sonu → saha vitrini).
`[K]` **Concierge onboarding**: owner'ların mevcut abonmanlarını defterinden panele ekiple gir; küçük tutarlı **kanarya** gerçek ödemeler + iade.
→ *Çıktı: 4 sahanın gerçekten OYNA üzerinden çalıştığı, para akan, kanıtlanmış çekirdek.*

### 🟡 Aşama 3 — Soft Launch (Ordu geneli) + Büyüme Motoru
`[G]` **Public saha sayfası `oyna.app/saha/{slug}` + smart banner** · **owner QR/afiş büyüme kiti** · **split-payment'ı ana wedge olarak öne çıkar** (pazarlama mesajı) · telefon-OTP girişi.
`[K]` owner-led tanıtım (afiş/QR/paylaşılabilir sayfa); "başarılı maç" panosunu izle.
→ *Çıktı: owner'lar oyuncularını sürtünmesiz getiriyor; ilk gerçek "başarılı maçlar".*

### ⚪ Aşama 4 — Fast-follow + Genişleme
`[G]` Kantin-lite POS + kalem-bazlı veresiye · personel scoped login + self-servis plan · esnek manuel rezervasyon (özel süre/kapora) · targetSdk 36 (31 Ağustos 2026 sınırı) · universal links (assetlinks/AASA) · İngilizce i18n.
→ *Genişleme: mimari 100k+'a hazır; admin her şehirden saha ekler; mahalle-mahalle doygunlukla ilerle.*

### Öncelik Matrisi (özet)

| Engel | Katman | Aşama | Öncelik |
|---|---|---|---|
| Ödeme + QR gerçek değil | 3 | 1 | 🔴 P0 |
| iyzico sözleşme/KYC + kurumsal hesaplar | 1 | 0 | 🔴 P0 |
| PII / KVKK view + yasal ünvan/public URL | 1 | 1 | 🔴 P0 |
| Cold-start (Ordu yoğunluk + affordance) | 3 | 1-2 | 🔴 P0 |
| Offline-first ön büro | 2 | 2 | 🔴 P0 (owner için) |
| Ön büro read-only kilidi | 2 | 2 | 🟠 P1 |
| Payout vaadi ↔ gerçek + komisyon şeffaflığı | 2 | 2 | 🟠 P1 |
| Fiyat pariteti / disintermediation panzehiri | 3/5 | 2-3 | 🟠 P1 |
| Çok-kort haftalık görünüm | 2 | 2 | 🟠 P1 |
| Gerçek yorum + tutarlı iade metni | 2/3 | 1-2 | 🟠 P1 |
| Public saha sayfası + QR büyüme kiti | 3/5 | 3 | 🟠 P1 |
| Misafir onay kapısı + telefon girişi | 3 | 1-3 | 🟡 P2 |
| Kantin POS · kalem veresiye · personel login · fiş | 2 | 4 | 🟡 P2 |

---

## 7. Olmazsa-Olmaz P0 Kontrol Listesi (mağaza gönderiminden önce)

- [ ] **Gerçek ödeme uçtan uca** (blokaj → tahsil → payout → kademeli iade), sandbox + kanarya kanıtlı
- [ ] **Gerçek QR bilet** (imzalı, doğrulanabilir) — statik ikon kaldırıldı
- [ ] **Profil PII daraltıldı** (`public_profiles` view; e-posta/telefon/konum korunuyor)
- [ ] **Yasal metinler**: ünvan/MERSİS dolu, public URL'de yayında, avukat onaylı, iade metni gerçek motorla aynı
- [ ] **iyzico sözleşmesi** canlı + **kurumsal** mağaza hesapları hazır
- [ ] **Push go-live** (APNs/FCM + `production` env) çalışıyor
- [ ] **Cold-start**: Ordu 4 saha zengin/canlı + boş-durum "haberdar et/öner" affordance'ı
- [ ] **Reviewer**: demo/OTP-bypass hesabı + IAP muafiyeti notu (fiziksel hizmet, Guideline 3.1.5(a))
- [ ] **Uydurma veri temiz**: sentetik doluluk %'si kaldırıldı; demo verisi purge; `demo_mode=KAPALI`
- [ ] **Owner güveni**: offline-first ön büro + payout vaadi gerçekle eşit + kazanç şeffaf
- [ ] **PITR + Sentry + uptime** açık; Go-Live Ön-Uçuş tüm satır yeşil

---

> **Özet felsefe:** Mağazaya çıkmak (Katman 1) artık büyük ölçüde kurucu tedarik meselesi. Ama asıl savaş **çıktıktan sonra**: saha sahibini defterini bırakmaya ikna eden **güvenilirlik + güven** (Katman 2) ve oyuncuyu telefonu bırakmaya ikna eden **gerçek para + gerçek bilet + telefonun yapamadığı wedge** (Katman 3). Her ikisinin de önkoşulu tek ve aynı: **simülasyonu gerçeğe çevirmek.** Ondan sonrası, Ordu'da mahalle-mahalle doygunluk ve "başarılı maç" metriğini kovalamak.
</content>
</invoke>
