# 03 — YAZILIM MİMARI (Software Architect)

**Tarih:** 3 Ağustos 2026
**Konuşan rol:** Yazılım Mimarı
**Okundu:** `docs/board/DECISIONS.md` (K-1…K-9, CPO ve CTO P0'ları), `01-cpo.md`, `02-cto.md`, `02-cto-EK-guven-siniri.md`, `02-cto-EK2-erken-uyari-sistemi.md`
**Kurucu direktifi (K-9.1):** *"Daha zeki ve kapsamlı bir iş çıkarıp sorularını tüm sistemi mükemmelleştirmeye yönelik sor."*

---

## Bu turda nasıl çalıştım

Dört ayrı keşif ekibi çalıştırdım (eşzamanlılık, veri modeli, ölçek/performans, zaman/zamanlama) ve **her ekibin taşıyıcı iddiasını canlı veritabanında kendim tekrar ölçtüm.** Ekiplerin abarttığı iki iddiayı bu raporda düzelttim — aşağıda "Düzeltmeler" bölümünde açıkça yazıyor. Rapordaki her sayı ya canlı bir SQL sorgusundan ya `dosya:satır`dan ya da gerçek bir `vite build` çıktısından geliyor.

---

# AŞAMA 1 — AÇILIŞ: 5 STRATEJİK ÖNERİ

### Öneri 1 — Sistemin bugünkü asıl kırılganlığı kod değil, **tek yönlü kapılar**

OYNA'nın mimarisi tek bir cümleyle özetlenebilir: **veri girişi çok iyi korunuyor, veri çıkışı hiç korunmuyor.**

Çifte rezervasyon veritabanı seviyesinde matematiksel olarak imkânsız (aşağıda kanıt var), cüzdan eksiye düşemiyor, para değişmezleri (invariant) yeşil. Bunlar gerçekten iyi kurulmuş. Ama sistemin **dışarı** açılan her kapısı — bildirim gönderimi, ödeme sağlayıcısına gidiş, para tahsili — ya kapalı ya da sessizce kapanmış durumda.

Somut: bugün canlıda dışarıya gitmeye çalışan **18 HTTP çağrısının 18'i de hata (500) ile dönmüş.** Yani şu an OYNA hiç kimseye push bildirimi gönderemiyor ve bunu size hiçbir yerde söylemiyor.

**Mimari sonuç:** Yapılacak ilk iş yeni özellik değil, **çıkış kapılarını açmak ve açık kaldığını sürekli ölçmek.**

### Öneri 2 — "Kadro"yu iki ayrı yerde tutmayı bırakmalıyız

Bir maçta kimin oynadığı bilgisi bugün **iki yerde birden** tutuluyor: maç satırının içindeki JSON metni (`slots`) ve ayrı bir `match_participants` tablosu. Bazı işlemler ikisini birden yazıyor, bazıları sadece JSON'u yazıyor.

Bunun teorik bir risk olmadığını canlıda ölçtüm: **20 maçın 12'sinde iki kaynak birbirini tutmuyor. Bunların 2'si gerçek (demo olmayan) maç.**

Bir maçta JSON "5 kişi" derken tablo "7 kişi" diyor. Hangisi doğru? Para hesabı hangisine bakıyor? Bildirim hangisine gidiyor? Bugün cevabı fonksiyona göre değişiyor.

**Mimari sonuç:** Tek doğru kaynak seçilmeli (önerim: `match_participants` tablosu), diğeri ondan türetilmeli. Bu, para akışına dokunan bir karardır — ayrı paket, ayrı onay.

### Öneri 3 — Ölçek sorunu "sonra hallederiz" kutusundan çıkmalı; çünkü faturayı **açılıştan önce** ödetiyor

Uygulama her açıldığında **tüm maç tablosunu limitsiz indiriyor.** Bugün 20 maç var, sorun görünmüyor. 5.000 maçta bu **her açılışta 17,3 MB.**

Kritik nokta şu: Supabase planınız **ücretsiz (free)**. Aylık dışarı veri kotası 5 GB. 500 kişinin aynı akşam uygulamayı açması **8,6 GB** eder — **tek bir Cuma akşamı aylık kotayı 1,7 katıyla aşar** ve ay bitene kadar uygulama herkese kapanır.

Aynı şey canlı bağlantılar için de geçerli: ücretsiz planda 200 eşzamanlı canlı bağlantı sınırı var. 500 kişi girerse **201'inciden sonrası lobide slot dolduğunu göremez.**

**Mimari sonuç:** Bu, "büyüyünce düşünürüz" kategorisinde değil. K-1.4 kararınız ("her yeri tek tek açacağız") bize zaman kazandırıyor ama **tek bir ilçenin bile Cuma akşamı 300 kişiyi getirmesi yeterli.**

### Öneri 4 — Sunucumuz yanlış kıtada

Veritabanı **Singapur**'da (`ap-southeast-1`). Ordu'dan her istek gidiş-dönüş **160–220 milisaniye** sürüyor.

Uygulama açılışında **15 ayrı istek** atılıyor. Maç lobisi açılışında **10–14 istek**, bunların 4'ü sırayla. Yani lobi açmak **sadece ağ gecikmesi yüzünden ~1 saniye** sürüyor — sunucu hiç yorulmadan.

Frankfurt'a (`eu-central-1`) taşımak her isteği **~150 ms hızlandırır.** Oturum başına 35 istek varsayarsak kullanıcı başına **5 saniyelik** kazanç. Bu, yazacağımız hiçbir optimizasyondan daha büyük bir kazanç ve **tek seferlik bir taşıma işi.**

> Not: `oyna-staging` projeniz zaten Frankfurt'ta. Yani bölge tercihi bir yerde doğru yapılmış, canlıda yapılmamış.

### Öneri 5 — Repodaki migration geçmişi bir "yeniden kurma bombası" taşıyor

Bunu ayrı vurguluyorum çünkü **onayladığınız bölge göçünü (S3) doğrudan tehdit ediyor.**

Canlı veritabanınız **doğru.** Maç saatleri doğru hesaplanıyor — 20 maçın 20'sinde de yazılı saat ile gerçek saat birebir uyuyor, sıfır sapma var. Bunu tek tek ölçtüm.

**Ama repodaki migration dosyalarının sonuncusu yanlış.** `supabase/migrations/20260826000001_tek_lobi_p1_guvenlik_yapi.sql:245` satırındaki maç oluşturma fonksiyonu, saati **3 saat kaydıracak** eski desenle yazılmış.

Migration dosyaları dosya adı sırasıyla çalışır. Yani veritabanını sıfırdan kurmak gerektiği gün (yeni bölge, yedekten dönüş, staging kurulumu) **sistem sessizce 3 saat kayarak açılır.** Kimse hata görmez; sadece bütün maçlar yanlış saatte olur.

**Mimari sonuç:** Bölge göçünden önce repo ile canlıyı hizalayan bir migration yazılmalı. Bu, göçün ön koşuludur.

---

# AŞAMA 2a — BULGULAR

> **Kanıt kuralı:** her bulguda ya `dosya:satır` ya canlı SQL nesnesi adı ya da ölçüm var. Doğrulayamadıklarımı "⚠️ Kodda doğrulanamadı — varsayım" diye işaretledim.

---

## Önce: CANLIDA DOĞRULADIĞIM GÜÇLÜ YANLAR

Bunları yazmam şart, çünkü aşağıdaki 24 bulgu okununca sistem olduğundan kötü görünebilir. Bu beş şey **gerçekten iyi kurulmuş** ve bozulmamalı:

| Ne | Kanıt | Neden önemli |
|---|---|---|
| **Çifte rezervasyon imkânsız** | `pitch_bookings_no_overlap EXCLUDE USING gist (court_id WITH =, slot_range WITH &&) WHERE (status <> 'CANCELLED')` — canlı | Aynı korta aynı saate iki rezervasyon **veritabanı seviyesinde** reddediliyor. Uygulama hata yapsa bile geçemez. Bu, sektörde çoğu rakibin yapamadığı şey. |
| **Slot satın alma yarışı kilitli** | `player_buy_slots_v2__inner`: `SELECT ... FROM matches WHERE id = p_match_id FOR UPDATE` — canlı | 14 kişi aynı anda son slota bassa bile yalnız biri alır. Para iki kez çekilmez. |
| **Cüzdan eksiye düşemez** | `check_money_invariants()` → `ok: true` (8 değişmez) — canlı | Para matematiği kendi kendini denetliyor. |
| **Zaman sapması sıfır** | 20 maçın 20'sinde `date`+`time` metni = `starts_at AT TIME ZONE 'Europe/Istanbul'` — canlı | Bugün hiç kimse yanlış saatte sahaya gitmiyor. |
| **Migration kaydı temiz** | 398 repo dosyası = 398 canlı kayıt, sıfır fark | Repo ile canlı arasında "hangisi doğru" belirsizliği yok. |

---

## 🔴 P0 — LANSMANDAN ÖNCE ÇÖZÜLMELİ

---

### [P0] M-1 · Ödeme ve maç kapanışı ters sırada kilit alıyor — kilitlenme (deadlock) kaçınılmaz

**Kanıt:** Canlı fonksiyon gövdelerinden kilit sırasını çıkardım:
- `apply_card_payment`: `payment_intents` FOR UPDATE → `pitch_bookings` FOR UPDATE → `matches` FOR UPDATE
- `process_match_at_deadline`: `matches` FOR UPDATE → `payment_intents` FOR UPDATE (iki kez)

**Mevcut durum:** İki fonksiyon aynı iki tabloyu **tam ters sırada** kilitliyor.

**Risk:** Bir oyuncu ödeme yaparken, tam o anda `auto_process_matches` cron'u (her 10 dakikada bir) aynı maçı işlemeye başlarsa, PostgreSQL ikisinden birini zorla iptal eder (`deadlock detected`). İptal edilen taraf ödeme ise: **kartından para çekilmiş ama slot verilmemiş** olur. Kullanıcı için bu "param gitti, yerim yok" demektir — ve bu, A1.1 wedge'inizin (parayı toplamak) tam kalbinden vurur.

Cuma 20:00'de aynı anda 30 lobide ödeme akarken cron da çalışıyorsa çakışma olasılığı düşük değil, **yüksek**.

**Çözüm:** Tüm para fonksiyonlarında **tek bir kilit sırası** zorunlu kılınmalı: `matches` → `pitch_bookings` → `payment_intents`. `apply_card_payment` bu sıraya çevrilmeli. Ayrıca cron tarafındaki döngüde `FOR UPDATE SKIP LOCKED` kullanılmalı ki ödeme yapan kullanıcı cron'u beklemesin.

**Efor:** ~1 gün (fonksiyon yeniden yazımı + kilit sırası testi)

**Doğrulama:** İki oturumdan aynı maça eşzamanlı ödeme + `process_match_at_deadline` çalıştırıp `pg_stat_activity`'de deadlock aranır. Ayrıca kalıcı kontrol: tüm para fonksiyonlarının kilit sırasını tarayan bir denetim sorgusu (Sessizlik Denetçisi'ne eklenir).

---

### [P0] M-2 · Ödeme süpürücüsü iki kez ölü — askıda kalan para hiç toplanmıyor

**Kanıt (canlı):** `app_config` → `sweeper_cron = 0`, `sweeper_enabled = "false"`, buna karşılık `payment_provider = IYZICO`. `cron.job` listesinde 13 iş var, **süpürücü yok.**

**Mevcut durum:** Ödeme sağlayıcısı gerçek (iyzico), ama "ödeme başladı ama sonucu gelmedi" durumundaki kayıtları temizleyen mekanizma hem kapalı hem de zaten hiç kurulmamış.

**Risk:** Kullanıcı ödeme ekranında kartını girer, tam o anda telefonu kapanır / internet gider. `payment_intents` satırı `PENDING`'de kalır. Kimse dokunmaz. Para bankada bloke kalır, slot boş kalır, kullanıcı ne parasını görür ne yerini. **Bu, M-1 (deadlock) ile birleştiğinde para kaybı zincirini tamamlıyor:** deadlock ödemeyi yarıda keser, süpürücü olmadığı için kimse toplamaz.

Bugün canlıda `PENDING` kayıt yok (10 FAILED / 6 PAID / 2 VOIDED / 1 BLOCKED / 1 CAPTURED) — çünkü henüz gerçek trafik yok. İlk gerçek kesinti gününde birikmeye başlar.

**Çözüm:** Süpürücü cron işi yazılmalı: N dakikadan eski `PENDING`/`BLOCKED` kayıtları sağlayıcıdan sorgula, sonuca göre kapat veya iade et. `sweeper_enabled` açılmalı. Her çalıştırma sonucu loglanmalı.

**Efor:** ~1,5 gün

**Doğrulama:** Yapay bir `PENDING` kayıt bırakılır; bir sonraki taramada kapandığı görülür. Admin panelde "askıda ödeme sayısı" göstergesi 0'dan farklıysa kırmızı yanar.

---

### [P0] M-3 · Sistemin dışarı açılan tüm kapıları kapalı — 18 çağrının 18'i hata

**Kanıt (canlı):** `net._http_response` tablosu: **18 satır, 18'i de `status_code = 500`**, bugün 12:30–16:30 arası.

Nedeni üç ayrı katmanda birden bozuk. `notify_send_push_webhook()` canlı tanımı:
```sql
net.http_post(
  url     := '.../send-push',
  headers := '{"Content-Type": "application/json"}'::jsonb,   -- ❌ Authorization YOK
  body    := row_to_json(NEW)::jsonb                          -- ❌ {type,table,record,schema} bekleniyor
)
```

**Mevcut durum:** Veritabanı bildirim göndermeye çalışıyor, Edge Function yetkisiz diye reddediyor, hata hiçbir yere yazılmıyor, kimse görmüyor.

**Risk:** Push bildirimi OYNA'nın **ürün mekaniğinin bir parçası**, süs değil: "maçın 1 saat sonra", "kadro doldu", "ödemen alındı", "maç iptal edildi — paran iade edildi". Bunların hiçbiri gitmiyor. K-3.3 kararınız (saha/admin iptalinde herkese tam iade) bildirimsiz uygulanırsa kullanıcı parasının iade edildiğini **hiç öğrenmez** ve destek talebi olarak size döner.

**Çözüm:** Üç katman da düzeltilmeli — (a) `Authorization: Bearer <service_role>` başlığı eklenmeli (anahtar Vault'ta tutulmalı, fonksiyon gövdesine gömülmemeli), (b) gövde Supabase webhook formatına çevrilmeli, (c) `net._http_response`'ta 2xx dışı yanıtları sayan bir kontrol kurulmalı ki bir daha sessizce ölmesin.

**Efor:** ~0,5 gün düzeltme + 0,5 gün izleme

**Doğrulama:** Test bildirimi gönderilir; `net._http_response`'ta `status_code = 200` görülür; telefona bildirim düşer.

---

### [P0] M-4 · Kadro iki ayrı yerde tutuluyor ve canlıda **zaten ayrışmış**

**Kanıt (canlı ölçüm):** Maçların JSON kadrosundaki kişi sayısı ile `match_participants` tablosundaki kişi sayısını karşılaştırdım:

| Maç | JSON'da | Tabloda |
|---|---|---|
| `369efbf3…` (gerçek) | 5 | **6** |
| `9681967a…` (gerçek) | 5 | **7** |
| `4b77974b…`, `bef85065…`, `72d9b604…` | 0 | 1 / 1 / 2 |
| + 7 demo maç | — | uyuşmuyor |

**20 maçın 12'sinde sapma var; 2'si gerçek maç.**

Nedeni de canlıda belli — hangi fonksiyon hangi kaynağa yazıyor:

| Fonksiyon | JSON yazar | `match_participants` yazar |
|---|---|---|
| `player_buy_slots_v2__inner` | ✅ | ✅ |
| `player_release_slot` | ✅ | ❌ |
| `player_self_assign` | ✅ | ❌ |
| `player_unassign_slot` | ✅ | ❌ |

**Mevcut durum:** Satın alma iki kaynağı da yazıyor; slot bırakma / devretme / atama **yalnız JSON'u** yazıyor. Tabloda hayalet katılımcı kalıyor.

**Risk:** "Kim bu maçta?" sorusunun cevabı sorana göre değişiyor. Bildirim `_match_participant_ids()` üzerinden gidiyor (tabloya bakıyor) → **maçtan ayrılmış kişiye hâlâ bildirim gider.** Kadro sayacı JSON'a bakıyor → **maç dolu görünürken tabloda fazla kişi vardır.** K-3.3'teki "tüm katılımcılara eksiksiz iade" kuralı hangi listeye göre çalışacak? Bugün cevap yok.

**Çözüm:** Tek doğru kaynak `match_participants` olmalı. Üç eksik fonksiyon tabloya da yazmalı. JSON, okuma kolaylığı için türetilmiş görünüm olarak kalabilir ama **karar mercii olmamalı.** Ayrıca mevcut 2 gerçek sapma elle düzeltilmeli — **bu canlı veri değişikliğidir, ayrı onayınızı isteyeceğim.**

**Efor:** ~2 gün (üç fonksiyon + tutarlılık kontrolü + mevcut sapmanın düzeltilmesi)

**Doğrulama:** İki kaynağı karşılaştıran sorgu sürekli 0 satır dönmeli; Sessizlik Denetçisi'ne kalıcı kontrol olarak eklenir.

---

### [P0] M-5 · `matches.status` sözlüğü korumasız — hesap silme kapısı sessizce açık

**Kanıt (canlı):** `matches` tablosunda 6 adet CHECK kısıtı var (`deposit_status`, `score_status`, `visibility`, `commission_model`, `duration_minutes`, `footwear_rule`) — ama **`status` için CHECK YOK.**

Sonucu ölçtüm. Canlıdaki maç durumları: `CANCELLED` (10), `ACTIVE` (5), `COMPLETED` (4), **`CONFIRMED` (1)**.

Hesap silme kapısı ise şunu kontrol ediyor (`_account_deletion_status`, canlı, satır 40):
```sql
AND m.status IN ('GATHERING','CONFIRMED','PLAYING','LIVE')
```

`GATHERING` ve `PLAYING` kelimeleri **uygulamanın hiçbir yerinde geçmiyor** (repo geneli arama: 0 sonuç). Canlıda hiç kullanılmamışlar.

**Mevcut durum:** Kapı, sistemin kullanmadığı üç kelimeyi arıyor. Sistemin gerçekten kullandığı `ACTIVE` kelimesi listede **yok.**

**Risk:** Bu, CTO turunda konuştuğumuz **"sessizce yanlış davranan kural"ın ders kitabı örneği** (K-8, EK2). Kapı var, çalışıyor görünüyor, hata vermiyor — ama hiçbir zaman tetiklenmiyor. Sonuç: **parası bir maçta bloke duran kullanıcı hesabını silebilir.** Silindikten sonra o para kime iade edilecek? Bloke edilmiş kart tutarı ne olacak? Bugün cevap yok.

Ayrıca CHECK olmadığı için gelecekte bir yazım hatası (`ACTIVE ` sondaki boşlukla) sessizce kaydedilir ve o maç bütün filtrelerden düşer.

**Çözüm:** (a) `status` için CHECK kısıtı eklenmeli — geçerli sözlük tek yerde tanımlansın. (b) Hesap silme kapısı gerçek sözlüğü kullanmalı. (c) Tüm kod tabanında hayalet durum kelimeleri taranmalı.

**Efor:** ~0,5 gün

**Doğrulama:** Sözlük dışı bir durum yazmayı deneyince veritabanı reddetmeli. Parası bloke bir test kullanıcısı hesabını silmeye çalışınca engellenmeli.

---

### [P0] M-6 · Uygulama her açılışta tüm maç tablosunu indiriyor — limit yok

**Kanıt:** `supabaseMutations.ts:362-366`
```ts
export const fbGetMatches = async () => {
  const { data, error } = await supabase.from('matches').select('*');   // LİMİT YOK
```
`store.ts:512` bunu açılışta çağırıyor; `store.ts:502` tüm kritik yüklere **3 saniyelik tavan** koyuyor.

Canlı ölçüm: bir maç satırı ortalama **3.457 bayt** (bunun 1.510 baytı `slots`, 488 baytı `awaySlots` JSON'u).

**Mevcut durum:**

| Maç sayısı | Açılışta inen | 500 kişi aynı anda açarsa |
|---|---|---|
| 500 | 1,7 MB | 865 MB |
| 2.000 | 6,9 MB | 3,4 GB |
| **5.000** | **17,3 MB** | **8,6 GB** |

Supabase **ücretsiz planın aylık dışa veri kotası 5 GB.**

**Risk:** İki katmanlı. (1) **Tek bir Cuma akşamı aylık kotayı 1,7 katıyla aşar** — kota dolunca uygulama ay sonuna kadar herkese kapanır. (2) 17 MB, 4G'de 3 saniyeye sığmaz → `withTimeout` boş döner → `loadDegraded` bayrağı yanar (`store.ts:538-542`) → kullanıcı "Tekrar Dene"ye basar → **aynı 17 MB yeniden istenir.** Ölüm sarmalı.

Ayrıca telefon tarafında: 17 MB JSON'un ayrıştırılması orta seviye Android'de **2–4 saniye ekranı dondurur** — ağ hızlansa bile.

**Neden bugüne kadar kaldırılmadı:** Kodda gerekçesi yazılı (`supabaseMutations.ts:355-361`): "Maçlarım" ekranı ayrı bir sorgudan değil, bu global listenin telefonda filtrelenmesinden türetiliyor (`hooks/useMyMatches.ts:29-43`). Limit koyulursa kullanıcının kendi maçı listeden düşebilir. Yorumun kendi ifadesiyle: *"ölçek < doğruluk"*. **Bu karar o gün doğruydu; bugün süresi doldu.**

**Çözüm:** `get_my_matches()` adında kapsamlı bir veritabanı fonksiyonu yazılmalı — kullanıcının kendi maçlarını sunucuda süzsün. Keşif zaten `get_nearby_matches` ile yapılıyor. Sonra `fbGetMatches` tamamen kaldırılabilir. Açılışta inen veri **17,3 MB → ~50 KB.**

**Efor:** ~1,5 gün

**Doğrulama:** Açılışta ağ sekmesinde inen boyut ölçülür. "Maçlarım" ekranında hiçbir maçın kaybolmadığı, çok maçlı bir test hesabıyla doğrulanır.

---

### [P0] M-7 · Filtresiz canlı abonelik — her maç değişikliği herkese tam satır gönderiyor

**Kanıt:** `store.ts:562-564`
```ts
.channel('matches-list-sync')
.on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, ...)   // FİLTRE YOK
```
Canlıda doğrulandı: `matches` tablosu `supabase_realtime` yayınında (toplam 20 tablo).

**Mevcut durum:** Uygulaması açık **her kullanıcı**, sistemdeki **her maçın** her değişikliğini **tam satır olarak (ort. 3.457 bayt)** alıyor. Diğer 12 abonelik doğru filtrelenmiş; **sorunlu olan tek abonelik bu ve herkeste açık.**

Matematik (günde 100 maç, 500 eşzamanlı kullanıcı):

| Ölçüm | Hesap | Sonuç |
|---|---|---|
| Tek slot satın alma | 1 UPDATE × 501 abone × 3,5 KB | **1,73 MB** |
| Bir maçın 14 slotu dolarsa | ×14 | **24 MB** |
| Pik saatte sürekli | — | ~37 mesaj/sn |
| **Cron patlaması** (`send_match_reminders`, 15 dk'da bir 100 maçı işaretler) | 100 UPDATE × 500 abone | **50.000 mesaj, saniyeler içinde** |
| Aylık toplam | — | **~6.000.000 mesaj** |
| Ücretsiz plan kotası | — | **2.000.000 mesaj/ay** |

**Risk:** Aylık kota **3 katıyla** aşılır. Cron patlamaları saniyelik tavanı **500 katıyla** aşar — o anda sistem kimseye canlı güncelleme gönderemez, lobide slot dolduğu görünmez, kullanıcılar dolu slota basıp "SLOT_TAKEN" hatası alır. Ayrıca her mesaj için her abone adına RLS kuralı yeniden değerlendiriliyor (`matches_select_public` içinde `get_config_bool()` çağrısı var) — veritabanına da ek yük.

**Çözüm:** Bu abonelik ya tamamen kaldırılmalı (M-6'daki `get_my_matches` yerine geçer) ya da `id=in.(kendi maçlarım)` ile filtrelenmeli. Ayrıca `matches` tablosundaki `slots` JSON'unun tam yeniden yazılması yerine yalnız değişen alanın güncellenmesi, mesaj boyutunu da düşürür.

**Efor:** ~1 gün (M-6 ile birlikte yapılmalı, aynı paket)

**Doğrulama:** İki cihazla test: A cihazı bir maça slot alır, B cihazı **ilgisiz** bir maçın lobisinde. B'ye mesaj gitmemeli.

---

### [P0] M-8 · Migration yeniden kurma bombası — bölge göçünü doğrudan tehdit ediyor

**Kanıt:** `supabase/migrations/20260826000001_tek_lobi_p1_guvenlik_yapi.sql:245`
```sql
THEN (v_date::date + (v_time_norm||':00')::time)::timestamptz ELSE NULL END;
```

**⚠️ Düzeltme (keşif ekibinin iddiası abartılıydı):** Ekip "canlıda her maç 3 saat ileride" dedi. **Bu YANLIŞ. Canlıyı kendim ölçtüm: `player_create_match` ve `create_match_atomic` fonksiyonlarının ikisi de doğru deseni (`AT TIME ZONE 'Europe/Istanbul'`) kullanıyor, riskli desen ikisinde de yok. 20 maçın 20'sinde saat doğru.** Sorun **yalnız repodaki yeniden kurma yolunda.**

**Mevcut durum:** Canlı veritabanı doğru. Repodaki migration dosyalarının bu fonksiyonu tanımlayan **sonuncusu** yanlış. Yani biri veritabanını sıfırdan kurarsa, dosyalar sırayla çalışır ve **en son yanlış tanım geçerli olur.**

**Risk:** Sıfırdan kurma üç durumda gerekir: (1) yeni bölge/proje açmak, (2) yedekten dönmek, (3) staging'i canlıya benzetmek. Üçü de olağan işler. Olduğunda **sistem hatasız açılır ama tüm maçlar 3 saat kayar.** Hiçbir uyarı çıkmaz — çünkü teknik olarak hata değil, sadece yanlış sonuç.

**Bunu ayrıca vurguluyorum çünkü S3 (bölge taşıma) kararınızı onayladınız.** Bu bomba etkisiz hale getirilmeden bölge göçü yapılmamalı.

**Çözüm:** Canlıdaki doğru fonksiyon tanımlarını repoya **yeni bir migration dosyası olarak** yazan bir "hizalama" migration'ı üretilmeli (eski dosyalara dokunulmadan — CLAUDE.md kuralı). Ayrıca kalıcı kontrol: repo migration'larında riskli zaman desenini arayan bir tarayıcı.

**Efor:** ~1 gün

**Doğrulama:** Boş bir veritabanına tüm migration'lar çalıştırılır; oluşan `player_create_match` tanımı canlıdakiyle karşılaştırılır — birebir aynı olmalı.

---

### [P0] M-9 · Veritabanı yanlış kıtada — her isteğe 160–220 ms ekliyor

**Kanıt (canlı):** Proje bölgesi `ap-southeast-1` (Singapur). `oyna-staging` projeniz ise `eu-central-1` (Frankfurt).

Ölçülen istek sayıları:
- Uygulama açılışı: **15 HTTP isteği** (3 bölge seçiliyse 23)
- Maç lobisi açılışı: **10–14 istek**, bunların ~4'ü birbirini beklemek zorunda
- Ödeme ekranı: **6–7 istek**

**Mevcut durum:** Türkiye'den Singapur'a gidiş-dönüş ~180 ms. Lobi açılışındaki 4 sıralı istek = **~720 ms, sadece ışığın kabloda gidip gelmesi.**

**Risk:** Bu, uygulamayı "ağır" hissettiren şeyin **birinci** sebebi. Yazacağımız hiçbir kod optimizasyonu bu kadar kazandırmaz. Ayrıca ödeme akışında 3 saniyelik zaman aşımına (`store.ts:502`) yaklaşma riskini artırıyor.

**Çözüm:** Canlı proje `eu-central-1`'e taşınmalı. Bu bir veri göçüdür — planlı kesinti gerektirir ve **kullanıcı sayısı azken yapılması çok daha ucuzdur.** Şu an 33 profil var; şimdi yapılmalı, sonra değil.

**Efor:** ~1 gün planlama + kesinti penceresi (M-8 çözüldükten SONRA)

**Doğrulama:** Taşıma sonrası aynı isteğin süresi ölçülür; ~180 ms'den ~40 ms'ye düşmeli.

---

## 🟡 P1 — LANSMANDAN ÖNCE ELE ALINMALI

---

### [P1] M-10 · `pitch_slot_holds` tablosu var ama hiç kullanılmıyor

**Kanıt (canlı):** Tabloya yazan fonksiyon sayısı: **0**. Temizleyen cron: **0**.

**Mevcut durum:** "Slot geçici olarak tutuldu" mekanizması için tablo kurulmuş, hiç bağlanmamış. Ölü yapı.

**Risk:** Doğrudan zarar vermiyor ama iki tehlike taşıyor: (a) ileride biri "hold sistemi var" sanıp üzerine kod yazar, (b) yeni gelen (ya da bir sonraki Claude oturumu) bunu çalışan bir kapı sanır. CTO turundaki "sessizce yanlış davranan kural" ailesinden.

**Çözüm:** Ya bağlanmalı ya da kaldırılmalı. Önerim: **kaldırılmalı** — ödeme akışı zaten `FOR UPDATE` kilidiyle korunuyor, hold'a ihtiyaç yok.

**Efor:** ~2 saat

**Doğrulama:** Tablo kaldırıldıktan sonra `npm run lint` ve testler temiz kalmalı.

---

### [P1] M-11 · Coğrafi indeks var ama sorgular onu kullanamıyor

**Kanıt (canlı EXPLAIN):**
```
Seq Scan on pitches pt
  Filter: (sec_to_gc(cube_distance(...)) <= '25000'::double precision)
```
`pitches_geo_idx` indeksi taranmıyor. İndeks kullanım sayacı: `pitches_geo_idx` = 164, buna karşılık `pitches_pkey` = 38.239.

**Mevcut durum:** `get_nearby_pitches` ve `get_nearby_matches` mesafeyi `earth_distance(...) <= yarıçap` şeklinde yazıyor. Bu yazım indeksle uyumlu değil; indeks-uyumlu form `ll_to_earth(...) <@ earth_box(...)`. `get_nearby_matches` içinde mesafe **4 kez** hesaplanıyor (SELECT'te 2, WHERE'de 1, ORDER BY'da 1).

**Risk:** Bugün 4 saha var, sorgu 1,9 ms. 5.000 sahada tahminen **60–120 ms/çağrı** ve maliyet **yarıçaptan bağımsız** — 5 km aramak 100 km aramakla aynı maliyette. Ana sayfa açılışında bölge başına çağrılıyor.

**Çözüm:** `earth_box` ön filtresi + `earth_distance` kesin filtresi kalıbına geçilmeli. Mesafe bir kez hesaplanıp yeniden kullanılmalı.

**Efor:** ~0,5 gün

**Doğrulama:** `EXPLAIN` çıktısında `Index Scan using pitches_geo_idx` görülmeli.

---

### [P1] M-12 · Ana sayfadaki "bugün 6 maç" yazısı için 345 KB indiriliyor

**Kanıt:** `dashboardCountsService.ts:9-11` yorumu *"Aşağıdaki üç RPC yalnız kimlik döndürür… ağır alanları taşımaz"* diyor. Ama `get_nearby_matches`'in dönüş listesi (`20260828000009_yakin_maclar_sure_dondurur.sql:35-50`) `slots`, `awaySlots`, `chatMessages`, `reservePlayers`, `badges`, `missingPositions` JSON'larının **hepsini** içeriyor.

**Mevcut durum:** Sayaç için `LIMIT 100` ile tam maç satırları indiriliyor, telefonda `.length` alınıyor. 3 bölge seçiliyse **~1 MB**, tek bir rakam yazmak için.

**Risk:** Kod yorumunun **kendisi yanlış** — yani bu, yanlış bir belgeye güvenilen bir yer. Ölçek büyüdükçe ana sayfa açılışı ağırlaşır.

**Çözüm:** Sadece `count(*)` döndüren ayrı bir fonksiyon yazılmalı.

**Efor:** ~0,5 gün

**Doğrulama:** Ana sayfa açılışında inen veri 1 MB'dan ~1 KB'ye düşmeli.

---

### [P1] M-13 · Lobide her slot satışı, herkeste 4 sorgu tetikliyor (N+1)

**Kanıt:** `MatchJoin.tsx:453-464` — dolu slot sayısı değişince `getMatchLobbyParticipants` tetikleniyor. `matchService.ts:165, 178×2, 202` — bu fonksiyon tek çağrıda **4 sorgu** atıyor.

**Mevcut durum:** Bir kişi slot alınca `matches` güncelleniyor → canlı abonelik lobideki **herkese** gidiyor → **herkes 4 sorgu atıyor.**

**Risk:** 14 kişilik bir lobide 14 satın alma: **14 × 14 × 4 = 784 sorgu.** Cuma akşamı 30 aktif lobi varsa ~20 dakikaya sıkışmış **23.520 sorgu** — sadece bu kalıptan ~20 sorgu/sn.

**Çözüm:** Dört sorgu tek fonksiyona indirilmeli; ayrıca tetikleyici geciktirilmeli (debounce) ki 14 ardışık satış 14 kez değil 1–2 kez tetiklesin.

**Efor:** ~1 gün

**Doğrulama:** Lobide iki cihazla ardışık satın alma yapılır; ağ sekmesindeki istek sayısı sayılır.

---

### [P1] M-14 · Maç lobisinde her işlem sonrası tam yeniden çekme — canlı abonelik zaten getirmişken

**Kanıt:** `MatchJoin.tsx` içinde **13 ayrı noktada** `await getMatchDetails(match.id)`: satır 825, 857, 875, 893, 924, 935, 948, 972, 989, 1009, 1038, 1071, 2643.

**Mevcut durum:** Aynı maç satırı hem canlı abonelikten (satır 360) hem de elle yeniden çekmeyle geliyor. `getMatchDetails` ayrıca `court_id` doluysa ikinci bir sorgu daha atıyor (`matchService.ts:82`).

**Risk:** Her işlemde çift veri trafiği ve iki kaynağın farklı zamanda gelmesi durumunda ekranın "zıplaması".

**Çözüm:** Canlı abonelik tek gerçek kaynak olmalı; elle yeniden çekmeler kaldırılmalı.

**Efor:** ~1 gün

**Doğrulama:** Lobide slot alındığında tek bir veri güncellemesi görülmeli.

---

### [P1] M-15 · `auto_process_matches` başarısız maçı sonsuza dek yeniden deniyor (zehirli hap)

**Kanıt:** `20260903000000_kapora_ve_kadro_karari_yeniden_kuruldu.sql:647-660`
```sql
FOR v_match IN SELECT id FROM public.matches
  WHERE status='ACTIVE' AND starts_at <= now() + make_interval(mins => v_karar_dk::int)
  -- ALT SINIR YOK
LOOP
  BEGIN PERFORM public.process_match_at_deadline(v_match.id);
  EXCEPTION WHEN OTHERS THEN RAISE WARNING ...;  END;   -- hata yutuluyor
END LOOP;
```

**Mevcut durum:** İki sorun birleşiyor: (a) sorguda **alt zaman sınırı yok** — geçmişteki tüm `ACTIVE` maçlar da her taramaya giriyor, (b) hata yakalanıp yutuluyor, maç `ACTIVE` kalıyor.

**Risk:** Bir maç herhangi bir sebeple işlenemezse **her 10 dakikada, sonsuza dek** yeniden denenir ve taramaya kalıcı yük ekler. Yılda %1 hata oranıyla 365 "zehirli" maç birikir → saatte ~2.190 gereksiz ağır işlem. Ayrıca **hata kimseye görünmez** — CTO turundaki sessizlik ailesinden.

Bugün canlıda geçmiş `ACTIVE` maç yok, yani henüz tetiklenmemiş.

**Çözüm:** Sorguya alt sınır, maça deneme sayacı, N denemeden sonra `FAILED` durumuna alma ve **admin panelinde görünür uyarı** eklenmeli. `SKIP LOCKED` de eklenmeli (M-1 ile aynı paket).

**Efor:** ~0,5 gün

**Doğrulama:** Kasten hata verdirilen bir test maçı 3 denemeden sonra durmalı ve panelde kırmızı görünmeli.

---

### [P1] M-16 · Hatırlatma bildirimleri tek tek yazılıyor ve canlı patlama üretiyor

**Kanıt:** `20260707000002000_faz7_backend.sql:131-154`
```sql
FOR m IN SELECT ... FROM public.matches WHERE ... LOOP
  FOREACH v_uid IN ARRAY public._match_participant_ids(m.id) LOOP
    INSERT INTO public.notifications (...) VALUES (...);   -- tek tek
```

**Mevcut durum:** Maç başına katılımcı başına **ayrı** INSERT. 100 maç × 14 katılımcı = **1.400 tekil yazma**, 15 dakikada bir tarama.

Daha kötüsü: aynı fonksiyon `matches` tablosunu da güncelliyor (hatırlatma bayrağı) → **M-7'deki filtresiz abonelikten 100 × 500 = 50.000 canlı mesaj**, saniyeler içinde.

**Risk:** Tek bir cron çalıştırması ücretsiz planın saniyelik canlı mesaj tavanını 500 katıyla aşıyor. O anda sistemdeki tüm canlı güncellemeler kuyruğa giriyor.

**Çözüm:** Tekil INSERT'ler tek bir `INSERT … SELECT` ifadesine çevrilmeli. Hatırlatma bayrağı `matches` yerine ayrı bir tabloda tutulmalı ki canlı yayına düşmesin.

**Efor:** ~0,5 gün

**Doğrulama:** Cron çalıştırılır; `matches` UPDATE sayısı ölçülür.

---

### [P1] M-17 · İlk yükte gereksiz kod iniyor — grafik kütüphanesi her oyuncuya gidiyor

**Kanıt (gerçek `vite build` çıktısı):**

| Dosya | Ham | Gzip |
|---|---|---|
| `ui-vendor` | **561 KB** | **163 KB** |
| `ErrorBoundary` (react + react-dom burada) | 246 KB | 77 KB |
| `supabase-vendor` | 207 KB | 53 KB |
| `main` | 157 KB | 59 KB |
| CSS | 295 KB | 35 KB |
| **Toplam ilk yük** | **1.474 KB** | **393 KB** |

İki ayrı kusur:
1. `vite.config.ts:72` → `'ui-vendor': ['framer-motion','lucide-react','recharts']`. `recharts` (grafik kütüphanesi) **yalnız admin panelinde** kullanılıyor (`admin-panel/views/pages/DashboardPage.tsx:8`) ama `framer-motion` `App.tsx:2`'de statik olarak çağrıldığı için aynı pakete girip **her oyuncuya iniyor.**
2. Derleme çıktısı: `Generated an empty chunk: "react-vendor"`. `vite.config.ts:70`'teki ayrım **çalışmıyor** — react-dom `ErrorBoundary` paketine karışmış. Yani "kütüphaneler ayrı paket olsun ki tarayıcı önbelleğinde kalsın" stratejisi işlemiyor; her sürümde 246 KB yeniden iniyor.

**Risk:** Singapur sunucusu + 4G ile ilk açılış **3,5–5 saniye.** Kullanıcı ilk izlenimi burada oluşuyor.

**Çözüm:** `recharts` `ui-vendor`'dan çıkarılmalı (tek satır, tahmini **70–100 KB gzip** kazanç), `react-vendor` ayrımı düzeltilmeli. Ayrıca bundle'da **iki ayrı harita motoru** taşınıyor (`maplibre-gl` 803 KB ve `leaflet`) — biri seçilmeli. `react-map-gl` kurulu ama hiç kullanılmıyor, kaldırılmalı.

**Efor:** ~0,5 gün

**Doğrulama:** `npm run build` sonrası `dist/index.html`'in çektiği dosya boyutları karşılaştırılır.

---

### [P1] M-18 · Sistemde hiçbir önbellek katmanı yok

**Kanıt (canlı + repo):**

| Katman | Durum |
|---|---|
| İstemci önbelleği (React Query vb.) | **Yok** — `hooks/useDashboardCounts.ts:16-17` açıkça yazıyor: *"React Query KULLANILMIYOR — projede yok."* |
| Materialized view (hazır hesaplanmış tablo) | **0 adet** (canlı `pg_matviews` boş) |
| Önbellek tablosu | Yok |
| HTTP önbelleği | `index.html` için `no-cache` (`vercel.json:29-33`) |

Aynı veri kaç kez iniyor:

| Veri | Tekrar |
|---|---|
| `matches` tablosu | Açılışta 1 + Top Oyna'da bölge başına 1 + ana sayfa sayacında bölge başına 1 → **3 bölgede 7 kez** |
| `region_coverage` (56 KB harita verisi) | Sahalar ekranı her açıldığında |
| `pitch_tariffs` (neredeyse hiç değişmez) | Her saha listesinde |
| Kart komisyon oranı | Cüzdan özeti her değiştiğinde |

**Risk:** Hem kotayı hem de kullanıcının veri paketini gereksiz tüketiyor; ekranlar her seferinde boş açılıp doluyor.

**Çözüm:** Öncelik sırasıyla önbelleğe alınmalı: `pitch_tariffs` (1 saat), `region_coverage` (1 gün, telefonda saklanır), saha vitrini (5 dakika), `texts`/`app_config` (dakikalar). Sunucu tarafında `get_showcase_availability` için hazır hesaplanmış tablo.

**Efor:** ~2 gün

**Doğrulama:** Aynı ekran iki kez açılır; ikincisinde ağ isteği görülmemeli.

---

### [P1] M-19 · Fotoğraf boru hattında kaçış yolu var — canlıda 6,8 MB'lık dosya bulundu

**Kanıt (canlı depolama):**
```
pitches/1782677591544_yxg3zgekjcq.png  →  7.110.174 bayt (6,8 MB)  image/png
```
16 dosyanın ortalaması **616 KB**.

Sıkıştırma kodu doğru yazılmış (`utils/imageCompression.ts`: 1920 px'e küçültme, JPEG kalite 0.82, 10 MB üst sınır) **ama satır 71-79'da kaçış yolu var:** tarayıcı görseli çözemezse dosya **olduğu gibi** yükleniyor. PNG'nin hayatta kalmış olması bu kaçış yolunun **gerçekten kullanıldığını** kanıtlıyor (sıkıştırma çalışsa JPEG'e çevirirdi).

**İkinci ve daha ciddi katman:** `utils/imageTransform.ts` doğru kurgulanmış — küçük boy görsel için `render/image/public/...&width=640` adresini kullanıyor. **Ancak Supabase'in bu görsel dönüştürme özelliği Pro plan gerektiriyor; projeniz ücretsiz planda.** Ücretsiz planda bu adres hata dönerse `SafeImage`'ın hata yakalayıcısı (`PitchShowcaseCard.tsx:36`) devreye girer ve **tüm saha fotoğrafları yeşil yer tutucuya düşer — hiçbir fotoğraf görünmez.**

**⚠️ Kodda doğrulanamadı — varsayım:** Plan bilgisini (`free`) canlıdan doğruladım, ama bu adresin ücretsiz planda gerçekten hata döndüğünü doğrulayamadım (sandbox ağ kısıtı). **Bu, üretimde tarayıcıyla bakılacak ilk maddedir.**

**Risk:** En kötü senaryoda 200 sahalık listede **123 MB** görsel iniyor; ya da hiç fotoğraf görünmüyor. İkisi de ürünü öldürür — saha fotoğrafı OYNA'nın vitrinidir.

Ayrıca 61 `<img>` etiketinin yalnız **5'inde** "görünene kadar bekle" (`loading="lazy"`) var; kullanıcı avatarları (`components/common/UserAvatar.tsx:31-37`) ne küçültülüyor ne bekletiliyor — lobide 22 avatar aynı anda iniyor.

**Çözüm:** (a) Sıkıştırma kaçış yolu kapatılmalı — çözülemeyen dosya reddedilmeli. (b) Görsel dönüştürmenin ücretsiz planda çalışıp çalışmadığı **tarayıcıyla test edilmeli**; çalışmıyorsa ya plan yükseltilmeli ya yükleme sırasında küçük boy da üretilip saklanmalı. (c) Avatarlara küçültme + bekletme eklenmeli.

**Efor:** ~1 gün (test sonucuna göre değişir)

**Doğrulama:** Sahalar ekranı gerçek telefonda açılır; fotoğraflar görünüyor mu ve ne kadar veri indi ölçülür.

---

### [P1] M-20 · Uzun listeler için yazılmış çözüm var ama hiç kullanılmıyor

**Kanıt:** `components/common/VirtualList.tsx` dosyası mevcut; kod tabanında **0 kez** çağrılıyor. `MatchDiscovery.tsx:556, 571, 603` düz `.map()` ile tüm kartları basıyor. Üstelik her kart hareket animasyonlu (`PitchShowcaseCard.tsx:50`).

**Mevcut durum:** 500 maç varsa 500 kart aynı anda ekrana basılıyor.

**Risk:** Orta seviye Android'de kaydırma takılır ve pil tüketir. Ayrıca `MatchDiscovery.tsx:130` — yarıçap kaydırıcısı her oynatıldığında sorgu tekrar atılıyor, gecikme (debounce) yok.

**Çözüm:** Zaten yazılmış olan `VirtualList` bağlanmalı; kaydırıcıya gecikme eklenmeli.

**Efor:** ~0,5 gün

**Doğrulama:** 500 maçlık test verisiyle kaydırma akıcılığı ölçülür.

---

### [P1] M-21 · Kopyalanmış alanların hiçbirinde senkron mekanizması yok

**Kanıt (canlı):** `teams` tablosunda **hiç trigger yok** (0 adet). `matches` tablosunda 12 trigger var ama hiçbiri `location`/`price` alanlarını senkronlamıyor.

**Mevcut durum:** `matches.location`, `matches.price`, `teams.wins`, `profiles.match_count` gibi alanlar başka bir yerdeki gerçeğin kopyası olarak tutuluyor ama kaynak değişince güncellenmiyorlar.

**Risk:** Saha adı veya fiyatı değişince eski maçlarda **eski değer** görünür. Kullanıcı ekranda bir fiyat görüp ödemede başkasını görebilir. Takım galibiyet sayısı yanlış kalabilir. Bunlar sessiz hatalardır — kimse fark etmez, sadece veri yavaşça yalan söylemeye başlar.

**Çözüm:** Her alan için karar verilmeli: ya trigger ile senkronlansın ya kaldırılıp kaynaktan okunsun. **Fiyat alanı öncelikli** (para akışına dokunuyor).

**Efor:** ~1 gün

**Doğrulama:** Sahanın fiyatı değiştirilir; o sahadaki maçların gösterdiği fiyat kontrol edilir.

---

### [P1] M-22 · Tip kontrolü gevşek ve test/veritabanı klasörleri kontrol dışı

**Kanıt:** `tsconfig.json` — `strict` bayrağı **yok**; `exclude` listesinde `tests`, `scripts`, `notifications`, `supabase`, `src` var.

**Mevcut durum:** `npm run lint` çalışıyor ve temiz geçiyor, ama en sıkı kontroller kapalı ve testlerin/veritabanı kodunun kendisi hiç kontrol edilmiyor.

**Risk:** "Lint temiz" ifadesi olduğundan fazla güven veriyor. Bu, EK2'deki erken uyarı sisteminin temelini zayıflatıyor — çünkü kontrolün kendisi kör noktalar taşıyor.

**Çözüm:** `strict` kademeli açılmalı (hepsi birden değil — çok hata çıkar). `tests` ve `notifications` kapsama alınmalı. `supabase` (Deno kodu) ayrı bir yapılandırmayla kontrol edilmeli.

**Efor:** ~1–2 gün (çıkan hata sayısına bağlı)

**Doğrulama:** `npm run lint` yine temiz geçmeli, ama artık daha fazla dosyayı kapsayarak.

---

## 🟢 P2 — LANSMAN SONRASI

### [P2] M-23 · Abonelik üretimi gün gün ilerleyen döngüyle yapılıyor

**Kanıt:** `20260706000003_faz43_subscription_auto_renew_horizon.sql:35-66` — 12 haftalık ufuk için abonelik başına **84 tur** dönüyor, 12 kayıt üretiyor.

**Risk:** 500 abonmanda günde 42.000 gereksiz tur. Hafifletici: `materialized_until` sayesinde ikinci çalıştırmadan sonra sadece 7 gün ilerliyor, yani gerçek yük çok daha düşük.

**Çözüm:** `generate_series(..., '7 days')` ile 12 tura inebilir. **Efor:** ~2 saat. **Doğrulama:** Aynı sayıda kayıt üretilmeli.

---

### [P2] M-24 · Admin gösterge paneli 17 ayrı tam tablo sayımı yapıyor

**Kanıt:** `20260901000001_ip22c_tesis_dogrulama_alani_kaldirildi.sql:75-105` — `admin_dashboard_stats` içinde 17 ayrı `COUNT(*)`/`SUM()`.

**Risk:** Yalnız siz ve admin çağırıyorsunuz, ama 10 bin kullanıcıda her açılışta 17 tam tarama. **Çözüm:** Hazır hesaplanmış tabloya taşınmalı. **Efor:** ~0,5 gün.

---

## Denetim ekiplerinin abarttığı iddialar — düzelttim

Bu bölümü ayrıca yazıyorum, çünkü size yanlış bilgi gitmesin:

| Ekip iddiası | Gerçek (kendi ölçümüm) |
|---|---|
| "Canlıda `player_create_match` saatleri 3 saat kaydırıyor" | **Yanlış.** Canlı doğru desen kullanıyor, 20/20 maçta sapma yok. Sorun yalnız repodaki yeniden kurma yolunda (M-8). |
| "`pitch_bookings.payment_status` alanında CHECK kısıtı yok" | **Yanlış.** Canlıda `pitch_bookings_payment_status_check` var ve 5 değeri kısıtlıyor. `status` alanının da CHECK'i var. CHECK'i eksik olan **yalnız `matches.status`** (M-5). |
| "Altı fonksiyonda hayalet durum sözlüğü var" | **Abartılı.** Canlıda `GATHERING`/`PLAYING` geçen fonksiyon sayısı **3** (hepsi hesap silme ailesinden). Sorun gerçek ama kapsamı daha dar. |
| "Arkadaş listesinde N+1 var" | **Yanlış.** `socialService.ts:114-118` tek fonksiyon çağrısı yapıyor, temiz. |

---

# ⚠️ ÇAKIŞMALAR

---

## ⚠️ ÇAKIŞMA 1 — Ölçek düzeltmesi vs. kodda yazılı bilinçli karar

**Taraflar:** Mimar (M-6) ↔ mevcut kod kararı (`supabaseMutations.ts:355-361`)

**Gerilim:** Kodda açık bir yorum var: *"matches'e GLOBAL limit KONULMAZ… ölçek < doğruluk."* O gün bu karar **doğruydu** — limit koymak kullanıcının kendi maçını gizleyebilirdi ve doğruluk her zaman önce gelir. Ben şimdi "limit koyalım" demiyorum; **kararın dayandığı kısıtı ortadan kaldıralım** diyorum.

**Bütünleşik çözüm:** `get_my_matches()` fonksiyonu yazılır. O andan itibaren "Maçlarım" global listeye bağımlı olmaktan çıkar; hem doğruluk korunur hem ölçek çözülür. Yani çakışma değil, **sıralama sorunu**: önce scoped fonksiyon, sonra limit/kaldırma. Ters sırada yapılırsa gerçek bir regresyon olur.

**CEO kararı gerekiyor mu:** Hayır. Teknik sıralama kararı, ben yürütürüm.

---

## ⚠️ ÇAKIŞMA 2 — "Demo veriler kalsın" (K-8) vs. ölçülen kadro sapması

**Taraflar:** Kurucu kararı K-8 (Çakışma 2: *"şimdilik demo veriler kalsın, uygulamaya zarar vermeyecek şekilde olduklarından emin olalım"*) ↔ Mimar (M-4, M-5)

**Gerilim:** Demo verilerin zararsız olmasını istediniz — haklısınız, kurulum aşamasında boş ekran görmek kötü. Ama ölçtüğümde şunu buldum: **kadro sapması olan 12 maçın 10'u demo maç**, ve sözlük dışı `CONFIRMED` durumunu taşıyan tek satır da **demo maç.**

Yani demo veriler bugün zararsız değil: **denetim araçlarını kirletiyorlar.** M-4'ün kalıcı kontrolünü (iki kaynak uyuşuyor mu) kurduğumda, demo veriler yüzünden **her gün kırmızı yanacak** ve siz gerçek bir sapma olduğunda onu göremeyeceksiniz. Bu, EK2'de kurduğumuz erken uyarı sisteminin en tehlikeli başarısızlık biçimi: **sürekli yanan alarm, alarm olmaktan çıkar.**

**Bütünleşik çözüm:** Demo veriler kalır (kararınız korunur), **ama iki şart eklenir:**
1. Tüm denetim sorguları `"isDemo" IS NOT TRUE` filtresiyle çalışır — demo veriler alarmı kirletemez.
2. Demo veriler de sözlük ve tutarlılık kurallarına **uydurulur** (`CONFIRMED` → `ACTIVE`, kadro sapmaları düzeltilir). Böylece demo veriler gerçek sistemin nasıl davrandığını doğru temsil eder — bugün etmiyor.

Bu düzeltme **canlı veri değişikliğidir**, ayrı onayınızı isteyeceğim.

**CEO kararı gerekiyor mu:** **Evet** — demo satırlarının düzeltilmesi için onay (Soru S-8'de).

---

## ⚠️ ÇAKIŞMA 3 — "Her yeri tek tek açacağız" (K-1.4) vs. ölçek P0'larının zamanlaması

**Taraflar:** Kurucu kararı K-1.4 (yavaş, ilçe ilçe büyüme) ↔ Mimar (M-6, M-7, M-9)

**Gerilim:** K-1.4 bize gerçekten zaman kazandırıyor — 10 bin kullanıcıya bir gecede çıkmıyoruz. Bu, ölçek işlerinin çoğunu ertelemek için **geçerli** bir gerekçe.

**Ama üç tanesi ertelenemez ve sebepleri farklı:**
- **M-9 (bölge taşıma):** Kullanıcı sayısı arttıkça göç **pahalılaşır.** Şu an 33 profil var. Bu iş **en ucuz bugün.** Ertelemek = maliyeti artırmak.
- **M-6 + M-7 (limitsiz indirme + filtresiz canlı yayın):** Bunlar toplam kullanıcı sayısına değil, **aynı anda uygulamayı açan kişi sayısına** bağlı. Tek bir ilçede Cuma akşamı 300 kişi yeterli. K-1.4 bu riski azaltmıyor.

**Bütünleşik çözüm:** Ölçek işlerini ikiye ayırıyorum. **Lansman öncesi:** M-6, M-7, M-9 (+ M-8, çünkü M-9'un ön koşulu). **Lansman sonrası:** M-11, M-12, M-13, M-17, M-18, M-20 — bunlar gerçekten K-1.4 sayesinde bekleyebilir.

**CEO kararı gerekiyor mu:** **Evet** — M-9 (bölge taşıma) planlı kesinti gerektiriyor (Soru S-1).

---

# AŞAMA 2b — CEO'YA SORULAR

> K-9.1 direktifiniz gereği bu sorular tek tek özelliklere değil, **sistemin bütününü belirleyen mimari kararlara** odaklanıyor. Öncelik sırasına dizdim.

---

### S-1 · Bölge taşıma: kesinti penceresi verebilir miyiz?

**Neden soruyorum:** Veritabanı Singapur'da; Frankfurt'a taşımak her isteği ~150 ms hızlandırır ve bu, yazacağımız hiçbir optimizasyondan büyük. Ama taşıma **planlı kesinti** gerektirir (tahminen 30–90 dakika) ve şu an 33 kullanıcıyla **en ucuz an.**

**Cevaba göre ne değişir:**
- **"Evet, şimdi yapalım"** → M-8 (migration bombası) önce çözülür, sonra göç planlanır. Tüm hız işleri bu temele oturur.
- **"Hayır, sonra"** → M-9'u P1'e düşürürüm, ama şunu bilerek: her yeni kullanıcı göçü zorlaştırır ve **kullanıcı varken kesinti çok daha pahalıdır.**

---

### S-2 · Plan yükseltmesi: ne zaman Pro'ya geçiyoruz?

**Neden soruyorum:** Ücretsiz planın üç sınırı bizi doğrudan vuruyor: (a) 5 GB aylık veri — tek Cuma akşamı aşılabilir, (b) 200 eşzamanlı canlı bağlantı — 500 kişide 300'ü canlı güncelleme alamaz, (c) görsel dönüştürme yok — saha fotoğrafları hiç görünmeyebilir (M-19).

M-6 ve M-7'yi düzeltmek (a) ve (b)'yi büyük ölçüde çözer. Ama (c) — fotoğraf — **düzeltilemez, ödenmesi gerekir** ya da yükleme anında küçük boy üretip saklamamız gerekir (ek iş).

**Cevaba göre ne değişir:**
- **"Lansmanda Pro'ya geçeriz"** → M-19'da yalnız sıkıştırma kaçış yolunu kapatırım, küçük boy üretimi yazmam.
- **"Ücretsizde kalacağız"** → Yükleme anında üç boy (küçük/orta/büyük) üretip saklayan bir akış yazarım (~1 gün ek iş) ve M-6/M-7 **kesinlikle lansman öncesi** yapılmalı.

---

### S-3 · Kadroda tek doğru kaynak: hangisi?

**Neden soruyorum:** M-4'te ölçtüm — "kim bu maçta" sorusunun iki cevabı var ve 12 maçta birbirini tutmuyor. Devam edemeyiz; birini seçmemiz gerekiyor. Bu, **K-3.3 kararınızın (iptalde herkese eksiksiz iade) hangi listeye göre çalışacağını** belirler.

**Önerim:** `match_participants` tablosu tek doğru kaynak olsun, JSON ondan türetilsin. Sebep: para ve bildirim zaten tabloyu kullanıyor, ve tablo veritabanı kurallarıyla (ilişki bütünlüğü) korunabilir; JSON metni korunamaz.

**Cevaba göre ne değişir:**
- **Onaylarsanız** → üç eksik fonksiyon tabloya yazacak şekilde düzeltilir; JSON okuma kolaylığı için kalır.
- **"JSON kalsın"** derseniz → o zaman bildirim ve para fonksiyonlarının hepsi JSON okuyacak şekilde değiştirilmeli; bu **daha büyük** ve daha kırılgan bir iş olur, ama yapılabilir.

---

### S-4 · Ödeme yarıda kalınca ne olsun? (Süpürücü politikası)

**Neden soruyorum:** M-2'de süpürücünün ölü olduğunu buldum. Yazacağım ama **davranışını siz belirlemelisiniz** — bu para politikasıdır, teknik detay değil.

Somut durum: Kullanıcı kartını girdi, banka onayı bekleniyor, telefonu kapandı. 15 dakika sonra sistem ne yapsın?

**Seçenekler:**
- **(a)** Bankaya sor; onaylandıysa slotu ver, onaylanmadıysa iptal et. *(En doğru, en çok iş)*
- **(b)** Doğrudan iptal et, blokeyi çöz, slotu serbest bırak. *(Basit; ama ödeme aslında geçtiyse kullanıcı parasını 1–3 gün sonra geri alır ve bu süre boyunca kızgın olur)*
- **(c)** Askıda bırak, admin paneline düşür, siz elle karar verin. *(En kontrollü, ölçeklenmez)*

**Önerim: (a)**, geçici olarak (c) ile birlikte — yani otomatik çözer, çözemediğini panele düşürür.

**Cevaba göre ne değişir:** Süpürücünün tasarımı ve efor (0,5 gün ile 2 gün arası) tamamen buna bağlı.

---

### S-5 · Zehirli maç: kaç denemeden sonra durup size sorsun?

**Neden soruyorum:** M-15'te bulduğum kalıpta, işlenemeyen bir maç sonsuza dek yeniden deneniyor ve **kimse haberdar olmuyor.** Bir sınır koymalıyız. Ama sınır koyunca o maç "askıda" kalır ve birinin karar vermesi gerekir — o kişi sizsiniz.

**Önerim:** 3 deneme, sonra maç `NEEDS_REVIEW` durumuna alınsın, admin panelinde kırmızı listede görünsün, size bildirim gitsin.

**Cevaba göre ne değişir:** Deneme sayısı ve size ulaşma biçimi (panel / bildirim / e-posta). Ayrıca panelde "elle çöz" ekranı gerekip gerekmediği.

---

### S-6 · Sistemin "tek doğru zamanı" hangisi olsun?

**Neden soruyorum:** Bir maçın saati bugün **beş ayrı biçimde** duruyor: metin `date` + metin `time`, `starts_at` (mutlak an), rezervasyonun saat aralığı, ve maç süresi. Bugün beşi de uyumlu — bunu tek tek ölçtüm, sıfır sapma var. Ama **bunu koruyan tek bir kural yok**; uyum, fonksiyonların doğru yazılmış olmasından geliyor. Bir fonksiyon yanlış yazılırsa sessizce ayrışır (M-8'in tam olarak bu olması gibi).

**Önerim:** `starts_at` tek doğru kaynak olsun; metin `date`/`time` ondan **veritabanı tarafından otomatik** türetilsin (bugün `trg_matches_sync_time_and_score_status` trigger'ı zaten var, kapsamı genişletilir). Böylece ayrışma **fiziksel olarak imkânsız** hale gelir.

**Cevaba göre ne değişir:** Onaylarsanız bu, saatle ilgili tüm gelecek hataları tek noktada keser — ama `matches` tablosuna dokunan bir değişikliktir, dikkatli test ister (~1 gün).

---

### S-7 · Yurt dışı / farklı saat dilimi hedefimiz var mı?

**Neden soruyorum:** Sistem bugün her yerde `Europe/Istanbul` varsayıyor. Bu **Türkiye içinde tamamen doğru** ve bir sorun değil. Ama K-1.4'te "farklı bir ilin farklı ilçelerinden de başlanabilir" dediniz — bu Türkiye içi olduğu sürece sorun yok.

Sorum ileriye dönük: **Kıbrıs, Almanya'daki Türk toplumu gibi bir hedef var mı?** Varsa, saat dilimini sahaya bağlayan yapı **şimdi** kurulmalı — sonradan kurmak, tüm geçmiş maçların yeniden yorumlanması demektir ve bu çok pahalıdır.

**Cevaba göre ne değişir:**
- **"Sadece Türkiye"** → Hiçbir şey değişmez, `Europe/Istanbul` sabit kalır, iş yükü sıfır.
- **"İleride olabilir"** → Sahaya `timezone` alanı eklerim (kullanılmasa bile), böylece gelecekteki geçiş ucuzlar (~0,5 gün).

---

### S-8 · Demo verileri kurallara uydurabilir miyim? (canlı veri değişikliği — onay gerekiyor)

**Neden soruyorum:** Çakışma 2'de anlattığım gibi, demo veriler bugün denetim araçlarını kirletiyor: sapma gösteren 12 maçın 10'u demo, sözlük dışı `CONFIRMED` durumu da bir demo satırında. Kuracağımız erken uyarı sistemi bu yüzden **her gün boşuna kırmızı yanacak.**

Yapmak istediğim, **canlı veritabanında veri düzeltmesidir** — CLAUDE.md kuralı gereği izniniz olmadan yapmam:
1. Demo maçlardaki kadro sapmalarını gidermek
2. `CONFIRMED` durumundaki demo maçı geçerli sözlüğe çevirmek

**Cevaba göre ne değişir:**
- **Onaylarsanız** → denetim araçları temiz bir zeminde kurulur, alarm yandığında gerçekten bir şey olmuş demektir.
- **Onaylamazsanız** → tüm denetim sorgularına "demo hariç" filtresi koyarım (zaten koyacağım), ama demo veriler gerçek sistemi **yanlış temsil etmeye** devam eder ve demo üzerinden yapacağınız her denemede yanıltıcı sonuç görürsünüz.

---

### S-9 · Kalıcı denetim: ne sıklıkta ve nereye rapor etsin?

**Neden soruyorum:** EK2'de "Sessizlik Denetçisi"ni tasarladık. Bu turda ona eklenecek **beş yeni kontrol** çıktı: (1) kadro iki kaynağı uyuşuyor mu, (2) dışarı giden HTTP çağrıları başarılı mı, (3) askıda ödeme var mı, (4) repo migration'larında riskli zaman deseni var mı, (5) para fonksiyonlarında kilit sırası tutarlı mı.

Ama bir denetim aracının **size ulaşamıyorsa hiçbir değeri yoktur** — ve şu an bildirim kanalımız kapalı (M-3).

**Önerim:** Denetim günde bir kez çalışsın; sonuç admin panelinde kalıcı bir "Sistem Sağlığı" kartında görünsün; kırmızı varsa e-posta gitsin (push'a bağımlı olmasın, çünkü push kırılabiliyor).

**Cevaba göre ne değişir:** Raporun nereye gideceği (panel / e-posta / ikisi) ve sıklığı. Ayrıca panelde ayrı bir ekran mı olsun, ana sayfada rozet mi.

---

### S-10 · Sıralama: hangisi önce — ölçek mi, para zinciri mi?

**Neden soruyorum:** Bu turda çıkan P0'lar iki aileye ayrılıyor ve **ikisi de lansman öncesi** diyorum, ama biri önce başlamak zorunda:

- **Para ailesi:** M-1 (kilitlenme), M-2 (süpürücü), M-4 (kadro), M-5 (durum sözlüğü) — *yanlış giderse para kaybolur*
- **Ölçek ailesi:** M-6, M-7, M-8, M-9 — *yanlış giderse sistem kapanır*

**Önerim: para ailesi önce.** Sebep: A1.1 wedge'iniz "parayı topluyoruz" iddiası üzerine kurulu. Sistemin yavaş olması kullanıcıyı kızdırır; **paranın kaybolması güveni öldürür ve geri gelmez.** Ölçek sorunları ise K-1.4 sayesinde ilk ilçelerde tetiklenmeyebilir.

**Tek istisna:** M-8 (migration bombası) ölçek ailesinde ama **hemen** yapılmalı — çünkü ucuz (1 gün) ve bölge göçünüzün ön koşulu.

**Cevaba göre ne değişir:** Kod yazımına başladığımızda ilk paketin ne olacağı.

---

# AŞAMA 3 — KAPANIŞ

## Mutlaka yapılması gereken 3 şey

### 1. Para zincirinin dört halkasını da kapatın (M-1, M-2, M-4, M-5)

Bu dördü ayrı bulgular gibi görünüyor ama **tek bir zincir:** kilitlenme ödemeyi yarıda keser (M-1) → süpürücü olmadığı için kimse toplamaz (M-2) → kadro iki kaynaklı olduğu için kimin ne ödediği belirsizleşir (M-4) → durum sözlüğü korumasız olduğu için kullanıcı o parayla hesabını silebilir (M-5).

Zincirin **tek bir halkasını** kapatmak yetmez. Dördü birlikte, tek pakette yapılmalı. Bu, A1.1 wedge'inizin altyapısıdır — "parayı biz topluyoruz" iddiasının teknik karşılığı budur.

### 2. Çıkış kapılarını açın ve açık kaldığını ölçün (M-3)

Bugün OYNA dışarıya hiçbir şey gönderemiyor: 18 denemeden 18'i başarısız. Ve **bunu size söyleyen hiçbir şey yok.** Bu, K-8'de üzerinde anlaştığımız "sessizce yanlış davranan kural"ın canlıdaki en pahalı örneği.

Düzeltmesi yarım gün. Ama asıl iş düzeltmek değil, **bir daha sessizce ölmemesini sağlamak.** Her gün "kaç çağrı gitti, kaçı başarılı" sorusunun cevabı panelde görünmeli.

### 3. Migration bombasını etkisiz hale getirin — bölge göçünden ÖNCE (M-8)

Bir gün veritabanını sıfırdan kurmanız gerekecek. O gün sistem hatasız açılacak ve **tüm maçlar 3 saat kayacak.** Hiçbir uyarı çıkmayacak.

Bu, onayladığınız S3 bölge göçünün ön koşuludur. Bir günlük iş, ve ertelenmesinin hiçbir gerekçesi yok.

---

## Hızlı kazanımlar (yarım günün altında, riski düşük)

| İş | Süre | Kazanç |
|---|---|---|
| `recharts`'ı ilk yükten çıkar (`vite.config.ts:72`, tek satır) | 15 dk | İlk açılış ~70–100 KB hafifler |
| `pitch_slot_holds` ölü tablosunu kaldır (M-10) | 2 saat | Bir yanıltıcı yapı eksilir |
| Ana sayfa sayacı için `count(*)` fonksiyonu (M-12) | 4 saat | Ana sayfa 1 MB → 1 KB |
| Coğrafi sorguyu indeksle uyumlu hale getir (M-11) | 4 saat | 5.000 sahada tam tarama biter |
| Fotoğraf sıkıştırma kaçış yolunu kapat (M-19a) | 2 saat | 6,8 MB'lık dosyalar bir daha giremez |
| `VirtualList`'i bağla (zaten yazılmış, M-20) | 4 saat | Uzun listelerde akıcı kaydırma |
| Yarıçap kaydırıcısına gecikme ekle (M-20) | 1 saat | Kaydırırken gereksiz sorgu biter |

---

## En büyük stratejik hata: **"Çalışıyor" ile "doğru çalışıyor"u karıştırmak**

Sayın CEO, bu turda gördüğüm en tehlikeli örüntü şu:

**OYNA'nın hemen hiçbir yerinde hata mesajı yok. Ama sistemin en az yedi yeri sessizce yanlış çalışıyor.**

- Bildirim gönderiliyor sanılıyor — 18/18 başarısız, hata yok.
- Hesap silme kapısı çalışıyor sanılıyor — aradığı kelimeler sistemde hiç yok, hata yok.
- Kadro tek yerde tutuluyor sanılıyor — 12 maçta ayrışmış, hata yok.
- Süpürücü var sanılıyor — hem kapalı hem hiç kurulmamış, hata yok.
- Repo ile canlı aynı sanılıyor — maç oluşturma fonksiyonu 3 saat kaydıracak, hata yok.
- Coğrafi indeks kullanılıyor sanılıyor — hiç kullanılmıyor, hata yok.
- Kod yorumu "ağır alan taşımaz" diyor — 345 KB taşıyor, hata yok.

Bunların hiçbiri kötü mühendislik değil. Hepsi **bir zamanlar doğru olan, sonra çevresi değişen** kararlar. Yazılımda bunun adı vardır ve kaçınılmazdır. Kaçınılmaz olmayan şey, **değiştiğinde kimsenin haberinin olmaması.**

Stratejik hata şu olurdu: bu 24 bulguyu tek tek düzeltip "tamam, sistem sağlam" demek. **Değil.** Çünkü altı ay sonra aynı türden yedi yeni sessiz sapma oluşacak — sistem büyüdükçe bu matematiksel olarak kesin.

**Asıl yapılması gereken, bulguları düzeltmek değil; bulguları bulan mekanizmayı kalıcı hale getirmek.** CTO turunda "Sessizlik Denetçisi" olarak tasarladığımız şey tam olarak budur ve bu turda ona beş yeni kontrol daha ekledim. Kod yazmaya başladığımızda **ilk pakete o denetim de girmeli** — çünkü ondan sonraki her paketin doğru çalıştığını bize söyleyecek olan odur.

Kod yazan bir kurucu olmadığınız için bu daha da kritik: **siz kodu okuyup "burada bir sapma var" diyemezsiniz. O yüzden sistem size kendisi söylemek zorunda.**

---

**Bir sonraki rol:** Kıdemli Yazılım Mühendisi (Principal Engineer)
Geçmek için: *"sıradaki karaktere geçebiliriz"*
