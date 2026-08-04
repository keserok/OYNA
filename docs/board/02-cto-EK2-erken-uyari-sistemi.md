# EK-2 — Erken Uyarı Sistemi: Sessiz Hataları Nasıl Yakalarız?

> **Bağlam:** CTO turu Aşama 1, madde 3, 4 ve 5'e kurucu yanıtı.
> **Kurucu talebi:** *"Sessizce yanlış davranan herhangi bir kural olmamasını sağlayalım"* · *"'Bilerek yapın'dan kastın ne, kod temelim yok — yönlendirilmem şart"* · *"Bundan sonra tüm problemlerin yakalanmasını sağlayacak önlemleri al"*
> **Tarih:** 3 Ağustos 2026 · Ölçümler canlı sistemde salt-okunur yapıldı.

---

# BÖLÜM 1 — "Sessizce yanlış davranan kural" nedir?

## Tanım

> Bir kural sessizce yanlış davranıyorsa: **ekran bir şey söyler, sistem başka bir şey yapar, ve kimse fark etmez.**

Gürültülü hata iyidir — uygulama çöker, siz görürsünüz, düzeltirsiniz. Sessiz hata kötüdür, çünkü **doğru çalıştığını sanırsınız.** Aylarca sürebilir.

## Sizin sisteminizde bulduğum sekiz gerçek örnek

Bunlar teorik değil; bu iki turda canlı sistemde tespit ettim:

| # | Ekran/panel ne diyor | Sistem ne yapıyor |
|---|---|---|
| 1 | "Ban eşiği: 40 puan" | Hiçbir kod bu ayarı okumuyor — **hiç ban olmuyor** (9 ayar böyle) |
| 2 | "Kampanya modülü kapalı" | Sunucu tarafı hâlâ açık; bayrak yalnız menüyü gizliyor |
| 3 | "Maça 24 saatten fazla varsa katılımcı ödemeleri iade edilir" | Kod katılımcılara **hiç iade yapmıyor** |
| 4 | "1 saat kala hatırlatma kapatılamaz" | Anahtar isimleri uyuşmadığı için sessiz saatte **gitmiyor** |
| 5 | Maç iptal edildi | Büyük/küçük harf farkı yüzünden **hiçbir katılımcıya bildirim gitmiyor** |
| 6 | Kullanıcı KVKK onayı verdi | Kayıt başarısız olursa **sessizce düşüyor**, ispat kalmıyor |
| 7 | Yönetim panosu: "Komisyon %10" | Sistem **%15 + %5** uyguluyor |
| 8 | "Acil durdurma" düğmesi | 554 fonksiyondan **yalnız 8'ini** durduruyor |

Sekizinin ortak özelliği: **hiçbiri hata vermiyor.** Test yeşil, uygulama çalışıyor, kullanıcı şikâyet etmiyor — ta ki biri fark edene kadar.

## Altı sessizlik türü — ve her birinin otomatik dedektörü

Bu sekiz örneği sınıflandırdım. Hepsi altı kalıba giriyor ve **altısı da makineyle tespit edilebilir**:

| # | Tür | Ne demek | Nasıl otomatik yakalanır |
|---|---|---|---|
| **S1** | **Ölü ayar** | Panelde ayar var, hiçbir kod okumuyor | Ayar anahtarlarını fonksiyon ve kod gövdeleriyle karşılaştır → okunmayanları listele |
| **S2** | **Ölü kural** | Kural yazılmış, hiçbir yerden tetiklenmiyor | Bayrak/kural fonksiyonlarının çağrı sayısını say → sıfır olanları listele |
| **S3** | **Uyuşmayan anahtar** | İki taraf farklı isim veya farklı büyük/küçük harf kullanıyor | Bildirim anahtarlarını şablonlarla, durum değerlerini birbirleriyle karşılaştır |
| **S4** | **Yutulan hata** | İşlem başarısız oldu, kimse görmedi | Kodda "hatayı yut ve devam et" desenini yasakla (derleme kuralı) |
| **S5** | **İkiz gerçek** | Aynı bilgi iki yerde duruyor, biri bayatlıyor | Tutarlılık sorgusu — `check_money_invariants()` bunun mevcut örneği |
| **S6** | **Sessiz varsayılan** | Ayar eksik kalınca riskli tarafa düşüyor | Ayar listesini tara, "yoksa ne olur" cevabı riskli olanları işaretle |

## Çözüm: "Sessizlik Denetçisi"

Altı dedektörü tek bir haftalık rapora bağlıyoruz. Rapor şunu söyler:

```
SESSİZLİK RAPORU — 10 Ağustos 2026
  S1 Ölü ayar ............... 9 adet  ⚠️
  S2 Ölü kural .............. 3 adet  ⚠️
  S3 Uyuşmayan anahtar ...... 2 adet  ⚠️
  S4 Yutulan hata ........... 39 adet ⚠️
  S5 İkiz gerçek ............ 3 alan  ⚠️
  S6 Sessiz varsayılan ...... 4 adet  ⚠️
```

Hedef: her satır **sıfır**. Sıfırdan saparsa haber gelir.

**Efor:** ~1 gün (altı sorgu + bir pano kartı + haftalık görev)

**Neden bu kadar değerli:** Bu rapor, bulduğum sekiz örneği **ben olmadan** bulur. Ve gelecekte oluşacakları da bulur.

---

# BÖLÜM 2 — "Bilerek yapın" ne demek?

> Kurucu: *"Bilerek yapından kastın ne bilmiyorum, kod temelim yok."*

Haklısınız, bu cümle yeterince açık değildi. Açayım.

## Ne bahsi oynadınız?

OYNA'nın iş kuralları — komisyon hesabı, kapora, iade kademeleri, kadro kararı — **uygulamanın içinde değil, veritabanının içinde** yaşıyor. 62.884 satır veritabanı kodu, 554 fonksiyon.

Çoğu şirket bunu yapmaz; kuralları ayrı bir sunucu programına yazar.

## Bu neden akıllıcaydı?

Üç sebeple **sizin durumunuz için doğru karardı**:

1. **Hız.** Tek kişiyle ve yazılımcı olmadan bu hızda gitmenin başka yolu yoktu. Ayrı bir sunucu yazmak işi ikiye katlardı.
2. **Tutarlılık.** Kurallar veriye en yakın yerde. "İki kişi aynı anda aynı saati kiralayamaz" garantisi bu sayede taş gibi çalışıyor.
3. **Bakım.** Sunucu yok demek, bakılacak sunucu yok demek. Tek kurucu için bu çok değerli.

## Bahsin bedeli ne?

Bir gün bu yapıdan çıkmak isterseniz maliyet şu:

| Senaryo | Maliyet |
|---|---|
| **Supabase'den ayrılıp kendi Postgres'inize geçmek** | ~8–12 kişi-ay. Kurallarınız **olduğu gibi taşınır** — çünkü standart Postgres. |
| **Postgres'ten de ayrılmak** | ~18–24 kişi-ay. Pratikte uygulamayı yeniden yazmak. |

## "Bilerek yapmak" tam olarak şu üç şey

**1. Rakamı bilmek.**
Bugün çıkış maliyetiniz yukarıdaki tablodur. Bu rakam bir sır değil, bir bütçe kalemi. Bilirseniz karar verirsiniz; bilmezseniz bir gün sürpriz olur.

**2. Rakamın sessizce büyümemesini sağlamak.**
Maliyet, **Supabase'e özgü** özelliklere yaslandıkça artar. Standart Postgres'te kalan her şey bedava sigortadır.

| Ne kullanıyorsunuz | Standart mı? | Çıkışta ne olur |
|---|---|---|
| Veritabanı kuralları (SQL fonksiyonları) | ✅ Standart | Olduğu gibi taşınır |
| Satır güvenlik kuralları (RLS) | ✅ Standart | Olduğu gibi taşınır |
| Zamanlanmış görevler | ✅ Standart | Olduğu gibi taşınır |
| **Kimlik/giriş sistemi** | ❌ Supabase'e özgü | ~2–3 kişi-ay |
| **Anlık güncelleme (Realtime)** | ❌ Supabase'e özgü | ~1 ay |
| **Dosya depolama** | ❌ ama kolay | ~2 hafta |
| **Edge Function'lar** | ❌ ama mekanik | ~1 ay |

**İyi haber:** ağırlığın büyük kısmı standart tarafta. Yani bahsi zaten doğru oynamışsınız.

**3. Sigortayı bugün almak — neredeyse bedava.**

| Sigorta | Durum |
|---|---|
| Veritabanı değişiklikleri tek kaynaktan yönetilsin | ✅ **Zaten öyle** — sapma sıfır |
| Kurallar standart dilde yazılsın | ✅ **Zaten öyle** |
| Supabase'e özgü bağımlılıklar listelenip sayısı izlensin | ❌ Yapılmalı — yukarıdaki tablo bu, ~2 saat |
| "Çıkarsak ne yaparız" tek sayfalık not | ❌ Yapılmalı — ~2 saat |

## En önemli kısım: gerçek risk göç değil

Açık konuşayım: **Supabase'den çıkmanız gerekmeyecek.** Bahis doğru.

Gerçek risk şudur — bir **dış şok** gelir ve siz hazırlıksız yakalanırsınız:

- Supabase fiyatlandırmasını değiştirir
- Bir özelliği kaldırır
- **Veri yeri zorunluluğu çıkar** — KVKK açısından bu gerçek bir olasılık, üstelik siz zaten bölge taşıma kararı aldınız

"Bilerek yapmak", bu şoklardan biri geldiğinde **"ne yapacağımızı biliyoruz"** diyebilmektir. Dört saatlik bir dokümantasyon işi, varoluşsal bir krizi planlı bir projeye çevirir.

---

# BÖLÜM 3 — Erken uyarı sistemi: altı katman

> Kurucu: *"Bundan sonra yakalanmasını ve tüm problemlerin halledilmesini sağlayacak önlemleri al."*

Problemler tek yerde yakalanmaz. Her katman **farklı bir anda, farklı bir şeyi** yakalar. Biri diğerinin yerini tutmaz.

| # | Katman | Ne zaman yakalar | Ne yakalar | Bugünkü durum |
|---|---|---|---|---|
| **1** | **Katı tip denetimi** | Kod yazılırken | Boş değerin sayıya dönüşmesi, eksik alan | 🔴 **Kapalı** — açmanın maliyeti ölçüldü: 38 hata |
| **2** | **Saldırı testleri** | Test çalışırken | Kapı açıkları | 🔴 **Yok** — 1426 testin hiçbiri "yanlış kullanım engelleniyor mu" diye sormuyor |
| **3** | **Kapı envanteri** | Her değişiklikte | Kaybolan yetki kapısı | 🔴 **Yok** |
| **4** | **Sessizlik denetçisi** | Haftalık | Ölü ayar, ölü kural, uyuşmayan anahtar | 🔴 **Yok** (Bölüm 1) |
| **5** | **Para denetçisi** | Saatlik | Defter tutarsızlığı | 🟠 **Yazılmış, çalışmıyor** — şu an `ok: true` |
| **6** | **Hata izleme + huni ölçümü** | Sürekli | Kullanıcının gerçekten yaşadığı hata | 🟠 **Altyapı hazır, anahtar girilmemiş** |

## Neden altısı da gerekli — bir örnekle

Bulduğum "maç iptalinde kimseye bildirim gitmiyor" hatasını hangi katman yakalardı?

- Katman 1 (tip denetimi): ❌ Hayır — iki metin de geçerli metin
- Katman 2 (saldırı testi): ❌ Hayır — bu bir yetki sorunu değil
- Katman 3 (kapı envanteri): ❌ Hayır
- **Katman 4 (sessizlik denetçisi): ✅ EVET** — "yazan taraf küçük harf, okuyan taraf büyük harf" tam olarak S3 kalıbı
- Katman 5 (para denetçisi): ❌ Hayır — para etkilenmiyor
- Katman 6 (huni ölçümü): 🟡 Dolaylı — "iptal sonrası bildirim açılma oranı sıfır" fark edilirdi

Tek bir katman yeterli olsaydı diğerlerine gerek olmazdı. **Her hatanın kendi katmanı var.**

## Kurulum sırası ve efor

| Sıra | Katman | Efor | Neden bu sırada |
|---|---|---|---|
| 1 | **Para denetçisini zamanla** | ~1 saat | Zaten yazılmış; en yüksek getiri/efor oranı |
| 2 | **Hata izleme anahtarını gir** | ~1 saat | Sentry hazır bekliyor; kullanıcının yaşadığı hatayı görmeye başlarsınız |
| 3 | **Sessizlik denetçisi** | ~1 gün | Bulduğum sekiz örneği benden bağımsız bulur |
| 4 | **Kapı envanteri** | ~3 saat | Güven sınırı işlerinin kalıcı olmasını sağlar |
| 5 | **Saldırı testleri** | ~1 gün | Her kapı işiyle birlikte yazılır |
| 6 | **Katı tip denetimi** | ~2 gün | En büyük iş, ama tek seferlik |

**Toplam: ~4 iş günü.** Bu dört gün, bundan sonraki her ayın hata avcılığını size geri kazandırır.

---

# BÖLÜM 4 — Demo verisi zararsız hale nasıl getirilir?

> Kurucu: *"Şimdilik demo veriler kalsın, uygulamaya zarar vermeyecek şekilde olduklarından emin olalım."*

## Ölçüm: bugün zarar verebilir durumdalar

Para ve katılım yollarındaki **11 fonksiyondan 9'unda demo filtresi yok**:

`create_match_atomic` · `create_pitch_booking` · `player_buy_slots_v2` · `join_public_match_reserve` · `match_block_deposit` · `record_app_deposit_payment` · `prepare_card_payment` · `create_service_request` · `fund_service_request`

**Bunun somut anlamı:** Gerçek bir kullanıcı, demo bir maça katılabilir ve **gerçek para ödeyebilir.** Demo maç gerçek bir saha rezervasyonu üretebilir. Demo kayıtlar ölçümlerinizi kirletir.

Bugün riski düşük tutan tek şey, ödemenin henüz nakit modda olması. **Online ödemeye geçtiğiniz gün bu aktif hale gelir.**

## Zararsız hale getirmek için dört koruma

| # | Koruma | Ne sağlar | Efor |
|---|---|---|---|
| **D1** | Para ve katılım fonksiyonları demo kayıtları **reddetsin** | Gerçek para asla demo kayda akmaz | ~1 saat |
| **D2** | `get_nearby_matches` demo filtresi alsın | Gerçek kullanıcı demo maç görmez; demo hesaplar görmeye devam eder | ~30 dk |
| **D3** | `purge_godview_demo` ve `seed_godview_demo` kullanıcıya kapatılsın | Giriş yapmış herkes demo verinizi silemez | ~15 dk |
| **D4** | Ölçüm sorguları demoyu hariç tutsun | "Başarılı maç" sayacı temiz kalır | ~30 dk |

**Toplam: ~2,5 saat.** Bundan sonra demo verisi istediğiniz kadar kalabilir — ne paraya, ne vitrine, ne ölçüme dokunur.

---

# BÖLÜM 5 — İki cevabınız arasındaki gerilim ve çözümü

Verdiğiniz iki cevap şu an çelişiyor:

- **S1: Staging ortamı istemiyorum** (maliyet)
- **S3: Veritabanını Avrupa'ya taşıyalım**

**Sorun:** Bölge taşıma, veritabanının tamamını yeni bir projeye kopyalayıp geçiş yapmak demektir. Provası olmayan, geri alması zor bir operasyondur. Test ortamı olmadan yapmak, ipsiz tırmanmaya benzer.

## Ama zaten sizde çözüm var — farkında değilsiniz

`oyna-staging` diye bir projeniz **zaten var**, şu an kapalı duruyor ve — burası önemli — **zaten Frankfurt'ta (eu-central-1)**. Yani tam taşımak istediğiniz yerde.

**Önerilen plan:**

```
1. oyna-staging'i uyandır  (zaten Frankfurt'ta, zaten sizin)
2. Şemayı ve veriyi oraya taşı, prova et
3. Doğrula: her şey çalışıyor mu?
4. Geçişi yap → Frankfurt artık CANLI
5. Singapur projesi → artık test ortamınız (veya kapatılır)
```

**Bu planın güzelliği:** Yeni proje açmıyorsunuz, ek maliyet yaratmıyorsunuz. Taşıma sırasında zaten iki proje yan yana duracak — o pencere provanız oluyor. Ve iş bittiğinde elinizde **hem Avrupa'da canlı sistem hem bir test ortamı** kalıyor.

Yani S1'e "hayır" demenize gerek kalmıyor; S3'ün doğal yan ürünü olarak geliyor.

**Önemli uyarı:** Bölge taşıma ciddi bir operasyondur — kesinti penceresi, ödeme sağlayıcı adres güncellemesi, mobil uygulama güncellemesi gerektirir. Sistem Mimarı turunda ayrı bir plan olarak ele alınmalı.

---

# BÖLÜM 6 — S2 cevabının sonucu

İyzico geçiş tarihini bilmediğinizi söylediniz. Bu, iş sıralamasını doğrudan etkiliyor:

**Tarih bilinmiyorsa, tarih yarın olabilir.**

Güven sınırı işlerinin (G1–G6, ~2 gün) tamamı **ödeme açılmadan önce** bitmiş olmalı. Tarih belirsiz olduğu için bunları "ödeme yaklaşınca yaparız" diye ertelemek riskli. İki günlük iş; sözleşme haberi geldiğinde hazır olmak en ucuz yol.

---

# ÖZET: toplam iş listesi

| Paket | İçerik | Efor |
|---|---|---|
| **Güven sınırı** (EK-1) | G1–G6: kapıların kapatılması | ~2 gün |
| **Erken uyarı** (bu belge, Bölüm 3) | 6 katman | ~4 gün |
| **Demo güvenliği** (Bölüm 4) | D1–D4 | ~2,5 saat |
| **Çıkış sigortası** (Bölüm 2) | Bağımlılık listesi + çıkış notu | ~4 saat |
| **Bölge taşıma** (Bölüm 5) | Ayrı plan — Mimar turunda | Belirlenecek |

**Kod işlerinin toplamı: yaklaşık 7 iş günü.**

Bu yedi gün, "sistemi mükemmel kurmak" hedefinizin altyapısıdır. Ondan sonra hızlı gidebilirsiniz — öncesinde her hız artışı riski çarpar.
