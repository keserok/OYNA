# ⚽ OYNA — Oyuncu (Player) Edge-Case Analizi & Çözüm Planı

> **Rol:** Oyuncu (PLAYER) · **Faz:** 1/4 (sonra Kaleci → Hakem → Tesis)
> **Yöntem:** 4 paralel derin kod-denetimi + **canlı sürüş** (Playwright, prod Supabase) + Master Prensipler'e karşı gap analizi
> **Tarih:** 2026-07-13 · **Branch:** `claude/player-edge-cases-plan-ggtezh`
> **Bakış açısı:** Milyar dolarlık bir ürün ekibinin QA'i + geliştiricisi. Odak: **UI/UX akış olgunluğu.**

Bu belge çözümleri **uygulamaz**; onaya sunar. Onayladığın maddeler `PROBLEMLER_VE_COZUMLER.md` iş akışına göre tek tek kodlanır.

> **✅ Onaylanan kararlar (2026-07-13):**
> - **K2/B1 — minRating:** Varsayılan **YOK** (maç herkese açık); yalnız kurucu isterse baraj koyar.
> - **K1 — Cüzdan top-up:** **Kalır**; Master 4.6 buna göre güncellenecek (cüzdan-öncelikli ödeme). C-grubu tam kapsam (idempotency + min/max).
> - **K4 — Ödeme sağlayıcı:** Şimdilik **SIMULATION**; UX simülasyon gerçekliğine göre kurgulanır. Gerçek iyzico pre-auth/capture **ayrı iş** olarak askıda.
> - **Sonraki adım:** Kod yazılmayacak; kullanıcı planı madde madde inceleyip onaylayacak.

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
- **K3 — Misafir (guest) modu.** ⏳ **AÇIK.** Master "lansmanda YOK" diyor. _Öneri:_ Şimdi tam gate'le (dead-end'leri tek tek düzeltmek yerine); geliştirmede kalsın. Onayına göre A7/F4 kapsamı değişir.
- **K4 — Ödeme sağlayıcı.** ✅ **KARAR: Şimdilik SIMULATION.** UX simülasyon gerçekliğine göre kurgulanır — bilet/QR (C4) *simüle edilmiş* ödeme durumunu **dürüstçe** yansıtır; blokaj→capture→iade akışı simüle edilir. Gerçek iyzico pre-auth ayrı iş olarak askıda.
- **K5 — Kapsam sırası.** _Öneri:_ Önce 6 sistemik kök neden (KN-1..6), sonra P0 para/güven, sonra P1 akış, sonra P2 cila. Kullanıcı planı önce inceleyecek; sıra onay sonrası kesinleşir.

---

## 5. Önerilen uygulama sırası

| Sprint | İçerik | Neden önce |
|--------|--------|-----------|
| **S0 — Kök nedenler** | KN-2 (degraded banner), KN-1 (reaktif kimlik), KN-4 (rookie ölçeği), KN-3 (maç yazımı), KN-5 (para idempotency), KN-6 (mock temizliği) | Düzinelerce semptomu tek hamlede kapatır; her ekranı etkiliyor |
| **S1 — P0 Para & Güven** | C1–C5, B4, B5, G1 | Doğrudan para/güven; dispute riski |
| **S2 — P0/P1 Maç akışı** | B1, B2, B6, B7, B11, B12 | Soğuk-başlangıç çıkmazı + katılım bütünlüğü |
| **S3 — P1 Tutarsızlık & çıkmaz** | A1–A4, C6–C9, E1–E5, F1–F3 | Akış kırılmaları |
| **S4 — P2 Cila** | Kalan boş/hata/format/RTL/i18n maddeleri | Son rötuş, mağaza kalitesi |

---

### Özet
Oyuncu rolünde **~40 somut problem**, **6 sistemik kök nedene** indirgendi. En kritik 3 tema: **(1)** oyuncuda çalışan admin bootstrap'ının ürettiği kalıcı "bağlantı zayıf" bandı ve "Oyuncu" kimlik fallback'i; **(2)** para yüzeylerinde idempotency yokluğu + sahte/statik bilet + yanlış iade tahmini; **(3)** "bitmiş gibi görünen" mock ekranlar (değerlendirme skoru, takvim, taktik kadrosu, keşif fiyatları). Kök nedenlerle başlamak, cila aşamasına gelindiğinde iş listesini dramatik biçimde kısaltır.
