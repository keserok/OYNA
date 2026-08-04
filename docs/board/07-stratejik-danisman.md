# 07 — STRATEGIC ADVISOR

**Tarih:** 4 Ağustos 2026
**Analiz tabanı (K-14):** dal `559ea49` + canlı `OYNA` — **`main` DEĞİL**
**Okundu:** `DECISIONS.md` (K-1…K-16), altı rol raporunun tamamı, `OYNA_MASTER_PRENSIPLER.md` (arşiv), `docs/sistem/`

---

## ⚠️ ÖNCE BİR DÜZELTME — bu raporun en önemli cümlesi

Son beş rol raporunda (SRE turunda **benim yazdığım** metin dâhil) şu cümle geçiyor:

> *"Veritabanında artık **gerçek para** kayıtları var (1.920 ₺)."*

**Bu doğru değil.** Canlıdan okudum:

| Sorgu | Sonuç |
|---|---|
| Başarılı **gerçek** ödeme sayısı | **0** |
| Gerçek kişilere ait cüzdan hareketi | **0** |
| Ödeme talebi (payout) | **0** |
| O 1.920 ₺ nedir? | **2 adet BAŞARISIZ ödeme denemesi** (`status = FAILED`, ikisi de 11 Temmuz 2026, aynı kişi, `paid_at` boş, sağlayıcı referansı yok) |

**OYNA bugüne kadar tek kuruş gerçek para işlemedi.**

Bu rakam turdan tura aktarılırken "başarısız deneme" olduğu düşmüş, "gerçek para" olarak kalmış. Bu, kurulun altı turdur kovaladığı hatanın ta kendisi: **bir sayı doğru görünüyor, kimse kaynağına inmiyor.**

Düzeltmenin sonucu: SRE-1'de kurduğumuz gecelik yedek **hâlâ doğru bir iş** (yarın gerçek para geldiğinde hazır olacak), ama aciliyet gerekçesi yanlıştı. Bunu ilgili raporlara not düşüyorum.

---

## Rolün sorusu

Beş teknik rol *"doğru mu çalışıyor"* diye sordu. Benim sorum tek:

> **Bu ürün işe yarayacak mı, ve sıradaki hamle ne olmalı?**

---

# AŞAMA 1 — AÇILIŞ: 5 STRATEJİK ÖNERİ

### Öneri 1 — Altı tur boyunca hiç sürülmemiş bir motoru inceledik

Canlıdan okuduğum işletme tablosu:

| Ölçüm | Gerçek değer |
|---|---|
| Kayıtlı kullanıcı | 33 — **29'u demo** |
| "Gerçek" kullanıcı | 4 → **2'si siz** (`Miraç Kerem Çürüksulu`, `Miraç Kerem`), 1'i test hesabı (`Arena Sports sss`), 1'i silinmiş |
| **Dışarıdan gelen gerçek kullanıcı** | **0** |
| "Gerçek" maç | 4 → **3'ünü demo kullanıcılar kurmuş** (aşağıda) |
| Gerçekten dış maç | **1** — o da iptal edilmiş |
| İşlenen para | **0 ₺** |
| Yayında saha | 4 (6'nın) |
| Kapsama alanı | Ordu'nun **19 ilçesi** hazır |

Mühendislik kalitesi gerçekten yüksek — bunu altı turun kanıtıyla söylüyorum. Ama **bu kalite henüz tek bir müşteriye dokunmadı.**

> Bu bir suçlama değil, bir yön tespiti: risk artık *"kod doğru mu"* tarafında değil, *"gelen olacak mı"* tarafında.

### Öneri 2 — Kart ödemesi platform genelinde KAPALI

`app_config.payment_mode_global` = **`CASH_ONLY`**.

`resolve_payment_mode()` bunu şöyle uyguluyor: `online_allowed = false`. Yani üç turun (CTO, Mimar, Güvenlik) derinlemesine incelediği kart ödeme altyapısı **canlıda hiç devrede olmadı.**

Bu bir hata değil — bilinçli bir duruş ve iyi kurulmuş: fonksiyonda ayrıca bir emniyet kilidi var (*sağlayıcı canlı değilse online ödeme teklif edilemez*).

Ama stratejik sonucu büyük: **ödeme sistemi test edilmiş değil, sadece incelenmiş.** İlk gerçek kart işlemi hâlâ önümüzde ve orası her üründe en riskli andır.

### Öneri 3 — Vitrinin %83'ü hâlâ sahte ve bu artık en pahalı madde

`demo_mode_enabled` = **`true`**. CPO turunun 1 numaralı bulgusu (CPO-P0-1) hâlâ açık ve *"lansman kontrol listesinin 1. maddesi"* olarak işaretli.

Bugün zararsız çünkü dışarıdan gelen yok. Ama **açılış günü** bu anahtar kapanmazsa, ilk gelen kullanıcı 6 maçtan 5'inin sahte olduğu bir vitrin görür — ve bir daha gelmez. İlk izlenimin ikinci şansı yok.

### Öneri 4 — Demo/gerçek ayrımında bir delik kaldı

Canlıda buldum: **3 maç "gerçek" işaretli ama demo kullanıcılar kurmuş.**

| Maç | Kuran | Kuran demo mu? | Maç demo mu? |
|---|---|---|---|
| Capo Arena Maçı | Emre Kaya | ✅ evet | ❌ hayır |
| VIP Arena Maçı | Emre Kaya | ✅ evet | ❌ hayır |
| VIP Arena Maçı | Burak Demir | ✅ evet | ❌ hayır |

P-3'te kurduğumuz gece denetimi (`K-DEMO-1`) bunu **yakalamıyor**, çünkü yalnız `payment_intents` ↔ `profiles` karşılaştırmasını yapıyor; `matches` ↔ `profiles` bakmıyor.

Sonuç: "4 gerçek maç" diye okuduğunuz sayının **3'ü sahte** ve panel bunu size yeşil gösteriyor. Kararlarınızı bu sayıya dayandırırsanız yanılırsınız.

### Öneri 5 — Altı turun ortak cevabı zaten yazıldı; iş onu uygulamaya kaldı

Beş teknik rol bağımsız çalıştı ve hepsi **aynı** kök nedene çıktı:

| Tur | Bulduğu | Kök neden |
|---|---|---|
| CPO | Vitrin sahte, huni ölçülmüyor | Kimse bakmıyor |
| CTO | Fiyat/iade istemciden geliyordu | Kimse doğrulamıyor |
| Mimar | Süpürücü hiç kurulmamış, saat kayıyor | Uyarı yazıldı, okunmadı |
| Kıdemli Müh. | 3.240 satırlık dosyada aynı iş 14 kez | Dosya o kadar büyük ki yazan göremiyor |
| SRE | Yedek yok, alarm sessiz, CI sessiz yeşil | Bozulduğunu söyleyecek kimse yok |
| Güvenlik | Korunacak sütun listesinde bir satır eksik | Liste elle tutuluyor |

**Tek cümle:** *Sistem doğru kuruluyor, ama doğru kurulduğunu sürekli kontrol eden bir şey olmadığı için zamanla gerçekle ayrışıyor.*

Cevabı da bu oturumda kuruldu: 17 yapı taşı, 32 kontrol, her gece çalışan denetim, `npm run etki` kapısı. **Yapılacak yeni bir keşif yok — yapılacak olan, bu mekanizmayı yaşatmak.**

---

# AŞAMA 2a — BULGULAR

## 🔴 P0

### [P0] STR-1 · Karar verdiğiniz sayılar gerçeği göstermiyor

**Kanıt:** Üç ayrı yerde ölçüm yanlış okunuyor:
1. **1.920 ₺ "gerçek para"** → aslında 2 başarısız deneme (`payment_intents.status='FAILED'`)
2. **"4 gerçek maç"** → 3'ü demo kullanıcıların kurduğu maç
3. **"33 kullanıcı"** → 29'u demo, kalan 4'ün 2'si siz

**Risk:** Kod hatası değil, **karar hatası** üretir. Kurucu olarak "para akıyor, maç var, kullanıcı var" tablosuna bakıp lansmanı ertelersiniz ya da hızlandırırsınız — ikisi de yanlış veriye dayanır. Kurulun altı turu boyunca bu yanlış sayı **beş rapora** taşındı.

**Çözüm:** Panele **tek bir "Gerçek Durum" kartı**: dışarıdan gelen kullanıcı, gerçekten dış maç, başarıyla işlenen para. Demo hiçbirine karışmasın. Ayrıca `K-DEMO-1` denetimi `matches` ↔ `profiles` karşılaştırmasını da yapsın.
**Efor:** ~3 saat

---

## 🟠 P1

### [P1] STR-2 · Lansmanın önündeki engel teknik değil, tek bir anahtar ve tek bir liste

**Kanıt:** `demo_mode_enabled = true` · `payment_mode_global = CASH_ONLY` · yayında 4 saha · 0 dış kullanıcı.

Altı turun kapattığı P0'lardan sonra lansmanı bekleten şey artık **kod değil.** Sırasıyla: (1) demo anahtarını kapatmak, (2) kart ödemesini açıp **ilk gerçek işlemi yapmak**, (3) sahaya insan getirmek.

**Risk:** Kurul süreci teknik borcu kapattı, ama teknik borç kapandıkça yeni teknik borç aramak kolaydır. Asıl risk buradan sonra **mükemmelleştirme tuzağı**: hiç kullanıcı yokken kod kalitesini artırmaya devam etmek.

**Çözüm:** Bir sonraki oturumun konusu kod olmasın; **ilk 10 gerçek kullanıcı** olsun.
**Efor:** ürün kararı

### [P1] STR-3 · Kart ödemesi hiç canlı denenmedi

**Kanıt:** `payment_mode_global='CASH_ONLY'` · başarılı gerçek ödeme 0 · sağlayıcı `IYZICO` ayarlı ama etkin mod nakit.

**Risk:** Ödeme altyapısı üç tur boyunca **okundu** ve iyi bulundu (webhook kaynağından doğruluyor, tutar istemciden alınmıyor, aynı ödeme iki kez işlenmiyor). Ama okunmuş kod ile **çalıştığı görülmüş** kod aynı şey değildir — SRE turunda geri alma provası için söylediğimin aynısı.

**Çözüm:** Lansmandan önce **kendi kartınızla, gerçek parayla, küçük tutarlı** uçtan uca bir işlem: ödeme → iade → cüzdan. Yaşadığınız her adımı not edin.
**Efor:** ~1 saat (sizinle birlikte)

### [P1] STR-4 · Tek kişilik ekip, tek nokta arıza

**Kanıt:** K-7.1 (tek kurucu) · SRE-2 (alarm size ulaşmıyor, S-2 ile ertelendi) · SRE-8 (geri alma hiç prova edilmedi) · SRE-4 (deneme ortamı boş).

**Risk:** Sistemin kendini toparlama yeteneği iyi (24 saatte 2.135 iş, 0 hata). Ama bir şey gerçekten bozulduğunda **müdahale edecek tek kişi sizsiniz** ve haber alma yolunuz panele bakmaktan ibaret.

**Çözüm:** Lansman gününden önce alarmın size ulaşması (SRE-2) — bugün kararınızla ertelendi, ama lansman öncesi kapatılması gereken bir madde.
**Efor:** size ~10 dakika

---

## 🟢 P2

### [P2] STR-5 · Master prensipler dosyası hâlâ "GEÇERSİZ"
`OYNA_MASTER_PRENSIPLER.md` başında *"3 Ağustos 2026 itibarıyla geçersiz"* yazıyor ve yerine geçecek dosyanın *"danışma kurulu süreci tamamlandığında"* yazılacağı belirtilmiş. **O süreç bu raporla tamamlandı.** Kapanış işi olarak tek master dosya yazılmalı (K-6.5 / K-11.6). **Efor:** ~3 saat

---

## ✅ Bu süreçte gerçekten kazanılanlar

Bunları sayıyorum çünkü altı tur sonra "ne kazandık" sorusunun net bir cevabı olmalı:

| Kazanım | Kanıt |
|---|---|
| Bildirim köprüsü onarıldı | 21/21 HTTP 500 → 200 |
| Askıda ödeme süpürücüsü kuruldu | cron aktif, çalışıyor |
| Saat kayması **fiziksel olarak imkânsız** | veritabanı tetikleyicisi, 4 test |
| Çifte rezervasyon **matematiksel olarak imkânsız** | kısıt yerinde |
| Ölçek sorunu kapandı | ilk yük 561 → **232 KB**; sorgu 1.9 → **0.52 ms** |
| Demo/gerçek para ayrıldı | 6 tabloda, sahtelenemez tetikleyicilerle |
| Gecelik yedek kuruldu | 8 tablo, doğrulandı |
| Çökme kaydı kuruldu | üçüncü tarafa veri gitmeden |
| Kalıcı mekanizma | **17 yapı taşı · 32 kontrol · her gece denetim** |
| Sistem sağlığı | **14 yeşil / 0 kırmızı** |
| Testler | **1.437 / 1.437 yeşil** |

Bunlar küçük iyileştirmeler değil; birkaçı (saat kayması, çifte rezervasyon, kadro bildirimi) lansmanda **gerçek para kaybettirecek** hatalardı.

---

# AŞAMA 2b — CEO'YA SORULAR

### S-1 · Sıradaki oturumun konusu ne olsun?

**Ne soruyorum:** Kurul süreci bitti. Şimdi ne yapalım?

**Neden karar sizin:** Bu bir mühendislik kararı değil, bir işletme kararı — ve yanlış cevabı aylar yakar.

| Seçenek | Ne verir | Riski |
|---|---|---|
| **(a)** Lansman hazırlığı: demo kapat, ilk gerçek ödeme, ilk 10 kullanıcı | Ürün gerçek dünyayla temas eder | Eksikler canlıda görünür **← önerim** |
| **(b)** Kalan P'leri kapat (güvenlik + SRE), sonra lansman | Daha temiz zemin | Hiç kullanıcı yokken cila |
| **(c)** Saha sahibi paneline derinleşmek | Arz tarafı güçlenir | Talep yokken arz büyütmek |

**Ne değişir:** (a) dersem bir sonraki oturum "ilk kullanıcı" odaklı olur. (b) dersem SEC-1…SEC-5 ve SRE-4/8'i kapatırım. (c) dersem panel turu açarız.

### S-2 · Demo anahtarını ne zaman kapatalım?

**Ne soruyorum:** `demo_mode_enabled` bugün açık ve vitrinin %83'ü sahte.

**Neden karar sizin:** Kapattığınız anda uygulama **neredeyse boş** görünecek — 4 yayında saha, 1 gerçek maç. Bu, dolu görünen sahte bir vitrinden daha dürüst ama daha ürkütücüdür.

| Seçenek | Sonuç |
|---|---|
| **(a)** İlk gerçek kullanıcıdan hemen önce kapat | Sahtelik hiç görülmez **← önerim** |
| **(b)** Şimdi kapat | Boş vitrini siz de görüp gerçeğe alışırsınız |
| **(c)** Lansmandan sonra kapat | ❌ **Tavsiye etmem** — ilk izlenim yanar |

### S-3 · İlk gerçek ödemeyi ne zaman deneyelim?

**Ne soruyorum:** Kart ödemesi hiç canlı çalışmadı. Kendi kartınızla küçük tutarlı bir deneme yapalım mı?

**Neden karar sizin:** Gerçek para, gerçek kartınız. Ayrıca `payment_mode_global`'i geçici olarak açmayı gerektirir.

**Ne değişir:** **Evet** derseniz adım adım anlatır, sonucu birlikte doğrularız — ödeme, iade, cüzdan. **Hayır** derseniz ilk gerçek kart işlemi **bir müşterinizin** üzerinde denenmiş olur.

### S-4 · Master prensipler dosyasını şimdi yazayım mı?

**Ne soruyorum:** Mevcut dosya "GEÇERSİZ" damgalı ve yerine geçecek dosya bu sürecin bitmesini bekliyordu. Süreç bitti.

**Ne değişir:** **Evet** derseniz K-1…K-16'nın tamamını tek, çelişkisiz, sade Türkçe bir dosyada toplarım ve `CLAUDE.md`'yi ona bağlarım. **Sonra** derseniz kararlar `DECISIONS.md`'de dağınık kalmaya devam eder.

---

# AŞAMA 3 — KAPANIŞ

## Mutlaka yapılması gereken 3 şey

1. **Gerçek Durum kartını kurun.** Bugün baktığınız sayıların üçü de yanlış. Yanlış sayıya bakan bir kurucu, doğru kod yazan bir ekipten daha tehlikelidir.
2. **İlk gerçek ödemeyi siz yapın.** Üç tur bu altyapıyı okudu ve beğendi. Hiçbiri onu **çalıştırmadı**.
3. **Bir sonraki oturum kod oturumu olmasın.** Teknik borç kapandı; kapanmayan tek şey **kullanıcı yokluğu**.

## En büyük stratejik gözlem: **mükemmelleştirme tuzağının eşiğindesiniz**

Sayın CEO, size zor ama dürüst bir şey söyleyeceğim.

Bu altı tur gerçekten değerliydi. Lansmanda para kaybettirecek en az beş hata bulundu ve kapatıldı. Kalıcı bir denetim mekanizması kuruldu. Bunlar gerçek kazanımlar ve rakamlarla arkasındayım.

**Ama şu anda elinizde çok iyi mühendislikle yapılmış, hiç kimsenin kullanmadığı bir ürün var.** 29 demo kullanıcı, 0 dış kullanıcı, 0 lira. Sistemin en çok incelenen parçası — ödeme altyapısı — canlıda bir kez bile çalışmadı.

Kod okuyamayan bir kurucu için mühendislik turları çok tatmin edicidir: her tur somut bulgular, yeşil testler, kapanan maddeler getirir. **İlerleme hissi verir.** Ama halı saha pazarında kazanan, en temiz kodu yazan değil; **Ordu'da ilk 10 oyuncuyu ve ilk 3 saha sahibini uygulamaya sokan** olacak.

Bu yüzden en büyük riski şöyle yazıyorum: **yedinci bir mühendislik turu istemek.** Her seferinde bulunacak bir şey olacak — kod her zaman daha iyi olabilir. Ama sıradaki gerçek bulgu artık kodda değil, **ilk gerçek kullanıcının davranışında.**

Bugün elinizdeki sistem ilk 100 kullanıcıyı taşıyacak durumda. Bunu altı turun kanıtıyla söylüyorum: para değişmezleri temiz, çifte rezervasyon imkânsız, saat kayması imkânsız, yedek var, denetim her gece çalışıyor, 1.437 test yeşil.

**Eksik olan kod değil. Eksik olan insan.**

---

## Sıradaki adım için önerim

| Sıra | İş | Kim |
|---|---|---|
| 1 | Gerçek Durum kartı + `K-DEMO-1` düzeltmesi | ben · 3 sa |
| 2 | İlk gerçek kart işlemi (ödeme → iade) | **birlikte** · 1 sa |
| 3 | Demo anahtarını kapat | ben · 5 dk |
| 4 | Ordu'da ilk 3 saha sahibiyle konuşma | **siz** |
| 5 | İlk 10 oyuncu | **siz** |
| 6 | Kalan güvenlik/SRE P'leri | ben · lansman sonrası |

---

**Danışma kurulu süreci burada tamamlanıyor.**
Yedi rol, yedi rapor, 16 karar bloğu, 17 yapı taşı, 32 kontrol.

Kapanış işi olarak bekleyen tek şey: **tek master prensipler dosyası** (S-4).
