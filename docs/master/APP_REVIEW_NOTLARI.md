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

### Engeldi: telefon adımı atlanamıyordu

OYNA'da ana giriş yolu telefon + SMS kodudur ve **SMS yalnız +90 numaralara
gider.** Google/Apple ile giren kullanıcıdan da numara isteniyordu ve o ekran
**atlanamıyordu.** Sonuç: yurt dışındaki hiç kimse — mağaza incelemecisi dahil
— uygulamayı açamıyordu.

### Çözüm: numara adımı artık atlanabilir (herkes için)

- Girişten sonra gelen "Numaranı ekle" ekranında **ŞİMDİLİK ATLA** vardır.
  Atlayan kullanıcı uygulamayı gezer; bir daha açılışta zorlanmaz.
- Numara, **gerçekten gerektiği anda** istenir: yer ayırtma / ödeme. Gerekçe
  orada somuttur (maç günü tesis ve kaptan bu numaradan ulaşır) ve o ekran da
  **VAZGEÇ** ile kapanır — kullanıcı hiçbir yerde kilitlenmez.
- Kod: `App.tsx · numaraGerekli`, `shared/numaraKapisi.ts`,
  `views/PhoneLinkScreen.tsx`, `views/PaymentScreen.tsx · handlePay`.
  Kilitler: `tests/unit/telefonGirisi.test.ts`,
  `tests/unit/magazaKapilari.test.ts`.

### İncelemeciye verilecek hesap: SUNUCUDA tanımlı test numarası

Ödeme dahil TÜM akışı denemek için incelemeciye bir hesap gerekir. Bu hesap,
Apple'ın kendi istediği **App Review Information → Sign-In Information**
alanından verilir — yani gizli değil, beyan edilmiş bir test kimliğidir.

Uygulamada özel kod YOKTUR. Supabase Auth'ta bir **test telefon numarası**
tanımlıdır: o numara için SMS gönderilmez, sabit kod kabul edilir. İncelemeci
normal giriş ekranını, normal akışı kullanır.

| Alan | Değer |
| --- | --- |
| Sign-In required | Yes |
| User Name | `+90 500 000 00 02` |
| Password | `⟨Supabase panelinde tanımlanan 6 haneli sabit kod⟩` |

**Kurucunun yapması gereken (bir kez):** Supabase → Authentication →
Sign In / Providers → Phone → **Test OTP** bölümüne `+905000000002` numarası
ve 6 haneli sabit bir kod eklenir. Bu numara `oyuncu01@oyna.app` (Emre Kaya,
PLAYER) hesabına bağlıdır ve doğrulanmıştır.

**App Store Connect → App Review Information → Notes alanına yapıştırılacak
metin (İngilizce, hazır):**

```
SIGN-IN
OYNA signs in with a phone number and a 6-digit SMS code. Our SMS provider
delivers to Turkish (+90) numbers only, so we registered a test number for
you. It works on the normal sign-in screen — there is no special build,
no hidden entrance, and no review-only code path in this app.

  Phone number : +90 500 000 00 02
  Code         : ⟨6-digit code⟩

Steps: tick the consent checkbox, type the number above, tap "KOD GÖNDER",
then enter the code above. You can also sign in with Apple; the phone step
that follows is optional ("ŞİMDİLİK ATLA" = skip for now), and we ask for a
number only when you reserve a spot, because the venue and the team captain
call that number on match day.

PAYMENTS
Card payments are still in simulation mode for every user, everywhere —
we have not signed the payment-provider contract yet. No real money moves
and no real card is charged. The payment screen accepts any test card
(e.g. 5528 7900 0000 0008, 12/30, CVV 123). This is a global server
setting, identical for reviewers and users.

WHAT OYNA DOES
OYNA organises football matches on real pitches: you join an open match,
reserve your spot, and meet at the venue. Nothing digital is sold in the
app, so purchases are handled outside IAP (Guideline 3.1.5(a)).

DATA
The accounts and matches you will see are seeded demo data — no real
people, no real money.
```

> **Kurucu notu:** Onay kutusu (KVKK / Kullanım Şartları) işaretlenmeden
> hiçbir giriş yolu ilerlemez; kutusuz dokunuşta ekran ne yapılacağını söyler.
> Demo veri seti üretim Supabase'inde gerçek kayıt olarak durur ve genel
> yayına çıkarken `demo_clean_start_purge.sql` ile topluca silinir.

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
