# OYNA Saha Sahibi Arketipleri -- Jung'un 5 Marka Arketipine Gore 5 Farkli Isletmeci

> Bu belge, `kullanici_analizi.md`'deki oyuncu odakli analize paralel olarak,
> OYNA'nin **Owner Panel** tarafini kullanan 5 farkli halisaha sahibini,
> Jung'un marka/kisilik arketip tipolojisinden secilen 5 baskin arketip
> uzerinden modeller: **Yonetici (Ruler)**, **Bilge (Sage)**, **Kahraman (Hero)**,
> **Bakici (Caregiver)**, **Soytari (Jester)**.
>
> Amac: her arketipin motivasyonunu, Owner Panel'i kullanma bicimini ve OYNA
> ile surtundugu noktalari netlestirip, panelin bu 5 farkli isletmeci tipine
> nasil uyum saglayabilecegini ortaya koymak.

---

## 1. Vedat (52) -- Yonetici (Ruler)

- **Isletme:** Sehrin en eski ve en buyuk tesisi, 6 saha, 3 sube.
- **Motivasyon:** Kontrol ve duzen. "Benim sahamda kural benimdir." Rakiplerden
  daha profesyonel gorunmek, hiyerarsiyi ve otoriteyi somut kanitlarla (rozet,
  Enterprise plan, resmi sozlesme) gostermek ister.
- **Teknoloji:** Orta-Yuksek ama kullanmaz, **kullandirir**. Panelin gunluk
  islerini saha muduru ve 2 personele devreder; kendisi sadece **Finans** ve
  **Ekip** sekmelerini haftada bir denetler.
- **OYNA'daki Yolculugu:** `OwnerPanel` > `OwnerTeamView` (personel roller/
  yetkiler ata) > `OwnerFinanceView` (haftalik ciro, komisyon, `Withdrawals`
  cekim talebi onayla) > `plan_tier: enterprise` abonelik durumunu kontrol et.
- **Surtundugu Nokta:** Personeline verdigi yetkilerin **sinirini** gormek
  ister ("resepsiyoncu fiyat degistirebilir mi, iptal onaylayabilir mi?") ama
  `OwnerTeamView`'da rol bazli yetki matrisi yerine tek tip personel listesi
  var. Kim neyi yapabiliyor net degil -- bu da onun icin **kontrol kaybi**
  demek.
- **Hissiyat:** *"Ben herkese yetki veririm ama kimin ne yaptigini gormeliyim.
  Sistem benim yerime karar veriyormus hissi vermemeli."*
- **Ton Onerisi:** Bildirimler ve raporlar **rakamsal, ozet, otorite dili**
  ile ("Bu hafta net kazanciniz %12 artti, 3 personel islem yapti") -- soru
  degil, rapor formatinda.

---

## 2. Necati Usta (61) -- Bilge (Sage)

- **Isletme:** 25 yillik tek sahalik, mahalle isi, dedikodusu bol bir tesis.
- **Motivasyon:** Deneyim ve guven. Fiyat degil, **taniniyor olmak** onemli.
  Musterilerin cogu 10+ yildir gelen sabit muhabbetler. "Ben bu isi
  bilgisayardan once de yapiyordum" tavri.
  Teknolojiye guvenmek icin once **anlamak** ister.
- **Teknoloji:** Dusuk. Karmasik ekranlardan kacinir, buyuk butonlar ve
  net aciklamalar bekler; "bu ne ise yariyor?" sorusuna cevap bulamazsa
  ozelligi hic acmaz.
- **OYNA'daki Yolculugu:** `OwnerPanel` ana ekran > gunun rezervasyonlari
  (`getPendingBookings` / `approveBooking` / `rejectBooking`) -- telefonla
  gelen musteriyi elle `ManualBookingParams` ile ekler, cunku alisik oldugu
  yontem budur. `OwnerPricingPolicyModal`i acar ama karmasik gelir, eski
  kagit fiyat listesini kullanmaya devam eder.
- **Surtundugu Nokta:** `resolveHourlyPrice` mantigi (flash deal + ozel
  fiyat + calisma saatleri ic ice) onun icin **kara kutu**. Neden bir
  saatin fiyati otomatik degisti, sistem acikca anlatmiyor -- bu da guvenini
  sarsiyor. **Sadelestirilmis "neden bu fiyat?" aciklamasi** yok.
- **Hissiyat:** *"25 yildir bu isi yapiyorum, ama bu ekran bana bir sey
  anlatmiyor, sadece rakam gosteriyor. Once bana neden'i anlat, sonra
  guveneyim."*
- **Ton Onerisi:** Ozellik acilislarinda **kisa "neden" cumlesi** ekle
  ("Flash Deal: bos saatleri doldurmak icin gecici indirim -- musteri
  gormeden once siz onaylarsiniz").

---

## 3. Deniz Karaca (34) -- Kahraman (Hero)

- **Isletme:** 2 yil once acilmis, agresif buyuyen 2. sahasini yeni acan
  hirsli girisimci.
- **Motivasyon:** Rekabet ve buyume. "Sehrin en iyi sahasi ben olacagim."
  Doluluk oranini, ciro grafigini, rakip tesislerle kiyaslamayi surekli
  takip eder; her bos slotu bir **kaybedilmis savas** gibi gorur.
- **Teknoloji:** Cok yuksek. Paneli gunde birkac kez acar, her ozelligi
  dener, ilk kullanan o olmak ister.
- **OYNA'daki Yolculugu:** `OwnerFlashDealModal` (bos saatleri agresif
  indirimle doldur) > `OwnerFinanceView` doluluk grafikleri > `getOwnerDailySummary`
  ile gunluk performansi kiyasla > `OwnerSubscriptionModal`da bir ust plana
  (Pro > Enterprise) gecmeyi surekli dusunur.
- **Surtundugu Nokta:** Doluluk/ciro verisi var ama **rakip kiyaslamasi**
  ve "gecen haftaya gore" trend gostergesi zayif; sadece kendi gunluk
  ozetini goruyor, "kazaniyor muyum yoksa kaybediyor muyum?" sorusuna
  kiyaslamali cevap bulamiyor. Ayrica flash deal'i her ac/kapa yaptiginda
  **sonucunu (kac rezervasyon geldi?) net raporlanmiyor.**
- **Hissiyat:** *"Bos slot benim icin kayip demek. Ama hangi hamlem ise
  yaradi, hangisi yaramadi -- bunu net gormeden kor kor savasiyorum."*
- **Ton Onerisi:** **Rekabetci, aksiyon odakli** bildirimler ("Flash Deal
  3 saatte 4 rezervasyon getirdi -- gecen haftadan %20 daha iyi").

---

## 4. Ayse Teyze (47) -- Bakici (Caregiver)

- **Isletme:** Semt arasi, aile/cocuk maclarina agirlik veren, sicak
  bir tesis; kahvalti/cay ikramlari, "herkes birbirini tanir" havasi.
- **Motivasyon:** Iliski ve guven. Musterisini bir "musteri numarasi"
  degil, tanidik yuz olarak gorur. Borcu olan genc oyuncuya ("bu ay
  odemesin, arkadasi gelince oder") esneklik tanir, katı kural yerine
  empati one cikar.
- **Teknoloji:** Orta. Ozellikle **insan iliskisini bozan** akislardan
  rahatsiz olur (otomatik iptal, otomatik borc uyarisi gibi).
- **OYNA'daki Yolculugu:** `PitchDebtor` listesi (borclu musteriler) > elle
  not dusup erteleme yapar > `PitchStaffTask` ile personele "bu musteriye
  nazik davran" gibi notlar birakir > iptal/red islemlerinde
  (`rejectBooking`) her zaman aciklama yazar, sebepsiz reddetmez.
- **Surtundugu Nokta:** Sistem borclu musteriyi otomatik olarak "riskli"
  isaretliyor / hatirlatma gonderiyor ama Ayse Teyze'nin **"bu farkli, ona
  guveniyorum" esnekligini** kaydedecek bir alan yok. Otomasyon onun
  insani yaklasimini gormezden geliyor gibi hissettiriyor.
- **Hissiyat:** *"Herkes bir rakam degil. Bazilarina zaman taniyorum,
  sistem bunu anlamiyor, sanki beni de katilastirmaya calisiyor."*
- **Ton Onerisi:** Borc/hatirlatma akislarinda **"sabit kural" yerine
  "oneri + sahibin son sozu"** modeli -- otomatik islem onun onayindan
  gecmeden yurumemeli.

---

## 5. Emre "Hoca" (29) -- Soytari (Jester)

- **Isletme:** Genc, hafta sonu turnuvalari ve temali gecelerle (halat
  formasi, "kirmizi kart = tur icecek" gibi eglenceler) one cikan, sosyal
  medyada aktif bir tesis.
- **Motivasyon:** Eglence ve viral olmak. Rakamdan once **atmosfer**
  onemli; bos saha onun icin "reklam firsati" -- flash deal'i indirim
  degil, eglenceli bir kampanya gibi kurgular ("Cuma 22:00 gecikmis
  gollere ekstra sure hediye").
- **Teknoloji:** Yuksek ama **duzensiz** kullanir -- ciddi finans
  ekranlarindan sikilir, gorsel/hikaye anlatan ekranlara yonelir.
- **OYNA'daki Yolculugu:** `OwnerFacilitySettingsModal` (fotograf, aciklama,
  logo) uzerinden tesis profilini surekli guncelller > `OwnerFlashDealModal`i
  eglenceli kampanya kurgusu icin kullanir > `OwnerWidgetSettingsModal` ile
  dashboard'unu kendi tarzina gore ozellestirir.
- **Surtundugu Nokta:** Flash deal ve kampanya araclari **saf fiyat
  indirimi** mantigiyla kurulu; temali/eglenceli kampanya adi, gorsel,
  sosyal medya paylasim linki gibi "hikaye anlatma" alanlari yok. O da
  kampanyasini WhatsApp'a ekran goruntusu atarak duyurmak zorunda kaliyor
  -- panel onun **yaraticiligini** sinirlar gibi hissettiriyor.
- **Hissiyat:** *"Benim sahamin farki eglence. Ama panel bana sadece
  yuzde ve TL soruyor, hikayemi anlatacak yer vermiyor."*
- **Ton Onerisi:** Kampanyalara **baslik + gorsel + kisa aciklama** alani
  ekle, otomatik paylasilabilir kart uret.

---

## Ozet Tablo -- Arketip x Ihtiyac x Owner Panel Karsiligi

| Arketip | Cekirdek Ihtiyac | Guclu Oldugu Alan | Surtunme | Onerilen Uyarlama |
|---|---|---|---|---|
| Yonetici (Vedat) | Kontrol / otorite | Ekip & finans yonetimi | Rol bazli yetki matrisi yok | Personel yetki matrisi + ozet raporlama |
| Bilge (Necati Usta) | Guven / anlama | Musteri iliskisi, tecrube | Fiyat mantigi kara kutu | "Neden bu fiyat?" aciklamasi, sade UI |
| Kahraman (Deniz) | Rekabet / buyume | Hizli aksiyon, veri takibi | Kiyaslamali trend eksik | Rakip/gecmis haftaya gore kiyaslama |
| Bakici (Ayse Teyze) | Iliski / empati | Musteri sadakati | Otomasyon esnekligi ezdiriyor | Oneri + sahibin onayi modeli |
| Soytari (Emre) | Eglence / marka | Gorsellik, sosyal medya | Kampanyalar sadece fiyat odakli | Hikaye/gorsel alanlari olan kampanya araci |

---

## Sonuc

Owner Panel su an **tek bir "profesyonel isletmeci" varsayimina** gore
tasarlanmis: rakamlar, onaylar, ayarlar. Ama gercek saha sahipleri bu 5
arketipin bir karisimi -- kimi kontrolu, kimi guveni, kimi rekabeti, kimi
iliskiyi, kimi eglenceyi one cikariyor. Panelin **tonu ve vurgusu sabit
kaldiginda**, arketipe uymayan sahipler ozellikleri ya hic kullanmiyor
(Necati Usta) ya da yaraticiligini panelin disina tasiyor (Emre).

Ilk adim olarak onerim: **fiyatlandirma/flash deal akisina "neden" metni
ve hikaye alani eklemek** (Bilge + Soytari'yi birden rahatlatir) ve
**OwnerTeamView'a rol bazli yetki gorunurlugu** kazandirmak (Yonetici'nin
en buyuk sikayeti). Bu iki degisiklik, 5 arketipten 3'unun ana
surtunmesini dogrudan cozer.
