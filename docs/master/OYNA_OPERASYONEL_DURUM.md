# 🧩 OYNA — Operasyonel Durum & Kalan İşler

> **Bu dosya tek güncel kaynaktır.** (Eski `OPERASYONEL_EKSIKLER.md` buraya taşındı + güncellendi.)
> **Son güncelleme:** Faz 7 tamamlandı + 4 yeni ödeme/e-posta edge function canlıya deploy edildi.
> **İlke:** Buradaki maddeler **kod bug'ı değildir** — altyapı (DB, RPC, state machine, edge) hazır;
> eksik olan yalnızca **dış kaynak (iyzico sözleşmesi, sertifika, hesap, hukuk)** veya küçük UI/test cilasıdır.
> **iyzico aktivasyon adımları için** ayrıntı: `docs/master/OYNA_GO_LIVE_IYZICO.md` (go-live runbook).

---

## 0. Genel durum (özet)
- **Faz 0–7 kod tarafı = TAMAM** (main'de). Güvenlik (RLS 67/67, MFA), bildirim merkezi, komisyon
  TEK-KAYNAK (SSOT, 4 seviye admin-yönetimli), para kararları (kademeli iade + PSP + Model B owner %95).
- **Para = SIMULATION modunda** çalışıyor (gerçek kart çekilmiyor); tüm mantık hazır.
- **Edge functions canlıda:** `create-payment` (v1), `capture-payment`, `void-payment`, `refund-payment`,
  `send-email`, `send-push`, `admin-broadcast`, `admin-create-user`, **`payment-webhook`** — **hepsi ACTIVE**.
  - ℹ️ `payment-webhook` **2026-07-05'te canlıya alındı** (`verify_jwt=false`, iyzico imzasını sunucu
    tarafında doğrular). SIMULATION modunda `SIMULATION_WEBHOOK_ALLOW` set edilmedikçe 400 döner →
    sahte ödeme uygulanamaz (canlıda doğrulandı: GET→405, sahte POST→400).
- **Migration defteri drift'i:** repo `supabase/migrations/` ↔ canlı `schema_migrations` uyumsuzluğu
  tespit edildi; üretim içeriği **eksiksiz** (RLS 80/80, 0 ERROR advisor). 7 eksik migration repo'ya
  kurtarıldı; tek-komutluk kalıcı çözüm + runbook: `docs/master/SUPABASE_MIGRATION_RECONCILIATION.md`.
- **e2e test paketi:** faz0–7 SQL entegrasyon testleri yeşil (bkz. `tests/integration/README.md`).

---

## 1. KALAN İŞLER — Durum Tablosu

| # | İş | Tür | Sahip | Durum |
|---|----|----|-------|-------|
| 1 | iyzico sözleşmesi/KYC (pazaryeri + pre-auth) | Dış bağımlılık | **USER** | ⏳ Bekliyor |
| 2 | iyzico anahtarları → ödeme `PROVIDER=IYZICO` | Entegrasyon | Geliştirici | ⏳ #1 bekliyor |
| 3 | Maç katılımı → gerçek pre-auth blokaj (`create-payment` maç dalı) | Kod (go-live) | Geliştirici | 🧱 RPC+edge hazır |
| 4 | T-8s'te provider capture/void (pg_net → capture/void edge) | Kod (go-live) | Geliştirici | 🧱 cron+edge hazır |
| 5 | İptal-iadede karta gerçek iade (`refund-payment` çağrısı) | Kod (go-live) | Geliştirici | 🧱 edge deploy edildi |
| 6 | Push sertifikaları (Apple APNs `.p8` + Google FCM) | Dış bağımlılık | **USER** | ⏳ store hesabı bekliyor |
| 7 | Yasal metinler (KVKK/Sözleşme/Mesafeli/Gizlilik) hukukçu onaylı | Dış bağımlılık | **USER** | ⏳ Bekliyor |
| 8 | Apple Developer + Google Play hesapları | Dış bağımlılık | **USER** | ⏳ Bekliyor |
| 9 | Marka kiti (logo/ikon/splash/screenshot) | Dış bağımlılık | **USER** | ⏳ Bekliyor |
| 10 | Mobil derleme + mağaza yükleme + inceleme | Kod (go-live) | Geliştirici | 🧱 ios/android iskelet hazır |
| 11 | Ordu 4 saha gerçek fiyat/takvim + anlaşma | İş | **USER** | ⏳ Bekliyor |
| 12 | Admin cockpit: Faz 7 RPC'lerini (skor override + force refund) UI'a bağlama | Kod (şimdi yapılabilir) | Geliştirici | 🧱 RPC hazır, UI yok |
| 13 | Kapsam-dışı admin sayfaları temizliği (Topluluk/Turnuva/Promo/SaaS/PRO) | Kod (şimdi yapılabilir) | Geliştirici | 🧹 Sadeleştirme |
| 14 | 18 yaş altı doğum tarihi onboarding alanı | Kod (UI) | Geliştirici | 🧱 Kolon+ödeme akışı hazır |
| 15 | release_owner_earnings / payout yaşam döngüsü e2e testi | Test | Geliştirici | 🧪 Test boşluğu |

---

## 2. ✅ Tamamlananlar (Faz 5/6/7 — eski listede "bekliyor" görünenler)

- ✅ **Kaleci/Hakem anlık payout** (Faz 5): hizmet talebi → %10 komisyon → maç sonu 1-10 değerlendirme
  → **anında** ödeme (owner 2 hafta ≠). TC kimlik kapısı + 17 e2e test.
- ✅ **Kademeli iade** (Faz 7): `process_tiered_refund` + `cancel_app_booking` artık **gerçek çağırıcıya
  bağlı** (admin `admin_refund_intent`, rezervasyon iptali kademeli) — RPC artık "yetim" değil.
- ✅ **Model B net** (Faz 7): owner taban **%95**, markup oyuncuya EK, OYNA %5+markup; saha sahibi
  kendi sahasında maç açınca **otomatik MODEL_B** (trigger).
- ✅ **Komisyon SSOT** (Faz 7): `create_payment_intent` artık `commission_config` motorunu kullanır
  (eski %10 çift-kaynak bug'ı bitti); 4 seviye (global/saha/hizmet/maç) admin panelinden ayarlanır.
- ✅ **PSP kesintisi** (Faz 7): iade tutarından ödeme-altyapısı kesintisi orantılı düşülür (admin ayarlı, varsayılan 0).
- ✅ **owner çift-ödeme önlemi** (Faz 7): iadede owner'ın bekleyen kazancı per-intent iptal / aggrege telafi negatif ile netlenir.
- ✅ **Webhook imza doğrulama** (Faz 7 denetimi): `payment-webhook` iyzico token'ı iyzico'ya yeniden sorar.
- ✅ **Admin 2FA** (Faz 7): Supabase MFA (TOTP, aal2 kapısı).
- ✅ **Bildirim merkezi + maç hatırlatma** (Faz 7): realtime + 1s/24s cron.
- ✅ **Gözlemlenebilirlik** (Faz 7): Sentry/PostHog cephesi (env yoksa no-op).
- ✅ **Edge function deploy** (bugün): capture/void/refund/send-email canlıda ACTIVE.
- ✅ **Özel maç (private_code) katılım UI** + **MyBookings ikincil işlemler** (Faz 3 cilası).

---

## 3. iyzico go-live: yalnız 3 HTTP bağlama (mantık hazır)

Sözleşme + anahtar gelince (#1, #2), şu üç bağlama kalır — hepsinin altyapısı hazır:

1. **Maç katılımı → pre-auth:** `create-payment`'a maç dalı; `create_match_preauth` (PENDING→iyzico
   pre-auth→BLOCKED). *(Şu an cüzdandan anında çekiyor; intent yoluna geçilecek.)*
2. **T-8s provider capture/void:** `auto_process_matches` cron'u (CANLI) `process_match_at_deadline`'ı
   çağırıyor; IYZICO modunda intent başına `capture-payment`/`void-payment` edge'i tetiklenecek (pg_net).
3. **İptal → karta iade:** iptal akışları `refund-payment` edge'ini (kademeli + iyzico karta iade) çağıracak.

Detaylı adımlar + env değişkenleri: **`docs/master/OYNA_GO_LIVE_IYZICO.md`**.

---

## 4. Şimdi (iyzico beklemeden) yapılabilecek kod işleri
- **#12 Admin cockpit tamamlama:** `admin_override_match_score` (skor override) + `admin_refund_intent`
  (force refund/capture/void) butonlarını Maç Kontrol Paneli'ne bağla → §8.6 "her sorun panelden çözülür".
- **#13 Kapsam-dışı temizlik:** §2/§4.6 ile kaldırılan Topluluk/Turnuva/Promo/SaaS/PRO admin sayfaları
  (mağaza incelemesi öncesi sadeleştirme).
- **#14 Doğum tarihi onboarding alanı** (18-yaş/veli onayı için).
- **#15 Payout yaşam döngüsü e2e testi**.

---

## 5. USER'ın dış tedarik kalemleri (paralel başlatılabilir)
iyzico sözleşmesi · Apple Developer + Google Play hesapları · APNs `.p8` + FCM · yasal metinler (hukukçu)
· marka kiti · Ordu 4 saha anlaşması. *(Adım adım kılavuz için founder'a verilen çıkış planına bakınız.)*

---

> **Not:** Bu liste yaşayan belgedir. Yeni iş ertelendiğinde sebep+yapım yoluyla eklenir; tamamlananlar
> ✅ işaretlenir. Hiçbiri mevcut çalışan yapıyı bozmadan eklenebilecek şekilde tasarlanmıştır.
