# 🏛️ OYNA — MASTER PRENSİPLER

**Yürürlük:** 4 Ağustos 2026 · **Son güncelleme:** 24 Ağustos 2026 (kimlik kararları — §4.6…§4.10) · **Durum:** BAĞLAYICI
**Kaynak:** Danışma kurulu süreci (7 rol) sonunda alınan K-1…K-17 kararları + 16 Ağustos 2026 kurucu kararları

> Bu dosya, K-6.5 ve K-11.6 gereği **danışma kurulu süreci tamamlandığında** yazıldı ve
> `OYNA_MASTER_PRENSIPLER.md` (arşiv) dosyasının yerine geçer.
>
> **Geçerlilik sırası:** 1) canlı sistem · 2) `main` kodu · 3) **bu dosya** · 4) `docs/board/DECISIONS.md`
> Çelişki varsa **canlı sistem kazanır**. Bir kararı değiştirmek isteyen, önce buraya yazar.

---

## 0 · Bu projenin tek cümlesi

> **Sistem doğru kuruluyor, ama doğru kurulduğunu sürekli kontrol eden bir şey olmadığında
> zamanla gerçekle ayrışıyor.**

Yedi rol bağımsız çalıştı ve altısı aynı kök nedene çıktı. Bu yüzden aşağıdaki kural
diğer hepsinin üstündedir:

> **P-0 · Her koruma kurulduğunda, o korumanın kendisi de denetlenir.**
> Yeni bir güvence eklerken sorulacak soru: *"Peki bu koruma bozulursa kim söyleyecek?"*
> Cevabı olmayan koruma, yarım kurulmuş sayılır. *(K-16.4)*

---

## 1 · Ürün yönü

| # | Prensip |
|---|---|
| 1.1 | **Ana vaat: "parayı topla".** Ürün saha kiralamak değil, **kaptanın para toplama derdini bitirmek** üzerine kurulur. Bu akış kusursuz çalışır; diğer her şey ikinci sıradadır. |
| 1.2 | **İlçe bazlı doygunluk.** Kapsama yalnız **saha anlaşması olan** ilçelere açılır. Anlaşma yoksa ilçe açılmaz. |
| 1.3 | **Her yer tek tek açılır.** Genişleme sıralıdır; sistem şehir/ilçe bağımsız kurulur. Başlangıç ilçesi Altınordu olmak zorunda değildir. |
| 1.4 | **Aracıdan kaçış sözleşmeyle engellenir.** Teknik değil, ticari bir savunmadır. |
| 1.5 | **Concierge kurulum sisteme gömülüdür.** Saha sahibinin defterini bizim girmemiz için gereken ekranlar hazır olur. |
| 1.6 | **Ölçüm zorunludur.** Huni ve "başarılı maç" metriği olmadan ürün kararı verilmez. |

---

## 2 · Para

| # | Prensip |
|---|---|
| 2.1 | **Online ödeme kusursuz çalışır.** Oyuncu kapora, maç ücreti, kaleci ve hakem ücretini online öder. "Nakit moda geç" önerisi **reddedildi** — 1.1'deki vaat nakit modda çalışmaz. |
| 2.2 | **"Nakit mod" yalnız saha sahibinin elle kapattığı slottur.** Oyuncu tarafı için nakit mod yoktur. |
| 2.3 | ~~Elle kapatılan slotta komisyon alacağı doğar~~ → **DEĞİŞTİ (kurucu kararı, 17 Ağu 2026): elle kapatılan/nakit slottan komisyon DOĞMAZ.** Tesis kendi ekranından bir saati kapattığında o saat OYNA'nın dışında sayılır: ne komisyon alacağı oluşur ne de tesisin finansal tablolarına girer. Finansal tablolar YALNIZ uygulama üzerinden kartla alınan ödemeleri gösterir. |
| 2.4 | **Hiçbir maç zararına kesinleşmez.** Kadro eşiği başabaş formülünden türetilir. |
| 2.5 | **Kârlılık görünür olur.** Kârsız maçta panelde kırmızı tehlike işareti çıkar. |
| 2.6 | **Saha anlaşması tesise özeldir.** Her tesisle ayrı ticari şart mümkündür. |
| 2.7 | **İptal/iade kuralı ödeme ÖNCESİ kullanıcıya gösterilir.** Tesise göre değişebilir ama gizlenemez. |
| 2.8 | **Fiyat ve iade oranı sunucuda hesaplanır.** İstemciden gelen tutara asla güvenilmez. |
| 2.9 | **Para değişmezleri her gece sınanır.** 8 kuralın biri bile bozulursa panel kırmızı yanar. |
| 2.10 | **OYNA kullanıcı adına bakiye TUTMAZ** *(kurucu kararı, 16 Ağu 2026)*. Uygulama içi saklı bakiye ("cüzdan") 6493 sayılı Kanun kapsamında e-para ihracı sayılır; lisans yok → cüzdan yok. Ödeme İŞLEM BAŞINA karttan alınır, iadeler KARTA döner (karta-iade kodu iyzico canlısıyla birlikte v1.1). Cüzdan ancak lisanslı bir modelle ve kurucu kararıyla geri açılır. K-3.3'ün "cüzdana döner" ifadesi bu kararla "ödeme yöntemine iade edilir" olarak okunur. |
| 2.11 | **Saha, vitrine çıkacak SON saati belirleyebilir** *(kurucu kararı, 16 Ağu 2026)*. Listeleme sınırı saha bazlıdır (2.6 ile uyumlu), saha sahibi veya admin panelinden yazılır; yazılmamışsa sınır yoktur. Bitişi sınırı aşan slot oyuncuya görünmez ve uygulamadan rezerve edilemez; saha sahibinin elle yönetimi (akşam saatleri dahil) serbesttir. |
| 2.13 | **İadeden YALNIZ ödeme altyapısı bedeli düşülür** *(kurucu kararı, 19 Ağu 2026 — 17 Ağu kararını tersine çevirir; 16 Ağu kuralına dönüş)*. Kademe oranları (%100/%50/%0) durur ve ödeme ÖNCESİ gösterilir (2.7). O orandan sonra tek bir kesinti vardır: ödeme altyapısının işlem bedeli. **Taban, karttan ÇEKİLEN TOPLAM tutardır** — kısmi iadede bile — çünkü ödeme kuruluşu komisyonunu iadede geri vermez; taban iade edilen kısım olsaydı aradaki farkı OYNA üstlenirdi. OYNA kendi komisyonunu iadeden almaz. Kullanıcı bu bedeli ödemeden önce ekranda görür. |
| 2.14 | **Kart işlem bedeli kullanıcıya AYRI SATIR gösterilmez** *(kurucu kararı, 17 Ağu 2026)*. Kullanıcı tek rakam görür: karttan çekilecek toplam. Kırılım (hizmet tabanı + bedel) yönetici panelinde durur — Kullanıcı 360 → Tahsilat ve Finans → Kart İşlem Bedeli. Hesap değişmedi; ekranda yazan rakam ile çekilen rakam hâlâ birebir aynıdır. |
| 2.15 | **Taksit yoktur; kimseden TC kimlik numarası istenmez** *(kurucu kararı, 17 Ağu 2026)*. Ödeme tek çekimdir. iyzico'nun zorunlu tuttuğu kimlik alanına nötr yer tutucu gider; koda gerçek biçimde bir TC numarası gömülmez. |
| 2.12 | **Uygulamadan rezervasyon YALNIZ kartla kapora ödenerek yapılır** *(kurucu kararı, 17 Ağu 2026)*. "Tesiste ödemeli" (nakit) rezervasyon uygulamadan alınmaz: online ödemesi kapalı sahada vitrin açık kalır, oyuncu rezervasyon için tesisi arar. Kapı sunucudadır (`b_nakit_rezervasyon_kapisi`, hata: `CASH_BOOKING_DISABLED`) ve yalnız `APP_BOOKING` kaynağını kısar — maç rezervasyonu (güvencesi kapora motoru) ve sahibin elle yönetimi serbesttir. İade tabanı TEK modeldir: karttan çekilen TOPLAM (kapora + işlem bedeli) — her akışta aynı (`20260905000009`). ⚠️ O tabandan düşülen PSP kesintisi **2.13 ile kaldırıldı**; taban kuralı durur, kesinti yoktur. |
| 2.16 | **Komisyon TEK modeldir** *(kurucu kararı, 24 Ağu 2026)*. Önceden sistemde aynı anda üç oran açıktı (%15+%5, %5+%20, ayrıca panelde %10) ve hangi maça hangisinin uygulandığı belirsizdi. Yeni model tek cümle: **tesis %8,5 öder, oyuncu maça katılırken %10 öder.** ① **Saha kaporası:** kullanıcı ekranda yazanı öder, üzerine HİÇBİR ŞEY eklenmez (2.14); tesise yatan tutardan %8,5 kesilir. Kırılımı **%5,0 OYNA + %3,5 ödeme altyapısı** — ve bu %3,5'i **tesis üstlenir**, OYNA cebinden ödemez. *960 TL kapora: tesise 878,40 · OYNA 48,00 · iyzico 33,60.* ② **Maça katılım:** kişi başı ücretin üzerine %10 eklenir (*300 → 330*). ③ **Kaleci/hakem:** değişmedi, %10. Oranlar `commission_config` tablosunda tek kaynaktır; kırılım `commission_oyna_share_pct` / `commission_psp_share_pct` alanlarında durur ve **finansal tablolar OYNA gelirini hesaplarken PSP payını düşmelidir.** |
| 2.17 | **Maç ücreti slotun kendisine yazılır** *(kurucu kararı, 24 Ağu 2026)*. Her sahanın her slotu için tek bir maç ücreti (`pitch_tariffs.slot_price`) belirlenir; **kapora da kişi başı ücret de ondan türer** — ikisi elle girilmez. Kişi başı = `(slot ücreti + %10) ÷ kadro`, yukarı yuvarlanır (kimse eksik ödemez). Ücret yönetici panelinden değiştirilir. ⚠️ **Markup'ın nerede durduğu kritiktir:** maç akışı oranı `commission_config` · **GLOBAL/MODEL_A** satırından okur (`_pitch_agreement` → `create_match_atomic`). Oran başka bir satıra yazılırsa sessizce uygulanmaz — 24 Ağustos'ta tam olarak bu oldu ve doğrulama bile göremedi, çünkü `calculate_commission` doğrudan çağrıldığında doğru sonuç dönüyordu. Kilit: `tests/unit/komisyonModeli.test.ts`. |

---

## 3 · Maç yaşam döngüsü

| # | Prensip |
|---|---|
| 3.1 | **Kaptan maçı iptal edemez.** Yalnız saha sahibi ve admin iptal edebilir. |
| 3.2 | **Kaptanın maçtan çıkışı = maçın iptali** ve herkese eksiksiz iade. |
| 3.3 | **İptalde para EKSİKSİZ döner.** Kademe yok, kesinti yok. |
| 3.4 | **Kaptanın maç bırakma hakkı ayda 1 kezdir.** |
| 3.5 | **Slot devri iptal değildir.** Maç devam eder; kaptanın kaporası maçın güvencesi olarak bloke kalır, maç oynanınca ödeme havuzundan iade edilir. |
| 3.6 | **No-show işaretlenir, para cezası verilmez.** Güvenilirlik puanı düşer. |
| 3.7 | **İptal bildirimi ödeme yapan HERKESE gider** — slotu dolduran ve slotu satın alan. Tek kaynak: `_match_participant_ids()`. |

---

## 4 · Deneyim

| # | Prensip |
|---|---|
| 4.1 | **Yumuşak eşleştirme.** Sert seviye barajı yoktur; yakın seviyeli maçlar öne çıkar. |
| 4.2 | **Seviye sorusu ilk maça yazılırken sorulur**, onboarding'de değil. |
| 4.3 | **Taktik Stüdyo kalır ama öne çıkarılmaz.** |
| 4.4 | **Saha değerlendirmesi önce yalnız puandır**; yazılı yorum ikinci aşamadır. |
| 4.5 | **Bölge de konum da yoksa ülke geneli gösterilmez:** önce konum izni, verilmezse ilçe seçimi. |
| 4.6 | ~~Telefon ANA giriş yöntemidir~~ → **DEĞİŞTİ (23 Ağu 2026): telefon/SMS yolu SİLİNDİ.** Altyapısı hiç kurulmadı (SMS sağlayıcısı yok, telefonla girişi tamamlamış tek kullanıcı yok); ekranda duran ölü bir düğmeydi ve Apple'ın 5.6 reddinin kökü buydu. Numara BAĞLAMA ekranı da kaldırıldı. Geri gelmesi için önce sağlayıcının gerçekten kod göndermesi gerekir; ekran ondan SONRA yazılır. |
| 4.7 | ~~Şifre kavramı YOKTUR~~ → **DEĞİŞTİ (kurucu kararı, 24 Ağu 2026): E-POSTA + ŞİFRE ANA GİRİŞ YOLUDUR.** Google ve Apple yanında durur (Apple üstte, Kural 4.8). **Neden döndü:** Apple App Review "Sign-In Information → User name / Password" istiyor; sağlayıcı girişi bunu karşılamaz — incelemeci kendi kimliğiyle girdiğinde hazırlanmış bir hesaba değil boş bir hesaba düşer ve kaleci/hakem/tesis panellerini hiç göremez. 17 Ağustos'un "tek yol" gerekçesi de düştü: o karar telefonun ana yol olduğu bir dünyada alınmıştı, telefon 23 Ağustos'ta silindi. **Bu bir "incelemeci kapısı" DEĞİLDİR** (5.6 dersi): yol herkese açık ve herkesle aynıdır; incelemeciye verilen şey sıradan bir hesabın bilgisidir. |
| 4.7.1 | **Kayıt ekranında ROL SEÇİMİ YOKTUR** *(kurucu kararı, 24 Ağu 2026)*. Kaydolan HERKES oyuncudur. Kaleci ve hakem, Ayarlar → Sahada Rolün üzerinden **başvurur**; tesis sahibi, müdürü ve personeli **yalnız yönetici panelinden atanır** ve oyuncu panelinden bunun için başvuru yapılamaz. Gerekçe: rol, para ve slot yetkisi taşır; giriş ekranından seçtirmek yabancı birinin kendini tesis sahibi ilan etmesine kapı açardı (sunucudaki `protect_profile_columns` korumasının etrafından dolaşmak). Tesise personel katılımı bunun istisnası değildir: kod tesis sahibi tarafından üretilir, oyuncu yalnız **kabul eder**. |
| 4.7.2 | **Atanmış rol, girişte KENDİ arayüzünü açar** *(kurucu kararı, 24 Ağu 2026)*. Kaleci, hakem, tesis sahibi, müdür ve personel giriş yaptığında oyuncu paneline değil kendi paneline düşer (`shared/roles · pickLandingRole`). Onayı bekleyen veya reddedilmiş sağlayıcı ise panele değil bekleme/red ekranına düşer. |
| 4.8 | **Oturum, kullanıcının seçimine göre açık kalır** *(17 Ağu 2026; 24 Ağu 2026'da güncellendi)*. Varsayılan: çıkış yapılana kadar açık — süre sınırı yoktur, belirteç hem tarayıcı deposunda hem telefonun kendi deposunda tutulur ki işletim sistemi depolamayı temizlese de kullanıcı giriş ekranı görmesin. **"Beni Hatırla" anahtarı 24 Ağustos'ta geri geldi** ve giriş ekranında BÜYÜK durur: kapatılırsa oturum yalnız sekme/uygulama ömrü kadar yaşar. Şifresini yazan kullanıcıya bu soru gerçekten sorulmalıdır — ortak cihazda cevabı hayırdır. Şifre HİÇBİR yerde saklanmaz; hatırlanan tek şey e-posta adresidir. |
| 4.8.1 | **Kurulum sihirbazının ATLAMA YOLU YOKTUR** *(kurucu kararı, 24 Ağu 2026)*. Üst bardaki "Atla" tuşu ve özet ekranındaki "şimdilik geç" çıkışı kaldırıldı. **Neden:** tuş zaten yarı yalan söylüyordu — ad soyad, yaş veya seviye eksikse kullanıcıyı ilgili adıma geri gönderiyor, yani ekranda "Atla" yazıp atlamıyordu. Artık ekranda yazan ile yapılan aynı: **zorunlu alanlar** ad soyad · yaş · oyun stili · seviyedir ve kapıları tek yerdedir (`ctaEnabled`). **İstisna — soft alanlar:** cinsiyet ve pozisyon tercihe bağlıdır, ekranda "OPSİYONEL" etiketiyle durur ve tercih yapılmadan geçilebilir. **İstisna — konum:** bir cihaz iznidir, adımın kendi "Konumsuz devam et" çıkışıyla geçilir; mağaza kuralı gereği izin reddedilince uygulama çalışmaya devam etmelidir. Cihazda tutulan "atladım" bayrağı da kaldırıldı: kalsaydı dün atlamış kullanıcının profili sonsuza dek eksik kalır, bugün kaydolan doldurmak zorunda olurdu. Tek ölçüt sunucudaki `has_completed_onboarding`. |
| 4.8.2 | **Kurulum sihirbazında ÇIKIŞ vardır** *(24 Ağu 2026 · mağaza denetimi)*. Zorunlu alanlar gevşemez ama kullanıcı her zaman çıkabilir. Gerekçe: hesap KAYITTA açılır; çıkış yoksa yaşını/adını vermek istemeyen kullanıcı hem uygulamadan çıkamaz hem de Ayarlar'daki hesap silmeye ulaşamaz — Apple 5.1.1(v) hesabın uygulama içinden silinebilmesini şart koşar. |
| 4.9 | **Misafir gezinme YOKTUR** *(kurucu kararı, 17 Ağu 2026)*. "Önce göz at" yolu kapatıldı; uygulamaya girmek için hesap gerekir. Kayıt zaten tek ekranda bittiği için ayrı bir vitrin moduna gerek kalmadı. |
| 4.10 | ~~Yurt dışı numaraya SMS gönderilmez~~ → **KONUSUZ KALDI (23 Ağu 2026)**: SMS yolu tümüyle silindi. Maddenin yaşayan kısmı şudur ve KURAL olarak durur: **çalışmayan bir kanal için sessizce "gönderildi" denmez.** Bugün bu kural şifre sıfırlama e-postasına uygulanır — ekran "gönderildi" değil, "kayıtlıysa gönderildi" der ve e-posta gelmezse çalışan bir çıkış yolu (Google/Apple) gösterir. |

---

## 5 · Kaleci / hakem pazaryeri

| # | Prensip |
|---|---|
| 5.1 | **Pazaryeri online ödemeye açıktır, teminat şartı geçerlidir.** |
| 5.2 | Bu konudaki eski notlar (tahsilat yok / teminat çekilemiyor) **geçersizdir**. |

---

## 6 · Güvenlik ve veri

| # | Prensip |
|---|---|
| 6.1 | **Kapılar doğru kurulur ve kurulduğu sürekli ölçülür.** Yetki (GRANT) + satır kuralı (RLS) + tetikleyici — üç katman birlikte. |
| 6.2 | **Korunacak alan listesi elle hafızada tutulmaz.** Güvenlik turunun tek P0'ı, listede eksik kalan tek satırdı. |
| 6.3 | **Fonksiyonlarda yetki `PUBLIC`'ten alınır, sonra ihtiyacı olana verilir.** Yalnız `anon`'dan almak hiçbir şey değiştirmez. |
| 6.4 | **Gizli anahtar hiçbir zaman koda veya fonksiyon gövdesine gömülmez.** Vault'ta durur. |
| 6.5 | **Ödeme geri dönüşüne güvenilmez; kaynağından doğrulanır.** Tutar geri dönüşten değil, veritabanındaki kayıttan alınır. |
| 6.6 | **Çökme kayıtları üçüncü tarafa gönderilmez.** Kendi veritabanımızda durur, 30 gün saklanır, kişisel bilgi hem tarayıcıda hem sunucuda silinir. |
| 6.7 | **"Kontrol edilemedi" = KIRMIZI.** Bilinmeyen, "sorun yok" sayılmaz. |

---

## 7 · Altyapı ve operasyon

| # | Prensip |
|---|---|
| 7.1 | **Yalnız Türkiye saati geçerlidir** (`Europe/Istanbul`). Saha bazlı saat dilimi yoktur. |
| 7.2 | **`starts_at` tek doğru zaman kaynağıdır.** Metin tarih/saat veritabanınca türetilir; sapma fiziksel olarak imkânsızdır. |
| 7.3 | **Tek doğru kadro kaynağı `match_participants` + slot sahipliğidir.** |
| 7.4 | **Süpürücü politikası: ödeme alınmadıysa alınmasın, alındıysa alınsın.** Belirsizse dokunulmaz. |
| 7.5 | **Zehirli iş 3 denemeden sonra durur ve insana sorar.** Sonsuz tekrar yoktur. |
| 7.6 | **Şema değişikliği yalnız yeni migration dosyasıyla yapılır.** Uygulanmış migration asla değiştirilmez. |
| 7.7 | **Her migration kendi doğrulamasını taşır.** Beklenen sonuç oluşmadıysa migration durur ve geri alınır. |
| 7.8 | **Yedek kurmak yetmez; yedeğin kendisi denetlenir.** |
| 7.9 | **Kendiliğinden temizlenmeyen hiçbir tablo bırakılmaz.** (`cron.job_run_details` veritabanının yarısını yemişti.) |
| 7.10 | **Demo veri kalır ama gerçekle karışmaz.** Ayrım tetikleyicilerle korunur ve her gece denetlenir. |

---

## 8 · Kod kalitesi

| # | Prensip |
|---|---|
| 8.1 | **Dosya, ürün kavramına göre bölünür** — teknik katmana göre değil. Ölçüt: *kurucunun bir cümlesi = tek bir dosya.* |
| 8.2 | **Önce böl, sonra özellik ekle.** |
| 8.3 | **%20 kuralı:** her 5 günlük işin 1 günü, kullanıcının görmediği ama sonraki işleri hızlandıran işlere ayrılır. |
| 8.4 | **Bitirmeden önce zorunlu:** `npm run lint` temiz + `npm run test:unit` yeşil. |
| 8.5 | ⚠️ **"Testler yeşil" cümlesi bugün tam güvence vermez.** Testlerin tip kontrolü ve katı mod lansman sonrasına bırakıldı (65 hata). Her raporda hatırlatılır. |

---

## 9 · Mekanizma (bu projenin bağışıklık sistemi)

Kaynak: `docs/sistem/` · Kılavuz: `docs/sistem/MEKANIZMA.md`

| # | Prensip |
|---|---|
| 9.1 | **17 yapı taşı, 32 kontrol.** Tek makine-okur kaynak: `docs/sistem/YAPI-TASLARI.json`. Harita elle düzenlenmez, üretilir. |
| 9.2 | **Değişiklikten önce `npm run etki` çalıştırılır.** 🔴 KRİTİK taşlara (PARA · KAPILAR · KİMLİK · AYARLAR · KURTARMA) dokunuluyorsa iş **durur**, CEO onayı gerekir. |
| 9.3 | **Harita çürürse denetim durur.** Haritada yazan bir dosya diskte yoksa `npm run sistem:kapsam` hata verir. |
| 9.4 | **Sürüm numarası tek kaynaktan gelir** (`package.json`); sapma `npm run sistem:surum` ile yakalanır. |
| 9.5 | **Sürekli yanan uyarı, görülmeyen uyarıdır.** Yanlış alarm üreten kontrol düzeltilir ya da kaldırılır. |

---

## 10 · Kapasite ve çalışma biçimi

| # | Prensip |
|---|---|
| 10.1 | **Ekip: tek kurucu + Claude.** "Ekip tut" öneren tavsiye verilmez; tüm efor tahminleri buna göre yapılır. |
| 10.2 | **Kurucu kod okumaz.** Her açıklama sade Türkçe olur; kod yalnız kanıt olarak gösterilir. |
| 10.3 | **Canlı veritabanını okumak serbest, yazmak onaya bağlıdır.** |
| 10.4 | **`main` dalına doğrudan push edilmez.** İşler kendi dalında yapılır. |
| 10.5 | **Kapsam disiplini:** yalnız istenen iş yapılır. Yol üstünde görülen başka sorun **düzeltilmez**, özetin "fark ettiklerim" bölümünde bildirilir. |
| 10.6 | **Her görev sabit ÖZET ile biter:** Ne değişti · Neden · Nasıl kontrol edersin (tıklama adımlarıyla, terminal komutu olmadan) · Riskler & fark ettiklerim. |

---

## 11 · Bugün bilerek KAPALI olanlar

Bunlar eksik değil, **karar**dır. Açılma zamanı geldiğinde bilinçli açılır.

| Ayar | Durum | Ne zaman açılır |
|---|---|---|
| `demo_mode_enabled` | **AÇIK** (vitrinde demo maç var) | Lansman gününün 1. maddesi: **kapatılır** |
| `payment_mode_global` | **ONLINE_ONLY** (24 Ağu 2026) | — açıldı; kart kaporasız rezervasyon yapılamaz |
| `simulation_counts_as_live` | **AÇIK — geçici** (24 Ağu 2026) | iyzico canlıya alındığı gün **kapatılır**. Bu anahtar, sağlayıcı canlı değilken online ödemeyi yasaklayan güvenlik kilidinin adı konmuş tek istisnasıdır. Açık kaldığı sürece ödeme ekranı kırmızı **"Bu bir TEST ödemesidir"** uyarısını çizer (uyarı sunucudan sürülür, koda gömülü değildir) |
| `push_live_enabled` | kapalı | Lansmanda APNs/FCM hazır olunca |
| `wallet_enabled` | **kapalı — kalıcı karar** (16 Ağu 2026, §2.10) | Ancak lisanslı modelle + kurucu kararıyla; istemci bayrağı (`shared/featureFlags.ts`) ile BİRLİKTE |
| `wallet_cashout_enabled` | kapalı | Cüzdan kararına bağlı (§2.10) — cüzdan yokken çekim konusu doğmaz |
| `match_deposit_enabled` | **AÇIK** (24 Ağu 2026) | — açıldı; maçlar kaporalı kurulur |
| `KALECI_HAKEM_KIRALAMA_ACIK` | **kapalı** (24 Ağu 2026) | Kart-bloke teminat akışı UÇTAN UCA çalıştığında. Ekran (`views/Marketplace.tsx`) duruyor; kapalı olan ONA GİDEN KAPILAR (ana ekran kartları + maç lobisi bölümü). Gerekçe: sonuna kadar gezilip tamamlanamayan akış Apple 2.1 altında ret sebebi — tuşta "Kiralama Çok Yakında" yazıyordu. |
| `admin_mfa_required` | kapalı — **kurucu kararı 24 Ağu 2026: şimdilik kapalı kalsın** | Bir SUPER_ADMIN kurtarma kodlarını indirdikten sonra |
| Alarm e-postası | kapalı | Lansmandan önce (kod hazır, Resend anahtarı eksik) |
| Kayıt | **AÇIK** | — (kurucu kararı, 4 Ağu 2026) |

---

## 12 · Pro plana geçilince yeniden değerlendirilecekler

Ücretsiz planın sınırları yüzünden bugün verilen kararlar:

| # | Konu | Bugün | Pro'da |
|---|---|---|---|
| PRO-1 | Küresel canlı abonelik | kapalı | keşif kartlarında anlık doluluk geri açılabilir |
| PRO-2 | Eşzamanlı canlı bağlantı | 200 | 500 |
| PRO-3 | Görsel dönüştürme | yükleme anında çok boy | sunucu tarafı dönüştürme |
| PRO-4 | Aylık dışa veri | 5 GB | 250 GB |
| PRO-5 | Veritabanı dalı ile test | yok | her paket için geçici kopya |
| PRO-6 | Otomatik yedek + duraklama | yok / 7 günde durur | otomatik yedek, duraklama yok |

---

## 13 · Açık maddeler

Tam liste ve gerekçeler: **`docs/board/SON_KARARLAR.md`** · Raf durumu: **`RAF.md`**

**Kurucunun elinde:** deneme ortamı kurulumu · alarm e-postası · gerçek kart işlemi ·
yasal metinler (KVKK/sözleşme) · mağaza hesapları · alan adı · sızmış parola koruması ·
gerçek ad görünürlüğü kararı (KVKK)

**Sırada bekleyen teknik işler:** `public_profiles` sıkılaştırması · uzantıların
`public` şemasından taşınması · geri alma provası · bölge göçü · testlerin tip kontrolü ·
harita parçasının bölünmesi

---

## 14 · Bu belgenin kendisi hakkında

- Bir karar değişecekse **önce buraya** yazılır, sonra uygulanır.
- Buradaki her madde `docs/board/DECISIONS.md` içinde kanıtı ve gerekçesiyle durur.
- Ayrıntılı rol raporları: `docs/board/01-cpo.md` … `07-stratejik-danisman.md`
- Bu belge kararları **özetler**; bir maddenin neden böyle olduğunu merak edersen
  kaynak rapora bak.
