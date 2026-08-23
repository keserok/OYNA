# APPLE 5.6 — DÜZELTME GÖREVİ (ajan talimatı)

> **Bu bir GÖREV TALİMATIDIR.** Yeni bir oturumda bu depoda çalışacak ajan için
> yazıldı. Bulgu ve gerekçeler kardeş dosyada:
> **`docs/master/APPLE_56_COZUM_PLANI.md`** — işe başlamadan ONU DA OKU.
>
> **Dal:** `claude/guideline-5-6-code-conduct-7ny1l1` · **Tarih:** 22 Ağu 2026
> **Üretim Supabase:** `iikvzgyccvgcybzdfwlv` · **Depo:** `/home/user/OYNA`
> Kod, yorumlar ve commit mesajları **Türkçe**.
>
> Buradaki her sayı canlı veritabanına sorgu atılarak **ölçüldü**. Yine de sen
> de doğrula — veri o günden beri değişmiş olabilir.

---

## 0 · İŞ NE

OYNA (halı saha maç organizasyonu + saha kiralama) App Store'dan
**Guideline 5.6 — Developer Code of Conduct** ile reddedildi:

> "the app contains features that appear to have been intentionally hidden
> during the review process."

Reddin bilinen sebebi (incelemeye özel derlenen `VITE_MAGAZA_INCELEME` paketi)
söküldü. Ama canlı sistemde aynı ihlalin örnekleri duruyor. İşin: **onları
kökten kapatmak.**

---

## 1 · ANAYASA — ihlal edilemez

> ### Gönderilen paket = indirilen paket **VE** sunucunun incelemeciye verdiği cevap = gerçek kullanıcıya verdiği cevap.

1. **İncelemeciye özel hiçbir şey olamaz** — kod yolu, derleme bayrağı, sunucu
   anahtarı, sabit OTP, hesap, veri.
2. **Çağırana göre içerik değiştiren sunucu kapısı yasaktır.** Yetkilendirme
   (kendi verisi, admin) meşrudur; *içerik zenginliğini* kimliğe bağlamak değil.
3. **Ekranın vaadi = sistemin davranışı.** "Kartından tahsil edilir" deyip
   tahsil etmemek 5.6 ihlalidir.
4. **Çözülemeyen engel HERKES için kapatılır** ve inceleme notunda yazılır.
5. **Belge ile kod ayrışamaz.** Bulgu 3 tam olarak böyle doğdu.

**Proje prensipleri de bağlayıcı** (`OYNA_PRENSIPLER.md`). Öne çıkanlar:
- **P-0** — her koruma kurulduğunda o korumanın kendisi de denetlenir.
- **§6.1** — kapı arayüze güvenmez, sunucuda durur.
- **§7.7** — her düzeltme **kendini doğrular**; göç, iddia ettiği durumu kendi
  sınamalı ve sınama geçmezse `RAISE EXCEPTION` ile patlamalı.
- **§7.6 + `.github/workflows/migration-immutability.yml`** — **var olan göç
  dosyası düzenlenemez, yeniden adlandırılamaz, silinemez.** Düzeltme = YENİ dosya.
- **§10.5** — görevin parçası olmayan hatayı düzeltme; rapora yaz.
- Dosyanın kendi geçerlilik sırası: **canlı sistem > `main` kodu > prensipler
  dosyası**. Çelişkide canlı kazanır.

---

## 2 · KURUCU KARARLARI (kesin)

| # | Konu | Karar |
|---|---|---|
| **1** | Kaleci/hakem pazaryeri | **Mantık uygulamada KALIR.** Ekran, akış, kayıt yolu, admin onayı sökülmez. |
| **2** | Demo içerik | **Demo olarak yer alan HİÇBİR ŞEY kalmaz.** |
| **3** | Ödeme | **En kısa yol:** `payment_mode_global=CASH_ONLY`, `simulation_counts_as_live=false`. Kart akışı hiç çizilmez. iyzico 1.1'e. |

---

## 3 · CANLI DURUM — ölçülmüş

### 3.1 · İncelemeciye açılan kapı
`get_nearby_providers` canlıda `_cagiran_demo_mu()` kapısını taşıyor. Aynı
çağrı, aynı koordinat, aynı an: **demo hesap sağlayıcıları görüyor, gerçek
hesap 0 görüyor.**

### 3.2 · İkinci arka kapı — YENİ, gözden kaçmıştı
`supabase/config.toml:287-288`:
```
[auth.sms.test_otp]
905000000000 = "500000"
```
SMS gitmeden sabit kod kabul eden bir kimlik yolu; bağlı hesap
`d0e51e00-0000-4000-8000-000000000001` ("Demo Kaleci-Hakem", `is_demo=true`).
Kaynak göç `20260910000000` kendi yorumunda *"harita kapatıldığı an hesap
erişilemez hâle gelir"* diyor. **Bu, 5.6'nın en somut ihlal adayı.**

### 3.3 · Profil dağılımı

| Rol | Demo | Gerçek |
|---|---|---|
| PLAYER | 21 | 8 |
| OWNER | 4 | **0** |
| GOALKEEPER | 3 | **0** |
| REFEREE | 2 | **0** |

30 demo profilin **tamamının id'si `d0e51` önekiyle başlıyor** (kesin seçici).
8 "gerçek" profilin 2'si mezar taşı, 1'i kurucu; yani gerçek kullanıcı 4–6.

### 3.4 · İçerik — "demo değil" görünen ama demo olan

| Kalem | Durum |
|---|---|
| Tesis | 6 tesisin **0'ı** `is_demo` işaretli, ama **5'inin sahibi demo**. Yayındaki **4 tesisin 4'ünün de** sahibi demo. Sahibi demo olmayan tek tesis `Cumhuriet Gençlik` — `owner_id NULL`, yayında değil, 0 tarife. |
| Maç | 90 maçın **89'u demo**. Ama `demo_ekosistem_temizle()` yalnız **66'sını** görüyor — 23 demo maç temizleyicinin kör noktasında. Gelecek 22 maçın **22'si demo**, gerçek gelecek maç **0**. |
| Kaleci / Hakem | `goalkeepers` 4/4 demo, `referees` 3/3 demo. **Bu iki tabloda `profiles`'a FK YOK** — profil silinince kendiliğinden gitmezler. |
| match_participants | **523/523 demo.** Gerçek kullanıcının katıldığı maç sayısı **0**. |
| pitch_bookings | 106'nın 77'si işaretli; işaretsiz 29'un tamamı demo sahipli tesislerde (`OWNER_MANUAL`/`SUBSCRIPTION`, `user_id NULL`). |
| notifications | 3717'nin 3713'ü demo. |

**Neden bu kadar tutarsız:** `demo_isareti_ata()` tetikleyicisi üç kapıya
bakıyor — sahip `@oyna.app` mi, bağlı maç `isDemo` mı, bağlı tesis `is_demo`
mı. Tesisler `is_demo=false` olduğu için **üçüncü kapı hiç açılmıyor**.

### 3.5 · Ödeme anahtarları
`payment_provider=SIMULATION` · `simulation_counts_as_live=true` ·
`payment_mode_global=ONLINE_ONLY` · 6/6 tesis `ONLINE_ONLY` ·
`match_deposit_enabled=true` · `demo_mode_enabled=true` ·
`push_live_enabled=false`.

`app_config` satırının **kendi etiketi** delil niteliğinde:
*"Simülasyon Canlı Sayılsın (YALNIZ DEMO/İNCELEME) … yalnız mağaza incelemesi
ve demo için açılır."*

---

## 4 · ⚠️ SİLMENİN SONUCUNU BAŞTAN BİL

Demo silinince **5 sekmeden 4'ü boşalıyor** (ölçüldü):

| Sekme | Silme sonrası |
|---|---|
| DASHBOARD | "BUGÜN YAKININDA MAÇ YOK" · iki sağlayıcı kartı "Müsait yok" · saha kartı "Yakında müsait saha yok" |
| MATCH_DISCOVERY | "Aktif Maç Bulunamadı — Bu bölgede şu an açık bir maç yok. Sen kurabilirsin." |
| MY_MATCHES | 0 kayıt |
| PITCH_DISCOVERY | "BÖLGENDE HENÜZ SAHA YOK" (+ CASH_ONLY ile kiralama girişi zaten kapalı) |
| PROFILE | tek ayakta kalan |

**Sanılan çıkış yolu kapalı:** `services/matchCreateService.ts:66`
`.eq('is_published', true)` → demo sahipli tesisler gidince yayında tesis 0 →
`views/MatchCreate.tsx:725` boş dalı → *"Bölgende henüz onaylı saha yok"*.
Yani incelemeci de gerçek kullanıcı da **maç kuramaz**.

**Ölü döngü:** `MatchDiscovery.tsx:687-700` boş hâli "Sen kurabilirsin" deyip
**Maç Kur**'a yolluyor; orada "onaylı saha yok" çıkıyor. Üç ekran birbirini
işaret ediyor. Bu, App Store 2.1 reddinin doğduğu yerdir.

**Bu yüzden iş sırası değişti:** demo silme **İŞ 7**'de, gerçek içerik
girdikten sonra. Ve gönderim, **İŞ 6.3'teki boş-uygulama kapısıyla** mekanik
olarak kilitleniyor.

---

## 5 · İŞLER — bu sırayla

> Her işin **kabul ölçütü** var; sağlanmadan sonrakine geçme.
> Her iş kendi commit'i olsun (Türkçe, ne/niye/nasıl doğrulandı).

---

### İŞ 1 — Prensipleri güncelle (ÖNCE bu)

`OYNA_PRENSIPLER.md` kendi kuralında *"bir karar değişecekse ÖNCE buraya
yazılır, sonra uygulanır"* diyor. Bugün dosya kararlarla çelişiyor:

- **§7.10** "demo veri kalır ama gerçekle karışmaz" → KARAR 2 ile çelişir.
- **§2.1** "online ödeme kusursuz çalışır" → KARAR 3 ile çelişir.
- **§2.12** "uygulamadan rezervasyon yalnız kartla kapora ile" → CASH_ONLY'de anlamsız.
- **§11** tablosu zaten `CASH_ONLY` diyor ama canlı `ONLINE_ONLY` — dosya bugün canlıyla ayrışmış.

**Kabul ölçütü:** dört madde de yeni kararları yansıtıyor, tarih ve gerekçe yazılı.

---

### İŞ 2 — Sunucudaki incelemeci kapısını sök  ⟨5.6'nın kökü⟩

1. Yeni göç: `supabase/migrations/<tarih>_incelemeci_kapisi_sokuldu.sql`.
   Numara çakışmasına dikkat (`ls supabase/migrations | sort | tail`).
2. `get_nearby_providers`'ı çağırandan bağımsız yap. Doğru referans:
   `20260905000012_demo_saglayici_sizintisi.sql` içindeki tanım.
3. `_cagiran_demo_mu()`'yu **DROP** et — önce bağımlılık taraması yap
   (fonksiyon gövdeleri, `pg_policies`, view'lar, tetikleyiciler).
4. **§7.7:** göç, aynı çağrıyı bir demo ve bir gerçek kimlikle çalıştırıp
   **sayılar eşit değilse patlasın.** Sabit rakam bekleme — *eşitlik* ara.

**Kabul ölçütü:** iki kimlik aynı sayıyı döndürüyor · `_cagiran_demo_mu` yok ·
göç kendini doğruluyor.

---

### İŞ 3 — Sabit OTP arka kapısını kaldır

1. `supabase/config.toml` içindeki `[auth.sms.test_otp]` eşlemesini sil.
2. `docs/master/APP_REVIEW_NOTLARI.md`'de bu numaraya yapılan **tüm atıfları** sil.
3. **Kurucu aksiyonu (sen yapamazsın, rapora yaz):** Supabase Panosu →
   Authentication → Phone → Test OTP listesinin **canlıda** da boş olduğu
   teyit edilmeli. Depo dosyası canlıyı yansıtmayabilir.

**Kabul ölçütü:** depoda sabit OTP eşlemesi yok · notlarda numara geçmiyor ·
canlı teyidi rapora "kurucu aksiyonu" olarak yazıldı.

---

### İŞ 4 — Ödemeyi dürüst hâle getir (CASH_ONLY)

**Sunucu — hepsi AYNI göçte:**
- `simulation_counts_as_live` → `false`
- `payment_mode_global` → `CASH_ONLY`
- `match_deposit_enabled` → **`false`** ⚠️ *Bunu atlarsan* `create_match_atomic`
  her yayında `AWAITING_PAYMENT` üretir, kullanıcı PaymentScreen duvarına
  çarpar, 30 dk sonra cron maçı ve rezervasyonu iptal eder.
- Tesislerin `payment_mode`'unu `ONLINE_ONLY`'den geri al (`20260912000000:111`
  hepsini çevirmişti).
- `simulation_counts_as_live` satırının **label/description metnini** de
  düzelt — bugün "yalnız mağaza incelemesi için" yazıyor ve bu, admin panelinde
  görünen yazılı bir ikrar.

**İstemci — en kritik kısım.** `b_nakit_rezervasyon_kapisi` (`20260905000010`)
`online_allowed=false` iken `source='APP_BOOKING'` insert'ini
`CASH_BOOKING_DISABLED` ile reddeder. Yani **uygulamadan saha kiralama olmaz.**
Kullanıcıyı o yola **hiç sokma** — 3-4 adım yürüyüp ham hata almak 2.1 reddidir
(bu proje aynı hatayı bir kez yaptı: `MAGAZA_GONDERIM.md` madde 14).
Hazır desen: `views/Marketplace.tsx` **"Kiralama Çok Yakında"**. Aynı dili kullan.
İzlenecek yollar: `views/PaymentScreen.tsx`, `services/paymentModeService.ts`,
`views/PitchDiscovery.tsx`, `views/MatchCreate.tsx`, `views/MatchJoin.tsx`.

**`match_deposit_enabled=false` yan etkisi:** `views/MatchCreate.tsx:1551-1653`
kaleci/hakem teklif yüzeyi açık kalırsa `deposit=0` dalı
`create_service_request`'i **doğrudan** çağırır ve gerçek sağlayıcılara
fonlanmamış talep + `provider='IYZICO'` payment_intent yazar. O yüzeyi de kapat.

*`APP_MATCH` serbest kalır — maç kurma/katılma çalışmaya devam eder
(tesis olduğu sürece; bkz. İŞ 6).*

**Kabul ölçütü:** hiçbir ekranda kart bilgisi istenmiyor · saha kiralama girişi
baştan kapalı ve sebebi yazılı · maç kurma/katılma çalışıyor · hiçbir akış ham
hataya çarpmıyor.

---

### İŞ 5 — İnceleme notunu sıfırdan yaz

`APP_REVIEW_NOTLARI.md` şu an App Store Connect'e **telefon + 6 haneli SMS
kodu** girişini yapıştırmayı söylüyor. Ama `1fe8b76` telefon girişini tamamen
kapattı (`shared/phone.ts · SMS_OTP_ENABLED=false`) — giriş ekranında numara
alanı **çizilmiyor bile**. Bu not bu hâliyle giderse tek başına ikinci reddi
getirir.

Hazır İngilizce metin: `APPLE_56_COZUM_PLANI.md` **Bölüm 5**. İŞ 4'ün sonucuna
göre ödeme paragrafını güncelle.

**Kritik:** Sign-In Information alanına **özel hesap verme.** Apple/Google ile
giriliyor; incelemeci kendi Apple ID'siyle girer ve gerçek kullanıcının
gördüğünün aynısını görür — iddiamız budur. Notta **bölge** yönergesi de olmalı
(OYNA yalnız Ordu'da açık; "KONUMU AYARLA" → Ordu/Altınordu, liste tepesinde).

**Kabul ölçütü:** notta pakette olmayan tek bir yol/özellik geçmiyor ·
`shared/phone.ts` ve `config.toml` ile çelişki yok · bölge yönergesi var.

---

### İŞ 6 — Kilitler: bir daha olmasın

Örnek kalıplar: `tests/unit/magazaKapilari.test.ts`,
`tests/unit/telefonGirisi.test.ts`, `tests/unit/numaraAdimiAtlanabilir.tsx`.
`magaza-denetim.mjs`'de bugün **7 kapı** var; aşağıdaki **4'ü de yeni**.
Her yeni başlık ayrıca `magazaKapilari.test.ts` içindeki başlık listesine eklenmeli.

1. **`tests/unit/incelemeciKapisiYok.test.ts`** — kaynakta ve
   `supabase/migrations/` içinde çağırana bağlı kapı desenini
   (`_cagiran_demo_mu`, `auth.uid()`+`is_demo`) ve `[auth.sms.test_otp]`
   eşlemesini arar; bulursa **kırmızı**.
2. **Denetim · kapı** — canlıya sorar; `get_nearby_*` fonksiyonlarında çağıran
   bağımlılığı varsa **ENGEL**.
3. **Denetim · boş uygulama** ⚠️ *bu işin en önemli parçası* — yayında gerçek
   tesis **0** ya da gelecek gerçek maç **0** ise **ENGEL**:
   *"Uygulama boş; gönderim App Store 2.1 ile reddedilir."*
   İŞ 7'nin yarattığı boşlukla kazara gönderimi mekanik olarak durdurur.
4. **Denetim · ödeme** — `simulation_counts_as_live=true` iken **ENGEL**.
5. **Denetim · not tazeliği** — `APP_REVIEW_NOTLARI.md`, `shared/phone.ts`'ten
   eskiyse **UYARI**.

**Kabul ölçütü:** her kilit, düzeltme geri alındığında **gerçekten kırmızı
dönüyor** (mutasyonla sına) · `npm run test:unit` yeşil · `npm run lint` temiz ·
`process.exit(engeller.length > 0 ? 1 : 0)` satırı gevşetilmedi.

---

### İŞ 7 — Demo veriyi sil  ⟨GERİ ALINAMAZ⟩

> **Sıra önemli:** bu iş, gerçek içerik girildikten (İŞ 8) ve boş-uygulama
> kapısı kurulduktan (İŞ 6.3) SONRA yapılır. Kurucu isterse önce yapılabilir,
> ama o zaman uygulama gönderilemez durumda kalır — bunu rapora yaz.

**Önce oku — mevcut araçlar BOZUK:**
- `supabase/seeds/demo_clean_start_purge.sql` **çalıştırma.** Önek eşleşmeleri
  boşa düşüyor, `_pitches_owner_guard` ve RESTRICT FK'ler yüzünden hata ile
  duruyor, üstelik kendi doğrulaması aynı yanlış önekle **"temiz" raporu
  veriyor**.
- `scripts/owner-demo.mjs purge`, `purge_godview_demo`, `purge_module_demo`
  bugün hata veriyor. Güvenme.
- `demo_ekosistem_temizle()` yalnız `_demo_ekosistem` damgalı **66 maçı**
  görüyor; 23 demo maç ve demo profillerin kendisi kapsam dışında.

**Silmeyi BLOKLAYAN FK'ler** (önce bunlar boşaltılmalı):
`wallet_transactions.user_id` **RESTRICT** · `payment_intents.user_id` ve
`.pitch_id` **NO ACTION** · `service_requests.requested_by` **NO ACTION** ·
`card_refund_queue` → `payment_intents` **NO ACTION** (hiçbir mevcut araçta
geçmiyor) · `player_ratings.rater_id` **RESTRICT** ·
`_pitches_owner_guard` *"mevcut sahip silinemez"* der.

**FK ile GİTMEYENLER** (elle silinmeli): `goalkeepers`, `referees` — bu iki
tabloda `profiles`'a FK yok.

**Kapsam kararı — tesisler:** 5 tesis `is_demo=false` ama sahibi demo.
`pitches.owner_id` FK'si `ON DELETE SET NULL`; yani hiçbir şey yapılmazsa
tesisler **sahipsiz olarak kalır**. Ama `pitches_published_needs_owner` CHECK'i
(`owner_id IS NOT NULL OR is_demo IS TRUE OR NOT is_published`) demo dalı
kapandığında bunların **yayında kalmasını yasaklar**. Kurucu kararı
*"demo olarak yer alan hiçbir şey kalmasın"* olduğu için: **bu 5 tesis ve
bağlıları silinir.** (`courts`, `pitch_tariffs`, `pitch_customers`,
`pitch_debtors/expenses/staff_*` zaten `pitch_id` üzerinden CASCADE.)

**Yedek — ajanın yapabileceği tek şey:**
- `pg_dump`/`psql` sandbox'ta kurulu ama **5432 kapalı**; gerçek dump alamazsın.
- Elindeki tek yol: **aynı veritabanında** `CREATE TABLE IF NOT EXISTS
  _yedek_<tablo>_<tarih> AS SELECT * FROM <tablo> WHERE <silme ölçütü>`.
- Yedek tablolara **RLS uygula**: `REVOKE ALL ... FROM anon, authenticated`,
  yalnız `service_role`. Yoksa "demo veriyi sildik" derken onu yeni bir
  yüzeyden okunur hâle getirirsin.
- **Kurucu aksiyonu (rapora yaz):** silmeden önce Supabase Panosu → Database →
  Backups ekranından **PITR'in açık** olduğu ve son yedeğin saati teyit
  edilmeli. `docs/master/RUNBOOK.md:41-42` bugün kapalı olduğu varsayımıyla
  yazılmış. Kapalıysa ya açılsın ya silme ertelensin.
- Yedek tablolarının **ömrü** yazılsın (ör. yayın + 30 gün → DROP), yoksa karar
  yarım kalır.

**Kurucuya sorulacak — gerçek kullanıcı verisi yarıçapta:**
demo ölçütüyle silinecekler arasında **3 gerçek rezervasyon**, **2 gerçek
payment_intent** (FAILED IYZICO denemeleri) ve **1 demo olmayan maç**
(`06418dea`, CANCELLED) var. Bunları tek tek listele ve **sor** — sessizce
silmek kapsam aşımıdır.

**Storage — ayrı adım, hiçbir araçta yok:** `images` kovasında **18 nesne**,
**9'unun sahibi demo profil**. `storage.objects`'te `auth.users`'a FK yok;
ne silinirler ne de silmeyi bloklarlar — **sessizce öksüz kalırlar** ve public
URL ile erişilebilir olmaya devam ederler. Silinecekse ayrı adım; silinmeyecekse
bu **bilinçli** olarak yazılsın. DB yedeği kovayı kapsamaz — geri dönüşü yok.

**Sıra:**
1. Yedek tabloları oluştur (+ RLS).
2. Bloklayan tabloları boşalt (`card_refund_queue` → `payment_intents` →
   `wallet_transactions` → `service_requests` → `player_ratings` → …).
3. `goalkeepers`, `referees` elle sil.
4. Maçlar + `match_participants` + `demo_ekosistem_kayit`.
5. Demo sahipli tesisler (owner guard'ı aş) + CASCADE bağlıları.
6. `profiles` (`id LIKE 'd0e51%'` kesin seçici) + karşılık gelen `auth.users`.
   **`auth.users`'ı unutma** — yalnız profil silmek kimliği bırakır ve o
   kimlikle girişte profilsiz oturum doğar.
7. Storage kararı.
8. **Silmeden SONRA** demo üretimini kapat: `demo_mode_enabled=false`,
   `demo_ekosistem_kur()`/`_demo_hizmet_talepleri()` devre dışı, cron kapalı.
   Demo işaretini koyan tetikleyicileri (`trg_demo_isareti*`, `demo_isareti_ata`)
   **silmeden önce düşürme** — işaret kalkarsa silme sorguları hedefini bulamaz.
9. `RAISE EXCEPTION 'DOGRULAMA: ...'` ile doğrula (§7.7).

**GERÇEK KULLANICI HESAPLARINA DOKUNMA.** `is_demo=false` olan hiçbir hesabı,
"herhalde şu kişinindir" diye akıl yürüterek silme. Ölçüt tek: `is_demo` /
`d0e51` öneki.

**Kabul ölçütü:** `profiles.is_demo=true` **0 satır** · demo işaretli kayıt
hiçbir tabloda yok · `goalkeepers`/`referees` boş · demo üretimi kapalı ·
yedekler RLS'li ve ömrü yazılı · silme sonrası sayılar raporda.

---

### İŞ 8 — Gerçek içerik (gönderimin ön şartı)

Boş uygulama gönderilemez. Minimum, **ölçülmüş** gereksinim:

1. **Gerçek bir OWNER hesabı.** Uygulama içinde **yol yok** — bu bilinçli bir
   karar (IP-22; `components/settings/FieldRolePage.tsx:14-15`,
   `views/OwnerPanel.tsx:698-712`). Admin panelinden atanır.
2. **En az 1 gerçek tesis:** `admin_create_pitch` → `owner_id` ata →
   koordinat pini (`OwnerFacilitySettingsModal.tsx:242-248` kapısı) → kapak
   fotoğrafı (`20260801135629`: fotoğrafsız tesis vitrine çıkmaz) →
   `is_published=true` → en az 1 kort + tarife (yoksa maç fiyat teklifi çıkmaz).
3. **En az 1-2 gerçek kaleci/hakem:** `ServiceApplication` → admin onayı
   (`admin_review_provider_application`) → sağlayıcının
   `views/ServiceProfile.tsx:657-661` **"LOKASYONU KAYDET"** adımı. Bu adım
   atlanırsa `get_nearby_providers`'ın `coordinates IS NOT NULL` şartı yüzünden
   kart "Müsait yok" kalır.
   *Not: `provider_applications` canlıda **0 satır** — bu akış bugüne kadar hiç
   kullanılmamış. İlk kullanan sen olacaksın; kırıksa rapora yaz.*
4. **En az 1 gerçek gelecek maç.**

Bu iş büyük ölçüde **kurucu işidir**. Senin görevin: yolu doğrulamak, kırık
adımı bulmak, kurucuya net bir yapılacaklar listesi vermek.

---

### İŞ 9 — Gönderim hijyeni

1. `node scripts/build-legal-pages.mjs` — 6 yasal sayfa bayat.
2. `npm run sync:ios && cd ios/App && pod install` — `Podfile.lock` çok eski
   (Podfile'da 15 eklenti, kilitte 4; yollar başka makineyi gösteriyor).
   **Atlanırsa rehber/konum/kamera/paylaşım eklentileri pakete girmez.**
3. Derleme numarası 2 → **3** (`npm run surum:artir`).
4. `npm run magaza:denetim` → **0 engel**.

> Ortam notu: `npm ci` zorunlu (`node_modules` yok). Testlerde tip kontrolü
> kapalı (§8.5, ~65 bilinen hata) — bunu bilerek çalış.

---

## 6 · YASAKLAR

- ❌ **Pazaryerini sökme.** KARAR 1 yalnız demo *veriyi* siler; `Marketplace`
  ekranları, `ServiceApplication`, `create_service_request`,
  `find_providers_for_match` ve admin onay yolu **kalır**. "Nasılsa 0 sağlayıcı
  var" diye ekran/servis silmek kapsam aşımıdır.
- ❌ Boş vitrini doldurmak için demo veriyi geri açma, "örnek" içerik uydurma,
  tesis/maç/sağlayıcı tohumlama, silineni "gerçek" etiketiyle yeniden yazma.
  Bu, 5.6'yı **3.2.2 (sahte içerik)** ile takas etmektir.
- ❌ İncelemeci için özel hesap/numara/bayrak/`app_config` anahtarı/RLS dalı
  oluşturma — kaldırılan `[auth.sms.test_otp]` yerine yenisini koymak dâhil.
- ❌ `views/PaymentScreen.tsx:299` `cashBooking = false` sabitini `true` yapma.
  Sunucu `CASH_BOOKING_DISABLED` ile reddeder; kullanıcı ham hata alır.
  Doğru çözüm o ekrana **hiç gelinmemesidir**.
- ❌ `services/paymentModeService.ts:14-24` `SAFE_FALLBACK`'e dokunma — zaten
  fail-safe (`CASH_ONLY` / `online_allowed:false`).
- ❌ `payment_mode_global=CASH_ONLY` yaparken `match_deposit_enabled`'ı `true`
  bırakma (yukarıda sebebi yazılı).
- ❌ **Var olan göç dosyasını düzenleme/yeniden adlandırma/silme** (§7.6 +
  `migration-immutability.yml`). Özellikle `20260912000000` ve `20260820000003`'e
  dokunma dürtüsüne kapılma. Düzeltme = **yeni dosya**.
- ❌ Canlıya elle `execute_sql` ile kalıcı DDL/DML uygulama. Okuma/ölçüm serbest;
  değişiklik **göçle** ve kurucu onayıyla.
- ❌ `demo_clean_start_purge.sql` ve `owner-demo.mjs purge` çalıştırma (bozuk).
- ❌ Test silme/atlama/skip etme; `magazaKapilari.test.ts` başlık listesini ya da
  `magaza-denetim.mjs`'in `process.exit` satırını gevşetme.
- ❌ Boş-uygulama kapısını "uyarı"ya düşürme. **Gönderim kararı kurucunundur.**
- ❌ Görevin parçası olmayan hatayı düzeltme (§10.5). Yol üstünde görülenler —
  `Marketplace.tsx:202-210` bölge süzgecinde büyük/küçük harf hatası,
  `RoleSelection.tsx:317-327`'de var olmayan TESİS başvuru kartı,
  `PendingVerificationView` "24 saat" ile `verification_sla_hours=48`
  tutarsızlığı, `get_nearby_pitches` depo/canlı ayrışması — **rapora yazılır,
  düzeltilmez** (kurucu ayrıca isterse başka).
- ❌ iyzico'yu canlıya alma, `wallet_enabled`'ı açma.

---

## 7 · BİTİNCE RAPOR ET

1. **İŞ 1–9 durumu** — her biri: yapıldı/yapılmadı + kanıt (komut çıktısı ya da
   sorgu sonucu).
2. **Kapı taraması** — kaç aday, kaçı meşru yetkilendirme, kaçı söküldü.
3. **Ayrışma listesi** — depo ile canlı arasındaki her fark.
4. **Silme sonrası sayılar** — kalan profil (rol dağılımı), yayında tesis,
   gelecek maç, onaylı sağlayıcı, storage nesnesi.
5. **`npm run magaza:denetim` çıktısı** — tam hâliyle.
6. **Kurucu aksiyonları** (senin yapamadıkların): canlı Test OTP teyidi,
   PITR teyidi, gerçek tesis/sağlayıcı kaydı, gerçek kullanıcı verisi kararı.
7. **Fark ettiklerim** — düzeltmediğin ama gördüğün her şey.

**Gönderim kararını sen verme.** İşin uygulamayı 5.6 açısından temiz ve dürüst
hâle getirmek; "gönderilebilir mi" sorusunun cevabı gerçek içeriğin varlığına
bağlı ve o kurucunun kararıdır.
