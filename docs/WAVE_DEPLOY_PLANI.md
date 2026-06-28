# 🚢 OYNA — Wave Uygulama & Veritabanına İşleme (Deploy) Planı

> **Amaç:** 14 geliştirme dalgasını (wave) **yazılımcısız yönetilebilir, sürdürülebilir, çalışır** bir sisteme dönüştürürken; bunları veritabanına **gruplar halinde, güvenli sırayla** uygulamak.
> **Temel ilke (ÇOK ÖNEMLİ):** **"Sistem mükemmel çalışmayabilir" varsayımıyla** ilerliyoruz. Her parti; yedek → kopya ortamda test → uygula → doğrula → gerekirse geri-al adımlarından geçer. Hiçbir riskli adım, bir öncekinin çalıştığı **kanıtlanmadan** atılmaz.
> **Dal:** `admin-panel-son` · **Son güncelleme:** 2026-06-27

---

## 0. İki ayrı "deploy" olduğunu unutma

| Tür | Ne içerir | Nasıl uygulanır | Risk |
|---|---|---|---|
| **Veritabanı deploy** | Migration'lar (tablo/fonksiyon/RLS), Edge Function'lar | `supabase` ile canlı projeye uygulanır | **Yüksek** (geri alması zor) |
| **Arayüz (frontend) deploy** | Admin paneli + uygulama ekranları (React) | Vercel build (otomatik) | Düşük (eski sürüme dönülebilir) |

Bu plan **veritabanı deploy**'unu gruplar. Arayüz değişiklikleri paralel ilerler ve düşük risklidir (her zaman bir önceki sürüme dönülebilir).

---

## 1. Wave wave ne yapacağız (14 dalga)

> Durum: ✅ kod hazır · 🔧 kısmen yapıldı · ⏳ planlı

### Wave 1 — Kontrol Merkezi Temeli ✅
- **Ne:** `app_config` (panelden ayarlanabilir kurallar), `feature_flags` (modül aç/kapa), `settings` resmi şeması + audit'li yazma RPC'leri.
- **DB etkisi:** Yeni tablolar + fonksiyonlar (yalnız EKLEME).
- **Risk:** **Sıfıra yakın** — mevcut hiçbir şeyi değiştirmez.

### Wave 2 — "Sistem Parametreleri" Ekranı ✅ (arayüz)
- **Ne:** Kuralları ve modülleri panelden tıkla-değiştir ekranı.
- **DB etkisi:** Yok (yalnız arayüz; Wave 1 RPC'lerini çağırır).
- **Risk:** Düşük.

### Wave 3 — Kuralları Uygulamaya Bağla ⏳
- **Ne:** Maç/rezervasyon fonksiyonları kuralı koddan değil `app_config`'ten okusun (panel değişikliği gerçekten etki etsin).
- **DB etkisi:** Mevcut fonksiyonların yeniden yazımı (sabit değer → `get_config`, **eski değer yedek/fallback**).
- **Risk:** **Orta** — para/maç akışına dokunur. Fallback sayesinde config yoksa davranış aynı kalır; yine de kopya ortamda test şart.

### Wave 4 — Audit'i Tamamla + Değiştirilemezlik 🔧
- **Ne:** ✅ Kayıt değiştirilemez (append-only) yapıldı; ⏳ kayıt tutmayan ~18 fonksiyona kayıt eklemek kaldı.
- **DB etkisi:** Trigger (yapıldı) + fonksiyon yeniden yazımları (kalan).
- **Risk:** Düşük-orta.

### Wave 5 — Komisyon Tek Kaynak ⏳
- **Ne:** Ayarlar'daki işe yaramayan "komisyon" alanını kaldır/yönlendir; gerçek kaynak **Komisyon** sayfası olsun. "Değiştirdim ama değişmedi" tuzağını kapatır.
- **DB etkisi:** Çoğunlukla arayüz; küçük olası migration.
- **Risk:** Düşük.

### Wave 6 — Kapsam-Dışı Modülleri Gizle ⏳
- **Ne:** Topluluk/Turnuva/Promo'yu menüden `feature_flags` ile gizle (silme yok).
- **DB etkisi:** Yok (Wave 1 bayrakları kullanılır); arayüz değişikliği.
- **Risk:** Düşük.

### Wave 7 — Demo Veri İzolasyonu ⏳
- **Ne:** Test/demo verisi gerçek listelere ve **gelir/komisyon/payout hesaplarına** karışmasın; lansman öncesi temizlik kapısı.
- **DB etkisi:** Gelir/özet fonksiyonlarına `demo değil` filtresi.
- **Risk:** **Orta** — yanlış filtre gerçek veriyi gizleyebilir → kopya ortamda "gerçek veri görünür kalıyor mu" testi.

### Wave 8 — Yetkileri Sunucuda Zorla ⏳
- **Ne:** Finans/Operasyon rollerini gerçekten ayır (Wave 4'teki `require_admin_role` kapısını ilgili fonksiyonlara tatbik et).
- **DB etkisi:** Fonksiyonlara yetki kapısı eklenir.
- **Risk:** **Orta-yüksek** — yanlış kurulursa adminler kilitlenir. Her rolle test + **SUPER_ADMIN her zaman geçer** kaçış yolu.

### Wave 9 — Maç Kontrol Kokpiti ⏳
- **Ne:** Bir maçtaki her sorunu tek ekrandan çöz: ödeme müdahalesi, skor düzeltme, payout tetik, slot kilit, kadroya bildirim, maça-özel kayıt.
- **DB etkisi:** Yeni müdahale RPC'leri + arayüz.
- **Risk:** **Yüksek** (para işlemlerini tetikler) — sandbox'ta uçtan uca test.

### Wave 10 — Güvenlik Sertleştirme ⏳
- **Ne:** Ghost (başka kullanıcı gibi gör) modu süre sınırı + sadece-okuma; edge CORS kısıtı; webhook tekrar-koruması; hassas veri (PII) maskeleme.
- **DB etkisi:** Yeni tablo/fonksiyon + Edge Function değişiklikleri.
- **Risk:** Orta.

### Wave 11 — Ödeme/Payout Go-Live (kod) ⏳
- **Ne:** Gerçek tahsilat moduna geçiş kapısı, panelden ödeme müdahalesi, gerçek banka transferi (payout) API'si, otomatik ödeme, mutabakat raporu.
- **DB etkisi:** Edge Function'lar + cron + migration.
- **Risk:** **EN YÜKSEK** (gerçek para). iyzico sözleşme/KYC tamam olmadan ve sandbox'ta kanıtlanmadan CANLIYA ALINMAZ.

### Wave 12 — Bildirim Go-Live ⏳
- **Ne:** Şablon editörü, kampanya geçmişi + zamanlama, yanlış toplu-gönderim koruması, sessiz saat/tercih saygısı, test bildirimi.
- **DB etkisi:** Yeni tablolar + Edge Function.
- **Risk:** Orta (yanlış toplu gönderim itibar riski) → "N kişiye gönderilecek, onayla" adımı.

### Wave 13 — Dayanıklılık ⏳
- **Ne:** Kritik akış testleri + otomatik kapı (CI), hata izleme (Sentry), yedek/PITR + "yanlış silme" kurtarma kılavuzu, tek-komut güvenli deploy.
- **DB etkisi:** Çoğunlukla DB-dışı; PITR = Supabase plan ayarı (senin işin).
- **Risk:** Düşük (koruma katmanı).

### Wave 14 — UI Cila ⏳
- **Ne:** Tek "Doğrulama Merkezi" + rozet, "Başarılı Maç" göstergesi, tutarlı boş/yükleme/hata, sayfalama, erişilebilirlik.
- **DB etkisi:** Yok (arayüz).
- **Risk:** Düşük.

---

## 2. Veritabanına işleme planı — GRUPLANDIRILMIŞ PARTİLER

Wave'leri **bağımlılık + risk** seviyesine göre 5 partiye böldük. **Kural: bir parti, bir öncekinin canlıda çalıştığı doğrulanmadan uygulanmaz.**

### 🟢 PARTİ A — Güvenli Temel (risk: yok)
- **İçerik:** Wave 1 + Wave 4 (+ Wave 2 arayüzü).
- **Neden birlikte:** Tamamı **ekleme** (yeni tablo/fonksiyon/trigger); mevcut hiçbir davranışı değiştirmez. Diğer her partinin temeli budur.
- **Migration'lar:** `20260708000001_faz7_control_plane_foundation.sql`, `20260708000002_faz7_audit_hardening.sql` — **ikisi de dalda hazır.**
- **Ön-koşul:** Yok.
- **Doğrulama:** Panelde "Parametreler" ekranı açılıyor mu; bir kuralı değiştir → audit kaydına düşüyor mu; eski kayıt silinemiyor mu.
- **Geri-alma:** Yeni tablolar olduğu için en kötü ihtimalle `DROP` ile temizlenir; mevcut sisteme dokunmadığından risk yok.

### 🟡 PARTİ B — Kontrolü Bağla (risk: orta, fallback'li)
- **İçerik:** Wave 3 (kuralları bağla) + Wave 5 (komisyon tek kaynak) + Wave 6 (modül gizle) + Wave 20-parçası (silme kuyruğu).
- **Neden birlikte:** Hepsi Parti A'nın üstüne biner ve **davranışı** panele bağlar; her birinde **eski değer yedek (fallback)** olduğu için config yoksa sistem aynı çalışır.
- **Ön-koşul:** Parti A canlıda + doğrulanmış.
- **Doğrulama:** Panelden bir kural değiştir → uygulamada etkisini gör; komisyonu Komisyon sayfasından değiştir → hesap doğru; kapsam-dışı modüller menüden kalktı.
- **Geri-alma:** Davranış değişiklikleri **feature flag** ile veya fonksiyonu eski sürümüne geri yazarak kapatılır.

### 🟠 PARTİ C — Güvenlik & İzolasyon (risk: orta-yüksek)
- **İçerik:** Wave 7 (demo izolasyon) + Wave 8 (yetki tatbiki) + Wave 10 (güvenlik sertleştirme).
- **Neden birlikte:** Erişim ve veri görünürlüğünü daraltır; yanlış kurulursa **admin kilitlenmesi** veya **gerçek veri gizlenmesi** olabilir → birlikte, dikkatle test edilir.
- **Ön-koşul:** Parti A+B canlıda; **mutlaka kopya (branch) ortamında her rolle test.**
- **Kritik güvenlik:** Wave 8'de **SUPER_ADMIN her zaman geçer** (kilitlenme kaçışı). Wave 7'de "gerçek veri görünür kalıyor mu" testi zorunlu.
- **Geri-alma:** Yetki kapısı/filtre eklenen fonksiyonları eski sürümüne geri yaz; PITR hazır.

### 🔴 PARTİ D — Para & Operasyon (risk: EN YÜKSEK)
- **İçerik:** Wave 9 (maç kokpiti) + Wave 11 (ödeme/payout) + Wave 12 (bildirim).
- **Neden birlikte/en sonda:** Gerçek **para** ve **dış sağlayıcılar** (iyzico, APNs/FCM). Hata = gerçek finansal/itibar kaybı.
- **Ön-koşul:** Parti A–C canlı; **iyzico sözleşme/KYC + bildirim anahtarları hazır (senin işin)**; sandbox'ta **uçtan uca** (tahsilat→iade→payout) kanıtlanmış.
- **Doğrulama:** Önce `SIMULATION` modunda tüm akış; sonra düşük tutarlı **kanarya** işlemler; panelde aktif sağlayıcı rozeti.
- **Geri-alma:** Sağlayıcıyı tek anahtarla `SIMULATION`'a geri al; payout otomasyonunu durdur.

### ⚪ PARTİ E — Dayanıklılık & Cila (risk: düşük)
- **İçerik:** Wave 13 (test/CI/izleme/PITR) + Wave 14 (UI cila).
- **Neden ayrı:** Çoğunlukla DB-dışı; istenildiği an, diğer partilerden bağımsız uygulanır. **Parti D'den ÖNCE** test/CI/izleme kurulması şiddetle önerilir (para akışını korur).
- **Geri-alma:** Çoğu arayüz/altyapı; eski sürüme dönülür.

**Önerilen sıra:** A → B → (E'nin test/izleme kısmı) → C → D'nin kalanı.

---

## 3. Her parti için ortak GÜVENLİ uygulama prosedürü

Her partiyi canlıya alırken **istisnasız** şu 6 adım:

1. **Yedek/PITR teyidi.** Uygulamadan önce yedek noktası garanti (özellikle Parti C/D).
2. **Kopya ortamda test.** Supabase **branch** (önizleme veritabanı) üzerinde migration'ları uygula + akışları dene. *Burada kırılırsa canlı etkilenmez.*
3. **Danışman taraması.** `get_advisors` (güvenlik + performans) uyarılarını oku, sıfırla.
4. **Sıralı uygulama.** Migration'lar tarih sırasıyla canlıya uygulanır; Edge Function'lar deploy edilir.
5. **Duman testi (smoke).** Panel açılıyor mu, kritik RPC'ler çalışıyor mu, örnek bir akış (giriş→ekran→bir aksiyon) sorunsuz mu.
6. **Geri-alma hazır.** Bozulma görülürse: davranış değişikliği → feature flag/eski fonksiyon; yapısal → PITR restore.

> Migration'lar bilerek **eklemeli ve idempotent** yazıldı: yarıda kalsa veya iki kez çalışsa bile zarar vermesin.

---

## 4. "Mükemmel çalışmayabilir" — Risk önlemleri (özet)

| Risk | Önlem |
|---|---|
| Migration canlıyı bozar | Önce **branch**'te test + uygulamadan önce **yedek** |
| Yeni kural yanlış değer okur | **Fallback** = eski sabit değer (config yoksa davranış aynı) |
| Admin kilitlenir (Wave 8) | **SUPER_ADMIN her zaman geçer** + her rolle branch testi |
| Gerçek veri gizlenir (Wave 7) | "Gerçek veri görünür mü" doğrulama testi |
| Gerçek para hatası (Wave 11) | iyzico **sandbox**'ta uçtan uca + **kanarya** işlemler + tek-anahtar `SIMULATION` geri dönüş |
| Yanlış toplu bildirim (Wave 12) | "N kişiye gönderilecek, onayla" + rate-limit |
| Felaket / yanlış silme | **PITR** açık + yazılı kurtarma kılavuzu + yıkıcı işlemler "önce onayla" |
| Sessiz bozulma | Her parti sonrası **duman testi** + (Parti E) otomatik test/CI + hata izleme |

---

## 5. Şu an hazır olanlar (dalda, canlıya uygulanmadı)

- ✅ `20260708000001_faz7_control_plane_foundation.sql` (Wave 1)
- ✅ `20260708000002_faz7_audit_hardening.sql` (Wave 4 — kısmi)
- ✅ "Sistem Parametreleri" ekranı + servis bağlantıları (Wave 2, arayüz)

**Sıradaki:** Wave 5 → Wave 3 (Parti B), ardından test/izleme (Parti E erken) → Parti C → Parti D.

> Sen **"Parti A'yı canlıya al"** dediğinde: önce branch'te test eder, yedeği teyit eder, uygular ve duman testini paylaşırım. Hiçbir partiyi onayın ve doğrulama olmadan canlıya almam.
