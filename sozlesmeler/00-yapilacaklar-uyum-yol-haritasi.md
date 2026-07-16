# OYNA — Hukuki Belgeler Durumu ve Yapılacaklar (Uyum Yol Haritası)

> **Durum:** Canlı takip belgesi · **Son güncelleme:** 16.07.2026
> Bu belge, OYNA'nın tüm sözleşme/politika setinin güncel durumunu ve tamamlanması gereken **tüm kalemleri** (şirket/idari aksiyonlar, teknik işler, hazırlanacak belgeler, nihai avukat incelemesi) tek yerde toplar. Belge bazlı ayrıntılı durum için [README durum tablosu](README.md); kalem kaynakları ilgili değerlendirme notlarındadır.

---

## 1. GENEL DURUM ÖZETİ

- **Tüketiciye (oyuncu) yönelik temel belge seti: büyük ölçüde TAMAM ve uygulamada canlı.** Kullanım Şartları, Gizlilik, KVKK Aydınlatma/Açık Rıza, Mesafeli Satış, Çerez, Hesap Silme, Veli Muvafakatnamesi, Topluluk Kuralları ve Veri Paylaşım Protokolü hazır ve uygulamaya bağlı.
- **B2B taraf (saha sahibi + kaleci/hakem): taslaklar hazır**, ancak kabul ekranına **bağlanmadı** ve bazı iş kararları (ör. %15 komisyon) bekliyor.
- **İdari uyum (VERBİS/ETBİS/yurt dışı aktarım): değerlendirmeler yapıldı**; uygulama adımları (özellikle **ETBİS kaydı** ve **Kurul standart sözleşmesi**) senin aksiyonunu bekliyor.
- **Kalan tek hazırlanacak belge:** Kişisel Veri Saklama ve İmha Politikası.
- **Her belge, yürürlük öncesi lisanslı bir avukat teyidi gerektirir** (her belgenin "Uygulama Notu"nda belirtili).

**Kısa cevap:** Sözleşme/metin tarafında **büyük ölçüde tamamız**; kalanlar çoğunlukla senin **idari aksiyonların** + 1 belge taslağı + nihai avukat onayı.

---

## 2. YAPILACAKLAR

### A. Şirket / İdari Aksiyonlar (senin yapacakların)

| # | Aksiyon | Öncelik | Kaynak |
|---|---|---|---|
| A1 | **ETBİS kaydını tamamla** (aracı hizmet sağlayıcı olarak) | 🔴 Kritik | VERBİS/ETBİS notu |
| A2 | **Supabase Kurul standart sözleşmesi** imzala + **5 iş günü** içinde Kurul'a bildir | 🔴 Kritik | Tedarikçi/yurt dışı notu |
| A3 | Mevcut Supabase DPA durumunu kontrol et | 🟠 Yüksek | Tedarikçi notu |
| A4 | VERBİS istisna gerekçesini yazılı dosyala + **yıllık** gözden geçir | 🟡 Orta | VERBİS/ETBİS notu |
| A5 | Kaleci/Hakem **%15 komisyon** oranını onayla veya değiştir | 🟠 Yüksek | Kaleci/Hakem sözl. |
| A6 | SMS OTP sağlayıcısı + fiilî barındırma (Vercel) sağlayıcısını panelden teyit et | 🟡 Orta | Tedarikçi notu |
| A7 | iyzico canlı/KYC; go-live öncesi placeholder TC/IP davranışı + PCI kapsamı kontrolü | 🟠 Yüksek | Tedarikçi notu |
| A8 | Apple/Google **veri güvenliği (data safety)** formları | 🟡 Orta | (yayın öncesi) |
| A9 | Platformda **tanıtıcı/işletme bilgilerini** (unvan, vergi no, iletişim) görünür kıl | 🟡 Orta | VERBİS/ETBİS notu |
| A10 | "OYNA" **marka tescili** | 🟢 Düşük | kurumsal |
| A11 | Ticari e-ileti gönderilecekse **İYS** kaydı + onay akışı | 🟢 Koşullu | VERBİS/ETBİS notu |

### B. Teknik Aksiyonlar (kodda)

| # | Aksiyon | Öncelik | Kaynak |
|---|---|---|---|
| B1 | B2B (saha + kaleci/hakem) sözleşme **kabul ekranlarını** akışa bağla | 🟠 Yüksek | README |
| B2 | Anon veri görünürlüğü **Seçenek B maskeleme** (maç kadrosu ad+avatar; sağlayıcı konumu) | 🟠 Yüksek | Güvenlik Notu |
| B3 | Dormant servisler (Sentry/PostHog/Resend/push) açılışında DPA + m.9 + aydınlatma güncelle | 🟡 Koşullu | Tedarikçi notu |

### C. Hazırlanacak Belgeler

| # | Belge | Öncelik | Not |
|---|---|---|---|
| C1 | **Kişisel Veri Saklama ve İmha Politikası** | 🟠 Yüksek | VERBİS istisnası olsa bile KVKK gereği zorunlu |
| C2 | (Opsiyonel) Tedarikçi DPA / veri işleme sözleşme şablonları | 🟢 Düşük | Her veri işleyen için |

### D. Nihai Hukuki İnceleme

- **D1** — Tüm belgeler yürürlüğe girmeden önce lisanslı bir **avukat/mali müşavir** tarafından incelenmelidir (KVKK, e-ticaret/6563, tüketici/6502, vergi kalemleri). Her belgenin Uygulama Notu'nda bu vurgulanmıştır.

---

## 3. TEYİT BEKLEYEN KALEMLER ([TEYİT EDİLECEK])

Aşağıdaki bilgiler netleşince ilgili belgeler güncellenecektir:
- Supabase mevcut DPA/SCC durumu
- SMS OTP sağlayıcısı (Supabase paneli)
- Fiilî barındırma sağlayıcısı (Vercel teyidi)
- Dormant servislerin (iyzico/Sentry/PostHog/Resend/push) go-live planı ve zamanlaması

---

## 4. ÖNCELİK ÖZETİ

- **🔴 Şimdi:** ETBİS kaydı (A1) · Supabase standart sözleşme + Kurul bildirimi (A2)
- **🟠 Yakında:** B2B kabul ekranları (B1) · anon maskeleme (B2) · Saklama/İmha Politikası (C1) · %15 onayı (A5) · iyzico go-live kontrolü (A7) · Supabase DPA kontrolü (A3)
- **🟡 Orta:** VERBİS gerekçe dosyalama (A4) · SMS/Vercel teyidi (A6) · tanıtıcı bilgiler (A9) · data-safety formları (A8)
- **🟢 Düşük/koşullu:** marka tescili (A10) · İYS (A11) · DPA şablonları (C2) · dormant servis açılışları (B3)

---

> **Uygulama Notu:** Bu yol haritası bilgilendirme ve takip amaçlıdır; hukuki danışmanlık yerine geçmez. Kalemler tamamlandıkça bu belge ve [README](README.md) güncellenmelidir.
