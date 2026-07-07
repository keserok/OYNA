# Saha Sahibi Paneli — Düzeltme & Geliştirme Kataloğu

> **Tarih:** 7 Temmuz 2026 · **Amaç:** Paneli gerçek bir halı saha sahibi için "kağıt defter + WhatsApp + nakit çekmece"yi tamamen bırakacak kadar sağlam ve eksiksiz hale getirmek.
> **Kaynak:** `SAHA_SAHIBI_PANEL_DENETIM_2026-07.md` (27 kanıtlı bulgu) + `KATMAN2_SAHA_SAHIBI_COZUM_PLANI.md` (P1–P6) + yeni öneriler.
> **Etiketler:** 🐞 Düzeltme (denetim bulgusu) · 📐 KATMAN2 planlı · ✨ Yeni öneri · **Değer:** ⭐⭐⭐ kritik / ⭐⭐ yüksek / ⭐ iyi-olur.

---

## A. PARA GERÇEĞİ & GÜVEN — owner'ın OYNA'ya güvenmesinin temeli

| # | Madde | Tür | Değer | Bugün |
|---|---|---|---|---|
| A1 | **Atomik manuel rezervasyon+ödeme** — tek idempotent RPC (rezervasyon + nakit ödeme aynı transaction) | 🐞 P0 | ⭐⭐⭐ | Ayrı 2 çağrı; yarıda kesilirse "rezervasyon var, tahsilat yok" |
| A2 | **Kart self-credit deliğini kapat** — `booking_payments.source`; trigger yalnız `source='APP'` kredilendirir | 🐞 P0 | ⭐⭐⭐ | Owner kapıda kartı girse OYNA cüzdanına da kredi yazılır (çifte tahsilat) |
| A3 | **Komisyon şeffaflığı** — `commissionRate` gerçek + her para yüzeyinde brüt→komisyon→net kırılımı | 🐞 P0 | ⭐⭐⭐ | `commissionRate: 0` sabit; "NET KAZANÇ"tan komisyon düşülmez |
| A4 | **Sahte ₺12.500 bakiye mock'unu kaldır** | 🐞 P0 | ⭐⭐ | Demo/mock tesiste uydurma bakiye |
| A5 | **İade → owner kazanç geri-alma** (`reverse_booking_earnings`) | 🐞 P0 | ⭐⭐⭐ | İptalde owner kazancı geri alınmıyor olabilir (doğrulanmalı) |
| A6 | **3-kova mutabakat şeridi** — [💵 Nakit sende] [💳 Kartta bekleyen · çözülme tarihi] [✅ Çekilebilir] | 📐 P3 | ⭐⭐⭐ | Tek "NET KAZANÇ" kutusu; nakit/kart/çekilebilir karışık |
| A7 | **Kayıtlı IBAN / payout hesabı (SSOT)** — her çekimde IBAN yazma derdi biter | 📐 P3 | ⭐⭐ | IBAN her çekimde elle |
| A8 | **Haftalık otomatik payout (Pazartesi)** + HOME'da "Sıradaki ödeme: Pzt X · ₺Y → TR…" | 📐 P3 | ⭐⭐⭐ | Manuel talep + admin onayı; otomatik yok |
| A9 | **%0 ilk-30-gün komisyonu gerçekten uygula** + kırılımda "%0 → ₺0" satırı | 📐 P3 | ⭐⭐ | Onboarding'de vaat var, kodda yok |
| A10 | **Hesap ekstresi export (CSV/PDF)** — muhasebe/vergi | ✨ | ⭐⭐ | Yok |
| A11 | **Bekletme 14→7 gün** (güven kolu) | 📐 P3 | ⭐ | 14 gün |

## B. REZERVASYON & TAKVİM OPERASYONU — günlük işin kalbi

| # | Madde | Tür | Değer | Bugün |
|---|---|---|---|---|
| B1 | **Çok-kort TESİS görünümü** (satır=saat, sütun=kort, renk-kodlu) | 🐞 P1 / 📐 P4 | ⭐⭐⭐ | Tek kort × tek gün |
| B2 | **HAFTA görünümü + doluluk ısı haritası** | 📐 P4 | ⭐⭐ | "Aylık" aslında abonman listesi |
| B3 | **Çok-saatlik rezervasyon tüm saatleri kaplasın** (çifte-satış kapanır) | 🐞 P1 | ⭐⭐⭐ | 2 saatlik kiralamanın 2. saati "BOŞ" görünür |
| B4 | **Gerçek doluluk %** (08:00-24:00 operasyon penceresi payda) | 🐞 P1 | ⭐⭐ | `sayı/24` ve `sayı/16` uydurma formül |
| B5 | **Esnek manuel rezervasyon** — süre (60-180dk), kapora %25/%50/Tam/Özel, Nakit/Kart/Havale, fiyat override | 🐞 P2 / 📐 P6-B | ⭐⭐⭐ | Sabit 1 saat / %25 / CASH |
| B6 | **Servis katmanı TZ düzeltmesi** — gece yarısı sonrası doğru gün | 🐞 P1 | ⭐⭐ | `pitchOwnerService.todayISO()` UTC |
| B7 | **Auto-approve'u sunucuya taşı** — ekran kapalıyken de çalışsın, toggle'a uysun | 🐞 P1 | ⭐⭐⭐ | İstemci sayacı; toggle'ı yok sayar, kapalı ekranda hiç tetiklenmez |
| B8 | **Realtime kanal çakışmasını gider** (benzersiz topic) | 🐞 P1 | ⭐⭐ | İki bileşen aynı kanala abone |
| B9 | **"Alınıyor" (slot hold) canlı nabzı** — oyuncu tam alırken telefonla çifte satışı önle | 📐 P4 | ⭐⭐ | Gösterilmiyor |
| B10 | **Boş hücreye tek-dokunuş hızlı rezervasyon** (TESİS modu) | 📐 P4 | ⭐⭐ | Yalnız GÜN modunda |
| B11 | **Tekrarlayan slot kapatma** (her Pzt bakım) düzgün render | 📐 P4 | ⭐ | Render edilmiyor |
| B12 | **Rezervasyon detayı**: tarih + telefon + süre + "Oluşturan: …" | 📐 P6 | ⭐ | Eksik alanlar |

## C. MÜŞTERİ & İLETİŞİM — müdavim yönetimi + no-show azaltma

| # | Madde | Tür | Değer | Bugün |
|---|---|---|---|---|
| C1 | **Müşteri (müdavim) defteri** — `pitch_customers` + telefon/ad autocomplete | 📐 P6-B | ⭐⭐ | Her rezervasyonda elle isim |
| C2 | **WhatsApp rezervasyon hatırlatması** ("yarın 20:00 maçınız") | ✨ | ⭐⭐⭐ | Yok — no-show'un ana kaynağı |
| C3 | **Makbuz/fiş paylaşımı** (WhatsApp text receipt, sıfır bağımlılık) | 📐 P5 | ⭐⭐ | Yok; `pdfkit` ölü bağımlılık |
| C4 | **No-show takibi + kapora yakma kuralı** | ✨ | ⭐⭐ | Yok |
| C5 | **Müşteri 360** (kaç maç, borç, iptal oranı, son geliş) | ✨ | ⭐ | Yok |
| C6 | **"Geçen haftanın aynısı" tek-dokunuş tekrar rezervasyon** | ✨ | ⭐⭐ | Yok |

## D. FİNANS & MUHASEBE DERİNLİĞİ

| # | Madde | Tür | Değer | Bugün |
|---|---|---|---|---|
| D1 | **Kantin-lite POS** — ürün grid → Nakit/Kart/Veresiye, 3-tık | 📐 P5 | ⭐⭐ | Yok (yalnız amenity checkbox) |
| D2 | **Veresiye v2** — append-only defter, kalem-bazlı, kısmi ödeme, `tel:` linki | 📐 P5 | ⭐⭐ | Tek düz tutar; kısmi ödeme yok |
| D3 | **Aylık kâr-zarar** komisyon dahil netleştirme | 🐞 P0 (A3) | ⭐⭐ | Komisyon düşülmüyor |
| D4 | **Finans hata durumunu görünür kıl** (yutma kaldır) | 🐞 P2 | ⭐ | Hata → sessiz sıfırlar |
| D5 | **Tutar formatları tutarlı** (`toLocaleString`) | 🐞 P2 | ⭐ | Borç tutarı formatsız |
| D6 | **Kantin cirosu ayrı kova** (tahakkuk/nakit karışmasın) | 📐 P5 | ⭐ | Yok |

## E. EKİP & YETKİ

| # | Madde | Tür | Değer | Bugün |
|---|---|---|---|---|
| E1 | **Personel gerçek login** — saha-kapsamlı, davet kodu, RESEPSIYON/MUDUR | 📐 P6-A | ⭐⭐ | Kayıt var, login yok → şifre paylaşımı |
| E2 | **Rol-bazlı ekran kapsamı** — personel finans/payout/cüzdan görmez | 📐 P6-A | ⭐⭐ | Yok |
| E3 | **"Oluşturan: Ahmet" denetim izi** | 📐 P6-A | ⭐ | Yok |

## F. DAYANIKLILIK & MİMARİ SAĞLIK

| # | Madde | Tür | Değer | Bugün |
|---|---|---|---|---|
| F1 | **Offline outbox** — internet kesikse rezervasyon kaybolmaz + kuyruk chip'i | 📐 P1 | ⭐⭐⭐ | Yazma kaybolur; `OfflineBanner` pasif |
| F2 | **Offline takvim snapshot** — çevrimdışı son durum + kuyruk overlay | 📐 P1 | ⭐⭐ | Hata → tüm slotlar yalancı "BOŞ" |
| F3 | **Panel kilidini faturadan ayır** — çekirdek ASLA kilitlenmez, yalnız admin `ops_locked` | 🐞 P2 | ⭐⭐⭐ | `isReadOnly` faturaya bağlı ~20 guard |
| F4 | **Ölü abonelik/SaaS/plan-yükselt ekranlarını sök** | 🐞 P2 | ⭐⭐ | `OwnerSubscriptionModal`/`OwnerUpgradeGate`/SaaS banner kalıntı |
| F5 | **OwnerPanel monolitini modülerleştir** (`OwnerCalendarView` extraction) | 🐞 P3 / 📐 P4 | ⭐⭐ | 2341 satır tek dosya |
| F6 | **Sorgu optimizasyonu** (finans dashboard N+1/tam-tablo) | ✨ perf | ⭐ | last-100 booking + payment join |

## G. GO-LIVE & VİTRİN — owner'ın oyuncuya görünmesi

| # | Madde | Tür | Değer | Bugün |
|---|---|---|---|---|
| G1 | **Şeffaf go-live checklist** — onay/tarife/foto/IBAN/saat madde madde + SLA sayacı | 📐 P6-C | ⭐⭐ | Sessiz admin onayı, opak |
| G2 | **Onboarding yalan vaatlerini gerçeğe hizala** (en son) | 🐞 P2 | ⭐⭐⭐ | "her Pazartesi otomatik" + "%0" yalanı |
| G3 | **Owner ayarları oyuncuya doğru yansısın** (fiyat/saat/foto vitrin tutarlılığı) | ✨ cross | ⭐⭐ | Doğrulanmalı |
| G4 | **Ölü-saat promosyonu / flash deal güçlendir** (boş saatleri doldur) | ✨ | ⭐ | Flash deal var, hedefleme zayıf |
| G5 | **Değerlendirmelere owner yanıtı** | ✨ | ⭐ | Yok |

## H. PANEL DENEYİMİ & ERİŞİM

| # | Madde | Tür | Değer | Bugün |
|---|---|---|---|---|
| H1 | **Web/masaüstü responsive + sidebar** (`app-size-costs` branch'inden devşir) | ✨ | ⭐⭐ | Yalnız mobil düzen |
| H2 | **Bildirim tercihleri granülaritesi** (yeni rez./iptal/payout ayrı) | ✨ | ⭐ | Tek toggle |
| H3 | **Panel içi owner bildirim merkezi** | ✨ | ⭐ | Genel merkez |
| H4 | **Erişilebilirlik / mobil taşma cilası** | ✨ | ⭐ | Nokta düzeltmeler |

---

## Sıralama Mantığı (bağımlılık-sıralı, güvenli)

1. **Önce görünmez para & güvenlik** (A1-A5, B6, B7, F3) — kullanıcı hiç fark etmeden parayı ve güvenliği düzeltir; riski düşük, değeri en yüksek.
2. **Sonra görünür güven** (A3, A6-A9, F4, G2) — "panelim kilitlenmez, param net, vaat = gerçek".
3. **Tesis operasyonu** (B1-B5, B8-B12, C1) — "kağıt ızgaramdan iyi".
4. **Dayanıklılık** (F1, F2) — "internet kesildi, kaybolmadı".
5. **Defterin kalanı** (C2-C6, D1-D6) — "kağıt defteri çöpe attım".
6. **Ekip + cila** (E1-E3, G1, G3-G5, H1-H4).

Her adım **feature-flag** arkasında, eklemeli + idempotent migration, geri-dönüş = bayrağı kapatmak.
