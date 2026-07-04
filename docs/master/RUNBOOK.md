# OYNA — Çalıştırma & Kurtarma Kılavuzu (RUNBOOK)

> Bu belge yazılımcı olmadan sistemi yönetmen için yazıldı. Çoğu işlem **OYNA OS GodView panelinden** yapılır. Panelden çözülemeyen birkaç şey için "Supabase panosu" adımları verildi.

---

## 1. Kontrol panelin: önce buraya bak

| İhtiyaç | Nerede |
|---|---|
| Kuralları değiştir (komisyon hariç sayısal/açık-kapalı ayarlar) | **Sistem Parametreleri** ekranı |
| Komisyon oranı | **Komisyon** ekranı |
| Bir maça müdahale (kadro, skor, ödeme, bildirim, kayıt) | **Maçlar → maç detayı (Kokpit)** |
| Para işlemleri / payout / mutabakat / go-live kontrol | **Finans** ekranı |
| Toplu bildirim + şablonlar + geçmiş | **Kampanyalar** ekranı |
| Onay kuyrukları (tesis, kaleci/hakem, kimlik) | **Doğrulama** ekranları |
| Kim ne yaptı (değiştirilemez kayıt) | **Denetim Kaydı (Audit)** ekranı |

---

## 2. Acil durum: "Bir şeyler ters gidiyor, parayı durdur"

**Tek anahtarla tüm para işlemlerini dondur:**
1. **Sistem Parametreleri → Güvenlik → "Salt-Okunur Acil Durdurma" (admin_readonly_mode)** → **AÇIK** yap.
2. Artık hiçbir god-mode para işlemi (zorla tahsil/iptal/iade, payout) çalışmaz; "READ_ONLY_MODE" hatası verir.
3. Sorun çözülünce aynı anahtarı **KAPALI** yap. (Bu anahtarı kapatmak her zaman mümkündür — kilitlenmezsin.)

**Demo verisi yanlışlıkla görünüyorsa:** Sistem Parametreleri → Sistem → `demo_mode_enabled` = KAPALI (zaten varsayılan kapalı). Demo tesis/kaleci/hakem tüketici uygulamasında gizlenir.

**Yanlış toplu bildirim gönderdiysen:** Gönderilen in-app bildirimler geri alınamaz; ama **gerçek push `push_live_enabled` kapalıyken telefonlara GİTMEZ** (sadece uygulama içinde görünür). Lansman öncesi bu anahtar kapalı olduğu sürece "yanlış push" riski yoktur.

---

## 3. Yedekleme & Felaket Kurtarma (PITR)

**Hedefler:**
- **RPO (kabul edilebilir veri kaybı): ≤ 5 dakika** — Supabase PITR (Point-in-Time Recovery) açıksa.
- **RTO (toparlanma süresi): ≤ 1 saat** — geri yükleme + doğrulama.

**PITR'yi açmak (KURUCU AKSİYONU — bir kez):**
- Supabase Panosu → **Project → Database → Backups → Point in Time** → planı etkinleştir.
- PITR olmadan yalnız günlük yedek olur (RPO ~24 saat). Lansman öncesi mutlaka aç.

**"Yanlışlıkla sildim / bozuldu" senaryosu — geri yükleme:**
1. Supabase Panosu → Database → Backups → **Restore to a point in time**.
2. Bozulmadan **hemen önceki** zamanı seç (örn. olaydan 1 dk önce).
3. Geri yükleme bittikten sonra **GodView → Dashboard** aç, sayıların makul olduğunu doğrula.
4. **Denetim Kaydı** ekranından son işlemleri kontrol et.
5. Ödeme tarafında **Finans → Mutabakat** ile tutarların tutarlı olduğunu doğrula.

> Not: Geri yükleme tüm projeyi o ana döndürür. Geri yükleme ile o an arası yapılan işlemler kaybolur — bu yüzden olabildiğince yakın bir zaman seç.

---

## 4. Sık olaylar ve panelden çözüm

| Olay | Çözüm |
|---|---|
| Oyuncu "maça katılamıyorum/yanlış slot" | Maç Kokpiti → **Kadro & Slot** → slottan çıkar / ata |
| Skor yanlış girildi | Maç Kokpiti → **Sonuç & Hakem** → skoru düzelt (tüm zincir + bildirim otomatik) |
| Ödeme askıda kaldı (PENDING/BLOCKED) | Maç Kokpiti → **Ödeme** → Tahsil / İptal (Void) / İade (yazı-ile-onay ister) |
| Para çekme (payout) onayı | Finans → ilgili talep → **COMPLETED** (banka referansı ZORUNLU) |
| Yanlış payout onayladım | Finans → **Geri Al (reverse)** — talebi PENDING'e döndürür |
| Bildirimde yazım hatası | Kampanyalar → **Şablonlar** → metni düzelt (davranış kilitli, sadece kelimeler) |
| Sahte/uygunsuz tesis-kaleci-hakem | Doğrulama ekranı → reddet; veya ilgili kayıt yönetimi |

---

## 5. İzleme (opsiyonel, KURUCU AKSİYONU)

Kod tarafı hazır; yalnız anahtar girince aktifleşir (girmezsen sessizce kapalı kalır, hiçbir şeyi bozmaz):
- **Hata izleme (Sentry):** Bir Sentry hesabı aç → DSN'i al → admin paneli için `VITE_SENTRY_DSN`, edge için `supabase secrets set SENTRY_DSN=...`.
- **Çalışırlık izleme (uptime):** Harici bir izleme servisi (örn. UptimeRobot) site/edge sağlık ucuna bağlanabilir.

---

## 6. Gizli anahtar (secret) rotasyonu

| Secret | Sahip | Önerilen aralık | İptal/yenileme |
|---|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Kurucu | 180 gün | Supabase Panosu → API → reset |
| `WEBHOOK_SECRET` (push webhook) | Kurucu | 90 gün | Yeni değer üret → edge secret + DB webhook header güncelle |
| `PAYMENT_EDGE_SECRET` | Kurucu | 90 gün | Edge secret güncelle |
| iyzico API anahtarları | Kurucu | iyzico panosundan | Sızıntıda hemen yenile |
| `APNS_*` / `GOOGLE_*` push anahtarları | Kurucu | Apple/Google panosundan | Sızıntıda hemen yenile |
| Sentry DSN | Kurucu | gerek olmadıkça değişmez | Sentry panosundan |

> Bir secret sızdıysa: önce ilgili panodan **iptal et**, sonra yeni değeri Supabase'e gir, sonra bağımlı sistemleri (DB webhook header'ı vb.) güncelle.

---

## 7. Dağıtım (deploy)

- **Veritabanı + admin edge:** `npm run admin:deploy` — `supabase/migrations/` altındaki TÜM migrasyonları tarih sırasıyla uygular (idempotent; "already exists" atlanır) ve doğrulama RPC'lerini çalıştırır.
- **Admin panel arayüzü:** `admin-panel-son` dalı `main`'e birleşince dağıtım hattı yayınlar (frontend).
- **CI kapısı:** her PR'da `lint (tsc) + birim test + build + admin smoke` otomatik çalışır.
