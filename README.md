# ⚡ OYNA

**Halı saha rezervasyon platformu.** Çift taraflı pazar: saha sahipleri ↔ oyuncular.
Ana vaat *saha kiralamak değil* — **kaptanın para toplama derdini bitirmek.**

**Durum:** 🅿️ **Rafta** (4 Ağustos 2026) · henüz lansman yapılmadı
**Kapsama:** Ordu · 19 ilçe hazır · 4 saha yayında

---

## 🚦 Buradan başla

| Sorun ne? | Dosya |
|---|---|
| **Uygulama rafta, nasıl uyandırırım?** | **[`RAF.md`](RAF.md)** ← aylar sonra dönüyorsan buradan başla |
| **Bir karar nasıl verilmişti?** | **[`OYNA_PRENSIPLER.md`](OYNA_PRENSIPLER.md)** ← tek pusula |
| **Claude ile çalışacağım** | [`CLAUDE.md`](CLAUDE.md) — oturum kuralları |
| **Yeni iş vereceğim** | [`GOREV_SABLONU.md`](GOREV_SABLONU.md) |

---

## 📚 Belgeler

| Konu | Yer |
|---|---|
| Kararların kanıtı ve gerekçesi (K-1…K-17) | [`docs/board/DECISIONS.md`](docs/board/DECISIONS.md) |
| Danışma kurulu rol raporları (7 rol) | [`docs/board/`](docs/board/) |
| Cevap bekleyen kararlar | [`docs/board/SON_KARARLAR.md`](docs/board/SON_KARARLAR.md) |
| **Sistemin bağışıklık sistemi** (17 yapı taşı, 32 kontrol) | [`docs/sistem/MEKANIZMA.md`](docs/sistem/MEKANIZMA.md) |
| Bilinen sorunlar ve çözüm geçmişi | [`docs/master/PROBLEMLER_VE_COZUMLER.md`](docs/master/PROBLEMLER_VE_COZUMLER.md) |
| Operasyon / panel soruları | [`docs/master/RUNBOOK.md`](docs/master/RUNBOOK.md) |
| iOS'a çıkış rehberi | [`docs/master/IOS_CIKIS_REHBERI.md`](docs/master/IOS_CIKIS_REHBERI.md) |
| Kılavuzlar | [`docs/kilavuzlar/`](docs/kilavuzlar/) |
| ⛔ Arşiv — **bağlayıcı değil** | [`docs/eski/`](docs/eski/) |

---

## 🧰 Çalıştırma

```bash
npm ci        # bağımlılıkları kur (bir kez)
npm run dev   # uygulamayı aç
```

**Bitirmeden önce zorunlu kontroller:**

```bash
npm run lint       # tip kontrolü — temiz olmalı
npm run test:unit  # 1.437 test — hepsi geçmeli
```

**Değişiklikten ÖNCE — mekanizma:**

```bash
npm run etki            # hangi temel yapı taşlarına dokunuyorum?
npm run sistem:kapsam   # harita gerçeği yansıtıyor mu?
npm run sistem:surum    # sürüm numarası her yerde aynı mı?
```

> `npm run etki`, 🔴 KRİTİK yapı taşlarına (PARA · KAPILAR · KİMLİK · AYARLAR ·
> KURTARMA) dokunuyorsan **DUR** der ve onay ister. Bu bilerek böyle.

---

## 🏗️ Kod nerede

| Klasör | Ne var |
|---|---|
| `views/` · `components/` · `shared/` · `ui/` | Oyuncu uygulaması arayüzü |
| `admin-panel/` | Yönetici paneli (Komuta Merkezi · Sistem Sağlığı · Gerçek Durum) |
| `services/` · `hooks/` · `utils/` | İş mantığı ve yardımcılar |
| `supabase/migrations/` | **Veritabanı şeması — tek doğru kaynak** (430+ dosya) |
| `supabase/functions/` | Edge Function'lar (ödeme · bildirim · süpürücü) |
| `sozlesmeler/` | Yasal metinlerin kaynağı → `npm run build:legal` HTML üretir |
| `scripts/sistem/` | Mekanizma araçları (etki · kapsam · harita · sürüm) |
| `tests/` | 1.437 birim testi + Playwright |

**Kök dizindeki ortak `.ts` dosyaları** — `store.ts`, `types.ts`, `supabaseClient.ts`,
`supabaseAuth.ts`, `supabaseMutations.ts` — geniş etki yaratır. Değiştirmeden önce
kullanım yerlerini ara (bkz. `CLAUDE.md` §4).

---

## ⚙️ Teknoloji

React 19 · Vite · TypeScript · Tailwind v4 · Capacitor 8 (iOS/Android) ·
Supabase (PostgreSQL 17 · Edge Functions · Auth · Storage) · Zustand ·
Vitest + Playwright

---

## 🔒 Bilerek kapalı olanlar

Bunlar eksik değil, **karar**dır. Tam liste: [`OYNA_PRENSIPLER.md`](OYNA_PRENSIPLER.md) §11

| Ayar | Durum | Ne zaman açılır |
|---|---|---|
| `demo_mode_enabled` | **açık** | Lansman gününün 1. maddesi: kapatılır |
| `payment_mode_global` | `CASH_ONLY` | İlk gerçek kart işlemi denendikten sonra |
| `push_live_enabled` | kapalı | Lansmanda APNs/FCM hazır olunca |
| `wallet_cashout_enabled` | kapalı | Kimlik doğrulama + sözleşmeler yayınlanınca |

---

## 📊 Bugünkü durum (4 Ağustos 2026)

| Ölçüm | Değer |
|---|---|
| Sağlık denetimi | **14 yeşil / 0 kırmızı** |
| Para değişmezleri (8 kural) | temiz |
| Birim testleri | **1.437 / 1.437** |
| Veritabanı | 37 MB · 18 zamanlanmış iş · son 24 saatte **0 hata** |
| Gerçek kullanıcı 6 · gerçek maç 1 | **tahsil edilen para: 0 ₺** |

> Son satır kasten böyle yazıldı: OYNA bugüne kadar **tek kuruş gerçek para
> işlemedi.** Mühendislik kalitesi yüksek ama ürün henüz tek bir müşteriye
> dokunmadı. Ayrıntı:
> [`docs/board/07-stratejik-danisman.md`](docs/board/07-stratejik-danisman.md)
