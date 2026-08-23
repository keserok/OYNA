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

İncelemeci **kendi Apple ID'siyle** girer ve gerçek bir kullanıcının gördüğünün
aynısını görür. İddiamız zaten budur; verilecek her özel hesap onu zayıflatır.

| Alan | Değer |
| --- | --- |
| Sign-In required | Yes |
| User Name | `Sign in with Apple — use your own Apple ID` |
| Password | *(boş bırak)* |

**App Store Connect → App Review Information → Notes alanına yapıştırılacak
metin (İngilizce, hazır):**

```
ABOUT THIS SUBMISSION

This build addresses your Guideline 5.6 rejection. You were right: our
previous submission was compiled with a review-only flag that added a
"demo account" button and an "APP REVIEW" banner which no downloaded copy
of the app contained. That machinery is gone.

We went further and audited the backend as well. We found and removed a
server-side rule that returned different marketplace results depending on
which account was calling it. There is now no review-only build, no review
flag, no test phone number and no review-only server path anywhere in this
product. You and any user receive identical code and identical data.

SIGNING IN
The app signs in with Sign in with Apple or Google only. Please use your
own Apple ID — you get exactly the same account type, the same permissions
and the same data any user gets. We are deliberately not providing a
special reviewer account: a reviewer-only account is what caused the 5.6
finding, and our claim is precisely that no such path exists. No phone
number is requested at any point.

WHAT YOU WILL SEE — PLEASE READ
OYNA is launching in a single city: Ordu, Türkiye, and it is launching
now. Most of the pitches, matches and players currently in the app are
SAMPLE CONTENT that we seeded so the product is not an empty shell on day
one. This is stated inside the app itself, to every user, on the home
screen: "Ordu'da yeni açılıyoruz. Şu anda gördüğün sahalar, maçlar ve
oyuncular örnek içeriktir." The venue names are invented; they do not
refer to real businesses. As real venues sign up, the sample content is
removed and that notice disappears.

We want to be explicit about this because it is the same information a
user gets. It is not a reviewer-only disclosure.

SEEING CONTENT
Content is region-based, so the app looks empty from any location outside
Ordu — for you and for any user alike. On first launch, tap "KONUMU
AYARLA" (Set location) on the home screen and pick Ordu / Altınordu.
Covered regions are pinned to the top of that list. Matches and pitches
will then load.

PAYMENTS — CURRENTLY DISABLED FOR EVERYONE
We have not completed our payment provider onboarding yet, so online
payment is switched OFF platform-wide. The app never asks for card
details in this build: every booking resolves to "pay at the venue" and
the app tells the user why ("Ödeme altyapısı henüz canlıya alınmadı").
No money moves, no card data is collected, and there is no path in this
build that could take a payment.

When payments go live in a later version they will be for physical,
real-world services only: a deposit for renting a football pitch and a
share of a match fee. There is no digital content, no subscription and no
unlockable feature, so In-App Purchase does not apply (Guideline
3.1.5(a)).

ACCOUNT DELETION
Settings → Account → "Hesabı Sil" (Delete account), per Guideline
5.1.1(v).

Thank you for the review — the 5.6 finding was correct, and we fixed the
cause rather than the symptom.
```

> **Kurucu notu:** Onay kutusu (KVKK / Kullanım Şartları) işaretlenmeden
> hiçbir giriş yolu ilerlemez; kutusuz dokunuşta ekran ne yapılacağını söyler.
>
> Yukarıdaki İngilizce metin **yapıştırmaya hazırdır** — düzenlemeden olduğu
> gibi kullan. Ödeme bölümü 23 Ağustos 2026'da canlı duruma göre yeniden
> yazıldı ve canlıda doğrulandı: `payment_mode_global = CASH_ONLY`,
> `simulation_counts_as_live = false`, `match_deposit_enabled = false`,
> etkin mod `CASH_ONLY` / sebep `PROVIDER_NOT_LIVE`. Bu anahtarlardan biri
> değişirse metin de gözden geçirilmelidir.

---

## 2. Uygulama-içi Ödeme ve IAP Muafiyeti (kritik)

OYNA **fiziksel bir hizmet** satar: gerçek dünyadaki bir futbol sahasının
belirli gün/saatte kullanılması ve o maça katılım bedelinin tahsili.
Uygulama-içi dijital içerik/abonelik SATMAZ. (Saha türü kısıtı yoktur —
kapalı, açık, sentetik ya da çim; OYNA bir futbol organizasyonu uygulamasıdır.)

- **Apple:** App Store Review Guideline **3.1.5(a)** ("Goods and Services
  Outside of the App") ve **3.1.3(e)** kapsamında, fiziksel hizmet/gerçek dünya
  deneyimi bedelinin uygulama dışı ödeme yöntemleriyle (kredi kartı) tahsili
  serbesttir; **IAP zorunlu değildir.** Saha kullanımı / maça katılım bedeli,
  Uber ve rezervasyon uygulamalarındaki fiziksel hizmet ödemesiyle aynı
  kategoridedir.
- **Google Play:** Play Payments politikası, fiziksel hizmet/gerçek dünya
  işlemlerini Play Billing zorunluluğundan muaf tutar; ödeme lisanslı ödeme
  kuruluşu **iyzico** üzerinden alınır.

Ödeme altyapısı: kart verisi OYNA sunucularında **saklanmaz**; yalnız iyzico'ya
iletilir (PCI-DSS: saklama yok, geçiş var). 3DS banka doğrulaması uygulama
içinde tamamlanır.

> **Kurucu notu · ödeme modu HERKES İÇİN AYNI (22 Ağu 2026).** Bugün canlı
> ayar `payment_provider = SIMULATION` + `simulation_counts_as_live = true` +
> `payment_mode_global = ONLINE_ONLY`. Bu **global** bir sunucu ayarıdır
> (`resolve_payment_mode`); kullanıcıya, role ya da incelemeciye göre
> DEĞİŞMEZ — 5.6 açısından kritik olan budur. Gerçek para hareketi yoktur ve
> bu durum inceleme notunda açıkça yazılır. Canlı ödemeye geçiş
> `payment_provider = IYZICO` + canlı anahtarlarla olur (sözleşme sonrası) ve
> yine herkes için aynı anda açılır.

---

## 3. Konum ve Bildirim İzinleri

- **Konum:** Yalnız uygulama kullanılırken, yakındaki sahaları göstermek için
  istenir. Reddedilse de uygulamanın geri kalanı çalışır (konum-temelli
  sıralama devre dışı kalır).
- **Bildirim (push):** Rezervasyon/maç durum bildirimleri için. iOS entitlement
  `aps-environment=production`. Reddedilebilir; zorunlu değildir.

---

## 4. Yaş Sınırı ve Reşit Olmayan Kullanıcılar

Asgari yaş 13. 18 yaş altı hesaplar "sınırlı mod"da açılır: ödeme gerektiren
işlemler veli onayı tamamlanana kadar kapalıdır (Kullanım Şartları m.4).
İncelemeci yetişkin hesabıyla test etmelidir.

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
