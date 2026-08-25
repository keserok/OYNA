# 02 · SAĞLAYICI VE HESAP ENVANTERİ

> OYNA'nın ayakta durması için ödediğimiz, giriş yaptığımız ve yenilemeyi
> unutamayacağımız her yer. **Şifreler burada değil** — `kasa.age` içinde.
> Burada "ne için, kim, ne kadar, ne zaman" yazar.

---

## Kritiklik ölçeği

| | Anlamı |
|---|---|
| 🔴 | Kaybedersen **uygulama durur** |
| 🟠 | Kaybedersen bir özellik durur |
| 🟡 | Kaybedersen görünürlük kaybolur, ürün çalışmaya devam eder |

---

## 🔴 Supabase — veritabanı, giriş, sunucu fonksiyonları

| | |
|---|---|
| **Proje** | `iikvzgyccvgcybzdfwlv` · adı "OYNA" |
| **Organizasyon** | `keremsplace` |
| **Plan** | **Ücretsiz** |
| **Bölge** | `ap-southeast-1` — **Singapur** |
| **Veritabanı** | PostgreSQL 17.6 · 58 MB · 126 tablo · 925 fonksiyon · 24 zamanlanmış iş |
| **Sunucu fonksiyonu** | 15 adet |
| **Pano** | supabase.com/dashboard |

**Bilinmesi gerekenler**

- **Ücretsiz plan 7 gün hareketsizlikte projeyi DURDURUR.** Lansmandan sonra
  kabul edilemez → Pro'ya (25 $/ay) geçilmeli.
- **Ücretsiz planda otomatik yedek YOK.** Veri kaybında geri dönüş yok.
- **Ücretsiz planda e-posta saatte 2 ile sınırlı.** Bu yüzden kayıt
  doğrulaması kapatıldı; şifre sıfırlama zaten Resend'den gidiyor.
- Bölge Singapur: Türkiye'den ~250 ms. Frankfurt'a taşımak gecikmeyi ~40 ms'ye
  düşürür ama **yerinde değiştirilemez** — yeni proje + göç + yeni paket gerekir.

## 🔴 Apple Developer Program

| | |
|---|---|
| **Bundle ID** | `com.oyna.app` |
| **Ücret** | 99 $/yıl — **yenilenmezse uygulama mağazadan düşer** |
| **Kullanıldığı yer** | App Store gönderimi · Sign in with Apple · APNs bildirimleri |

⚠️ `.p8` anahtarları (APNs, Sign in with Apple) **bir kez iner**. Kaybedersen
yenisini üretip eskisini iptal etmen gerekir. Kasada tam içeriğiyle saklanmalı.

## 🔴 Google Play Console

| | |
|---|---|
| **Paket** | `com.oyna.app` · hedef SDK 36 |
| **Ücret** | 25 $ tek seferlik |

⚠️ **Android imzalama anahtarı (`.jks`) kaybolursa uygulamayı bir daha
GÜNCELLEYEMEZSİN.** Play Store aynı paket adına başka anahtarla imzalanmış
sürüm kabul etmez — yeni bir uygulama olarak, sıfır kullanıcıyla başlarsın.
Dosyanın kendisi + şifresi + alias kasada olmalı.

## 🔴 GitHub

| | |
|---|---|
| **Depolar** | `keserok/OYNA` (özel) · `keserok/oyna-site` |
| **İçerik** | Tüm kod, göçler, yasal metinlerin kaynağı, bu kasa |

Kurtarma kodları kasada olmalı — hesabı kaybetmek kodu kaybetmektir.

## 🟠 iyzico — ödeme altyapısı

| | |
|---|---|
| **Durum** | **Sözleşme tamamlanmadı.** Sağlayıcı `SIMULATION` |
| **Komisyon** | %3,5 (kurucu kararı: tesis üstlenir, toplam kesinti %8,5) |

Canlıya alındığında: `app_config.payment_provider = "IYZICO"` **ve**
`PAYMENT_PROVIDER` sırrı `IYZICO`. İki katman bilinçli.

## 🟠 Firebase — Android bildirimleri

Yalnız FCM için. Hizmet hesabı `.json`'u kasada durmalı.

## 🟠 Resend — e-posta

Şifre sıfırlama kodu buradan gider. **Anahtar tanımlı değil → bugün hiçbir
sıfırlama e-postası gitmiyor.** Alan adı doğrulaması (`oyna.app`) gerekir.

## 🟡 Netgsm — SMS

Telefonla giriş silindi (§4.6); yalnız gelecekte SMS bildirimi açılırsa gerekir.

## 🟡 Sentry · PostHog — hata izleme ve ölçüm

İkisi de isteğe bağlı. Yokken uygulama çalışır, hatalar kendi veritabanımıza
yazılır (`istemci_hatalari`).

## 🔴 Alan adı — `oyna.app`

Yenilenmezse: web sitesi, yasal sayfalar ve e-posta gönderimi (`no-reply@oyna.app`)
aynı anda düşer. **Yenileme tarihi kasaya yazılmalı.**

## 🟡 Vercel — web sitesi barındırma

`oyna-app.vercel.app` · yasal sayfalar buradan yayınlanıyor.

---

## Yıllık maliyet ve yenileme takvimi

| Kalem | Tutar | Sıklık | Yenileme tarihi |
|---|---|---|---|
| Apple Developer | 99 $ | yıllık | ⟨kasaya yaz⟩ |
| Google Play | 25 $ | tek seferlik | — |
| Alan adı `oyna.app` | ~20 $ | yıllık | ⟨kasaya yaz⟩ |
| Supabase Pro *(lansmanda gerekli)* | 25 $ | aylık | — |
| Supabase özel alan adı *(isteğe bağlı)* | 10 $ | aylık | — |

> **Özel alan adı neden düşünülmeli:** sunucu adresi bugün uygulama paketine
> gömülü. Frankfurt'a taşımak yeni adres → yeni paket → yeni Apple incelemesi
> demek. `api.oyna.app` gibi kendi adresin olursa taşıma bir DNS değişikliğine
> iner.

---

## Devir teslim — bir gün başkası devralırsa

Sırayla şunlar gerekir:

1. **GitHub** — kod ve bu kasa
2. **Kasa parolası** — bu olmadan yukarıdakilerin hiçbirine girilemez
3. **Supabase** — veri ve sunucu
4. **Apple + Google** — mağazalar ve imzalama anahtarları
5. **Alan adı** — site ve e-posta

⚠️ Kasa parolası **kasanın içinde değildir** ve olamaz. Ayrı bir yerde,
fiziksel olarak da bulunabilecek şekilde saklanmalı. Parola kaybolursa
kasadaki her şey kaybolur — bunu kimse geri getiremez.
