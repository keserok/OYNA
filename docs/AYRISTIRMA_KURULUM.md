# Yönetim Panelini Ayrı Domain'e Taşıma — Kurulum Rehberi

Bu belge, OYNA yönetim panelini (OYNA OS) ana uygulamadan ve mobil paketten
ayırıp **oynaturkiyepotansiyeli.com** adresinde çalıştırmayı anlatır.
**Veritabanı ortak kalır** — ayrılan yalnızca kod paketi ve dağıtımdır.

> ⚠️ **Sıralama önemli.** Aşağıdaki adımları **sırayla** yapın. Admin projesini
> canlıya almadan ana projeyi yeniden dağıtmayın; aksi halde eski `/admin`
> bağlantısı henüz hazır olmayan yeni adrese yönlenir ve panel geçici olarak
> erişilemez olur.

---

## Ne değişti?

- Uygulama içindeki gömülü admin ekranı kaldırıldı; yerine **yönlendirme ekranı**
  (`AdminRedirect`) kondu. Böylece App Store / Google Play paketinde panelin
  arayüz kodu **hiç bulunmaz** (güvenlik + inceleme riski sıfırlanır).
- `APP_TARGET` ile iki ayrı build hedefi var:
  - `npm run build:app` → yalnız uygulama (mobil + ana web)
  - `npm run build:admin` → yalnız yönetim paneli (ayrı domain)
- `npm run verify:no-admin` build sonrası pakette panel kodu kalmadığını kanıtlar
  (mobil build'de otomatik çalışır: `npm run build:mobile`).

---

## Adım 1 — Yeni Vercel projesi (yönetim paneli)

1. Vercel → **Add New → Project** → **aynı GitHub reposu** (`keserok/OYNA`) seçilir.
2. Proje adı: `oyna-admin` (örnek).
3. **Build & Development Settings:**
   - Build Command: `npm run build:admin`
   - Output Directory: `dist`
   - Install Command: (varsayılan) `npm install`
4. **Environment Variables:** ana projedeki Supabase değişkenlerinin **aynısını**
   ekleyin (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` vb.). Veritabanı ortaktır.
5. Depoda hazır olan **`vercel.admin.json`** içeriğini bu projenin ayarlarına
   yansıtın: en pratiği, Vercel'de bu projeye özel `vercel.json` gerekmez —
   Build Command'i (adım 3) ve aşağıdaki güvenlik başlıklarını Project Settings'ten
   verin. Alternatif: admin projesi için depodaki `vercel.admin.json`'u
   `vercel.json` olarak kullanacak ayrı bir dal tutabilirsiniz (ileri seviye).
6. Deploy edin. Önce `*.vercel.app` ön-izleme adresinde panelin açıldığını
   ve **admin girişi + MFA** istediğini doğrulayın.

## Adım 2 — Domain bağlama

1. `oynaturkiyepotansiyeli.com` alan adını **oyna-admin** projesine ekleyin
   (Vercel → Project → Settings → Domains).
2. Alan sağlayıcınızda Vercel'in verdiği DNS kayıtlarını girin (A / CNAME).
3. SSL sertifikası otomatik gelir; `https://oynaturkiyepotansiyeli.com` açılıp
   panel giriş ekranını gösterene kadar bekleyin.

## Adım 3 — Supabase Auth izinli adresler

Supabase → **Authentication → URL Configuration**:
- **Redirect URLs** listesine `https://oynaturkiyepotansiyeli.com/**` ekleyin.
- Ana uygulama adresini (ör. `https://oyna.app/**`) **silmeyin**; ikisi de kalır.

## Adım 4 — Ana projeyi yeniden dağıt (en son)

Depodaki `vercel.json` artık:
- `npm run build:app` ile **yalnız uygulamayı** üretir (panel kodu içermez),
- eski `/admin`, `/admin.html`, `/admin/*` isteklerini
  `https://oynaturkiyepotansiyeli.com` adresine **yönlendirir**.

Adım 1–3 tamamlandıktan **sonra** ana projeyi deploy edin (bu dal main'e
birleşince otomatik olur). Doğrulama:
- `https://<ana-domain>/admin` → yeni panele yönleniyor mu?
- Uygulama normal açılıyor mu?

## Adım 5 — Mobil (App Store / Google Play)

Mobil paketi her üretişte panel kodunun sızmadığını garanti eder:

```bash
npm run build:mobile   # APP_TARGET=app build + "admin kodu yok" kontrolü
npx cap sync
```

`build:mobile` başarısız olursa (pakete panel kodu sızmışsa) build kırılır;
mağazaya asla panel kodu gitmez.

---

## Güvenlik notları

- **Gerçek yetki sunucudadır.** Tüm admin RPC'leri Supabase'de
  `is_platform_admin()` + alt-rol (`require_admin_role`) ile korunur. Panel
  adresini bilen ama veritabanında admin rolü olmayan biri hiçbir şey yapamaz.
- **Panel MFA'sı zorunlu** (`admin_mfa_required=true`). Faktörü olmayan admin
  ilk girişte QR ile kurar; kimse kilitlenmez.
- Admin domain'i arama motorlarına kapalıdır (`X-Robots-Tag: noindex`).
- İstenirse ek katman: Vercel → oyna-admin → Settings → **Deployment Protection**
  (Vercel Authentication) açılırsa, panel adresini bilen yabancı giriş ekranını
  bile göremez.

## Geri alma (rollback)

Ana projeyi eski haline döndürmek gerekirse `vercel.json`'daki `buildCommand`'i
`npm run build` yapıp `/admin` yönlendirmelerini eski `rewrites` bloğuyla
değiştirmek yeterli — panel yeniden ana pakete gömülür. (Önerilmez; yalnız acil
durum içindir.)
