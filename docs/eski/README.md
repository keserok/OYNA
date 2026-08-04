# 🗄️ ARŞİV — bağlayıcı değildir

Bu klasördeki hiçbir dosya **bağlayıcı değildir.** Buradaki bir cümleye dayanarak
karar verilmez, "böyle yazıyor" gerekçesiyle tartışma kapatılmaz.

Dosyalar silinmedi çünkü **neden öyle karar verdiğimizin geçmişi** burada duruyor.
Ama güncel gerçeği anlatmıyorlar.

---

## Güncel kaynaklar nerede?

| Ne arıyorsun | Nereye bak |
|---|---|
| **Ürün ve sistem kararları** | `OYNA_PRENSIPLER.md` (kök dizin) |
| Kararların kanıtı ve gerekçesi | `docs/board/DECISIONS.md` |
| Ayrıntılı rol raporları | `docs/board/01-cpo.md` … `07-stratejik-danisman.md` |
| Cevap bekleyen kararlar | `docs/board/SON_KARARLAR.md` |
| Sistemin yapı taşları ve kontroller | `docs/sistem/MEKANIZMA.md` |
| Bilinen sorunlar ve çözüm geçmişi | `docs/master/PROBLEMLER_VE_COZUMLER.md` |
| Uygulama rafta — nasıl uyandırılır | `RAF.md` (kök dizin) |

**Geçerlilik sırası:** canlı sistem → `main` kodu → `OYNA_PRENSIPLER.md` → `DECISIONS.md`
Çelişki varsa **canlı sistem kazanır.**

---

## Buraya 4 Ağustos 2026'da taşınanlar

Danışma kurulu süreci (7 rol) bitince kök dizin sadeleştirildi.

| Dosya | Neden arşivde |
|---|---|
| `OYNA_MASTER_PRENSIPLER.md` | Yerine `OYNA_PRENSIPLER.md` yazıldı (K-6.5) |
| `OYNA_MASTER_PRENSIPLER_docs-master-kopyasi.md` | Aynı dosyanın **farklı içerikli** ikinci kopyasıydı — hangisinin geçerli olduğu belirsizdi (K-6.2) |
| `GECERLILIK_POLITIKASI.md` | Geçerlilik sırası artık `OYNA_PRENSIPLER.md` §0'da |
| `DOSYALARIN_ISLEVLERI.md` | İçindeki bağlantılar eski bir bilgisayarın yerel yollarını gösteriyor (`file:///Users/...`) |
| `HAKEM_EDGE_CASE_PLANI.md` · `KALECI_EDGE_CASE_PLANI.md` · `OYUNCU_EDGE_CASE_PLANI.md` | Planlama belgeleri; kararları `DECISIONS.md`'ye geçti |
| `KALECI_ODEME_DEVIR.md` · `ODEME_MASTER_PLAN.md` | Aynı sebeple |
| `problemler_ve_cozum_onerileri.md` | `docs/master/PROBLEMLER_VE_COZUMLER.md`'nin eski/küçük harfli hâli |
| `veritabani_uretim_ve_optimizasyon_plani.md` | Planlama belgesi |
| `supabase_migration.sql` | Kökte kalmış yetim SQL; şema artık yalnız `supabase/migrations/` altında |
| `start.sh` · `start_dev.sh` | Eski bilgisayara özel yerel başlatma betikleri (`$HOME/.nvm`) |
| `metadata.json` | Hiçbir yerden kullanılmıyordu (0 referans) |

> **Not:** Bunlar git geçmişinde de duruyor. Bir tanesine yeniden ihtiyaç duyulursa
> köke geri taşınabilir — ama önce *"neden güncel değil"* sorusunun cevabı verilmelidir.
