# EK — Güven Sınırı: Kapıları Kurmak ve Kurduğumuzdan Emin Olmak

> **Bağlam:** CTO turu Aşama 1, madde 1 ve 2. Kurucu talebi: *"Kapıları doğru kurduğumuzdan emin olunmalı"* + *"Halletmemiz için ne gerekiyorsa araştır ve açıkla."*
> **Tarih:** 3 Ağustos 2026 · Tüm ölçümler canlı Supabase'de (`iikvzgyccvgcybzdfwlv`) salt-okunur yapıldı.

---

## 1. "Kapı" nedir? — Beş katman

Bir kullanıcının veriye ulaşmasıyla veri arasında beş ayrı kapı olabilir. Her biri farklı bir soruya cevap verir:

| # | Kapı | Sorduğu soru | Postgres karşılığı |
|---|---|---|---|
| **1** | **Satır kapısı** | "Bu *kayıt* senin mi?" | RLS politikası |
| **2** | **Sütun kapısı** | "Bu *alanı* değiştirebilir misin?" | Sütun `GRANT`/`REVOKE` + `BEFORE UPDATE` bekçi tetikleyicisi |
| **3** | **Değer kapısı** | "Bu *değer* geçerli mi?" | `CHECK` / `EXCLUDE` kısıtı |
| **4** | **Çağrı kapısı** | "Bu *işlemi* çağırabilir misin?" | Fonksiyon `EXECUTE` yetkisi |
| **5** | **Kimlik kapısı** | "*Sen kimsin* ve bu işlemi yapma hakkın var mı?" | Fonksiyon gövdesindeki yetki kontrolü |

**Kritik nokta:** Bir fonksiyon `SECURITY DEFINER` ise **1. kapıyı atlar** — satır kurallarına bakmadan çalışır. OYNA'da 554 fonksiyon bu şekilde. Onlar için tek koruma 4. ve 5. kapılardır.

---

## 2. Bugün nerede duruyoruz — ölçülmüş durum

| Kapı | Durum | Ölçüm |
|---|---|---|
| **1 — Satır** | 🟢 **Tam** | 112/112 tabloda RLS açık · 272 politika · anonim yazma politikası **0** |
| **2 — Sütun** | 🔴 **Kısmi** | `profiles`: 2 bekçi tetikleyici ✅ · `matches`: **hiç yok**, 58 sütun yazılabilir ❌ |
| **3 — Değer** | 🟡 **Kısmi** | Çifte rezervasyon `EXCLUDE` kısıtıyla engelli ✅ · kapora alt sınırı **yok** ❌ · tarife fiyatı 0 olabiliyor ❌ |
| **4 — Çağrı** | 🟡 **Kısmi** | 404 fonksiyon kullanıcıya açık; en az 5'i gereksiz açık |
| **5 — Kimlik** | 🟢 **Büyük ölçüde iyi** | 404'ün **358'i (%89)** görünür kapı taşıyor · 4'ü içeri devrediyor · **42'si kapısız** |
| **Denetçi** | 🟠 **Var ama çalışmıyor** | `check_money_invariants()` mevcut, 8 değişmez kontrol ediyor — **hiçbir zamanlanmış görev onu çağırmıyor** |

**Şu anki para durumu:** `check_money_invariants()` elle çalıştırıldı → **`ok: true`**, sekiz değişmezin sekizi de temiz. Yani bugün defter tutarlı. Sorun bunun **kimse tarafından izlenmiyor** olması.

---

## 3. Kapısız 42 fonksiyonun triyajı

### 32'si okuyucu — büyük çoğunluğu meşru
`get_nearby_pitches`, `get_pitch_availability`, `resolve_payment_mode`, `is_registration_open`, `_are_friends` gibi yardımcılar. Bunların herkese açık olması tasarım gereği ve doğru.

**İki istisna dikkat gerektiriyor:**
- `calculate_commission(...)` — komisyon oranını döndürüyor. `20260904000000:272-276` migration'ı komisyonu *"ticari bilgidir"* diyerek saha sahibinden bile gizliyor; ama bu fonksiyon herkese açık.
- `get_court_day_quote` / `get_showcase_availability` — rakip bir tesis fiyat ve doluluk verisini toplu çekebilir.

### 10'u yazıcı — gerçek iş listesi

| Fonksiyon | Durum | Risk |
|---|---|---|
| **`pay_public_match_deposit(match, user_id, amount)`** | 🔴 Kapısız | Başka bir kullanıcının kimliğini ve keyfi bir tutarı parametre alıyor |
| **`purge_godview_demo()`** | 🔴 Kapısız | Giriş yapmış herkes demo verisini silebilir |
| **`seed_godview_demo()`** | 🔴 Kapısız | Giriş yapmış herkes demo verisi üretebilir |
| **`cancel_match_service_offers(match_id)`** | 🔴 Kapısız | Herkes, herhangi bir maçın bekleyen kaleci/hakem tekliflerini iptal edebilir |
| **`match_check_threshold(match_id)`** | 🟠 Kapısız | Maçı kesinleştirebilir; kadro dolu değilse etkisiz ama çağrı yüzeyi açık |
| `_pitches_owner_guard`, `_sync_pitch_working_hours`, `_trg_match_threshold`, `matches_format_range_guard`, `ensure_owner_account` | 🟡 Tetikleyici fonksiyonu | Tetikleyici olarak çalışırlar; doğrudan çağrılmaları anlamsız ama yetki hijyeni gereği kapatılmalı |

**Not:** Bu tam olarak `RPC_YETKI_ENVANTERI.md`'nin uyardığı kalıptır: *"sarmalayıcıyı `CREATE OR REPLACE` ile ezmeyin — kapı kaybolur."* 229 fonksiyon birden fazla kez tanımlanmış; bu 5 fonksiyon büyük ihtimalle o yeniden tanımlamalarda kapısını kaybetmiş.

---

## 4. Ne gerekiyor — "Güven Sınırı" paketi

### İş listesi (sırayla)

| # | İş | Ne yapar | Efor |
|---|---|---|---|
| **G1** | **`matches` sütun bekçisi** | `profiles`'takinin aynısı: `BEFORE UPDATE` tetikleyicisi para ve durum sütunlarını (`price`, `commission_*`, `slots`, `deposit_*`, `status`, `min_players`) admin/güvenilir bağlam dışında eski değerine döndürsün. Ayrıca `authenticated`'dan bu sütunların `UPDATE` yetkisi `REVOKE` edilsin. | M |
| **G2** | **İade saatini sunucu türetsin** | `process_tiered_refund` `p_hours_to_match` parametresini almasın; `payment_intents` üzerinden maçın/rezervasyonun gerçek saatini kendisi okusun. Ayrıca `authenticated`'dan `REVOKE`. | S |
| **G3** | **Kapora tabanı sunucuda** | `record_app_deposit_payment` tutarı parametre olarak kabul etmesin veya sunucunun `pitch_tariffs.deposit_amount` / `direct_booking_deposit_default_pct` ile hesapladığı değerle eşleşmiyorsa reddetsin. | S |
| **G4** | **Gereksiz açık fonksiyonları kapat** | `match_block_deposit`, `pay_public_match_deposit`, `cancel_match_service_offers`, `purge_godview_demo`, `seed_godview_demo`, `void_preauth`, `process_tiered_refund` + 5 tetikleyici fonksiyonu → `REVOKE EXECUTE FROM authenticated` | S |
| **G5** | **Bildirim politikası düzelt** | `notifications_insert_own_sender` politikası kaldırılsın; istemci yalnız kendine bildirim yazabilsin. Kullanıcıdan kullanıcıya bildirim zaten güvenilir fonksiyonlardan geçiyor. | S |
| **G6** | **Değer kısıtları** | `pitch_tariffs.slot_price > 0` CHECK · kapora oranı %10–50 bandı sunucuda zorlansın | S |

**Toplam: yaklaşık 2 iş günü.** Hepsi yeni migration dosyası; hiçbiri mevcut veriye dokunmuyor; her biri tek satırlık bir geri alma dosyasıyla iptal edilebilir.

---

## 5. "Emin olma" — asıl mesele

Yukarıdaki altı iş **bugünün** kapılarını kurar. Ama asıl soru şu: **altı ay sonra, 200 migration sonra, kapılar hâlâ yerinde mi olacak?**

Bugün bu sorunun cevabı **hayır, bilemeyiz** — çünkü hiçbir şey ölçmüyor. Ben az önce elle ölçtüm; bu ölçüm kalıcı hale getirilmezse bir daha yapılmaz.

Üç kalıcı araç gerekiyor:

### 5.1 Kapı envanteri — "hangi kapı eksik?" sorgusu

Tek bir SQL sorgusu, istendiği an çalıştırılır ve şunu döndürür:
- Kullanıcıya açık her `SECURITY DEFINER` fonksiyon
- Her birinde yetki kontrolü var mı
- Hassas tablolarda sütun bekçisi var mı
- Beklenen yetki listesiyle canlı durum arasındaki fark

Bu, bu raporun 2. ve 3. bölümlerini **otomatik** üretir. Bir migration yanlışlıkla kapı silerse, bir sonraki çalıştırmada görünür.

**Nereye:** Admin panelinde "Sistem Sağlığı" ekranına bir kart; ayrıca haftalık zamanlanmış görev.

### 5.2 Saldırı testleri — kapıyı **kırmaya çalışan** testler

Bugün 1426 birim testi var ve hepsi aynı soruyu soruyor: *"doğru kullanım çalışıyor mu?"*
**Hiçbiri şunu sormuyor:** *"yanlış kullanım engelleniyor mu?"*

Bu turda bulduğum beş açığın **hiçbirini** mevcut testler yakalamıyor — çünkü hepsi uygulamanın akışının *dışında*, doğrudan veritabanına yazarak istismar ediliyor.

Gereken test tipi (`tests/integration/` altındaki `BEGIN … ROLLBACK` deseni buna hazır):

```
-- Kaptan kendi maçının fiyatını değiştirmeye ÇALIŞSIN → başarısız olmalı
-- Kullanıcı 1 ₺ kapora göndermeye ÇALIŞSIN → reddedilmeli
-- Kullanıcı başkasına bildirim yazmaya ÇALIŞSIN → reddedilmeli
-- Kullanıcı geçmiş maç için iade istemeye ÇALIŞSIN → %0 dönmeli
-- Kullanıcı admin fonksiyonunu çağırmaya ÇALIŞSIN → reddedilmeli
```

Her G1–G6 işi, **kendi saldırı testiyle birlikte** teslim edilmeli. Test olmadan kapı, kapandığını sandığınız bir kapıdır.

### 5.3 Para denetçisini takvime bağla — **zaten yazılmış, sadece çalışmıyor**

`check_money_invariants()` fonksiyonu mevcut ve sekiz şeyi kontrol ediyor:

| Kod | Ne kontrol ediyor |
|---|---|
| I1 | Cüzdan aynası ile defter toplamı uyuşuyor mu |
| I2 | Aynı ödeme iki kez kaydedilmiş mi |
| I3 | Aynı yükleme iki kez kredilenmiş mi |
| I4 | Negatif bakiye kovası var mı |
| I5 | Karşılığı olmayan iade kredisi var mı |
| I6 | 6 saatten uzun askıda kalan ödeme var mı |
| I7–I8 | Çekim tutarı bileşenleriyle tutarlı mı |

**Bugün elle çalıştırıldı: `ok: true`, sekizi de temiz.**

Gereken tek şey: saatlik bir zamanlanmış görev + `ok: false` olduğunda bildirim. Altyapı hazır (13 zamanlanmış görev zaten çalışıyor, bildirim sistemi var). **Yaklaşık 1 saatlik iş** ve para tarafındaki en yüksek getirili yatırım.

---

## 6. Özet: sıra ve efor

| Sıra | İş | Efor | Neden bu sırada |
|---|---|---|---|
| 1 | **Para denetçisini zamanla** (5.3) | ~1 saat | Zaten yazılmış; çalıştırmadan diğer işlerin etkisini göremeyiz |
| 2 | **G4 — gereksiz açık fonksiyonları kapat** | ~1 saat | Tek komut, en yüksek risk/efor oranı |
| 3 | **G5 — bildirim politikası** | ~1 saat | Push açılmadan önce şart |
| 4 | **G2 + G3 — iade saati ve kapora tabanı** | ~4 saat | Para hesabına doğrudan dokunuyor |
| 5 | **G1 — `matches` sütun bekçisi** | ~4 saat | En büyük iş; `profiles` deseni kopyalanacak |
| 6 | **G6 — değer kısıtları** | ~2 saat | Veri düzeltmesi gerektirdiği için kurucu onayına bağlı |
| 7 | **Kapı envanteri sorgusu** (5.1) | ~3 saat | Yukarıdakilerin kalıcı olmasını sağlar |
| 8 | **Saldırı testleri** (5.2) | ~1 gün | Her G işiyle birlikte yazılır |

**Toplam: ~2,5 iş günü.**

---

## 7. Tek cümlelik sonuç

> Kapıların **%89'u zaten doğru kurulmuş** ve `profiles` tablosu nasıl yapılacağının örneği. Eksik olan kapılar sonlu ve sayılmış: **10 fonksiyon, 1 tablo, 3 kural.** Asıl yatırım bunları kapatmak değil — **kapandığını sürekli ölçen üç aracı kurmak.** Ölçmediğiniz kapı, kapalı sandığınız kapıdır.
