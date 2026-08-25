# KASA — GERÇEK DEĞERLER

> ⚠️ **BU DOSYANIN DOLU HÂLİ ASLA COMMIT EDİLMEZ.**
> `.gitignore` onu tutuyor, `npm run kasa:kilitle` ise git takip ediyorsa
> kilitlemeyi reddediyor. Depoya giren tek şey şifrelenmiş `kasa.age`.
>
> Bu dosya **şablondur** ve boştur; commit edilir. Çalışma kopyası
> `npm run kasa:kur` ile buradan türetilir.

**Nasıl kullanılır**

```
npm run kasa:ac        # kasa.age → kasa.md   (parola sorar)
… düzenle …
npm run kasa:kilitle   # kasa.md → kasa.age   (şifreler, geri açılabildiğini
                       #  doğrular, sonra düz metni siler)
```

Doldurmadığın satırı `⟨…⟩` olarak bırak — "bilmiyorum" ile "boş olması gerekiyor"
arasındaki farkı görmek, ikisini de doldurmuş gibi yapmaktan iyidir.
Her anahtarın **ne işe yaradığı ve nereden alındığı** `01-ANAHTAR-DEFTERI.md`
dosyasında yazılı; burada yalnız değerler durur.

---

## 1 · SUPABASE

```
Proje referansı        iikvzgyccvgcybzdfwlv
Panoya giriş           ⟨e-posta⟩ / ⟨şifre⟩
İki adımlı doğrulama   ⟨kurtarma kodları⟩

SUPABASE_SERVICE_ROLE_KEY   ⟨…⟩   # TAM YETKİ — sızarsa tüm veriye erişilir
Veritabanı şifresi          ⟨…⟩
Erişim jetonu (sbp_…)       ⟨…⟩   # geçici iş için üret, işi bitince İPTAL ET
```

## 2 · ÖDEME — iyzico

```
Panoya giriş           ⟨e-posta⟩ / ⟨şifre⟩
Başvuru/üye iş yeri no ⟨…⟩

IYZICO_API_KEY         ⟨…⟩
IYZICO_SECRET_KEY      ⟨…⟩
IYZICO_BASE_URL        https://api.iyzipay.com        # sandbox: https://sandbox-api.iyzipay.com
IYZICO_CALLBACK_URL    ⟨…⟩/functions/v1/iyzico-3ds-callback
PAYMENT_EDGE_SECRET    ⟨rastgele uzun dize⟩
```

## 3 · APPLE

```
Apple ID               ⟨e-posta⟩ / ⟨şifre⟩
İki adımlı kurtarma    ⟨…⟩
Team ID                ⟨10 karakter⟩
Bundle ID              com.oyna.app
App Store Connect API  ⟨Issuer ID⟩ / ⟨Key ID⟩ / ⟨.p8 dosyası nerede⟩

APNS_KEY_ID            ⟨10 karakter⟩
APNS_TEAM_ID           ⟨10 karakter⟩
APNS_BUNDLE_ID         com.oyna.app
APNS_PRODUCTION        true
APNS_PRIVATE_KEY       ⟨AuthKey_XXXX.p8 dosyasının TAM içeriği⟩
-----BEGIN PRIVATE KEY-----
⟨…⟩
-----END PRIVATE KEY-----

Sign in with Apple
  Services ID          ⟨…⟩
  Key ID               ⟨…⟩
  Özel anahtar (.p8)   ⟨…⟩
```

## 4 · GOOGLE / FIREBASE

```
Google hesabı          ⟨e-posta⟩ / ⟨şifre⟩
Play Console geliştirici hesabı  ⟨…⟩
Android imzalama anahtarı (.jks) ⟨dosya nerede⟩ / ⟨şifre⟩ / ⟨alias⟩

VITE_GOOGLE_WEB_CLIENT_ID   ⟨…⟩
VITE_GOOGLE_IOS_CLIENT_ID   ⟨…⟩
GOOGLE_PROJECT_ID           ⟨firebase proje kimliği⟩
GOOGLE_SERVICE_ACCOUNT_KEY  ⟨indirilen .json dosyasının TAM içeriği⟩
```

## 5 · E-POSTA VE SMS

```
RESEND_API_KEY         ⟨re_…⟩
EMAIL_FROM             OYNA <no-reply@oyna.app>
EMAIL_EDGE_SECRET      ⟨rastgele uzun dize⟩
Resend panosu          ⟨e-posta⟩ / ⟨şifre⟩

NETGSM_USERCODE        ⟨abone no⟩          # SMS yolu bugün KAPALI
NETGSM_PASSWORD        ⟨…⟩
NETGSM_MSGHEADER       ⟨onaylı başlık⟩
SEND_SMS_HOOK_SECRET   ⟨v1,whsec_…⟩
```

## 6 · SUNUCU İÇİ SIRLAR

```
WEBHOOK_SECRET         ⟨…⟩   # bildirim tetikleyicisi → send-push
ADMIN_EDGE_SECRET      ⟨…⟩   # yönetici duyuru fonksiyonu
ADMIN_ALLOWED_ORIGIN   ⟨…⟩
ADMIN_IP_ALLOWLIST     ⟨…⟩
RESET_CODE_PEPPER      ⟨…⟩   # şifre sıfırlama kodu karması
ALLOWED_ORIGIN         ⟨…⟩
```

## 7 · İZLEME

```
VITE_SENTRY_DSN        ⟨…⟩
VITE_POSTHOG_KEY       ⟨…⟩
VITE_POSTHOG_HOST      ⟨…⟩
```

## 8 · ALAN ADI VE BARINDIRMA

```
Alan adı kaydı (oyna.app)  ⟨sağlayıcı⟩ / ⟨giriş⟩ / ⟨yenileme tarihi⟩
Vercel                     ⟨giriş⟩
GitHub                     ⟨giriş⟩ / ⟨kurtarma kodları⟩
```

---

## Değişiklik günlüğü

Bir anahtarı yenilediğinde buraya tek satır yaz — hangi anahtar, ne zaman, neden.
Sızıntı şüphesinde ilk bakılacak yer burasıdır.

```
2026-08-25  kasa kuruldu (şablon)
```
