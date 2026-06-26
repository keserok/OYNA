# OYNA — DB/RPC Entegrasyon Testleri (FAZ 0–3)

Bu klasör, para ve maç akışlarını **gerçek Postgres fonksiyonları** üzerinde
doğrulayan izole entegrasyon testlerini içerir. Her test dosyası tek bir
`BEGIN; … ROLLBACK;` işlemi içinde çalışır — **canlı veride hiçbir kalıntı
bırakmaz**.

## Çalıştırma

Supabase SQL Editor'da veya `psql` ile her `.sql` dosyasını olduğu gibi
çalıştırın. Sonuç tablosu `test | result(PASS/FAIL) | got` döner.

```bash
psql "$DATABASE_URL" -f tests/integration/faz0_1_2_commission.sql
psql "$DATABASE_URL" -f tests/integration/faz2_payment_engine.sql
psql "$DATABASE_URL" -f tests/integration/faz3_match_lifecycle.sql
```

> Not: Testler `auth.users`'a geçici kullanıcı ekler (profil trigger'ı otomatik
> profil yaratır) ve `set_config('request.jwt.claims', …, true)` ile `auth.uid()`
> kimliğini taklit eder. Tümü transaction sonunda ROLLBACK ile geri alınır.

## Kapsam

| Dosya | Kapsam | Test |
|------|--------|------|
| `faz0_1_2_commission.sql` | Rol CHECK temizliği, Ordu seed, komisyon motoru | 12 |
| `faz2_payment_engine.sql` | Blokaj→tahsil→owner kazanç, cüzdan, payout | 12 |
| `faz3_match_lifecycle.sql` | Quorum onay/iptal-iade, finalize, whitelist, özel maç, kademeli iade | 20 |
| `faz3_money_fixes_round3_4.sql` | Booking iadesi, çift-ödeme, ayrılma iadesi, wallet_ctx güvenliği | 8 |

## Bu testlerin yakaladığı gerçek hatalar (8 üretim hatası)

1. **`process_match_at_deadline` CONFIRM dalı** — owner-kazanç INSERT'i 9 kolon /
   8 değer uyuşmazlığı taşıyordu → kapora toplanmış her maçın quorum onayı
   çöküyordu. (round2)
2. **`notify_match_cancelled` trigger** — var olmayan `notifications.type`/`is_active`
   kolonlarına yazıyordu → her maç iptali çöküyordu. (round2)
3. **`notify_ref_status_change` trigger** — aynı hata → her hakem atama/kaldırma
   çöküyordu. (round2)
4. **`notify_match_joined` trigger** — aynı hata → maça katılım çökme riski. (round2)
5. **`send_match_invite` RPC** — aynı hata → maç/takım daveti çökme riski. (round2)
6. **`cancel_app_booking`** — %90 iadeyi hiçbir cüzdana işlemiyordu (para kaybı);
   artık REFUND_CREDIT olarak yazıyor. (round3)
7. **`pay_public_match_deposit`** — çift ödeme koruması yoktu (çift tahsilat);
   artık ALREADY_PAID. **`leave_public_match_slot`** — ayrılan oyuncuya iade
   yoktu (para kaybı); artık iade ediyor. (round3)
8. **`protect_profile_sensitive_fields`** (CRITICAL) — trigger, normal kullanıcı
   `auth.uid()` olduğunda wallet_balance değişimini her durumda bloklayıp cüzdan
   tabanlı maç ödemesini TAMAMEN kırıyordu; `app.wallet_ctx` GUC bayrağı ile
   yalnız SECURITY DEFINER para fonksiyonlarına izin verecek şekilde düzeltildi
   (doğrudan istemci UPDATE'i hâlâ bloklu). (round4)

> Not: Statik denetimde "hata" görünen ama canlı DB'ye karşı YANLIŞ POZİTİF çıkan
> 3 bulgu (MATCH-COL-003, NOTIF-TYPE-001/002) entegrasyon testleri ve canlı şema
> sorgusuyla elendi — migration dosyaları sonradan `CREATE OR REPLACE` ile
> düzeltilmişti. Repo tutarlılığı için round3 yine de bu iki admin fonksiyonunu
> `type_key` ile yeniden tanımlar.
