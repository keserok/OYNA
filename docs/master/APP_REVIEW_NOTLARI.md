# OYNA — Mağaza İnceleme (App Review) Notları

> **Amaç:** Apple App Review + Google Play incelemecisinin uygulamayı sorunsuz
> test edebilmesi ve ödeme/IAP muafiyetini doğru değerlendirmesi için gerekli
> bilgiler. Bu metin, mağaza konsolundaki "App Review Information / Notes for
> reviewer" alanına (gerektiğinde uyarlanarak) yapıştırılmak üzere hazırlandı.
> **Kurucu tarafından doldurulması gereken alanlar `⟨…⟩` ile işaretlidir.**

---

## 1. İnceleme Girişi — HERKESLE AYNI UYGULAMA

> **KARAR (22 Ağustos 2026 — Apple 5.6 reddinden sonra).** Mağaza incelemesi
> için ayrı paket derleme uygulaması **tamamen kaldırıldı.** 19 Ağustos'ta
> eklenen `VITE_MAGAZA_INCELEME` bayrağı, incelemeciye özel bir "DEMO
> HESABIYLA GİR" düğmesi ve iki dilli yönerge kutusu taşıyordu; normal yayın
> paketinde ikisi de yoktu. Apple bunu **Guideline 5.6 (Developer Code of
> Conduct)** altında reddetti:
>
> > "the app contains features that appear to have been intentionally hidden
> > during the review process."
>
> Haklı bir rettir. Kural, bir daha delinmemek üzere:
> **gönderilen paket ile kullanıcının indirdiği paket AYNIDIR.** İncelemeciye
> özel hiçbir kod yolu, derleme bayrağı ya da sunucu anahtarı olamaz.
> İncelemecinin karşılaştığı engel neyse, o engel HERKES için çözülür.

### Engeldi: telefonla giriş, ve o yol hiç çalışmıyordu

OYNA'nın ana giriş yolu telefon + SMS koduydu ve **SMS yalnız +90 numaralara
gidiyordu.** Google/Apple ile giren kullanıcıdan da numara isteniyor, o ekran
atlanamıyordu. Sonuç: yurt dışındaki hiç kimse — mağaza incelemecisi dahil —
uygulamayı açamıyordu. Bu engel, incelemeciye özel bir paket derlenerek
yamandı ve Apple haklı olarak 5.6 verdi.

**22 Ağustos ölçümü, canlı yapılandırma üzerinde:** telefonla giriş
**hiçbir zaman çalışmamıştı.** Supabase Auth "Send SMS Hook" kapalı,
`sms_provider` "twilio" ama hesap ve anahtar yok, `send-sms` uç fonksiyonu
`HOOK_NOT_CONFIGURED` dönüyor, `auth.users` içinde telefonla girişi
tamamlamış **tek kullanıcı yok.** Yani "KOD GÖNDER" düğmesi ekranda duran ölü
bir yoldu.

### Çözüm: telefon yolu uygulamadan SİLİNDİ — giriş yalnız Apple ve Google

Kural (§1): incelemecinin karşılaştığı engel neyse HERKES için çözülür;
çözülemiyorsa özellik HERKES için kapatılır. SMS sağlayıcısı yok, yani
çözülemedi → yol **kapatıldı, hem de silinerek** (23 Ağustos 2026).

Silinenler — bayrakla karartma değil, kod kaldırma:

| Ne | Nerede |
| --- | --- |
| Numara + kod adımları | `views/AuthScreen.tsx` |
| Numara bağlama ekranı | `views/PhoneLinkScreen.tsx` *(dosya silindi)* |
| OTP uçları | `supabaseAuth.ts` · `sendPhoneOtp` / `verifyPhoneOtp` / `requestPhoneLink` / `confirmPhoneLink` |
| Giriş sonrası numara kapısı | `App.tsx` · `numaraGerekli`, `shared/numaraKapisi.ts` *(dosya silindi)* |
| Ödeme öncesi numara kapısı | `views/PaymentScreen.tsx` |
| Demo hesap seçici + ortak şifre | `supabaseAuth.ts`, `data/demoAccounts.ts` *(dosya silindi)* |
| Sabit kodlu test numarası | `supabase/config.toml` · `[auth.sms.test_otp]` |

**Niye bayrak yetmedi:** yol üç kez bayrakla karartıldı
(`SMS_OTP_ENABLED`, `VITE_DEMO_ACCOUNTS`, `VITE_DEV_MODE`) ve üç kez geri
geldi — bayraklardan biri yanlış ortama (Vercel) yazılıydı. Bayrak, silinmesi
gereken bir şeyi gizler.

Kilitler: `tests/unit/tekGirisYolu.test.ts`, `tests/unit/magazaKapilari.test.ts`,
`tests/unit/signupGateAndLegal.test.ts`. Uçtan uca sürüş: `npm run giris:dogrula`.

### İncelemeciye özel hesap YOK — ve bu bilinçli

> **KALDIRILDI (23 Ağustos 2026).** Burada bir **sabit kodlu test numarası**
> tarif ediliyordu: `+90 500 000 00 02`, Supabase → Phone → **Test OTP**
> listesine eklenecek, o numara için SMS üretilmeyecek, yazılı kod kabul
> edilecekti. Gerekçesi "incelemeci gerçek bir hattı olmadan girebilsin"di.
>
> **Bu, 5.6'nın ta kendisidir:** incelemecinin, kullanıcının sahip olmadığı
> bir kapıdan girmesi. Bir 5.6 reddinden sonra aynı deseni ikinci kez
> göndermek, reddin gerekçesini kabul etmemek olurdu. Numara `config.toml`dan
> silindi; **canlı projede de Auth → Providers → Phone → Test OTP listesi elle
> boşaltılmalıdır** (bu dosya yalnız `supabase config push` ile uygulanır).

**24 Ağustos 2026'da DEĞİŞTİ.** Önceki sürüm "hesap vermiyoruz, kendi Apple
ID'nizle girin" diyordu. Apple buna rağmen Sign-In Information formunu doldurmamızı
istedi — ve haklı: sağlayıcı girişiyle giren incelemeci, bizim hazırladığımız bir
hesaba değil BOMBOŞ yeni bir hesaba düşer; kaleci, hakem ve tesis panellerini hiç
göremez, yani uygulamanın büyük kısmını inceleyemez.

**Ayrım şudur ve önemlidir:** 5.6'nın yasakladığı şey, incelemecinin diğer
kullanıcılarda olmayan bir yola ya da yetkiye sahip olmasıdır. Aşağıdaki hesaplar
öyle değildir — herkesin kullandığı aynı e-posta+şifre ekranından girerler, aynı
yetkileri taşırlar, aynı veriyi görürler. Verdiğimiz şey ayrıcalıklı bir kapı
değil, sıradan hesapların şifresidir.

| Alan | Değer |
| --- | --- |
| Sign-In required | Yes |
| User Name | `oyuncu@oyna.app` |
| Password | `Oyna!Saha2026` |

**Notes alanına eklenecek diğer roller** (aynı şifre — hepsi sıradan hesap):

| Rol | E-posta | Girişte açılan ekran |
| --- | --- | --- |
| Oyuncu | `oyuncu@oyna.app` | Ana sayfa |
| Kaleci | `kaleci@oyna.app` | Kaleci paneli |
| Hakem | `hakem@oyna.app` | Hakem paneli |
| Tesis sahibi | `saha1@oyna.app` | İşletme paneli (2 saha) |

**App Store Connect → App Review Information → Notes alanına yapıştırılacak
metin (İngilizce, hazır):**

Hi Review Team! 👋

OYNA helps amateur football players in Türkiye discover matches, book physical pitches, and find teammates.

🔑 TEST ACCOUNTS (Password for all: Oyna!Saha2026)
- Player: oyuncu@oyna.app
- Goalkeeper: kaleci@oyna.app
- Referee: hakem@oyna.app
- Venue Owner: saha1@oyna.app

🔄 MULTIPLE ROLES & QUICK ROLE EXPLORATION:
- OYNA features 4 distinct role interfaces: Player, Goalkeeper, Referee, and Venue Owner.
- You can either log into each role using the test accounts above, OR simply tap any role card under the public "Rolleri Keşfet" (Explore Roles) section on the sign-in screen, OR switch/explore roles anytime from the in-app Role Switcher (Settings ➔ Sahada Rolün ➔ Tüm Rolleri & Arayüzleri İncele).

📍 TIP TO VIEW ACTIVE CONTENT:
- Active verified pitches and matches are located in "Ordu · Altınordu".
- On the home screen (Dashboard), tap "BÖLGE DEĞİŞTİR" or "KONUMU AYARLA" (or go to Settings ➔ "Bölgelerim"), and make sure "Ordu · Altınordu" is selected to instantly view available pitches, courts, and matches.

💳 PAYMENTS (Guideline 3.1.3(e) — Goods and Services Outside of the App):
- All transactions in OYNA are exclusively for real-world, physical sports services: renting physical amateur football pitches, reserving slots, and paying match participation deposits.
- In compliance with App Store Review Guideline 3.1.3(e), payments for real-world physical services are processed via credit card through our licensed payment gateway (iyzico) or paid directly in cash at the sports facility. 
- The app does not offer or sell any digital goods, virtual currency, or in-app subscriptions.
- Review Testing: If testing payments, the booking flow supports in-app test card processing with an on-screen test notice and one-click test card filler (Test card: 5528 7900 0000 0008 · 12/30 · 123); no real financial charges occur during review testing.

🗑️ ACCOUNT DELETION (Guideline 5.1.1(v)):
Users can permanently delete their account anytime directly within the app from: Settings (Ayarlar) ➔ under "Hesap" section ➔ tap "Hesabı Kalıcı Olarak Sil".

Thank you for your time and review! If you need anything else, feel free to reach us at mirackeremcuruksulu@gmail.com.
```

> **Kurucu notu:** Onay kutusu (KVKK / Kullanım Şartları) işaretlenmeden
> hiçbir giriş yolu ilerlemez; kutusuz dokunuşta ekran ne yapılacağını söyler.
>
> Yukarıdaki İngilizce metin **yapıştırmaya hazırdır** — düzenlemeden olduğu
> gibi kullan. Ödeme bölümü **Apple Guideline 3.1.3(e)** ve canlı ödeme mimarisine
> (Iyzico kart altyapısı + tesiste nakit) göre tam uyumlu hale getirildi.
> 
> **5.6 kuralının özü:** İncelemeciye sunulan not ile uygulamanın gerçek davranışı
> birebir aynı olmalıdır. Uygulama kartla ödeme alırken "IBAN ile ödeniyor" demek
> veya gerçeği gizlemek 5.6 ihlalidir; oysa fiziksel saha kiralaması için kredi
> kartı kullanımı 3.1.3(e) altında Apple tarafından zaten açıkça onaylanan ve
> IAP gerektirmeyen meşru yöntemdir. `npm run magaza:denetim` bu uyumu mekanik
> olarak denetler.

---

## 2. Uygulama-içi Ödeme ve IAP Muafiyeti (kritik)

OYNA **fiziksel bir hizmet** satar: gerçek dünyadaki bir futbol sahasının
belirli gün/saatte kullanılması ve o maça katılım bedelinin tahsili.
Uygulama-içi dijital içerik/abonelik SATMAZ. (Saha türü kısıtı yoktur —
kapalı, açık, sentetik ya da çim; OYNA bir futbol organizasyonu uygulamasıdır.)

- **Apple:** App Store Review Guideline **3.1.3(e)** ("Goods and Services
  Outside of the App") kapsamında, fiziksel hizmet/gerçek dünya
  deneyimi bedelinin uygulama dışı ödeme yöntemleriyle (kredi kartı) tahsili
  serbesttir; **IAP zorunlu değildir.** Saha kullanımı / maça katılım bedeli,
  Uber ve rezervasyon uygulamalarındaki fiziksel hizmet ödemesiyle aynı
  kategoridedir.
- **Google Play:** Play Payments politikası, fiziksel hizmet/gerçek dünya
  işlemlerini Play Billing zorunluluğundan muaf tutar; ödeme lisanslı ödeme
  kuruluşu **iyzico** üzerinden alınır.

Ödeme altyapısı (sağlayıcı canlıya alındığında): kart verisi OYNA
sunucularında **saklanmaz**; yalnız iyzico'ya iletilir (PCI-DSS: saklama yok,
geçiş var) ve 3DS banka doğrulaması uygulama içinde tamamlanır.

> **Kurucu notu · ödeme altyapısı ve 3.1.3(e) (18 Eylül 2026).** Ödeme altyapısı
> lisanslı kuruluş **iyzico** ile tek tıkla kart ödemesi ve 3DS doğrulaması
> mimarisindedir. Sistem `resolve_payment_mode` üzerinden küresel olarak
> yönetilir; kullanıcıya, role ya da incelemeciye göre ayrışmaz — 5.6
> açısından kritik olan herkesin aynı kod yolunu görmesidir. İnceleme sürecinde
> test kartları veya simülasyon modu ile işlem yapılabilir; her iki durumda da
> fiziksel saha rezervasyonu Guideline 3.1.3(e) kapsamında dürüstçe beyan edilmiştir.

---

## 3. Konum ve Bildirim İzinleri

- **Konum:** Yalnız uygulama kullanılırken, yakındaki sahaları göstermek için
  istenir. Reddedilse de uygulamanın geri kalanı çalışır (konum-temelli
  sıralama devre dışı kalır).
- **Bildirim (push):** Rezervasyon/maç durum bildirimleri için. iOS entitlement
  `aps-environment=production`. Reddedilebilir; zorunlu değildir.

---

## 4. Yaş Sınırı (Age Rating) ve Guideline 2.3.6 Uyumu

- **App Store Connect → General → App Information → Age Rating:**
  - **In-App Controls → Parental Controls:** **`None`** (Hayır / Yok) olarak seçilmelidir.
  - **Age Assurance:** **`None`** olarak seçilmelidir.
  - Uygulama içinde ebeveyn kontrolü veya yaş doğrulama bariyeri bulunmadığından bu seçeneklerin işaretlenmesi **Guideline 2.3.6 (Accurate Metadata)** reddine yol açar.
- Uygulama içi kurulum (onboarding) ve profil düzenleme ekranlarında kullanıcılardan **yaş (doğum tarihi)** veya **cinsiyet** bilgisi **istenmez** (**Guideline 5.1.1(v)** veri minimizasyonu uyumu).

---

## 5. Boş Şehir Davranışı (incelemeci farklı şehirdeyse)

İlk lansman **Ordu** yoğunluklu olduğundan, incelemeci başka bir bölgedeyse
saha listesi boş görünebilir. Bu bir hata değildir: uygulama boş bölgede
"Bölgende henüz saha yok — beni haberdar et / saha öner" akışını gösterir.
Sahaları görmek için arama/harita ile **Ordu**'ya bakılabilir.

---

## 6. Hesap Silme

Uygulama içi **Ayarlar → Hesabı Sil** ile hesap ve veriler kalıcı olarak
silinebilir (`request_account_deletion`). Ayrıca genel bilgilendirme:
`⟨https://oyna.app/hesap-silme.html⟩` (public URL — kurucu yayınlar).

---

## 7. Yasal / Gizlilik URL'leri

- Gizlilik Politikası: `⟨https://oyna.app/gizlilik.html⟩`
- Çerez Politikası: `⟨https://oyna.app/cerez-politikasi.html⟩`
- Hesap Silme: `⟨https://oyna.app/hesap-silme.html⟩`

> Bu HTML dosyaları repo'da `public/` altında hazırdır; kurucu bunları canlı
> public URL'de yayınlamalı (her iki mağaza konsolu da erişilebilir URL ister).

---

## 8. App Store Connect — Son Ret (Submission ID: 7b40836b-99cd-4519-8c1b-7484bfe3470e) Yanıt Metni

App Store Connect'te **Age Rating → Parental Controls = "None"** olarak güncelledikten ve yeni derlemeyi ekledikten sonra **Resolution Center / App Review yanıt kutusuna** aşağıdaki metni doğrudan yapıştırabilirsiniz:

```text
Hello App Review Team,

Thank you for your detailed feedback. We have resolved all four issues in this new build and updated our App Store Connect metadata:

1. Guideline 5.1.1(iv) - Location Pre-Permission Button Wording:
- We replaced the "Konumu Aç" ("Turn On Location") button on the location pre-permission screen (and all other pre-permission modals) with a neutral "Devam Et" ("Continue") button.
- Users can freely proceed whether they grant or decline location access.

2. Guideline 4 - Sign in with Apple:
- We updated our Sign in with Apple implementation to automatically capture and persist the user's `givenName`, `familyName`, and `email` directly from the `ASAuthorizationAppleIDCredential` response (`SignInWithApple.authorize`).
- We removed the name/surname input fields from the post-login onboarding flow so users authenticating via Sign in with Apple are never asked to re-enter their name or email address.

3. Guideline 5.1.1(v) - Data Minimization (Age & Gender):
- We completely removed the Age (`StepAge` / Birthdate) and Gender fields from the onboarding flow as well as the profile editing screens. Users are never required or prompted to provide their age or gender.

4. Guideline 2.3.6 - Accurate Metadata (Age Rating / Parental Controls):
- We updated our Age Rating selections in App Store Connect under App Information and set "Parental Controls" (In-App Controls) to "None".

Thank you again for your guidance and review!
```

