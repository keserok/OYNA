# OYNA — Mağaza İnceleme (App Review) Notları

> **Amaç:** Apple App Review + Google Play incelemecisinin uygulamayı sorunsuz
> test edebilmesi ve ödeme/IAP muafiyetini doğru değerlendirmesi için gerekli
> bilgiler. Bu metin, mağaza konsolundaki "App Review Information / Notes for
> reviewer" alanına (gerektiğinde uyarlanarak) yapıştırılmak üzere hazırlandı.
> **Kurucu tarafından doldurulması gereken alanlar `⟨…⟩` ile işaretlidir.**

---

## 1. İnceleme Girişi — uygulama içi DEMO SEÇİCİ (güncel yol)

> **GÜNCELLENDİ (20 Ağu 2026).** E-posta + şifre girişi 17 Ağustos kurucu
> kararıyla KALDIRILDI; tek yol telefon + OTP (ve Google/Apple). Telefon
> sağlayıcısı inceleme döneminde kapalı ve incelemecinin Türk numarası yok —
> bu yüzden inceleme, 19 Ağustos kurucu kararıyla **uygulama içi demo hesap
> seçicisi** üzerinden yapılır. Ayrı bir kullanıcı adı/şifre VERMEYE GEREK YOK.

**Gönderilecek paket:** `npm run sync:ios:inceleme` (Android:
`sync:android:inceleme`). Bu komut paketi `VITE_MAGAZA_INCELEME=true` ile
derler; giriş ekranına iki şey eklenir (normal yayın derlemesinde ikisi de
yoktur):

1. **İki dilli yönerge kutusu** ("APP REVIEW · İNCELEME"): kodların yalnız
   Türk numaralarına gittiğini ve demo düğmesinin kullanılacağını söyler.
2. **"DEMO HESABIYLA GİR" düğmesi** (ekranın altında): dokununca 29 demo
   hesap rol gruplarıyla listelenir — 20 oyuncu, 4 saha sahibi, 3 kaleci,
   2 hakem. Bir hesaba dokunmak şifresiz/tek dokunuş giriş yapar; bölge
   otomatik Ordu/Altınordu kurulur, ekranlar dolu gelir.
   İncelemeci numara yazıp KOD GÖNDER'e basarsa da çıkmazda kalmaz:
   iki dilli mesajla demo seçiciye yönlendirilir ve liste kendiliğinden açılır.

**App Store Connect → App Review Information alanına yapıştırılacak metin
(İngilizce, hazır):**

```
Sign-in for review: OYNA uses phone-number OTP sign-in, and SMS codes are
delivered to Turkish numbers only. For your convenience this build includes
an in-app review entrance — no separate credentials needed:

1. On the sign-in screen, tick the consent checkbox (KVKK / Terms).
2. Tap the green "DEMO HESABIYLA GİR" (Sign in with a demo account) button
   at the bottom of the screen.
3. Pick any account — one tap signs you in. The list covers all four roles:
   PLAYER (Oyuncular), FACILITY OWNER (Saha Sahipleri), GOALKEEPER
   (Kaleciler) and REFEREE (Hakemler). To tour the owner dashboard use
   "Ahmet Kuru"; for a player use "Emre Kaya".

These demo accounts live in a seeded demo ecosystem (matches, venues,
wallet history) so every screen shows realistic data. They contain no real
user data and no real money.
```

> **Kurucu notu:** Onay kutusu işaretlenmeden hiçbir giriş yolu ilerlemez
> (kutusuz dokunuşta ekran ne yapılacağını söyler). Demo hesap listesinin tek
> kaynağı `docs/OYNA_DEMO_HESAPLARI.md`; hesaplar üretim Supabase'inde gerçek
> kayıt olarak durur ve inceleme sonrası `demo_clean_start_purge.sql` ile
> topluca silinir. Genel yayına giderken paketi `VITE_MAGAZA_INCELEME`
> OLMADAN yeniden derle (`npm run sync:ios`) — seçici ve yönerge o pakette
> hiç yoktur.

---

## 2. Uygulama-içi Ödeme ve IAP Muafiyeti (kritik)

OYNA **fiziksel bir hizmet** satar: gerçek dünyadaki bir halı sahanın belirli
gün/saatte kiralanması ve bu kiralamaya ait kapora tahsilatı. Uygulama-içi
dijital içerik/abonelik SATMAZ.

- **Apple:** App Store Review Guideline **3.1.5(a)** ("Goods and Services
  Outside of the App") ve **3.1.3(e)** kapsamında, fiziksel hizmet/gerçek dünya
  deneyimi bedelinin uygulama dışı ödeme yöntemleriyle (kredi kartı) tahsili
  serbesttir; **IAP zorunlu değildir.** Halı saha kiralama, Uber/rezervasyon
  uygulamalarındaki fiziksel hizmet ödemesiyle aynı kategoridedir.
- **Google Play:** Play Payments politikası, fiziksel hizmet/gerçek dünya
  işlemlerini Play Billing zorunluluğundan muaf tutar; ödeme lisanslı ödeme
  kuruluşu **iyzico** üzerinden alınır.

Ödeme altyapısı: kart verisi OYNA sunucularında **saklanmaz**; yalnız iyzico'ya
iletilir (PCI-DSS: saklama yok, geçiş var). 3DS banka doğrulaması uygulama
içinde tamamlanır.

> **Kurucu notu:** İncelemeci gerçek ödeme denemesin istiyorsan, ya iyzico
> sandbox test kartı ver (`⟨sandbox kart no / SKT / CVV⟩`) ya da inceleme
> hesabında ödeme adımını kapora=0 bir örnek üzerinden gösterilecek şekilde
> ayarla. Canlı ödeme için `PAYMENT_PROVIDER=IYZICO` + canlı anahtarlar
> gereklidir (sözleşme sonrası).

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
