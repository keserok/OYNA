# Yönetim Panelini Ayrı Domain'e Taşıma — Kurulum Rehberi

Bu rehber, OYNA yönetim panelini (OYNA OS) ana uygulamadan ve mobil paketten
ayırıp **oynaturkiyepotansiyeli.com** adresinde çalıştırmayı **adım adım** anlatır.

- **Veritabanı ortak kalır.** Ayrılan yalnızca kod paketi ve dağıtımdır; tüm
  veriler (kullanıcılar, maçlar, cüzdan) aynı Supabase'de durmaya devam eder.
- **Kod hazır.** Bu depodaki değişiklikler ayrımı otomatik yapar; senin yapacağın
  şey yalnızca Vercel + DNS + Supabase panellerinde birkaç ayar.

---

## 0) Başlamadan — 2 dakikalık ön kontrol

| Kontrol | Nerede |
|---|---|
| GitHub reposuna erişimin var mı? | `keserok/OYNA` |
| Vercel hesabın repoya bağlı mı? | vercel.com → Dashboard |
| `oynaturkiyepotansiyeli.com` alan adının DNS paneline girebiliyor musun? | Alan adı sağlayıcın |
| Ana projedeki Supabase env değerlerini biliyor musun? | Vercel → ana proje → Settings → Environment Variables |

> 🔴 **EN ÖNEMLİ KURAL — SIRA:** Önce **admin projesini** kur ve çalıştığını gör
> (Adım 1–4), **en son** ana projeyi yeniden dağıt (Adım 5). Tersini yaparsan
> eski `/admin` linki henüz hazır olmayan adrese gider ve panele geçici olarak
> giremezsin. Adımları atlamadan, sırayla ilerle.

---

## Adım 1 — Admin için yeni Vercel projesi oluştur

1. vercel.com → **Add New ▸ Project**.
2. **Import Git Repository** listesinden **aynı** repoyu seç: `keserok/OYNA`.
3. Karşına çıkan ekranda **Project Name:** `oyna-admin` yaz.
4. **Framework Preset:** `Vite` (otomatik gelir, **dokunma**).
5. **Build and Output Settings**'e **DOKUNMA** — Build Command'i değiştirmene
   gerek yok. (Vercel bu alanı bazen kilitli/salt-okunur gösterir; sorun değil,
   olduğu gibi bırak.) Hedef seçimi bir **env değişkeniyle** yapılır → Adım 2.
6. Henüz **Deploy'a basma** — önce Adım 2 (env değişkenleri).

> ℹ️ Nasıl çalışıyor: Build Command'i **değiştirmek zorunda değilsin**. Hangi
> tarafın (uygulama/panel) derleneceğini `APP_TARGET` env değişkeni belirler ve
> admin derlemesi bittiğinde panel girişi otomatik olarak `dist/index.html`
> yapılır (`vite.config.ts` bunu kendisi halleder). Depodaki tek `vercel.json`
> (yönlendirme + güvenlik başlıkları) her iki projeye de hizmet eder.

## Adım 2 — Admin projesine env değişkenlerini gir  ⭐ (kritik adım)

Aynı ekranda **Environment Variables** bölümüne şunları ekle:

| İsim | Değer | Not |
|---|---|---|
| `APP_TARGET` | `admin` | **Bu satır paneli seçer — atlanırsa panel derlenmez.** |
| `VITE_SUPABASE_URL` | (ana projedekiyle aynı) | Veritabanı ortak |
| `VITE_SUPABASE_ANON_KEY` | (ana projedekiyle aynı) | Veritabanı ortak |

> Ana projede başka `VITE_...` değişkeni varsa onları da aynen ekle. Supabase
> değerleri ortaktır (aynı veritabanı).

Şimdi **Deploy**'a bas.

## Adım 3 — Admin panelini geçici adreste test et

1. Deploy bitince Vercel sana `https://oyna-admin-xxxx.vercel.app` gibi bir
   adres verir. Aç.
2. Panel **giriş ekranını** göstermeli.
3. Admin e-posta/şifrenle gir → **MFA (2FA) doğrulaması** istemeli.
   - İlk girişte faktörün yoksa QR kod çıkar; telefonundaki Authenticator ile
     okut, üretilen 6 haneli kodu gir.
4. Panel açılıp **Genel Bakış** ekranını gösteriyorsa bu adım tamam.

> ✅ Buraya kadar çalıştıysa panel yeni yerinde yaşıyor demektir. Ana uygulamaya
> henüz dokunmadık; her şey güvende.

## Adım 4 — `oynaturkiyepotansiyeli.com` alan adını bağla

1. Vercel → **oyna-admin** projesi → **Settings ▸ Domains**.
2. **Add** → `oynaturkiyepotansiyeli.com` yaz → **Add**.
3. Vercel sana o an geçerli **DNS kayıtlarını ekranda gösterir** (bir **A**
   kaydı veya bir **CNAME**). **Ekranda ne yazıyorsa** onu — Vercel'in verdiği
   birebir değeri — **alan adı sağlayıcının** DNS paneline gir. (Bu değerler
   Vercel tarafında zamanla değişebilir; buraya sabit IP yazmıyoruz — daima
   ekrandakini esas al.)
4. `www.` yönlendirmesini de istersen Vercel önerdiği şekilde ekle.
5. DNS yayılmasını bekle (birkaç dakika–birkaç saat). Vercel domain'in yanında
   yeşil ✓ gösterince `https://oynaturkiyepotansiyeli.com` panel giriş ekranını
   açmalı.

## Adım 5 — Supabase'e yeni adresi tanıt

1. Supabase → projen → **Authentication ▸ URL Configuration**.
2. **Redirect URLs** listesine ekle: `https://oynaturkiyepotansiyeli.com/**`
3. Ana uygulamanın adresini (ör. `https://oyna.app/**`) **SİLME** — ikisi de
   listede kalacak.
4. **Save**.

## Adım 6 — Ana projeye `APP_TARGET=app` ekle + yeniden dağıt (EN SON)

**Önce** mevcut ana Vercel projesine bir env değişkeni ekle (panelin ana
uygulama paketine sızmaması için):

| İsim | Değer |
|---|---|
| `APP_TARGET` | `app` |

> Bu satır olmazsa ana proje hem uygulamayı hem paneli derler; `APP_TARGET=app`
> ile ana domain **yalnız uygulamayı** üretir (panel kodu sıfır).

Ardından bu dal (`claude/admin-panel-missing-features-eecvyx`) main'e birleşince
ana proje otomatik olarak:

- **yalnız uygulamayı** üretir (panel arayüzü içermez),
- eski `/admin`, `/admin.html`, `/admin/*` isteklerini
  `https://oynaturkiyepotansiyeli.com` adresine **yönlendirir**.

**Yapılacak:** Adım 1–5 bittikten ve `oynaturkiyepotansiyeli.com` çalıştıktan
**sonra** ana projeye `APP_TARGET=app`'ı ekle ve bu dalı main'e merge et. Ana
proje deploy'u tamamlanınca:

- `https://<ana-domain>/admin` yaz → yeni panele yönlenmeli.
- Uygulama normal açılmalı, kullanıcı akışları etkilenmemeli.

---

## Adım 7 — Mobil paket (App Store / Google Play)

Mobil sürüm çıkarırken panel kodunun pakete sızmadığını garanti et:

```bash
npm run build:mobile   # APP_TARGET=app build + "admin kodu yok" kontrolü
npx cap sync
```

- `build:mobile` başarısız olursa (pakete panel kodu sızmışsa) build **kırılır**;
  mağazaya asla panel arayüzü gitmez. Bu kontrol otomatiktir, ekstra iş yok.

---

## Sık sorulanlar / güvenlik

- **"Panel adresini biri bulursa girer mi?"** Hayır. Tüm admin işlemleri
  Supabase'de `is_platform_admin()` + rol kontrolüyle korunur. Adresi bilen ama
  veritabanında admin olmayan biri hiçbir şey yapamaz; üstüne panel **MFA**
  zorunlu.
- **Ekstra kilit istersen:** Vercel → oyna-admin → Settings ▸ **Deployment
  Protection ▸ Vercel Authentication** aç. O zaman adresi bilen yabancı giriş
  ekranını bile göremez (sadece Vercel ekibindekiler açar).
- **Arama motorları:** Admin domain'i `noindex` ile işaretli; Google'a düşmez.

## Bir şey ters giderse (geri alma)

Acil durumda paneli tekrar ana pakete gömmek için: ana projedeki `APP_TARGET`
env değişkenini **sil** (o zaman ana proje hem uygulamayı hem paneli derler) ve
`vercel.json`'daki `redirects` bloğunu silip eski `rewrites` (`/admin` →
`/admin-panel/admin`) bloğunu geri koy. Bu, ayrımı iptal eder (önerilmez; yalnız
acil durum içindir).

---

### Özet akış

```
Adım 1    Vercel'de oyna-admin projesi (Build Command'e dokunma)
Adım 2    ⭐ Env: APP_TARGET=admin + Supabase anahtarları → Deploy
Adım 3    *.vercel.app adresinde panel + MFA testi
Adım 4    oynaturkiyepotansiyeli.com domain bağla + DNS
Adım 5    Supabase Redirect URL ekle
Adım 6    ⭐ Ana projeye APP_TARGET=app ekle → dalı main'e merge (EN SON)
Adım 7    Mobil: npm run build:mobile && npx cap sync
```
