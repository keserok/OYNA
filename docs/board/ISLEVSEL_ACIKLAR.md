# 🔎 İşlevsel Açıklar — kanıtlı bulgular ve karar listesi

**Tarih:** 4 Ağustos 2026 · **Kaynak:** danışma kurulu 7 rolünün kapanmayan maddeleri
+ bu oturumda yapılan bağımsız tarama
**Durum:** ⏳ **karar bekliyor** — hiçbiri uygulanmadı

> Bu belgedeki her satır **canlı sistemden ölçülmüş** bir gerçektir. Tahmin,
> "muhtemelen", "olabilir" yok. Her bulgunun altında ya bir dosya:satır ya da
> canlı veritabanından çıkan bir sayı vardır.

---

## 0. Bir bakışta

| # | Bulgu | Bugün ne oluyor | Kanıt | Zorluk |
|---|---|---|---|---|
| **A1** | Maç hatırlatmasına basınca hiçbir şey olmuyor | 36 bildirim ölü | canlı: 36/36 yanlış bağlantı | 🟢 1 satır |
| **A2** | Hatırlatma yanlış saat söylüyor | "24 saat sonra" derken 5,9 saat kalmış | canlı: 3 vaka | 🟢 küçük |
| **A3** | İade bildirimi cüzdanı açmıyor | 10 bildirim ana ekrana düşüyor | canlı: 10/10 | 🟢 küçük |
| **A4** | Bazı bildirimler hiç tıklanamıyor | saha sahibi + destek bildirimleri | canlı: 31 kayıt | 🟡 orta |
| **A5** | Bildirim kapatma düğmeleri çalışmıyor | 51 kapalı anahtar yok sayılıyor | canlı: 35 kullanıcı | 🟡 orta |
| **A6** | Panelden düzenlenen metinler kullanılmıyor | 51 şablonun 36'sı hiç gönderilmedi | canlı sayım | 🔴 büyük |
| **A7** | Saha sahibi onay bildirimi tıklanamıyor | 1 bildirim | canlı: `OWNER_PANEL` | 🟢 A4 ile aynı |
| **A8** | "Sessiz saatler" uygulama içinde yok | yalnız push'ta var, push kapalı | 0 çağıran | 🟢 bilgi |
| **B1** | Sahte saha puanları | 5 saha sıfır oyla ★ gösteriyor | canlı: 6 sahanın 5'i | 🟢 küçük |
| **B2** | Referans kodu girilecek yer yok | davet sistemi yarım | 0 çağrı yeri | 🟡 orta |
| **C1** | 6 "fair play" ayarı boşa çalışıyor | panelde var, arkasında sistem yok | 0 okuyucu | 🟢 temizlik |
| **C2** | 2 maç ayarı okunmuyor | değiştirsen bir şey olmaz | 0 okuyucu | 🟢 temizlik |
| **C3** | Kaleci sözleşmesi iki ayrı yerde | metin ikiye ayrılmış, biri ölü | kod + config | 🟡 orta |
| **D1** | Bozuk maç sonsuza dek denenir | süpürücü aynı hataya takılır | `NEEDS_REVIEW` yok | 🟡 orta |
| **D2** | Bildirim izni değersiz isteniyor | 35 kişiden 0'ı izin vermiş | canlı: 0 jeton | 🟡 orta |
| **D3** | Zorunlu güncelleme yok | eski sürüm sonsuza dek çalışır | yok | 🔴 büyük |
| **E1** | Saha listesi tümünü çekiyor | bugün 6 saha — sorun değil | kod | 🟡 ileride |

---

## A. BİLDİRİM SİSTEMİ — en büyük küme

Bu uygulamanın kalbi bildirimdir: maç var, yer açıldı, para iade edildi.
Tarama şunu gösterdi: **bildirimler gidiyor ama yarısı bir işe yaramıyor.**

Bugüne kadar üretilmiş **128 bildirimin 78'i** (%61) ya tıklanınca hiçbir şey
yapmıyor ya da yanlış ekranı açıyor.

### A1 — Maç hatırlatmasına basınca hiçbir şey olmuyor 🔴 EN ÖNEMLİ

**Ne oluyor:** Maçından 1 ve 24 saat önce "⏰ Maç Hatırlatması" bildirimi
geliyor. Oyuncu üstüne basıyor. **Hiçbir şey olmuyor.** Ekran açılmıyor, hata da
çıkmıyor. Sessizce yutuluyor.

**Neden:** Sunucu bildirime `/match/<maç-no>` adresini yazıyor. Uygulama ise
güvenlik gereği yalnız `oyna://match/<maç-no>` biçimini kabul ediyor —
`notifications/pushService.ts:170`. Farklı biçim gelince güvenlik duvarı devreye
girip bağlantıyı engelliyor.

**Kanıt (canlı veritabanı):** 36 `MATCH_REMINDER` bildiriminin **36'sı da** yanlış
biçimde. Kaynak: `send_match_reminders` fonksiyonu, `'/match/' || m.id::text`.

**İkinci katman:** `views/Notifications.tsx:201` — bağlantı varsa denenir ve
**sonuç ne olursa olsun** oradan çıkılır. Yani "maç numarası da var, onu kullan"
yedek yolu hiç çalışmıyor. Bağlantı bozuksa iş orada bitiyor.

**Çözüm:** Sunucudaki tek satırı `'oyna://match/' || m.id::text` yapmak.
Ayrıca uygulamada yedek yolu açmak (bağlantı başarısızsa maç numarasıyla dene).

**Bozma riski:** Yok denecek kadar az. Gönderilen yeni bildirimler doğru olur.
**Geçmiş 36 bildirim de düzeltilebilir** (tek seferlik güncelleme) — bu ayrı bir
karardır, aşağıda soruyorum.

---

### A2 — Hatırlatma yanlış saat söylüyor 🟠 YENİ BULGU

**Ne oluyor:** Maça 5,9 saat kala oyuncuya **"24 saat sonra başlıyor"** yazan bir
hatırlatma gitmiş.

**Neden:** Sunucudaki kural "24 saatlik pencerenin içindeyse 24 saatlik mesajı
gönder" diyor. Maç 6 saat sonraysa da bu pencerenin içindedir. Metin sabit
yazıldığı için gerçeği söylemiyor.

**Kanıt (canlı):** "24 saat sonra" diyen 29 bildirimin **3'ünde** gerçekte 20
saatten az kalmıştı; en kötüsü **5,9 saat**. "1 saat sonra" diyenlerin 7'si de
doğruydu (hepsinde 0,9 saat kalmıştı).

> **Neden bu önemli:** Halı sahada maçların çoğu **aynı gün** kurulur. Yani
> gerçek kullanımda bu 3 vaka değil, **çoğunluk** olur. Oyuncu "daha 24 saat var"
> deyip kafasını çevirir, maçı kaçırır.

**Çözüm:** Metni sabit yazmak yerine kalan gerçek süreyi hesaplayıp yazmak —
"3 saat sonra", "yarın 20:00'de" gibi. Ayrıca maça zaten 20 saatten az kalmışsa
24 saatlik hatırlatmayı hiç göndermemek (birazdan 1 saatlik zaten gidecek).

**Bozma riski:** Düşük. Yalnız metin ve bir koşul değişir; kime gideceği aynı kalır.

---

### A3 — İade bildirimi cüzdanı açmıyor 🟠

**Ne oluyor:** Paran iade edilince "iade edildi" bildirimi geliyor. Basıyorsun —
**ana ekran** açılıyor. Parayı görmek için cüzdanı elle bulman gerekiyor.

**Neden:** Bildirimdeki adres `oyna://wallet`. Uygulamanın izin verdiği ekran
listesinde (`pushService.ts:154`) `wallet` yok: yalnız `match, profile, team,
messages, tactic, social` var. Tanımadığı adresi güvenlik gereği ana ekrana
düşürüyor.

**Kanıt (canlı):** 10 iade bildiriminin 10'u da böyle.

**Çözüm:** İzinli ekran listesine `wallet` eklemek ve cüzdan ekranına
yönlendirmek. Aynı anda `bookings` (rezervasyonlarım) ve `owner` (saha sahibi
paneli) da eklenirse A4/A7 de kapanır.

**Bozma riski:** Düşük — listeye ekleme yapılıyor, mevcut adresler aynen çalışır.

---

### A4 + A7 — Bazı bildirimler hiç tıklanamıyor 🟠

**Ne oluyor:** Bazı bildirimlerin **hiç adresi yok.** Basınca kesinlikle hiçbir
şey olmuyor.

**Kanıt (canlı):** 31 bildirim adressiz —

| Bildirim | Adet | Bugün hâlâ üretiliyor mu |
|---|---|---|
| `BOOKING_REQUEST` (rezervasyon talebi) | 20 | ❌ hayır, eski |
| `BOOKING_CONFIRMED` (rezervasyon onaylandı) | 5 | ❌ hayır, eski |
| `owner_new_booking` (sahibine yeni rezervasyon) | 5 | ✅ **evet** |
| `SUPPORT_REPLY` (destek cevabı) | 1 | ✅ **evet** |
| `pitch_change_request_result` (A7 — saha değişikliği sonucu) | 1 | ✅ evet, ama adresi geçersiz (`OWNER_PANEL`) |

Yani **bugün hâlâ üretilen 3 tür** bildirim tıklanamıyor. Diğerleri geçmişte
kalmış, artık üretilmiyor (canlı fonksiyonlarda karşılığı yok).

**Çözüm:** Bu üç bildirime doğru adresi yazmak + A3'teki ekran listesini genişletmek.

**Bozma riski:** Düşük. Yeni alan doldurmak eski davranışı değiştirmez.

---

### A5 — Bildirim kapatma düğmeleri çalışmıyor 🔴 GİZLİ AMA CİDDİ

**Ne oluyor:** Ayarlar → Bildirimler ekranında düğmeleri kapatıyorsun. Kapanmış
gibi görünüyor, kaydediliyor. **Ama bildirimler gelmeye devam ediyor.**

**Neden:** Veritabanında `_notification_pref_enabled` diye "bu kişi bunu
istiyor mu?" sorusunu soran bir fonksiyon **var.** Ama bildirim üreten **49
fonksiyondan sadece 1'i** (o da tek bir dalında) bu soruyu soruyor. Kalan 48'i
tercihe hiç bakmadan gönderiyor.

**Kanıt (canlı):**
- 35 kullanıcının bildirim tercihi kaydı var
- Toplam **51 anahtar kapatılmış**, 19 farklı bildirim türünde
  (`team_chat_message`, `promo_offers`, `friend_request`, `weekly_summary` …)
- **Doğrudan kanıt:** `team_member_invite` bildirimini kapatmış bir kullanıcı,
  kapattıktan sonra o bildirimi **yine almış.**

> **Neden bu önemli:** Bu yalnız rahatsızlık değil. Kullanıcı "kapattım ama
> geliyor" dediğinde uygulamaya güveni biter ve bildirim iznini işletim sistemi
> seviyesinde tümden kapatır. O noktadan sonra **hiçbir** bildirim gönderemezsin.
> Ayrıca KVKK açısından da "verdiğin tercihi uygula" beklentisi vardır.

**Çözüm — iki seçenek:**

| Seçenek | Nasıl | Artı | Eksi |
|---|---|---|---|
| **(a) Merkezî kapı** *(önerim)* | Bildirim yazma işini tek bir kapıdan geçir; kapı tercihi kontrol etsin | Tek yerde çözülür, bir daha unutulmaz | 49 fonksiyona dokunmak gerekir — geniş |
| **(b) Veritabanı seviyesinde bekçi** | Bildirim tablosuna yazmadan önce çalışan bir bekçi kural koy; tercih kapalıysa yazmayı sessizce iptal etsin | **Hiçbir fonksiyona dokunulmaz**, 49'u da anında kapsar | Bekçi kuralları görünmezdir; belgelenmezse ileride kafa karıştırır |

**(b) şıkkını öneriyorum.** Sebep: 49 fonksiyona dokunmak bu projede en büyük
regresyon (çalışan yeri bozma) riskidir. Bekçi kuralı ise tek dosyadır, tek
testle doğrulanır ve **"zorunlu" işaretli bildirimler** (para, güvenlik, iptal)
listesi ile korunur — onlar tercihe bakılmaksızın hep gider.

**Bozma riski:** Orta — ama kontrol edilebilir. Zorunlu liste yanlış kurulursa
kritik bildirim engellenebilir. Bu yüzden: zorunlu liste **beyaz liste** olarak
yazılır (para/iptal/güvenlik her zaman geçer), test yazılır, sağlık denetimine
"kaç bildirim tercih yüzünden engellendi" göstergesi eklenir.

---

### A6 — Panelden düzenlenen bildirim metinleri kullanılmıyor 🔴 BÜYÜK

**Ne oluyor:** Yönetici panelinde 51 bildirim şablonu var; metinlerini
düzenleyebiliyorsun. **Bu metinlerin neredeyse hiçbiri gerçek bildirimlerde
kullanılmıyor.**

**Kanıt (canlı):**
- 51 şablonun **36'sı hiç gönderilmemiş** — hiç kullanılmamış metinler
- Gönderilen 21 bildirim türünün **6'sının şablonu yok** — metni koda gömülü
- Şablonu okuyan tek fonksiyon `notify_from_template`; onu da **yalnızca**
  paneldeki "test gönder" düğmesi çağırıyor (`admin_send_template_test`)

Yani panel **gerçekte gönderilmeyen metinleri** düzenliyor; gerçekte gönderilen
metinler ise koda sabit yazılmış ve panelden değiştirilemiyor.

**Çözüm — üç seçenek:**

| Seçenek | Ne yapılır | Süre | Not |
|---|---|---|---|
| **(a) Dokunma, dürüst etiketle** *(önerim)* | Panelde şablonların yanına "bu metin şu an kullanılmıyor" rozeti koy | çok kısa | Yanlış beklentiyi bitirir, hiçbir şeyi bozmaz |
| **(b) Kullanılmayan 36 şablonu sil** | Paneli sadeleştir | kısa | Geri dönüşü zor; ileride lazım olabilir |
| **(c) Tüm bildirimleri şablona taşı** | 49 fonksiyonu şablon kullanacak şekilde yeniden yaz | **çok uzun** | En doğrusu ama rafa kaldırılacak bir uygulama için orantısız |

**(a) öneriyorum.** Sebebi tek: bugün OYNA'nın **hiç kullanıcısı yok.** Metinleri
panelden değiştirebilmek lansmandan sonra değerli olur. Bugün değerli olan şey,
panele bakınca **yalanla karşılaşmamak.**

---

### A8 — "Sessiz saatler" uygulama içinde yok 🔵 BİLGİ

`_in_quiet_hours` fonksiyonu veritabanında duruyor ama **hiçbir yerden
çağrılmıyor** (0 çağıran). Gece 03:00–09:00 arası bildirim engelleme yalnız push
tarafında (`supabase/functions/send-push`) var — o da `push_live_enabled`
kapalı olduğu için şu an çalışmıyor.

**Sonuç:** Bugün bir zarar yok (uygulama içi bildirim sessiz gelir, telefonu
çaldırmaz). Push açıldığında sessiz saatler **çalışacak.** Aksiyon gerekmiyor;
A5 çözülürken aynı kapıya sessiz saat kontrolü de eklenebilir.

---

## B. GÜVEN VE VİTRİN

### B1 — Sahte saha puanları 🟠

**Ne oluyor:** Saha keşif ekranında her sahanın yanında yıldız puanı görünüyor:
★ 5 · ★ 4,6 · ★ 4,5. Kullanıcı bunu "başkaları puanlamış" diye okur.

**Kanıt (canlı) — 6 sahanın gerçek oy sayısı:**

| Saha | Gösterilen puan | Gerçek oy |
|---|---|---|
| Cumhuriet Gençlik | ★ 5 | **0** |
| Orduspor | ★ 5 | **0** |
| Ahmet Kuru Tesisleri | ★ 4,5 | **0** |
| Olimpiyat | ★ 4,6 | **0** |
| Capo Arena | ★ 3 | 1 |
| VIP Arena | ★ 0 | 0 |

**5 saha, tek bir gerçek oy olmadan puan gösteriyor.** Bu sayılar demo verisi
kurulurken elle yazılmış.

> **Neden bu önemli:** İlk gerçek kullanıcı bir sahaya gidip kötü bir deneyim
> yaşarsa, "OYNA bana 5 yıldız dedi" der. Bu, kurtarılması en zor güven kaybıdır.
> Ayrıca yasal olarak da gerçek olmayan değerlendirme göstermek risklidir.

**Çözüm:** Gerçek oy sayısı 0 ise yıldız yerine **"Henüz puanlanmadı"** yazmak;
oy sayısı azsa (1–2) yıldızın yanında "(1 değerlendirme)" göstermek.
Kod: `views/PitchDiscovery.tsx:398`.

**Bozma riski:** Yok. Yalnızca gösterim değişir, veri değişmez.

---

### B2 — Referans kodu girilecek yer yok 🟠

**Ne oluyor:** Kullanıcı kendi davet kodunu alabiliyor ve paylaşabiliyor. Ama
**kodu alan kişinin gireceği bir ekran yok.**

**Kanıt:** `services/socialService.ts:187` — `redeemReferralCode` fonksiyonu
yazılmış, veritabanında `redeem_referral_code` hazır. Uygulamanın hiçbir yerinden
çağrılmıyor (0 çağrı yeri). Canlıda 1 davet kodu üretilmiş, **0 kullanım.**

**Sonuç:** Davet zinciri baştan kopuk. Halı saha gibi arkadaş grubuyla oynanan
bir işte büyümenin ana yolu bu — ve kapalı.

**Çözüm — iki seçenek:**

| Seçenek | Nerede | Etki |
|---|---|---|
| **(a) Kayıt ekranına "davet kodun var mı?" alanı** *(önerim)* | kayıt akışı | En yüksek dönüşüm; kod tam doğru anda sorulur |
| **(b) Profil → "Davet kodu gir"** | ayarlar | Daha güvenli/küçük ama kimse bulamaz |

**(a) öneriyorum**, ama uyarım var: kayıt ekranı **kimlik ve giriş** bölgesidir
(CLAUDE.md §5 — yüksek riskli). Oraya alan eklemek kayıt akışını test etmeyi
gerektirir. Bu yüzden ayrı bir onay olarak soruyorum.

---

## C. ÖLÜ VE ÇİFT AYARLAR

Panelde ayar görüp değiştirdiğinde bir şeyin değişmesini beklersin. Aşağıdakiler
değişmiyor.

> ⚠️ **Önceki taramamda 17 ölü ayar saymıştım — yanlıştı.** Yalnız veritabanı
> fonksiyonlarına baktığım için, uygulamanın ve edge fonksiyonların okuduğu
> ayarları ölü sanmışım. Tam tarama sonucu **gerçek sayı 9.** Aşağıdakiler
> doğrulanmış hâlidir. (Örneğin `silent_hours_*`, `rate_limit_per_user_per_hour`,
> `sim_decline_amount`, `admin_mfa_required`, `admin_session_max_hours`,
> `admin_idle_timeout_minutes`, `verification_sla_hours` **çalışıyor** — yalnız
> okuyucuları veritabanında değil, panelde ve edge fonksiyonlarda.)

### C1 — 6 "fair play" ayarı boşa çalışıyor 🟢

`fairplay_ban_threshold` (40), `fairplay_restrict_threshold` (60),
`fairplay_warn_threshold` (80), `fairplay_noshow_penalty` (15),
`fairplay_bad_review_penalty` (5), `fairplay_good_match_bonus` (2)

**Hiçbiri okunmuyor.** Sebebi basit: **böyle bir puan sistemi yok.**
`profiles` tablosunda `fairplay` diye bir alan yok. Var olanlar `trust_score` ve
`reliability_score` — bunlar **çalışıyor** (20 profilin `reliability_score`'u,
35 profilin `trust_score`'u varsayılandan farklı; `leave_public_match_slot` ve
`finalize_match` bunları güncelliyor).

Yani: "güvenilirlik puanı" sistemi var ve çalışıyor; "fair play" ayarları ise
hiç yapılmamış ikinci bir sistemin artıkları.

**İstisna:** `fairplay_late_cancel_penalty` (10) **kullanılıyor** —
`_leave_match_quote` içinde geç iptal cezasını hesaplarken. Adı yanıltıcı ama
canlıdır, dokunulmamalı.

**Çözüm:** 6 ölü ayarı silmek + `fairplay_late_cancel_penalty`'i
`late_cancel_penalty_pct` gibi doğru bir adla anmak (ad değişikliği risklidir,
önermiyorum — sadece belgeye not düşmek yeter).

### C2 — 2 maç ayarı okunmuyor 🟢

- `match_confirm_window_hours` (4) — okunmuyor
- `match_min_player_pct` (70) — okunmuyor

Maçın kesinleşme kuralı bunlara bakmıyor. Gerçek kural `match_check_threshold`
fonksiyonunda: **dolan slot ≥ minimum oyuncu** ise maç `CONFIRMED` olur. Yüzde
veya saat penceresi hiç devreye girmiyor.

**Çözüm:** İki ayarı silmek (yanlış beklenti üretiyorlar).

### C3 — Kaleci sözleşmesi iki ayrı yerde duruyor 🟡

**Ne oluyor:** Kaleci bir maçı kabul ederken karşısına hizmet sözleşmesi çıkıyor
ve onaylıyor — bu **çalışıyor** (`views/ServiceDashboard.tsx:2754`).

**Sorun:** Sözleşme metni **iki ayrı yerde** duruyor:
1. Uygulamanın içine sabit yazılmış hâli — kalecinin gerçekten gördüğü metin
2. `app_config.gk_service_contract` içindeki ikinci kopya — **hiçbir yer okumuyor**

Aynısı teminat tutarında da var: kodda `GK_MIN_TEMINAT = 500` sabiti
(`ServiceDashboard.tsx:67`), veritabanında `gk_min_balance = 500`. Bugün aynı
değerler; **biri değişirse diğeri fark etmeyecek.**

> **Neden bu önemli:** Bu bir sözleşme. Kaleci parasal bir yükümlülük altına
> giriyor. "Hangi metni onayladı?" sorusunun **tek** cevabı olmalı. Bugün iki
> cevabı var ve panelden değiştirilen kopya kalecinin gördüğü kopya değil.

**Çözüm — iki seçenek:**

| Seçenek | Ne yapılır | Not |
|---|---|---|
| **(a) Tek kaynağa indir** *(önerim)* | Metin ve teminat tutarı veritabanından okunsun; koddaki sabit kaldırılsın | Doğru olan bu. Panelden değiştirilince kaleci de onu görür |
| **(b) Ölü kopyayı sil** | `app_config.gk_service_contract` silinsin, kod tek kaynak olsun | Daha küçük iş; ama metin değiştirmek için kod değişikliği gerekir |

**(a) öneriyorum** ama şunu belirtmeliyim: burası **para akışı** bölgesidir
(CLAUDE.md §5). Sözleşme metnini onay akışına bağlayan kodu değiştirmek
dikkat ister. Ayrı onay olarak soruyorum.

---

## D. DAYANIKLILIK

### D1 — Bozuk maç sonsuza dek denenir 🟡

**Ne oluyor:** Arka planda çalışan "süpürücü" (askıda kalan işleri toparlayan
otomatik iş) bir maçı işleyemezse, o maçı **her turda yeniden dener.** Hata kalıcı
bir sebepten kaynaklanıyorsa (bozuk veri, eksik kayıt) sonsuza kadar denenir.

**Kanıt:** Kodun ve veritabanının tamamında `NEEDS_REVIEW` diye bir durum yok
(0 sonuç). Yani "bu iş bozuk, elle bakılmalı" diyebileceğimiz bir raf yok.

**Bugün zarar var mı:** Hayır — son 24 saatte 0 hata. Ama bu bir **zaman bombası**:
lansmandan sonra tek bir bozuk kayıt, süpürücüyü sürekli meşgul eder ve gerçek
işler gecikir.

**Çözüm:** Maça bir "kaç kez denendi" sayacı ve 3 denemeden sonra `NEEDS_REVIEW`
durumu eklemek; panelde "elle bakılması gerekenler" listesi göstermek.

**Bozma riski:** Orta — maç durumlarına yeni bir değer eklemek, o değeri
beklemeyen ekranları etkileyebilir. Bu yüzden yeni durum `status` alanına
**değil**, ayrı bir alana yazılmalı.

### D2 — Bildirim izni değersiz isteniyor 🟡

**Ne oluyor:** Kullanıcı giriş yapar yapmaz telefon "OYNA size bildirim göndermek
istiyor" der. Kullanıcı henüz uygulamada hiçbir şey yapmamıştır, neden izin
vereceğini bilmez. `App.tsx:474`.

**Kanıt (canlı):** 35 profil var, bildirim jetonu kaydetmiş **0** kullanıcı.
Yani şu ana kadar **kimse izin vermemiş.**

> Bu iznin telefonda ikinci bir şansı yoktur. "Hayır" diyen kullanıcı, bir daha
> ayarlardan elle açmadıkça bildirim alamaz.

**Çözüm:** İzni girişte değil, **kullanıcı bir maça katıldıktan sonra** ve
öncesinde tek cümlelik bir açıklama ekranıyla istemek:
*"Maçın saatinde hatırlatalım mı? Kadro değişirse haberin olsun."*

**Bozma riski:** Düşük. İznin **ne zaman** istendiği değişir, izin mekanizması aynı.

**Not:** Push zaten kapalı (`push_live_enabled = false`). Bu düzeltme
lansmanda değer üretir, bugün değil. Ama bugün yapılmazsa lansmanda unutulur.

### D3 — Zorunlu güncelleme yok 🔴

**Ne oluyor:** Mağazaya yeni sürüm koyduğunda, eski sürümü kullanan kimseyi
güncellemeye zorlayamıyorsun. Ödeme kurallarında veya sözleşmede kritik bir
değişiklik olduğunda eski sürüm **sonsuza kadar** eski kurallarla çalışır.

**Çözüm:** Veritabanında "en düşük kabul edilen sürüm" ayarı; uygulama açılışta
kendi sürümünü karşılaştırıp gerekirse "güncelle" ekranı göstersin.

**Bozma riski:** Orta-yüksek. Yanlış ayarlanırsa **herkesi uygulamadan kilitler.**
Bu yüzden: ayar varsayılan olarak kapalı gelmeli, panelde iki aşamalı onay
istemeli, ve "sürüm okunamıyorsa geç" kuralı olmalı.

**Dürüst görüşüm:** Bu, uygulama **mağazada yayınlandıktan sonra** anlamlı olur.
Bugün rafa kaldırılan, mağazada olmayan bir uygulama için erken. Ama karar senin.

---

## E. ÖLÇEK

### E1 — Saha listesi hepsini çekiyor 🔵

`views/PitchDiscovery.tsx:543` — yayında ve açık **tüm** sahaları çekiyor,
mesafeye göre sıralamayı telefonda yapıyor.

**Bugün sorun değil:** 6 saha var. Mesafe etiketi ve sıralama **çalışıyor**
(kod: 1135–1143. satırlar).

**Ne zaman sorun olur:** ~200 sahayı geçince liste yavaşlar ve mobil veri harcar.
Veritabanında hazır `get_nearby_pitches` fonksiyonu **zaten var** ama saha
keşif ekranı onu kullanmıyor (yalnız gösterge sayımları kullanıyor).

**Önerim:** Bugün dokunma. Ordu'da 19 ilçe hazır, 4 saha yayında. Bu, 200 sahaya
ulaştığında yapılacak iştir. Not olarak `OYNA_PRENSIPLER.md`'ye düşülür.

---

## Kapanış notu

Bu listede **uydurma yok.** Her madde ya canlı veritabanından sayılmış ya da
dosya:satır ile gösterilmiştir. İki yerde kendi önceki hatamı düzelttim
(C bölümündeki 17→9 sayısı, A8'in zararsız olduğu).

Uygulama mühendislik olarak sağlam. Bulunanların tamamı **"yapılmış ama ucu
bağlanmamış"** türünden. Bu iyi haber: hiçbiri baştan yazmayı gerektirmiyor.
