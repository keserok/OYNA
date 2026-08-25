# KASA

OYNA'nın kurulu olduğu her şeyin tek yerden haritası: anahtarlar, hesaplar,
sağlayıcılar, sözleşmeler.

**Kurucu kararı (25 Ağustos 2026):** değerler GitHub'da dursun ama **şifreli**.

---

## İçindekiler

| Dosya | Ne var | Gizli mi |
|---|---|---|
| `01-ANAHTAR-DEFTERI.md` | 32 sunucu sırrı + 16 istemci ayarı: ne işe yarar, nereden alınır, yoksa ne bozulur | Hayır — **değer yok** |
| `02-SAGLAYICI-ENVANTERI.md` | Supabase, Apple, Google, iyzico, Resend… ne için, ne kadar, ne zaman yenilenir | Hayır |
| `03-DEMO-HESAPLAR.md` | Apple'a verilen dört hesap ve şifreleri | Hayır — paylaşılmak için var |
| `04-SOZLESME-DIZINI.md` | 19 yasal belge: hangisi neyi yönetir, nerede yayında | Hayır |
| `kasa.age` | **Gerçek değerler** — şifreli | **EVET** |
| `kasa.ornek.md` | Şablon (boş) | Hayır |
| `kasa.md` | Çözülmüş çalışma kopyası | **EVET — asla commit edilmez** |

---

## Kullanım

```
npm run kasa:durum      # neyin nerede olduğunu söyler
npm run kasa:kur        # İLK KURULUM — şablondan çalışma dosyası açar
npm run kasa:ac         # kasa.age → kasa.md   (parola sorar)
npm run kasa:kilitle    # kasa.md → kasa.age   (şifreler, düz metni siler)
```

**Gereken tek araç:** `age`
macOS: `brew install age` · Linux: `apt install age`

### İlk kurulum

1. `npm run kasa:kur`
2. Açılan `kasa.md` dosyasını doldur. Bilmediğini `⟨…⟩` bırak — "bilmiyorum"
   ile "boş olması gerekiyor" farklı şeyler.
3. `npm run kasa:kilitle` → bir parola belirle.
4. `git add docs/master/KASA/kasa.age && git commit`

### Sonraki her kullanım

`npm run kasa:ac` → düzenle → `npm run kasa:kilitle` → commit.

---

## Neden bu kadar dikkatli

**Parolanı unutursan kasa açılmaz.** Ben açamam, GitHub açamaz, kimse açamaz.
Parolayı kasanın dışında, fiziksel olarak da bulunabilecek bir yerde sakla.

**Düz metin bir kez git'e girerse anahtarları değiştirmek yetmez.** Git geçmişi
kalıcıdır: silsen bile eski commit'te durur, her klonda yeniden üretilir.
O anahtarların **hepsi** yenilenmelidir. Üç katman bunu engelliyor:

1. `.gitignore` — `kasa.md` takip edilmez
2. `npm run kasa:kilitle` — git takip ediyorsa **kilitlemeyi reddeder**
3. `npm run kasa:durum` — geçmişte görünüyorsa **uyarır**

**Kilitleme, silmeden önce geri açmayı DENER.** Şifreler, sonra o dosyayı geri
açar, içeriğin birebir aynı olduğunu doğrular, ancak ondan sonra düz metni siler.
Bu adım olmasaydı parolayı yanlış yazdığın bir gün kasanın tamamını kaybeder ve
bunu ancak aylar sonra öğrenirdin.

---

## Ne buraya girer, ne girmez

**Girer:** ödeme anahtarları, `.p8` dosyalarının içeriği, hizmet hesabı
`.json`'ları, service role key, pano şifreleri, kurtarma kodları, imzalama
anahtarı şifresi.

**Girmez:** kodun kendisi, `anon` anahtarı (zaten herkese açık, RLS korur),
demo hesap şifreleri (paylaşılmak için var), yasal metinler.

**Asla girmez:** kullanıcı verisi. Gerçek bir kullanıcının e-postası, telefonu
ya da T.C. kimlik numarası buraya yazılmaz — kasa bir veri deposu değil,
erişim defteridir.
