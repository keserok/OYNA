# Fikirler ve Gelecek Geliştirmeler

## Takım "Tahmini Değer" (Piyasa Değeri) Sistemi
Takımların oluşturulması sırasında girilen "Tahmini Değer", gelecekte takımlar maç yaptıkça ve galibiyet aldıkça dinamik olarak güncellenen bir "Kulüp Değeri"ne dönüşecektir. Bu sistem takımlara prestij katan bir oyunlaştırma (gamification) öğesidir.

**Gelecek Değer Skalası Referansları:**
- 10 Maç, 5 Galibiyet -> ~30.000 Değer
- 10 Maç, 8 Galibiyet -> ~50.000 Değer
- 10 Maç, 10 Galibiyet -> ~80.000 Değer
- 20 Maç, 16 Galibiyet -> ~150.000 Değer

*Not: Başlangıçta kullanıcı bu değeri manuel veya tahmini olarak girebilir, sonrasında sistem galibiyet yüzdesi ve maç tecrübesine göre bu değeri otomatik yukarı veya aşağı yönlü güncelleyebilir.*

---

## "Maça Katıl" + "Rakip Bul" Birleşik Modül Fikri

### Problem
Şu an Dashboard'da iki ayrı full-width kart var:
- **Maça Katıl** (Bireysel - mor, `bg-[#4f46e5]`) → Oyuncu tek başına açık maça katılıyor.
- **Rakip Bul** (Kaptan Modu - kırmızı, `bg-red-600`) → Takım kaptanı rakip takım arıyor.

Bu iki buton aslında **aynı amaca** hizmet ediyor: "Bir maça dahil olmak." Sadece giriş noktası farklı (bireysel vs. takım).

### Çözüm: "Sahaya Çık" Birleşik Kartı
İki butonu tek bir **premium, çift modlu kart** haline getirmek. Kullanıcı kartın üzerine tıkladığında veya kartın içindeki bir toggle/segmented control ile modunu seçiyor:

**Tasarım Konsepti:**
- Tek bir `col-span-2 h-40` kart, gradient arka plan (mor → kırmızı veya koyu lacivert).
- Kartın sol yarısı **"Bireysel Katıl"** modu: Tek kişi ikonu, "Açık maçlara göz at" alt yazısı.
- Kartın sağ yarısı **"Takım Olarak"** modu: İki takım ikonu (karşı karşıya), "Rakip bul veya meydan oku" alt yazısı.
- Ortada ince bir dikey ayırıcı çizgi (neon glow).
- Kullanıcı hangi tarafa tıklarsa o akış başlıyor.

**Alternatif Tasarım:**
- Kartın üstünde küçük bir segmented control (`Bireysel | Takım`) var.
- Seçime göre kartın rengi, ikonu ve alt yazısı animasyonlu şekilde değişiyor (Framer Motion `layout` animasyonu).
- Tek bir "Sahaya Çık" butonu, seçime göre `MATCH_DISCOVERY` veya `OPPONENT_FINDER` ekranına yönlendiriyor.

**Avantajları:**
1. Dashboard'da 1 kart alanı kazanılır (daha az scroll).
2. Kullanıcıya "maç bulmak" için tek bir mental model sunulur.
3. Tasarım dili daha tutarlı olur — iki ayrı renk/stil yerine tek bir premium kart.
4. İleride "Turnuva Maçı" gibi 3. bir mod da kolayca eklenebilir.

**Dikkat Edilecekler:**
- Her iki modun eşit görsel ağırlıkta olması lazım; biri diğerini ezmemeli.
- Seçili modun çok net belli olması gerek (aktif taraf parlıyor, pasif taraf soluk kalıyor).
- Mobilde parmakla rahat tıklanacak boyutta olmalı.
