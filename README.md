# ⚡ OYNA

**Halı saha rezervasyon platformu.** Çift taraflı pazar: saha sahipleri ↔ oyuncular.
Ana vaat *saha kiralamak değil* — **kaptanın para toplama derdini bitirmek.**

**Faz:** 🚀 **Lansmana hazırlanıyor** (16 Ağustos 2026'da raftan indirildi — ödemeli lansman kararı alındı)
**Canlı sayılar:** Yönetim paneli → Komuta Merkezi → **"Gerçek Durum"** kartı
(sayılar bilerek burada değil — README bayatlamasın, tek doğru kaynak panel olsun)

---

## 🚦 Buradan başla

| Sorun ne? | Dosya |
|---|---|
| **Lansmana ne kaldı? Sıradaki iş ne?** | **[`docs/master/LANSMAN_PLANI.md`](docs/master/LANSMAN_PLANI.md)** ← tek yol haritası |
| **Bir karar nasıl verilmişti?** | **[`OYNA_PRENSIPLER.md`](OYNA_PRENSIPLER.md)** ← tek pusula (bilerek kapalı olanlar: §11) |
| **Claude ile çalışacağım** | [`CLAUDE.md`](CLAUDE.md) — oturum kuralları |
| **Yeni iş vereceğim** | [`GOREV_SABLONU.md`](GOREV_SABLONU.md) |

---

## 📚 Belgeler

| Konu | Yer |
|---|---|
| Kararların kanıtı ve gerekçesi (K-1…K-17) | [`docs/board/DECISIONS.md`](docs/board/DECISIONS.md) |
| Danışma kurulu rol raporları (7 rol) | [`docs/board/`](docs/board/) |
| Bilinen sorunlar ve çözüm geçmişi | [`docs/master/PROBLEMLER_VE_COZUMLER.md`](docs/master/PROBLEMLER_VE_COZUMLER.md) |
| Operasyon / panel soruları | [`docs/master/RUNBOOK.md`](docs/master/RUNBOOK.md) |
| iOS'a çıkış rehberi | [`docs/master/IOS_CIKIS_REHBERI.md`](docs/master/IOS_CIKIS_REHBERI.md) |
| Kılavuzlar | [`docs/kilavuzlar/`](docs/kilavuzlar/) |
| Raf dönemi kaydı (4–16 Ağu 2026) — **tarihsel** | [`RAF.md`](RAF.md) |
| ⛔ Arşiv — **bağlayıcı değil** | [`docs/eski/`](docs/eski/) |

> **Mekanizma araçları hakkında not:** Eski README'nin "değişiklikten önce
> zorunlu" dediği `npm run etki` / `sistem:kapsam` / `sistem:harita` /
> `sistem:surum` betikleri depoda YOK (hiç commit edilmemişler — 16 Ağu 2026
> tespiti). Kurucu kararı: şimdilik listeden çıkarıldılar, **ileride yeniden
> yazılacaklar**. Belgeleri duruyor: [`docs/sistem/`](docs/sistem/).
> O güne dek kritik alanlara (PARA · KAPILAR · KİMLİK) dokunan işlerde
> `docs/sistem/YAPI-TASLARI.json` elle kontrol edilir.

---

## 🧰 Çalıştırma

```bash
npm ci        # bağımlılıkları kur (bir kez)
npm run dev   # uygulamayı aç
```

**Bitirmeden önce zorunlu kontroller:**

```bash
npm run lint       # tip kontrolü — temiz olmalı
npm run test:unit  # birim testleri — hepsi geçmeli
npm run build      # üretim derlemesi — kırmızı görmeden bitirme
```

Diğer her komut (yönetici paneli, demo veri, görsel testler, mağaza
varlıkları…) `package.json` içinde tanımlı ve oradan keşfedilir — README yalnız
her gün kullanılanları taşır.

---

## 🏗️ Kod nerede

| Klasör | Ne var |
|---|---|
| `views/` · `components/` · `shared/` · `ui/` | Oyuncu uygulaması arayüzü |
| `admin-panel/` | Yönetici paneli (Komuta Merkezi · Sistem Sağlığı · Gerçek Durum) |
| `services/` · `hooks/` · `utils/` | İş mantığı ve yardımcılar |
| `supabase/migrations/` | **Veritabanı şeması — tek doğru kaynak** |
| `supabase/functions/` | Edge Function'lar (ödeme · iade kuyruğu · bildirim · süpürücü) |
| `sozlesmeler/` | Yasal metinlerin kaynağı → `npm run build:legal` HTML üretir |
| `tests/` | Birim testleri (Vitest) + Playwright |

**Kök dizindeki ortak `.ts` dosyaları** — `store.ts`, `types.ts`, `supabaseClient.ts`,
`supabaseAuth.ts`, `supabaseMutations.ts`, `shared/featureFlags.ts` — geniş etki
yaratır. Değiştirmeden önce kullanım yerlerini ara (bkz. `CLAUDE.md`).

---

## ⚙️ Teknoloji

React 19 · Vite · TypeScript · Tailwind v4 · Capacitor 8 (iOS/Android) ·
Supabase (PostgreSQL 17 · Edge Functions · Auth · Storage) · Zustand ·
Vitest + Playwright

---

## 🔒 Para modeli (tek cümleyle)

OYNA **kullanıcı adına bakiye tutmaz** (cüzdan yok — 6493 kararı, §2.10):
ödemeler işlem başına **karttan** alınır, iadeler **karta** döner; kapora hem
maç kurmada hem saha kiralamada karttan tahsil edilir ve varsayılan
serbest-iptal penceresi **24 saattir** (iadeye ödeme altyapısı kesintisi
yansır). Bilerek kapalı olan her anahtarın tam listesi ve açılma koşulu:
**[`OYNA_PRENSIPLER.md` §11](OYNA_PRENSIPLER.md)**.
