# 🅿️ OYNA — RAF DURUMU ve UYANDIRMA KILAVUZU

**Rafa kaldırılma tarihi:** 4 Ağustos 2026
**Durum:** Sistem sağlıklı kapatıldı — **14 kontrol yeşil, 0 kırmızı**

> Bu dosya tek başına yeterlidir. Aylar sonra geri döndüğünde başka hiçbir şey
> okumadan buradan devam edebilirsin. Terminal komutu yazman gereken tek yer
> "Uygulamayı yeniden çalıştırma" bölümüdür.

---

## 1. En önemli üç şey

### 🔴 1. Supabase projesi 7 gün sonra kendini durdurur

Ücretsiz planda Supabase, bir hafta boyunca yeterli hareket görmeyen projeleri
**duraklatır**. (Kanıt: `Hadi` adlı diğer projen şu an bu yüzden durmuş
durumda.)

| Ne olur | Sonuç |
|---|---|
| Duraklar | **Verin silinmez.** Panelde "Resume project" düğmesiyle tek tıkla geri açılır |
| 90 gün içinde geri açarsan | Her şey aynen döner |
| **90 günü geçerse** | Tek tık gider; yalnızca yedek dosyası indirilip başka bir yere kurulabilir |

**Bunu önlemek için bir çözüm kuruldu:** GitHub'da her gün çalışan küçük bir iş,
veritabanına dokunup projeyi uyanık tutuyor (`Raf — veritabanını uyanık tut`).
Günde ~15 saniye, ayda ~8 dakika sürüyor; GitHub'ın aylık 2.000 dakikalık
ücretsiz kotasının binde 4'ü.

**İstemezsen kapat:** GitHub → Actions → "Raf — veritabanını uyanık tut" →
sağ üstteki "..." → *Disable workflow*. Kapatırsan proje ~7 gün sonra durur;
90 gün içinde geri açmayı unutma.

### 🟠 2. Platform dışında yedeğin YOK — bunu senin yapman gerekiyor

Supabase **ücretsiz planda panelden yedek indirmene izin vermiyor.** Bu yüzden
sana bir araç hazırladım; çalıştırması 2 dakika. Adımları bölüm 4'te.

Kurduğumuz gecelik yedek (her gece 05:30) **aynı veritabanının içinde** duruyor.
Yanlışlıkla silinen bir kaydı geri getirir, ama proje tamamen giderse o da gider.

### 🟢 3. Sistemin kendisi sağlam

Kapatmadan önce ölçülen son durum:

| Ölçüm | Değer |
|---|---|
| Sağlık denetimi | **14 yeşil / 0 kırmızı** |
| Para değişmezleri (8 kural) | hepsi temiz |
| Birim testleri | **1.437 / 1.437 geçti** |
| Tip kontrolü (`npm run lint`) | temiz |
| Üretim derlemesi (`npm run build`) | başarılı |
| Veritabanı boyutu | **36 MB** (temizlik öncesi 70 MB) |

---

## 2. Rafa kaldırırken yapılan temizlik

### Veritabanının yarısı geri alındı: 70 MB → 36 MB

`cron.job_run_details` tablosu, zamanlanmış işlerin geçmişini tutuyordu ve
**kendiliğinden temizlenmiyordu**: 191.672 satır, 37 MB — yani veritabanının
yarısından fazlası sadece iş günlüğüydü. Günde 2.136 satır büyüyordu.

Rafta 6 ay beklese +385.000 satır daha eklenecekti (veritabanı ikiye
katlanırdı). Supabase bunun ileride sürüm yükseltmesini bozabileceğini açıkça
uyarıyor.

**Yapılan:** 7 günlük pencere bırakıldı, gerisi silindi ve her gece otomatik
temizleyen bir iş kuruldu. Bir daha şişemez.

### Güvenlik açığı kapatıldı (SEC-1)

Güvenlik turunda bulunan tek P0 kapatıldı: sıradan bir üye kendi profilindeki
`wallet` sütununu değiştirebiliyordu. Rafta kimse bakmayacağı için bunu açık
bırakmak doğru olmazdı.

- Yetki geri alındı **ve** koruma tetikleyicisine eklendi (iki katman)
- Saldırı canlıda tekrar denendi → **"permission denied"**, değer 0'da kaldı
- Sıradan profil düzenleme (ad, avatar, bio, pozisyon, bildirim tercihleri)
  ayrı ayrı test edildi → **hiçbiri bozulmadı**

---

## 3. Raftayken kendi kendine çalışmaya devam edecek olanlar

18 zamanlanmış iş açık kalıyor. Kullanıcı olmadığı için çoğu boşta dönecek;
zararı yok, elektriği yok.

| İş | Ne zaman | Ne yapar |
|---|---|---|
| `gecelik_yedek` | her gece 05:30 | 8 kritik tablonun kopyası, 7 gün saklanır |
| `sistem_saglik_gunluk` | her sabah 06:40 | 14 kontrolü çalıştırır, panele yazar |
| `cron_gunlugu_temizligi` | her sabah 07:10 | iş günlüğünü 7 güne indirir (**yeni**) |
| `hata_kayit_temizligi` | her sabah 06:50 | 30 günden eski çökme kaydını siler |
| diğer 14 iş | çeşitli | maç kapanışı, hatırlatma, temizlik |

**Bunlara dokunma.** Hepsi 24 saatte 2.136 kez çalıştı ve **sıfır** hata verdi.

---

## 4. 🔔 SENDEN İSTENEN TEK İŞ: yedeği indir (2 dakika)

Bu, rafa kaldırmadan önce yapılması gereken **tek** şey. Benim yapamayacağım
tek iş de bu — çünkü dosyayı senin bilgisayarına kaydetmek gerekiyor.

**Adımlar:**

1. Tarayıcıda **supabase.com** → giriş yap → **OYNA** projesini aç
2. Sol menüden **SQL Editor** → **New query**
3. Şunu yapıştır ve **Run**'a bas:

   ```sql
   SELECT public.veri_disari_aktar();
   ```

4. Sonuç tek bir uzun metin olarak gelir. Hücrenin üstüne gel, **kopyala**
5. Bilgisayarında bir metin dosyası aç, yapıştır ve şu adla kaydet:
   **`oyna-yedek-2026-08-04.sql`**
6. Bu dosyayı **iki ayrı yere** koy (ör. bilgisayarın + e-postana kendine gönder
   ya da bir bulut klasörü). Tek kopya yedek sayılmaz.

**Bu dosya ne işe yarar:** Proje tamamen giderse bile, depodaki migration
dosyaları + bu dosya = sistem sıfırdan aynen kurulur.

> **Gizlilik notu:** Dosyanın içinde kayıtlı kişilerin adı, e-postası ve
> telefonu vardır (4 gerçek kişi — ikisi sensin). Bu yüzden onu **git'e
> koymadım**; nereye koyacağına sen karar vermelisin. Bir yere yüklerken
> herkese açık olmamasına dikkat et.

---

## 5. Geri döndüğünde: uyandırma sırası

### Adım 1 — Supabase projesi açık mı?
supabase.com → OYNA. **"Paused"** yazıyorsa **Resume project**'e bas, 2-3 dakika
bekle.

### Adım 2 — Sağlık kontrolü
Yönetici paneli → **Komuta Merkezi** → **Sistem Sağlığı** → *Şimdi Kontrol Et*.

- **14 yeşil** → sistem sağlam, devam et
- Kırmızı varsa → mesajı oku; her kontrol ne olduğunu sade dille yazar

### Adım 3 — Uygulamayı yeniden çalıştırma

Terminalde proje klasöründe:

```bash
npm ci        # bağımlılıkları kur (bir kez)
npm run dev   # uygulamayı aç
```

Kontrol etmek istersen:
```bash
npm run lint       # tip kontrolü — temiz olmalı
npm run test:unit  # 1.437 test — hepsi geçmeli
npm run build      # üretim derlemesi
```

### Adım 4 — Kaldığın yer
`docs/board/07-stratejik-danisman.md` dosyasının sonundaki **"Sıradaki adım
için önerim"** tablosu, tam olarak nereden devam edeceğini söylüyor.

---

## 6. Raftayken açık kalan işler

Bunlar bilinçli olarak ertelendi; acil değiller.

| # | İş | Not |
|---|---|---|
| STR-1 | Panelde "Gerçek Durum" kartı | Baktığın kullanıcı/maç/para sayıları demo'yu içeriyor |
| SEC-2 | Kuralsız 6 tablonun geniş yetkileri | Bugün RLS koruyor, ama kazara |
| SEC-3 | `public_profiles` görünümü + gerçek ad kararı | **Senin KVKK kararın** bekleniyor |
| SEC-6 | Sızmış parola koruması | Supabase panelinde 5 dakika — **senin kararın** |
| SRE-2 | Alarmın sana ulaşması (e-posta) | Bilinçli ertelendi |
| SRE-4 | Deneme ortamı (`oyna-staging` boş) | Senin ~20 dakikan |
| SRE-8 | Geri alma provası | SRE-4'e bağlı |
| CPO-P0-1 | `demo_mode_enabled` açık | **Lansmandan önce kapatılmalı** |

---

## 7. Önemli anahtarların rafa kaldırılırken ki hâli

Geri döndüğünde "ben bunu böyle mi bırakmıştım?" diye sormaman için:

| Anahtar | Değer | Anlamı |
|---|---|---|
| `demo_mode_enabled` | **true** | Vitrinde demo maçlar görünüyor |
| `payment_mode_global` | **CASH_ONLY** | Kart ödemesi platform genelinde kapalı |
| `payment_provider` | IYZICO | Sağlayıcı ayarlı ama mod nakit |
| `push_live_enabled` | **false** | Toplu bildirim gönderimi kapalı |
| `sweeper_enabled` | true | Askıda ödeme süpürücüsü açık |
| `wallet_cashout_enabled` | **false** | Para çekme kapalı |
| `admin_mfa_required` | false | Panelde 2FA zorunlu değil |
| `maintenance_mode` | (yok) | Bakım modu kapalı |
| `registration_open` | (yok → açık) | Kayıt açık |

**Kurucu kararı (4 Ağu 2026): kayıt AÇIK kalacak.** Kapatma önerim reddedildi ve
bu doğru çıktı: rafa hazırlık sırasında **iki gerçek kayıt** oldu (14:29 ve 14:30),
biri başarıyla giriş de yaptı. Sistem şu an gerçekten kullanılıyor.

---

## 8. Son turda ayrıca yapılanlar (4 Ağustos 2026)

Kurucu 52 kararın tamamını onayladı (yalnız "kayıt kapatma" reddedildi).

| İş | Sonuç |
|---|---|
| Kuralsız 6 tablonun geniş yetkileri geri alındı | Artık güvenlik *kazara* değil, kurulu |
| `pay_public_match_deposit` kaldırıldı | Kullanılmayan, tutarı istemciden alan para yolu |
| 7 fonksiyonun gereksiz `anon` yetkisi geri alındı | Giriş öncesi ekranlar etkilenmedi |
| **Maç iptalinde bildirim düzeltildi (CPO-P0-4)** | Canlıda test: **0 → 7 kişi** bildirim aldı |
| `K-DEMO-1` denetimi maçlara da bakıyor | Eklendiği anda 3 yanlış kayıt yakalandı |
| 3 yanlış işaretli maç düzeltildi | Öncesi arşive alındı |
| **Panele "Gerçek Durum" kartı eklendi** | Demo ile gerçek yan yana, karışmadan |
| Geçici tablo silindi (arşivi alındı) | `_saat_dilimi_duzeltme_yedek` |
| Yedek kapsamı 8 → **10 tablo** | `app_config` + `commission_config` eklendi |
| `auto-cancel-matches` dosyası silindi | Yayında değildi, işini veritabanı yapıyor |
| **`OYNA_PRENSIPLER.md` yazıldı** | K-1…K-17 tek çelişkisiz dosyada |
| `CLAUDE.md` yeni pusulaya bağlandı | Mekanizma kullanımı da eklendi |

**Yapılmayan bir öneri:** `net._http_response` için temizlik önermiştim; ölçünce
pg_net'in kendi 6 saatlik temizliği olduğu görüldü — gereksizdi, yapılmadı.

**Yan bulgu (düzeltilmedi):** `K-BILDIRIM-1` denetimi "son 24 saat" diye soruyor
ama pg_net 6 saatten eski kayıtları siliyor. Gece olan bir bildirim hatası sabah
denetimine kadar silinmiş olur ve kontrol yeşil görünür. Ayrı bir iş.
