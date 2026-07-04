# 📚 OYNA Dokümantasyon — İçindekiler

Bu klasör iki bölümden oluşur:

- **[`master/`](master/)** — **güncel** karar, plan ve operasyon dokümanları (aktif referans).
- **[`eski/`](eski/)** — **arşiv**: aşılmış soru setleri, eski mimari/tasarım belgeleri, Firebase-dönemi planlar ve bayat referanslar. Karar değeri yoktur; yalnız tarihçe.

> **Nereden başlamalı?** Tek kaynak konsolide özet: **[`master/OYNA_MASTER.md`](master/OYNA_MASTER.md)**. Çelişkide **en yeni tarihli** bağlayıcı doküman kazanır.
>
> Kök `README.md` (kurulum/çalıştırma) ve kod-yanı belgeler (`notifications/`, `tests/integration/`) bilinçli olarak yerinde tutulur.

---

## 🟢 `master/` — Güncel Çekirdek

| Doküman | İçerik |
|---|---|
| [OYNA_MASTER.md](master/OYNA_MASTER.md) | **Konsolide tek kaynak** — tüm dokümanların durum + karar özeti, doküman haritası |
| [OYNA_MASTER_PRENSIPLER.md](master/OYNA_MASTER_PRENSIPLER.md) | Ürün & mimari temel prensipler — **en üst otorite** (20 bölüm + revizyon notları) |
| [OYNA_YOL_HARITASI.md](master/OYNA_YOL_HARITASI.md) | Faz 0–7 detaylı geliştirme yol haritası (ne/neden/sonuç) |
| [OYNA_OPERASYONEL_DURUM.md](master/OYNA_OPERASYONEL_DURUM.md) | Operasyonel durum & kalan işler (tek güncel kaynak etiketi) |
| [OYNA_GO_LIVE_IYZICO.md](master/OYNA_GO_LIVE_IYZICO.md) | iyzico para motoru aktivasyon runbook'u |
| [GO_LIVE_CHECKLIST.md](master/GO_LIVE_CHECKLIST.md) | Gerçeğe geçiş (ödeme/push/demo) anahtar kontrol listesi |
| [RUNBOOK.md](master/RUNBOOK.md) | Yazılımcısız çalıştırma & kurtarma kılavuzu |
| [runbook/](master/runbook/) | Olay müdahale · PITR restore · secret rotasyon prosedürleri |
| [STORE_LANSMAN_PLANI.md](master/STORE_LANSMAN_PLANI.md) | Google Play & App Store lansman planı (Faz A–J + engel envanteri) |
| [LANSMAN_ENGELLERI_VE_ASMA_PLANI.md](master/LANSMAN_ENGELLERI_VE_ASMA_PLANI.md) | Lansman & kitlesel benimsenme engelleri ve aşma planı (04.07) |
| [KATMAN2_SAHA_SAHIBI_COZUM_PLANI.md](master/KATMAN2_SAHA_SAHIBI_COZUM_PLANI.md) | Saha sahibi problemleri — kesin çözüm & uygulama planı (04.07) |
| [ADMIN_PANEL_KARARLAR.md](master/ADMIN_PANEL_KARARLAR.md) | Admin panel 100 soru → alınan kararlar + Wave eşlemesi |
| [WAVE_DEPLOY_PLANI.md](master/WAVE_DEPLOY_PLANI.md) | 14 wave / 5 parti veritabanı deploy stratejisi |
| [RPC_YETKI_ENVANTERI.md](master/RPC_YETKI_ENVANTERI.md) | Admin RPC sunucu-taraflı yetki envanteri (Wave 8, 46 RPC) |
| [UI_UX_YAPILACAKLAR.md](master/UI_UX_YAPILACAKLAR.md) | UI/UX denetimi — öncelikli yapılacaklar (20 bulgu + durum) |
| [UI_SONHAL_SORULARI.md](master/UI_SONHAL_SORULARI.md) | Rol-bazlı arayüz cilalama soru seti (120 soru — cevap bekliyor) |
| [PROBLEMLER_VE_COZUMLER.md](master/PROBLEMLER_VE_COZUMLER.md) | Rol-bazlı problem → çözüm yaşayan kaydı |

## 🗄️ `eski/` — Arşiv (karar değeri yok)

| Doküman | Neden arşivde |
|---|---|
| [ADMIN_PANEL_100_SORU.md](eski/ADMIN_PANEL_100_SORU.md) | Soru seti — `master/ADMIN_PANEL_KARARLAR.md` ile cevaplanıp aşıldı |
| [OYNA_MASTER_KESIF_SORULARI.md](eski/OYNA_MASTER_KESIF_SORULARI.md) | 200 keşif sorusu — kararlar Master Prensipler'e işlendi |
| [OYNA_BACKEND_SORULARI.md](eski/OYNA_BACKEND_SORULARI.md) | Mimari geçiş soru manifestosu (kapatıldı) |
| [kullanici_analizi.md](eski/kullanici_analizi.md) | Persona/UX araştırması — ham girdi (içgörüler Master'a işlendi) |
| [fikirler.md](eski/fikirler.md) | Erken fikir/gelecek planları notları |
| [GODVIEW_PLATFORM_PLAN.md](eski/GODVIEW_PLATFORM_PLAN.md) | Tamamlanmış Supabase admin panel planı (kararlar KARARLAR'a taşındı) |
| [ADMIN_PANEL_MASTER_PLAN.md](eski/ADMIN_PANEL_MASTER_PLAN.md) | Tamamlanmış admin panel master planı |
| [ADMIN_MATCH_CONTROL_PLAN.md](eski/ADMIN_MATCH_CONTROL_PLAN.md) | Maç kontrol kokpiti erken planı (Wave 9'a işlendi) |
| [ADMIN_DEPLOY_CHECKLIST.md](eski/ADMIN_DEPLOY_CHECKLIST.md) | Eski admin deploy kontrol listesi |
| [OYNA_MAP_GEOFIRESTORE_PLANI.md](eski/OYNA_MAP_GEOFIRESTORE_PLANI.md) | Firebase/Geofirestore harita planı — backend artık %100 Supabase |
| [OYNA_BACKEND_SISTEM_MANTIGI.md](eski/OYNA_BACKEND_SISTEM_MANTIGI.md) | Firebase-dönemi backend/veri modeli belgesi |
| [OYNA_MIMARI_VE_TASARIM_DOKUMANI.md](eski/OYNA_MIMARI_VE_TASARIM_DOKUMANI.md) | Eski mimari & tasarım manifestosu |
| [OYNA_TASARIM_VE_MIMARI_KILAVUZU.md](eski/OYNA_TASARIM_VE_MIMARI_KILAVUZU.md) | Eski arayüz & durum yönetimi kılavuzu |
| [OYNA_APP_ANALIZ_VE_YONERGELER.md](eski/OYNA_APP_ANALIZ_VE_YONERGELER.md) | Eski uygulama analizi ve yönergeler |
| [OYNA_GELISTIRME_REHBERI.md](eski/OYNA_GELISTIRME_REHBERI.md) | Eski geliştirme/oturum handoff rehberi |
| [UX_REFACTOR_PROMPT.md](eski/UX_REFACTOR_PROMPT.md) | Eski UX refactor prompt taslağı |
| [db-workflow.md](eski/db-workflow.md) | Veritabanı yönetim workflow kılavuzu (referans) |
| [db-commands.md](eski/db-commands.md) | Sık kullanılan SQL komut referansı |
| [DATABASE_README.md](eski/DATABASE_README.md) | Bayat DB durum belgesi ("24 tablo" vb.) — araç kısmı hâlâ referans |
| [DOSYALARIN_ISLEVLERI.md](eski/DOSYALARIN_ISLEVLERI.md) | Bayat dosya/klasör dökümü (silinmiş dosyalara atıf) |

---

> **Bakım kuralı:** Yeni bir karar alındığında önce ilgili `master/` dokümanına işlenir, sonra `master/OYNA_MASTER.md` özeti/haritası güncellenir. Bir doküman aşıldığında `eski/`'ye taşınır ve bu index güncellenir.
