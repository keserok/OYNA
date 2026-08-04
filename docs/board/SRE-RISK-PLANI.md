# SRE RİSK ÇÖZÜM PLANI — tüm uygulama

**Hazırlayan:** SRE & DevOps Lead
**Tarih:** 4 Ağustos 2026
**Dal:** `claude/oyna-advisory-prompt-8s4x3m`
**Kapsam:** Oyuncu uygulaması + saha sahibi paneli + yönetici paneli + veritabanı + zamanlanmış işler + yayın hattı

---

## Bu plan neyi cevaplıyor

Sayın CEO, önceki roller *"kod doğru mu"* diye sordu. Bu plan tek bir soruyu cevaplıyor:

> **Gece 3'te bir şey bozulduğunda ne olacak?**

Cevabı üç ayrı yeteneğe ayırıyorum. Bir sistemin ayakta kalması bu üçünün birlikte çalışmasına bağlıdır:

| Yetenek | Sorusu | Bugünkü durum |
|---|---|---|
| **1. GERİ DÖNEBİLME** | Bozulanı geri alabiliyor muyum? | 🟡 Kısmen — bugün kuruldu |
| **2. FARK EDEBİLME** | Bozulduğunu öğrenebiliyor muyum? | 🟡 Kısmen — panelde görünür, size ulaşmaz |
| **3. ÖNLEYEBİLME** | Bozulmadan yakalayabiliyor muyum? | 🟡 Kısmen — deneme ortamı yok |

Hiçbiri 🔴 değil artık; hiçbiri 🟢 de değil. Bu planın amacı üçünü de yeşile çekmek.

---

## Bölüm 0 — Bugün ölçülen taban

Plan varsayıma değil, canlıdan okunan sayılara dayanıyor:

| Ölçüm | Değer | Yorum |
|---|---|---|
| Veritabanı boyutu | 70 MB | Ücretsiz plan sınırının çok altında |
| Tablo sayısı | 182 | |
| Zamanlanmış iş | **17** (yeni ikisiyle) | |
| Son 24 saatte çalışma | **2.135** | |
| Son 24 saatte **başarısız** | **0** ✅ | Çalışma tarafı sağlıklı |
| Dışarı giden çağrı (24 sa) | 13 · hata **0** ✅ | Bildirim köprüsü ayakta |
| Sistem sağlığı denetimi | **14 yeşil / 0 kırmızı** ✅ | Bugün 12'den 14'e çıktı |
| Yayınlanmış Edge Function | 14 | |
| Güvenlik danışmanı bulgusu | 441 (1 ERROR) | **Sıradaki rolün işi** — aşağıda not düştüm |

**Okunuşu:** sistemin *çalışma* tarafı iyi. Riskler *hazırlık* tarafında toplanmıştı; bu planın ilk faz'ı bugün uygulandı.

---

# FAZ 1 — BUGÜN YAPILDI ✅

Bu faz onayınızla (S-1 = a, S-3 = güvenli) uygulandı ve canlıda çalışıyor.

## 1.1 · Gecelik yedek kuruldu — tek geri alınamaz risk kapandı

**Neydi:** Ücretsiz planda otomatik yedek garantisi yok, veritabanında artık gerçek para var. Yanlış bir migration ya da kazara silme **geri dönülemez**di.

**Ne yapıldı:** Her gece 05:30'da (İstanbul) 8 kritik tablonun tam kopyası alınıyor, 7 gün saklanıyor:

`payment_intents` · `wallet_transactions` · `matches` · `match_participants` · `pitch_bookings` · `profiles` · `pitches` · `pitch_tariffs`

**Doğrulandı:** İlk yedek alındı — 8 tablo, 270 satır. Her tablonun satır sayısı canlıyla **birebir** karşılaştırıldı, sekizi de tam.

**Dürüst sınır (bilerek yazıldı):**

| Senaryo | Kapsıyor mu? |
|---|---|
| Yanlış migration | ✅ 7 güne kadar geri dönülür |
| Kazara silinen kayıt | ✅ |
| Bozulan veri | ✅ |
| **Veritabanının tamamen gitmesi** | ❌ **Kapsamıyor** — kopya aynı veritabanında |

> Bu sınırı gizlemedim çünkü *"yedeğim var"* sanıp yanılmak, yedeksiz olmaktan **kötüdür.** Tam güvence için Faz 3'teki dış kopya gerekir.

## 1.2 · Yedeğin kendisi denetleniyor (K-YEDEK-1)

Yedek kurmak yetmez — sessizce durursa kimse fark etmez. Artık gece denetimi yedeği de kontrol ediyor:

- bugünün yedeği tam → **yeşil**
- yedek dünkü → **sarı** (bir gece atlanmış)
- daha eski / hiç yok / tablo eksik → **kırmızı**

Ayrıca `gecelik_yedek` işi, "olmazsa olmaz zamanlanmış işler" listesine eklendi — biri silerse K-OTO-1 kırmızı yanar.

## 1.3 · Çökme kaydı kuruldu — üçüncü tarafa veri gitmeden

**Neydi:** `utils/observability.ts` Sentry'ye gönderim için yazılmıştı ama anahtar yoktu. Yani her hata bildirimi **sessizce hiçbir şey yapmıyordu.** ErrorBoundary ekranda *"sorun Oyna tarafına iletildi"* yazıyordu — iletilmiyordu.

**Kararınız (S-3):** güvenli olsun. Öyle yapıldı:

| Karar | Sonuç |
|---|---|
| Üçüncü tarafa (Sentry/PostHog) veri gönderilmez | Dışarı hiçbir veri çıkmaz, KVKK sorusu doğmaz |
| Kayıtlar kendi veritabanımızda | Hesap açmanız gerekmez, bugün çalışır |
| Yalnızca yönetici okur | Satır kuralı (RLS) + fonksiyon içi yetki kontrolü |
| 30 gün sonra silinir | Gereksiz veri birikmez |

**Artık yakalanmamış hatalar da toplanıyor.** Eskiden yalnızca elle yazılmış 6 noktada bildirim vardı; şimdi tarayıcıdaki her beklenmedik çökme kendiliğinden kaydediliyor.

**Gizlilik — iki kat elek:**

Kişisel bilgi hem tarayıcıda hem sunucuda siliniyor. Sunucu tarafı test edildi:

| Girdi | Kayda geçen |
|---|---|
| `ahmet.kuru@example.com` | `[gizlendi]` |
| `0532 111 22 33` | `[gizlendi]` |
| `4543591234567890` | `[gizlendi]` |
| oturum anahtarı (`eyJ...`) | `[gizlendi]` |
| `Sahaya gidilemedi: ag hatasi` | değişmeden kalır ✅ |

İki kat yapıldı çünkü tarayıcı tarafındaki eleği bir gün biri atlayabilir.

**Sel baskını koruması test edildi:** aynı hata 25 kez gönderildi → **20'si yazıldı, 5'i engellendi.** Bozuk bir ekran saniyede yüzlerce hata üretse bile veritabanı boğulmaz.

## 1.4 · Çökme sayısı denetleniyor (K-COKME-1)

Kayıt toplamak yetmez, kimse bakmazsa yine öğrenilmez. Gece denetimi artık son 24 saatin çökme sayısını önceki 7 günün ortalamasıyla karşılaştırıyor. Normalin 3 katını (en az 20) aşarsa **kırmızı** — büyük ihtimalle yeni bir sürüm bir şeyi bozmuştur.

Az sayıda hata bilerek **yeşil** bırakıldı: her küçük hatada panel kırmızı yanarsa bir süre sonra panele bakmayı bırakırsınız.

## 1.5 · Panelde yeni bölüm: Çökme Kayıtları

Komuta Merkezi'nde, Sistem Sağlığı'nın hemen altında. Son 24 saat / 7 gün / 30 gün seçilebiliyor; hatalar **en çok yaşanandan** başlayarak gruplu görünüyor: kaç kez, kaç kişi, hangi ekran, en son ne zaman.

## 1.6 · "Atlandı" ile "geçti" ayrıldı (CI)

**Neydi:** SQL entegrasyon testleri, gizli anahtar yoksa **yeşil geçiyor** ve yalnız küçük bir not düşüyordu. PR yeşil görünüyordu ama para fonksiyonlarını koruyan testler **hiç koşmamış** oluyordu.

**Ne yapıldı:** Atlandığında artık (1) uyarı işareti bırakıyor, (2) PR özet sayfasına büyük harflerle *"SQL ENTEGRASYON TESTLERİ KOŞMADI"* yazıyor, (3) adım listesinde açık bir uyarı satırı görünüyor.

Yeşil kalmaya devam ediyor — çünkü bugün ortada test veritabanı **yok**; sert başarısızlık her PR'ı bloke ederdi. Kalıcı çözüm Faz 2'de.

## 1.7 · Sürüm tek kaynağa bağlandı (K-SURUM-1)

**Neydi:** Sürüm numarası dört yerde yazılı ve üçü birbirinden habersizdi. `package.json` 3.1.0'a çıkarılsa telefon uygulamaları 3.0.0 olarak yayınlanabilirdi — kimse fark etmezdi, sonra *"hangi sürümde bu hata vardı?"* sorusunun cevabı kaybolurdu.

**Ne yapıldı:** `npm run sistem:surum` üç yeri karşılaştırıyor ve sapma varsa **durduruyor.** Bugün üçü de 3.0.0 — uyumlu. Denetim, sapmayı yakaladığı test edilerek doğrulandı.

## 1.8 · `auto-cancel-matches` tuzağı işaretlendi

**Doğrulandı (canlıdan):** Bu Edge Function **yayınlanmamış**, onu çağıracak cron da **yok**. İşini veritabanındaki `auto_process_matches()` yapıyor — 10 dakikada bir, **aynı** RPC'yi (`process_match_at_deadline`) çağırarak.

Yani maç iptali **çalışıyor**, ama bu dosya üzerinden değil.

Dosyanın başına büyük harflerle *"KULLANILMIYOR"* notu düşüldü. **Silmedim** çünkü silme kararı sizin. Mimar turundaki `pitch_slot_holds` dersini hatırlıyorum: "ölü" sandığım şey canlıda kullanılıyordu. Bu sefer önce ölçtüm, sonra işaretledim.

## 1.9 · Kendi hatam: yedek durumu sıradan kullanıcıya açık kalmıştı

Yedek durumunu panelde göstereceğim diye `yedek_durumu()` fonksiyonunu giriş yapmış herkese açmıştım. Supabase güvenlik taraması yakaladı.

Açık olan yetkinin **hiçbir faydası yoktu** — panel bu fonksiyonu doğrudan çağırmıyor, gece denetimi kendi içinden çağırıyor. Yalnızca zararı vardı: herhangi bir kullanıcı yedek tablolarının adlarını, boyutunu ve tarihini görebilirdi.

Yetki geri alındı, denetim hâlâ **14 yeşil**.

## 1.10 · Mekanizmaya iki yeni yapı taşı doğdu

Sisteme yeni bir yetenek eklendiğinde mekanizmanın da büyümesi gerekir. Bu turda iki temel yapı taşı eksik olduğu ortaya çıktı:

| Yapı taşı | Sorusu | Risk |
|---|---|---|
| **B16 KURTARMA** | Bozulduğunda geri dönebilir miyiz? | 🔴 KRİTİK |
| **B17 GÖRÜNÜRLÜK** | Bozulduğunu öğrenebilir miyiz? | 🟠 YÜKSEK |

Artık bu alanlara dokunan her değişiklikte `npm run etki` sizi **durduruyor** ve onay istiyor. Denendi: B16'ya dokunulduğunda mekanizma "DUR — CEO ONAYI GEREKİYOR" verdi.

## 1.11 · Mekanizmanın kendisi güçlendirildi (yan bulgu)

Kapsam denetçisine **çürüme kontrolü** eklendi: haritada yazan bir dosya yolu diskte yoksa artık hata veriyor.

İlk çalıştırmada **iki gerçek çürük** buldu:

| Haritada yazan | Gerçekte |
|---|---|
| `views/WalletView.tsx` | `views/WalletScreen.tsx` |
| `views/RahatMatchLobby.tsx` | `views/match/RahatMatchLobby.tsx` |

İkisi de düzeltildi. Bunlar sessizdi: harita o dosyaları "kapsıyorum" sanıyordu, kapsamıyordu.

Ayrıca yanlış alarm kaldırıldı: dosyaları tarama kapsamı dışında olan yapı taşları (migration'lar, yönetici paneli) artık "hiç dosya eşleşmedi" uyarısı vermiyor. **Sürekli yanan bir uyarı, bir süre sonra görülmeyen uyarıdır** — tam olarak bu oturumda savaştığımız hata.

---

# FAZ 2 — SİZİN KATILIMINIZI İSTEYEN İŞLER

Bunları tek başıma bitiremem; her biri sizin bir hesabınızı, bir onayınızı ya da 10-20 dakikanızı istiyor.

## 2.1 · Deneme ortamı (SRE-4) — 🟠 en yüksek getirili adım

**Durum:** `oyna-staging` uyandırıldı (Frankfurt, ücretsiz) ama **içi boş**.

**Neden önemli:** Bugüne kadar **24 migration doğrudan canlıya** gitti. Kaza olmadı — ama bunun sebebi **dikkat**, sistem değil. Dikkat ölçeklenmez; yorgun bir gecede kaybolur.

**Sizden istenen:** ~20 dakika, 5 komut (adım adım yazacağım).

**Açtığı kapılar:**
- Para migration'ları önce orada denenir
- CI'daki sessiz yeşil **sert başarısızlığa** çevrilebilir (1.6'nın kalıcı çözümü)
- Geri alma provası yapılabilir (SRE-8)

**Bu üç iş buna bağlı.** Deneme ortamı olmadan üçü de yapılamaz.

## 2.2 · Alarmın size ulaşması (SRE-2) — 🟠

**Durum:** Kararınız (S-2): *"şimdi değil, bu oturumda e-posta yapmayacağız."* Saygı duyuyorum; **bedelini yazıyorum.**

Bugünkü zincir: *sistem bozulur → denetçi sabah 06:40'ta yakalar → panelde kırmızı yanar → **siz bakana kadar bekler.***

Cuma akşamı ödeme bozulursa Pazartesi öğrenirsiniz.

> P-0'da bunun bedelini bir kez ödedik: bildirimler **aylarca** çalışmadı, çünkü çalışmadığını söyleyecek kimse yoktu.

**Hazır olan:** `send-email` fonksiyonu yazılmış ve yayında; yalnız Resend anahtarı yok, simülasyon modunda. Yani kod bekliyor, eksik olan tek şey bir ücretsiz hesap ve iki anahtar.

**Sizden istenen (hazır olduğunuzda):** ~10 dakika.

## 2.3 · Haftalık dış kopya (S-1 = b) — 🟡

Faz 1'deki yedek "veritabanı tamamen giderse" senaryosunu **kapsamıyor**. Kapsaması için kopyanın başka bir yerde durması gerekir.

**Sizden istenen:** haftada ~10 dakika — Supabase panelinden yedeği indirip kendi bilgisayarınızda/bulutunuzda saklamak.

**Alternatifi:** Pro plan (Faz 3).

---

# FAZ 3 — LANSMAN ÖNCESİ / SONRASI

## 3.1 · Geri alma provası (SRE-8) — 🟡
Her migration'a geri alma adımları yazdım; **hiçbiri denenmedi.** Yazılı geri alma ile *çalıştığı görülmüş* geri alma aynı şey değildir. Deneme ortamı kurulunca bir prova yapılmalı. **Bu, 2.1'e bağlı.**

## 3.2 · Pro plan
Otomatik günlük yedek + istediğiniz ana dönüş (point-in-time). 2.3'ün yerine geçer ve `PRO-1…PRO-5` maddelerini de açar.

## 3.3 · `auto-cancel-matches` kararı
İki kural iki ayrı yerde durmamalı. Ya dosya silinsin, ya veritabanındaki kopya kaldırılıp bu yayınlansın. **Önerim: dosya silinsin** — veritabanı tarafı test edilmiş ve çalışıyor.

## 3.4 · Kapsam %65'ten yukarı
Sistem haritası kaynak dosyaların **%65'ini** kapsıyor (bugün %63'tü). Kapsanmayan 105 dosya çoğunlukla ekran bileşenleri. Her biri ya bir yapı taşına bağlanmalı ya da "hiçbir temel yapıyı ilgilendirmiyor" diye kayda geçmeli.

---

# KAPSAM DIŞI — SIRADAKİ ROLE DEVREDİLENLER

Analiz sırasında güvenlik tarafında bulgular gördüm. **Düzeltmedim** — bunlar Security & Financial Infrastructure Lead'in alanı ve kapsam disiplini gereği ona bırakıyorum:

| Bulgu | Adet | Not |
|---|---|---|
| `security_definer_view` — `public_profiles` görünümü | **1 (ERROR)** | En yüksek seviyeli bulgu |
| RLS açık ama hiç kural yok | 8 tablo | Erişim tamamen kapalı olabilir ya da tam tersi — incelenmeli |
| Uzantı `public` şemasında (`cube`, `earthdistance`, `btree_gist`) | 3 | |
| Sızmış parola koruması kapalı | 1 | Supabase Auth ayarı |
| SECURITY DEFINER fonksiyon kullanıcıya açık | 428 | Çoğu tasarım gereği; **taranması** gerekir |

Son satır özellikle önemli: 428 fonksiyonun hepsi yanlış değil — uygulamanın çalışma biçimi bu. Ama **hangisinin içinde yetki kontrolü var, hangisinde yok** sorusu cevaplanmamış. Bu, sıradaki rolün ilk işi olmalı.

---

# ÖZET TABLO — SRE bulgularının son durumu

| # | Bulgu | Durum |
|---|---|---|
| SRE-1 | Düzenli yedek yok | ✅ **Kapandı** (dış kopya 2.3'te) |
| SRE-2 | Alarm size ulaşamıyor | 🟡 Kararınızla ertelendi (2.2) |
| SRE-3 | CI sessiz yeşil | ✅ **Görünür yapıldı** (sert hâli 2.1'e bağlı) |
| SRE-4 | Deneme ortamı boş | 🟡 Sizin 20 dakikanız (2.1) |
| SRE-5 | İzleme neredeyse boş | ✅ **Kapandı** — çökme kaydı + iki yeni denetim |
| SRE-6 | `auto-cancel-matches` artığı | ✅ **İşaretlendi** (silme kararı 3.3) |
| SRE-7 | Sürüm dört yerde | ✅ **Kapandı** — denetimli tek kaynak |
| SRE-8 | Geri alma prova edilmemiş | 🟡 2.1'e bağlı (3.1) |

**8 bulgunun 5'i kapandı. Kalan 3'ü tek bir şeye bağlı: deneme ortamı ve sizin katılımınız.**

---

# SON SÖZ

Sayın CEO, bu turda öğrendiğim en önemli şey şu oldu:

> **Bir koruma kurmak yetmiyor; korumanın kendisinin de denetlenmesi gerekiyor.**

Bugün üç kez aynı desenle karşılaştım:

1. **Yedek** kurdum → sessizce durursa kimse fark etmez → K-YEDEK-1 eklendi
2. **Çökme kaydı** kurdum → kimse bakmazsa yine öğrenilmez → K-COKME-1 eklendi
3. **Harita** vardı → dosya adı değişince sessizce yalan söylüyordu → çürüme denetimi eklendi (ve **hemen iki yalan buldu**)

Aynı desen, kendi hatalarımda da çıktı: yedek durumu fonksiyonunu gereksiz yere herkese açtım, güvenlik taraması yakaladı. Ek bilgi temizleyicisinin JSON'u bozduğunu **test** yakaladı. İkisi de canlıya bu hâliyle çıkmadı — çünkü denetim vardı.

Bu, projenin başından beri tekrarlanan tek hatanın kökü: **bir şey çalışmıyor ama kimse bilmiyor.** Cevabı daha çok kod yazmak değil; yazdığımız her korumanın yanına *"peki bu koruma bozulursa kim söyleyecek?"* sorusunu koymak.

Bugün sistemde **14 kontrol** var ve hepsi yeşil. Önemli olan sayı değil — önemli olan, o kontrollerin **sessiz kalamıyor** olması.
