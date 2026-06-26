# 🧩 OYNA — Operasyonel Eksikler & Sonradan Eklenecekler

> **Amaç:** Fazlar ilerlerken; dış bağımlılık (iyzico sözleşmesi, secret'lar, lisans), ileri-faz kapsamı veya canlı-yayın adımı gerektirdiği için **bilinçli ertelenen** operasyonel işleri tek yerde tutmak.
> **İlke:** Bunların hepsi **kod bug'ı değildir** — altyapı (DB şeması, RPC, state machine) hazır bırakılmıştır; eksik olan yalnızca canlı bağlama/dış kaynaktır. Her madde **sonradan, mevcut yapıyı bozmadan** eklenebilecek şekilde tasarlanmıştır.
> **Nasıl okunur:** Her madde → **🎯 Sebep** (neden ertelendi) · **❗ Neden gerekli** · **🔧 Yapım yolu** · **🔗 Bağımlılık** · **📦 Hazır olan** · **⏳ Durum**.

---

## Durum Özeti

| # | Eksik | Faz | Öncelik | Bağımlılık | Durum |
|---|---|---|---|---|---|
| 1 | Gerçek iyzico pre-auth entegrasyonu | 2.1 | 🔴 Yüksek | iyzico merchant hesabı | ⏳ Bekliyor |
| 2 | Edge function'ların canlıya deploy'u | 2.1 | 🔴 Yüksek | #1 secret'lar | ⏳ Bekliyor |
| 3 | Para birimi & komisyon konfig doğrulama | 2.1 | 🟡 Orta | #1 | ⏳ Bekliyor |
| 4 | Kaleci/Hakem anlık (instant) payout akışı | 5 | 🟡 Orta | FAZ 5 | 🧱 İskelet hazır |
| 5 | Model B (saha %95 + markup) iş kuralı teyidi | 2.2 | 🟢 Düşük | İş kararı | 🧱 Hesap hazır |
| 6 | 2 haftalık owner payout → otomatik IBAN gönderimi | 2.3 | 🟡 Orta | #1 | 🧱 Serbest bırakma hazır |
| 7 | Kademeli iade tetikleyici (cron + maç saati) | 2.3 | 🟡 Orta | FAZ 3.2 | 🧱 RPC hazır |
| 8 | 18 yaş altı doğum tarihi toplama (onboarding) | 2.4 | 🟡 Orta | UI | 🧱 Kolon hazır |
| 9 | iyzico webhook imza/secret rotasyonu | 7.1 | 🟢 Düşük | #1 | ⏳ Bekliyor |
| 10 | Maça katılımı gerçek pre-auth blokajına bağlama | 3.2 | 🟡 Orta | #1 | 🧱 Settle/iade hazır |
| 11 | Özel maç (private_code) katılım UI'ı | 3.3 | 🟢 Düşük | UI | 🧱 RPC hazır |
| 12 | MyBookings: maça çevir / yol tarifi / tekrar rezerve | 3.1 | 🟢 Düşük | UI | ⏳ Bekliyor |

---

## 1. Gerçek iyzico Pre-Auth Entegrasyonu (blokaj → tahsil → void)

**🎯 Sebep:** Canlı ön-provizyon için iyzico **alt-üye işyeri (sub-merchant) sözleşmesi** ve `IYZICO_API_KEY` / `IYZICO_SECRET_KEY` gerekiyor. Bu ticari/hukuki bir adım; kod tarafında çözülemez.

**❗ Neden gerekli:** Tüm gelir ve "maç tutmazsa kimse ödemez" mantığı buna bağlı. Şu an `PaymentScreen` sandbox modunda çalışıyor (gerçek kart bloke edilmiyor; `payment_intents` kaydı `PENDING` oluşturuluyor).

**🔧 Yapım yolu:**
1. iyzico panelinden Auth/PreAuth (paymentSubType = `PRE_AUTH`) destekli ürün aç.
2. `supabase/functions/create-payment/index.ts` içinde `paymentGroup` + `PRE_AUTH` flag'i ile `/payment/iyzipos/checkoutform/initialize` çağrısı (zaten iskelet mevcut, sadece pre-auth moduna alınacak).
3. Yeni edge function `capture-payment`: iyzico `/payment/iyzipos/capture` → başarıda `service_role` ile **mevcut** `capture_preauth(intent_id)` RPC'sini çağır.
4. `void-payment` edge function: iyzico `/payment/iyzipos/cancel` → **mevcut** `void_preauth(intent_id)`.
5. `PaymentScreen.tsx`'te `// In production: call edge function` yorumunun olduğu yeri gerçek edge çağrısıyla değiştir; dönüş `BLOCKED` olunca ekranı göster.

**🔗 Bağımlılık:** iyzico merchant hesabı + Supabase secrets (`supabase secrets set IYZICO_SECRET_KEY=...`).

**📦 Hazır olan:** `payment_intents` state machine (`PENDING→BLOCKED→CAPTURED/VOIDED`), `apply_preauth_block` / `capture_preauth` / `void_preauth` RPC'leri (service_role korumalı), `create_match_preauth`, komisyon motoru.

**⏳ Durum:** Bekliyor — DB tarafı %100 hazır, yalnızca canlı sağlayıcı bağlanacak.

---

## 2. Edge Function'ların Canlıya Deploy'u

**🎯 Sebep:** `create-payment` (canlıda eski v1, yalnız SIMULATION) ve `payment-webhook` (repoda var, canlıda **deploy edilmemiş**). Deploy, gerçek iyzico secret'ları olmadan anlamsız (runtime'da hata verir).

**❗ Neden gerekli:** İmza/token doğrulamalı webhook olmadan sahte "ödendi" ile bedava rezervasyon riski.

**🔧 Yapım yolu:**
```bash
supabase secrets set IYZICO_API_KEY=... IYZICO_SECRET_KEY=... IYZICO_BASE_URL=https://api.iyzipay.com
supabase functions deploy create-payment
supabase functions deploy payment-webhook --no-verify-jwt
```
Webhook callback URL'ini iyzico panelinde `https://<project>.functions.supabase.co/payment-webhook` olarak ayarla.

**🔗 Bağımlılık:** #1.

**📦 Hazır olan:** `payment-webhook/index.ts` token doğrulaması + 401 dönüşü; `create-payment/index.ts` iyzico checkout iskeleti (kuruş/TL hatası düzeltildi).

**⏳ Durum:** Bekliyor.

---

## 3. Para Birimi & Komisyon Konfig Doğrulama (canlı öncesi)

**🎯 Sebep:** Sandbox'ta maskelenen birim/oran tutarsızlıkları yalnız gerçek tahsilatta görünür.

**❗ Neden gerekli:** 100× yanlış tahsilat veya yanlış komisyon = doğrudan gelir kaybı.

**🔧 Yapım yolu:**
1. `create-payment` artık `intent.amount`'ı TL kabul ediyor (`/100` kaldırıldı) — canlıda bir sandbox işlemiyle teyit et.
2. `settings.iyzico_sandbox_mode`, `capture_window_hours` (8), `min_quorum_pct` (70), `owner_payout_days` (14) değerlerini admin panelinden gözden geçir.
3. Admin → Komisyon sayfasından GLOBAL %15 / SERVICE_GK %10 / SERVICE_REF %10 doğrula.

**🔗 Bağımlılık:** #1.

**📦 Hazır olan:** `calculate_commission` (scope precedence + Model B markup düzeltildi), `commission_config` admin CRUD sayfası.

**⏳ Durum:** Bekliyor.

---

## 4. Kaleci/Hakem Anlık (PROVIDER_INSTANT) Payout Akışı

**🎯 Sebep:** Bu akış **FAZ 5 (Kaleci & Hakem)** kapsamında. FAZ 2'de yalnız iskelet bırakıldı.

**❗ Neden gerekli:** 3. gelir akışı; kaleci/hakem emeğinin karşılığını maç sonu değerlendirme sonrası **anında** almalı (§2.3, §5.2).

**🔧 Yapım yolu (FAZ 5'te):**
1. GK/REF hizmet ödemesi için ayrı pre-auth/capture yolu (maç pre-auth'tan ayrı).
2. `capture` sırasında `SERVICE_GK` / `SERVICE_REF` komisyonu (`calculate_commission(amount,'SERVICE_GK')`) uygula → `service_provider_amount` doldur.
3. Service provider'a `EARNINGS` yazıp **anında** `payout_type='PROVIDER_INSTANT'` `payout_request` üret (owner gibi 2 hafta bekleme yok).
4. `related_entity_type` = `GK_SERVICE` / `REF_SERVICE` set et.

**🔗 Bağımlılık:** FAZ 5.

**📦 Hazır olan:** `payout_requests.payout_type='PROVIDER_INSTANT'`, `commission_config` SERVICE_GK/REF %10 seed'leri, `payment_intents.service_provider_amount` kolonu, `related_entity_type` GK_SERVICE/REF_SERVICE değerleri.

**⏳ Durum:** İskelet hazır — FAZ 5'te bağlanacak.

---

## 5. Model B (saha %95 + değişken markup) İş Kuralı Teyidi

**🎯 Sebep:** "Saha %95 + değişken markup"ın tam matematiği bir **iş/fiyatlandırma kararı**. Şu an markup additive olarak uygulanıyor (komisyon = oran% + markup%); kesin model onaylanınca ince ayar yapılabilir.

**❗ Neden gerekli:** İki gelir modeli (Model A kapora %15 / Model B markup) net olmalı.

**🔧 Yapım yolu:** İş kararı netleşince `calculate_commission` içindeki `MODEL_B` dalını güncelle; gerekiyorsa `markup_amt`'ı oyuncunun ödediği fiyata ekleyip owner'a tam saha bedelini bırak.

**🔗 Bağımlılık:** İş kararı.

**📦 Hazır olan:** `calculate_commission` MODEL_B dalı + `markup_pct`/`markup_amt` (artık tüketiliyor), admin panel düzenleme.

**⏳ Durum:** Hesap hazır — kural teyidi bekliyor.

---

## 6. 2 Haftalık Owner Payout → Otomatik IBAN Gönderimi

**🎯 Sebep:** Kazançların `COMPLETED`'a çevrilmesi (serbest bırakma) hazır ve cron'lu; ama IBAN'a **fiili para gönderimi** iyzico payout API'sine (veya manuel admin onayına) bağlı.

**❗ Neden gerekli:** Saha sahibi parasını öngörülebilir şekilde almalı (§2.3).

**🔧 Yapım yolu:**
1. `release_owner_earnings` cron'u (saatlik, mevcut) olgunlaşan kazancı `COMPLETED` yapıyor.
2. Eklenecek: olgunlaşan owner kazancı için otomatik `payout_type='OWNER_BIWEEKLY'` `payout_request` üreten bir adım (kayıtlı IBAN ile).
3. `admin_process_payout(payout_id,'COMPLETED',ref)` (mevcut) ile sonuçla; iyzico payout API entegre edilirse otomatikleşir.

**🔗 Bağımlılık:** #1 (gerçek para çıkışı için).

**📦 Hazır olan:** `release_owner_earnings` RPC + saatlik cron, `admin_process_payout` (rezerve senkronlu), `payout_requests.OWNER_BIWEEKLY`.

**⏳ Durum:** Serbest bırakma hazır — otomatik IBAN gönderimi bekliyor.

---

## 7. Kademeli İade Tetikleyici (cron + maç saati)

**🎯 Sebep:** `process_tiered_refund(intent_id, hours_to_match)` RPC'si hazır ama "maç saatine kalan saat"i hesaplayıp tetikleyen otomatik akış **FAZ 3.2 (maç yaşam döngüsü)** ile birlikte gelir.

**❗ Neden gerekli:** İptal kuralları net olmalı: T-8s ücretsiz / T-3s OYNA kredisi / sonrası iadesiz.

**🔧 Yapım yolu (FAZ 3.2):**
1. Maç iptal/çıkış akışında `matches.date`+`matches.time`'dan kalan saati hesapla.
2. `process_tiered_refund(intent_id, hours)` çağır — RPC kademeyi uygular (void / tam iade / REFUND_CREDIT / iadesiz).
3. Opsiyonel: süresi geçen iptalleri tarayan cron.

**🔗 Bağımlılık:** FAZ 3.2.

**📦 Hazır olan:** `process_tiered_refund` RPC, `settings.refund_free_hours`(8)/`refund_credit_hours`(3), `REFUND_CREDIT` bakiye tipi.

**⏳ Durum:** RPC hazır — FAZ 3.2 akışına bağlanacak.

---

## 8. 18 Yaş Altı Doğum Tarihi Toplama (onboarding)

**🎯 Sebep:** `profiles.birthdate` kolonu eklendi; ama kayıt/onboarding akışında **doldurulması** UI işi.

**❗ Neden gerekli:** Veli onayı akışı (§2.4) yaşı bilmeden tetiklenemez; yasal zorunluluk.

**🔧 Yapım yolu:** Onboarding/profil ekranına doğum tarihi alanı ekle → `profiles.birthdate` güncelle. `PaymentScreen` bu alanı zaten okuyor; dolunca minor akışı otomatik devreye girer.

**🔗 Bağımlılık:** Onboarding UI.

**📦 Hazır olan:** `profiles.birthdate` kolonu, `PaymentScreen` minor tespiti + veli onayı + `record_minor_consent` (sahiplik doğrulamalı).

**⏳ Durum:** Kolon hazır — toplama UI'ı bekliyor.

---

## 9. iyzico Webhook İmza / Secret Rotasyonu

**🎯 Sebep:** Üretim güvenlik sıkılaştırması **FAZ 7.1** kapsamında.

**❗ Neden gerekli:** Secret sızıntısı/eskime riskine karşı.

**🔧 Yapım yolu (FAZ 7.1):** Supabase secrets rotasyon planı; webhook'ta inbound imza doğrulama (HMAC) eklenebilir.

**🔗 Bağımlılık:** #1.

**📦 Hazır olan:** Token-retrieve doğrulamalı webhook.

**⏳ Durum:** Bekliyor (FAZ 7).

---

## 10. Maça Katılımı Gerçek Pre-Auth Blokajına Bağlama

**🎯 Sebep:** Şu an maça katılım `pay_public_match_deposit` ile cüzdandan **anında** 50₺ çeker (gerçek kart blokajı/pre-auth değil). Gerçek blokaj iyzico go-live'a (#1) bağlı.

**❗ Neden gerekli:** Roadmap §3.2 "katılım BLOKAJLA" der — para maç onaylanana (T-8s) kadar bloke tutulmalı, anında çekilmemeli.

**🔧 Yapım yolu:** `pay_public_match_deposit` yerine `create_match_preauth` (BLOCKED intent) çağır; `process_match_at_deadline` zaten hem cüzdan (MATCH_FEE) hem intent (BLOCKED→CAPTURED/VOIDED) yollarını destekliyor — UI'yı intent yoluna geçir.

**🔗 Bağımlılık:** #1 (gerçek iyzico).

**📦 Hazır olan:** `process_match_at_deadline` çift-yol uzlaştırması (onayda settle, iptalde **gerçek iade** — smoke test geçti), `create_match_preauth`/`capture_preauth`/`void_preauth`.

**⏳ Durum:** Cüzdan yolu tam çalışıyor (anında çekim + iptalde otomatik iade). Gerçek blokaj #1 ile gelecek.

---

## 11. Özel Maç (private_code) Katılım UI'ı

**🎯 Sebep:** DB tarafı hazır; oluşturma/katılım UI akışı (kod gösterimi + kodla katılma) henüz bağlanmadı.

**❗ Neden gerekli:** Roadmap §3.3 açık/özel maç (özel kod ile katılım).

**🔧 Yapım yolu:** Oluşturmada PRIVATE seçeneği → dönen `private_code`'u göster/paylaş; katılımda kod girişi → `resolve_private_match(code)` → maç lobisine yönlendir. `useMatchCreate`'te `visibility:'OPEN'` sabitini seçilebilir yap.

**🔗 Bağımlılık:** UI.

**📦 Hazır olan:** `resolve_private_match` RPC, `player_create_match` PRIVATE→6 haneli kod üretimi, `matches.visibility/private_code` kolonları, `MatchListing.visibility/privateCode` tipleri.

**⏳ Durum:** RPC hazır — katılım UI'ı bekliyor.

---

## 12. MyBookings İkincil İşlemler (maça çevir / yol tarifi / tekrar rezerve)

**🎯 Sebep:** Çekirdek rezervasyon + iptal çalışıyor; ikincil kolaylıklar henüz eklenmedi.

**❗ Neden gerekli:** Roadmap §3.1 "Rezervasyonlarım (iptal/yol tarifi/tekrar rezerve/maça çevir)".

**🔧 Yapım yolu:** "Maça çevir" → rezervasyondan `player_create_match`'e pitch_id+tarih taşı; "Yol tarifi" → harita deep link; "Tekrar rezerve" → aynı slot ile booking akışını ön-doldur.

**🔗 Bağımlılık:** UI.

**📦 Hazır olan:** `MyBookings` iptal (`cancel_app_booking`), booking akışı, `player_create_match` (pitch_id'li).

**⏳ Durum:** Bekliyor (FAZ 3.1 cilası).

---

> **Not:** Bu liste yaşayan bir belgedir. Yeni faz başlarken ertelenen her operasyonel iş buraya **sebep + yapım yolu** ile eklenir; tamamlananlar "✅ Tamamlandı" olarak işaretlenip arşivlenir. Hiçbiri mevcut çalışan yapıyı bozmadan eklenebilecek şekilde tasarlanmıştır.
