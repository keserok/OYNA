# Plan Belgesi Neden ve Nasıl Güncellenecek

> Bu belge teknik değildir. Kod bilgisi gerektirmez.
> Amacı tek şey: **çözüm planının hangi bölümleri artık yanlış, neden yanlış ve
> yerine ne yazılacak** — bunu sade dille anlatmak.

---

## 1. Durum tek cümleyle

Çözüm planı (`OYNA-COZUM-PLANI.md`, 25 bin satır) **sen kararlarını vermeden önce**
yazıldı. Sonra 4 karar verdin ve o kararlar planın bazı bölümlerini geçersiz kıldı.
Plan hâlâ, senin "böyle olmayacak" dediğin ürünü anlatıyor.

Sorun şu: plan bir yol haritası. İçinde yanlış yön tarif eden bir bölüm kalırsa,
o bölümü uygulayan kişi yanlış şeyi inşa eder.

---

## 2. Verdiğin kararlar

| # | Karar | Ne değişti |
|---|---|---|
| **K1** | İade parası cüzdana gider, oradan %5 kesintiyle bankaya çekilebilir. Karta iade yok. | Para "uygulama içinde mahsur" olmaktan çıktı |
| **K2** | Maç skorunu yalnızca **hakem veya saha sahibi** girer. Kaptan ve oyuncular giremez. Skor ancak maç bittikten sonra girilir. | Skor artık bir "mutabakat" değil, bir "otorite kaydı" |
| **K3** | Kaptan/kadro işleri (IP-14) ertelendi | O pakete bağlı işler askıya alındı |
| **K4** | Tesis sahibi tarafı ileride ayrı uygulama olabilir | Tesis tarafına yapılacak büyük yatırımlar bekletilmeli |

Buna bir de şu gerçek eklendi: **uygulama henüz canlı değil.** Gerçek kullanıcı yok,
veritabanında 6 maç var ve hepsi demo. Bu, "neyi önce yapmalıyız" sorusunun cevabını
baştan değiştiriyor.

---

## 3. Önemli: işin bir kısmı ZATEN YAPILDI

Plan güncellemesine geçmeden önce bunu bilmen gerekiyor, çünkü belgede "yapılacak"
diye duran bazı işler **bitti**:

| Ne yapıldı | Durum |
|---|---|
| K2 skor modeli — saha sahibi yetkisi onarıldı, maç bitiş zamanı tanımlandı, skorsuz maç dürüstleştirildi | ✅ Canlıya uygulandı |
| K1 para modeli — cüzdan/%5 çekim, güvenlik kapıları | ✅ Canlıya uygulandı (çekim özelliği kapalı bekliyor) |
| K1 arayüz — tek cüzdan bakiyesi, çekim akışı | ✅ Yapıldı |
| Sözleşmeler — karta iade vaadi kaldırıldı, cüzdan maddesi yazıldı | ✅ Yapıldı (avukat onayı bekliyor) |

**Yani plan belgesindeki güncelleme çoğunlukla "kod yaz" değil, "metni gerçeğe
uydur" işi.** Belge şu an yapılmış işi anlatmıyor.

---

## 4. Güncellenecek bölümler — konu konu

17 ayrı yer var. Tek tek saymak yerine **5 konu** altında toplayacağım; her konu
kendi içinde tutarlı bir iş.

---

### KONU A — Skor bölümleri (en büyük iş)

**İlgili bölümler:** 7.3.2, 7.3.3, 7.3.4, 6.2 §2.12, 6.3 §2, 7.3.6, 4.2

**Planda şu an ne yazıyor:**
Plan, skor için şöyle bir sistem tarif ediyor: *kaptan skoru bildirir → 30 dakika
kimse itiraz etmezse otomatik onaylanır → itiraz olursa üç kişilik mutabakat
aranır.* Oyuncuların skoru onayladığı ekranlar, itiraz düğmeleri, mutabakat
sayaçları... hepsi ayrıntısıyla yazılmış.

**Neden geçersiz:**
Sen "skoru yalnızca hakem veya saha sahibi girer" dedin. Bu modelde kaptanın
bildirimi, oyuncunun onayı, mutabakat sayacı diye bir şey **yok**. Planın bu
bölümü baştan sona başka bir ürünü anlatıyor.

**Ne yazılacak:**
- Skorun kim tarafından, hangi ekrandan girildiği (hakem paneli / tesis paneli)
- Skorun ne zaman girilebileceği (maç bittikten sonra)
- Hakem de saha sahibi de yoksa ne olacağı → **"skor girilmedi"** diye dürüst bir
  son durum. Uydurma 0-0 yok.
- Oyuncu ekranlarından skor girme/onaylama kontrollerinin **silinmesi**

**Kod tarafı:** ✅ Yapıldı. Belge geride kaldı.

**Neden önce bu:** Bu üç bölüm (7.3.2, 7.3.3, 7.3.4) aslında tek bir yazıdır ve
K2'nin tamamını taşır. Bunlar düzeltilmeden skorla ilgili hiçbir işe başlanamaz.

---

### KONU B — Para ve iade bölümleri

**İlgili bölümler:** IP-03, IP-19, 6.5, 6.6 §5.3

**Planda şu an ne yazıyor:**
Plan üç ayrı para türü tarif ediyor: *yüklenen bakiye*, *iade kredisi*, *kazanç*.
Ve şunu söylüyor: **"iade kredisi çekilemez, yalnız uygulama içinde harcanır"**.
Hatta kullanıcıya gösterilecek metinlerde "bu para banka hesabına aktarılmaz"
cümlesi var.

**Neden geçersiz:**
K1 ile iade parası artık çekilebiliyor. Yani plandaki o cümle **artık yalan**.
Ayrıca planın "çekilebilir tutar diye ayrı bir isim olsun" kararı da çöktü —
cüzdanın tamamı çekilebilir olduğu için üçüncü bir isme gerek kalmadı.

**Ne yazılacak:**
- Kullanıcı **iki** isim görür: **Cüzdan Bakiyesi** ve **Kazancım**. Üçüncü yok.
- "İade kredisi" terimi tamamen kalkar
- Çekim akışı: %5 hizmet bedeli, 100₺ alt sınır, talebin iptal edilebilmesi
- İptal/red halinde paranın tamamının geri döndüğü, kesinti alınmadığı

**Kod tarafı:** ✅ Yapıldı. Sözleşmeler de güncellendi.

---

### KONU C — İş sıralaması (kısa ama kritik)

**İlgili bölüm:** 8.1 Sıralama tablosu

**Planda şu an ne yazıyor:**
Plan işleri "P0 / P1 / P2" diye önceliklendirmiş. Bu sıralama, **uygulamanın canlı
olduğu ve gerçek kullanıcıların zarar gördüğü** varsayımıyla yapılmış. Yani
"şu an insanlar mağdur oluyor, önce onu durdur" mantığı.

**Neden geçersiz:**
Uygulama canlı değil. Kimse mağdur olmuyor. Bu durumda "yangını söndür" mantığı
yerine **"lansmandan önce sağlam olsun"** mantığı geçerli.

**Ne yazılacak:**
Yeni bir öncelik tanımı. Kabaca:
- Önce: lansmanı imkânsız kılan şeyler (para, skor, güvenlik)
- Sonra: ilk izlenimi belirleyen şeyler (tasarım tutarlılığı, Türkçe dil birliği)
- En son: canlıyken riskli olacağı için şimdi yapılması avantajlı büyük değişiklikler

**Bir avantajın var:** Canlı olmadığın için normalde riskli sayılan geniş
değişiklikleri (yüzlerce dosyaya dokunan tasarım işleri gibi) şimdi güvenle
yapabilirsin. Plan bunu hesaba katmıyor.

---

### KONU D — Tesis sahibi tarafı

**İlgili bölümler:** 5.9, IP-05

**Planda şu an ne yazıyor:**
Plan, tesis sahibi ekranlarının renk/tema olarak ana uygulamayla **birleştirilmesini**
öneriyor — gerekçesi "ikisi aynı uygulamada yaşıyor, ayrı görünmesin".

**Neden gözden geçirilmeli:**
K4 ile "tesis tarafı ileride ayrı uygulama olabilir" dedin. Eğer ayrılacaksa,
şimdi birleştirmek için harcanan emek sonra çöpe gider.

**Ne yazılacak:**
Birleştirme kararının ertelenmesi veya yönünün tersine çevrilmesi. Yani "ayrı
kalsın, ayrılmaya hazır dursun".

**Not:** Bu, kesin bir karar değil bir tavsiye. Ayrı uygulama fikri ne kadar
ciddi, onu sen bilirsin.

---

### KONU E — Küçük tutarlılık düzeltmeleri

**İlgili bölümler:** 4.3 tablosu, Bölüm 10 izlenebilirlik matrisi, Bölüm 3'te iki
bulgu notu

Bunlar kısa düzeltmeler. Örneğin:
- Plandaki bir tabloda "oyuncu skoru giriyor" yazıyor → artık girmiyor
- Bir bulgu kendiliğinden çözülmüş → kapatıldı diye işaretlenmeli
- Hangi bulgunun hangi iş paketinde çözüldüğünü gösteren matriste birkaç satır
  kaymış → düzeltilmeli

Bunlar tek başına önemli değil ama bırakılırsa belge kendi içinde çelişir.

---

## 5. Hangi sırayla yapılmalı

1. **KONU A** (skor bölümleri) — en büyük ve en çok şeyi kilitleyen iş
2. **KONU B** (para bölümleri) — sözleşmelerle bağlantılı, avukat kuyruğu var
3. **KONU C** (sıralama) — A ve B bittikten sonra yeni sıralama anlamlı olur
4. **KONU D** (tesis tarafı) — senin K4 kararının netleşmesini bekler
5. **KONU E** (küçük düzeltmeler) — en son, temizlik

---

## 6. Bu güncelleme ne kadar iş?

Kabaca **17 yer**; bunların:
- **6'sı sıfırdan yazılacak** (çoğu skor bölümleri)
- **8'i düzeltilecek** (cümle/tablo revizyonu)
- **3'ü silinecek** ya da not düşülecek

Kod yazılması gereken kısmın büyük bölümü zaten bitti. Bu iş **belge işi**.

---

## 7. Dürüstlük notu

- Bu belgeyi hazırlarken kullandığım analiz, kod yazılmadan önce çıkarılmıştı.
  Bölüm satır numaraları o sırada doğruydu; belge üzerinde çalışırken kaymış
  olabilirler — düzenlemeye başlarken teyit edilmeli.
- Konu D (tesis tarafı) bir tavsiye, karar değil.
- Sözleşme metinleri için **avukat onayı** hâlâ bekliyor; özellikle "tesis/OYNA
  kusurundan doğan iadede %5 alınmalı mı" sorusu açık. Ayrıntısı
  `sozlesmeler/00-k1-cuzdan-iade-hukukcu-notu.md` içinde.
- Para çekme özelliği şu an **kapalı**. Açılmadan önce oyuncu tarafında kimlik
  doğrulama ekranı gerekiyor; o ekran henüz yok.
