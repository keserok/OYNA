# 🔐 OYNA — Güvenlik Denetimi (20 Madde) · 9 Ağustos 2026

**Yöntem:** 15 ajanlı çok katmanlı denetim — 7 güvenlik boyutunda paralel tarama →
her bulgunun düşmanca doğrulaması (çürütme denemesi) → CISO sentezi.
**Kapsam:** depo (kod, migration, Edge Function, CI) + canlı Supabase (yalnız okuma) + derlenmiş üretim paketi.
**Sonuç:** 70 doğrulanmış bulgu · 16 aksiyon · 3 P0.

> Kaynak listesi: "20 (advanced) ways to get your vibe coded app hacked".
> Bu belge kanıt bazlıdır: her satırın arkasında ya dosya:satır ya canlıdan dönen bir sayı vardır.

---

## Yönetici özeti

Genel tablo beklediğimden iyi: OYNA'nın temeli sağlam kurulmuş. Canlıdaki 122 tablonun 122'sinde satır bazlı erişim koruması (RLS — kimin hangi satırı görebileceğini veritabanının kendisinin kararlaştırması) açık, 602 ayrıcalıklı fonksiyonun tamamında yol kilidi konmuş, SQL enjeksiyonu yüzeyi yok, kullanıcı içeriğini ham HTML olarak basan tek bir yer yok, parolalar hiçbir yerde düz metin durmuyor, e-posta onayı canlıda gerçekten zorunlu, iyzico webhook'u imzayla doğrulanıyor ve dosya yükleme sunucu tarafında tür/boyut sınırıyla kilitli. Depo geçmişinde de sızmış bir anahtar yok. Buna karşılık üç konu lansmandan önce değil, ŞİMDİ kapatılmalı. Birincisi: 29 demo hesabın şifresi canlıda gerçekten "password123" ve bu şifre derlenmiş uygulama paketinin içinde duruyor; bugün kapatılan demo hesap seçicisi bu açığı KAPATMIYOR, çünkü saldırganın uygulamayı hiç kullanmadan doğrudan Supabase giriş adresine e-posta+şifre göndermesi yeterli — üstelik 6 gerçek sahanın 5'inin sahibi bu demo hesaplardan biri. İkincisi: para iade eden üç fonksiyon (maç iadesi, kademeli iade, kapora çözme) giriş yapmış herhangi bir kullanıcıya doğrudan açık; kullanıcı maç ücretini geri alıp yerini koruyabiliyor, hatta cüzdanına yüklediği parayı ikinci kez kredi olarak alabiliyor. Üçüncüsü: tek yönetici hesabı 6 karakterlik bir şifreyle, ikinci faktör olmadan korunuyor ve iki adımlı doğrulama kontrolü tamamen tarayıcı tarafında — yani şifreyi ele geçiren biri paneli hiç açmadan yönetici işlemleri yapabilir. Bunların dışındakiler (yayın öncesi kapatılacak orta seviye işler) tuzak kurulmuş ama henüz patlamamış maddeler: saha ödeme anahtarı/IBAN kolonlarının herkese okunabilir olması, maç ve profil tablolarına doğrudan yazılabilen para/rol kolonları, giriş denemesine hız sınırı olmaması ve CI'daki bağımlılık kapısının hata yutması. Şunu açıkça belirtmeliyim: bana "demo kapatıldı" diye verilen bilgi ile canlı gerçek çelişiyor — ön yüzde kapatıldı, canlıda kapanmadı.

### Kurucu tarafından doğrulanmış canlı sayılar (9 Ağu 2026)

| Ölçüm | Değer |
|---|---|
| @oyna.app demo hesap | **29** |
| Şifresi `password123` olan | **29 / 29** |
| Gerçek (demo olmayan) saha | 6 |
| Sahibi demo hesap olan gerçek saha | **5** |
| Son 30 günde giriş yapmış demo hesap | 26 |
| Yönetici hesabı | 1 |

---

## 20 maddenin durumu

| # | Madde | Durum | OYNA'da bugün |
|---|---|---|---|
| 1 | .env GitHub'da | ✅ Güvende | Ayar dosyası git geçmişine hiç girmemiş; geçmişte eklenen tek dosya örnek şablon. |
| 2 | Frontend'de API anahtarı | 🔴 Kritik | Supabase'in halka açık anahtarı sorun değil, ama derlenmiş pakete gömülü demo şifresi canlıda 29 hesabın 29'unda gerçekten çalışıyor. |
| 3 | RLS yok | 🟡 Kısmi | RLS her tabloda açık ve genelde doğru yazılmış, ama birkaç politikada gereğinden geniş dallar var. |
| 4 | Yetki kararı frontend'de | 🟡 Kısmi | Yönetici ve rol kararlarının neredeyse tamamı sunucuda tekrar denetleniyor; tek istisna iki adımlı doğrulama kapısı ve bazı iade fonksiyonlarının istemciden gelen parametreye güvenmesi. |
| 5 | Hız sınırı yok | 🟡 Kısmi | Ödeme ve bildirimde gerçek hız sınırı var, ama girişte, personel davet kodunda ve şifre sıfırlama onayında hiç sayaç yok. |
| 6 | SQL string birleştirme | ✅ Güvende | Veritabanı fonksiyonlarında metin birleştirmeli dinamik SQL yok; enjeksiyon yüzeyi bulunamadı. |
| 7 | Girdi doğrulama yok | 🟡 Kısmi | Ana akışlarda (maç kurma, mesaj) doğrulama sunucuda ve güçlü; ama tabloya doğrudan yazılan yerlerde uzunluk ve tutar sınırı yok. |
| 8 | Kullanıcı içeriği ham HTML | ✅ Güvende | Kullanıcı verisini HTML olarak basan tek bir yer yok; yasal metin üretiminde de kaçışlama doğru sırada yapılıyor. |
| 9 | Düz metin parola | ✅ Güvende | Uygulama hiçbir yerde parola saklamıyor; sıfırlama kodu bile şifreli özet olarak tutuluyor. |
| 10 | Oturum localStorage'da | 🟡 Kısmi | Oturum jetonu kalıcı olarak tarayıcı deposunda duruyor, mobilde şifresiz eşleniyor ve yönetici paneli aynı anahtarı paylaşıyor. |
| 11 | Korumasız yönetici paneli | 🟠 Risk | Panel kapıları sunucuda gerçekten denetleniyor ama tek yönetici hesabı tek faktörle açılıyor ve ikinci faktör zorlaması yalnız tarayıcıda. |
| 12 | CORS yıldız | 🟡 Kısmi | 14 Edge fonksiyonunun 10'u her kaynağa açık cevap veriyor, ama çerez/kimlik paylaşımı olmadığı için pratik saldırı değeri düşük. |
| 13 | E-posta doğrulama yok | ✅ Güvende | E-posta onayı canlıda zorunlu ve fiilen uygulanıyor; doğrulanmamış hiçbir hesap giriş yapamamış. |
| 14 | Tahmin edilebilir kimlikler | 🟠 Risk | Veritabanı kimlikleri ve jetonlar tahmin edilemez, ama insanın elle girdiği üç kod kısa ve deneme sınırsız. |
| 15 | Tüm istek gövdesini kaydetme | 🟡 Kısmi | İstemcinin gönderdiği gövdeyi olduğu gibi kabul eden üç yer var: maç tablosu, profil tablosu ve webhook ham kaydı. |
| 16 | Webhook imza kontrolü | ✅ Güvende | Sahte 'ödeme yapıldı' isteği kabul edilmiyor; sistem iyzico'ya imzalı ikinci bir sorgu atıp öyle karar veriyor. |
| 17 | Üretimde yığın izi | 🟡 Kısmi | Kullanıcıya ham hata gösterilmiyor ve kaynak harita üretilmiyor; ama bir ödeme ucu ham veritabanı metnini geri veriyor ve loglara e-posta adresi yazılıyor. |
| 18 | Güncellenmeyen bağımlılıklar | 🟠 Risk | Güvenlik kapısı hata yutuyor, otomatik takip yok ve 41 paket geride — bugün zararsız ama gerçek bir açık duyurulduğunda kimse haber almaz. |
| 19 | Parola gücü yok | 🟠 Risk | 6 karakter yeterli sayılıyor, karmaşıklık şartı yok ve sızmış parola kontrolü kapalı — tek yönetici hesabı bu zincirin ucunda. |
| 20 | Dosya yükleme doğrulaması | 🟡 Kısmi | Tür ve boyut denetimi sunucuda kilitli ve betik çalıştıran formatlar reddediliyor; eksik olan klasör sahipliği ve kota. |

**Dağılım:** ✅ 6 güvende · 🟡 9 kısmi · 🟠 4 risk · 🔴 1 kritik.

---

## P0 — Şimdi (lansmanı beklemez)

### Demo hesapların canlı şifresini geçersiz kıl, sahipliği düzelt, şifreyi koddan tamamen çıkar

**Neden:** Canlıda 29 @oyna.app hesabının 29'unun şifresi gerçekten 'password123' ve bu şifre derlenmiş uygulama paketinin içinde duruyor. 6 gerçek sahanın 5'inin sahibi bu hesaplardan biri; internetteki herhangi biri saha sahibi olarak girip fiyat, komisyon, takvim ve 21 maçın katılımcı bilgilerini okuyup değiştirebilir. Bugün ön yüzde yapılan demo kapatması bu açığı KAPATMIYOR: saldırganın uygulamayı hiç açması gerekmiyor, doğrudan Supabase giriş adresine e-posta+şifre göndermesi yeterli.

**Nasıl:** Sıra önemli. (1) Canlıda 29 @oyna.app hesabının şifresini rastgele değerlerle değiştir ya da hesapları askıya al (banned_until) — açık yalnız burada kapanır. (2) 5 gerçek sahanın owner_id alanını gerçek sahip hesaplarına taşı; taşınana kadar bu sahaları is_active=false yapmayı değerlendir. (3) Kodu temizle: supabaseAuth.ts:272-277 '?demo=1' yakalayıcısını ve :286'daki sessionStorage dalını sil, :298'deki DEMO_PASSWORD sabitini ortam değişkeninden oku, data/demoAccounts.ts:31'deki 'password123' yedeğini sil. (4) Kalıcı önlem: demo hesaplar üretim projesinde değil, şu an boş olan oyna-staging projesinde yaşasın.

*Efor: orta · Kim: Birlikte · 🔒 canlıya yazar (onay gerekir)*

### Kullanıcıya doğrudan açık para iade fonksiyonlarını kapat

**Neden:** Dört para fonksiyonu giriş yapmış herhangi bir kullanıcıya doğrudan açık ve hiçbiri karşılığında bir şey geri almıyor: process_match_refund ile oyuncu maç ücretinin tamamını harcanabilir krediye çevirip yerini koruyor; process_tiered_refund ile kapora geri alınıp rezervasyon 'ödendi' kalıyor, üstelik cüzdan yüklemesinde iade kademesi istemcinin gönderdiği saate bakıldığı için bakiye ikiye katlanabiliyor; void_preauth ile kaptan kaporasını çözüp maçı 'kapora bloke' görünürken sürdürebiliyor; process_match_payment ise defter satırını sistem dışından yazdırıyor.

**Nasıl:** Tek migration dosyasında dört REVOKE: process_match_refund, process_match_payment, process_tiered_refund, void_preauth üzerindeki EXECUTE yetkisi authenticated rolünden alınır (service_role kalır, Edge fonksiyonları bozulmaz). Bu dört fonksiyon depoda hiçbir ekrandan çağrılmıyor — supabaseMutations.ts:224 ve :242'deki ölü sarmalayıcılar da silinir. Meşru kullanıcı akışları zaten mevcut ve doğru: leave_public_match_slot, player_release_slot, match_cancel_by_captain. §2 para kapısı: dosya hazırlanır, uygulama kurucu onayıyla.

*Efor: kucuk · Kim: Birlikte · 🔒 canlıya yazar (onay gerekir)*

### Yönetici hesabını sertleştir: sızmış parola koruması, 8 karakter, sunucu tarafında ikinci faktör

**Neden:** Tek yönetici hesabı 6 karakterlik bir şifreyle korunuyor, sızmış parola kontrolü kapalı ve iki adımlı doğrulama şartı YALNIZCA tarayıcı kodunda. Yani şifreyi ele geçiren biri paneli hiç açmadan doğrudan veritabanı uçlarına yönetici çağrıları yapabilir (ban, kullanıcı yaratma, cüzdan düzeltme, hayalet oturum). Girişte hız sınırı ve denetim izi de olmadığı için saldırı sürerken fark edilmez. 36 gerçek kullanıcının kişisel verisi bu zincirin ucunda.

**Nasıl:** (1) Supabase panelinden Authentication → Password: 'Leaked password protection' aç, minimum uzunluğu 8 yap, karakter sınıfı şartını aç — bu ayar uygulamadan bağımsız her girişi kapsar, en yüksek getirili adım. (2) Yönetici hesabının TOTP'si doğrulanmış (canlıda 1 faktör var); önce kurtarma kodlarını üret, sonra app_config.admin_mfa_required=true yap. (3) Asıl düzeltme: is_platform_admin()/require_admin_role() içine ya da en azından para ve kişisel veriye dokunan admin RPC'lerinin başına 'jetonun aal seviyesi aal2 değilse reddet' kontrolü ekle — bu olmadan bayrak yalnız arayüz süsü. (4) adminService.ts:206-218'deki 'ayar okunamazsa 2FA kapalı' varsayılanı üretimde kapalı-fail yapılsın. (5) Auth log saklama süresini panelden kontrol et.

*Efor: orta · Kim: Birlikte · 🔒 canlıya yazar (onay gerekir)*

---

## P1 — Lansmandan önce

### Saha ödeme anahtarı ve IBAN kolonlarını herkesin okumasından çıkar

**Neden:** pitches tablosundaki iban, param_api_key, param_client_id, param_merchant_id kolonları hem giriş yapmamış ziyaretçiye hem her kullanıcıya açık. Bugün kolonlar boş olduğu için sömürülemiyor, ama saha sahibi ödeme ayarları ekranından anahtarını girdiği an tek bir istekle tüm sahaların ödeme sağlayıcı anahtarı ve IBAN'ı toplu dökülür. Aynı tuzak teams.invite_token kolonunda da kurulu.

**Nasıl:** Sıra ters uygulanırsa saha listesi tamamen ölür. (1) Önce kod: supabaseMutations.ts:413'teki `select('*')` yerine açık kolon listesi yazılır. (2) pitchOwnerService.ts:1770 okuma ve :1808 yazma için can_manage_pitch kontrollü iki ayrıcalıklı RPC yazılır (owner_get_payment_settings / owner_set_payment_settings). (3) Sonra migration: bu dört kolon ile teams.invite_token üzerindeki SELECT yetkisi anon ve authenticated rollerinden geri alınır. (4) Uzun vade: bu anahtarlar pitches tablosunda hiç durmamalı, ayrı ve kimseye yetki verilmemiş bir tabloda ya da Vault'ta tutulmalı.

*Efor: orta · Kim: Birlikte · 🔒 canlıya yazar (onay gerekir)*

### Maç ve profil tablolarına doğrudan yazma yüzeyini daralt

**Neden:** Giriş yapmış kullanıcı matches tablosuna 62 kolonun tamamıyla satır yazabiliyor: fiyat, komisyon oranı, kapora, durum dahil. Bugün mutabakat rezervasyon satırına baktığı için doğrudan gelir kaybı yok, ama iki gerçek sonuç var — keşif ekranına karşılığı olmayan hayalet maç açılabiliyor ve saha yetkilisi kendi sahasının komisyonunu sıfırlayabiliyor (kart ödemesi açıldığı gün doğrudan gelir sızıntısı). profiles tarafında INSERT 68 kolonun tamamında açık (is_admin, wallet_balance dahil); bugün yalnız 'herkesin profili zaten var' tesadüfü koruyor.

**Nasıl:** (1) matches için en sağlamı, mesajlar tablosunda uygulanan deseni tekrarlamak: INSERT'i politikasız bırakıp yazmayı yalnız create_match_atomic'e devretmek (bu fonksiyon ayrıcalıklı çalıştığı için etkilenmez). Alternatifi kolon kolan REVOKE (price, deposit_*, commission_*, is_platform, status, slots, awaySlots). (2) _set_match_commission_model ve calculate_commission içindeki COALESCE'ler kaldırılıp oran daima anlaşmadan okunsun; _match_confirm_settle oranı satırdan hiç okumasın. (3) profiles için: önce services/userService.ts:107'deki istemci INSERT'i kaldırılır (tetikleyici profili zaten açıyor), sonra is_admin/wallet_balance/role/roles kolonlarındaki INSERT yetkisi geri alınır. (4) protect_profile_columns tetikleyicisine is_pro, rating ve ratings_history de eklenir.

*Efor: orta · Kim: Birlikte · 🔒 canlıya yazar (onay gerekir)*

### İade defterini tekilleştir ve simülasyon dalını ödeme akışından çıkar

**Neden:** İki ayrı iade defteri birbirini saymıyor: niyet üzerinden yazılan iade satırı 'DEPOSIT' tipinde, maç defterindeki 'daha önce iade edildi mi' kontrolü ise yalnız 'MATCH_REFUND/REFUND' tiplerine bakıyor. Kart moduna geçildiğinde kullanıcı aynı ödemeyi iki kez geri alabilir. Ayrıca payment-webhook'ta hâlâ imzasız bir simülasyon dalı duruyor ve ödeme sağlayıcısının varsayılan değeri 'SIMULATION'.

**Nasıl:** (1) _match_refund_partial'ın önceki-iade kontrolü niyet defterini de görsün; daha temizi, iade satırlarına zorunlu referans (maç kimliği / niyet kimliği) yazılıp tekillik indeksiyle korunsun — aynı ödemeye ikinci iade fiziksel olarak yazılamasın. (2) process_tiered_refund'da politika parametre olmaktan çıkıp niyetten türetilsin; cüzdan yükleme iadesi ayrı yola alınıp yükleme satırı ters kayıtla kapatılsın; iade ile iptal aynı işlemde olsun. (3) apply_booking_payment'a apply_card_payment'taki 'durum PENDING olmalı' satırı eklensin. (4) payment-webhook'taki SIMULATION dalı tamamen silinsin; sağlayıcı varsayılanı 'IYZICO' yapılsın. (5) Kurucu Supabase panelinden SIMULATION_WEBHOOK_ALLOW'un tanımsız olduğunu ve PAYMENT_PROVIDER'ın IYZICO olduğunu teyit etsin.

*Efor: orta · Kim: Birlikte · 🔒 canlıya yazar (onay gerekir)*

### Demo bayrağının açtığı yatay erişim kapılarını kapat

**Neden:** Bugün canlıda demo saha yok, ama giriş yapmış herhangi bir kullanıcı tek bir istekle is_demo=true bir saha yaratabiliyor; o an OWNER rolündeki 4 kullanıcının hepsi o sahayı yönetebilir hale geliyor. Aynı şekilde pitch_bookings okuma politikasındaki demo dalı, bir sahaya demo işareti konduğu an tüm rezervasyonları (kim, hangi saat, ne ödedi) her kullanıcıya açar. Yani aktif sızıntı değil, kurulu mayın.

**Nasıl:** Tek migration: (1) pitch_access_level içindeki 'is_demo AND has_role(OWNER)' dalı kaldırılır — demo sahalar da gerçek sahiplik üzerinden yönetilsin. (2) pitches INSERT politikasına 'is_demo yalnız yöneticiyle true olabilir' şartı eklenir. (3) pitch_bookings_select politikasındaki demo dalı çıkarılır. (4) demo_mode_enabled bayrağının sunucu tarafında başka neyi açtığı yayın öncesi bir kez gözden geçirilir.

*Efor: orta · Kim: Birlikte · 🔒 canlıya yazar (onay gerekir)*

### Kaba kuvvet ve kod tahmini frenlerini tak

**Neden:** Girişte hiçbir sayaç, kilit veya CAPTCHA yok ve denetim izi boş — sözlük saldırısı sürerken göremeyiz. Personel davet kodu 6 hane rastgele sayı ve deneme sınırsız (72 saatlik pencerede taranabilir). Şifre sıfırlama kodu kriptografik olmayan üreteçle üretiliyor ve onay ucunda IP sayacı yok; 15 dakikada 3 istekle kurbanın gerçek kodu sürekli geçersiz kılınıp posta kutusu doldurulabiliyor. Özel maç kodu ise zaten gereksiz: özel maçlar herkese görünüyor.

**Nasıl:** (1) password-reset-request/index.ts:88'deki Math.random yerine crypto.getRandomValues (tek satır, hemen). (2) staff_accept_invite'a kullanıcı başına saatte 5 başarısız deneme sınırı (mevcut social_rate_usage deseni), davet süresi 72 saatten 24 saate. (3) password-reset-confirm'e IP başına sayaç; ayrıca 'e-posta kayıtlı değil' dalındaki hızlı dönüş yüzünden zamanlama farkıyla kullanıcı listesi çıkarılabiliyor, iki yolun süresi eşitlensin. (4) Özel maç için asıl düzeltme kod uzunluğu değil görünürlük: public_matches görünümüne ve matches okuma politikasına 'özel maçı yalnız kaptan ve kayıtlı oyuncular görsün' şartı eklensin. (5) Giriş için CAPTCHA: önce yalnız yönetici paneli (web) için açılsın — mobil uygulamada açılırsa giriş çağrısına jeton eklenmeden uygulama tamamen giriş yapamaz hale gelir.

*Efor: orta · Kim: Birlikte · 🔒 canlıya yazar (onay gerekir)*

### CI güvenlik kapılarındaki iki deliği kapat

**Neden:** Sır taraması, yalnız markdown veya docs değiştiren bir gönderimde HİÇ çalışmıyor — oysa anahtarlar en sık kurulum notlarına ve runbook'lara yapıştırılır; kaçan commit sonraki koşularda da taranmaz, yani delik kalıcı. Ayrıca .env kontrolü sadece tam '.env' adını arıyor ('.env.production' fark edilmez) ve bağımlılık kapısı hatayı yutuyor, yani bugün 1 kritik + 9 yüksek açık sessizce yeşil geçiyor.

**Nasıl:** (1) Sır taramasını ayrı bir iş akışına al, orada dosya türü filtresi hiç kullanma, tüm dallarda çalışsın. (2) .env kontrolünü desene çevir: '.env' ile başlayan her dosya (örnek dosya hariç) bulunursa kapı kırılsın. (3) GitHub'ın kendi Secret Scanning + Push Protection özelliğini repo ayarlarından aç — bu, gönderim daha yapılmadan reddeder, atlanamaz. (4) Bağımlılık kapısını doğru sırayla kur: önce üretim ağacındaki 2 açığı `npm audit fix` ya da package.json overrides ile kapat, sonra bloklayan kapıyı yalnız üretim ağacına kur; geliştirme araçları için ayrı ve bloklamayan bir adım bırak. (5) .github/dependabot.yml ekle (haftalık, güvenlik güncellemeleri ayrı grup).

*Efor: kucuk · Kim: Birlikte*

### Oturum jetonunu koru: içerik güvenlik başlığı, ayrı yönetici anahtarı, şifreli mobil depo

**Neden:** Bugün sömürülebilir bir HTML enjeksiyonu yok, ama savunma derinliği eksik. Yarın bir bağımlılık zehirlenirse tarayıcıda çalışan betiği durduracak bir içerik güvenlik başlığı yok; oturum jetonu kalıcı ve yönetici paneli aynı anahtarı paylaştığı için oyuncu tarafındaki tek bir açık yönetici oturumunu da götürür; mobilde jeton şifresiz alanda eşleniyor.

**Nasıl:** (1) vercel.json başlıklarına içerik güvenlik politikası eklensin — canlı bağlantı için wss:// adresi mutlaka listede olsun, yoksa takım sohbeti ve canlı katılım şeridi sessizce çalışmaz; önce yalnız raporlama kipinde yayınlanıp ihlaller toplansın. Capacitor paketi bu başlıkları kullanmadığı için index.html'e ayrıca meta etiketi gerekir. (2) Yönetici paneline ayrı Supabase istemcisi: farklı depo anahtarı ve kalıcı olmayan oturum (panelde zaten 15 dk/8 saat kapısı var). (3) Mobilde @capacitor/preferences yerine Keychain / şifreli tercih deposu sağlayan eklentiye geçiş — tek dosyada kalır. (4) ESLint'te react/no-danger, no-eval kuralları hata seviyesine.

*Efor: orta · Kim: Claude*

---

## P2 — Lansmandan sonraki ilk ay

### Ticari yapılandırmayı ve anon yazma yetkilerini daralt

**Neden:** Giriş yapmamış biri komisyon oranını, iade eşiklerini, ödeme modunu ve 21 satırlık tam tarife tablosunu indirebiliyor; özel/açık maç satırlarında komisyon ve kapora alanları da anonim görünüyor. Kişisel veri sızmıyor, ama rakibe ticari yapılandırma dökümü veriliyor. Ayrıca 111 tabloda anon rolünün yazma yetkisi duruyor; bugün RLS engelliyor ama ileride tek bir yanlış politika o yetkiyi anında sömürülebilir hale getirir.

**Nasıl:** (1) settings_select_public politikası 'public' yerine 'authenticated' rolüne verilsin — giriş öncesi sürüm kapısı zaten ayrı bir fonksiyondan çalışıyor, hiçbir ekran kırılmaz. (2) waitlist okuması kullanıcının kendi satırıyla sınırlansın. (3) public_matches görünümünden komisyon ve kapora alanları çıkarılsın, özel maçlar filtrelensin. (4) İkinci kilit olarak finans ve kimlik tablolarında (payment_intents, wallet_transactions, booking_payments, payout_*, pitch_bank_accounts, user_saved_cards, pitch_customers, pitch_debtors, admin_*) anon rolünden tüm yetkiler geri alınsın; yeni tabloların otomatik yetki almamasını sağlayan mevcut tetikleyici deseni genişletilsin.

*Efor: orta · Kim: Birlikte · 🔒 canlıya yazar (onay gerekir)*

### Girdi sınırlarını veritabanına yaz ve dosya yüklemeyi klasör sahipliğine bağla

**Neden:** Serbest metin alanlarında sunucu tarafında hiç uzunluk sınırı yok; kullanıcı kendi adına veya maç başlığına devasa metin yazıp diğer kullanıcıların uygulamasını yavaşlatabilir. Veresiye ve gider tutarlarında negatif/uçuk değer denetimi yok, defter sessizce yanlışlanabilir. Dosya yüklemede 'pitches' dışındaki klasörlerde hiç sahiplik kontrolü yok, kullanıcı başına kota yok ve kullanıcı kendi eski dosyasını silemiyor.

**Nasıl:** (1) Tek migration ile uzunluk kısıtları: profiles.full_name ≤120, profiles.bio ≤500, matches.title ≤120, matches.location ≤200, veresiye/gider metinleri. Mevcut veride aşan satır yok, kısıtlar doğrudan geçer. (2) Tutar kısıtları: gider için mutlak büyüklük sınırı (düzeltme satırları negatif olabilsin), veresiye için 0 ile üst sınır arası. (3) Yükleme politikası beyaz listeye çevrilsin — dikkat: yönetici paneli home-banners/ ve matches/ klasörlerine aynı kancadan yazıyor, politikaya yönetici dalı eklenmezse panel kırılır. Kullanıcı yüklemeleri users/<kullanıcı-kimliği>/ altına taşınıp aynı yola silme hakkı verilsin, politikaya dosya sayısı sınırı eklensin.

*Efor: orta · Kim: Birlikte · 🔒 canlıya yazar (onay gerekir)*

### Hata ve log hijyeni: ham metin sızıntısı, e-posta maskeleme, Türkçe mesaj kapsamı

**Neden:** Ödeme başlatma ucu beklenmedik durumlarda ham veritabanı metnini geri veriyor (kısıt ve fonksiyon adları görünebilir). Şifre sıfırlama ve e-posta fonksiyonları kullanıcı e-postasını Edge loguna yazıyor — bugün bir kayıt var ama yayına çıkınca birikir; bu bir güvenlik açığı değil, kişisel veri asgariliği sorunu. Ayrıca canlıdaki 217 sunucu kuralından 53'ünde kullanıcı 'Bir şeyler ters gitti' görüyor, bu destek yükü üretir.

**Nasıl:** (1) Kullanıcıya açık uçlar için ortak bir güvenli hata yardımcısı: bilinçli yazılmış kod kalıbına uyan metin aynen geçsin, uymayan metin 'INTERNAL' olarak dönsün, gerçeği yalnız loga düşsün. Secret ile kapalı dört fonksiyona dokunmaya gerek yok. (2) İki console.log'da e-posta yerine maske yazılsın. (3) Türkçesi olmayan 53 kod için: ya sözlüğe eklensin ya da daha ucuzu, migration'da kuralın yanına Türkçe açıklama yazılsın. (4) Kullanıcıya ham hata basan dokuz ekran noktası merkezi hata çeviricisine bağlansın (bugün zaten ham metin çıkmıyor, bu tutarlılık işi).

*Efor: orta · Kim: Claude*

### Canlı ile depo arasındaki Edge fonksiyonu sapmasını kapat

**Neden:** İki fonksiyonun canlıdaki hali depodaki koddan farklı: admin-broadcast canlıda kapıyı açık bırakan eski sürümde, admin-create-user canlıda ek koruma katmanını içermiyor. Bugün zarar yok (veritabanı kapısı ikisini de durduruyor ve admin-broadcast'in hiçbir çağıranı yok), ama asıl risk şu: depodaki kodu okuyup canlıyı doğru sanmak her denetimi zehirler.

**Nasıl:** (1) admin-broadcast tamamen silinsin — sıfır çağıranı var, panel zaten doğru yoldan (doğrudan RPC) çalışıyor ve fonksiyon mevcut haliyle meşru yönetici için de çalışmıyor. (2) admin-create-user depodaki sürümden yeniden yayınlansın. (3) 14 fonksiyonun tamamı için canlı-depo karşılaştırması yapan küçük bir betik depoya eklensin, fark varsa uyarsın. (4) Sapma kapandıktan sonra config.toml'daki jeton doğrulama ayarları gerçeği yansıtacak şekilde yazılsın.

*Efor: kucuk · Kim: Birlikte · 🔒 canlıya yazar (onay gerekir)*

---

## P3 — İyi olur

### Yerel geliştirmenin canlıya bağlanmasını görünür kıl ve staging projesini ayağa kaldır

**Neden:** Depoda ayar dosyası olmadığı için her yerel çalıştırma bilerek canlı veritabanına bağlanıyor ve kod yalnız sessiz bir uyarı yazıyor. Sır sızıntısı yok, ama bir test betiği farkında olmadan gerçek veriye yazabilir. Kalıcı çözüm boş duran oyna-staging projesini kullanmak.

**Nasıl:** (1) supabaseClient.ts:33'teki uyarı hata seviyesine çıkarılsın ve mesaja hedef proje adı yazılsın; geliştirme kipinde ekranın üstünde kalıcı kırmızı 'CANLI VERİ' şeridi gösterilsin. Hata fırlatılmasın — /verify akışı bu yedeğe dayanıyor, kırılır. (2) oyna-staging projesi şemayla doldurulup yerel geliştirmenin varsayılan hedefi yapılsın. (3) scripts/owner-demo.mjs:45'teki VITE_ önekli servis anahtarı yedeği silinsin; vite.config.ts'e derleme zamanı bir kontrol eklenip VITE_ önekiyle servis anahtarı/gizli anahtar tanımlanırsa derleme dursun.

*Efor: orta · Kim: Birlikte*

### İyi desenleri kalıcılaştır: yanıltıcı kod, kural testleri ve düzenli taramalar

**Neden:** Bu denetimde çıkan güvenli sonuçların çoğu bilinçli iyi kararlara dayanıyor; asıl risk bu kuralların zamanla unutulması. Ayrıca bazı yerler okuyanı yanıltıyor: require_admin_role aldığı rol listesini hiç kullanmıyor (panelde rol ayrımı varmış izlenimi veriyor), saha eklerken rol veren tetikleyici korumayı 'hata fırlatarak' sağlıyor, kayıt akışındaki yorumlar canlı ayarla çelişiyor.

**Nasıl:** (1) require_admin_role ya gerçekten rol listesini denetlesin ya adı require_platform_admin olarak düzeltilsin. (2) Saha ekleme tetikleyicisindeki rol verme adımı bilinçli hale getirilip yanına 'sıradan kullanıcı saha ekleyememeli' regresyon testi yazılsın. (3) supabaseAuth.ts:387-410'daki e-posta onayı yorumları canlı gerçeğe göre düzeltilsin, üretimde asla başarılı olamayacak otomatik giriş denemesi kaldırılsın. (4) Birim testiyle çivilenecek kurallar: yeni ayrıcalıklı fonksiyonlarda yol kilidi zorunlu, ekranlarda ham hata basma yasağı. (5) Aylık rutin: tüm git geçmişini tarayan sır kontrolü ve Supabase güvenlik danışmanı çıktısının okunması; ikisi de SECRET_ROTATION runbook'una yazılsın.

*Efor: orta · Kim: Claude*

---

## Denetimin kendi notu

Bu denetim, oturum içinde daha önce verilen "demo girişi kapatıldı" bilgisini **çürüttü**:
ön yüzdeki hesap seçici kapatıldı, ancak (a) `?demo=1` parametresiyle açılan ikinci bir giriş yolu,
(b) koda gömülü ortak şifre sabiti ve (c) canlıda gerçekten geçerli 29 hesap yerinde kaldı.
Saldırgan uygulamayı hiç açmadan doğrudan Supabase giriş adresine istek atabildiği için
**açık ancak canlı tarafta kapanır**. Kayda geçirilmiştir (P-0: "bu koruma bozulursa kim söyleyecek?").

---

## Kurucu kararları (9 Ağustos 2026, denetim sonrası)

| Konu | Karar | Sonuç |
|---|---|---|
| Demo hesapların şifresi | **DOKUNULMAYACAK** — oldukları gibi kalsın | P0-1a askıya alındı; kalıcı riski aşağıda ölçüldü |
| Demo hesapların sahip olduğu 5 saha | **DOKUNULMAYACAK** — bu sahalar da demo | P0-1b askıya alındı |
| Yönetici sertleştirmesi (P0-3) | Uygulamadan önce **kapsamlı bilgi** istendi | Brifing hazırlandı (aşağıda) |
| Para iade fonksiyonları (P0-2) | Karar bekliyor | — |

### Kararın gerçek riski — ölçülmüş sınırlar (salt-okunur doğrulama)

Kararı güvenli kılan en önemli gerçek: **yönetici hesabı demo hesap DEĞİL.**

| Ölçüm | Değer | Anlamı |
|---|---|---|
| Demo hesap olan yönetici | **0** | Ortak şifreyle platform yöneticisi olunamaz |
| Gerçek hesaplı yönetici | 1 | Yönetici zinciri demo şifresinden bağımsız |
| Personel yetkisi olan demo hesap | **0** | Yatay yayılım yok |
| OWNER rollü demo hesap | 3 | Erişim yalnız demo sahalarla sınırlı |
| Demo sahibin görebildiği telefonlu rezervasyon | 16 kayıt · **2 farklı telefon** | Kişisel veri teması çok küçük |
| Demo sahibin görebildiği müşteri defteri kaydı | 9 | Aynı iki telefondan türemiş |

**Kalan risk (kabul edilmiş):** İnternetteki biri demo hesapla girip demo sahaların
ayarlarını/takvimini değiştirebilir, sahte rezervasyon/maç açabilir ve **2 farklı telefon
numarasını** görebilir. Ulaşamadıkları: platform yöneticiliği, başka kullanıcıların hesapları,
para (kart ödemesi `CASH_ONLY` ile kapalı, gerçek tahsilat 0 ₺).

**Lansman kapısı:** Bu kabul yalnız rafta olduğu sürece geçerlidir. Lansman gününün
kontrol listesine şu madde eklenmiştir: *"Demo hesapların şifreleri döndürülmeden ya da
demo hesaplar staging projesine taşınmadan gerçek kullanıcı alınmaz."*
