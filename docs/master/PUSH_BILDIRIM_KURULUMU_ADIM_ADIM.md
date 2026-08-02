# 🔔 Push Bildirimleri — Adım Adım Kurulum

> **Kim için:** Uygulamayı geliştiren ama yazılımcı olmayan proje sahibi.
> **Süre:** ~20 dakika. Yazılım bilgisi gerekmez, tarayıcıda tıklamaktan ibaret.
> **Son güncelleme:** 2026-08-02

---

## Önce şunu netleştirelim: OYNA Firebase'e geçmiyor

OYNA **Supabase** ile çalışır ve öyle kalacak. Veritabanı, kullanıcılar, maçlar,
ödemeler — hepsi Supabase'te. Buraya Firebase'in gireceği yer **veri değil,
teslimat.**

Bir telefona bildirim ulaştırmanın yolu işletim sisteminden geçer ve bu
kaçınılmazdır:

| Parça | Görevi | Kim yapar |
|---|---|---|
| **Beyin** | Kime, ne zaman, hangi bildirim gidecek | **Supabase** (senin sistemin) |
| **Postacı — Android** | Bildirimi telefona teslim eder | Google FCM |
| **Postacı — iPhone** | Bildirimi telefona teslim eder | Apple APNs |

Google, Android telefonlara bildirim teslimini **yalnız kendi ağı üzerinden**
yapar. Supabase (ya da başka herhangi bir sunucu) bir telefona doğrudan bildirim
gönderemez. Supabase telefonun "adresini" alır ve postacıya *"şu adrese bunu
götür"* der.

**Uygulamanın verisi Firebase'e gitmez.** Giden şey yalnızca bildirimin başlığı
ve metnidir — postacının taşıdığı zarf.

Bunu kod da böyle yazmış; `supabase/functions/send-push/index.ts` dosyasının
ilk satırları:

```
// OYNA APP — Supabase Edge Function: send-push
// Firebase bağımsız push gönderici.
// Apple APNs ve Google FCM HTTP v1 API doğrudan kullanır.
```

---

## Yapılacak iki iş var (ikisi de şart)

Bildirimlerin çalışması için iki ayrı tarafın kurulması gerekir. Biri eksik
kalırsa bildirim gelmez:

| # | Ne | Nerede ayarlanır | Olmazsa ne olur |
|---|---|---|---|
| **1** | Telefon postaneye kaydolsun | **GitHub** deposunda | Telefonun adresi hiç oluşmaz |
| **2** | Sunucu postaneye mektup verebilsin | **Supabase** panelinde | Adres var ama kimse mektup göndermez |

İkisi de aynı Firebase projesinden çıkar — ama **iki farklı dosya** indirirsin.
Bu, kurulumda en çok karıştırılan yerdir; aşağıda ayrı ayrı belirtildi.

---

# BÖLÜM 1 — Telefon tarafı (GitHub)

## Adım 1.1 — Firebase projesini aç

1. Tarayıcıda **https://console.firebase.google.com** adresine git.
2. OYNA için kullandığın Google hesabıyla giriş yap.
3. **Zaten bir OYNA projen varsa** onu seç, Adım 1.2'ye geç.
   **Yoksa:** "Proje ekle" / "Create a project" düğmesine bas.
   - Proje adı: `OYNA` yaz.
   - Google Analytics soracak → **kapatabilirsin**, bildirim için gerekmez.
   - "Proje oluştur" → 30-60 saniye bekle.

## Adım 1.2 — Android uygulamasını projeye tanıt

1. Proje ana sayfasında, ortadaki simgelerden **Android** olanına bas.
   (Bulamazsan: sol üstteki **dişli çark** → **Proje ayarları** → sayfayı aşağı
   kaydır → **Uygulamalarınız** bölümü → **Uygulama ekle** → Android.)

2. Karşına çıkan formda **tek bir alan kritik**:

   > **Android paket adı:** `com.oyna.app`

   ⚠️ **Bunu birebir böyle yaz.** Tek harf farklı olursa bildirimler hiç
   çalışmaz ve hata mesajı da almazsın. Kopyala-yapıştır yap.

3. Diğer alanlar:
   - **Uygulama takma adı:** boş bırakabilirsin (ya da `OYNA Android`).
   - **SHA-1 imzalama sertifikası:** **BOŞ BIRAK.** Bildirimler için gerekmez;
     o alan Google ile giriş gibi başka özellikler içindir.

4. **Uygulamayı kaydet** düğmesine bas.

## Adım 1.3 — `google-services.json` dosyasını indir

Kayıttan hemen sonra Firebase sana **`google-services.json`** adlı bir dosya
indirtir. **İndir.**

> Sayfayı kapattıysan panik yok: **dişli çark → Proje ayarları → Uygulamalarınız
> → Android uygulaması** satırında `google-services.json` indirme düğmesi hep
> durur.

📌 **Bu dosya 1. bölümün dosyasıdır.** Birazdan ikinci, bambaşka bir dosya daha
indireceksin — karıştırma.

## Adım 1.4 — Dosyanın içeriğini kopyala

1. İndirdiğin `google-services.json` dosyasını **Not Defteri** ile aç
   (Windows: sağ tık → Birlikte aç → Not Defteri.
   Mac: sağ tık → Bununla Aç → TextEdit).
2. **Ctrl+A** (Mac'te **Cmd+A**) → hepsini seç.
3. **Ctrl+C** (Mac'te **Cmd+C**) → kopyala.

⚠️ Dosyanın **tamamı** lazım — ilk `{` işaretinden son `}` işaretine kadar.
Yarım yapıştırma en sık yapılan hatadır.

## Adım 1.5 — GitHub'a gizli anahtar olarak ekle

1. **https://github.com/keserok/OYNA** adresine git.
2. Üst menüden **Settings** (Ayarlar) sekmesine bas.
   *(Görmüyorsan depo sahibi hesabıyla giriş yapmamışsındır.)*
3. Sol menüde aşağı in → **Secrets and variables** → altındaki **Actions**.
4. Sağ üstte yeşil **New repository secret** düğmesine bas.
5. İki alanı doldur:

   | Alan | Ne yazacaksın |
   |---|---|
   | **Name** | `GOOGLE_SERVICES_JSON` |
   | **Secret** | Adım 1.4'te kopyaladığın **tüm** içerik (Ctrl+V) |

   ⚠️ İsmi **birebir** böyle yaz: büyük harf, kelimeler arası alt çizgi.

6. **Add secret** düğmesine bas.

✅ **1. bölüm bitti.** Bundan sonra üretilen her uygulama paketi telefonun
postaneye kaydolmasını sağlayacak.

---

# BÖLÜM 2 — Sunucu tarafı (Supabase)

Şimdi Supabase'in postaneye mektup verebilmesi için yetki alıyoruz. Bu **ayrı
bir dosya** ister.

## Adım 2.1 — Servis hesabı anahtarını indir

1. Yine **Firebase Console** → projen → sol üst **dişli çark** → **Proje
   ayarları**.
2. Üstteki sekmelerden **Hizmet hesapları** / **Service accounts** sekmesine geç.
3. Sayfadaki **Yeni özel anahtar oluştur** / **Generate new private key**
   düğmesine bas → uyarıyı onayla.
4. Bilgisayarına bir **JSON dosyası** iner (adı `oyna-....json` gibi olur).

⚠️ **Bu, Adım 1.3'teki dosya DEĞİLDİR.** Farklı bir dosyadır ve çok daha
yetkilidir.

🔐 **Bu dosya bir şifre gibidir.** Kimseyle paylaşma, e-postayla gönderme,
depoya koyma. Yalnız aşağıdaki yere yapıştıracaksın.

## Adım 2.2 — Proje kimliğini not al

Aynı dosyayı Not Defteri ile aç ve içinde şuna benzeyen satırı bul:

```
"project_id": "oyna-xxxxx",
```

Tırnak içindeki değeri (`oyna-xxxxx` kısmını) bir kenara not et. Birazdan lazım.

> Aynı bilgi Firebase'de **Proje ayarları → Genel → Proje kimliği** altında da
> yazar.

## Adım 2.3 — Supabase'e iki ayar ekle

1. **https://supabase.com/dashboard** → OYNA projeni seç.
2. Sol menüden **Edge Functions**'a gir.
   Orada **Secrets** başlıklı bir bölüm ara.
   *(Bulamazsan: sol alttaki **Project Settings** → **Edge Functions** →
   **Secrets**. Supabase paneli zaman zaman yerini değiştiriyor; aradığın kelime
   her hâlükârda **"Secrets"**.)*
3. **İki ayrı kayıt** ekleyeceksin:

   | Name | Value |
   |---|---|
   | `GOOGLE_SERVICE_ACCOUNT_KEY` | Adım 2.1'de inen dosyanın **tüm içeriği** |
   | `GOOGLE_PROJECT_ID` | Adım 2.2'de not ettiğin değer (ör. `oyna-xxxxx`) |

4. Kaydet.

✅ **2. bölüm bitti.**

---

# BÖLÜM 3 — Çalıştığını doğrula

## Adım 3.1 — Yeni paket ürettir

Bana haber ver, yeni APK'yı ben üretirim. (Kendin yapmak istersen:
GitHub → **Actions** → soldan **Android — Google Play paketi (AAB)** →
**Run workflow**.)

## Adım 3.2 — Derleme özetine bak

İş bittiğinde sayfanın üstündeki özet tablosunda şu satır olacak:

| Alan | Değer |
|---|---|
| Push bildirimleri | `true` ← **böyle görmelisin** |

`false` görürsen 1. bölümde bir şey eksik kalmış demektir. Ayrıca kırmızı bir
hata satırı da neyin yanlış olduğunu yazacak (dosya eksik mi, bozuk mu, yanlış
paket adı mı).

## Adım 3.3 — Telefonda kontrol

1. Yeni APK'yı kur, giriş yap.
2. Bildirim izni istendiğinde **İzin ver** de.
3. **Ayarlar → Destek** → *"Son kapanma sebebi"* kartına bak. Uygulama artık
   çökmemeli.
4. Kendine bir bildirim ürettirecek bir işlem yap (maça katılma gibi) ve
   bildirimin gelip gelmediğine bak.

---

## Sık yapılan hatalar

| Belirti | Sebebi | Çözümü |
|---|---|---|
| Derleme özeti `Push bildirimleri: false` diyor | `GOOGLE_SERVICES_JSON` eksik ya da bozuk | Adım 1.4–1.5'i tekrar yap, **tüm** dosyayı yapıştır |
| Derleme "yanlış paket kimliği" hatası veriyor | Firebase'de paket adı `com.oyna.app` değil | Firebase'de doğru paket adıyla **yeni** bir Android uygulaması ekle |
| Uygulama çökmüyor ama bildirim hiç gelmiyor | 2. bölüm (Supabase) eksik | Adım 2.1–2.3'ü yap |
| İki dosyayı karıştırdım | Çok sık olur | `google-services.json` → **GitHub**. Servis hesabı dosyası → **Supabase** |

---

## Bu kurulum yapılmazsa ne olur?

**Uygulama çökmez** — bu koruma koda yazıldı (`MainActivity.java` +
`notifications/pushService.ts`). Uygulama açılır, çalışır; yalnızca **kapalıyken
bildirim gelmez.**

Uygulama **açıkken** gelen bildirimler Supabase Realtime üzerinden çalışmaya
devam eder; onlar Firebase'den geçmez.

---

## iPhone tarafı

Bu belge Android içindir. iPhone'da postacı Apple'dır ve ayrı anahtarlar ister
(`APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_PRIVATE_KEY`). O adımlar Apple Developer
hesabı gerektirir ve ayrı bir iştir.
