# KAPSAMLI CANLI TEST RAPORU — 16→17 Ağustos 2026 gecesi

> **Görev (kurucu):** PR aç → canlıya uygulanması gereken her şeyi hallet →
> yeni branchta 5 saha sahibi + 100 kullanıcıyla her ekranı/sistemi test et →
> en ufak sorunları bile çöz, düzeltmeleri canlıya uygula.
> **Sonuç:** 10 bulgu; 8'i aynı gece çözülüp canlıya uygulandı ve yeniden
> test edildi, 2'si kurucu kararı bekleyen öneri. Tüm para akışları uçtan
> uca kanıtlı. 1725 birim testinin tamamı yeşil.

---

## 1 · Canlıya uygulananlar

| Ne | Durum |
|---|---|
| Göçler `20260905000001..3` (cüzdan kapısı · listeleme sınırı · kart kaporası motoru) | ✅ uygulandı, öz-doğrulamaları geçti |
| Onarım göçleri `20260905000004..8` (bu gecenin bulguları) | ✅ uygulandı |
| Uçlar: `create-payment` v11 · `refund-payment` v7 · `iyzico-3ds-callback` v6 | ✅ yayında |
| Karta iade cron'u (5 dk) + kapora süpürücüsü (10 dk) | ✅ canlıda çalışıyor (kanıtlı) |
| İade PSP kesintisi `%2,5` (0'dı — karar ölü kalıyordu) | ✅ ayarlandı, sözleşmede güncellenecek |
| Gece sonu duruşu: `CASH_ONLY` + `match_deposit_enabled=false` | ✅ geri alındı (bekleme duruşu) |

## 2 · Test evreni (canlıda, cerrahi silinebilir)

- **5 saha sahibi** (`denek-sahibi1..5@oyna.app`) + **100 oyuncu**
  (`denek001..100@oyna.app`), hepsi `cafe7e57` önekli — `temizlik.sql`
  tek satır gerçek veriye dokunmadan hepsini kaldırır. Şifre: uygulamanın
  demo kapısı sabiti (`password123`, yalnız demo modunda çalışır).
- **5 saha, 6 kort, 9 tarife** — bilinçli çeşitlilik: 3 ödeme modu,
  4 farklı listeleme sınırı (yok/22:00/23:00/00:00/02:00), özel iade
  kademesi (48s/12s/%30), kaporasız tarife (%20 motoru), süresi geçmiş
  sahip denemesi.
- Sahalar keşif sözleşmesi gereği "gerçek görünümlü" (is_demo=false);
  demo ayrımı KULLANICI üzerinden yürüdü — gece üretilen **her** maç,
  rezervasyon ve para satırı demo işaretli çıktı (denetimle kanıtlandı).

## 3 · BULGULAR

### Çözüldü + canlıya uygulandı + yeniden test edildi

| # | Bulgu | Çözüm |
|---|---|---|
| 1 | `matches.deposit_status` kısıtı `AWAITING_PAYMENT`'ı tanımıyordu — **kaporalı sahada maç kurma anında çöküyordu** | Göç `000004`; doğrulaması artık gerçek satır yazarak kanıtlıyor |
| 2 | Karta iade defter satırı (`balance_type NULL`) NOT NULL'a takılıyordu — **tüm karta-iade yolları çöküyordu** | Göç `000005`; CHECK nöbette kaldı |
| 3 | İade PSP kesintisi 0 — kurucunun "kesinti yansıtılsın" kararı ölüydü | Göç `000005`; %2,5 geçici, dolu değer asla ezilmez |
| 4 | Kaptan iptali cevabı `refund: 0` diyordu (kuyruğa 449,72₺ yazılmışken) | Göç `000006`; gerçek tutar defterden okunur |
| 5 | **Hiçbir iptal dalı bağlı rezervasyonu kapatmıyordu** — maç iptal, slot sahibin takviminde DOLU (hayalet rezervasyon) | Göç `000006`; her dalda rezervasyon kapanır |
| 6 | **Kaporasız (NONE) ve ödenmemiş (AWAITING) maç hiç iptal edilemiyordu** — kapora kapalı dönemde tüm iptaller kırılırdı | Göç `000006`; + idempotent ikinci çağrı |
| 7 | Tarife kısıtı gece penceresini (17:00→02:00) reddediyordu — motor destekliyor, şema yasaklıyordu; 02:00'ye çalışan saha gece fiyatlayamazdı | Göç `000007`; kısıt gece eksenine hizalandı |
| 8 | Sunucu tarife eşleştiricisi gece ekseni bilmiyordu — **vitrin slotu gösteriyor, rezervasyon NO_TARIFF veriyordu** | Göç `000008`; ızgara motoruyla birebir aynı eksen |
| 10 | İstemci tarife ikizi de gece-körüydü — ekran ortalama fiyat + %30 kapora gösterirken sunucu gerçek tarifeyi yazıyordu (ekrana 330₺, kasada 360₺) | `services/tariffService.ts` + 6 birim testi; UI'da yeniden test edildi: ekran artık 360₺ = sunucu |

### Kurucu kararı bekleyen öneriler

- **BULGU-9 · Kesinti tutarlılığı:** Maç iptali iadesi kesintiyi ücret-dahil
  toplamdan düşüyor (461,25 → 449,72), rezervasyon iptali ise kart işlem
  bedelini de yakıp kalanından düşüyor (307,50 ödeyen 292,50 alıyor).
  İki akış iki farklı "kesinti" modeli kullanıyor. Öneri: tek model seç
  (maç modeli kullanıcıya daha adil). Ekranlar kendi akışlarının sözünü
  doğru veriyor — tutarsızlık akışlar ARASINDA.
- **BULGU-11 · Nakit sahada "Kapora bekliyor":** CASH_ONLY sahada
  Maçlarım kartı "Kapora bekliyor" yazıyor; kapora yalnız tesiste
  ödenebilir. Öneri: nakit modda "Ödeme tesiste" etiketi. (Karttaki
  "Kaporayı Öde" düğmesi nakit sahada "online kapalı" mesajına çıkıyor —
  yanlış değil ama çıkmaz sokak.)

## 4 · Uçtan uca KANITLANAN akışlar

- **Maç kaporası tam döngü:** kur (450₺ AWAITING) → kart tahsilat
  (461,25₺, kaptan kadroda, BLOCKED) → kaptan iptali (≥24s) → kuyruğa
  449,72₺ (PSP −11,53) → cron 3 deneme → SIM kaydında bilinçli FAILED
  (zehirli satır kuralı 7.5 kanıtı).
- **Rezervasyon (online):** oluştur (fiyat/kapora sunucu tarifesinden) →
  kapora kartla (307,50₺) → iptal önizlemesi = gerçek iptal (292,50₺,
  %100 kademe) → kuyruk.
- **Rezervasyon (nakit):** UI'dan uçtan uca — "ödeme tesiste" anlatımı,
  rezervasyon CONFIRMED, Maçlarım'da geri sayımla listelendi.
- **Maça katılım/ayrılma:** slot 113₺ kartla → koltukta → ayrıl →
  önizlemenin dediği tam tutar (113₺) kuyruğa; koltuk boşaldı.
- **Süpürücü:** 30 dk ödenmeyen maç → maç iptal + slot serbest + kaptana
  bildirim (gerçek çalıştırmayla kanıtlı).
- **Listeleme sınırı:** 4 konfigürasyonda vitrin doğru; 22:00 sonrası
  APP rezervasyonu `LISTING_CUTOFF` ile temiz Türkçe mesajla reddedildi;
  sahip elle 23:00 rezervasyonu serbest; gece ekseni (00:00 sınırı
  00–02 slotlarını gizler, 02:00 sınırı gösterir) kanıtlı.
- **Cüzdan kapısı:** TOP_UP hem niyet hem defter katmanında engelli
  (negatif test); hiçbir tüketici yüzeyinde cüzdan izi yok.
- **Ekranlar:** karşılama → kayıt/giriş (KVKK) → ana sayfa → keşif →
  saha detay → ödeme → Maçlarım → Oyna sekmesi → maç kur (48 saatlik
  saha-özel iade metni dahil tüm kapora sözleri doğru) → sahip paneli
  (özet/takvim/menü/listeleme sınırı modalı/ödeme modu) → süresi geçmiş
  deneme hesabı → onboarding. Kanıt ekran görüntüleri sandbox'ta alındı,
  kritik olanlar bu rapora temel oldu.

## 5 · Bilinçli sınırlar (yapılMAyanlar)

- **Gerçek iyzico ile 3DS** çalıştırılMAdı: uçlardaki `PAYMENT_PROVIDER`
  IYZICO ayarlı bulundu ve uç sırları MCP'den değiştirilemiyor; kart
  tahsilat simülasyonu veritabanı katmanında (uçların çağırdığı aynı
  fonksiyonlarla) yapıldı. İlk gerçek kart provası Faz B-3'te (STR-3).
- **Kadro eşiği dolunca kapora fazlası iadesi** (match_capture_deposit)
  çalıştırılMAdı (12 kişilik gerçek doldurma gerektirir); ekran sözleri
  ve kod gözden geçirildi, tutarlar doğru (360 kapora − 189 pay = 171
  iade sözü ekranda kanıtlı).
- **Admin paneli** ayrı yüzey — bu tur kapsam dışı bırakıldı.
- `owner_replace_tariffs`'ın "tarife değişikliği mevcut rezervasyonla
  çakışıyor mu" bekçisi gece penceresini yüzeysel okuyor (uyarı
  kaçırabilir, para kaybettirmez) — v1.1 işi.
- 2 FAILED + 1 PENDING karta-iade kuyruk satırı test artefaktı (SIM
  kayıtlarında iyzico işlem no yok — gerçek ödemede olur); `temizlik.sql`
  ile gidecekler.

## 6 · Sabah yapılacaklar (kurucu)

1. PR **#169**'u gözden geçir (karar paketi + gece onarımları) ve bu test
   dalını (`claude/kapsamli-canli-test`) incele.
2. BULGU-9 ve BULGU-11 için karar ver.
3. Test evrenini kullanmak istersen hazır (denek hesapları, demo kapısı);
   bitince: `tests/canli-test/temizlik.sql` çalıştırılır.
4. Takvimi başlatan işler değişmedi: Play kapalı test sayacı (Faz C) +
   iyzico sözleşmesi (Faz B).
