# OYNA — Mağaza Vitrin Metinleri

> **Amaç:** App Store Connect ve Google Play Console'daki metin alanlarına
> **olduğu gibi yapıştırılacak** hazır içerik. Karakter sınırları başlıklarda
> yazıyor ve her metin o sınırın altında ölçülmüştür.
>
> **Değiştirirken dikkat:** vitrin metni, uygulamanın gerçekten yaptığı şeyi
> anlatmak zorundadır (App Store Guideline 2.3.1 — "accurate metadata").
> Bugün OYNA **tek şehirde** açılıyor ve **çevrimiçi ödeme kapalı**. İkisi de
> aşağıdaki metinlerde açıkça yazıyor; silme.

---

## 1. App Store — Uygulama Adı (en çok 30 karakter)

```
OYNA - Halı Saha Maç Bul
```

*24 karakter.* Marka + aranan terim. "Halı saha" Türkiye'de en çok aranan
biçim; arama sonuçlarında bunun üzerinden bulunuyoruz.

---

## 2. App Store — Alt Başlık / Subtitle (en çok 30 karakter)

```
Ordu'da kadro kur, sahaya çık
```

*29 karakter.* Şehri alt başlığa koymak bilinçli: uygulamayı indiren biri
daha mağazadayken nerede çalıştığımızı görsün. Beklentiyi doğru kurmak,
"boş uygulama" yorumundan da 2.3.1 riskinden de koruyor.

---

## 3. App Store — Anahtar Kelimeler (en çok 100 karakter, virgülle)

```
halısaha,hali saha,maç,futbol,kadro,kaleci,hakem,rezervasyon,ordu,takım,eksik oyuncu,saha kirala
```

*96 karakter.* "hali saha" ayrıca yazıldı: kullanıcıların çoğu Türkçe
karakter kullanmadan arıyor. Uygulama adında geçen kelimeleri buraya
TEKRAR YAZMA — Apple ikisini birleştirerek arıyor, tekrar yer israfı olur.

---

## 4. App Store — Tanıtım Metni / Promotional Text (en çok 170 karakter)

```
Ordu'da yeni açılıyoruz. Maç kur, eksik oyuncuyu bul, kaleci ve hakem çağır. Vitrindeki içerik şimdilik örnektir; gerçek tesisler katıldıkça yerini alır.
```

*150 karakter.* **Bu alan yeni sürüm göndermeden değiştirilebilir** — örnek
içerik temizlendiği gün ikinci cümleyi silmek yeterli.

---

## 5. App Store — Açıklama / Description (en çok 4000 karakter)

```
Halı saha maçı kurmak neden bu kadar zor olsun?

OYNA, maçını kurduğun, eksik oyuncunu bulduğun ve sahayı ayırttığın tek
yerdir. Ordu'da başlıyoruz.

MAÇ KUR, KADRONU DOLDUR
Saatini ve sahanı seç, maçını aç. Eksik kalan mevkileri OYNA duyurur;
bölgendeki oyuncular kadroya katılır. Kimin geldiğini, kimin eksik
olduğunu anlık görürsün.

EKSİK OYUNCU MU VAR
Son dakika birileri düştüyse maçını herkese açabilir ya da yalnız
arkadaşlarına gösterebilirsin. Kadro dolunca duyuru kendiliğinden kapanır.

KALECİ VE HAKEM ÇAĞIR
Kaleci bulamamak maçı bozar. OYNA'da bölgendeki kalecileri ve hakemleri
görür, ücretini önceden bilir, doğrudan çağırırsın.

SAHANI SEÇ
Tesisleri fiyat, mesafe ve boş saate göre karşılaştır. Hangi saatin boş
olduğunu tesisi aramadan görürsün.

OYUNCU KARTIN
Oynadığın her maç kartına işler. Mevkin, oyun tarzın, güvenilirlik puanın —
takım arayanlar seni buradan tanır.

TAKIMINI KUR
Düzenli oynadığın kadroyu takım olarak kaydet, maçları takım adına aç,
sohbetten organize ol.

ÖDEME NASIL
Rezervasyonunu OYNA'dan yapar, kaporayı kartla ödersin; kalanını sahada
tesise ödersin. Ödeme altyapımız canlıya alınana kadar uygulama içi
ödemeler TEST modundadır — ekranda bunu açıkça yazıyoruz ve kartından
para çekilmiyor.

NEREDE ÇALIŞIYOR
OYNA şu an yalnız Ordu'da açık. Başka bir şehirdeysen uygulamayı
kurabilirsin ama maç ve saha göremezsin — şehrine geldiğimizde burada
olacak.

BAŞLAMAK İÇİN
E-posta ve şifrenle kaydol, ya da Apple veya Google hesabınla tek
dokunuşta gir. Kaydolan herkes oyuncu olarak başlar.

—

Sorun, öneri ve tesis başvurusu için uygulama içindeki Destek bölümünden
bize ulaşabilirsin.
```

*Yaklaşık 1450 karakter.* Kasten kısa: mağaza açıklamalarının ilk üç satırı
dışında kalanı çok az kişi okuyor. Uzun metin yerine her başlık tek bir
somut fayda anlatıyor.

**Silinmemesi gerekenler:** "ÖDEME NASIL" ve "NEREDE ÇALIŞIYOR" bölümleri.
İkisi de bugünün gerçeğini anlatıyor ve incelemede beyanımızla birebir
örtüşüyor. Ödeme açıldığında ya da ikinci şehir eklendiğinde **önce burayı**
güncelle.

---

## 6. Google Play — Kısa Açıklama (en çok 80 karakter)

```
Ordu'da halı saha maçı kur, eksik oyuncuyu bul, kaleci ve hakem çağır.
```

*69 karakter.*

---

## 7. App Store Connect — diğer alanlar

| Alan | Değer |
| --- | --- |
| Primary Category | Sports |
| Secondary Category | Social Networking |
| Price | Free |
| In-App Purchases | Yok |
| Age Rating | **12+** (kullanıcı içeriği + sohbet var) |
| Copyright | `2026 OYNA` |
| Primary Language | Turkish |

---

## 8. Yaş sınırı anketinde verilecek cevaplar

Apple'ın sorularına:

| Soru | Cevap |
| --- | --- |
| Şiddet (gerçekçi/karikatür) | Yok |
| Cinsel içerik / çıplaklık | Yok |
| Küfür veya kaba mizah | Yok |
| Alkol, tütün, uyuşturucu | Yok |
| Korku temaları | Yok |
| Simüle kumar / gerçek parayla oyun | **Yok** |
| Kısıtlanmamış web erişimi | Yok |
| **Kullanıcı üretimi içerik** | **Var** — maç sohbeti, profil, takım adları |

Son satır **12+** sonucunu doğuruyor ve doğrusu budur: uygulamada oyuncular
birbirine mesaj yazıyor. "Yok" demek, gerçekle uyuşmayan bir yaş sınırı
üretir ve içerik şikâyeti geldiğinde geri teper.

Uygulamada bildirme, engelleme ve süzme kapıları hazır (Guideline 1.2).
