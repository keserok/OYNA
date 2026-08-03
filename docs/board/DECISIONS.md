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
| **K-3.2** | **Kaptanın tek çıkışı kendi slotudur.** Kaptan yalnızca kendi slotunu iade edebilir ve kaporasını geri alabilir. | Kapora/kaptanlık devri kuralı netleştirilmeli — bkz. §IV Açık Nokta 1 |
| **K-3.3** | **Saha sahibi veya admin maçı iptal ettiğinde tüm kullanıcılara paraları EKSİKSİZ olarak cüzdanlarına döner.** Kademe yok, kesinti yok. | CPO-P0-3'ün yerine geçer |
| **K-3.4** | **Oyuncu no-show'u işaretlenecek.** Maç sonunda kaptana "gelmeyen oldu mu?" sorulur, işaretlenen oyuncunun güvenilirlik puanı düşer. Para cezası yok. | CPO-P1-5 |

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
| CPO-P0-1 | **Vitrindeki maçların %83'ü sahte.** `get_nearby_matches()` demo filtresi taşımıyor; `demo_mode_enabled` canlıda açık. Canlı çağrı: 6 maç, 5'i demo. | `get_nearby_matches()` · `app_config` | 🟠 **KURUCU: "şimdilik kalsın"** — mağazaya gönderim öncesi kapatılması şartıyla ertelendi |
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
| Y-11 | **`match_cancel_by_captain` kaldırılması/kısıtlanması.** | K-3.1 | P1 |
| Y-12 | **Tek master prensipler dosyası** (session sonu) + `CLAUDE.md` pusula güncellemesi. | K-6.5 | Session sonu |

---

# BÖLÜM IV — AÇIK NOKTALAR (kurucu yanıtı bekliyor)

| # | Soru | Neden önemli |
|---|---|---|
| **1** | **Kaptan kendi slotunu bırakırsa kaporaya ve kaptanlığa ne olur?** K-3.2 "slotunu iade eder, kaporasını geri alır" diyor. Ama kapora tüm maçın güvencesidir — kaptan çıkınca maç güvencesiz kalır. Seçenekler: (a) kaptanlık ve kapora yükümlülüğü bir sonraki oyuncuya devrolur, (b) kaptan çıkarsa maç otomatik iptal olur ve herkese iade yapılır, (c) kaptan kadro dolmadan çıkamaz. | K-3.2'nin uygulanabilmesi buna bağlı |
| **2** | **Ahmet Kuru 2. Saha'nın 0 ₺ tarifesini düzeltebilir miyim?** Canlı veri değişikliği — onayınız olmadan dokunmuyorum. | CPO-P0-6 |
| **3** | **Demo verisi ne zaman kapanacak?** "Şimdilik kalsın" dediniz. Mağaza gönderiminden önce kapatılması şart — hangi tarihte? | CPO-P0-1 |
| **4** | **Hangi eski dokümanlar arşive taşınsın?** `YAPILACAKLAR.md` taşındı. Aday görünenler: `ODEME_MASTER_PLAN.md`, `KALECI_ODEME_DEVIR.md`, `*_EDGE_CASE_PLANI.md` (3 dosya), `problemler_ve_cozum_onerileri.md`, `veritabani_uretim_ve_optimizasyon_plani.md`. `CLAUDE.md`'nin işaret ettiği dosyalara dokunmadım. | K-6.1 |

---

# BÖLÜM V — SONRAKİ ROLLER İÇİN DEVİR NOTLARI

**CTO'ya:** İş mantığının ezici çoğunluğu PostgreSQL fonksiyonlarında (840 routine). İstemci fiyat/komisyon hesaplamıyor — bu iyi. Üç konuda "aynı gerçeğin iki kaynağı" kalıbı tekrar ediyor: komisyon (3 kaynak), kadro durumu (`matches.slots` JSONB ↔ `match_participants` tablosu), bakiye (`profiles.wallet` ↔ `profiles.wallet_balance` — canlıda **33 profilin 20'sinde farklı**). Migration dosya adları gelecek tarihli: `20260904*` dosyaları 1 Ağustos'ta commit edilmiş. **K-2.1 ile online ödeme kesinleştiği için** İyzico entegrasyonunun tamamlanması artık P0'dır.

**Architect'e:** Çifte rezervasyon veritabanı seviyesinde GiST `EXCLUDE` kısıtıyla korunuyor — bu güçlü. `create_match_atomic` idempotency taşıyor. Ancak K-3.1/K-3.3 kararı yeni bir zincir gerektiriyor: **saha sahibi rezervasyonu iptal → maç iptal → tüm katılımcılara eksiksiz iade → herkese bildirim.** Bugün bu zincirin **hiçbir halkası** bağlı değil (`owner_cancel_confirmed_booking` `matches`'a dokunmuyor). Ayrıca Y-1 (Universal Links) mimari bir karardır: web sayfası + uygulama aynı adresi paylaşacak.

**SRE'ye:** `sweeper_enabled = false` (askıda ödeme süpürücüsü kapalı) — K-2.1 ile online ödeme geldiğinde bu **P0** olur. `push_live_enabled = false`. Sentry/PostHog anahtarları girilmemiş. `admin_mfa_required = false`. Bölge `ap-southeast-1` (Singapur) — Türkiye kullanıcısı için hem gecikme hem veri yeri sorusu. Tek kurucu (K-7.1) → otomasyon ve alarm, insan nöbetinden önemli.

**Security'ye:** K-2.1 (online ödeme) + K-5.1 (kaleci teminatı + online ödeme) birlikte **cüzdanda gerçek para tutmayı kesinleştirdi**. Bu, Türkiye'de 6493 sayılı kanun kapsamında ödeme kuruluşu/elektronik para lisansı sorusunu doğurur ve repoda bu konuda **hiçbir analiz yok** (mevcut hukukçu notu yalnız tüketici iade hakkına bakmış). Ayrıca: `demo_mode_enabled` canlıda açık ve RLS politikaları buna bağlı; `get_nearby_matches` `SECURITY DEFINER` ve RLS'i baypas ediyor; `admin_broadcast_notification`'ın `p_type` parametresi whitelist'siz.

---

*Son güncelleme: 3 Ağustos 2026 · CPO turu + kurucu kararları işlendi*
