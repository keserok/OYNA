# OYNA — LANSMAN PLANI (ödemeli)

> **Tarih:** 16 Ağustos 2026 · **Durum:** YÜRÜRLÜKTE — tek yol haritası
> **Karar:** Kurucu, ödemeli lansmana karar verdi: **kart kaporası + karta iade,
> cüzdansız** (`OYNA_PRENSIPLER.md` §2.10–2.11). Bu plan, GEÇERSİZ damgalı
> `5_GUNLUK_CIKIS_PLANI.md`'nin (ödemesiz "Nakit Mod" öngörüyordu) yerine geçer.
> O plandaki mağaza kuralı doğrulamaları ve çürütülmüş-engelleyici listesi hâlâ
> geçerli kaynaktır; iş sırası ise artık buradadır.

---

## 0 · Lansmanın ürün tanımı (ne ile çıkıyoruz)

| Alan | v1 (lansman) | Sonrası |
|---|---|---|
| Maç kurma | Kapora **karttan** tahsil (yayında) · maç dolunca fazlası karta iade · kadro eşiği, son çağrı, kesin karar akışları | — |
| Maça katılım | Slot ücreti **karttan** (3DS uygulama içinde) · ayrılma iadesi kademeli, karta | — |
| Saha kiralama | Kapora **karttan** · kalan tesiste · iptal iadesi kademeli (varsayılan ≥24s %100 · 6–24s %50 · <6s yok), **karta** ve PSP kesintili | — |
| Cüzdan | **YOK** — kullanıcı adına bakiye tutulmaz (6493 kararı) | Ancak lisanslı modelle + kurucu kararıyla |
| Kaleci / hakem | Vitrin açık, **kiralama "çok yakında"** (kartlı emanet yazılınca açılır) | v1.1 |
| Slot vitrini | Saha bazlı **listeleme saat sınırı**: sahibin belirlediği saate kadar; akşamı elle yönetir | Pazarlıkla saha saha genişler |
| Bölge | Ordu (anlaşmalı ilçeler — prensip 1.2) | İlçe ilçe |

**İade kuralı (kurucu, 16 Ağu 2026):** Kapora iadeleri hem maçta hem sahada
varsayılan **24 saat** serbest-iptal penceresine bağlıdır ve iadeye **ödeme
altyapısı kesintisi yansıtılır**. Maç dolunca dönen kapora fazlası ise
kesintisizdir (iptal değil, tasarlanmış akış).

---

## 1 · Kod tarafı: BİTTİ sayılanlar (bu depoda hazır)

- Cüzdan tüm yüzeylerden kaldırıldı; sunucu kapıları kilitli (`20260905000001`).
- Saha bazlı listeleme saat sınırı: ızgara + yazım bekçisi + sahip/admin ayarı (`20260905000002`).
- **Kart kaporası motoru** (`20260905000003`): maç yayında `AWAITING_PAYMENT` →
  kart tahsilatı → `BLOCKED` + kaptan kadroda; 30 dk'da ödenmezse süpürücü maçı
  ve rezervasyonu iptal eder (para çekilmez).
- **Karta iade kuyruğu**: tüm iade yazarları (maç iptali, ayrılma, slot iadesi,
  rezervasyon iptali, kademeli iade, kapora çözme) karta iadeye bağlandı;
  kuyruk cron'u 5 dakikada bir iyzico'ya taşır, 3 denemede geçmeyen satır
  FAILED durur (insan bakar). Eski cüzdan-emanet kayıtları eski davranışla
  (iade kredisi) korunur.
- Ödeme ucu fail-closed: sağlayıcı bilinçli seçilmemişse hiçbir tahsilat yolu
  çalışmaz; hayalet "Kartla" kazançları tamamen kapatıldı.

**Canlı işlemler — YAPILDI (17 Ağu 2026 gecesi):**

1. ✅ 8 göç canlıda (`20260905000001..8` — 3 karar göçü + gece testinin
   bulduğu 5 onarım; her biri kendi doğrulamasını geçti).
2. ✅ Üç uç yayınlandı: `create-payment` v11 · `refund-payment` v7 ·
   `iyzico-3ds-callback` v6. Karta iade cron'u canlıda ÇALIŞIYOR
   (5 dk'da bir; zehirli satır 3 denemede FAILED durur — kanıtlandı).
3. ⚠️ `PAYMENT_PROVIDER` uçlarda **IYZICO** olarak ayarlı bulundu (eski
   kurulum). SIMULATION duman provası bu yüzden veritabanı katmanında
   yapıldı (apply_card_payment doğrudan) ve GEÇTİ. Uçtan uca simülasyon
   istersen: Supabase paneli → Edge Functions → Secrets →
   `PAYMENT_PROVIDER=SIMULATION` (test bitince IYZICO'ya geri).
4. ⚠️ İade PSP kesintisi `settings.refund_psp_fee_pct = %2,5` yapıldı
   (0'dı — kesinti kararın ölü kalıyordu). iyzico sözleşmesi imzalanınca
   GERÇEK orana güncelle (Faz B-2 ile birlikte).

**Lansmana kadar bekleme duruşu (gece sonu geri alındı):**
`payment_mode_global=CASH_ONLY` + `match_deposit_enabled=false` — kart günü
gelene dek hiçbir yüzey online tahsilat teklif etmez, maçlar kaporasız
kurulur (ödeme ekranına çıkmaz, süpürücüye düşmez).

---

## 2 · Fazlar

Her satır: **[K]** kurucu işi · **[G]** geliştirici (Claude) işi · **[B]** birlikte.

### FAZ A — Altyapıyı canlıya bağla (1 gün)

1. **[B] Göçleri canlıya uygula** — 3 dosya, sırayla; her biri kendi
   doğrulamasını taşır, biri durursa hiçbir şey yarım kalmaz.
2. **[B] Edge fonksiyonlarını yayınla** (`create-payment`, `refund-payment`,
   `iyzico-3ds-callback`) ve `PAYMENT_PROVIDER=SIMULATION` ile duman testi:
   maç kur → kapora ekranı → simülasyon kartıyla öde → kaptan kadroda mı? →
   maçı iptal et → iade kuyruğu DONE mı?
3. **[G] Sağlık kontrolü ekle**: karta iade kuyruğunda FAILED satır varsa
   panel kırmızı yansın (K-PARA ailesine yeni kontrol).
4. **[K] Ahmet Kuru 2. Saha 0 ₺ tarifesini düzelt** (gerçek fiyatı söyle,
   panelden girilir) — 0 ₺'lik tarife kapora hesabını da bozar.

### FAZ B — Gerçek para hattı (kurucu ağırlıklı, 1–2 hafta paralel)

1. **[K] Şirket + iyzico sözleşmesi/KYC** — gerçek kart tahsilatının ön şartı.
2. **[K] iyzico canlı anahtarları** Supabase Vault/env'e; `IYZICO_BASE_URL`
   üretim; webhook/callback adresi iyzico paneline.
3. **[B] İlk gerçek kart işlemi (STR-3)**: kurucunun kartıyla küçük tutar —
   ödeme → iade → ekstre teyidi. Üç tur bu altyapıyı okudu; **hiçbiri
   çalıştırmadı** — canlıya güven bu adımla kazanılır.
4. **[K] Sözleşme metinleri avukat turu** — kurucu kararı: uygulama tamamlanınca
   bakılacak. İçerik hedefi hazır: iadeler ödeme yöntemine (karta) döner,
   cüzdan rejimi (md. 6.5) kalkar, PSP kesintisi istisnası korunur.
5. **[K] ETBİS kaydı** (6563 — aracı hizmet sağlayıcı).

### FAZ C — Mağaza hattı (Play sayacı yüzünden EN ERKEN başlar)

> Eski planın §0 doğrulaması hâlâ geçerli: Play **kişisel** hesapta production
> öncesi **12 tester × 14 kesintisiz gün** kapalı test zorunlu → Android yayını
> sayacın başlamasından ~26 gün sonra. iOS ~8–12 gün. **Sayaç bugün başlarsa
> takvim bugün kısalır.**

1. **[B] İmzalı AAB + kapalı test** (keystore → `VITE_DEMO_ACCOUNTS=false` build
   → Play Console closed testing) — eski planın Gün-0 adımları geçerli.
2. **[K] 16–18 tester** topla ve WhatsApp'ta tut (12'nin altı sayacı sıfırlar).
3. **[B] iOS duman derlemesi** Mac'te (Podfile.lock riski) → TestFlight.
4. **[B] Mağaza vitrini**: ekran görüntüleri, feature graphic, metinler,
   Data Safety/Privacy Labels, **EA/FIFA temizliği**, incelemeci hesapları,
   `PrivacyInfo.xcprivacy` — eski planın Gün 3–4 listesi geçerli.
5. **[G] App Review notu ödemeli gerçeğe göre**: "Uygulama içi ödeme fiziksel
   hizmet (saha/maç) bedelidir; dijital ürün satışı yoktur (3.1.5(a))."

### FAZ D — Lansman günü anahtarları (yarım gün, sıralı)

1. `demo_mode_enabled = false` + demo verisi purge (**1. madde** — CPO-P0-1).
2. Demo hesap seçici fail-closed + `?demo=1` arka kapısı kaldır **[G]** (eski
   planın Gün-2 maddeleri — hâlâ açık).
3. Ödeme anahtarları (Faz B bitmiş olmalı, ÜÇÜ BİRLİKTE açılır):
   `PAYMENT_PROVIDER=IYZICO` (uçlarda zaten ayarlı — anahtarların gerçek
   olduğunu Faz B-3 STR-3 kanıtlar) · `payment_mode_global` kararı: kart
   canlı → `ONLINE_ONLY` (veya saha saha `HYBRID`) ·
   **`match_deposit_enabled=true`** (kart kaporası motoru bununla açılır;
   kapalıyken maçlar kaporasız kurulur).
4. Bildirim izni akışı (CPO-P0-8) + `push_live_enabled` (APNs/FCM hazırsa).
5. Alarm e-postası (Resend anahtarı) — bozulunca kurucuya ulaşsın.
6. Sızmış parola koruması (Supabase panelinde 5 dk).
7. Saha anlaşmaları panele: her sahanın **komisyon + iptal saatleri +
   listeleme sınırı** — anlaşma neyse panel onu söylesin.

### FAZ E — Lansman sonrası ilk hafta

- Karta iade kuyruğu ve para değişmezleri her gün panelden izlenir.
- Kaleci/hakem kartlı emanet akışı (v1.1) tasarlanır — "çok yakında" düğmesi
  gerçeğe dönüşür.
- Bölge göçü (Singapur → Frankfurt) planlanır: kesinti ister, kurucu katılımı
  şart; KVKK yurt dışı aktarım notu (tedarikçi envanteri) güncellenir.
- Mekanizma betikleri (`etki` · `kapsam` · `surum`) yeniden yazılır
  (README'deki not kapanır).

---

## 3 · Bilinçli riskler (lansmana taşınanlar)

| Risk | Niye kabul | Emniyet |
|---|---|---|
| Kapora ödemesi 3DS'te yarıda kalırsa maç 30 dk "kapora bekliyor" görünür | Kart akışı eşzamansız — atomik blokaj kartla imkânsız | Süpürücü 30 dk'da iptal eder, slot açılır, para çekilmez |
| Karta iade anlık değil (5 dk kuyruk + banka süresi) | DB, PSP'yi eşzamanlı çağıramaz | Kuyruk + FAILED alarmı + destek metinleri "iade ediliyor" der |
| Kaleci/hakem kiralaması kapalı çıkıyor | Kartlı emanet yazılmadan açmak hayalet ödeme demekti | Vitrin açık, "çok yakında" dürüst; v1.1 ilk iş |
| Akşam envanteri vitrine sınırlı girer | Saha sahibi pazarlığının bilinçli tavizi (2.11) | Elle yönetim + "1-2 akşam slotu pilot" pazarlığı |
| Testlerin tip kontrolü hâlâ gevşek (K-15.2) | Kullanıcı getirmez; lansman sonrası | Her raporda hatırlatılır |

---

## 4 · Tek bakışta "bugün ne yapmalı?"

1. Göçler + uçlar canlıya (Faz A-1/2) → simülasyonda uçtan uca kapora provası.
2. Play kapalı test sayacını BAŞLAT (Faz C-1/2) — takvimi tek başına bu belirliyor.
3. iyzico sözleşme sürecini AÇ (Faz B-1) — kart günü bunu bekleyecek.
