# Runbook — Uygulamayı Rafa Kaldırma ve Sonra Geri Açma

> **Amaç:** OYNA'yı bir süre yayından çekmek, hiçbir veri kaybetmeden, sonra tek tuşla geri açmak.
> **Kime:** Proje sahibine. Terminal bilgisi gerektirmeyen adımlar 🖱️ ile, bilgisayarda
> komut çalıştırmayı gerektirenler ⌨️ ile işaretli.
> **Son güncelleme:** 2026-08-04

---

## 0. Kısa cevap

Supabase'in **"Pause project" (projeyi duraklat)** özelliği tam olarak bunun için var:
proje uyur, hiçbir ücret/kota harcamaz, **veritabanı olduğu gibi durur**, istediğinde
"Restore" deyip aynı yerden devam edersin. Adres ve anahtarlar değişmediği için
uygulamanın kodunda hiçbir şey değiştirmen gerekmez.

**Tek önemli detay:** Ücretsiz planda duraklatılmış proje **90 gün** içinde tek tuşla
geri açılır. 90 günden uzun beklersen tek tuş kaybolur — veri silinmez, ama geri açmak
için yedek dosyasını indirip yeni bir projeye yüklemek gerekir (§5). Bu yüzden
**duraklatmadan önce kendi yedeğini almanı** öneriyoruz (§2).

---

## 1. Kapatmadan önce bilmen gerekenler

| Konu | Durum (2026-08-04 itibarıyla) |
| --- | --- |
| Supabase organizasyonu | `keremsplace` — **Ücretsiz (Free)** plan |
| Canlı proje | **OYNA** · `iikvzgyccvgcybzdfwlv` · veritabanı **70 MB** |
| Test projesi | **oyna-staging** · `ebpqfmoabiqeosbeldmw` · **11 MB** |
| Eski proje | **Hadi** · zaten duraklatılmış (kota harcamıyor) |
| Dosyalar (Storage) | `images` kovasında 16 dosya ≈ 10 MB |
| Kayıtlı kullanıcı | 33 |
| Zamanlanmış görevler | 15 adet (biri her dakika çalışıyor) |
| Sunucu fonksiyonları | 14 adet (ödeme, bildirim, e-posta…) |

Duraklatınca **hepsi birlikte** durur ve geri açınca **hepsi birlikte** geri gelir.

### Duraklatınca ne olur?
- ✅ Veritabanı, kullanıcılar, dosyalar, zamanlanmış görevler, sunucu fonksiyonları **saklanır**.
- ⛔ Uygulama/site/telefon uygulaması **çalışmaz** — tüm istekler hata verir.
- ⛔ E-posta, bildirim, ödeme akışı **durur**.
- 💰 Ücretsiz plandaki 2 aktif proje hakkını **işgal etmez** (duraklatılmış projeler sayılmaz).

---

## 2. Adım 1 — Kendi yedeğini al (duraklatmadan ÖNCE)

Bu adım şart değil ama **atlanmaması önerilir**: 90 günlük pencere kaçarsa ya da
Supabase tarafında bir sorun çıkarsa elinde kendi kopyan olur.

### ⌨️ Tek komutla
Bilgisayarında proje klasöründe:

```bash
bash scripts/maintenance/yedek-al.sh
```

Script sırayla soracak/yapacak:
1. Supabase bağlantı adresini (connection string) ister — Dashboard → **Connect** düğmesinden kopyalanır.
2. Servis anahtarını (service_role key) ister — dosyaları indirmek için.
3. `yedek/<tarih>/` klasörüne şunları yazar:
   - `roles.sql` — veritabanı kullanıcı rolleri
   - `schema.sql` — tabloların yapısı
   - `data.sql` — **tüm veri** (kullanıcılar, maçlar, rezervasyonlar…)
   - `migration-gecmisi-*.sql` — migration defteri
   - `dosyalar/` — Storage'daki tüm görseller
   - `GERI-YUKLEME.md` — bu yedeği yeni bir projeye yükleme komutları

### Gereksinimler
- **Node.js** kurulu olmalı.
- **Docker Desktop** kurulu ve açık olmalı (Supabase aracı veritabanı dökümünü Docker içinde alıyor).
  Docker yoksa script bunu söyler ve sadece dosyaları indirir; veritabanı dökümü için §5'teki
  "90 gün sonrası" yolunu kullanabilirsin.

### ⚠️ Yedeği nereye koyacaksın
Yedek klasöründe **33 gerçek kullanıcının kişisel verisi** var.
- ✅ Kendi bilgisayarın + bir bulut sürücüsü (Drive/iCloud), şifreli klasörde.
- ⛔ **GitHub'a / depoya asla yükleme.** `.gitignore`'a `yedek/` eklendi, kazara gitmez.

---

## 3. Adım 2 — Projeleri duraklat

### 🖱️ Canlı proje (OYNA)
1. https://supabase.com/dashboard adresine gir.
2. **OYNA** projesini aç.
3. Sol altta **Project Settings** (dişli) → **General**.
4. Sayfanın altındaki **Project availability** bölümünde **Pause Project**.
5. Proje adını yazarak onayla.

### 🖱️ Test projesi (oyna-staging)
Aynı adımlar. Bunu da duraklatmak kota uyarısının tekrarlamasını engeller.

### 🖱️ Eski proje (Hadi)
Zaten duraklatılmış. Bir daha kullanmayacaksan **silmek** kotayı tamamen temizler
(Project Settings → General → Delete project). **Silinen proje geri gelmez** — önce
içinde işine yarar bir şey olmadığından emin ol.

---

## 4. Adım 3 — Ön yüzü (site ve mağaza uygulamaları) kapat

Veritabanı durunca site açılır ama her ekran hata verir. Kullanıcıya bunu göstermemek için:

### 🖱️ Web sitesi (Vercel)
- Vercel → proje → **Settings → General → Pause Project** (ya da domaini kaldır).
- Alternatif: `main` dalına "Şu an bakımdayız" diyen tek sayfalık bir sürüm yayınla.

### 🖱️ Telefon uygulamaları
- **Google Play:** Console → uygulama → **Yayından kaldır** (unpublish). Uygulamayı yükleyenlerde
  kalır ama açtıklarında bağlanamaz.
- **App Store:** App Store Connect → **Remove from Sale**.
- Yayında değillerse yapılacak bir şey yok.

---

## 5. Geri açma

### A) 90 gün içindeysen — kolay yol 🖱️
1. https://supabase.com/dashboard → duraklatılmış **OYNA** projesini seç.
2. **Restore project** / **Resume project** düğmesine bas, onayla.
3. Birkaç dakika sürer; bitince e-posta gelir.
4. Her şey aynen döner: **aynı adres, aynı anahtarlar**, tüm veri, 15 zamanlanmış görev,
   14 sunucu fonksiyonu. **Kodda değişiklik gerekmez.**
5. Vercel'i tekrar yayına al, mağaza uygulamalarını tekrar yayınla.
6. Kontrol: uygulamayı aç → giriş yap → maç listesi ve profil geliyorsa tamamdır.

### B) 90 gün geçtiyse — uzun yol
Veri silinmez, ama tek tuş kaybolur. Supabase panelinde duraklatılmış projenin
sayfasından **yedek dosyasını ve Storage dosyalarını indirebilirsin**. Sonra:

1. Yeni bir Supabase projesi oluştur.
2. İndirilen yedeği (veya §2'de aldığın kendi yedeğini) yeni projeye yükle —
   komutlar `yedek/<tarih>/GERI-YUKLEME.md` içinde hazır.
3. **Kodda 4 yeri güncelle** (yeni projenin adresi ve anahtarı farklı olacak):
   - `supabaseClient.ts` → `PROD_SUPABASE_URL` ve `PROD_SUPABASE_ANON_KEY` sabitleri
   - Vercel → Environment Variables → `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
   - Sunucu fonksiyonlarının gizli anahtarları (`.env.example` listesindekiler)
   - iyzico paneli → webhook adresi (`.../functions/v1/payment-webhook`)
4. Sunucu fonksiyonlarını yeniden yükle: `supabase functions deploy --project-ref <yeni-ref>`
5. Zamanlanmış görevleri yeniden kur (migration dosyaları içinde tanımlılar).

> 💡 Bu yüzden **90 günü geçirmemek** çok değerli: A yolu 5 dakika, B yolu yarım gün.
> Rafta 3 aydan uzun kalacaksan: 80. günde projeyi geri aç, bir gün açık bırak, tekrar
> duraklat. Sayaç sıfırlanır.

---

## 6. Kota uyarısı hakkında (grace period)

Supabase'in gönderdiği "grace period başladı / DB Size Exceeded" uyarısı **geçmiş fatura
dönemi** için. Şu anki durum:

- Ücretsiz plan sınırı: **500 MB** veritabanı.
- Şu anki kullanım: OYNA 70 MB + staging 11 MB = **~81 MB** → sınırın çok altında.
- 70 MB'nin **37 MB'si** `cron.job_run_details` tablosu: zamanlanmış görevlerin geçmiş
  çalışma kayıtları. Uygulama verisi değil, kendi kendine temizlenmiyor, sürekli büyüyor.
  Gerçek uygulama verisi toplamda birkaç MB.

Supabase dokümanına göre bu uyarı, sınırın altına insen bile bir süre ekranda kalır ve
**birkaç fatura dönemi sınır altında kalırsan kendiliğinden temizlenir**. Ama dikkat:
**ikinci kez aşarsan yeni bir grace period verilmez**, doğrudan kısıtlama uygulanır
(istekler 402 hatası döner).

Projeleri duraklatmak kullanımı sıfırlar, dolayısıyla ikinci bir aşma riski kalmaz.

### Rafa kaldırmayıp devam edeceksen (alternatif)
`cron.job_run_details` tablosunu düzenli temizlemek 37 MB'yi geri kazandırır ve tekrar
büyümesini engeller. Bu ayrı bir görev olarak istenebilir.

---

## 7. Kontrol listesi

**Kapatırken**
- [ ] Yedek alındı, güvenli yere kopyalandı (`yedek/<tarih>/`)
- [ ] Yedek klasörü GitHub'a **gitmedi**
- [ ] OYNA projesi duraklatıldı
- [ ] oyna-staging duraklatıldı
- [ ] Vercel sitesi kapatıldı
- [ ] Mağaza uygulamaları yayından kaldırıldı (yayındaysa)
- [ ] **Duraklatma tarihi + 90 gün** takvime hatırlatıcı olarak eklendi

**Geri açarken**
- [ ] Supabase projesi restore edildi, "ACTIVE" göründü
- [ ] Vercel tekrar yayında
- [ ] Uygulamada giriş yapıldı, maç listesi ve profil geliyor
- [ ] Ödeme akışı test edildi (sandbox)
- [ ] Bildirim geldi mi kontrol edildi
