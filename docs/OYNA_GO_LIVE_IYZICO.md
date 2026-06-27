# OYNA — iyzico Go-Live Runbook (Para Motoru Aktivasyonu)

> **Durum:** Para motoru SIMULATION'da çalışıyor ve test edildi. Bu doküman,
> iyzico sözleşmesi/KYC tamamlanınca **gerçek para akışını açma** adımlarını ve
> önce verilmesi gereken **ürün kararlarını** listeler. Faz 7 kod tarafı, bu
> aktivasyonu "yalnız env doldur + birkaç wiring" haline getirecek şekilde hazır.

## 0. Önkoşul (USER tedarik)
- [ ] iyzico **sözleşmesi + KYC** (alt-üye işyeri / marketplace payout + pre-auth yetkisi)
- [ ] iyzico **API anahtarları** (sandbox → prod)

## 1. Ortam değişkenleri (Supabase → Edge Functions → Secrets)
```
PAYMENT_PROVIDER=IYZICO                 # SIMULATION → IYZICO
IYZICO_API_KEY / IYZICO_SECRET_KEY
IYZICO_BASE_URL=https://api.iyzipay.com # prod
IYZICO_CALLBACK_URL=https://<proje>.supabase.co/functions/v1/payment-webhook
PAYMENT_EDGE_SECRET=<rastgele>          # capture/void/refund sistem çağrısı yetkisi
EMAIL_EDGE_SECRET / RESEND_API_KEY      # makbuz/payout e-postaları (opsiyonel)
ALLOWED_ORIGIN=https://app.oyna.com     # edge CORS kısıtı
```

## 2. Edge function deploy (hazır, repoda)
```
supabase functions deploy create-payment        # mevcut (checkout başlatma)
supabase functions deploy capture-payment        # YENİ — pre-auth TAHSİL
supabase functions deploy void-payment           # YENİ — pre-auth ÇÖZÜM
supabase functions deploy refund-payment         # YENİ — kademeli/karta iade
supabase functions deploy send-email             # YENİ — Resend makbuz/payout
```

## 3. Mevcut durum (ne hazır, ne aktive edilecek)

| Parça | Durum | Go-live'da |
|------|-------|-----------|
| `auto_process_matches` cron (10dk) | ✅ CANLI — T-8s'te due maçları işler | Değişmez; SIMULATION'da DB capture/void yapar |
| `process_match_at_deadline` | ✅ CANLI + faz3 test | quorum ✓→CONFIRMED+capture; ✗→CANCELLED+iade |
| `capture_preauth` / `void_preauth` RPC | ✅ | capture/void edge'leri bunları sarar |
| `process_tiered_refund` | ✅ + `admin_refund_intent` ile admin çağrısı | refund-payment edge bunu sarar |
| `commission_config` SSOT motoru | ✅ CANLI | 4 seviye admin-yönetimli (global/saha/hizmet/maç, A/B+markup) |
| capture/void/refund **edge** | ✅ repoda, deploy bekliyor | deploy + PROVIDER=IYZICO |

## 4. Go-live wiring (kalan kod adımları)
1. **Pre-auth başlatma (maç katılımı):** `create-payment` edge'ine "maç ödemesi" dalı
   eklenip `create_match_preauth` (PENDING→ iyzico pre-auth → BLOCKED) çağrılmalı.
   *(Şu an doğrudan rezervasyon `create_payment_intent` ile tahsil ediliyor; maç
   katılımı pre-auth'a bağlanacak.)*
2. **T-8s provider capture/void:** `process_match_at_deadline`'ın inline DB
   capture'ı, IYZICO modunda gerçek provider tahsilini tetiklemeli — pg_net ile
   `capture-payment`/`void-payment` edge çağrısı (intent başına) veya cron'u
   bu edge'lere taşıyarak. SIMULATION davranışı korunur.
3. **İptal → iade:** `cancel_app_booking` ve maç iptal yolları, ad-hoc iade yerine
   `refund-payment` edge'ini (kademeli + karta iade) çağıracak şekilde bağlanmalı.

## 5. Önce verilmesi gereken ÜRÜN kararları (USER)
- **Rezervasyon iptal penceresi:** kod şu an **48s / sabit %90 kredi**; prensip §3.5
  **24s + kademeli (admin ayarlı)** diyor. `cancel_app_booking` buna hizalanmalı.
- **Kademeli oranlar:** `settings.refund_free_hours` (8) / `refund_credit_hours` (3)
  ve rezervasyon için 24s eşiği son değerler? (admin ayarlı, varsayılan belirle.)
- **İade hedefi:** kart mı OYNA kredisi mi (veya tutara göre)? `process_tiered_refund`
  şu an **yalnız OYNA kredisi**; karta iade refund-payment ile go-live'da.
- **İadede komisyon:** "alınmış komisyon/markup düşülür" (§4.4) — şu an tam tutar iade
  ediliyor; düşülecek mi? (process_tiered_refund'a komisyon-düşümü eklenecek.)
- **Model B net dağıtım:** owner taban %95 + markup oyuncuya EK (payer taban×1.20,
  owner ×0.95, OYNA = %5+markup). `calculate_commission` Model B net formülü buna
  göre güncellenecek (bkz. migration 20260707000003 go-live notu).
- **Model B tetikleyici:** "saha sahibi boş saat açtı → MODEL_B" akışı; owner-maç
  oluşturma `matches.commission_model='MODEL_B'` set edecek.

## 6. Lansman öncesi doğrulama
- [ ] Sandbox'ta uçtan uca: pre-auth blokaj → T-8s capture → owner payout (14g) → iade
- [ ] Kaleci/hakem anında payout (değerlendirme sonrası) sandbox'ta
- [ ] `payment-webhook` imza doğrulaması prod anahtarlarıyla
- [ ] Kademeli iade (full/credit/none) + karta iade sandbox'ta
- [ ] e2e test paketi (tests/integration/faz2,3,5,7*) yeşil
