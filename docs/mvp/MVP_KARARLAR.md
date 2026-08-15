# OYNA MVP — Onaylanmış Kararlar (Tur 1)

> Tarih: 15 Ağustos 2026 · Kaynak: kurucunun `docs/mvp/MVP_KARAR_SORULARI.md` sorularına verdiği cevaplar.
> Bu dosya **bağlayıcıdır**: MVP kapsamındaki her uygulama kararı buraya dayanır.
> Değişiklik olursa önce burası güncellenir (OYNA_PRENSIPLER.md §14 disiplini).

## MVP'nin tek cümlesi

> Kullanıcıların, **admin ve saha sahibi tarafından oluşturulan maçlarda kartla slot satın aldığı**;
> saha sahibinin izin verdiği saatlerde **bireysel antrenman slotu** kiralayabildiği; kaleci ve hakemin
> **yalnız admin tarafından atandığı**; profil, takım, arkadaşlık ve taktik stüdyosunun tam çalıştığı,
> cüzdansız ve sade bir piyasaya giriş sürümü.

---

## 1. Kuruluş ve altyapı

| # | Karar |
|---|---|
| K-01 | Yeni Supabase şeması **canlı veritabanından `pg_dump` ile alınan şemadan** üretilecek; MVP-dışı nesneler bilinçli listeyle çıkarılıp **tek temiz baseline migration** olarak kurulacak. Migration zinciri sıfırdan başlayacak. |
| K-02 | **Hiçbir veri taşınmayacak.** Sıfır kullanıcı, sıfır maç, sıfır rezervasyon, sıfır işlem geçmişi. Yalnız zorunlu sistem/konfigürasyon satırları (app_config, bildirim şablonları, bölge kapsama, metinler) yeni kurulumda **yeniden** oluşturulacak. |
| K-03 | Yeni Supabase projesi **eu-central-1 (Frankfurt)**; canlıya çıkarken **Pro plan**. |
| K-04 | Domain: **oyna.app** yeni Vercel projesine bağlanacak. |
| K-05 | Kapsam **web + iOS + Android** (mağaza dahil). Capacitor zinciri, push (APNs/FCM), Apple Sign-In yeniden kurulacak. |
| K-06 | Mevcut Supabase projesi (OYNA / iikvzgyccvgcybzdfwlv) **aktif kalacak**, tam yedeği alınacak; MVP ayrı ve yeni bir Supabase projesinde kurulacak. Eski proje dokunulmadan yaşamaya devam eder. |
| K-07 | Yeni **GitHub reposu** ve yeni **Vercel projesi** kurulacak; migration disiplini (immutability CI, playbook) gün 1'de yeniden kurulacak. |
| K-08 | **Demo olan her şey kaldırılacak**: `?demo=1` arka kapısı, @oyna.app demo hesapları, seed_godview_demo / seed_module_demo / owner demo seed RPC'leri, demo_mode_enabled, demoAccounts.ts. |
| K-09 | Pilot bölge: **İstanbul** (Beşiktaş, Şişli vb. ilçeler). Ordu seed'i taşınmayacak. |

## 2. Ödeme

| # | Karar |
|---|---|
| K-10 | **Cüzdan yok.** Kullanıcı arayüzünde cüzdan, bakiye, yükleme, çekim hiçbir yerde görünmeyecek. `wallet_transactions` yalnız iç muhasebe defteri olarak şemada kalabilir (kullanıcıya açılmaz). |
| K-11 | Ödeme **yalnız kartla**, **tam tutar** (kapora modeli yok). |
| K-12 | **İade karta yapılacak** — iyzico karta-iade entegrasyonu yazılacak (bugün kodda yok). |
| K-13 | **Kart işlem bedeli kullanıcıya yansıtılmayacak** (`card_fee_pct = 0`). Fiyatı platform belirler. |
| K-14 | iyzico önce **sandbox**'ta uçtan uca doğrulanacak; canlı anahtarlar sonra. |
| K-15 | Kapora/ön-provizyon mekanizması MVP'de **yok** (maç kurma akışı da olmadığı için gereksiz). |

## 3. İş modeli ve fiyatlandırma

| # | Karar |
|---|---|
| K-16 | Platform saha saatlerini **saha sahibinden satın alır**, ödemeyi **elden** yapar. Uygulama içinde saha sahibine para çıkışı (payout/hakediş/çekim) **yoktur**. |
| K-17 | Saha sahibi **kendi panelinden maç oluşturabilir**; kullanıcılar bu maçlarda slot satın alır. |
| K-18 | Saha sahibinin oluşturduğu maçlar için **admin panelinden, saha sahibine özel bir yüzde/ücret** tanımlanır. |
| K-19 | Maç oluşturma yetkisi: **yalnız admin ve saha sahibi (+ saha müdürü)**. Oyuncular maç kuramaz. |
| K-20 | Kaleci ve hakem **yalnız admin panelinden** atanır; ücretleri **admin panelinden** belirlenir ve kullanıcı **ödeme ekranında bu ücretleri görür**. |

## 4. Saha kiralama ve antrenman slotu

| # | Karar |
|---|---|
| K-21 | Saha sahibi kendi panelinden **uygulamadan kiralanabilecek saatleri açar**; varsayılan **kapalı**. Kullanıcı, saha kiralama ekranında yalnız **açılmış (müsait) saatleri** görür. |
| K-22 | "Son kalan saat" (antrenman slotu) kuralları saha sahibi arayüzünde **"Antrenman Oyuncusu Kuralları"** başlığı altında ayarlanır. Oyuncu arayüzünde **hangi sahalarda slot satın alınabileceği** açıkça görünür. *(Bu bölüm birlikte tasarlanacak.)* |
| K-23 | Antrenman slotu kiralayan kullanıcılar, **sahayı ve kaleleri diğer antrenman slotu kiralayanlarla ortak kullanmayı** kabul etmiş sayılır. |
| K-24 | *(v2 hedefi)* Antrenman grubu **kaleci kiralayarak yarı sahayı kendine ayırabilir** — kaleci sistemi aktive edildiğinde entegre edilecek. |
| K-25 | Antrenman rezervasyonu **maç objesi değildir**; saf rezervasyon olarak yaşar, Top Oyna listesine girmez. |

## 5. Kaleci / hakem

| # | Karar |
|---|---|
| K-26 | MVP'de kaleci/hakem **yalnız admin panelinden atanır**; oyuncu tarafında kiralama/pazaryeri yoktur. |
| K-27 | Kişiler kaleci/hakem olmak için **başvuru yapabilir**; başvurular toplanır, yeterli doygunluğa ulaşınca özellik aktive edilir. |
| K-28 | Atanan kaleci ve hakem **lobide herkese görünür** (bugünkü "kaleci yalnız kendi takımına görünür" kuralı sadeleştirilir). |
| K-29 | Kaleci/hakem **gerçek kullanıcı hesabıdır**; admin rol verir, atandığı maçlar "Maçlarım"da görünür. |

## 6. Yaş ve veli onayı

| # | Karar |
|---|---|
| K-30 | **18+**: serbest. |
| K-31 | **16–18 yaş**: veli onayı ile maçlara katılabilir. |
| K-32 | **14–16 yaş**: veli onayı zorunlu **ve** yalnızca katılımcılarının tamamı **14–18 yaş** arasında olan maçlara katılabilir. |
| K-33 | Veli onayı sistemi (guardian_consents + minor_payment_consents) MVP'de **kalır**. |

## 7. Kapsam — kalan ve çıkan

**Kalan (mükemmel çalışacak):** Top Oyna (maça katılma), saha kiralama + antrenman slotu, profil,
takım kurma/yönetme, arkadaş ekleme/çıkarma, taktik stüdyosu, 1:1 mesajlaşma + takım sohbeti,
rahat maç modu, onboarding + konum akışı, in-app bildirim + e-posta.

**Çıkan:** cüzdan (tüm yüzeyler), oyuncu tarafı maç kurma, kaleci/hakem pazaryeri
(Marketplace + ServiceDashboard + ServiceApplication + ServiceProfile + ServiceSettings),
topluluklar, turnuvalar, promosyon kodları, SaaS abonelik, demo yüzeyi.

| # | Karar |
|---|---|
| K-34 | Ana sayfa (Dashboard) **güncel tasarımı korunur**; yalnız hizmet sağlayıcı kartları (Kaleci Bul / Hakem Bul), maç kurma butonu ve cüzdan kartı çıkarılır. **Alt bar buna göre yeniden dizayn edilir.** |
| K-35 | Bildirimler: **in-app + e-posta**. *(K-05 gereği mobil kapsamda olduğundan push ikinci dalgada kurulur.)* |
| K-36 | Onboarding ve konum akışı **aynen kalır**; yalnız kaleci/hakem rol başvurusu adımı ayrı bir "başvuru" yüzeyine taşınır (K-27). |
| K-37 | Saha sahibi paneli MVP'de **sade** olacak: takvim, tarife, saat açma/kapatma, manuel rezervasyon, **maç oluşturma**, antrenman kuralları, rezervasyon listesi. Veresiye/gider/personel/abonelik/finans raporları MVP dışı. |

## 8. Süreç ve kalite

| # | Karar |
|---|---|
| K-38 | Hukuk seti ve kurallar **en son** gözden geçirilecek; kart tahsilatı hukuk seti bitmeden canlıya açılmaz. |
| K-39 | Kapsam-dışı testler silinir; çekirdek testler (para/slot/sosyal/atama) yeşil tutulur; yeni Supabase'e karşı uçtan uca duman testi zorunludur. |
| K-40 | MVP **piyasaya giriş sürümüdür, son hal değildir.** Amaç: admin panelinden mükemmel yönetilebilen, saha sahiplerini uygulamaya alıştıran, kullanıcıya net ve pürüzsüz bir UI/UX akışı sunan sağlam bir giriş. |

---

## Bu kararların doğurduğu mimari sonuçlar (dikkat!)

1. **Kaptan rolü sahipsiz kalıyor.** Bugün maç lobisindeki kadro yönetimi, iptal, eşik kararı, skor onayı,
   taktik ataması kaptana bağlı. Maçı admin/saha sahibi kurduğunda bu yetkilerin yeni sahibi tanımlanmalı.
2. **Kapora → tam ödeme dönüşümü** hem maç slotu hem saha rezervasyonu için ödeme akışını yeniden yazmayı gerektirir.
3. **Karta iade** kodda hiç yok — iyzico refund entegrasyonu MVP'nin yeni yazılacak parçalarından biri.
4. **Antrenman slotu kuralları** (son X saat, hangi sahalar, ortak kullanım) hem saha sahibi panelinde hem oyuncu
   arayüzünde yeni ekran/alan gerektirir; slot ızgarası SSOT'u (sunucu + istemci ikizi) birlikte güncellenmeli.
5. **Yaş kademeleri** matches tablosunda yeni bir katılım kısıtı ve join RPC'lerinde yeni guard demek.
6. **Saha sahibi başına komisyon** admin panelde yeni bir yönetim yüzeyi + fiyat hesabında yeni bir katman demek.
