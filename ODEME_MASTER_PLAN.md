# OYNA — Ödeme Sistemi Master Planı (v2 — kapsam denetimli)

> Kaynaklar: 30 soruluk değerlendirmenin tüm kararları + S1 "Para & Güven"
> sprint analizi (C1-C11) + kod denetimi bulguları + **son kapsam taraması**
> (tüm para yüzeyleri şemadan tek tek çıkarıldı). Bu belge ödeme sisteminin
> **tek yol haritasıdır**; her sprint bitiminde güncellenir.
>
> Bölüm 5 (S21-25) cevapsız kaldı → önerilen varsayılanlar ⭐ ile işaretli;
> itiraz edilirse plan güncellenir.

---

## 0-A) KAPSAM HARİTASI — hiçbir para yüzeyi dışarıda kalmasın

Son denetimde uygulamadaki **her** para yüzeyi sayıldı ve bir sprint sahibine
bağlandı. Buraya girmeyen para hareketi = plan hatası; bulunursa önce buraya işlenir.

| Para yüzeyi | Durum | Sahip |
|---|---|---|
| Saha kaporası (uygulama içi 3DS) | ✅ canlı, doğrulandı | S1 cilası (C2/C3/C6) |
| Cüzdan yükleme (3DS, tek dokunuş) | ✅ canlı, doğrulandı | S1 (C1 idempotency) |
| Maça katılım (bakiye+kart) | ✅ canlı, doğrulandı | S1 (C8) |
| Maç kaporası (cüzdan güvencesi) | ✅ canlı, doğrulandı | S1 (C2), S2 (orkestrasyon) |
| İadeler (kademeli → kredi) | ✅ canlı | S2 (bildirim, tesis-override) |
| Cüzdandan karta çekim (%10) | ❌ yok — yeni akış | S2 |
| Kazanç çekimi (IBAN, admin onaylı) | ⚠️ var, eşik/toplu liste yok | S2 |
| Kaleci/hakem hizmet ücreti | 🔴 tahsilat YOK (bilinen blocker) | S5 |
| Tesis manuel tahsilat (OWNER_MANUAL) | ✅ altyapı var, UI cilası | S3 (S22) |
| Dijital bilet (ödeme kanıtı) | 🔴 sahte (C4 doğrulandı) | S1 |
| **Abonelik yenileme rezervasyonları** | ⚠️ *yeni tespit:* otomatik yenileme PENDING rezervasyon+fiyat üretiyor; ödemesi tesiste — uygulama-ödeme yoluna girmediği testle sabitlenecek | S3 (S25 fiyat dondurma ile birlikte) |
| **Flaş fırsat indirimleri** | ⚠️ *yeni tespit:* indirimli fiyat, dondurulan fiyatla tutarlı olmalı | S3 (S25 kapsamına) |
| **Referans bonusu (REFERRAL_BONUS)** | ✅ EARNINGS kovasında; çekim kurallarına tabi (kesintisiz kazanç sınıfı) | S2 çekim testlerine dahil |
| **Tesis borç defteri (pitch_debtors)** | ✅ platform parası DEĞİL (tesisin offline defteri) — cüzdanla karışmadığı test edilir | S4 mutabakat notu |
| **Ölü yol: `wallet_topup` RPC** | 🔴 *yeni tespit:* FE artık kullanmıyor ama çağrılabilir — S1'de devre dışı bırakılır (çift yol = risk) | S1 |
| **Eski hosted checkout** (`create` aksiyonu + payment-webhook) | ⚠️ belgeli YEDEK olarak kalır; FE'den erişilmez; go-live'da tekrar değerlendirilir | S5 |
| Admin force capture/void/refund | ✅ v2 imzayla tamir edildi | S4 (chargeback aracı eklenir) |

## 0-B) HATA-GEÇİRMEZLİK KATMANI — "kesinlikle hata çıkmasın" disiplini

**Her iş kaleminin Tanımı-Bitti (DoD) 5 adımdır — biri eksikse iş bitmemiştir:**
1. Migration/kod değişikliği (DB → edge → FE **sırasıyla**; asla FE önce gitmez).
2. Birim/SQL değişmez testi yazıldı ve geçti.
3. **Canlı sandbox'ta uçtan uca doğrulandı** (bu oturumdaki 3DS/eşzamanlılık
   testleri gibi — kanıt: gerçek intent id'leri).
4. Geri alma notu: bu değişiklik nasıl geri alınır (önceki fonksiyon gövdesi
   migration'da saklı / edge önceki sürüme dönebilir / FE bayrakla kapanır).
5. `YAPILACAKLAR.md` + bu plan güncellendi.

**"ASLA" listesi (ihlali = otomatik red):**
- PAN/CVV asla DB'ye, log'a, e-postaya yazılmaz (yalnız son 4 + marka).
- İstemciden gelen tutar/durum asla tek başına güvenilmez — otorite sunucu.
- **Muhasebe satırı asla silinmez/güncellenmez** — düzeltme daima ters/telafi
  kaydıyla yapılır (test temizlikleri sandbox'a özeldir; prod'da yasak).
- İki para yolu aynı işi yapamaz (ölü yol tespit edilirse kapatılır — bkz. wallet_topup).
- Timeout'lu dış çağrıda tahsilat belirsizse asla kör retry (çift çekim) ve
  asla kör FAILED (para kaybı) — önce sağlayıcı mutabakatı.
- Yeni para akışı **kill-switch'siz** açılmaz (app_config bayrağı: cashout,
  süpürücü, hizmet-tahsilatı hepsi kapatılabilir doğar).

**Riskli işler için aşamalı açılış:** önce SIMULATION'da, sonra sandbox
iyzico'da, sonra (go-live'da) düşük limitle prod — her aşamada sağlık paneli
izlenir (S4 tamamlanana dek: admin ledger elle kontrol).

## 0-C) RİSK KAYDI — en olası 6 hata ve panzehirleri

| Risk | Panzehir (planda nerede) |
|---|---|
| Süpürücü, iyzico'da çekilmiş parayı FAILED'a çeker → para kaybı | Süpürücü **iyzico mutabakatı olmadan FAILED yazamaz**; eşiği ≥15 dk ve aktif 3DS penceresine (5 dk) asla girmez; belirsizse PENDING bırakıp uyarı üretir (S1/C6 çekirdeği, S4 gelişimi) |
| Çift dokunuş → iki intent → çift çekim | Idempotency anahtarı prepare'da + buton kilidi (S1/C1); değişmez testi her PR'da |
| Çekim istismarı (kredi biriktir → çek) | %10 yalnız TOP_UP'tan bilinçli; iade kredisi çekilebilir ama kesintisiz→ hacim izlemesi + yeni hesap 24s kilidi + hız limitleri (S4) |
| E-posta sağlayıcı yokken S3 bildirimleri bloklanır | Push (mevcut altyapı) e-postadan **bağımsız** gönderilir; e-posta kalemi ayrı bayrakta — sağlayıcı gecikmesi sprinti kilitlemez |
| Abonelik/flaş fiyatları dondurulan fiyatla çelişir | S25 testi üç kaynağı birlikte doğrular: tarife + abonelik + flaş → rezervasyona yazılan tek fiyat |
| Sprint ortasında main'e paralel değişiklik (çakışma) | Her sprint küçük PR'lar + gün sonu merge; para dosyalarında çakışma çözümü ancak iki tarafın testi birden yeşilken |

## 0-D) BAĞIMLILIK SIRASI (neden bu dizilim)

S1 önce çünkü idempotency + 3dk oturum + dürüst durum, sonraki her şeyin
zeminidir → S2 çekim/iade bu zemine oturur → S3 bilgilendirme, S2'nin ürettiği
olayları anlatır → S4 sağlık/mutabakat, S1-S3'ün ürettiği veriyi izler →
S5 hizmet tahsilatı (kararın gereği en son) her katmanı hazır bulur ve
go-live hepsinin üstüne gelir. Sürekli test katmanı S1'de doğar, hiç kapanmaz.

---

## 0) Değişmezler — her işin uyacağı 4 ilke

| # | İlke | Anlamı |
|---|------|--------|
| P1 | **Para değişmezi** | Her para aksiyonu idempotent + sunucu-doğrulamalı + dürüst. UI asla sunucu durumuyla çelişmez; otorite tektir: `payment_intents.status`. |
| P2 | **Cüzdan-öncelikli** | PSP komisyonu minimum: tek seferde yükle, platform içinde harca. İadeler krediye döner; çekim düşük görünürlük + TOP_UP'tan %10 kesinti (iade kredisi kesintisiz). |
| P3 | **Tek gerçek kaynak** | Komisyon `commission_config`'ten; tutar biçimi tek `formatTRY()` ("1.500,00₺"); fiyat rezervasyon anında donar. |
| P4 | **Test kapısı** | Hiçbir sprint, kendi G kapısı (SQL değişmezleri + smoke + birim) yeşil olmadan kapanmaz; her G kapısı ayrıca **tüm kalemlerde DoD 5/5** şartı taşır (bkz. 0-B). Para değişmezleri paketi her PR'da koşar (S30 — "önem ver"). |

## ✅ Bitmiş temel (yeniden planlanmaz)

Uygulama-içi 3DS kart akışı (3 akış: kapora/yükleme/maça katılım) · kart
kaydetme + tek dokunuş · maç kaporası = cüzdan güvencesi (void/iptalde otomatik
iade kredisi) · komisyon SSOT · owner gelir raporu (brüt→komisyon→net) ·
edge imza tamirleri + çifte-iade bug fix · H2 timeout/retry sertleştirmesi ·
**eşzamanlılık kanıtlandı** (çift-harcama ✓, slot yarışı ✓) · 223 birim test.

---

## S1 — Para & Güven (İLK sprint; kullanıcı analizi)

Hepsi kod denetimiyle doğrulandı. Sıra: C1 → C2 → C3 → C4 → P1'ler → latent.

### P0 — ✅ TAMAM (PR #89, canlı kanıtlı, merge: 2bd96cd)
- [x] **C1 · Çift top-up:** idempotency anahtarı **prepare** aşamasına
  (`prepare_card_payment`'a `p_idempotency_key`; aynı anahtar → aynı intent).
  Buton başarı animasyonu boyunca ref-kilitli; özel tutar max'ı girişte doğrula;
  sıfır iade-kredi çipi gizle. *Kanıt: aynı anahtarla 2 pay → tek intent, canlı.*
- [x] **C2 · Sahte başarısızlık:** `ALREADY_BLOCKED` → sunucudan teyitli BAŞARI
  (intent durumu okunur, bakiye tazelenir, "kapora alındı" gösterilir).
- [x] **C3 · Yanlış yetersiz bakiye:** özet hatası yutulmaz → hata kartı +
  Yeniden Dene; çözülene dek ödeme kilitli; asla 0 bakiye varsayılmaz.
- [x] **C4 · Dürüst bilet:** `ONAYLANDI` sabiti, lucide `<QrCode>` (taranamaz!),
  `OYNA-8293-TX` sabiti, sahte yedekler, ölü Paylaş/Cüzdana-Ekle → hepsi gider.
  Bilet gerçek rezervasyon+ödeme kaydından türer; **gerçek QR üreteci** (rez. id
  + HMAC imza); ödeme yoksa onaylı bilet yok. (K4: SIMULATION'da bile dürüst.)

### P1 — ✅ TAMAM
- [x] **C8** MATCH_JOIN yetersiz bakiye → "CÜZDANA YÜKLE" CTA (kapora akışındaki gibi). *(PR #89)*
- [x] **C6 + S19 (birleşik kök):** askıda PENDING temizliği — **S1.2, canlı DB kanıtı** (bkz. aşağı).
  **Zaman pencereleri (çelişki denetiminde netleşti — karışırsa para hatası doğar):**
  - *Ödeme ekranı oturumu:* **3 dk** ✅ — `PaymentScreen` 3 dk boşta → bakiye/slot
    tazelenir; 3DS AÇIKKEN/işlem sırasında sayaç DURUR (bankadayken kesilmez).
  - *Banka doğrulama penceresi:* 3DS başladıysa **5 dk** (SMS için; mevcut).
  - *Süpürücü eşiği:* **≥15 dk** ✅ — DB'de `GREATEST(15,…)` ile TABAN zorlanır;
    aktif 3DS penceresine ASLA giremez. 15 dk+ PENDING → önce iyzico mutabakatı →
    çekilmişse PAID'e düzelt (heal), çekilmemişse FAILED, belirsizse dokunma.
    NOT: `prepare_card_payment` yan etki yaratmadığından (slot kilitlemez) stale
    intent yetim slot/booking BIRAKMAZ; süpürücü yalnız intent durumunu düzeltir.
- [x] **C10** `formatTRY()` tüm para ekranlarına; "0₺ ÖDE" sessiz kilit açıklanır. *(PR #89)*
- [x] **Ölü yol kapatma:** `wallet_topup` RPC devre dışı; tek yükleme yolu 3DS akışı. *(PR #89)*

### S1.2 — Askıda Ödeme Süpürücüsü (C6/S19) — ✅ KODLANDI + CANLI DB KANITI
- **DB** (canlı: `20260726000000`): `list_stale_payment_intents` (kill-switch içi
  kontrol + 15dk taban + yalnız in-app flow + IYZICO + PENDING; escrow/BLOCKED ve
  legacy raw=NULL kapsam dışı), `mark_intent_auth_charged` (kurşungeçirmez heal
  işareti). Heal=`apply_card_payment`, Fail=`mark_intent_failed` (mevcut, idempotent).
- **Edge** (canlı: `sweep-stale-payments` v1): iyzico `/payment/detail`
  (`paymentConversationId`=intent id) mutabakatı → CHARGED heal / NOT_CHARGED fail /
  AMBIGUOUS skip. `auth_charged` işareti varsa iyzico'ya SORMADAN heal. Kör FAILED yasak.
- **Callback** (canlı: `iyzico-3ds-callback` v2): APPLY_ERROR'da çekim kanıtını işaretler.
- **Cron** (`20260726000001`): saatlik; GUC yoksa kurulmaz (bu projede henüz yok).
- **Kill-switch** `sweeper_enabled` = **KAPALI** doğar.
- **Canlı DB kanıtı (sıfır kalıntı, RAISE ile geri alındı):** kill-switch kapalı→liste
  boş ✓ · aday seçimi yalnız in-app+≥15dk ✓ · 5dk/legacy/BLOCKED hariç ✓ · 15dk taban
  eşik=1'e rağmen korunur ✓ · marker-heal→PAID+1 TOP_UP wtx ✓ · fail→FAILED ✓ · tekrar
  apply idempotent (çift kredi yok) ✓.

> **⚠️ GO-LIVE (süpürücüyü açmak — bilinçli adım, "kill-switch'siz açılmaz"):**
> 1. `WEBHOOK_SECRET` edge secret'ını ayarla (bu projede henüz yok → edge şu an
>    fail-closed 500 döner, hiçbir şey yapmaz).
> 2. GUC: `ALTER DATABASE postgres SET app.settings.functions_base_url=…` +
>    `… webhook_secret=…`, sonra `20260726000001` cron bloğunu tekrar çalıştır.
> 3. İlk çalıştırmalarda `[sweep] detail` loglarından iyzico `/payment/detail`'in
>    `paymentConversationId` ile SUCCESS/failure döndürdüğünü **teyit et** (FAIL
>    yolunun güvenli olduğunu doğrula). Belirsizse yalnız marker-heal aktif kalır.
> 4. `app_config.sweeper_enabled = true` (Admin panelden) — tek anahtarla geri kapatılır.

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
- [ ] ⭐ **S25 — Fiyat dondurma (3 kaynaklı)**: rezervasyon anındaki fiyat+kapora
  kayda yazılır; tarife değişikliği yalnız yeni rezervasyonları etkiler. Test
  ÜÇ fiyat kaynağını birlikte kapsar: normal tarife + **abonelik yenileme
  rezervasyonları** + **flaş fırsat indirimi** → rezervasyona yazılan tek fiyat,
  sonradan hiçbir kaynaktan değişmez. Abonelik rezervasyonlarının uygulama-ödeme
  yoluna girmediği (tesiste ödeme) ayrıca testle sabitlenir.

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
⭐ S25 fiyat dondurma. (Metindeki K-referansları `YAPILACAKLAR.md` karar
tablolarındaki soru numaralarına işaret eder.)
