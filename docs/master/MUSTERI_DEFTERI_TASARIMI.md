# Müşteri (Müdavim) Defteri — Tasarım Kararları ve Kurulum Planı

**Tarih:** 9 Ağustos 2026 · **Karar sahibi:** kurucu (soru-cevap turu)
**Durum:** ✅ **KURULDU ve CANLIYA UYGULANDI** (aynı gün, kurucu onayıyla)
**Canlı kanıt:** migration `20260906000000` deftere işlendi · defter 9 müşteriyle
doğdu (5 telefonlu + 4 "telefonu eksik", 0 demo; 25 ham kayıt tekilleşti) ·
4 RLS politikası aktif · kimliksiz `musteri_karti` çağrısı UNAUTHORIZED aldı.
**Kaynak ihtiyaç:** `SAHA_SAHIBI_PANEL_IYILESTIRME_KATALOGU.md` C1 (+ C5 müşteri 360, + C6 tekrar rezervasyon)

> Amaç: "Bu adam kim, kaç kere geldi, borcu var mı?" sorusunun tek cevabı olsun.
> Bugün ad-telefon her rezervasyonda elle yazılıyor; veresiye ve abonman
> müşterileri ayrı listelerde, birbirinden habersiz duruyor.

## Kurucu kararları (8 soru — 9 Ağustos 2026)

| # | Konu | Karar |
|---|---|---|
| 1 | Kayıt oluşumu | **Kendiliğinden + elle.** Manuel rezervasyon, veresiye ve abonmanda yazılan ad+telefon deftere kendiliğinden işlenir (aynı telefon = aynı kişi); elle ekleme de var. |
| 2 | Geçmişten doldurma | **Evet.** Bugüne kadarki kayıtlardan bir kerelik tarama ile defter dolu başlar. |
| 3 | Kapsam | **Tam paket.** Otomatik tamamlama + aranabilir liste + müşteri kartı. |
| 4 | Personel erişimi | **Evet.** Kasadaki personel öneriyi ve kartı kullanır (banka/çekim zaten sahip-özel). |
| 5 | Giriş yeri | **Menü → "Müşteriler".** Alt çubuk 5 sekmede kalır. |
| 6 | Kart içeriği | **Gelmedi/iptal sayıları DA görünür** — kapora kararının dayanağı. |
| 7 | Tekrar rezervasyon | **Pakete dahil.** Karttan "Tekrar rezerve et": son rezervasyonun aynısı +7 gün, form önden dolu, çakışma uyarılı. |
| 8 | Telefonsuz eski kayıtlar | **Onlar da girer** — "telefonu eksik" işaretiyle; telefon eklenince geçmişi birleşir. |

## Nasıl kurulacak

### 1 · Veritabanı (yeni migration DOSYASI — canlıya uygulama kurucu onayıyla, CLAUDE.md §2)
- **`pitch_customers`** tablosu: `pitch_id · name · phone` (normalize edilmiş) `· phone_missing
  işareti · is_demo · created_by`; telefonlular için `UNIQUE(pitch_id, phone)`.
- **RLS:** erişim `pitch_access_level` modeliyle — sahip/müdür/personel okur-yazar,
  silme yalnız sahip+müdür; başka tesis ve oyuncular hiçbir satırı göremez.
- **Tetikleyiciler:** `pitch_bookings` / `pitch_debtors` / `pitch_subscriptions`
  kayıtlarında ad+telefon deftere upsert (aynı telefon = aynı kişi; ad güncellenir).
- **Geriye dönük doldurma:** aynı migration içinde bir kerelik tarama (karar 2 ve 8).
- **RPC'ler:** `search_pitch_customers` (öneri) · müşteri kartı özeti (rezervasyon
  sayısı, gelmedi/iptal, veresiye bakiyesi, son geliş, son rezervasyon).

### 2 · Uygulama
- **Öneri:** takvimdeki hızlı rezervasyon formunda ad/telefon yazarken öneri düşer;
  seçince iki alan da dolar.
- **Menü → Müşteriler:** ada/telefona göre aranabilir liste; telefonu eksikler işaretli.
- **Müşteri kartı:** istatistikler + rezervasyon geçmişi + veresiye köprüsü +
  WhatsApp/arama + "Tekrar rezerve et".

### 3 · Kanıt kapısı
tsc temiz · birim testleri yeşil · migration canlıya uygulandığında impersonation
testi (personel ✓ okuma-yazma · yabancı ✗).

**KVKK notu:** Defter tesise özel işletme kaydıdır; yalnız o tesisin ekibine
görünür. Oyuncu uygulaması bu veriye hiçbir yerden erişemez.
