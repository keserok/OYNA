# ⚽ OYNA — Oyuncu (Player) Edge-Case Analizi & Çözüm Planı

> **Rol:** Oyuncu (PLAYER) · **Faz:** 1/4 (sonra Kaleci → Hakem → Tesis)
> **Yöntem:** 4 paralel derin kod-denetimi + **canlı sürüş** (Playwright, prod Supabase) + Master Prensipler'e karşı gap analizi
> **Tarih:** 2026-07-13 · **v2 (uygulama-sınıfı):** 2026-07-14 · **Branch:** `claude/player-edge-cases-plan-ggtezh`
> **Bakış açısı:** Milyar dolarlık bir ürün ekibinin QA'i + geliştiricisi. Odak: **UI/UX akış olgunluğu.**

Bu belge çözümleri **uygulamaz**; onaya sunar. Onayladığın maddeler `PROBLEMLER_VE_COZUMLER.md` iş akışına göre tek tek kodlanır.

> **✅ Onaylanan kararlar (2026-07-13):**
> - **K2/B1 — minRating:** Varsayılan **YOK** (maç herkese açık); yalnız kurucu isterse baraj koyar.
> - **K1 — Cüzdan top-up:** **Kalır**; Master 4.6 buna göre güncellenecek (cüzdan-öncelikli ödeme). C-grubu tam kapsam (idempotency + min/max).
> - **K4 — Ödeme sağlayıcı:** Şimdilik **SIMULATION**; UX simülasyon gerçekliğine göre kurgulanır. Gerçek iyzico pre-auth/capture **ayrı iş** olarak askıda.
> - **K3 — Misafir modu (varsayılan karar, v2):** Tek noktadan **GuestGate** ile tam kapılama; lansman build'inde bayrakla kapanır. (Vetoyla değiştirilebilir.)
> - **Sonraki adım (v2):** Plan **uygulama-sınıfı**na yükseltildi — §5'te iş paketleri, kabul kriterleri, izlenebilirlik matrisi ve sprint çıkış kapıları tanımlı. Uygulama, onayla S0'dan başlar.

---

## 0. Nasıl test ettim (Metodoloji)

1. **Statik derin denetim (4 paralel ajan):** Oyuncunun dokunduğu her yüzey ayrı ayrı, satır satır tarandı — (A) Giriş/Onboarding/Kabuk, (B) Maç yaşam döngüsü, (C) Para (cüzdan/ödeme/kapora/bilet/rezervasyon), (D) Kimlik/Takım/Sosyal/Değerlendirme. ~120 ham edge-case çıktı.
2. **Canlı sürüş (yaşayarak):** `npm run dev` + prod Supabase (`iikvzgyccvgcybzdfwlv`), sandbox TLS shim üzerinden. Playwright, mobil viewport (390×844), gerçek demo hesap `oyuncu01@oyna.app` (Emre Kaya). Her adımda ekran görüntüsü + ağ hatası kaydı.
3. **Spec gap analizi:** Her bulgu `OYNA_MASTER_PRENSIPLER.md`'deki **amaçlanan** davranışa karşı ölçüldü (en üst otorite).

**Kümeleme:** 120 ham bulgu → 6 sistemik kök neden + ~40 somut problem. Semptom yerine kök nedene vurdum — bir milyar dolarlık ekip böyle çalışır.

---

## 1. Canlı sürüşte GÖZÜMLE doğruladıklarım (kanıtlı)

Bunlar teori değil — uygulamayı sürerken bizzat gördüm:

| # | Gözlem | Kanıt |
|---|--------|-------|
| L1 | **"Bağlantı zayıf — bazı veriler yüklenemedi" turuncu bandı, bağlantı sağlamken HER ekranın üstünde kalıcı.** Giriş ekranında bile var. | Bootstrap `store.ts:976` bir oyuncuda **admin-only** RPC (`admin_fetch_goalkeepers`/`admin_fetch_referees`) çağırıyor → 400/401. Ağ trafiğinde tek başarısız Supabase çağrısı bunlar. |
| L2 | **Bant, sayfa başlığını (ör. "ANA SAYFA", "PROFİL") üstten kırpıyor.** İki üst-bant çakışıyor. | Offline bandı `z-100`, degraded bandı `z-60`, ikisi de `top-0`. |
| L3 | **Profil ekranı ~12 saniye "Profil yükleniyor..." spinner'ında kaldı**, sonra açıldı. | Sıralı (paralel değil) fetch + singleton timing. |
| L4 | **Güven Puanı = 100, oynanan maç = 0.** Yeni/demo oyuncu maxlanmış görünüyor. | `ProfileScreen.tsx:194` `(trustScore ?? 5) * 20`. |
| L5 | **Tutarsız sayaç:** Profil "3 Takım" derken Sosyal→Takımlar aynı anda "0 takım" gösterdi. | Farklı veri kaynakları (profil sayacı vs `get_my_teams`/legacy). |
| L6 | **Cüzdanda "Para Yükle" + "YÜKLENEN BAKİYE 200₺" var.** Bu, Master 4.6 "**Para yükleme: Lansmanda YOK**" ile doğrudan çelişiyor. | `WalletScreen` top-up akışı canlı. Ürün kararı gerek (bkz. §4-K1). |
| L7 | Maç keşfinde "Aktif Maç Bulunamadı", takım listesinde iskeletler — boş durumların bir kısmı iyi, bir kısmı iskelet↔boş karışıyor (bkz. E-grubu). | — |

> Not: Konsolda görülen `ERR_CONNECTION_RESET` **yalnızca Google Fonts** (harici host, sandbox proxy artefaktı). Ürün sorunu değil; prod'da olmaz. Şeffaflık için not düştüm.

---

## 2. Sistemik kök nedenler (en yüksek kaldıraçlı 6 düzeltme)

Aşağıdaki 6 kök neden, ~120 semptomun büyük kısmını üretiyor. Bunları çözmek düzinelerce edge-case'i **tek hamlede** kapatır. Öncelik sırası burada.

### 🔴 KN-1 — `auth.currentUser` reaktif olmayan bir modül singleton'ı
`supabaseAuth.ts`'teki `auth.currentUser` düz bir mutable nesne; asenkron doldruluyor ve **React-reaktif değil**. Ekranlar render anında doğrudan okuyor. Doldurma penceresinde mount olan ekran, boş/eski kullanıcı görüyor ve sonradan yeniden render **olmuyor**.
**Doğurduğu semptomlar:** giriş yapmış oyuncunun kısa süre "Misafir"/"Oyuncu" görünmesi (L3, ProfileScreen), splash'ta oturumun AUTH'a düşmesi, PendingVerification'ın abone olamaması, profil ekranının takılması (L3).
**Çözüm yaklaşımı:** `auth.currentUser`'ı Zustand/Context'e taşıyıp reaktif yapmak; ekranlar `useAuthUser()` üzerinden okur; singleton yalnızca köprü olur. "Kimlik hazır mı?" (`authReady`) bayrağıyla render kapısı.

### 🔴 KN-2 — Bootstrap, oyuncuda admin-only RPC çağırıyor (degraded banner'ın kaynağı) — **L1**
`store.ts:976` `Promise.all([fetchGoalkeepersAdmin(), fetchRefereesAdmin()])` — bir oyuncunun asla erişemeyeceği admin RPC'leri. Üstelik `store.ts:1029` oyuncunun **kendi profilini** bu (yüklenemeyen) `adminUsers` listesinden türetiyor → `{ name: 'Oyuncu' }` fallback'i. Yani tek bir yanlış tasarım hem degraded banner'ı hem maç akışındaki "Oyuncu/Misafir" isim fallback'lerini besliyor.
**Çözüm yaklaşımı:** Oyuncu bootstrap'ından admin RPC'lerini çıkar; oyuncunun kimliğini `getMyProfile()` (kendi RLS'i) üzerinden al; `adminUsers` yalnız admin panelinde yüklensin. Degraded banner mantığını yalnız **oyuncuya ait** kritik çağrılara bağla.

### 🔴 KN-3 — `updateMatch` tam-dizi client yazımı + realtime yankı döngüsü
`MatchJoin` katılım/ayrılma/çıkarma akışları, **yerel (bayat)** `match.slots` dizisinin tamamını `player_update_match` ile PUT ediyor (`MatchJoin.tsx:512-536` vb.). Aynı zamanda realtime UPDATE handler'ı (`:291-311`) gelen değişikliği tekrar `updateMatch` ile **DB'ye geri yazıyor** → her tick'te yazma fırtınası + eşzamanlı katılanların kaybolması (lost-update).
**Çözüm yaklaşımı:** Slot mutasyonlarını **atomik RPC**'lere indir (zaten var: `join_public_match_slot`, `leave_public_match_slot`, `player_buy_slots`); client asla tüm diziyi yazmasın. Realtime handler'ı **salt-okuma** yapsın (store'u güncelle, DB'ye yazma). `handleBuySlots`'taki "önce fetch" deseni (`:594`) tüm mutasyonlara taşınsın.

### 🟠 KN-4 — Puan ölçeği ×20 + varsayılan 5.0 → her yerde OVR 100 "gold" — **L4**
`rating ?? 5` sonra `×20` = 100; yeni oyuncunun FIFA kartı **OVR 100 gold**, tüm alt-statlar 50 (kırmızı bar), güven puanı 100 (`ProfileScreen.tsx:24,194`; default `userService.ts:82 rating:5.0`). Takım dengeleme de herkesi 100 sayıp anlamsızlaşıyor (`teamService.ts:389`).
**Çözüm yaklaşımı:** "Henüz puanı yok" ile "5.0 puanı var" ayrımı. Yeni oyuncu için **Rookie/"Yeni"** kart durumu (nötr gri tema, "—" OVR, "İlk maçını oyna, kartın oluşsun" mesajı). Ölçek tek yerde (`ratingToOverall()` util), maç sayısı 0 iken tier = rookie.

### 🔴 KN-5 — Para aksiyonlarında idempotency yok + sessiz wallet-summary hatası
Top-up (`WalletScreen.tsx:215`) ve maç-kaporası bloklaması (`PaymentScreen.tsx:387`) **idempotency key'siz** — çift dokunuş/yeniden deneme çift çekim veya yanlış "zaten işlendi" hatası üretiyor. Ayrıca `PaymentScreen.tsx:174-186` cüzdan özetini `catch {}` ile yutuyor → geçici hata anında bakiye `0` görünüp kullanıcıyı **gereksiz** "CÜZDANA YÜKLE"ye veya tam kart çekimine itiyor.
**Çözüm yaklaşımı:** Tüm para RPC'lerine client-üretimli `idempotencyKey`; başarı penceresinde buton kilidi. Cüzdan özeti hatası **sessiz düşmesin** — açık "bakiye alınamadı, tekrar dene" durumu (WalletScreen'de zaten var, PaymentScreen'e taşınacak).

### 🟠 KN-6 — Mock/placeholder ekranlar "bitmiş" gibi sunuluyor (lansman blokeri)
Görünüşte tamam ama **sahte veri** ile çalışan yüzeyler — en tehlikelisi bunlar çünkü "hazır" sanılıyor:
- **Dijital Bilet** her zaman "ONAYLANDI" + sabit sahte QR + `OYNA-8293-TX` (`MatchTicket.tsx:51,96,101`), ödeme durumundan bağımsız.
- **Maç Sonu Değerlendirme** sabit **5-3** skoru + işlevsiz Onayla/İtiraz (`PostMatchEval.tsx:410,422`).
- **Maç Takvimim** tümüyle mock, dokununca `null` lobiye (boş ekran) düşüyor (`MatchCalendar.tsx`).
- **Taktik tahtası** varsayılan sahte kadro ("Volkan Demirel" vb.) (`TeamLineupBoard.tsx:71-89`).
- **Keşif fiyatları** dizindeksinden uyduruluyor (`MatchDiscovery.tsx:166`); **eksik pozisyonlar** her maçta sabit "1 STP / 1 ORT" (`useMatchCreate.ts:409`).
**Çözüm yaklaşımı:** Her birini gerçek veriye bağla veya gerçekleşene kadar dürüst boş/iskelet durumu göster. Sahte veri → prod'da **asla**.

---

## 3. Yolculuk bazında bulgular & önerilen çözümler

Öncelik: 🔴 P0 (para/güven/veri bütünlüğü/çıkmaz), 🟠 P1 (akış kırılması/tutarsızlık), 🟡 P2 (cila/boş-hata durumu).

### A. Giriş · Onboarding · Uygulama Kabuğu

**[A1] 🟠 Başarılı girişten sonra buton sonsuza dek dönebiliyor.** Başarı handler'ları `isLoading`'i bilerek sıfırlamıyor, navigasyonu dış dinleyiciye bırakıyor (`AuthScreen.tsx:300-307`). Dinleyici KN-1/KN-2 yüzünden gezinmezse kullanıcı asılı kalır. **Çözüm:** başarı sonrası zaman aşımı + geri-dönüş; navigasyonu KN-1 reaktif kimliğiyle deterministik yap.

**[A2] 🟠 Geçici profil okuma hatası, mevcut kullanıcıyı "yeni kayıt" sanıp role'ünü PLAYER'a düşürüp onboarding'e atıyor.** `.single()`'ın `error`'ı yutuluyor (`App.tsx:132-138`). **Çözüm:** hata ile "kayıt yok"u ayır; yalnız gerçek 0-satırda yeni-kullanıcı dalına gir; hata → retry durumu.

**[A3] 🔴 Onay ekranı (PendingVerification) yalnız realtime; kaçan event → sonsuz "inceleniyor".** Manuel yenileme/başlangıç fetch'i yok (`PendingVerificationView.tsx:34-70`). (Bu esas GK/Hakem'i vurur ama shell oyuncu tarafında.) **Çözüm:** mount'ta durum fetch'i + "Durumu yenile" butonu + periyodik yoklama.

**[A4] 🟠 Konum izni: "reddedildi / cihazda yok / zaman aşımı" tek mesaja çöküyor; 10sn tarama sırasında iptal yok.** (`LocationPrompt.tsx:45-55`). **Çözüm:** üç durumu ayır (net mesaj + doğru CTA), taramada "Vazgeç", zaman aşımında manuel şehir/ilçe fallback'ini (Master 3.1) öne çıkar.

**[A5] 🟡 Tek kök ErrorBoundary → herhangi bir lazy-chunk yüklenmezse tüm kabuk çöküyor** ve reload ile splash'a atıyor (`ErrorBoundary` yalnız `index.tsx`). **Çözüm:** view seviyesinde Suspense hata sınırı + "Bu bölüm yüklenemedi, tekrar dene" (kabuk/alt-nav ayakta kalır).

**[A6] 🟡 Alt-nav `resetNavigation` ile geçmişi siliyor** → sekme sonrası "geri" bağlamı kaybediyor, Android donanım-geri şaşırıyor (`App.tsx:665`). **Çözüm:** sekmeler kök yığını korusun; geri deterministik olsun.

**[A7] 🟡 Demo hesap seçici ve `?demo=1` prod'da varsayılan açık** (`supabaseAuth.ts:291`). Master: lansmanda misafir/demo kaldırılır. **Çözüm:** lansman build'inde `VITE_DEMO_ACCOUNTS=false` (spec) + guest yollarını gate'le.

### B. Maç Keşfi · Katılım · Yaşam Döngüsü

**[B1] 🔴 Oluşturulan HER maça sabit `minRating: 4.0` → yeni oyuncu (rating 0/rookie) tüm vitrini KİLİTLİ görüyor.** (`useMatchCreate.ts:406` + kilit `MatchDiscovery.tsx:1159`). Soğuk-başlangıç çıkmazı: yeni kullanıcı hiçbir maça giremez. **✅ Çözüm (K2 kararı):** varsayılan `minRating` **YOK** (maç herkese açık); yalnız kurucu açıkça "deneyimli maçı" seçerse uygulanır. Rookie'ler için ayrı "yeni oyuncu dostu" rozeti.

**[B2] 🔴 `minRating` kapısı yalnız keşif kartında; lobiye yan kapılardan (özel kod, takvim, Dashboard) girince kontrol yok** (`MatchJoin.tsx` içinde `minRating` yalnız realtime map'te). **Çözüm:** kapıyı **sunucu tarafında** (join RPC) zorunlu kıl; UI her giriş yolunda tutarlı mesaj göstersin.

**[B3] 🔴 Katılım yarışı: eşzamanlı katılan client'ler tüm diziyi ezip birbirini siliyor (lost-update).** (KN-3). **Çözüm:** KN-3 (atomik RPC + salt-okuma realtime).

**[B4] 🔴 Kurucunun "maçı iptal et" kontrolü oyuncu arayüzünde HİÇ yok.** `cancelMatchByCaptain` serviste var ama hiçbir view çağırmıyor (`matchLifecycleService.ts:49`). **Çözüm:** "Maçlarım" yönetim ekranına (Master 3.3) iptal aksiyonu + kademeli iade uyarısı.

**[B5] 🔴 Ücretli maçtan ayrılınca iade/uyarı yok — sessiz kayıp.** `handleLeaveMatch` iade çağırmıyor, onay metni parayı anmıyor (`MatchJoin.tsx:824-914,1286`). **Çözüm:** Master 3.3 kademeli iade motoruna bağla; onay modalında "şu kadar iade/kredi alırsın" net göster.

**[B6] 🔴 "Takıma Katıl" sahte simüle onay (2.5sn sonra otomatik kabul) + state yarışı** (`MatchDiscovery.tsx:996-1004`, local-only mutator). **Çözüm:** gerçek katılım-talebi RPC'si; iyimser UI + geri-alma; sahte setTimeout kaldırılır.

**[B7] 🟠 Ödeme detourunda slot tutulmuyor** → kullanıcı öderken slotu başkası alıyor (`MatchJoin.tsx:556-582`). **Çözüm:** ödeme öncesi `pitch_slot_holds` benzeri **geçici slot hold** (Master 3.3 "geçici hold"); süre + geri sayım UI.

**[B8] 🟠 Başlamış/geçmiş maçlar listede ve tıklanabilir ("BAŞLADI" kartı lobiye giriyor).** (`MatchDiscovery.tsx:1183,1216`). **Çözüm:** zaman filtresi; geçmiş maç "Sonuç Gir/Görüntüle"ye yönelir, katılım kapanır.

**[B9] 🟠 Sahte fiyat & sabit eksik pozisyon (KN-6):** fiyat `i===2?0:200` (`:166`), pozisyon her maçta "1 STP/1 ORT" (`useMatchCreate.ts:409`). Bütçe/pozisyon filtreleri bu uydurma veriyle çalışıyor. **Çözüm:** gerçek `price`/`missingPositions` (kadro-türevli); veri yoksa fiyatı gizle, "kontenjan" göster.

**[B10] 🟠 "X KM çapındaki maçlar" başlığı, RPC 0 dönünce sessizce TÜM maçlara düşüyor** (`MatchDiscovery.tsx:157`). **Çözüm:** boşsa dürüst "yakında maç yok + yarıçapı genişlet" CTA; uzak maçlar ayrı "Diğer bölgeler" bölümünde.

**[B11] 🟠 Draft/rezervasyon→maça çevir: ücretli saha "Ücretsiz" görünüyor, kapora 0 alınıyor** (`useMatchCreate.ts:229-233`). **Çözüm:** dönüşümde tarifeden `totalPrice`/`deposit` çek; 0 ise uyar.

**[B12] 🟠 Maç satırı, oluşturma kaporası ödenmeden yaratılıyor → fonlanmamış/yetim maç** (`useMatchCreate.ts:427` önce, ödeme sonra). **Çözüm:** "taslak" durumu; yayın yalnız kapora blokajından sonra (Master 3.3 "katılım=blokaj").

**[B13] 🟡 Countdown bileşik/fallback zaman string'lerinde `NaN`/yanlış gün** (`MatchDiscovery.tsx:1111-1139`; `useMyMatches.ts:8-19` dd.mm.yyyy'yi bugüne çöküyor). **Çözüm:** tek `parseMatchDateTime()` util (ISO + TR biçimleri + tz); Dashboard "Sıradaki maç" doğru.

**[B14] 🟡 Yalnız yedek olan oyuncu maçı "Sıradaki Maçlarım"da görmüyor** (`useMyMatches.ts:33-42`). **Çözüm:** yedek katılımı da dahil et; "Yedektesin" rozeti.

**[B15] 🟡 Boş durum ve iskelet eksikleri:** keşifte skeleton yok (boş↔stale titremesi) (`MatchDiscovery.tsx:139-152`). **Çözüm:** yükleme iskeleti + tek net boş durum.

### C. Para: Cüzdan · Ödeme · Kapora · Bilet · Rezervasyon

**[C1] 🔴 Çift top-up (idempotency yok + başarı penceresinde buton yeniden aktif).** (`WalletScreen.tsx:215,225-228`; KN-5). Canlıda çift banka çekimi. **Çözüm:** KN-5.

**[C2] 🔴 `blockMatchDeposit` başarılı olsa da yanıt kaybolursa "zaten işlendi"yi HATA gösteriyor.** (`PaymentScreen.tsx:387`; `ALREADY_BLOCKED` map'siz). Para gitti ama UI "ödeme başarısız" diyor. **Çözüm:** idempotency + `ALREADY_BLOCKED`'ı **başarı** olarak yorumla.

**[C3] 🔴 Sessiz cüzdan-özeti hatası → yanlış "yetersiz bakiye" / tam kart çekimi.** (`PaymentScreen.tsx:174-186`; KN-5). **Çözüm:** KN-5 (açık hata durumu).

**[C4] 🔴 Dijital bilet her zaman "ONAYLANDI" + sahte QR, ödemeden bağımsız (KN-6).** (`MatchTicket.tsx`). Turnike/giriş artefaktı doğrulanamaz. **✅ Çözüm (K4 kararı):** bilet, *simüle edilmiş* ödeme/rezervasyon durumunu **dürüstçe** yansıtsın — gerçek rezervasyon ID'sinden dinamik QR; ödeme (simülasyonda dahi) tamamlanmadıysa bilet "ONAYLANDI" göstermesin.

**[C5] 🔴 İptal iade tahmini PSP ücretini atlıyor → söz verilenden az iade.** UI `paid×pct` gösteriyor, backend `−psp_fee` düşüyor (`MyBookings.tsx:325-327` vs `faz7_refund_policy.sql:141`). **Çözüm:** tahmini backend formülüyle **birebir** aynı yap; "≈" yerine kesin kırılım.

**[C6] 🟠 Legacy PITCH_DEPOSIT rezervasyonu ödemeden ÖNCE yaratıyor → yetim PENDING rezervasyon + hayalet slot işgali** (`PaymentScreen.tsx:327-341`). **Çözüm:** rezervasyon yalnız ödeme başarısında; ya da kısa süreli hold.

**[C7] 🟠 İade eşikleri/zaman-dilimi backend'den sapıyor** (UI tarayıcı saati + sabit eşik; backend admin-ayarlı + Europe/Istanbul) (`MyBookings.tsx:322-324`). **Çözüm:** eşik/tz'yi sunucudan çek; sınır anlarında yanlış % gösterme.

**[C8] 🟠 Yetersiz bakiye + kart yok = pasif "ÖDE", belirgin top-up CTA yok (MATCH_JOIN)** (`MatchJoin.tsx:551-582`). Kapora akışının aksine yükleme çağrısı gizli. **Çözüm:** `balanceOnly` mantığını MATCH_JOIN'e de uygula; belirgin "CÜZDANA YÜKLE".

**[C9] 🟠 Çoklu-slot "split": tüm bedeli alıcı ödüyor, davet edilen ödemezse mutabakat yok** (`MatchJoin.tsx:553`). **Çözüm:** "kim kime borçlu" görünürlüğü veya davet edilene ayrı blokaj (Master 3.2 "paylara ek blokaj").

**[C10] 🟡 Bilet "Paylaş"/"Cüzdana Ekle" butonları işlevsiz** (`MatchTicket.tsx:107-113`); para formatları ekranlar arası tutarsız (`1.500₺` vs `1.500,00₺`) (`PaymentScreen.tsx:66` vs `WalletScreen.tsx:60`); sıfır-kapora "0₺ ÖDE" butonu sessiz kilitli (`PaymentScreen.tsx:133,880`). **Çözüm:** ölü butonları bağla/gizle; tek `formatTRY()` util; sıfır-tutar durumunu açıkla.

**[C11] 🟡 Ödeme sağlayıcı SIMULATION her zaman başarılı → kart-red/3DS-fail/çift-çekim UX'i test edilemiyor** (`create-payment/index.ts:286`). **Çözüm:** test için kontrollü başarısızlık modu (ör. belirli tutar/kart → red) ki hata banner'ları QA edilebilsin.

### D. Kimlik: Profil & FIFA Kart

**[D1] 🟠 Rookie OVR 100 gold + Güven 100 (KN-4, L4).** **Çözüm:** KN-4 (rookie kart durumu + tek ölçek util).

**[D2] 🟠 Profil yüklenemezse düzenlenebilir boş "Oyuncu" profili gösteriliyor → kullanıcı gerçek profili ezme riski** (`userService.ts:207` hatayı yutuyor → null; `ProfileScreen.tsx:115`). **Çözüm:** yükleme hatasında **hata durumu + retry**, "Düzenle" kilitli; boş profil ile hata ayrımı.

**[D3] 🟡 Avatar boş dairede initials fallback yok (L: profilde gördüm); edit modal avatarında `onError` yok** (`ProfileScreen.tsx:349`). **Çözüm:** her yerde ortak `Avatar` bileşeni (foto→initials→silüet zinciri).

**[D4] 🟡 Türkçe casing (`i/İ`) CSS `uppercase` ile bozuluyor; uzun ad truncate; RTL/emoji taşması** (`PlayerCard.tsx:298`). **Çözüm:** locale-doğru casing util; ad için `min-w-0`+`break-words`; `dir="auto"`.

**[D5] 🟡 Görsel yükleme hataları (HEIC, >10MB, çok küçük, offline) profilde SESSİZCE yutuluyor** (`ProfileScreen.tsx:151-162` yalnız `console.error`). **Çözüm:** açıklayıcı toast/inline hata (mesajlar `imageCompression.ts`'te zaten var, sadece UI'a taşınacak) + ilerleme/timeout.

### E. Takım · Taktik Stüdyo

**[E1] 🔴 Stüdyo: custom formasyon aktifken oyun kimliği değişince `JSON.parse(undefined)` → çökme** (`Studio.tsx:648`). **Çözüm:** `FORMATIONS[size][label]` yoksa güvenli fallback; custom formasyonu ayrı sakla.

**[E2] 🟠 Takım sayaç tutarsızlığı (L5): Profil "3 Takım" vs Sosyal "0 takım".** Farklı kaynaklar. **Çözüm:** tek kaynak (`get_my_teams`); tüm sayaçlar oradan.

**[E3] 🟠 Taktik tahtası varsayılan sahte kadro + legacy `myTeams` ghost roster + 7-oyuncu kilidi (5v5/11v11 bozuluyor)** (`TeamLineupBoard.tsx:71-89,92,181; KN-6`). **Çözüm:** `get_team_squad`'dan gerçek kadro; format-duyarlı slot; boş kadroda dürüst durum.

**[E4] 🟠 Herkes OVR 100 → "Akıllı Dengeleme" anlamsız + tek/çift oyuncuda dengesiz takım uyarısız** (`teamService.ts:389`, `TeamBuilder.tsx:59-65`). **Çözüm:** KN-4 ölçeği; eşit-olmayan bölünmede uyarı + kadro sayısı göster.

**[E5] 🟠 Kaptan "Takımdan Ayrıl" ancak sunucu reddedince hata veriyor (buton pasifleştirilmiyor)** (`TeamSettingsSheet.tsx:400-405`). **Çözüm:** üye varsa "önce kaptanlığı devret" akışına yönlendir; buton durumu net.

**[E6] 🟡 Boyut/formasyon değişince çizimler onaysız siliniyor; sürükle-bırak ile "tahtadan at" yok** (`Studio.tsx:643,685,1179`). **Çözüm:** "çizimler silinecek" onayı/undo; kenar-dışı bırakınca kaldır.

**[E7] 🟡 `TeamDashboard`: `friendsData`'da olmayan üyeler sessizce düşüyor; `color1` yoksa geçersiz CSS renkleri** (`TeamDashboard.tsx:34,47`). **Çözüm:** kadroyu kadro RPC'sinden al; renk fallback'i.

### F. Sosyal · Mesajlaşma · Arkadaş

**[F1] 🟠 DM'den "Engelle" sohbeti kapatmıyor, girişi kapatmıyor; blok ancak başarısız gönderide anlaşılıyor** (`MessagesView.tsx:308-317`). **Çözüm:** blokta sohbeti kapat/kompozeri kilitle + net durum.

**[F2] 🟠 İki farklı "blok" semantiği:** DM `blockUser` (arkadaşlığı korur) vs profil `blockUserFully` (arkadaşlığı siler) (`messageService.ts:107` vs `socialService.ts:294`). **Çözüm:** tek "blok" davranışı; her yerde aynı sonuç.

**[F3] 🟠 DM'den "Şikayet Et" backend'e yazmıyor ama "alındı" diyor** (`MessagesView.tsx:319-322`). **Çözüm:** gerçek `reportUser` çağrısı (profil sheet'te zaten var).

**[F4] 🟡 Misafir "Sosyal"da 0 arkadaş/0 takım, giriş CTA'sı yok; boş `userId` ile realtime abonelik** (`SocialView.tsx:41,122`). **Çözüm:** misafir CTA'sı; `userId` boşken abone olma.

**[F5] 🟡 "Tümünü Kabul Et" seri döngü, kısmi hata belirsiz; arama sonuçlarında sıra-koruma yok** (`FriendsPanel.tsx:105-113`, `FriendAddView.tsx:188-207`). **Çözüm:** toplu sonuç raporu; arama isteğine abort/seq guard.

### G. Maç Sonu Değerlendirme

**[G1] 🔴 Sabit 5-3 skoru + işlevsiz Onayla/İtiraz + sahte saha/saat başlığı (KN-6)** (`PostMatchEval.tsx:410,422,459`). **Çözüm:** gerçek maçtan skor/başlık; Onayla/İtiraz gerçek RPC'ye (Master 3.4 skor onayı).

**[G2] 🟠 Gerçek-ama-boş maçta MOCK oyuncular (`p1..p5`) gerçek RPC'ye puanlanıp reddediliyor** (`PostMatchEval.tsx:138-156`). **Çözüm:** gerçek katılımcı yoksa değerlendirmeyi aç/gizle; mock'u prod'dan çıkar.

**[G3] 🟠 "Zaten değerlendirdin / süre doldu" durumu yok; organizasyon yorumu textarea'sı kaydedilmiyor** (`PostMatchEval.tsx:213,761`). **Çözüm:** pencere/tekrar kontrolü + net durum; yorum alanını bağla.

---

## 4. Senin kararın gereken noktalar

- **K1 — Cüzdana para yükleme (top-up).** ✅ **KARAR: Kalır.** Master 4.6 "lansmanda YOK" ifadesi cüzdan-öncelikli ödemeye göre güncellenecek. C-grubu tam kapsam (idempotency + min/max + hata durumları).
- **K2 — `minRating` varsayılanı.** ✅ **KARAR: Varsayılan YOK** (maç herkese açık); yalnız kurucu açıkça "deneyimli maçı" seçerse baraj uygulanır. B1 buna göre kurgulanır.
- **K3 — Misafir (guest) modu.** 🟨 **VARSAYILAN KARAR (v2): tam kapılama.** Master "lansmanda YOK" der. Tüm misafir dead-end'lerini tek tek onarmak yerine **tek `GuestGate` sarmalayıcısı**: misafir yalnız Keşfet + Saha Vitrini'ni salt-okur gezer; diğer her yüzey/aksiyon kayıt CTA'sına açılır; kalıcı "Misafir modundasın" şeridi + tek dokunuşla çıkış; lansmanda `VITE_GUEST_MODE=false` ile tamamen kapanır. A7/F4 buna göre kurgulandı. (İtiraz edersen İP-07/İP-12 kapsamı güncellenir.)
- **K4 — Ödeme sağlayıcı.** ✅ **KARAR: Şimdilik SIMULATION.** UX simülasyon gerçekliğine göre kurgulanır — bilet/QR (C4) *simüle edilmiş* ödeme durumunu **dürüstçe** yansıtır; blokaj→capture→iade akışı simüle edilir. Gerçek iyzico pre-auth ayrı iş olarak askıda.
- **K5 — Kapsam sırası.** _Öneri:_ Önce 6 sistemik kök neden (KN-1..6), sonra P0 para/güven, sonra P1 akış, sonra P2 cila. Kullanıcı planı önce inceleyecek; sıra onay sonrası kesinleşir.

---

## 5. Sıfır-Problem Programı (v2 — uygulama-sınıfı)

> "Sıfır problem" bir dilek değil, **operasyonel bir tanım + süreçtir**: (a) bilinen 59 bulgunun
> (6 kök neden + 53 madde) tamamı kabul kriterli iş paketlerine bağlanır, (b) her düzeltme bir **teste** bağlanır
> (izlenebilirlik matrisi), (c) hiçbir sprint, **çıkış kapısı** yeşil olmadan kapanmaz,
> (d) durum-standardı ve sunucu-kapıları, henüz keşfedilmemiş edge-case **sınıflarını** da önler,
> (e) yeni bulgular aynı boru hattına girer — sıfır hâli süreçle korunur.

### 5.0 "Sıfır Problem" Tanımı (Definition of Done — 8 standart)

Oyuncu rolü, aşağıdaki 8 standardın **tamamı** sağlandığında "sıfır bilinen problem" ilan edilir:

1. **Durum bütünlüğü:** Oyuncunun gördüğü her ekran 5 durumu eksiksiz sunar — *yükleniyor (iskelet) · dolu · boş (dürüst mesaj+CTA) · hata (+Yeniden Dene) · offline*. İskelet asla boş durumla karışmaz.
2. **Para değişmezleri:** Her para aksiyonu **idempotent** (client key + sunucu dedup), **sunucu-doğrulamalı** ve **dürüst** (UI asla sunucu durumuyla çelişmez); tüm tutarlar tek `formatTRY()` ile.
3. **Gerçek veri ilkesi:** Oyuncu yüzeyinde **hiçbir** sabit mock (isim/skor/fiyat/QR/ID) yok — gerçek veri ya da dürüst boş durum.
4. **Tek doğruluk kaynağı:** Kimlik = reaktif auth store; puan = `ratingScale` util; takım sayıları = `get_my_teams`. Aynı bilgi iki ekranda farklı görünemez.
5. **Atomik yazım:** Client **asla** tüm-dizi/tam-nesne maç yazmaz; tüm mutasyonlar amaca özel RPC. Realtime handler **salt-okur**.
6. **Kapılar sunucuda:** minRating, misafir, bakiye, değerlendirme-penceresi kontrolleri RLS/RPC'de zorlanır; UI aynı kuralı *yansıtır*, tek başına *taşımaz*.
7. **Sessiz hata yasağı:** `catch {}` / `console.error`-ile-yut kalıbı oyuncu akışlarında yasak; her hata ya kullanıcıya açıklanır ya da tasarımla imkânsızlaştırılır.
8. **Regresyon kilidi:** Her bulgu matriste bir doğrulama yöntemine bağlı; smoke süiti + birim testleri + SQL değişmezleri kapılarda koşulur.

### 5.1 İş Paketleri (İP-01 … İP-15)

Doğrulama kodları: **T**=`tsc --noEmit` · **U**=Vitest birim · **P**=Playwright smoke (canlı sürüş) · **S**=SQL/DB değişmezi · **M**=Manuel QA senaryosu. Efor: S/M/L.

#### İP-01 — Reaktif Kimlik (KN-1) · Efor L
- **Kapsam:** KN-1; A1'in kökü; D2/F4 bağımlılığı.
- **Tasarım:** Zustand'a `authSlice`: `{ user, status: 'INIT'|'READY'|'GUEST'|'SIGNED_OUT' }`. `supabaseAuth` olayları store'a yazar; `auth.currentUser` yalnız **salt-okur köprü** olarak kalır (legacy çağrı noktaları kademeli taşınır). Kabuk, `status==='INIT'` iken splash'ta bekler (render kapısı). Ekranlar `useAuthUser()` hook'u ile okur.
- **Dosyalar:** `supabaseAuth.ts`, `store.ts`, `App.tsx`, `ProfileScreen`, `PendingVerificationView`, `SocialView`, `LocationPrompt`, `RoleSwitcher`, `MatchJoin`.
- **Kabul:** Girişli kullanıcı hiçbir anda "Misafir/Oyuncu" fallback'i görmez; splash'a erken dokunma AUTH'a düşürmez; `PendingVerification` aboneliği kimlik geç dolsa da kurulur.
- **Doğrulama:** U (state geçişleri) + P (giriş sonrası hızlı gezinmede isim asserti).

#### İP-02 — Oyuncu Bootstrap Temizliği (KN-2) · Efor M
- **Tasarım:** `store.ts:976` admin RPC'leri oyuncu bootstrap'ından çıkar; oyuncu kimliği `getMyProfile()` (kendi RLS'i). `adminUsers` yalnız admin panelde yüklenir; `MatchJoin`/`store.ts:1029` benzeri okumalar auth store'a taşınır. Degraded banner yalnız **oyuncuya ait kritik** çağrıların (profil, maç listesi) hatasına bağlanır; retry başarısında kaybolur. Banner offset'i: offline (üst) + degraded (altında), üst üste binme yok (L2).
- **Kabul:** Oyuncu oturumunda ağ kaydında `admin_fetch_*` = **0**; sağlıklı ağda bant = **0** (L1); başlık kırpılması yok (L2).
- **Doğrulama:** P (ağ asserti + görsel) + M.

#### İP-03 — Atomik Maç Yazımları (KN-3) · Efor L
- **Tasarım:** Katıl/ayrıl/çıkar/yedek-terfi akışlarında tam-dizi `updateMatch` kaldırılır; yalnız amaca özel RPC (`join_public_match_slot`, `leave_public_match_slot`, `player_buy_slots_v2`, `player_assign_slot`, kick/terfi için mevcut ya da yeni dar RPC). Realtime handler **salt-okur** (store'u günceller, DB'ye yazmaz — yankı döngüsü ölür). Kaptan devri sunucu tarafına alınır (leave RPC içinde), client hesaplaması silinir.
- **Kabul:** İki tarayıcı bağlamı eşzamanlı katılır → **ikisi de** kadroda (B3); lobi açıkken gelen realtime tick **0 yazma** üretir; lobi kodunda `player_update_match` çağrısı grep'i = 0.
- **Doğrulama:** P (çift-bağlam eşzamanlılık) + S + kod grep'i.

#### İP-04 — Rookie Puan Sistemi (KN-4/D1) · Efor M
- **Tasarım:** `utils/ratingScale.ts`: `ratingToOverall(rating, matchesPlayed)` → `matchesPlayed===0 || rating==null` ise `null` (rookie). `PlayerCard`/`ProfileScreen`/`teamService`/`TeamBuilder` bu util'i kullanır. Rookie kart varyantı: nötr tema, OVR yerine "—", "İlk maçını oyna, kartın oluşsun" CTA'sı. Güven puanı: ilk değerlendirmeye kadar "Yeni" rozeti (100 gösterilmez). Dengeleme, rookie'leri ayrıca işaretler.
- **Kabul:** 0 maçlı hesap rookie kart görür; varsayılandan OVR 100/Güven 100 üretmek **imkânsız**; alt-stat/OVR çelişkisi yok.
- **Doğrulama:** U (util sınır değerleri) + P (taze hesap profili).

#### İP-05 — Para Aksiyon Güvenliği (KN-5, C1–C3) · Efor L
- **Tasarım:** (1) Top-up ve `blockMatchDeposit`'e client-üretimli `idempotencyKey` (PaymentScreen'deki `idemKeyRef` deseni genelleştirilir); sunucu aynı key'i tek işleme indirger. (2) Başarı penceresi dahil buton kilidi (`topupBusy` başarıda erken açılmaz). (3) `ALREADY_BLOCKED`/`ALREADY_*` yanıtları **başarı-yenile** olarak yorumlanır (para/UI çelişkisi ölür — C2). (4) PaymentScreen cüzdan-özeti hatası → açık hata kartı + Yeniden Dene; çözülmeden ödeme adımı kilitli (C3); `catch {}` kaldırılır. (5) Top-up max'ı sunucu ayarından okunur, erken doğrulanır (A2-cüzdan).
- **Kabul:** Çift dokunuş → **tek** işlem; kayıp-yanıt sonrası retry → başarı UI'ı; özet hatasında asla "0₺" varsayılmaz.
- **Doğrulama:** P (çift-tık testi) + S (`wallet_transactions`'ta idem key başına satır=1) + U.

#### İP-06 — Mock Temizliği (KN-6, C4, kısmen G1/B9/E3) · Efor L
- **Tasarım:** (1) **Bilet:** gerçek rezervasyon kaydından türetilir — durum (simüle ödeme dahi olsa **gerçek** durum), gerçek ID, QR payload = rezervasyon id+imza; ödeme yoksa bilet yok (K4 kararıyla: simülasyonu *dürüst* yansıt). (2) **PostMatchEval:** skor/başlık gerçek maçtan; skor yoksa skor bloğu gizli. (3) **MatchCalendar:** gerçek veriye bağlanana kadar oyuncu navigasyonundan çıkarılır (yarım mock yüzey yayında kalamaz). (4) **TeamLineupBoard:** varsayılan sahte kadro silinir. (5) **Keşif:** `i===2?0:200` fiyatı ve sabit "1 STP/1 ORT" kaldırılır (B9 ile birlikte).
- **Kabul:** Oyuncu görünümlerinde sabit mock (isim/skor/ID/fiyat) grep'i = **0**; her yüzey gerçek veri ya da dürüst boş.
- **Doğrulama:** kod grep kapısı + P + M.

#### İP-07 — Giriş & Kabuk Akışları (A1–A7) · Efor M
- A1: giriş başarısında navigasyon **deterministik** (İP-01) + 10sn zaman-aşımı → açıklayıcı hata; sonsuz spinner imkânsız.
- A2: `.single()` hatası ≠ "kayıt yok"; yalnız gerçek 0-satırda yeni-kullanıcı dalı; hata → retry ekranı; rol asla sessizce PLAYER'a yazılmaz.
- A3: PendingVerification: mount'ta durum fetch'i + "Durumu Yenile" butonu + 30sn poll (realtime tamamlayıcı olur, tek yol olmaz).
- A4: Konum: reddedildi/cihaz-yok/zaman-aşımı **üç ayrı** mesaj+CTA; taramada "Vazgeç"; fallback = manuel şehir/ilçe (Master 3.1).
- A5: View-seviyesi hata sınırı (`Suspense`+boundary): chunk hatası kabuğu düşürmez, "Bu bölüm yüklenemedi → Tekrar Dene".
- A6: Alt-nav kök yığınları korur; Android geri deterministik.
- A7: `VITE_DEMO_ACCOUNTS=false` + `VITE_GUEST_MODE=false` lansman profili; `?demo=1` prod build'de etkisiz.
- **Doğrulama:** A1/A3 P · A2 U+M · A4–A6 M · A7 U (bayrak testi).

#### İP-08 — Maç Keşif & Katılım Bütünlüğü (B1–B12, B14) · Efor L
- B1 ✅K2: `minRating` varsayılanı **null**; kurucu opsiyonel barajı açıkça seçer.
- B2: baraj **join RPC'de** zorlanır; tüm giriş yollarında aynı net mesaj ("Bu maç X+ puan istiyor").
- B4: "Maçı İptal Et" aksiyonu Maçlarım/lobi kurucu menüsünde; `cancelMatchByCaptain`'e bağlanır; modal kademeli-iade özetini gösterir.
- B5: ücretli maçtan ayrılma modalı **tam finansal sonuç** gösterir (iade/kredi/kayıp) — Master 3.3 kademesiyle birebir.
- B6: "Takıma Katıl" gerçek talep RPC'si; 2.5sn sahte `setTimeout` onayı silinir; durum = "Talep gönderildi → kaptan onayı".
- B7: ödeme yolculuğunda **slot hold** (süreli, geri sayım rozetli); süre dolarsa serbest + kullanıcıya bildirim.
- B8: zaman filtresi — geçmiş/başlamış maç katılıma kapalı; kart "İncele/Sonuç" moduna düşer.
- B9: fiyat/eksik-pozisyon yalnız gerçek alandan; yoksa gizlenir (İP-06 ile).
- B10: yakın-maç 0 sonuçta dürüst boş durum + "yarıçapı genişlet" CTA; uzak maçlar ayrı "Diğer Bölgeler" başlığında.
- B11: rezervasyon/draft→maç dönüşümünde tarifeden `totalPrice`+`deposit` çekilir; 0 çözülürse yayın öncesi uyarı.
- B12: maç `DRAFT` doğar; **yayın kapora blokajına şartlı** (Master 3.3 "katılım=blokaj").
- B14: yedek katılımı "Maçlarım"da "Yedek" rozetiyle listelenir.
- **Doğrulama:** B1/B2 U+S+P · B3(İP-03) P · B4/B5/B7/B8/B10/B14 P · B6 S+M · B11 U+M · B12 S+P.

#### İP-09 — Para Yüzeyleri (C5–C9, C11) · Efor M
- C5: iade tahmini **sunucudan hesaplanır** (yeni `quote_cancel_refund` RPC ya da settings+PSP formülünün birebir porte edilmesi); modal kesin kırılım gösterir (brüt − PSP = net).
- C6: rezervasyon yalnız ödeme başarısında yaratılır (ya da kısa süreli hold + otomatik temizlik); yetim PENDING sınıfı ölür.
- C7: iade eşikleri + zaman dilimi (Europe/Istanbul) sunucu kaynaklı; sınır anlarında UI ile backend aynı yüzdeyi verir.
- C8: MATCH_JOIN'e `balanceOnly`-eşdeğeri akış: yetersiz bakiyede birincil CTA **"CÜZDANA YÜKLE"**; pasif "ÖDE" çıkmazı ölür.
- C9: çoklu-slot devrinde "kim ödedi" görünürlüğü: slot karta "X ödedi" rozeti + alıcıya borç listesi (mutabakat MVP'si; gerçek tahsilat iyzico fazına).
- C11: SIMULATION'a **kontrollü red modu** (belirli test tutarı/kartı → decline) — hata banner'ları/3DS-fail UX'i test edilebilir olur (K4 kararının gereği).
- **Doğrulama:** C5/C7 U+S · C6 S · C8 P · C9/C11 M.

#### İP-10 — Kimlik & Profil (D2–D5) · Efor M
- D2: profil yükleme hatası → retry ekranı; "Düzenle" kilitli (boş profili ezme riski ölür); `userService` hata yutmayı bırakır (null ≠ hata).
- D3: ortak `<Avatar>` bileşeni (foto→initials→silüet zinciri, `onError` dahili) — tüm oyuncu yüzeylerinde.
- D4: `toLocaleUpperCase('tr')` util'i; ad alanlarında `min-w-0`+`break-words`; mesaj/adlarda `dir="auto"`.
- D5: görsel yükleme hataları (HEIC/boyut/küçük/offline) **ayrı ayrı** kullanıcıya açıklanır (mesajlar `imageCompression.ts`'te hazır, UI'a bağlanır) + ilerleme/timeout.
- **Doğrulama:** D2 P · D3/D5 M · D4 U+M.

#### İP-11 — Takım & Stüdyo (E1–E7, E2↔L5) · Efor M
- E1: `FORMATIONS[size][label]` guard'ı — custom formasyonda kimlik değişimi çökmez; custom düzen ayrı saklanır.
- E2: takım sayaçlarının tek kaynağı `get_my_teams`; Profil = Sosyal = aynı sayı (L5 ölür).
- E3: tahta `get_team_squad`'dan; format-duyarlı slotlar (5v5–11v11); mock kadro İP-06'da silindi; boş kadroda dürüst durum.
- E4: dengeleme `ratingScale` ile (İP-04); eşit-olmayan bölünmede sayı rozeti + uyarı.
- E5: kaptan ayrılma → üye varsa "önce kaptanlığı devret" yönlendirme akışı; buton durumu öngörülü.
- E6: boyut/formasyon değişiminde "çizimler silinecek" onayı + tek adım geri-al; kenar-dışına bırakma tokeni kaldırır.
- E7: `TeamDashboard` kadroyu kadro RPC'sinden alır; `color1` fallback paleti.
- **Doğrulama:** E1 U+P · E2 P · E3/E6/E7 M · E4 U+M · E5 P.

#### İP-12 — Sosyal & Mesajlaşma (F1–F5) · Efor S
- F1: blokta kompozer kilitlenir + "Bu kullanıcıyı engelledin" durumu; sohbet başlığında rozet.
- F2: tek blok semantiği — her yüzey `blockUserFully`; `messageService.blockUser` bu davranışa katlanır.
- F3: DM şikayeti `reportUser` → `user_reports`'a yazar (sahte "alındı" ölür).
- F4: misafir Sosyal'i `GuestGate`'e düşer (K3 kararı); boş `userId` ile realtime abonelik açılmaz.
- F5: "Tümünü Kabul Et" sonuç raporu (x başarılı / y hata); arama isteğine seq/abort guard.
- **Doğrulama:** F1 P · F2/F3 S+M · F4/F5 M.

#### İP-13 — Maç Sonu Değerlendirme (G1–G3) · Efor M
- G1: skor onay ekranı gerçek maç verisinden; "Onayla/İtiraz" gerçek RPC'lere (Master 3.4 skor akışı); sabit 5-3 ve sahte başlık silinir (İP-06 ile).
- G2: gerçek-ama-katılımcısız maçta oyuncu-puanlama adımı dürüstçe atlanır; mock `p1..p5` prod'dan çıkar.
- G3: "zaten değerlendirdin / süre doldu" durumları sunucudan sorgulanıp gösterilir; organizasyon yorumu alanı state'e bağlanır ve kaydedilir.
- **Doğrulama:** G1 P+S · G2 M · G3 S+M.

#### İP-14 — Durum Standardı & Ortak Araçlar (B13, B15, C10 + 1. standart) · Efor M
- **Ortak bileşen kiti:** `<AsyncSection>` (iskelet/boş/hata/retry sarmalayıcısı), `<Avatar>`, `<EmptyState>` tutarlılaştırması.
- **Ortak util'ler:** `formatTRY()` (tek para biçimi, `1.500,00₺`), `parseMatchDateTime()` (ISO + `dd.mm.yyyy` + TR gün adları + saat aralıkları; `NaN` imkânsız), `trUpper()`.
- C10: ölü bilet butonları bağlanır ya da kaldırılır; 0-tutar durumları açıklamalı.
- B15: keşif iskeleti; iskelet↔boş ayrımı her listede (L7).
- **Doğrulama:** U (üç util'in sınır testleri) + M (ekran taraması).

#### İP-15 — Regresyon Altyapısı & Kalite Kapıları · Efor M
- **`tests/player-smoke.spec.ts` (Playwright):** bu analizde kurulan sürüş altyapısı kalıcılaşır — oturum-enjeksiyonlu giriş prelüdü; rota: boot→Ana Sayfa→Top Oyna→lobi→Sahalar→Cüzdan→Profil→Sosyal→Stüdyo. **Assert'ler:** konsol hatası=0 (font whitelist'i hariç), 4xx/5xx istek whitelist dışı=0, degraded bant görünmez, `admin_fetch_*`=0, kullanıcı adı ≠ "Misafir/Oyuncu", her listede iskelet→(dolu|boş) geçişi.
- **Birim süiti (Vitest):** `ratingScale`, `parseMatchDateTime`, `formatTRY`, iade-tahmin eşleşmesi, auth store geçişleri.
- **SQL değişmezleri:** idem key başına `wallet_transactions` ≤1 · maç başına `BLOCKED` kapora ≤1 · yetim PENDING rezervasyon = 0 · `DRAFT` dışı ödenmemiş yayınlı maç = 0.
- **Kapı kuralı:** her commit `tsc`+Vitest; her sprint kapısında smoke + SQL değişmezleri.

### 5.2 Sprint Planı & Çıkış Kapıları

| Sprint | İş paketleri | Çıkış kapısı (geçilmeden sonraki sprint başlamaz) |
|---|---|---|
| **S0 — Temel** | İP-01, İP-02, İP-04, İP-14 (util'ler), İP-15 (harness kurulumu) | **G0:** sağlıklı ağda bant 0 · `admin_fetch_*` 0 · taze hesap rookie kart · isim asla "Misafir" · tsc+unit yeşil |
| **S1 — Para** | İP-05, İP-09, İP-06 (bilet) | **G1:** çift-dokunuş=tek işlem (S) · kayıp-yanıt retry=başarı · iade tahmini=sunucu hesabı · ödemesiz "ONAYLANDI" bilet imkânsız |
| **S2 — Maç bütünlüğü** | İP-03, İP-08, İP-06 (keşif/takvim) | **G2:** eşzamanlı çift katılım ikisi de kadroda · realtime tick 0 yazma · yan-kapı baraj reddi · geçmiş maç katılıma kapalı · DRAFT-yayın şartı |
| **S3 — Akış & tutarlılık** | İP-07, İP-10, İP-11, İP-12, İP-13, İP-06 (değerlendirme) | **G3:** A-D-E-F-G kabul kriterleri manuel QA listesinde tamam · Profil=Sosyal sayaçları eşit |
| **S4 — Kapanış** | Kalan P2 + matris kapanışı | **G4 = "Sıfır bilinen problem" ilanı:** matristeki 59 satır ✅ · smoke 3 ardışık koşuda yeşil · taze-hesap **ve** kıdemli-hesap tam sürüşleri temiz · `PROBLEMLER_VE_COZUMLER.md` güncel |

### 5.3 İzlenebilirlik Matrisi (bulgu → paket → kabul → doğrulama)

Her satır kapanmadan G4 ilan edilemez. (Doğrulama: T/U/P/S/M — bkz. §5.1 başı.)

| ID | İP | Kabul kriteri (özet) | Doğrulama |
|---|---|---|---|
| KN-1 | İP-01 | Hiçbir ekran render'da singleton'dan kimlik okumaz | U+P |
| KN-2 | İP-02 | Oyuncuda admin RPC=0; sağlıklı ağda bant=0 | P |
| KN-3 | İP-03 | Tüm-dizi maç yazımı=0; realtime salt-okur | P+S |
| KN-4 | İP-04 | Varsayılandan OVR/Güven 100 üretilemez | U+P |
| KN-5 | İP-05 | Para aksiyonları idempotent + dürüst | P+S |
| KN-6 | İP-06 | Oyuncu yüzeyinde sabit mock=0 (grep kapısı) | M+P |
| A1 | İP-07 | Giriş sonrası ≤10sn yönlendirme veya hata; sonsuz spinner yok | P |
| A2 | İP-07 | Okuma hatası ≠ yeni kullanıcı; retry var; rol korunur | U+M |
| A3 | İP-07 | Pending: fetch + manuel yenile + poll | P |
| A4 | İP-07 | 3 konum hatası ayrı mesaj; taramada Vazgeç | M |
| A5 | İP-07 | Chunk hatası kabuğu düşürmez | M |
| A6 | İP-07 | Sekme geçişi geçmişi korur | M |
| A7 | İP-07 | Lansman bayraklarıyla demo/misafir kapalı | U+M |
| B1 | İP-08 | Varsayılan minRating yok; vitrin rookie'ye açık | U+P |
| B2 | İP-08 | Baraj RPC'de; yan kapı reddi + net mesaj | S+P |
| B3 | İP-03 | Eşzamanlı katılımda kayıp yok | P |
| B4 | İP-08 | Kurucu iptali UI'da + iade özeti | P |
| B5 | İP-08 | Ayrılma modalı finansal sonucu gösterir | P |
| B6 | İP-08 | Sahte otomatik onay yok; gerçek talep akışı | S+M |
| B7 | İP-08 | Ödemede slot hold + geri sayım | P+S |
| B8 | İP-08 | Geçmiş maç katılıma kapalı | P |
| B9 | İP-08 | Fiyat/pozisyon yalnız gerçek veriden | M |
| B10 | İP-08 | 0 sonuçta dürüst boş + yarıçap CTA | P |
| B11 | İP-08 | Dönüşümde tarife fiyatı/kaporası | U+M |
| B12 | İP-08 | Yayın kapora blokajına şartlı | S+P |
| B13 | İP-14 | Tarih ayrıştırma NaN üretemez | U |
| B14 | İP-08 | Yedeklik "Maçlarım"da görünür | P |
| B15 | İP-14 | Keşif iskeleti; boş↔stale karışmaz | P |
| C1 | İP-05 | Çift top-up imkânsız | P+S |
| C2 | İP-05 | ALREADY_BLOCKED=başarı; para/UI çelişkisi yok | S+M |
| C3 | İP-05 | Özet hatası açık durum; 0₺ varsayımı yok | P |
| C4 | İP-06 | Bilet gerçek kayıttan; ödemesiz onay yok | P+S |
| C5 | İP-09 | İade tahmini=backend (PSP dahil) | U+S |
| C6 | İP-09 | Yetim PENDING rezervasyon sınıfı yok | S |
| C7 | İP-09 | Eşik/tz sunucu kaynaklı | U+S |
| C8 | İP-09 | Yetersiz bakiyede belirgin yükleme CTA'sı | P |
| C9 | İP-09 | Slot devrinde ödeme görünürlüğü | M |
| C10 | İP-14 | Tek para formatı; ölü buton yok | U+M |
| C11 | İP-09 | SIMULATION red modu ile hata UX test edilir | M |
| D1 | İP-04 | Rookie kart (KN-4 ile) | U+P |
| D2 | İP-10 | Profil hatasında retry; Düzenle kilitli | P |
| D3 | İP-10 | Ortak Avatar her yüzeyde | M |
| D4 | İP-10 | TR casing + taşma güvenli | U+M |
| D5 | İP-10 | Yükleme hataları açıklanır | M |
| E1 | İP-11 | Custom formasyon çökmesi imkânsız | U+P |
| E2 | İP-11 | Takım sayacı tek kaynak | P |
| E3 | İP-11 | Tahta gerçek kadro + format-duyarlı | M |
| E4 | İP-11 | Dengeleme rookie-farkında + uyarı | U+M |
| E5 | İP-11 | Kaptan ayrılmada devir yönlendirmesi | P |
| E6 | İP-11 | Çizim silme onaylı/geri alınabilir | M |
| E7 | İP-11 | Kadro RPC'den; renk fallback | M |
| F1 | İP-12 | Blokta kompozer kilit + durum | P |
| F2 | İP-12 | Tek blok semantiği | S+M |
| F3 | İP-12 | DM şikayeti DB'ye yazar | S |
| F4 | İP-12 | Misafir GuestGate'e düşer | M |
| F5 | İP-12 | Toplu kabul raporu; arama guard | M |
| G1 | İP-13 | Skor gerçek; Onayla/İtiraz gerçek RPC | P+S |
| G2 | İP-13 | Katılımcısız maçta dürüst atlama | M |
| G3 | İP-13 | Pencere/tekrar durumları + yorum kaydı | S+M |

### 5.4 Süreç Kuralları (sıfır hâlini koruyan mekanizma)

1. **Yeni bulgu prosedürü:** Uygulama sırasında çıkan her yeni edge-case `H-xx` ID'si alır, matrise eklenir; açık `H-xx` varken sprint kapısı geçilmez. "Sıfır problem" tek seferlik temizlik değil, kapılarla korunan bir hâldir.
2. **Commit disiplini:** Her İP kendi commit dizisi; İP kapanışında matris işaretlenir + `PROBLEMLER_VE_COZUMLER.md`'ye kayıt düşülür (mevcut iş akışı).
3. **Geri alınabilirlik:** RPC/migration değişiklikleri geri-alınabilir yazılır; her migration'ın down-yolu not edilir.
4. **Yan etki koruması:** Maç/para RPC'leri diğer rolleri (GK/Hakem/Tesis) de besler → S1/S2 kapılarında admin-panel ve owner smoke'u da koşulur; kırılım varsa kapı kırmızı.
5. **Kapsam dışı (bilinçli):** Gerçek iyzico pre-auth/capture entegrasyonu (K4), sadakat/promosyon, gerçek borç-tahsilat (C9'un tahsilat ayağı) — ayrı fazlar.

---

### Özet (v2)
59 bulgu (6 kök neden + 53 madde) **15 iş paketine** bağlandı; her bulgu **kabul kriteri + doğrulama yöntemiyle** izlenebilirlik matrisinde. 5 sprint, her biri **ölçülebilir çıkış kapılı**; G4 kapısı = "sıfır bilinen problem" ilanı (matris ✅ + smoke 3× yeşil + taze/kıdemli hesap tam sürüşleri temiz). 8 maddelik durum/para/veri standardı, henüz keşfedilmemiş edge-case *sınıflarını* da önler; yeni bulgular aynı boru hattına girerek sıfır hâlini kalıcı kılar.

---

## 6. Uygulama Günlüğü & Re-validation Düzeltmeleri (2026-07-14)

Plan güncel `main`'e rebase edildi (main +15 commit: yeni **Onboarding** akışı, veli onayı, player card, `MatchJoin` ağır değişti). Tüm bulgular **8-kümeli paralel denetimle güncel koda karşı yeniden doğrulandı**. Sonuç: plan gerçek kodla hizalandı.

### 6.1 Önemli düzeltmeler (efor tasarrufu)
- **Ölü kod (dokunulmayacak):** `E1` (Studio identity-change çökmesi) `handleIdentityChange` hiçbir UI'dan çağrılmıyor (identity sabit 'BALANCED') → tetiklenemez. `E3` (TeamLineupBoard sahte kadro) & `E7` (TeamDashboard) bileşenleri **hiçbir yerden import edilmiyor** → ölü kod. Bu 3 madde kapsamdan çıktı.
- **L1 (degraded bant) esasen sandbox artefaktı:** Re-validation, bantın artık admin RPC'ye değil `matchesEmpty‖pitchesEmpty` + 3sn timeout'a bağlı olduğunu gösterdi. Yavaş sandbox proxy'sinde timeout doluyor → bant çıkıyor; **prod'da hızlı ağda çıkmaz**. Gerçek boş sonuç (`[]`) degraded'a girmiyor. KN-2'nin gerçek kalan işi 'Oyuncu' fallback'iydi (çözüldü).
- **Main'in kısmen çözdükleri (kalan parçalar backlog):** `B5` (ayrılınca sunucu iade kredisi kesiyor; UI uyarısı yok), `C8`, `D3`, `D4`, `E4`, `E5`, `E6`, `F4`.

### 6.2 Yeni bulgular — Onboarding (main ekledi) → backlog
- `H-A1`: `StepLocation` gerçek izin istemeyen **sahte tarama**. · `H-A2`: onboarding taslağı paylaşılan cihazda sızabilir. · `H-A3`: veli-onayı çocuk ekranında realtime/retry yok. · `H-A4`: **<13 yaş kapısı yok**. · `H-A5`: soyad zorunlu (mononim adlar).

### 6.3 Tamamlanan S0 işleri (test edildi)
| İP / ID | Ne yapıldı | Doğrulama |
|---|---|---|
| **İP-14** | `utils/ratingScale·formatTRY·matchDateTime` + `B13` (useMyMatches ortak ayrıştırıcı) | 23 birim testi + tsc |
| **İP-04 (KN-4/D1)** | Rookie kart: OVR **"—"** + nötr "rookie" teması; `ratingToOverall` tek kaynak; `isRookie` alanı | tsc + unit + boot smoke |
| **İP-02 (KN-2)** | `store.currentUserProfile` (gerçek ad/avatar) → `joinMatchPleiAction` + `MatchJoin` artık **"Oyuncu" fallback'i yok** | boot smoke (isim doğru) |
| **A2** | Bootstrap profil `.single()` hatası artık **yeni-kayıt ile karıştırılmıyor** (retry + PGRST116 ayrımı); mevcut kullanıcı PLAYER'a düşürülmüyor | tsc + boot smoke |
| **B1 (K2)** | `minRating` varsayılanı **0 (kilitsiz)** — rookie soğuk-başlangıç çıkmazı kalktı | tsc |
| **İP-15** | `tests/player-smoke.mjs` canlı regresyon smoke'u (session-inject + ağ/isim/konsol assert'leri) | çalışır — G0 |

**Kapsam kararları:** `teamService:389` puan ölçeği → dengeleme ile birlikte **E4'e (S3)** ertelendi (balancing'i riske atmamak için). **KN-1 tam reaktif refaktör** (28 tüketici) yerine gözlenen semptomları çözen **hedefli parça** (currentUserProfile) yapıldı; kalanı sonraki tura. `Güven Puanı` **kasıtlı korundu** (Master 3.4: fair-play 100'den başlar — 0 maçta 100 doğru).

### 6.4 Kalan yol (sonraki turlar)
- **S1 (Para):** C1–C5, C6–C11 → **ayrı bir ödeme agent'ına devredildi** (2026-07-15). Sınır sözleşmesi: §7.0.
- **S2 (Maç — bu agent):** KN-3 + B2/B4/B5/B6/B8/B9/B10/B14/B15 + MatchCalendar. Derin uygulama planı: **§7**.
- **S3:** A3–A7, E2/E4/E5, F1–F3, D2/D5, G1–G3. · **S4:** cila + H-A backlog.
- Her paket ayrı commit + kapı; ilerleme bu bölümde güncellenir.

---

## 7. S2 — Maç Akışı & Bütünlük: Derin Uygulama Planı (2026-07-15)

> Tüm satır referansları **güncel main-rebase'li koda** karşı yeniden doğrulanmıştır (8-ajanlı
> re-validation + hedefli kod teyidi). Bu bölüm doğrudan kodlanabilir düzeydedir.

### 7.0 Sınır sözleşmesi — ödeme agent'ı ile iş bölümü

| Alan | Bu agent (S2 maç) | Ödeme agent'ı (S1 para) |
|---|---|---|
| `views/MatchJoin.tsx` | Roster/slot/realtime/iptal-ayrılma UI (handleJoin, handleLeaveMatch, handleRemovePlayer, handleJoinAsReserve, realtime handler, kaptan menüsü) | `handleBuySlots`'un **ödeme bağlamı** kısmı (setPaymentContext/PAYMENT navigasyonu), slot-hold para mekaniği |
| `views/PaymentScreen.tsx` / `views/WalletScreen.tsx` / `views/MyBookings.tsx` / `views/MatchTicket.tsx` | ❌ dokunmam | ✅ tamamı (C1–C11) |
| `hooks/useMatchCreate.ts` | B9 (missingPositions türetme), B11 (totalPrice) | B12'nin ödeme-başarı tarafı |
| `store.ts` | `applyMatchLocal` yeni aksiyonu, updateMatch çağrı disiplini | cüzdan/ödeme aksiyonları |
| Migration'lar | B2 min_rating kapısı (join RPC'leri) | idempotency/iade/hold RPC'leri |

**Ortak sözleşmeler (iki agent'ın uyacağı):**
- **B12 sözleşmesi (migration'sız):** Kapora gereken maç `status:'DRAFT'` doğar (keşif filtresi `MatchDiscovery.tsx:161-163` DRAFT'ı zaten gizliyor ✓). Ödeme başarısında ödeme agent'ı **kısmi payload** ile aktive eder: `supabase.rpc('player_update_match', { p_match_id, p_payload: { status: 'ACTIVE' } })` — güvenli, çünkü RPC gövdesi `CASE WHEN p_payload ? 'slots'` korumalı (migration `20260705000002:314`): payload'da olmayan alanlar **ezilmez**.
- **B7 sözleşmesi:** Slot-hold RPC'sini (HELD + expiry) ödeme agent'ı tasarlar; benim `handleBuySlots` roster tarafım hold sonucu dönen slot durumunu `getMatchDetails` re-fetch ile yansıtır — client dizi yazmaz.
- **Rebase protokolü:** KN-3 (7.1+7.2) önce ben commit'lerim → ödeme agent'ı üstüne rebase eder. `MatchJoin.tsx`'te eş-zamanlı çalışma YOK; sıra: ben → o.

### 7.1 Adım 1 — KN-3a: Realtime yankı döngüsünü kes (salt-okuma)

**Kanıt:** `MatchJoin.tsx:330-352` realtime callback'i `updateMatch({...originalMatch, ...mapped})` çağırıyor; `store.ts:1002-1010 updateMatch` HER ZAMAN `player_update_match` RPC'si (DB yazımı). Her gelen UPDATE → yeni DB yazımı → yeni UPDATE → açık her lobi istemcisinde **yazma fırtınası + birbirini ezme**.

**Değişiklik:**
1. `store.ts` — yeni **yerel-only** aksiyon (RPC YOK):
   ```ts
   applyMatchLocal: (match) => set((s) => ({
     adminMatches: s.adminMatches.map(m => m.id === match.id ? match : m),
     selectedMatch: s.selectedMatch?.id === match.id ? match : s.selectedMatch,
   })),
   ```
   (`selectedMatch` senkronu şart — MatchJoin `selectedMatch`'ten besleniyor.)
2. `MatchJoin.tsx:349` → `updateMatch(...)` yerine `applyMatchLocal(...)`. Mapping bloğu aynen kalır.

**Kabul:** Lobi açıkken gelen realtime tick **0 RPC yazımı** üretir (ağ kaydında `player_update_match` yok). İki istemcili testte alıcı taraf yazma yapmaz.

### 7.2 Adım 2 — KN-3b: Lost-update — "RPC → re-fetch → applyMatchLocal" deseni

**Kanıt + kritik keşif:** Her handler atomik RPC'yi çağırıp **sonra bayat tam diziyi** `updateMatch` ile yazıyor. Üstelik `leave_public_match_slot` RPC'si **kaptan devrini sunucuda zaten yapıyor** (migration: `IF v_creator_id = p_user_id THEN v_new_creator_id := ...`); `MatchJoin.tsx:931-942`'deki client hesabı (hiç yüklenmeyen `adminUsers.reliabilityScore` ile — herkes 100) sunucunun doğru sonucunu **çöple eziyor**.

**Tek desen (handleBuySlots `:662-663` zaten böyle):** RPC başarısı → `getMatchDetails(match.id)` (matchService:145) → `applyMatchLocal(fresh)` → bayat-dizi `updateMatch` çağrısı **silinir**.

| Handler | Konum | RPC (zaten var) | Silinecek |
|---|---|---|---|
| `handleJoin` | `:549-617` | `join_public_match_slot` | `:599-604` tam-dizi yazımı; status türetimi taze veriden |
| `handleJoinAsReserve` | `:715-746` | `join_public_match_reserve` | `:741` reservePlayers dizi yazımı |
| `handleLeaveMatch` | `:892-982` | `leave_public_match_slot` | `:931-942` kaptan-devri client hesabı + tam-dizi yazımı (tamamı) |
| `handleRemovePlayer` | `:855-890` | mevcut kick yolu* | tam-dizi yazımı |
| `fillVacatedSlot` (yedek terfisi) | `:~611+` | — sunucu leave RPC'si terfiyi yapıyorsa sil; yapmıyorsa şimdilik **kaptan-only + fresh-first** kalır* | bayat-dizi tabanı |

\* Kick/terfi için özel RPC yoksa asgari güvenlik: önce `getMatchDetails` ile taze çek, değişikliği taze üstüne uygula, yaz (lost-update penceresi daralır); kalıcı çözüm dar `player_kick_slot` RPC'si → S3 backlog'a not düşülür.

**Kabul (G2 ana testi):** İki tarayıcı bağlamı **eşzamanlı** farklı slotlara katılır → ikisi de kadroda kalır. Ayrılan kaptanın yerine sunucunun seçtiği kaptan gelir (client override yok). Kod kapısı: `views/MatchJoin.tsx`'te `updateMatch(` çağrısı yalnız izinli site(lar)da (grep hedefi ≤2: skor/diziliş gibi kaptan-only alanlar).

### 7.3 Adım 3 — B-grubu görünür düzeltmeler (küçük, bağımsız)

- **B4 — Maçı İptal Et (kaptan):** `cancelMatchByCaptain` (matchLifecycleService:49, RPC `match_cancel_by_captain`) **hiçbir view'den çağrılmıyor**. MatchJoin kaptan yönetim bölümüne (Kaleci/Hakem bloğu `~:2468` yanına) "Maçı İptal Et" + onay modalı (kademeli iade özeti: ≥24s iade / <24s yok) + outcome toast + `onBack()`.
- **B5 — Ayrılma modalı iade metni:** Sunucu iadeyi ZATEN kesiyor (`20260717000003:200-213` idempotent MATCH_REFUND) ama modal metni (`:1271`) parayı hiç anmıyor. `match.price>0 && mySlot.paymentStatus==='PAID'` ise: "Ödediğin {formatTRY(price)} iade kredisi olarak cüzdanına dönecek." + başarıda onay toast'ı. (Salt UI — para mantığına dokunmaz.)
- **B8 — BAŞLADI kilidi:** `MatchCard onClick :1216-1219` yalnız kilit kontrolü; countdown `diff<=0 → 'BAŞLADI'` ama kart tıklanabilir. Fix: `diff<=0 || status==='LIVE'|'COMPLETED'` → onClick pasif + kart "OYNANIYOR/BİTTİ" görünümü; `enhancedMatches :161-163` geçmiş maçları (getMatchTargetDate < now) listeden düşürür.
- **B9 — Sahte veri:** `:166` `i===2?0:200` → `Number(m.price)||0`. `useMatchCreate:409-412` sabit `STP/ORT` → gerçek OPEN slotların rollerinden türet (role başına count; saf fonksiyon → birim test).
- **B10 — Dürüst boş durum:** `:158` `hasScope && nearbyMatches.length>0 ? nearby : adminMatches` → `hasScope ? nearbyMatches : adminMatches` (0 sonuç = gerçek 0) + boş durumda "çapı genişlet" CTA'sı; "X KM" başlığı yalnız gerçek yakın-sonuçta.
- **B14 — Yedek görünürlüğü:** `useMyMatches:37-40` filtresine `|| m.reservePlayers?.some(p => p?.id === currentUserUid)` + kartta "Yedek" rozeti.
- **B15 — Keşif iskeleti:** `fetchNearbyMatches` effect'ine `isLoading`; yüklemede skeleton MatchCard'lar (min-h-[400px]); EmptyState yalnız yükleme bitince.
- **B13 — ✔ İP-14'te çözüldü** (ortak `parseMatchDateTime`); re-validation bu commit'ten önceydi.

### 7.4 Adım 4 — B2: min_rating kapısı sunucuya (migration)

**Kanıt:** `join_public_match_slot` / `player_buy_slots*` gövdelerinde `min_rating` kontrolü YOK; kapı yalnız keşif kartında (`MatchDiscovery:1159`); özel kod (`handleJoinPrivate :69-104`), davet tokeni (`join_by_invite_token`) ve doğrudan lobi yan kapı.

**Değişiklik:** Yeni migration — `join_public_match_slot`, `player_buy_slots(_v2)`, `join_by_invite_token`, `join_public_match_reserve` gövdelerine:
```sql
IF COALESCE(v_match.min_rating, 0) > 0 AND
   COALESCE((SELECT (stats->>'rating')::numeric FROM ... profiles ...), 0) < v_match.min_rating THEN
  RAISE EXCEPTION 'MIN_RATING';
END IF;
```
+ MatchJoin hata haritasına `MIN_RATING → "Bu maç {minRating}+ puan istiyor"`. **Veri düzeltmesi (öneri):** eski sabit-4.0 hiçbir zaman kurucu iradesi değildi → tek seferlik `UPDATE matches SET min_rating = 0 WHERE min_rating = 4.0 AND status IN ('ACTIVE','DRAFT')` (B1 ile tutarlı; onayına sunulur). Rollback: fonksiyon gövdelerinin önceki sürümü migration'da yorum olarak saklanır.

### 7.5 Adım 5 — B6: Sahte otomatik onayı kaldır (dürüst talep akışı)

**Kanıt:** `MatchDiscovery:1000-1003` — 2.5sn `setTimeout` → `acceptPlayerSeekAdRequest` + "Talebiniz Kabul Edildi!" toast'ı. Seek-ilanlarının **DB tablosu yok** (store-local `PlayerSeekAnnouncement`).

**S2 kapsamı (dürüstlük):** setTimeout + sahte toast silinir; buton → "Talep gönderildi — kaptan onayı bekleniyor" kalıcı durumu; un-join yarışı ölür. **Tam çözüm** (DB-destekli talep + kaptan onay ekranı) → S3 backlog (yeni kalem `B6-full`).

### 7.6 Adım 6 — KN-6: MatchCalendar'ı gerçek veriye bağla

**Kanıt:** m1/m2/m3 sabit mock; kart tıklaması `setSelectedMatch`'siz `MATCH_JOIN` → `match=null` → **boş ekran**; kod modalı 6 karakteri doğrulamadan aynı boş ekrana gider.

**Değişiklik:** Mock dizi silinir; kaynak = `useMyMatches()` (İP-14 sayesinde tarih/saat artık güvenilir). Kart → `setSelectedMatch(gerçekMaç)` + `MATCH_JOIN`; countdown `parseMatchDateTime`'dan; kod modalı MatchDiscovery `handleJoinPrivate` desenine bağlanır; maç yoksa dürüst boş durum ("Yaklaşan maçın yok → Top Oyna'ya git" CTA).

### 7.7 Test planı & G2 çıkış kapısı & commit sırası

**Yeni testler:** birim → `deriveMissingPositions` (B9), `sourceMatches` seçimi (B10, saf yardımcıya çıkarılır), reserve filtresi (B14). Canlı → `tests/match-concurrency.mjs`: iki bağlam eşzamanlı katılım (KN-3 kabulü); smoke'a "BAŞLADI kartı pasif" + "keşif iskeleti" adımları.

**Commit sırası (her biri tsc+unit+smoke sonrası):**
`(1)` KN-3a+B14+B13-not · `(2)` KN-3b handler'lar + kaptan-devri silme · `(3)` B8+B9+B10+B15 keşif paketi · `(4)` B4+B5 iptal/ayrılma UX · `(5)` B2 migration + hata haritası (+veri düzeltmesi onaylıysa) · `(6)` B6 dürüstlük + MatchCalendar.

**G2 kapısı:** eşzamanlı çift katılım ✓ · realtime tick'te 0 yazım ✓ · `updateMatch(` grep ≤2 ✓ · yan-kapı MIN_RATING reddi (SQL testi) ✓ · BAŞLADI kartı pasif ✓ · keşifte sahte fiyat/pozisyon grep'i 0 ✓ · MatchCalendar'da mock grep'i 0 ✓ · smoke 4/4 + 256+ birim yeşil.
