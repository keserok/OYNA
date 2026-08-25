# Olay kaydı · 25 Ağustos 2026 — vitrine sızan görseller

> Bu bir **olay kaydıdır**, plan değil. KVKK'da veri sorumlusu, bir ihlalin ne
> olduğunu, ne zaman fark edildiğini ve ne yapıldığını gösterebilmek
> zorundadır; ispat yükü ondadır. Kayıt bu yüzden tutuluyor.

**Veri sorumlusu:** Miraç Kerem Çürüksulu (OYNA)
**Fark edildiği an:** 25 Ağustos 2026, App Store ekran görüntüsü çekilirken
**Durum:** Bağlar koparıldı · dosyaların kalıcı silinmesi kurucunun kararına bırakıldı

---

## 1 · Ne oldu

Uygulamanın `images` adlı Supabase depolama kovası **herkese açık**tır
(`public = true`). Fotoğraf yükleme akışları denenirken kovaya, uygulamayla
ilgisi olmayan dosyalar yüklenmiş ve unutulmuştur. Bu dosyalar veritabanından
referans aldıkları için **uygulamanın normal ekranlarında yayınlanıyordu**.

Üç ayrı sınıf bulundu.

### 1a · Kişisel fotoğraflar — en ağırı

Tanınabilir kişilerin ve **çocukların** özel fotoğrafları, saha/kort görseli
ve profil avatarı olarak yayındaydı:

| Nerede görünüyordu | Ne |
|---|---|
| `courts.images` — "2. Saha" (Panorama Spor Tesisleri) | iki özel aile fotoğrafı, çocuklu |
| `profiles.avatar_url` — bir demo persona | gerçek bir kişinin selfie'si |
| `profiles.avatar_url` — bir gerçek hesap | bir bebeğin yakın çekimi |

Kort fotoğrafları **saha detay ekranında**, avatarlar **maç ve profil
ekranlarında** görünüyordu. Açık rıza yok, hukuki sebep yok, aydınlatma yok.
Apple açısından ayrıca 5.1.1 (gizlilik) ve 1.2 (kullanıcı içeriği).

### 1b · Üçüncü kişi telifi

| Nerede | Ne |
|---|---|
| "Panorama Spor Tesisleri" vitrin fotoğrafı | FIFA Dünya Kupası kupasının renderı — kaidesinde "FIFA WORLD CUP" okunuyor |
| "Safak Hali Saha" vitrin fotoğrafı | aynı dosya |
| bir kortun fotoğrafı (bağsız, depoda) | gerçek, tanınabilir bir futbolcunun fotoğrafı |
| bir profilin avatarı | kaynağı belirsiz stok çizim |

Kupa fotoğrafı **"Saha Kirala" listesinin ilk kartıydı** — inceleyici
uygulamayı açtıktan saniyeler sonra görüyordu. Tescilli marka; Apple 5.2.

### 1c · Uygulamanın kendi logosu

Bir sahanın ve üç profilin fotoğrafı OYNA logosuydu. Telif sorunu değil;
"yarım bırakılmış ürün" görüntüsü — Apple 2.1.

---

## 2 · Neden bugüne kadar görülmedi

Gönderim denetimi (`npm run magaza:denetim`) o gün **yirmi kapıdan yirmisini
yeşil** veriyordu. Hiçbiri bunu göremezdi, çünkü hepsi **dosyalara** bakıyordu:
Info.plist, manifest, Podfile.lock, paket içeriği. Buradaki hatanın tamamı
**veriydi**.

İkinci sebep daha basit: kimse bakmamıştı. Vitrindeki her fotoğrafa bakmak
altı saha, kortları ve altmış beş maç demekti; hepsi ayrı ekranlarda. Zahmetli
olduğu için hiç yapılmadı ve bir kupa fotoğrafı bir aydan uzun süre asılı
kaldı.

---

## 3 · Ne yapıldı

### Veritabanı bağları koparıldı (aynı gün, canlıda)

| Göç | Ne yaptı |
|---|---|
| `20260917000005_sizan_gorseller_kaldirildi` | 13 dosyanın **37 satırdaki** tüm bağını kopardı (saha, kort, profil, maç) |
| `20260917000006_demo_avatarlari_logodan_arindirildi` | logo taşıyan iki demo avatarını daha temizledi |
| `20260917000007_iki_sahanin_ortak_fotografi_ayrildi` | iki sahanın paylaştığı stok fotoğrafı tek sahaya indirdi |

Üçünün de kendi doğrulaması var (§7.7) ve üçü de doğrulamasıyla birlikte geçti.
Uygulama artık bu görsellerin hiçbirini servis etmiyor; fotoğrafı olmayan saha
kendi yer tutucusunu, avatarı olmayan profil baş harf rozetini gösteriyor.

### Kalıcı silme — YAPILMADI, bilerek

Göçler **hiçbir dosyayı silmedi**. Bağ koptuğunda uygulama görseli servis
etmeyi bırakır, ama dosya **adresini bilen için erişilebilir kalmaya devam
eder**. Depodaki nesneyi silmek geri alınamaz ve söz konusu olan kurucunun
kendi aile fotoğraflarıdır; tek kopya olabilirler. Karar kurucuya bırakıldı.

**Bu iş bitmiş sayılmaz.** Kişisel fotoğraflar depoda durduğu sürece açık
kovadan erişilebilirdir.

### Tekrarını önleyen kapılar

`npm run magaza:denetim` · **11. kapı** — canlı veriyi okur:

- Aynı fotoğraf **adresi** iki farklı sahada → **ENGEL** (ağ gerektirmez)
- Aynı fotoğraf **içeriği** (sha256) iki farklı sahada → **ENGEL**
  — kupa dosyası depoya üç ayrı adla kopyalanmıştı; adres karşılaştırması
  tek başına onu kaçırırdı
- Kendi depomuzdaki bir vitrin görseli açılmıyorsa → **ENGEL**
- Üçüncü taraf sunucu → **UYARI** (bu makinenin ağ politikası da 403 döndürebilir)
- Hiçbir görsel indirilemediyse → **"karşılaştırılamadı"** der, TAMAM demez

`npm run vitrin:gorseller` — canlıdaki her saha/kort/maç fotoğrafını **tek
sayfada** basar. Kapının göremediği tek şey fotoğrafın **ne olduğudur**; onu
insan görür. Bu komut bakmayı on saniyeye indiriyor.

---

## 4 · Dürüst sınır

Bu kapılar **tek kullanılan bir özel fotoğrafı yakalayamaz**. Bir görselin
kupa mı, çocuk mu, halı saha mı olduğunu makine bilemez. Nitekim yukarıdaki
kişisel fotoğrafların her biri tek yerde kullanılmıştı ve 11. kapıdan sessizce
geçerdi.

Yakalanmalarının tek sebebi **bakılmış olmasıdır**. Kural bu yüzden şudur:
gönderimden önce `npm run vitrin:gorseller` çalıştırılır ve **hepsine bakılır**.

---

## 5 · Kurucuya kalan

1. **Karar:** depodaki kişisel fotoğraflar kalıcı silinsin mi? (Önce kendi
   kopyanı aldığından emin ol — silme geri alınamaz.)
2. Aynı karar telif fotoğrafları için de gerekli; onlarda saklanacak bir şey yok.
3. Saha fotoğrafları bugün `images.unsplash.com` üzerinde. Gerçek tesis
   fotoğrafları geldiğinde bu bağımlılık kapanmalı.
