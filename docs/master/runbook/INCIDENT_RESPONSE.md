# Runbook — Olay Müdahale (Incident Response) (Soru 99)

> **İlke:** Her problem panelden çözülebilir (god-mode). Bu runbook senaryo → **panelden çözüm adımı** eşler.
> **Ön koşul (🙋 senin aksiyonun):** Harici uptime izleme (health endpoint + alarm) + Sentry hesabı.

## 0. Ortak ilk adımlar (her olayda)
1. **Kapsam:** Kaç kullanıcı? Para akışı etkilendi mi? (para = en yüksek öncelik)
2. **Bakım kararı:** Yaygın bozulma varsa Panel → **Ayarlar → Bakım Modu** ("BAKIM" yaz-onayla). Nokta atışı sorunda bakıma alma.
3. **Kanıt:** Panel → **Denetim Kayıtları** + Supabase **Logs** + (varsa) Sentry son 24s.

---

## Senaryo A — Ödeme akışı bozuk (tahsilat/iade tutmuyor)
- **Belirti:** Kullanıcı ödedi ama maç onaylanmadı / iade işlenmedi.
- **Panelden çözüm:**
  1. **Finans → Ödeme Müdahale**: intent'i ID/kullanıcıyla ara.
  2. Durum `BLOCKED` ise **Tahsil** veya **Void**; `CAPTURED` ise **İade** (yaz-onayla, audit).
  3. Sağlayıcı tarafı şüpheliyse **Finans → Go-Live & Mutabakat** ile 30 günlük deltayı gör.
  4. Yaygınsa **Go-Live** sekmesinden geçici **SIMULATION**'a dön (gerçek para durur), kök neden çözülünce IYZICO'ya geri al.

## Senaryo B — Bildirim gitmiyor (push/e-posta)
- **Panelden çözüm:**
  1. CommandCenter sağlık panosunda APNs/FCM/Resend secret'ları yeşil mi?
  2. Kampanyalar → "Sentinel test bildirimi" ile uçtan uca dene (kendi cihazına).
  3. Şablon bozuksa Bildirim Şablonları'ndan `{{...}}` değişkenlerini düzelt.
  4. Kök neden secret ise: `supabase secrets set ...` (bkz. SECRET_ROTATION.md).

## Senaryo C — DB yavaş / bağlantı hatası
- **Panelden/altyapıdan:**
  1. Supabase **Logs → Postgres** + `get_advisors(performance)` (eksik index).
  2. Realtime kopmuşsa panel otomatik poll fallback'e düşer (rozetler yine akar).
  3. Yaygın bozulma → Bakım Modu + gerekiyorsa PITR (bkz. PITR_RESTORE.md).

## Senaryo D — Payout hatası (owner/kaleci/hakem ödenmedi)
- **Panelden çözüm:**
  1. **Finans → Payout Talepleri**: ilgili talebi bul.
  2. Otomatik API başarısızsa manuel "Tamamla" (banka/iyzico referansıyla) — audit'lenir.
  3. Yanlış ödendi ise **admin_reverse_payout** (Finans, FINANCE yetkisi).

## Senaryo E — Şüpheli admin aktivitesi / yetki
- **Panelden çözüm:**
  1. **Denetim Kayıtları → Zincir Doğrula** (tamper kontrolü).
  2. Ghost oturumları `admin_ghost_sessions`'tan izlenir (kim/kimi/neden/süre).
  3. Şüpheli hesabı **Ekipler & Yetkiler**'den revoke et (SUPER_ADMIN; son admin düşürülemez guard'ı var).

---

## Kapanış (her olay)
- Etkiyi ve çözümü kısa yaz (tarih, kapsam, kök neden, önlem).
- Tekrarı önleyici app_config eşiği / feature-flag değişikliğini uygula.
- Gerekiyorsa bu runbook'a yeni senaryo ekle.
