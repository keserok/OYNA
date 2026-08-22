# OYNA Demo Hesapları

Bu dosya **uygulamanın giriş ekranındaki demo hesap seçicisinin canlı
kaynağıdır.** `data/demoAccounts.ts` bu dosyayı `?raw` olarak içe aktarıp
aşağıdaki tabloları ayrıştırır; giriş ekranındaki **"Demo hesapla gir"**
listesi doğrudan buradan beslenir. Bir satır ekleyip/çıkardığında (aynı
e-posta Supabase Auth'ta da mevcut olmak kaydıyla) seçicideki hesap da
otomatik değişir.

- **Ortak şifre:** `password123`
- **E-posta alanı:** tüm demo hesapları `@oyna.app` uzantılıdır.
- Hesaplar üretim Supabase projesinde (`iikvzgyccvgcybzdfwlv`) e-posta+şifre
  ile hâlihazırda gerçek hesap olarak mevcuttur (seed:
  `supabase/seeds/ordu_admin_demo_seed.sql`). Seçici, standart
  e-posta+şifre girişini kullanır — özel bir "dev modu" gerektirmez.
- Giriş sonrası yönlendirme profildeki role göre yapılır: oyuncu →
  Keşfet/Sosyal, saha sahibi → Tesis Paneli, kaleci/hakem → sağlayıcı paneli.

> **Lansman notu:** Bu seçici sergileme/demo amaçlıdır ve `main`'de aktiftir.
> Gerçek mağaza lansmanından önce kapatmak için build ortamına
> `VITE_DEMO_ACCOUNTS=false` ver (kod değişikliği gerekmez) — bkz.
> `supabaseAuth.ts › isDemoAccountPickerEnabled`.

---

## 🧹 Temiz Başlangıç (Clean Start) — zamanı geldiğinde

Lansmanda uygulamanın **sıfır demo** ile tertemiz başlaması için iki adım var:

**1) Veritabanı — tüm demo veriyi sil.**
`supabase/seeds/demo_clean_start_purge.sql` dosyasını çalıştır. Tek transaction,
idempotent ve FK-güvenlidir: 29 demo hesabı ve TÜM bağlı içeriği (maçlar, takım,
kaleci/hakem ilanları, arkadaşlıklar, cüzdan/rezervasyon kayıtları…) siler; gerçek
kullanıcılara ve saha kataloğuna **dokunmaz**. Çalıştırma yolları:

- Supabase Dashboard → **SQL Editor** → dosyayı yapıştır → **Run**, veya
- `psql "$DATABASE_URL" -f supabase/seeds/demo_clean_start_purge.sql`, veya
- bu oturumda **"demoları şimdi temizle"** de → asistan Supabase MCP ile çalıştırır.

Script sonunda doğrulama yapar: geriye demo iz kalırsa transaction'ı geri alır
(kısmi silme olmaz). Üretim şemasına karşı ROLLBACK'li kuru-çalıştırmayla test
edilmiştir (tüm demo sayaçları → 0, gerçek veri korunur).

**2) Arayüz — demo giriş seçicisini kapat.**
Build ortamına `VITE_DEMO_ACCOUNTS=false` ver ve yeniden deploy et. Böylece giriş
ekranındaki "Demo Hesabıyla Gir" listesi görünmez olur.
**Vercel notu (22 Ağu 2026 — GÜNCEL):** `buildCommand` yeniden `npm run build`.
20 Ağustos'ta inceleme paketini derliyordu; o paket demo kimliklerini herkese
açık bir adreste yayınlıyordu ve mobil karşılığı Apple tarafından 5.6 altında
reddedildi. Artık web de mobil de AYNI paketi derler. Demo seçicisini yerel
geliştirmede görmek için `VITE_DEMO_ACCOUNTS=true` yeterlidir; bu bayrak mobil
derlemede bekçi tarafından ENGELLENİR (`vite.config.ts · mobilPaketBekcisi`).

> İkisini birlikte yap: önce DB purge, sonra `VITE_DEMO_ACCOUNTS=false` deploy.
> Seed'i geri yüklemek istersen `supabase/seeds/ordu_admin_demo_seed.sql` +
> `supabase/migrations/20260713000021_social_demo_seed.sql` yeniden koşturulur.

---

## 🧪 Ekosistem seed'i — "her şey dolu" test ortamı

`supabase/seeds/demo_ekosistem_seed.sql` demo hesapları **uçtan uca test
edilebilir** hâle getirir. Ekranlar boş değil gerçekçi veriyle açılır; mağaza
öncesi AAB denemelerinde tüm sistem (cüzdan, maç yaşam döngüsü, skor, geçmiş,
saha sahibi kazancı, kaleci/hakem hakedişi) çalışır durumda görünür.

Ne kurar:

- **29 demo hesabının hepsine bakiye.** Bakiye elle yazılmaz: her hesabın
  bakiyesi kendi `wallet_transactions` satırlarının TOPLAMINA eşittir, böylece
  admin panelindeki finans raporları da tutarlı okur. Roller farklı hareket
  üretir — oyuncu `TOP_UP` + `MATCH_FEE`, saha sahibi `BOOKING_EARNING`,
  kaleci/hakem `SERVICE_EARNING`.
- **4 oynanmış maç** (`COMPLETED`, skorları girilmiş, kadroları dolu) →
  maç geçmişi, skor ekranı ve değerlendirme akışı test edilebilir.
- **5 yaklaşan maç** (`ACTIVE`, kademeli doluluk: 1'den 5'e dolu yer) →
  lobi, katılım ve yer satın alma akışı test edilebilir.

Özellikleri:

- **Yalnız demo:** sadece `@oyna.app` hesapları ve `[EKO]` önekli maçlar
  etkilenir. Gerçek kullanıcıya, gerçek maça ve saha kataloğuna dokunmaz.
- **İdempotent:** kendi ürettiği kayıtları `meta->>'seed' = 'demo_ekosistem'`
  etiketinden ve `[EKO]` başlık önekinden bulup siler, sonra yeniden kurar.
  İki kez çalıştırmak veriyi ikiye katlamaz.
- **Geri alma:** `demo_clean_start_purge.sql` bu seed'in izini de siler.

Çalıştırma: Supabase Dashboard → SQL Editor → dosyayı yapıştır → Run.

---

## Tablo formatı (ayrıştırıcı sözleşmesi)

Her hesap satırı şu dört kolonludur — **bu kolon sırasını koru**:

`| Rol | E-posta | İsim | Açıklama |`

Geçerli `Rol` değerleri: `PLAYER`, `OWNER`, `GOALKEEPER`, `REFEREE`.
`@oyna.app` içeren satırlar hesap kabul edilir; başlık/ayraç satırları atlanır.

---

## Oyuncular — PLAYER (20)

| Rol | E-posta | İsim | Açıklama |
|---|---|---|---|
| PLAYER | oyuncu01@oyna.app | Emre Kaya | Sağ Kanat · Gold · 9.1 |
| PLAYER | oyuncu02@oyna.app | Burak Demir | Orta Saha · Gold · 8.7 |
| PLAYER | oyuncu03@oyna.app | Mert Yıldız | Stoper · Gold · 8.5 |
| PLAYER | oyuncu04@oyna.app | Can Aydın | Sol Kanat · Gold · 8.9 |
| PLAYER | oyuncu05@oyna.app | Ozan Şahin | Orta Saha · Silver · 7.8 |
| PLAYER | oyuncu06@oyna.app | Deniz Arslan | Stoper · Silver · 7.5 |
| PLAYER | oyuncu07@oyna.app | Kaan Çelik | Sağ Kanat · Silver · 7.2 |
| PLAYER | oyuncu08@oyna.app | Ali Koç | Orta Saha · Silver · 7.6 |
| PLAYER | oyuncu09@oyna.app | Efe Doğan | Stoper · Silver · 7.1 |
| PLAYER | oyuncu10@oyna.app | Berk Aksoy | Sol Kanat · Silver · 7.4 |
| PLAYER | oyuncu11@oyna.app | Umut Yılmaz | Orta Saha · Bronze · 6.2 |
| PLAYER | oyuncu12@oyna.app | Serkan Öztürk | Stoper · Bronze · 5.9 |
| PLAYER | oyuncu13@oyna.app | Barış Kurt | Sağ Kanat · Bronze · 6.0 |
| PLAYER | oyuncu14@oyna.app | Tolga Erdem | Orta Saha · Bronze · 5.6 |
| PLAYER | oyuncu15@oyna.app | Onur Taş | Stoper · Bronze · 5.8 |
| PLAYER | oyuncu16@oyna.app | Cem Polat | Sol Kanat · Silver · 7.0 |
| PLAYER | oyuncu17@oyna.app | Yusuf Bulut | Orta Saha · Silver · 7.3 |
| PLAYER | oyuncu18@oyna.app | Furkan Acar | Sağ Kanat · Bronze · 6.1 |
| PLAYER | oyuncu19@oyna.app | Görkem Ateş | Stoper · Gold · 8.4 |
| PLAYER | oyuncu20@oyna.app | Sinan Yalçın | Orta Saha · Gold · 8.6 |

## Saha Sahipleri — OWNER (4)

| Rol | E-posta | İsim | Açıklama |
|---|---|---|---|
| OWNER | saha1@oyna.app | Hakan Capo | Capo Arena işletmecisi |
| OWNER | saha2@oyna.app | Kemal Olimpiyat | Olimpiyat Sahası işletmecisi |
| OWNER | saha3@oyna.app | Volkan Vip | VIP Arena işletmecisi |
| OWNER | saha4@oyna.app | Ahmet Kuru | Ahmet Kuru Tesisleri işletmecisi |

## Kaleciler — GOALKEEPER (3)

| Rol | E-posta | İsim | Açıklama |
|---|---|---|---|
| GOALKEEPER | kaleci1@oyna.app | Ahmet Çalık | Sweeper-Keeper · 8.4 |
| GOALKEEPER | kaleci2@oyna.app | Kadir Yücel | Klasik Kaleci · 7.6 |
| GOALKEEPER | kaleci3@oyna.app | Selçuk Aslan | Panter · 8.0 |

## Hakemler — REFEREE (2)

| Rol | E-posta | İsim | Açıklama |
|---|---|---|---|
| REFEREE | hakem1@oyna.app | Yusuf Korkmaz | UEFA B · Sıkı Disiplinci · 8.9 |
| REFEREE | hakem2@oyna.app | Selim Erdoğan | MHK · Oyun Yanlısı · 7.7 |
