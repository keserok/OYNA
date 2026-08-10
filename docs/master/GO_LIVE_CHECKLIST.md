# OYNA — Gerçeğe Geçiş (Go-Live) Kontrol Listesi

> Sistem şu an **SİMÜLASYON** modunda: gerçek para çekilmez, telefona gerçek push gitmez.
> Aşağıdaki adımlar tamamlanınca ve **Finans → Go-Live Ön-Uçuş** tüm satırlar yeşil olunca
> tek tek anahtarları çevirerek gerçeğe geçilir. Acele etme — her adım bağımsız test edilebilir.

---

## A. Ödeme (iyzico) gerçeğe geçiş

**Önce hazırlık (KURUCU):**
1. iyzico marketplace hesabı + canlı API anahtarları al.
2. Supabase edge secret'ları ayarla (Supabase Panosu → Edge Functions → Secrets):
   - `PAYMENT_PROVIDER=IYZICO`
   - `IYZICO_API_KEY`, `IYZICO_SECRET`, `IYZICO_BASE_URL`
   - `PAYMENT_EDGE_SECRET` (capture/void/refund fonksiyonlarını korur)
3. **Finans → Go-Live Ön-Uçuş**'u çalıştır. Tüm satırlar yeşil olmalı:
   - `payment_provider`, `demo_mode_off`, `no_stuck_intents` (askıda 0 ödeme),
     `commission_configured`, `readonly_mode_off`.

**Anahtarı çevir:**
4. **Sistem Parametreleri → Ödeme → "Ödeme Sağlayıcısı" (payment_provider) = `IYZICO`**.
   (Hem edge secret hem bu config IYZICO olmalı — ikisi birlikte.)
5. Küçük bir gerçek ödeme ile uçtan uca test et (kendi kartınla, küçük tutar), sonra iade et.

> ⚠️ Sağlayıcı kimlik doğrulama: kaleci/hakem ödemeleri için `provider_identities` VERIFIED olmalı.
> Lansmandan önce en az bir sağlayıcı kimliğini onayla ve test et.

---

## B. Bildirim (push) gerçeğe geçiş

**Önce hazırlık (KURUCU):**
1. Apple APNs anahtarları: `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_PRIVATE_KEY`, `APNS_BUNDLE_ID`, `APNS_PRODUCTION`.
2. Google FCM: `GOOGLE_SERVICE_ACCOUNT_KEY`, `GOOGLE_PROJECT_ID`.
3. **`WEBHOOK_SECRET`** secret'ını ayarla VE Supabase Panosu → Database → Webhooks →
   `notifications` INSERT webhook'unun `Authorization: Bearer <WEBHOOK_SECRET>` header'ını ekle.
   (Bu olmadan `send-push` tüm push'ları 401 ile reddeder.)

**Anahtarı çevir:**
4. **Sistem Parametreleri → Bildirim → "Gerçek Push Bildirimi Aktif" (push_live_enabled) = AÇIK**.
5. **Kampanyalar**'dan kendine küçük bir test bildirimi gönder, telefonda geldiğini doğrula.
6. İstersen sessiz saat (`silent_hours_*`) ve saatlik limiti (`rate_limit_per_user_per_hour`) ayarla.

> Not: push_live_enabled kapalıyken bile uygulama-içi bildirimler çalışır; sadece telefon push'u beklemededir.

---

## C. Demo verisini kapat (lansman)

1. **Sistem Parametreleri → Sistem → `demo_mode_enabled` = KAPALI** (zaten varsayılan).
   Demo tesis/kaleci/hakem/maç tüketici uygulamasında görünmez.
2. İstersen demo verisini tamamen temizle (GodView demo temizleme akışı / purge).

---

## D. Güvenlik sertleştirme (KURUCU AKSİYONU — lansman öncesi)

Bunlar canlıyı kırmamak için kasıtlı olarak ertelendi; secret gerektirir:
1. **Edge CORS:** `ALLOWED_ORIGIN` ve `ADMIN_ALLOWED_ORIGIN` secret'larını gerçek alan adlarına ayarla
   (varsayılan `*` yerine). `create-payment`, `admin-broadcast` dahil.
2. **admin-broadcast / push-notification auth:** `ADMIN_EDGE_SECRET` set et; bu fonksiyonların
   secret-doğrulamasını fail-closed yap (repo'da hazır; secret olmadan açma — meşru çağrılar kırılır).
3. **profiles PII:** Tüketici uygulamasında oyuncuların birbirinin e-posta/telefon/konum gibi
   hassas alanlarını okuyabildiği biliniyor (KVKK riski). Bunu daraltmak **mobil uygulamada
   koordineli güncelleme** gerektirir (kamusal `public_profiles` görünümüne geçiş). Bu yüzden
   tek başına DB değişikliği yapılmadı — mobil ekiple/sürümle birlikte planlanmalı.

4. **`payment-webhook` simülasyon arka kapısı** (denetim bulgusu BE-12 · `supabase/functions/payment-webhook/index.ts:100-115`):
   `PAYMENT_PROVIDER=SIMULATION` **ve** `SIMULATION_WEBHOOK_ALLOW` birlikte set iken webhook,
   gelen POST gövdesini **hiçbir imza/secret doğrulaması olmadan** kabul edip
   `apply_booking_payment` çalıştırır — intent UUID'sini bilen biri ödemesiz "ödendi" durumu üretebilir.
   Bugün güvenlik yalnızca env hijyenine bağlı.
   - **Lansmanda zorunlu:** `PAYMENT_PROVIDER=IYZICO`'ya geçerken `SIMULATION_WEBHOOK_ALLOW`
     secret'ının **silindiğini** doğrula (§A adım 2'den sonra kontrol et).
   - **Kalıcı çözüm (ertelendi, karar: kurucu):** SIMULATION dalına da `WEBHOOK_SECRET` benzeri
     bir Bearer kontrolü ekle; ayrıca fonksiyon açılışında `PROVIDER=IYZICO` iken
     `SIMULATION_WEBHOOK_ALLOW` set ise uyarı loglayıp bayrağı yok say.

5. **Demo hesap girişi — bilinçli olarak AÇIK bırakıldı** (denetim bulgusu BE-1 · `supabaseAuth.ts:298, 336-338`):
   Test hesaplarının şifresi kodda sabit (`password123`) ve seçicinin kill-switch'i *fail-open*
   kurulu (`VITE_DEMO_ACCOUNTS !== 'false'` → env tanımlı olmadığı için üretimde açık).
   Bu hesaplar üretim Supabase'inde **gerçek RLS yetkileriyle** var.
   - Kurucu kararı: özellik şimdilik açık kalacak.
   - **Kapatmak istendiğinde tek hamle:** build ortamına `VITE_DEMO_ACCOUNTS=false` ekle
     (kod değişikliği gerektirmez). Kalıcı çözüm istenirse mantığı `=== 'true'` ile tersine çevir
     ve demo hesap şifrelerini rotasyonla değiştir.

---

## E. Dayanıklılık (KURUCU AKSİYONU)

1. **PITR aç** (RUNBOOK §3).
2. **Sentry DSN** gir (RUNBOOK §5) — hata izleme aktifleşir.
3. **Uptime izleme** bağla.

---

## Özet: gerçeğe geçiş anahtarları (panelden)

| Anahtar | Yer | Simülasyon | Gerçek |
|---|---|---|---|
| Ödeme sağlayıcısı | Sistem Parametreleri → Ödeme | `SIMULATION` | `IYZICO` |
| Gerçek push | Sistem Parametreleri → Bildirim | KAPALI | AÇIK |
| Demo modu | Sistem Parametreleri → Sistem | (kapalı) | KAPALI |
| Acil durdurma | Sistem Parametreleri → Güvenlik | KAPALI | KAPALI |

Her anahtarın yanında ayrıca **edge secret** gerekir (ödeme/push) — panel anahtarı tek başına yetmez; ikisi birlikte.
