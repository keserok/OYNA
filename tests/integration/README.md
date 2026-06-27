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
| `faz5_service_engine.sql` | Kaleci/hakem talep→tahsil→1-10 puan→anında payout, TC kimlik kapısı, self-rating guard, çakışma, maç iptalinde void/iade | 17 |
| `faz6_social_tactics.sql` | Mesajlaşma (arkadaş/engel kapısı), taktik oylama/yetki/favori/kopya/vitrin, kaptan devri, takım-vs-takım skor onayı (iki-taraf + idempotency) | 19 |
| `faz7_security_infra.sql` | Çoklu rol geçişi (set_active_role + sahiplik/geçersiz kapısı), yakındaki maçlar (earthdistance), admin skor düzeltme (audit + FORBIDDEN + INVALID_SCORE), maç hatırlatma (katılımcı bildirimi + idempotency) | 10 |

> **FAZ 7'de bu testin yakaladığı gerçek hatalar** (uygulamadan önce giderildi):
> (1) `protect_profile_sensitive_fields` trigger'ı `NEW.role` değişimini her non-admin
> için RAISE ediyor ve `app.bypass_role_protection` bayrağını ONURLANDIRMIYORDU →
> `set_active_role` (rol değiştirici) **her normal kullanıcıda çöküyordu** (Faz 5
> `rating_recompute` ile aynı sınıf); yalnız `role` alanı için bypass tanınarak
> düzeltildi (roles/is_admin/wallet/ban korumaları aynen sürer). (2) `admin_override_match_score`,
> `log_admin_action`'a 3. argümanı `p_match_id::text` (uuid beklenen yere text) geçiriyordu
> → çalışma anında tip uyuşmazlığıyla çöküyordu; `p_target_id=uuid` + old/new jsonb ile düzeltildi.

> **FAZ 6'da adversarial denetimin yakaladığı gerçek bulgular** (e2e değil, ikinci-ajan
> denetimi; `20260706000010_faz6_corrections.sql` ile giderildi): (1) skor finalize
> idempotent değildi + tek-katılımcı kısa yolu takım maçında istismar ediliyordu →
> idempotency + iki-taraf onayı; (2) `copy_tactic` kaynak okuma yetkisi yoktu (gizli
> taktik sızıntısı) → kaynak üyeliği şartı; (3) `tactics` doğrudan UPDATE ile is_active
> set edilip "yalnız yönetici" atlatılıyordu → koruma trigger'ı + GUC bypass; ayrılan
> üye taktik okuyabiliyordu → `tactics_select` is_active filtresi.

> **FAZ 5'te bu testin yakaladığı gerçek hata:** `protect_provider_sensitive_fields`
> trigger'ı `goalkeepers/referees.rating` değişimini yalnız admin'e izin veriyordu;
> katılımcı puanı sonrası `_recompute_provider_rating` (SECURITY DEFINER ama
> `auth.uid()`=katılımcı) bu trigger'a takılıp **tüm `submit_service_rating`'i
> çökertiyordu**. `app.rating_recompute` transaction-local GUC bayrağıyla yalnız bu
> yola izin verilerek düzeltildi.

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
