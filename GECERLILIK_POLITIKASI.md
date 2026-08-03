# GEÇERLİLİK POLİTİKASI — Hangi bilgi bağlayıcıdır?

> **Yürürlük:** 3 Ağustos 2026 · Kurucu kararı
> **Amaç:** Bu depoda 100'den fazla doküman var. Çoğu farklı tarihlerde yazıldı ve bir kısmı
> artık gerçeği yansıtmıyor. Bu dosya, bir çelişki çıktığında **hangisinin kazanacağını** tanımlar.

---

## 1. Tek cümlelik kural

> **Yalnızca canlı sistem geçerlidir. Doküman, sistemi anlatmaya çalışan bir nottur — sistemin kendisi değildir.**

Bir dokümanla canlı sistem çelişiyorsa, **doküman yanlıştır.**

---

## 2. Geçerlilik sırası (yukarıdan aşağıya)

| Sıra | Kaynak | Bağlayıcılık |
|---|---|---|
| **1** | **Canlı Supabase veritabanı** — tablolar, fonksiyonlar, RLS politikaları, `app_config` değerleri | **Kesin.** Sistem ne yapıyorsa gerçek odur. |
| **2** | **`main` dalındaki kod** — `supabase/migrations/`, `services/`, `views/` | **Kesin.** Canlıyla farkı varsa bu bir *sapma*dır ve raporlanır. |
| **3** | **`docs/board/DECISIONS.md`** — kurucunun onayladığı kararlar | **Bağlayıcı.** Kod henüz uymuyorsa yapılacak iş listesidir. |
| **4** | **`CLAUDE.md`** — çalışma kuralları | **Bağlayıcı** (süreç kuralları için). |
| **5** | Diğer tüm dokümanlar | **Bilgilendirme.** Bağlayıcı değildir. |

---

## 3. Tarihli notlar hakkında

Bu depodaki dokümanların çoğu **belirli bir günün fotoğrafıdır**. Üzerinde tarih olan
(ör. `..._2026-07-30.md`) veya "plan", "analiz", "denetim", "soru listesi" türünden her doküman
**yazıldığı günün bilgisidir** ve o günden sonra sistem değişmiş olabilir.

**Kural:** Tarihli bir notu gerekçe göstererek karar alınamaz. Not yalnızca "o gün böyle düşünülmüş"
bilgisini verir. Karar almak için önce **canlı sisteme bakılır**.

**Uygulamada bu ne demek:** Bir görev sırasında dokümanda bir şey okuduysan, koda veya canlı
veritabanına bakıp doğrulamadan onu gerçek kabul etme. Doğrulayamıyorsan kurucuya sor.

---

## 4. Arşiv

Geçerliliğini yitirmiş dokümanlar `docs/eski/` klasörüne taşınır. Bu klasördeki hiçbir dosya
bağlayıcı değildir; silinmemelerinin tek sebebi geçmişi kaybetmemektir.

**3 Ağustos 2026'da yapılan işlemler:**
- `OYNA_MASTER_PRENSIPLER.md` (kök) → **geçersiz ilan edildi**, dosya başına uyarı eklendi
- `docs/master/OYNA_MASTER_PRENSIPLER.md` → **geçersiz ilan edildi**, dosya başına uyarı eklendi
- `YAPILACAKLAR.md` → `docs/eski/` klasörüne taşındı (içeriği canlı sistemle uyuşmuyordu)
- `SAHA_SAHIBI_KARAR_SORULARI.md` → **kaldırıldı** (42 sorunun tamamı kapatıldı; geçmişi git'te duruyor)

---

## 5. Bundan sonra

Danışma kurulu süreci tamamlandığında **tek bir master prensipler dosyası** yazılacak.
O dosya yayınlandığında bu tablonun 3. sırasına girer ve `CLAUDE.md`'deki "proje pusulası"
bölümü ona yönlendirilir. O güne kadar kararların tek yazılı kaynağı `docs/board/DECISIONS.md`'dir.
