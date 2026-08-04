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
| `views/studio/sampleTactic.ts` | "Örnek taktiği yükle" içeriği |
| `views/studio/shareImage.ts` | Taktik görseli üretme/indirme |
| `views/studio/tacticLibrary.ts` | Taktik kütüphanesi süzme/sıralama |
| `services/tacticSocialService.ts` | Taktiğin kaydı, paylaşımı, onayı |
| `tests/unit/components/Studio*.test.tsx` | Stüdyo birim testleri |
| `tests/unit/studio*.test.ts`, `tests/unit/sampleTactic.test.ts`, `tests/unit/tacticLibrary.test.ts` | Stüdyo yardımcı testleri |
| `tests/e2e/studio.hermetic.spec.ts` | Uçtan uca stüdyo testi |

> Not: `views/Studio.tsx`, sistem haritasında **B15 · SOSYAL** yapı taşına
> bağlıdır ve risk seviyesi **ORTA**'dır (kritik değil). Yani para, kimlik ve
> erişim kurallarına dokunmaz.

---

## 5. Kayıtlar

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
