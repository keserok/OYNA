# OYNA — Ödeme Sistemi Master Planı

> Kaynaklar: 30 soruluk değerlendirmenin tüm kararları + S1 "Para & Güven"
> sprint analizi (C1-C11) + kod denetimi bulguları. Bu belge ödeme sisteminin
> **tek yol haritasıdır**; her sprint bitiminde güncellenir.
>
> Bölüm 5 (S21-25) cevapsız kaldı → önerilen varsayılanlar ⭐ ile işaretli;
> itiraz edilirse plan güncellenir.

---

## 0) Değişmezler — her işin uyacağı 4 ilke

| # | İlke | Anlamı |
|---|------|--------|
| P1 | **Para değişmezi** | Her para aksiyonu idempotent + sunucu-doğrulamalı + dürüst. UI asla sunucu durumuyla çelişmez; otorite tektir: `payment_intents.status`. |
| P2 | **Cüzdan-öncelikli** | PSP komisyonu minimum: tek seferde yükle, platform içinde harca. İadeler krediye döner; çekim düşük görünürlük + TOP_UP'tan %10 kesinti (iade kredisi kesintisiz). |
| P3 | **Tek gerçek kaynak** | Komisyon `commission_config`'ten; tutar biçimi tek `formatTRY()` ("1.500,00₺"); fiyat rezervasyon anında donar. |
| P4 | **Test kapısı** | Hiçbir sprint, kendi G kapısı (SQL değişmezleri + smoke + birim) yeşil olmadan kapanmaz. Para değişmezleri paketi her PR'da koşar (S30 — "önem ver"). |

## ✅ Bitmiş temel (yeniden planlanmaz)

Uygulama-içi 3DS kart akışı (3 akış: kapora/yükleme/maça katılım) · kart
kaydetme + tek dokunuş · maç kaporası = cüzdan güvencesi (void/iptalde otomatik
iade kredisi) · komisyon SSOT · owner gelir raporu (brüt→komisyon→net) ·
edge imza tamirleri + çifte-iade bug fix · H2 timeout/retry sertleştirmesi ·
**eşzamanlılık kanıtlandı** (çift-harcama ✓, slot yarışı ✓) · 223 birim test.

---

## S1 — Para & Güven (İLK sprint; kullanıcı analizi)

Hepsi kod denetimiyle doğrulandı. Sıra: C1 → C2 → C3 → C4 → P1'ler → latent.

### P0
- [ ] **C1 · Çift top-up:** idempotency anahtarı **prepare** aşamasına
  (`prepare_card_payment`'a `p_idempotency_key`; aynı anahtar → aynı intent).
  Buton başarı animasyonu boyunca ref-kilitli; özel tutar max'ı girişte doğrula;
  sıfır iade-kredi çipi gizle.
- [ ] **C2 · Sahte başarısızlık:** `ALREADY_BLOCKED` → sunucudan teyitli BAŞARI
  (intent durumu okunur, bakiye tazelenir, "kapora alındı" gösterilir).
- [ ] **C3 · Yanlış yetersiz bakiye:** özet hatası yutulmaz → hata kartı +
  Yeniden Dene; çözülene dek ödeme kilitli; asla 0 bakiye varsayılmaz.
- [ ] **C4 · Dürüst bilet:** `ONAYLANDI` sabiti, lucide `<QrCode>` (taranamaz!),
  `OYNA-8293-TX` sabiti, sahte yedekler, ölü Paylaş/Cüzdana-Ekle → hepsi gider.
  Bilet gerçek rezervasyon+ödeme kaydından türer; **gerçek QR üreteci** (rez. id
  + HMAC imza); ödeme yoksa onaylı bilet yok. (K4: SIMULATION'da bile dürüst.)

### P1
- [ ] **C8** MATCH_JOIN yetersiz bakiye → "CÜZDANA YÜKLE" CTA (kapora akışındaki gibi).
- [ ] **C6 + S19 (birleşik kök):** yetim rezervasyon + askıda PENDING temizliği:
  ödeme ekranı **3 dk oturum** (süre dolunca sıfırla — bayat fiyat/slot yok);
  saatlik süpürme cron'u: 3 dk+ PENDING kart intent → iyzico teyidi → FAILED
  (gerçek çekim varsa PAID'e düzelt) + halı saha slot/booking kilidi serbest.
- [ ] **C10** `formatTRY()` tüm para ekranlarına; "0₺ ÖDE" sessiz kilit açıklanır.

### Latent
- [ ] **C5/C7** iade tahmini sunucu formülüyle birebir (brüt−PSP=net; PSP=0 → düşük etki).
- [ ] **C9** çoklu-slot "X ödedi" rozeti (gerçek split-tahsilat iyzico fazına).
- [ ] **C11** kontrollü RED modu (belirli test tutarı/kartı → decline) — hata UX'i QA edilebilir.

**G1 kapısı:** idempotency anahtarı başına ≤1 cüzdan işlemi · maç başına ≤1
BLOCKED kapora · yetim PENDING rezervasyon = 0 · smoke + birim yeşil.

---

## S2 — İade & Çekim Omurgası

- [ ] **Cüzdandan karta çekim** (K7/K11/K15): `wallet_cashout` RPC — TOP_UP'tan
  %10 kesinti ("ödeme altyapısı komisyonu" açıklamasıyla), iade kredisi
  kesintisiz; akış Kart Yönet/Ayarlar altında **düşük görünürlük**; kesinti ve
  net tutar ekranda **şeffaf** (ör. 300₺ → 270₺ net).
- [ ] **Kazanç çekimi** (K12/S24⭐): ücretsiz + minimum eşik (100₺) + kayıtlı
  IBAN (bir kez gir) + admin "bu hafta ödenecekler" toplu listesi; akış
  sağlayıcı-soyutlamalı (yarın iyzico payout API'sine takılır).
- [ ] **Maç iptali orkestrasyonu** (K9): oyuncu iadeleri + kaptan kaporası +
  tesis kazanç geri alımı + saha rezervasyon iptali tek transaction;
  sandbox'ta **sıfır-toplam** doğrulaması.
- [ ] **Slot'tan tek ayrılma** (K8): ayrılmadan önce "%X iade" önizleme;
  <3 saat uyarısı; slot otomatik yeniden OPEN.
- [ ] **İade bildirimi** (K10): push ("40₺ iaden cüzdanına eklendi 💚") +
  cüzdanda +X₺ vurgusu + "sonraki oyununda kullan" mesajı.
- [ ] **Tesis-bazlı iptal politikası** (K6): admin panelde saha başına override
  (global varsayılan: ≥24s %100 · 6-24s %50 · <6s yok).

**G2 kapısı:** çekim değişmezleri (kesinti yalnız TOP_UP'tan · iade kredisi
kesintisiz · negatif bakiye imkânsız) + iptal orkestrasyonu sıfır-toplam testi.

---

## S3 — Bilgilendirme & Tesis Deneyimi

- [ ] **Onay sayfası işlem detayı** (K4-cevap): tutar, yöntem (•••• 0008/bakiye),
  işlem no, ne için, iade koşulu özeti — dekont = yalnız uygulama içi.
- [ ] **Ödeme öncesi iptal kademesi satırı**: kapora ekranında "≥24s %100 ·
  6-24s %50 · <6s iade yok" tek satır.
- [ ] **MATCH_JOIN bilgilendirme**: "maç iptal olursa paran otomatik iade
  kredisine döner" notu.
- [ ] **Tesise anlık push** (K5): "X, 20 Ağu 21:00 için 300₺ kapora ödedi".
- [ ] **Tesise günlük özet e-postası** (K5): taslak hazır
  (`docs/email-templates/tesis-bildirim.html`) — **⚠️ e-posta sağlayıcı
  seçimi/DNS gerekli** (Resend/Postmark/SES + SPF/DKIM + secret).
- [ ] ⭐ **S21 — Anlık kesin rezervasyon**: tesis müsaitlik yönetimi güçlü;
  çakışmada tesis iptali → otomatik TAM iade + özür bildirimi + öncelikli
  yeniden rezervasyon.
- [ ] ⭐ **S22 — "Kalanı tahsil ettim"**: tesis rezervasyon detayında belirgin
  buton (nakit/kart/havale); OWNER_MANUAL kayıt; komisyon yalnız online kaporadan.
- [ ] ⭐ **S25 — Fiyat dondurma**: rezervasyon anındaki fiyat+kapora kayda
  yazılır; tarife değişikliği yalnız yeni rezervasyonları etkiler (kodda garanti
  altına al + testle kanıtla).

**G3 kapısı:** bilgilendirme smoke turu (ödeme→onay detayı→iptal→bildirim
zinciri ekran ekran doğrulanır).

---

## S4 — Operasyon & Profesyonellik (Admin)

- [ ] **Mutabakat analizi** (K27 — "tam profesyonellik şart"): Admin Finans'a
  **tarih aralığı seçici + gün-bazlı kırılım**: seçilen aralıkta toplam hacim,
  OYNA komisyonu, tesis/sağlayıcı kazançları, payout'lar, platform net; gün gün
  grafik/tablo; **CSV export** (muhasebe/vergi).
- [ ] **Ödeme sağlığı — kendi kendini iyileştiren akış** (K29 geliştirilmiş:
  "hiç başarısızlık olmayacak dinamikte"):
  1. *Önleme:* timeout+retry (var ✓), idempotency (S1), 3 dk oturum (S1).
  2. *Tespit:* sağlık paneli — son 24s başarı oranı, askıda PENDING, ort.
     tahsilat süresi; eşik aşımında push/e-posta uyarısı.
  3. *Otomatik kurtarma:* süpürme cron'u iyzico ile MUTABAKAT yapar — askıda
     intent'i kör FAILED'a çekmez, iyzico'dan gerçek durumu sorar; çekilmişse
     PAID işler (para kaybı sıfır), çekilmemişse kapatır. Uygulanamayan PAID
     (APPLY_ERROR) kuyruğu otomatik yeniden dener.
  4. *Zarif bozulma:* iyzico erişilemezse kartlı akış "bakım" mesajı verir,
     cüzdan akışları çalışmaya devam eder (cüzdan-öncelikli avantajı).
- [ ] **Güvenlik paketi** (K16/17/18):
  - Çekim: TC + IBAN sahibi zorunlu; admin onayda eşleşme kontrolü ekranı;
    ileride iyzico IBAN-isim doğrulama.
  - Hız limitleri: 10 dk'da 5 başarısız ödeme → kısa kilit; yeni hesap 24s
    çekim yasağı.
  - Chargeback: admin "intent işaretle + ilgili kazancı dondur" aracı
    (2 hafta güvence süresi ilk tampon).
- [ ] **Hesap silme kapısı** (K28): açık rezervasyon/bakiye varsa silme
  bekletilir → çöz/çek yönlendirmesi; ödeme geçmişi anonimleştirilip saklanır
  (vergi 10 yıl). App Store zorunluluğu — go-live öncesi şart.

**G4 kapısı:** mutabakat toplamları = ledger toplamları (kuruş farkı yok);
sağlık paneli canlı veriyle doğru; silme kapısı senaryo testi.

---

## S5 — Hizmet Tahsilatı (kararın gereği EN SON) + Canlıya Çıkış

- [ ] **Kaleci/hakem ücreti cüzdandan güvence** (K1 — 🔴 yayın blocker'ı):
  talep anında ücret cüzdandan bloke (bakiye yoksa "Cüzdana Yükle"); sağlayıcı
  kabul → kesinleşir; red/süre dolumu → otomatik iade kredisi.
- [ ] **No-show döngüsü** (K23): maç sonrası kaptan onayı ("sağlayıcı geldi
  mi?") → Hayır: tam iade + güven puanı düşer + tekrarında askı; Evet:
  kazanç kesinleşir (2 hafta güvence → çekilebilir).
- [ ] **Kapora oranı yönetimi** (K2 "sağlamlaştır"): admin global varsayılan +
  tesis paneli oran/sabit tutar seçimi (min-max sınırlı) + FE'de tek kaynaktan.
- [ ] **Go-live kontrol listesi:** gerçek iyzico başvurusu + canlı anahtarlar
  (Dashboard → Secrets; sohbete asla anahtar yazılmaz) · `IYZICO_BASE_URL`
  prod · webhook/callback URL doğrulaması · Store politika metinleri son okuma ·
  ileride SMS'siz (non-3DS) başvuru notu.

**G5 kapısı:** hizmet akışı uçtan uca sandbox (talep→bloke→kabul→tamamlama→
kazanç / red→iade) + go-live checklist %100.

---

## Sürekli katman — Para Değişmezleri Test Paketi (K30 — "önem ver")

S1'in G1'i ile doğar, her sprintte genişler, **her PR'da koşar**:
- Hiçbir intent çift işlenmez (idempotency anahtarı başına ≤1 hareket).
- Hiçbir bakiye negatife düşmez; mirror = kova toplamı.
- Her iade kaynağına eşittir (sıfır-toplam); komisyon toplamları tutar.
- Yetim kayıt = 0 (PENDING rezervasyon/intent yaşlanamaz).
- Eşzamanlılık senaryoları (çift-harcama, slot yarışı) otomatikleştirilir
  (bugün elle kanıtlandı → betiğe dönüşür).

## Organizasyon rutini (kod dışı)

- **Haftalık:** payout toplu listesi işlenir; mutabakat özeti gözden geçirilir.
- **Günlük (otomatik):** sağlık paneli eşik uyarıları; tesis özet e-postaları.
- **Destek senaryoları:** "param nerede?" sorularının standart cevapları
  (iade kredisi nedir, güvence süresi nedir, çekim nasıl) — SSS metni S3'te.

## Açık onaylar (tek kelimeyle veto edebilirsin)

⭐ S21 anlık kesin rezervasyon+telafi · ⭐ S22 kalan tahsilat butonu ·
⭐ S23 kaptan onaylı no-show (S5'te) · ⭐ S24 talep-üzerine+toplu liste ·
⭐ S25 fiyat dondurma. (S23/24 karar tablosunda K-numaralarıyla da geçiyor.)
