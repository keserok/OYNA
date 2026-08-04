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
| 2 | **CTO** | ✅ Tamamlandı (3 Ağu 2026) · kurucu yanıtı bekliyor | `docs/board/02-cto.md` |
| 3 | **Software Architect** | ✅ Tamamlandı + **P-0…P-5, P-7 uygulandı** (4 Ağu 2026) | `03-mimar.md` · `UYGULAMA-PLANI.md` |
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

## K-8 · CTO turu kararları (3 Ağustos 2026)

| # | Karar | Durum |
|---|---|---|
| **K-8.1** | **Kapılar doğru kurulacak ve kurulduğu sürekli ölçülecek.** Güven sınırı paketi (G1–G6) + kapı envanteri. Ayrıntı: `02-cto-EK-guven-siniri.md` | ⏳ Uygulanacak |
| **K-8.2** | **Sessizce yanlış davranan kural bırakılmayacak.** Altı sessizlik türü için otomatik dedektör ("Sessizlik Denetçisi") kurulacak. Ayrıntı: `02-cto-EK2` Bölüm 1 | ⏳ Uygulanacak |
| **K-8.3** | **Supabase bahsi bilinçli sürdürülecek.** Çıkış maliyeti belgelenecek, Supabase'e özgü bağımlılıklar listelenip sayısı izlenecek. Bahis doğru; amaç dış şoka hazırlıklı olmak. Ayrıntı: `02-cto-EK2` Bölüm 2 | ⏳ Uygulanacak |
| **K-8.4** | **Altı katmanlı erken uyarı sistemi kurulacak:** katı tip denetimi · saldırı testleri · kapı envanteri · sessizlik denetçisi · para denetçisi · hata izleme + huni. Ayrıntı: `02-cto-EK2` Bölüm 3 | ⏳ Uygulanacak |
| **K-8.5** | **Demo verisi kalacak ama zararsız hale getirilecek.** D1–D4: para/katılım fonksiyonları demoyu reddetsin · vitrin filtresi · seed/purge kapatılsın · ölçüm demoyu hariç tutsun. Ayrıntı: `02-cto-EK2` Bölüm 4 | ⏳ Uygulanacak |
| **K-8.6** | **Ayrı staging ortamı için ek maliyet KABUL EDİLMEDİ** (S1: hayır). Ancak K-8.7'nin doğal yan ürünü olarak test ortamı elde edilecek. | ✅ Karar |
| **K-8.7** | **Veritabanı Avrupa'ya taşınacak** (S3: taşıyalım). Hedef: mevcut `oyna-staging` projesi — zaten `eu-central-1`/Frankfurt'ta. Taşıma sonrası Singapur projesi test ortamı olur. **Ayrı plan gerekiyor; Mimar turunda ele alınacak.** | ⏳ Planlanacak |
| **K-8.8** | **`Hadi` Supabase projesi kapatıldı** (S4: kapat). Boş olduğu doğrulandı (0 tablo, 0 kullanıcı, 0 dosya), duraklatıldı. | ✅ **YAPILDI** |
| **K-8.9** | **Sürüm numarası otomatikleştirilecek** (S5: olur). `package.json` tek kaynak; Android ve iOS oradan okuyacak. | ⏳ Uygulanacak |
| **K-8.10** | **İyzico geçiş tarihi bilinmiyor** (S2: hayır). Bu yüzden güven sınırı işleri **ödeme beklenmeden** yapılacak — tarih yarın olabilir. | ✅ Karar |

## K-9 · Sonraki roller için kurucu direktifi

| # | Direktif |
|---|---|
| **K-9.1** | **Sistem Mimarı turu daha derin ve kapsamlı olacak.** Kurucu talebi: *"daha zeki ve kapsamlı bir iş çıkarıp sorularını tüm sistemi mükemmelleştirmeye yönelik sor."* Mimar turu, tek tek hata avından çok **sistemin bütün olarak doğru kurulmasına** odaklanacak; sorular da bu düzeyde olacak. |

## K-10 · Mimar turu kararları (3 Ağustos 2026)

Kurucu, Mimar turunun **üç çakışma çözümünü de** ve **on sorunun tamamını** yanıtladı.

| # | Karar | Sonuç |
|---|---|---|
| **K-10.1** | **Bölge taşıma onaylandı.** "Kimse etkilenmez çünkü herkes demo." Kesinti penceresi serbest. | M-P0-9 uygulanacak. **Ön koşul: M-P0-8 (migration bombası) önce çözülecek.** |
| **K-10.2** | **Pro plana sonra geçilecek; fotoğraflar Pro OLMADAN da çalışmalı.** | Yükleme anında küçük/orta/büyük boy üretilip saklanacak; `render/image/public` yoluna bağımlılık kaldırılacak. Sıkıştırma kaçış yolu da kapatılacak. |
| **K-10.3** | **Tek doğru kadro kaynağı: `match_participants`.** Ek direktif: *"diğer tabloyu da tam olarak incele ve gerekli bağlanıp ayarlanması gereken bir şey varsa ayarla."* | `match_participants` tam envanteri çıkarılacak (sütunlar, kısıtlar, indeksler, RLS, tetikleyiciler, yazan/okuyan tüm fonksiyonlar); eksikler tamamlanacak. Kapsam yalnız 3 fonksiyonu düzeltmekle sınırlı değil. |
| **K-10.4** | **Süpürücü politikası: "ödeme alınmadıysa alınmasın, alındıysa alınsın."** | Mimar önerisi (a) — iyzico ile mutabakat. **Mevcut `sweep-stale-payments` kodu zaten tam olarak bunu yapıyor** (aşağıdaki kök neden notuna bak). |
| **K-10.5** | **Zehirli maç: 3 denemeden sonra dur, insana sor.** | `auto_process_matches`'e deneme sayacı + `NEEDS_REVIEW` durumu + panelde kırmızı liste. |
| **K-10.6** | **`starts_at` tek doğru zaman kaynağı olacak, sağlam kurulacak.** | Metin `date`/`time` veritabanı tarafından türetilecek; sapma fiziksel olarak imkânsız hale gelecek. |
| **K-10.7** | **Yalnız Türkiye saati geçerli.** Yurt dışı hedefi yok. | `Europe/Istanbul` sabit kalır. Saha bazlı saat dilimi alanı **eklenmeyecek** — iş yükü sıfır. |
| **K-10.8** | **Demo verilerin canlıda düzeltilmesine izin verildi.** "Her şeyi yeni sisteme uygun halledebilirsin." | Kadro sapmaları + sözlük dışı `CONFIRMED` durumu düzeltilecek. Ayrıca tüm denetim sorguları `isDemo` filtreli olacak. |
| **K-10.9** | **Günlük denetim + panelde "Sistem Sağlığı" kartı + kırmızıda e-posta onaylandı.** | E-posta bilinçli tercih: denetçi, denetlediği bildirim kanalına bağımlı olamaz. |
| **K-10.10** | **Sıralama: para ailesi önce.** | M-P0-1/2/4/5 ilk pakette. Tek istisna M-P0-8 — hemen, çünkü göçün ön koşulu. |
| **K-10.11** | **Çakışma 1, 2 ve 3'ün çözümleri onaylandı.** | Sırasıyla: önce `get_my_matches()` sonra limit · demo veriler kalır ama kurallara uydurulur + denetim demo hariç çalışır · ölçek işleri ikiye bölünür (lansman öncesi M-P0-6/7/8/9, sonrası diğerleri). |
| **K-10.12** | **Kalıcı mekanizma istendi.** *"Öyle dosyalar üretelim ki mekanizma inanılmaz sağlam olsun, lakin bir sistem değiştirdiğimizde mekanizmanın temel yapı taşlarından hangilerini ilgilendirdiğini dahi görebilelim."* | `docs/sistem/` altında kuruldu — bkz. aşağıdaki bölüm. |

### 🔎 K-10 turunda bulunan KÖK NEDEN — iki P0 tek sebepten

Mimar raporu yazıldıktan sonra kazıldı ve **M-P0-2 ile M-P0-3'ün aynı kök nedenden**
doğduğu bulundu. Üç ayar kutusu boş:

| Ayar | Nerede | Canlı değeri |
|---|---|---|
| `app.settings.functions_base_url` | Veritabanı ayarı | **BOŞ** |
| `app.settings.webhook_secret` | Veritabanı ayarı | **BOŞ** |
| `WEBHOOK_SECRET` | Edge Function ortam değişkeni | **BOŞ** |

**Sonuçları:** süpürücü cron'u hiç kurulmadı (para toplanmıyor) + push köprüsü
`500 Server misconfigured` dönüyor (bildirim gitmiyor).

**Mimarın kendi bulgusunu düzeltmesi:** M-P0-2'de "süpürücü hiç kurulmamış" denmişti —
**yanlıştı.** `supabase/functions/sweep-stale-payments/index.ts` (237 satır) tam yazılmış
ve K-10.4'teki kurucu kararının birebir kendisini uyguluyor. Migration da doğru davranmış:
ayarların boş olduğunu fark etmiş, `RAISE NOTICE` ile uyarmış, zarar vermemek için cron'u
kurmamış ve **BAŞARILI tamamlanmış.** Uyarıyı kimse görmemiş. Efor 1,5 günden birkaç saate düştü.

**Push için üç kusur sırayla ortaya çıkacak:** (1) şimdi `WEBHOOK_SECRET` boş → 500,
(2) düzeltilince `Authorization` başlığı yok → 401, (3) o da düzeltilince gövde biçimi yanlış.
**Üçü birden düzeltilmeden "push çalışıyor" denemez.**

> Bu olay, K-8'deki "sessizce yanlış davranan kural"ın en saf örneğidir:
> **kod doğru davrandı, uyardı, ve uyarısı kimseye ulaşmadı.**

## K-11 · Mekanizma kararları (3 Ağustos 2026)

| # | Karar | Sonuç |
|---|---|---|
| **K-11.1** | **Durdurma politikası ikili.** 🔴 KRİTİK taşlarda (PARA, KAPILAR, KİMLİK, AYARLAR) iş **durur**, devam için CEO onayı gerekir. Diğerlerinde uyarır, devam eder. | `etki.mjs` bu davranışı taşıyor; uygulama aşamasında zorlayıcı hale gelecek. |
| **K-11.2** | **Saha sahibi ve pazaryeri ekranları "inanılmaz özen" hak ediyor.** | `B13 SAHA-SAHIBI` ve `B14 PAZARYERI` **ORTA → YÜKSEK** çıkarıldı. B13'e `views/owner/` ağacı (52 dosya) + 5 servis + Edge Function bağlandı → 12 dosyadan **70 dosyaya**. B14'e 3 ekran eklendi → **9 dosya**. `views/owner/finance/` ayrıca `B01 PARA`'ya da bağlandı (bir dosya birden fazla taşa ait olabilir). Üç yeni kontrol: `K-SAHIBI-1`, `K-SAHIBI-2`, `K-PAZAR-1`. **Kapsam %42 → %63.** |
| **K-11.3** | **"Kontrol edilemedi" = KIRMIZI.** | Bilinçli tercih; bedeli ara sıra yanlış alarm. Gerekçe: bu projedeki pahalı hataların hepsi "bilinmiyor"un "sorun yok" sanılmasından çıktı. |
| **K-11.4** | **Günlük rapor admin panelinde "Sistem Sağlığı" ekranına yazılacak** (panel hazır), kırmızıda ayrıca e-posta. | Ekranda: taş başına yeşil/sarı/kırmızı, kırılan kontrolün adı ve zamanı, 30 günlük geçmiş. E-posta ayrıca gider — denetçi, denetlediği bildirim kanalına bağımlı olamaz. |
| **K-11.5** | **Kapsam zorunluluğu lansmandan SONRA açılacak.** | `npm run sistem:kapsam -- --sert` CI'a lansman sonrası eklenir. Önce alışkanlık, sonra kural. |
| **K-11.6** | **`CLAUDE.md` bağlaması oturum sonunda, toplu yapılacak.** | K-6.5 ile birlikte: tek master prensipler dosyası + `CLAUDE.md` pusula güncellemesi + mekanizma maddesi aynı anda yazılacak. |

> **K-11.2 mimari olarak da doğru bir karardır**, yalnız kurucu tercihi değil: `views/owner/`
> kod tabanının **en büyük tek alt ağacı** (52 dosya) ve gelirin toplandığı operatör yüzeyi;
> pazaryeri ise K-5.1 gereği teminat ve online ödeme taşıyor — yani gerçek para.

## K-12 · Ölçek kararı (3 Ağustos 2026)

| # | Karar | Sonuç |
|---|---|---|
| **K-12.1** | **Küresel canlı abonelik kapatılacak** (Mimar önerisi (c)). "Top Oyna" kartlarındaki doluluk sayısının **anlık** tazeliğinden şimdilik vazgeçiliyor. | Aylık canlı mesaj **~6M → ~200K**; açılışta inen veri **17,3 MB → ~50 KB**; cron patlaması biter. |
| **K-12.2** | **Ön koşul:** kapatmadan önce `get_my_matches()` kaleci/hakem atamalarını da kapsayacak. | Aksi halde Kaleci/Hakem paneli eksik liste gösterir. |
| **K-12.3** | Bu bir **geri alınabilir** karardır; hattı yeniden açmak tek satırlık iştir. | Yanlış çıkarsa bedeli düşük. |

### 📌 PRO PLANA GEÇİLDİĞİNDE YENİDEN DEĞERLENDİRİLECEKLER

Ücretsiz planın sınırları yüzünden bugün verilen kararlar. Pro alındığında tekrar açılabilir:

| # | Konu | Bugünkü karar | Pro'da ne değişir |
|---|---|---|---|
| PRO-1 | **Küresel canlı abonelik** (K-12.1) | Kapatıldı | 2M mesaj sınırı kalkar → keşif kartlarında anlık doluluk geri açılabilir |
| PRO-2 | **Eşzamanlı canlı bağlantı** | 200 sınırı var | 500'e çıkar → 200'üncü kullanıcıdan sonrası da canlı güncelleme alır |
| PRO-3 | **Görsel dönüştürme** (K-10.2) | Yükleme anında çok boy üretilecek | Sunucu tarafı dönüştürme açılır, yükleme akışı sadeleşir |
| PRO-4 | **Aylık dışa veri** | 5 GB | 250 GB → global sorgu sınırları gevşetilebilir |
| PRO-5 | **Veritabanı dalı ile test** | Yok (doğrudan canlı) | Her paket için geçici kopya açılabilir |

---

## K-13 · Uygulama turu kararları (4 Ağustos 2026)

| # | Karar | Uygulandı mı |
|---|---|---|
| **K-13.1** (S-1) | Bölge de konum da yoksa "Top Oyna" ülke geneli göstermez: önce **konum izni** istenir, verilmezse **ilçe seçimine** yönlendirir. | ✅ |
| **K-13.2** (S-2) | **Şimdilik e-posta yok.** Alarm yalnız admin panelinde görünür. | ✅ |
| **K-13.3** (S-4) | "Sistem Sağlığı" ayrı sayfa değil, **Komuta Merkezi** içinde bölüm. | ✅ |
| **K-13.4** (S-5) | **30 günlük geçmiş** saklanır. | ✅ |
| **K-13.5** (S-6) | Staging şeması **kurucu tarafından** doldurulacak. | ⏳ kurucuda |
| **K-13.6** (S-7) | Bölge göçü, paketler bitince yapılacak. | ⏳ sırada |
| **K-13.7** (S-9) | `push_live_enabled` **lansmana kadar kapalı kalır.** | ✅ kapalı |
| **K-13.8** (S-10) | Ahmet Kuru 2. Saha 0 ₺ tarifesi **şimdilik kalsın.** | ✅ kayda geçti |

> **K-13.2 notu:** E-posta olmadığı için denetim sonucunu görmek **panele girmeyi** gerektirir.
> P-0'da öğrenilen ders (*"kimseye ulaşmayan uyarı, hiç olmamış uyarıdır"*) burada bilerek
> kabul edildi; e-posta ileride eklenecek (`send-email` altyapısı hazır, yalnız Resend anahtarı eksik).

---

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

## CTO — P0'lar

> Tamamı **canlı veritabanında tarafımdan test edilerek** doğrulandı. Ayrıntı: `docs/board/02-cto.md`

| # | P0 | Kanıt | Durum |
|---|---|---|---|
| CTO-P0-1 | **`matches` kaydı istemciden doğrudan yazılabiliyor.** `matches_update` politikasında `WITH CHECK` yok; `authenticated` rolü **58 sütuna** UPDATE yetkili — `price`, `commission_rate_pct/markup_pct/markup_amount`, `slots`, `deposit_status`, `status` dahil. Koruyucu tetikleyici yok (`trg_set_match_commission_model` yalnız INSERT). | canlı `pg_policies` + `column_privileges` | 🔴 AÇIK |
| CTO-P0-2 | **İade oranı istemcinin gönderdiği saatten hesaplanıyor.** `process_tiered_refund(p_hours_to_match)` gerçek başlangıç saatini hiç okumuyor; `authenticated`'a açık. | canlı fonksiyon gövdesi + yetki testi | 🔴 AÇIK |
| CTO-P0-3 | **Kaporanın alt sınırı yok.** `record_app_deposit_payment` yalnız tavan kontrolü yapıyor; %30 kuralı yalnız istemcide (`PitchDiscovery.tsx:980`). `direct_booking_deposit_default_pct` ayarı 554 fonksiyonun hiçbirinde okunmuyor. | canlı fonksiyon gövdesi | 🔴 AÇIK |
| CTO-P0-4 | **`match_block_deposit` keyfi tutarla `authenticated`'a açık.** Denetim migration'ı kardeş fonksiyonları kapatmış, bunu atlamış. | canlı yetki testi | 🔴 AÇIK |
| CTO-P0-5 | **Herkes herkese bildirim yazabiliyor.** `notifications_insert_own_sender` yalnız `sender_id = auth.uid()` istiyor; `user_id` başkası olabilir. Bildirim doğrudan push'a dönüşüyor. | canlı `pg_policies` | 🔴 AÇIK · **push açılmadan önce şart** |
| CTO-P0-6 | **Staging yok.** `oyna-staging` INACTIVE; üretim URL+anahtarı `supabaseClient.ts:13-15`'te gömülü, env eksikse sessizce canlıya bağlanıyor; CI her PR'da canlıya vuruyor. | canlı proje durumu + `admin-tests.yml:37-51` | 🟡 CEO KARARI (S1) |
| CTO-P0-7 | **Ne zorunlu güncelleme var ne canlı yama.** Force-update mekanizması yok, OTA yok. İki kaçış yolu da kapalı. | tam repo taraması + `capacitor.config.ts:48-50` | 🔴 AÇIK |
| CTO-P0-8 | **TypeScript katı modu kapalı** (`tsconfig.json`'da `strict` anahtarı yok), 500 `any`. Ayrıca `supabase/functions/` typecheck kapsamı dışında — 15 Edge Function hiç denetlenmiyor. Maliyet ölçüldü: `--strict` ile **38 hata**, 19'u tek dosyada. | `tsconfig.json:32-51` | 🔴 AÇIK |
| CTO-P0-9 | **Bus factor 1.** 198 commit'in 156'sı (%79) Claude oturumları. Kodu okuyabilen ikinci insan yok. `README.md`'nin işaret ettiği 6 yoldan 5'i mevcut değil. | git geçmişi + `README.md` | 🔴 AÇIK |

## CTO — P1/P2 özeti

Acil durdurma anahtarı 554 fonksiyondan 8'ini kapsıyor · özellik bayrakları hiçbir sunucu kapısına bağlı değil (`is_feature_enabled` 0 çağrı) · panelde **9 ölü ayar** (6'sı fair-play) · admin paneli mobil pakete giriyor · `IYZICO_BASE_URL` varsayılanı canlı ödeme ortamı · `VITE_DEMO_ACCOUNTS` fail-open + `?demo=1` her adreste · lansman planındaki 2 env bayrağı kodda hiç okunmuyor · sürüm 4 dosyada elle · `.gitignore` 3 npm komutunun dosyasını yutmuş · filtresiz+temizlenmeyen global maç aboneliği · 229 fonksiyon çok kez tanımlanmış · iOS `PrivacyInfo.xcprivacy` yok · 3 kullanılmayan bağımlılık (biri kamera izni → mağaza riski) · iki harita motoru birden · KVKK/veli onayı ve admin denetim kayıtları sessizce yutulabiliyor · boş 3. Supabase projesi.

## CTO — canlıda doğrulanan güçlü yanlar

Migration sapması **sıfır** (398=398, "defterde yok" denen 8 baseline de defterde — dokümanlar bayat) · **554/554** `SECURITY DEFINER` fonksiyonda `search_path` sabitlenmiş · `profiles` sütun düzeyinde iki katmanlı korumalı (kullanıcı kendi cezasını kaldıramıyor, bakiyesini değiştiremiyor, rol yükseltemiyor) · anonim yazma politikası **yok** · çifte rezervasyon DB kısıtıyla engelli · sır sızıntısı yok, `gitleaks` doğru yapılandırılmış · migration değişmezliği CI ile zorlanıyor · **0** `@ts-ignore`, **2** boş `catch`, 1426 test yeşil · para akışı SQL entegrasyon testleriyle korunuyor.

---

## MİMAR — P0'lar

> Tamamı **canlı veritabanında tarafımdan ölçülerek** doğrulandı. Ayrıntı: `docs/board/03-mimar.md`

| # | P0 | Kanıt | Durum |
|---|---|---|---|
| M-P0-1 | **Ödeme ve maç kapanışı ters sırada kilit alıyor — kilitlenme (deadlock) kaçınılmaz.** `apply_card_payment`: payment_intents → pitch_bookings → matches. `process_match_at_deadline`: matches → payment_intents. Kesilen taraf ödeme olursa para çekilir, slot verilmez. | canlı fonksiyon gövdelerinden kilit sırası çıkarımı | 🔴 AÇIK |
| M-P0-2 | **Ödeme süpürücüsü iki kez ölü.** `sweeper_cron=0`, `sweeper_enabled="false"`, 13 cron işinde süpürücü yok — ama `payment_provider=IYZICO`. Yarıda kalan ödeme sonsuza dek askıda. M-P0-1 ile birleşince para kaybı zinciri tamamlanıyor. | canlı `app_config` + `cron.job` | 🔴 AÇIK |
| M-P0-3 | **Dışarı giden tüm HTTP çağrıları başarısız: 18/18 = HTTP 500.** `notify_send_push_webhook()` ne `Authorization` başlığı gönderiyor ne doğru gövde biçimini. Hiçbir push bildirimi gitmiyor, hata hiçbir yere yazılmıyor. | canlı `net._http_response` + fonksiyon gövdesi | 🔴 AÇIK · **K-3.3 iade bildirimlerinin ön koşulu** |
| M-P0-4 | **Kadro çift kaynaklı ve canlıda zaten ayrışmış.** 20 maçın 12'sinde JSON kadrosu ile `match_participants` uyuşmuyor (**2'si gerçek maç**). `player_release_slot`/`player_self_assign`/`player_unassign_slot` yalnız JSON yazıyor, tabloya yazmıyor. | canlı karşılaştırma sorgusu + fonksiyon taraması | 🔴 AÇIK · S-3 kararı gerekiyor |
| M-P0-5 | **`matches.status` için CHECK yok; hesap silme kapısı hayalet sözlük arıyor.** Kapı `('GATHERING','CONFIRMED','PLAYING','LIVE')` kontrol ediyor; sistemin gerçekten kullandığı `ACTIVE` listede yok. Sonuç: **parası bloke kullanıcı hesabını silebilir.** Canlıda sözlük dışı `CONFIRMED` satırı da mevcut. | canlı `pg_constraint` + `_account_deletion_status:40` + durum dağılımı | 🔴 AÇIK |
| M-P0-6 | **`fbGetMatches` limitsiz — açılışta tüm maç tablosu iniyor.** `supabaseMutations.ts:362`. Satır ort. 3.457 B → 5.000 maçta **17,3 MB/açılış**; 500 eşzamanlıda **8,6 GB** = ücretsiz planın 5 GB aylık kotasının 1,7 katı, tek Cuma akşamında. | kod + canlı satır boyutu ölçümü | 🔴 AÇIK |
| M-P0-7 | **`matches-list-sync` filtresiz canlı abonelik.** `store.ts:562-564`. Her maç değişikliği tam satır olarak herkese gidiyor: aylık ~6M mesaj (kota 2M), cron patlamasında saniyeler içinde 50.000 mesaj. | kod + canlı `pg_publication_tables` | 🔴 AÇIK |
| M-P0-8 | **Migration yeniden kurma bombası.** Canlı **DOĞRU** (20/20 maçta sıfır saat sapması), ama repodaki son `player_create_match` tanımı (`20260826000001:245`) 3 saat kaydıran deseni taşıyor. Sıfırdan kurulum sessizce yanlış açılır. **S3 bölge göçünün ön koşulu.** | repo satırı + canlı desen doğrulaması | 🔴 AÇIK |
| M-P0-9 | **Veritabanı Singapur'da** (`ap-southeast-1`); her isteğe 160–220 ms. Açılış 15 istek, lobi 10–14 istek. Frankfurt'a taşıma oturum başına ~5 sn kazandırır ve **bugün en ucuz** (33 profil). | canlı proje bölgesi + istek sayımı | 🟡 CEO KARARI (S-1) |

## MİMAR — P1/P2 özeti

`pitch_slot_holds` ölü tablo (0 yazan, 0 temizleyen) · coğrafi indeks hiç kullanılmıyor (canlı EXPLAIN'de Seq Scan) · ana sayfa sayacı için 345 KB–1 MB iniyor (kod yorumu yanlış) · lobide her satışta herkeste 4 sorgu → 14 kişilik lobide 784 sorgu · `MatchJoin.tsx`'te 13 noktada gereksiz tam yeniden çekme · `auto_process_matches` zehirli hap biriktiriyor (alt sınır yok + hata yutuluyor) · `send_match_reminders` 1.400 tekil INSERT + 50.000 canlı mesaj · `recharts` her oyuncuya iniyor, `react-vendor` chunk'ı boş üretiliyor · **hiçbir önbellek katmanı yok** (0 materialized view, 0 istemci önbelleği) · fotoğraf sıkıştırmasında kaçış yolu — canlıda 6,8 MB PNG bulundu; görsel dönüştürme ücretsiz planda çalışmayabilir · `VirtualList` yazılmış ama 0 kez kullanılıyor · kopyalanmış alanların hiçbirinde senkron trigger'ı yok (`teams`'te 0 trigger) · `tsconfig` katı mod kapalı + `tests`/`supabase`/`notifications` kapsam dışı · abonelik üretimi gün-gün döngüyle · admin paneli 17 tam tablo sayımı.

## MİMAR — canlıda doğrulanan güçlü yanlar

**Çifte rezervasyon matematiksel olarak imkânsız** (`pitch_bookings_no_overlap` GiST EXCLUDE, `court_id NOT NULL`, trigger'la beslenen `slot_range`) · **slot satın alma yarışı kilitli** (`player_buy_slots_v2__inner` içinde `FOR UPDATE`) · **cüzdan eksiye düşemiyor**, `check_money_invariants()` 8 değişmezde `ok:true` · **zaman sapması sıfır** (20/20 maçta metin saat = mutlak saat) · **migration defteri temiz** (398=398) · `get_facility_schedule` örnek gösterilecek kalitede (31 günlük pencere sınırı + yetki kapısı + tek sorgu) · saha kartlarındaki tarife/müsaitlik N+1 **değil**, toplu çekilmiş · 12 aboneliğin 11'i doğru filtrelenmiş.

## MİMAR — keşif ekiplerinin abartılı iddiaları (düzeltildi)

| İddia | Gerçek |
|---|---|
| "Canlıda `player_create_match` saatleri 3 saat kaydırıyor" | **Yanlış.** Canlı doğru desen kullanıyor; sorun yalnız repo yeniden kurma yolunda (M-P0-8). |
| "`pitch_bookings.payment_status`'ta CHECK yok" | **Yanlış.** `pitch_bookings_payment_status_check` canlıda var. CHECK'i eksik olan yalnız `matches.status`. |
| "6 fonksiyonda hayalet durum sözlüğü" | **Abartılı.** Canlıda 3 fonksiyon (hepsi hesap silme ailesi). |
| "Arkadaş listesinde N+1" | **Yanlış.** `socialService.ts:114-118` tek RPC, temiz. |

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
| **5** | **Demo satırlarını kurallara uydurabilir miyim?** 12 sapmalı maçın 10'u demo; sözlük dışı `CONFIRMED` satırı da demo. Kalıcı denetim bunlar yüzünden her gün boşuna kırmızı yanacak. Canlı veri değişikliği — onay gerekiyor. | 🔴 **AÇIK** (Mimar S-8) |
| **6** | **Bölge taşıma (Singapur → Frankfurt) için kesinti penceresi verilir mi?** Bugün 33 profille en ucuz an; her yeni kullanıcı maliyeti artırır. | 🔴 **AÇIK** (Mimar S-1) |
| **7** | **Supabase Pro planına ne zaman geçiyoruz?** Saha fotoğraflarının görünmesi buna bağlı olabilir; ücretsizde kalınacaksa yükleme anında küçük boy üretimi yazılmalı (~1 gün ek iş). | 🔴 **AÇIK** (Mimar S-2) |
| **8** | **Kadroda tek doğru kaynak hangisi olsun?** Mimar önerisi: `match_participants`. K-3.3'teki "herkese eksiksiz iade" bu karara bağlı. | 🔴 **AÇIK** (Mimar S-3) |
| **9** | **Yarıda kalan ödeme için süpürücü politikası ne olsun?** (a) bankaya sor-çöz, (b) doğrudan iptal, (c) admin paneline düşür. Mimar önerisi: (a)+(c). | 🔴 **AÇIK** (Mimar S-4) |
| **10** | **İşlenemeyen maç kaç denemeden sonra durup CEO'ya sorsun?** Mimar önerisi: 3 deneme → `NEEDS_REVIEW` + panelde kırmızı. | 🔴 **AÇIK** (Mimar S-5) |
| **11** | **`starts_at` tek doğru zaman kaynağı olsun mu?** Metin `date`/`time` veritabanı tarafından türetilirse saat sapması fiziksel olarak imkânsız hale gelir. | 🔴 **AÇIK** (Mimar S-6) |
| **12** | **Yurt dışı / farklı saat dilimi hedefi var mı?** Yoksa iş yükü sıfır; varsa saha bazlı saat dilimi alanı **şimdi** eklenmeli (~0,5 gün). | 🔴 **AÇIK** (Mimar S-7) |
| **13** | **Kalıcı denetim ne sıklıkta, nereye rapor etsin?** Mimar önerisi: günlük + admin panelinde "Sistem Sağlığı" kartı + kırmızıda e-posta (push'a bağımlı olmasın). | 🔴 **AÇIK** (Mimar S-9) |
| **14** | **Sıralama: para ailesi mi ölçek ailesi mi önce?** Mimar önerisi: **para ailesi önce** (M-P0-1/2/4/5), tek istisna M-P0-8 hemen. | 🔴 **AÇIK** (Mimar S-10) |

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
| **P-0** | **Hızlı kazanımlar** | K-4.5'in 6 maddesi + CTO'nun 6 hızlı kazanımı | Düşük |
| **P-GS** | **Güven sınırı** ⚠️ | CTO-P0-1…5 — maç kaydı sütun koruması, iade saati, kapora tabanı, `match_block_deposit` kapatma, bildirim politikası. **CPO wedge'inden ÖNCE gelir** (ÇAKIŞMA 1). | **Yüksek — para** |
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

# BÖLÜM VII — MEKANİZMA (K-10.12)

Kurucunun isteği üzerine `docs/sistem/` altında kalıcı düzenek kuruldu ve **çalışır durumda**.

| Dosya | Ne |
|---|---|
| `docs/sistem/MEKANIZMA.md` | Sade Türkçe kullanım kılavuzu — **buradan başlanır** |
| `docs/sistem/YAPI-TASLARI.json` | 15 temel yapı taşı (tek kaynak, makine okunur) |
| `docs/sistem/KONTROLLER.json` | 29 kontrol; her birinde "yakaladığı sessizlik" yazılı |
| `docs/sistem/SISTEM-HARITASI.md` | **Üretilen** okunabilir harita (elle düzenlenmez) |
| `scripts/sistem/etki.mjs` | `npm run etki` — değişiklik hangi taşlara dokunuyor |
| `scripts/sistem/kapsam.mjs` | `npm run sistem:kapsam` — çürüme bekçisi |
| `scripts/sistem/harita.mjs` | `npm run sistem:harita` — haritayı yeniden üretir |

**15 yapı taşı:** B01 PARA 🔴 · B02 KADRO 🟠 · B03 ZAMAN 🟠 · B04 REZERVASYON 🟠 ·
B05 KAPILAR 🔴 · B06 BİLDİRİM 🟠 · B07 KAPSAMA 🟡 · B08 KİMLİK 🔴 · B09 YÜK 🟡 ·
B10 OTOMASYON 🟠 · **B11 AYARLAR 🔴** · B12 DEMO ⚪ · B13 SAHA SAHİBİ 🟠 ·
B14 PAZARYERİ 🟠 · B15 SOSYAL 🟡

> **B11 AYARLAR bu turda doğdu.** Bugünkü iki büyük arızanın tek kök nedeni bu alandaydı
> ve **hiçbir yapı taşı oraya sahip çıkmıyordu.**

**Çürümeye karşı üç savunma:** (1) tek kaynak + üretilen metin — aynı bilgi iki yerde
tutulmadığı için ayrışamaz, (2) kapsam bekçisi — haritaya bağlanmamış dosyayı listeler,
CI'da hata verdirilebilir, (3) açık bulgular haritada yaşar, araç her seferinde yüzüne söyler.

**Dürüst durum:** kapsam **%63** (289 dosyadan 182'si). K-11.2 sonrası saha sahibi ağacı da
bağlandı. Kalan 107 dosya ağırlıklı olarak genel arayüz bileşenleri.

**Henüz yapılmayanlar** (kod aşamasında): 17 SQL kontrol dosyası · 5 tarayıcı komutu ·
günlük denetim işi + Sistem Sağlığı kartı · kırmızıda e-posta · CI'da sert kapsam denetimi ·
kapsamın yükseltilmesi. Tam liste `MEKANIZMA.md` §7'de — **bilerek görünür bırakıldı.**

---

## Mimar turundan sonraki roller için ek notlar (3 Ağu 2026)

**Principal Engineer'a:** Mimar turu **yapıyı** denetledi, **kod kalitesini** denetlemedi — orası size ait.
Elinizde şu somut başlangıç noktaları var: `MatchJoin.tsx` **2.643+ satır** ve içinde 13 ayrı yerde
aynı yeniden-çekme kalıbı tekrarlanıyor (M-14) — burası bu kod tabanının en yüksek karmaşıklıklı
dosyası ve dokunulan her akış oradan geçiyor. `tsconfig.json` katı mod kapalı ve `tests`,
`supabase`, `notifications`, `src` klasörleri hiç tip kontrolünden geçmiyor (M-22, CTO-P0-8).
`VirtualList.tsx` yazılmış ama sıfır kez kullanılıyor; `redeemReferralCode` (`socialService.ts:187`)
sıfır çağrılı; `subscribeToOpenMatches` (`matchService.ts:43-47`) ölü ama tetiklenirse her olayda
tüm açık maçları yeniden çeker. Bu üçü aynı ailenin üyesi: **yazılmış, bağlanmamış, kimse fark
etmemiş.** Ölü kod envanteri bu turda çıkarılmadı — sizin turunuzun doğal işi.
Bir de: 1426 test yeşil ama testler tip kontrolü dışında; "yeşil" ifadesinin ne kadarına
güvenebileceğimizi netleştirmek gerekiyor.

**SRE'ye:** Mimar turu SRE'nin işini **büyüttü.** Üç yeni somut madde: (1) `net._http_response`
tablosunda **18/18 çağrı HTTP 500** — sistemin dışarı açılan tüm kapıları kapalı ve bunu ölçen
hiçbir şey yok (M-P0-3); bu, izleme (monitoring) kurmanın *neden* birinci iş olduğunun canlı
kanıtı. (2) 13 cron işi var ama **süpürücü yok** ve `auto_process_matches` başarısız işi sonsuza
dek yeniden deniyor, hatayı yutarak (M-P0-2, M-15) — cron'ların kendi sağlık raporu yok.
(3) Ücretsiz plan sınırları operasyonel bir tavan: 5 GB aylık veri, 200 eşzamanlı canlı bağlantı,
2M canlı mesaj — mevcut mimariyle **tek Cuma akşamı** üçü de aşılıyor (M-P0-6, M-P0-7).
Bölge göçü (M-P0-9) sizin planlayacağınız iş ve **M-P0-8 çözülmeden başlatılmamalı.**

**Security'ye:** Mimar turunda iki bulgu doğrudan sizin alanınıza giriyor. (1) `matches.status`
CHECK'siz olduğu için hesap silme kapısı hiç tetiklenmiyor — **parası bloke kullanıcı hesabını
silebiliyor** (M-P0-5); bu bir yetki açığı değil, bir *sessiz kapı* açığı ve CTO-P0-1'le
(58 sütun istemciden yazılabilir) aynı aileden. (2) Push köprüsü `Authorization` başlığı olmadan
çağrı yapıyor (M-P0-3) — düzeltilirken `service_role` anahtarının fonksiyon gövdesine gömülmemesi,
Vault'ta tutulması şart; aksi halde 554 fonksiyonun tanımını okuyabilen herkes anahtarı görür.
Ayrıca M-P0-4'teki kadro ayrışması bir yetki sorunu değil ama **para iadesi kime yapılacak**
sorusunu belirsiz bıraktığı için finansal denetim açısından sizi ilgilendirir.

**Strategic Advisor'a:** Bu turun tek cümlelik özeti şudur ve stratejik değerlendirmeniz buna
oturmalı: **sistemin temeli sağlam kurulmuş ama etrafındaki dünya değişince kimse haber
alamıyor.** Çifte rezervasyon matematiksel olarak imkânsız, para değişmezleri yeşil, zaman sapması
sıfır — bunlar gerçek başarılar. Buna karşılık en az yedi yer sessizce yanlış çalışıyor ve
**hiçbiri hata vermiyor.** Yani sorun mühendislik kalitesi değil, **geri bildirim eksikliği**.
Tek kurucu (K-7.1) ve kod okuyamayan bir kurucu için bu, ölçeklenebilirliğin *tek* gerçek
belirleyicisidir.

---

*Son güncelleme: 3 Ağustos 2026 · CPO + CTO + Mimar turları işlendi*
