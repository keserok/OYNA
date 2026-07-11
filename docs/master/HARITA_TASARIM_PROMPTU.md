# OYNA Harita Tasarım Promptu

> Aşağıdaki blok, tasarım aracına/tasarımcıya olduğu gibi kopyalanıp verilir.

---

**PROJE:** OYNA — halı saha kiralama + maç bulma mobil uygulaması (Türkiye). Gece maçı enerjisi taşıyan, koyu zeminli, neon vurgulu bir spor uygulaması. Hedef: Airbnb'nin harita-keşif deneyimi × Uber'in harita hissi, OYNA'nın karakterinde.

**MARKA DİLİ (mevcut uygulamadan, birebir uyulacak):**
- Zemin: #0A0E14 (ana), #161B22 (yüzey/kart), kenarlıklar beyaz %5-10 opaklık.
- Birincil vurgu: neon yeşil #39FF14 (CTA, seçili durumlar, fiyat); ikincil: sarı #FACC15 (uyarı/misafir), kırmızı #FF3B30 (flaş indirim), mavi #00D8FF (kullanıcı konumu).
- Tipografi: başlıklar kalın (900) İTALİK BÜYÜK HARF, geniş harf aralığı; etiketler 10-11px, gövde 12-13px.
- Köşeler çok yuvarlak (kartlar 24px, chip'ler tam yuvarlak); cam efekti (blur + yarı saydam siyah) modallarda; neon glow gölgeleri seçili öğelerde.

**HARİTA STİLİ (özel koyu vektör stil — MapLibre için):**
Zemin #0A0E14 ailesinde derin lacivert-siyah; yollar zeminden bir tık açık (#1A222E), ana arterler biraz daha belirgin; su daha koyu; park/yeşil alan zar zor seçilen koyu yeşil; POI ikonları YOK (dükkan/restoran kalabalığı istemiyoruz); sokak adları yalnız yüksek zoom'da, soluk gri; şehir/ilçe adları küçük, zarif. Harita "sahne", pinler "oyuncu" olmalı — harita asla pinlerle yarışmamalı.

**TASARLANACAK EKRANLAR (390×844, iOS çentikli):**

1. **Keşif haritası (tam ekran harita modu):**
   - Fiyat baloncuklu pinler: koyu baloncuk (#161B22, ince neon kenarlık) içinde "~1800₺" beyaz kalın yazı + küçük yeşil nokta; SEÇİLİ pin: baloncuk neon yeşile döner, yazı siyah, %15 büyür, altında glow.
   - Flaş indirimli pin: baloncuk üstünde kırmızı "🔥 %20" mini rozeti.
   - Küme (cluster) baloncuğu: daha büyük daire, içinde saha sayısı ("6") + altında en düşük fiyat ("1200₺'den"); neon kenarlık.
   - Kullanıcı konumu: #00D8FF dolu nokta + beyaz halka + yarı saydam accuracy halkası.
   - Üstte: geri butonu, arama/filtre chip satırı; harita kaydırılınca chip satırının altında beliren "BU ALANDA ARA" chip'i (neon kenarlıklı, cam zemin).
   - Sağ altta dikey FAB kolonu: "konumuma dön" (hedef ikonu) + liste/harita geçişi.
   - Altta: yatay kart karuseli (bir kart ekranın ~%85'i genişlikte, kenarlardan komşu kartlar görünür).

2. **Karusel kartı (3 durum: normal / seçili / flaş indirimli):**
   Sol: saha fotoğrafı (yuvarlatılmış). Sağ: SAHA ADI (italik büyük harf), ★ 4.8 puan (sarı), ilçe + "2,4 km" mesafe rozeti, altta büyük neon fiyat "~1800₺" + "REZERVE ET →" mini CTA. Seçili kart: neon kenarlık + hafif glow. Favori kalbi sağ üstte.

3. **Durum ekranları (4 küçük artboard):**
   - Konum izni yok: haritanın üstünde sarı (#FACC15) ince banner — "Konumunu göremiyoruz. Yakınındaki sahalar için izin ver." + "İzin Ver" mini butonu.
   - "Bu alanda sonuç yok": harita ortasında cam kart — "Bu bölgede henüz saha yok" + "Aramayı genişlet" CTA.
   - Tekil sahada konum eksik: harita yerine boş durum — pin ikonu + "Konum bilgisi henüz eklenmemiş".
   - Harita yüklenemedi: iskelet (skeleton) zemin + "Haritayı yeniden dene" butonu.

4. **Maç lobisi harita modalı:** Cam zeminli modal, üstte "SAHA ADI KONUMU" başlığı + kapat; harita üzerinde tek seçili pin; altta iki buton: "YOL TARİFİ AL" (neon, basınca iOS'ta Apple/Google seçici bottom-sheet) + "Kopyala" ikonu (adres). Bottom-sheet seçiciyi de tasarla (Apple Maps / Google Maps satırları, ikonlu).

5. **Pin seçici (tesis sahibi onboarding adımı):** Tam ekran harita, ortada sabit büyük neon pin (harita pinin altında kayar — Uber pickup deseni); üstte adres kartı: yazılan adres + "adresten bulunan öneri" chip'i (tıklanınca pin oraya uçar); altta büyük CTA "KONUMU ONAYLA". Pin sürüklenirken adres kartının canlı güncellendiği ikinci durum.

**ETKİLEŞİM NOTLARI (prototip için):** Tüm harita geçişleri yumuşak uçuş (flyTo/ease, ~600ms); pin seçimi karuseli o karta kaydırır, karusel kaydırması haritayı pinine uçurur; "Bu alanda ara" chip'i yalnız harita hareket ettikten sonra görünür, aramadan sonra kaybolur; FAB basılınca mavi noktaya uçar ve nokta bir kez "nabız" animasyonu yapar.

**TESLİM:** Yüksek doğruluklu mobil mockup'lar (5 ekran + durumlar) + bileşen sayfası (pin ailesi: normal/seçili/flaş/küme; FAB'lar; chip'ler; karusel kartı; banner'lar). Koyu tema tek varyant (uygulama dark-only).

---
