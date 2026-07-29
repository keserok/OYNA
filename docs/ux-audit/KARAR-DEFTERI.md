# OYNA — KARAR DEFTERİ

> Bu dal (`claude/oyna-ux-audit-solution-q06aq8`) boyunca **senin verdiğin tüm kararlar**.
> Her karar için: *ne sordum → sen ne dedin (birebir) → ne anlama geliyor → hangi sonucu istedin → bugün ne durumda*.
>
> **Bu belgenin amacı:** context'i biten oturumların yerine geçen yeni oturumlar, senin kararlarını
> yeniden sormadan, tahmin etmeden, değiştirmeden uygulayabilsin.
>
> Kararların birebir metni oturum kaydından çıkarıldı — uydurma yok, yorum eklenen yerler
> *"(yorum)"* diye işaretli.

**Belge tarihi:** 2026-07-28
**Dal:** `claude/oyna-ux-audit-solution-q06aq8` · HEAD `0e5c1b6` · 26 commit
**Kaynak belge:** `docs/ux-audit/OYNA-COZUM-PLANI.md` (25.000+ satır, 136 doğrulanmış bulgu, 23 iş paketi)

---

## İçindekiler

| Bölüm | Konu | Karar sayısı |
|---|---|---|
| [0](#bölüm-0--değişmez-kurallar) | Değişmez kurallar (kırmızı çizgiler) | 5 |
| [1](#bölüm-1--skor-sistemi) | Skor sistemi | 4 |
| [2](#bölüm-2--slot-süre-ve-tarife-sistemi) | Slot, süre ve tarife sistemi | 17 |
| [3](#bölüm-3--para-cüzdan-ve-çekim) | Para, cüzdan ve çekim | 5 |
| [4](#bölüm-4--tesis-sahibi-tarafı) | Tesis sahibi tarafı | 3 |
| [5](#bölüm-5--lansman-kapsamı) | Lansman kapsamı | 5 |
| [6](#bölüm-6--tasarım-sistemi) | Tasarım sistemi | 4 |
| [7](#bölüm-7--dokunma-hedefi-ve-erişilebilirlik-ip-10) | Dokunma hedefi ve erişilebilirlik (IP-10) | 6 |
| [8](#bölüm-8--teknik-hijyen) | Teknik hijyen (migration) | 2 |
| [9](#bölüm-9--dal-birleştirme-stratejisi) | Dal birleştirme stratejisi | 3 |
| [10](#bölüm-10--son-hedef-tanımı) | Son hedef tanımı | 1 |
| [11](#bölüm-11--karar--sonuç-izleme-tablosu) | Karar → sonuç izleme tablosu | — |
| [12](#bölüm-12--açıkta-kalan-tek-soru) | Açıkta kalan tek soru | 1 |

---

# Bölüm 0 — Değişmez kurallar

Bunlar tek bir soruya verilmiş cevaplar değil; oturum boyunca **tekrar tekrar** vurguladığın
ve her işin üstünde duran kurallar.

### K-0.1 — Eski/silinmiş özellikler geri gelmeyecek

> **Senin sözün (birebir):**
> *"Ayrıca kaptan artık skor giremiyor olmalı bu planı güncel main ile uyumlu hale getirmen şart.
> **Eski özellikleri geri getirmeni istemem.**"*

**Ne anlama geliyor:** Bu dal main'den 24 commit geride başladı. O pencerede main bazı
özellikleri **sildi** (kaptan skor paneli, LIVE panel, `hooks/useMatchCreate.ts`). Bu dalın
içindeki eski dosya hâlleri main'e geri girerse, silinmiş özellik **dirilir**.

**İstediğin sonuç:** Main'in sildiği hiçbir şey bu dal üzerinden geri dönmeyecek.

**Uygulama kuralı:** Çakışan her dosyada main'in sildiği bloklar silinmiş kalır. Birleştirme
sonrası şu kontrol **zorunlu**: kaptan skor paneli ve LIVE panel geri gelmemiş olmalı.

---

### K-0.2 — Main'deki tüm işler sağlam kalacak

> **Senin sözün (birebir):**
> *"Senden isteğim **main deki tüm işleri sağlam tutarak** burada yapılan değişiklikleri main e
> entegre etmen. Tam ve eksiksiz şekilde tamamla."*

**Ne anlama geliyor:** Bu dalın işleri main'in üstüne **eklenecek**, main'in işlerinin
**yerine geçmeyecek**. Özellikle: main'in 10 migration dosyasına yazdığı gerçek SQL
(450 / 637 / 993 satır) bu dalın 6 satırlık boş not dosyalarıyla ezilmeyecek.

**İstediğin sonuç:** Birleştirme sonrası main'in hiçbir işi kaybolmamış olacak.

---

### K-0.3 — Tek veri, tek sistem, tutarsız arayüz yok

> **Senin sözün (birebir):**
> *"her şeyin veritabanında uyumlu ve birbirleriyle bağlantılı olmasını sağla. (…)
> **Gerekli her veri veritabanında tek sistemde tek olmalı yanlış saçma alakasız hiçbir ui
> görüntüsü istemiyorum. Her şey tam bağlantıda süper hızda ve güvende çalışmalı.**"*

**Ne anlama geliyor:** Aynı bilginin iki ayrı yerde tutulması yasak. Bir yerden değiştirilen
ayar, onu gösteren **her** ekrana yansımalı: saha sahibi paneli, admin paneli, kullanıcı
uygulaması, takvim, doluluk özeti, maç kurma akışı.

**İstediğin sonuç:** Bir kişi tarifeyi değiştirdiğinde, o değişiklik hiçbir ekranda eski hâliyle
kalmıyor. Ekranlar veriden türüyor, veriyi kopyalamıyor.

**Bu kural nasıl uygulandı (yorum):** `shared/slotGrid.ts` tek kaynak (SSOT) olarak yazıldı;
sunucu tarafında aynı mantığın SQL ikizi var. Çalışma saatleri artık ayrı bir alan değil,
**tarifeden türetiliyor** (`20260728163234_calisma_saati_tarifeden_turetilir`).

---

### K-0.4 — Sistem tüm ülkeye yayılmaya hazır olmalı

> **Senin sözün (birebir):** *"11.a **(sistem tüm ülkeye yayılmaya hazır olmalı)**"*

**Ne anlama geliyor:** Lansman tek şehirle (Ordu) başlasa da, mimari çok şehirli çalışmayı
varsaymalı: bölge/şehir kavramı, tesis arama, konum filtresi.

**İstediğin sonuç:** İkinci şehir eklenirken şema veya arama mantığı yeniden yazılmayacak.

---

### K-0.5 — Mükemmel kurulum, yarım iş yok

> **Senin sözün (birebir):**
> *"bu kısmın ayarının **mükemmel** olmasını sağla veritabanı vs her şey tam işlesin"*
> · *"**Sistemi mükemmel kurmanı istiyorum.**"*
> · *"Tam ve eksiksiz şekilde tamamla."*
> · *"bu kısmı **mükemmelce** tamamla ve ana kısma geçelim"*

**Ne anlama geliyor:** Bir iş paketi "çalışıyor gibi" bırakılmayacak; şema, sunucu, üç panel
(sahip/admin/kullanıcı) ve testler dâhil uçtan uca kapanacak.

**İstediğin sonuç:** "Sanki tamam gibi yapılanlar" olmayacak — bunu bir kez ayrıca uyardın:
> *"yaptığın işlemi hızlandırır mısın **sanki tamam gibi yapılanlar**"*

---

# Bölüm 1 — Skor sistemi

## S1 — Skoru kim girer?

**Sorulan:** *Hakem de saha sahibi de yoksa skor ne olacak?*
Şıklar: (a) skorsuz kapansın · (b) kaptan yedek yetkili olsun · (c) hakemsiz maç kurulamasın

> **İlk cevabın (birebir):**
> *"S 1 **hakem saha sahibi ve tüm saha çalışanları skor girebilsin.**"*

> **Sonraki netleştirmen (birebir):**
> *"abi skoru **yalnızca saha çalışanları ve hakemler** girebiliyor olmalı main i iyice kontrol
> eder misin bugün hallettim bu işi"*

**Ne anlama geliyor:** Şıkların hiçbirini seçmedin, kendi kuralını koydun:

| Rol | Skor girebilir mi? |
|---|---|
| Hakem | ✅ Evet |
| Saha sahibi | ✅ Evet |
| Saha çalışanları (personel/müdür) | ✅ Evet |
| **Kaptan** | ❌ **Hayır** |
| Oyuncu | ❌ Hayır |
| Admin | ✅ Evet (düzeltme yetkisiyle — bkz. S4) |

**İstediğin sonuç:** Skor, maçta taraf olmayan bir yetkili tarafından girilsin. Kaptanın kendi
maçının skorunu yazması → çıkar çatışması ve kalıcı profil verisi bozulması.

**Bugünkü durum:** ✅ **Çözüldü, canlıda.**
- Main tarafı: kaptan skor paneli ve LIVE panel **kaldırılmış**; skor girişi token ile
  (`get_or_create_match_score_token` → `submit_match_score`), tesis panelinden.
- Bu dal tarafı: `20260728113125_skor_yetki_zaman_kapisi` migration'ı **saha sahibi yolunu
  onardı**. Yetki eskiden `pitch_bookings.match_id` üzerinden aranıyordu; o kolonu hiçbir kod
  yazmıyordu (canlıda 27 rezervasyonun **0**'ında doluydu) → sahip maçı panelde görüyor ama
  token RPC'si `UNAUTHORIZED` veriyordu. Yetki artık maçın kendi tesis bağı üzerinden
  kuruluyor: `matches.pitch_id → pitches.owner_id`.

⚠️ **Uyarı (yorum):** Bu migration canlı veritabanında **uygulanmış** durumda. Dal ne olursa
olsun bu dosya repoda kalmalı, yoksa repo ile canlı arasında sapma doğar.

---

## S1-ek — Skorsuz maç meşru bir son durum mu?

> **Bu, S1 cevabının doğal sonucu (yorum).** Hakem de yoksa saha çalışanı da girmediyse maç
> skorsuz kapanır.

**Ne anlama geliyor:** "Skor girilmedi" bir hata değil, **meşru bir son durum**. Uygulama bunu
0-0 beraberlik gibi göstermeyecek.

**İstediğin sonuç:** Skorsuz maç, istatistiğe sahte 0-0 olarak yazılmayacak.

**Bugünkü durum:** ✅ **Çözüldü.** `matches.score_status` kolonu eklendi:
`PENDING` / `ENTERED` / `NOT_ENTERED`. Eskiden `MatchDiaryDetail`'deki `?? 0` yedeği yüzünden
skorsuz maç 0-0 görünüyordu.

---

## S3-ek — Skor ne zaman girilebilir? (zaman kapısı)

> Bu, S3 (süre) kararının skor tarafındaki sonucu.

**Ne anlama geliyor:** Skor **ancak maç bittikten sonra** girilebilir. Bunun için maçın ne zaman
bittiğinin bilinmesi gerekiyordu — bilinmiyordu.

**Sorun neydi:** `duration` serbest metindi (`'60 Dakika'`), `ends_at` kolonu yoktu; repo
genelinde *"starts_at + 3 saat"* sezgisi kullanılıyordu. 60 dakikalık maçta **2 saat** gecikme.

**İstediğin sonuç:** Maçın bitiş anı gerçek bir zaman olsun, skor kapısı ona bağlansın.

**Bugünkü durum:** ✅ **Çözüldü, canlıda.** `duration_minutes` (sayı) + `ends_at` (gerçek zaman)
kolonları eklendi, trigger ile sürdürülüyor.

> **Teknik not (gelecekteki oturum için):** `ends_at` bilerek GENERATED kolon **değil**.
> Postgres'te `timestamptz + interval` operatörü `STABLE`'dır (`IMMUTABLE` değil), bu yüzden
> üretilmiş kolon ifadesi olarak reddedilir. Trigger ile sürdürülüyor — bunu "eksik iş" sanıp
> GENERATED'a çevirmeye çalışma, migration patlar.

---

## S4 — Skor girildikten sonra düzeltilebilecek mi?

**Sorulan şıklar:** (a) admin düzeltebilsin, kullanıcı düzeltemesin · (b) hakem 24 saat içinde
bir kez · (c) düzeltme yok

> **Cevabın (birebir):** *"4. **Sadece admin.**"* → **(a)**

**Ne anlama geliyor:** Yanlış girilen skoru yalnız admin düzeltir. Hakem bile kendi girdiğini
sonradan değiştiremez.

**İstediğin sonuç:** Skor kalıcı profil verisine yazıldığı için, düzeltme yetkisi tek ve
denetlenebilir bir noktada dursun.

**Bugünkü durum:** ✅ Main'de `admin_override_match_score` RPC'si mevcut.

---

# Bölüm 2 — Slot, süre ve tarife sistemi

Bu, oturumun **en büyük** iş bloğu — 17 ayrı karar, 5 migration, 3 panel.

## S3 — Maçın süresini kim, nereden belirler?

**Sorulan şıklar:** (a) maç kurma ekranına süre seçici (60/90/120) · (b) süre sabit 60 kalsın

> **Cevabın (birebir):**
> *"3 Maç süresi **saha sahibi veya müdür tarafından günlük tarifeler kısmından 60 90 120 olarak
> değiştirilebilsin** değiştirildiğinde kullanıcı ekranında slotlar değiştirilmiş şekilde yani
> **20:00 21:30 21:30-23:00 gibi gözüksün.** bu kısmın ayarının mükemmel olmasını sağla
> veritabanı vs her şey tam işlesin."*

**Ne anlama geliyor:** Şıkların ikisi de değil. Süre **kullanıcının** seçtiği bir şey değil,
**tesisin** ayarı. Tarife satırında tanımlanır, oradan tüm sisteme yayılır.

**İstediğin sonuç:** Sahip tarifede "akşam 90 dakika" dediğinde, kullanıcı saha detayında
`20:00–21:30`, `21:30–23:00` görsün. Sahte/uydurma slot yok.

**Bugünkü durum:** ✅ **Çözüldü, canlıda** (5 migration + 3 panel + SSOT).

---

## E1 — Süre nerede tanımlanacak?

**Şıklar:** (a) tarife satırında · (b) kort bazında · (c) gün bazında (`working_hours`)

> **Cevabın:** **E1(a)** — tarife satırında (tarife = saat aralığı + fiyat + süre)

**İstediğin sonuç:** Akşam 90, gündüz 60 gibi ayrım yapılabilsin.

**Bugünkü durum:** ✅ `20260728154518_tarife_slot_suresi`

---

## E2 — Fiyat nasıl hesaplanacak?

**Şıklar:** (a) saatlik kalsın, 90 dk = 1.5× · (b) slot başı fiyat

> **Cevabın:** **E2(b)** — slot başı fiyat

**İstediğin sonuç:** Sahip *"90 dakika 900₺"* der, 1.5× çarpımıyla uğraşmaz; küsuratlı fiyat
çıkmaz.

**Bugünkü durum:** ✅ Uygulandı.

---

## E3 — Çalışma saati süreye tam bölünmezse?

*(09:00–23:00 = 14 saat; 90 dakikaya bölününce 30 dk artıyor)*

**Şıklar:** (a) artan boş bırakılsın · (b) son slot kısa olsun · (c) kapanış yuvarlansın

> **Cevabın:** **E3(a)** — artan kısım boş bırakılsın

**İstediğin sonuç:** (b) yanıltıcı fiyat üretirdi, (c) sahibin ayarını izinsiz değiştirirdi.

**Bugünkü durum:** ✅ `shared/slotGrid.ts` artan süreyi slot üretmeden bırakıyor.

---

## E4 — Sahip süreyi değiştirdiğinde mevcut rezervasyonlar ne olacak?

*(20:00–21:00 dolu, süre 90'a çıktı → yeni slot 20:00–21:30 çakışıyor)*

**Şıklar:** (a) mevcut rezervasyonlar korunsun · (b) değişiklik engellensin · (c) uyarılsın

> **Cevabın (birebir):**
> *"**E4(a) sahip rezervasyon yapılmış gün ve saat için değişiklik yapamıyor olsun.**"*

**Ne anlama geliyor:** (a) + (b) **karışımı** seçtin, saf (a) değil:
- Mevcut rezervasyonlar korunur *(a)*
- **Ayrıca** sahip, rezervasyon bulunan gün/saat için süreyi değiştiremez *(b'nin dar hâli)*

**İstediğin sonuç:** Müşterinin rezervasyonu asla bozulmayacak; sahip bilmeden çakışma
yaratamayacak.

**Bugünkü durum:** ✅ Uygulandı — rezervasyon bulunan gün/saat için değişiklik kilidi var.

> ⚠️ **Gelecekteki oturuma not:** Bu karar A2 ile birlikte okunmalı. Admin de aynı kilide tabi
> (A2(a)). Yani "admin zorlayabilsin" diye bir kaçış yolu **yok**.

---

## E5 — Aynı tesiste farklı kortlar farklı süre alabilecek mi?

**Şıklar:** (a) evet · (b) hayır, tesis geneli tek süre

> **Cevabın:** **E5(a)** — evet

**İstediğin sonuç:** Şema zaten destekliyordu (`pitch_tariffs.court_id`), kısıtlamaya gerek yok.

**Bugünkü durum:** ✅ Uygulandı.

---

## E6 — Maçın süresi slottan mı gelecek?

**Şıklar:** (a) evet, kullanıcı değiştiremesin · (b) kullanıcı ayrıca seçebilsin

> **Cevabın:** **E6(a)** — maç süresi slottan gelir, kullanıcı değiştiremez

**İstediğin sonuç:** *"Sahayı 90 dakika kiraladıysan maç 90 dakikadır."* İki ayrı süre olursa
skor zaman kapısı yanlış çalışır.

**Bugünkü durum:** ✅ `20260728161215_mac_kort_ve_slot_suresi_bagi`. Ayrıca **sahte saha
enjeksiyonu kaldırıldı** (commit `237c169`).

---

## E11 — Mevcut `price_per_hour` kolonu ne olacak?

**Şıklar:** (a) `slot_price` olarak yeniden adlandırılsın · (b) ad kalsın, anlamı değişsin

> **Cevabın:** **E11(a)** — kolon adı değişsin

**İstediğin sonuç:** `price_per_hour` adıyla slot fiyatı tutmak altı ay sonra birini yanıltır.
Bugün tüm slotlar 60 dakika olduğu için dönüşüm **kayıpsız**.

**Bugünkü durum:** ✅ Uygulandı.

---

## E12 — Sabah 60, akşam 90 dakikaysa ızgara nasıl kurulacak?

**Şıklar:** (a) her tarife kendi başlangıcından kendi ızgarasını kursun · (b) gün boyu tek ızgara

> **Cevabın (birebir):**
> *"**E12a** ve bu slotlar ve ızgaralar **hem admin panelinden hem de saha sahibi panelinden
> (takvim, doluluk özeti vs) kesinlikle ayarlansın ve tek veriye bağlı olsunlar, veritabanı
> sistemleri ortak olsun. kullanıcı uygulamasına da doğru yansısın.**"*

**Ne anlama geliyor:** Şık cevabının yanına **K-0.3 kuralını** eklemişsin: tek veri, üç panel,
hepsi aynı kaynaktan.

**İstediğin sonuç:** 09:00–18:00 arası 60'lık, 18:00'den sonra 90'lık ızgara; ve bu ızgara
sahip panelinde, admin panelinde, kullanıcı uygulamasında **birebir aynı**.

**Bugünkü durum:** ✅ Uygulandı — `shared/slotGrid.ts` tek kaynak, SQL ikizi var.

---

## E13 — Kaporayı süre etkileyecek mi?

**Şıklar:** (a) sabit kalsın · (b) süreyle orantılı artsın

> **Cevabın:** **E13(a)** — sabit

**İstediğin sonuç:** Kapora bir *yer tutma bedeli*; süreyle orantılı olması gerekmiyor. Sahip
90 dakikaya farklı kapora isterse zaten tarife satırına yazar.

**Bugünkü durum:** ✅ Uygulandı.

---

## E14 — Süreyi kim değiştirebilecek?

**Şıklar:** (a) sahip + müdür · (b) sahip + tüm personel · (c) sadece sahip

> **Cevabın:** **E14(a)** — sahip + müdür

**İstediğin sonuç:** *"Skor girmek başka, tarife değiştirmek başka."* Fiyat/süre bir **gelir
kararı**; sahaya bakan her personelin değiştirmesi riskli.

> ⚠️ **Dikkat (yorum):** Bu, S1 kararıyla **kasıtlı olarak farklı**. Skoru tüm saha çalışanları
> girebilir; ama tarifeyi yalnız sahip + müdür değiştirir. İkisini aynı yetki listesine bağlama.

**Bugünkü durum:** ✅ Uygulandı.

---

## A1 — Admin süreyi değiştirebilsin mi?

**Şıklar:** (a) evet, sahiple aynı yetkide · (b) hayır, salt-okunur

> **Cevabın:** **A1(a)** — evet

**İstediğin sonuç:** Tesis kurulumunu admin yapıyorsa (S2 kararın gereği) ilk tarifeyi de admin
giriyor demektir.

**Bugünkü durum:** ✅ Admin paneline süre seçici + önizleme eklendi (commit `523fd95`).

---

## A2 — Rezervasyon varken admin süreyi **zorla** değiştirebilsin mi?

**Şıklar:** (a) hayır, sahiple aynı kilide tabi · (b) evet, uyarı görsün

> **Cevabın:** **A2(a)** — hayır

**İstediğin sonuç:** Kilit **teknik bir koruma**; admin zorlarsa müşterinin rezervasyonu
bozulur ve takvim tutarsızlaşır. Gerçekten gerekiyorsa admin **önce rezervasyonu iptal eder**.

**Bugünkü durum:** ✅ Uygulandı.

---

## A3 — Admin sahibin ayarını görebilmeli mi?

**Şıklar:** (a) evet, canlı önizleme · (b) sadece sayı yeter

> **Cevabın:** **A3(a)** — evet, canlı önizleme

**İstediğin sonuç:** Destek çağrısında *"sizin saatleriniz şöyle görünüyor"* diyebilmek.

**Bugünkü durum:** ✅ Uygulandı.

---

## A4 — Takvimden girilen özel fiyatın süresi ne olsun?

**Şıklar:** (a) o saatteki standart tarifenin süresini devralsın · (b) süre de sorulsun

> **Cevabın:** **A4(a)** — devralsın

**İstediğin sonuç:** Özel fiyat *"bugün bu saat daha pahalı"* demek; ızgarayı değiştirmesi
beklenmiyor. (b) seçilseydi aynı gün içinde ızgara kayardı.

**Bugünkü durum:** ✅ Uygulandı.

---

## SLOT-1 — Hafta içi / hafta sonu kalksın, günler tek tek seçilsin

> **Senin sözün (birebir):**
> *"Ekleme olarak **hafta içi ve hafta sonu sistemini kaldırıp günler teker teker seçme sistemini
> getirelim.**"*

**Ne anlama geliyor:** Tarife "hafta içi / hafta sonu" diye iki kaba kovaya değil, **7 güne**
ayrı ayrı uygulanabilecek.

**İstediğin sonuç:** Sahip cuma akşamına ayrı, cumartesi akşamına ayrı tarife koyabilsin.

**Bugünkü durum:** ✅ `20260728163234` + commit `f0ad82e`.

---

## SLOT-2 — "Çalışma Saatleri" + "Fiyatlandırma Politikası" birleşsin

> **Senin sözün (birebir):**
> *"Saha sahibi panelindeki **Çalışma saatleri kısmını fiyatlandırma politikası kısmıyla
> birleştirip isimlerini 'Aktif saatler ve ücretler' yap.** Saha sahibi bir fiyatlandırma planı
> oluşturduğunda **o planın başlangıç ve bitiş saatleri tesisin ve sahanın çalışma saatleri
> olarak ana uygulamada gözüksün.**"*

**Ne anlama geliyor:** İki ayrı ekran ve iki ayrı gerçek kaynağı **teke** iniyor. Çalışma saati
artık bağımsız bir veri değil; tarifelerden **türetiliyor**.

**İstediğin sonuç:** Sahip tek yerde ayar yapsın; "çalışma saatim 09:00–23:00 ama tarifem
18:00–22:00" gibi çelişki **imkânsız** olsun.

**Bugünkü durum:** ✅ `20260728163234_calisma_saati_tarifeden_turetilir` + commit `f0ad82e`
("İki gerçek teke indi").

---

## SLOT-3 — Doluluk özetindeki dikdörtgenler süreyle orantılı olsun

> **Senin sözün (birebir):**
> *"Özet kısmındaki saha doluluk analizi kısmında **eğer o gün için 90 dakikalık slotlar aktifse
> slotların dikdörtgeni o derecede büyük ve tam uyumlu boyut ayarında olmalı.**"*

**Ne anlama geliyor:** Takvim/doluluk görselinde 90 dakikalık slot, 60 dakikalıktan **görsel
olarak** daha uzun çizilecek.

**İstediğin sonuç:** Görsel, gerçeği yalanlamayacak.

**Bugünkü durum:** ✅ Commit `4d5a786` — "Takvim gerçek slot ızgarasını çiziyor, satırlar
süreyle orantılı".

---

## SLOT-4 — Maç kurma akışında da doğru dilimler görünsün

> **Senin sözün (birebir):**
> *"Kullanıcı tarafında da **saha kiralama maç oluşturma akışında bu dilimler doğru şekilde
> gösterilmeli.** Ayrıca **maç oluşturma kısmında da 90 dakikaya uygun sahaların saat seçimi
> doğru gözükmeli.** Her şey tüm veriler doğru ayarlanmalı."*

**Bugünkü durum:** ✅ Commit `237c169` — "Maç ↔ kort ve slot süresi bağı; sahte saha enjeksiyonu
kaldırıldı".

> ⚠️ **BİRLEŞTİRME RİSKİ (yorum):** Main, `views/MatchCreate.tsx`'i **baştan yazdı**
> (+1631/−513). Bu dalın maç kurma tarafındaki slot düzeltmeleri main'in yeni yapısına
> **yeniden taşınmalı**. Kopyala-yapıştır çalışmaz.

---

# Bölüm 3 — Para, cüzdan ve çekim

## S5 — Kusurdan doğan iadede %5 kesilecek mi? 🔴

**Şıklar:** (a) kusurlu iadelerde çekim ücretsiz olsun · (b) %5 her çekimde uygulansın

> **Cevabın:** **S5(a)** — kusurlu iadelerde çekim **ücretsiz**

**Ne anlama geliyor:** Tesis maçı iptal ettiyse veya hata bizdeyse, kullanıcı parasını çekerken
%5 kesinti **yemez**. Normal çekimde %5 uygulanır.

**İstediğin sonuç:** Kullanıcı, bizim kusurumuzdan doğan iadede cezalandırılmasın.

**Bugünkü durum:** ✅ **Çözüldü, canlıda.** `20260728114605_k1_cuzdan_iade_ve_cekim`
+ commit `39642bf` (arayüz) + commit `77fa53b` (sözleşme metinleri).

---

## S6 — Para çekme lansmanda açık mı olacak?

**Şıklar:** (a) lansmanda kapalı kalsın · (b) kimlik ekranı yazılsın, açık olsun ·
(c) kimlik zorunluluğu kalksın

> **İlk cevabın:** (b)
> **Sonra değiştirdin (birebir):** *"**s6 lansmanda kapalı olsun yalnızca iade kredisi**"* → **(a)**

**Ne anlama geliyor:** **Karar değişti — geçerli olan (a).** Lansmanda kullanıcı parasını
bankasına çekemez; cüzdanındaki bakiye yalnızca **uygulama içi iade kredisi** olarak kullanılır.

**İstediğin sonuç:** Kimlik doğrulama (KYC) altyapısı hazır olmadan para çıkışı açılmasın.

**Bugünkü durum:** ✅ Commit `9248150` — "Çekim lansmanda kapalı — sözleşme metinleri kararla
hizalandı".

> ⚠️ **Gelecekteki oturuma not:** Sözleşme metinleri bu karara göre yazıldı. Çekimi açarken
> `sozlesmeler/` altındaki metinler **birlikte** güncellenmeli. Hukukçu notu:
> `sozlesmeler/00-k1-cuzdan-iade-hukukcu-notu.md`.

---

## S7 — Minimum yükleme 300₺ kalacak mı?

**Şıklar:** (a) 100₺'ye insin · (b) 300₺ kalsın

> **Cevabın (iki kez):** *"7.b"* · *"**s7 min 300 kalsın**"* → **(b)**

**Bugünkü durum:** ✅ Değişiklik yapılmadı (kasıtlı).

---

## S8 — Adı olmayan kullanıcı ne yapacak?

**Şıklar:** (a) kayıtta ad-soyad zorunlu · (b) yalnız çekim anında istensin

> **Cevabın (iki kez):** *"8.a"* · *"**s8 ad soyad zorunlu**"* → **(a)**

**İstediğin sonuç:** Kullanıcı sisteme adsız girmesin; sonradan "adınızı girin" duvarı çıkmasın.

**Bugünkü durum:** ✅ **Çözüldü.** `20260728173408_ad_soyad_zorunlu` (SQL ikizi dâhil)
+ `shared/personName.ts` (Türkçe harf desteği, kesme işareti/tire yalnız harfler arasında)
+ commit `aea8b2f`.

---

## S9 — Çekim için süre taahhüdü verilecek mi?

**Şıklar:** (a) "en geç 5 iş günü" · (b) taahhüt verilmesin

> **Cevabın:** *"9.b"* → **(b)** — *"bankanın işlem süresine tabidir"* kalsın

**İstediğin sonuç:** Tutamayacağımız bir söz sözleşmeye girmesin.

**Bugünkü durum:** ✅ Sözleşme metni bu şekilde.

---

## S19-para — Para biçimi tekliği

> Bu ayrı bir soru değil, **S16/K-0.3'ün** para tarafındaki sonucu (yorum).

**Bugünkü durum:** ⬜ **Yapılmadı** — IP-19 paketi (`OYNA-COZUM-PLANI.md` satır 22950).
Elle `₺` birleştiren, `formatTRY`'ı baypas eden yerler duruyor.

---

# Bölüm 4 — Tesis sahibi tarafı

## S2 — Sahipsiz tesis ne olacak?

**Şıklar:** (a) admin elle sahiplendirsin · (b) sahipsiz tesis gizlensin · (c) sahiplenme akışı yazılsın

> **İlk cevabın (birebir):**
> *"2 **Sahipsiz tesis diye bir durum yok** tesis admin panelinden oluşturulduğunda **sahip atama
> zorunluluğu olsun.**"*

> **Netleştirmen (birebir):**
> *"**s2 sahipler admin panelinde kullanıcılar arasından seçilebilmeli**"*

**Ne anlama geliyor:** Şık değil, kendi kuralın: sahipsizlik bir **durum olarak var olmayacak**.
Admin tesis oluştururken sahibi **mevcut kullanıcılar arasından seçecek**; serbest metin
veya boş bırakma yok.

**İstediğin sonuç:** Vitrine sahipsiz tesis düşmesin, skor/takvim yetkisi boşta kalmasın.

**Bugünkü durum:** ✅ **Çözüldü, canlıda.** `20260728172422_sahipsiz_tesis_yok` — **3 katmanlı**
koruma: veritabanı kısıtı + RPC kontrolü + arayüz zorunluluğu. Commit `f550c80`.

---

## S14 / E7 — Tesis sahibi tarafı ayrılacak mı, teması birleşecek mi?

**S14 şıkları:** (a) ayrılacak, yatırım yapılmasın · (b) aynı uygulamada kalacak, plan aynen
uygulansın · (c) belli değil

> **İlk cevabın:** *"14b **tesis tarafı kendine özel kalsın**"*
> **Ben çelişki gördüm ve sordum (E7).**
> **Netleştirmen (birebir):** *"E7 anladığın doğru **tesis bölümünün temasına dokunmayalım.**"*

**Ne anlama geliyor:** İlk cevabında (b) dedin ama (b)'nin planda karşılığı *"tesis temasını
oyuncu temasıyla **birleştir**"* idi — senin cümlenin tersi. Netleştirmede kazanan:

- Tesis tarafı **aynı uygulamada kalır** *(S14 b)*
- Ama tesis **teması korunur, oyuncu temasıyla birleştirilmez** *(planın 5.9 bölümü uygulanmaz)*

**İstediğin sonuç:** Tesis paneli kendi görsel kimliğini korusun.

**Bugünkü durum:** ✅ Karar kayıtlı; tesis teması **değiştirilmedi**.

> ⚠️ **Gelecekteki oturuma kritik not:** `OYNA-COZUM-PLANI.md` **Bölüm 5.9 (OWNER TEMA
> BİRLEŞMESİ, satır ~5981)** bu kararla **iptal olmuştur**. Planda yazıyor diye uygulama.
> Yalnız 5.9.2 ("KORUNAN — `ownerTheme.ts`'in doğru olan kısmı") geçerliliğini sürdürür.

---

## S15 — Tesis sahibi lansmanda uygulamayı kullanacak mı?

**Şıklar:** (a) evet, anlaşmada şart koşulsun · (b) hayır, pasif kalsın

> **Cevabın:** *"15a"* → **(a)**

**Ne anlama geliyor:** Tesislerle anlaşma yapılırken uygulama kullanımı **şart** koşulacak.

**İstediğin sonuç:** S1 kararının işlemesi buna bağlı — saha çalışanı skor girecekse, tesisin
uygulamayı kullanıyor olması gerekir.

**Bugünkü durum:** ✅ Karar kayıtlı (ürün/operasyon kararı, kod işi değil).

---

# Bölüm 5 — Lansman kapsamı

## S10 — Lansmanda hangi roller açık olacak?

**Şıklar:** (a) hepsi — oyuncu, kaleci, hakem, tesis · (b) önce oyuncu + tesis

> **Cevabın:** *"10.a"* → **(a)** — hepsi açık

---

## E10 — Hakem/kaleci arzı yokken ne göstereceğiz?

*(Ben uyardım: 2 hakem, 2 kaleci var; kullanıcı çağırır, kimse gelmez.)*

> **Cevabın (birebir):**
> *"**E10(b)** Bu bölgede **hakem sayısı az başvurabilir ya da tanıdıklarını yönlendirebilirsin.
> Yazısı koyalım.**"*

**Ne anlama geliyor:** Rol açık kalsın ama uygulama **dürüst olsun** — boş listeyi "yükleniyor"
gibi göstermek yerine gerçeği söyleyip **çıkış yolu** sunsun.

**İstediğin sonuç:** Kullanıcı boşuna beklemesin; başvuru veya tanıdık yönlendirme yolu görsün.

**Bugünkü durum:** ✅ **Çözüldü.** Commit `ce0e330` — "Hakem/kaleci yokken dürüst boş durum".

---

## S11 — Lansman hangi şehirle başlayacak?

> **Cevabın:** *"11.a **(sistem tüm ülkeye yayılmaya hazır olmalı)**"* → **(a) Yalnız Ordu**,
> ama mimari çok şehirli *(bkz. K-0.4)*.

---

## S12 — Öncelik sıralaması nasıl değişecek?

**Şıklar:** (a) yeni tanım: P0 = lansmanı imkânsız kılanlar (para, skor, güvenlik) ·
(b) mevcut sıralama korunsun

> **Cevabın:** *"12.a"* → **(a)**

**Bugünkü durum:** ✅ Uygulandı — IP-10 bu kararla P1'den **P0'a** yükseldi (skor ± butonları
28px'ti ve kalıcı veri bozuyordu). Sonradan main skor girişini kaldırınca **o gerekçe düştü**
— bkz. Bölüm 7 notu.

---

## S13 — Hangi iş paketleri lansman öncesi?

**Şıklar:** (a) dar set (12 paket) · (b) hepsi (23 paket) · (c) daha dar

> **Cevabın:** *"13b"* → **(b) hepsi**
> **Sonra sordun (birebir):** *"s13 **IP adlı kod ile ne kastediyorsun?**"*
> *(IP = "İş Paketi" — planın Bölüm 8'indeki numaralı çalışma birimleri.)*

**Ne anlama geliyor:** 23 iş paketinin **tamamı** lansman öncesi.

> ⚠️ **Uyarı (yorum):** Bunu seçerken E8'de uyarmıştım: bu, sosyal paketleri (davet, mesajlaşma,
> takım) ve Taktik Stüdyo'yu da kapsıyor; bunlar kullanıcı yokken değer üretmez ama lansmanı
> geciktirir. Cevabın: *"E8. Önce bu paketi tamamlayalım paket sonrası sorularla diğer kısımlara
> göz atarız."* → yani karar **(b) olarak duruyor**, ama paket paket gözden geçirilecek.

---

## E9 — Çok şehirlilik mimari kısıt mı?

> **Cevabın:** **E9(a)** — evet, bölge/şehir kavramı, tesis arama, konum filtresi çok şehirli
> çalışmalı. *(K-0.4 ile aynı.)*

---

# Bölüm 6 — Tasarım sistemi

## S16 — Tek aksan rengi kararı kabul mü?

**Şıklar:** (a) tek aksan (yeşil), diğer renkler yalnız durum anlamı · (b) çok renkli kimlik kalsın

> **Cevabın:** *"16a"* + *"**css sisteminde önerini kabul ettim.**"* → **(a)**

**İstediğin sonuç:** `#39FF14` neon yeşil tek vurgu rengi; sarı/kırmızı yalnız **durum** anlatır.

**Bugünkü durum:** ⬜ **Yapılmadı** — IP-09 paketi (plan satır ~18407). 860 yeşil + 290 sarı
kullanımı elden geçecek.

---

## S17 — İtalik kullanımı?

**Şıklar:** (a) tamamen kalksın · (b) yalnız skor **ve para tutarlarında** kalsın

> **İlk cevabın:** *"17b"*
> **Netleştirmen (birebir):** *"**s17 italik tutarda olmasın**"*

**Ne anlama geliyor:** (b)'yi **daralttın**: italik yalnız **skorda** kalır, **para tutarlarında
kalkar**.

**İstediğin sonuç:** Para tutarı düz yazılsın (okunabilirlik + hizalama).

**Bugünkü durum:** ✅ **Çözüldü.** Commit `0345e55` — "tutarlarda italik yok".

> **Teknik gerekçe (yorum):** Space Grotesk'in italik yüzü zaten yüklenmiyordu; 162 kullanım
> tarayıcının ürettiği **sentetik oblik**ti — yani zaten sahte italikti.

---

## S18 — `design/player-onboarding/*.html` canlı mı, arşiv mi?

**Şıklar:** (a) arşiv, silinebilir · (b) canlı prototip, korunmalı

> **İlk cevabın (birebir):**
> *"18 **onboarding akışı kalsın bozmaya gerek yok.** Eski bir dosyaysa bu dahil etme ama güncel
> main deki onboarding güzel. **Neden silinmesini istiyorsun?**"*
> **(Sorunu yanıtladım: bunlar koda bağlı olmayan ölü HTML prototipleri, uygulamadaki
> onboarding'e dokunmuyor.)**
> **Nihai cevabın (birebir):** *"**s18 sil**"* → **(a)**

**Ne anlama geliyor:** ⚠️ **Bu iki farklı şey — karıştırma:**
- **Uygulamadaki onboarding akışı** → **KALIYOR**, dokunulmayacak *(senin ilk cümlen)*
- **`design/player-onboarding/*.html` ölü prototip dosyaları** → **SİLİNDİ** *(nihai cevabın)*

**Bugünkü durum:** ✅ Commit `0345e55` — ölü CSS/HTML silindi, uygulama onboarding'i **el
değmeden** duruyor.

---

## S19 — Tasarım sistemi ne kadar geniş uygulanacak?

**Şıklar:** (a) tam kapsam, tüm ekranlar tek seferde · (b) kademeli — önce oyuncu, tesis sonra

> **Cevabın (birebir):** *"19. **Oyuncu yapacağız.**"* → **(b)**

**Ne anlama geliyor:** Tasarım sistemi önce **oyuncu ekranlarına** uygulanır; tesis tarafı
sonra *(ve S14/E7 gereği tesis teması **hiç birleştirilmez**)*.

**Bugünkü durum:** ⬜ **Yapılmadı** — IP-08 / IP-09 paketleri.

---

# Bölüm 7 — Dokunma hedefi ve erişilebilirlik (IP-10)

> Bu bölümdeki 6 karar, IP-10 paketini açtığımda verdiğin cevaplar.
> **Cevabın birebir:** *"1 a 2 b 3 a 4 titreşim her tuşta olmamalı a 5 a 6 a"*

## IP10-1 — Küçük yazılar: ne kadarını şimdi düzeltelim?

*(904 kullanım var; plan sadece 8'ini düzeltiyordu.)*

**Şıklar:** (a) sadece bu paketin dokunduğu ~15 yer · (b) en kötü 3 ekranı da ekle (+227) ·
(c) 904'ün hepsi

> **Cevabın:** **(a)**

**İstediğin sonuç:** 904'lük süpürme **IP-08'in işi** (adı birebir "tipografi ölçeği").
Aynı dosyalar iki kez elden geçmesin.

**Bugünkü durum:** ⬜ **Yapılmadı.**

---

## IP10-2 — Buton boyutu: kural ne kadar katı?

**Şıklar:** (a) istisnasız 44px, 97 butonun hepsi · (b) kritik olanlar 44px, yoğun listelerde
40px serbest · (c) sadece plandaki 20 yer

> **Cevabın:** **(b)** ⚠️ *— benim önerim (a) idi, sen (b) dedin.*

**Ne anlama geliyor:** **İki kademeli** kural:
- Kritik butonlar (para, onay, yıkıcı aksiyon, geri) → **en az 44px**
- Yoğun listelerde → **40px'e kadar** inilebilir

**İstediğin sonuç:** Katı tek kural yüzünden liste tasarımlarının bozulmaması.

**Bugünkü durum:** ⬜ **Yapılmadı.**

> ⚠️ **Gelecekteki oturuma not:** Plan metni (Bölüm 5.6, satır ~5351) **istisnasız 44px**
> diyor. Senin kararın planı **geçersiz kılıyor**. `IconButton` bileşeni iki varyantlı
> yazılmalı (`size="md"` = 44, `size="sm"` = 40) ve `sm` yalnız yoğun listelerde kullanılmalı.

---

## IP10-3 — Basma hissi: hangi yöntem?

*(993 butonun 612'sinde basıldığına dair hiçbir görsel işaret yok.)*

**Şıklar:** (a) global kararma + ölü ripple kodunu sil · (b) kararma + ripple'ı onar ·
(c) scale (küçültme)

> **Cevabın:** **(a)**

**İstediğin sonuç:** Tek satırla 612 butonun hepsi kapsansın; iki ayrı geri bildirim sistemi
bakım yükü olmasın. *(Mevcut ripple zaten ölü: neon yeşil zeminde beyaz dalga görünmüyor ve
sınıfı hiç kullanılmamış.)*

**Bugünkü durum:** ⬜ **Yapılmadı.**

---

## IP10-4 — Titreşim: kullanıcı kapatabilsin mi?

*(30 titreşim çağrısı var, 15 dosyada — hepsi `navigator.vibrate` kullandığı için **iPhone'da
tamamen ölü**. Doğru paket `@capacitor/haptics` **zaten kurulu** ama tek satır kod onu
kullanmıyor.)*

**Şıklar:** (a) native köprü + Ayarlar'da açma/kapama · (b) sadece native köprü · (c) dokunma

> **Cevabın (birebir):** *"4 **titreşim her tuşta olmamalı** a"* → **(a) + ek kural**

**Ne anlama geliyor:** (a)'yı seçtin **ama bir sınır koydun**: titreşim **her tuşta olmayacak**.
Yani:
- Native köprü kurulacak (`@capacitor/haptics`), iPhone'da da çalışacak
- Ayarlar'da açma/kapama anahtarı olacak
- **Ama** titreşim yalnızca **anlamlı olaylarda** çalışacak — her butona değil

**İstediğin sonuç (yorum):** Titreşim bir *vurgu*; her yerde olursa vurgu olmaktan çıkar,
rahatsız eder ve pil yer.

**Bugünkü durum:** ⬜ **Yapılmadı.**

> **Gelecekteki oturuma not:** Hangi olayların titreşeceği **henüz kararlaştırılmadı**.
> Önerilen liste (onay bekliyor): ödeme başarılı · maça katılım onaylandı · hata/uyarı ·
> yıkıcı aksiyon onayı. Normal gezinme, sekme değişimi, liste dokunuşu → **titreşim yok**.

---

## IP10-5 — Ortak buton bileşeni yazılsın mı?

**Şıklar:** (a) evet, `IconButton` yaz ve ikon butonlarını taşı · (b) hayır, dosya dosya düzelt

> **Cevabın:** **(a)**

**İstediğin sonuç:** **Zorunlu etiket alanı** sayesinde bundan sonra etiketsiz buton yazmak
*imkânsız* hale gelsin. *(Bugün 993 butona karşı yalnız 137 etiket var; 13 ekranın geri butonunu
ekran okuyucu "düğme" diye okuyor.)*

**Bugünkü durum:** ⬜ **Yapılmadı.**

---

## IP10-6 — Bu paket ne zaman yapılsın?

**Şıklar:** (a) şimdi, IP-03 ve IP-04'ten sonra · (b) IP-08'den sonra · (c) IP-03/04'ten önce

> **Cevabın:** **(a)** — IP-03 → IP-04 → **IP-10**

**İstediğin sonuç:** Para ile ilgili paketler (IP-03 ödeme şeffaflığı, IP-04 maçtan ayrılma
iadesi) önce gitsin.

**Bugünkü durum:** ⬜ Sıra bekliyor.

---

## IP10-KAPSAM — Skor maddesi paketten çıktı

> **Senin sözün (birebir):** *"**kaptan artık skor giremiyor olmalı** bu planı güncel main ile
> uyumlu hale getirmen şart."*

**Ne anlama geliyor:** IP-10'un **en ağır gerekçesi** *"kaptanın skor girdiği ± butonları 28px"*
idi. Main kaptan skor girişini **tamamen kaldırdı** → o madde IP-10'dan **çıkarılacak**.

**Bugünkü durum:** ✅ Karar kayıtlı. IP-10 uygulanırken skorla ilgili hiçbir madde
**uygulanmayacak**.

---

# Bölüm 8 — Teknik hijyen

## S20 — Çakışan migration numaraları nasıl düzeltilecek?

**Şıklar:** (a) uygulama sırasında yeniden numaralandırılsın · (b) plan metni şimdi düzeltilsin

> **Cevabın:** *"20.a"* · *"**e20 dikkatle hallet**"* → **(a)**

---

## S21 — Canlıda olup repoda olmayan migration'lar ne olacak?

**Şıklar:** (a) canlıdan çekilip repoya işlensin (sapma onarımı) · (b) şimdilik bırakılsın

> **Cevabın:** *"21.a"* · *"**s21 sapmayı çöz**"* → **(a)**

**İstediğin sonuç:** Repo ile canlı veritabanı **birebir** aynı olsun.

**Bugünkü durum:** ⚠️ **Kısmen — ve burada bir karışıklık var (dürüst not).**

- Bu dal sapmayı çözdü (commit `d60a7fb`), ledger 361 = 361 oldu.
- **Ama** main de **aynı işi kendi başına yaptı** (commit `1f0eb85` "Migration defteri
  mutabakatı: 11 eksik kayıt eklendi").
- Sonuç: aynı DDL iki farklı dosya adı altında var. Bu dalın 15 dosyası
  (`20260727124350`…`20260727200123`) main'in `20260827*`/`20260828*` dosyalarının **kopyası**.
- **Yapılması gereken:** bu dalın 15 kopya dosyası **silinecek**, main'in dosyaları kalacak.
  *(Doğrulandı: `create_match_atomic`, `invite_friends_to_match`, `player_kick_slot`,
  `prepare_card_payment`, `admin_finance_report` — hepsi main'in dosyalarında mevcut.)*

> ⚠️ **BÜYÜK TUZAK — gelecekteki oturum mutlaka okusun:**
> Bu dalın 10 dosyası (`20260826000001-4`, `20260827000001-4`, `20260828000001-2`) **6 satırlık
> boş not**tur. Main'in aynı adlı dosyaları **gerçek SQL** içerir (450 / 637 / 993 satır).
> Dikkatsiz birleştirmede boş notlar gerçek SQL'i **ezer**. Çakışmada **daima main'in tarafı**
> alınacak.
>
> **İkinci tuzak:** `apply_migration` ledger'a **dosya adındaki değil, uygulama anındaki**
> sürümü yazar. Migration uyguladıktan sonra repo dosyasının adını ledger'daki sürümle
> eşleşecek şekilde **yeniden adlandır**. Bu tuzağa bu oturumda **iki kez** düşüldü.

---

## S22 — Sözleşmeler avukata ne zaman gidecek?

**Şıklar:** (a) hemen, kod işi paralel yürüsün · (b) tüm plan bitince

> **Cevabın:** *"22. a"* → **(a) hemen**

**Bugünkü durum:** ✅ Sözleşmeler K1 kararlarıyla hizalandı (commit `77fa53b`) ve hukukçu notu
yazıldı: `sozlesmeler/00-k1-cuzdan-iade-hukukcu-notu.md`. **Avukata gönderim senin elinde.**

---

# Bölüm 9 — Dal birleştirme stratejisi

> Bu üç karar, dalın main'den 24 commit geride kaldığını fark ettiğimde sorduğum sorulara ait.
> **Cevabın birebir:** *"S1 b S2 a S3a"*

## M1 — Birleştirme nasıl yapılacak? ⚠️ **EN KRİTİK KARAR**

**Şıklar:**
- (a) main'i dala **birleştir** (merge), çakışmaları kurala göre çöz
- (b) **dalı bırak, main'den temiz yeni dal aç, işlerimi oraya taşı** — daha temiz ama daha uzun
- (c) sen birleştir, ben bekleyeyim

> **Cevabın:** **(b)** ⚠️ *— benim önerim (a) idi, sen (b) dedin.*

**Ne anlama geliyor:** Merge **istemedin**. Temiz bir taban üzerine bu dalın işlerinin
**yeniden uygulanmasını** istedin.

**İstediğin sonuç:** Main'in geçmişi bozulmasın, eski dosya hâlleri çakışma çözümü sırasında
kazara geri gelmesin. **(b), K-0.1 ve K-0.2 kurallarını yapısal olarak garanti eder** —
merge'de bu garanti yok, insan dikkatine kalır.

**Bugünkü durum:** ❌ **Bu karar uygulanmadı — benim hatam.**

Ben (a)'yı, yani merge'i başlattım (`git merge origin/main --no-commit`), 16 çakışmanın 11'ini
çözdüm, 5'i açık kaldı. Sen *"dur"* dedin. Hiçbir commit atılmadı, hiçbir şey push edilmedi.

**Doğru yol (uygulanacak):**
```bash
# (b) — temiz taban. Dal adı KORUNUR (talimat gereği aynı dalda kalınmalı).
git merge --abort
git fetch origin main
git checkout -B claude/oyna-ux-audit-solution-q06aq8 origin/main
# sonra bu dalın işleri tek tek yeniden uygulanır (aşağıdaki listeye göre)
```
Yedekler yerinde: `yedek/ip-calismasi-oncesi` (tag) · `yedek/oyna-ux-audit-eski` (dal) ·
`origin/claude/oyna-ux-audit-solution-q06aq8` — hepsi `0e5c1b6`'da. **Hiçbir iş kaybolmaz.**

---

## M2 — Şüpheye düşülürse ne yapılacak?

**Şıklar:** (a) her zaman main'in tarafını tut, kendi değişikliğini üstüne yeniden uygula ·
(b) bana sor

> **Cevabın:** **(a)**

**Ne anlama geliyor:** Karar verilemeyen her noktada **main kazanır**. Bu dalın değişikliği
main'in üstüne **yeniden yazılır**, main'in kodu bu dalın kodu ile değiştirilmez.

---

## M3 — IP-02'nin çift-gönderim kilidi ne olacak?

*(Kilidi `hooks/useMatchCreate.ts`'e yazmıştım; main o dosyayı **sildi** ve Maç Kur akışını
baştan kurdu.)*

**Şıklar:** (a) main'in yeni yapısında karşılığını bul ve oraya uygula · (b) önce kontrol et ·
(c) şimdilik atla

> **Cevabın:** **(a)**

**İstediğin sonuç:** Çift kapora hatası **gerçek**; kilit korunacak. Ama main'in yeni yapısına
**taşınarak**, eski dosya geri getirilmeden.

**Bugünkü durum:** ⬜ **Yapılmadı** — taban kararı (M1) verilmeden yapılamaz.

---

# Bölüm 10 — Son hedef tanımı

> **Senin son sözün (birebir):**
> *"Lanet olsun çok karıştı sistemler. İsteğim **hem slot sistemi tamam olsun hem hakem ve saha
> üyeleri skor girebilsin hem de burada yapılan ui değişiklikleri geçerli olsun.** Bunun için
> branchı bu şekilde çalışacak hale getir."*

Bu, dalın **kabul kriteri**. Üç madde, hepsi ölçülebilir:

| # | İstenen | Nerede duruyor | Durum |
|---|---|---|---|
| 1 | **Slot sistemi tam çalışsın** | Bu dalın 5 migration'ı + `shared/slotGrid.ts` + 3 panel | ✅ Yazıldı, **canlıda** — dala taşınması gerekiyor |
| 2 | **Hakem ve saha üyeleri skor girebilsin** | `20260728113125_skor_yetki_zaman_kapisi` (bu dal) + token akışı (main) | ✅ Yazıldı, **canlıda** — dala taşınması gerekiyor |
| 3 | **Buradaki UI değişiklikleri geçerli olsun** | 26 commit — IP-01, IP-02, IP-05, IP-06, IP-07, IP-20 + S-serisi | ✅ Yazıldı — main'in yeni yapısına **yeniden uygulanması** gerekiyor |

**Önemli tespit (yorum):** Üç maddenin **üçü de yazılmış ve ikisi canlı veritabanında zaten
çalışıyor**. Eksik olan tek şey, bunların **main'in güncel tabanı üzerine oturtulması** —
yani M1 kararının uygulanması. Yeniden yazılacak bir iş yok; taşınacak bir iş var.

---

# Bölüm 11 — Karar → sonuç izleme tablosu

## Tamamlananlar (canlıda veya kodda)

| Karar | Konu | Kanıt |
|---|---|---|
| S1, S1-ek, S3-ek | Skor yetkisi + zaman kapısı + skorsuz maç | `20260728113125` · commit `187dd4c` |
| S4 | Skoru yalnız admin düzeltir | main: `admin_override_match_score` |
| S2 | Sahipsiz tesis yok (3 katman) | `20260728172422` · commit `f550c80` |
| S3, E1-E6, E11-E14, A1-A4, SLOT-1..4 | Slot/süre/tarife sistemi | 5 migration · commits `67f1193`→`523fd95` |
| S5, S6, S9 | Cüzdan iadesi, %5 kuralı, çekim kapalı | `20260728114605` · commits `d36721c`, `39642bf`, `9248150` |
| S7 | Min 300₺ korundu | değişiklik yapılmadı (kasıtlı) |
| S8 | Ad-soyad zorunlu | `20260728173408` · `shared/personName.ts` · commit `aea8b2f` |
| S17, S18 | İtalik yalnız skorda, ölü CSS silindi | commit `0345e55` |
| E10 | Hakem/kaleci yokken dürüst boş durum | commit `ce0e330` |
| S22 | Sözleşmeler + hukukçu notu | commit `77fa53b` |
| S14/E7 | Tesis teması korunuyor | plan 5.9 iptal edildi |
| — | IP-01 navigasyon/geri tuşu/overlay | commit `514f1db` + doğrulama `b37bdd8` |
| — | IP-02 çift gönderim + idempotency | commit `5639578` |
| — | IP-05 değerlendirme gizliliği | `20260728213449` |
| — | IP-06 bildirim merkezi | `20260728213633` |
| — | IP-07 tesis sahibi para dürüstlüğü | commit `0e5c1b6` |
| — | IP-20 bilet çevrimdışı dayanıklılık | commit `815bfbe` · `utils/ticketCache.ts` |

## Yapılmayanlar

| Karar | Konu | Neden |
|---|---|---|
| **M1 (b)** | **Temiz taban** | ❌ **Yapılmadı — sıradaki iş** |
| M3 | IP-02 kilidini taşı | M1'e bağlı |
| IP10-1..6 | Dokunma hedefi + erişilebilirlik | Sıra IP-03 → IP-04 → IP-10 |
| S16, S19 | Tek aksan rengi, tipografi | IP-08 / IP-09 |
| S19-para | Para biçimi tekliği | IP-19 |
| S13 (b) kalanı | 23 paketin geri kalanı | IP-03, 04, 08, 09, 11-19, 21-23 |

## Değiştirdiğin kararlar (geçerli olan **ikinci** cevap)

| Karar | Önce | **Sonra (geçerli)** |
|---|---|---|
| S6 | (b) çekim açık olsun | **(a) lansmanda kapalı, yalnız iade kredisi** |
| S17 | (b) skor + para italik | **skor italik, para italik DEĞİL** |
| S18 | "onboarding kalsın, neden siliyorsun?" | **(a) ölü prototip dosyaları sil** *(uygulama onboarding'i kalır)* |
| S14 | (b) plan aynen uygulansın | **(b) ama tesis teması birleştirilmez** |
| S1 | "hakem + sahip + tüm saha çalışanları" | **"yalnızca saha çalışanları ve hakemler"** *(kaptan kesinlikle hayır)* |

## Benim önerimi **reddettiğin** kararlar

Bunlar özellikle önemli — plan metni benim önerimi yazıyor olabilir, **senin kararın üstündür**:

| Karar | Benim önerim | **Senin kararın** |
|---|---|---|
| IP10-2 | (a) istisnasız 44px | **(b) kritik 44px, listelerde 40px serbest** |
| M1 | (a) merge | **(b) temiz taban** |
| S13 | (a) dar set, 12 paket | **(b) hepsi, 23 paket** |
| E2 | — | (b) *(önerimle aynı)* |
| E4 | (a) rezervasyon korunsun | **(a) + değişiklik kilidi** *(daha katı)* |

---

# Bölüm 12 — Açıkta kalan tek soru

## E15 — Rezervasyonsuz kurulan maçın süresi ne olacak?

*(Taslak/tohum yolundan gelen, gerçek slotu olmayan maçlar.)*

> **Cevabın (birebir):** *"**E15 anlamadım?**"* — ve soru bir daha sorulmadı.

**Sorunun açıklaması:** Uygulamada bazı maçlar gerçek bir saha rezervasyonu **olmadan**
oluşabiliyor (demo/tohum verisi, taslak maçlar). Bunların bağlı olduğu bir slot olmadığı için
**süresi de yok**. E6 kararın *"maç süresi slottan gelir"* diyor — ama slot yoksa nereden gelecek?

**Seçenekler:**
- (a) Varsayılan 60 dakika atansın
- (b) Bu maçlar hiç oluşturulamasın — her maçın gerçek slotu olsun
- (c) Süre boş kalsın, skor zaman kapısı bu maçlarda çalışmasın

**Öneri:** **(a)** — bugünkü davranış zaten bu ve veri bozmuyor. (b) demo/tohum verisini
kırar, (c) skor kapısında boşluk açar.

**Neden hâlâ açık:** Bu cevap verilmediği için `duration_minutes` trigger'ı bugün sessizce
60 varsayıyor. Çalışıyor ama **senin onayın yok**.

---

# Ek — Bu belgeyi kullanan oturum için 6 kural

1. **Bu belgedeki karar, plan metninden üstündür.** `OYNA-COZUM-PLANI.md` 25.000 satır ve
   kararlardan **önce** yazıldı. Çelişki varsa **bu belge kazanır**.
   Bilinen çelişkiler: plan 5.9 (owner tema birleşmesi → **iptal**), plan 5.6 (istisnasız 44px
   → **IP10-2(b) ile değişti**), IP-10 içindeki skor maddeleri (**kaldırıldı**).

2. **Planın kendi satır dizini eskimiş.** Bölüm 0'daki tablo ~35 satır kayık
   (Bölüm 1 için `243` yazıyor, gerçek `278`). Atlamadan önce
   `grep -n '^#\{1,3\} ' docs/ux-audit/OYNA-COZUM-PLANI.md` ile doğrula.

3. **Main daima kazanır** *(M2 kararı)*. Şüphede main'in tarafını tut, bu dalın işini üstüne
   yeniden uygula.

4. **Silinmiş özellik geri gelmez** *(K-0.1)*. Her birleştirmeden sonra kontrol et:
   kaptan skor paneli ve LIVE panel geri gelmiş mi?

5. **Migration numarası tuzağı** *(S21 notu)*. `apply_migration` ledger'a uygulama anındaki
   sürümü yazar; repo dosyasını ona göre yeniden adlandır.

6. **`tests/setup.ts` mağazayı global mock'lar.** Gerçek mağazayı test edeceksen
   `vi.importActual` kullan; mağazaya yeni action eklediğinde mock'a da ekle, yoksa testler
   *"… is not a function"* der.
