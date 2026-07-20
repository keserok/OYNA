# OYNA — Mağaza İnceleme (App Review) Notları

> **Amaç:** Apple App Review + Google Play incelemecisinin uygulamayı sorunsuz
> test edebilmesi ve ödeme/IAP muafiyetini doğru değerlendirmesi için gerekli
> bilgiler. Bu metin, mağaza konsolundaki "App Review Information / Notes for
> reviewer" alanına (gerektiğinde uyarlanarak) yapıştırılmak üzere hazırlandı.
> **Kurucu tarafından doldurulması gereken alanlar `⟨…⟩` ile işaretlidir.**

---

## 1. İnceleme Hesabı (reviewer login)

Uygulama **e-posta + şifre** ile girişi destekler (kayıt-öncelikli akış; mevcut
hesap için OTP/e-posta doğrulaması gerekmez). İncelemeci için önceden
oluşturulmuş, e-postası onaylanmış bir **oyuncu** hesabı verilmelidir:

- E-posta: `⟨review@oyna.app⟩`
- Şifre: `⟨sabit-güçlü-şifre⟩`

> **Kurucu notu:** Bu hesabı Supabase Auth'ta oluştur, `email_confirmed_at`
> dolu olsun (Auth panelinden "Confirm email"). İstersen içine birkaç örnek
> rezervasyon/maç ekleyerek incelemeciye zengin bir deneyim sun. `@oyna.app`
> uzantısı şart değildir; herhangi bir gerçek e-posta olur.
>
> **Önemli:** Üretimde demo-giriş (şifresiz "demo hesabıyla gir") **kapalıdır**
> (`isDemoLoginEnabled` yalnız `VITE_DEV_MODE=true`, `?demo=1` veya localhost'ta
> açılır). Bu yüzden incelemeci için gerçek bir e-posta+şifre hesabı zorunludur;
> demo akışına güvenme.

Girişte KVKK/üyelik sözleşmesi onay kutusu işaretlenmelidir (giriş ekranında
görünür).

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
