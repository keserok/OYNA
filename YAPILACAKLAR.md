# OYNA — Ödeme Akışı Yapılacaklar Listesi

> Bu belge, ödeme akışı mükemmelleştirme görüşmesinde alınan kararları ve
> bekleyen işleri takip eder. 30 soruluk değerlendirme sürdükçe güncellenir.

## Durum özeti (2026-07)
Cüzdan-öncelikli ödeme sistemi canlıda çalışıyor: saha kaporası, maça katılım,
cüzdana yükleme (uygulama-içi 3DS), kart kaydetme/tek-dokunuş, maç kaporası
(cüzdan güvencesi), komisyon tek kaynak, tesis gelir raporu. iyzico **sandbox**
modunda; canlı anahtarlar henüz bağlanmadı.

---

## 🔴 Yayına çıkmadan önce zorunlu (blocker)

- [ ] **Hizmet sağlayıcı (kaleci/hakem) ücreti tahsilatı** — şu an talep açılıyor
  ama kaptandan para çekilmiyor; hizmet tamamlanınca sağlayıcıya gerçek kazanç
  yazılıyor → canlıda OYNA zarar eder. Çözüm: maç kaporasındaki desen — talep
  anında ücret **cüzdandan güvenceye alınır**, red/süre dolumunda otomatik iade
  kredisi. **(Karar: en son kurulacak — diğer işler tamamlanınca.)**
- [ ] **iyzico canlı (production) anahtarları** — sandbox'tan canlıya geçiş;
  iyzico başvurusu + sözleşme + canlı `IYZICO_*` secret'ları.

---

## 🟡 Bilgilendirme & güven (yayına yakın)

- [ ] **"Ödemeniz Onaylandı" sayfasında işlem detayı** — tutar, yöntem (•••• 0008
  / bakiye), işlem no, ne için ödendiği, iade koşulu özeti. **(Karar: kullanıcı
  dekontu için yalnız uygulama-içi detay yeterli; e-posta makbuzu YOK.)**
- [ ] **Tesise "kapora ödendi" anlık push** — "Ahmet Y. 20 Ağu 21:00 için 300₺
  kapora ödedi". **(Karar: öneri kabul edildi.)**
- [ ] **Tesise günlük akşam özeti e-postası** — bugün X rezervasyon, Y₺ tahsilat,
  Z₺ çekilebilir oldu. Taslak: `docs/email-templates/tesis-bildirim.html`.
  **⚠️ E-POSTA SAĞLAYICI GEREKLİ** — `send-email` edge fonksiyonu var ancak
  gerçek bir SMTP/API sağlayıcısına (Resend / Postmark / AWS SES / SendGrid)
  bağlanması, doğrulanmış gönderen alan adı (ör. `bildirim@oyna.app`) ve SPF/DKIM
  kaydı gerekir. Sağlayıcı seçilip API anahtarı Supabase secret'a girilmeden
  e-posta gönderimi çalışmaz.

---

## Alınan kararlar (Bölüm 1/6 — Paranın toplandığı an)

| # | Konu | Karar |
|---|------|-------|
| 1 | Kaleci/hakem ücreti tahsilatı | Cüzdandan güvence — **en son kurulacak** |
| 2 | Kapora tutarını kim belirler | Güncel hali (tesis ayarı) **sağlamlaştırılacak** |
| 3 | Cüzdan min. yükleme | **300₺** kalacak |
| 4 | Kullanıcı dekontu | **Yalnız uygulama-içi** işlem detayı (onay sayfasında) |
| 5 | Tesis bildirimi | Anlık push + günlük özet e-postası (sağlayıcı gerekli) |

---

## Alınan kararlar (Bölüm 2/6 — İadeler ve İptaller)

| # | Konu | Karar |
|---|------|-------|
| 6 | İptal kademeleri | Global varsayılan + **tesis-bazlı override** (admin panel) |
| 7 | Cüzdandan karta çekim | **%10 kesinti** (ör. 300₺→270₺); sebep: "ödeme altyapısı komisyonu". Akış **düşük görünürlük** — göze batmayacak |
| 8 | Slot'tan tek ayrılma | İade önizlemesi + yakınsa uyarı; slot otomatik tekrar açılır |
| 9 | Maç iptali muhasebesi | Tek orkestrasyon (oyuncu iade + kaptan kapora + tesis kazanç geri + saha iptal), sıfır-toplam doğrulanır |
| 10 | İade bildirimi | Push + cüzdan chip vurgusu + "sonraki oyunda kullan" mesajı |

### ⚠️ Bölüm 2'den doğan işler
- [ ] **Cüzdandan karta çekim (%10 kesinti)** — YENİ akış. Açık nokta: kesinti
  yalnız *yüklenen bakiyeye* mi uygulanır, *iade kredisine* de mi? (İade
  kredisinden %10 kesmek mevzuat açısından riskli olabilir — Bölüm 3'te netleşecek.)
- [ ] **Tesis-bazlı iptal politikası override** (admin panel alanı)
- [ ] **Maç iptali orkestrasyon fonksiyonu** + sıfır-toplam sandbox testi
- [ ] **İade push bildirimi** + cüzdan "+X₺" vurgusu

## Alınan kararlar (Bölüm 3/6 — Cüzdan ekonomisi & çekim)

| # | Konu | Karar |
|---|------|-------|
| 11 | %10 çekim kesintisi kapsamı | **Yalnız yüklenen bakiye (TOP_UP)**; iade kredisi kesintisiz çekilir |
| 12 | Kazanç (kaleci/hakem/tesis) çekimi | **Ücretsiz** + minimum eşik; ayrıca **IBAN çekim akışı iyzico bağlantısına hazır** hale getirilecek |
| 13 | Bakiye son kullanma | **Süresiz** (ileride 24 ay atıl-hesap politikası notu) |
| 14 | Harcama sırası | **İade kredisi önce**, sonra yüklenen bakiye (mevcut, korunacak) |
| 15 | Çekim akışı görünürlüğü | **Düşük görünürlük** (Kart Yönet/Ayarlar altı), ama %10 kesinti + net tutar **şeffaf gösterilir** |

### ⚠️ Bölüm 3'ten doğan işler
- [ ] **Cüzdandan karta çekim akışı** (`wallet_cashout` RPC + edge): TOP_UP'tan
  %10 kesinti, iade kredisi kesintisiz; düşük-görünürlük FE; kesinti şeffaf gösterim.
- [ ] **Kazanç IBAN çekiminde minimum eşik** (ör. 100₺).
- [ ] **IBAN çekim akışını sağlayıcı-soyutlamalı yap** — bugün manuel havale,
  yarın iyzico payout/Pazaryeri API'sine takılabilecek şekilde (provider switch).
- [ ] (İleride) 24 ay atıl-hesap bilgilendirme + iade daveti politikası.

## Alınan kararlar (Bölüm 4/6 — Güvenlik, uyum & sınır durumlar)

| # | Konu | Karar |
|---|------|-------|
| 16 | Çekim için kimlik | TC + IBAN sahibi zorunlu; admin onayda eşleşme kontrolü; ileride iyzico IBAN-isim doğrulama |
| 17 | İstismar (iade/kart deneme) | Başarısız-ödeme hız limiti + yeni hesap 24s çekim kilidi + iyzico fraud/BIN (yayın sonrası ilk faz) |
| 18 | Chargeback | 2 hafta güvence süresi tampon + admin dondurma aracı; iyzico webhook otomasyonu ileride |
| 19 | Askıda PENDING temizleme | Onaylandı + geliştirildi: **ödeme ekranı 3 dk oturur sonra sıfırlanır**; halı saha rezervasyonuna uygun süpürme (slot kilidi de bırakılır) |
| 20 | Eşzamanlılık | Mevcut FOR UPDATE kilidi korunur + **kanıt testi koşulacak** (bakiye çift-harcama + son slot yarışı) |

### ⚠️ Bölüm 4'ten doğan işler
- [ ] **Askıda ödeme süpürme cron'u** (saatlik): 3 dk+ PENDING kart intent'i →
  FAILED (+ iyzico teyidi; gerçekten çekildiyse PAID'e düzelt); halı saha
  rezervasyonundaki slot/booking kilidini de serbest bırak.
- [ ] **Ödeme ekranı 3 dk oturma süresi** — FE tarafında intent tazeliği; süre
  dolunca ekran sıfırlanır, kullanıcı baştan başlar (bayat fiyat/slot önlenir).
- [ ] **Başarısız-ödeme hız limiti** + yeni hesap 24s çekim kilidi.
- [ ] **Admin chargeback dondurma aracı** (intent işaretle + kazanç dondur).
- [ ] **Çekim öncesi IBAN-isim eşleşme kontrolü** (admin ekranı; ileride otomatik).
- [x] **Eşzamanlılık kanıt testi** — canlı sandbox'ta koşuldu (bkz. aşağıdaki not).

### ✅ Eşzamanlılık kanıt testi (canlı sandbox, 2026-07)
- **Test A — çift-harcama:** aynı 300₺ bakiyeyle aynı anda iki maça 300₺ kapora
  denendi → biri BLOCKED, diğeri "Yetersiz bakiye" (0₺). İki katman koruma
  (ön-kontrol + `wallet_spend_balance` FOR UPDATE). Para çift harcanamadı. ✓
- **Test B — son slot yarışı:** iki kullanıcı aynı anda tek açık slotu (h5)
  kapmaya çalıştı → biri aldı, diğeri `SLOT_TAKEN`. Kaybedenden **hiç para
  gitmedi** (500₺→500₺). Çifte satış yok. ✓
- Muhasebe sıfır-toplamda kapandı; demo verisi test sonrası eski haline getirildi.
- **Sonuç:** mevcut satır-kilidi mimarisi eşzamanlılığa karşı sağlam — kanıtlandı.

## 🎯 S1 Sprint — Para & Güven (onaylandı, sıradaki iş)
Para değişmezi: her para aksiyonu **idempotent + sunucu-doğrulamalı + dürüst**;
UI sunucu durumuyla çelişmez; tüm tutarlar tek `formatTRY()` → "1.500,00₺".

### P0 — doğrudan para/güven
- [ ] **C1 · Çift top-up:** idempotency anahtarını *prepare* çağrısına koy (apply
  zaten idempotent); buton başarı animasyonu boyunca ref-kilitli; özel tutar max
  girişte doğrulanır. (Not: artık startInAppCardPayment akışı — eski RPC değil.)
- [ ] **C2 · Sahte başarısızlık:** `ALREADY_BLOCKED` → başarı olarak yorumla
  (payment_intents'ten sunucu teyidi + bakiye tazele + "kapora alındı").
- [ ] **C3 · Yanlış yetersiz bakiye:** özet hatası yutulmaz → hata kartı + Yeniden
  Dene; çözülene dek ödeme kilitli; asla 0 bakiye varsayma.
- [ ] **C4 · Sahte bilet (DOĞRULANDI):** `ONAYLANDI` sabit + `<QrCode>` lucide
  ikonu (taranamaz!) + `OYNA-8293-TX` sabit + ölü butonlar. Bilet gerçek
  rezervasyon/ödeme kaydından türeyecek; **gerçek QR üreteci gerekli** (şu an yok);
  ödeme yoksa onaylı bilet yok. Ölü Paylaş/Cüzdana Ekle bağlan ya da kaldır.

### P1 — akış & tutarlılık
- [ ] **C8** MATCH_JOIN yetersiz bakiye → "CÜZDANA YÜKLE" CTA.
- [ ] **C6** Yetim rezervasyon → ödeme başarısında yarat / hold+temizlik
  (Soru 19 askıda-ödeme süpürme cron'u ile aynı kök — birlikte çöz).
- [ ] **C10** `formatTRY()` tüm para ekranlarına; sıfır-kapora "0₺" durumu açıklanır.

### Latent (düşük öncelik)
- [ ] **C5/C7** İptal iade tahmini sunucu formülüyle birebir (brüt−PSP=net). PSP=0
  olduğundan etki şimdilik düşük.
- [ ] **C9** Çoklu-slot split görünürlüğü ("X ödedi" rozeti); gerçek tahsilat iyzico fazına.
- [ ] **C11** Kontrollü red modu (test tutarı/kartı → decline) — hata UX'i QA edilebilsin.

### Regresyon kapısı (S1 çıkış = G1)
SQL değişmezleri: idempotency anahtarı başına ≤1 cüzdan işlemi · maç başına ≤1
BLOCKED kapora · yetim PENDING rezervasyon = 0. + smoke + birim. G1 yeşil olmadan S2 yok.

## Alınan kararlar (Bölüm 6/6 — Ölçekleme & operasyon)

| # | Konu | Karar |
|---|------|-------|
| 26 | Sağlayıcı soyutlama | Şimdilik iki-anahtar switch yeterli; provider alanı kayıtta (var); soyutlama 2. sağlayıcı gelince |
| 27 | Mutabakat | **Tarih aralığı + gün-bazlı kırılım, tam profesyonel** analiz + CSV export |
| 28 | Hesap silme | Finansal yükümlülük kapısı: bakiye/rezervasyon çözülmeden silme yok; anonim kayıt saklanır |
| 29 | Ödeme sağlığı | **Geliştirilmiş — kendi kendini iyileştiren akış**: önleme + tespit + otomatik kurtarma (iyzico mutabakatlı süpürme, APPLY_ERROR retry kuyruğu) + zarif bozulma |
| 30 | Test sigortası | Para değişmezleri paketi her PR'da — **yüksek önem** |

## Bölüm 5/6 (S21-25) — cevap gelmedi → ⭐ önerilen varsayılanlar
S21 anlık kesin rezervasyon + çakışmada otomatik telafi · S22 "Kalanı tahsil
ettim" butonu · S23 kaptan onaylı no-show iadesi · S24 talep-üzerine çekim +
toplu ödeme listesi · S25 fiyat dondurma. **İtiraz edilirse plan güncellenir.**

## 📋 MASTER PLAN
30 kararın tamamı + S1 (C1-C11) analizi **`ODEME_MASTER_PLAN.md`** dosyasında
birleştirildi: S1 Para&Güven → S2 İade&Çekim → S3 Bilgilendirme&Tesis →
S4 Operasyon&Profesyonellik → S5 Hizmet Tahsilatı+Go-live; sürekli katman:
para değişmezleri test paketi. Bu dosya artık ödemenin tek yol haritası.
- [ ] Bölüm 3/6 — Cüzdan ekonomisi & çekim
- [ ] Bölüm 4/6 — Güvenlik, uyum & sınır durumlar
- [ ] Bölüm 5/6 — Tesis & sağlayıcı deneyimi
- [ ] Bölüm 6/6 — Ölçekleme & operasyon
