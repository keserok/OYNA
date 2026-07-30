# OYNA — YENİ OTURUM DEVİR PROMPTU

> Bu dosyanın içeriğini **olduğu gibi** yeni bir Claude Code oturumuna yapıştır.
> Aşağıdaki her şey doğrulanmış gerçektir; tahmin ve varsayım yoktur.

---

## KOPYALANACAK PROMPT (buradan aşağısı)

OYNA adlı Türkçe halısaha rezervasyon uygulaması üzerinde çalışıyorsun.
Lansman öncesi UX/UI denetim planının kalan iş paketlerini uygulayacaksın.

### Dal ve kimlik kuralları (değişmez)

- Yalnız `claude/ip-9-remaining-findings-tests-ime71t` dalında geliştir. Başka dala **push etme**.
- Kullanıcı açıkça istemedikçe **pull request açma**.
- `git push -u origin claude/ip-9-remaining-findings-tests-ime71t`; ağ hatasında 2s/4s/8s/16s ile 4 kez yeniden dene.
- Git kimliği: `-c user.email=noreply@anthropic.com -c user.name=Claude`
- Commit mesajlarının sonuna:
  ```
  Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
  ```
- Model kimliğini commit/PR/kod yorumlarına **yazma**.

### Supabase

- Proje id: **`iikvzgyccvgcybzdfwlv`**
  Başka id (`nwxstjhysfpqbojfpqrl` gibi) *"You do not have permission"* verir. Bu hatayı
  görürsen yetki sorunu değil, **yanlış id** kullanıyorsundur.

---

## ÖNCE OKU — üç belge, bu sırayla

1. **`docs/ux-audit/KARAR-DEFTERI.md`** — kullanıcının verdiği 55 ürün kararı, birebir
   alıntılarla. **Bu belge plan metninden ÜSTÜNDÜR.** Çelişki görürsen belgeye uy.
   Kararları yeniden sorma, tahmin etme, değiştirme.
2. **`supabase/MIGRATION_PLAYBOOK.md`** — Altın Kurallar. Migration yazacaksan **şart**.
3. **`docs/ux-audit/OYNA-COZUM-PLANI.md`** — 25.000+ satır şartname, 136 bulgu, 23 iş paketi.
   Tamamını okuma; yalnız çalıştığın paketin bölümünü oku.

> ⚠️ Planın kendi içindekiler tablosu **eskimiş** (~35 satır kayık). Atlamadan önce:
> ```bash
> grep -n '^#\{1,3\} ' docs/ux-audit/OYNA-COZUM-PLANI.md
> ```

---

## BUGÜNKÜ DURUM

Dal, `origin/main`'in **düz devamı** (fast-forward, 0 commit geride). Birleştirme
gerekmiyor; bugün main'e sorunsuz akar.

**Yeşil taban — her paketten sonra dördü de geçmeli:**

| Komut | Beklenen |
|---|---|
| `npx tsc --noEmit` | 0 hata |
| `npx vitest run` | 1056 test / 79 dosya, sıfır başarısız |
| `npm run test:visual` | 24/24 |
| `npm run build` | başarılı |

> ⚠️ **GÖRSEL TEST "24/24" DEĞİŞMEDİ DEMEK DEĞİLDİR.** Karşılaştırmanın
> `maxDiffPixelRatio: 0.002` toleransı var (390×844'te ≈ **658 piksel**).
> Ölçüldü: IP-19'da profil ekranındaki `%0 → —` ve `0 ₺ → 0₺` değişikliği
> **451 piksel** fark yaratıyor ve testten SESSİZCE geçiyordu; referans
> görüntü IP-14'ten beri eskimişti. Yani yeşil görsel test yalnız
> **yerleşim/renk** bozulmadığını kanıtlar; **tek kelimelik ya da tek
> sembollük** metin değişikliğini yakalamaz. Metin değiştirdiysen ekranı
> gözle doğrula, "24/24 geçti" demekle yetinme.
> (Bir ekranın gerçekten değişip değişmediğini ölçmek için geçici bir spec'te
> `toHaveScreenshot(ad, { maxDiffPixelRatio: 0, threshold: 0 })` kullan —
> hata mesajı kaç pikselin farklı olduğunu yazar.)

> ⚠️ **Önce `npm ci` çalıştır.** Taze klonda `node_modules` yoktur ve `tsc` bu
> durumda "0 hata" der — çünkü hiçbir dosyayı gerçekten denetlemez, yalnız
> `Cannot find type definition file for 'node'` verip çıkar. Bu YANILTICI bir
> yeşildir; bağımlılıklar kurulmadan ölçüm yapma.

### Tamamlanmış paketler

IP-01 (navigasyon/geri tuşu/overlay) · IP-02 (çift gönderim + idempotency) ·
IP-03 (ödeme şeffaflığı + 3DS kurtarma) · IP-04 (ayrılma sözleşmesi) ·
IP-05 (değerlendirme gizliliği) · IP-06 (bildirim merkezi) ·
IP-07 (tesis sahibi para dürüstlüğü) · IP-08 (tipografi/kontrast/font) ·
**IP-09 (renk sistemi, tek aksan)** · **IP-10 (dokunma hedefi, erişilebilirlik)** ·
**IP-12 (hata ve boş durum sistemi)** · **IP-13 (Türkçe metin ve ton)** ·
**IP-11 (hareket, pil, algılanan hız)** · **IP-14 (bilgi mimarisi)** ·
**IP-15 (kayıt kapısı, oturum, yasal onay)** ·
**IP-16 (tanıtım akışı ve konum tek yolu)** · **IP-18 (profil doğruluğu)** ·
**IP-19 (para biçimi ve bakiye tekliği)** · IP-20 (bilet çevrimdışı) ·
S-serisi kararların tamamı.

### Kalan paketler — önerilen sıra

| Sıra | Paket | Not |
|---|---|---|
| 1+ | IP-22, IP-23 (+IP-21/IP-17 ertelendi) | |

### ⏳ AÇIK İŞ — telefona bildirim (kullanıcı isteği, HENÜZ YAPILMADI)

Kullanıcı IP-14 kararlarıyla birlikte şunu istedi: **"bildirim gelirse telefona
gelmesini sağla"** (push notification). Bu iş IP-12/IP-14 kapsamında DEĞİLDİ ve
yapılmadı. Başlamadan önce `notifications/pushService.ts`, Supabase'de token
tablosu, sunucu tarafı gönderim (edge function/cron) ve native yapılandırma
(google-services.json / APNs) ölçülmeli — büyük ihtimalle sıfırdan iş.

### IP-16 · IP-18 kararları (kullanıcı, bu oturumda)

**Planın kaçırdığı iki şey** (ölçümle bulundu):
1. Sunucuda **`match_participants`** diye gerçek bir katılım tablosu var
   (13 satır / 3 maç / 8 oyuncu) ve her katılım RPC'si oraya yazıyor. Plan
   bunu bilmediği için JSONB içinde arama + GIN indeksi öneriyordu; ilişkisel
   JOIN hem doğru hem hızlı.
2. **`score_status`** kolonu (20260728113125) zaten ENTERED / NOT_ENTERED /
   PENDING diye türetiliyor ve trigger'la sürdürülüyor — arayüz onu hiç
   okumuyordu. Skor boşluğu ikinci kez hesaplanmıyor artık.

**IP-16**
- Yarıda bırakılan tanıtım açılışta geri gelir; **"Şimdilik Atla" diyen
  zorlanmaz** (cihaz bazlı bayrak, kurtarma yolu Profil şeridi).
- Konum **tek yoldan** (`services/locationService`) istenir ve
  `setActiveRegion` ile **kalıcı** olur. Konum kapalıysa **kayıtlı bölge
  hatırlatılır** (kullanıcı kararı).
- Red ekranda **kalıcı**: `denied` / `blocked` / `timeout` / `unavailable`
  dördü ayrı metin. Kalıcı engelde "Tekrar Dene" **çizilmez** (çalışmazdı);
  ayarları açan bir tuş da **eklenmedi** — `capacitor-native-settings` kurulu
  değil, ölü tuş koymak yerine ne yapılacağı adım adım yazıyor.
- **Bildirim merkezinde kalıcı hatırlatma** (kullanıcı kararı). Sunucudan
  gerçek bildirim GÖNDERİLMİYOR: tekrar eden bildirim spam olur ve geri
  alınamaz (CLAUDE.md §5). İzin verilir verilmez kendiliğinden kaybolur.
- Yaş çarkı **karar 4b**: varsayılan "24-30" gerçekten seçili sayılır, CTA hiç
  ölü değil. 18 yaş altı seçilirse veli onayı gerekeceği ekranda yazıyor.
- "Atla" tuşu **küçük KALDI** (kullanıcı kararı) ama artık `ConfirmDialog` ile
  onay soruyor. Dokunma hedefi bekçisi bu tuşu kapsamıyor — çakışma yok.
- Özet ekranındaki kayıt hatası artık **kalıcı** ve perdenin İÇİNDE çıkışı var.

**IP-18**
- `get_my_match_history` RPC'si eklendi ve **canlıya uygulandı** (kullanıcı
  kararı 9b). Defter dosya adıyla eşitlendi (tuzak #1 — bkz. aşağısı).
- Kartın arkasındaki **uydurma sayılar silindi** (karar 11a); galibiyet oranı
  artık ön yüzle **aynı hesaptan** (`winStats`) geliyor.
- Hiç skorlu maçı olmayan **"%0" değil "—"** görüyor (karar 12a).
- "SİLÜET YOK" → **"FOTOĞRAF EKLE"** (karar 13a).
- Maç Raporu: paylaş tuşu **çalışıyor** (karar 14a), not hatası ekranda
  görünüyor, kırık avatar baş harfe düşüyor.

> ⚠️ **YAPILMADI — `DEFAULT_CARD_STAT = 50`.** Oyuncu kartındaki altı
> istatistik hâlâ herkeste sabit 50. Kullanıcı kararı: kart
> `profiles.card_active` ile **admin onayına bağlı** (varsayılan `false`),
> yani bu sayı bugün kimseye görünmüyor. Doğrulandı. Kart aktifleştirilmeye
> başlanırsa bu tek satır (`value: 50` → `null`) önce düzeltilmeli.

> ⚠️ **CANLI VERİYLE TEST EDİLEMEDİ.** Veritabanında **5 maç var, tamamlanmış
> maç 0**. Yani profil geçmişi bugün zaten boş; hata (50'lik pencere) henüz
> kimseyi ısırmıyor ama platform 50 tamamlanmış maçı geçtiği gün ısıracaktı.
> Yeni RPC'nin gerçek veriyle davranışı ilk tamamlanan maçlarda doğrulanmalı.

### IP-15 kararları (kullanıcı, bu oturumda)

> ⚠️ **Planın D bölümü ZATEN YAPILMIŞTI.** AuthScreen denetimden sonra yeniden
> yazılmış: planın saydığı dört `…Disabled` hesabı yok, handler'lar zaten
> `requireAgreement()` + alan alan Türkçe hata veriyordu. Kalan gerçek kusur
> butonun GÖRÜNÜŞTE ölü olmasıydı. Ayrıca `COUNTRY_CODES` silinmiş,
> `hooks/useMatchCreate.ts` yok (kırmızı çizgi), `store.joinMatchPleiAction`
> yok. Planın 3, 7, 8, 30, 34, 38. maddeleri bu yüzden uygulanamadı.

- **Kapı artık dört yazma yolunda**: maça katıl / yedek ol (`requireAccount`),
  saha kaporası, maç yayınla, ödeme. Eskiden TEK yerdeydi (`PaymentScreen`),
  bu yüzden ücretsiz maçta misafir "Slot satın alınamadı" hatası alıyordu.
- **Maç yayınlama kapısı SON anda** (karar 12a): misafir formu doldurabilir,
  hesap açınca kaldığı yerden devam eder.
- **`pendingIntent`** — `localStorage`, 30 dk ömür (karar 11a). OAuth
  yönlendirmesi sayfayı yeniden yüklediği için bellek yetmiyor. Yalnız
  **OYUNCU** açılışında tüketilir; tesis sahibi hesabıyla giren biri maç
  lobisine bırakılmaz. Maç silinmişse normal yönlendirmeye düşer.
- **Misafir gezinme rıza İSTEMEZ** (karar 6a): sunucuya rıza kaydı gitmiyor.
- **Onay anında TAM belge** (karar 7b — kullanıcı önerimi reddetti). Özetler
  silindi; `LegalModal` artık `shared/legalDocs.ts`'ten okuyor, Ayarlar →
  Yasal ile birebir aynı metin.
- **Belge adı tek: "Kullanım Şartları"** (karar 8a). "Kullanıcı Sözleşmesi"
  adı arayüzden kalktı — o adla bir belge zaten yoktu.
- **Rıza damgası tek kaynaktan** (`shared/legalVersion.ts`). Eskiden sunucuya
  `2026-07-12/13/14` yazılıyordu, belge ise `15.07.2026` diyordu. Mevcut
  kullanıcılardan **yeniden onay istenmiyor** (karar 9a).
- **Telefon girişi EKRANI yazılmadı** (karar 10a): Supabase Phone sağlayıcısının
  açık olup olmadığı repodan doğrulanamıyor, test edilemeyecek ekran yazılmaz.
  Ölü `loginWithPhone`/`verifyOtp` çifti silindi; `sendPhoneOtp`/`verifyPhoneOtp`
  duruyor ve e-posta OTP'siyle aynı yönlendirme yolunu kullanır.
- **Splash** oturum çözülmeden dokunuşu yutmuyor; 6 sn güvenlik zamanlayıcısı
  var, bekleme yazısı ~1 sn sonra çıkıyor (karar 13a — hızlı bağlantıda
  yanıp sönmesin).
- **Kapı davet oldu**: sarı dolgu → `#39FF14`, "30 saniyeni alır" yalanı
  kalktı, ikinci buton "Zaten hesabım var — giriş yap" (`authStartMode`).

> **Paket boyutu ölçüldü.** Tam belgeler statik import edilince `main`
> **101 → 140 KB** oluyordu: 39 KB yasal metni, belgeyi hiç açmayan kullanıcı
> da indiriyordu. `LegalModal` tembel yüklemeye alındı → `main` **100 KB**
> (başlangıçtan 1 KB küçük), metin kendi `legalDocs` parçasında dokununca
> geliyor. `tests/unit/signupGateAndLegal.test.ts` bunu kilitliyor.

> ⚠️ **IP-15'in ÇÖZMEDİĞİ, bilinen davranış:** `SignupGate` bir overlay ve
> `App.tsx`'teki Android donanım geri tuşu dinleyicisi onu tanımıyor — geri
> tuşu kapıyı kapatmak yerine uygulamayı küçültüyor. Bu IP-01 kapsamında;
> kapı artık çok daha sık açılacağı için daha görünür hale gelecek.

### IP-11 kararları (kullanıcı, bu oturumda)

- **Düşük hareket YALNIZ sistem tercihine bakar.** `perf.ts`'in ≤4 GB / ≤4
  çekirdek eşiği Türkiye'deki Android tabanının büyük kısmını kapsıyor;
  kullanıcı istemeden animasyon kapatmak reddedildi. `hooks/useLowMotion.ts`
  tek satır: `!!useReducedMotion()`. Cihaz sınıflandırması Stüdyo'ya özgü
  kaldı — planın "perf.ts'i shared'a taşı" adımı bu yüzden YAPILMADI
  (taşınsa tek tüketicisi yine Stüdyo olurdu).
- **Normal cihazda görünüm DEĞİŞMEDİ** (karar 2a). Ana Sayfa'nın 34 dekoratif
  döngüsü silinmedi, `lowMotion ? { duration: 0 } : {…}` ile koşullandı.
  Görsel testler baseline güncellemesi olmadan 24/24 geçti — kanıt bu.
- Geri sayım nabzı (`Dashboard.tsx:123`) koşullanMADI: maçın canlı/taslak
  olduğunu taşıyan tek animasyon odur, bilgidir.
- **Spinner muafiyeti.** `prefers-reduced-motion` bloğu `.animate-spin`'i
  öldürüyordu → 95 spinner donmuş ikona dönüyordu. Muafiyet eklendi; ayrıca
  dosyanın BAŞINDAKİ çelişen `.oy-spinner { animation: none }` bloğu silindi
  (sonra geldiği için muafiyeti ezerdi).
- `AnimatePresence` `popLayout` → `wait`; `PAGE_TRANSITION.duration` 0,35 →
  **0,2 sn** (mode="wait" çıkış süresini doğrudan gezinmeye ekler).
- **İyimser slot yazımı `originalMatch`'ten** türüyor, `match`'ten değil:
  `match` useMemo'su slotu boş maçlar için VARSAYILAN slot üretiyor, onu
  store'a yazmak uydurma slotları kalıcı yapardı. Gerçek slot yoksa iyimser
  yazım hiç yapılmaz.
- `await checkMatchThreshold` **KALDI** (planın `void` önerisi reddedildi):
  bir tur kazandırıp LIVE rozetini geciktirirdi, gecikmeyi iyimser yazım
  zaten çözdü.

> **Ölçüm — davranış Chromium'da doğrulandı (kalıcı test değil).** Görsel
> koşum takımı `MotionGlobalConfig.skipAnimations = true` yaptığı için normal
> görsel testler bu davranışı ölçemez. Geçici bir Playwright probu ile
> framer-motion geri açılıp iki kare 900 ms arayla karşılaştırıldı:
> `reducedMotion: no-preference` → **hareket VAR**;
> `reducedMotion: reduce` → **hareket YOK**;
> her iki durumda `.oy-spinner` → `running / 0.72s / infinite`.
> Kaynak koşulları `tests/unit/motionAndSpeed.test.ts` (22 test) ile kilitli.

> ⚠️ **IP-11'in dokunMADIĞI hareket yükü** (bilerek, karar 2a gereği):
> kabuktaki 3 `.mesh-blob` (`float 20s infinite`, her ekranda), `.pf-ambient`
> `blur(120px)` + `pf-breathe`, ve 198 `backdrop-blur`. Bunların hepsi
> `prefers-reduced-motion` altında CSS kuralıyla zaten duruyor; normal
> cihazda olduğu gibi bırakıldı.

### IP-19 kararları (kullanıcı, bu oturumda)

Kanonik biçim **`2.000₺`** — sembol SONDA, boşluksuz, binlik ayraçlı.
Tam sayıda ondalık YOK; kuruş varsa TAM iki hane (`299,90₺`).

| Bağlam | Çağrı | Sıfır |
|---|---|---|
| Fiyat (saha, hizmet, maç ücreti) | `formatTRYShort` | `Ücretsiz` |
| Tutar (bakiye, kapora, kesinti, ciro) | `formatTRYAmount` | `0₺` |
| Cüzdan hareketi | `formatTRYSigned` | `+0₺` / `−0₺` |
| Değer yok (`null`/`NaN`) | hepsi | `—` |

- **`formatTRYWithSymbol` SİLİNDİ.** Daima iki ondalık basıyordu, yani İKİNCİ
  bir görünür biçimdi — paketin varlık sebebi tam olarak buydu. `formatTRY` ve
  `formatTRYInt` yalnız çıplak gövde (₺'siz) üretir, giriş alanları içindir.
- **Cüzdan tek sayı, tek isim.** `WalletScreen` kendi toplamını tutmayı bıraktı
  (`topupBalance + refundBalance` → `summary.spendableBalance`). Ödeme
  ekranındaki **"OYNA Bakiyesi" adı kaldırıldı** → her yerde **"Cüzdan"**.
  Sunucuda `profiles.wallet_balance` ile `spendable_balance` zaten aynı iki
  kovanın toplamı; sayı ayrışmıyordu, isim ayrışıyordu.
- **Maç kurma ekranındaki yuvarlama giderildi.** Yerel `fmtTL` tutarı
  `Math.round` ile basıyordu: 299,60₺ bakiye "300₺" yazılıyor, eksik hesabı ham
  değerden yapıldığı için ekranda aynı anda "bakiyen 300₺" ve "1₺ eksik"
  görünüyordu. Gösterilen sayı ile hesaba giren sayı artık aynı.
- **Katılma tuşu iki katman**: büyük tutar üstte, `2 slot · Öde ve katıl` altta.
  Aynı butonun `if (false)` içinde iki ölü kopyası vardı, silindi.
- Dar alanda **kısaltma yok** (`1,5B₺` gibi bir biçim üretilmedi).
- `views/owner/design/ownerTheme.ts` içindeki `numeric` belirteci
  `tabular-nums font-numeric` idi; `font-numeric` zaten o kuralı taşıyor.
- Kilit: `tests/unit/formatTRY.test.ts` (37 test). Testler kaynak okuyarak
  ekranlarda elle `₺` dizilmesini ve para için elle `toLocaleString('tr-TR')`
  çağrılmasını da yasaklıyor.

> **Meşru kalan `₺` karakterleri** (testin izinli listesi): sayı GİRİŞ alanının
> yanındaki tek karakterlik süs (12 dosya), avukat onaylı `LegalScreen` metni
> ve `MatchDiscovery` bütçe süzgeci seçenekleri (hem etiket hem eşitlik
> anahtarı oldukları için dokunulmadı).

### IP-13 kararları (kullanıcı, bu oturumda)

- Ekran adı: **"Sahalar" kanon** — "Saha Vitrini" adı kaldırıldı. Diğer üç
  adlandırma ikiliği (MAÇ BUL/Top Oyna, Maç Oluştur/YAYINLA, Kaleci Bul/Hakem
  Kirala) **bilerek OLDUĞU GİBİ BIRAKILDI** — kullanıcı "kalsınlar" dedi.
- Yıkıcı buton fiili söyler, güvenli buton daima "Vazgeç", **"Evet," ön eki yok**.
- **Hukuki metinler SİZ kipinde KALIR** (LegalScreen, GuardianConsentForm,
  PartnerOnboarding, LegalModal/KVKK). Avukat onayı bekliyorlar; dil
  değişikliği hukuki içeriği değiştirebilir. Arayüzün geri kalanı SEN.
- Üç nokta tek karakter: `…`.
- Kural `OYNA_MASTER_PRENSIPLER.md` §14'te yazılı, `tests/unit/turkishText.test.ts`
  ile kilitli.

> ⚠️ `toUpperCase()` **hepsi kaldırılmadı, kaldırılMAMALI**: IBAN, davet kodu,
> işlem numarası, enum ve kart markası ASCII alanlardır. Orada `tr-TR` locale
> `i`'yi ASCII olmayan `İ`'ye çevirip doğrulamayı BOZAR. Kalan 10 dosyadaki
> çağrılar bilerek düz `toUpperCase()`'tir ve testin izinli listesindedir.

### IP-14 · IP-12 kararları (kullanıcı, bu oturumda)

Alt menü: Ana Sayfa · Top Oyna · **Maçlarım (orta)** · Sahalar · Profil.
Sosyal → Profil'den. Sekme köklerinde geri oku YOK, zil de eklenmedi —
**bildirim zili yalnız Ana Sayfa'da**. Stüdyo alt menüde değil.
MatchesView + taslak mekanizması silindi. "QR ile Ekle" → davet linki.
Hata tonu **SEN**. Tanınmayan kod: Türkçe genel mesaj (kod `codeOf()` ile
ayrıca sunulabilir). Altı `parseRpcError` kopyası tek sözlüğe indi.

### ⚠️ IP-09'un GERİ ALINAN parçası — ana sayfa kartları (kullanıcı kararı)

**BULGU-034 kapatılmadı; bilerek açık bırakıldı.** IP-09 ana sayfadaki altı
kahraman kartı nötr yüzeye indirmiş, tek birincil kart bırakmıştı. Kullanıcı
bu kararı gördükten sonra **geri istedi**: kartlar eski doygun/parıltılı
hâllerine döndürüldü (sarı "Top Oyna", zümrüt "Saha Vitrini", turuncu "Maç
Oluştur", yeşil/mavi alt kartlar).

Bunun anlamı — ana sayfada BİLEREK duran şeyler:

- `#FFC107` (kart 1 logosu), çift katmanlı `0 0 60px` / `0 0 40px` parıltılar,
  altı ayrı kimlik gradyanı, `transparenttextures.com` dokusu, sarı metin
  seçimi ve dolu sarı "YENİ MAÇ EKLENDİ" rozeti.
- Ana sayfa logosu **amber** (`color="#FFC107"` çağrı yerinden veriliyor);
  splash ve profil logosu ise **marka yeşili**. İki yüzey artık ayrışıyor —
  kullanıcı bunu biliyor, karar onun.

`tests/unit/colorRoles.test.ts` bu yüzden `views/Dashboard.tsx`'i taramaz;
dosyanın başındaki notta gerekçe yazılı. **Ana sayfayı "düzeltmeden" önce
kullanıcıya sor.** Renk-rol tablosu diğer tüm oyuncu ekranlarında geçerlidir.

> Not: `OynaLogo` artık rengi sabit tutmuyor (prop'tan alıyor). Bu iyileştirme
> korundu — geri alınan şey yalnız ana sayfanın *görünümü*, bileşenin yapısı değil.

### IP-09 uygulanırken bulunan sapmalar (plan metni ile kod arasında)

1. **Mürekkep merdiveni adları.** IP-09 metni `text-ink-1/-2/-3` diyor; IP-08
   gerçekte **dört** basamak kurdu: `ink` · `ink-2` · `ink-3` · `ink-4`.
   Eşleme (değerler birebir aynı, yalnız ad kaymış):
   `ink-1`→`ink` (#FFFFFF) · `ink-2`→`ink-3` (#A9B4C0) · `ink-3`→`ink-4` (#8B949E).
2. **`MatchJoin.tsx` satır numaraları ~90 kayık**, `PitchDiscovery.tsx` ~29 kayık
   (IP-08 satır ekledi). Plandaki numaralara değil, **içeriğe** göre çalış.
3. **`#39FF14` sayım hedefi (`≤12`) tutmuyor — hedef yanlıştı, kod değil.**
   Bugün 24 kullanım var ve **hepsi rol tablosuna uygun**: birincil CTA (7),
   onaylanmış durum (6), seçim/slot durumu (10), iade tutarı (1). Planın
   envanteri slot seçici arayüzünü tek satır saymış; gerçekte 10 satır.
   Sayıyı tutturmak için çalışan seçim arayüzünü bozma.
4. **Mentalite paleti dört değil BEŞ kopyaydı.** Plan `onboardingShared`,
   `StepStyle`, `MatchCreate`, `MatchJoin`'i sayıyor; `MatchDiscovery.tsx`
   içindeki `MENTALITY_DISPLAY` beşincisiydi. Hepsi tek kaynağa bağlandı.
5. **Kabul kriteri grep'leri yorum satırlarını ayıklamıyor.** "Bu rengi neden
   sildik" diye yazılan yorum, `grep -c '#FFC107'` sonucunu 0'dan çıkarır.
   Yorumlarda ölü hex'i **yazma**, kelimeyle anlat.

---

## IP-10 — UYGULANDI. Verilen kararlar ve sapmalar

**⚠️ TİTREŞİM UYGULAMADAN TAMAMEN KALDIRILDI (kullanıcı kararı, nihai).**
Karar iki adımda değişti: önce "yalnız sonuç + seçim" denendi, sonra kullanıcı
titreşimden büsbütün vazgeçti. **Geçerli olan ikinci cevaptır.**

Kaldırılanlar: 34 çağrı, `utils/haptics.ts`, Ayarlar'daki anahtar, store dilimi
ve `@capacitor/haptics` bağımlılığı (package.json + iOS Podfile + Android
gradle). Uygulamada titreşimin hiçbir izi yok.

`tests/unit/touchTargets.test.ts` geri sızmayı engelliyor: ham
`navigator.vibrate`, `@capacitor/haptics` importu, `utils/haptics.ts` dosyası
ve native eklenti bağı — dördü de teste bağlı. **Titreşim eklemeden önce
kullanıcıya sor.**

> Native tarafta `npx cap sync ios && npx cap sync android` çalıştırılmadı
> (bu ortamda native araç zinciri yok). Podfile/gradle girdileri elle
> temizlendi; iOS/Android derlemesinden önce sync gerekir.

Dokunuşun görsel karşılığı DURUYOR: `index.css` global `:active` parlaklık
düşüşü + `whileTap`. Kaldırılan yalnız titreşimdir.

**Uygulanmayan madde — BULGU-114 GEÇERSİZ.** Plan "kaptanın skor ± butonları
28px" diyor; o kod `0f1874d` (27 Tem) ile silindi. Planın verdiği 4 satır bugün
başka içeriğe denk geliyor. Hayatta kalan skor giriş noktalarının hepsi zaten
standardı geçiyor: hakem 64px + etiketli, tesis 44px + etiketli, takım 56px.

**Plan harfiyen uygulanamazdı — punto maddeleri.** IP-10 `text-[12px]` /
`text-[13px]` (sabit piksel) öneriyor; IP-08 rem-only kuralı koydu ve
`tests/unit/typographyGuard.test.ts` sabit px'i kırmızıya düşürüyor. Rem
karşılıkları kullanıldı (`text-[0.8125rem]` = 13px).

**Plan 11 etiketsiz buton atlamış.** 13 sayıyordu; gerçekte 23 vardı (Ayarlar,
Paylaş, 6 modal kapatma, 2 menü). Hepsi etiketlendi: `aria-label` 144 → 174.

**Açık soru — kullanıcıya sorulacak:** Devir belgesi "skoru yalnız hakem ve saha
çalışanları girer" (karar S1) diyor, ama `views/social/TeamDetailView.tsx:982`'de
oyuncu tarafında **"Skoru Gir"** var. Bu kaptan girişi değil; takım maçları için
ayrı bir *öneri + karşılıklı onay* mekanizması (`propose_match_score`, sunucu
yetkisi maça katılan herkese açık). S1 bu yolu kapsıyor mu?

## IP-10 İÇİN VERİLMİŞ KARARLAR (arşiv — yukarısı geçerli)

- Küçük yazılar: **yalnız bu paketin dokunduğu ~15 yer**. 904'lük süpürme IP-08'in işi.
- Buton boyutu: **kritik/para butonları 44px; yoğun listelerde 40px serbest.**
  ⚠️ Plan Bölüm 5.6 "istisnasız 44px" diyor — **kullanıcı kararı planı geçersiz kılar.**
- Basma hissi: **global kararma + ölü ripple kodunu sil.**
- ~~Titreşim: native köprü + Ayarlar'da açma/kapama.~~ **GEÇERSİZ** — titreşim
  tamamen kaldırıldı (yukarı bak).
- Ortak `IconButton` bileşeni yaz, zorunlu etiket alanıyla.
- ⚠️ **IP-10'daki skorla ilgili maddeleri UYGULAMA** — kaptan skor girişi kaldırıldı.

## PLANI GEÇERSİZ KILAN DİĞER KARARLAR

- **Bölüm 5.9 (tesis teması birleşmesi) İPTAL.** Tesis paneli kendi temasını korur (karar E7).
  Yalnız 5.9.2 ("korunan kısım") geçerli.
- Tasarım sistemi **önce oyuncu ekranlarına** uygulanır (karar S19).
- Para tutarlarında **italik yok**; italik yalnız skorda (karar S17).
- Cüzdan dili: **"iade kredisi" deme** — tek bakiye var, doğru ifade *"cüzdanına döner"*.
- Para çekme **lansmanda kapalı** (karar S6).

---

## KIRMIZI ÇİZGİLER

1. **Silinmiş özellikleri geri getirme.** Kaptan skor girişi, LIVE panel,
   `hooks/useMatchCreate.ts` — hepsi kaldırıldı. Skoru **yalnız hakem ve saha
   çalışanları** girer (karar S1). Her paket sonrası kontrol et.
2. **Tesis paneli temasına dokunma.**
3. **Ölçemediğin şeye "sıfır hata" deme.** Nerede ölçemediğini söyle.
4. Geçici sınama dosyası bırakma (`*.tmp.mjs` zaten `.gitignore`'da).

---

## TUZAKLAR — bunlara düşüldü, tekrarlama

### 1. Migration numarası (üç kez düşüldü)

`apply_migration` deftere **dosya adındaki değil, uygulama anındaki** sürümü yazar.

**Yanlış çözüm:** dosyayı deftere göre yeniden adlandırmak.
`MIGRATION_PLAYBOOK.md` Altın Kural 2 bunu **yasaklar**, `.github/workflows/migration-immutability.yml` CI'da **reddeder**.

**Doğru çözüm** (Altın Kural 1, acil durum maddesi): dosya adı sözleşmedir, **defteri dosya adına eşitle**:
```sql
update supabase_migrations.schema_migrations
   set version = '<dosya adındaki sürüm>'
 where name = '<migration adı>';
```

### 2. Migration sırası bağımlılığı

Yeni dosyanın sürümü **en son dosyadan büyük** olmalı (Altın Kural 3).
Şu an en son: **`20260828000007`**.

Geriye tarihli dosya, sıfırdan replay'de daha sonraki bir dosya tarafından **sessizce
geri alınır**. Bu tam olarak yaşandı: süre düzeltmesi `20260728233315` diye adlandırılmıştı,
`create_match_atomic`'i tanımlayan `20260827000001` onun üstüne yazıyordu.

### 3. `tests/setup.ts` mağazayı global mock'lar

Gerçek mağazayı test edeceksen `vi.importActual` kullan. Mağazaya yeni action eklersen
mock'a da ekle, yoksa testler *"… is not a function"* der.

### 4. Görsel testler kırmızıya dönerse

Önce **sebebini bul**: gerçek bozulma mu, yoksa kasıtlı bir değişikliğin referansı mı
güncellenmeli? Kasıtlıysa `npm run test:visual:update` ve **neden** güncellediğini yaz.
Referansı düşünmeden güncellemek aracı işe yaramaz hale getirir.

### 5. `grep -h` dosya adını bastırır

`grep -rh ... | grep -v node_modules` **çalışmaz** — filtrelenecek yol adı çıktıda yoktur.
Bu yüzden bir RPC listesine SDK gürültüsü sızmıştı.

---

## AÇIK İŞLER — devraldığın borç

| # | Konu | Not |
|---|---|---|
| 1 | **Edge fonksiyonu deploy edilmedi** | `supabase/functions/create-payment/index.ts` sağlayıcı sızıntısına karşı düzeltildi ama **canlıya çıkmadı**. Kullanıcıya sızıntı yok (istemci zaten sabit Türkçe metne çeviriyor), ama iki katman da kapalı olsun diye deploy gerekiyor. **Kullanıcıya sor.** |
| 2 | **E15 kararı hâlâ açık** | Rezervasyonsuz kurulan maçın süresi. Bugün varsayılan 60 dakika (çalışıyor) ama kullanıcı onayı yok. |
| 3 | **`MatchCreate` görsel test kapsamında değil** | Saat şeridi düzeltmesi SQL seviyesinde doğrulandı, tarayıcıda gözle bakılmadı. Kapsama eklenmeli. |
| 4 | **`get_court_occupancy` eski kaynaktan okuyor** | Tesis geneli `working_hours.slot_duration`. **Hiç çağrılmıyor** (ölü kod). Kullanılacaksa önce tarifeye bağlanmalı. |
| 5 | **`sweeper_enabled = false`** | Asılı kalan ödeme niyetlerini temizleyen süpürücü kapalı. Açmak ayrı migration + canlı test ister. |
| 6 | **Paket boyutu** | `maplibre-gl` 803 kB, `ui-vendor` 575 kB. Kod bölme IP-11 kapsamında. |
| 7 | **`player_create_match` süreyi (60,90,120)'ye kelepçeliyor** | Elle girilmiş 45/75 dakikalık rezervasyon maça çevrilirse sessizce 60 olur. Tarife yolunda risk yok. |
| 8 | **~40 kayıtsız overlay** | IP-01 dosya listesi dışında kalanlar (Studio, ServiceDashboard, PitchDiscovery, SettingsSubPage, ProfileEditSheet, Marketplace, TeamDashboard). IP-14'e atandı. |

---

## ÇALIŞMA BİÇİMİ

1. **Tek paket al, uçtan uca bitir.** Yarım bırakma.
2. Her paketten önce: plan bölümünü oku → **güncel koda karşı doğrula**. Plan eskimiş
   olabilir; sayıları kendin say, yapılmış maddeyi tekrar yapma.
3. Davranış değişikliklerini **birim testiyle kilitle**.
4. Bitirince dört doğrulama komutunu **çalıştır ve çıktılarını raporla**.
5. Commit mesajını **neden**i anlatacak şekilde yaz — ne yaptığını değil, hangi sorunu
   çözdüğünü ve kullanıcının bunu nasıl yaşadığını.
6. Kullanıcı Türkçe konuşuyor; **Türkçe yanıtla, Türkçe yorum yaz.**
7. Kullanıcı `1a 2b 3a` biçiminde kısa cevap verir. Soru sorarken **şıklandır ve
   kendi önerini işaretle.**

### Kullanıcının çalışma tarzı hakkında bilmen gerekenler

- *"Sanki tamam gibi yapılanlar"*ı fark eder ve sevmez. Bitmediyse "bitti" deme.
- Bir kez seni haklı olarak düzeltti (skor yetkisi konusunda). Kendi dalına bakıp
  main'i kontrol etmemiştim. **İddiadan önce güncel koda bak.**
- Hedefi net: *"sıfır hata, sıfır saçmalık, sıfır görsel bozukluk."*
- Kararlarını değiştirdiği olur; **geçerli olan ikinci cevaptır** (Karar Defteri'nde
  ayrı tabloda işaretli).

---

## İLK KOMUTLARIN

```bash
cd /home/user/OYNA
git fetch origin && git status
git log --oneline -8
sed -n '1,60p' docs/ux-audit/KARAR-DEFTERI.md
grep -n '^### IP-04' docs/ux-audit/OYNA-COZUM-PLANI.md
```

Sonra kullanıcıya hangi paketten başlamak istediğini sor — önerin **IP-04** olsun.
