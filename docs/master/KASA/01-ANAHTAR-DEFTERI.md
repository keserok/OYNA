# 01 · ANAHTAR DEFTERİ

> **Bu dosyada DEĞER YOKTUR.** Burada her anahtarın ne olduğu, ne işe yaradığı,
> yoksa neyin bozulduğu ve nereden alındığı yazar. Değerler şifreli
> `kasa.age` içinde; `npm run kasa:ac` ile açılır.
>
> Son sayım: **32 sunucu sırrı + 16 istemci ayarı** (25 Ağustos 2026).

---

## Nasıl okunur

| Sütun | Anlamı |
|---|---|
| **Durum** | 🟢 tanımlı ve çalışıyor · 🟡 tanımlı değil, özellik kapalı · ⚪ isteğe bağlı |
| **Yoksa ne olur** | Anahtar eksikken kullanıcının gördüğü şey |

**Sunucu sırları** Supabase panosunda durur:
`Project Settings → Edge Functions → Secrets`
Komut satırından: `supabase secrets set AD=değer`

**İstemci ayarları** derleme anında pakete gömülür (`.env` → Vite).
Değiştirmek için **yeni paket** gerekir.

---

## 1 · ÖDEME (iyzico)

| Anahtar | Durum | Ne işe yarar | Yoksa ne olur |
|---|---|---|---|
| `PAYMENT_PROVIDER` | 🟢 `SIMULATION` | Gerçek tahsilat mı, simülasyon mu | Simülasyona düşer |
| `IYZICO_API_KEY` | 🟡 | iyzico kimliği | Gerçek tahsilat yapılamaz |
| `IYZICO_SECRET_KEY` | 🟡 | iyzico imzası | Aynı |
| `IYZICO_BASE_URL` | ⚪ | Boşsa `https://api.iyzipay.com` | Canlı uca gider |
| `IYZICO_CALLBACK_URL` | 🟡 | 3D Secure dönüş adresi | Banka doğrulaması tamamlanamaz |
| `PAYMENT_EDGE_SECRET` | 🟡 | İade/iptal uçlarını sistem dışına kapatır | Uçlar 403 döner |
| `SIMULATION_WEBHOOK_ALLOW` | ⚪ | Simülasyonda sahte ödeme bildirimi kabul et | Bildirim reddedilir |

> **Gerçek ödemeye geçiş TEK adımdır:** `app_config.payment_provider = "IYZICO"`.
> Ama iki katmanlı kilit var — `PAYMENT_PROVIDER` sırrı da `IYZICO` demeli.
> Bu bilinçli: tek bir yanlış tıklama gerçek para hareketi başlatamasın.
> Aynı gün `simulation_counts_as_live` kapatılmalı ve ödeme ekranındaki
> kırmızı "TEST ödemesidir" uyarısı kendiliğinden kaybolur.

## 2 · BİLDİRİM (APNs · iOS)

| Anahtar | Durum | Ne işe yarar | Yoksa ne olur |
|---|---|---|---|
| `APNS_KEY_ID` | 🟡 | Apple push anahtar kimliği | iPhone'a bildirim gitmez |
| `APNS_TEAM_ID` | 🟡 | Apple ekip kimliği | Aynı |
| `APNS_PRIVATE_KEY` | 🟡 | `.p8` dosyasının tam içeriği | Aynı |
| `APNS_BUNDLE_ID` | ⚪ | Boşsa `com.oyna.app` | Varsayılan doğru |
| `APNS_PRODUCTION` | 🟡 | `true` olmalı | **Mağaza paketine bildirim GİTMEZ** |

> ⚠️ `APNS_PRODUCTION` tuzağı: paketimiz `aps-environment = production` ile
> imzalanıyor. Bu sır `true` değilse sunucu bildirimleri Apple'ın *sandbox*
> ucuna yollar ve mağazadan inen uygulamaya hiçbir bildirim ulaşmaz — üstelik
> hata da vermez.
>
> Anahtar nereden alınır: developer.apple.com → Certificates, Identifiers &
> Profiles → **Keys** → **+** → "Apple Push Notifications service (APNs)".
> **`.p8` dosyası yalnız BİR KEZ iner.** Kaybedersen yenisini üretmen gerekir.

## 3 · BİLDİRİM (FCM · Android)

| Anahtar | Durum | Ne işe yarar | Yoksa ne olur |
|---|---|---|---|
| `GOOGLE_PROJECT_ID` | 🟡 | Firebase proje kimliği | Android'e bildirim gitmez |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | 🟡 | Hizmet hesabı `.json`'unun tam içeriği | Aynı |

> Alınacağı yer: console.firebase.google.com → Project settings →
> **Service accounts** → *Generate new private key*.

**Bildirim zinciri hazır:** `notifications` tablosuna satır düşünce tetikleyici
`send-push` fonksiyonunu çağırıyor, fonksiyon canlıda (sürüm 9). Bugüne kadar
**3.781 bildirim üretildi, 0'ı telefona gitti** — eksik olan yalnız bu anahtarlar
ve `app_config.push_live_enabled`.

## 4 · E-POSTA (Resend)

| Anahtar | Durum | Ne işe yarar | Yoksa ne olur |
|---|---|---|---|
| `RESEND_API_KEY` | 🟡 | E-posta gönderimi | **Şifre sıfırlama kodu HİÇ GİTMEZ** |
| `EMAIL_FROM` | ⚪ | Boşsa `OYNA <no-reply@oyna.app>` | Varsayılan kullanılır |
| `EMAIL_EDGE_SECRET` | 🟡 | `send-email` ucunu dışarıya kapatır | Uç 403 döner |

> ⚠️ **Bugün açık bir yara:** e-posta + şifre artık ANA giriş yolu, ama
> `RESEND_API_KEY` tanımlı olmadığı için `password-reset-request` sessizce
> simülasyona düşüyor. Şifresini unutan ve Google/Apple bağlantısı olmayan
> kullanıcı hesabına dönemiyor. Lansmandan önce **zorunlu**.

## 5 · SMS (Netgsm) — yol bugün KAPALI

| Anahtar | Durum | Ne işe yarar |
|---|---|---|
| `NETGSM_USERCODE` · `NETGSM_PASSWORD` · `NETGSM_MSGHEADER` | 🟡 | SMS gönderimi |
| `SEND_SMS_HOOK_SECRET` | 🟡 | Supabase Auth → Hooks doğrulaması |
| `WHATSAPP_ENABLED` | 🟡 | `true` ise yurt dışı kanalı açılır |
| `SMS_SIMULATION` | ⚪ | **Yalnız geliştirme.** Üretimde ASLA `true` olmamalı |

> Telefonla giriş 23 Ağustos 2026'da **silindi** (prensip §4.6). Bu anahtarlar
> yalnız gelecekte SMS bildirimi açılırsa gerekir. `SMS_SIMULATION` üretimde
> açılırsa kullanıcı asla gelmeyecek bir kodu bekler.

## 6 · SUNUCU İÇİ SIRLAR

| Anahtar | Durum | Ne işe yarar | Yoksa ne olur |
|---|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | 🟢 otomatik | Fonksiyonlarda tam yetki | Fonksiyonlar çalışmaz |
| `SUPABASE_URL` · `SUPABASE_ANON_KEY` | 🟢 otomatik | Supabase kendisi verir | — |
| `WEBHOOK_SECRET` | 🟢 | Bildirim tetikleyicisi → `send-push` el sıkışması | Push tetiklenmez |
| `ADMIN_EDGE_SECRET` | 🟡 | Yönetici duyuru fonksiyonu | Duyuru gönderilemez |
| `ADMIN_ALLOWED_ORIGIN` | ⚪ | Yönetici ucu CORS kısıtı | Kısıt uygulanmaz (uyuyan kapı) |
| `ADMIN_IP_ALLOWLIST` | ⚪ | Yönetici ucu IP kısıtı | Kısıt uygulanmaz |
| `RESET_CODE_PEPPER` | ⚪ | Şifre sıfırlama kodu karması | Service key'e düşer (çalışır) |
| `ALLOWED_ORIGIN` | ⚪ | Genel CORS | `*` (kısıtsız) |

> `SUPABASE_SERVICE_ROLE_KEY` **veritabanının tamamına sınırsız erişimdir** —
> RLS'i baypas eder. İstemciye ASLA girmez, yalnız sunucu fonksiyonlarında
> yaşar. Sızarsa: her kullanıcının verisi okunabilir ve silinebilir.
> Sızıntı şüphesinde ilk yapılacak: Supabase panosundan **rotate**.

## 7 · İSTEMCİ AYARLARI (pakete gömülür)

| Ayar | Durum | Ne işe yarar | Gizli mi |
|---|---|---|---|
| `VITE_SUPABASE_URL` | 🟢 gömülü yedek | Sunucu adresi | Hayır — herkese açık |
| `VITE_SUPABASE_ANON_KEY` | 🟢 gömülü yedek | Genel okuma anahtarı | Hayır — RLS korur |
| `VITE_GOOGLE_WEB_CLIENT_ID` | 🟡 | Google ile giriş (web) | Hayır |
| `VITE_GOOGLE_IOS_CLIENT_ID` | 🟡 | Google ile giriş (iOS) | Hayır |
| `VITE_SENTRY_DSN` | 🟡 | Hata izleme | Hayır |
| `VITE_POSTHOG_KEY` · `VITE_POSTHOG_HOST` | 🟡 | Ürün ölçümü | Hayır |
| `VITE_APP_URL` · `VITE_APP_VERSION` | 🟢 | Derin bağlantı, sürüm rozeti | Hayır |
| `VITE_DEV_MODE` | 🔴 | **Üretimde ASLA tanımlanmaz** | — |
| `VITE_OWNER_DEMO_AUTO_SEED` | 🔴 | **Üretimde ASLA tanımlanmaz** | — |
| `VITE_DEMO_ACCOUNTS` | 🔴 ölü | Tanımlıysa mobil derleme **DURUR** | — |

> Bunların hiçbiri sır değildir: istemciye inen her şey kullanıcının
> telefonundadır ve paketi açan herkes okuyabilir. Güvenlik `anon` anahtarının
> gizliliğine değil, **RLS politikalarına** dayanır.
>
> Depoda `.env` **yok** — yalnız `.env.example`. Üretim değerleri
> `supabaseClient.ts` içine gömülü yedekten gelir.

---

## Rotasyon takvimi

| Anahtar | Sıklık | Nasıl |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | 180 gün | Pano → API → rotate; tüm fonksiyonları yeniden yükle |
| iyzico anahtarları | 180 gün | iyzico panosundan yeni üret → `supabase secrets set` |
| `RESEND_API_KEY` | 180 gün | Resend panosu |
| `ADMIN_EDGE_SECRET` · `PAYMENT_EDGE_SECRET` · `EMAIL_EDGE_SECRET` | 90 gün | Yeni rastgele dize üret |
| APNs `.p8` | Süresi dolunca | Apple yeni anahtar; eskisini iptal et |
| Supabase erişim jetonu (`sbp_…`) | **Her kullanımdan sonra** | Geçici iş için üret, biter bitmez **iptal et** |

**Rotasyon adımları:** yeni anahtarı üret → `supabase secrets set` → ilgili
fonksiyonu yeniden yükle → küçük bir kanarya işlemle doğrula (düşük tutarlı
ödeme, test cihazına bildirim) → eskisini sağlayıcıda iptal et →
`kasa.md`'deki değişiklik günlüğüne tek satır yaz.

Ayrıntılı yordamlar: `docs/master/runbook/SECRET_ROTATION.md`,
`INCIDENT_RESPONSE.md`, `PITR_RESTORE.md`.

---

## Sızıntı olursa

1. **Önce iptal et, sonra düşün.** Sızan anahtarı sağlayıcıda derhal geçersiz kıl.
2. Yenisini `supabase secrets set` ile koy, fonksiyonları yeniden yükle.
3. Supabase Logs + `admin_audit_log` üzerinden anormal kullanım ara.
4. Service role sızdıysa: gerekirse PITR ile geri al (`PITR_RESTORE.md`).
5. `kasa.md` düz metni **git geçmişine girdiyse** anahtarı değiştirmek yetmez —
   geçmişteki değer sonsuza kadar orada. O anahtarların **hepsi** yenilenmeli.
   `npm run kasa:durum` bunu kontrol eder ve uyarır.
