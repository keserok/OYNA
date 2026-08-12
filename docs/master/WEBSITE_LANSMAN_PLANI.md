# OYNA — Tanıtım Sitesi Lansman Planı

> **Tarih:** 12 Ağustos 2026 · **Kaynak:** `OYNA Websitesi.dc.html` tasarım paketi + depo ve canlı Supabase denetimi
> **Hedef:** Tasarım prototipini, güvenli ve doğru çalışan bir üretim sitesine dönüştürüp yayına almak.

---

## 0. Özet — tek paragrafta durum

Tasarım paketi yüksek kaliteli ve eksiksiz; görsel kurgu tartışmaya açık değil. Ama
prototip **olduğu gibi yayınlanabilir bir site değil** — bunu paketin kendi README'si de
söylüyor. Yayına almadan önce kapatılması gereken **dört karar**, **on beş güvenlik/uyum
maddesi** ve prototipten devralınan **on yedi teknik borç kalemi** var. Bunların içinde
tek gerçek "yayın engeli" sayılabilecek olan şu: sitedeki ödeme vaatleri bugün canlıda
kapalı olan özellikleri anlatıyor, iletişim formu hiçbir yere gitmiyor ve indirme
butonları ölü bağlantı. Yani site bugünkü hâliyle yayınlanırsa **gelen her talep sessizce
kaybolur** ve reklam mevzuatı açısından savunulamayacak bir metin yayında olur.

---

## 1. Önce cevaplanması gereken dört karar

Bu dördü cevaplanmadan kod yazmak, yanlış yere inşa etme riski taşır. Her birinin
altında **önerim** var; cevap gelmezse öneriyi varsayılan kabul edeceğim.

### K-1. Site hangi adreste yaşayacak? 🔴 ENGELLEYİCİ

**Sorun:** Bugün `vercel.json` içinde `/(.*)` → `/index.html` kuralı var; kök adresi
oyuncu uygulaması tutuyor. Ayrıca koda `https://oyna.app` gömülü:

| Yer | Ne gömülü |
|---|---|
| `services/tacticSocialService.ts:227` | `https://oyna.app/t/{token}` — taktik paylaşım linki |
| `components/social/ProviderOfferPicker.tsx:51` | Paylaşım metninde `https://oyna.app` |
| `public/cerez-politikasi.html:26` | "oyna.app ve alt sayfaları, web uygulaması" |
| `.env.example` | `VITE_APP_URL=https://app.oyna.com` ← **çelişki: .com vs .app** |

| Seçenek | Artı | Eksi |
|---|---|---|
| **A. `oyna.app` = site, `/uygulama` = app** | Tek dağıtım, tek depo. `/t/{token}` derin linkleri bozulmaz. Vite'ta zaten çok girişli derleme var (`index.html` + `admin.html`) — üçüncüsü doğal | Vercel yol kuralları dikkatli yazılmalı |
| B. `oyna.app` = site, `app.oyna.app` = app | En temiz sınır | Mevcut `/t/…` linkleri için yönlendirme + Supabase Auth redirect + `ALLOWED_ORIGIN` + Capacitor deep-link ayarları taşınmalı |
| C. Ayrı depo / ayrı Vercel projesi | Uygulamayı hiç etkilemez | Marka varlıkları ve yasal metinler iki yerde kopyalanır → kayma |
| D. `/tanitim` alt yolu | En düşük risk | Reklam ve mağaza linkleri kök adrese gider; pazarlama açısından zayıf |

> **Önerim: A.** Mevcut mimariye en az müdahale, sıfır kırık link. `vite.config.ts`
> içindeki `rollupOptions.input`'a üçüncü giriş (`site.html`) eklenir; `vercel.json`
> kuralları yol bazlı ayrılır.
>
> **Ayrıca karar verilmeli:** `oyna.app` mı `oyna.com` mu? `.env.example` ile
> kodun geri kalanı çelişiyor — biri yanlış ve lansmandan önce tekilleştirilmeli.

### K-2. İndirme butonları ne yapacak? 🔴 ENGELLEYİCİ

**Sorun:** `RAF.md` §6 — mağaza hesapları açık iş olarak listeli, uygulama hiçbir
mağazada yayında değil. Tasarımda bu butonlar `href="#3a"` — yani **ölü bağlantı**
(sayfada toplam ~15 tane var).

> **Önerim: "Haberim olsun" e-posta kaydı + web uygulamasına ikinci bir yol.**
> Gelen trafik boşa gitmez, lansman günü duyurulacak bir liste birikir. Mağaza
> linkleri hazır olunca butonlar gerçek rozetlerle değiştirilir.

### K-3. İletişim formu nereye gidecek? 🔴 ENGELLEYİCİ

**Sorun:** Prototipte form **hiçbir yere gitmiyor** — `setupForms()` sadece alanları
gizleyip "Mesajın alındı." panelini gösteriyor. Bugünkü hâliyle yayınlanırsa her saha
sahibi başvurusu kaybolur ve kullanıcıya yalan bir onay gösterilir.

> **Önerim: Supabase tablosu + destek e-postası.** Yeni `iletisim_talepleri` tablosu
> (RLS kilitli: `anon` yalnız INSERT, SELECT yok) + mevcut `send-email` Edge
> Function'ıyla `destek@oyna.app`'e bildirim. Talep hem kayıtta kalır hem anında haber
> verir. Üçüncü taraf form servisi (Formspree/Tally) **önerilmiyor** — depodaki
> "hata kayıtları üçüncü tarafa gönderilmez" kurucu kararıyla (`utils/observability.ts`)
> ve KVKK yurt dışı aktarım metniyle çelişir.

### K-4. Ödeme/cüzdan vaatleri ne olacak? 🔴 HUKUKİ RİSK

**Sorun:** Site şunları anlatıyor: *"Bölüştürülmüş ödeme"*, *"Kaptan garantörlüğü"*,
*"QR'lı dijital bilet"*, *"Fair Play skoru"*, *"kazancını cüzdanda izle"*.
Canlıdaki gerçek (`RAF.md` §7):

| Anahtar | Değer |
|---|---|
| `payment_mode_global` | **CASH_ONLY** |
| `wallet_cashout_enabled` | **false** |
| `demo_mode_enabled` | **true** |
| Bugüne dek işlenen gerçek para | **0 ₺** |

Çalışmayan özellikleri çalışıyormuş gibi yayınlamak, 6502 sayılı Tüketicinin Korunması
Hakkında Kanun m.61 kapsamında **yanıltıcı ticari reklam** sayılabilir.

> **Önerim: Yumuşat — çalışanı anlat, geleni işaretle.** Bugün gerçekten çalışan
> özellikler (maç kurma, kadro doldurma, kaleci/hakem, saha takvimi, nakit akışı) ana
> vaat olur; kart/cüzdan özellikleri "yakında" rozetiyle ayrılır. Tasarımın görsel
> kurgusu **bozulmaz** — yalnız metin ve rozet değişir.

**Ek içerik tutarsızlıkları (aynı karar turunda çözülmeli):**

- **Kapsama:** `README.md` "Ordu · 19 ilçe · 4 saha" diyor; site posteri **İstanbul**
  (Galata Kulesi) ve form yer tutucusu **"Kadıköy"**. Ziyaretçi İstanbul'da hizmet
  bekler, bulamaz.
- **Üst etiket:** Paket README'si "Amatör futbol ve halı saha ekosistemi", HTML
  "YENİ FUTBOL EKOSİSTEMİ" diyor — hangisi?
- **Üst bar rengi:** HTML'de `#230909` (koyu bordo), tasarım sistemi ise açık zemin +
  tek kırmızı vurgu diyor. Logo görselleri ise sarı/altın. Marka rengi netleşmeli.

---

## 2. Bugünkü durum — ne var, ne yok

| Konu | Durum |
|---|---|
| Tasarım (masaüstü + mobil, tüm bölümler, hareketler) | ✅ Eksiksiz |
| Yasal sayfalar (Gizlilik, Kullanım Şartları, KVKK, Topluluk Kuralları) | ✅ `public/` içinde hazır, altbilgiye bağlanabilir |
| Marka logosu | ✅ **Vektör olarak var** — `components/OynaLogo.tsx`, tek `path`, viewBox `0 0 520 520`. PNG'den iyi: ölçeklenir, renklendirilebilir, ~2 KB |
| Dört fotoğraf (stadyum duvarı, projektör, krem kart, İstanbul posteri) | ❌ **Depoda yok.** Yüklenen pakette yalnız `.dc.html` + `README.md` vardı. Orijinaller gerekiyor |
| Archivo yazı tipi | ❌ Depoda yok (`public/fonts/` içinde Inter/Lora/Montserrat/Space Grotesk var). Eklenmeli — **CDN'den değil** (bkz. G-6) |
| Form arka ucu | ❌ Yok |
| Site giriş noktası (`site.html`) | ❌ Yok |

---

## 3. Güvenlik

### 3A. Sitenin kendi yüzeyi (yeni açılan riskler)

| # | Bulgu | Etki | Çözüm |
|---|---|---|---|
| **G-1** | **CSP başlığı yok.** `vercel.json` yalnız `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` gönderiyor | Tanıtım sitesi en çok taranan yüzeydir; CSP'siz her enjeksiyon serbest çalışır | `Content-Security-Policy` eklenir: `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'` |
| **G-2** | **HSTS yok** | Protokol düşürme saldırısına açık | `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` |
| **G-3** | `Permissions-Policy` uygulama için yazılmış (`geolocation=(self), camera=(self)`) | Tanıtım sitesinin konuma/kameraya ihtiyacı yok | Site yolları için ayrı, sıfırlanmış politika: `geolocation=(), camera=(), microphone=(), payment=(), usb=()` |
| **G-4** | **Form için hız sınırı / spam koruması yok** | Bot seli → destek kutusu dolar, Edge Function maliyeti artar | Honeypot alanı + zaman tuzağı (min. 3 sn) + sunucu tarafında IP hash'ine göre hız sınırı. Gerekirse Cloudflare Turnstile |
| **G-5** | **KVKK açık rızası pasif metin** — "Formu göndererek … kabul edersin" | Açık rıza, *ayrı ve açık bir irade beyanı* olmalı | Varsayılan **işaretsiz** onay kutusu + aydınlatma metnine bağlantı + saklama süresi tanımı |
| **G-6** | Archivo yazı tipi Google Fonts CDN'inden yüklenirse | Ziyaretçi IP'si yurt dışına aktarılır → KVKK aktarım sorunu | **Kendi sunucumuzda barındır** (`public/fonts/`) — depo zaten diğer yazı tiplerinde böyle yapıyor |
| **G-7** | Üçüncü taraf analitik eklenirse | `utils/observability.ts` kurucu kararı: *"hata kayıtları ÜÇÜNCÜ TARAFA GÖNDERİLMEZ"* | Analitik gerekiyorsa **birinci taraf**: `olay_yaz` RPC zaten `anon` çağrılabilir. Aksi hâlde çerez banner'ı da zorunlu olur |
| **G-8** | Edge Function `ALLOWED_ORIGIN` boş = `*` (`.env.example`) | Herhangi bir siteden çağrı | Lansmandan önce doldurulmalı; site kökeni de listeye eklenmeli |
| **G-9** | Prototip `support.js` ve `_ds/_ds_bundle.js` yüklüyor | Tasarım aracının çalışma zamanı | **Üretime asla girmemeli** — yeniden inşada zaten düşer, derleme kontrolüne eklenecek |
| **G-10** | Site, uygulamanın Supabase istemcisini/anon anahtarını içeri alırsa | Gereksiz yüzey + gereksiz yük | Site **sıfır kimlik doğrulama, sıfır anahtar** olmalı; form yalnız Edge Function'a POST eder |
| **G-11** | Altbilgide ticari kimlik bilgisi yok | 6563 s.K. ve ETBİS yükümlülüğü | Ünvan, adres, vergi no ve ETBİS kaydı altbilgiye eklenir (`public/kullanim-sartlari.html`'de bilgiler mevcut) |
| **G-12** | Altbilgide **Çerez Politikası** ve **Mesafeli Satış** bağlantısı yok | Bu sayfalar `public/` içinde var ama siteden erişilemiyor | Altbilgiye eklenir |

### 3B. Devralınan açıklar (canlı Supabase denetimi, 12 Ağu 2026)

Canlı projede (`iikvzgyccvgcybzdfwlv`) **412 güvenlik uyarısı**: 4 ERROR · 400 WARN · 8 INFO.
Hepsi siteyle ilgili değil, ama "hepsini kapat" dendiği için tam döküm:

| # | Bulgu | Seviye | Değerlendirme |
|---|---|---|---|
| **S-1** | 4 görünüm `SECURITY DEFINER`: `public_profiles`, `public_matches`, `public_goalkeepers`, `public_referees` | 🔴 ERROR | Altındaki tabloların RLS'ini atlar. `RAF.md`'de **SEC-3** olarak zaten açık — kurucu kararı bekliyor (gerçek ad görünürlüğü/KVKK). Site açık veri okuyacaksa **önce bu** |
| **S-2** | Sızmış parola koruması kapalı | 🟠 WARN | `RAF.md` **SEC-6**. Supabase panelinde 5 dakikalık iş, bedava |
| **S-3** | 3 tetikleyici fonksiyonu (`_trg_musteri_from_booking/_debtor/_subscription`) `anon`+`authenticated` için EXECUTE açık | 🟠 WARN | Pratikte çağrılamaz (dönüş tipi `trigger`, PostgREST sunmaz) — ama commit `79aa972` aynı durumda `rls_auto_enable()` için yetkiyi geri almıştı. **Aynı kararı burada da uygula** (tutarlılık) |
| **S-4** | `_tr_telefon_norm` değişken `search_path` | 🟠 WARN | Tek satırlık düzeltme: `SET search_path = public, pg_temp` |
| **S-5** | `cube`, `earthdistance`, `btree_gist` `public` şemasında | 🟠 WARN | `RAF.md` **SEC-8** — coğrafi indeksi bozabilir, bilerek ertelendi. Deneme ortamı (SRE-4) olmadan dokunulmamalı |
| **S-6** | 381 fonksiyon `authenticated` için SECURITY DEFINER + EXECUTE | 🟠 WARN | Bu mimarinin **tasarımı** (RPC üzerinden yetki). Tek tek denetim `docs/master/RPC_YETKI_ENVANTERI.md` işi — site lansmanının engeli değil |
| **S-7** | 8 tabloda "RLS açık, kural yok" | 🔵 INFO | ⚠️ **Bu bir açık değil, kasıtlı kalıp**: kural yok = herkese kapalı; erişim yalnız SECURITY DEFINER fonksiyonlardan. Commit `79aa972` bunu bilerek kurmuş. **Dokunulmayacak** |

> **Not:** S-1, S-2, S-5 zaten `RAF.md` §6'da kurucu kararı bekleyen işler olarak duruyor.
> Sitenin lansmanı bunlardan yalnız **S-1**'e bağlı (o da site açık veri okursa).
> Önerim: site **hiç veri okumasın** — tamamen statik olsun. O zaman S-1 lansmanı
> engellemez, kendi takviminde çözülür.

---

## 4. Prototipten devralınan teknik borç

Bunlar tasarımın hatası değil — prototip ile üretim arasındaki normal fark. Ama
**birebir kopyalanırsa** hepsi siteye geçer.

### Performans / doğruluk

| # | Sorun | Kanıt | Çözüm |
|---|---|---|---|
| **T-1** | Sonsuz `requestAnimationFrame` döngüsü + 400 ms `setInterval` + yakalama fazında scroll dinleyicisi; her karede tüm `[data-r]` öğeleri için `getBoundingClientRect()` | `startLoop()` / `scan()` | `IntersectionObserver` ile değiştir; rAF yalnız parallax için, o da `scroll` ile tetiklenen |
| **T-2** | `prefers-reduced-motion` hiç dikkate alınmıyor (kayan şerit, açılmalar, parallax) | Tüm hareket kodu | Medya sorgusuyla tüm hareket kapatılır — erişilebilirlik gereği |
| **T-3** | Görsellerde `width`/`height` yok | Tüm `<img>` | CLS (düzen kayması) → boyut öznitelikleri + `aspect-ratio` |
| **T-4** | Görseller optimize edilmemiş JPEG, `loading="lazy"` yok, `srcset` yok | Dört fotoğraf | AVIF/WebP + `srcset` + katlama altındakilere `loading="lazy" decoding="async"` |

### Erişilebilirlik

| # | Sorun | Kanıt | Çözüm |
|---|---|---|---|
| **T-5** | Form gerçek form değil: `type="button"`, `<form onsubmit>` yok | `data-submit` düğmesi | Enter ile gönderim çalışmıyor → gerçek `<form>` + `onsubmit` |
| **T-6** | `<label for="d-role">` bir `<div>`'i işaret ediyor | Satır 149-150 | Geçersiz eşleme → `<fieldset>` + `<legend>` |
| **T-7** | Radyo düğmelerinde `value` ve `id` yok | Satır 151-153 | Gönderilen veride rol bilgisi kaybolur |
| **T-8** | Alanlarda `name` ve `autocomplete` yok | Tüm form | Tarayıcı otomatik doldurma çalışmaz |
| **T-9** | **Kontrast AA'yı geçmiyor:** `color-mix(… 55%, transparent)` → yaklaşık `#7E7E7E` on `#F3F2F2` = **3,56:1** (gereken 4,5:1) | Üst açıklama, dipnot, telif satırı | %55 yerine **%70+** kullan. (%75 ve %78 kullanımları **6,9:1** — sorunsuz) |
| **T-10** | Vurgu kırmızısı `#ec3013` açık zeminde **3,79:1** | Birincil buton metni, vurgu metinleri | Normal metin için yetersiz; büyük metin/arayüz öğesi için yeterli. `--color-accent-700` değeri **ölçülmeli**; birincil buton metni beyaz olmalı |
| **T-11** | Atlama bağlantısı (skip link) yok | — | Klavye kullanıcısı her seferinde tüm menüyü geçer |
| **T-12** | `:focus-visible` halkası uygulanmamış | Paket README'si istiyor, prototipte yok | 2px kırmızı halka, 2px offset |
| **T-13** | Kayan şeridin ilk kopyası ekran okuyucuya iki kez okunur | Satır 67-68 (ikincide `aria-hidden` var) | Şeridi tamamen dekoratif işaretle |

### Diğer

| # | Sorun | Çözüm |
|---|---|---|
| **T-14** | ~15 adet `href="#3a"` ölü bağlantı | K-1/K-2 kararlarına göre gerçek hedefler |
| **T-15** | `style-hover` diye bir HTML özniteliği yok — tasarım aracına özel | Gerçek CSS `:hover` |
| **T-16** | Duyarlılıkta 768–1024 px arası tanımsız (README ≥1024 masaüstü, <768 mobil diyor) | Ara kırılım kararı gerekiyor — tablet boşta |
| **T-17** | **Türkçe büyük harf tuzağı:** `text-transform: uppercase` ile "İletişim" → `lang="tr"` yoksa "İLETIŞIM" (yanlış) olur | Kök `lang="tr"` (uygulamanın `index.html`'inde zaten var) + görsel doğrulama |

---

## 5. SEO ve paylaşım — tamamen eksik

Prototipte hiçbiri yok, hepsi lansman şartı:

- `<title>` ve meta açıklama
- Open Graph + Twitter kartları (WhatsApp/X paylaşımında önizleme)
- `canonical` bağlantısı
- `robots.txt` + `sitemap.xml`
- JSON-LD yapısal veri: `Organization` + `MobileApplication`
- `theme-color`, favicon seti, `apple-touch-icon`
- Türkçe `lang="tr"` + `hreflang` (ileride İngilizce eklenirse)

---

## 6. Uygulama planı

### Faz 0 — Kararlar ve varlıklar (senden)
1. §1'deki dört kararı cevapla (K-1…K-4).
2. Dört fotoğrafın **orijinal dosyalarını** gönder (depoda yok).
3. `oyna.app` mı `oyna.com` mu — tekilleştir.

### Faz 1 — İskele
4. `site.html` girişi + `vite.config.ts` `rollupOptions.input`'a ekleme.
5. `vercel.json` yol ayrımı — `/t/*` ve uygulama yolları korunarak.
6. Archivo yazı tipini `public/fonts/`'a indir, `@font-face` ile bağla (`font-display: swap`).
7. Logoyu `components/OynaLogo.tsx` vektöründen türet — PNG kullanma.

### Faz 2 — Sayfanın kendisi
8. Bölümleri sırayla kur: üst bar → hero → şerit → poster bandı → roller → saha sahibi → güvenli ödeme → iletişim → kapanış → altbilgi.
9. Hareketleri `IntersectionObserver` ile yeniden yaz (T-1), `prefers-reduced-motion` bağla (T-2).
10. Erişilebilirlik borcunu kapat (T-5…T-13).
11. Görselleri AVIF/WebP + `srcset` olarak üret (T-3, T-4).

### Faz 3 — Form arka ucu
12. `iletisim_talepleri` tablosu + RLS (anon yalnız INSERT).
13. Edge Function: sunucu tarafı doğrulama + hız sınırı + honeypot kontrolü + `send-email` ile bildirim.
14. KVKK onay kutusu + saklama süresi (G-5).

### Faz 4 — Güvenlik ve uyum
15. G-1, G-2, G-3 başlıklarını `vercel.json`'a ekle.
16. G-11, G-12: altbilgiye ticari kimlik + eksik yasal bağlantılar.
17. S-2 (parola koruması), S-3 (tetikleyici yetkileri), S-4 (`search_path`) kapat.
18. `ALLOWED_ORIGIN` doldur (G-8).

### Faz 5 — Doğrulama
19. Lighthouse: performans/erişilebilirlik/SEO ≥ 95.
20. `npm run lint` + birim testleri + `npm run build` yeşil.
21. Playwright ile gerçek tarayıcıda sürüş (`.claude/skills/verify` reçetesi).
22. Form uçtan uca: gönder → tabloya düştü mü → e-posta geldi mi.
23. Kontrast ölçümü (T-9, T-10) ve klavye turu.

---

## 7. Yayın öncesi kontrol listesi

- [ ] Dört karar cevaplandı, metin buna göre düzeltildi
- [ ] Ölü bağlantı yok (~15 `#3a` temizlendi)
- [ ] Form gerçekten bir yere gidiyor ve doğrulandı
- [ ] KVKK açık rıza kutusu var, varsayılan işaretsiz
- [ ] CSP + HSTS başlıkları canlıda ölçüldü
- [ ] Yazı tipleri kendi sunucumuzdan, dış CDN çağrısı sıfır
- [ ] Altbilgide 6 yasal bağlantı + ticari kimlik
- [ ] `prefers-reduced-motion` açıkken sayfa tamamen sakin
- [ ] Kontrast AA geçiyor
- [ ] OG kartı WhatsApp'ta doğru önizleniyor
- [ ] `robots.txt` + `sitemap.xml` yayında
- [ ] Ödeme vaatleri canlı ayarlarla tutarlı
- [ ] `demo_mode_enabled` kapatma kararı verildi (lansman günü 1. maddesi)

---

## 8. Bu planın dokunmadığı şeyler

Bilerek dışarıda bırakıldı:

- **Canlı veritabanına hiçbir değişiklik yapılmadı.** Denetim salt-okunur çalıştırıldı.
  S-1…S-5 önerilerinin hiçbiri uygulanmadı — `PARA · KAPILAR` yapı taşlarına dokunuyorlar
  ve `npm run etki` bunlar için onay ister.
- **S-6 (381 fonksiyon)** ve **S-7 (8 tablo)** — birincisi ayrı bir denetim işi,
  ikincisi zaten kasıtlı ve doğru kalıp.
- Mağaza lansmanı, iyzico geçişi, push altyapısı — bunlar
  `docs/master/GO_LIVE_CHECKLIST.md` ve `docs/master/STORE_LANSMAN_PLANI.md` işi.
