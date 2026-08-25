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

PAYMENTS — RUNNING IN SIMULATION, AND THE APP SAYS SO ON SCREEN
Our payment provider onboarding is not finished yet. Rather than hide the
payment flow, we run it in SIMULATION mode so the product can be reviewed
end to end. Please read this carefully, because the screens do collect a
card number:

  - Online payment is ENABLED platform-wide. The booking flow opens a card
    form and asks for a card number, expiry and CVV.
  - NO money is captured. No charge reaches any card, no funds reach any
    venue, and no card data is passed to a payment processor.
  - The app states this to the user, in red, directly above the card
    selector and again on the receipt: "Bu bir TEST ödemesidir — kartından
    para çekilmez ve tesise ödeme geçmez." ("This is a TEST payment — no
    money is taken from your card and none reaches the venue.")
  - Please do not enter a personal card. Use this test number, which the
    simulation accepts:
        5528 7900 0000 0008   expiry 12/30   CVV 123   any name

This is one global server setting (resolve_payment_mode). It does not vary
by user, by role, or by who is signed in — the same simulation and the same
red warning are shown to every person using the app today. When our
provider goes live we flip that one setting and the warning disappears by
itself, for everyone at once.

Payments, once live, are for physical, real-world services only: a deposit
for renting a football pitch and a share of a match fee, both consumed
outside the app. There is no digital content, no subscription and no
unlockable feature, so In-App Purchase does not apply (Guideline 3.1.3(e)).

WHAT THE NEXT VERSION CHANGES
Two things about this version are temporary, and we would rather name them
than have you find them:

  - The venues, matches and players you see are sample content. The app
    says so to every user, on the home screen and on both discovery lists.
  - Payments run in simulation, with a red warning on every payment screen.

Neither is a product decision; both are launch-stage states. The next
version ships with contracted venues and live payments. When that happens,
the sample-content notice and the simulation warning each disappear on
their own, for everyone at once — both are driven by a single server
setting, not by anything in the app binary, so no new build is required to
turn them off.

We are submitting now rather than waiting because the product itself is
complete: every screen, every one of the four account types and every flow
can be reviewed today. What is not yet real is the inventory, and the app
discloses that to users rather than to reviewers only.

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
