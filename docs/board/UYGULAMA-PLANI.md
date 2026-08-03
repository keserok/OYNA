# OYNA — UYGULAMA PLANI

> **Karar (3 Ağustos 2026):** Kurucu, kod ve canlı veritabanı uygulamasının **sonraki
> rollerden ÖNCE** yapılmasını istedi. Bölüm V'teki "tüm roller bitince kod" sırası
> değişti; paket mantığı aynen korunuyor.
>
> **Kaynak bulgular:** `01-cpo.md` · `02-cto.md` (+2 ek) · `03-mimar.md`
> **Kararlar:** `DECISIONS.md` K-1…K-11
> **Dal:** `claude/oyna-advisory-prompt-8s4x3m`

---

## 0. ÖNCE OKUNMASI GEREKENLER — üç sert gerçek

### 0.1 · Bazı adımları BEN YAPAMAM — sen yapacaksın

Üç şey benim yetkim dışında ve bunlar **tam olarak bugünkü arızaların kök nedeni**:

| Ne | Nerede yapılır | Neden ben yapamam |
|---|---|---|
| `WEBHOOK_SECRET` ortam değişkeni | Supabase panosu → Edge Functions → Secrets | Gizli anahtar. Okumam/yazmam yasak (kurul promptu). Ayrıca bu ayar için araç da yok. |
| `app.settings.webhook_secret` | Veritabanı ayarı | Yukarıdakiyle **aynı değer** olmalı. Değeri ben üretirsem gizli anahtar benim kayıtlarıma girer. |
| `app.settings.functions_base_url` | Veritabanı ayarı | Gizli değil — **bunu ben yapabilirim**, onay verirsen. |

**Sonuç:** P-0 paketinin ilk adımı sende. Sen iki kutuyu doldurmadan ben devamını
uygulayamam. Adım adım nereye ne yazacağını P-0'da anlattım.

### 0.2 · Deneme ortamı YOK — canlıya doğrudan uygulama riski

`oyna-staging` projesi **INACTIVE** (CTO-P0-6). Yani yazacağım migration'ları önce
deneyebileceğimiz bir yer yok. Para akışına dokunan bir migration'ı **doğrudan canlıya**
uygulamak, bu projenin geçmişindeki en pahalı hata türüne davetiye çıkarır.

**Üç seçenek var, kararı sen vereceksin:**

| Seçenek | Nasıl | Maliyet | Risk |
|---|---|---|---|
| **A** — `oyna-staging`'i uyandır | Var olan proje aktif edilir, şema kopyalanır, her paket önce orada denenir | Ücretsiz plan sınırları içinde olabilir | **En düşük** |
| **B** — Supabase dal (branch) kullan | Her paket için geçici bir veritabanı dalı açılır, denenir, sonra ana veritabanına birleştirilir | **Ücretli** (Pro plan gerektirir) | En düşük |
| **C** — Doğrudan canlıya | Her paket tek tek, geri alma dosyasıyla birlikte | Ücretsiz | **Yüksek** — ama şu an gerçek kullanıcı yok |

**Önerim: A.** Şu an canlıda 33 profil ve hepsi demo — yani C'nin riski bugün
düşük görünüyor. Ama para fonksiyonlarına dokunacağız ve alışkanlığı **doğru**
kurmalıyız. Staging'i şimdi uyandırmak, ileride her pakette işimize yarayacak.

### 0.3 · K-10.3'ün cevabı: `match_participants` bugün tek kaynak OLAMAZ

Direktifin gereği tabloyu tam inceledim. **İyi haber:** temel yapısı sağlam.

✅ `UNIQUE (match_id, user_id)` — aynı kişi bir maça iki kez yazılamaz
✅ Maç silinince katılımcılar da silinir (`ON DELETE CASCADE`)
✅ Kullanıcı silinince kayıtları da silinir
✅ Dört indeks var, sorgular hızlı

❌ **Ama tabloda kişinin HANGİ TAKIMDA olduğu bilgisi YOK.**
❌ **Kişinin HANGİ MEVKİDE oynadığı bilgisi de YOK.**

Bugün bu bilgiler yalnız maçın içindeki JSON listesinde duruyor (`slots` = ev sahibi,
`awaySlots` = deplasman). Tabloda `side` ya da `position` diye bir sütun yok.

> **Yani bugün "tek kaynak `match_participants` olsun" dersek, takım ve mevki bilgisini
> kaybederiz.** Kadro ekranı çalışmaz hale gelir.

**Ayrıca üç kapı sorunu buldum:**

| Sorun | Ne demek |
|---|---|
| `status` ve `role` sütunlarında CHECK yok | `matches.status` ile aynı hastalık — sözlük dışı değer sessizce girebilir |
| `match_participants_insert` kuralı çok gevşek | Kullanıcı **herhangi bir maça** kendini katılımcı olarak ekleyebilir — ödeme yapmadan, maç açık olmasa bile |
| `match_participants_delete` kuralı çok gevşek | Kullanıcı kendini listeden silebilir — JSON'daki slotu dururken. **Sapmayı bilerek üretebilir.** |

**Bu yüzden P-2 paketi, sadece "3 fonksiyonu düzelt"ten çok daha geniş:** tabloya
sütun eklenecek, kısıtlar konacak, kapılar sıkılaştırılacak, sonra tek kaynak yapılacak.
Senin "diğer tabloyu da tam olarak incele ve gerekli ayarlanması gereken bir şey varsa
ayarla" direktifin **tam yerinde çıktı** — düzeltilmesi gereken çok şey vardı.

---

## 1. PAKET SIRASI

Sıra rastgele değil. **Her paket, bir sonrakinin ön koşulunu karşılıyor.**

```
P-0  AYARLAR        → her şeyin önünü açar (bugünkü iki arızanın kök nedeni)
P-1  ZAMAN BOMBASI  → bölge göçünün ön koşulu
P-2  PARA ZİNCİRİ   → K-10.10: para ailesi önce
P-3  DEMO TEMİZLİĞİ → denetim aracının temiz zeminde doğması için
P-4  MEKANİZMA      → bundan sonraki her paketi O denetleyecek
P-5  ÖLÇEK          → lansman öncesi zorunlu üçlü
P-6  BÖLGE GÖÇÜ     → P-1 bitmeden başlamaz
P-7  HIZLI KAZANIMLAR
```

**Her paketin taşıdığı üç şey** (Bölüm V kuralı, değişmedi):
değişiklik · uygulamada tıklayarak doğrulama · geri alma yolu.

---

## P-0 · AYARLAR — bugünkü iki arızanın kök nedeni

**Neden ilk:** Bu paket bitmeden bildirim gönderemeyiz ve askıda para toplayamayız.
Sonraki paketlerin doğrulaması da bildirime bağlı.

### Adım 0 — SENDE (ben yapamam)

1. Supabase panosunda **Edge Functions → Secrets** bölümüne git
2. `WEBHOOK_SECRET` adında yeni bir gizli anahtar oluştur (uzun, rastgele bir metin)
3. Aynı değeri bana verme — **panoda SQL Editor'a** şunu yaz ve çalıştır:
   ```sql
   ALTER DATABASE postgres SET app.settings.webhook_secret = 'BURAYA_AYNI_DEGER';
   ```
4. Bittiğinde bana "ayarlar girildi" de. Değeri **asla paylaşma.**

> `app.settings.functions_base_url` gizli değil — onay verirsen onu ben yazarım.

### Adım 1 — BENDE

| # | İş | Nasıl |
|---|---|---|
| 1 | Süpürücü cron'unu kur | Var olan migration'ı yeniden çalıştır — ayarlar dolunca kendiliğinden kuruluyor |
| 2 | Push köprüsünü onar | Yeni migration: `Authorization` başlığı + doğru gövde biçimi (`{type,table,record,schema}`) + URL'in ayardan okunması |
| 3 | Ayar envanteri tablosu | Sistemin ihtiyaç duyduğu her ayarın listesi + hangisi zorunlu |
| 4 | `sweeper_enabled` açılması | **Ayrı onayın** — para toplamaya başlar |

**Risk:** 🔴 Para akışı ve bildirim. Süpürücü açılınca gerçekten para hareketi başlar.
**Doğrulama:** Uygulamada bir maça katıl → telefonuna bildirim gelmeli. Admin panelde
"askıda ödeme" sayısı görünmeli.
**Geri alma:** `sweeper_enabled` kapatılır (anında durur), push tetikleyicisi kaldırılır.

---

## P-1 · ZAMAN BOMBASI — bölge göçünün ön koşulu

| # | İş |
|---|---|
| 1 | Canlıdaki doğru `player_create_match` ve `create_match_atomic` tanımlarını repoya **yeni** migration olarak yaz (eski dosyalara dokunulmaz) |
| 2 | K-10.6: `starts_at` tek doğru kaynak — metin `date`/`time` tetikleyiciyle türetilsin |
| 3 | Repoda riskli saat desenini arayan tarayıcı (`K-ZAMAN-2`) |

**Risk:** 🟠 Maç saatleri. Yanlış giderse tüm maçlar kayar.
**Doğrulama:** Yeni maç oluştur → listede, lobide ve bildirimde **aynı saat** görünmeli.
Ayrıca boş bir veritabanına tüm migration'lar çalıştırılıp sonuç canlıyla karşılaştırılır.
**Geri alma:** Tetikleyici kaldırılır; fonksiyon tanımları önceki haline döner.

---

## P-2 · PARA ZİNCİRİ — en büyük ve en riskli paket

K-10.10 gereği para ailesi önce. **Bu paket kendi içinde 4 alt adıma bölünecek**,
her biri ayrı doğrulanacak — hepsi tek seferde uygulanmayacak.

### P-2a · Kadro tek kaynak (M-P0-4 + K-10.3)

| # | İş |
|---|---|
| 1 | `match_participants`'a **`side`** (ev/deplasman) ve **`position`** sütunları eklenir |
| 2 | `status` ve `role` sütunlarına CHECK kısıtı konur |
| 3 | Mevcut JSON verisinden tablo **doldurulur** (geriye dönük tamamlama) |
| 4 | `player_release_slot`, `player_self_assign`, `player_unassign_slot` tabloya da yazacak şekilde düzeltilir |
| 5 | Kullanıcının kendini keyfî maça ekleyip çıkarmasını engelleyen kapılar sıkılaştırılır |
| 6 | JSON, tablodan türetilen görünüm haline getirilir |
| 7 | Kalıcı kontrol: iki kaynak uyuşuyor mu (`K-KADRO-1`) |

### P-2b · Durum sözlüğü ve hesap silme (M-P0-5)

`matches.status`'a CHECK · hesap silme kapısı gerçek sözlüğü kullanacak ·
tüm kod tabanında hayalet kelime taraması.

### P-2c · Kilit sırası (M-P0-1)

Tüm para fonksiyonlarında tek kilit sırası: `matches → pitch_bookings → payment_intents`.
Cron döngülerine `SKIP LOCKED`. Zehirli maç için 3 deneme + `NEEDS_REVIEW` (K-10.5).

### P-2d · Sunucu tarafı para kapıları (CTO P0'ları)

| Bulgu | Ne yapılacak |
|---|---|
| CTO-P0-1 | `matches` tablosunda istemcinin yazamayacağı sütunlar korunacak (fiyat, komisyon, durum, slotlar) |
| CTO-P0-2 | İade oranı **sunucudaki gerçek saatten** hesaplanacak, istemciden gelen saatten değil |
| CTO-P0-3 | Kapora alt sınırı (%30) sunucuda zorlanacak |
| CTO-P0-4 | `match_block_deposit` yetki kapısı |
| CTO-P0-5 | Kullanıcı başkası adına bildirim yazamayacak |

**Risk:** 🔴🔴 **En yüksek.** Para akışının kalbi.
**Doğrulama:** Her alt adımdan sonra: maça katıl → öde → slot gelsin · maçtan ayrıl →
iade gelsin · iki cihazdan aynı slota bas → biri alsın · para değişmezleri yeşil kalsın.
**Geri alma:** Her alt adım ayrı migration; her biri için geri alma dosyası yazılır.

---

## P-3 · DEMO TEMİZLİĞİ (K-10.8 — iznin var)

Kadro sapmaları düzeltilir · sözlük dışı `CONFIRMED` durumu düzeltilir ·
tüm denetim sorgularına "demo hariç" filtresi eklenir.

**Risk:** 🟡 Düşük — yalnız demo satırları.
**Doğrulama:** Uygulamada demo maçlar hâlâ görünmeli ve normal davranmalı.
**Geri alma:** Demo veriler yeniden üretilebilir (`scripts/owner-demo.mjs`).

---

## P-4 · MEKANİZMA KASLARI

17 SQL kontrol dosyası · 5 tarayıcı komutu · günlük denetim işi ·
admin panelinde **"Sistem Sağlığı" ekranı** (K-11.4) · kırmızıda e-posta ·
KRİTİK taşlarda durdurma (K-11.1).

> **Neden P-2'den sonra ama P-5'ten önce:** kontroller ancak düzeltilmiş bir sistemde
> anlamlı bir "yeşil" gösterebilir. Ondan sonraki her paketi **mekanizma denetleyecek.**

**Risk:** 🟢 Çok düşük — hiçbir mevcut davranışı değiştirmez, yalnız okur ve raporlar.
**Doğrulama:** Admin panel → Sistem Sağlığı → 15 taşın durumu görünmeli.

---

## P-5 · ÖLÇEK — lansman öncesi zorunlu üçlü

`get_my_matches()` kapsamlı fonksiyon yazılır → `fbGetMatches` kaldırılır (M-P0-6) ·
filtresiz canlı abonelik kaldırılır/filtrelenir (M-P0-7) ·
fotoğraflar Pro plan olmadan çalışacak hale getirilir (K-10.2).

**Risk:** 🟠 "Maçlarım" ekranı bu değişiklikten etkilenir — **Çakışma 1'in tam yeri.**
Sıra kesin: **önce** kapsamlı fonksiyon, **sonra** eski sorgunun kaldırılması.
**Doğrulama:** Çok maçlı bir hesapla "Maçlarım" ekranında hiçbir maç kaybolmamalı.

---

## P-6 · BÖLGE GÖÇÜ (P-1 bitmeden başlamaz)

Ayar envanteri → şema → veri → zamanlanmış işler → **en son** uygulama adresi.
Eski bölge, yeni bölge doğrulanana kadar **silinmez.**

---

## P-7 · HIZLI KAZANIMLAR

Grafik kütüphanesi ilk yükten çıkar *(15 dk)* · ölü `pitch_slot_holds` kaldırılır *(2 sa)* ·
ana sayfa sayacı hafifletilir *(4 sa)* · coğrafi sorgu indekse uyumlu hale gelir *(4 sa)* ·
fotoğraf sıkıştırma kaçışı kapatılır *(2 sa)* · `VirtualList` bağlanır *(4 sa)*.

---

## 2. HER PAKETTE UYGULANACAK DEĞİŞMEZ KURALLAR

1. `npm run etki` çalıştırılır, çıktısı sana sade dille aktarılır
2. KRİTİK taş varsa **durulur ve onayın alınır** (K-11.1)
3. Veritabanı değişikliği **yalnız yeni migration dosyası** olarak yazılır — eski dosyalara asla dokunulmaz
4. Canlıya uygulamadan önce **ayrıca onayın alınır** (CLAUDE.md kuralı)
5. `npm run lint` + `npm run test:unit` yeşil olmadan "bitti" denmez
6. Doğrulama **uygulamada tıklayarak** anlatılır, terminal komutuyla değil
7. Geri alma yolu **önceden** yazılır

---

## 3. ŞU AN SENDEN GEREKEN ÜÇ ONAY

| # | Ne | Neden gerekli |
|---|---|---|
| **1** | Deneme ortamı seçimi: **A** (staging uyandır) / **B** (ücretli dal) / **C** (doğrudan canlı) | Para migration'larını nerede deneyeceğimizi belirler |
| **2** | `WEBHOOK_SECRET` ve `app.settings.webhook_secret` değerlerinin **senin tarafından** girilmesi | Ben gizli anahtar yazamam; P-0 buna bağlı |
| **3** | Canlıya migration uygulama izni — **paket paket mi, toplu mu?** | CLAUDE.md her canlı yazma için onay istiyor. "Her pakette ayrı sor" dersen her seferinde soracağım; "P-0'dan P-7'ye kadar onaylıyorum" dersen paket bitimlerinde bilgilendirip devam ederim |

---

*Oluşturulma: 3 Ağustos 2026 · Mimar turu sonrası, kurucu plan değişikliğiyle*
