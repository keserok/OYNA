# Runbook — Sır (Secret) Rotasyonu & Sızıntı Müdahalesi (Soru 40)

> **İlke:** Client'ta yalnız anon key. Tüm hassas anahtarlar **Supabase secrets**'te. `.env` gitignore'da.
> **Ön koşul (🙋 senin aksiyonun):** Repo'da secret scanning açık; her secret için sahip belirlenmiş.

## Secret envanteri & rotasyon takvimi

| Secret | Amaç | Sahip | Rotasyon | Nasıl set edilir |
|---|---|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Edge fonksiyonlarda tam yetki | 🙋 sen | 180 gün | Supabase Dashboard → API → rotate |
| `ADMIN_EDGE_SECRET` | admin-broadcast çağrı sırrı | 🙋 sen | 90 gün | `supabase secrets set ADMIN_EDGE_SECRET=...` |
| `ADMIN_ALLOWED_ORIGIN` | Admin edge CORS izinli origin | 🙋 sen | değişince | `supabase secrets set ADMIN_ALLOWED_ORIGIN=https://admin.oyna.app` |
| `ADMIN_IP_ALLOWLIST` | Admin edge IP allowlist (ops.) | 🙋 sen | değişince | `supabase secrets set ADMIN_IP_ALLOWLIST=1.2.3.4,10.0.0.0/24` |
| iyzico API anahtarları | Gerçek ödeme | 🙋 sen | 180 gün | `supabase secrets set IYZICO_*` |
| APNs KEY/KEY_ID/TEAM_ID/TOPIC | iOS push | 🙋 sen | anahtar süresi | `supabase secrets set APNS_*` |
| FCM service-account JSON | Android push | 🙋 sen | 180 gün | `supabase secrets set FCM_SERVICE_ACCOUNT=...` |
| `RESEND_API_KEY` | E-posta (makbuz/payout) | 🙋 sen | 180 gün | `supabase secrets set RESEND_API_KEY=...` |
| Sentry DSN | Hata izleme | 🙋 sen | değişince | admin build env + edge secret |

> `ADMIN_ALLOWED_ORIGIN` / `ADMIN_IP_ALLOWLIST` **boş bırakılırsa** admin edge kapısı dormant kalır (kısıt uygulanmaz). Set edilince otomatik devreye girer — kod değişikliği gerekmez.

## Rutin rotasyon (takvim geldiğinde)
1. Yeni anahtarı sağlayıcıdan üret.
2. `supabase secrets set <AD>=<yeni>` (staging → prod sırasıyla).
3. İlgili edge fonksiyonu yeniden deploy (secret okuma anında etkili; deploy şart değilse atla).
4. Düşük tutarlı **kanarya** işlemle doğrula (ödeme için düşük tutar, bildirim için test cihazı).
5. Eski anahtarı sağlayıcıda iptal et.
6. Rotasyonu not et (tarih + sahip).

## Sızıntı müdahalesi (acil)
1. **Hemen iptal:** Sızan anahtarı sağlayıcıda derhal geçersiz kıl.
2. **Yeni set:** Yukarıdaki adımlarla yenisini koy.
3. **Etki taraması:** Denetim Kayıtları + Supabase Logs'ta anormal kullanım ara.
4. Service-role sızdıysa: tüm edge fonksiyonlarını yeni anahtarla yeniden deploy et; gerekiyorsa DB'de şüpheli değişiklikleri PITR ile geri al (PITR_RESTORE.md).
5. Olayı INCIDENT_RESPONSE.md formatında kaydet.

## Doğrulama
- `git` geçmişinde secret aranmadığından emin ol (secret scanning yeşil).
- `.env` dosyaları `.gitignore`'da; repo'da yalnız `.env.example`.
