---
name: verify
description: OYNA'yı sandbox'ta canlı Supabase'e karşı Playwright ile sür — kurulum, giriş ve bilinen tuzaklar.
---

# OYNA doğrulama sürüşü reçetesi

## Kurulum
1. `npm run dev -- --port 5199 --strictPort` (arka planda). Env yoksa gömülü
   üretim Supabase yedeği devreye girer; `.env` ile override edilebilir.
   Demo hesap seçicisinin şifresi için `.env`'e `VITE_DEMO_ACCOUNTS=true` yaz.
2. **Doğrudan bağlantı (19 Ağu 2026'da doğrulandı):** ortamın ağ politikasında
   `*.supabase.co` + `sandbox-api.iyzipay.com` izinliyse sb-shim TÜNELİNE GEREK
   YOK — `https://iikvzgyccvgcybzdfwlv.supabase.co` doğrudan çalışır.
   TEK ŞART: Chromium'u `--ssl-version-max=tls1.2` bayrağıyla başlat. Ağ geçidi
   Chromium'un TLS 1.3 ClientHello'suna RESET atıyor (curl/Node/openssl
   etkilenmez); TLS 1.2'de sertifika doğrulaması tam açık kalır ve bağlantı
   geçer. Alan adı izinli DEĞİLSE eski `scratchpad/sb-shim.mjs` deseni
   (localhost:54321 → CONNECT tüneli, CA: /root/.ccr/ca-bundle.crt) hâlâ
   geçerli bir yedektir.
3. Playwright: `executablePath: '/opt/pw-browsers/chromium'`, viewport
   390×844, `proxy: { server: HTTPS_PROXY, bypass: 'localhost,127.0.0.1' }`,
   `args: ['--ssl-version-max=tls1.2']`.

## Giriş
- **E-POSTA + ŞİFRE ASIL YOLDUR** (kurucu kararı 24 Ağu 2026, prensip §4.7).
  Ekran iki sekmelidir: `#auth-tab-giris` · `#auth-tab-kayit`.
  Alanlar: `#auth-ad` (yalnız kayıt) · `#auth-eposta` · `#auth-sifre`.
  Anahtarlar: `#remember-me-toggle` (Beni Hatırla) · `#agreement-checkbox`
  (yasal onay; yalnız KAYIT kipinde çizilir).
- **TELEFON/SMS YOLU SİLİNDİ** (23 Ağu 2026) ve demo hesap seçici de yok.
  Ekranda telefon alanı ararsan bulamazsın — bu hata değil, karardır.
- **App Review hesapları (canlı, gerçek hesaplar — ayrıcalıklı kapı DEĞİL):**
  şifre hepsinde `Oyna!Saha2026`
  | rol | e-posta | girişte açılan ekran |
  |---|---|---|
  | oyuncu | `oyuncu@oyna.app` | ANA SAYFA |
  | kaleci | `kaleci@oyna.app` | KALECİ ANA SAYFA · Profil onaylı |
  | hakem | `hakem@oyna.app` | HAKEM ANA SAYFA · Profil onaylı |
  | tesis | `saha1@oyna.app` | OYNA İŞLETME · Ruzgar Arena |
- ⚠️ **TUZAK — elle açılan auth.users hesabı sessizce BOZUK olur.**
  `confirmation_token`, `recovery_token`, `email_change`,
  `email_change_token_new` sütunları NULL kalırsa GoTrue 500
  `"Database error querying schema"` döndürür ve giriş HİÇ çalışmaz —
  SQL'de hesap kusursuz görünür. Bu sütunlar `''` (boş dize) olmalıdır.
  Supabase'in kendi admin API'si bunu yapar; elle INSERT ederken atlanır.
- ⚠️ **TUZAK — kaleci/hakem panelinde "Profil onayı bekleniyor".**
  Üç ayrı kayıt gerekir: `profiles.verification_status='approved'`,
  `goalkeepers`/`referees` tablosunda satır (`verification_status='approved'`)
  ve `provider_identities` satırı (`status='VERIFIED'`). Biri eksikse panel
  açılır ama "onay bekleniyor" şeridi kalır.
- Yasal onay kartının ORTASI bağlı metindir (KVKK/Gizlilik/Şartlar bağlantıları).
  Kutuyu değiştirmek için `#agreement-checkbox .au-kutu` koordinatına tıkla;
  kartın ortasına tıklarsan belge modalı açılır.
- Girişin oturmasını ana sayfa metniyle bekle:
  `/MERHABA|ANA SAYFA|SAHA KİRALA/` (alt nav ana sayfada YOK; 'Sosyal'
  beklemek artık yanlış). Alt nav ancak Keşfet/Maçlarım gibi ekranlarda var:
  Ana Sayfa · Oyna · Maçlarım · Saha · Profil.
- Kalıcı oturum: tarayıcı restartında korunur (persistentAuthStorage).
  Temiz profil kayıt-öncelikli AUTH'a düşer → koşuya giriş prelüdü koy.
- ⚠️ **TUZAK — auth ekranından ÖNCE tanıtım karuseli var.** Temiz profilde
  `#auth-tab-kayit` doğrudan aranırsa BULUNAMAZ; ekranda `#intro-continue-button`
  durur. Karusel bitene dek o düğmeye bas, sonra sekmeleri bekle.
- ⚠️ **TUZAK — yasal onaysız gönderim hata vermez, PENCERE açar.**
  "HESAP OLUŞTUR"a onaysız basılırsa
  `div[role="dialog"][aria-label="Yasal onay"]` gelir; kayıt o pencerenin
  "ONAYLIYORUM VE DEVAM ET" düğmesiyle tamamlanır. Sayfada gezinen bir
  `/Devam/i` seçicisi pencerenin ARKASINDAKİ düğmeyi bulup takılır.

## Kayıt sonrası kurulum sihirbazı
Hazır betik: **`npm run kayit:dogrula`** (`scripts/kayit-akisi-dogrula.mjs`) —
kayıt → 5 adımlı sihirbaz → temiz tarayıcıda tekrar giriş → yanlış şifre.
- Kayıttan sonra ANA SAYFA DEĞİL, sihirbaz gelir:
  KONUM → YAŞ → İSİM → STİL → SEVİYE.
- ⚠️ **"Atla" her adımı geçmez.** `handleSkip` üç zorunlu kapı tutar: ad-soyad,
  **yaş** ve **seviye**. Eksikse kullanıcıyı o adıma geri götürür (ekranda
  "Devam etmek için seviyeni seç." belirir). Bu kilitlenme DEĞİL, karardır —
  mağazaların yaş derecelendirmesi beyanı buna dayanıyor. Ayrıca "Atla" önce
  `Kurulumu atla?` penceresini açar; sihirbazı bitiren, O PENCEREDEKİ ikinci
  "Atla" düğmesidir (`getByRole('button',{name:'Atla',exact:true}).last()`).
- ⚠️ **Yaş çarkı `<button>` değil tıklanabilir `<div>`** ve etiketlerde kısa
  çizgi değil **uzun tire** var: `24–30`. `'24-30'` aranırsa hiçbir şey bulunmaz.
- ⚠️ **Seviye şeridi `role="slider"`** ve `onPointerDown` ile çalışır; öğeye
  `click()` yetmez, koordinata gerçek fare tıklaması gerekir.
- ⚠️ **Hata mesajını sayfa metninde ARAMA — sahte yeşil verir.** Giriş ekranının
  kendi alt yazısı "E-postan ve şifrenle gir…" zaten "şifre" içeriyor. Gerçek
  hata `[role=alert]` / `.au-alan-hata` içindedir: "E-posta ya da şifre hatalı."
- Kayıt sunucu ayarına bağımlıdır: **e-posta doğrulaması açıkken** (Dashboard →
  Authentication → Sign In / Providers → Email → "Confirm email") kayıt olan
  kimse giriş YAPAMAZ ve ücretsiz plan saatte 2 posta gönderir. 24 Ağu 2026'da
  kurucu kararıyla KAPATILDI; kayıt anında oturum açıyor.

## Sürüş notları
- **Ödemede sandbox kanıtı:** create-payment yanıtındaki `threeDSHtml`'i
  base64 çöz ve `sandbox-api.iyzipay.com` ara — SANDBOX değilse OTP GİRME.
  Sandbox 3DS kodu `283126`, test kartı `5528790000000008 · 12/30 · 123`.
- Kart formu: "Yeni kart ekle" METNİ alt bilgi cümlesinde de geçer
  (`text=/Yeni/i` + `.last()` YANLIŞ hedefe gider) — `<button>` içinde
  `/Yeni\s*kart ekle/i` ve `innerText.length < 40` süzgeciyle tıkla.
  "KULLAN VE KAYDET" ararken dikkat: "Son kullanma" da /KULLAN/i'ye uyar.
- Maçlarım'daki kart/sheet'ler programatik `el.click()` ile açılmayabiliyor —
  kartın koordinatına GERÇEK fare tıklaması yap (`page.mouse.click`).
- Tarih şeridi gece yarısı kayar (Europe/Istanbul); gün çiplerini metinden
  dinamik seç, sabit "PER 20" bekleme. Saat fiyatları da ("3.200₺") çıplak
  sayı seçicilere yakalanır — `hasText: '20'` gibi kısa desen kullanma.
- Sheet aksiyonları için gerekirse `scrollIntoViewIfNeeded` + koordinat.
- Kanıt: her adımda screenshot (`scratchpad/shots/`); sunucu yan doğrulaması
  için Supabase MCP `execute_sql` (payment_intents, card_refund_queue,
  pitch_bookings, matches). Göçler `apply_migration` ile (5432 kapalı).
- Türkçe büyük/küçük harf: JS regex `/i` 'İ/ı' eşleşmesini bilmez —
  `innerText.toLocaleLowerCase('tr')` ile karşılaştır.
