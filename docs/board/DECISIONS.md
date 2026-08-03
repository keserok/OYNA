# OYNA Danışma Kurulu — KARAR DEFTERİ

> **Amaç:** Her rol konuşmadan ÖNCE bu dosyayı okur; önceki rollerin kararlarını ve kurucunun
> verdiği yanıtları bilerek konuşur.
> **Bağlayıcılık:** Bu dosya `GECERLILIK_POLITIKASI.md` sırasında **3. sıradadır** — canlı sistem
> ve `main` kodu dışında kararların tek yazılı kaynağıdır.
> **Kural:** Buraya yalnız **kanıtlı** bulgular ve **kurucunun açıkça verdiği** kararlar girer.
>
> **Kaynak ortam:** `main` @ `da54bff` · canlı Supabase projesi `OYNA` (`iikvzgyccvgcybzdfwlv`)
> Tüm canlı doğrulamalar salt-okunurdur.

---

## Rol ilerleme durumu

| # | Rol | Durum | Çıktı |
|---|---|---|---|
| 1 | **CPO** | ✅ Tamamlandı · kararlar alındı (3 Ağu 2026) | `docs/board/01-cpo.md` |
| 2 | CTO | ⏳ Sırada | — |
| 3 | Software Architect | ⏳ Bekliyor | — |
| 4 | Principal Engineer | ⏳ Bekliyor | — |
| 5 | SRE & DevOps Lead | ⏳ Bekliyor | — |
| 6 | Security & Financial Infra Lead | ⏳ Bekliyor | — |
| 7 | Strategic Advisor | 🔒 Kilitli (1–6 bitmeden açılmaz) | — |

---

# BÖLÜM I — KURUCU KARARLARI (3 Ağustos 2026)

> Bunlar tartışmaya kapalıdır. Sonraki roller bu kararların **üzerine** inşa eder;
> bir rol karara itiraz edecekse ÇAKIŞMA protokolüyle açıkça bildirir.

## K-1 · Ürün yönü

| # | Karar | Not |
|---|---|---|
| **K-1.1** | **Wedge = "parayı topla".** Ürünün ana vaadi saha kiralamak değil, kaptanın para toplama derdini bitirmektir. Kaptanın maç açıp para toplama akışı **kusursuz** çalışacak. | Uygulama planı: `01-cpo.md` §A1.1 + bu dosyanın §III'ü |
| **K-1.2** | **İlçe bazlı doygunluk.** Kapsama, **saha anlaşması olan ilçelere** göre açılır. Anlaşma yoksa ilçe açılmaz. Sistem bu mantıkla kurulacak. | `region_coverage` anlaşmaya bağlanacak |
| **K-1.3** | **Aracıdan kaçış anlaşmayla engellenir.** Garantiler artırılacak; saha sahibinin "beni ara, ucuza vereyim" davranışını engelleyen **sözleşme maddeleri + ikna süreci** kurulacak. | Ticari + ürün işi |
| **K-1.4** | **Ölçüm zorunlu.** Huni ve "başarılı maç" metriği kurulacak. | CPO-P0-7 |
| **K-1.5** | **Concierge onboarding sisteme gömülü olacak.** Saha sahibinin defterini bizim girmemiz için gereken ekranlar **admin panelinde ve saha sahibi panelinde hazır** olmalı. | Yeni iş kalemi |
| **K-1.6** | **Her yer tek tek açılacak.** Genişleme yapılacak ama sırayla; sistem bunu kusursuz destekleyecek. | K-1.2 ile birlikte |
| **K-1.7** | **Başlangıç ilçesi Altınordu olmak zorunda değil.** Farklı bir ilin farklı ilçelerinden de başlanabilir. Sistem şehir/ilçe bağımsız kurulacak. | Soru 4 yanıtı |

## K-2 · Para modeli

| # | Karar | Not |
|---|---|---|
| **K-2.1** | **Online ödeme kusursuz çalışacak.** "Nakit Mod'a çık" önerisi **reddedildi**. Oyuncu kapora, maç ücreti, kaleci ve hakem ücretini **online** öder. | CPO önerisi reddedildi — gerekçe: K-1.1 wedge'i nakit modda çalışmaz |
| **K-2.2** | **"Nakit mod" yalnız saha sahibinin elle kapattığı slot demektir.** Oyuncu tarafı için nakit mod yoktur. | Tanım netleşti |
| **K-2.3** | **Elle kapatılan slotta komisyon alacağı doğar.** Saha sahibi bir slotu elle kapattığında kapora oranı hesaplanır ve **OYNA'nın alacağı** olarak sisteme yazılır. Hem admin panelinde hem saha sahibi finans panelinde görünür. | CPO-P0-2 çözümü · yeni iş kalemi |
| **K-2.4** | **Kadro eşiği başabaş formülünden türetilir.** Hiçbir maç zararına kesinleşmez. | CPO-P1-1 |
| **K-2.5** | **Kârlılık görünür olacak.** Oyuncu tarafında maçlar ekranında UI olarak; admin panelinde açılan **her maçta kârlılık oranı** hesaplanıp gösterilecek, kârsız maçta **kırmızı tehlike işareti** verilecek. | Yeni iş kalemi |
| **K-2.6** | **Saha anlaşması tesise özel olacak.** Her tesisle ayrı ticari şartlar mümkün. | Altyapı hazır, kullanılmıyordu |
| **K-2.7** | **İptal/iade kuralı tesise göre değişebilir, ama ödeme öncesi kullanıcıya gösterilir.** Sözleşme metni buna göre güncellenir. | CPO-P1-14 |

## K-3 · Maç yaşam döngüsü

| # | Karar | Not |
|---|---|---|
| **K-3.1** | **Kaptan maçı İPTAL EDEMEZ.** Maçı yalnız **saha sahibi** ve **admin paneli üzerinden admin** iptal edebilir. | Mevcut `match_cancel_by_captain` kaldırılacak/kısıtlanacak |
| **K-3.2** | **Kaptanın maçtan çıkışı = maçın iptali.** Kaptan kendi yerini bırakırsa maç iptal olur ve **tüm kullanıcılara eksiksiz iade** yapılır (K-3.3 ile aynı sonuç). | Açık Nokta 1 (b) şıkkı seçildi |
| **K-3.3** | **Saha sahibi veya admin maçı iptal ettiğinde tüm kullanıcılara paraları EKSİKSİZ olarak cüzdanlarına döner.** Kademe yok, kesinti yok. | CPO-P0-3'ün yerine geçer |
| **K-3.4** | **Kaptanın maç bırakma hakkı: kişi başına ayda 1 kez.** Aynı kişi bir takvim ayı içinde bu işlemi yalnız bir kez yapabilir. Kötüye kullanım engeli. | Sayaç + kullanıcıya kalan hak gösterimi gerekir |
| **K-3.5** | **Slot devri, maç iptali DEĞİLDİR.** Kaptan yerini başkasına devrederse maç **devam eder**. Kaptanın **kaporası bloke kalır** (maçın güvencesi bozulmaz). Maç oynanıp ödemeler toplandığında kapora **ödeme havuzundan kaptana iade edilir**. | Bugünkü davranıştan farklı: kapora şu an kesinleşme anında iade ediliyor |
| **K-3.6** | **Oyuncu no-show'u işaretlenecek.** Maç sonunda kaptana "gelmeyen oldu mu?" sorulur, işaretlenen oyuncunun güvenilirlik puanı düşer. Para cezası yok. | CPO-P1-5 |

## K-4 · Deneyim

| # | Karar | Not |
|---|---|---|
| **K-4.1** | **Yumuşak eşleştirme.** Sert seviye barajı yok; maç kartında kadro seviye bandı gösterilir, keşifte kullanıcıya yakın seviyeli maçlar öne çıkar. | CPO-P1-6 |
| **K-4.2** | **Seviye sorusu onboarding'den çıkar, ilk maça yazılırken sorulur.** | ÇAKIŞMA 3 çözümü |
| **K-4.3** | **Taktik Stüdyo kalır ama öne çıkarılmaz.** Ana sayfada mevcut yerinde durur; tanıtımın merkezine konmaz. | CPO Soru 13 |
| **K-4.4** | **Uygulama içi saha değerlendirmesi: önce yalnız puan.** Yazılı yorum ikinci aşamaya bırakıldı. | CPO Soru 14 |
| **K-4.5** | **Hızlı kazanımların 6'sı da onaylandı.** (yıldız→"Yeni" · iptal bildirimi filtresi · hatırlatma bağlantısı · sağlayıcı bekleme çıkışı · seviye adımı atlanabilir · pano komisyon kaynağı) | `01-cpo.md` §A3 |

## K-5 · Kaleci / hakem pazaryeri

| # | Karar | Not |
|---|---|---|
| **K-5.1** | **Pazaryeri online ödemeye açıktır, teminat şartı geçerlidir.** "Lansmanda eşleştirme-only yap" önerisi reddedildi. Sistem kurulduğu haliyle geçerlidir. | CPO Soru 10 |
| **K-5.2** | Bu konudaki eski notlar (tahsilat yok / teminat çekilemiyor) **geçersizdir.** | Bkz. K-6 |

## K-6 · Doküman yönetişimi

| # | Karar | Durum |
|---|---|---|
| **K-6.1** | **Yalnızca sistem ve canlı önemlidir.** Eski tarihli notlar bağlayıcı değildir. `GECERLILIK_POLITIKASI.md` oluşturuldu. | ✅ Yapıldı |
| **K-6.2** | **Her iki `OYNA_MASTER_PRENSIPLER.md` geçersiz ilan edildi.** Dosya başlarına uyarı eklendi. | ✅ Yapıldı |
| **K-6.3** | **`YAPILACAKLAR.md` arşive taşındı** (`docs/eski/`). | ✅ Yapıldı |
| **K-6.4** | **`SAHA_SAHIBI_KARAR_SORULARI.md` kaldırıldı.** 42 sorunun tamamı kapatıldı. | ✅ Yapıldı |
| **K-6.5** | **Session sonunda tek master prensipler dosyası yazılacak.** O gün `CLAUDE.md`'nin "proje pusulası" bölümü ona yönlendirilecek. | ⏳ Session sonu |

## K-7 · Kapasite

| # | Karar |
|---|---|
| **K-7.1** | Ekip: **tek kurucu** + Claude (20x max plan). Tüm efor tahminleri buna göre yapılacak; "ekip tut" öneren tavsiye verilmeyecek. |

---

# BÖLÜM II — CPO BULGULARININ GÜNCEL DURUMU

## P0'lar

| # | P0 | Kanıt | Durum |
|---|---|---|---|
| CPO-P0-1 | **Vitrindeki maçların %83'ü sahte.** `get_nearby_matches()` demo filtresi taşımıyor; `demo_mode_enabled` canlıda açık. Canlı çağrı: 6 maç, 5'i demo. | `get_nearby_matches()` · `app_config` | 🟠 **ERTELENDİ (kurucu kararı).** Kurucu "piyasaya çıkıyoruz" dediği anda kapatılacak. **Lansman kontrol listesinin 1. maddesidir.** |
| CPO-P0-2 | Nakit modda uygulamadan gelen rezervasyonda gelir kaydı oluşmuyor. | `credit_owner_booking_earning()` | 🟢 **ÇÖZÜLDÜ (karar)** → K-2.1/K-2.3 |
| CPO-P0-3 | Kaptan kesinleşmiş maçı iptal edince oyuncuların parası iade edilmiyor. | `match_cancel_by_captain()` | 🟢 **KAPANDI (tasarımla)** → K-3.1: kaptan artık iptal edemeyecek |
| CPO-P0-4 | Maç iptalinde katılımcılara bildirim gitmiyor (büyük/küçük harf). Canlı: eşleşen 0, gerçek 40 satır. | `notify_match_cancelled()` | 🔴 **AÇIK** — K-3.3 ile birlikte daha da kritik |
| CPO-P0-5 | Vitrinde uydurma yıldız; VIP Arena "★ 0". | `views/PitchDiscovery.tsx:398` | 🟢 **ONAYLANDI** → K-4.5 hızlı kazanım #1 |
| CPO-P0-6 | Ahmet Kuru 2. Saha hafta içi 15:00–23:00 tarifesi **0 ₺**. | `pitch_tariffs` canlı | 🟡 **CEO ONAYI BEKLİYOR** (canlı veri değişikliği) |
| CPO-P0-7 | Huni ölçümü yok; tüm uygulamada 2 olay. | `App.tsx:289` · `store.ts:542` | 🟢 **ONAYLANDI** → K-1.4 |
| CPO-P0-8 | Bildirim izni değer gösterilmeden isteniyor. Canlı: 33 profilin 1'inde token. | `pushService.ts:271-281` | 🔴 **AÇIK** |
| CPO-P0-9 | Soğuk başlangıç ekranı hiç tetiklenmiyor; keşif coğrafi filtresiz. | `PitchDiscovery.tsx:549-553` | 🟢 **ONAYLANDI** → K-1.2 ile birlikte çözülecek |

## P1'ler — kurucu yanıtıyla güncellenmiş

| # | P1 | Durum |
|---|---|---|
| CPO-P1-1 | Kadro eşiği sabit, eşikte zarar (VIP Arena 5v5: −32 ₺) | 🟢 K-2.4 + K-2.5 |
| CPO-P1-2 | `match_min_player_pct` ayarını hiçbir fonksiyon okumuyor (ölü düğme) | 🟢 K-2.4 ile birlikte çözülür |
| CPO-P1-3 | Davet/referans döngüsü kopuk; canlıda dönüşüm 0 | 🔴 **AÇIK — K-1.1'in ön koşulu** |
| CPO-P1-4 | Maç hatırlatması iki sebeple kırık | 🟢 K-4.5 hızlı kazanım #3 |
| CPO-P1-5 | Oyuncu no-show'u yönetilmiyor | 🟢 K-3.4 |
| CPO-P1-6 | Eşleştirme kalitesi yok | 🟢 K-4.1 + K-4.2 |
| CPO-P1-7 | "Güven Puanı" kartı olmayan mekanizmayı anlatıyor | 🔴 **AÇIK** |
| CPO-P1-8 | Saha değerlendirmeleri gösterilmiyor | 🟢 K-4.4 |
| CPO-P1-9 | Arz sığ: 2 tesiste hiç fotoğraf yok, 1'i sahipsiz | 🔴 **AÇIK (operasyon)** |
| CPO-P1-10 | Komisyon 3 kaynakta 3 değer | 🟢 K-4.5 hızlı kazanım #6 |
| CPO-P1-11 | Maç içi sohbet yok | 🔴 **AÇIK** |
| CPO-P1-12 | Sağlayıcı bekleme odası ölü uç | 🟢 K-4.5 hızlı kazanım #4 |
| CPO-P1-13 | Cüzdan tek yönlü; bakiye varken hesap silinemiyor | 🔴 **AÇIK — K-2.1 ile birlikte büyüdü** (online ödeme = cüzdan kalıyor) |
| CPO-P1-14 | İptal kuralı tesise göre değişiyor, sözleşme tek kural diyor | 🟢 K-2.7 |
| CPO-P1-15 | Toplu bildirim tercihi baypas ediyor; İYS yok | 🔴 **AÇIK** |

---

# BÖLÜM III — KARARLARDAN DOĞAN YENİ İŞ KALEMLERİ

> Bunlar CPO turunun bulgusu değil, **kurucu kararlarının gerektirdiği** yeni işlerdir.

| # | İş | Kaynak karar | Öncelik |
|---|---|---|---|
| Y-1 | **Paylaşılabilir maç linki + Universal/App Links.** `https://oyna.app/mac/{kod}`, `assetlinks.json`, `apple-app-site-association`, manifest intent-filter, iOS entitlements. | K-1.1 | **P0** (wedge'in temel taşı) |
| Y-2 | **Girişsiz maç önizleme sayfası + Open Graph kartı.** Link WhatsApp'ta fotoğraflı önizleme üretmeli. | K-1.1 | **P0** |
| Y-3 | **Kaptan para paneli:** kim ödedi / kim ödemedi, "ödemeyenleri dürt", "kalan yerleri paylaş". | K-1.1 | **P0** |
| Y-4 | **Kaptan risk mesajı:** "Kadro dolmazsa kaporan tam iade edilir." Maç kurma ekranında net. | K-1.1 | P1 |
| Y-5 | **"Arkadaşın için de al" akışının UI'da öne çıkarılması.** Altyapı hazır, görünür değil. | K-1.1 | P1 |
| Y-6 | **Saha sahibi/admin iptali maça yansımalı.** Bugün `owner_cancel_confirmed_booking` `matches` tablosuna **hiç dokunmuyor** — maç ayakta kalıyor. K-3.3 bunu zorunlu kılıyor. | K-3.1/K-3.3 | **P0** |
| Y-7 | **Elle kapatılan slot için komisyon alacağı kaydı** + admin ve saha sahibi finans panelinde gösterim. | K-2.3 | **P0** |
| Y-8 | **Kârlılık göstergesi:** oyuncu maçlar ekranında UI, admin panelinde her maçta oran + kırmızı uyarı. | K-2.5 | P1 |
| Y-9 | **Kapsama = anlaşma.** `region_coverage` yalnız saha anlaşması olan ilçelerde açık olsun; anlaşma bitince kapansın. | K-1.2 | P1 |
| Y-10 | **Concierge onboarding ekranları:** admin ve saha sahibi panelinde abonman/sabit saat toplu giriş. | K-1.5 | P1 |
| Y-11 | **`match_cancel_by_captain` yeniden yazılması.** Kaptan çıkışı artık maçı iptal eder ve herkese eksiksiz iade yapar (bugün yalnız kaptanın kaporasına dokunuyor). | K-3.1/K-3.2 | P1 |
| Y-13 | **Aylık "maç bırakma" sayacı.** Kişi başına takvim ayında 1 hak; kalan hak kullanıcıya gösterilir; hak bitince slot devrine yönlendirilir. | K-3.4 | P1 |
| Y-14 | **Slot devrinde kapora davranışının değişmesi.** Bugün kapora kesinleşme anında (kendi payı düşülerek) iade ediliyor; devir sonrası **maç oynanana kadar bloke kalmalı** ve sonra **tam** iade edilmeli. | K-3.5 | P1 |
| Y-12 | **Tek master prensipler dosyası** (session sonu) + `CLAUDE.md` pusula güncellemesi. | K-6.5 | Session sonu |

---

# BÖLÜM IV — AÇIK NOKTALAR

| # | Soru | Durum |
|---|---|---|
| **1** | Kaptan kendi slotunu bırakırsa kaporaya ve kaptanlığa ne olur? | 🟢 **YANITLANDI** → K-3.2 · K-3.4 · K-3.5 |
| **2** | **Ahmet Kuru 2. Saha'nın 0 ₺ tarifesini düzeltebilir miyim?** Hafta içi 15:00–23:00 bandı canlıda bedava satılıyor. Canlı veri değişikliği — kurucu onayı olmadan dokunulmaz. | 🔴 **HÂLÂ AÇIK** (CPO-P0-6) |
| **3** | Demo verisi ne zaman kapanacak? | 🟢 **YANITLANDI:** Kurucu "piyasaya çıkıyoruz" dediği anda kapatılacak. O ana kadar açık kalır. |
| **4** | Hangi eski dokümanlar arşive taşınsın? | 🟡 **ERTELENDİ:** Sonra değerlendirilecek. Şimdilik yalnız `YAPILACAKLAR.md` taşındı. |

### Uygulama sırasında netleşmesi gereken varsayım

K-3.5 (slot devri) için şu okumayla ilerlenecek; kurucu aksini söylemedikçe geçerlidir:

> Kaptan yerini devrettiğinde **oynamıyor ama maçın sorumlusu olarak kalıyor**. Kaporası bloke
> kalmaya devam eder. Maç oynandığında kapora **tam olarak** iade edilir — kendi payı düşülmez,
> çünkü sahada yer almamıştır.

Ayrıca K-3.4'ün doğal arayüz sonucu: aylık hakkını kullanmış bir kaptan maçı bırakmak istediğinde
sistem onu **slot devrine** yönlendirir ("Bu ay maç bırakma hakkını kullandın — yerini devredebilirsin").
Böylece sınır bir duvar değil, sağlıklı davranışa yönlendirme olur.

---

# BÖLÜM V — KODU NASIL İŞLEYECEĞİZ (uygulama planı)

## Temel kural: paket paket, tek seferde değil

Bu sürecin sonunda 6 rolün bulguları birikince ortaya **50+ iş kalemi** çıkacak. Bunları tek bir
büyük hamlede uygulamak, bu projenin geçmişindeki en pahalı hatayı tekrarlamak olur
(`CLAUDE.md` §4: *"çalışan yerler bozuldu"*).

Bunun yerine iş **paketlere** bölünür. Bir paket şu üç şeyi birlikte taşır:

1. **Değişiklik** — dar kapsamlı, tek konu
2. **Doğrulama** — uygulamada tıklayarak kontrol adımı (terminal komutu değil)
3. **Geri alma yolu** — bozulursa nasıl geri dönülür

Paket bunlardan biri eksikse **uygulanmaz**.

## Zamanlama: ne zaman kod yazılır?

| Aşama | Ne yapılır | Gerekçe |
|---|---|---|
| **Şimdi** | Yalnız **onaylanmış hızlı kazanımlar** (K-4.5, 6 madde) | Riski sıfıra yakın, diğer rollerin bulgularıyla çakışmaz, kurucu onayladı |
| **Roller sürerken** | Kod yazılmaz, yalnız bulgu toplanır | Aynı dosyaya iki kez dokunmak israftır. Örnek: maç iptal zincirini şimdi yazarsak, Mimar "bu zincir şöyle olmalı" dediğinde baştan yazarız |
| **6 rol bittiğinde** | Tüm bulgular **tek birleşik yol haritasında** paketlere bölünür ve sıralanır | Çakışan öneriler burada çözülür |
| **Sonra** | Paket paket uygulama, her paket ayrı onay | Tek kurucu kapasitesine uygun tempo |

## Paketleme kuralları

- **Dal:** her paket kendi dalında — `board/<konu>` (ör. `board/mac-iptal-zinciri`)
- **`main`'e merge yalnız kurucu onayıyla.** Doğrudan `main`'e push yok.
- **Veritabanı değişikliği yalnız yeni migration dosyası** olarak üretilir. Eski migration dosyalarına asla dokunulmaz.
- **Canlı veritabanına migration uygulamak ayrı bir onaydır.** Dosyayı yazmak ≠ canlıya uygulamak.
- **Her paket sonunda:** `npm run lint` temiz + `npm run test:unit` yeşil. Geçmeden "bitti" denmez.
- **Ortak dosyalara** (`types.ts`, `store.ts`, `supabaseMutations.ts`, `services/*`) dokunan paketlerde etkilenen ekranlar önceden listelenir.
- **Para akışına dokunan paketler** (iade, komisyon, kapora, payout) tek başına bir pakettir — başka işle karıştırılmaz.
- Uçtan uca doğrulama gerekiyorsa `/verify` skill'i uygulamayı canlı Supabase'e karşı sürebilir.

## Öngörülen paket sırası (CPO turu itibarıyla)

> Diğer roller konuştuktan sonra bu liste genişleyecek ve yeniden sıralanacak.

| # | Paket | İçerik | Risk |
|---|---|---|---|
| **P-0** | **Hızlı kazanımlar** | K-4.5'in 6 maddesi | Düşük |
| **P-1** | **Link altyapısı** | Y-1, Y-2 — paylaşılabilir maç linki, önizleme sayfası, davet linkinin çalışması | Orta (mağaza dosyaları) |
| **P-2** | **Kaptan para paneli** | Y-3, Y-4, Y-5 | Düşük |
| **P-3** | **Maç iptal zinciri** ⚠️ | K-3.1–K-3.5, Y-6, Y-11, Y-13, Y-14, CPO-P0-4 | **Yüksek — para akışı** |
| **P-4** | **Komisyon ve kârlılık** ⚠️ | K-2.3, K-2.4, K-2.5, Y-7, Y-8 | **Yüksek — para akışı** |
| **P-5** | **Ölçüm** | K-1.4 — 8 olay + "başarılı maç" görünümü | Düşük |
| **P-6** | **Kapsama = anlaşma** | K-1.2, Y-9, CPO-P0-9 | Orta |
| **P-7** | **Concierge ekranları** | K-1.5, Y-10 | Orta |
| **P-8** | **Eşleştirme ve deneyim** | K-4.1, K-4.2, K-4.4, K-3.6 | Düşük |
| **P-SON** | **Lansman anahtarları** | CPO-P0-1 (demo kapatma), demo veri temizliği, go-live kontrol listesi | **Kurucu "çıkıyoruz" dediğinde** |

---

# BÖLÜM VI — SONRAKİ ROLLER İÇİN DEVİR NOTLARI

**CTO'ya:** İş mantığının ezici çoğunluğu PostgreSQL fonksiyonlarında (840 routine). İstemci fiyat/komisyon hesaplamıyor — bu iyi. Üç konuda "aynı gerçeğin iki kaynağı" kalıbı tekrar ediyor: komisyon (3 kaynak), kadro durumu (`matches.slots` JSONB ↔ `match_participants` tablosu), bakiye (`profiles.wallet` ↔ `profiles.wallet_balance` — canlıda **33 profilin 20'sinde farklı**). Migration dosya adları gelecek tarihli: `20260904*` dosyaları 1 Ağustos'ta commit edilmiş. **K-2.1 ile online ödeme kesinleştiği için** İyzico entegrasyonunun tamamlanması artık P0'dır.

**Architect'e:** Çifte rezervasyon veritabanı seviyesinde GiST `EXCLUDE` kısıtıyla korunuyor — bu güçlü. `create_match_atomic` idempotency taşıyor. Ancak K-3.1/K-3.3 kararı yeni bir zincir gerektiriyor: **saha sahibi rezervasyonu iptal → maç iptal → tüm katılımcılara eksiksiz iade → herkese bildirim.** Bugün bu zincirin **hiçbir halkası** bağlı değil (`owner_cancel_confirmed_booking` `matches`'a dokunmuyor). Ayrıca Y-1 (Universal Links) mimari bir karardır: web sayfası + uygulama aynı adresi paylaşacak.

**SRE'ye:** `sweeper_enabled = false` (askıda ödeme süpürücüsü kapalı) — K-2.1 ile online ödeme geldiğinde bu **P0** olur. `push_live_enabled = false`. Sentry/PostHog anahtarları girilmemiş. `admin_mfa_required = false`. Bölge `ap-southeast-1` (Singapur) — Türkiye kullanıcısı için hem gecikme hem veri yeri sorusu. Tek kurucu (K-7.1) → otomasyon ve alarm, insan nöbetinden önemli.

**Security'ye:** K-2.1 (online ödeme) + K-5.1 (kaleci teminatı + online ödeme) birlikte **cüzdanda gerçek para tutmayı kesinleştirdi**. Bu, Türkiye'de 6493 sayılı kanun kapsamında ödeme kuruluşu/elektronik para lisansı sorusunu doğurur ve repoda bu konuda **hiçbir analiz yok** (mevcut hukukçu notu yalnız tüketici iade hakkına bakmış). Ayrıca: `demo_mode_enabled` canlıda açık ve RLS politikaları buna bağlı; `get_nearby_matches` `SECURITY DEFINER` ve RLS'i baypas ediyor; `admin_broadcast_notification`'ın `p_type` parametresi whitelist'siz.

---

*Son güncelleme: 3 Ağustos 2026 · CPO turu + kurucu kararları işlendi*
