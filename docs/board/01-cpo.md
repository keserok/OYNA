# 01 — CPO (Chief Product Officer) · OYNA Kıdemli Danışma Kurulu

> **Tarih:** 3 Ağustos 2026
> **Rol:** Chief Product Officer
> **Yöntem:** `main` dalı (commit `da54bff`) + canlı Supabase projesi `OYNA` (`iikvzgyccvgcybzdfwlv`) salt-okunur incelendi.
> 8 paralel keşif ekibi + canlı şema/veri/fonksiyon doğrulaması. Hiçbir canlı veri değiştirilmedi.
> **Kanıt kuralı:** Her bulgu `dosya:satır` veya SQL nesne adı taşır. Kanıtlanamayan hiçbir iddia bulgu olarak yazılmadı.

---

## 0. Bağlam tablosunda kodun kendi doldurduğu satırlar

CEO'nun boş bıraktığı alanların bir kısmını repo ve canlı veritabanı zaten cevaplıyor. Tahmin yürütmedim; okudum:

| Alan | Kodun/canlının söylediği | Kaynak |
|---|---|---|
| Teknoloji yığını | React 19 + **Capacitor** (Expo/React Native **değil**) + Vite + Supabase/PostgreSQL 17 + 16 Edge Function | `package.json`, `capacitor.config.ts` |
| İlk hedef pazar | **Ordu** — 19 ilçenin tamamı kapsamda açık | `region_coverage` (19 satır, hepsi `is_active=true`) |
| Gerçek arz | **6 tesis kayıtlı, yalnız 4'ü yayında, 13 kort.** Hepsi tek ilçede: Altınordu | `pitches`, `courts` canlı sorgu |
| Ödeme sağlayıcı | İyzico — `app_config.payment_provider = IYZICO`, ama `payment_mode_global = **CASH_ONLY**` | `app_config`, `resolve_payment_mode()` |
| Gelir modeli | MODEL_A: saha komisyonu **%15** + oyuncuya **%5 markup**; kaleci/hakem **%10**; kart işlem bedeli %2,5 (geçiş kalemi) | `commission_config`, `_pitch_agreement()` |
| "Canlı" tanımı | `5_GUNLUK_CIKIS_PLANI.md`: **"OYNA v1 — Nakit Mod"**; iOS ~12. gün, Play ~26. gün | `docs/master/5_GUNLUK_CIKIS_PLANI.md:12-75` |
| Tüzel yapı | Şahıs şirketi (Miraç Kerem Çürüksulu · Kartal VD 2650883645) | `docs/master/LANSMAN_ENGELLERI_VE_ASMA_PLANI.md:22` |
| Mevcut kullanım | 33 profil, 11'i onboarding'i bitirmiş, 20 maç (17'si demo), 29 rezervasyon | canlı sorgu |

**Cevaplanamayan ve gerçekten CEO'ya sorulması gerekenler §3'te.**

---

## AŞAMA 1 — Açılış strateji tavsiyeleri

Kod okumadan önce, dünya ölçeğinde çift taraflı pazaryeri kurmuş biri olarak OYNA'ya özgü 5 tavsiye:

### 1.1 Wedge "saha kiralamak" değil, "parayı toplamak" olmalı
Türkiye'de halı saha kiralamak zaten kolay: sahayı ararsın. Zor olan **10 kişiden 240'ar lira toplamaktır.** Kaptan bunu WhatsApp'ta, elle, tek tek yapar ve genelde 2-3 kişinin parasını kendi cebinden karşılar. OYNA'nın kodunda bu problemi çözen mimari **zaten var** (`player_buy_slots_v2` — herkes kendi slotunu öder, kaptan kaporayı bloke eder, kadro dolunca fazlası iade). Ama ürünün dışa dönük anlatısı hâlâ "saha kirala". Pazarlama mesajı, mağaza açıklaması ve ilk ekran **"Parayı arkadaşlarından tek tıkla topla"** olmalı. Booking'in "en düşük fiyat garantisi" gibi, bu sizin tek cümlelik vaadiniz.

### 1.2 Ordu'da şehir değil, **mahalle** doygunluğu hedefleyin
19 ilçenin tamamı kapsamda açık, ama 4 yayında tesisin **hepsi Altınordu'da**. Uber'in ilk yıl dersi şudur: bir şehri açmak, o şehirde bekleme süresini 5 dakikaya indirmektir; kapsama haritasını boyamak değil. 18 ilçeyi kapatın, Altınordu'da 4 tesisin **her akşam saatini** doldurun. Bir kullanıcı "istediğim saat hep dolu/hep var" hissini aldığı an, ikinci maçını kurar.

### 1.3 Aracıdan kaçışı (disintermediation) fiyatla değil, **tahsilat garantisiyle** engelleyin
Bugün oyuncu uygulamadan kiralayınca %5 markup ödüyor — yani telefonla aramaktan **pahalı**. Bu, pazaryeri ölümlerinin bir numaralı sebebidir: saha sahibi "beni direkt ara, ucuza veririm" der. Panzehir fiyat kırmak değil; **telefonun yapamadığı işi** uygulamaya kilitlemektir: split ödeme, no-show teminatı, kadro garantisi. Airbnb'nin mesaj sistemini platformda tutmasının sebebi de budur.

### 1.4 Kuzey yıldızı "başarılı maç" ise, onu **ölçün**
`OYNA_MASTER_PRENSIPLER.md:199` kuzey yıldızını "başarılı oynatılan maç" olarak ilan etmiş. Ama bu metriği hesaplayan tek bir sorgu, tek bir pano, tek bir olay yok. Duolingo'nun DAU'yu, Booking'in rezervasyon başına marjı saniye saniye görmesinin sebebi, o metriği ürünün kendisi kadar ciddiye almalarıdır. Ölçülmeyen metrik, metrik değil temennidir.

### 1.5 Arz tarafını "yazılım satarak" değil, **eliyle taşıyarak** kazanın
Saha sahibi için mevcut sistem (defter + WhatsApp + nakit) çalışıyor ve bedava. Onu ikna eden şey özellik değil, **sıfır emek**. İlk 4 tesiste abonman/sabit saatlerini defterinden panele **sizin ekibiniz** girsin (concierge onboarding). Sahibi paneli açtığında "zaten tüm sabit takımlarım burada" görsün. DoorDash ilk restoranlarının menülerini elle girdi; ölçeklenmez ama pazaryeri başlatır.

---

## AŞAMA 2a — BULGULAR

> Format: `[Öncelik] Başlık · Kanıt · Mevcut durum · Risk · Çözüm · Efor · Doğrulama`

---

### [P0] Vitrindeki maçların %83'ü sahte — gerçek kullanıcı bugün demo maç görüyor

**Kanıt:** `get_nearby_matches()` (canlı, `SECURITY DEFINER`) — WHERE koşulunda `isDemo` filtresi **yok**. Kardeş fonksiyonlar filtreliyor: `get_nearby_pitches` (`is_demo=false`), `get_nearby_providers` (`"isDemo"=false`). Ayrıca `app_config.demo_mode_enabled = **true**` (migration varsayılanı `false`, `20260708000001_faz7_control_plane_foundation.sql:90`: *"CANLI ortamda KAPALI olmalı"*).

**Mevcut durum:** Canlı çağrı yaptım — `get_nearby_matches(40.98, 37.88, 25)` **6 maç döndürüyor, 5'i demo.** Bu 5 demo maç gelecekte (3–6 Ağustos) ve `ACTIVE` durumda; yani katılınabilir görünüyorlar.

**Risk:** Üç katmanlı. (1) İlk gerçek kullanıcı sahte bir maça yazılıp sahaya gider ve kimseyi bulamaz — kurtarılamaz bir güven kaybı. (2) App Store/Play incelemecisi sahte içerik görürse Guideline 4.2/2.3 reddi gelir. (3) Kuzey yıldızı metriği ilk günden kirlenir; hangi maçın gerçek olduğunu bilemezsiniz.

**Çözüm:** İki adım. (a) `get_nearby_matches`'e `AND m."isDemo" IS NOT TRUE` ekleyen yeni migration. (b) Lansmandan önce `demo_mode_enabled = false` ve demo verisi temizliği (`godview:demo:purge`). (a) olmadan (b) yetmez — fonksiyon RLS'i zaten baypas ediyor.

**Efor:** S (<2 saat)

**Doğrulama:** Migration sonrası aynı çağrı yalnız gerçek maçları dönmeli. Uygulamada: Top Oyna sekmesini aç → listedeki her maç gerçek bir tesise ve gerçek bir kaptana ait olmalı.

---

### [P0] Nakit modda uygulamadan gelen rezervasyonda platform geliri sıfır

**Kanıt:** `credit_owner_booking_earning()` (canlı trigger) ilk satırları:
```
IF NEW.payment_method IS DISTINCT FROM 'CARD'
   OR NEW.source IS NOT DISTINCT FROM 'OWNER_MANUAL' THEN RETURN NEW;
```
`resolve_payment_mode()` canlı çıktısı (VIP Arena): `effective_mode: CASH_ONLY`, `online_allowed: false`. Ayrıca `staff_record_payment` her tesis tahsilatına `source='OWNER_MANUAL'` damgası vuruyor (`20260727000004_staff2b_rpc_authz.sql:590`).

**Mevcut durum:** Lansman planı "OYNA v1 — Nakit Mod" (`5_GUNLUK_CIKIS_PLANI.md:45`). Nakit modda para tesiste ödenir → `payment_method` `CARD` olmaz → **hakediş kaydı da komisyon kaydı da hiç oluşmaz.** Tek istisna maç kesinleşmesi (`_match_confirm_settle`), ama o da cüzdandan para toplanmasını gerektirir; nakit modda o yol da kapalı.

**Risk:** Lansman sürümü, uygulamadan gelen her rezervasyondan **0 ₺ kazanır.** OYNA bir gelir modeli değil, ücretsiz bir rezervasyon defteri olarak yayına çıkar. Dahası: platformun getirdiği müşteriden komisyon alınmadığı için saha sahibi hiçbir zaman komisyon alışkanlığı edinmez; v1.1'de komisyon açtığınızda bu bir **zam** gibi hissedilir ve pazarlık başlar.

**Çözüm:** Ürün kararı gerekiyor (§3 Soru 1). Üç seçenek: (a) Nakit modda da rezervasyon başına **sabit aracılık bedeli** tahakkuk ettirip aylık faturalamak (kayıt oluşsun, tahsilat sonra); (b) v1'i bilinçli olarak **gelirsiz pazar kurma dönemi** ilan edip süreyi baştan belirlemek; (c) yalnız kapora online (%30) alınacak şekilde `HYBRID` moda geçmek. Hangisi olursa olsun, **nakit rezervasyonun da komisyon kaydı üretmesi** teknik olarak şart — aksi halde ne kadar değer yarattığınızı hiç bilemezsiniz.

**Efor:** M (yarım gün, kayıt üretimi) / karar CEO'da

**Doğrulama:** Nakit bir rezervasyon kaydedildiğinde admin panelinde Finans → o rezervasyonun komisyon satırı görünmeli (tahsil edilmemiş olarak bile olsa).

---

### [P0] Kaptan kesinleşmiş maçı iptal edince oyuncuların parası iade edilmiyor — üstelik ekran iade sözü veriyor

**Kanıt:** Canlı `match_cancel_by_captain()` gövdesinin tamamını okudum. Yalnız **kaptanın kaporasını** (`deposit_intent_id`) ve **saha sahibinin hakedişini** işliyor. Diğer oyuncuların `MATCH_FEE` ödemelerini iade eden hiçbir döngü yok. Karşılaştırma: `process_match_at_deadline` (kadro dolmama dalı) `_match_refund_partial`'ı her ödeyen için çağırıyor.
Ekrandaki vaat: `views/MatchJoin.tsx:1482` — *"Maça {X} saatten fazla varsa katılımcı ödemeleri iade edilir"*.

**Mevcut durum:** Kadro dolmuş, 13 oyuncu 240'ar lira ödemiş, maç `CONFIRMED`. Kaptan iptal ediyor. Kaptanın kaporası geri gidiyor; **13 oyuncunun parası sistemde asılı kalıyor.**

**Risk:** Tek bir olayda ~3.100 ₺ kullanıcı parası kayboluyor gibi görünür. Bu bir hata değil, **güven olayıdır**: sosyal medyada tek ekran görüntüsü lansmanı bitirir. Ayrıca yazılı vaat ile davranış çeliştiği için tüketici hukuku açısından da savunulamaz.

**Çözüm:** `match_cancel_by_captain`'in her iki dalına da katılımcı iadesi ekle — erken iptalde tam iade, geç iptalde kaptanın cezası oyuncuya yansımayacak şekilde yine tam iade (oyuncu kusursuz). Kaptanın cezası kendi kaporasından karşılansın.

**Efor:** M (yarım gün) — para akışına dokunduğu için ayrı dal + onay gerekir

**Doğrulama:** Test maçı kur, 2 oyuncu katılsın, kadro dolsun, kaptan iptal etsin → her iki oyuncunun cüzdanında iade kredisi görünmeli.

---

### [P0] Maç iptal edildiğinde hiçbir katılımcıya bildirim gitmiyor

**Kanıt:** Canlı `notify_match_cancelled()` (trigger `on_match_cancelled` aktif) katılımcıları şöyle seçiyor: `WHERE status = 'CONFIRMED'` (büyük harf). Canlı veri: `match_participants` tablosunda **büyük harf 'CONFIRMED' = 0 satır**, küçük harf `'confirmed' = 40 satır`. Yazan taraf küçük harf yazıyor (`20260826000002:185`).

**Mevcut durum:** Döngü sıfır satır dönüyor. Yalnız `creatorId` (kaptan) ayrı bir dalda bildirim alıyor. Canlı veride doğruladım: 7 ve 6 katılımcılı iptal edilmiş maçlarda **birer** iptal bildirimi var — yani sadece kaptanınki.

**Risk:** Oyuncular iptal edilen maç için sahaya gider. Bu, bir önceki bulguyla birleştiğinde tam felaket senaryosu: parası da gitmiş, haberi de yok. Ürünün en temel sözü — "maçından haberdar ol" — sessizce çalışmıyor.

**Çözüm:** Filtreyi büyük/küçük harf duyarsız yap (`lower(status) = 'confirmed'`) veya durum değerlerini tek biçime kanonikleştir. İkincisi doğru olan, ama daha geniş etkili.

**Efor:** S (<2 saat)

**Doğrulama:** Test maçına ikinci hesapla katıl, kaptan hesabıyla iptal et → ikinci hesapta bildirim zili kırmızı olmalı.

---

### [P0] Vitrinde uydurma yıldız puanları; bir tesis "★ 0" ile listeleniyor

**Kanıt:** `views/PitchDiscovery.tsx:398` — liste kartı `★ {p.rating}` yazıyor, **hiçbir koşul yok**. Detay ekranı doğru davranıyor (`:1734`, puan yoksa "Yeni"). Canlı veri:

| Tesis | Gösterilen puan | Gerçek değerlendirme |
|---|---|---|
| Ahmet Kuru Tesisleri | ★ 4.5 | 0 |
| Cumhuriet Gençlik | ★ 5.0 | 0 |
| Olimpiyat | ★ 4.6 | 0 |
| Orduspor | ★ 5.0 | 0 |
| VIP Arena | **★ 0** | 0 |

**Mevcut durum:** Dört tesis hiç değerlendirilmemişken yıldız taşıyor; VIP Arena — arzın en pahalı ve en zengin içerikli tesisi — listede **sıfır yıldızla** görünüyor.

**Risk:** İki yönlü zarar. Uydurma puan tüketici yanıltmasıdır (mağaza reddi + güven). "★ 0" ise VIP Arena'yı listede öldürür; saha sahibi bunu gördüğü gün platformdan çıkar. Projenin kendi kuralı da ihlal ediliyor: IP-18 *"Ekranda uydurma sayı bulunmaz; veri yokluğu sıfır değildir"* (`OYNA_MASTER_PRENSIPLER.md:692`).

**Çözüm:** Liste kartına detay ekranıyla aynı kapıyı koy: `ratingCount > 0 || googleReviews > 0` değilse yıldız yerine **"Yeni"** rozeti. Ayrıca `pitches.rating` alanındaki tohum değerleri temizle.

**Efor:** S (<2 saat)

**Doğrulama:** Sahalar sekmesini aç → hiç değerlendirilmemiş her tesiste yıldız yerine "Yeni" yazmalı.

---

### [P0] Akşam bandında 0 ₺'lik aktif tarife açık

**Kanıt:** Canlı `pitch_tariffs`: **Ahmet Kuru Tesisleri · 2. Saha · Hafta içi 15:00–23:00 · 90 dk · `slot_price = 0` · `deposit_amount = 0`**, hem kort hem tarife `is_active = true`.

**Mevcut durum:** Aynı tesisin diğer sahaları o bantta 3.000–3.200 ₺. Fiyat motoru en öncelikli tarifeyi seçer ve saha-özel tarife tesis geneline üstün gelir — yani bu sahanın akşam saatleri **bedava** satılıyor.

**Risk:** Prime-time'da bedava rezervasyon. Hem saha sahibi kaybeder (ve ilk faturasında bunu görünce güveni gider), hem OYNA 0 komisyon alır, hem de "bedava saat" kötüye kullanım için davetiye çıkarır.

**Çözüm:** İki katman. (a) Veriyi düzelt — saha sahibiyle konuşup gerçek fiyatı gir (canlı veri değişikliği, onayınıza tabi). (b) Kural koy: `pitch_tariffs.slot_price > 0` CHECK kısıtı, ve kapora oranı için zaten dokümante edilmiş %10–50 bandını sunucuda zorla (bugün 2 tarifede kapora %0).

**Efor:** S (veri) + S (kısıt)

**Doğrulama:** Saha sahibi panelinde Fiyat Politikası ekranında 0 yazıp kaydetmeye çalış → reddedilmeli.

---

### [P0] Lansman günü kör uçuş: tüm uygulamada iki analitik olayı var

**Kanıt:** Gözlemlenebilirlik cephesi tam yazılmış (`utils/observability.ts`, Sentry + PostHog, env ile aktifleşiyor). Ama tüm kod tabanında `trackEvent` çağrısı **sadece 2 yerde**: `App.tsx:289` (`user_registered`) ve `store.ts:542` (`initial_load_degraded`).

**Mevcut durum:** `booking_started`, `payment_completed`, `match_created`, `match_joined`, `onboarding_step_completed` gibi hiçbir huni olayı yok. Admin panosu (`admin_dashboard_stats`) yalnız **kümülatif sayaçlar** döndürüyor — zaman serisi, dönüşüm oranı, huni yok. İlan edilen kuzey yıldızı "başarılı oynatılan maç" hiçbir yerde hesaplanmıyor.

**Risk:** Lansmandan sonra "kayıt olanların yüzde kaçı ilk maçına katıldı?" sorusuna cevap veremezsiniz. Kullanıcıların nerede terk ettiğini bilmeden yapılan her düzeltme tahmindir. İlk 30 gün, elinizdeki en değerli veri penceresidir ve kaydedilmiyor.

**Çözüm:** 8 olay yeterli: `onboarding_step`, `pitch_viewed`, `booking_started`, `booking_completed`, `match_created`, `match_join_started`, `match_join_completed`, `match_played`. Hepsi mevcut `trackEvent` cephesine takılıyor, sağlayıcı değişikliği gerekmiyor. Ayrıca "başarılı maç" için tek bir SQL görünümü.

**Efor:** M (yarım gün) — dokunulan dosya çok ama her biri tek satır

**Doğrulama:** PostHog anahtarı girildikten sonra bir kayıt→maç yolculuğu yap → panoda 8 olayın sırayla düştüğünü gör.

---

### [P0] Bildirim izni, değer gösterilmeden, kayıt anında isteniyor

**Kanıt:** `App.tsx:524-532` → `App.tsx:474` → `notifications/pushService.ts:271-281`. `onAuthStateChanged` tetiklenir tetiklenmez `requestPermissions()` çağrılıyor. Ön-izin (priming) ekranı yok. Reddedilirse `:278-281` sessizce `false` dönüyor ve `register()` hiç çağrılmıyor → `push_token` NULL kalır, **tekrar deneme yolu yok**.

**Mevcut durum:** Kullanıcı kayıt olduğu saniyede, tek bir maç görmeden sistem diyaloğuyla karşılaşıyor. Canlı veride **33 profilin sadece 1'inde `push_token` var.** Karşılaştırma: rehber izni için doğru desen uygulanmış — önce uygulama-içi açıklama sheet'i (`views/social/FriendAddView.tsx:470-518`), sonra OS diyaloğu.

**Risk:** iOS'ta bildirim izni **tek şanslıktır**. Reddedilirse maç hatırlatması, iptal bildirimi, "yer açıldı" çağrısı — tutundurmanın tamamı ölür. Sektör verisi net: değer gösterildikten sonra istenen izinde kabul oranı 2-3 kat yüksektir.

**Çözüm:** İzni ilk maça katılma/kurma anına taşı ve önüne tek cümlelik gerekçe koy: *"Maçın iptal olursa veya yer açılırsa sana anında haber verelim mi?"* Rehber izni için yazılmış sheet deseni birebir kullanılabilir.

**Efor:** S–M

**Doğrulama:** Yeni hesapla kayıt ol → onboarding boyunca bildirim diyaloğu **çıkmamalı**; ilk maça katılırken çıkmalı.

---

### [P0] Soğuk başlangıç ekranı hiç görünmüyor; Ordu dışındaki kullanıcı Ordu'nun sahalarını görüyor

**Kanıt:** `views/PitchDiscovery.tsx:549-553` — sorgu `.eq('is_open',true).eq('is_published',true)`, **coğrafi filtre ve limit yok**. Boş durum koşulu `sourcePitches.length === 0` (`:1359`) ancak **ülke genelinde sıfır saha varsa** doğru olur. Aynı hata maç kurmada: `services/matchCreateService.ts:61-67`. Maç keşfinde ise sessiz düşüş var: `views/MatchDiscovery.tsx:133-134` — yakında 0 maç dönerse **ülke geneli listeye** düşüyor, başlıkta ise "25 KM İÇİNDE" yazıyor.

**Mevcut durum:** İstanbul'daki bir kullanıcı uygulamayı açtığında ya Ordu'daki sahaları listede görüyor, ya "SONUÇ BULUNAMADI · Filtreleri temizle" mesajı alıyor. Özenle yazılmış **"BÖLGENDE HENÜZ SAHA YOK → Beni haberdar et / Saha öner"** ekranı (`:1358-1400`) ve arkasındaki gerçek talep-sinyali altyapısı (`pitch_demand_signals` + `record_demand_signal`) **pratikte hiç tetiklenmiyor.** Canlıda `pitch_demand_signals` = 0 satır.

**Risk:** İlk 90 günün en değerli varlığını — "hangi şehirde talep var?" verisini — hiç toplamıyorsunuz. Üstelik kullanıcı yanlış bilgi alıyor: 900 km uzaktaki sahayı "yakınında" sanıyor.

**Çözüm:** Üç küçük düzeltme. (a) `fetchPitches` ve `fetchCreateFacilities` sorgularına aktif bölge/koordinat filtresi. (b) `MatchDiscovery:134`'ü `hasScope ? nearbyMatches : adminMatches` yap — 0 gerçekten 0 olsun. (c) `views/MatchCreate.tsx:736,764`'teki sabit `'Ordu','Altınordu'` değerlerini kullanıcının aktif bölgesinden al (bugün Trabzon'daki talep Ordu'ya yazılıyor).

**Efor:** M

**Doğrulama:** Ayarlar → Konum → Bölgelerim'den İstanbul seç → Sahalar sekmesinde "Bölgende henüz saha yok" + iki buton görünmeli.

---

### [P1] Kadro eşiği "toplam − 2" ve hakediş doluluğa bakmıyor → eşikte OYNA zarar ediyor

**Kanıt:** `_match_player_counts()` (canlı): `min_players := GREATEST(total_slots - 2, 2)` — sabit kodlu. `_match_confirm_settle()` (canlı) hakediş tabanını `pitch_bookings.price`'tan alıyor; **doluluktan bağımsız.** Kişi başı fiyat `CEIL((taban+markup)/(per×2))` (`20260904000001:159-162`).

**Mevcut durum — gerçek Ordu fiyatıyla hesap.** VIP Arena · 3. Saha · hafta içi 17:00–00:00 · 3.200 ₺ · 5v5 (10 slot):

| | Tam doluluk (10) | Eşik (8) |
|---|---|---|
| Kişi başı | 336 ₺ | 336 ₺ |
| Toplanan | 3.360 ₺ | 2.688 ₺ |
| Sahaya borç (3200 − %15) | 2.720 ₺ | 2.720 ₺ |
| **OYNA net** | **+640 ₺ (%20)** | **−32 ₺ (ZARAR)** |

Aynı sahada 7v7 (14 slot) eşikte +160 ₺ kâr veriyor. Yani marj, **maç formatına ve doluluğa göre %20 ile eksiye** salınıyor.

**Risk:** Ölçeklendikçe zarar eden maçların payı artar; büyüme sizi fakirleştirir. Ayrıca "toplam−2" kuralı kadro esnekliğini de öldürüyor: 14 kişilik maç 11 kişiyle **kurulamıyor**, oysa 11 kişi rahat oynar.

**Çözüm:** İki karar birlikte alınmalı: (a) eşiği **oran** olarak tanımla (zaten `app_config.match_min_player_pct = 70` diye bir ayar var — bkz. sıradaki bulgu) ve başabaş noktasının üstünde tut; veya (b) hakedişi doluluğa oranla. (a) daha basit ve saha sahibi açısından daha adil değil — sahibi sahayı tam kiralıyor. Önerim: eşiği başabaş + 1 oyuncu olacak şekilde formülleştir.

**Efor:** M · **karar CEO'da** (§3 Soru 3)

**Doğrulama:** Maç kur ekranında "kadro dolmazsa" bilgi kartında minimum oyuncu sayısı görünmeli ve bu sayı başabaşın üstünde olmalı.

---

### [P1] Admin panelindeki "minimum oyuncu yüzdesi" ayarı hiçbir şeyi değiştirmiyor

**Kanıt:** `app_config.match_min_player_pct = 70` canlıda mevcut. Canlı veritabanındaki **hiçbir fonksiyon** bu anahtarı okumuyor (tüm `pg_proc` gövdelerinde arandı, 0 sonuç). Eşik tek yerde ve sabit: `_match_player_counts` → `total_slots - 2`.

**Mevcut durum:** Admin panelinde ayar var, kaydediliyor, hiçbir etkisi yok. Ayrıca depoda **ikinci, çelişen bir iptal kuralı** duruyor: `supabase/functions/auto-cancel-matches/index.ts:41-42` %70 eşiği uyguluyor. Bugün cron'u kurulu değil, ama deploy edilirse veritabanıyla çelişen eşikle maç iptal eder.

**Risk:** Projenin kendi kuralı IP-16 *"çalışmayacak tuş çizilmez"* ihlal ediliyor — ve bu sefer ihlal eden taraf **operasyon ekibinin kendisi**. Bir gün birisi "eşiği %60'a çekelim" der, panelden değiştirir, hiçbir şey olmaz ve kimse anlamaz.

**Çözüm:** Ya `_match_player_counts` bu ayarı okusun, ya ayar panelden kaldırılsın. Ölü edge fonksiyonu depodan çıkarılsın.

**Efor:** S

**Doğrulama:** Ayarı %50 yap → 10 slotlu maç 5 kişide kesinleşmeli.

---

### [P1] Davet/referans döngüsü kurulmuş ama fişi takılı değil — büyüme kanalı kapalı

**Kanıt:** Backend eksiksiz: `referral_codes`, `referral_attributions` tabloları, `get_or_create_referral_code()`, `redeem_referral_code()` RPC'leri canlıda çalışıyor. İstemcide kod **üretiliyor** (`views/social/FriendAddView.tsx:251`) ve link paylaşılıyor (`https://oyna.app/davet/{code}`). Ama:
- `redeemReferralCode` (`services/socialService.ts:187`) **hiçbir yerden çağrılmıyor** (tüm repo taraması: tek eşleşme, tanımın kendisi).
- `vercel.json:9` her yolu `index.html`'e yönlendiriyor; `/davet/` yolunu okuyan kod yok.
- Universal/App Link yok: `android/app/src/main/AndroidManifest.xml:26-31` yalnız `oyna://` şeması; `public/.well-known/assetlinks.json` **dosyası yok**; iOS'ta `applinks:` girdisi yok.
- Ödül yok: `redeem_referral_code` yalnız bildirim gönderiyor. `REFERRAL_BONUS` işlem tipi 11 okuma formülünde geçiyor, **hiçbir yerde yazılmıyor**.

**Mevcut durum:** Canlıda `referral_attributions` = **0 satır**. Aynı kopukluk takım davetinde de var (`joinByInviteToken` çağrısız).

**Risk:** Halı saha kitlesi WhatsApp grubuyla yaşar. "Linke tıkla → uygulamaya gel → doğrudan bu maça katıl" akışı, bu üründe **en güçlü büyüme kanalıdır** ve tamamen kapalı. Üstelik `oyna://match/...` metni WhatsApp'ta tıklanabilir link olarak bile görünmez.

**Çözüm:** Sırasıyla: (a) `assetlinks.json` + `apple-app-site-association` yayınla, manifest'e `https` intent-filter ekle; (b) açılışta `location.pathname`'i oku, `/davet/{kod}` → `redeemReferralCode`, `/mac/{id}` → maç lobisi; (c) ödülü tanımla (ilk maç sonrası her iki tarafa X ₺ iade kredisi).

**Efor:** L (1–3 gün) — ama büyüme açısından en yüksek getirili iş

**Doğrulama:** Telefonda WhatsApp'a davet linki gönder → tıkla → uygulama açılsın ve davet kodun otomatik işlensin.

---

### [P1] Maç hatırlatma bildirimi iki ayrı sebeple kırık

**Kanıt:** `send_match_reminders()` bildirimi `type_key = 'MATCH_REMINDER'` ile yazıyor (`20260707000002000_faz7_backend.sql:148`). Ama tercih anahtarları `match_reminder_1h` / `match_reminder_24h` (`notifications/pushService.ts:30-31`) ve "kapatılamaz" işareti `match_reminder_1h` şablonuna konmuş. `send-push` `isTypeMandatory('MATCH_REMINDER')` diye bakıyor, şablon bulamıyor → **zorunlu değil** sayıyor. Ayrıca aynı satırda `deep_link = '/match/' || id` — `oyna://` öneki yok; `pushService.ts:169-173` `oyna://` ile başlamayan linki **sessizce reddediyor**.

**Mevcut durum:** (1) "1 saat kala hatırlatma kapatılamaz, sessiz saatte bile gider" sözü çalışmıyor; gece 23:00–09:00 arası sessiz saat kapısına takılıyor (`silent_hours_start=3`, `end=9` canlıda). (2) Hatırlatmaya tıklayan kullanıcı hiçbir yere gitmiyor.

**Risk:** Maç hatırlatması, bu üründe **en yüksek değerli bildirimdir** — no-show'u doğrudan azaltır. İkisi de kırıkken hem gitmiyor hem tıklanamıyor.

**Çözüm:** `type_key`'i `match_reminder_1h`/`match_reminder_24h` olarak ayır, `deep_link`'e `oyna://` öneki ekle. Tek migration.

**Efor:** S

**Doğrulama:** Yakın saatli test maçı kur → hatırlatma gelsin → dokun → maç lobisi açılsın.

---

### [P1] Oyuncu gelmemesi (no-show) için hiçbir mekanizma yok

**Kanıt:** Kaleci/hakem tarafında **tam mekanizma var**: `captain_report_no_show` (`20260804000000:606-668`), ceza, tazminat, 48 saat itiraz, admin çözümü (`20260816000006`). Oyuncu tarafında yoklama, check-in veya bildirim **yok**. En yakın yaptırım dolaylı: geç ayrılmada `reliability_score` düşüşü. QR bilet var ama yalnız saha rezervasyonu için (`views/MatchTicket.tsx:128-134`), maça katılım doğrulaması için değil.

**Mevcut durum:** Parasını ödemiş ve gelmemiş oyuncu ile gelmiş oyuncu sistemde **birebir aynı**.

**Risk:** Halı sahanın bir numaralı sosyal problemi budur. Bir kaptan iki kez eksik kadroyla sahaya çıkarsa uygulamayı bırakır. `app_config`'de fairplay ceza parametreleri hazır bekliyor (`fairplay_noshow_penalty = 15`) ama tetikleyicisi yok.

**Çözüm:** En hafif sürüm: maç bitiminden sonra kaptana tek soru — "kim gelmedi?" — ve işaretlenen oyuncunun `reliability_score`'undan `fairplay_noshow_penalty` düşülsün. Maç sonu değerlendirme ekranı zaten var; tek adım eklenir.

**Efor:** M

**Doğrulama:** Maç sonu değerlendirmede "gelmeyen var mı?" adımı görünmeli; işaretlenen oyuncunun güvenilirlik puanı düşmeli.

---

### [P1] Eşleştirme kalitesi diye bir şey yok — "Ciddi maç" sadece bir etiket

**Kanıt:** minRating barajı bilinçli olarak söküldü (`20260730135953_puan_sistemi_sokum_sunucu.sql:104,109`), gerekçesi de yazılı: *"Beyan barajda kullanılamaz — herkes 10 yazıp geçer."* Yerine gelen `profiles.self_skill` **beyan**, ve migration kendi yorumunda diyor: *"Barajda/kapıda ASLA kullanılmaz"* (`:46-47`). `player_buy_slots_v2__inner` gövdesinde tek kontrol slotun `OPEN` olması. Maça yazılan cinsiyet/yaş kriterlerinin katılım kapısı olarak uygulandığına dair kod bulunamadı.

**Mevcut durum:** Kaptan "Ciddi · Erkek · 25-30 yaş" diye maç kurar; ilk gelen alır. Canlıda 33 profilin **22'sinde `self_skill` boş**, 8'inde mevki boş.

**Risk:** Bu, iki taraflı bir memnuniyetsizlik üretir: iyi oyuncu zayıf kadroya düşer, yeni başlayan ezilir. İkisi de bir daha maça yazılmaz. Eşleştirme kalitesi, bu üründe elde tutmanın **tek gerçek kaldıracıdır**.

**Çözüm:** Sert baraj koymayın (haklı gerekçeyle kaldırılmış). Bunun yerine **yumuşak eşleştirme**: (a) keşifte kullanıcının beyan seviyesine yakın maçları öne çıkar; (b) maç kartında "kadronun ortalama seviyesi" bandını göster; (c) kaptana "senin seviyene uygun 3 oyuncu" öner. Beyan manipülasyonunu da maç sonu akran puanıyla zamanla düzeltin.

**Efor:** L · **karar CEO'da** (§3 Soru 6)

**Doğrulama:** Top Oyna listesinde her maç kartında kadronun seviye bandı görünmeli.

---

### [P1] "Güven Puanı" kartı olmayan bir mekanizmayı anlatıyor

**Kanıt:** `components/profile/TrustScoreCard.tsx:70-75` kullanıcıya diyor ki: *"Maç sonu değerlendirmeleri, fair-play geçmişin ve katılım disiplinin puanını belirler… Değerlendirmeleri önemse — takım arkadaşlarının oyları puana işlenir."* Gerçekte `profiles.trust_score`'a yazan **tek şey** geç iptal cezasıdır: `−0.5` (`20260904000001_kesinlesme_ve_saha_hakedisi.sql:515-517`). Takım arkadaşı oyları (`player_ratings`) bu puana **hiç işlenmiyor**; tek çıktıları MOTM sayacı.

**Mevcut durum:** Kullanıcı puanlama yapmasının bir işe yaradığını sanıyor. Canlıda `player_ratings` = 2 satır — yani zaten kimse yapmıyor.

**Risk:** Ürünün kullanıcıya söylediği ile yaptığı ayrışıyor. Bu tür sessiz yalanlar tek tek küçüktür, toplamı güvendir. Ayrıca değerlendirme katılımını artırmak için elinizdeki tek motivasyon cümlesi de boş çıkıyor.

**Çözüm:** İki seçenek — ya kartın metnini gerçeğe indirin ("katılım disiplinin puanını belirler"), ya akran puanlarını gerçekten `trust_score`'a bağlayın. İlki S, ikincisi M ve manipülasyon tasarımı gerektirir.

**Efor:** S (metin) / M (mekanizma)

**Doğrulama:** Profil → Güven Puanı kartındaki açıklama, puanı gerçekten değiştiren şeyleri saymalı.

---

### [P1] Saha değerlendirmeleri toplanıyor ama hiçbir yerde gösterilmiyor

**Kanıt:** `pitch_ratings` tablosuna yazan tek yer `views/PostMatchEval.tsx` (1–5 tesis puanı, `:370-376`). Tüm repo taramasında bu tabloyu **okuyan hiçbir ekran yok**. Vitrinde gösterilen `pitches.rating` alanı ise ayrı ve tohumlanmış (önceki bulgu).

**Mevcut durum:** Oyuncu maçtan sonra sahayı puanlıyor; o puan hiçbir yere çıkmıyor. Vitrinde ise "Google puanı" kavramı var ama canlıda 6 tesisin **hepsinde `google_review_count = 0`**.

**Risk:** Ürünün kendi güven sinyalini üretme kabiliyeti var ve kullanılmıyor. Uygulama-içi gerçek yorum, sahte yıldızın panzehiridir; ikisi aynı anda çözülür.

**Çözüm:** `pitch_ratings` ortalamasını ve sayısını vitrine bağla; `pitches.rating`'i bu ortalamadan türet. Yorum metni de varsa detay ekranında göster.

**Efor:** M

**Doğrulama:** Bir maç sonrası sahaya puan ver → Sahalar sekmesinde o tesisin puanı ve "1 değerlendirme" yazısı görünmeli.

---

### [P1] Arz sığ ve yarısı vitrine hazır değil

**Kanıt:** Canlı `pitches` + `courts` + `pitch_media` + `pitch_tariffs`:

| Tesis | Yayında | Tarife | Fotoğraf | Sahip |
|---|---|---|---|---|
| VIP Arena | ✅ | 7 | 3 | ✅ |
| Ahmet Kuru Tesisleri | ✅ | 6 | 2 | ✅ |
| Capo Arena | ✅ | 4 | **0** | ✅ |
| Olimpiyat | ✅ | 4 | **0** | ✅ |
| Orduspor | ❌ | 0 | 2 | ✅ |
| Cumhuriet Gençlik | ❌ | 0 | 1 | **❌ yok** |

Ayrıca `Ahmet Kuru Tesisleri` kaydında `city = "Altınordu"` (ilçe adı şehir alanına yazılmış) ve `Cumhuriet Gençlik` yazım hatası taşıyor.

**Mevcut durum:** Vitrinde gerçekte **4 tesis** var; ikisinin **hiç fotoğrafı yok**. Görsel bir pazaryerinde fotoğrafsız kart tıklanmaz — üstelik `20260801135629` migration'ı kapak fotoğrafı olmayan tesisi `get_nearby_pitches`'ten zaten **eliyor**. Yani harita/yakınımdakiler görünümünde gerçek arz **2 tesise** düşüyor olabilir.

**Risk:** Lansman günü Altınordu'da uygulamayı açan kullanıcı iki tesis görür. "Bende zaten bu iki sahanın numarası var" der ve siler. Bu, ürünün kendi hatası değil ama ürünün ölüm sebebi olur.

**Çözüm:** Kod işi değil, **operasyon işi**: 4 yayındaki tesisin her birine en az 3 fotoğraf + gerçek tarife + doğru şehir/ilçe. Yayında olmayan 2 tesis için ya anlaşma ya kayıttan çıkarma. Şehir alanı için il/ilçe seçici (serbest metin bugün "Altınordu" gibi hatalar üretiyor — `SAHA_SAHIBI_KARAR_SORULARI.md` soru 13 bunu zaten sormuş, cevap bekliyor).

**Efor:** M (operasyon) + S (il/ilçe seçici)

**Doğrulama:** Sahalar sekmesi → her kartta gerçek fotoğraf, doğru ilçe ve fiyat görünmeli.

---

### [P1] Komisyon oranı üç ayrı yerde, üç farklı değer — CEO'nun gördüğü rakam yanlış

**Kanıt:** Canlı veritabanı:
1. `settings."commissionRate" = 10` → **admin panosunun gösterdiği değer** (`admin_dashboard_stats()` bunu döndürüyor)
2. `commission_config` GLOBAL MODEL_A = `rate_pct 15` + `markup_pct 5` → **motorun uyguladığı değer** (`_pitch_agreement()` canlı çıktısı: 6 tesisin hepsi 15/5)
3. `pitches.platform_commission_rate` = 15/15/10/15/10/15 → `20260904000000:49-51`'de "KULLANIM DIŞI" işaretli ama veri hâlâ orada

**Mevcut durum:** Yönetim panosu %10 diyor; sistem %15 + %5 markup uyguluyor.

**Risk:** CEO ve saha sahibi aynı ekrana bakıp farklı sonuç çıkarıyor. Saha sahibiyle komisyon konuşurken elinizde yanlış rakam olur. Ayrıca `PROBLEMLER_VE_COZUMLER` kalıp listesinin bir numarası tam da budur: *"aynı gerçeğin iki kaynağı ayrışıyor"*.

**Çözüm:** `admin_dashboard_stats`'ı `commission_config`'ten okut; `settings.commissionRate` ve `pitches.platform_commission_rate` alanlarını kaldır.

**Efor:** S

**Doğrulama:** Admin → Genel Bakış'taki komisyon oranı, Ücretlendirme ekranındaki oranla aynı olmalı.

---

### [P1] Maç içi sohbet yok — 14 yabancı birbiriyle konuşamıyor

**Kanıt:** İki mesajlaşma kanalı var, ikisi de maçtan bağımsız: 1:1 DM (arkadaş veya aynı takım şartı — `20260713000018:38-41`) ve takım sohbeti. `views/MatchJoin.tsx` (191 KB) içinde sohbet bileşeni **yok**.

**Mevcut durum:** Açık bir maça 14 kişi yazılıyor; hiçbiri arkadaş değil; birbirlerine "kaçta buluşuyoruz, forma rengi ne?" diye soramıyorlar.

**Risk:** Bu trafik WhatsApp'a kaçar; WhatsApp'a kaçan grup bir sonraki maçı da WhatsApp'ta kurar. Pazaryeri için bu, aracıdan kaçışın sosyal versiyonudur.

**Çözüm:** Maç lobisine basit bir sohbet şeridi. Takım sohbeti altyapısı (`team_messages`) birebir uyarlanabilir; moderasyon için şikâyet/engelleme de aynı anda eklenmeli (bugün takım sohbetinde de yok).

**Efor:** L

**Doğrulama:** Maç lobisinde "Sohbet" sekmesi olmalı, katılımcılar yazabilmeli.

---

### [P1] Sağlayıcı bekleme odası ölü uç — ve uygulama tersini vaat ediyor

**Kanıt:** `serviceProviderService.ts:42-56` başvuruda `profiles.role`'ü sağlayıcıya çeviriyor, `verification_status='pending'` yazıyor. `shared/roles.ts:69-81` açılışta sağlayıcı rolünü seçiyor, `App.tsx:406-411` kullanıcıyı **her açılışta** `PENDING_VERIFICATION` ekranına kilitliyor. O ekranın çıkışları: beklemek, tekrar başvurmak, veya "başka hesapla giriş yap" (`views/PendingVerificationView.tsx:306-312`). **"Oyuncu olarak devam et" yok.** Oysa `components/settings/FieldRolePage.tsx:88-91` kullanıcıya *"Başvurun inceleniyor — oyuncu olarak oynamaya devam edebilirsin"* diyor. `verification_sla_hours = 48` (canlı).

**Mevcut durum:** Kaleci olmak isteyen bir oyuncu, başvurduğu anda **2 güne kadar uygulamadan tamamen çıkıyor.**

**Risk:** Kaleci ve hakem arzınız zaten çok ince (canlıda 3 kaleci, 2 hakem). Onları kazanmak için kurduğunuz akış, onları kaybettiğiniz akış oluyor.

**Çözüm:** `PENDING_VERIFICATION` ekranına "Oyuncu olarak devam et" çıkışı; sağlayıcı rolü onaylanana kadar `pickLandingRole` PLAYER seçsin.

**Efor:** S

**Doğrulama:** Kaleci başvurusu yap → uygulamayı kapat/aç → oyuncu ana sayfasına düşebilmelisin.

---

### [P1] Cüzdan tek yönlü: para giriyor, çıkmıyor; hesap silme de kilitleniyor

**Kanıt:** `app_config.wallet_cashout_enabled = false` (canlı). `request_payout`/`request_wallet_cashout` ilk satırda `CASHOUT_DISABLED` fırlatıyor. Oyuncu için kimlik doğrulama ekranı hiç yok — `20260728114605:968-973` bunu açıkça yazmış: *"sıradan oyuncunun kimlik doğrulama yolu YOK."* Hesap silme, çekilebilir bakiye varken engelli (`:832-837`). Yayınlanmış sözleşme ise (`public/mesafeli-satis.html:44`) iadenin **karta değil cüzdana** yapıldığını ve çekimin *"lansman döneminde açık olmadığını"* söylüyor.

**Mevcut durum:** İade alan kullanıcı parasını yalnız OYNA içinde harcayabiliyor; hesabını da silemiyor.

**Risk:** Apple 5.1.1(v) (hesap silme) ve TKHK m.11 (iade) açısından kırılgan. Ürün açısından ise "param var ama çekemiyorum" hissi, tek başına terk sebebidir. Not: **Nakit Mod'a çıkarsanız bu risk büyük ölçüde buharlaşır** — para hiç girmez.

**Çözüm:** v1 Nakit Mod ise: cüzdanı arayüzden tamamen kaldırın (plan zaten bunu diyor — `5_GUNLUK_CIKIS_PLANI.md:58`). Cüzdan kalacaksa: çekim akışı + oyuncu kimlik ekranı lansman öncesi şart.

**Efor:** M · **karar CEO'da** (§3 Soru 1)

**Doğrulama:** Ayarlar → Hesabımı Sil → bakiye engeli çıkmamalı.

---

### [P1] İptal kuralı sahaya göre değişiyor ama yayınlanmış sözleşme tek kural vaat ediyor

**Kanıt:** Motor `_pitch_refund_tiers(pitch_id)` ile sahanın kendi ayarını okuyor. Canlı veri: **Ahmet Kuru Tesisleri → `refund_half_hours = 10`**; diğer 5 tesis `NULL` → `settings` varsayılanı **6 saat**. Yayınlanmış mesafeli satış sözleşmesi (`public/mesafeli-satis.html:43`) ise tek merdiven ilan ediyor: *"6-24 saat kala %50 iade."* Ayrıca `pitches.cancellation_policy` JSON alanı 12 saat diyor — ama bu alan hiçbir ekran tarafından okunmuyor, ölü veri.

**Mevcut durum:** Ahmet Kuru'da maça 8 saat kala iptal eden kullanıcı **%0** iade alıyor; yayınlanmış sözleşme ona **%50** vaat ediyor.

**Risk:** Hukuki (mesafeli satış uyumu) ve güven. Bir kullanıcının şikâyeti sözleşme metniyle desteklenir.

**Çözüm:** Ya saha bazlı override'ı kapatın (tek kural), ya sözleşme metnini "iptal koşulları tesise göre değişebilir; rezervasyon ekranında gösterilir" diye güncelleyip **iptal kuralını rezervasyon öncesi o sahaya özel gösterin.** İkincisi ürün açısından daha iyi; motor zaten `match_cancel_policy` ile doğru sayıyı üretiyor.

**Efor:** S (metin) + S (ekranda gösterim)

**Doğrulama:** Ahmet Kuru'da bir saat seç → ödeme öncesi "10 saatten az kala iade yok" yazmalı.

---

### [P1] Toplu bildirim kullanıcı tercihini baypas ediyor; ticari ileti izni ayrı alınmıyor

**Kanıt:** `admin_broadcast_notification` bildirimi `type_key='ADMIN_BROADCAST'` ile yazıyor. `send-push/index.ts:109-111` tercih kontrolünü `prefs[type_key]` üzerinden yapıyor; bu anahtar ne tercih listesinde ne `notification_templates`'ta var → `undefined` → kapı **açık geçiliyor**. Yasal metin ise ayrı bir onay vaat ediyor: `shared/legalDocs.ts:317` — *"TİCARİ ELEKTRONİK İLETİ İZNİ — OPSİYONEL: ayrıca onayınız istenir."* Kayıtta yalnız `recordUserConsents(['KVKK','TERMS'])` çağrılıyor (`App.tsx:285`); `RIZA` anahtarı tanımlı ama hiç kullanılmıyor. İYS entegrasyonu ve ileti içinde çıkış (opt-out) bağlantısı yok. Ayrıca panelde **onay adımı yok** — `CampaignsPage.tsx:145-152` "Yayınla" doğrudan gönderiyor.

**Mevcut durum:** "Kampanya bildirimlerini kapat" diyen kullanıcıya kampanya push'u gidiyor. `broadcast_max_per_day = 5` (canlı) tek koruma.

**Risk:** 6563 sayılı Kanun ve KVKK açısından somut ihlal riski; ayrıca yanlış giden toplu bildirim geri alınamaz. CLAUDE.md bu alanı zaten "yüksek riskli" ilan etmiş.

**Çözüm:** (a) `ADMIN_BROADCAST`'i tercih anahtarına bağla (varsayılan kapalı); (b) kayıtta ayrı ticari ileti onay kutusu + `record_user_consent('RIZA')`; (c) panele "X kişiye gönderilecek, onaylıyor musun?" adımı ve test grubu; (d) İYS kaydı (kurucu işi).

**Efor:** M · yüksek riskli alan, ayrı onay gerekir

**Doğrulama:** Bildirim Ayarları'ndan kampanyaları kapat → test kampanyası gönder → telefona push **gelmemeli**.

---

### [P2] Onboarding'de iki atlanamaz kapı ve bir tekrar

**Kanıt:** `views/Onboarding.tsx:173-182` — CTA kilidi. Adım 4 (oyun stili) ve Adım 5 (seviye) **atlanamıyor**; "Atla"ya basan kullanıcı 5. adıma geri gönderiliyor (`:262-266`). Adım 3'te ad-soyad **kayıtta girilenle ön-dolu geliyor** (`:101-129`) — kullanıcı aynı bilgiyi ikinci kez görüyor. "Atla" tuşu 44px genişlikte ama `fontSize:12`, opaklık `0.55` (`:318`).

**Mevcut durum:** Kayıt 4 alan (iyi), onboarding 5 adım + özet. Canlıda **33 profilin 11'i onboarding'i bitirmiş (%33)**; 22'sinde `self_skill` boş — yani çoğu kullanıcı 5. adımı geçememiş görünüyor.

**Risk:** %33 tamamlanma oranı, huninin en pahalı sızıntısıdır. Kullanıcı zaten kayıt oldu; burada kaybetmek en acı kayıptır.

**Çözüm:** Seviye adımını **atlanabilir** yap (varsayılan "Orta"), sonradan profilden düzeltilsin. Ad-soyad adımını tamamen kaldır (kayıtta zaten alındı). Bu ikisi onboarding'i 5 adımdan 3'e indirir.

**Efor:** S

**Doğrulama:** Yeni hesapla kayıt ol → onboarding en fazla 3 ekran sürmeli.

---

### [P2] Uyuyan kullanıcıyı geri getiren hiçbir şey yok

**Kanıt:** `weekly_summary` ve `promo_offers` bildirim şablonları ve tercih anahtarları **var**, üreticileri **yok** (hiçbir yerde INSERT edilmiyor). `profiles.last_active_at` besleniyor (`services/socialService.ts:391-416`) ama okuyan yok. Tek gerçek geri-getirme motoru `nearby_match` — o da **opt-in** ve yalnız kaptan elle tetiklerse çalışıyor (`views/MatchJoin.tsx:526`). Seri (streak), lig, sıralama tablosu bilinçli olarak yok (`OYNA_MASTER_PRENSIPLER.md:203`).

**Mevcut durum:** Kullanıcı iki hafta girmezse onu geri çağıran hiçbir sinyal yok.

**Risk:** Halı saha haftalık bir ritüeldir; ritüeli hatırlatmayan uygulama unutulur. Oyunlaştırmayı kaldırma kararına saygı duyuyorum — ama oyunlaştırma ile **hatırlatma** aynı şey değil.

**Çözüm:** Tek bir haftalık bildirim yeterli: *"Bu hafta çevrende 6 maç var — Perşembe 21:00 hâlâ boş."* Oyunlaştırma değil, envanter bildirimi. `nearby_match` altyapısı birebir kullanılabilir.

**Efor:** M

**Doğrulama:** Haftalık cron sonrası, 7 gündür girmemiş test hesabına bildirim düşmeli.

---

### [P2] Üretim paketinde ölü ekranlar ve sahte veri taşınıyor

**Kanıt:** `views/RoleSelection.tsx` (334 satır) — hiçbir yerden `navigateTo('ROLE_SELECTION')` çağrısı yok, erişilemez. `components/PlayerCard.tsx` hiç render edilmiyor. `components/FifaCard.tsx` yalnız admin panelinde ve kaldırıldığı ilan edilen tier sistemini taşıyor. `views/PostMatchEval.tsx:46-54` — 7 sahte oyuncu adı (`MOCK_PLAYERS`) üretim paketinde. `supabaseAuth.ts:336-338` — demo hesap seçici `VITE_DEMO_ACCOUNTS !== 'false'` mantığıyla **varsayılan açık**, ortak şifre giriş ekranında yazılı (`views/AuthScreen.tsx:949-951`); `?demo=1` her domainde çalışıyor (`:273-295`).

**Mevcut durum:** Giriş ekranında demo hesap listesi çıkma riski canlı bir konfigürasyona bağlı; `.env.example`'da bu değişken **hiç tanımlı değil**.

**Risk:** Gerçek kullanıcının gördüğü ilk ekranda "DEMO HESABIYLA GİR" yazması güveni bitirir; mağaza incelemesinde de sorun olur.

**Çözüm:** `VITE_DEMO_ACCOUNTS` mantığını **fail-closed** yap (`=== 'true'`), prod alan adında `?demo=1`'i etkisizleştir, ölü ekranları ve `MOCK_PLAYERS`'ı kaldır.

**Efor:** S

**Doğrulama:** Üretim build'inde giriş ekranında demo bölümü **görünmemeli**.

---

## ⚠️ ÇAKIŞMALAR

### ÇAKIŞMA 1 — Ürün geliri ↔ Lansman basitliği
> **Taraf A (CPO/Finans):** Lansmanda gelir kaydı olmalı; aksi halde birim ekonomisini hiç öğrenemeyiz ve komisyon sonradan "zam" gibi hissedilir.
> **Taraf B (Lansman planı, `5_GUNLUK_CIKIS_PLANI.md:58`):** Nakit Mod, uygulamada hiç para hareketi yok — bu tek karar 6 doğrulanmış mağaza engelleyicisini siliyor.
>
> **Entegre çözüm:** Nakit Mod'da kalın **ama tahakkuk kaydı üretin.** Her nakit rezervasyon için komisyon satırı "tahsil edilmedi" durumunda oluşsun. Para akmaz (mağaza riski yok), ama ay sonunda saha sahibine "OYNA sana 42 rezervasyon getirdi, hakediş X ₺" diyebilirsiniz. Komisyon alışkanlığı parasız kurulur.
> **CEO kararı gerekiyor mu:** **EVET** — §3 Soru 1.

### ÇAKIŞMA 2 — Kadro esnekliği ↔ Marj
> **Taraf A (Ürün):** Eşik "toplam−2" çok katı; 14 kişilik maç 11 kişiyle oynanabilir, iptal etmek kullanıcıyı kaybettirir.
> **Taraf B (Finans):** Eşiği düşürmek marjı eksiye çeker — VIP Arena 5v5'te 8 kişide zaten −32 ₺.
>
> **Entegre çözüm:** Eşiği sabit sayı yerine **başabaş formülünden** türetin: `min_players = CEIL(sahaya_borç / kişi_başı) + 1`. Böylece eşik her zaman kârlı, ve pahalı sahada yüksek, ucuz sahada düşük olur — otomatik olarak doğru yerde durur.
> **CEO kararı gerekiyor mu:** **EVET** — §3 Soru 3.

### ÇAKIŞMA 3 — Sürtünmesiz ilk deneyim ↔ Eşleştirme kalitesi
> **Taraf A (Büyüme):** Kayıt ve onboarding kısa olmalı; seviye sorusu terk üretiyor (%33 tamamlanma).
> **Taraf B (Deneyim):** Seviye bilinmezse eşleştirme kalitesi düşer, ilk maç kötü geçer, kullanıcı zaten gider.
>
> **Entegre çözüm:** Seviyeyi onboarding'de **sormayın** (varsayılan "Orta"), **ilk maça yazılırken** sorun — o an kullanıcı motive ve bağlam net: *"Bu maç Orta seviye. Sen hangi seviyedesin?"* Aynı bilgi, üç kat yüksek cevaplama oranıyla.
> **CEO kararı gerekiyor mu:** hayır — ürün kararı, önerim bu.

---

## AŞAMA 2b — CEO'YA SORULAR

> Öncelik sırasıyla. Üstten aşağı ilerleyin; ilk 4'ü lansmanı bloke ediyor.

### Lansmanı bloke edenler

**S1. v1'de uygulama içinde para hareketi olacak mı?**
*Neden soruyorum:* Depoda üç farklı cevap var. `5_GUNLUK_CIKIS_PLANI.md:58` "Nakit Mod, cüzdan tamamen kaldırılır" diyor; `YAPILACAKLAR.md:8` "cüzdan-öncelikli ödeme canlıda çalışıyor" diyor; canlı `payment_mode_global = CASH_ONLY` ama son iki commit (1 Ağustos) **kapora akışı** ekliyor — yani kod para yönüne gidiyor, plan nakit yönüne.
*Cevaba göre ne değişir:* Cüzdan ekranı kalır mı kalkar mı; iade politikası metni; hesap silme kilidi; PCI/6493 lisans sorusu; mağaza inceleme notları; ve yukarıdaki bulguların 6'sının önceliği.

**S2. Nakit Mod'da OYNA rezervasyon başına ne kazanacak — hiç mi, tahakkuk mu, sabit bedel mi?**
*Neden soruyorum:* Bugün kod nakit rezervasyonda **hiçbir kayıt üretmiyor**; komisyon da gelir kaydı da yok.
*Cevaba göre ne değişir:* Birim ekonomisi ölçülebilir mi; saha sahibine ay sonunda ne raporlanacak; komisyon v1.1'de "zam" gibi mi hissedilecek.

**S3. Bir maç kaç kişiyle kesinleşsin?**
*Neden soruyorum:* Kod "toplam−2" diyor (sabit), doküman "T-8 saat + %70" diyor, admin panelinde `%70` ayarı var ama hiçbir şey okumuyor, depodaki edge fonksiyonu üçüncü bir kural (%70) taşıyor. Ve eşik seçimi doğrudan kâr/zarar belirliyor.
*Cevaba göre ne değişir:* Marj; iptal oranı; "kadro dolmadı" deneyimi; ölü ayarın kaderi.

**S4. Ordu'nun 19 ilçesi açık kalsın mı, yoksa yalnız Altınordu mu?**
*Neden soruyorum:* `region_coverage`'da 19 ilçenin hepsi aktif ama **4 yayında tesisin hepsi Altınordu'da.** Fatsa'daki kullanıcı kapsam içinde görünüp sıfır saha buluyor.
*Cevaba göre ne değişir:* Boş durum mesajı; talep sinyali toplama; ilk 30 gün pazarlama coğrafyası; "yakında geliyoruz" anlatısı.

### İlk 30 günü etkileyenler

**S5. İlk 3 ay hedefiniz nedir — sayıyla?** (kayıtlı kullanıcı / hafta başına başarılı maç / GMV)
*Neden soruyorum:* Kod tabanında hedef metrik yok; `OYNA_MASTER_PRENSIPLER.md:300` "10–20k kayıtlı, günde ~100 maç" diyor ama bu mimari kapasite, hedef değil.
*Cevaba göre ne değişir:* Hangi analitik olaylarını kuracağımız; başarı/başarısızlık eşiği; ne zaman ikinci şehre geçileceği.

**S6. Eşleştirme kalitesi bir vaat mi, yoksa "ilk gelen alır" mı?**
*Neden soruyorum:* Seviye barajı bilinçli kaldırılmış (haklı gerekçeyle), ama yerine hiçbir yumuşak eşleştirme konmamış. Maçlar "Ciddi/Rahat" etiketi taşıyor ama etiketin hiçbir yaptırımı yok.
*Cevaba göre ne değişir:* Seviye sorusunun onboarding'de kalıp kalmayacağı; keşif sıralaması; kaptana öneri motoru yapılıp yapılmayacağı.

**S7. Oyuncu gelmezse ne olsun?**
*Neden soruyorum:* Kaleci/hakem için tam ceza-tazminat-itiraz mekanizması var; oyuncu için **hiçbir şey** yok. `app_config`'de ceza parametreleri hazır bekliyor.
*Cevaba göre ne değişir:* Kaptanın kadro güveni; maç sonu akışına adım eklenip eklenmeyeceği; güvenilirlik puanının anlamı.

**S8. Saha sahibiyle ticari anlaşma tek tip mi, tesise özel mi?**
*Neden soruyorum:* Altyapı tesise özel anlaşmayı destekliyor (`admin_set_pitch_agreement`), ama canlıda 6 tesisin **hepsi** aynı global orandan (15/5) besleniyor — yani özellik var, kullanılmıyor.
*Cevaba göre ne değişir:* İlk 4 tesisle pazarlık stratejisi; "ilk 30 gün %0" gibi teaser'ların uygulanabilirliği; komisyon şeffaflığı ekranı.

**S9. İptal/iade kuralı tek mi olsun, tesise göre mi değişsin?**
*Neden soruyorum:* Motor tesise göre değişmeye izin veriyor ve **zaten değişiyor** (Ahmet Kuru 10 saat, diğerleri 6 saat); ama yayınlanmış mesafeli satış sözleşmesi tek kural vaat ediyor.
*Cevaba göre ne değişir:* Sözleşme metni; rezervasyon öncesi gösterilecek uyarı; hukuki risk.

**S10. Kaleci/hakem pazaryeri lansmanda açık mı?**
*Neden soruyorum:* Roller açık ve komisyon tanımlı (%10), ama `YAPILACAKLAR.md:16` diyor ki *"kaleci/hakem ücreti tahsilatı yok — talep açılıyor, para çekilmiyor, sağlayıcıya gerçek kazanç yazılıyor → canlıda OYNA zarar eder."* Ayrıca kaleci olmak için **500 ₺ teminat** isteniyor (`gk_min_balance`) ama para çekme kapalı — yani kaleci parasını yatırıp geri alamıyor.
*Cevaba göre ne değişir:* Rolün lansmanda açık kalıp kalmayacağı; teminat kuralının uygulanabilirliği.

### Yol haritası soruları

**S11. Hangi "master prensipler" dosyası bağlayıcı?**
*Neden soruyorum:* İki farklı dosya var (kök ve `docs/master/`), ikisi farklı yerlerde bayat, `OYNA_MASTER.md:270` `docs/master/` kopyasını "en üst otorite" ilan ediyor ama git geçmişi kökteki dosyanın güncellendiğini gösteriyor.
*Cevaba göre ne değişir:* Bundan sonraki her belirsizlikte hangi metnin kazanacağı.

**S12. `SAHA_SAHIBI_KARAR_SORULARI.md`'deki 42 sorunun kritik 5'ini cevaplıyor musunuz?** (7 · 11 · 27 · 30 · 42)
*Neden soruyorum:* Dosyanın kendi kuralı: *"cevap verilmedikçe önerilen varsayılan uygulanır."* Yani 42 karar sessizce alınmış durumda.
*Cevaba göre ne değişir:* Fotoğraf kırpma aracı, adres geocoding, skor çakışması, çekim akışı, alt menü düzeni.

**S13. Taktik Stüdyo lansmanda kalsın mı?**
*Neden soruyorum:* Uygulamanın **en büyük tek dosyası** (Studio.tsx 3.907 satır + 8 modül ≈ 4.862 satır) ve ana döngüde (maç kur → ödet → oynat) **hiçbir zorunlu adımı yok**. Kod ağırlığı ile ürün ağırlığı arasında büyük asimetri var.
*Cevaba göre ne değişir:* Paket boyutu ve açılış süresi; bakım yükü; lansman kapsamı.

**S14. Uygulama içi saha yorumu istiyor musunuz?**
*Neden soruyorum:* Puanlar zaten toplanıyor (`pitch_ratings`) ama hiçbir yerde gösterilmiyor; vitrinde yerine uydurma yıldız var.
*Cevaba göre ne değişir:* Güven sinyali stratejisi; saha sahibinin itiraz/moderasyon ihtiyacı.

**S15. Ekip kaç kişi ve haftada kaç gün OYNA'ya ayrılıyor?**
*Neden soruyorum:* Bölüm 3'teki eforları takvime çevirmek için gerekiyor; §1 tablosunda boş.
*Cevaba göre ne değişir:* Bulguların hangilerinin lansman öncesine sığdığı.

---

## AŞAMA 3 — KAPANIŞ AKSİYONLARI

### Canlıya geçmeden önce yapılması şart 3 şey (CPO alanından)

**1. Sahte içeriği vitrinden tamamen kaldırın.**
`get_nearby_matches`'e demo filtresi + `demo_mode_enabled = false` + demo veri temizliği + uydurma yıldızların kapatılması + demo hesap seçicinin fail-closed yapılması. Bugün Ordu'da uygulamayı açan biri **6 maçtan 5'i sahte** bir liste görüyor. Bu tek başına hem mağaza reddi hem güven felaketi sebebidir.

**2. Maç iptali akışını tamir edin: para + bildirim.**
Kaptan kesinleşmiş maçı iptal edince oyuncuların parası iade edilmiyor **ve** hiçbirine bildirim gitmiyor. Bu ikisi aynı olayda birleşiyor: kullanıcı hem parasını kaybediyor hem sahaya gidiyor. Kurtarılabilir tek bir senaryo yok.

**3. Huniyi ölçmeye başlayın.**
8 analitik olayı + "başarılı maç" görünümü. Lansman gününde nerede kaybettiğinizi bilmiyorsanız, ikinci hafta yaptığınız her düzeltme tahmindir. Bu, listedeki en ucuz ve en yüksek getirili iştir.

### Hızlı kazanımlar (her biri 2 saatin altında, etkisi yüksek)

| # | İş | Etki |
|---|---|---|
| 1 | Puansız tesiste yıldız yerine **"Yeni"** rozeti (`PitchDiscovery.tsx:398`) | VIP Arena "★ 0" ile listelenmekten kurtulur; uydurma puan biter |
| 2 | Maç iptal bildirimindeki büyük/küçük harf filtresi | Katılımcılar iptalden haberdar olur |
| 3 | Hatırlatma bildirimine `oyna://` öneki + doğru `type_key` | Hatırlatma hem gider hem tıklanabilir olur |
| 4 | `PENDING_VERIFICATION` ekranına "Oyuncu olarak devam et" çıkışı | Kaleci/hakem adayları 48 saat kaybolmaz |
| 5 | Onboarding'de seviye adımını atlanabilir yapmak | %33'lük tamamlanma oranının en pahalı kapısı açılır |
| 6 | Admin panosunun komisyon oranını `commission_config`'ten okuması | CEO doğru rakamı görür |

### Kaçınılması gereken en büyük stratejik hata

> **Ordu'nun 19 ilçesini açık tutup 4 tesisle lansmana çıkmak.**

Gerekçe: Çift taraflı pazaryerlerinin ölüm sebebi rakip değil, **seyreltilmiş talep**tir. Kapsama haritasını genişletmek bedava görünür — tek bir `is_active` alanıdır — ama bedeli şudur: Fatsa'daki kullanıcı uygulamayı indirir, sıfır saha görür, siler ve bir daha dönmez. O kullanıcıyı ikinci kez kazanmanın maliyeti, ilk kazanmanın 5–10 katıdır. Üstelik bugün bu kullanıcı boş liste bile görmüyor; **900 km öteki Ordu sahalarını "yakınında" sanıyor** (bulgu 9) ve talep sinyali de kaydedilmiyor.

Doğrusu tersidir: 18 ilçeyi kapatın, Altınordu'da 4 tesisin akşam saatlerini **doldurun**. Bir kullanıcı "her akşam maç var" hissini aldığı an ikinci maçını kendi kurar ve arkadaşlarını getirir. Uber şehirleri tek tek, Airbnb mahalleleri tek tek açtı; ikisi de haritayı sonradan boyadı. Yoğunluk kazanır, kapsama kaybeder.

---

*Hazırlayan: Chief Product Officer · OYNA Kıdemli Danışma Kurulu · 3 Ağustos 2026*
*Sıradaki rol: CTO — konuşmadan önce `docs/board/DECISIONS.md` okunacak.*
