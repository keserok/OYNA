# Yeni Yapıların Tasarımı

> MVP'de sıfırdan yazılacak üç yapı: **saat ızgarası** (fiyat + uygulamaya açık saatler),
> **mutabakat defteri** (saha sahibine borcumuz) ve **antrenman kuralları**.
> Bu doküman, kod yazılmadan önce bu üçünün nasıl çalışacağını netleştirir.

---

# 1. Saat ızgarası — fiyatın ve açık saatlerin tek yeri

## Çözdüğü problem

Bugün fiyat **kural** olarak tutuluyor: "1 numaralı kort, hafta içi 19:00-23:00, 2000₺".
Bu pratik ama iki şeyi yapamıyor:

1. Saha sahibi **tek bir saati** ayrı fiyatlayamıyor ("yarın 21:00 boş kalacak, 1500₺'ye vereyim").
2. **Hangi saatlerin uygulamaya açık olduğu** tutulamıyor (K-80'in ikinci katmanı).

Senin kuralın: *saat saat ayarlanan, tarifeden üstün olsun; tarife kaydedilince saat katmanına
yazılsın; ama bir saat elle yazıldıysa tarife onu ezmesin.*

## Nasıl çalışır

İki katman var ve **saat katmanı gerçeğin kaynağıdır**. Tarife, saat katmanını **dolduran** bir araçtır.

```
TARİFE KATMANI  (kural)          SAAT KATMANI  (gerçek)
"Hafta içi 19-23 → 2000₺"  ──►   14 Ağu 19:00  2000₺  [tarifeden]
                                 14 Ağu 20:00  2000₺  [tarifeden]
                                 14 Ağu 21:00  1500₺  [ELLE]      ◄── tarife bunu ezmez
                                 14 Ağu 22:00  2000₺  [tarifeden]
```

Her saat satırı **nereden geldiğini** taşır: `TARIFE` mi, `ELLE` mi.
Tarife değiştiğinde yalnızca `TARIFE` işaretli satırlar yeniden yazılır. `ELLE` satırlarına dokunulmaz.

Saha sahibi elle girdiği bir saati "tarifeye geri döndür" diyebilir — o zaman satır `TARIFE`'ye döner
ve bir sonraki tarife yazımında güncellenir. Bu, "yanlışlıkla elle değiştirdim, geri alamıyorum"
tuzağını kapatır.

## Ne kadar ileriye kurulur

Maçlar en fazla 14 gün önce satışa açılabildiği için (K-79), ızgara **30 günlük** bir pencere için
tutulur ve her gece bir gün ileri kaydırılır. Geçmiş günler 90 gün sonra temizlenir.

*Not: 100 tesis × 3 kort × 16 saat × 30 gün ≈ 144.000 satır. Postgres için önemsiz bir yük.*

## Her saatin taşıdığı bilgi

| Alan | Kim girer | Ne anlama gelir |
|---|---|---|
| Tesis · Kort · Tarih · Saat | — | Hangi saat |
| **Uygulamaya açık mı** | Saha sahibi | K-80 ikinci katman. **Varsayılan: kapalı** |
| **Saha bedeli** | Saha sahibi | Bu saat için sahaya ödeyeceğimiz tutar |
| **Platform payı (%)** | Admin | Bizim kârımız (K-52 — sahaya özel anlaşma) |
| **Oyuncu toplamı** | Otomatik / elle | Saha bedeli + platform payı. Admin veya sahibi elle ezebilir (K-53) |
| **Kaynak** | Sistem | `TARIFE` veya `ELLE` |
| Doluluk | Sistem | O saatte rezervasyon/maç var mı |

## Fiyat nasıl çıkar

```
Saha bedeli          2.000 ₺   ← saha sahibiyle anlaştığımız
Platform payı %20     +400 ₺   ← admin panelden, sahaya özel
─────────────────────────────
Oyuncu toplamı       2.400 ₺
÷ 14 kişi (7v7)
Kişi başı             ~172 ₺   ← yukarı yuvarlanır → 172₺
```

Yuvarlama artığı (14 × 172 = 2.408 → 8₺) platformda kalır ve admin raporunda **ayrı satır**
olarak görünür (K-55).

## Bu tasarımın kazandırdıkları

- Saha sahibi takvimde bir saate dokunup fiyatını değiştirebilir — tarifeyi bozmadan.
- "Bu akşam boş kalacak, ucuzlatayım" hareketi tek dokunuş.
- Uygulamaya açık saatler, fiyatla **aynı yerde** yaşar; iki ayrı ekranda iki ayrı kavram olmaz.
- Admin, saha başına ve **saat başına** farklı anlaşma yürütebilir (K-52 tam karşılığı).

---

# 2. Mutabakat defteri — saha sahibine ne borçluyuz

## Çözdüğü problem

Saha saatlerini satın alıp **elden ödüyoruz** (K-16). Uygulamada para çıkışı yok. Ama:

- Hangi sahaya, hangi dönemde, ne kadar borçlandığımızı **kuruşu kuruşuna** bilmeliyiz.
- Saha sahibi maçı iptal ederse, iade ettiğimiz komisyon **ondan tahsil edilmeli** (K-49).
- Ödeme periyodu sahadan sahaya değişiyor: günlük, 3 günlük, haftalık, aylık (K-77).
- Saha sahibi kendi panelinden "bu dönem ne alacağım" görebilmeli.

## Defterin kuralları

Bu bir **muhasebe defteri**, bir "durum tablosu" değil. Dört kural onu sağlam tutar:

**1. Satır silinmez, değiştirilmez.** Hata varsa **düzeltme satırı** eklenir. Böylece geçmiş her
zaman geriye dönük okunabilir ve "kim ne zaman ne değiştirdi" tartışması olmaz.

**2. Her satır kaynağını gösterir.** Hangi maçtan, hangi rezervasyondan, hangi iptalden geldiği
yazılıdır. "Bu 2000₺ nereden çıktı?" sorusunun cevabı tek tıkla görünür.

**3. Aynı olay iki kez yazılamaz.** Bir maç kesinleştiğinde defterde tam olarak **bir** satır oluşur.
Sistem yeniden denese bile ikinci satır yazılmaz — bu, çift ödeme riskini kökten keser.

**4. Bakiye hiçbir yerde saklanmaz, her zaman satırlardan hesaplanır.** Saklanan bir bakiye
sayısı, satırlarla arasına fark girdiği anda yalan söylemeye başlar.

## Deftere düşen hareketler

| Hareket | Yön | Ne zaman oluşur |
|---|---|---|
| **Saha bedeli** | Borçlanırız (+) | Maç kesinleştiğinde ya da rezervasyon tamamlandığında |
| **Antrenman payı** | Borçlanırız (+) | Antrenman slotu satıldığında, anlaşılan yüzdeye göre |
| **İptal cezası** | Alacaklanırız (−) | Saha sahibi maçı iptal etti; oyunculara iade ettiğimiz komisyon ondan tahsil edilir (K-49) |
| **Elden ödendi** | Kapanır (−) | Admin ödemeyi yaptı ve panelden damgaladı |
| **Düzeltme** | ± | Admin elle düzeltme yaptı; sebebi zorunlu |

**Bakiye = tüm satırların toplamı.** Pozitifse biz borçluyuz, negatifse saha sahibi bize borçlu.

## Ödeme dönemi

Her sahanın kendi periyodu var (günlük / 3 günlük / haftalık / aylık). Sistem dönem kapandığında
admin paneline **"Ödenecekler"** listesi çıkarır: hangi sahaya ne kadar, hangi hareketlerden.

Admin ödemeyi elden yapıp panelden damgalar; damga defterine "Elden ödendi" satırı düşer ve
o dönem kapanır. Ödeme kaydında **kim ödedi, ne zaman, hangi dönem** bilgisi tutulur.

## Saha sahibi ne görür

Kendi panelinde tek bir sade ekran: **"Bu dönem alacağım: 18.400₺"** + hareket listesi
(hangi maçtan ne kadar) + geçmiş ödemeler. Komisyon oranını görür ama değiştiremez —
bugünkü "OYNA Anlaşmam" ekranının davranışı aynen korunur.

---

# 3. Antrenman kuralları

## Saha sahibinin gireceği ayarlar

Kort bazında, hepsi saha sahibi panelinden (K-59):

| Ayar | Varsayılan | Not |
|---|---|---|
| Antrenman satışı | **Kapalı** | Bilinçli olarak kapalı doğar |
| Kaç saat kala açılsın | 2 saat | Sahibi 1–6 arası seçer |
| Kişi başı ücret | — | Sahibinin belirlediği taban |
| Maksimum kişi | Kort kapasitesi | Sahayı kaç kişi paylaşabilir |
| Hangi günler | Tümü | Opsiyonel kısıt |
| Hangi saat aralığı | Tümü | Örn. yalnız 22:00 sonrası |
| **Platform payı (%)** | Admin girer | Sahaya özel anlaşma (K-57) |

## Nasıl işler

Bir saat için (a) antrenman açık, (b) o saatte rezervasyon yok, (c) başlangıca "kaç saat kala"
ayarından az kaldıysa → slot **otomatik satışa çıkar**. Saat dolduğunda ya da rezerve edildiğinde
listeden düşer.

Satın alan her kişi ayrı bir katılım kaydı oluşturur. **Rezervasyon tek**, katılım **çok kişilik** —
çünkü sahayı paylaşıyorlar (K-23). Kapasite dolunca satış durur.

**İade yoktur** (K-60) ve bu, satın alma ekranında açıkça yazar.

## v2 için bırakılan yer

Kaleci kiralayarak yarı sahayı ayırma fikri (K-62) için veri modelinde yer bırakılıyor:
katılım kaydının bir "grup" kimliği olacak, böylece ileride "şu 6 kişi birlikte geldi ve
kaleci tuttu" ilişkisi kurulabilecek. MVP'de bu alan boş kalıyor.

---

# Bu üç yapının birbirine bağlantısı

```
        SAAT IZGARASI
   (fiyat + açık saatler)
        │           │
        │           └────────► ANTRENMAN KURALLARI
        │                      (boş saatleri kişi başı satar)
        ▼
   MAÇ / REZERVASYON
        │
        ▼
   MUTABAKAT DEFTERİ
   (sahaya borcumuz + cezalar)
```

Saat ızgarası fiyatı ve müsaitliği söyler; maç, rezervasyon ve antrenman ondan beslenir;
her satış mutabakat defterine bir borç satırı yazar; dönem sonunda elden ödenir ve damgalanır.

Üçü de **admin panelinden yönetilebilir** — çünkü MVP'nin amacı, admin panelinden mükemmel
yönetilebilen sade bir ürün çıkarmak.
