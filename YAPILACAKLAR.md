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

## Bekleyen görüşme bölümleri
- [ ] Bölüm 3/6 — Cüzdan ekonomisi & çekim
- [ ] Bölüm 3/6 — Cüzdan ekonomisi & çekim
- [ ] Bölüm 4/6 — Güvenlik, uyum & sınır durumlar
- [ ] Bölüm 5/6 — Tesis & sağlayıcı deneyimi
- [ ] Bölüm 6/6 — Ölçekleme & operasyon
