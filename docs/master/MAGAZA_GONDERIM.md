# OYNA — MAĞAZA GÖNDERİM KILAVUZU (App Store + Play Store)

> **Tarih:** 17 Ağustos 2026 · **Durum:** YÜRÜRLÜKTE
> Kurucu gönderime hazırlanırken bu dosya tek kontrol listesidir.
> Teknik hazırlık (kod tarafı) tamamlandı; kalanlar **kurucu işi** başlığında.

---

## 1 · Kod tarafında KAPATILAN gönderim engelleri

| # | Engel | Ne yapıldı |
|---|---|---|
| 1 | **Demo girişi üretimde AÇIKTI** — `hostname === 'localhost'` kontrolü, Capacitor uygulamayı `https://localhost` (Android) / `capacitor://localhost` (iOS) üzerinden servis ettiği için MAĞAZA paketinde de doğruydu. E-posta alanına `saha1` yazan herkes **şifresiz** olarak gerçek bir **saha sahibi** hesabına girebiliyordu. | `Capacitor.isNativePlatform()` ile native pakette demo girişi ve demo hesap seçici **her durumda kapalı**. 8 test kilitliyor. |
| 2 | **iOS gizlilik manifestosu yoktu** (Apple, Mayıs 2024'ten beri zorunlu tutuyor; eksikse yükleme ITMS-91053 ile reddedilir). | `ios/App/App/PrivacyInfo.xcprivacy` yazıldı: 4 "required reason" API beyanı (UserDefaults CA92.1 · FileTimestamp C617.1 · DiskSpace E174.1 · SystemBootTime 35F9.1) + 10 veri türü. **Xcode projesine de kaydedildi** — kayıtsız dosya pakete girmez ve aynı retle döner. |
| 3 | **Kullanıcı kendi maçını göremiyordu** — açılış yüklemesi kullanıcı giriş yapmadan koşuyor, oturum isteyen `get_my_matches` anon gidip reddediliyor ve bir daha çağrılmıyordu. İncelemeci "maç kur → maç kayboldu" görürdü. | `fbGetMyMatches` önce oturumu çözer; `refreshMyMatches` eylemi giriş anında ve ana sayfa parmakla çekilince çağrılır. |

| 4 | **Takım sohbetinde şikayet/engelleme YOKTU** (App Store 1.2 — sosyal uygulamalarda en sık ret gerekçesi). Birebir sohbette vardı, takım sohbetinde yoktu; ayrıca engellenen kişinin mesajları görünmeye devam ediyordu (engelleme o ekranda çalışmıyordu). | Mesaja **uzun basma** + üst menüde **"Üyeyi Şikayet Et / Engelle"**. Engel süzgeci hem geçmişte hem canlı akışta. Maç lobisindeki oyuncu kartına da aynı iki eylem eklendi (yabancıyla orada eşleşiliyor). |
| 5 | **Klavye açılınca kart formu ve sohbet kullanılamıyordu** — kabuk klavye kadar küçülüyor, CSS bir klavye boyu daha boşluk ekliyordu (çift telafi). Kart girme ekranı incelemecinin kesin açacağı ekran. | Telafi artık **ölçülüyor**: kabuk küçüldüyse 0, küçülmediyse tam klavye boyu. iOS/Android, eski/yeni WebView — dördünde de doğru. |
| 6 | **Android 15/16 kenardan kenara**: sistem uygulamayı zorla çubukların altına çiziyor, `overlaysWebView:false` yok sayılıyor. Açık temalı telefonda durum çubuğu simgeleri görünmüyor, koyu uygulamanın üstünde/altında beyaz bantlar oluşuyordu. | Capacitor 8'in gömülü `SystemBars` eklentisi yapılandırıldı (`style: 'DARK'`), güvenli alan iki kaynaktan (`env()` + eklenti değişkeni) okunuyor, pencere zemini koyuya sabitlendi. |
| 7 | **11 ekranda başlık/geri düğmesi çentiğin altındaydı** — aralarında incelemecinin ilk açtığı **gizlilik/sözleşme** ekranı ve **veli onayı** ekranları. iPhone'da geri düğmesi görünmüyordu. | Hepsi güvenli alana bağlandı. Kaleci/hakem panelinin alt menüsü de Android'in 3 tuşlu çubuğunun altından çıkarıldı. |
| 8 | **Yaş kapısı yarım kapatılmıştı**: çark düzeltilmişti ama **"Atla"** tuşu yaşı sormadan geçiyordu. | "Atla" da aynı kapıdan geçiyor (ad-soyad ve seviye kapılarının ikizi). |
| 9 | **`npm run sync:ios/android` uygulamayı YENİDEN DERLEMİYORDU** — diskte ne varsa onu pakete kopyalıyordu. Son düzeltmeler mağazaya hiç gitmeyebilirdi. Ayrıca **yönetim paneli (~1 MB)** her oyuncunun telefonuna iniyordu. | Komutlar önce `build:mobile` çalıştırıyor; mobil derlemede admin girişi pakete **hiç alınmıyor**. Doğrulandı: `dist/` içinde admin dosyası yok. |
| 10 | **Yanlış `.env` ile paket derlenebiliyordu** (demo şifreleri gömülü ya da sunucu adresi `localhost`). İkisi de sessiz: paket derlenir, imzalanır, hata ancak kullanıcıda görülür. | **Derleme bekçisi**: mobil pakette bu iki durumdan biri varsa derleme DURUR ve sebebi Türkçe yazar. (Bu gece ikisini de gerçekten yakaladı.) |
| 11 | **Android bildirimleri**: sunucu `oyna_main` kanalına gönderiyordu, o kanal hiç oluşturulmamıştı; küçük ikon beyan edilmediği için bildirimler **beyaz kare** ikonla ve "Diğer" başlığı altında çıkıyordu. | Kanal açılışta kuruluyor (kimlik sunucuyla birebir), manifest'te ikon + renk + varsayılan kanal beyan edildi. |
| 12 | **"Hareketi azalt" açık olan kullanıcıda 9 ekranda aşağı çekip yenileme ÖLÜYORDU** (kaydırma motoru hiç kurulmuyordu). Yenileme süs değil, işlev. | Motor kuruluyor, yalnız animasyon atlanıyor. |
| 13 | **KVKK onay kutusu 20×20 px** — Apple 44pt, Google 48dp altı "dokunulamaz" sayılır; ıskalanan kutu kaydı tamamen durdurur. | Görünen kutu aynı, **dokunma alanı 44px**. |
| 14 | **Kaleci/hakem sayfasında olmayan bir ödeme güvencesi vaat ediliyordu** ("kartında bloke edilir", "maç kesinleşince tahsil edilir") ama işlem sonunda "çok yakında" hatası çıkıyordu (Apple 2.1 / Google yanıltıcı beyan). | Metin gelecek zamana çevrildi, düğme **"Kiralama Çok Yakında"** oldu; kullanıcı 4 adım yürüyüp duvara çarpmıyor. |
| 15 | **Gizlilik beyanı gerçek davranışla uyuşmuyordu**: uygulama GPS ile **kesin konum** alıyor, beyanda yalnız "yaklaşık konum" vardı. | `PrivacyInfo.xcprivacy`'ye kesin konum eklendi (11 veri türü). İki mağazanın formu da bu dosyadan doldurulacak. |
| 16 | **3DS dönüşü uygulamadan çıkabilirdi**: banka doğrulaması bitince iyzico bizim uç fonksiyonumuza (`*.supabase.co`) döner; o adres izin listesinde olmadığı için Capacitor son adımı **Chrome'a** atabilirdi — para çekilmiş, sonuç okunamamış olurdu. | Adres izin listesine eklendi. (`'*'` YAZILMADI: o zaman harita/WhatsApp bağlantıları da uygulama içinde açılırdı.) |
| 17 | **Yasal metin kendisiyle çelişiyordu**: iadeler karta denirken hemen altındaki maddeler "cüzdanınızdaki tutarı harcayabilirsiniz / %5 kesintiyle çekebilirsiniz" diyordu; mücbir sebep ve tesis kaynaklı iptal maddeleri de parayı cüzdana gönderiyordu. | Uygulama içi metin + kaynak sözleşme hizalandı: **tüm iadeler ve telafi bedeli karta**; cüzdan maddesi "YÜRÜRLÜKTE DEĞİLDİR" damgalı. |
| 18 | **Push bildirim jetonu beyan DIŞIydı**: uygulama cihazın bildirim jetonunu sunucuya yazıyor (bu, mağaza formlarında "Cihaz veya diğer kimlikler"), gizlilik manifestosunda karşılığı yoktu. Ayrıca kamera izninin gerekçesi **koddan kaldırılmış** bir özelliği ("QR kod taramak") vaat ediyordu. | `PrivacyInfo.xcprivacy`'ye **cihaz kimliği** eklendi (İzleme: hayır) → **12 veri türü**. iOS izin gerekçeleri gerçek kullanıma göre yeniden yazıldı ve her birinin kaynak koddaki kanıtı dosyaya işlendi. **Fotoğraf kitaplığına yazma izni İNCELENDİ ve KALDI** — silinseydi bilet/taktik görselini "Görseli Kaydet" ile kaydeden kullanıcıda uygulama çökerdi. |
| 19 | **Beyan hâlâ eksikti**: uygulama hesap kimliği (UUID) ve satın alma geçmişi (ödenen kaporalar) tutuyor; gizlilik manifestosunda ikisinin de karşılığı yoktu. Play "Veri Güvenliği" formu bu dosyadan doldurulacağı için eksik burada başlayıp forma yayılıyordu. | `NSPrivacyCollectedDataTypeUserID` ve `...PurchaseHistory` eklendi → **14 veri türü** (ikisi de İzleme: hayır). |
| 20 | **Sahte kaleci/hakem gerçek vitrinde görünüyordu**: kaleci/hakem vitrini demo süzgecini yanlış yerden (tablo sütunu) okuyordu; demo işareti ise KİMLİKTE (`profiles.is_demo`) tutuluyor. Canlıda 1 sahte kaleci + 2 sahte hakem listeleniyordu. | Vitrin artık kimliği soruyor ve mevcut satırlardaki işaret kimlikle eşitlendi. Doğrulandı: vitrinde 0 sahte sağlayıcı, 4 gerçek tesis. |

## 2 · Kurucu kararlarıyla yapılan ürün değişiklikleri (17 Ağu)

- **Ana sayfa maç kutusu**: profil kartı yerinde; yanındaki kutu (cüzdan kalktığı için) kolonun tamamını kaplar ve **her zaman** çizilir — maç varsa "MAÇ YAKLAŞIYOR + gün/saat + geri sayım", yoksa "MAÇ YOK".
- **"Tesisi ara" yönlendirmesi kaldırıldı** (vitrin CTA'sı, ödeme ekranı metni, hata sözlüğü). Nakit rezervasyon kapısı **sunucuda** duruyor.
  *Not:* listeleme sınırı açıklamasındaki "sonraki saatler için tesisi arayabilirsin" **farklı bir durumdur** (§2.11 — saha akşamı elle yönetir) ve korundu; istenirse o da kaldırılır.
- **İade kesintisi tek model**: iade tabanı karttan çekilen toplam, üzerinden tek PSP kesintisi (her akışta aynı).
- **Nakit rezervasyon kaldırıldı** (§2.12): uygulamadan rezervasyon yalnız kartla kapora ile.

## 3 · Zaten hazır olduğu DOĞRULANANLAR

| Şart | Durum |
|---|---|
| Hesap silme, uygulama içinden (App Store 5.1.1(v)) | ✅ `DeleteAccountModal`, Ayarlar'dan erişilir; sunucuda `request_account_deletion` + bekleme süresi + admin kuyruğu |
| Apple ile giriş (4.8 — Google girişi olduğu için zorunlu) | ✅ `loginWithApple` + Capacitor eklentisi |
| Engelleme / şikayet (1.2 — kullanıcı içeriği var) | ✅ Engellenenler yönetimi, kullanıcı şikayeti, saha içeriği bildirimi |
| Android hedef sürüm (Play şartı 35) | ✅ `targetSdk 36` |
| Donanım geri tuşu (Android) | ✅ overlay → yığın → uygulamayı arka plana al; 3DS sırasında kilitli |
| Güvenli alanlar + klavye | ✅ `viewport-fit=cover`, `--safe-*`, `--kb-height` |
| Dikey kilit (iki platform) | ✅ Info.plist + AndroidManifest (Android 16 uyumlu özellik bayrağıyla) |
| İzin gerekçe metinleri (iOS) | ✅ kamera, konum, fotoğraf, rehber |
| Üretim derlemesi | ✅ `npm run build` temiz; kod bölme yerinde |
| Birim testleri | ✅ 1746 test yeşil |

---

## 4 · KURUCU İŞİ — gönderimden önce

### Her iki mağaza
1. **Gizlilik politikası + kullanım şartları PUBLIC URL** (mağaza formları ister).
   Uygulama içi metinler hazır; yayınlanmış bir adres gerekiyor.
2. **İncelemeci hesabı**: demo girişi artık pakette kapalı olduğundan incelemeciye
   **gerçek bir e-posta + şifre** verilmeli (ör. `inceleme@oyna.app`, güçlü şifre).
   Bu hesabın Ordu/Altınordu bölgesinde görebileceği maç ve saha olmalı.
3. **Ekran görüntüleri** (telefon boyutları) ve mağaza metinleri.
4. **Yaş derecelendirmesi** formu (uygulamada reşit olmayan akışı + veli onayı var).

### App Store'a özel
5. **App Review notu** (öneri metni):
   > OYNA, halı saha rezervasyonu ve maç organizasyonu uygulamasıdır. Uygulama
   > içi ödemeler **fiziksel hizmet** bedelidir (saha kiralama kaporası, maç
   > katılım payı); dijital ürün veya abonelik satışı yoktur — Kural 3.1.5(a).
   > Ödeme altyapısı iyzico'dur.
6. **Gizlilik etiketleri**: `PrivacyInfo.xcprivacy` içindeki **14 veri türüyle**
   birebir doldurulmalı (dosya kaynak olarak kullanılabilir).
   Sayı 17 Ağu'da 12'ye çıktı: **kesin konum** ve **cihaz kimliği** eklendi.
   *Cihaz kimliği = push bildirim jetonu.* Uygulama bildirim gönderebilmek için
   cihazın jetonunu sunucuya yazıyor (`notifications/pushService.ts`); formda
   **"Cihaz Kimliği / Device ID"** kutusu işaretlenmeli, **"İzleme" işaretlenMEmeli**.
7. Sign in with Apple yapılandırması (Bundle ID eşleşmesi) Apple Developer'da.

### Play Store'a özel
7b. **`google-services.json` (Firebase) — BİLDİRİMLER BUNA BAĞLI.**
    Dosya depoda yok (doğru, gizli dosya). Ama derleme betiği dosya yoksa
    **sessizce devam ediyor** ve "imzalı paket üretildi" der; bildirimlerin ölü
    olduğunu hiçbir yerde söylemez. Firebase Console → `com.oyna.app` →
    `google-services.json` indir → `android/app/` altına koy (ya da CI'da
    `GOOGLE_SERVICES_JSON` gizli değişkenine yapıştır) → paketi **yeniden** üret.
    Bildirim, halı saha uygulamasında kullanıcıyı geri getiren ana mekanizmadır.

8. **Veri güvenliği (Data Safety) formu** — `PrivacyInfo.xcprivacy` içindeki
   **14 veri türü** ile birebir. Dikkat: **Kişiler (rehber)**, **kesin konum**
   ve **cihaz kimliği (push jetonu)** satırları mutlaka işaretlenmeli — izin
   listesinde isteyip formda beyan etmeyen sürümler otomatik takılıyor.
   *(`docs/master/PLAY_STORE_YUKLEME_ADIMLARI.md` içindeki eski tabloyu
   KULLANMA: orada "Kişiler" satırı yok ve konum "yaklaşık" yazıyor.)*
9. **Hassas izin beyanı**: `READ_CONTACTS` için Play Console'da amaç beyanı
   ("rehberden arkadaş bulma"; numaralar cihazda şifrelenir, rehber olduğu gibi
   sunucuya yüklenmez).
10. **Kapalı test**: kişisel hesapta production öncesi **12 tester × 14 kesintisiz
    gün** (LANSMAN_PLANI Faz C — takvimi bu belirliyor, en erken başlatılmalı).
11. İmzalı AAB için keystore.

### Derleme anında
12. **Paketi `npm run sync:ios` / `npm run sync:android` ile üret.** Bu komutlar
    artık önce uygulamayı yeniden derler, yönetim panelini pakete almaz ve
    yanlış `.env` varsa **derlemeyi durdurur** (demo hesapları açık ya da sunucu
    adresi yerel ise sebebini yazar). Yani "derleme geçtiyse paket doğrudur".
13. iOS'ta her yüklemede **Build numarası artırılır** — adımları hemen aşağıdaki
    *"Her iOS yüklemesinde"* başlığında.

### Her iOS yüklemesinde

Bunlar **her App Store yüklemesinde tekrarlanır** — ilk gönderimde de, ret sonrası
ikinci denemede de.

**A) Eklentileri pakete işle (atlanırsa özellikler sessizce ölür).**
   Terminalde, proje klasöründe:
   ```
   npm run sync:ios
   cd ios/App && pod install && cd ../..
   ```
   Neden şart: `ios/App/Podfile.lock` şu an **çok eski** — içinde yalnız 4 eklenti
   yazılı, Podfile'da 15 tane var; üstelik dosyadaki yollar **başka bir bilgisayarın**
   klasörünü gösteriyor. Bu iki komut çalışmadan Xcode'da derlenirse rehber, konum,
   kamera, klavye, açılış ekranı gibi eklentiler pakete **girmez**. Ayrıca bilet ve
   taktik görselini kaydetmeyi sağlayan iki yeni eklenti (`@capacitor/share`,
   `@capacitor/filesystem`) de ancak bu komutlarla native tarafa eklenir.

**B) Build numarasını 1 artır.**
   1. `ios/App/App.xcworkspace` dosyasını Xcode ile aç (`.xcodeproj` değil).
   2. Sol üstteki mavi proje simgesine tıkla.
   3. Ortadaki listede **TARGETS** altındaki **App** satırını seç.
   4. Üstteki sekmelerden **General**'e geç.
   5. **Identity** kutusundaki **Build** alanına bak. Şu an `1` yazıyor.
   6. Bu sayıyı **bir artır** ve Enter'a bas: ilk yükleme `1`, ikinci yükleme `2`,
      üçüncü `3`… (Yanındaki **Version** alanı `3.0.0` kalır; onu ancak kullanıcıya
      duyurulacak yeni bir sürümde değiştir.)
   7. Sonra `Product → Archive` ile yükle.

   **Neden:** App Store aynı Build numarasını iki kez kabul etmez. Ret yiyip düzeltip
   yeniden yüklemek istediğinde, sayıyı artırmadıysan Xcode *"bu sürüm zaten var"*
   benzeri bir hata verir ve **ne yapman gerektiğini söylemez**. Sayıyı artırmak
   dışında yapılacak bir şey yoktur; panik gerektirmez.

---

## 5 · Ödeme durumu — AÇILDI (17 Ağustos 2026)

Ödeme modu kurucu onayıyla **açıldı**; incelemeci artık kaporayı gerçekten
ödeyebilir. Aşağıdakiler canlıda yapıldı ve tek tek doğrulandı.

| Ne | Önce | Şimdi |
|---|---|---|
| `app_config.payment_mode_global` | `CASH_ONLY` | **`ONLINE_ONLY`** |
| `app_config.payment_provider` | `IYZICO` | `IYZICO` (değişmedi) |
| Vitrindeki 4 tesiste online ödeme | kapalı | **açık** (hepsinde `online_allowed=true`) |

**Neden tek satır yetti:** `resolve_payment_mode` iki kapı sorar — sağlayıcı
canlı mı (`payment_provider ≠ SIMULATION/DISABLED`) ve genel mod ne. Sağlayıcı
kapısı zaten açıktı; kapalı olan yalnız genel moddu.

**Kanıt (canlıda yoklandı):** 27 Temmuz 2026 tarihli bir ödeme kaydında gerçek
bir iyzico işlem numarası (`36967006`) ve tamamlanmış 3D Secure sonucu
(`mdStatus: 1`) duruyor — yani anahtarlar tanımlı ve zincir uçtan uca çalışmış.

**GERİYE KALAN TEK BELİRSİZLİK — anahtar CANLI mı, TEST mi?**
Bunu koddan anlamak mümkün değil; sunucu gizli değişkenlerine bakmak gerekiyor:
Supabase → Edge Functions → Secrets → `IYZICO_API_KEY`. Değer **`sandbox-` ile
başlıyorsa test modudur** ve gerçek kart çalışmaz. O durumda canlı anahtarlarla
değiştirilmeli. `IYZICO_BASE_URL` yazılmamışsa canlı adres kullanılır (doğru).

**Yine de yapılmalı:** iPhone ve Android'de **küçük tutarlı gerçek bir kart
provası**. Bakılacak tek şey: banka SMS ekranı uygulamanın İÇİNDE açılmalı,
Chrome'a düşmemeli (bu gece `*.supabase.co` izin listesine eklendi).

### 5.1 · Geri alma (bir şey ters giderse)

```sql
-- Ödemeyi tekrar kapatır; yeni derleme gerekmez, anında etkilidir.
UPDATE public.app_config SET value = '"CASH_ONLY"'::jsonb
WHERE key = 'payment_mode_global';
```

### 5.2 · Canlı veri temizliği (yapıldı)

Test için oluşturulan 5 sahte tesis ("Denek Arena" vb.) ve 105 sahte kullanıcı
**silindi** — gerçek uygulamada görünüyorlardı. Kontrol edildi: bu kayıtlara
gerçek bir kullanıcıdan tek bir katılım ya da rezervasyon bağlı değildi.
Vitrinde şimdi **4 gerçek tesis** var (Ahmet Kuru Tesisleri · Capo Arena ·
Olimpiyat · VIP Arena), hepsi fiyatlı ve günde 10-15 rezerve edilebilir saat
gösteriyor. Gerekirse tohum betiğiyle yeniden kurulabilir
(`tests/canli-test/tohum.sql`).

### 5.3 · KURUCU: düzeltilmesi gereken tesis verisi

Bunlar kod değil **veri** sorunudur; yalnız sen düzeltebilirsin.

| Tesis | Sorun | Etkisi |
|---|---|---|
| **Ahmet Kuru Tesisleri · 2. Saha** | Hafta içi 15:00-23:00 tarifesinde saat ücreti **0 ₺** | O saatler satılamaz. Sunucu artık rezervasyonu hiç yazmıyor (aşağıdaki kapı); fiyat girilince kendiliğinden açılır |
| **Orduspor** ve **Cumhuriet Gençlik** | Hiç tarife yok | Takvimleri boş görünüyor; vitrinde de listelenmiyorlar |
| **"Cumhuriet Gençlik"** | Ad yazım hatası ("Cumhuriyet") | Kullanıcıya görünen ad; işletmenin kendi tercihi olabilir diye DEĞİŞTİRİLMEDİ |

> **Satılamaz saat kapısı (bu gece eklendi):** ücreti 0 ₺ olan bir saate
> uygulamadan rezervasyon **alınmıyor**. Eskiden rezervasyon CONFIRMED yazılıyor,
> hemen ardından ödeme adımı "tutar yok" diye duruyordu: saat dolu görünüyor,
> karşılığında tahsilat olmuyordu. Artık kullanıcı sebebini okuyup başka saat
> seçiyor. (Kapora 0 olan tarifeler BOZUK SAYILMAZ — uygulama fiyatın %30'unu
> kapora sayar.)
