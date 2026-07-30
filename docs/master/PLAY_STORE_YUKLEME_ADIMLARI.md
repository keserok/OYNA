# OYNA — Google Play Store'a Yükleme: Adım Adım

**Tarih:** 30 Temmuz 2026
**Tek hedef:** Uygulamayı Google Play Store'a eksiksiz yüklemek.
**Bu belge kimin için:** Kurucu. Terminal komutu yok, kod yok. Sadece tıklama.

---

## ŞU AN NEREDEYİZ

✅ **AAB üretim hattı çalışıyor ve KANITLANDI.** 30 Temmuz 19:29'da ilk gerçek
derleme başarıyla tamamlandı (8 dakika). 19 adımın tamamı yeşil.

| Ne | Sonuç |
|---|---|
| Tip kontrolü | ✅ geçti |
| 1283 birim testi | ✅ geçti |
| Web derlemesi | ✅ geçti |
| Capacitor senkronu | ✅ 13 eklenti |
| **Android paketi (AAB)** | ✅ **üretildi** — 8,98 MB |
| **API 36 yükseltmesi** | ✅ **derleniyor** — doğrulandı |

⚠️ **Ama bu paket İMZASIZ.** Play Console imzasız paketi kabul etmez.
Sebep: imzalama anahtarı GitHub'a kaydedilmemiş. Bu, ADIM 1'de çözülüyor.

---

## ADIM 1 — İmzalı AAB'yi al (15 dakika)

### 1.1 · Anahtarı GitHub'a kaydet (bir kez yapılır)

Sana gönderdiğim 3 dosyayı aç. Sonra:

**GitHub → `keserok/OYNA` deposu → üstten `Settings` → sol menüde
`Secrets and variables` → `Actions` → yeşil `New repository secret` düğmesi.**

Şu 4 kaydı **tek tek** ekle (her biri için düğmeye tekrar bas):

| Name (adı birebir yaz) | Secret (değer) |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | `oyna-keystore-base64.txt` dosyasını aç, **tüm metni** kopyala-yapıştır |
| `ANDROID_KEYSTORE_PASSWORD` | `oyna-keystore-sifre.txt` içindeki şifre |
| `ANDROID_KEY_ALIAS` | `oyna-upload` |
| `ANDROID_KEY_PASSWORD` | Aynı şifre (yukarıdakiyle birebir aynı) |

> ⚠️ **Base64 dosyasını yapıştırırken:** Metin çok uzun ve tek satır. Dosyayı
> Not Defteri ile aç, `Ctrl+A` ile tümünü seç, `Ctrl+C` ile kopyala. Başında
> veya sonunda boşluk/satır atlama kalmasın.

### 1.2 · Anahtar dosyasını YEDEKLE (atlama)

`oyna-upload.keystore` dosyasını **en az iki güvenli yere** kopyala:
- Şifre yöneticine (Bitwarden, 1Password vb.)
- Harici disk veya kişisel bulut hesabın

🔐 **Bu anahtarı kaybedersen uygulamana bir daha güncelleme gönderemezsin.**
ADIM 2.3'teki "Play App Signing" bu riske karşı sigortandır — onu mutlaka yap.

### 1.3 · Paketi üret

**GitHub → depo sayfası → üstten `Actions` sekmesi → sol listeden
`Android — Google Play paketi (AAB)` → sağda `Run workflow` → yeşil
`Run workflow` düğmesi.**

~8 dakika sürer. Sayfayı yenile; yeşil tik görünce bitmiştir.

### 1.4 · İmzalı olduğunu DOĞRULA

Biten işe tıkla. Sayfanın en altında bir özet tablosu var:

| Alan | Beklenen |
|---|---|
| Sürüm adı | `3.0.0` |
| Sürüm kodu | 1003'ten büyük bir sayı |
| **İmzalı mı** | **`true`** ← bunu gör |
| Paket kimliği | `com.oyna.app` |

`İmzalı mı: false` yazıyorsa secret'lardan biri hatalı girilmiştir — 1.1'e dön.

### 1.5 · İndir

Aynı sayfada aşağıda **`Artifacts`** bölümü var. `oyna-android-3.0.0-XXXX`
kutucuğuna tıkla → bir `.zip` iner → zip'i aç → içinden `.aab` dosyası çıkar.

**Play Console'a yükleyeceğin dosya budur.**

---

## ADIM 2 — Play Console hesabı (1 gün – 2 hafta)

### 2.1 · Hesap aç

https://play.google.com/console → 25 USD tek seferlik ücret.

> ### ⚠️ EN KRİTİK KARAR: Kişisel mi, Şirket mi?
>
> | | Kişisel hesap | Şirket hesabı |
> |---|---|---|
> | Açılış | Hemen | D-U-N-S numarası gerekir (1-2 hafta) |
> | **Zorunlu kapalı test** | **12 kişi × 14 gün** | **Yok** |
> | Ödeme alan uygulama | Vergi/hukuk riski | Uygun |
>
> **Kişisel hesap seçersen lansmanın en az 2 hafta gecikir** — Google, 12 gerçek
> test kullanıcısının uygulamayı 14 gün kesintisiz kullanmasını şart koşuyor.
> Ayrıca kart tahsilatı yapan bir uygulamayı şahıs adına yayınlamak vergi
> açısından sorunludur.
>
> **Önerim: şirket hesabı.** D-U-N-S başvurusunu bugün başlat.

### 2.2 · Kimlik doğrulama

Google kimlik ve adres belgesi ister. Onay 1-3 gün sürer.

### 2.3 · Play App Signing'e kaydol (ZORUNLU DEĞİL AMA ATLAMA)

Uygulama oluştururken çıkar. Kabul et.

Ne işe yarar: Google, uygulamanın asıl imza anahtarını kendi kasasında tutar.
Senin `oyna-upload.keystore` dosyan sadece "yükleme anahtarı" olur.
**Kaybedersen Google'dan sıfırlama isteyebilirsin** — yani anahtar kaybı
uygulamanın sonu olmaz.

---

## ADIM 3 — Uygulamayı oluştur

`Tüm uygulamalar` → `Uygulama oluştur`

| Alan | Değer |
|---|---|
| Uygulama adı | `OYNA` |
| Varsayılan dil | Türkçe (tr-TR) |
| Uygulama mı, oyun mu | **Uygulama** |
| Ücretsiz mi, ücretli mi | **Ücretsiz** (indirme ücretsiz; ödeme uygulama içinde) |

---

## ADIM 4 — Zorunlu formlar

Sol menüde `Politika` ve `Uygulamanızı ayarlayın` altında. **Hepsi yeşil
olmadan yayına alamazsın.**

### 4.1 · Gizlilik politikası adresi

`Uygulama içeriği` → `Gizlilik politikası`

Adres: `https://<senin-alan-adın>/gizlilik`

> ⚠️ **Önce tarayıcıda aç ve açıldığını gör.** Google bu adresi gerçekten
> ziyaret eder; açılmazsa reddedilirsin. Alan adın yoksa Vercel'in verdiği
> `.vercel.app` adresi de kabul edilir.

### 4.2 · Veri Güvenliği formu (en uzun form)

`Uygulama içeriği` → `Veri güvenliği`

OYNA için beyan edeceklerin:

| Veri türü | Topluyor mu | Paylaşılıyor mu | Zorunlu mu | Amaç |
|---|---|---|---|---|
| Ad | Evet | Hayır | Evet | Uygulama işlevi |
| E-posta | Evet | Hayır | Evet | Uygulama işlevi, hesap yönetimi |
| Telefon | Evet | Hayır | Hayır | Uygulama işlevi |
| Yaklaşık konum | Evet | Hayır | Hayır | Uygulama işlevi (yakın saha bulma) |
| Fotoğraf | Evet | Hayır | Hayır | Uygulama işlevi (profil) |
| Ödeme bilgisi | **Hayır — saklanmıyor** | Evet (iyzico'ya) | — | Ödeme işleme |
| Uygulama etkileşimi | Evet | Hayır | Hayır | Analitik |

Ayrıca işaretle:
- ✅ Veriler aktarım sırasında **şifreleniyor**
- ✅ Kullanıcı **verilerinin silinmesini talep edebiliyor** (uygulama içinde var)

> **Ödeme bilgisi neden "saklanmıyor":** Kart verisi hiçbir zaman OYNA'nın
> sunucusuna kaydedilmiyor, doğrudan iyzico'ya iletiliyor. Bu denetimde
> kod düzeyinde doğrulandı.

### 4.3 · İçerik derecelendirmesi

`Uygulama içeriği` → `İçerik derecelendirmesi` → anketi doldur.
OYNA'da şiddet/cinsellik/kumar yok → büyük ihtimalle **3+ / Herkes**.

### 4.4 · Hedef kitle

`Uygulama içeriği` → `Hedef kitle ve içerik`
Yaş aralığı: **18+** seç (uygulamada veli onayı akışı var ama Play tarafında
18+ demek daha az form doldurmanı sağlar).

### 4.5 · Diğer beyanlar

| Form | Cevap |
|---|---|
| Reklam içeriyor mu | **Hayır** |
| Devlet uygulaması mı | Hayır |
| COVID-19 uygulaması mı | Hayır |
| Finans uygulaması mı | **Hayır** (halı saha kiralama hizmeti) |
| Veri güvenliği — hassas izinler | Konum ve kamera gerekçelerini yaz |

---

## ADIM 5 — Mağaza sayfası

`Büyüme` → `Mağaza varlığı` → `Ana mağaza girişi`

| Alan | Gereksinim |
|---|---|
| Kısa açıklama | En fazla 80 karakter |
| Tam açıklama | En fazla 4000 karakter |
| Uygulama simgesi | 512 × 512 px, PNG |
| Öne çıkan görsel | 1024 × 500 px |
| Telefon ekran görüntüsü | **En az 2 adet** (en fazla 8) |

> **Ekran görüntülerini nasıl alırsın:** ADIM 1.3'te `Run workflow` ekranındaki
> **"Telefona elle kurulabilen APK de üret"** kutusunu işaretle. Çıkan APK'yı
> telefonuna kur, uygulamayı gez, ekran görüntüsü al.

Örnek kısa açıklama:
> `Yakınındaki halı saha maçlarına katıl, takımını kur, sahayı ayırt.`

---

## ADIM 6 — AAB'yi yükle

### Önerim: önce **İç Test**, sonra Üretim

`Test` → `İç test` → `Yeni sürüm oluştur`

1. ADIM 1.5'te indirdiğin `.aab` dosyasını sürükle-bırak
2. Sürüm notları yaz (Türkçe, kısa): `İlk sürüm.`
3. `Kaydet` → `Sürümü incele` → `İç teste sunmaya başla`

İç test anında yayınlanır (inceleme yok). Kendi telefonuna kurup **gerçek
cihazda** test et. Sorun yoksa aynı paketi `Üretim`e taşı.

> **Neden doğrudan Üretim değil:** Üretime gönderdiğin sürüm Google incelemesine
> girer (1-7 gün). Bir hata çıkarsa süreç baştan başlar. İç test bedava ve anında.

### Üretime alma

`Üretim` → `Yeni sürüm oluştur` → aynı `.aab` → ülke seçimi (**Türkiye**) →
`Sürümü incele` → `Üretime sunmaya başla`

İnceleme genelde 1-7 gün sürer.

---

## ⚠️ YAYINA ALMADAN ÖNCE MUTLAKA

Bunlar yüklemeyi engellemez ama **yayına almadan** çözülmeli:

### 1. 🔴 Ödeme SİMÜLASYON modunda

Şu an `PAYMENT_PROVIDER=SIMULATION`. Yani **kullanıcı ödeme yapıyor görünür
ama kartından para çekilmez.** Gerçek kullanıcılar bedava rezervasyon yapar;
saha sahibi parasını alamaz.

**Çözüm:** iyzico sözleşme + KYC tamamla → canlı API anahtarlarını al →
Supabase'de şu gizli anahtarları ayarla:
- `PAYMENT_PROVIDER=IYZICO`
- `IYZICO_API_KEY`, `IYZICO_SECRET_KEY`
- `IYZICO_BASE_URL=https://api.iyzipay.com`

Canlıya geçmeden önce sandbox'ta **gerçek bir 3D Secure ödemesi** dene.

### 2. 🟠 Android push bildirimleri çalışmıyor

`google-services.json` yok.

**Çözüm:** Firebase Console → proje aç → Android uygulaması ekle
(`com.oyna.app`) → `google-services.json` indir → içeriğini GitHub'a
`GOOGLE_SERVICES_JSON` secret'ı olarak ekle → paketi yeniden üret.

### 3. 🟠 Supabase: sızmış şifre koruması kapalı

Supabase Dashboard → Authentication → Policies → "Leaked password protection"
**aç**. Tek tık.

### 4. 🟠 Demo hesapları

Üretimde `*@oyna.app` / `password123` demo hesaplarının silindiğini doğrula.

### 5. 🟡 Yasal metinler

Sözleşmeler hazır ve yer tutucu yok. Ancak **avukat onayı** alınmadı.
Özellikle iade politikası (iadeler karta değil OYNA kredisine dönüyor)
Mesafeli Satış mevzuatı açısından kontrol ettirilmeli.

### 6. 🟡 VERBİS / ETBİS / İYS kayıtları

Ticari bildirim/e-posta atacaksan **İYS kaydı zorunlu**.

---

## SIRALAMA ÖZETİ

| # | İş | Süre | Kim |
|---|---|---|---|
| 1 | GitHub'a 4 secret ekle | 10 dk | Sen |
| 2 | Workflow'u çalıştır, AAB indir | 10 dk | Sen |
| 3 | Play Console hesabı aç (şirket) | 1-14 gün | Sen |
| 4 | Uygulama oluştur + formlar | 2-3 saat | Sen |
| 5 | Mağaza görselleri hazırla | 2-3 saat | Sen |
| 6 | İç teste yükle, cihazda dene | 1 saat | Sen |
| 7 | iyzico canlıya geçir | 1-2 hafta | Sen |
| 8 | Firebase/push kur | 1 saat | Sen |
| 9 | Üretime gönder | 1-7 gün inceleme | Google |

**Kritik yol:** Play Console şirket hesabı (D-U-N-S) ve iyzico KYC. İkisini de
**bugün** başlat; geri kalan her şey bunları beklerken yapılabilir.

---

## TAKILIRSAN

Derleme kırmızı yanarsa: Actions sekmesinde işe tıkla, kırmızı adımı aç,
hata metnini kopyala ve bana getir.

Play Console bir formu reddederse: reddin gerekçesini olduğu gibi bana ilet.
