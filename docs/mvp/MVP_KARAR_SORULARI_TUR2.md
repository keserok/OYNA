# MVP Karar Soruları — Tur 2

> Kaynak: `MVP_KARARLAR.md` (K-01…K-40) + 5 alt sistem derin keşfi.
> Tur 1'de "ne yapacağız"ı belirledik. Tur 2 "nasıl çalışacak"ı belirliyor.
> Bu sorular cevaplanmadan kod yazılmaz — çünkü hepsi hem sunucuyu hem arayüzü şekillendiriyor.

---

## Önce: keşiften çıkan iyi ve kötü haberler

### İyi haberler (beklediğimden çok daha hazır)

1. **İş modelin veritabanında zaten kurulu.** `commission_config` tablosunda `scope='PITCH'` kaydıyla
   **her sahaya özel** komisyon + markup tanımlanabiliyor; admin panelde ekranı da var
   (Komisyon → Saha Anlaşmaları, 2000₺ örnek hesap canlı gösteriliyor). Anlaşma maç kurulduğu anda
   maça **donduruluyor** — sonradan oran değişse o maçın hesabı değişmiyor.
   *"MODEL_B"nin tanımı birebir senin modelin: "OYNA sahayı X'e kiralar, oyuncuya X+markup satar".*
2. **Admin maç kurabiliyor** ve bu yol cüzdandan tamamen bağımsız; maç `is_platform=true` ile işaretleniyor.
3. **"Müdür" rolü zaten var** (`MANAGER`) ve yetki fonksiyonu (`can_manage_pitch`) hazır. Personel kendi
   normal hesabıyla 6 haneli kodla tesise katılıyor — ayrı hesap gerekmiyor.
4. **Tam tutar online ödeme sunucuda zaten çalışıyor** — kapora sınırı yok, kilit yalnızca arayüzde tek satır.
5. **Kart işlem bedelini 0 yapmak hiçbir şeyi kırmıyor** — satır ekranda tamamen kayboluyor.
6. **Alt bar zaten MVP'ye uygun** (Ana Sayfa · Oyna · Maçlarım · Saha · Profil) — çıkacak sekme yok.
7. **Maçın kesinleşmesi/tamamlanması kaptana bağlı değil** — sunucu ve zamanlanmış işler yürütüyor.
8. Admin panelde **kaleci/hakem hesabı açma ve ücret düzenleme** ekranları çalışıyor.

### Kötü haberler (planı doğrudan etkiliyor)

1. **Admin maç kurarken sahayı rezerve etmiyor.** `pitch_bookings` kaydı açılmadığı için (a) aynı saate
   ikinci bir maç/rezervasyon girebilir, (b) saha sahibinin hakedişi hesaplanamıyor ("taban yok" hatası).
   Owner/admin maç kurma yolu bu yüzden **yeniden yazılmalı**.
2. **Yaş sisteminde dört delik var:** doğum tarihi kullanıcı tarafından serbestçe değiştirilebiliyor;
   onboarding'de yaş çarkının varsayılanı **24-30** ve dokunulmasa bile öyle kaydediliyor (yani çocuk
   yetişkin sayılıyor); ücretsiz maçta veli onayı kapısı hiç çalışmıyor; yaş bandı `13-17` tek kova
   olduğu için 14/16 sınırı temsil edilemiyor. **Yaş kuralına başlamadan bu dördü kapatılmalı.**
3. **Kaptansız maçta sahipsiz kalan işlevler:** maç iptali, oyuncu çıkarma (kick), diziliş, eksik oyuncu ilanı.
   Ayrıca **gizli bir tuzak**: bugün kaptan maçtan ayrılırsa sistem *kalan oyunculardan birini otomatik
   kaptan yapıyor* — admin/saha sahibinin kurduğu maçta bu kod rastgele bir oyuncuya yetki verir. Kaldırılmalı.
4. **Admin panelde tuzak:** saha sahibinin şifre/e-posta yönetimi, kapsam dışı bıraktığımız "SaaS Hesapları"
   modülünün içinde. O modül kapatılırsa **saha sahibine şifre verme yeteneği de kaybolur** — taşınmalı.
5. **Kaleci/hakem ücretinin slot fiyatına eklenmesi bugün hiç yok** — sıfırdan yazılacak.
6. **Komisyon "saha başına", "saha sahibi başına" değil.** Bir sahibin 3 tesisi varsa 3 ayrı anlaşma satırı girilir.

---

# A. Maç modeli — MVP'nin kalbi

Oyuncular maç kurmayacağına göre "kaptan" diye bir rol kalmıyor. Bu, lobinin bugünkü mantığının
yeniden tanımlanmasını gerektiriyor.

**S35. Maçın sorumlusu kim olacak?**
- (a) **Maçın oyuncu tarafında sahibi yoktur.** Herkes kendi slotunu alır; kimse kimseyi atayamaz/atamaz.
  Maçı iptal etme, oyuncu çıkarma, diziliş belirleme yetkileri **yalnız admin ve saha sahibi panelinde** olur.
- (b) İlk slotu alan kişi "kaptan" olur.
- (c) Saha sahibi maçı kurarken bir oyuncuyu kaptan atar.

> **Önerim: (a).** MVP'nin tek cümlesi "net ve ne yapılacağı bilinen uygulama" — lobide kimsenin kimseyi
> atamadığı, herkesin kendi yerini aldığı model en anlaşılır olanı. Ayrıca kaptan tuzağı (otomatik kaptan devri)
> kendiliğinden ortadan kalkar.

**S36. Maç dolmazsa ne olur?** Bugün: kadro eşiği (toplam−2) maç saatinden 90 dk önce dolmazsa maç iptal edilir ve
para iade edilir. Ama yeni modelde sahayı **biz** satın aldık; maç iptal olsa da o saatin parasını ödedik.
- (a) **Eşik kuralı kalksın** — maç kaç kişi olursa olsun oynanır, iptal edilmez. Doluluk riski bizde.
- (b) Eşik kalsın; dolmazsa maç iptal + tam iade (saha zararı bizde).
- (c) Saha sahibi/admin maç kurarken **minimum kişi** belirlesin; dolmazsa iptal + tam iade.

> **Önerim: (c).** Esnek: dolmayacağını düşündüğümüz saatlerde minimum koyarız, emin olduğumuzda 1 yaparız.
> Altyapı zaten `min_players` alanını destekliyor; bugün admin maç kurarken bu alan yazılmıyor — eklenecek.

**S37. Slot satın alma ve doldurma modeli?** Bugün: slotu satın alan kişi onu "rezerve" eder, sonra
kendisi oturur ya da bir arkadaşına atar; devralma kodu üretebilir.
- (a) **Aynen kalsın** — bir kişi birden fazla slot alıp arkadaşlarını yerleştirebilir.
- (b) Basitleşsin: bir kişi **yalnız kendisi için 1 slot** alır.

> **Önerim: (a).** "Arkadaşlarımla gidiyorum" gerçek kullanım; kod hazır ve test edilmiş.
> (b) daha basit görünse de arkadaş grubu ayrı ayrı ödeme yapmak zorunda kalır — dönüşümü düşürür.

**S38. Takım ayrımı ve pozisyon dizilişi kalsın mı?** Bugün maç ev/deplasman iki kadro + saha üzerinde
pozisyon dizilişi (kaleci/defans/orta/forvet) şeklinde. "Rahat" maçta pozisyonsuz iki kolon.
- (a) İkisi de kalsın (pozisyonlu + rahat).
- (b) **Yalnız rahat mod:** iki takım, pozisyon yok — sadece "A takımı / B takımı" ve boş yerler.
- (c) Tek havuz: takım ayrımı yok, X kişilik liste.

> **Önerim: (a).** Taktik stüdyosu MVP'de kalıyor ve pozisyon dizilişi onunla aynı dili konuşuyor;
> ayrıca mevcut kodun tamamı bu modele göre yazılmış — (b)/(c) sadeleştirme değil, yeniden yazım olur.

**S39. Skoru kim girecek?**
- (a) **Saha sahibi/müdür** kendi panelinden (ekran zaten var ve çalışıyor).
- (b) Katılımcılar önerir, çoğunluk onaylar (bugünkü takım maçı yolu — kaptansız da çalışıyor).
- (c) Admin paneli.
- (d) Skor MVP'de hiç olmasın.

> **Önerim: (a) + (c).** Saha sahibi zaten sahada; en doğal kaynak o. Admin de düzeltebilsin.
> Oyuncu tarafında skor girişi olmasın — tartışma ve suistimal üretir.

**S40. Maç sonu değerlendirme (oyuncu puanlama + tesis puanı) kalsın mı?**
- (a) **Kalsın** — oyuncu puanlaması profil istatistiklerini ve MOTM'yi besliyor.
- (b) Yalnız tesis puanı kalsın.
- (c) Tamamen çıksın.

> **Önerim: (b).** Oyuncu puanlaması MVP'de yalnız "hoş" bir özellik ama sosyal sürtüşme üretir ve
> profil istatistikleri için maç sayısı zaten yeterli. Tesis puanı ise saha kalitesini yönetmemiz için gerçek değer.

**S41. Oyuncu maçtan ayrılırsa iade kuralı?** Bugün: 24 saatten fazla kala tam iade, 24-6 saat arası %50,
6 saatten az kala iade yok (saha bazında ayarlanabiliyor). İade cüzdana gidiyordu; artık karta gidecek.
- (a) **Bugünkü kademe kalsın**, iade karta yapılsın.
- (b) Daha basit: X saatten fazla kala tam iade, sonrası iade yok.
- (c) İade hiç olmasın; oyuncu yerini bir arkadaşına devredebilsin.

> **Önerim: (b), X = 24 saat.** Karta iade her seferinde bize komisyon maliyeti; kısmi iade hesabı
> kullanıcıya anlatması zor. "24 saat önce iptal edersen paran tam iade, sonra iade yok" tek cümlede anlaşılır.
> Devir özelliği (c) zaten (a)/(b) ile birlikte çalışabilir — kod hazır.

**S42. Admin/saha sahibi maçı iptal ederse?**
> **Önerim:** Koşulsuz **tam iade karta**, otomatik, herkese bildirim. Onayına ihtiyacım var.

---

# B. Fiyat ve para

**S43. Saha sahibine ne kadar ödeyeceğiz?** Sistem iki ayarı destekliyor: `komisyon %` (sahibin
hakedişinden düşülür) ve `markup` (oyuncunun fiyatına eklenir).
- (a) **Komisyon %0 + markup > 0**: sahaya tarifedeki tam tutarı öderiz, kârımız yalnız markup'tan gelir.
  *(Örnek: saat 2000₺ → sahaya 2000₺ elden, oyunculardan 2400₺ toplanır, bize 400₺ kalır.)*
- (b) Komisyon > 0 + markup > 0: hem sahibin payından keseriz hem oyuncuya fark koyarız.
  *(Örnek: 2000₺ → sahaya 1900₺, oyunculardan 2400₺, bize 500₺.)*

> **Önerim: (a).** "Saatleri satın alıyoruz" modelinin dürüst karşılığı bu; saha sahibine anlatması kolay
> ("tarifenizi ödüyoruz"), bizim kârımız da tek kalemde net. Ayrıca (b) sahiple pazarlığı iki değişkenli yapar.

**S44. Kişi başı fiyatı kim belirleyecek?** Bugün sistem otomatik hesaplıyor:
`(saha tarifesi + markup) ÷ toplam oyuncu sayısı`, yukarı yuvarlanarak.
- (a) **Otomatik kalsın** — admin yalnız markup oranını ayarlar, fiyat kendiliğinden çıkar.
- (b) Maçı kuran (admin/saha sahibi) kişi başı fiyatı **elle** girsin.
- (c) Otomatik hesaplansın ama kuran kişi üzerine yazabilsin.

> **Önerim: (c).** Otomatik hesap tutarlılığı korur; elle ezme ise kampanya/deneme fiyatı için gerekli
> esnekliği verir. Elle girildiğinde admin panelde işaretlensin ki raporlar yanılmasın.

**S45. Yuvarlama artığı ne olacak?** Kişi başı fiyat yukarı yuvarlandığı için toplanan para hedefin
birkaç lira üstüne çıkabiliyor (14 kişilik maçta ~10₺).
> **Önerim:** Bizde kalsın, ama admin panel raporunda ayrı bir satır olarak görünsün. Onayına ihtiyacım var.

**S46. Kaleci/hakem ücreti oyuncuya nasıl yansıyacak?** (K-20: ücret admin panelden belirlenir ve
kullanıcı ödeme ekranında görür.) Bugün böyle bir mekanizma **hiç yok**.
- (a) **Maç fiyatına dağıtılsın:** kaleci ücreti 400₺, 14 kişilik maç → kişi başına ~29₺ eklenir;
  ödeme ekranında "Maç: 200₺ + Kaleci payı: 29₺" diye ayrı satır görünür.
- (b) Ayrı satın alım: isteyen oyuncu ayrıca öder.
- (c) Fiyata gömülsün, ayrı satır gösterilmesin.

> **Önerim: (a).** Kaleci/hakem maçın tamamına hizmet ediyor; dağıtmak adil. Ayrı satır göstermek
> hem şeffaf hem de "neden bu maç daha pahalı" sorusunu kendiliğinden cevaplıyor.

**S47. Kaleci/hakem ücretini kim belirleyecek?** Bugün ücret **kişiye ait** (her kalecinin kendi ücreti var).
- (a) Kişiye ait ücret kalsın; admin panelden düzenlenir (ekran hazır).
- (b) **Platform geneli sabit ücret** (örn. kaleci 400₺, hakem 500₺), admin panelden tek yerden.
- (c) Maç bazında admin girer.

> **Önerim: (b) + (c).** Varsayılan sabit ücret basitliği verir; maç bazında ezme imkânı esneklik.
> Kişiye özel ücret (a) MVP'de gereksiz karmaşa — kaleci havuzu daha küçükken tek fiyat yönetilebilir.

---

# C. Antrenman slotu — birlikte tasarlayacağımız kısım

Senin tarifin: *"Son kalan saat kuralı saha sahibinin arayüzünde 'Antrenman Oyuncusu Kuralları' adlı bir
kısımda ayarlanmalı; oyuncu arayüzünde hangi sahalarda slot satın alabileceği gözükmeli. Antrenman slotu
kiralayanlar sahayı ve kaleleri ortak kullanmayı kabul etmiş olurlar."*

Anladığım ürün şu: **boş kalmış son saatleri, sahayı paylaşmayı kabul eden bireysel oyunculara kişi başı satmak.**

**S48. Satın alma birimi ne?**
- (a) **Kişi başı** — her oyuncu kendi yerini alır; saha X kişiye kadar dolar (halı saha "açık antrenman saati").
- (b) Küçük grup (3-5 kişilik paket).
- (c) Yarı saha.

> **Önerim: (a).** "Ortak kullanım" tarifin doğrudan karşılığı bu; ayrıca tek kişinin de gelebilmesi
> ürünün asıl değeri ("arkadaşım yok ama top oynamak istiyorum").

**S49. Saha sahibi hangi kuralları girecek?** Önerdiğim ekran ("Antrenman Oyuncusu Kuralları"):

| Ayar | Öneri |
|---|---|
| Antrenman satışı açık mı? | Kapalı/Açık — **varsayılan kapalı** |
| Kaç saat kala açılsın? | Varsayılan 2 saat (sahibi 1-6 arası seçebilsin) |
| Kişi başı ücret | Sahibi girer; oyuncuya bizim markup'ımızla yansır |
| Maksimum kişi | Kort başına (örn. 12) |
| Hangi kortlar | Kort seçimi (hepsi/seçili) |
| Hangi günler/saatler | Opsiyonel kısıt (örn. yalnız hafta içi 22:00 sonrası) |

> Onayını istediğim: bu altı ayar yeterli mi, eksik/fazla var mı?

**S50. Oyuncu bunu nerede görecek?**
- (a) **"Saha Kirala" ekranında ikinci bir sekme: "Antrenman Slotları"** — yakındaki sahaların o an
  satışa açılmış slotları, geri sayımla ("1s 47dk kaldı · 6/12 kişi").
- (b) Ana sayfada ayrı bir kart.
- (c) Top Oyna listesinde maçların arasında.

> **Önerim: (a) + ana sayfada küçük bir giriş.** (c) kesinlikle olmasın — antrenman slotu maç değil,
> karıştırmak "ne aldığımı anlamadım" şikâyeti üretir.

**S51. Antrenman slotu iadesi var mı?**
> **Önerim: yok.** Zaten son 2 saatte satılıyor; iade penceresi yok. Satın alma ekranında açıkça yazsın.
> Onayına ihtiyacım var.

**S52. Kapasite dolarsa / kimse almazsa?**
> **Önerim:** Dolarsa slot listeden düşer. Kimse almazsa hiçbir şey olmaz (saha zaten boştu) —
> bu satışta sahaya para ödemiyoruz, komisyon modeli farklı. **Bunu netleştirmem gerekiyor:** antrenman
> slotu gelirini saha sahibiyle nasıl paylaşacağız? (Öneri: bu satışta sahaya kişi başı sabit bir pay,
> geri kalan bize; ya da tamamen bize — saatin parasını zaten ödemediysek.)

**S53. Kaleci ile yarı saha ayırma (senin fikrin) MVP'de mi, sonrasında mı?**
> **Önerim: sonrasında (v2).** Kaleci havuzu oluşmadan bu özellik boş çalışır; ama veri modelini
> şimdiden buna hazır kuracağım (antrenman slotuna "kaleci talebi" alanı yer tutucu olarak).

---

# D. Saha sahibi paneli

**S54. Saha sahibi maç kurarken neyi belirleyecek?**
> **Önerim:** Kort · gün · saat (kendi takviminden, çakışma otomatik engellenir) · format (kort kapasitesine
> göre daraltılır) · minimum kişi · seviye (Rahat/Ciddi) · yaş grubu · cinsiyet. **Fiyatı belirlemez** —
> fiyat tarifeden + bizim markup'ımızdan otomatik çıkar (S44). Onayına ihtiyacım var.

**S55. Saha sahibi kendi kurduğu maçı iptal edebilir mi?**
- (a) Evet, X saat öncesine kadar; oyunculara otomatik tam iade.
- (b) Hayır — yalnız admin iptal eder (sahibi destek üzerinden talep eder).

> **Önerim: (a), X = 12 saat.** Sahada gerçek bir aksilik olabilir (su baskını, elektrik); sahibinin
> elini bağlamak destek yükü üretir. 12 saatten sonra admin devreye girer.

**S56. Müdür (MANAGER) maç kurabilsin mi?**
> **Önerim: evet.** Yetki altyapısı hazır; sahibi her akşam panelde olamaz. Personel (STAFF) kuramasın.

**S57. "Uygulamadan kiralanabilir saatler" nasıl açılacak?**
- (a) **Haftalık şablon:** "Pazartesi 20:00-23:00 açık" gibi tekrar eden kurallar + istisna günler.
- (b) Gün gün, saat saat işaretleme (takvimde slota dokunarak aç/kapat).
- (c) Tesis bazında tek anahtar: "uygulamadan kiralamaya açığım" — sonra çalışma saatlerinin tamamı açılır.

> **Önerim: (b) + (c) birlikte.** Önce tesis anahtarı (varsayılan kapalı); açıldıktan sonra takvimde
> istediği slotları tek dokunuşla açıp kapatabilsin. Haftalık şablon (a) v2 — çoğu sahibin ilk ihtiyacı
> "bu akşam şu üç saat boş, listeye koy" olacak.

**S58. Saha sahibi panelinde MVP'de neler kalsın?**
> **Önerim — kalsın:** Takvim (rezervasyonlar + maçlar), Maç Kur, Tarife/fiyat yönetimi, Saat açma-kapama,
> Manuel rezervasyon, Antrenman kuralları, Sahalarım/Kortlarım, Ekip (müdür/personel), Skor girişi,
> OYNA Anlaşmam (salt okunur), Bildirimler, Güvenlik/Şifre, Destek.
> **Çıksın:** Banka hesapları, Para çekme, Veresiye defteri, Gider takibi, Abonelik (haftalık müşteri),
> Flash indirim, Finans raporları, Widget ayarları, Ödeme modu.
> Onayına ihtiyacım var — özellikle "Flash indirim" ve "Abonelik" gerçekten çıksın mı?

---

# E. Yaş kademeleri

**S59. Asgari yaş kaç?** Bugünkü sözleşme **13** diyor, senin kuralın **14**'ten başlıyor.
- (a) **14** — 14 altı kayıt olamaz (sözleşme güncellenir).
- (b) 13 kalsın; 13-14 arası da 14-18 maçlarına girebilsin.

> **Önerim: (a).** Kuralın net; sözleşme zaten yeniden yazılacak.

**S60. Doğum tarihi kayıt sırasında zorunlu olsun mu?** Bugün yaş "aralık" olarak soruluyor,
varsayılanı 24-30 ve dokunulmasa bile öyle kaydediliyor — yani sistem çocuğu yetişkin sayıyor.
> **Önerim:** Onboarding'de **doğum tarihi (gün/ay/yıl) zorunlu** olsun ve sonrasında **kullanıcı
> değiştiremesin** (değişiklik yalnız destek/admin üzerinden). Yaş kuralının tek güvenilir temeli bu.
> Onayına ihtiyacım var — bu, kayıt akışına bir adım ekliyor.

**S61. "14-18 yaş maçı"nı kim işaretleyecek?**
> **Önerim:** Maçı kuran (admin/saha sahibi) maç kurarken "Yaş grubu" seçer: **Herkes** veya **14-18**.
> 14-16 yaşındaki kullanıcı yalnız "14-18" maçlarını görebilir/alabilir; 16-18 arası veli onayıyla
> her maça girebilir. Onayına ihtiyacım var.

**S62. Veli onayı nasıl alınacak?** Bugünkü sistem: çocuk uygulamada 8 haneli kod üretir → veliye verir →
veli **kendi OYNA hesabından** kodu girip muvafakatnameyi onaylar. E-posta/SMS doğrulaması yok.
- (a) **Aynen kalsın** (veli de uygulamaya kayıt olmak zorunda).
- (b) Veliye e-posta/SMS ile bağlantı gitsin, hesap açmadan onaylayabilsin.

> **Önerim: (a) MVP'de.** Çalışıyor ve hukuken daha güçlü (veli kimliği doğrulanmış bir hesap).
> (b) daha kolay ama e-posta/SMS altyapısı + kimlik doğrulama sorusu getirir.

---

# F. Admin paneli

**S63. Şu 11 modül için kararın?** (Keşifte "kararsız" çıkanlar)

| Modül | Ne işe yarıyor | Önerim |
|---|---|---|
| Komuta Merkezi (sistem sağlığı, huni, ölçüm) | Gece denetimi, dönüşüm hunisi, çökme kayıtları | **Sadeleştir** — yalnız "Kapı Durumu" (bakım modu açık mı) ve "Gerçek Durum" kalsın; huni/ölçüm v2 |
| Doğrulama Merkezi | Kaleci/hakem belge onayı | **Kalsın** (başvuru toplayacağız, K-27) |
| Silme Kuyruğu | KVKK hesap silme talepleri | **Kalsın** — yasal zorunluluk |
| Veli Onayları | Veli muvafakatnamelerini görüntüleme | **Kalsın** — yaş kuralı MVP'de |
| Destek Merkezi | Uygulama içi destek talepleri | **Kalsın** — saha sahipleri için gerçek ihtiyaç |
| Bölge Kapsama | Hangi il/ilçe aktif | **Kalsın** — İstanbul ilçeleriyle başlıyoruz |
| Bildirim Şablonları | Bildirim metinleri + zorunlu/isteğe bağlı seviyeler | **Kalsın** |
| Kampanyalar (toplu bildirim) | Segmentli duyuru | **Çıksın** (v2) |
| CMS Metinler | Uygulama metinleri | **Çıksın** — koda gömülü kalsın |
| Anlaşmazlıklar / Servis Anlaşmazlıkları | İtiraz yönetimi | **Çıksın** — kaleci/hakem escrow'u MVP'de yok |
| Ana Sayfa Görseli | Bölgeye göre banner | **Çıksın** — tek görsel koda gömülür |

**S64. Saha sahibi hesap yönetimi nereye taşınsın?** (Tuzak: bugün "SaaS Hesapları" modülünün içinde,
o modülü kapatınca şifre verme yeteneği kayboluyor.)
> **Önerim:** "Sahalar" sayfasındaki tesis kartının içine taşınsın — sahibi zaten orada seçiliyor.
> Böylece "tesisi aç → sahibini seç → şifresini ver" tek akış olur.

**S65. Admin maç kurarken kaleci/hakem atayabilsin mi?** Bugün atama yalnız maç detay ekranında.
> **Önerim: evet, maç kurma formuna eklensin** — "bu maça kaleci ata" tek adımda yapılabilsin.

**S66. Admin panel aynı repoda mı kalsın?** Bugün aynı repo, aynı Vercel projesi (`/admin` adresi).
> **Önerim: aynı repoda kalsın.** Ayırmak 1-2 haftalık ek iş ve panelin "oyuncunun gördüğü ekranı
> birebir gösterme" özelliğini bozar. Güvenlik zaten sunucu tarafında.

---

# G. Kayıt, profil, kimlik

**S67. Kayıt akışında rol seçimi olacak mı?** Bugün herkes oyuncu olarak doğuyor; saha sahibi hesabını
admin açıyor.
> **Önerim: aynen kalsın.** Rol seçimi ekranı ölü kod — kaldırılacak.

**S68. Profilde gerçek ad mı görünecek?** Bugün ad-soyad zorunlu ve profilde görünüyor.
> **Önerim:** Ad + soyadın baş harfi ("Mirac K.") görünsün; tam ad yalnız arkadaşlara.
> KVKK açısından daha güvenli. Onayına ihtiyacım var.

**S69. Kaleci/hakem başvuru yüzeyi nerede olsun?** (K-27: başvuru toplanacak, aktivasyon sonra.)
> **Önerim:** Profil → Ayarlar içinde tek bir "Kaleci/Hakem olarak başvur" bağlantısı; kısa form
> (ad, telefon, tecrübe, bölge). Ayrı bir panel/ekran kurmayalım.

---

# H. Kuruluş ayrıntıları

**S70. İsimler:** Yeni GitHub reposu ve yeni Supabase projesi için ad?
> **Önerim:** repo `oyna`, Supabase projesi `oyna`. (Eskiler `OYNA` adını taşıyor ama farklı hesap/proje
> olduğu için çakışma olmaz. Farklı bir tercih varsa söyle.)

**S71. Uygulama sürümü:** Yeni MVP hangi sürümden başlasın? (Bugünkü: 3.0.0)
> **Önerim: 1.0.0** — yeni ürün, yeni mağaza kaydı, temiz sayfa.

**S72. Mobil (K-05) için hesaplar hazır mı?** Apple Developer (yıllık 99$) ve Google Play (tek seferlik 25$)
hesapların var mı? Yoksa web ile başlayıp mobili hemen arkasından mı ekleyelim?

**S73. Pilot sahalar:** İstanbul'da anlaştığın/konuştuğun saha var mı? Kaç tesisle başlıyoruz?
> Bu, veritabanına gerçek tesis/kort/tarife girmemiz için gerekli — ve MVP'nin ilk gününde
> boş ekran görmemek adına kritik.
