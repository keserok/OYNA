# 04 — KIDEMLİ YAZILIM MÜHENDİSİ (Principal Engineer)

**Tarih:** 4 Ağustos 2026
**Konuşan rol:** Kıdemli Yazılım Mühendisi
**Analiz tabanı (K-14):** `claude/oyna-advisory-prompt-8s4x3m` @ `6fc2b2c` · canlı `OYNA` — **`main` DEĞİL**
**Okundu:** `DECISIONS.md` (K-1…K-14), `01-cpo.md`, `02-cto.md` (+2 ek), `03-mimar.md`, `UYGULAMA-PLANI.md`, `docs/sistem/`

---

## Bu turda neyi analiz ettim

K-14 kuralı gereği **bayat tabanı değil, dalın güncel hâlini** ölçtüm. Bu önemli: önceki üç rol `main @ da54bff`'e baktı; o günden bu yana **19 migration canlıya uygulandı ve 40 dosya değişti.**

Önceki rollerin kapattığı bulguları tekrar bildirmiyorum. Benim alanım **kodun kendisi**: karmaşıklık, tekrar, ölü kod, tip güvenliği, testlerin gerçekten neyi koruduğu.

### Ölçüm tabanı (güncel dal)

| Ölçüm | Değer |
|---|---|
| Kaynak dosya | **391** |
| Kaynak satır | **105.901** |
| Test dosyası / test | **102 / 1.426** |
| `any` kullanımı | **429** (164 `as any` + 236 `: any` + 29 jenerik) |
| `@ts-ignore` | **0** ✅ |
| Boş `catch` | 7 |
| TODO/FIXME | 6 ✅ |
| Üretim kodunda `console.log` | 1 dosya ✅ |

---

# AŞAMA 1 — AÇILIŞ: 4 STRATEJİK ÖNERİ

### Öneri 1 — Bu kod tabanının sorunu "kötü kod" değil, **birkaç dev dosya**

105.901 satırın önemli kısmı **beş dosyada** toplanmış:

| Dosya | Satır |
|---|---|
| `views/Studio.tsx` | **3.907** |
| `admin-panel/services/adminService.ts` | **3.394** |
| `views/MatchJoin.tsx` | **3.240** |
| `views/ServiceDashboard.tsx` | **2.805** |
| `views/PitchDiscovery.tsx` | **2.296** |

`MatchJoin.tsx` tek başına **40 `useState`** ve **13 `useEffect`** taşıyor. Bu, tek bir ekranda **40 ayrı hafıza kutusu** ve **13 ayrı otomatik tepki** demek — hangisinin hangisini tetiklediğini kimse zihninde tutamaz.

**Bu, sizin için şu anlama geliyor:** bu dosyalara dokunan her iş, tahmin edilenden uzun sürer ve yan etki riski taşır. Kod okuyamadığınız için de "neden bu kadar sürdü?" sorusunun cevabını göremezsiniz. **Cevap burada.**

### Öneri 2 — Testler var ama **kendileri denetlenmiyor**

1.426 test yeşil — bu gerçek bir güç. Ama `tsconfig.json`'un `exclude` listesinde `tests` var: **testlerin kendisi tip kontrolünden geçmiyor.**

Yani bir test yanlış tipte veri kullanıyorsa kimse fark etmez; test yeşil görünür ama **yanlış şeyi** doğruluyor olabilir.

Maliyetini ölçtüm: testleri kontrole almak **27 hata** çıkarıyor ve bunlar birkaç dosyada toplanmış. Bu, "1.426 test yeşil" cümlesine tam güvenmek için ödenmesi gereken bedel.

### Öneri 3 — `any`, sistemin kör noktalarını işaretliyor

**429 `any`** var ve dağılımı rastgele değil: **`MatchJoin.tsx` tek başına 42 tanesini** taşıyor.

`any` demek, "bu değerin ne olduğunu bilgisayara söylemiyorum" demek. Orada yazım hatası yaparsanız bilgisayar uyarmaz, uygulama çalışırken patlar. **En çok `any` olan yer, en riskli yerdir** — ve o yer maç lobisi, yani paranın ve kadronun kesiştiği ekran.

### Öneri 4 — Ölü kod az ama **yanıltıcı**

Dört şey yazılmış ve **hiç kullanılmıyor**: `VirtualList`, `redeemReferralCode`, `fbAddMatch`, `fbUpdateMatch`.

Sayı küçük (bu iyi). Ama tehlike sayıda değil: **bir sonraki geliştirici — ya da bir sonraki Claude oturumu — bunları çalışan özellik sanır.** Mimar turunda tam bunun bedeli ödendi: `pitch_slot_holds` tablosunu "ölü" sanıp silmeyi önerdim, **oysa rezervasyon akışı ondan okuyordu.**

---

# AŞAMA 2a — BULGULAR

## 🔴 P0

### [P0] PE-1 · `MatchJoin.tsx` — 3.240 satır, 40 hafıza kutusu, 13 otomatik tepki

**Kanıt:** `views/MatchJoin.tsx` · 3.240 satır · 40 `useState` · 13 `useEffect` · 14 `getMatchDetails(` çağrısı · 42 `as any`

**Risk:** Bu ekran **paranın ve kadronun kesiştiği yer** — slot alma, ödeme, iptal, iade, hakem/kaleci. K-3.3 (iptalde herkese iade) ve K-1.1 (kaptan para paneli) kararlarınız buraya kod eklemeyi gerektiriyor. Bugünkü hâliyle her ekleme, öngörülemeyen bir yan etki riski taşıyor.

**Çözüm:** Dosyayı üçe ayır — *kadro*, *para*, *hizmet sağlayıcılar*. 14 tekrar eden yeniden-çekme tek bir yardımcıya indirilsin.

**Efor:** ~3 gün · **Doğrulama:** lobide slot al, ayrıl, ödeme yap, iptal et — dördü de bugünküyle aynı çalışmalı.

---

### [P0] PE-2 · Testler tip kontrolünden geçmiyor — "1.426 yeşil" olduğundan az şey garanti ediyor

**Kanıt:** `tsconfig.json` `exclude`: `tests`, `notifications`, `supabase`, `scripts`, `src`, `arsiv`
**Ölçüm:** testler kontrole alınınca **27 hata** (11 `TS2352` hatalı tip dönüşümü, 8 `TS2551` yanlış özellik adı, 3 `TS2307` bulunamayan modül)

**Risk:** `TS2551` özellikle kötü: **var olmayan bir alan adı** kullanılıyor demek. Bir test `match.startsAt` yerine `match.starts_at` yazdıysa, o test aslında `undefined` ile karşılaştırma yapıp yeşil kalıyor olabilir. Yani **testin koruduğunu sandığınız şeyi korumuyor.**

Bu, tüm sürecimizin dayandığı cümleyi zayıflatıyor: *"npm run test:unit 1426/1426 yeşil"*.

**Çözüm:** `tests` ve `notifications` typecheck kapsamına alınsın, 27 hata düzeltilsin. **Kapsam dışı bırakma, kapsama almaktan daha pahalı.**

**Efor:** ~1 gün · **Doğrulama:** `npm run lint` testleri de kapsayarak temiz geçmeli.

---

### [P0] PE-3 · `strict` kapalı — 38 hatanın 14'ü "bu değerin tipi belirsiz"

**Kanıt:** `tsconfig.json`'da `strict` anahtarı yok. Ölçtüm: `--strict` ile **38 hata**
· 16 `TS2345` (yanlış tipte argüman) · **14 `TS7006` (parametre tipi belirsiz)** · 4 `TS2783` · 1 `TS18048` + 1 `TS18047` (**null olabilir ama kontrol edilmiyor**)

**Risk:** Son ikisi doğrudan çökme sebebi: bir değer `null` olabiliyor ama kod bunu varsaymıyor. Kullanıcıda beyaz ekran demek.

**Çözüm:** Kademeli aç — önce `strictNullChecks` (2 hata), sonra `noImplicitAny` (14 hata), en son tamamı. **38 hata bir günlük iştir ve bir daha asla bu kadar ucuz olmayacak.**

**Efor:** ~1–1,5 gün

---

## 🟡 P1

### [P1] PE-4 · Dört ölü yapı, yanıltıcı

**Kanıt (güncel dalda ölçüldü, çağrılan yer sayısı):**
`components/common/VirtualList.tsx` → **0** · `redeemReferralCode` → **0** · `fbAddMatch` → **0** · `fbUpdateMatch` → **0**

**Risk:** Mimar turunda bu türden bir yanılgı **üretimi bozacaktı**. Ölü görünen şeyin gerçekten ölü olduğu **kanıtlanmadan** silinmemeli — ama duruyorsa da **ölü olduğu yazmalı**.

**Çözüm:** `VirtualList` **bağlanmalı** (uzun listelerde gerçekten gerekli). Diğer üçünün başına *"KULLANILMIYOR — silinmeden önce arama yap"* notu düşülmeli veya kaldırılmalı.

**Efor:** ~0,5 gün

---

### [P1] PE-5 · 429 `any` — ve en yoğun olduğu yer en riskli ekran

**Kanıt:** 164 `as any` + 236 `: any` + 29 jenerik. En yoğun: `MatchJoin.tsx` **42**, `PaymentScreen.tsx` **11**, `walletService.ts` **6**.

**Risk:** İlk üç sıranın üçü de **para ekranı**. `as any` yazıldığı yerde tip güvenliği tamamen kapanır.

**Çözüm:** Sıfırlamak hedef değil. **Para dosyalarındaki `any`'ler öncelikli** temizlensin (~59 tane).

**Efor:** ~1,5 gün

---

### [P1] PE-6 · 7 boş `catch` — sessizce yutulan hata

**Kanıt:** Kod tabanında 7 boş yakalama bloğu.

**Risk:** Bu, tüm kurulun ortak temasının kod içindeki hâli: **hata olur, hiçbir yere yazılmaz.** P-0'da bunun canlı bedelini gördük.

**Çözüm:** Her biri ya anlamlı bir uyarı bassın ya da neden yutulduğu **yazılı** olsun.

**Efor:** ~0,5 gün

---

## 🟢 P2

### [P2] PE-7 · Dört dev dosya daha bölünmeyi bekliyor
`Studio.tsx` 3.907 · `adminService.ts` 3.394 · `ServiceDashboard.tsx` 2.805 · `PitchDiscovery.tsx` 2.296.
`MatchJoin` çözüldükten sonra aynı yöntem uygulanmalı. **Efor:** her biri ~2 gün.

---

## ✅ Güçlü yanlar — bozulmamalı

| Ne | Ölçüm |
|---|---|
| **`@ts-ignore` yok** | **0** — kimse tip kontrolünü zorla susturmamış |
| **1.426 test, 102 dosya** | Bu ölçekte bir üründe güçlü bir taban |
| **TODO/FIXME neredeyse yok** | 6 — "sonra hallederiz" borcu birikmemiş |
| **Üretimde `console.log` yok** | 1 dosya |
| **Mekanizma kuruldu** | `npm run etki` + gece denetimi çalışıyor |

---

# AŞAMA 2b — CEO'YA SORULAR

### S-1 · `MatchJoin.tsx` bölünmesi ne zaman?

**Neden soruyorum:** K-1.1 (kaptan para paneli) ve K-3.3 (iptal zinciri) kararlarınız **bu dosyaya kod eklemeyi** gerektiriyor. İki yol var:

- **(a) Önce böl, sonra ekle** — 3 gün gecikme, ama sonraki her iş hızlanır **← önerim**
- **(b) Önce ekle, sonra böl** — özellik daha erken çıkar, ama 3.240 satıra 500 satır daha eklenir

**Cevaba göre:** (b) derseniz bölme işi muhtemelen hiç yapılmaz — tecrübeyle sabittir.

### S-2 · Testleri ve katı modu şimdi mi açalım?

**Neden soruyorum:** İkisi birlikte ~2 günlük iş ve **65 hata** düzeltilecek (27 + 38). Kod tabanı büyüdükçe bu sayı artar.

- **(a) Şimdi, lansmandan önce** **← önerim** — bir daha bu kadar ucuz olmayacak
- **(b) Lansmandan sonra**

**Cevaba göre:** (a) derseniz "testler yeşil" cümlesi gerçekten güvenilir hâle gelir.

### S-3 · Kod kalitesi işleri için ne kadar zaman ayırıyoruz?

**Neden soruyorum:** Buradaki tüm işler toplamı ~8 gün. Hiçbiri kullanıcının göreceği bir özellik değil — hepsi **sonraki işleri hızlandırmak** için.

- **(a) %20 kural**: her 5 günün 1'i kaliteye **← önerim**
- **(b) Blok hâlinde**: önce 8 gün kalite, sonra özellik
- **(c) Şimdilik yok**: yalnız P0'lar, gerisi lansmandan sonra

**Cevaba göre:** (c) derseniz kabul edilebilir, ama borç faiziyle büyür — 6 ay sonra 8 gün 20 güne çıkar.

---

# AŞAMA 3 — KAPANIŞ

## Mutlaka yapılması gereken 3 şey

1. **`MatchJoin.tsx`'i bölün** — paranın ve kadronun kesiştiği ekran, bugün kimsenin tamamını zihninde tutamayacağı boyutta. Onaylanan kararlarınız buraya kod eklemeyi gerektiriyor.
2. **Testleri tip kontrolüne alın** — 27 hata. Bu yapılmadan *"1.426 test yeşil"* cümlesi olduğundan fazla güven veriyor.
3. **Katı modu kademeli açın** — 38 hata, ikisi doğrudan çökme sebebi. Bugün bir günlük iş; altı ay sonra bir haftalık.

## Hızlı kazanımlar

| İş | Süre |
|---|---|
| `VirtualList`'i bağla | 4 sa |
| 7 boş `catch`'e uyarı ekle | 4 sa |
| Ölü üç fonksiyona "KULLANILMIYOR" notu | 1 sa |
| `strictNullChecks`'i tek başına aç (2 hata) | 2 sa |

## En büyük stratejik hata: **"çalışıyor" ile "bakılabilir" arasındaki farkı görmemek**

Sayın CEO, bu kod tabanı **çalışıyor** — 1.426 test bunu gösteriyor, ve önceki turlarda kurduğumuz mekanizma sistemin sağlıklı olduğunu her gece doğruluyor.

Ama bir kod tabanı iki ayrı şey olabilir: **çalışan** ve **üzerine inşa edilebilen.** OYNA birincisi; ikincisi olmaya yakın ama henüz değil.

Somut göstergesi şu: `MatchJoin.tsx`'te **14 kez aynı işlem tekrar yazılmış.** Bu, birinin tembelliği değil — dosya o kadar büyük ki, yazan kişi aynı şeyin başka yerde zaten yapıldığını **göremiyor.**

Stratejik hata şu olurdu: *"testler yeşil, sistem sağlıklı, o hâlde kod tamam"* demek. **Testler kodun bugün doğru çalıştığını söyler; kodun yarın değiştirilebileceğini söylemez.**

Sizin durumunuzda bu daha da önemli: **kod okumuyorsunuz ve tek kişisiniz.** Yani bir dosyanın "dokunulması zor" hâle geldiğini size kimse söylemeyecek — sadece işler yavaşlayacak ve sebebini göremeyeceksiniz. Bu rapor o sebebi ölçüp önünüze koyuyor.

---

**Bir sonraki rol:** SRE & DevOps Lead
Geçmek için: *"sıradaki karaktere geçebiliriz"*
