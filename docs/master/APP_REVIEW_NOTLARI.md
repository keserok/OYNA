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
The app offers three sign-in methods on one screen, available to everyone:
email + password, Sign in with Apple, and Google. There is no phone number
step and no test phone number anywhere in the product.

The credentials in the Sign-In Information field are for accounts we
provisioned ourselves, so that all four account types can be reviewed. We
are giving you credentials rather than asking you to register because OYNA
has four account types (player, goalkeeper, referee, venue owner) and a
newly created account only ever shows the first one — you would not be able
to review three quarters of the product.

They sign in through the same email + password screen every user sees, they
carry the same permissions every user gets, and they read the same data
every user reads. Nothing in this build behaves differently because of who
is signed in. One internal detail we would rather state than have you
discover: addresses at our own @oyna.app domain are tagged in our database
as sample data, so activity on them is excluded from our business metrics.
That tag changes no screen, no permission and no content — it only keeps our
own reporting clean.

Additional accounts, same password (Oyna!Saha2026):
  oyuncu@oyna.app  - player, opens the player home
  kaleci@oyna.app  - goalkeeper, opens the goalkeeper panel
  hakem@oyna.app   - referee, opens the referee panel
  saha1@oyna.app   - venue owner, opens the business panel (2 venues)

You may also register a new account with any email address; it will open as
a player account, which is what every new user gets. Goalkeeper and referee
roles are requested from Settings and granted by us after review; venue
owner, manager and staff roles are assigned by us only and cannot be
self-granted from the app.

WHAT YOU WILL SEE — PLEASE READ
OYNA is launching now, and its first covered area is Ordu, Türkiye.
Most of the pitches, matches and players currently in the app are
SAMPLE CONTENT that we seeded so the product is not an empty shell on day
one. This is stated inside the app itself, to every user, on the home
screen and again on both discovery lists: "Türkiye'de yeni başlıyoruz. Şu
anda gördüğün sahalar, maçlar ve oyuncular örnek içeriktir." The venue
names are invented; they do not refer to real businesses. As real venues
sign up, the sample content is removed and that notice disappears.

We want to be explicit about this because it is the same information a
user gets. It is not a reviewer-only disclosure.

SEEING CONTENT
Content is region-based, so the app looks empty from any location outside
Ordu — for you and for any user alike. On first launch, tap "KONUMU
AYARLA" (Set location) on the home screen and pick Ordu / Altınordu.
Covered regions are pinned to the top of that list. Matches and pitches
will then load.

PAYMENTS & SERVICES
OYNA is a sports matchmaking and football pitch reservation platform for physical real-world services.
  - Payment Options: Users pay either via direct Bank Transfer (EFT/FAST) to the venue's official IBAN account or in-person at the venue (Cash/POS upon arrival).
  - No In-App Digital Purchases: No digital goods, tokens, or subscriptions are sold. In-App Purchase is not applicable per Guideline 3.1.3(e).
  - No Credit Card Harvesting: The app does not collect credit card credentials inside the app.

The booking process provides users with the venue's official IBAN and a unique Reference Code (e.g. OYN-84920) to include in their transfer description, or allows them to confirm a cash-on-site booking.

WHAT THE NEXT VERSION CHANGES
- The venues, matches and players currently shown in the app are sample content for launch demonstration, explicitly disclosed on screen to every user.
- As live venues complete onboarding, contracted inventory replaces sample data automatically.

ACCOUNT DELETION
Settings → Account → "Hesabı Sil" (Delete account), per Guideline 5.1.1(v).

Thank you for the review — all review flags and card input forms have been removed from the product.
```

> **Kurucu notu:** Onay kutusu (KVKK / Kullanım Şartları) işaretlenmeden
> hiçbir giriş yolu ilerlemez; kutusuz dokunuşta ekran ne yapılacağını söyler.
>
> Yukarıdaki İngilizce metin **yapıştırmaya hazırdır** — düzenlemeden olduğu
> gibi kullan. Ödeme bölümü **24 Ağustos 2026'da** canlı duruma göre yeniden
> yazıldı ve canlıda doğrulandı: `payment_mode_global = ONLINE_ONLY`,
> `payment_provider = SIMULATION`, `simulation_counts_as_live = true`,
> `match_deposit_enabled = true`; `resolve_payment_mode(NULL)` →
> `online_allowed = true`, `simulation = true`.
>
> **Bu dört anahtardan biri değişirse metin YALAN olur.** 23 Ağustos'ta
> bölüm "ödeme herkes için kapalı, kart bilgisi hiç istenmiyor" diyordu;
> 24 Ağustos'ta demo ödeme açıldı ve metin bir gün boyunca gerçeği
> anlatmadı. `npm run magaza:denetim` artık bu dört anahtarı canlıdan okuyup
> metinle karşılaştırıyor — gönderim öncesi mutlaka çalıştır.

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

> **BUGÜN GEÇERLİ DEĞİL.** `payment_provider = SIMULATION` olduğu sürece
> iyzico devrede değildir, 3DS akışı çalışmaz ve hiçbir tahsilat yapılmaz.
> Ekran bunu kullanıcıya kırmızı uyarıyla söyler. Yukarıdaki cümle
> `payment_provider = IYZICO` yapıldığı gün yürürlüğe girer.

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
