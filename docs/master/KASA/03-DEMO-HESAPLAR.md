# 03 · DEMO VE İNCELEME HESAPLARI

> **Bu dosyadaki şifreler sır DEĞİLDİR.** Apple ve Google incelemecilerine
> verilmek üzere var olan sıradan hesapların şifreleridir; App Store Connect
> formuna zaten düz metin olarak yazılıyor. Kasaya koymanın anlamı yok —
> burada, aranabilir yerde dursunlar.

---

## Mağaza incelemesi hesapları

**Şifre (dördünde de aynı): `Oyna!Saha2026`**

| Rol | Kullanıcı adı | Girişte açılan ekran |
|---|---|---|
| Oyuncu | `oyuncu@oyna.app` | Ana sayfa |
| Kaleci | `kaleci@oyna.app` | Kaleci paneli · «Profil onaylı» |
| Hakem | `hakem@oyna.app` | Hakem paneli · «Profil onaylı» |
| Tesis sahibi | `saha1@oyna.app` | OYNA İşletme · 2 saha |

**App Store Connect → App Review Information**
- *Sign-In required:* Yes
- *User Name:* `oyuncu@oyna.app`
- *Password:* `Oyna!Saha2026`
- Diğer üç hesap **Notes** alanına yazılır.

Yapıştırmaya hazır İngilizce metin: `docs/master/APP_REVIEW_NOTLARI.md`.

---

## Bu hesaplar neden var — ve neden 5.6 ihlali DEĞİL

Uygulama bir kez Guideline 5.6 ile reddedildi: inceleme paketinde, indirilen
pakette olmayan bir "demo hesabıyla gir" düğmesi vardı. O makine tamamen
silindi.

Aradaki fark önemli: **5.6'nın yasakladığı şey incelemecinin başkalarında
olmayan bir YOLA ya da YETKİYE sahip olmasıdır.** Bu hesaplar öyle değil —
herkesin kullandığı aynı e-posta+şifre ekranından girerler, aynı yetkileri
taşırlar, aynı veriyi görürler. Verilen şey ayrıcalıklı bir kapı değil,
sıradan hesapların şifresidir.

Dört hesap veriliyor çünkü OYNA'da dört panel var ve yeni açılan bir hesap
yalnız oyuncu panelini gösterir — incelemeci ürünün dörtte üçünü göremezdi.

**Dürüstçe söylenmesi gereken bir ayrıntı:** `@oyna.app` alan adındaki
adresler veritabanında `is_demo` olarak etiketleniyor; bu, işletme
sayılarımızı temiz tutmak içindir. Hiçbir ekranı, yetkiyi ya da içeriği
değiştirmez. İnceleme notunda bu açıkça yazılı — bulunmasındansa söylenmesi
iyidir.

---

## Hesapların doğru çalıştığını nasıl kontrol edersin

```
npm run dev -- --port 5199 --strictPort     # ayrı bir kabukta
npm run kayit:dogrula                        # kayıt → kurulum → giriş
```

Elle bakmak için: uygulamayı aç → **GİRİŞ YAP** → yukarıdaki e-posta + şifre.
Kaleci ve hakem panellerinde **«Profil onaylı»** yazmalı; «onay bekleniyor»
yazıyorsa üç kaydın biri eksiktir (aşağıya bak).

## Rol hesapları bozulursa

Kaleci/hakem panelinin «onay bekleniyor» şeridine düşmemesi için **üç ayrı
kayıt** gerekir:

1. `profiles.verification_status = 'approved'`
2. `goalkeepers` / `referees` tablosunda satır (`verification_status='approved'`)
3. `provider_identities` satırı (`status = 'VERIFIED'`)

Biri eksikse panel açılır ama şerit kalır.

⚠️ **Tuzak:** `auth.users` tablosuna ELLE satır eklenirse hesap sessizce bozulur.
`confirmation_token`, `recovery_token`, `email_change`, `email_change_token_new`
sütunları NULL kalırsa giriş 500 «Database error querying schema» verir ve
SQL'de hesap kusursuz görünür. Bu sütunlar `''` (boş dize) olmalıdır.

---

## Vitrindeki örnek içerik

Uygulama üç ekranda (Ana Sayfa · Maç Bul · Saha Kirala) şunu yazar:

> «Türkiye'de yeni başlıyoruz. Şu anda gördüğün sahalar, maçlar ve oyuncular
> örnek içeriktir; gerçek tesisler eklendikçe burada görünecek.»

Metin koda gömülü değil — `app_config.ornek_icerik_uyarisi` anahtarında durur.
Gerçek tesisler eklendiğinde **anahtarı boşaltmak yeterlidir**; üç ekrandaki
uyarı da kendiliğinden kaybolur, yeni paket göndermeye gerek kalmaz.

Bugünkü örnek veri: 41 profilin 33'ü, gelecek tarihli 16 maçın 16'sı,
6 sahanın tamamı.

⚠️ Bu metni değiştirirsen `APP_REVIEW_NOTLARI.md` ve `MAGAZA_VITRIN_METINLERI.md`
onu **tırnak içinde alıntılıyor** — ikisini de güncelle. Apple'a giden notta
yazan cümlenin uygulamada bulunamaması, tam olarak 5.6 reddini doğuran türden
bir tutarsızlıktır.
