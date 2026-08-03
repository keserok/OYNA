# OYNA — MEKANİZMA

> **Bu dosya neyi çözüyor?**
> OYNA'da bugüne kadarki en pahalı hata türü şuydu: **bir şey sessizce yanlış çalıştı ve
> kimse haberdar olmadı.** Kod hata vermedi, ekran kırmızı yanmadı, test yeşil kaldı —
> ama sistem yanlış sonuç üretti.
>
> Mekanizma, bunu yakalamak için kurulmuş kalıcı düzenektir. Tek tek hataları düzeltmez;
> **hataların görünmesini** sağlar.

---

## 1. Mekanizma neden var? (gerçek bir olayla)

3 Ağustos 2026'da şu ikisi aynı anda doğruydu:

- OYNA **hiç kimseye bildirim gönderemiyordu** (18 denemeden 18'i başarısız)
- **Askıda kalan hiçbir ödeme toplanmıyordu** (süpürücü zamanlaması hiç kurulmamıştı)

Ve şu da doğruydu: **hiçbir hata mesajı yoktu.** Ne ekranda, ne panelde, ne kayıtlarda.

Kök nedeni bulduk: üç ayar kutusu boştu. Kod kusursuzdu. Üstelik süpürücüyü kuran adım
bunu **fark etmişti** — "ayarlar eksik, kurmuyorum" diye bir uyarı yazdı, sonra
**başarıyla tamamlandı.** Uyarı kimseye ulaşmadı.

> **Mekanizmanın varlık sebebi tek cümlede:** doğru davranan ama duyulmayan bir uyarı,
> hiç olmamış uyarıyla aynı şeydir.

---

## 2. Mekanizma üç parçadan oluşur

### Parça 1 — SİSTEM HARİTASI: sistem neyden oluşuyor?

Sistem **15 temel yapı taşına** ayrıldı. Her taşın bir adı, bir risk seviyesi, ve en
önemlisi **neyi garanti ettiği** yazılı.

Örnek: `B01 · PARA` taşının garantisi şudur — *"cüzdan bakiyesi asla eksiye düşmez"*,
*"aynı ödeme iki kez tahsil edilmez"*.

Tam liste: [`SISTEM-HARITASI.md`](./SISTEM-HARITASI.md)

| # | Yapı taşı | Risk |
|---|---|---|
| B01 | PARA | 🔴 KRİTİK |
| B02 | KADRO | 🟠 YÜKSEK |
| B03 | ZAMAN | 🟠 YÜKSEK |
| B04 | REZERVASYON | 🟠 YÜKSEK |
| B05 | KAPILAR | 🔴 KRİTİK |
| B06 | BİLDİRİM | 🟠 YÜKSEK |
| B07 | KAPSAMA | 🟡 ORTA |
| B08 | KİMLİK | 🔴 KRİTİK |
| B09 | YÜK | 🟡 ORTA |
| B10 | OTOMASYON | 🟠 YÜKSEK |
| B11 | AYARLAR | 🔴 KRİTİK |
| B12 | DEMO | ⚪ DÜŞÜK |
| B13 | SAHA SAHİBİ | 🟡 ORTA |
| B14 | PAZARYERİ | 🟡 ORTA |
| B15 | SOSYAL | 🟡 ORTA |

> `B11 · AYARLAR` yukarıdaki olaydan **doğdu.** Ayarlar bir "yapı taşı" sayılmadığı için
> kimse sahip çıkmıyordu — ve sistemin iki büyük arızası tam oradaydı.

### Parça 2 — ETKİ ANALİZİ: bu değişiklik neye dokunuyor?

Bu, senin özellikle istediğin parça: *"bir sistem değiştirdiğimizde mekanizmanın temel
yapı taşlarından hangilerini ilgilendirdiğini dahi görebilelim."*

Tek komut:

```
npm run etki
```

Araç değişen dosyalara bakar ve şunları söyler:

- **Hangi yapı taşlarına dokunuldu** (risk seviyesiyle birlikte)
- **O taşlar neyi garanti ediyor** — yani ne bozulma riski var
- **Hangi kontrollerin çalıştırılması zorunlu**
- **O taşlarda ZATEN açık olan bulgular** — üstüne yenisini eklemeden önce görülsün
- **CEO onayı gerekiyor mu** — KRİTİK bir taşa dokunulduysa araç durur ve uyarır

SQL dosyaları için ayrıca **içeriğe** bakar: bir migration `payment_intents` tablosuna
dokunuyorsa, dosya adı ne olursa olsun `B01 · PARA` taşını işaretler.

### Parça 3 — KONTROLLER: garantiler hâlâ geçerli mi?

**26 kontrol** yazıldı. Her biri bir yapı taşının garantisini sınar ve her birinin
**"hangi sessizliği yakaladığı"** yazılı.

Örnekler:

| Kontrol | Ne sorar | Yakaladığı sessizlik |
|---|---|---|
| `K-AYAR-1` | Zorunlu ayarların hepsi dolu mu? | Kod kusursuz, ayar boş, sistem sessizce hiçbir şey yapmıyor |
| `K-AYAR-3` | Bir migration sessizce vazgeçmiş mi? | Migration BAŞARILI göründü ama işini yapmadı |
| `K-KADRO-1` | Kadronun iki kaynağı uyuşuyor mu? | İki kaynak sessizce ayrışıyor |
| `K-BILDIRIM-1` | Dışarı giden çağrılar başarılı mı? | Bildirim gitmiyor ama uygulama "gönderdim" sanıyor |
| `K-KIMLIK-1` | Silme kapısı gerçek sözlüğü mü kullanıyor? | Kapı var, çalışıyor görünüyor, hiç tetiklenmiyor |
| `K-ZAMAN-1` | Maç saatleri tutarlı mı? | Saat kayması hata vermez, sadece yanlış sonuç üretir |

Tam katalog: [`KONTROLLER.json`](./KONTROLLER.json) · okunabilir hali
[`SISTEM-HARITASI.md`](./SISTEM-HARITASI.md) sonundaki tabloda.

---

## 3. Mekanizma neden çürümez?

Bu en önemli soru. Elle yazılmış her belge zamanla gerçekle bağını kaybeder — bu projede
zaten yaşandı (`GECERLILIK_POLITIKASI.md`). Mekanizma buna karşı **üç savunma** taşır:

### Savunma 1 — Tek kaynak, üretilen metin

Bilgi **tek yerde** durur: `YAPI-TASLARI.json` ve `KONTROLLER.json`.
Okunan `SISTEM-HARITASI.md` bunlardan **üretilir** (`npm run sistem:harita`).
Aynı bilgi iki yerde tutulmadığı için ikisinin ayrışması **mümkün değildir**.

### Savunma 2 — Kapsam bekçisi

```
npm run sistem:kapsam
```

Her kaynak dosyanın bir yapı taşına ait olmasını sınar. Yeni bir dosya eklendiğinde ve
haritaya bağlanmadığında **listede görünür.** `--sert` bayrağıyla çalıştırılırsa hata
verir (CI'da kullanılmak üzere).

> **Bugünkü durum dürüstçe:** kapsam **%63** (289 dosyadan 182'si haritada). Harita
> sistemin **riskli ve para dokunan** kısımlarını kapsıyor; kalan 107 dosya ağırlıklı
> olarak genel arayüz bileşenleri. Kapsam her pakette artırılır ve bu komut ne kadar yol
> kaldığını her zaman söyler.
>
> Zorunluluk (`--sert`) **lansmandan sonra** açılacak (K-11.5) — önce mekanizma
> alışkanlık haline gelsin, sonra kural olsun.

### Savunma 3 — Bulgular haritaya bağlı

Her yapı taşında `bilinen_acik_bulgular` alanı var. Bir bulgu kapatıldığında oradan
silinir. Böylece "hangi sorunlar hâlâ açık" sorusu **belgede değil, araçta** yaşar —
ve `npm run etki` her seferinde yüzüne söyler.

---

## 4. Nasıl kullanılır?

### Her değişiklikten ÖNCE

```
npm run etki
```

Çıktıyı oku. Kural (K-11.1):

| Dokunulan taşın riski | Ne olur |
|---|---|
| 🔴 **KRİTİK** (PARA, KAPILAR, KİMLİK, AYARLAR) | **İş DURUR.** Devam için CEO'nun açık onayı gerekir. |
| 🟠 YÜKSEK · 🟡 ORTA · ⚪ DÜŞÜK | Uyarır, iş devam eder. Zorunlu kontroller yine çalıştırılır. |

> Neden ikili? Her şeyi durdurursak mekanizma engele dönüşür ve zamanla atlanır.
> Hiçbir şeyi durdurmazsak süs olur. Durma yetkisi yalnız geri alınamaz zararı olan
> dört taşta.

### Kontrolün kendisi çalışamazsa (K-11.3)

Veritabanına ulaşılamadı, sorgu hata verdi, araç çöktü — bunların hepsi
**KIRMIZI sayılır**, "sorun yok" sayılmaz.

> Bu bilinçli bir tercih ve bedeli var: ara sıra yanlış alarm alacağız. Kabul edildi,
> çünkü bu projedeki bütün pahalı hatalar **"bilinmiyor"un "sorun yok" sanılmasından**
> çıktı.

### Her değişiklikten SONRA

```
npm run lint
npm run test:unit
```

Ve `npm run etki` çıktısındaki **zorunlu kontrolleri** çalıştır.

### Her gün (otomatik — kurulacak)

`GUNLUK` işaretli kontroller çalışır, sonucu **admin panelinde "Sistem Sağlığı" ekranına**
yazılır (K-11.4 — panel hazır, ekran oraya eklenecek). Kırmızı varsa ayrıca **e-posta** gider.

Ekranda görünecekler:
- Her yapı taşı için tek satır: yeşil / sarı / kırmızı
- Kırmızı olanın **hangi kontrolde** ve **ne zaman** kırıldığı
- "Kontrol edilemedi" durumu **kırmızı** olarak gösterilir (K-11.3)
- Son 30 günün geçmişi — bir şeyin ne zaman bozulduğu görülebilsin

> E-posta ayrıca gönderiliyor, çünkü bildirim kanalının kendisi kırılabiliyor
> (M-P0-3 tam olarak buydu). **Denetçi, denetlediği şeye bağımlı olamaz.**

---

## 5. Komut özeti

| Komut | Ne yapar |
|---|---|
| `npm run etki` | Değişikliğin hangi yapı taşlarına dokunduğunu gösterir |
| `npm run etki -- main` | `main` dalına göre farkı analiz eder |
| `npm run etki -- --dosya a.ts b.ts` | Belirli dosyaları analiz eder |
| `npm run sistem:kapsam` | Haritada olmayan dosyaları listeler |
| `npm run sistem:kapsam -- --sert` | Sahipsiz dosya varsa hata verir (CI) |
| `npm run sistem:harita` | `SISTEM-HARITASI.md` dosyasını yeniden üretir |

---

## 6. Mekanizmaya yeni bir şey nasıl eklenir?

**Yeni yapı taşı:** `YAPI-TASLARI.json` içine ekle → `npm run sistem:harita` çalıştır.

**Yeni kontrol:** `KONTROLLER.json` içine ekle, ilgili yapı taşının `kontroller`
listesine `id`'sini yaz → `npm run sistem:harita` çalıştır.

**Yeni dosya:** ilgili yapı taşının `dosyalar` listesine ekle.
`npm run sistem:kapsam` unutulanları söyler.

**Bulgu kapandı:** ilgili taşın `bilinen_acik_bulgular` listesinden sil.

---

## 7. Henüz yapılmamış olanlar (dürüst liste)

Mekanizmanın iskeleti kuruldu ve çalışıyor. Şunlar **kod uygulama aşamasında** eklenecek:

- [ ] `scripts/sistem/sql/` altındaki 17 SQL kontrol dosyası (şu an `KONTROLLER.json`'da
      tanımlı ama dosyaları yazılmadı)
- [ ] `npm run sistem:limitsiz-sorgu`, `sistem:filtresiz-abonelik`, `sistem:zaman-deseni`,
      `sistem:olu-ayar`, `sistem:sessiz-vazgecme` tarayıcıları
- [ ] Günlük çalışan denetim işi + admin panelinde **"Sistem Sağlığı" ekranı** (K-11.4)
- [ ] Kırmızı durumda e-posta gönderimi
- [ ] KRİTİK taşlarda **durdurma** davranışının uygulanması (K-11.1)
- [ ] CI'da `npm run sistem:kapsam -- --sert` — **lansmandan sonra** (K-11.5)
- [ ] Kapsamın %63'ten yukarı çekilmesi (kalan 107 dosya, ağırlıklı genel arayüz)
- [ ] `CLAUDE.md`'ye mekanizma maddesinin eklenmesi — **oturum sonunda, toplu** (K-11.6)

> Bu liste bilerek burada duruyor. Mekanizmanın ilk kuralı kendisine de uygulanır:
> **eksik olan şey görünür olmalı.**
