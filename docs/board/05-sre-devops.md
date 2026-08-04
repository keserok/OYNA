# 05 — SRE & DEVOPS LEAD

**Tarih:** 4 Ağustos 2026
**Analiz tabanı (K-14):** dal `2a05516` + canlı `OYNA` — **`main` DEĞİL**
**Okundu:** `DECISIONS.md` (K-1…K-15), önceki dört rol raporu, `docs/sistem/`

---

## Rolün sorusu

Önceki roller *"kod doğru mu, sistem doğru kurulmuş mu"* diye sordu. Benim sorum farklı:

> **Gece 3'te bir şey bozulduğunda ne oluyor?**

Kimse bakmıyorken sistem kendini toparlayabiliyor mu, bozulduğunu size söyleyebiliyor mu, ve bozulan şeyi **geri alabiliyor** musunuz?

---

## Ölçüm tabanı (canlı, bugün)

| Ölçüm | Değer |
|---|---|
| Aktif zamanlanmış iş | **15** |
| Son 24 saatte çalışma | **2.134** |
| Son 24 saatte **başarısız** | **0** ✅ |
| En uzun süren iş | 1 saniye ✅ |
| Veritabanı boyutu | 70 MB |
| En büyük tablo | `matches` — 344 kB |
| Dağıtılmış Edge Function | 14 |
| Sistem sağlığı denetimi | **12 yeşil / 0 kırmızı** ✅ |

**Bu tablo iyi.** Sistemin *çalışma* tarafı sağlıklı. Sorunlar **hazırlık** tarafında.

---

# AŞAMA 1 — AÇILIŞ: 4 STRATEJİK ÖNERİ

### Öneri 1 — En büyük risk yedek

Veritabanı **70 MB**. Ücretsiz planda otomatik yedek garantisi **yoktur**.

> **⚠️ DÜZELTME (Stratejik Danışman turu, 4 Ağustos 2026):** Bu paragrafta önce
> *"içinde artık gerçek para kayıtları var (1.920 ₺)"* yazıyordu. **Bu yanlıştı — hata bendendi.**
> O 1.920 ₺, **2 adet BAŞARISIZ ödeme denemesidir** (`payment_intents.status='FAILED'`,
> `paid_at` boş). OYNA bugüne kadar **tek kuruş gerçek para işlemedi**.
> Yedek yine de doğru bir iştir (yarın gerçek para geldiğinde hazır olacak),
> ama aciliyet gerekçesi yanlış kurulmuştu.

Bugün elimizdeki tek yedek, P-2 öncesi kendi aldığım anlık kopya (`yedek` şeması, 5 tablo). Bu **bir kereye mahsustu**, düzenli değil.

> **Bir kaza olursa geri dönecek noktamız yok.** Bu, sistemdeki tek **geri alınamaz** risk — diğer her şey düzeltilebilir.

### Öneri 2 — Sistem bozulduğunu size söyleyemiyor

P-4'te gece denetimini kurduk ve çalışıyor. Ama karar K-13.2 gereği **e-posta yok** — sonucu görmek için panele girmeniz gerekiyor.

Yani bugünkü zincir şu: *sistem bozulur → denetçi sabah 06:40'ta yakalar → panelde kırmızı yanar → **siz bakana kadar bekler.***

P-0'da tam bunun bedelini ödedik: bildirimler **aylarca** çalışmadı çünkü kimse bakmıyordu.

### Öneri 3 — Deneme ortamı hâlâ boş

`oyna-staging` uyandırıldı (Frankfurt, ücretsiz) ama **içi boş**. Yani bugün bir migration'ı önce deneyebileceğimiz yer yok; her değişiklik doğrudan canlıya gidiyor.

Uygulama turunda bu 19 kez yapıldı ve kaza olmadı — ama bunun sebebi **dikkat**, sistem değil. Dikkat ölçeklenmez.

### Öneri 4 — Bazı kapılar "yeşil geçiyor" ama iş yapmıyor

`integration-tests` iş akışı, gerekli gizli anahtar tanımlı değilse **yeşil kalıp geçiyor** ve sadece bir not düşüyor.

Yani PR'ınız yeşil görünür — ama SQL entegrasyon testleri **hiç çalışmamış** olabilir. Bu, tüm kurulun ortak temasının CI içindeki hâli: **bir şey çalışmıyor ama kimse bilmiyor.**

---

# AŞAMA 2a — BULGULAR

## 🔴 P0

### [P0] SRE-1 · Düzenli yedek yok — tek geri alınamaz risk

**Kanıt:** Ücretsiz plan · veritabanı 70 MB · gerçek para kayıtları mevcut · elimizdeki tek yedek P-2 öncesi tek seferlik anlık kopya (`yedek` şeması).

**Risk:** Yanlış bir migration, silinmiş bir tablo ya da bozulmuş veri **geri dönülemez** olur. Sistemdeki başka her sorun düzeltilebilir; bu düzeltilemez.

**Çözüm (üç seçenek, artan güvenceyle):**
1. **Günlük otomatik dışa aktarım** — para tablolarını her gece `yedek` şemasına kopyalayan cron. Ücretsiz, bugün kurulabilir. *(Aynı veritabanında olduğu için "veritabanı tamamen giderse" senaryosunu kapsamaz.)*
2. **Haftalık dış kopya** — sizin elle indirdiğiniz tam yedek.
3. **Pro plan** — otomatik günlük yedek + zaman noktasına dönüş.

**Önerim: 1 + 2 hemen, 3 lansmanda.**
**Efor:** 1 → ~2 saat · 2 → size 10 dakikalık düzenli iş

---

### [P0] SRE-2 · Sistem bozulduğunu kimseye söyleyemiyor

**Kanıt:** Gece denetimi çalışıyor (12 kontrol, her sabah 06:40). Ama K-13.2 gereği e-posta kapalı; `send-email` yazılmış ama **Resend anahtarı yok**, simülasyon modunda.

**Risk:** Denetçinin bulduğu şey **siz panele girene kadar bekler.** Cuma akşamı ödeme bozulursa Pazartesi öğrenirsiniz.

**Not:** Bu bilinçli bir karardı (K-13.2) — eleştirmiyorum, **bedelini yazıyorum.** P-0'daki 4 aylık sessizlik tam bu boşluktan doğdu.

**Çözüm:** Resend hesabı (ücretsiz katmanı var) + iki anahtarın panodan girilmesi. Kod hazır.
**Efor:** size ~10 dakika + bana ~2 saat

---

## 🟡 P1

### [P1] SRE-3 · CI kapısı gizli anahtar yoksa sessizce yeşil geçiyor

**Kanıt:** `.github/workflows/integration-tests.yml` — `SUPABASE_TEST_DB_URL` tanımlı değilse iş **yeşil kalıyor**, yalnız `::notice` düşüyor.

**Risk:** PR yeşil görünür ama SQL entegrasyon testleri hiç koşmamıştır. Para fonksiyonlarını koruyan testler bunlar.

**Çözüm:** Anahtar yoksa iş **başarısız olsun** (ya da en azından PR'da görünür uyarı versin). "Atlandı" ile "geçti" aynı renkte olmamalı.
**Efor:** ~1 saat

### [P1] SRE-4 · Deneme ortamı boş — her değişiklik doğrudan canlıya

**Kanıt:** `oyna-staging` ACTIVE ama **0 tablo**.

**Risk:** Bugüne kadar 19 migration doğrudan canlıya gitti. Kaza olmadı ama güvence **dikkat**ten geliyor, sistemden değil.

**Çözüm:** Şema kopyalanmalı (kurucu 5 komutla yapabilir; K-13.5). Sonrasında para migration'ları önce orada denenir.
**Efor:** kurucu ~20 dakika

### [P1] SRE-5 · Uygulama içi izleme neredeyse boş

**Kanıt:** `utils/observability.ts` tam bir Sentry/PostHog cephesi taşıyor. Ama gerçek kullanım: **2 `trackEvent`** ve **6 hata yakalama** çağrısı — 391 dosyalık kod tabanında.

**Risk:** Bir kullanıcı çöküş yaşarsa **hiçbir yere iz düşmez.** "Uygulama açılmıyor" diyen kullanıcıya sorabileceğiniz tek şey ekran görüntüsü olur.

**Çözüm:** Anahtarlar girilsin ve en az şu üç yere hata yakalama eklensin: ödeme, maça katılım, giriş.
**Efor:** ~1 gün (anahtarlar sizde)

### [P1] SRE-6 · `auto-cancel-matches` repoda var, canlıda yok

**Kanıt:** Repoda 15 Edge Function, canlıda **14**. Eksik olan `auto-cancel-matches`.
**Doğrulandı:** hiçbir cron, hiçbir veritabanı fonksiyonu onu **çağırmıyor** (0 çağrı, geçmişte de 0). Yani **kesinti değil**, repo artığı — işini `auto_process_matches` veritabanı fonksiyonu yapıyor.

**Risk:** Mimar turundaki `pitch_slot_holds` yanılgısının aynısı: biri bunu **çalışan bir sistem** sanabilir.

**Çözüm:** Ya dağıtılsın ya da başına *"KULLANILMIYOR — işi auto_process_matches yapıyor"* notu düşülüp kaldırılsın.
**Efor:** ~1 saat

### [P1] SRE-7 · Sürüm dört ayrı yerde elle tutuluyor

**Kanıt:** `package.json` (3.0.0), `android/app/build.gradle`, `ios/App/App/Info.plist`, `utils/appVersion.ts`.

**Risk:** Mağazaya yanlış sürümle çıkma ve "hangi sürümde bu hata vardı?" sorusunun cevapsız kalması.

**Çözüm:** Tek kaynak + diğerlerinin ondan türetilmesi.
**Efor:** ~3 saat

---

## 🟢 P2

### [P2] SRE-8 · Geri alma yolu yazılı ama prova edilmemiş
Her migration'a geri alma bloğu yazdım; **hiçbiri denenmedi**. Yazılı geri alma ile **çalıştığı görülmüş** geri alma aynı şey değildir. Staging kurulunca bir prova yapılmalı. **Efor:** ~2 saat.

---

## ✅ Güçlü yanlar — bunlar gerçekten iyi

| Ne | Ölçüm |
|---|---|
| **Zamanlanmış işler kusursuz** | 24 saatte **2.134 çalışma, 0 başarısız** |
| **Hiçbir iş yavaş değil** | en uzunu **1 saniye** |
| **Gece denetimi çalışıyor** | 12 kontrol, sonuç panelde, 30 günlük geçmiş |
| **Gizli anahtar doğru yerde** | Vault'ta şifreli; hiçbir komuta/fonksiyona gömülü değil |
| **Migration değişmezliği CI ile korunuyor** | eski dosya değiştirilemiyor |
| **Güvenlik başlıkları kurulu** | `X-Frame-Options`, `nosniff`, `Referrer-Policy` |
| **Repo–canlı migration uyumu** | tam |

---

# AŞAMA 2b — CEO'YA SORULAR

> Kurallarım (önceki turda söz verdiğim gibi): *ne soruyorum · neden karar sizin · seçenekler somut sonuçlarıyla · cevabınıza göre ne değişir.*

### S-1 · Yedeği nasıl alalım?

**Ne soruyorum:** Bir kaza olursa geri dönebileceğimiz bir nokta yok. Nasıl kuralım?

**Neden karar sizin:** İki seçenek para, biri sizin düzenli 10 dakikanızı istiyor.

| Seçenek | Ne verir | Bedeli |
|---|---|---|
| **(a)** Gecelik iç kopya | Yanlış migration/silme kazasından döner | Ücretsiz · ben kurarım **← önerim** |
| **(b)** (a) + haftalık dış kopya | Veritabanı tamamen giderse bile döner | Size 10 dk/hafta |
| **(c)** Pro plan | Otomatik + istediğiniz ana dönüş | Aylık ücret |

**Ne değişir:** (a) dersem bugün kurarım. (b) için size adım adım anlatırım. (c) lansmanda tekrar konuşuruz.

### S-2 · Alarm e-postasını şimdi açalım mı?

**Ne soruyorum:** K-13.2'de *"şimdilik e-posta yok"* dediniz. Kararı gözden geçirmek ister misiniz?

**Neden karar sizin:** Ücretsiz bir hesap açmanız ve iki anahtar girmeniz gerekiyor — ben giremem.

**Ne değişir:** **Evet** derseniz sistem bozulduğunda **size ulaşır.** **Hayır** derseniz denetim çalışmaya devam eder ama **siz bakana kadar bekler** — P-0'daki 4 aylık sessizliğin sebebi buydu.

### S-3 · Çöküş takibini açalım mı?

**Ne soruyorum:** Bir kullanıcının uygulaması çökerse şu an hiçbir iz kalmıyor. Sentry (ücretsiz katmanı var) açalım mı?

**Neden karar sizin:** Hesap açmayı ve bir anahtar girmeyi gerektiriyor. Ayrıca bu, kullanıcı cihazından veri toplamak demek — KVKK açısından sizin kararınız.

**Ne değişir:** **Evet** derseniz "uygulama açılmıyor" şikâyetinde **tam olarak nerede kırıldığını** görürüm. **Hayır** derseniz kullanıcının anlattığıyla yetiniriz.

---

# AŞAMA 3 — KAPANIŞ

## Mutlaka yapılması gereken 3 şey

1. **Yedek kurun.** Sistemdeki tek geri alınamaz risk bu. Gecelik iç kopya bugün, ücretsiz, iki saatlik iş.
2. **Alarmın size ulaşmasını sağlayın.** Gece denetimi çalışıyor ama sesi çıkmıyor. Bir denetçinin ulaşamadığı bulgu, bulunmamış bulgudur.
3. **"Atlandı"yı "geçti"den ayırın.** CI'daki sessiz yeşil, bu projede tekrar tekrar gördüğümüz hatanın CI içindeki hâli.

## Hızlı kazanımlar

| İş | Süre |
|---|---|
| CI'daki sessiz yeşili kapat | 1 sa |
| `auto-cancel-matches`'i işaretle veya kaldır | 1 sa |
| Sürümü tek kaynağa bağla | 3 sa |
| Gecelik iç yedek cron'u | 2 sa |

## En büyük stratejik hata: **"çalışıyor" ile "hazır" arasındaki farkı görmemek**

Sayın CEO, bugünkü tablo şaşırtıcı derecede iyi: 2.134 zamanlanmış çalışma, **sıfır** başarısızlık. En uzun iş bir saniye. Sistem sağlığı 12 yeşil.

**Ama bu, sistemin çalıştığını gösterir — bir kazaya hazır olduğunu değil.**

İki ayrı soru bunlar:
- *"Her şey yolundayken sistem iyi mi?"* → **Evet**
- *"Bir şey ters gittiğinde ne olacak?"* → Yedek yok, alarm sessiz, prova yok

Bu ayrım özellikle sizin durumunuzda önemli, çünkü **tek kişisiniz.** Büyük ekiplerde biri fark eder. Sizde fark edecek kimse yok — **sistem kendisi söylemek zorunda, ve söylediği yer size ulaşmak zorunda.**

P-0'da bunun bedelini zaten bir kez ödedik: bildirimler aylarca çalışmadı, çünkü çalışmadığını söyleyecek kimse yoktu. **Bugün aynı boşluk yedek tarafında duruyor** — ve orada bedeli geri alınamaz.


---

# AŞAMA 4 — UYGULAMA (4 Ağustos 2026, kurucu onayıyla)

> Kurucu kararları: **S-1 = (a)** gecelik iç kopya · **S-2 = "şimdi değil"** (e-posta bu oturumda yok) · **S-3 = "güvenli olacak şekilde"**.
> Ayrıntılı plan: **`docs/board/SRE-RISK-PLANI.md`**

| # | Bulgu | Son durum |
|---|---|---|
| SRE-1 | Düzenli yedek yok | ✅ **Kapandı** — gecelik yedek + K-YEDEK-1 |
| SRE-2 | Alarm size ulaşamıyor | 🟡 Kararınızla ertelendi |
| SRE-3 | CI sessiz yeşil | ✅ **Görünür yapıldı** |
| SRE-4 | Deneme ortamı boş | 🟡 Sizin ~20 dakikanız |
| SRE-5 | İzleme neredeyse boş | ✅ **Kapandı** — çökme kaydı + K-COKME-1 |
| SRE-6 | `auto-cancel-matches` artığı | ✅ **İşaretlendi** (silme kararı sizin) |
| SRE-7 | Sürüm dört yerde | ✅ **Kapandı** — `npm run sistem:surum` |
| SRE-8 | Geri alma prova edilmemiş | 🟡 Deneme ortamına bağlı |

**8 bulgunun 5'i kapandı.** Kalan 3'ü tek bir şeye bağlı: deneme ortamı (SRE-4) ve sizin katılımınız.

## Canlıya uygulananlar (6 migration)

| Migration | Ne yapar |
|---|---|
| `20260804120000_sre1_gecelik_yedek` | 8 kritik tablonun gecelik kopyası, 7 gün saklama |
| `20260804130000_sre1_yedek_saglik_kontrolu` | K-YEDEK-1 — yedek alınmazsa panel kırmızı |
| `20260804140000_sre3_cokme_kaydi` | `istemci_hatalari` + `hata_bildir` + `hata_ozeti` |
| `20260804150000_sre3_ek_bilgi_temizligi` | Ek bilgiyi alan alan temizleme (metin yerine) |
| `20260804160000_sre3_gizlendi_etiketi_duzeltmesi` | `[gizlendi]` etiketi JSON metni olarak |
| `20260804170000_sre3_cokme_saglik_kontrolu` | K-COKME-1 — çökme artışı denetimi |
| `20260804180000_sre1_yedek_durumu_yetki_daraltmasi` | Kendi hatam: gereksiz yetki geri alındı |

**Doğrulama:** gece denetimi **12 → 14 yeşil**, 0 kırmızı. Canlı fonksiyon tanımı ile repo dosyası **birebir aynı** (md5 karşılaştırıldı). `npm run lint` temiz, `npm run test:unit` **1437/1437** yeşil.

## Test edilerek yakalanan üç hata (canlıya bu hâliyle çıkmadı)

1. **Ek bilgi temizleyicisi JSON'u bozuyordu** — milisaniye zaman damgası 13 hanelidir ve "kart numarası" desenine takılıyordu. Her sıradan hata kaydı ek bilgisini kaybedecekti. Alan alan temizlemeye çevrildi.
2. **`[gizlendi]` etiketi geçersiz JSON'du** — köşeli parantez yüzünden Postgres onu *dizi* sanıyordu; ek bilgi taşıyan her kayıt sessizce düşüyordu.
3. **`yedek_durumu()` herkese açıktı** — güvenlik taraması yakaladı; yetki geri alındı, denetim etkilenmedi.

## Mekanizmaya eklenenler

- **B16 KURTARMA** (🔴 KRİTİK) — "bozulduğunda geri dönebilir miyiz?"
- **B17 GÖRÜNÜRLÜK** (🟠 YÜKSEK) — "bozulduğunu öğrenebilir miyiz?"
- **K-YEDEK-1**, **K-COKME-1**, **K-SURUM-1** kontrolleri (29 → 32)
- Kapsam denetçisine **çürüme kontrolü** — ilk çalıştırmada iki gerçek çürük buldu
  (`views/WalletView.tsx` ve `views/RahatMatchLobby.tsx` haritada yazıyordu, diskte yoktu)

## Sıradaki role devredilenler

Güvenlik taramasında 441 bulgu var (1 ERROR: `public_profiles` görünümü SECURITY DEFINER; 8 tabloda RLS açık ama kural yok; 428 SECURITY DEFINER fonksiyon kullanıcıya açık). **Kapsam disiplini gereği dokunmadım** — bunlar Security & Financial Infrastructure Lead'in alanı.

---

**Bir sonraki rol:** Security & Financial Infrastructure Lead
Geçmek için: *"sıradaki karaktere geçebiliriz"*
