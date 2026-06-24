# 🏛️ OYNA — Master Prensipler Dokümanı

> **Durum:** TASLAK — canlı geliştiriliyor. Keşif soruları yanıtlandıkça bölüm bölüm dolduruluyor.
> **Kaynak:** `docs/OYNA_MASTER_KESIF_SORULARI.md` (200 soru) + bölüm bölüm Q&A.
> **Son güncelleme:** Bölüm 1 tamamen kilitlendi (vizyon, kapsam, gelir modeli, sohbet, sahalar). Bölüm 2 (Roller) bekliyor.
> **Amaç:** Karışıklıkları gidermek → binlerce kullanıcı, saha sahibi, kaleci, hakem için sorunsuz → canlıya alma + store yükleme.

---

## 1. Vizyon & Konumlandırma

- **Gerçek ürün:** Halı saha **rezervasyon platformu**. (Sosyal ağ DEĞİL.)
- **Model:** Çift taraflı pazar (saha sahipleri ↔ oyuncular).
- **Destekleyici çekirdek:** Kullanıcıların **takım kurup taktik paylaştığı** sistem (takım-içi).
- **Net fark:** Saha sahiplerine kolaylık; oyuncuların maçı kolay bulması; takım/arkadaşlarla rahat maç yapabilmesi.
- **Ton:** Tüketici tarafı mevcut görsel dil (sadeleştirilerek); **saha sahibi paneli B2B ton.**

## 2. Kapsam (MVP / Lansman)

**✅ Lansman İÇİ (kapsamlı yapılacak):**
- Saha keşfi & rezervasyon
- Maç oluşturma & katılım (OYNA organizasyonu dahil)
- Kaleci & Hakem kiralama
- Takımlar + Arkadaşlar + Takım-içi Taktik Stüdyo
- Oyuncu kartları (yalnızca admin kontrolünde)
- Fair-play / güvenilirlik (sistemsel, admin kontrollü)
- Maç sonu oyuncu değerlendirme sayfası (UX)
- 1-1 mesajlaşma (arkadaşlar arası)
- Admin paneli (tek, sağlam)

**❌ Lansman DIŞI (kaldırılacak):**
- Turnuvalar (`TournamentBracket`)
- Topluluklar (`CommunityView`, `CommunityHub`, `CommunityAdminDashboard`, `communityService`, `COMMUNITY_ADMIN` rolü)
- AI Koç (`AICoach` + Gemini bağımlılığı)
- OYNA TV (`OynaTv`)
- Oyunlaştırma: ELMAS/KARAT (`reputationEngine`), **Lider tabloları** (`Leaderboards`), Rozetler/başarımlar
- Saha sahibi SaaS (`owner_accounts`, entitlements, `useOwnerEntitlements`)
- Oyuncu Premium (`PremiumScreen`, `isPro`)
- **Maç içi grup sohbeti** (şimdilik)

## 3. Gelir Modeli & Para Akışı 💰

**Temel ilke:** OYNA tek merchant; saha sahiplerine ödemeler **ay sonunda payout** ile yapılır. Tüm oranlar admin'den **her seviyede** (global → saha → hizmet → maç) ayarlanabilir.

**İki rezervasyon modeli:**

**Model A — Normal rezervasyon** (saha kendi açar / oyuncu OYNA'dan rezerve eder):
- OYNA **yalnızca kaporayı** tahsil eder.
- Komisyon = kaporanın **%15'i** OYNA'da kalır; kalan kapora aylık payout ile sahaya.
- Kalan saha ücreti **tesiste** ödenir.
- *Örnek:* Kapora 1000₺ → OYNA 150₺ alır, 850₺ payout.

**Model B — OYNA-organize maç:**
- Saha, **normal fiyatının %95'ini** alır (OYNA saha tarafından **%5** keser).
- OYNA ayrıca oyunculara **değişken bir ek komisyon (markup)** ekler.
- OYNA geliri = **%5 (saha tarafı) + değişken markup (oyuncu tarafı)**.
- *(Önceki "sabit %20" → "değişken markup"; "saha tam ücret" → "saha %95" olarak güncellendi.)*

**Kaleci/Hakem kiralama:** **%10 komisyon** (ayarlanabilir).

## 4. Büyüme Stratejisi
- **Önce arz:** Saha sahipleri/sahalarla anlaşılır → saha sahipleri kendi oyuncularını uygulamaya yönlendirir (owner-led).
- **Gereklilik:** Saha sahibi → oyuncu **davet mekanizması** (davet linki/QR, paylaşılabilir saha sayfası) — lansmanda olacak.

## 5. Başarı Metriği
- **Ana metrik:** Başarılı oynatılan maç sayısı. Admin paneli buna odaklanır.
- **"Başarılı maç" tanımı:** ödeme yapıldı → kişiler toplandı → oynadılar → dağıldılar → OYNA + saha sahibi ödemesini aldı. (Finansal/operasyonel tamamlanma; skor zorunlu değil.)

## 6. Oyunlaştırma Kararları
- **Kaldırılan:** ELMAS/KARAT, lider tabloları, rozetler/başarımlar.
- **Kalan — Oyuncu Kartları:** Yalnızca **admin panelinden** aktive edilir/ayarlanır. **Kullanıcıların kartlara hiçbir etkisi yoktur.**
- **Kalan — Fair-play / Güvenilirlik:** Sistemsel gereklilik (no-show/iptal). Admin kontrollü; gerektiğinde profilde **uyarı** olarak gösterilebilir.

## 7. Sosyal & Takım / Taktik
- **Kaldırılan:** Topluluklar; maç içi grup sohbeti.
- **Kalan:** Arkadaşlar arası **1-1 mesajlaşma**.
- **Geliştirilecek:** **Takımlar** ve **Arkadaşlar** bölümleri.
- **Taktik paylaşımı:** Takım kurulur; **yalnızca takım içi** paylaşım. Taktikler: **yüzdelik oylama + yorum + favori.**

## 8. Lansman Şehri & Veri
- **Şehir:** Ordu. Tüm demo/seed, harita merkezi, ilçe listeleri Ordu'ya göre titizlikle yeniden kurulacak.
- **Başlangıç sahaları (4 tesis):**
  - **Capo Arena** — Ordu *(kort sayısı & fiyat detayı bekliyor)*
  - **Olimpiyat** — 3 kort, fiyat 3200₺ veya 3000₺ *(hangisi netleşecek)*
  - **VIP Arena** — 3 kort, fiyat 3000₺ veya 3200₺ *(hangisi netleşecek)*
  - **Ahmet Kuru Tesisleri** — Ordu *(kort sayısı & fiyat detayı bekliyor)*

## 9. Tasarım Tonu
- Tüketici uygulaması: mevcut dil korunur (sadeleştirilerek).
- Saha sahibi paneli: **B2B, sade, güven veren** ton.

---

## 10. Geliştirme Planı (Fazlar)

| Faz | Başlık | Özet |
|---|---|---|
| **0** | Kapsam Daraltma & Temizlik | Kaldır: turnuva, topluluk (+COMMUNITY_ADMIN), AI koç (+Gemini), OYNA TV, ELMAS/KARAT & lider tablosu & rozetler, SaaS, Premium, maç içi grup sohbeti. Alt navigasyonu yeniden tasarla. Ölü kod/mükerrer tip temizliği. |
| **1** | Veri Modeli & Gerçek Veri | Tek kanonik tip seti; mock→gerçek; DEV_MODE prod'da kapalı; **Ordu seed** (4 tesis). |
| **2** | Para Akışı & Komisyon Motoru ⚠️ | Tek-merchant kapora tahsilatı (Model A) + organize maç (Model B); **çok seviyeli ayarlanabilir komisyon**; aylık payout. |
| **3** | Rezervasyon & Maç Çekirdeği | Rezervasyon uçtan uca gerçek; **"başarıyla oynandı" sinyali** (admin metriği). |
| **4** | Saha Sahibi B2B | Owner panel sağlamlaştırma + B2B ton + **oyuncu davet mekanizması**. |
| **5** | Kaleci/Hakem | Gerçek teklif/kabul + %10 komisyon + kazanç/payout. |
| **6** | Takım & Taktik | Takım + arkadaşlar; takım-içi taktik (oylama/yorum/favori); formasyon koordinatları tek kaynak; 1-1 mesajlaşma. |
| **7** | Güvenlik, Altyapı & Store | RLS tamamla; edge function deploy + güvenlik (CORS/webhook imza); iOS/Android store hazırlık; test. |

---

## 11. 📌 Hatırlatma / Backlog (kullanıcı talebi)
- [ ] **Maç sonu oyuncu değerlendirme sayfası** — UX olarak yapılacak (fair-play'i besler, kartları DEĞİL).
- [ ] **Takımlar + Arkadaşlar bölümlerini geliştir** (sosyal çekirdek).
- [ ] **Takım-içi taktik:** oylama (yüzdelik) + yorum + favori.
- [ ] **Saha sahibi → oyuncu davet mekanizması** (owner-led büyüme).
- [ ] **Komisyon motoru:** global/saha/hizmet/maç seviyelerinde override.
- [ ] **Alt navigasyon yeniden tasarımı** (orta "Sosyal/Topluluk" butonu kalkıyor).
- [ ] **1-1 mesajlaşma** korunacak; maç içi grup sohbeti kaldırılacak.

## 12. 🔓 Açık Kalemler (netleşecek)
- Capo Arena & Ahmet Kuru Tesisleri: kort sayısı + fiyat.
- Olimpiyat / VIP Arena: 3200₺ ve 3000₺'nin hangisi hangisine ait.
- Model B'de OYNA paranın tamamını mı tahsil eder (oyuncudan toplayıp sahaya %95 aktarır) — çalışma varsayımı bu; onay bekliyor.
- Bölüm 2–20 yanıtları (roller, kimlik, maç, ödeme detayları, saha, kaleci/hakem, takım, bildirim, admin, altyapı).
