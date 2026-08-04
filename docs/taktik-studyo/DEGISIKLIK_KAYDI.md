# Taktik Stüdyo — Değişiklik Kaydı

Bu dosya, **Taktik Stüdyo'da yapılan her değişikliğin defteridir.**
Amaç tek: aylar sonra bile "burada ne, ne zaman, neden değişti" sorusunun
tek bir yerden ve kod okumadan yanıtlanabilmesi.

---

## 1. Bu defter ne işe yarar?

Üç işe yarar:

1. **Hafıza.** Stüdyoda bir şey değiştiğinde buraya yazılır. Bir sonraki
   oturum (yeni bir Claude oturumu da olabilir) önce buraya bakar; aynı işi
   ikinci kez baştan konuşmaz, daha önce verdiğin kararı bozmaz.
2. **Temiz aktarım.** "Sadece stüdyoda yaptıklarını şu dala aktar" dediğinde,
   hangi dosyaların hangi bölümlerine dokunulduğu buradan okunur. Fazlası
   taşınmaz, eksiği kalmaz.
3. **Güvenlik ağı.** Bir değişiklik istediğin gibi olmazsa, hangi kaydın geri
   alınacağı bellidir — komşu işler zarar görmez.

---

## 2. Değiştirmeyecek olan kurallar

Bu bölüm, stüdyoda çalışan her oturumun uyacağı sözdür.

**K1 — Sadece istenen değişir.**
Stüdyo görevinde stüdyo dışındaki dosyalara dokunulmaz. Yol üstünde başka bir
sorun görülürse düzeltilmez; özetin "fark ettiklerim" bölümünde yazılır.

**K2 — Var olan hiçbir şey bozulmaz, eskiye döndürülmez.**
Daldaki mevcut işler korunur. Bir buton, bir metin ya da bir davranış
*görevin kendisi bunu istemiyorsa* olduğu gibi kalır. "Bu arada şunu da
düzelteyim" yoktur.

**K3 — Her değişiklik buraya yazılır.**
Aşağıdaki "Kayıtlar" bölümüne, aşağıdaki şablonla, değişiklikle **aynı commit
içinde** yazılır. Kayıtsız değişiklik yapılmış sayılmaz.

**K4 — Aktarım kaydın kendisinden yapılır.**
"Şu değişiklikleri aktar" dendiğinde uydurma yapılmaz: aşağıdaki kayıtta yazan
commit numaraları ve dosya listesi kullanılır. Kayıtta olmayan hiçbir şey
aktarılmaz.

**K5 — Bitirmeden önce kontrol.**
`npm run lint` ve `npm run test:unit` temiz olmadan hiçbir kayıt "tamam"
sayılmaz. Kırılan bir şey varsa gizlenmez, sade dille söylenir.

---

## 3. Kayıt şablonu

Yeni bir değişiklik yapan oturum, "Kayıtlar" bölümünün **en üstüne** şunu ekler:

```
### YYYY-AA-GG · Kısa başlık

- **Ne istendi:** (kullanıcının kendi cümlesi)
- **Ne yapıldı:** (sade dille, madde madde)
- **Dokunulan dosyalar:** (tam yol + hangi bölüm)
- **Korunanlar:** (bilerek elle tutulmayan, aynı bırakılan şeyler)
- **Nasıl kontrol edersin:** (uygulama içinde tıklama adımlarıyla)
- **Commit:** (kısa numara — commit kendi numarasını içeremediği için
  değişiklik commit'lendikten SONRA küçük bir ek commit ile doldurulur)
- **Geri alınırsa:** (ne olur, neyi etkiler)
```

---

## 4. Stüdyonun dosyaları

Aktarım yaparken sınır bu listedir. Bunların dışına çıkan bir değişiklik
"stüdyo değişikliği" değildir:

| Dosya | Ne yapar |
|---|---|
| `views/Studio.tsx` | Stüdyonun kendisi: saha, araç çubuğu, planlar, kaydetme |
| `views/studio/AdvancedAnimationModule.tsx` | Oynatma kontrolleri + top animasyonu |
| `views/studio/types.ts` | Ortak tipler, tempo ayarları |
| `views/studio/pitchGeometry.ts` | Çizgi ve sıra hesapları |
| `views/studio/layering.ts` | BİZ/RAKİP katman kuralları |
| `views/studio/perf.ts` | Zayıf cihazda süsü kısma |
| `views/studio/shareImage.ts` | Taktik görseli üretme/indirme |
| `views/studio/tacticLibrary.ts` | Taktik kütüphanesi süzme/sıralama |
| `services/tacticSocialService.ts` | Taktiğin kaydı, paylaşımı, onayı |
| `tests/unit/components/Studio*.test.tsx` | Stüdyo birim testleri |
| `tests/unit/studio*.test.ts`, `tests/unit/tacticLibrary.test.ts` | Stüdyo yardımcı testleri |
| `tests/e2e/studio.hermetic.spec.ts` | Uçtan uca stüdyo testi |

> Not: `views/Studio.tsx`, sistem haritasında **B15 · SOSYAL** yapı taşına
> bağlıdır ve risk seviyesi **ORTA**'dır (kritik değil). Yani para, kimlik ve
> erişim kurallarına dokunmaz.

---

## 5. Kayıtlar

### 2026-08-04 · Oynat/Durdur artık anlık ve eşzamanlı (oyuncular topla aynı motora alındı)

- **Ne istendi:** "Oynat ve durdur butonunun fonksiyonlarının mükemmel
  çalışmasını, yani anlık oynatmalarını ve durdurmalarını sağla. Herhangi bir
  animasyon bozulması problem çıkma ihtimalinin olmamasını sağlayarak kodları
  titizce yaz."

- **Bulunan iki hata (kullanıcı "mükemmel çalışsın" derken bunları tarif ediyordu):**
  1. **DURDUR yarım çalışıyordu.** Top ve bitiş sayacı bir motorla (CSS), oyuncular
     başka bir motorla (framer-motion) sürülüyordu. İkincisinde "olduğu yerde
     dondur" özelliği yok — DURDUR'a basınca **top duruyor, oyuncular yürümeye
     devam ediyordu.**
  2. **Tur sayıları tutmuyordu.** Oyuncular rotayı **iki tur**, top ve bitiş
     sayacı **bir tur** koşuyordu. Buton "TEKRAR OYNAT"a döndüğünde oyuncular
     hâlâ hareket hâlindeydi.

- **Ne yapıldı:**
  - **Oyuncular topla aynı motora alındı.** Koşu rotası artık CSS `@keyframes`
    ile sürülüyor; DURDUR hepsini `animation-play-state: paused` ile **aynı anda
    olduğu yerde** donduruyor, OYNAT **kaldığı yerden** devam ettiriyor.
  - **Herkes bir tur koşuyor.** Top, oyuncular ve bitiş sayacı aynı süreyi
    paylaşıyor; birlikte başlayıp birlikte bitiyor. Tur bitince buton
    "TEKRAR OYNAT" oluyor ve sahada gerçekten hareket kalmıyor.
  - Hareketin **zamanlaması değişmedi**: SIRALI'da her çizgi yine yalnız kendi
    penceresinde ilerliyor, penceresinden önce başlangıçta, sonra bitişte
    bekliyor; EŞZAMANLI'da rota yine eşit aralıklarla kat ediliyor. Yalnız
    hareketi **süren motor** değişti.
  - Eski hesap fonksiyonu (`getAnimationProps`) artık hiçbir yerde kullanılmadığı
    için kaldırıldı; testleri yeni fonksiyona (`getPlayerCssAnimation`) taşındı.
  - Kullanılmayan `PLAY_TIMES` sabiti silindi (tanımlıydı ama hiç çağrılmıyordu —
    "iki tur" niyetini anlatıyordu, gerçekte hiçbir şeyi sürmüyordu).

- **Dokunulan dosyalar:**
  - `views/studio/AdvancedAnimationModule.tsx` — `getPlayerCssAnimation` (yeni,
    saf fonksiyon) eklendi; `getAnimationProps` kaldırıldı. Top animasyonu,
    sekans rozetleri ve oynatma kontrollerine dokunulmadı.
  - `views/Studio.tsx` — oyuncu/rakip markörleri CSS animasyonuna bağlandı;
    `PLAY_TIMES` silindi. Çizim, kaydetme ve paylaşma mantığı aynı.
  - `tests/unit/advancedAnimation.test.ts` — yeni fonksiyonun zamanlamasını
    kilitleyen 9 test.
  - `tests/e2e/studio.hermetic.spec.ts` — gerçek tarayıcıda 2 yeni test.

- **Korunanlar:**
  - Hareketin görünen yolu, hızı ve tempo ayarı aynı.
  - OYNAT / DURDUR / DEVAM / TEKRAR OYNAT düğme akışı aynı.
  - Topun görünürlük penceresi, sekans rozetleri, BİZ/RAKİP katmanları aynı.
  - Simülasyondan çıkınca oyuncular eskisi gibi yerlerine dönüyor.

- **Kontroller:** `npm run lint` temiz · `npm run test:unit` 1444 test yeşil ·
  `npm run test:e2e:studio` 8 test yeşil · `npm run build` başarılı.
  Gerçek tarayıcıda ölçüldü: DURDUR'dan sonra oyuncunun konumu **değişmiyor**;
  DEVAM'dan sonra yeniden ilerliyor; tur bitince hareket **duruyor**.

- **Nasıl kontrol edersin:**
  1. **Sosyal → TAKTİK STÜDYO** aç, bir oyuncudan uzun bir **KOŞU** çiz.
  2. **OYNAT**'a bas → oyuncu yürümeli.
  3. Ortasında **DURDUR**'a bas → oyuncu **anında ve olduğu yerde** durmalı
     (eskiden yürümeye devam ediyordu).
  4. **DEVAM**'a bas → kaldığı yerden ilerlemeli.
  5. Sonuna kadar bekle → buton **TEKRAR OYNAT** olduğunda sahada hareket
     kalmamalı (eskiden oyuncular ikinci tura başlıyordu).
  6. Birkaç pas da çizip tekrar dene: top ve oyuncular **birlikte** durup
     **birlikte** devam etmeli.

- **Commit:** `a613b62` (kod + kayıt)

- **Geri alınırsa:** DURDUR yine yalnız topu dondurur, oyuncular yürümeye devam
  eder ve rotayı iki tur yürür. Kayıtlı taktik verisine dokunmaz — veri kaybı olmaz.

### 2026-08-04 · Başlık sadeleşti, örnek taktik kalktı, koşu kuralı ve seçerek temizleme geldi

- **Ne istendi:** "Üst başlıktaki plan/2-3-1 kısımlarını sil, sadece Stüdyo yaz.
  Örnek taktiği sil. Koşular oyuncudan çekilmediyse oluşmasın, sahanın üstünde
  kırmızı bildirim geçsin. Sıralama sayıları sol tarafta kayboluyor, saha içinde
  kalsın. Temizlemede tek tek seçip silinebilsin."

- **Ne yapıldı:**
  - **Başlık:** Artık sabit **"Stüdyo"** yazıyor. Plan adı ve "2-3-1 · 7v7"
    satırı başlıktan kalktı. Plan adını değiştirme yolu duruyor: plan kartındaki
    kalem simgesi ya da karta çift dokunma.
  - **Örnek taktik tamamen kaldırıldı:** boş tahtadaki "Örnek taktiği yükle"
    daveti, taktiği üreten dosya ve testleri silindi. Yerine başka bir öneri
    konmadı — tanıtım ekranı zaten araçların tamamını anlatıyor.
  - **Koşu kuralı:** KOŞU artık bir **oyuncudan başlamak zorunda**. Boş sahadan
    çizilmeye çalışılırsa çizgi **oluşmaz** ve sahanın hemen üstünde kırmızı
    uyarı belirir. Doğru bir koşu çizilince uyarı kalkar. Uyarı bir stüdyo
    oturumunda **en fazla iki kez** gösterilir — kural yine geçerlidir, yalnız
    mesaj susar. KOŞU aracından çıkılınca da uyarı kalkar (mesaj yalnız o araç
    seçiliyken anlamlı). PAS'a dokunulmadı: boş alana pas serbest.
  - **Koşu tutunma alanı genişletildi** (saha yüzdesi 5 → 9). Kural zorunlu
    olduğu için dar alan çizmeyi imkânsızlaştırıyordu. PAS'ın alanı aynı kaldı.
  - **Sıra numarası paneli saha içinde kalıyor:** rozet sol üçte birdeyse panel
    sağa doğru, sağ üçte birdeyse sola doğru açılıyor; alt kenardaki rozetlerde
    yukarı açılıyor. Numara çoksa panel **iki satıra** iniyor, daha da çoksa
    kendi içinde kayıyor. (Numaralar eskisi gibi yalnız SIRALI oynatmada çıkar.)
  - **Temizlemede seçerek silme:** "Sadece çizimler" ve "Sadece rakipler" artık
    doğrudan silmiyor; içeriği **listeliyor**. Satırlara dokunup işaretliyorsun,
    alttaki **"Seçilenleri sil (n)"** ile kaldırıyorsun. Aynı listede
    "Tümünü işaretle" ve "Hepsini sil (n)" de var; geri oku ana menüye döner.
    Bir rakip silindiğinde ona bağlı çizimler de gidiyor (tekli silmeyle aynı).

- **Dokunulan dosyalar:**
  - `views/Studio.tsx` — başlık, örnek taktik kaldırma, koşu kuralı + uyarı,
    temizle sayfası seçim akışı.
  - `views/studio/AdvancedAnimationModule.tsx` — yalnız sıra numarası panelinin
    konumu ve satır kaydırması. Animasyon hesaplarına dokunulmadı.
  - `views/studio/sampleTactic.ts` — **silindi**.
  - `tests/unit/sampleTactic.test.ts` — **silindi**.
  - `tests/unit/components/StudioClearPick.test.tsx` — **yeni** (başlık + seçerek silme).
  - `tests/unit/components/StudioOnboarding.test.tsx` — örnek taktik testi,
    "davet çıkmamalı" testine dönüştü.
  - `tests/e2e/studio.hermetic.spec.ts` — koşu kuralı için 2 yeni test; mevcut
    çizim testi artık oyuncudan başlıyor.

- **Korunanlar:**
  - PAS davranışı, pas zinciri ve tutunma alanı aynı.
  - Sunum modu başlığı ("Sunum · Sadece Hareket") aynı.
  - Plan kartları, diziliş/boyut seçicileri, kaydetme ve paylaşma aynı.
  - "Seçili ögeyi sil" ve "Hepsini sil" yolları duruyor.
  - Numaralar hâlâ yalnız SIRALI oynatmada; eşzamanlıda çıkmıyor.

- **Kontroller:** `npm run lint` temiz · `npm run test:unit` 1439 test yeşil ·
  `npm run test:e2e:studio` 6 test yeşil.

- **Nasıl kontrol edersin:**
  1. **Sosyal → TAKTİK STÜDYO** aç. Üstte sadece **"Stüdyo"** yazmalı.
  2. Boş tahtada **örnek taktik daveti çıkmamalı**.
  3. **KOŞU**'ya bas, **boş bir yerden** parmağını çek → çizgi oluşmamalı,
     sahanın üstünde **kırmızı uyarı** çıkmalı.
  4. Şimdi **bir oyuncunun üzerinden** çek → çizgi oluşmalı, uyarı kaybolmalı.
  5. Birkaç çizim yap, **sıralı oynatma** simgesine geç, **sol kenardaki** bir
     numaraya dokun → sıralama paneli saha içinde, sağa doğru açılmalı.
  6. **Çöp kutusu → Sadece rakipler** → liste açılmalı; birkaçını işaretle →
     **"Seçilenleri sil"** → yalnız işaretlediklerin gitmeli.

- **Commit:** `f6b90ac` (kod + kayıt)

- **Geri alınırsa:** Başlıkta plan adı ve diziliş geri gelir, koşu her yerden
  çizilebilir olur, temizleme yine topluca siler. Kayıtlı taktik verisine
  dokunmaz — veri kaybı olmaz.

### 2026-08-04 · Araç çubuğu tek satırdan 3 satıra bölündü + araç ipucu eklendi

- **Ne istendi:** "Taşı koşu pas sadece hareket gibi butonların olduğu satırı
  parçalara bölmek istiyorum, hepsi ekranda görünür olmalı, 3 satıra bölelim."
  Ayrıca: seçili aracın ne yaptığını anlatan bir ipucu satırı.

- **Ne yapıldı:**
  - Araç çubuğu, yan yana kayan tek satır olmaktan çıktı; **işe göre üç satıra**
    ayrıldı. Satırların arasında ince gri ayraç çizgisi var:
    - **1. satır — ÇİZİM:** `TAŞI` · `KOŞU` · `PAS` üçü eşit genişlikte, satırı
      tam dolduruyor; hangisinin açık olduğu bir bakışta belli. Satırın sonunda
      **sadece-hareket** (göz) düğmesi — çizgileri gösterir/gizler.
    - **2. satır — TAKIM:** solda `BİZ | RAKİP` anahtarı ve rakibi sahaya dizen
      **kılıç** düğmesi; sağa yaslı `geri al` · `yinele` · `temizle`.
    - **3. satır — OYNATMA:** `OYNAT` · **top** göster/gizle ·
      **sıralı/eşzamanlı** · `TEMPO n`.
  - Yer kazanmak için şu düğmeler yazısız, yalnız simgeli hale geldi: top,
    sıralı/eşzamanlı, sadece-hareket, temizle, geri al, yinele, rakibi diz ve
    oynatmadan çık. Ne yaptıkları `title` ve `aria-label` ile korundu; durumları
    renkten okunuyor (top açıkken turuncu, sıralı oynatmada mor, sadece-hareket
    açıkken yeşil).
  - "Rakibi sahaya diz" düğmesindeki **RAKİP yazısı kaldırıldı** (kılıç simgesi
    kaldı): hemen yanındaki anahtarda zaten "RAKİP" yazıyordu, yan yana iki ayrı
    "RAKİP" düğmesi kafa karıştırıyordu.
  - **Araç ipucu satırı** eklendi: 1. satırın hemen altında, seçili aracın ne
    yaptığını tek cümleyle yazıyor (ör. "KOŞU seçili — bir oyuncudan başlayıp
    parmağınla hareket çizgisini çek"). Araç değişince yazı da değişiyor.
  - **Sığma ölçüldü.** Gerçek tarayıcıda 360 px (dar Android), 375 px (iPhone SE)
    ve 390 px (iPhone 12/13) genişliklerinde; hem boş tahtada, hem çizim varken,
    hem de taktik oynarken (en kalabalık hal) üç satırın da **taşmadığı**
    doğrulandı. Yana kaydırma gerekmiyor.

- **Dokunulan dosyalar:**
  - `views/Studio.tsx` — yalnız araç çubuğu bölümü (JSX) ve yeni `TOOL_HINTS`
    sabiti. Çizim/kaydetme/oynatma mantığına dokunulmadı.
  - `views/studio/AdvancedAnimationModule.tsx` — yalnız `AnimationToolbar`
    içindeki üç butonun görünümü (yazı → simge). Animasyon hesapları aynı.
  - `docs/taktik-studyo/DEGISIKLIK_KAYDI.md` — bu defter (yeni).

- **Korunanlar:**
  - Hiçbir buton silinmedi, hiçbir buton eklenmedi — yalnız yerleri, boyutları
    ve bir kısmının yazısı değişti.
  - Tüm `title` metinleri aynı kaldı (testler ve ekran okuyucular bunlara bakıyor).
  - `TEMPO n`, `TAŞI`, `KOŞU`, `PAS`, `OYNAT/DURDUR/DEVAM` yazıları aynı kaldı.
  - Butonların ne yaptığı, hangi durumda açık/kapalı olduğu değişmedi.
  - Çizim, kaydetme, paylaşma, oynatma ve BİZ/RAKİP katman mantığına
    dokunulmadı — yalnız görünüm (JSX + sınıflar).

- **Kontroller:** `npm run lint` temiz · `npm run test:unit` 1437 test yeşil ·
  `npm run test:e2e:studio` 4 test yeşil.

- **Nasıl kontrol edersin:**
  1. Uygulamayı aç → alt menüden **Sosyal** → **TAKTİK STÜDYO**.
  2. Araç çubuğunun **üç satır** olduğunu ve hiçbir butonun ekran dışında
     kalmadığını gör (yana kaydırman gerekmemeli).
  3. **KOŞU**'ya bas → hemen altındaki ipucu yazısının değiştiğini gör.
     **TAŞI**'ya bas → yazı yine değişmeli.
  4. Sahada bir çizgi çiz → 3. satırda **OYNAT** butonunun belirdiğini gör.
  5. **BİZ | RAKİP** anahtarına ve **RAKİP** butonuna bas → eskisi gibi
     çalıştığını doğrula.

- **Commit:** `916d01f` (kod + kayıt). Bu satırın kendisi bir sonraki
  küçük commit ile dolduruldu — bir commit kendi numarasını içeremez.

- **Geri alınırsa:** Araç çubuğu eski haline, tek satır yan yana kayan
  düzene döner ve ipucu yazısı kaybolur. Taktiklerin, planların ve kayıtlı
  verinin hiçbiriyle ilgisi yok — veri kaybı olmaz.
