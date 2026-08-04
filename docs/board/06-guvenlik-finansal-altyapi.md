# 06 — SECURITY & FINANCIAL INFRASTRUCTURE LEAD

**Tarih:** 4 Ağustos 2026
**Analiz tabanı (K-14):** dal `d16659c` + canlı `OYNA` — **`main` DEĞİL**
**Okundu:** `DECISIONS.md` (K-1…K-16), önceki beş rol raporu, `docs/sistem/`

---

## Rolün sorusu

Önceki roller *"doğru mu çalışıyor"* ve *"bozulduğunda ne olur"* diye sordu. Benim sorum farklı:

> **Kötü niyetli biri bu sistemden para çalabilir mi, ya da başkasının bilgisine ulaşabilir mi?**

Bu soruyu **varsayarak** değil, **deneyerek** cevapladım. Aşağıdaki bulguların çoğu canlı veritabanında gerçek saldırı denemeleriyle sınandı — hepsi geri alındı, hiçbir kalıcı değişiklik yapılmadı.

---

## Ölçüm tabanı (canlı, bugün)

| Ölçüm | Değer |
|---|---|
| `public` şemasındaki tablo | 182 |
| **RLS (satır kuralı) kapalı tablo** | **0** ✅ |
| Kullanıcıya açık SECURITY DEFINER fonksiyon | 411 |
| Bunlardan **giriş yapmamışa** açık | 16 |
| Taranan fonksiyonda **gömülü gizli anahtar** | **0 / 854** ✅ |
| Para değişmezleri (8 kural) | **hepsi temiz** ✅ |
| Yönetici denetim kaydı | 117 kayıt (76'sı son 30 gün) |
| Güvenlik danışmanı bulgusu | 441 (1 ERROR) |

---

# AŞAMA 1 — AÇILIŞ: 5 STRATEJİK ÖNERİ

### Öneri 1 — Paranın *kapıları* iyi kurulmuş, *kapı listesi* eksik

Sistemde hassas sütunları koruyan gerçek bir tasarım var: hem yetki (GRANT), hem satır kuralı (RLS), hem de tetikleyici (trigger) katmanı. Canlıda denedim — `role`, `is_admin`, `wallet_balance` yazma girişimlerim **reddedildi**.

Ama korunacak sütunların **listesi elle tutuluyor** ve bir tanesi listede yok: `profiles.wallet`. Bunu canlıda 999999 yapabildim.

> Sorun tasarımda değil, **kapsamda**. Bu, bu projede defalarca gördüğümüz desenin güvenlik alanındaki hâli.

### Öneri 2 — Ödeme girişi beklediğimden iyi

Açıkça söyleyeyim: buraya kötü bir şey bulmayı bekleyerek girdim ve **bulamadım.** Ödeme geri dönüşü (webhook) gelen veriye güvenmiyor; iyzico'ya imzalı bir sorgu atıp ödemeyi **kaynağından** doğruluyor. Tutar da geri dönüşten değil, veritabanındaki kayıttan alınıyor. Aynı ödeme iki kez işlenemiyor.

Bu, bu ölçekte bir üründe sık görülmeyen bir olgunluk.

### Öneri 3 — Kapalı kapıların arkasında açık kilitler duruyor

Altı tabloda satır kuralı **açık ama hiç kural yazılmamış.** Postgres'te bu "her şeyi reddet" demektir — yani bugün güvenli. Denedim, `password_reset_codes` tablosundan 0 satır okundu.

Ama o tabloların yetki (GRANT) satırları hâlâ geniş: `authenticated` rolüne ekleme/güncelleme/silme verilmiş. Bugün RLS bunu tutuyor. **Biri tek bir izin verici kural eklerse o yetkiler aynı anda canlanır.**

Bu, kilitli bir kapının arkasında anahtarı takılı bırakmak gibidir.

### Öneri 4 — Gerçek ad her üyeye açık

`public_profiles` görünümü `full_name` (gerçek ad soyad) alanını giriş yapmış **her** kullanıcıya gösteriyor. E-posta, telefon, cüzdan gösterilmiyor — bu iyi. Ama gerçek ad bir KVKK kararıdır ve bu karar bugün **kod tarafından**, sizin tarafınızdan değil verilmiş durumda.

### Öneri 5 — 441 danışman bulgusunun 428'i aynı şey ve çoğu yanlış alarm

Supabase güvenlik taraması "SECURITY DEFINER fonksiyon kullanıcıya açık" diye 428 uyarı veriyor. Bu, uygulamanın **çalışma biçimi** — hepsini kapatmak uygulamayı durdurur.

Ben asıl soruyu sordum: *hangisinin içinde yetki kontrolü yok?* Otomatik tarama 100 aday verdi; tek tek okuyunca çoğunun sarmalayıcı (wrapper) olduğu ve kontrolün bir alt fonksiyonda durduğu ortaya çıktı. **Gerçekten korumasız olan sayısı bir avuç.**

> Bunu özellikle yazıyorum: bir güvenlik raporunun "441 bulgu" diye başlaması sizi korkutur ve hiçbir şey öğretmez. Önemli olan hangisinin gerçek olduğudur.

---

# AŞAMA 2a — BULGULAR

## 🔴 P0

### [P0] SEC-1 · `profiles.wallet` sütununu kullanıcı kendisi değiştirebiliyor

**Kanıt (canlıda denendi, geri alındı):** Demo bir kullanıcının kimliğiyle `authenticated` rolüne girip:

```
UPDATE public.profiles SET wallet = wallet + 999999 WHERE id = <kendi id>;
→ etkilenen satır = 1 · wallet: 0.0 → 999999.0
```

İşlem `RAISE` ile tamamen geri alındı; kalıcı değişiklik **yok** (doğrulandı: `wallet` yine `0.0`).

**Neden oluyor:** `profiles` tablosunda hassas sütunları koruyan iki tetikleyici var —
`protect_profile_columns` (`role`, `roles`, `is_banned`, `ban_expires_at`, `is_verified`) ve
`protect_profile_sensitive_fields` (`is_admin`, `phone_verified`, `role`, `roles`, **`wallet_balance`**, `is_banned`, `ban_expires_at`).

İkisi de **`wallet`** sütununu saymıyor. Yetki tarafında da açık: `has_column_privilege('authenticated', 'profiles.wallet', 'UPDATE')` = **true**.

**Bugün para çalınabilir mi? HAYIR — ve bunu açıkça yazmam gerekiyor:**

| Kontrol | Sonuç |
|---|---|
| `wallet` sütununun tüm profillerdeki değeri | **33 profilin 33'ünde 0** |
| Uygulamada `profiles.wallet` okuyan kod | **yok** (arama yapıldı) |
| Veritabanında okuyan fonksiyon | **yok** |
| Gerçek bakiye hangisi? | **`wallet_balance`** (bu kullanıcıda 4.350 ₺) |
| Harcama neyi kontrol ediyor? | Defteri (`wallet_transactions`), sütunu değil |

Yani `wallet` **ölü bir sütun.** Bugün yazılması hiçbir şey kazandırmaz.

**O hâlde neden P0?** Üç sebeple:
1. Koruma tasarımı bu sütun sınıfının korunması gerektiğine **zaten karar vermiş** (`wallet_balance` iki katmanla korunuyor). `wallet` aynı sınıftan ve gözden kaçmış — bu bir **kapsam hatası**, tasarım hatası değil.
2. Sütunun adı `wallet`. İleride biri (bir geliştirici, bir yapay zekâ oturumu, ya da panelde bir rapor) "cüzdan" diye bu sütunu okursa, **kullanıcının yazdığı sayıyı bakiye sanacak.**
3. Düzeltmesi tek satır.

**Çözüm:** Yetkiyi geri al + tetikleyici korumasına ekle. (Sütunun tamamen silinmesi ayrı bir karar — **S-1**.)
**Efor:** ~30 dakika

---

## 🟠 P1

### [P1] SEC-2 · Kuralsız tabloların arkasında geniş yetkiler duruyor

**Kanıt:** Altı tabloda RLS açık ama **hiç kural yok** — ve `authenticated` rolüne SELECT/INSERT/UPDATE/DELETE verilmiş:

`password_reset_codes` (1 satır) · `guardian_lookup_attempts` (1) · `profile_contact_hash` (0) · `social_rate_usage` (0) · `studio_events` (129) · `_saat_dilimi_duzeltme_yedek` (6)

**Bugün güvenli — bunu da kanıtladım:** `anon` rolüne girip altısını da okumaya çalıştım, hepsinden **0 satır** döndü. Postgres'te "RLS açık + kural yok" = her şeyi reddet.

**Risk:** Güvenliği **kuralın yokluğu** sağlıyor, yetkinin doğruluğu değil. Biri bu tablolardan birine tek bir izin verici kural eklerse (ör. "kullanıcı kendi satırını görsün"), arkadaki geniş yetkiler **aynı anda** devreye girer. `password_reset_codes` bir parola sıfırlama tablosudur; oradaki bir kaza doğrudan hesap ele geçirmedir.

**Çözüm:** Yetkileri tabloların gerçek ihtiyacına indir (çoğunda `authenticated` hiçbir şeye ihtiyaç duymuyor — RPC üzerinden çalışıyorlar).
**Efor:** ~2 saat

### [P1] SEC-3 · `public_profiles` görünümünde tek koruma bir satır

**Kanıt:** `public_profiles` görünümü SECURITY DEFINER — yani altındaki `profiles` tablosunun satır kuralları **devre dışı kalıyor**. Tek koruma görünümün kendi `WHERE` satırı:

```
WHERE is_searchable = true OR id = auth.uid() OR is_admin()
```

Supabase güvenlik taramasındaki **tek ERROR** seviyeli bulgu budur.

**İyi tarafı:** Görünüm e-posta, telefon, cüzdan, doğum tarihi **göstermiyor**. `anon` da okuyamıyor (doğrulandı).

**Riskli tarafı:** `full_name` (gerçek ad soyad) giriş yapmış **her** kullanıcıya açık. Ayrıca RLS bir güvenlik ağı olarak arkada durmadığı için, görünüm ileride düzenlenirken `WHERE` satırı bozulursa **hiçbir şey yakalamaz.**

**Çözüm:** Görünümü `security_invoker` yap (RLS arkada devreye girer) + `full_name` kararı (**S-2**).
**Efor:** ~2 saat · ⚠️ RLS devreye girince bazı ekranlar boşalabilir; deneme ortamı gerekir (SRE-4)

### [P1] SEC-4 · `pay_public_match_deposit` tutarı istemciden alıyor

**Kanıt:** `pay_public_match_deposit(p_match_id, p_user_id, p_amount)` — `authenticated` çağırabiliyor, içinde **hiç yetki kontrolü yok**.

**İki katman bunu kurtarıyor:**
- Çağırdığı `process_match_payment` içinde şu var: *"Başka bir kullanıcının cüzdanından ödeme yapamazsınız"* + `p_amount <= 0` reddi. Yani **başkasının parası harcanamaz**.
- Uygulama bu fonksiyonu **hiç çağırmıyor** (kodda arandı, çağıran yok).

**Kalan gerçek risk:** Tutar hâlâ istemcinin belirlediği bir sayı. Bir kullanıcı kendi cüzdanından **1 kuruş** ödeyip maç kadrosunda "ÖDENDİ" rozeti alabilir. Rozet yalnızca görsel (`shared/MatchPitch.tsx:49`) — slot kapmıyor, para taşımıyor. Yani **dolandırıcılık değil, görsel sahtecilik.**

**Çözüm:** Kullanılmayan bu eski yolu kaldır ya da tutarı sunucudan hesapla.
**Efor:** ~1 saat

### [P1] SEC-5 · 16 fonksiyon giriş yapmamışlara açık

**Kanıt:** `admin_pitch_agreements`, `admin_set_pitch_agreement`, `admin_set_pitch_cancel_policy` dâhil 16 fonksiyonda `anon` rolüne EXECUTE verilmiş.

**Denedim — hepsi korumalı:** `anon` rolünde çağırdığımda ikisi de `UNAUTHORIZED` verdi; ilk satırlarında `is_platform_admin()` kontrolü var.

**Risk:** Sömürülebilir değil, ama **gereksiz yüzey**. Bir gün o ilk satır silinirse arada hiçbir katman kalmaz. Ayrıca `admin_` adlı bir fonksiyonun anonim çağrıya açık olması, sonraki incelemeleri yanıltır.

**Çözüm:** `anon` yetkisini geri al (uygulama etkilenmez — bu fonksiyonları zaten yalnız yönetici çağırıyor).
**Efor:** ~1 saat

---

## 🟢 P2

### [P2] SEC-6 · Sızmış parola koruması kapalı
Supabase Auth, parolanın daha önce sızmış parolalar listesinde olup olmadığını kontrol edebiliyor; bu özellik **kapalı**. Panelden tek düğmeyle açılır (**S-3**). **Efor:** 5 dakika (sizde)

### [P2] SEC-7 · Geçici tablo hâlâ duruyor
`_saat_dilimi_duzeltme_yedek` — saat dilimi düzeltmesinden kalma 6 satırlık geçici tablo. İşlevi bitmiş. **Efor:** 15 dakika

### [P2] SEC-8 · Uzantılar `public` şemasında
`cube`, `earthdistance`, `btree_gist` `public` şemasında kurulu. Supabase bunları ayrı şemaya taşımayı öneriyor. **Taşımak coğrafi arama indeksini bozabilir** (P-7'de kurulmuştu) — deneme ortamı olmadan yapılmamalı. **Efor:** ~2 saat, SRE-4'e bağlı

---

## ✅ Güçlü yanlar — bunlar gerçekten iyi

| Ne | Kanıt |
|---|---|
| **Hiçbir fonksiyonda gömülü gizli anahtar yok** | 854 fonksiyon tarandı, **0** bulgu |
| **Ödeme geri dönüşü kaynağından doğrulanıyor** | `payment-webhook/index.ts:28-62` — iyzico'ya imzalı sorgu; gelen veriye güvenilmiyor |
| **Tutar geri dönüşten alınmıyor** | `apply_booking_payment` veritabanındaki niyetin tutarını kullanıyor |
| **Aynı ödeme iki kez işlenemiyor** | `apply_booking_payment`: `FOR UPDATE` + `IF status='PAID' THEN RETURN idempotent` |
| **İade tutarı defterle birebir doğrulanıyor** | `process_match_refund`: ödenmemişse red, ikinci iade red, `p_amount <> v_paid` red |
| **Yetki yükseltme imkânsız** | canlıda denendi: `role='admin'` → **RED**, `wallet_balance=999999` → **RED** |
| **Kendini doğrulama/ban kaldırma imkânsız** | canlıda denendi: `is_banned` → **RED**, `is_verified` → sessizce eski değere döndü |
| **Her tabloda satır kuralı açık** | RLS kapalı tablo sayısı: **0** |
| **Para değişmezleri temiz** | 8 kuralın 8'i: uyumsuzluk 0 |
| **Depoda sızmış anahtar yok** | `.gitignore` `.env`'i kapsıyor; koddaki tek JWT **anon (yayınlanabilir) anahtar** — tasarım gereği herkese açık |
| **Yönetici işlemleri kayda geçiyor** | 117 denetim kaydı, 76'sı son 30 günde |

---

# AŞAMA 2b — CEO'YA SORULAR

### S-1 · Ölü `wallet` sütununu ne yapalım?

**Ne soruyorum:** Kullanıcının yazabildiği, hiçbir yerde okunmayan, adı "cüzdan" olan bir sütun var. Kapatmanın iki yolu var.

**Neden karar sizin:** Biri geri dönüşü kolay, diğeri kalıcı.

| Seçenek | Ne verir | Riski |
|---|---|---|
| **(a)** Yetkiyi geri al + korumaya ekle | Yazılamaz olur, sütun kalır | Yok · geri alınabilir **← önerim** |
| **(b)** (a) + sütunu tamamen sil | Kafa karışıklığı da biter | Beklenmedik bir yerde okunuyorsa kırar |

**Ne değişir:** (a) dersem bugün kapatırım. (b) dersem önce her kullanımı tarar, sonra silerim — ama bunu deneme ortamı olmadan yapmayı önermiyorum (SRE-4).

### S-2 · Gerçek ad soyad diğer üyelere görünsün mü?

**Ne soruyorum:** Bugün giriş yapmış her kullanıcı, diğer herkesin **gerçek ad soyadını** görebiliyor (`full_name`). Görünen ad (`name`) ayrı bir alan.

**Neden karar sizin:** Bu bir ürün ve KVKK kararı, teknik karar değil. Halı sahada güven için gerçek ad faydalı olabilir; ama kişisel veridir ve bugün bu kararı kod vermiş durumda.

| Seçenek | Sonuç |
|---|---|
| **(a)** Gerçek ad görünmeye devam etsin | Değişiklik yok · KVKK metninde belirtilmeli |
| **(b)** Yalnız görünen ad görünsün | `full_name` görünümden çıkar · maç kadrosunda takma ad görünür |
| **(c)** Yalnız aynı maçtakiler görsün | En dengeli · en fazla iş |

**Ne değişir:** Cevabınıza göre `public_profiles` görünümünü düzenlerim. Bu görünüm çok yerde kullanılıyor; (c) deneme ortamı ister.

### S-3 · Sızmış parola koruması açılsın mı?

**Ne soruyorum:** Supabase, kullanıcının seçtiği parolanın daha önce başka sitelerden sızmış parolalar arasında olup olmadığını kontrol edebiliyor. Kapalı.

**Neden karar sizin:** Açarsanız bazı kullanıcılar kayıt sırasında "bu parola kullanılamaz" uyarısı alır — kayıt akışında küçük bir sürtünme.

**Ne değişir:** **Evet** derseniz size panelden nereye tıklayacağınızı yazarım (5 dakika). **Hayır** derseniz sızmış parolayla kayıt mümkün kalır.

### S-4 · Güvenlik düzeltmelerini ne zaman yapayım?

**Ne soruyorum:** P0'ı (SEC-1) hemen kapatabilirim — küçük ve risksiz. Ama P1'lerin ikisi (SEC-3 görünüm, SEC-8 uzantılar) **ekranları boşaltabilecek** türden.

| Seçenek | Sonuç |
|---|---|
| **(a)** Yalnız SEC-1'i şimdi, gerisi deneme ortamından sonra | En güvenli **← önerim** |
| **(b)** SEC-1 + SEC-2 + SEC-4 + SEC-5 şimdi; SEC-3/SEC-8 sonra | Yüzeyin çoğu bugün kapanır |
| **(c)** Hepsi şimdi | Ekran kırılma riski gerçek |

**Ne değişir:** (a) veya (b) seçerseniz bugün uygularım. (c)'yi tavsiye etmiyorum — SRE turunda tam da bunun için deneme ortamı istedim.

---

# AŞAMA 3 — KAPANIŞ

## Mutlaka yapılması gereken 3 şey

1. **`profiles.wallet` yazma yetkisini kapatın.** Bugün zararsız, yarın adı yüzünden tehlikeli. Tek satırlık iş.
2. **Kuralsız tabloların yetkilerini daraltın.** Bugün sizi RLS koruyor; korumanın *kazara* olması, korunmamak kadar kırılgandır.
3. **Gerçek ad kararını siz verin.** Bugün o kararı kod veriyor.

## Hızlı kazanımlar

| İş | Süre |
|---|---|
| `wallet` yazma yetkisini kapat (SEC-1) | 30 dk |
| `anon` EXECUTE yetkilerini geri al (SEC-5) | 1 sa |
| Kullanılmayan `pay_public_match_deposit`'i kaldır (SEC-4) | 1 sa |
| Geçici tabloyu sil (SEC-7) | 15 dk |
| Sızmış parola korumasını aç (SEC-6) | 5 dk (sizde) |

## En büyük stratejik gözlem: **savunma iyi kurulmuş, listesi elle tutuluyor**

Sayın CEO, bu turda beni en çok şaşırtan şey kötü haber değil, **iyi haber** oldu.

Ödeme tarafına kötü bir şey bulmayı bekleyerek girdim. Bulmadım: geri dönüş kaynağından doğrulanıyor, tutar istemciden alınmıyor, aynı ödeme iki kez işlenmiyor, iade defterle birebir eşleşmek zorunda. Yetki yükseltmeyi denedim — reddedildim. Kendimi doğrulamayı, banımı kaldırmayı, gerçek bakiyeyi değiştirmeyi denedim — üçünde de reddedildim. 854 fonksiyonda tek bir gömülü anahtar yok.

**Bulduğum tek P0 ise bir tasarım hatası değil, bir liste hatası.** Sistem "şu sütunlar korunmalı" diye doğru bir karar vermiş ve o listeyi elle yazmış. Listede bir satır eksik kalmış.

Bu, kurulun beş turdur gördüğü aynı desen:

> Sistem doğru kurulmuş. Ama doğru kurulduğunu **sürekli kontrol eden** bir şey yok, o yüzden zamanla listeler gerçekle ayrışıyor.

SRE turunda bunun cevabını koyduk (K-16.4: *"her koruma kurulduğunda, o korumanın kendisi de denetlenir"*). Güvenlik alanında da aynısı gerekiyor: korunacak sütun listesi bir insanın hafızasında değil, **her gece çalışan bir kontrolde** durmalı. Kapanış işlerimde bunu öneriyorum — kararınızı aldıktan sonra `K-KAPI` ailesine bir kontrol daha eklerim ve bu sınıf hata bir daha sessiz kalamaz.

Son olarak dürüst bir uyarı: bu tur **kod ve veritabanı** güvenliğini inceledi. İncelemediğim iki alan var ve bunları bilerek kapsam dışı bıraktım — sızma testi (gerçek saldırı simülasyonu) ve iyzico hesabınızın kendi güvenlik ayarları. İkisi de lansman öncesi ayrı birer iştir.

---

**Bir sonraki rol:** Strategic Advisor
Geçmek için: *"sıradaki karaktere geçebiliriz"*
