# 🏛️ OYNA — Master Prensipler Dokümanı

> **Durum:** TASLAK — canlı geliştiriliyor. Keşif soruları yanıtlandıkça bölüm bölüm dolduruluyor.
> **Kaynak:** `docs/OYNA_MASTER_KESIF_SORULARI.md` (200 soru) + bölüm bölüm Q&A.
> **Son güncelleme:** Bölüm 1 (Vizyon & Kapsam) kilitlendi — 1 açık kalem (para modeli birleşimi) onay bekliyor.
> **Amaç:** Karışıklıkları gidermek → binlerce kullanıcı, saha sahibi, kaleci, hakem için sorunsuz → canlıya alma + store yükleme.

---

## 1. Vizyon & Konumlandırma

- **Gerçek ürün:** Halı saha **rezervasyon platformu**. (Sosyal ağ DEĞİL.)
- **Model:** Çift taraflı pazar (saha sahipleri ↔ oyuncular).
- **Destekleyici çekirdek:** Kullanıcıların **takım kurup taktik paylaştığı** sistem (takım-içi).
- **Net fark:** Saha sahiplerine kolaylık; oyuncuların maçı kolay bulması; takım/arkadaşlarla rahat maç yapabilmesi.
- **Ton:** Tüketici tarafı mevcut görsel dil; **saha sahibi paneli B2B ton.**

## 2. Kapsam (MVP / Lansman)

**✅ Lansman İÇİ (kapsamlı yapılacak):**
- Saha keşfi & rezervasyon
- Maç oluşturma & katılım (OYNA organizasyonu dahil)
- Kaleci & Hakem kiralama
- Takımlar + Taktik Stüdyo (takım-içi paylaşım)
- Oyuncu kartları (yalnızca admin kontrolünde)
- Fair-play / güvenilirlik (sistemsel, admin kontrollü)
- Maç sonu oyuncu değerlendirme sayfası (UX)
- Admin paneli (tek, sağlam)

**❌ Lansman DIŞI (kaldırılacak):**
- Turnuvalar (`TournamentBracket`)
- Topluluklar (`CommunityView`, `CommunityHub`, `CommunityAdminDashboard`, `communityService`, `COMMUNITY_ADMIN` rolü)
- AI Koç (`AICoach` + Gemini bağımlılığı)
- OYNA TV (`OynaTv`)
- Oyunlaştırma: ELMAS/KARAT (`reputationEngine`), **Lider tabloları** (`Leaderboards`), Rozetler/başarımlar
- Saha sahibi SaaS (`owner_accounts`, entitlements, `useOwnerEntitlements`)
- Oyuncu Premium (`PremiumScreen`, `isPro`)

## 3. Gelir Modeli & Para Akışı 💰

**Temel ilke:** OYNA, halı saha rezervasyonlarında **yalnızca KAPORA'yı tahsil eder** (tek merchant). Kalan saha ücreti tesiste ödenir.

**Gelir akışları:**
1. **Saha rezervasyon komisyonu — varsayılan %15** (kapora üzerinden).
   - Örnek: Kapora 1000₺ → OYNA'ya gelir → OYNA 150₺ alır → 850₺ saha sahibine **ay sonunda** ödenir (payout).
2. **OYNA-organize maç — +%20 markup.** Oyuncuya saha ücreti + %20 yansıtılır; saha sahibi **tam ücretini alır**; OYNA %20'yi kazanır.
3. **Kaleci/Hakem kiralama — %10 komisyon.**

**Komisyon esnekliği (ZORUNLU):** Tüm oranlar admin panelinden ayarlanabilir; **her seviyede override**: global varsayılan → saha bazlı → hizmet türü bazlı → maç bazlı (örn. bir saha %5, diğeri %10; kaleciden kaleciye, maçtan maça farklı).

**🔓 AÇIK KALEM (onay bekliyor):** OYNA-organize bir maçta **%20 markup + %15 kapora komisyonu birlikte mi** uygulanır, yoksa organize maçta **sadece %20** mi? + Kalan saha ücreti kesin olarak tesiste mi ödenir? (Bölüm 12'de sayısal örnekle netleşecek.)

## 4. Büyüme Stratejisi
- **Önce arz:** Saha sahipleri/sahalarla anlaşılır → saha sahipleri kendi oyuncularını uygulamaya yönlendirir (owner-led).
- **Gereklilik:** Saha sahibi → oyuncu **davet mekanizması** (davet linki/QR, paylaşılabilir saha sayfası) — lansmanda olacak.

## 5. Başarı Metriği
- **Ana metrik:** Başarılı oynatılan maç sayısı. Admin paneli buna odaklanır.
- **"Başarılı maç" tanımı:** Ödemeler yapıldı → kişiler toplandı → oynadılar → dağıldılar → OYNA ve saha sahibi ödemesini aldı. (Yani finansal/operasyonel tamamlanma; skor zorunlu değil.)

## 6. Oyunlaştırma Kararları
- **Kaldırılan:** ELMAS/KARAT, lider tabloları, rozetler/başarımlar.
- **Kalan — Oyuncu Kartları:** Yalnızca **admin panelinden** aktive edilir ve ayarlanır. **Kullanıcıların kartlara hiçbir etkisi yoktur** (otomatik hesap yok).
- **Kalan — Fair-play / Güvenilirlik:** Sistemsel gereklilik (no-show/iptal). Admin kontrollü; gerektiğinde kişinin profilinde **uyarı** olarak gösterilebilir.

## 7. Sosyal & Takım / Taktik
- **Kaldırılan:** Topluluklar.
- **Geliştirilecek:** **Takımlar** ve **Arkadaşlar** bölümleri.
- **Taktik paylaşımı:** Takım kurulur; **yalnızca takım içi** paylaşım (taktikler takım içinde kalır). Taktikler: **yüzdelik dilimlerle oylanabilir + yorumlanabilir + favorilenebilir.**

## 8. Lansman Şehri & Veri
- **Şehir:** Ordu. Tüm demo/seed, harita merkezi, ilçe listeleri Ordu'ya göre yeniden kurulacak (titizlikle).
- **Başlangıç sahaları (detaylar onaylanacak):** Capo Arena, Olimpiyat VIP Arena, Ahmet Kuru Tesisleri.

## 9. Tasarım Tonu
- Tüketici uygulaması: mevcut dil korunur (sadeleştirilerek).
- Saha sahibi paneli: **B2B, sade, güven veren** ton.

---

## 10. Geliştirme Planı (Fazlar)

| Faz | Başlık | Özet |
|---|---|---|
| **0** | Kapsam Daraltma & Temizlik | Kaldır: turnuva, topluluk (+COMMUNITY_ADMIN), AI koç (+Gemini), OYNA TV, ELMAS/KARAT & lider tablosu & rozetler, SaaS, Premium. Alt navigasyonu yeniden tasarla. Ölü kod/mükerrer tip temizliği. |
| **1** | Veri Modeli & Gerçek Veri | Tek kanonik tip seti; mock→gerçek; DEV_MODE prod'da kapalı; **Ordu seed** (3 saha). |
| **2** | Para Akışı & Komisyon Motoru ⚠️ | Tek-merchant kapora tahsilatı; **çok seviyeli ayarlanabilir komisyon** (%15/%20/%10); aylık payout. |
| **3** | Rezervasyon & Maç Çekirdeği | Rezervasyon uçtan uca gerçek; **"başarıyla oynandı" sinyali** (admin metriği). |
| **4** | Saha Sahibi B2B | Owner panel sağlamlaştırma + B2B ton + **oyuncu davet mekanizması**. |
| **5** | Kaleci/Hakem | Gerçek teklif/kabul + %10 komisyon + kazanç/payout. |
| **6** | Takım & Taktik | Takım kurma + arkadaşlar; takım-içi taktik paylaşımı (oylama/yorum/favori); formasyon koordinatları tek kaynak. |
| **7** | Güvenlik, Altyapı & Store | RLS tamamla; edge function deploy + güvenlik (CORS/webhook imza); iOS/Android store hazırlık; test. |

---

## 11. 📌 Hatırlatma / Backlog (kullanıcı talebi)
- [ ] **Maç sonu oyuncu değerlendirme sayfası** — UX olarak yapılacak (fair-play'i besler, kartları DEĞİL).
- [ ] **Takımlar + Arkadaşlar bölümlerini geliştir** (sosyal çekirdek).
- [ ] **Takım-içi taktik:** oylama (yüzdelik) + yorum + favori.
- [ ] **Saha sahibi → oyuncu davet mekanizması** (owner-led büyüme).
- [ ] **Komisyon motoru:** global/saha/hizmet/maç seviyelerinde override.
- [ ] **Alt navigasyon yeniden tasarımı** (orta "Sosyal/Topluluk" butonu kalkıyor).

## 12. 🔓 Açık Kalemler (netleşecek)
- Para modeli birleşimi: organize maçta %20 + %15 birlikte mi, sadece %20 mi? Kalan ücret tesiste mi?
- Sohbet (chat) lansmanda kalacak mı?
- Başlangıç sahalarının gerçek detayları (adres, kort sayısı, fiyat).
