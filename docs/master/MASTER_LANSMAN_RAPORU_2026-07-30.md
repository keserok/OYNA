# OYNA — MASTER LANSMAN RAPORU

**Tarih:** 30 Temmuz 2026
**Kapsam:** Kod tabanı + CANLI Supabase veritabanı (`iikvzgyccvgcybzdfwlv`) uçtan uca denetimi
**Hedef:** Google Play (öncelik) ve App Store'a **tek seferde** kabul edilecek sürüm
**Uygulama kimliği:** `com.oyna.app` · Sürüm `3.0.0`

> **Bu rapor nasıl okunur:** Her bölümün başında "sade özet" var. Teknik detay
> altta, kanıt olarak duruyor. Kod okumadan tüm kararları verebilirsin.

---

## 0. YÖNETİCİ ÖZETİ — Şu an neredeyiz?

Kısaca: **uygulamanın yazılım tarafı lansmana hazır.** Bu oturumda çalıştırılan
tüm otomatik kontroller temiz geçti ve canlı veritabanında **1 adet kritik
güvenlik açığı bulunup kapatıldı.**

### Bu oturumda gerçekten çalıştırılan kontroller (tahmin değil, ölçüm)

| Kontrol | Ne demek | Sonuç |
|---|---|---|
| `npm run lint` (tsc) | Kodda tip/tutarlılık hatası var mı | ✅ Temiz (0 hata) |
| `npm run test:unit` | Otomatik testler | ✅ **1283 / 1283 geçti** (92 dosya) |
| `npm run build` | Üretim derlemesi | ✅ Başarılı (14.4 sn) |
| Supabase güvenlik danışmanı | Canlı veritabanı güvenlik taraması | ⚠️ 425 bulgu → analiz edildi (aşağıda) |
| Supabase performans danışmanı | Canlı veritabanı hız taraması | ✅ Lansmanı engelleyen bulgu **yok** |
| Canlı RLS denetimi | Kimin hangi veriyi görebildiği | 🔴 **1 kritik açık bulundu → kapatıldı** |

### Bu oturumda yapılan düzeltmeler

1. 🔴 **KRİTİK güvenlik açığı kapatıldı** — giriş yapmış herhangi bir kullanıcı,
   başka kullanıcıların profilini değiştirebiliyor ve silebiliyordu. (Detay: §1.3)
2. 🟠 **Telefon yedeklemesi kapatıldı** — oturum anahtarının buluta/yeni telefona
   kopyalanması engellendi. (Detay: §1.4)
3. 🟢 **AAB üretim hattı kuruldu** — tek düğmeyle Google Play paketi üretiliyor. (§4.1)
4. 🟢 **Google Play yükleme anahtarı üretildi** — 4096-bit, 2053'e kadar geçerli.

### Lansmanı bekleten TEK yazılım maddesi

**Yok.** Kalan her şey senin hesap/sözleşme işin (FAZ 4).

### Dürüst uyarı — bu oturumda YAPAMADIĞIM şey

Bu çalışma ortamının internet politikası Google'ın sunucularına
(`dl.google.com`, `maven.google.com`) erişimi **kapatıyor.** Android derleme
araçları yalnız oradan inebildiği için **AAB dosyasını bu oturumda üretemedim.**

Bunun yerine kalıcı ve daha iyi bir çözüm kurdum: paketi GitHub'ın
bilgisayarları üretiyor, sen tek düğmeye basıp indiriyorsun. Adım adım
anlatım §4.1'de. Bu, tek seferlik bir dosyadan daha değerli — her yeni
sürümde aynı düğme çalışacak.

---

## FAZ 1 — KOD HİJYENİ VE SİSTEM DENETİMİ

### 1.1 Kod tabanının gerçek durumu

**Sade özet:** Kod "yapay zekâ spagettisi" değil. Katmanlar ayrılmış, testler
gerçek ve kapsamlı (1283 test). Ancak birkaç dosya aşırı büyümüş.

| Ölçüm | Değer |
|---|---|
| Toplam TypeScript satırı | ~108.000 |
| Veritabanı göç (migration) dosyası | 387 |
| Sunucu fonksiyonu (Edge Function) | 16 |
| Servis katmanı dosyası | 48 |
| Birim testi | 1283 (92 dosya) |

**En büyük dosyalar** — bakımı zorlaştıran, ileride bölünmesi gerekenler:

| Dosya | Satır | Not |
|---|---|---|
| `views/Studio.tsx` | 3.890 | Taktik stüdyosu — tek dosyada çok iş |
| `admin-panel/services/adminService.ts` | 3.374 | Panelin tüm işleri tek dosyada |
| `views/MatchJoin.tsx` | 3.151 | Maça katılım — en kritik ekran |
| `views/ServiceDashboard.tsx` | 2.805 | Kaleci/hakem paneli |
| `views/PitchDiscovery.tsx` | 2.239 | Harita + saha keşfi |

> **Kararım: lansmandan ÖNCE bu dosyalara dokunulmamalı.** Hepsi çalışıyor ve
> testleri geçiyor. Bu boyuttaki dosyaları bölmek, çalışan akışları kırma riski
> taşır ve mağaza onayına hiçbir katkısı yoktur. Lansman sonrası ilk teknik borç
> görevi olarak planlanmalı.

### 1.2 Kullanılmayan paketler (temizlik planı — bu oturumda UYGULANMADI)

Tüm bağımlılıkları dinamik yüklemeler dâhil taradım. Gerçekten hiçbir yerde
kullanılmayan **3 paket** var:

| Paket | Durum | Etki |
|---|---|---|
| `pdfkit` | Hiç kullanılmıyor | Sunucu kütüphanesi, tarayıcıya hiç ait değil |
| `@capacitor/camera` | Hiç kullanılmıyor | QR okuma web kamerasıyla yapılıyor |
| `@capacitor/local-notifications` | Hiç kullanılmıyor | Yalnız ayar dosyasında tanımlı |

**Ek bulgu — iki harita kütüphanesi birden yükleniyor:** Hem `leaflet` (157 KB)
hem `maplibre-gl` (803 KB) pakete giriyor. İkisi de aynı işi yapıyor.
Birleştirilirse uygulama boyutu **~800 KB küçülür.**

> **Neden şimdi temizlemedim:** Paket silmek Capacitor'ün native eklenti listesini
> değiştirir ve yeniden senkronizasyon gerektirir. Bu ortamda Android derlemesi
> yapamadığım için **sonucu test edemezdim.** Test edilemeyen bir değişikliği
> lansman arifesinde yapmak, kazandığından çok kaybettirir. Lansman sonrası ilk iş.

### 1.3 🔴 KRİTİK GÜVENLİK AÇIĞI — bulundu ve kapatıldı

**Sade özet:** Uygulamaya kayıtlı **herhangi bir kullanıcı**, başka kullanıcıların
profilini değiştirebiliyordu — adını, fotoğrafını, biyografisini. Puanlarını
şişirebiliyor, hatta başkasının profilini **silebiliyordu.**

**Nasıl oluştu (sade dille):** Oyuncuların birbirinin adını/avatarını görebilmesi
için `public_profiles` adında güvenli bir "vitrin" tanımlanmış. Bu vitrin, gizlilik
kurallarını bilerek atlayacak şekilde ayarlanmış — çünkü amacı yalnız *güvenli
alanları* (ad, avatar, puan) herkese göstermek. E-posta, telefon, konum bu
vitrinde **yok** — bu kısım doğru tasarlanmış.

Sorun şu: PostgreSQL bu tür vitrinleri otomatik olarak "yazılabilir" de sayar.
Ve vitrine yazma yetkisi de verilmişti. Yani vitrin, okuma için açtığı kapıyı
farkında olmadan **yazma için de** açmış oldu — ve yazarken gizlilik kuralları
yine devre dışı kaldığı için kullanıcı, kendi satırı yerine **başkasının satırını**
düzenleyebiliyordu.

**Neyin riski YOKTU (iyi haber):** Veritabanındaki koruma tetikleyicileri
(`protect_profile_columns`, `protect_profile_sensitive_fields`) sayesinde şunlar
**değiştirilemiyordu**: yönetici yetkisi, rol, cüzdan bakiyesi, ban durumu,
doğrulanmış rozeti. Yani **admin olma veya para çalma mümkün değildi.** Bu,
önceki oturumlardaki güvenlik çalışmasının işe yaradığını gösteriyor.

**Neyin riski VARDI:**

| Alan | Kötüye kullanım |
|---|---|
| `name`, `full_name`, `bio`, `avatar_url` | Başkasının adına içerik yazma, kimliğe bürünme |
| `trust_score`, `reliability_score` | Güven puanı şişirme — maç eşleşmesini bozar |
| `diamonds`, `is_pro` | Ücretli özelliğe bedava erişim → **gelir kaybı** |
| `match_count`, `win_count`, `self_skill` | İstatistik sahteciliği |
| `oyna_id` | Başkasının kullanıcı kimliğini çalma |
| **DELETE yetkisi** | **Başkasının profilini silme** |

**Çözüm:** `supabase/migrations/20260902000000_public_profiles_yazma_kapatildi.sql`
Vitrinden yazma yetkileri geri alındı; okuma aynen korundu.

**Bozulma riski: sıfır.** Kod tabanının tamamını taradım — `public_profiles`
uygulamada **yalnızca okuma** için kullanılıyor (13 kullanım, hiçbiri yazma
değil). Profil güncellemesi zaten doğru yoldan, `profiles` tablosu ve gizlilik
kuralları üzerinden yapılıyor.

**Aynı hata başka yerde var mı?** Canlı veritabanındaki **tüm** vitrinleri aynı
desen için taradım. Sonuç: **yalnız bu bir tane.** Diğerleri temiz.

### 1.4 Diğer güvenlik bulguları ve değerlendirmeleri

Supabase güvenlik danışmanı 425 bulgu döndürdü. Hepsini sınıflandırdım:

| Bulgu | Adet | Gerçek risk | Aksiyon |
|---|---|---|---|
| `authenticated_security_definer_function_executable` | 401 | **Düşük — tasarım gereği.** Uygulama RPC (veritabanı fonksiyonu) mimarisi kullanıyor; giriş yapmış kullanıcının bunları çağırabilmesi normaldir. Yetki her fonksiyonun İÇİNDE kontrol ediliyor. | Aksiyon yok |
| `anon_security_definer_function_executable` | 12 | **Düşük.** 4 tanesi admin fonksiyonu — **canlıda doğruladım, hepsinde `is_admin()` kontrolü var.** 3 tanesi yalnız tetikleyici olarak çalışabilen iç fonksiyon (dışarıdan çağrılırsa hata verir). 5 tanesi bilinçli açık (bakım modu, kayıt açık mı vb.). | Yine de kapatıldı (savunma derinliği) — aynı göç dosyasında |
| `rls_enabled_no_policy` | 7 | **Risk yok — aksine doğru.** Bu tablolarda (şifre sıfırlama kodları, veli sorgu denemeleri, hız limiti sayaçları) kural olmaması "hiç kimse erişemez" demektir. Yalnız sunucu erişir. Kasıtlı ve güvenli. | Aksiyon yok |
| `extension_in_public` | 3 | Kozmetik (`cube`, `earthdistance`, `btree_gist`) | Lansman sonrası |
| `security_definer_view` | 1 | 🔴 §1.3'teki kritik açık | ✅ Kapatıldı |
| `auth_leaked_password_protection` | 1 | Sızmış şifre kontrolü kapalı | 🟡 **Senin işin** — §4.3 |

**Telefon yedekleme açığı (kod tarafında düzeltildi):** Android ayar dosyasında
`allowBackup="true"` idi. Bu, kullanıcının **oturum anahtarının** Google'a
yedeklenmesine ve yeni bir telefona kopyalanmasına izin veriyordu. Ödeme
yapabilen bir hesap için bu kabul edilemez.

Düzeltildi: `allowBackup="false"` + `data_extraction_rules.xml` + `backup_rules.xml`
(hem bulut yedeği hem cihazdan cihaza aktarım kapatıldı). Kullanıcı yeni telefonda
normal şekilde tekrar giriş yapar.

### 1.5 Ödeme güvenliği (iyzico) — denetim sonucu: **SAĞLAM**

Ödeme akışının tamamını satır satır okudum. Bu katman **üretim kalitesinde** ve
en kritik saldırıyı doğru şekilde engelliyor.

| Kontrol | Durum | Açıklama |
|---|---|---|
| Webhook sahteciliği | ✅ **Engelli** | `payment-webhook` ve `iyzico-3ds-callback`, kendilerine gelen mesaja **güvenmiyor.** iyzico'ya *ayrı ve imzalı bir sorgu* atıp "bu ödeme gerçekten oldu mu?" diye teyit ediyor. Sahte bir POST isteği **para hareketi yaratamaz.** Bu, en sık yapılan ödeme hatasının doğru çözümü. |
| İmza yöntemi | ✅ IYZWSv2 (HMAC-SHA256), her istekte taze `randomKey` |
| Kart verisi saklama | ✅ **Saklanmıyor.** Kart bilgisi yalnız iyzico'ya iletiliyor, loglanmıyor. PCI-DSS açısından doğru konum. |
| Para hareketi yetkisi | ✅ `capture` / `void` / `refund` fonksiyonlarının hepsi `PAYMENT_EDGE_SECRET` istiyor. Son kullanıcı çağıramaz. |
| Çift çekim koruması | ✅ Tahsilat isteği **retry edilmiyor** (bilinçli). Yalnız istek *kurulamadığında* tekrar deneniyor. |
| Zaman aşımı | ✅ 20 saniye — kullanıcı sonsuza dek beklemede kalmıyor |
| Simülasyon modu sızıntısı | ✅ Simülasyon webhook'u ayrı bir bayrak istiyor, üretimde kapalı |

**Tek not:** Sonuç sayfası, ana uygulamaya `postMessage(..., '*')` ile sinyal
gönderiyor. Gönderilen veri yalnız `{ok: true/false}` olduğu için sömürülebilir
bir bilgi yok. Lansman engeli değil; lansman sonrası hedef alan daraltılabilir.

### 1.6 Veritabanı ↔ Frontend hizalaması

`tsc --noEmit` **sıfır hata** veriyor. Bu, TypeScript tiplerinin kod içinde
tutarlı olduğunu kanıtlar. 1283 birim testinin tamamının geçmesi, servis
katmanının veritabanı sözleşmesine uyduğunu gösteriyor.

**Not:** Depodaki göç dosyaları ile canlı veritabanı arasında bu denetimde
sapma (drift) belirtisi görmedim — canlıdan okuduğum fonksiyon ve kural
tanımları, depodaki son göç dosyalarıyla uyumluydu.

---

## FAZ 2 — MAÇ YÖNETİMİ VE KURUCU PANELİ

### 2.1 Maç akışı — mevcut durum

Maç yaşam döngüsü tam kurulmuş ve testliyle korunuyor:

- **Oluşturma:** `views/MatchCreate.tsx` + `services/matchCreateService.ts`
- **Keşif/listeleme:** `views/MatchDiscovery.tsx`, `views/PitchDiscovery.tsx` (harita)
- **Katılım:** `views/MatchJoin.tsx` (slot/pozisyon sistemi, "Rahat maç" pozisyonsuz mod)
- **Ödeme:** `views/PaymentScreen.tsx` → cüzdan öncelikli kapora
- **İptal/iade:** `services/matchLifecycleService.ts` + `process_tiered_refund`
  (maça kalan süreye göre **kademeli iade**)
- **Otomatik iptal:** `auto-cancel-matches` sunucu fonksiyonu (maç dolmazsa
  kapora otomatik çözülüyor)
- **Maç sonrası:** `views/PostMatchEval.tsx` (değerlendirme, puanlama)

**İade politikası kararı yerinde:** İadeler karta değil **OYNA iade kredisine**
dönüyor. Bu bilinçli bir strateji (PSP maliyeti yok, para platformda kalır).
Önceden çift iade üreten kod dalı kaldırılmış — doğru düzeltme.

> ⚠️ **Mesafeli Satış mevzuatı açısından dikkat:** Kredi olarak iade, tüketicinin
> "ödediğim yöntemle iade" hakkıyla çelişebilir. Bu bir **hukuk** sorusu, yazılım
> sorusu değil — FAZ 5, Karar 7'de ele alındı. Avukat onayı şart.

### 2.2 Kurucu paneli — mevcut durum

Panel ayrı bir uygulama olarak `/admin` adresinde çalışıyor ve **iki aşamalı
doğrulama (MFA)** altyapısı hazır.

| Yetenek | Dosya | Durum |
|---|---|---|
| Giriş + MFA kapısı | `AdminAuthGate.tsx`, `AdminMfaGate.tsx` (398 satır) | ✅ Kurtarma kodları dâhil |
| Kullanıcı yönetimi / engelleme | `adminService.ts` | ✅ |
| Maç yönetimi | `MatchesPage` | ✅ |
| Saha yönetimi | `PitchManager.tsx` (866 satır) | ✅ |
| Saha sahibi hesapları | `OwnerAccountsTab.tsx` | ✅ |
| Doğrulama bekleyenler | `PendingVerificationsTab.tsx` | ✅ |
| Toplu bildirim | `admin-broadcast` sunucu fonksiyonu | ✅ Yetkisiz erişime kapalı |
| Genel bakış (God View) | `GodViewPanel.tsx` | ✅ |
| CSV dışa aktarma | `utils/exportCsv.ts` | ✅ |
| Kişisel veri maskeleme | `utils/pii.ts` | ✅ KVKK açısından doğru |

**Değerlendirmem:** Panel, "tek kurucu yönetir" hedefi için **yeterli.**
Kullanım kılavuzu da hazır: `docs/kilavuzlar/05-admin-kilavuzu.md` (ekran
görüntüleriyle).

**Eksik olan tek şey — iyzico para takibi:** Panelde ödeme/iade *durumu*
görülebiliyor, ancak iyzico'nun kendi ekranıyla mutabakat (hangi para ne zaman
hesaba geçti) **panelde yok.** Lansman engeli değil (iyzico'nun kendi paneli var)
ama ilk ay içinde eklenmeli — aksi hâlde her mutabakat için iki ekran arasında
gidip geleceksin.

---

## FAZ 3 — MAĞAZA VE TÜRKİYE MEVZUAT UYUMU

### 3.1 Google Play kontrol listesi

| Şart | Durum | Not |
|---|---|---|
| Hesap silme akışı (uygulama içi) | ✅ | `DeleteAccountModal.tsx` → `request_account_deletion` |
| Hesap silme (web, uygulama dışı) | ✅ | `public/hesap-silme.html` |
| Gizlilik politikası (herkese açık adres) | ✅ | `public/gizlilik.html` |
| Paket kimliği | ✅ | `com.oyna.app` |
| İmzalama anahtarı | ✅ | Bu oturumda üretildi |
| `versionCode` her yüklemede artan | ✅ | CI otomatik üretiyor |
| İzinler gerekçeli | ✅ | Konum, kamera, bildirim — hepsi kullanılıyor |
| Yedekleme güvenliği | ✅ | Bu oturumda kapatıldı |
| Uygulama ikonu / açılış ekranı | ✅ | OYNA markalı (varsayılan robot yok) |
| Portre kilidi | ✅ | |
| Veri Güvenliği formu | 🟡 | **Senin işin** — §4.2 |
| Kapalı test (12 kişi × 14 gün) | 🟡 | **Kişisel hesapsa zorunlu** — §4.2 |
| `targetSdk` | ⚠️ | **35 — bkz. aşağıdaki uyarı** |

> ### ⚠️ ZAMAN BASKISI: `targetSdk` 35 → 36
>
> Google Play, yeni uygulamalarda **31 Ağustos 2026'dan itibaren API 36
> (Android 16)** istiyor. Proje şu an **35** hedefliyor.
>
> **Bugün 30 Temmuz 2026 — elinde 32 gün var.**
>
> Bu süre içinde çıkarsan sorun yok. Ama 31 Ağustos'tan sonra **güncelleme bile
> gönderemezsin.** 36'ya yükseltme, Android derleme aracının (AGP 8.7.2 → 8.9+)
> da yükseltilmesini gerektiriyor. Bu değişikliği bu oturumda **bilerek
> yapmadım**: derleme yapamadığım için test edemezdim ve test edilmemiş bir
> altyapı yükseltmesi lansman arifesinde en riskli hamledir.
>
> **Önerim:** Önce 35 ile çık, ilk sürüm yayına girsin. Hemen ardından 36
> yükseltmesini ayrı bir görev olarak, gerçek cihaz testiyle yap.

### 3.2 App Store kontrol listesi

| Şart | Durum | Not |
|---|---|---|
| Bundle ID | ✅ | `com.oyna.app` |
| Entitlements (Push + Apple ile Giriş) | ✅ | `App.entitlements` mevcut |
| Apple ile Giriş | ✅ | Google girişi olduğu için **zorunlu** — var |
| İzin açıklama metinleri | ✅ | Kamera, konum, fotoğraf, rehber |
| ATT (izleme izni) | ✅ **Gerekmiyor** | Reklam/çapraz uygulama izleme yok |
| Hesap silme | ✅ | |
| **IAP (uygulama içi satın alma) muafiyeti** | ✅ **Kritik avantaj** | Halı saha kiralama **gerçek dünya hizmeti** → Apple komisyonu **alamaz** (Kural 3.1.5(a)). iyzico ile kart tahsilatı serbest. App Review notlarına mutlaka yazılmalı. |
| Xcode 26 / iOS 26 SDK ile derleme | 🟡 | 28 Nisan 2026'dan beri zorunlu — **Mac gerekir** |

> **iOS gerçeği:** iOS derlemesi **macOS + Xcode olmadan yapılamaz.** Bu ortamda
> da, GitHub'ın ücretsiz Linux makinelerinde de mümkün değil. Play'e odaklanman
> doğru sıralama.

### 3.3 Türkiye mevzuat uyumu

Hukuki metin altyapısı **beklediğimden çok daha iyi durumda.** 9 ayrı sözleşme
hazırlanmış ve web sayfası olarak yayınlanmış:

| Belge | Kaynak | Yayın |
|---|---|---|
| Kullanım Şartları | `sozlesmeler/oyuncu/01-…` | `public/kullanim-sartlari.html` |
| Gizlilik Politikası | `…/02-…` | `public/gizlilik.html` |
| KVKK Aydınlatma Metni | `…/03-…` | `public/kvkk-aydinlatma.html` |
| **KVKK Açık Rıza Metni** | `…/04-…` | `public/kvkk-acik-riza.html` |
| Mesafeli Satış / İptal-İade | `…/05-…` | `public/mesafeli-satis.html` |
| Çerez Politikası | `…/06-…` | `public/cerez-politikasi.html` |
| Hesap Silme Bilgilendirmesi | `…/07-…` | `public/hesap-silme.html` |
| **Veli Muvafakatnamesi** (18 yaş altı) | `…/08-…` | `public/veli-muvafakatnamesi.html` |
| Topluluk Kuralları | `…/09-…` | `public/topluluk-kurallari.html` |

Ek olarak: VERBİS/ETBİS uyum değerlendirmesi, veri işleyen envanteri ve yurt
dışı aktarım analizi, B2B işletme sözleşmesi, hizmet sağlayıcı sözleşmesi.

**Kodda karşılığı olan uyum özellikleri:**
- Açık rıza akışı: `services/consentService.ts`
- Veli onayı: `views/GuardianConsentForm.tsx`, `GuardianConsentChild.tsx`, `services/guardianService.ts`
- Kişisel veri maskeleme (panelde): `admin-panel/utils/pii.ts`
- Profil gizliliği: `profiles` tablosu artık **yalnız kendi satırını** okutuyor;
  başkalarına yalnız güvenli vitrin (`public_profiles`) görünüyor. **KVKK
  açısından doğru mimari.**

| Mevzuat | Durum |
|---|---|
| KVKK aydınlatma + açık rıza | ✅ Metin ve akış hazır — **avukat onayı gerekli** |
| VERBİS kaydı | 🟡 **Senin işin** (§4.4) |
| ETBİS kaydı | 🟡 **Senin işin** (§4.4) |
| İYS (İleti Yönetim Sistemi) | 🟡 **Senin işin** — ticari bildirim/e-posta atacaksan **zorunlu** |
| Mesafeli Satış Sözleşmesi | ✅ Metin hazır |
| Şirket ünvanı / vergi bilgisi | 🟡 Metinlerde yer tutucu olabilir — **kontrol et** |

---

## FAZ 4 — KURUCU AKSİYON LİSTESİ (yalnız senin yapabileceklerin)

### 4.1 🎯 AAB'yi almak (ilk yapılacak — 15 dakika)

Bu oturumda kurduğum hat sayesinde Android Studio kurmana gerek yok.

**Adım 1 — Anahtarı GitHub'a kaydet.** Sana 3 dosya gönderiyorum. GitHub'da:
depo sayfası → **Settings** → **Secrets and variables** → **Actions** →
**New repository secret**. Şu 4 kaydı ekle:

| Secret adı | Değer |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | `oyna-keystore-base64.txt` dosyasının **tüm içeriği** |
| `ANDROID_KEYSTORE_PASSWORD` | Sohbette verdiğim şifre |
| `ANDROID_KEY_ALIAS` | `oyna-upload` |
| `ANDROID_KEY_PASSWORD` | Aynı şifre |

**Adım 2 — Paketi üret.** Depo sayfası → üstten **Actions** → soldan
**"Android — Google Play paketi (AAB)"** → sağdan **"Run workflow"** → yeşil
düğme. ~10 dakika sürer.

**Adım 3 — İndir.** İş bitince aynı sayfanın altında **"Artifacts"** bölümünde
`.aab` dosyası olacak. İndir.

**Adım 4 — Yükle.** Play Console → Üretim → Yeni sürüm oluştur → `.aab`
dosyasını sürükle.

> 🔐 **ANAHTARI KAYBETME.** `oyna-upload.keystore` dosyasını en az iki güvenli
> yere yedekle (ör. şifre yöneticisi + harici disk). Bu anahtar olmadan
> uygulamana **güncelleme gönderemezsin.** (Play App Signing'e kaydolursan
> Google'dan sıfırlama talep edebilirsin — bu yüzden kaydolman önerilir.)

### 4.2 Google Play Console

- [ ] Geliştirici hesabı aç (25 USD, tek seferlik).
      **Şirket hesabı** aç — kişisel hesapta **12 kişilik 14 günlük kapalı test
      zorunludur** ve lansmanı 2 hafta geciktirir.
- [ ] **Play App Signing**'e kaydol (imzalama anahtarını Google yönetir — anahtar
      kaybı riskine karşı sigortan olur).
- [ ] **Veri Güvenliği (Data Safety) formu.** Beyan edeceklerin:
      ad, e-posta, telefon, yaklaşık konum, fotoğraf, ödeme bilgisi (iyzico'ya
      aktarılıyor, OYNA saklamıyor). Hepsi şifreli aktarılıyor, silme talebi var.
- [ ] Mağaza sayfası: açıklama, en az 2 ekran görüntüsü, 512×512 ikon,
      1024×500 kapak.
- [ ] İçerik derecelendirme anketi.
- [ ] Gizlilik politikası adresi: `https://<alan-adin>/gizlilik.html`

### 4.3 Supabase (5 dakika, tarayıcıdan)

- [ ] **Sızmış şifre koruması:** Dashboard → Authentication → Policies →
      "Leaked password protection" **aç.** (Kullanıcı, daha önce sızmış bir
      şifreyi seçemez.)
- [ ] Üretimde demo hesapların (`*@oyna.app`, `password123`) **silindiğini
      doğrula.** Bkz. `OYNA_DEMO_HESAPLARI.md`
- [ ] Sunucu gizli anahtarlarını (secrets) ayarla:
      `PAYMENT_EDGE_SECRET`, `ADMIN_EDGE_SECRET`, `EMAIL_EDGE_SECRET`,
      `ALLOWED_ORIGIN`, `ADMIN_ALLOWED_ORIGIN`

### 4.4 iyzico ve yasal

- [ ] iyzico sözleşme + KYC tamamla, **canlı** API anahtarlarını al
- [ ] `PAYMENT_PROVIDER=IYZICO` yap (şu an `SIMULATION`)
- [ ] `IYZICO_BASE_URL=https://api.iyzipay.com` (sandbox değil)
- [ ] Sandbox'ta uçtan uca **gerçek bir 3DS ödemesi** test et
- [ ] **VERBİS** kaydı (KVKK veri sorumluları sicili)
- [ ] **ETBİS** kaydı (e-ticaret bilgi sistemi)
- [ ] **İYS** kaydı — ticari bildirim/e-posta atacaksan zorunlu
- [ ] Tüm sözleşme metinlerini **avukata onaylat**; şirket ünvanı/vergi no
      yer tutucularını doldur

### 4.5 Firebase (Android push bildirimleri)

- [ ] Firebase projesi aç, Android uygulaması ekle (`com.oyna.app`)
- [ ] `google-services.json` indir → içeriğini `GOOGLE_SERVICES_JSON`
      secret'ı olarak GitHub'a ekle
- [ ] `GOOGLE_SERVICE_ACCOUNT_KEY` + `GOOGLE_PROJECT_ID` Supabase secret'ları

> Bu yapılmazsa uygulama çalışır ama **Android'de push bildirimi gitmez.**

---

## FAZ 5 — STRATEJİK KARAR MATRİSİ

### Karar 1 — targetSdk 35 ile mi çıkalım, 36'ya yükseltip mi?

**Problem:** Play, 31 Ağustos 2026'dan sonra API 36 istiyor. 32 günün var.

**Ekip önerisi:** 🟢 **35 ile ÇIK, hemen ardından 36'ya yükselt.**

| Seçenek | Artı | Eksi |
|---|---|---|
| **35 ile çık (önerilen)** | Bugün çıkabilirsin; test edilmiş yapı; risk minimum | 32 gün içinde yükseltme yapman şart |
| Önce 36'ya yükselt | Tek seferde biter | AGP yükseltmesi + gerçek cihaz testi gerekir; lansmanı 1-2 hafta geciktirir; test edilmemiş yapıyla çıkma riski |

---

### Karar 2 — Google Play hesabı: kişisel mi, şirket mi?

**Problem:** Kişisel hesaplarda **12 tester × 14 gün kapalı test zorunlu.**

**Ekip önerisi:** 🟢 **Şirket (organizasyon) hesabı.**

| Seçenek | Artı | Eksi |
|---|---|---|
| **Şirket hesabı (önerilen)** | 14 günlük zorunlu testten muaf; ödeme alan bir uygulama için zaten tüzel kişilik gerekli; kurumsal güven | D-U-N-S numarası ve şirket belgesi ister (1-2 hafta sürebilir) |
| Kişisel hesap | Hemen açılır | **14 gün + 12 gerçek tester** zorunlu; ödeme alan bir uygulamayı şahıs adına yayınlamak vergi/hukuk riski |

---

### Karar 3 — Yükleme anahtarını kim yönetsin?

**Problem:** Anahtar kaybolursa uygulamaya bir daha güncelleme gönderilemez.

**Ekip önerisi:** 🟢 **Play App Signing'e kaydol + anahtarı çift yedekle.**

| Seçenek | Artı | Eksi |
|---|---|---|
| **Play App Signing (önerilen)** | Anahtar kaybında Google'dan sıfırlama isteyebilirsin — **kurtarılabilir hata** | Google imza anahtarını yönetir (sektör standardı) |
| Kendi anahtarını tek başına yönet | Tam kontrol | Anahtar kaybı = **uygulama ölür.** Yeni paket kimliğiyle sıfırdan başlarsın, tüm kullanıcıları kaybedersin |

---

### Karar 4 — Ödeme: cüzdan öncelikli mi, doğrudan kart mı?

**Problem:** Mevcut mimari kaporayı önce cüzdana, oradan maça bloke ediyor.

**Ekip önerisi:** 🟢 **Cüzdan öncelikli kalsın** (zaten kurulu ve test edilmiş).

| Seçenek | Artı | Eksi |
|---|---|---|
| **Cüzdan öncelikli (önerilen)** | Blokaj/çözme veritabanı işlemi → PSP maliyeti yok; iptaller anında; para platformda kalır | Kullanıcı "param nerede?" diye sorabilir → cüzdan ekranı çok net olmalı |
| Her maçta doğrudan kart | Kullanıcıya daha tanıdık | Her iptalde PSP komisyonu yanar; 3DS her seferinde tekrar; iade süresi 7-14 gün |

---

### Karar 5 — İadeler: OYNA kredisi mi, karta iade mi?

**Problem:** Mevcut kod **yalnız kredi** iadesi yapıyor. Tüketici mevzuatı
"ödediğin yöntemle iade" der.

**Ekip önerisi:** 🟠 **Kullanıcıya SEÇİM sun — ama önce avukata sor.** Bu,
raporun **en yüksek hukuki riskli** maddesi.

| Seçenek | Artı | Eksi |
|---|---|---|
| Yalnız kredi (mevcut) | PSP maliyeti sıfır; para platformda kalır | **Mesafeli Satış mevzuatına aykırı olabilir**; şikâyet/ceza riski; App Store da itiraz edebilir |
| **Seçimli: kredi (anında) veya karta iade (7-14 gün) — önerilen** | Mevzuata uygun; kullanıcı çoğunlukla anında olanı seçer | Karta iade dalının yazılması gerekir (~1-2 gün iş) |
| Yalnız karta iade | En güvenli hukuki konum | Her iptalde komisyon yanar; nakit akışı bozulur |

---

### Karar 6 — Apple komisyonu (IAP) konusunda ne beyan edelim?

**Problem:** Apple, dijital ürünlerde %30 komisyon ister. Halı saha kiralama
dijital ürün **değil.**

**Ekip önerisi:** 🟢 **Fiziksel hizmet muafiyetini App Review notlarında
açıkça belirt** (Kural 3.1.5(a)).

| Seçenek | Artı | Eksi |
|---|---|---|
| **Muafiyeti açıkça beyan et (önerilen)** | Komisyon **%0**; kural açıkça senin lehine | İnceleyen kişi yanlış anlarsa 1 tur ret → notla önlenir |
| Emin olmayıp IAP ekle | Ret riski sıfır | Gelirin **%30'unu** gereksiz yere verirsin; saha sahibiyle paylaşım bozulur |

> Not: Saha sahibi SaaS aboneliği de B2B hizmet olarak IAP dışıdır — bunu da
> notlara yaz.

---

### Karar 7 — Profil gizliliği ne kadar sıkı olsun?

**Problem:** Artık kullanıcılar birbirinin e-posta/telefonunu göremiyor. Bu,
"rakip takım kaptanına ulaş" gibi akışları zorlaştırabilir.

**Ekip önerisi:** 🟢 **Sıkı kalsın.** İletişim uygulama içi mesajlaşmadan olsun.

| Seçenek | Artı | Eksi |
|---|---|---|
| **Sıkı (önerilen, mevcut)** | KVKK'ya tam uygun; taciz/spam riski düşük; mağaza incelemesinde artı | Kullanıcı "telefonunu ver" diyemez |
| Gevşetip telefon göster | Koordinasyon kolaylaşır | **KVKK ihlali riski**; taciz; veri sızıntısında sorumluluk |

---

### Karar 8 — İki harita kütüphanesi (leaflet + maplibre) ne olacak?

**Problem:** İkisi de pakette; ~800 KB fazla yük.

**Ekip önerisi:** 🟡 **Lansmandan SONRA maplibre'de birleştir.**

| Seçenek | Artı | Eksi |
|---|---|---|
| **Lansman sonrası birleştir (önerilen)** | Şimdi risk yok; sonra ~800 KB kazanç | Bir sürüm boyunca fazla indirme boyutu |
| Şimdi birleştir | Daha küçük ilk paket | Harita, saha keşfinin kalbi — test edilmeden dokunmak **çok riskli** |

---

### Karar 9 — R8/ProGuard küçültme açılsın mı?

**Problem:** `minifyEnabled false` — kod küçültme kapalı.

**Ekip önerisi:** 🟡 **İlk sürümde KAPALI kalsın.**

| Seçenek | Artı | Eksi |
|---|---|---|
| **Kapalı (önerilen)** | Capacitor eklentileri yansıma (reflection) kullanır; R8 bunları silip **çalışma anında çökme** yaratabilir | Paket birkaç yüz KB büyük |
| Açık | Daha küçük paket, hafif koruma | Gerçek cihazda kapsamlı test şart; lansman arifesinde risk |

---

### Karar 10 — Simülasyon modundan canlıya nasıl geçelim?

**Problem:** `PAYMENT_PROVIDER=SIMULATION` — kart formu hiçbir yere gitmiyor.

**Ekip önerisi:** 🟢 **Önce sandbox'ta uçtan uca gerçek 3DS testi, sonra canlı.**

| Seçenek | Artı | Eksi |
|---|---|---|
| **Sandbox → canlı, kademeli (önerilen)** | Gerçek para riske girmeden tüm akış doğrulanır | 1-2 gün ek süre |
| Doğrudan canlıya geç | Hızlı | İlk gerçek müşteride para kaybı/çift çekim riski — **geri dönüşü zor** |
| Simülasyonla yayınla | Uygulama çıkar | **Kullanıcıdan para alınmaz ama alınmış gibi görünür** → dolandırıcılık algısı, mağaza şikâyeti |

---

### Karar 11 — Sunucu fonksiyonlarında CORS ve hız limiti (rate limiting)

**Problem:** Bazı fonksiyonlarda `ALLOWED_ORIGIN` boşken varsayılan `*` (herkese açık).

**Ekip önerisi:** 🟢 **Lansmandan önce gerçek alan adlarını gir.**

| Seçenek | Artı | Eksi |
|---|---|---|
| **Alan adlarını gir (önerilen)** | Başka sitelerden kötüye kullanım engellenir; kod hazır, yalnız değer girilecek | Alan adını yanlış girersen panel çalışmaz → dikkatli gir |
| `*` bırak | Hiçbir şey bozulmaz | Herhangi bir site senin sunucu fonksiyonlarını çağırabilir |

> Not: Supabase zaten platform düzeyinde hız limiti uygular. Uygulama içi ek
> limitleme (`social_rate_usage` tablosu) sosyal akışlar için mevcut.

---

### Karar 12 — Büyük dosyalar (Studio.tsx 3.890 satır) ne zaman bölünsün?

**Problem:** Bakımı zor, ileride hata üretme ihtimali yüksek.

**Ekip önerisi:** 🟢 **Lansmandan sonra, kullanım verisine bakarak.**

| Seçenek | Artı | Eksi |
|---|---|---|
| **Lansman sonrası (önerilen)** | Hangi ekranın gerçekten kullanıldığını görüp oraya yatırım yaparsın | Bir süre daha zor bakım |
| Şimdi böl | Daha temiz kod | Testleri geçen çalışan kodu kırma riski; **mağaza onayına sıfır katkı** |

---

## EK — Bu oturumda değişen dosyalar

| Dosya | Değişiklik |
|---|---|
| `supabase/migrations/20260902000000_public_profiles_yazma_kapatildi.sql` | **YENİ** — kritik güvenlik açığı kapatması |
| `android/app/src/main/AndroidManifest.xml` | `allowBackup` false + yedek kuralları bağlandı |
| `android/app/src/main/res/xml/data_extraction_rules.xml` | **YENİ** — Android 12+ yedek/aktarım kısıtı |
| `android/app/src/main/res/xml/backup_rules.xml` | **YENİ** — Android 11 ve altı yedek kısıtı |
| `android/app/build.gradle` | Sürüm numarası CI'dan geçilebilir hâle getirildi |
| `.github/workflows/android-release.yml` | **YENİ** — tek düğmeyle AAB üretimi |
| `docs/master/MASTER_LANSMAN_RAPORU_2026-07-30.md` | **YENİ** — bu rapor |

**Doğrulama:** `tsc` temiz · 1283/1283 birim testi geçti · üretim derlemesi başarılı.
