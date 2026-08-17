# OYNA — main'e BİRLEŞTİRME ve CANLI HAZIRLIK

> **Tarih:** 17 Ağustos 2026 · **Durum:** YÜRÜRLÜKTE
> Bu belge iki soruyu cevaplar: *"main'e birleşebilir miyiz?"* ve *"veritabanı hazır mı?"*
> Her madde canlıda ÖLÇÜLDÜ; tahmin yok. Kod okumayı gerektirmez.

---

## 0 · İKİ CÜMLELİK CEVAP

**Birleştirme:** Evet. Çakışma yok, iki dal tek dalda toplandı, testler yeşil.
main'e gitmeye hazır — komutlar §3'te.

**Veritabanı:** Motor sağlam. Yapı, güvenlik, arka plan işleri ve veri bütünlüğü
kusursuz ölçüldü. Ama **iki şalter yanlış konumda** (§2) ve düzeltilmeden mağaza
incelemesine girilmemeli. İkisi de tek satırlık ayar, kod değişikliği yok.

---

## 1 · ÖLÇÜLEN DURUM — kanıtlı karne

| Konu | Durum | Ölçüm |
|---|---|---|
| main ile çakışma | ✅ | `git merge-tree` → **0 çakışma**; main 49 commit geride, 0 ileride |
| Kodun çağırdığı sunucu fonksiyonları | ✅ | Koddaki **379 RPC'nin 379'u** canlıda var (eksik: 0) |
| Satır bazlı güvenlik (RLS) | ✅ | **124 tablonun 124'ünde** açık (kapalı: 0) |
| Anonim okuma açığı | ✅ **kapatıldı** | 3 tabloda "herkes okuyabilir" kapısı vardı; `200 → 401` doğrulandı |
| Herkese açık görünümler | ✅ | e-posta, telefon, T.C., kart, IBAN, push jetonu **yok** |
| Arka plan işleri (cron) | ✅ | **23 iş, son 24 saatte 0 hata** (iade kuyruğu dakikası dakikasına) |
| Veri bütünlüğü | ✅ | Asılı ödeme 0 · ödenmemiş rezervasyon 0 · bekleyen iade 0 · sahipsiz kayıt 0 |
| Göç defteri ↔ depo | ✅ **eşitlendi** | Canlıda olup depoda olmayan sürüm: **0** |
| Zorunlu güncelleme kapısı | ✅ | 3.0.0 için `zorunlu_guncelleme: false` (canlıda çağrılarak test edildi) |
| Performans | ✅ | 147 uyarının **hiçbiri hata seviyesinde değil**; kritik yollarda eksik indeks yok |
| **Demo verisi vitrinde** | ⚠️ **AÇIK** | Vitrindeki **tek maç sahte**; aramada 29 sahte kişi; 21 sahte maç |
| **Telefon bildirimleri** | ⚠️ **KAPALI** | `push_live_enabled=false` → hiçbir bildirim telefona gitmiyor |

---

## 2 · GÖNDERİMDEN ÖNCE KAPATILACAK İKİ ŞALTER

### 2.1 · Sahte vitrin (demo modu)

**Sorun:** Canlıda `demo_mode_enabled = true`. Bunun sonucu ölçüldü:
Ordu'da vitrinde görünen **tek maç sahte**, arkadaş aramasında **29 sahte kişi**,
açık maç görünümünde **21 sahte maç**. İncelemeci bunları görür; daha kötüsü,
gerçek bir kullanıcı sahte bir maça **gerçek kartıyla** ödeme yapabilir.

**NE ZAMAN:** Mağaza **ekran görüntülerini aldıktan SONRA**, göndermeden hemen önce.
(Sahte veri ekranları dolu gösterdiği için görüntüleri önce almak isteyebilirsin.)

```sql
-- 1) Demo anahtarını kapat
UPDATE public.app_config SET value = 'false'::jsonb, updated_at = now()
 WHERE key = 'demo_mode_enabled';

-- 2) Demo maçları vitrinden çıkar (vitrin fonksiyonu anahtarı sormuyor)
UPDATE public.matches SET visibility = 'PRIVATE'
 WHERE "isDemo" = true AND visibility = 'OPEN';

-- 3) Demo kişileri aramadan ve kaleci/hakem seçiminden çıkar
UPDATE public.profiles SET is_available = false
 WHERE is_demo = true;
```

**Doğrulama — üçü de 0 dönmeli:**
```sql
SELECT count(*) FROM public.get_nearby_matches(40.9839, 37.8764, 50);
SELECT count(*) FROM public.public_matches WHERE coalesce("isDemo", false);
SELECT count(*) FROM public.profiles p
  JOIN public.public_profiles pp ON pp.id = p.id WHERE coalesce(p.is_demo, false);
```

**Bunu bilerek onayla — kapattıktan sonra uygulama şunu gösterecek:**

| | Şimdi | Sonra |
|---|---|---|
| Maç | 22 (21'i sahte) | **0** |
| Kaleci / Hakem | 4 (hepsi sahte) | **0** |
| Aranabilir kişi | 33 | **~7** (gerçek hesaplar) |
| **Saha** | 6 | **4 — gerçek, fiyatlı, rezerve edilebilir** |

Yani lansmanda **çalışan ürün saha rezervasyonu** olacak. Bu bir arıza değil,
dürüst durum. Maç listesinin boş olması ret sebebi değildir; sahte maç olması olabilir.

**Geri alma:** `UPDATE public.app_config SET value='true'::jsonb WHERE key='demo_mode_enabled';`

---

### 2.2 · Telefon bildirimleri kapalı

**Sorun:** `push_live_enabled = false`. Sunucu her bildirimi "simülasyon" sayıp
atıyor — "maçın 1 saat sonra", "rezervasyonun onaylandı" hiçbiri telefona düşmüyor.
Uygulama kullanıcıdan bildirim izni **istiyor** ama hiç bildirim göndermiyor.

**ÖNCE ŞU ŞART:** Android için `google-services.json`, iOS için APNs anahtarı
tanımlı olmalı. Bunu koddan doğrulayamadım — Supabase panelindeki gizli ayar.

```sql
UPDATE public.app_config SET value = 'true'::jsonb, updated_at = now()
 WHERE key = 'push_live_enabled';
```

**Doğrulama:** Kendi telefonuna bir test bildirimi gönderttir ve **gözünle gör**.
Sonra: `SELECT status, count(*) FROM public.push_log GROUP BY 1;` →
`sent` satırı görünmeli (şu an yalnız `simulated` var).

---

## 3 · BİRLEŞTİRME — adım adım

> Bu adımlar **senin bilgisayarında** çalıştırılır. Her adımda "ne görmelisin" yazıyor.

### Adım 0 — Nereye dönebileceğini not al
```bash
cd /home/user/OYNA
git rev-parse main
```
Çıkan uzun kodu bir yere yaz. Ters giderse dönüş noktan bu.

### Adım 1 — Dalı al ve main'e birleştir
```bash
git checkout main
git pull origin main
git merge origin/claude/kapsamli-canli-test
```
**Görmen gereken:** `Fast-forward` ya da `Merge made by` — **`CONFLICT` YAZMAMALI.**
(Çakışma çıkarsa `git merge --abort` yazıp bana haber ver.)

### Adım 2 — Son kontrol
```bash
npx tsc --noEmit          # hiçbir çıktı vermemeli
npx vitest run tests/unit # "2227 passed" yazmalı
```

### Adım 3 — Gönder
```bash
git push origin main
```

### Geri alma yolu
```bash
git merge --abort                    # birleştirme sırasında vazgeçersen
git reset --hard <Adım 0'daki kod>   # birleştirdikten sonra dönmek için
```

> **NOT:** Bu dal, `claude/veritabani-durumu-inceleme-4fgk2a` dalını **zaten
> içeriyor** (17 Ağustos akşamı birleştirildi). O dalı ayrıca merge etmene
> gerek yok — ederse de zararsız, çünkü aynı commit'ler.

---

## 4 · VERİTABANI KOMUTLARINDA YASAK OLANLAR

| Komut | Neden yasak |
|---|---|
| `supabase db push --include-all` | Depodaki bazı göçler canlıdaki **bilinçli ayarları geri alır** (ör. maç kaporasının kapalı olması). |
| `supabase db reset` (canlıya) | Tüm veriyi siler. Bu komut yalnız yerel geliştirme içindir. |
| Elle `schema_migrations` düzenlemek | Defter bozulursa Supabase↔GitHub köprüsü durur. Gerekirse yer işareti dosyası eklenir (bkz. `20260817174746_*.sql`). |

---

## 5 · ROL KARNESİ — kim ne yapabiliyor

| Rol | Çekirdek akış | Not |
|---|---|---|
| **Oyuncu** | ✅ Kayıt → keşif → saha seç → saat seç → kartla kapora → bilet | Ana akış uçtan uca çalışıyor |
| **Kaptan** | ✅ Maç kur → kadro → sohbet → iptal/iade | Kaleci/hakem daveti "yakında" |
| **Saha sahibi** | ✅ Panel → takvim → tarife → finans → hesap silme | Veri izolasyonu doğrulandı: her sahip yalnız kendi tesisini görüyor |
| **Kaleci / Hakem** | ✅ Başvuru → onay → profil | Kiralama bilinçli kapalı |
| **Yönetici** | ✅ Ayrı web paneli (mobil pakette YOK) | Moderasyon kuyruğu çalışıyor |

**Hesap silme** (App Store 5.1.1(v)) üç rolde de uygulama içinden erişilebilir.

---

## 6 · KURUCU İŞİ — SIRAYLA

> **[ÖNCE]** = mağazaya göndermeden · **[SONRA]** = gönderimden sonra olabilir

1. **[ÖNCE · 1 dk]** `.env` dosyasındaki `VITE_SUPABASE_URL` satırının canlı adresi
   gösterdiğinden emin ol: `https://iikvzgyccvgcybzdfwlv.supabase.co`
   *(Yerel adres kalırsa derleme zaten durur ve sebebini yazar.)*
2. **[ÖNCE · 30 dk]** **iyzico anahtarı canlı mı, test mi?** Supabase → Edge Functions
   → Secrets → `IYZICO_API_KEY`. `sandbox-` ile başlıyorsa **test modudur**, gerçek
   kart çalışmaz. Sonra iPhone ve Android'de **küçük tutarlı gerçek bir kart provası** yap.
   Bakılacak tek şey: banka SMS ekranı **uygulamanın içinde** açılmalı.
3. **[ÖNCE · 10 dk]** Firebase `google-services.json` dosyasını `android/app/` altına koy.
   Bu olmadan Android bildirimleri tamamen ölü ve derleme bunu **söylemiyor**.
4. **[ÖNCE · 20 dk]** Mağaza ekran görüntülerini al (demo verisi hâlâ açıkken ekranlar dolu görünür).
5. **[ÖNCE · 5 dk]** §2.1'deki üç SQL'i çalıştır → sahte vitrin kapanır.
6. **[ÖNCE · 5 dk]** §2.2'deki SQL'i çalıştır → bildirimler açılır; test bildirimini gözünle gör.
7. **[ÖNCE · 15 dk]** Paketi **doğru komutla** üret:
   ```bash
   npm run sync:android
   npm run sync:ios && cd ios/App && pod install && cd ../..
   ```
   **`pod install` ATLANMAMALI.** Kontrol: `grep -c "^  - Capacitor" ios/App/Podfile.lock`
   → **4 değil, ~15** çıkmalı. Atlanırsa rehber, konum, kamera, klavye ve bilet
   kaydetme iPhone'da sessizce çalışmaz.
8. **[ÖNCE · 10 dk]** Üç tesis verisini düzelt: **Ahmet Kuru 2. Saha** hafta içi
   15:00-23:00 tarifesine fiyat gir (şu an 0 ₺ → o saatler satılamıyor);
   **Orduspor** ve **Cumhuriet Gençlik** için tarife tanımla (takvimleri boş).
9. **[ÖNCE · 5 dk]** İnceleme notuna yaz: uygulamanın verisi yalnız **Ordu/Altınordu**'da;
   incelemeci başka bölgeden bakarsa liste boş görünür. Test hesabı bilgisi + akış
   adımlarını da ekle ("saha seç → saat seç → kaporayı öde").
10. **[SONRA]** App Store kimliği çıkınca `settings.storeUrlIos` alanını doldur
    (şu an boş; zorunlu güncelleme günü iPhone kullanıcısı mağazayı bulamaz).
11. **[SONRA · SANA SORUM]** Canlı projenin **dışından** bir sunucu, her 5 dakikada bir
    iade servisini çağırıp reddediliyor (son 24 saatte **209 reddedilmiş** çağrı).
    Elinde eski bir kopya/deneme Supabase projesi var mı? Varsa onun cron işleri
    kapatılmalı: biri o parolayı "düzeltirse" aynı iade iki kez işlenebilir.

---

## 7 · BİLEREK YAPILMAYANLAR

| Konu | Neden |
|---|---|
| Cüzdan kapalı | Lisans gerektiriyor; istemci ve sunucu uyumlu şekilde kapalı |
| Maç kaporası kapalı | Lansman kararı |
| Kaleci/hakem kiralama kapalı | Bölgede onaylı gerçek sağlayıcı yok |
| 9 tabloda "RLS var, politika yok" | Kasıtlı **varsayılan-ret**: şifre kodları, maç özel kodları istemciye tamamen kapalı |
| 4 görünüm SECURITY DEFINER | Kasıtlı: bu görünümler veriyi **maskelemek** için var (konum, kimlik, sohbet dışarıda) |
| İçerik süzgeci yalnız Türkçe ve yalnız mesajlarda | Kapsam kararı; şikayet + engelleme her yerde çalışıyor |
| Demo verisi silinmedi, gizlenecek | Silme geri alınamaz; gizleme tek satırla geri döner |
