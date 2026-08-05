# OYNA · Tasarım Kiti (`design-kit`)

**Bu klasör, tasarım araçlarına verilecek "ön yüz odaklı alt klasördür."**
Uygulamanın tamamı 559 kod dosyası; bir tasarım aracına hepsini vermek sinyali
boğar. Burada yalnız **görsel dili anlatan** dosyalar var: renk ve ölçü
token'ları, arayüz bileşenleri, üç örnek ekran ve kuralların yazılı hâli.

---

## Claude Design'a nasıl verilir

1. Claude Design'da depoyu bağla: **`keserok/oyna`**
2. "Büyük kod tabanlarında ön yüz odaklı bir **alt klasör** bağlamanızı
   öneririz" diye sorduğu yere şunu yaz:

   ```
   design-kit
   ```

3. İlk mesajında şunu söyle:

   > Tasarım sistemi `design-kit/01-TASARIM-SISTEMI.md` ve
   > `design-kit/02-URUN-KURALLARI.md` dosyalarında yazılı. Renk ve ölçüleri
   > `design-kit/stil/theme.css` içindeki token'lardan al, yeni değer uydurma.

Klasörü tarayıcıda gözle görmek istersen: **`design-kit/onizleme.html`** dosyasını
indirip çift tıkla — renkler, puntolar ve bileşenler tek sayfada görünür.

---

## İçinde ne var

| Yol | Ne işe yarar |
|---|---|
| `01-TASARIM-SISTEMI.md` | Renk rolleri, punto ölçeği, boşluk/köşe merdivenleri, hareket kuralları |
| `02-URUN-KURALLARI.md` | Türkçe metin, para biçimi, "uydurma veri yok", erişilebilirlik — tasarımı ilk bakışta yanlış yapan maddeler |
| `03-BILESEN-KATALOGU.md` | Hangi bileşen ne zaman kullanılır, hangi durumları taşır |
| `onizleme.html` | Tek sayfalık canlı stil rehberi (tarayıcıda açılır) |
| `stil/theme.css` | Token'ların kendisi — **tek doğru kaynak** |
| `stil/index.css` | Uygulamanın tam stil dosyası; kuralların gerekçeleri yorum satırlarında |
| `temel/type.ts` | Punto ölçeği (18 basamak) |
| `temel/labels.ts` | Ekran adları ve etiketler — bir ekranın adı burada bir kez yazılır |
| `bilesenler/` | Gerçek React bileşenleri: alt sayfa, çip, buton, avatar, boş durum… |
| `ekranlar/` | Üç örnek ekran: ana sayfa · maç listesi · profil |
| `KAYNAK.json` | Hangi dosyanın kaynağı neresi — künye |

## İçinde ne YOK (bilerek)

Ödeme kodu, veritabanı sorguları, iş kuralları, tesis/yönetim panelleri ve
oturum açma akışı burada **yoktur**. Tasarım için gerekmezler; bulunmaları hem
sinyali düşürür hem de gereksiz yere sistemin iç işleyişini dışarı taşır.

---

## ⚠️ Buradaki kod dosyaları AYNADIR — düzenleme

`bilesenler/`, `ekranlar/`, `temel/` ve `stil/` altındaki dosyalar uygulamanın
gerçek dosyalarının **salt okunur kopyalarıdır**. Her birinin başında kaynağını
söyleyen bir uyarı satırı var.

Burada yapılan bir değişiklik uygulamaya **geçmez** ve ilk tazelemede silinir.
Değişiklik kaynak dosyada yapılır, sonra:

```
npm run tasarim:kit
```

Kopyaların eskiyip eskimediğini denetlemek için:

```
npm run tasarim:kit -- --kontrol
```

Bu komut, aynalardan biri kaynağıyla aynı değilse **hata verir**. Sessiz eskime
böyle engellenir: kopya kendi kendini denetler.

---

## Bir tasarım aracının okuma sırası

1. `01-TASARIM-SISTEMI.md` — görsel dil
2. `02-URUN-KURALLARI.md` — değişmez ürün kuralları
3. `stil/theme.css` — sayısal değerler
4. `03-BILESEN-KATALOGU.md` + `bilesenler/` — hazır parçalar
5. `ekranlar/Dashboard.tsx` — parçaların bir arada nasıl durduğu (onaylı tasarım)

**Tek cümlelik özet:** OYNA koyu temalı, telefon önce tasarlanmış, Türkçe bir
halı saha uygulamasıdır; neon yeşil ekranda **tek** birincil eylemi işaret eder
ve ekrandaki her ölçü bir token'dan gelir.
