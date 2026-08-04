# 02 — CTO (Chief Technology Officer) · OYNA Kıdemli Danışma Kurulu

> **Tarih:** 3 Ağustos 2026
> **Rol:** Chief Technology Officer
> **Ön okuma:** `docs/board/DECISIONS.md` (CPO turu + kurucu kararları) okundu. Bu rapor K-2.1 (online ödeme kalıyor) ve K-1.1 (wedge = parayı topla) kararlarının üzerine kuruludur.
> **Yöntem:** `main` @ `da54bff` + canlı Supabase (`iikvzgyccvgcybzdfwlv`) salt-okunur. 4 paralel keşif ekibi; **her kritik iddia canlı veritabanında tarafımdan yeniden test edildi.** Üç iddia doğrulandı, biri çürütüldü, iki doküman iddiası bayat çıktı.

---

## 0. Sistemin ölçülmüş büyüklüğü

| Ölçüt | Değer |
|---|---|
| TypeScript/TSX | **124.623 satır** |
| SQL (migration) | **62.884 satır** · 398 dosya |
| Postgres fonksiyonu | **840** (554'ü `SECURITY DEFINER`) |
| Kullanıcıya açık güvenilir fonksiyon | **404** (authenticated) · **12** (anonim) |
| RLS politikası | **272** · 112 tablo |
| Trigger | 59 · İndeks 375 |
| Zamanlanmış görev | 13 aktif |
| Edge Function | 15 · 2.592 satır Deno |
| Test | 110 dosya · **1426 birim testi yeşil** |

**Migration sapması: SIFIR.** Repoda 398 dosya, canlı defterde 398 kayıt, ilk ve son sürüm birebir aynı. Dokümanlarda yazan drift uyarıları (`OYNA_OPERASYONEL_DURUM.md:20`, `SUPABASE_MIGRATION_RECONCILIATION.md:120-128`) **artık geçerli değil**. "Defterde olmayan 8 baseline" iddiasını da test ettim — sekizi de defterde. Bu kapanmış bir dosya.

---

## AŞAMA 1 — Açılış tavsiyeleri

### 1.1 Tek kurucu için mimari, "doğru yapmak" değil "yanlış yapamamak" üzerine kurulur
554 güvenilir fonksiyonun her biri kendi yetki kontrolünü doğru yapmak zorunda. Bir ekipte bu code review ile taşınır; tek kişide taşınmaz. Sizin ölçeğinizde doğru yatırım, **her fonksiyonu doğru yazmak değil, yanlış yazılmış fonksiyonun zarar veremeyeceği kapılar kurmaktır**: sütun düzeyinde yazma yasakları, veritabanı kısıtları, değişmezlik denetçileri. Bunlar bir kez yazılır, sonsuza kadar korur.

### 1.2 Güven sınırını satırdan sütuna indirin
Bugün koruma "bu satır senin mi?" seviyesinde. Para alanları için bu yetmez — `profiles` tablosunda bunu zaten doğru yapmışsınız (iki ayrı bekçi tetikleyici, kullanıcı kendi cezasını kaldıramıyor). **Aynı disiplin `matches` tablosuna uygulanmamış ve para orada.** Bu bir yetenek sorunu değil, tutarlılık sorunu.

### 1.3 Ölçek sorununuz Postgres'te değil, insan dikkatinde
100 bin kullanıcıyı bu mimari taşır. Sizi kıracak şey yük değil, **sessizce yanlış davranan bir kural** olacak. Bu yüzden bir sonraki mühendislik yatırımınız performans değil, **doğrulanabilirlik** olmalı: para değişmezlerini sürekli denetleyen bir iş, kırıldığında sizi uyandıran bir alarm.

### 1.4 Supabase kilidini yanlış yerde arıyorsunuz
Asıl kilit Supabase değil — **iş mantığının Postgres'in içine yazılmış olması**. 62.884 satır SQL, 554 fonksiyon, 272 politika. İyi haber: bunların hepsi standart Postgres. Supabase'den çıkmak isterseniz kendi Postgres'inize taşırsınız ve **hepsi olduğu gibi çalışır**. Kötü haber: Postgres'ten çıkmak, uygulamayı yeniden yazmak demektir. Bu bilinçli bir bahis ve **sizin ölçeğinizde doğru bahis** — ama bilerek yapın.

### 1.5 Yeşil CI'ya güvenmeyin — şu an ölçtüğünden azını ölçüyor
`npm run lint` temiz ve 1426 test yeşil. Ama TypeScript'in **katı modu kapalı** ve kodda 500 `any` var. Yani tip denetimi, en tehlikeli hataları (boş değerin sayıya dönüşmesi, para alanının `undefined` olması) hiç yakalamıyor. Yeşil ekran gerçek bir güvence değil; onu gerçek yapmak birkaç günlük iştir.

---

## AŞAMA 2a — BULGULAR

---

### [P0] Maç kaydı istemciden doğrudan yazılabiliyor — fiyat, komisyon ve kadro dahil

**Kanıt:** Canlı `pg_policies`: `matches_update` politikası `USING (auth.uid() = captain_id OR is_platform_admin())`, **`WITH CHECK` yok**. Canlı `column_privileges`: `authenticated` rolü `matches` tablosunda **58 sütuna UPDATE** yetkisine sahip — `price`, `commission_rate_pct`, `commission_markup_pct`, `commission_markup_amount`, `commission_model`, `slots`, `awaySlots`, `deposit_status`, `deposit_amount`, `status`, `is_successful`, `min_players` dahil. Koruyucu tetikleyici **yok**: `trg_set_match_commission_model` yalnız `BEFORE INSERT`.

**Mevcut durum:** Bir maçın kaptanı, uygulamayı hiç kullanmadan, PostgREST üzerinden kendi maçının komisyonunu sıfırlayabilir, fiyatını değiştirebilir, kadro listesini "dolu" yazabilir.

**Risk:** En ağır senaryo: kaptan `slots` alanını tüm yerler dolu olacak şekilde yazar → `trg_match_threshold` tetiklenir → maç `CONFIRMED` olur → `_match_confirm_settle` saha sahibine hakediş yazar → **ama hiçbir oyuncu ödeme yapmamıştır.** Aradaki fark platformun cebinden çıkar. Ayrıca dondurulmuş komisyon sonradan değiştirilebildiği için ticari anlaşma anlamını yitirir.

**Çözüm:** `profiles` tablosunda zaten uygulanmış deseni birebir kopyala: (a) `matches` için `BEFORE UPDATE` bekçi tetikleyicisi — para ve durum sütunları admin/`SECURITY DEFINER` bağlamı dışında değiştirilemesin; (b) `authenticated` rolünden bu sütunların UPDATE yetkisini `REVOKE` et; (c) meşru güncellemeler zaten RPC'lerden geçiyor.

**Efor:** M (yarım gün) · yeni migration + geri alma dosyası

**Doğrulama:** Test hesabıyla kendi maçının `price` alanını değiştirmeyi dene → reddedilmeli. Uygulamadan maç kurma ve katılma akışı bozulmamalı.

---

### [P0] İade oranı, istemcinin gönderdiği saate göre hesaplanıyor

**Kanıt:** Canlı `process_tiered_refund(p_intent_id uuid, p_hours_to_match numeric, p_policy text)`. Gövdesini okudum: kademeyi doğrudan `p_hours_to_match` parametresinden belirliyor, maçın veya rezervasyonun **gerçek başlangıç saatini hiç okumuyor**. Yetki kontrolü yalnızca "bu ödeme senin mi". Canlı yetki testi: `authenticated` rolü bu fonksiyonu **çağırabiliyor**.

**Mevcut durum:** Uygulama bu fonksiyonu doğrudan çağırmıyor (yalnız `refund-payment` edge fonksiyonu çağırıyor) — yani gereksiz yere dışarı açık.

**Risk:** Bir kullanıcı kendi ödemesi için `p_hours_to_match: 9999` göndererek maç oynandıktan **sonra bile** %100 iade alabilir. K-2.1 ile online ödeme açıldığında bu doğrudan para kaybıdır.

**Çözüm:** İki adım: (a) fonksiyon saati parametre olarak almasın, `payment_intents` → `matches`/`pitch_bookings` üzerinden **kendisi türetsin**; (b) `authenticated` rolünden `REVOKE EXECUTE` — yalnız edge fonksiyonu (service_role) çağırsın.

**Efor:** S (<2 saat)

**Doğrulama:** Geçmiş tarihli bir maç için iade önizlemesi %0 dönmeli, hangi parametre gönderilirse gönderilsin.

---

### [P0] Kaporanın alt sınırı yok — 1 ₺ ile slot tutulabiliyor

**Kanıt:** Canlı `record_app_deposit_payment(p_booking_id, p_amount, p_use_balance, p_card_id)` gövdesi. Yetki kontrolleri doğru (giriş var mı, rezervasyon senin mi, iptal mi). Tutar kontrolü **yalnızca iki tane**: `p_amount > 0` ve `paid_amount + p_amount <= price`. Yani **tavan var, taban yok.** Kapora oranı (%30) sunucuda hiçbir yerde tanımlı değil — yalnız istemcide: `views/PitchDiscovery.tsx:980`. Canlı yetki testi: `authenticated` çağırabiliyor.

**Ek kanıt:** `app_config.direct_booking_deposit_default_pct = 30` ayarı canlıda mevcut ama **hiçbir fonksiyon tarafından okunmuyor** (554 fonksiyon gövdesi tarandı: 0 eşleşme).

**Mevcut durum:** Kullanıcı 1 ₺ ödeyerek prime-time bir slotu üzerine alabilir. Saha sahibi slotu satamaz, OYNA komisyon alamaz.

**Risk:** Doğrudan gelir kaybı ve saha sahibiyle güven kaybı — üstelik keşfedilmesi kolay bir hile.

**Çözüm:** Sunucu kaporayı **kendisi türetsin**: `pitch_tariffs.deposit_amount`, yoksa `direct_booking_deposit_default_pct`. `p_amount` parametresi ya kaldırılsın ya da sunucunun hesabıyla eşleşmiyorsa reddedilsin.

**Efor:** S–M · para akışı olduğu için tek başına paket

**Doğrulama:** Ödeme ekranında gösterilen kapora ile hesaptan düşen tutar birebir aynı olmalı; daha düşük tutar gönderme denemesi reddedilmeli.

---

### [P0] Maç kaporası keyfi tutarla bloke edilebiliyor

**Kanıt:** Canlı `match_block_deposit(p_match_id uuid, p_amount numeric, p_providers jsonb)` — `authenticated` çağırabiliyor. Gövdedeki tek kontrol: tutar pozitif olsun ve cüzdanda yeterli bakiye bulunsun. **Maçın gerçek kaporasıyla karşılaştırma yok.** Meşru çağıran `create_match_atomic` tutarı kendi türetiyor; ama fonksiyon ayrıca dışarıya açık. 2026-09 denetim migration'ı kardeş fonksiyonları (`process_match_at_deadline`, `match_capture_deposit`, `match_fill_stats`) dışarıya kapatmış, **bunu atlamış**.

**Risk:** Kaptan 1 ₺ ile kaporayı "bloke etmiş" sayılıp maçı yayına alabilir; kaleci/hakem teklif zinciri tetiklenir. Güvence fiilen yoktur.

**Çözüm:** `REVOKE EXECUTE ... FROM authenticated` — bu fonksiyon yalnız `create_match_atomic` içinden çağrılmalı. Aynı taramayı diğer `__inner`/yardımcı fonksiyonlar için de yap.

**Efor:** S (<2 saat)

**Doğrulama:** Maç kurma akışı çalışmaya devam etmeli; doğrudan çağrı reddedilmeli.

---

### [P0] Herkes herkese bildirim yazabiliyor — ve bu doğrudan telefona push'a dönüşüyor

**Kanıt:** Canlı `notifications` politikaları. `notifications_insert_own_sender` → `WITH CHECK (sender_id = auth.uid())`. Politikalar PERMISSIVE ve **VEYA** ile birleşiyor; yani `sender_id` kendini gösterdiği sürece `user_id` **başkası olabilir**. `notifications` INSERT olayı veritabanı webhook'u ile `send-push` fonksiyonunu tetikliyor.

**Mevcut durum:** Giriş yapmış herhangi bir kullanıcı, herhangi bir kullanıcıya istediği başlık ve metinle bildirim yazabilir; bildirim telefona push olarak gider.

**Risk:** Kimlik taklidi ("OYNA: hesabınız askıya alındı, şu linke tıklayın"), taciz, toplu spam. `push_live_enabled` bugün kapalı olduğu için telefona gitmiyor — **açtığınız gün aktif hale gelir.**

**Çözüm:** `notifications_insert_own_sender` politikasını kaldır; kullanıcıdan kullanıcıya bildirim gerektiren akışlar (davet, slot devri) zaten `SECURITY DEFINER` RPC'lerden geçiyor. Kalan tek meşru istemci yazımı `user_id = auth.uid()` olmalı.

**Efor:** S · **K-1.4 (push açma) öncesinde şart**

**Doğrulama:** Başka bir kullanıcıya bildirim yazma denemesi reddedilmeli; davet/slot bildirimleri çalışmaya devam etmeli.

---

### [P0] Staging ortamı yok — her test canlıya gidiyor

**Kanıt:** `oyna-staging` projesi (11 Temmuz 2026, eu-central-1) **INACTIVE**. `supabaseClient.ts:13-15` üretim URL'i ve anon anahtarı **koda gömülü**; `:31-32` env eksikse bu yedeğe düşüyor ve yalnız `console.warn` basıyor. `.github/workflows/admin-tests.yml:37-51` admin smoke testine Supabase env'i **verilmiyor** → CI her PR'da **canlı üretim veritabanına** bağlanıyor. `admin-panel/scripts/admin-supabase-deploy.mjs:16` üretim proje referansı **sabit**.

**Mevcut durum:** Geliştirme, test ve CI aynı veritabanını kullanıyor. Bugün testler salt-okunur olduğu için zarar yok — bu **tesadüfi bir güvenlik**.

**Risk:** Yazan tek bir test eklendiği an üretim verisi CI'dan bozulur. Ayrıca migration'ı canlıya uygulamadan önce deneyecek yer yok — geri alma provası imkânsız.

**Çözüm:** `oyna-staging` projesini uyandır; `supabaseClient.ts`'teki gömülü üretim yedeğini kaldır ve env eksikse **hata fırlat**; CI'a staging env'i ver.

**Efor:** M · **K-2.1'in ön koşulu** — para akışını canlıda deneyemezsiniz

**Doğrulama:** `.env` olmadan `npm run dev` çalıştır → uygulama açılmamalı, net hata vermeli.

---

### [P0] Ne zorunlu güncelleme var ne canlı yama — iki kaçış yolu da kapalı

**Kanıt:** Tam repo taraması: `force_update`, `min_version`, `minimum_version`, `update_required`, `app_version` karşılaştırması — **hiçbiri yok**. Var olan tek şey gösterim amaçlı sürüm rozeti (`utils/appVersion.ts:4`). OTA tarafı: `capacitor.config.ts:48-50` yalnız `androidScheme`; `server.url` yok; Capgo/Appflow bağımlılığı yok.

**Mevcut durum:** Kullanıcı eski sürümde kalırsa onu durduracak bir kaldıraç yok; web katmanını mağaza onayı olmadan güncelleme imkânı da yok.

**Risk:** 398 migration'lı, RPC imzaları sık değişen bir sistemde bu ciddi. Bir fonksiyon imzası değişirse eski istemciler **sessizce kırılır** ve ne zorla güncellenebilir ne yama atılabilir. Para akışında bir hata bulunduğunda tek seçeneğiniz mağaza inceleme süresini beklemek olur.

**Çözüm:** `app_config`'e `min_supported_version` anahtarı + açılışta sürüm kontrolü + bloke edici ekran + mağaza yönlendirmesi. Altyapı (`app_config` + `get_config_text`) zaten hazır; iş yalnız istemci tarafında.

**Efor:** M · mağaza gönderiminden önce

**Doğrulama:** Ayarı mevcut sürümün üstüne çek → uygulama açılışta güncelleme ekranı göstermeli.

---

### [P0] TypeScript katı modu kapalı — yeşil lint yanıltıcı güvence veriyor

**Kanıt:** `tsconfig.json` — `strict`, `strictNullChecks`, `noImplicitAny` ayarlarının **hiçbiri yok** (dosyanın tamamı 55 satır, hepsi okundu). Varsayılan `false`. Kod tabanında **500** `any`/`as any` kullanımı. Buna karşılık `@ts-ignore` sayısı **0** ve boş `catch` sayısı **2** — yani disiplin var, ayar yok.

**Mevcut durum:** `npm run lint` (tsc) temiz geçiyor ama boş değer denetimi yapmıyor. `services/paymentService.ts:48` `invokeEdge(): Promise<any>` — tüm ödeme edge çağrılarının dönüşü tipsiz. `views/MatchJoin.tsx` içinde 65 `any`, kapora alanları `as any` ile okunuyor çünkü `types.ts`'te tanımlı değiller.

**Risk:** Para alanlarında `undefined` sessizce `NaN`'a döner ve hiçbir denetim yakalamaz. Bu, para hatalarının en sık kaynağıdır ve elinizdeki tek otomatik savunma devre dışı.

**Ek kanıt — kapsam boşluğu:** `tsconfig.json:32-51` şunları denetim dışı bırakıyor: `tests`, `scripts`, `notifications`, `supabase`, `docs`. `npm run lint` = `tsc --noEmit` olduğundan ve CI yalnız bunu çalıştırdığından, **`supabase/functions/` altındaki 15 Edge Function — ödeme, iade, capture, void, webhook dahil — hiçbir zaman tip kontrolünden geçmiyor.** Bu dosyalar uygulama kodundan import edilmediği için dolaylı denetime de girmiyorlar. Para akışının sunucu tarafı derleyici korumasız.

**İyi haber — maliyet ölçüldü:** `tsc --noEmit --strict` çalıştırıldığında **yalnız 38 hata** çıkıyor ve bunun **19'u tek dosyada** (`views/MatchJoin.tsx`). Yani bu, aylık bir iş değil; birkaç günlük odaklı bir temizlik.

**Çözüm:** Kademeli: önce `strictNullChecks` aç, `MatchJoin.tsx` ve `PaymentScreen.tsx` ile başla (bu ikisi `as any` kullanımının %34'ünü de barındırıyor). Ayrı bir `tsconfig.functions.json` + CI adımıyla Edge Function'ları denetime al. Aynı anda `supabase gen types` ile şema tiplerini üret (bugün `types.ts` elle yazılmış; `deposit_status`, `card_fee_amount`, `idempotency_key`, `rating_count` alanları tipte **hiç yok**).

**Efor:** M–L (2–3 gün) · tek seferlik ve kalıcı

**Doğrulama:** `npm run lint` katı modda temiz geçmeli; Edge Function'lar da denetlenmeli.

---

### [P0] Bus factor 1 — kodu okuyabilecek tek bir insan yok

**Kanıt:** Git geçmişi: **198 commit, 156'sı (%79) Claude oturumları, 42'si (%21) kurucu.** Proje 16 Temmuz 2026'da başlamış — 18 günde 198 commit. `CLAUDE.md:3-5` durumu açıkça yazıyor: *"Proje sahibi (kurucu) yazılımcı DEĞİLDİR."* Karar K-7.1: tek kurucu + Claude.

**Ek kanıt — giriş kapısı bozuk:** `README.md`'nin işaret ettiği **6 yoldan 5'i mevcut değil**: `components/TeamLineupBoard.tsx`, `views/MyTeam.tsx`, `components/RefereeScoreModule.tsx`, `services/geoService.ts`, `services/pitchService.ts`, `store/` dizini. Ayrıca "Leaflet entegrasyonuyla" diyor — saha keşfi artık maplibre kullanıyor. Yeni bir mühendisin okuyacağı ilk dosya, olmayan dosyalara yönlendiriyor.

**Mevcut durum:** 124.623 satır kodun %79'unun yazarı bir AI oturumu. İnsan tarafında kodu okuyup müdahale edebilecek kimse yok. Yorumların %79'u Türkçe (kalite yüksek, "neden"i anlatıyor) ama bu da uluslararası işe alım havuzunu daraltıyor.

**Risk:** Bir üretim olayında — ödeme kesintisi, veri sızıntısı, kırık migration — **kod tabanını okuyup acil müdahale edebilecek hiç kimse yok.** Bu, bu rapordaki diğer tüm bulgulardan daha acildir, çünkü diğerlerinin telafisi bu olmadan sürdürülemez. Katı tip modunu açmak, testleri yazmak, P0'ları kapatmak — hepsi aynı tek kişiye bağlı.

**Çözüm:** Sırayla: (a) `README.md`'yi gerçekle uyumlu hale getir + tek sayfalık mimari şeması ekle — 1 günlük iş, bir sonraki mühendisin ilk haftasını kurtarır; (b) `CLAUDE.md` zaten iyi bir giriş kapısı, onu README'den işaret et; (c) orta vadede kodu okuyabilen ikinci bir insan — yarı zamanlı danışman bile bus factor'ü 2 yapar.

**Efor:** S (doküman) · kalıcı çözüm kurucu kararı

**Doğrulama:** README'deki her dosya yolu gerçekten var olmalı.

---

### [P1] Acil durdurma anahtarı 554 fonksiyondan yalnız 8'ini kapsıyor

**Kanıt:** Canlı ölçüm: `require_admin_write()` fonksiyonunu çağıran fonksiyon sayısı **8**. Toplam `SECURITY DEFINER` fonksiyon **554**. `app_config.admin_readonly_mode` ayarı panelde "Acil durdurma" olarak sunuluyor.

**Risk:** Bir olay anında "her şeyi durdur" düğmesine basarsınız ve **sistemin %98'i çalışmaya devam eder**. Kill-switch'e güvenmek, olmayan bir güvenceye güvenmektir.

**Çözüm:** Ya kapsamı para yazan tüm RPC'lere genişlet, ya panelde adını ve açıklamasını gerçeğe indir ("yalnız admin yazma işlemlerini durdurur").

**Efor:** M

---

### [P1] Özellik bayrakları hiçbir sunucu kapısına bağlı değil

**Kanıt:** `is_feature_enabled()` fonksiyonunu çağıran fonksiyon sayısı canlıda **0** (yalnız kendi tanımı). İstemci tarafında bayrak kontrolü yalnız `admin-panel/` içinde, **6 çağrı yeri**; tüketici uygulamasında **0**. Kapalı modüllerin RPC'leri (`admin_delete_community`, `admin_create_promo_code` vb.) `authenticated`'a açık.

**Mevcut durum:** Bayrak kapatmak yalnız admin menüsünden gizliyor. `feature_flags` tablosundaki 6 bayraktan 2'si (`module_loyalty`, `broadcast_scheduling`) hiçbir yerde okunmuyor.

**Risk:** "Kapsam dışı modülü kapattım" güvencesi yanlış. Ayrıca bayrak değişikliği için sayfanın yenilenmesi gerekiyor (`refresh()` tanımlı ama hiç çağrılmıyor).

**Çözüm:** Kapsam dışı modüllerin RPC'lerinden `REVOKE`; bayrağı gerçekten sunucu kapısına bağla veya bayrak kavramını kaldırıp yetkiyle yönet.

**Efor:** M

---

### [P1] Yönetim panelindeki 9 ayar hiçbir şey yapmıyor

**Kanıt:** Canlı ölçüm — 554 fonksiyon gövdesinde hiç geçmeyen `app_config` anahtarları:

| Anahtar | Panelde ne vaat ediyor |
|---|---|
| `fairplay_warn_threshold` | "Bu puanın altında uyarı gösterilir" |
| `fairplay_restrict_threshold` | "Bu puanın altında katılım kısıtlanır" |
| `fairplay_ban_threshold` | "Bu puanın altında geçici ban" |
| `fairplay_noshow_penalty` | "No-show'da düşülen puan" |
| `fairplay_bad_review_penalty` | "Kötü değerlendirmede düşülen puan" |
| `fairplay_good_match_bonus` | "Sorunsuz maçta eklenen puan" |
| `match_confirm_window_hours` | "Kaç saat önce kadro kesinleşir" |
| `direct_booking_deposit_default_pct` | "Varsayılan kapora yüzdesi" |
| `match_min_player_pct` | "Minimum oyuncu yüzdesi" |

Yalnız `fairplay_late_cancel_penalty` gerçekten çalışıyor (1 fonksiyon).

**Risk:** Fair-Play kategorisinin 7 ayarından 6'sı ölü. Operatör "ban eşiğini düşüreyim" der, hiçbir şey olmaz, sebebini anlamaz. Projenin kendi kuralı IP-16 ("çalışmayacak tuş çizilmez") panelin kendisinde ihlal ediliyor. **Not:** K-3.6 (no-show işaretleme) kararınız tam olarak `fairplay_noshow_penalty` ayarını canlandıracak.

**Çözüm:** Ya bağla ya panelden kaldır. Ölü ayar, yanlış güvenden daha kötüdür.

**Efor:** S (kaldırma) / M (bağlama)

---

### [P1] Admin paneli tüketici mobil uygulamasının paketine giriyor

**Kanıt:** `vite.config.ts:63-68` iki giriş noktası (`index.html` + `admin-panel/admin.html`) aynı `dist/` klasörüne yazıyor. `capacitor.config.ts:7` `webDir: 'dist'`. `npx cap sync` `dist/` klasörünün **tamamını** native pakete kopyalıyor. Budama adımı repoda **yok**.

**Risk:** Mağazaya yüklenen paket, admin panelinin tüm arayüz kodunu, RPC adlarını ve route yapısını içeriyor. Doğrudan bir yetki açığı değil (koruma sunucuda), ama saldırı yüzeyini gereksiz genişletiyor ve mağaza incelemesinde soru işareti yaratabilir.
`5_GUNLUK_CIKIS_PLANI.md:104` bunu "ayrı entry point ile yönetiliyor" diye çürütülmüş kabul etmiş — **bu çürütme teknik olarak yanlıştır.** Ayrı giriş noktası ayrı *dosya* üretir, ayrı *paket* üretmez.

**Çözüm:** `cap sync` öncesi `dist/admin-panel` budaması veya mobil için ayrı Vite yapılandırması.

**Efor:** S

---

### [P1] Ödeme sağlayıcı adresi güvensiz tarafa düşüyor

**Kanıt:** `create-payment/index.ts:50` — `IYZICO_BASE_URL` yoksa varsayılan `https://api.iyzipay.com`, yani **canlı ödeme ortamı** (sandbox değil). Aynı desen 3 dosyada daha.

**Risk:** `PAYMENT_PROVIDER=IYZICO` yapılıp `BASE_URL` unutulursa gerçek kart çekilir. K-2.1 ile online ödemeye geçtiğiniz gün bu aktif bir tuzak.

**Çözüm:** Varsayılanı sandbox yap; canlı adres yalnız açıkça verildiğinde kullanılsın.

**Efor:** S (<2 saat)

---

### [P1] Demo giriş kapısı güvensiz tarafa düşüyor ve her adreste açılabiliyor

**Kanıt:** `supabaseAuth.ts:336-338` — `VITE_DEMO_ACCOUNTS !== 'false'` mantığı, yani **değişken yoksa demo hesap seçici AÇIK**. `.env.example`'da bu değişken **hiç tanımlı değil**. Ayrıca `:272-295` — URL'ye `?demo=1` eklemek **her alan adında** demo modunu açıyor.

**Risk:** Gerçek kullanıcının gördüğü ilk ekranda demo hesap listesi ve ortak şifre görünebilir.

**Çözüm:** `=== 'true'` mantığına çevir (fail-closed); `?demo=1`'i üretim alan adında etkisizleştir.

**Efor:** S · CPO turunda da onaylanmıştı

---

### [P1] Lansman planındaki iki env bayrağı kodda hiç okunmuyor

**Kanıt:** `5_GUNLUK_CIKIS_PLANI.md:253` kurucuya `VITE_PAYMENTS_ENABLED=false` diyor; `OYUNCU_EDGE_CASE_PLANI.md:284` `VITE_GUEST_MODE=false` diyor. Kodun okuduğu `VITE_*` değişkenlerinin tam listesi 11 tanedir ve **ikisi de bu listede yok**.

**Risk:** Kurucu bu bayrakları girip "ödemeleri ve misafir modunu kapattım" sanacak; hiçbir şey değişmeyecek. Yanlış güvenlik hissi, güvenlik açığından tehlikelidir.

**Çözüm:** Ya bayrakları uygula ya dokümandan sil.

**Efor:** S

---

### [P1] Sürüm numarası dört dosyada elle kopyalanmış

**Kanıt:** `package.json:4`, `android/app/build.gradle:15`, `ios/.../project.pbxproj:376,400`, `.github/workflows/android-release.yml:40` — dördü de `3.0.0`, senkronizasyon mekanizması yok. Git etiketi (`git tag`) **hiç yok**. `.env.example:60`'daki `VITE_APP_VERSION` ölü (derleme anında `package.json`'dan eziliyor).

**Risk:** Sürüm artırıldığında biri unutulur; hata raporunda hangi sürümün konuştuğunu bilemezsiniz. Zorunlu güncelleme mekanizması eklendiğinde (P0-7) bu doğrudan işlevi bozar.

**Çözüm:** `package.json` tek kaynak olsun; Gradle ve Xcode oradan okusun; her sürümde git etiketi.

**Efor:** M

---

### [P1] `.gitignore` üç npm komutunun dosyasını sessizce yutmuş

**Kanıt:** `.gitignore:20` tüm `scripts/` klasörünü yok sayıyor, `:21-30` sekiz istisna beyaz listede. Sonuç: `package.json:20` (`logo:kaynak`) ve `:29-30` (`godview:demo:seed/purge`) komutlarının işaret ettiği dosyalar **ne diskte ne git'te**.

**Risk:** Üç npm komutu çalışmıyor. Daha kötüsü: yeni eklenen hiçbir script commit'lenmiyor ve `git status` bunu göstermiyor. CI'da `build:legal` adımı `continue-on-error: true` ile korunmuş — script kaybolsa bile **CI yeşil kalır ve yasal sayfalar pakete girmez**.

**Çözüm:** `scripts/*` desenini daralt; kayıp dosyaları geri getir veya `package.json`'dan sil.

**Efor:** S

---

### [P1] Global maç aboneliği filtresiz ve hiç kapatılmıyor

**Kanıt:** `store.ts:563` — `matches` tablosuna `event: '*'`, **filtre yok**. `initApp()` içinde kuruluyor (`:551`), `useEffect` değil, temizleme fonksiyonu yok. Diğer 15 aboneliğin tamamı düzgün temizleniyor — bu tek istisna.

**Risk:** Maç lobisi aktifken `slots` alanı sık güncelleniyor; her güncelleme **açık olan her istemciye** gidiyor. Maliyet kullanıcı sayısı × maç hareketliliği olarak çarpımsal büyür. Ayrıca aynı kullanıcı için `notifications` tablosuna **4 ayrı** abonelik açılıyor (aynı satır 4 kez teslim ediliyor).

**Çözüm:** Aboneliğe bölge/ilgi filtresi ekle ve yaşam döngüsüne bağla; `notifications` aboneliklerini tek kanalda birleştir.

**Efor:** M

---

### [P1] Aynı fonksiyon defalarca yeniden tanımlanmış — yetki kapısı silinme riski

**Kanıt:** 398 migration'da **1.064** `CREATE [OR REPLACE] FUNCTION`, **621 farklı ad**, **229 fonksiyon birden fazla kez** (%37). En kötüsü `process_match_at_deadline` — **9 kez**. `create_pitch_booking` ve `admin_update_pitch` da 9'ar kez.

**Risk:** Bir fonksiyonun güncel gövdesini bulmak için 398 dosyayı taramak gerekiyor. Daha tehlikelisi: `RPC_YETKI_ENVANTERI.md`'nin uyardığı gibi, sarmalayıcıyı `CREATE OR REPLACE` ile ezmek **yetki kapısını sessizce silebiliyor** — bu tam olarak `match_block_deposit` bulgusunun (P0-4) oluşma mekanizmasıdır.

**Çözüm:** Kısa vade: canlı fonksiyon gövdesini tek kaynak kabul et (`GECERLILIK_POLITIKASI.md` bunu zaten söylüyor). Orta vade: yetki envanterini otomatik doğrulayan bir denetim sorgusu — beklenen `GRANT` listesiyle canlıyı karşılaştırsın.

**Efor:** M (denetim sorgusu)

---

### [P2] iOS gizlilik beyan dosyası yok

**Kanıt:** `ios/App/` altında `PrivacyInfo.xcprivacy` **yok**. Depo kendi planında da bunu engelleyici olarak listelemiş (`5_GUNLUK_CIKIS_PLANI.md:95`).

**Risk:** App Store Connect yüklemesi ITMS-91053 ile takılır. Mağaza gönderiminden önce şart.

**Efor:** S

---

### [P2] Dört farklı "SQL nereye yazılır" cevabı var

**Kanıt:** `supabase/migrations/` (tek canlı yol, 398 dosya) · `supabase/sql/` (3 dosya, ölü arşiv — başlığı "Dashboard SQL Editor'e yapıştırın" diyor, yani playbook'un yasakladığı yöntem) · `supabase/seeds/` (9 dosya, `config.toml`'un aradığı `seed.sql` **yok**) · kök dizinde yetim `supabase_migration.sql`.

**Risk:** Kafa karışıklığı ve yanlış yola yazma riski.

**Efor:** S (temizlik)

---

### [P2] Kullanılmayan üç bağımlılık — biri mağaza incelemesi riski

**Kanıt:** Kod, CSS, script ve HTML taramasında **sıfır referans**: `pdfkit ^0.18.0` · `lightningcss ^1.32.0` · **`@capacitor/camera ^8.2.0`**. Fotoğraf seçimi tamamen `<input type="file">` ile yapılıyor (`ProfileEditSheet.tsx:215`, `PhotoManager.tsx:161`, `ProfileInfoPage.tsx:214`, `ServiceProfile.tsx:596`). Ayrıca `@capacitor/local-notifications` yapılandırılmış ama JS'ten hiç çağrılmıyor.

**Risk:** `@capacitor/camera` native izin manifest'ine **kamera izni** ekliyor. Mağaza incelemesinde "kullanmadığınız bir izni neden istiyorsunuz?" sorusu doğurur — Apple bu gerekçeyle ret verebiliyor. `pdfkit` ayrıca Node hedefli bir kütüphane; tarayıcı paketinde gereksiz yük.

**Çözüm:** Üçünü de kaldır, `npx cap sync` ile izinleri tazele.

**Efor:** S (<2 saat) · mağaza gönderiminden önce

---

### [P2] İki harita motoru aynı anda pakette

**Kanıt:** `maplibre-gl` + `react-map-gl` → `views/PitchDiscovery.tsx:11-12` (ana harita). `leaflet` + `react-leaflet` → `views/ServiceProfile.tsx:21-22` ve `components/map/mapBase.ts:10`. `mapBase.ts` her iki motorun CSS'ini birden taşıyor (`:91-134` leaflet, `:167-187` maplibre) — geçiş bilinçli başlatılmış (`:165` yorumu maplibre'nin zoom'da pin kaymasını çözdüğünü açıklıyor) ama **tamamlanmamış**.

**Risk:** İki harita motoru, iki CSS seti, iki pin API'si production paketinde. Paket boyutu ve bakım yükü iki katı.

**Çözüm:** `ServiceProfile.tsx` ve `mapBase.ts`'i maplibre'ye taşı; `leaflet`, `react-leaflet`, `@types/leaflet` üçlüsünü kaldır.

**Efor:** M

---

### [P2] Yasal ispat kayıtları sessizce kaybolabiliyor

**Kanıt:** `.catch(() => {})` deseniyle tamamen sessiz yutulan **39** çağrı var. En kritikleri: `App.tsx:285` **KVKK ve Kullanım Şartları onayının kaydı** · `views/GuardianConsentForm.tsx:99` **veli onayı kaydı** (18 yaş altı için yasal zorunluluk) · `store.ts:883,899,916,965,999` **beş ayrı admin denetim kaydı** (saha/kaleci/hakem silme işlemleri iz bırakmadan geçebilir) · `views/WalletScreen.tsx:382,681,686` çekim önizlemesi, varsayılan kart ve kart silme.

**Mevcut durum:** Genel hata disiplini aslında iyi — 907 `catch` bloğunun büyük kısmı çeviriyor ve fırlatıyor, boş `catch {}` sayısı yalnız 2. Sorun bu 39 bilinçli "en-iyi-çaba" çağrısının **yasal ve mali ispat gerektiren kayıtlarda** yoğunlaşması.

**Risk:** KVKK onayının kaydı düşerse, bir şikâyette onayı aldığınızı ispat edemezsiniz. Kart silme başarısızsa kullanıcı sildiğini sandığı kartla ödeme yapar.

**Çözüm:** Bu üç grubu (`recordUserConsents`, `recordUserConsent('VELI')`, `persistAdminLog`) çevrimdışı kuyruğa (`services/offline/outbox.ts` — altyapı zaten var) bağla; kart işlemlerinde hatayı kullanıcıya göster.

**Efor:** M

---

### [P2] Boş üçüncü Supabase projesi aktif duruyor

**Kanıt:** `Hadi` projesi (ap-southeast-2) `ACTIVE_HEALTHY`, `public` şemasında **0 tablo**.

**Risk:** Gereksiz maliyet ve karışıklık; yanlış projeye bağlanma riski.

**Efor:** S

---

## Kayda değer güçlü yanlar

Bu tur boyunca **canlıda doğruladığım** iyi mühendislik:

| Ne | Ölçüm |
|---|---|
| **Migration sapması sıfır** | Repo 398 = canlı 398, ilk/son birebir. "Defterde yok" denen 8 baseline de defterde. |
| **`search_path` disiplini %100** | 554 `SECURITY DEFINER` fonksiyonun **tamamında** `search_path` sabitlenmiş. Bu klasik bir Postgres açığıdır ve tek istisna bırakılmamış. |
| **`profiles` sütun düzeyinde korumalı** | İki ayrı bekçi tetikleyici; kullanıcı kendi cezasını kaldıramıyor, bakiyesini değiştiremiyor, rolünü yükseltemiyor. Referans kalitesinde. |
| **Anonim yazma yok** | Anonim role yazma izni veren tek bir politika bile yok. "Herkese açık" politika sayısı: 0. |
| **Çifte rezervasyon DB seviyesinde engelli** | `pitch_bookings` üzerinde GiST `EXCLUDE` kısıtı. |
| **Sır sızıntısı yok** | `gitleaks` tam geçmişle çalışıyor, allowlist tek anahtarın tam metni. İmzalama anahtarları, `.p8`, `google-services.json` — hiçbiri takip edilmiyor. |
| **Migration değişmezliği CI ile zorlanıyor** | `migration-immutability.yml` eski dosyanın değiştirilmesini reddediyor. Denetimdeki en olgun kontrol. |
| **Kod disiplini** | 0 adet `@ts-ignore`, 2 adet boş `catch`, 1426 test yeşil, 110 test dosyası. |

---

## ⚠️ ÇAKIŞMALAR

### ÇAKIŞMA 1 — CPO'nun wedge takvimi ↔ CTO'nun güven sınırı borcu
> **CPO (K-1.1):** Link altyapısı + kaptan para paneli, ~5 iş günü, wedge'in temeli.
> **CTO:** Wedge online ödemeyle çalışır; online ödeme açılmadan önce beş P0 kapanmalı (maç kaydı yazımı, iade saati, kapora tabanı, kapora bloke, bildirim yazımı). Bunlar ~2 gün.
>
> **Entegre çözüm:** Sıra değişsin, süre değişmesin. **P-3 (güven sınırı, 2 gün) → P-1 (link altyapısı) → P-2 (kaptan paneli).** Güven sınırı paketi wedge'i geciktirmez; wedge'in üstüne kurulacağı zemini sağlamlaştırır. Toplam ~7 gün.
> **CEO kararı gerekiyor mu:** hayır — mühendislik sıralaması, önerim bu.

### ÇAKIŞMA 2 — Demo verisinin açık kalması ↔ staging eksikliği
> **Kurucu kararı:** Demo verisi "piyasaya çıkıyoruz" denene kadar açık kalsın.
> **CTO:** Staging olmadığı için demo veri **canlı veritabanında** duruyor ve gerçek veriyle karışıyor. Ölçüm (K-1.4) kurulduğunda "başarılı maç" sayacı sahte maçları da sayacak.
>
> **Entegre çözüm:** Staging projesini uyandırın, demo veriyi **oraya** taşıyın. Böylece hem demo ortamınız olur hem canlı temiz kalır hem de ölçüm ilk günden doğru çalışır.
> **CEO kararı gerekiyor mu:** **evet** — staging aylık ek maliyet demek.

---

## AŞAMA 2b — CEO'YA SORULAR

**S1. Staging ortamı için aylık ek maliyeti kabul ediyor musunuz?**
*Neden:* `oyna-staging` projeniz var ama kapalı. Açık tutmak Supabase'de aylık ücret demek. Kapalı tutmak, her migration'ı ve her testi canlıda denemek demek.
*Cevaba göre ne değişir:* Migration geri alma provası yapılabilir mi; CI canlıdan ayrılabilir mi; demo veri nereye taşınır.
*Önerim:* **Açın.** K-2.1 ile gerçek para akacak; para akan bir sistemi denemeden değiştiremezsiniz.

**S2. Ödeme sağlayıcıya geçiş tarihini biliyor muyuz?**
*Neden:* İyzico sözleşmesi kritik yolda. Yukarıdaki beş P0'ın aciliyeti buna bağlı — bugün 33 tanıdık kullanıcıyla risk düşük, gerçek para aktığı gün yüksek.
*Cevaba göre ne değişir:* Güven sınırı paketinin ne zaman yapılacağı.

**S3. Uygulamayı Türkiye'ye daha yakın bir bölgeye taşımak ister misiniz?**
*Neden:* Veritabanınız **Singapur**'da. Türkiye'den her istek yaklaşık yarım dünya dolaşıyor. Ayrıca kullanıcı verisinin yurt dışında tutulması KVKK açısından ayrı bir başlık (Güvenlik turunda ele alınacak).
*Cevaba göre ne değişir:* Taşıma bir kerelik ciddi bir operasyon; erken yapılırsa ucuz, kullanıcı çoğaldıkça pahalı.
*Önerim:* Frankfurt'a taşımayı lansmandan önce değerlendirin — staging zaten orada.

**S4. Boş duran `Hadi` Supabase projesini kapatabilir miyim?**
*Neden:* Aktif, sağlıklı, içinde hiç tablo yok. Gereksiz maliyet ve karışıklık.

**S5. Mağaza sürüm numarasını kim artıracak?**
*Neden:* Şu an dört dosyada elle. Zorunlu güncelleme mekanizması kurulunca bu doğrudan işlevsel hale gelir — yanlış numara, kullanıcıları kilitler.
*Önerim:* Otomatikleştirelim; tek kurucu için elle senkronizasyon sürdürülemez.

---

## AŞAMA 3 — KAPANIŞ

### Canlıya geçmeden önce yapılması şart 3 şey

**1. Güven sınırını sütun düzeyine indirin (5 P0, ~2 gün).**
`matches` tablosunun para sütunlarını kapatın; iade fonksiyonunun saati kendisi türetsin; kapora tabanı sunucuda tanımlansın; `match_block_deposit` dışarıya kapatılsın; bildirim yazma yetkisi alıcıya baksın. Bunlar bugün zarar vermiyor çünkü 33 tanıdık kullanıcınız var — **gerçek para aktığı gün hepsi aktif hale gelir.**

**2. Staging ortamını açın.**
Para akan bir sistemi denemeden değiştiremezsiniz. Migration geri alma provası, CI ayrımı ve demo verinin canlıdan çıkarılması aynı anda çözülür.

**3. Zorunlu güncelleme mekanizmasını kurun.**
Bugün ne kullanıcıyı güncellemeye zorlayabiliyor ne mağaza onayı olmadan yama atabiliyorsunuz. Bir ödeme hatası bulunduğunda tek seçeneğiniz beklemek olur. Altyapı hazır; iş yalnız istemcide.

### Hızlı kazanımlar (her biri 2 saatin altında)

| # | İş | Etki |
|---|---|---|
| 1 | `process_tiered_refund` ve `match_block_deposit`'ten `authenticated` yetkisini kaldır | İki P0 tek komutla kapanır |
| 2 | `notifications_insert_own_sender` politikasını kaldır | Kimlik taklidi kapanır |
| 3 | `IYZICO_BASE_URL` varsayılanını sandbox yap | Yanlışlıkla gerçek kart çekme riski biter |
| 4 | `VITE_DEMO_ACCOUNTS` mantığını `=== 'true'` yap, `?demo=1`'i üretimde kapat | Giriş ekranı temizlenir |
| 5 | 9 ölü ayarı panelden gizle | Operatör yanılgısı biter |
| 6 | `Hadi` projesini kapat, `supabase/sql/` klasörünü arşive taşı | Maliyet ve karışıklık azalır |

### Kaçınılması gereken en büyük stratejik hata

> **Yeşil CI'yı güvence sanmak.**

`npm run lint` temiz, 1426 test yeşil, migration sapması sıfır — bu tablo insana "sistem sağlam" dedirtir. Ama TypeScript'in katı modu kapalı olduğu için tip denetimi para hatalarını **hiç aramıyor**; testler ise bu turda bulduğum beş P0'ın **hiçbirini** yakalamıyor, çünkü hepsi uygulamanın kendi akışının *dışında* — doğrudan veritabanına yazarak istismar ediliyor.

Tek kurucu için en tehlikeli şey bilmediği bir hata değil, **bildiğini sandığı bir güvencedir.** Bir sonraki mühendislik yatırımınız yeni özellik değil, **yeşilin gerçekten yeşil olması** olmalı: katı tip modu, sunucu tarafı yetki envanteri denetimi ve para değişmezlerini sürekli kontrol eden bir iş. Bu üçü kurulduktan sonra hızlı gidebilirsiniz; öncesinde her hız artışı riski çarpar.

---

*Hazırlayan: Chief Technology Officer · OYNA Kıdemli Danışma Kurulu · 3 Ağustos 2026*
*Sıradaki rol: Software Architect — konuşmadan önce `docs/board/DECISIONS.md` okunacak.*
