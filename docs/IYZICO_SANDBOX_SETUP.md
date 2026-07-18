# iyzico Sandbox Kurulumu & Test Runbook

Bu belge, elinizdeki **iyzico sandbox anahtarlarıyla** OYNA ödeme akışını
gerçek para çekmeden uçtan uca test etmenin adımlarını verir. Seçilen
entegrasyon modu: **Hosted Checkout Form** (kart bilgisi iyzico'nun sayfasında
girilir; PAN sizin sunucunuza gelmez → PCI yükü minimum, App Store/Play uyumlu).

> ⚠️ **Güvenlik:** Secret key'leri hiçbir sohbete/committe yapıştırmayın. Yalnızca
> Supabase **Edge Function Secrets** olarak durmalıdır.

---

## Mimari: iki ayrı anahtar (ikisi de IYZICO olmalı)

| Katman | Anahtar | Nerede ayarlanır |
|---|---|---|
| Edge fonksiyonları (para çeken taraf) | `PAYMENT_PROVIDER` secret | Supabase → Edge Functions → Secrets |
| DB ödeme RPC'leri (niyeti yöneten taraf) | `app_config.payment_provider` | SQL / Admin panel "Go-Live" toggle |

Biri IYZICO diğeri SIMULATION kalırsa akış tutarsız olur. **İkisini birlikte** çevirin.

Sandbox testinde bile mod **IYZICO**'dur — fark, `IYZICO_BASE_URL`'in sandbox'a
işaret etmesidir (`https://sandbox-api.iyzipay.com`). Gerçek kart çekilmez.

---

## Adım 1 — Edge Function secret'larını ayarla

Supabase Dashboard → Project → **Edge Functions → Manage secrets** (veya CLI).

```bash
# Supabase CLI ile (yerelden, kendi makinenizde — secret'lar burada kalır):
supabase secrets set \
  PAYMENT_PROVIDER=IYZICO \
  IYZICO_API_KEY=sandbox-xxxxxxxxxxxxxxxx \
  IYZICO_SECRET_KEY=sandbox-xxxxxxxxxxxxxxxx \
  IYZICO_BASE_URL=https://sandbox-api.iyzipay.com \
  IYZICO_CALLBACK_URL=https://<PROJE-REF>.supabase.co/functions/v1/payment-webhook \
  --project-ref <PROJE-REF>
```

- `IYZICO_API_KEY` / `IYZICO_SECRET_KEY`: iyzico sandbox panelinizden (Merchant → API anahtarları).
- `IYZICO_BASE_URL`: **sandbox için** `https://sandbox-api.iyzipay.com` (prod: `https://api.iyzipay.com`).
- `IYZICO_CALLBACK_URL`: webhook fonksiyonunuzun tam URL'i (aşağıda deploy edilecek).

> `SUPABASE_URL` ve `SUPABASE_SERVICE_ROLE_KEY` Supabase tarafından edge'e
> otomatik enjekte edilir; onları elle set etmenize gerek yok.

---

## Adım 2 — Edge fonksiyonlarını deploy et

```bash
supabase functions deploy create-payment   --project-ref <PROJE-REF>
supabase functions deploy payment-webhook   --no-verify-jwt --project-ref <PROJE-REF>
supabase functions deploy capture-payment   --project-ref <PROJE-REF>
supabase functions deploy void-payment      --project-ref <PROJE-REF>
supabase functions deploy refund-payment    --project-ref <PROJE-REF>
```

- `payment-webhook` **mutlaka `--no-verify-jwt` ile** deploy edilir — iyzico
  callback'i JWT göndermez; doğrulama fonksiyon içinde iyzico `/checkoutform/auth`
  ile yapılır (imza doğrulanmadan ödeme UYGULANMAZ).

---

## Adım 3 — DB tarafını IYZICO'ya çevir + migration'ları uygula

Önce yeni migration'ları uygulayın (cüzdan v2 + kayıtlı kartlar):

```bash
supabase db push --project-ref <PROJE-REF>
```

Sonra provider'ı çevirin (SQL Editor'de veya admin panel Finans → Go-Live toggle):

```sql
UPDATE public.app_config
SET value = '"IYZICO"'::jsonb
WHERE key = 'payment_provider';
```

Geri almak için (acil durdurma): aynı satırı `'"SIMULATION"'` yapın.

---

## Adım 4 — Ön-uçuş (preflight) doğrula

Admin panel → **Finans → Go-Live & Mutabakat**, ya da SQL:

```sql
SELECT * FROM public.admin_payment_golive_readiness();
```

Beklenen:
- `payment_provider` → `ok=true`, detay "IYZICO (CANLI)"
- `no_stuck_intents` → askıda PENDING/BLOCKED intent 0 olmalı (test öncesi temizleyin)
- `readonly_mode_off` → true (acil durdurma kapalı)
- `commission_configured` → true (%15 global tanımlı)

---

## Adım 5 — Test senaryosu (bugün canlı çalışan yol)

**Hosted checkout ile uçtan uca test edilebilen yol: Saha kaporası (mevcut rezervasyon).**

1. Uygulamada oyuncu olarak giriş → **Maçlarım** (Rezervasyonlar segmenti) → kaporası ödenmemiş bir rezervasyon → **Kaporayı Öde**.
2. Ödeme ekranında kart yöntemi seçilip ödeme başlatılınca, canlı (IYZICO) modda
   akış **iyzico hosted checkout sayfasına** yönlenir (`create-payment` → `checkoutUrl`).
3. iyzico sandbox test kartını girin (aşağıda), 3DS ekranında OTP: **283126**.
4. Ödeme sonrası iyzico, `payment-webhook`'a POST eder → imza doğrulanır →
   `apply_booking_payment` idempotent olarak rezervasyonu **PAID** yapar.

### iyzico sandbox test kartları

| Kart No | Banka | Sonuç |
|---|---|---|
| `5528790000000008` | Halkbank (Master) | Başarılı |
| `4766620000000001` | Denizbank (Visa) | Başarılı |
| `5890040000000016` | Bonus (Master) | Başarılı |
| `4603450000000000` | (Visa) | **Yetersiz bakiye** (hata testi) |

- Son kullanma: gelecekteki herhangi bir tarih (ör. `12/30`), CVV: `123`.
- 3DS OTP: **`283126`**.

---

## Bilinen boşluklar (canlıya tam geçmeden önce)

Sandbox test kurulumu için bunlar **engel değil**, ama tam go-live'dan önce
kapatılmalı. Hepsi bilinçli olarak `PROVIDER_FLOW_REQUIRED` ile korumaya alındı
(hayalet bakiye/çift tahsilat olmasın diye):

1. **Para yükleme, maça katılım (kart), saha vitrini kaporası** → canlı modda
   henüz hosted checkout'a bağlı değil; şu an `PROVIDER_FLOW_REQUIRED` hatası verir.
   Bunları bağlamak "köprü katmanı" işidir (bir sonraki adım):
   `wallet_topup` / `player_buy_slots_v2` / `record_app_deposit_payment`'in kart
   kısmı → `create-payment` (yeni action'lar) → hosted checkout → webhook'ta
   ilgili apply RPC'si.
2. **Webhook redirect UX:** `payment-webhook` başarıda düz `"OK"` döndürür;
   kullanıcının tarayıcısı boş sayfada kalır. Prod'da başarı/başarısızlık deep
   link'ine yönlendirme eklenmeli (ör. `oyna://payment/success?intent=...`).
3. **Buyer bilgisi:** `create-payment` şu an sabit test buyer (ad/e-posta/TC)
   gönderiyor. Prod'da 3DS/fraud için gerçek kullanıcı bilgisi gönderilmeli.
4. **Kapora blokaj (maç oluşturma):** `match_block_deposit` intent'i iyimser
   `BLOCKED` yazıyor; gerçek ön-provizyon için iyzico "block/preauth" çağrısı
   `capture-payment` kalıbıyla bağlanmalı (`[IYZICO-TODO]` işaretli).

---

## Rollback (SIMULATION'a dön)

```sql
UPDATE public.app_config SET value = '"SIMULATION"'::jsonb WHERE key = 'payment_provider';
```
```bash
supabase secrets set PAYMENT_PROVIDER=SIMULATION --project-ref <PROJE-REF>
```
Acil durumda tüm para işlemlerini tek anahtarla dondurmak için:
`app_config.admin_readonly_mode = true` (admin panel Sistem Parametreleri).
