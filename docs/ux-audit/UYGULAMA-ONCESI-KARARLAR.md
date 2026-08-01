# Uygulamaya Başlamadan Önce — Karar Soruları

> Bu sorular uydurulmadı. Kaynakları: planın kendi bıraktığı 21 açık uç, bu
> oturumda kod yazarken çıkan kararlar ve canlı veritabanının bugünkü hâli.
> **Her soruda önerim var.** Katılıyorsan "kabul" demen yeterli.

**Canlı durum (28 Tem 2026):** 6 maç (hepsi demo) · 33 kullanıcı · **2 hakem** ·
**2 kaleci** · 1 gerçek+aktif ama **sahipsiz** tesis · adı boş 1 profil ·
`starts_at`'i olmayan maç: **0**.

---

## A — SKOR SİSTEMİ

### S1. Hakem de saha sahibi de yoksa skor ne olacak?
K2 ile skoru yalnız hakem veya tesis sahibi girebiliyor. Ama sahipsiz sahada
hakemsiz oynanan maçta **kimse giremez**.

- **(a)** Skorsuz kalsın, "Skor girilmedi" olarak kapansın, istatistiğe sayılmasın
- **(b)** Kaptan yedek yetkili olsun: maç bitiminden 24 saat sonra girebilsin, skor
  "Doğrulanmamış" etiketiyle saklansın, sıralamada düşük ağırlık alsın
- **(c)** Hakemsiz maç kurulamasın

> **Önerim: (a) şimdilik, (b) lansman sonrası veriye bakarak.** (c) olmaz —
> platformda 2 hakem var, zorunlu kılmak maç kurulmasını durdurur. (a) zaten
> kodlandı ve çalışıyor. Boşluk büyük çıkarsa (b) bilinçli bir istisna olarak
> eklenir.

### S2. Sahipsiz tesis ne olacak?
Canlıda **1 gerçek, aktif, sahipsiz** tesis var (`Cumhuriet Gençlik`) ve uygulamada
tesis sahiplenme akışı **hiç yok**.

- **(a)** Admin elle sahiplendirsin, sahiplenme akışı sonraya kalsın
- **(b)** Sahipsiz tesis vitrinden gizlensin
- **(c)** Sahiplenme akışı yazılsın (yeni iş)

> **Önerim: (a) + (b) birlikte.** Admin bu tek tesisi sahiplendirir; bu arada
> sahipsiz tesisler vitrinde görünmez olur ki yeni sahipsiz maç doğmasın.
> (c) lansman sonrası.

### S3. Maçın süresini kullanıcı seçebilecek mi?
Şu an maç süresi arayüzde **değiştirilemiyor** — hep 60 dakika yazılıyor. Ama
keşif ekranında 60/90/120 diye bir *filtre* var. Yani kullanıcı 90 dakikalık maç
arıyor, kuramıyor.

- **(a)** Maç kurma ekranına süre seçici eklensin (60/90/120)
- **(b)** Süre sabit 60 kalsın, keşifteki filtre kaldırılsın

> **Önerim: (a).** Süre artık skor zaman kapısını belirliyor (maç bitmeden skor
> girilemiyor). Yanlış süre = yanlış kapı. Ayrıca halısahada 90 dakika yaygın.

### S4. Skor girildikten sonra düzeltilebilecek mi?
Hakem yanlış skor girdi. Şu an geri dönüşü yok.

- **(a)** Admin düzeltebilsin, kullanıcı düzeltemesin
- **(b)** Hakem maç bitiminden 24 saat içinde bir kez düzeltebilsin
- **(c)** Düzeltme yok

> **Önerim: (a).** Skor bir otorite kaydı; hakemin serbestçe değiştirebilmesi
> otoriteyi zayıflatır. Admin yolu zaten var, ayrıca iş gerektirmiyor.

---

## B — PARA VE ÇEKİM

### S5. Kusurdan doğan iadede %5 kesilecek mi? 🔴 EN RİSKLİ
Tesis veya OYNA maçı iptal etti — kullanıcının hiçbir kusuru yok. Bu kullanıcı
parasını çekmek isterse %5 ödüyor. Aynı sözleşme maddesi "kesintisiz iade edilir"
diyor.

- **(a)** Kusurlu iadelerde çekim ücretsiz olsun (kod işi gerekir)
- **(b)** %5 her çekimde uygulansın, sözleşme buna göre yeniden yazılsın

> **Önerim: (a).** Tüketicinin satıcı kusurundan doğan iadeyi almak için bedel
> ödemesi TKHK açısından zayıf konum. Kod işi orta büyüklükte: iadenin kaynağını
> işaretleyip kesintiyi ona göre hesaplamak. Ama bu senin + avukatının kararı.

### S6. Para çekme lansmanda açık mı olacak?
Şu an **kapalı**. Açmak için oyuncu tarafında kimlik doğrulama ekranı gerekiyor —
o ekran yok (bayrak `true` ama ekran yok, yani kimse geçemez).

- **(a)** Lansmanda kapalı kalsın, sonra açılsın
- **(b)** Kimlik ekranı yazılsın, lansmanda açık olsun
- **(c)** Kimlik zorunluluğu kaldırılsın, ad-soyad + IBAN eşleşmesi yeterli sayılsın

> **Önerim: (b).** Kullanıcı parasını çekemeyeceğini anlarsa cüzdana para
> yüklemez — bu doğrudan gelir kaybı. Kimlik ekranı ayrıca MASAK ve chargeback
> savunması için tek gerçek koruma. (c) riskli.

### S7. Minimum yükleme 300₺ kalacak mı?
Bugün cüzdana en az 300₺ yükleniyor ama minimum çekim 100₺. Tutarsız.

- **(a)** Yükleme minimumu 100₺'ye insin
- **(b)** 300₺ kalsın

> **Önerim: (a).** 300₺ yeni kullanıcı için yüksek bir eşik; ilk denemeyi
> caydırır. Halısaha maçı kişi başı 100-150₺ civarı, minimum ona yakın olmalı.

### S8. Adı olmayan kullanıcı ne yapacak?
Canlıda **1 profilin adı boş**. Ad-soyad, IBAN eşleşmesi için zorunlu — bu
kullanıcı para çekemez.

- **(a)** Kayıt sırasında ad-soyad zorunlu olsun
- **(b)** Yalnız çekim anında istensin

> **Önerim: (a).** Ad zaten maç lobisinde, değerlendirmede, sözleşmede lazım.
> Sonradan istemek kullanıcıyı para çekmek isterken duvara toslatır.

### S9. Çekim için süre taahhüdü verilecek mi?
Sözleşmeye süre yazmadım çünkü kodda böyle bir taahhüt yok.

- **(a)** "En geç 5 iş günü" taahhüdü verilsin
- **(b)** Taahhüt verilmesin, "bankanın işlem süresine tabidir" kalsın

> **Önerim: (b) şimdilik.** Çekimler elle işlenecekse tutulamayacak bir söz
> vermek yeni bir çelişki üretir. Operasyon oturduğunda (a)'ya geçilir.

---

## C — LANSMAN KAPSAMI VE SIRALAMA

### S10. Lansmanda hangi roller açık olacak?
Platformda 2 hakem, 2 kaleci var. Kaleci/hakem pazarı fiilen boş.

- **(a)** Hepsi açık — oyuncu, kaleci, hakem, tesis
- **(b)** Önce oyuncu + tesis; kaleci/hakem arz oluşunca açılsın

> **Önerim: (b).** Boş bir pazarı açmak "hizmet çağır, kimse gelmez" deneyimi
> üretir ve ilk izlenimi bozar. Oyuncu + tesis tek başına çalışan bir ürün.

### S11. Lansman hangi şehirle başlayacak?
Tohum veri Ordu için hazırlanmış (4 tesis).

- **(a)** Yalnız Ordu
- **(b)** Ordu + 1 şehir daha

> **Önerim: (a).** Tek şehirde arz-talep yoğunluğu kurmak, iki şehirde seyrek
> olmaktan iyidir. Halısaha yerel bir iş.

### S12. Öncelik sıralaması nasıl değişecek?
Plandaki P0/P1 sıralaması "uygulama canlı, insanlar mağdur" varsayıyor. Değilsin.

- **(a)** Yeni tanım: P0 = lansmanı imkânsız kılanlar (para, skor, güvenlik),
  P1 = ilk izlenim (tasarım, dil), P2 = sonrası
- **(b)** Mevcut sıralama korunsun

> **Önerim: (a).** Ayrıca canlı olmadığın için normalde riskli sayılan geniş
> değişiklikleri (yüzlerce dosyaya dokunan tasarım işleri) **şimdi** yapmalısın.
> Bu bir fırsat penceresi ve kapanacak.

### S13. Hangi iş paketleri lansman öncesi?
23 paket var. Hepsi lansman öncesi değil.

- **(a)** Lansman öncesi: IP-01, 02, 03, 06, 08, 09, 10, 12, 13, 15, 16, 19 +
  bu oturumda yapılan skor/para işleri. Kalanı sonrası.
- **(b)** Hepsi lansman öncesi
- **(c)** Daha dar bir set

> **Önerim: (a).** Bu set "uygulama çalışıyor ve güven veriyor" eşiğini kurar.
> Tesis sahibi paketleri (IP-07, 21, 22) K4 kararına bağlı, sosyal paketler
> (IP-17, 18, 23) kullanıcı olmadan değer üretmiyor.

---

## D — TESİS SAHİBİ TARAFI (K4)

### S14. Tesis sahibi tarafı gerçekten ayrılacak mı?
K4'te "ileride ayrı uygulama olabilir" dedin. Bu belirsizlik 4 paketi askıda
tutuyor (IP-05, IP-07, IP-21, IP-22 ve tema birleşmesi).

- **(a)** Evet, ayrılacak — o yüzden tesis tarafına büyük yatırım yapılmasın
- **(b)** Hayır, aynı uygulamada kalacak — plan aynen uygulansın
- **(c)** Henüz belli değil — ayrılabilir varsayımıyla davranılsın

> **Önerim: (c).** Ayrılma ihtimali varken tema birleştirmek boşa emek. "Ayrı
> kalsın, ayrılmaya hazır dursun" en ucuz duruş — hangi karara varsan işe yarar.

### S15. Tesis sahibi lansmanda uygulamayı kullanacak mı?
Skor girme yolu artık sahipte de çalışıyor. Ama sahip uygulamayı açmazsa o yol
kâğıt üstünde kalır.

- **(a)** Evet — tesislerle anlaşma yapılırken uygulama kullanımı şart koşulsun
- **(b)** Hayır — tesis tarafı pasif kalsın, skor hakemden gelsin

> **Önerim: (a).** (b) seçilirse skor kapsamı ciddi daralır: 2 hakemle maçların
> çoğu skorsuz kalır.

---

## E — TASARIM SİSTEMİ

### S16. Tek aksan rengi kararı kabul mü?
Plan "tek aksan rengi" öneriyor. Bugün yeşil, sarı, mavi, kırmızı karışık anlamda
kullanılıyor.

- **(a)** Kabul — tek aksan (yeşil), diğer renkler yalnız durum anlamı taşısın
- **(b)** Mevcut çok renkli kimlik korunsun

> **Önerim: (a).** Renk anlam taşımıyorsa kullanıcı öğrenemez. Ayrıca bu
> değişiklik canlı değilken çok ucuz, sonra çok pahalı.

### S17. İtalik kullanımı?
Plan italiği tamamen kaldırmayı öneriyor; istisna olarak skor/tutar için
bırakılabileceğini söylüyor.

- **(a)** Tamamen kalksın
- **(b)** Yalnız skor ve para tutarlarında kalsın

> **Önerim: (b).** Skorun italik olması OYNA'nın görsel imzası olmuş; büyük
> rakamlarda okunurluğu bozmuyor. Gövde metninde italik kalkar.

### S18. `design/player-onboarding/*.html` dosyaları canlı mı, arşiv mi?
Plan bu soruyu iki kez soruyor. Silinecek CSS sınıfları orada geçiyor.

- **(a)** Arşiv — silme kararı etkilenmez
- **(b)** Canlı prototip — korunmalı

> **Önerim: (a) muhtemelen doğru** ama bunu senin teyit etmen gerek; ben koddan
> anlayamıyorum.

### S19. Tasarım sistemi ne kadar geniş uygulanacak?
IP-08/09/11/13 yüzlerce dosyaya dokunuyor.

- **(a)** Tam kapsam — tüm ekranlar tek seferde
- **(b)** Kademeli — önce oyuncu ekranları, tesis tarafı sonra

> **Önerim: (a).** Canlı değilken tek seferde yapmak hem ucuz hem tutarlı.
> Kademeli yapılırsa aylarca iki farklı görünüm bir arada yaşar.

---

## F — TEKNİK HİJYEN

### S20. Çakışan migration numaraları nasıl düzeltilecek?
Planın önerdiği **5 migration aynı numarayı** paylaşıyor (`20260819000000`) ve
hepsi canlının gerisinde (canlı `20260828`'de).

- **(a)** Uygulama sırasında yeniden numaralandırılsın (`20260830`'dan itibaren)
- **(b)** Plan metni şimdi düzeltilsin

> **Önerim: (a) + plana bir uyarı notu.** Numaraları şimdi düzeltmek boşuna;
> asıl önemli olan uygulayan kişinin bu tuzağı bilmesi.

> **SONUÇ (2026-07-28) — yapıldı.** Uygulama sırasında üretilen 5 migration,
> üretim defterindeki gerçek zaman damgalarına göre yeniden adlandırıldı
> (`20260829000000`→`20260728113125`, `20260830000000`→`20260728114605`,
> `20260730135953`→`20260728154518`, `20260832000000`→`20260728161215`,
> `20260833000000`→`20260728163234`). Uyarı notu plana eklendi:
> `OYNA-COZUM-PLANI.md` § 0.6b. Planın gövdesindeki `20260819000000`
> geçişleri artık yer tutucu olarak okunmalı.

### S21. Canlıda olup repoda olmayan migration'lar ne olacak?
Canlı veritabanı repodan ileride; bu, sıfırdan kurulumu bozar.

- **(a)** Canlıdan çekilip repoya işlensin (sapma onarımı)
- **(b)** Şimdilik bırakılsın

> **Önerim: (a).** Bugün zarar vermiyor ama yeni ortam kurmak gerektiğinde
> (test, staging) veritabanı eksik doğar. Küçük iş, büyük sigorta.

> **SONUÇ (2026-07-28) — yapıldı, sapma sıfır.**
> Sapmanın gerçek boyutu ilk tahminden büyüktü: 8 değil, **26 kayıt**.
>
> - **16 kayıt gerçek DDL taşıyordu** (`20260727124350` … `20260728113509`,
>   toplam ~86 KB). Hepsi `supabase_migrations.schema_migrations` tablosundan
>   geri çekilip `supabase/migrations/` altına yazıldı; her dosyanın başında
>   `-- ÜRETİMDEN GERİ ÇEKİLDİ (defter sapması onarımı, 2026-07-28)` notu var.
> - **10 kayıt yalnızca defter notuydu** (`20260826000001` … `20260828000002`);
>   hiç DDL taşımıyorlar, içerikleri zaten yukarıdaki 16 dosyada. Bunlar için
>   repoya aynı adla "bilerek boş" dosyalar eklendi ki iki liste birebir örtüşsün.
> - **Bonus onarım:** defterdeki eski uyarı, `mac_kur_kadro_ve_saglayici`'nın repo
>   sürümünde `DROP FUNCTION IF EXISTS public.invite_friends_to_match(uuid, uuid[]);`
>   satırının eksik olduğunu ve temiz kurulumda dönüş tipi çakışması vereceğini
>   söylüyordu. Üretimden çekilen sürümde bu satır **var** — yani sapma onarımı
>   aynı zamanda bu temiz-kurulum hatasını da kapattı.
>
> Doğrulama: defterdeki sürüm sayısı **361**, repodaki dosya sayısı **361**,
> iki yönlü fark **0**. Tekrar kontrol için `OYNA-COZUM-PLANI.md` § 0.6b.

### S22. Sözleşmeler avukata ne zaman gidecek?
Metinleri hazırladım ama hukukçu değilim.

- **(a)** Hemen — kod işi paralel yürüsün
- **(b)** Tüm plan bitince

> **Önerim: (a).** Avukat kuyruğu takvimdeki en uzun bekleme; erken başlatılmalı.
> Ayrıca S5'in cevabı avukattan gelecek.

---

## Nasıl cevaplayabilirsin

Her soru için sadece numara + harf yeterli. Örnek:

```
S1 kabul · S2 kabul · S3 (b) · S4 kabul · S5 (b) ...
```

"Kabul" = önerimi uygula. Farklı düşündüğün yerde harfi yaz, gerekiyorsa tek
cümle gerekçe ekle.

**Cevap gelmeden başlamayacağım işler:** S5 (kod yapısını değiştirir), S6
(lansman kapsamı), S13 (ne yapılacağını belirler), S14 (4 paketi askıda tutuyor).
Diğerlerinde önerimle ilerleyebilirim.
