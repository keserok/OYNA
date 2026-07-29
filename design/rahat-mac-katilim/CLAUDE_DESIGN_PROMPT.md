# Claude Design Promptu — OYNA "Rahat Maç" Katılım & Ödeme Akışı

> Bu dosyanın içeriğini **olduğu gibi Claude Design'a yapıştır.** Aşağıdaki
> "PROMPT BAŞLANGICI" işaretinden sonrası promptun kendisidir.

---

# ═══ PROMPT BAŞLANGICI ═══

Bir mobil uygulama için **tek bir akışın** yüksek çözünürlüklü (hi-fi), etkileşimli
ekran tasarımlarını yapmanı istiyorum. Ürünün adı **OYNA** — Türkiye'de halı saha
maçı organize etme ve maça katılma uygulaması. Mevcut, canlıya yakın bir tasarım
sistemi var; **onu birebir izlemelisin**, yeni bir görsel dil icat etme.

## 1 · Bağlam: OYNA'da maç çeşitleri

OYNA'da bir maçın **üç mentalitesi** var: `Ciddi`, `Taktiksel`, `Rahat`.
Bunlar zorluk değil, **maçın ruhu**dur ve katılım deneyimini belirler:

- **Ciddi / Taktiksel** → oyuncu maça tıklayınca **saha görseli + diziliş ekranı**
  gelir; pozisyon seçip (kaleci, stoper, forvet…) o pozisyonun slotunu satın alır.
  **Bu akış zaten var ve DEĞİŞMİYOR — onu tasarlamıyorsun, ona dokunmuyorsun.**
- **Rahat** → tasarlayacağın şey bu. Diziliş yok, pozisyon yok, saha çizimi yok.
  Oyuncu sadece **"kaç kişilik yer alıyorum ve hangi takımdayım"** kararını verir.

Yani **Rahat bir ekran değil, bir maç çeşididir.** Uygulamanın "Top Oyna" adlı
maç keşif sekmesinde diğer maçlarla aynı listede durur; karta tıklandığında
mentalitesi `Rahat` ise senin tasarladığın yüzey açılır.

**Referans ruh:** Plei (plei.app) uygulamasının maç detay ekranı — doluluk halkası,
kademe çubuğu, kadro listesi, tek büyük "Katıl" butonu. Plei'nin *bilgi mimarisini*
örnek al, ama **görsel dilini değil**: OYNA'nın kendi koyu/neon-yeşil sistemi
kullanılacak (aşağıda).

## 2 · Neyi tasarlayacaksın (9 yüzey)

| # | Yüzey | Not |
|---|---|---|
| **E1** | Top Oyna liste kartı — `Rahat` varyantı | Giriş noktası |
| **E2** | Rahat Maç Detayı — **DURUM** sekmesi | Ana ekran |
| **E3** | Katılım sayfası (bottom sheet): adet + takım seçimi | Ödemeye giden karar |
| **E4** | Rahat Maç Detayı — **HAKKINDA** sekmesi (harita kartı içinde) | |
| **E5** | Katılım sonrası lobi — "rezerve yerlerim" yönetimi | |
| **E6** | Kadro tam → yedek listesi durumu | |
| **E7** | Onboarding: 10 yıldızlı seviye öz-değerlendirme adımı | Zorunlu adım |
| **E8** | Profil ayarları: seviye düzenleme | E7'nin düzenleme hâli |
| **E9** | Admin paneli: Rahat maç lobisi (masaüstü/geniş) | Oyuncuyla aynı kadro dili |

Ödeme ekranının kendisini **tasarlamıyorsun** — o zaten var ve değişmiyor
(bakiye + kart karuseli, tek ekran). Sen sadece ona giden `E3` kararını tasarla.

## 3 · Tasarım sistemi (birebir uy)

**Hedef genişlik:** iPhone içerik alanı ~402px, tek sütun, dikey kaydırma.
Telefon çerçevesi/beze ÇİZME — ekranın kendisi hedeftir. Dokunma hedefleri ≥44px.

### Renkler
| Rol | Hex |
|---|---|
| Uygulama arka planı | `#0A0E14` |
| Yüzey / kart | `#161B22` |
| İkincil yüzey / input | `#0f1419`, `#0f172a` |
| **Birincil neon yeşil** (CTA, başarı, doluluk) | `#39FF14` |
| Yeşil — yumuşak metin | `#8fe87a`, `#70ff56` |
| **RAHAT mentalite çipi** | `#10b981` (Taktiksel `#3b82f6`, Ciddi `#FACC15` — kıyas için) |
| Altın / uyarı | `#FACC15` |
| Mavi — bilgi | `#60A5FA`, `#93c5fd` |
| **Kırmızı — HATA** | `#F87171`, `#EF4444` |
| Metin birincil / ikincil / soluk | `#FFFFFF` · `#D1D5DB`, `#9CA3AF` · `#6B7280`, `#4B5563` |
| Kenarlık | `rgba(255,255,255,0.05 – 0.08)` |

> ⚠️ **Takım renkleri çakışma uyarısı:** Takımlar **BEYAZ TAKIM** ve **KIRMIZI
> TAKIM**. Kırmızı, sistemde **hata rengi**. Bu yüzden kırmızı takımı `#EF4444`
> ile boyamayın — takım kimliği için ayrı, daha koyu/dolgun bir kırmızı seçin
> (öneri `#D93A3A`) ve onu **yalnız küçük forma/yelek ikonu ve ince şerit**
> olarak kullanın; metni beyaz bırakın. Beyaz takım için `#E8EDF4` + ince
> kenarlık. Hata kırmızısı yalnız hata mesajlarına ayrılmış kalmalı.

### Tipografi
- **Gövde / UI:** `Inter` (300–900). Başlık 900, etiket 700–800, gövde 600–700.
- **Rakamlar (doluluk, tutar, saat):** `Space Grotesk` (400–700).
- Ölçek: büyük rakam **40–46px/900** · kart başlığı 20–21px/900 ·
  ekran başlığı 16–17px/900 uppercase `letter-spacing:.16em` ·
  bölüm etiketi 11px/900 uppercase `.14em` `#6B7280` · gövde 12–14px · caption 10–11px.
- **TÜRKÇE BÜYÜK HARF:** `text-transform:uppercase` kullanılan her kök öğeye
  `lang="tr"` ver. Yoksa "İ" harfi bozulur ("KATIL" → "KATIL" doğru, ama
  "İLERİ" → "ILERI" olur). Bu **zorunlu**.

### Radius · Boşluk · Efekt
- Radius: buton `16px` · küçük buton `10–14px` · kart `20–28px` · hero `26px` ·
  input `12–14px` · pill/rozet `9999px`
- Boşluk: ekran yatay padding `20px` · header üst `56px` (status bar) ·
  sabit footer `14px 20px 30px` · kart içi `16–24px` · liste `gap 9–12px`
- CTA glow: `0 0 24–30px rgba(57,255,20,0.22–0.28)`
- Kart gölgesi: `0 10–20px 24–50px rgba(0,0,0,0.3–0.5)`
- Arka plan blur ışıkları: `filter: blur(50–120px)` renkli daireler
- İkonlar: **Lucide** (v0.469 seti). Kullanılacaklar: `arrow-left, x, share,
  map-pin, calendar, clock, users, user-plus, shirt, banknote, footprints,
  navigation, info, lock, check, check-circle, chevron-right, star, alert-triangle,
  hourglass, ticket`

## 4 · Veri sözleşmesi (UYDURMA VERİ YASAK)

Her alanın gerçek bir veri kaynağı var. **Veri yoksa o satırı hiç çizme** —
yanlış/varsayılan bir sayı gösterme. Bu ürünün yazılı ilkesi.

| UI öğesi | Kaynak |
|---|---|
| Maç başlığı, konum, tarih, saat, kişi başı ücret | `matches.title / location / date / time / price` |
| Format (`7v7`), süre (`60 dk`) | `matches.format`, `matches.duration_minutes` |
| Mentalite çipi (`RAHAT`) | `matches.difficulty` |
| Cinsiyet, yaş grubu | `matches.gender`, `matches.ageGroup` |
| Kapak foto karuseli | `pitches.images[]` (yoksa `matches.image`) |
| Mesafe çipi (`1,5 km`) | istemci: kullanıcı konumu × `pitches.coordinates` |
| **Beyaz takım kontenjanı** | `matches.slots[]` (jsonb dizi) |
| **Kırmızı takım kontenjanı** | `matches.awaySlots[]` (jsonb dizi) |
| Doluluk (`10/14`) | iki dizideki `status='TAKEN'` sayısı ÷ toplam eleman |
| Bir yerin durumu | slot nesnesi: `status`, `purchasedBy`, `occupant`, `assignmentStatus` |
| Oyuncu adı + avatar | slot `player.name / player.avatar` |
| **Oyuncu seviye bandı** | `profiles.self_skill` (1–10 öz-beyan) → band'a çevrilir |
| Arkadaş rozeti | `profiles.friends[]` kesişimi |
| Min oyuncu eşiği | `COALESCE(matches.min_players, toplam − 2)` |
| Onay kararı yüzdesi | `settings.min_quorum_pct` (**varsayılan 70, admin değiştirebilir**) |
| Onay penceresi (saat) | `settings.capture_window_hours` (**varsayılan 8, admin değiştirebilir**) |
| İade kademesi | `_pitch_refund_tiers(pitch_id)` → tam `24s`, yarı `6s`, oran `%50` (**tesis override edebilir**) |
| Yedek listesi | `matches.reservePlayers[]` |
| Kaleci / hakem ataması | `matches.gkId` (Beyaz), `matches.awayGkId` (Kırmızı), `matches.refereeId` + `gkStatus/refereeStatus` |
| Ayakkabı kuralı | `matches.footwear_rule` (**yeni kolon**: `CLEATS_OK` / `TURF_SHOES` / boş) |
| Tesis açıklaması + olanaklar | `pitches.description`, `pitches.amenities[]` |
| Harita | `pitches.coordinates` — **yoksa harita kartı HİÇ çizilmez** |

### 4.1 · Seviye bandı (tek dönüşüm kuralı)

`profiles.self_skill` 1–10 öz-beyandır ve **kadroda ham sayı olarak GÖSTERİLMEZ.**
Üç banda indirgenir:

| self_skill | Etiket | Renk |
|---|---|---|
| 1–3 | `BAŞLANGIÇ` | `#60A5FA` (mavi) |
| 4–7 | `ORTA` | `#FACC15` (altın) |
| 8–10 | `İLERİ` | `#10b981` (yeşil) |

Beyan yoksa çip **hiç çizilmez** (boş etiket yerine boşluk).
Ham `7/10` değeri **yalnız iki yerde** görünür: E7 (onboarding, kendi seçimi) ve
E8 (profil ayarı, kendi seçimi).

### 4.2 · Bir "yer"in (slot) beş görsel durumu

Kadro listesindeki her satır bunlardan biridir:

1. **BOŞ** — `status:'OPEN'`. Kesikli çerçeve, soluk `+ Boş yer` metni. Seçilebilir değil (katılım E3'ten yapılır).
2. **DOLU · oyuncu var** — `status:'TAKEN'`, `occupant` var. Avatar + isim + seviye bandı (+ arkadaş rozeti, + `SEN` rozeti).
3. **REZERVE · sahibi dolduracak** — `status:'TAKEN'`, `purchasedBy` var, `occupant` YOK, `assignmentStatus:'RESERVED'`. **Ödenmiş ama kimse oturmuyor.** Avatar yerine kilit ikonu, metin: `Rezerve — {alıcı adı} dolduracak`. Doluluk sayımında **DOLU sayılır**.
4. **LİNK BEKLİYOR** — `assignmentStatus:'LINK_PENDING'`. Kilit + `Davet kodu paylaşıldı` metni.
5. **ATANMIŞ ARKADAŞ** — `assignmentStatus:'ASSIGNED'`. Normal oyuncu satırı + küçük `Davetli` rozeti.

## 5 · Ekran ekran spesifikasyon

### E1 · Top Oyna liste kartı — `Rahat` varyantı

Mevcut maç kartıyla **aynı iskelet**, tek fark: pozisyon/rol çorbası yerine
doluluk dili. Yukarıdan aşağı:

- Sol üstte küçük kapak görseli veya tam genişlik görsel + üzerine gradient
- `RAHAT` çipi (`#10b981`, pill, 10px/900 uppercase)
- Başlık: tesis adı · kort adı
- Satır: `Bugün · 20:00–21:00 · 60 dk · 7v7 · Karma`
- **Doluluk şeridi:** ince yatay bar (dolu kısmı `#39FF14`) + sağında
  `10/14` (Space Grotesk) — ve kalan ≤3 ise **kırmızı** `3 yer kaldı` metni
- Sağ altta kişi başı ücret: `200₺` (büyük, Space Grotesk) — `price=0` ise `ÜCRETSİZ` yeşil çipi
- Sağ üstte mesafe çipi `1,5 km` (konum yoksa çizilmez)

### E2 · Rahat Maç Detayı — DURUM sekmesi ★ ana ekran

Yukarıdan aşağı, tek kaydırma + **sabit alt CTA**:

1. **Foto karuseli** — tam genişlik, ~220px, yatay kaydırmalı (`pitches.images`).
   Üstte şeffaf katman: sol `x` (kapat, 44px daire), sağ `share`. Sağ altta
   mesafe çipi `map-pin 1,5 km`. Alt kenarda nokta göstergesi.
2. **Tesis kimliği** — solda yuvarlak tesis logosu/baş harfi, ortada
   **tesis adı** (20px/900) + altında `@kort adı` (12px `#9CA3AF`),
   sağda **kalan yer** (`3 yer kaldı`, `#F87171`, 13px/800).
   Kalan 0 ise `KADRO TAM` (`#39FF14`).
3. **Sekme çubuğu** — `DURUM` | `HAKKINDA`. Aktif olanın altında 2px `#39FF14`
   çizgi, pasif `#6B7280`. Sadece **iki** sekme (harita HAKKINDA içinde bir kart).
4. **Zaman satırı** — `Bugün öğleden sonra · 20:00 – 21:00` (16px/800 beyaz).
5. **Doluluk bloğu** — yatay iki parça:
   - **Sol: dairesel halka** (~110px). Kalın stroke, dolu yay `#39FF14`, boş yay
     `rgba(255,255,255,.08)`. Ortada `10/14` (28px/900 Space Grotesk) +
     altında `yer dolu` (10px `#6B7280`).
   - **Sağ: bilgi kutusu** (kart, radius 20) — 3 satır, her biri ikon + metin:
     `users` `14 Oyuncu (7v7)` · `shirt` `RAHAT` çipi · `map-pin` `Tesis · Kort`.
6. **KADEME ÇUBUĞU** — bölüm etiketi `DURUM`. Üç düğümlü yatay çizgi:
   `YAYINDA` → `ONAYLANDI` → `KADRO TAM`.
   Geçilmiş düğüm dolu `#39FF14`, aktif düğüm halkalı + üstünde balon
   (`10 oyuncu`), gelecek düğüm soluk `rgba(255,255,255,.15)`.
   Etiketler 10px/800 uppercase; aktif olan `#39FF14`, diğerleri `#6B7280`.
7. **Onay bilgi cümlesi** — ortalanmış, 13px, `#D1D5DB`, kalın kısımlar beyaz:
   > "Maçın onaylanıp onaylanmadığını **saat 12:00**'ye kadar bildireceğiz."

   ⚠️ Bu saat **hesaplanan** bir değerdir (`maç başlangıcı − onay penceresi`),
   sabit değil. Tasarımda `{SAAT}` yer tutucusu olduğu görülsün. Aynı şekilde
   `%70` gibi bir oranı **ekrana yazma** — kullanıcıya yüzde gösterilmiyor.
8. **KADRO** — bölüm etiketi `KADRO` + sağda `user-plus` `Arkadaş Davet Et`
   (outline pill buton). Altında **iki takım bloğu**:

   ```
   ┌ BEYAZ TAKIM                    5/7 ┐   ← başlık: forma ikonu + ad + sayaç
   │  ● Emre K.        ORTA    · Arkadaş │
   │  ● Mert S.        İLERİ             │
   │  🔒 Rezerve — Emre K. dolduracak    │
   │  ⌁ Boş yer                          │   ← kesikli
   └─────────────────────────────────────┘
   ┌ KIRMIZI TAKIM                  5/7 ┐
   │  ● Sen            ORTA    · SEN     │
   │  ...                                │
   └─────────────────────────────────────┘
   ```

   Satır yüksekliği ≥56px. Avatar 40px daire (beyaz takımda ince beyaz halka,
   kırmızı takımda ince `#D93A3A` halka — takım aidiyeti avatardan da okunsun).
   İsim 14px/800; seviye çipi 9px/900 uppercase pill; `Arkadaş` rozeti mavi
   `users` ikonuyla; `SEN` rozeti yeşil.
   Her satırın sağında `⋮` (kendi satırında veya satın aldığın yerlerde aktif).
9. **HİZMETLER** (opsiyonel blok, sadece atanmışsa veya kurucuysan çizilir) —
   `Kaleci (Beyaz): Atanmadı` / `Kaleci (Kırmızı): Atanmadı` / `Hakem: Atanmadı`.
   Kurucuya `Talep Et` bağlantısı. Kimse atanmamış ve kullanıcı kurucu değilse
   blok **hiç çizilmez**.
10. **Sabit alt CTA** — tam genişlik, radius 16, `#39FF14` zemin, siyah metin,
    glow. Metin duruma göre:

| Durum | CTA |
|---|---|
| Boş yer var, katılmadın | `KATIL · 200₺` |
| Ücretsiz maç | `KATIL · ÜCRETSİZ` |
| Kadro tam, katılmadın | `YEDEK LİSTESİNE GİR` (outline, `#FACC15`) |
| Katıldın, rezerve yerin var | `YERLERİ DOLDUR (2)` (outline yeşil) |
| Katıldın, her şey tamam | `MAÇ DETAYINI GÖR` (outline) + altında ince `Maçtan ayrıl` bağlantısı |
| Maç `CONFIRMED`/`LIVE` | CTA pasif + `MAÇ ONAYLANDI` yeşil şerit |
| Maç `CANCELLED` | CTA yok, üstte kırmızı şerit: `Maç iptal edildi — ödemen cüzdanına döndü` |

### E3 · Katılım sayfası (bottom sheet) ★ akışın kalbi

CTA'ya basınca alttan açılan sheet (radius üst 28, `#161B22`, arkası blur).
Yukarıdan aşağı:

1. Tutamaç çizgisi + başlık `MAÇA KATIL` (16px/900 uppercase) + sağ `x`
2. Mini maç özeti tek satır: `Tesis · Kort · Bugün 20:00`
3. **`KAÇ KİŞİ İÇİN YER ALIYORSUN?`** — 1–4 arası **stepper**:
   `−` `2` `+` (ortadaki rakam 36px/900 Space Grotesk).
   Üst sınır = o an açık toplam yer sayısı (`min(4, açık yer)`).
   Altında ince açıklama: `Aldığın fazladan yerlere sonra arkadaşlarını ekleyebilirsin.`
4. **`HANGİ TAKIM?`** — seçtiğin **her yer için ayrı** takım seçimi.
   Adet 1 ise tek satır iki büyük seçenek; adet >1 ise **numaralı satırlar**:

   ```
   1. yer   [ BEYAZ TAKIM  5/7 ]  [ KIRMIZI TAKIM  5/7 ]
   2. yer   [ BEYAZ TAKIM  6/7 ]  [ KIRMIZI TAKIM  DOLU ]   ← dolu olan pasif
   ```

   Seçili seçenek: 1.5px `#39FF14` kenarlık + hafif yeşil glow + `check` rozeti.
   **Dolu takım:** `DOLU` etiketi, %40 opaklık, tıklanamaz, imleç yasak.
   Sayaçlar seçim yapıldıkça **canlı artar** (2 yer beyaza verilirse 5/7 → 7/7 → ikinci satırda beyaz da `DOLU` olur).
5. **Tutar bloğu** — ortalanmış: `400₺` (44px/900 Space Grotesk) +
   altında `2 yer × 200₺` (12px `#9CA3AF`). Ücretsiz maçta `ÜCRETSİZ`.
6. **İade notu** — mavi bilgi kutusu (`#60A5FA` ikon + `rgba(96,165,250,.08)` zemin),
   12px, 3 satır:
   > Kadro dolmazsa veya maç iptal olursa **ödediğin tutarın tamamı** cüzdanına döner.
   > Kendin ayrılırsan iade kademeye tabidir: **{TAM}** saatten fazla varsa tamamı,
   > **{YARIM}–{TAM}** saat kala **%{ORAN}**'ı döner; **{YARIM}** saatten az kala iade yapılmaz.

   ⚠️ `{TAM}/{YARIM}/{ORAN}` **yer tutucudur** (tesis bazlı değişir). Sabit
   "24 saat / %50" yazma — yer tutucu olarak göster.
7. **Sabit CTA** `ÖDEMEYE GEÇ · 400₺` — yeşil, glow.
   Hiçbir takım seçilmediyse pasif (%40 opaklık).

**Hata durumu (aynı sheet içinde, üstte kırmızı şerit):** başka biri aynı anda
o yeri aldıysa → `Seçtiğin yer az önce doldu — takımını güncelle` + sayaçlar
otomatik tazelenir. Ayrı hata ekranı YOK.

### E4 · HAKKINDA sekmesi

Aynı üst kısım (karusel + tesis kimliği + sekmeler) sabit kalır, altı değişir.
Sabit alt CTA **aynen durur**.

1. **2×2 bilgi ızgarası** (4 küçük kart, radius 16, `#0f1419`) —
   her biri ikon + etiket + değer:
   `calendar` `Per 13.03` · `clock` `20:00 – 21:00` · `banknote` `200₺ / kişi` · `map-pin` `Kısa adres`
2. **OYUNCU İHTİYACI** kartı — `Min: 12` / `Maks: 14` (madde işaretli).
   Altında ince not: `Kadro 12 kişiye ulaşmazsa maç iptal olur ve ödemeler iade edilir.`
3. **MAÇ SEVİYESİ** kartı — büyük `RAHAT` çipi (`#10b981`) + iki madde:
   `Keyif odaklı tempo` · `Her seviye oyuncuya açık`
4. **MAÇ TİPİ** kartı — `Karma` · `7v7` · `60 dakika`
5. **AYAKKABI** kartı — `footprints` ikonu +
   `KRAMPON SERBEST` (`CLEATS_OK`) veya `HALI SAHA AYAKKABISI` (`TURF_SHOES`).
   `footwear_rule` boşsa **kart hiç çizilmez.**
6. **TESİS** bloğu — tesis adı + tam adres + `pitches.description` metni
   (3 satır sonra `Devamını gör`), altında **olanak çipleri**
   (duş, otopark, wifi, büfe, krampon kiralama… `pitches.amenities`).
7. **HARİTA KARTI** (bu sekmenin içinde, radius 20) —
   üstte tesis adı + adres + sağda `chevron-right`;
   ayırıcı çizgi; `navigation` `Yol Tarifi Al` satırı;
   altında **mini harita** (~200px, koyu tema, merkezde OYNA pini).
   `pitches.coordinates` yoksa **bu kart tamamen çizilmez** — boş/sahte harita gösterilmez.

### E5 · Katılım sonrası — "rezerve yerlerim" yönetimi

Katılan kullanıcı DURUM sekmesine döndüğünde, KADRO'nun **üstünde** yeni bir kart:

```
┌ SENİN YERLERİN                                    2 yer ┐
│  🔒 Beyaz takım · 1. yerin            [ KENDİNİ EKLE ]  │
│  🔒 Kırmızı takım · 2. yerin          [ ARKADAŞ EKLE ]  │
│                                        [ KOD PAYLAŞ  ]  │
└─────────────────────────────────────────────────────────┘
```

- Kart kenarlığı `#39FF14` %20 opak, zemin hafif yeşil tint.
- Her yer satırında üç eylem (küçük pill butonlar): `Kendini ekle` ·
  `Arkadaş ekle` (arkadaş listesi sheet'i açar) · `Kod paylaş`
  (8 karakterli kod üretir, kopyala + paylaş).
- Bir yer dolduğunda satır yeşil `check` ile kapanır.
- Her satırda ayrıca **`Takımı değiştir`** bağlantısı: karşı takımda boş yer
  varsa yeri oraya taşır (para hareketi yok). Karşı takım doluysa bağlantı pasif
  + tooltip `Karşı takım dolu`.
- Kartın altında ince, tehlikesiz görünümlü `Maçtan ayrıl` bağlantısı
  (`#9CA3AF`). Basınca **onay sheet'i**: kaç yer bırakılacağı, **hesaplanan iade
  tutarı**, ve tam iade penceresi kapandıysa uyarı:
  `Bu saatten sonra ayrılmak güvenilirlik puanını düşürür.`

### E6 · Kadro tam → yedek listesi

- Doluluk halkası `14/14`, tamamı `#39FF14`; ortada `KADRO TAM`.
- Kademe çubuğunda üçüncü düğüm de dolu.
- CTA outline altın (`#FACC15`): `YEDEK LİSTESİNE GİR`.
- Basınca kısa onay sheet'i: **ödeme alınmaz**, sadece sıraya girilir.
  Metin: `Yer açılırsa ilk sana haber vereceğiz. Yerini almak için o an ödeme yapman gerekir.`
- Yedek olan kullanıcıya KADRO'nun altında `YEDEK LİSTESİ` bloğu:
  sıra numarası + avatar + isim (`1. Sen`, `2. Ali T.`…).

### E7 · Onboarding — 10 yıldızlı seviye öz-değerlendirme (zorunlu adım)

Mevcut onboarding koyu, tam ekran, adım adım ilerleyen bir akış (ad → yaş →
oyun stili → konum). Bu **yeni bir adım** ve aynı dile uymalı.

- Üstte adım göstergesi + başlık: `KENDİNİ NASIL DEĞERLENDİRİRSİN?`
- Alt başlık (13px `#9CA3AF`): `Bu, maçlarda seni doğru kadroya yerleştirmemize yardım eder. Sonradan değiştirebilirsin.`
- **10 yıldız** — yatay sırada 10 adet `star`. Seçilene kadar hepsi boş
  (`rgba(255,255,255,.15)`), seçilince 1..n dolu. Dolu yıldız rengi **seçilen banda göre değişir**:
  1–3 mavi `#60A5FA`, 4–7 altın `#FACC15`, 8–10 yeşil `#10b981`.
  Yıldızlar ≥32px dokunma alanı; basınca hafif `scale` + haptik hissi veren pop.
- Yıldızların altında **canlı band kartı**: büyük band adı (`ORTA`, 28px/900,
  band rengi) + seçilen ham değer (`7/10`, Space Grotesk `#6B7280`) +
  bir satır açıklama:
  - `BAŞLANGIÇ` → `Yeni başlıyorum, keyif için oynuyorum.`
  - `ORTA` → `Düzenli oynuyorum, temel becerilerim var.`
  - `İLERİ` → `Deneyimliyim, tempolu maç oynayabilirim.`
- **Dürüstlük notu** (küçük, mavi ikonlu): `Dürüst ol — maçlarda kadro dengesi buna göre kuruluyor.`
- Alt CTA `DEVAM` — **hiçbir yıldız seçilmeden pasif** (bu adım atlanamaz;
  "Atla" bağlantısı KOYMA).

### E8 · Profil ayarları — seviye düzenleme

Mevcut profil düzenleme sheet'inde (Pozisyon / Doğum Tarihi / Cinsiyet /
Oyun Stili / Kısa Tanıtım alanları var) **yeni bir alan**:

- Etiket: `SEVİYEN` (10px/900 uppercase `#6B7280`)
- E7'nin **kompakt hâli**: tek sırada 10 küçük yıldız (24px) + sağda band çipi
- Altında ince metin: `Şu an: ORTA (7/10)`
- Değişiklik anında kaydedilir (ayrı "kaydet" butonu yok, sheet'in genel kaydına bağlı)

### E9 · Admin paneli — Rahat maç lobisi (geniş ekran)

Admin paneli koyu tema, veri-yoğun, masaüstü genişliğinde. Rahat maç lobisi
**oyuncunun gördüğü kadro dilinin aynısını** kullanır — ikinci bir gerçeklik yok.

- Üstte maç künyesi şeridi: başlık · tesis/kort · tarih/saat · `RAHAT` çipi ·
  durum çipi (`YAYINDA`/`ONAYLANDI`/`İPTAL`) · doluluk `10/14` · kişi başı ücret.
  Her alan **satır içi düzenlenebilir** (kalem ikonu).
- Ana alan **iki kolon**: `BEYAZ TAKIM` | `KIRMIZI TAKIM`. Aynı beş satır durumu
  (BOŞ / DOLU / REZERVE / LİNK BEKLİYOR / ATANMIŞ).
- Her satırda admin aksiyonları: `Çıkar (iade ile)` · `Takımı değiştir`
- Sağda dar panel: `min oyuncu eşiği`, `onay saati`, `yedek listesi`,
  `ödeme özeti` (kaç kişi ödedi, toplam tahsilat, iade edilen).
- Alt aksiyon satırı: `Maçı iptal et (tam iade)` (kırmızı outline) ·
  `Yayından kaldır`
- **Saha çizimi / diziliş görseli YOK** — Rahat maçta admin de kadro listesi görür.

## 6 · Durumlar ve kenar durumlar (hepsini çiz)

Her ekran için bu varyasyonları ayrı kare olarak ver:

1. **Boş kadro** — `0/14`, halka tamamen boş, kademe çubuğu ilk düğümde
2. **Az yer kaldı** — `11/14`, kırmızı `3 yer kaldı`
3. **Kadro tam** — `14/14` + yedek CTA
4. **Ücretsiz maç** — `price = 0`, CTA `KATIL · ÜCRETSİZ`, tutar bloğu `ÜCRETSİZ`
5. **Katıldın + rezerve yerin var** — E5 kartı görünür
6. **Onaylandı** — `CONFIRMED` yeşil şerit, CTA pasif
7. **İptal** — kırmızı şerit + iade cümlesi, CTA yok
8. **Eksik veri** — koordinat yok (harita kartı yok), `footwear_rule` yok
   (kart yok), `duration_minutes` yok (süre etiketi yok), tesis fotoğrafı yok
   (karusel yerine düz gradient + tesis baş harfi)
9. **Bir takım dolu** — E3'te `KIRMIZI TAKIM · DOLU` pasif hâli
10. **Yarış hatası** — E3'te üstte kırmızı şerit + tazelenmiş sayaçlar
11. **Yükleniyor** — kadro satırları için iskelet (shimmer) hâli

## 7 · YAPMAYACAKLARIN (bunlar bilinçli kararlar)

- ❌ **Saha çizimi, diziliş, pozisyon seçimi, pozisyon rozeti YOK.** Rahat maçta
  kimse "stoper" değildir. `KL / DEF / ORT / FOR` gibi hiçbir etiket çizme.
- ❌ **Yıldızlı oyuncu puanı, 0–5 puan, OVR sayısı, gold/silver/bronze kart
  seviyesi YOK — hiçbir ekranda.** Bu sistem uygulamadan tamamen sökülüyor.
  Kadroda oyuncunun yanında **yalnız seviye bandı** (BAŞLANGIÇ/ORTA/İLERİ) durur.
  E7/E8'deki yıldızlar **oyuncunun kendi beyanı** içindir, başkasını puanlamak
  için değil — o yıldızlar başka hiçbir ekranda görünmez.
- ❌ **Minimum puan barajı YOK.** "Bu maç en az 4.0 puan istiyor" gibi bir çip,
  kilit ya da uyarı çizme.
- ❌ **Grup sohbeti YOK.** Başlıkta mesaj/sohbet ikonu çizme.
- ❌ **"Blokaj", "ön provizyon", "escrow" kelimeleri YOK.** Rahat maçta dil
  **"ödeme"**dir (kapora dili yalnız saha kiralamada kullanılır).
- ❌ **Hizmet bedeli / komisyon ayrı satır olarak GÖSTERİLMEZ** — tutara gömülü.
- ❌ **Sabit rakam yazma:** onay penceresi (8s), quorum (%70) ve iade kademesi
  (24s/6s/%50) admin ve tesis tarafından değiştirilebilir. Tasarımda bunlar
  `{SAAT}`, `{TAM}`, `{ORAN}` gibi **yer tutucu** olarak görünsün.
- ❌ **Uydurma veri YOK.** Bir alanın verisi yoksa "—", "90 dakika", "Ordu
  merkezi" gibi varsayılan basma; o öğeyi **hiç çizme**.
- ❌ Telefon çerçevesi/beze çizme.

## 8 · Teslim beklentim

- Her yüzey (E1–E9) için **piksel-hassas hi-fi** kare; E2/E3/E4 için ayrıca
  bölüm 6'daki durum varyasyonları.
- **E2 → E3 → (ödeme) → E5** akışının **etkileşimli** prototipi: sekme geçişi,
  sheet açılışı, adet stepper'ı, takım seçimi + canlı sayaç, dolu takımın
  pasifleşmesi, CTA metninin duruma göre değişmesi gerçekten çalışsın.
- Tüm stiller **satır içi (inline)** yazılsın; renk/boşluk/tipografi değerleri
  kaynaktan doğrudan okunabilir olsun (geliştirici bunları React + Tailwind'e
  taşıyacak).
- Uppercase kullanılan her kök öğede `lang="tr"` bulunsun.
- Kısa bir **handoff notu**: her ekranın hangi veri alanına bağlandığı
  (bölüm 4'teki tabloyu doldurarak) + tanımladığın yeni token'lar.

# ═══ PROMPT SONU ═══

---

## Ek: Bu tasarım kabul edildiğinde gerekecek backend işleri

*(Claude Design'a gönderilmez — kendi takip listen için.)*

### Yeni şema
1. `profiles.self_skill smallint CHECK (self_skill BETWEEN 1 AND 10)` — onboarding'de zorunlu
2. `matches.footwear_rule text CHECK (footwear_rule IN ('CLEATS_OK','TURF_SHOES'))`

### Rahat maç slot üretimi
`create_match_atomic` / `_default_formation_slots`: `difficulty='Rahat'` ise
**pozisyonsuz** slot üret — `role` boş/`'OYUNCU'`, `x/y` yok. `slots` = Beyaz,
`awaySlots` = Kırmızı. Kapasite = format başına kişi (7v7 → 7 + 7).
Doluluk, `min_players`, quorum, kapora capture matematiği **aynen çalışır**.

### Takım taşıma (yeni RPC)
`player_move_slot_team(p_match_id, p_slot_id, p_target_side)` — yalnız
`purchasedBy = auth.uid()`, hedef tarafta `OPEN` yer varsa, `FOR UPDATE` kilitli,
para hareketi yok.

### Rating sistemi sökümü (F1=a kapsamı)
**Sökülecek:** `profiles.rating`, `profiles.ratings_history`,
`player_ratings.skill_score`, `utils/ratingScale.ts` (`ratingToOverall`,
`tierForOverall`, `tierForRating`), `matches.minRating`,
`assert_match_min_rating` + **8 çağrı noktası**, `PlayerCardData.overall/tier`,
admin panelindeki `rating` düzenleme alanları, `MatchListing.minRating`,
`Player.rating`, `CurrentUserProfile.rating`, Top Oyna'daki puan çipleri.

**Korunacak (dokunulmaz):** `pitches.rating` + `googleRating` +
`submit_pitch_rating` (saha vitrini) · `goalkeepers.rating` / `referees.rating` +
`submit_service_rating` (**sağlayıcı payout'unu tetikliyor**) ·
`profiles.reliability_score` + `player_ratings.fair_play_score`
(ayrılma yaptırımı, kaptan devri).

**Açık bağımlılık:** F3=b ile kart OVR'ı ve gold/silver/bronze seviyesi kalkıyor →
`components/PlayerCard.tsx` ve `views/onboarding/PlayerCardReveal.tsx` yeniden
tasarım gerektirir. Bu, `PostMatchEval` yeniden tasarımıyla birlikte ele alınacak
(kullanıcı o tasarımı ayrıca verecek) — bu prompt kapsamında değil.
