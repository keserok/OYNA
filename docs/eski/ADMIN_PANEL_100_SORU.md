# 🛠️ OYNA — Admin Panel Final Soru Seti (100 Soru)

> **Amaç:** Admin panelinin (**OYNA OS GodView**) **veritabanı, güvenlik, UI/UX ve genel sistemlerini** tam ve son haline getirmek — yani lansmana hazır, "her problem panelden doğrudan çözülebilir" (god-mode) bir kontrol merkezi kurmak için kapatılması gereken tüm belirsizlikleri ortaya çıkarmak.
> **Kaynak:** `docs/OYNA_MASTER_PRENSIPLER.md` (özellikle §8.6 Admin/GodView, §9.1 Veri Modeli & Güvenlik) + `docs/OYNA_YOL_HARITASI.md` (Faz 7) + **mevcut kod tabanının derinlemesine taranması** (93 migration, 74 admin RPC, 10 edge function, ~75 admin-panel dosyası).
> **Yöntem:** Her soru gerçek koddan doğrulanmış bir **güncel durum** üzerine kurulu; jenerik değil, dosya/RPC/satır seviyesinde gerçeğe dayanıyor. Sorular 4 paralel uzman analiz + bir çekişmeli (adversarial) tamlık/tekrar denetiminden geçti.
> **Son güncelleme:** 2026-06-27
> **Durum:** TASLAK — yanıtlandıkça master prensiplere işlenecek ve Faz 7 backlog'una dönüşecek.

---

## Bu belge nasıl okunur

- **100 soru, 10'ar 10'ar 10 grup** halinde sunulur. Her grup tek bir alt-temaya odaklanır.
- **4 ana boyut:** Veritabanı (Soru 1–20) · Güvenlik (Soru 21–40) · UI/UX (Soru 41–70) · Genel Sistemler (Soru 71–100).
- Her soru dört bilgiyle gelir:
  - **Soru:** Verilmesi gereken net karar/keşif sorusu.
  - **Neden soruyoruz:** Hangi belirsizliği/riski çözer; master ilkeyle bağı.
  - **Güncel durum:** Koddan **doğrulanmış** somut durum.
  - **Önerimiz:** Somut, uygulanabilir tavsiye.
- Sorular birbirine **çapraz atıf** yapar (örn. "Soru 4'e bakınız") çünkü boyutlar kesişir; aynı konunun farklı açıları kasıtlı olarak farklı boyutlardadır.

---

## 📊 Genel Durum Özeti (doğrulanmış)

Panel olgun ve büyük ölçüde çalışır durumda; ancak "son hal" için kapatılması gereken net boşluklar var:

**Veritabanı:** `commission_config` komisyon SSOT'u sağlam; `admin_audit_log` kanonik audit tablosu mevcut. **Ancak:** `settings` tablosunun şeması hiçbir migration'da **tanımlı değil** (hayalet tablo); ~18 durum-değiştiren admin RPC **audit yazmıyor**; T-8sa/min-oyuncu/fair-play eşikleri RPC'lere **hardcode**; camelCase/snake_case karışık; bir migration dosyası **0 bayt** ve bir timestamp **iki dosyada çakışıyor**.

**Güvenlik:** 2FA/TOTP **zorunlu** (dev-bypass yok); `is_platform_admin()`/`is_super_admin()` sunucu-tarafı koruması var; RLS büyük ölçüde sertleştirilmiş. **Ancak:** alt-roller (FİNANS/OPERASYON) çoğu RPC'de **sunucuda zorlanmıyor** (yalnız UI'da gizleniyor); ghost mode **süre sınırsız** ve client audit'i best-effort; bazı edge function'larda CORS `*`; `profiles` hâlâ public `USING(true)` (PII sızıntısı riski).

**UI/UX:** Tutarlı bir bileşen kütüphanesi (DataTable, StatCard, EmptyState, ActionConfirmModal…) ve route/komut-paleti altyapısı var. **Ancak:** Maç Kontrol Kokpiti master §8.6'nın istediği derinlikte değil (**force capture/void/refund, skor override, payout tetik, maça-özel audit timeline yok**); kapsam-dışı modüller (Topluluk/Promo/Kampanya) hâlâ menüde; kuzey-yıldızı KPI "başarılı maç" dashboard'da öne çıkmıyor; pagination/CSV/erişilebilirlik desenleri tutarsız.

**Genel Sistemler:** iyzico capture/void/refund kodu **gerçek** ve webhook imzalı; push (APNs/FCM) kodu gerçek; CommandCenter realtime çalışıyor. **Ancak:** `PAYMENT_PROVIDER` varsayılan `SIMULATION`; APNs/FCM/Resend kimlikleri **placeholder**; payout **manuel işaretleniyor** (gerçek iyzico transfer API'si yok); demo veri (`is_demo`) prod'da **izole değil**; doğrulama kuyruğu **3 parçaya** bölünmüş; operasyonel **E2E test ve CI gate yok**.

---

## 🗂️ İçindekiler

| Grup | Soru | Tema |
|---|---|---|
| **1** | 1–10 | Veritabanı: Şema, SSOT & İsimlendirme |
| **2** | 11–20 | Veritabanı: Audit, Ayarlar & Migration Hijyeni |
| **3** | 21–30 | Güvenlik: Kimlik Doğrulama, 2FA & RBAC |
| **4** | 31–40 | Güvenlik: RLS, Ghost Mode, Edge Function & Sırlar |
| **5** | 41–50 | UI/UX: Navigasyon, Tasarım Sistemi & Genel Cila |
| **6** | 51–60 | UI/UX: Maç Kontrol Kokpiti & Modül Derinliği |
| **7** | 61–70 | UI/UX: Dashboard/KPI, Boş-Yükleme-Hata & Erişilebilirlik |
| **8** | 71–80 | Genel Sistemler: Ödeme/Finans Kontrolü & Payout |
| **9** | 81–90 | Genel Sistemler: Bildirim/Broadcast, Ayar→App & Demo Veri |
| **10** | 91–100 | Genel Sistemler: Realtime, Doğrulama Kuyruğu, Test & Go-Live |

---

## 📦 Grup 1 — Veritabani: Sema, SSOT & Isimlendirme (Soru 1–10)

### Soru 1 — `settings` Tablosu Icin Resmi Sema Migration-i
**Soru:** `settings` tablosunun kanonik `CREATE TABLE` semasini (sutunlar, tipler, default-lar, `CHECK` kisitlari, singleton garantisi) hangi tek migration-da resmilestirecegiz?
- **Neden soruyoruz:** Master 9.1 "tek kanonik model (SSOT)" diyor; tablo migration-larda tanimli degilken yalniz RLS/RPC referansiyla ayakta, bu da semasi gercekten ne oldugu belirsiz bir "hayalet tablo" yaratiyor ve PITR/yeniden kurulumda yeniden uretilemez.
- **Guncel durum:** `grep` ile dogrulandi: hicbir migration-da `CREATE TABLE ... settings` yok; tablo yalniz RLS politikalari ve `admin_update_settings` RPC icinde referans ediliyor. Singleton `id='main'`, sutunlar camelCase (`appName`, `commissionRate`, `payoutMode`, `minRatingToPlay`, `maxMatchsPerDay`, `maintenanceMode`, `registrationOpen`, `announcementBanner`).
- **Onerimiz:** Yeni bir migration ile `public.settings` tablosunu acikca tanimla; `id text PRIMARY KEY DEFAULT 'main'` + `CHECK (id = 'main')` ile singleton-u garanti et; her sutuna tip + `NOT NULL` + default ata; mevcut canli satiri korumak icin `CREATE TABLE IF NOT EXISTS` yerine idempotent `DO $$ ... $$` blogu ile var olan satiri migrate et.

### Soru 2 — camelCase Sutunlardan snake_case Standardizasyonu
**Soru:** `settings` (ve diger camelCase iceren tablolarin) sutunlarini snake_case-e gecirirken kirilmayi onlemek icin "rename + uyumluluk view-u" mu yoksa "tek seferlik kesme+RPC guncelleme" stratejisini mi secelim?
- **Neden soruyoruz:** Master 9.1 "tutarli snake_case isimlendirme" sart kosuyor; `settings` quoted camelCase iken DB-de `"appName"` her sorguda tirnak gerektiriyor ve karma isimlendirme (snake_case tablolarla yan yana) SSOT disiplinini bozuyor.
- **Guncel durum:** `settings` sutunlari camelCase (`appName`, `commissionRate`, `maxMatchsPerDay` — ayrica `Matchs` yazim hatasi); platformun geri kalani snake_case. `admin_update_settings` RPC 3+ kez yeniden tanimlanmis, yani rename her tanima dokunmayi gerektirecek.
- **Onerimiz:** Soru 1 ile birlikte yeni tabloyu dogrudan snake_case acip (`app_name`, `commission_rate`, `payout_mode`, `max_matches_per_day` — yazim hatasini da duzelt) veriyi tek seferde tasi; `admin_update_settings` ve `admin_get_settings` RPC-lerini snake_case-e gore yeniden yaz; eski camelCase erisimi olan frontend icin gecici bir `settings_compat` view-u brakmadan, ayni PR-da `adminService.ts` cagrilarini guncelle (orphan riski dusuk cunku tek tuketici admin panel).

### Soru 3 — `commission_config` SSOT Teyidi ve Yetimsiz Komisyon Alanlari
**Soru:** Komisyonun tek SSOT-u `commission_config` oldugundan emin olmak icin `settings.commissionRate` ve diger tablolardaki dagidik `rate/markup` alanlarini kaldirip okuma-yalniz turetilmise mi cevirelim?
- **Neden soruyoruz:** Master 9.1 SSOT; ayni komisyon orani hem `settings.commissionRate` hem `commission_config.rate_pct` icinde varsa iki kaynak cakisir ve `calculate_commission` ile UI farkli deger gosterebilir.
- **Guncel durum:** `commission_config` SAGLAM ve kanonik (`scope` GLOBAL/PITCH/SERVICE_GK/SERVICE_REF/MATCH, `model` MODEL_A/MODEL_B, `rate_pct`, `markup_pct`, `is_active`); `calculate_commission` RPC bunu okuyor. Ancak `settings.commissionRate` hala mevcut ve ayni kavrami temsil ediyor.
- **Onerimiz:** `settings.commissionRate`-i tablodan kaldir; admin panelinin "global komisyon" gosterimi `commission_config` (scope=GLOBAL) satirini okusun; gecis sirasinda `settings.commissionRate` degerini `commission_config` GLOBAL satirina seed et, sonra sutunu `DROP COLUMN` et.

### Soru 4 — Hardcode Parametreler Icin `app_config` Tablosu
**Soru:** RPC-lere gomulu olan operasyonel parametreleri (onay penceresi, min-oyuncu yuzdesi, fair-play esikleri, silme bekleme suresi, oto-onay suresi) tek bir `app_config` (key/value/typed) tablosuna mi tasiyalim, yoksa her birini `settings` sutunu mu yapalim?
- **Neden soruyoruz:** Master 8.6 "her problem panelden DOGRUDAN cozulebilir (god-mode)" diyor; bu degerler RPC kodunda hardcode iken admin panelinden degistirilemez, her ayar degisikligi yeni migration+deploy gerektirir, bu da god-mode ilkesine aykiri.
- **Guncel durum:** Hardcode tespit edildi: T-8s onay penceresi, min-oyuncu %70, fair-play esikleri (<80 uyari/<60 kisit/<40 ban, no-show -20), hesap-silme 7g bekleme, app-booking 15dk oto-onay. Hepsi RPC govdesinde sabit.
- **Onerimiz:** `app_config(key text PK, value jsonb, value_type text, description text, updated_by, updated_at)` tablosu olustur; bu parametreleri seed et; RPC-ler degerleri bir `get_config(key)` `STABLE` yardimci fonksiyonu uzerinden okusun (her seferinde tek satir, cache edilebilir); admin panele "Sistem Parametreleri" ekrani ekle. Bu tip semantik-yuklu sabitleri serbest-form `settings`-e degil tipli config tablosuna koy.

### Soru 5 — RBAC `permissions` JSONB: Aktive mi, Kaldir mi?
**Soru:** Hic kullanilmayan `admin_team_members.permissions` JSONB alanini ince-grenli yetki icin mi aktive edecegiz yoksa olu-kod olarak kaldirip yalniz `admin_role` enum-una mi dayanacagiz?
- **Neden soruyoruz:** Master yetki matrisi rol-bazli (SUPER_ADMIN/FINANS/OPERASYON); kullanilmayan bir `permissions` alani "var ama bos" durumu yaratir, gelistiriciler bunun zorlanmasini sanip guvenlik bosluguna girebilir.
- **Guncel durum:** RBAC 3 katman: `profiles.is_admin`, `profiles.role/roles` (JSONB), `admin_team_members.admin_role` (SUPER_ADMIN/ADMIN/MODERATOR/FINANCE/SUPPORT). `permissions` JSONB VAR ama HIC kullanilmiyor; alt-rol kontrolu yalniz `admin_update_settings`-te zorlaniyor.
- **Onerimiz:** Lansman icin `permissions` JSONB-i KALDIR (YAGNI); yetkiyi `admin_role` enum + merkezi bir `require_admin_role(p_required text[])` yardimci fonksiyonu ile zorla; ince-grenli ihtiyac dogarsa ileride versiyonlu olarak geri ekle. Olu alan birakma.

### Soru 6 — Cift RBAC Kaynagi: `admin_team_members` vs `profiles.roles`
**Soru:** Admin yetkisinin tek otoritesi `admin_team_members` mi olacak, yoksa `profiles.is_admin`/`profiles.roles` mi — ve digeri turetilmis/silinmis mi olmali?
- **Neden soruyoruz:** Master SSOT; admin olup olmamanin iki bagimsiz kaynagi (`profiles.is_admin` + `admin_team_members`) senkron-disi kalabilir (birinde admin, digerinde degil), bu da yetki yukseltme veya kilitlenme riskidir.
- **Guncel durum:** Uc katman var: `profiles.is_admin` bool, `profiles.role/roles` JSONB, `admin_team_members.admin_role`. Hangisinin otorite oldugu netlestirilmemis; RPC-ler farkli katmanlara bakiyor olabilir.
- **Onerimiz:** `admin_team_members`-i tek SSOT yap (rol + aktiflik orada); `profiles.is_admin`-i `admin_team_members`-tan turetilen bir generated/trigger-bakimli okuma-yalniz bayrak haline getir veya RLS-lerden cikar; tum admin RPC-leri tek `is_platform_admin()` / `require_admin_role()` fonksiyonu uzerinden gecir; `profiles.roles` JSONB-i admin yetkisi icin kullanmayi birak (oyuncu/saglayici rolleri icin kalabilir).

### Soru 7 — Birlesik Dogrulama Kuyrugu Tablosu
**Soru:** Dagidik dogrulama kaynaklarini (`pending_provider_verifications`, `provider_identities`, `community_creation_requests`) tek bir `verification_queue` tablosu/view-u altinda mi birlestirelim?
- **Neden soruyoruz:** Master 8.6 "problem panelden DOGRUDAN cozulebilir"; admin tek bir "onay kutusu" beklerken uc ayri tabloya bakmak zorunda kalmak operasyonu yavaslatir ve bir kaynak gozden kacabilir.
- **Guncel durum:** Birlesik dogrulama kuyrugu YOK; `pending_provider_verifications` + `provider_identities` + `community_creation_requests` dagink. (Not: topluluk lansmanda kapsam-disi — Soru 9.)
- **Onerimiz:** Lansman kapsamindaki saglayici dogrulamasi icin `verification_queue` view-u olustur (`entity_type`, `entity_id`, `status`, `submitted_at`, `payload jsonb`) ki UI tek liste cekebilsin; topluluk kaynagini kapsam-disi oldugu icin bu view-a DAHIL ETME; ileride yeni dogrulama turleri ayni view-a `UNION` ile eklenecek sekilde tasarla.

### Soru 8 — Kapsam-Disi Tablolarin (Topluluk/Turnuva/Promo) Arsivlenmesi
**Soru:** Lansmanda kapsam-disi olan `tournaments`, `promo_codes` ve `*_community` yapilarini DROP mu, yoksa `_archive` semasina/`is_active=false` ile dondurulmus mu birakacagiz?
- **Neden soruyoruz:** Master "Topluluk/Turnuva/Promo lansmanda YOK" diyor ama DB-de hala bu tablolar+RPC-ler var; aktif kalan kapsam-disi yuzeyler RLS/audit kapsamini bos yere genisletir ve yanlislikla erisilirse veri butunlugu/guvenlik riski olusturur.
- **Guncel durum:** `admin_*_community` RPC-leri, `promo_codes`, `tournaments(is_demo)` hala DB-de mevcut ve canli.
- **Onerimiz:** Veriyi kaybetmemek icin tablolari DROP etme; bunun yerine `archive` semasina tasi (`ALTER TABLE ... SET SCHEMA archive`) veya en azindan tum yazma RLS-lerini iptal edip ilgili `admin_*_community`/promo RPC-lerini `REVOKE EXECUTE` ile devre-disi birak; admin panel menusunden de gizle. Boylece kapsam netlesir, geri-acmak ucuz kalir.

### Soru 9 — Demo Verisinin (`is_demo`) Prod Izolasyonu
**Soru:** `is_demo=true` kayitlarin prod istatistik/komisyon/listeleme akislarina sizmadigini garanti eden RLS+RPC seviyesinde tek-noktadan bir izolasyon kurali tanimlayacak miyiz?
- **Neden soruyoruz:** Master 9.1 veri butunlugu; demo kayitlar finansal raporlara veya gercek kullaniciya gosterilen listelere sizarsa hem komisyon hesabi hem kullanici guveni bozulur.
- **Guncel durum:** `tournaments` ve diger modullerde `is_demo` bayragi var; demo-prod izolasyonunun tutarli sekilde her sorguda zorlanip zorlanmadigi belirsiz (owner_demo_system migration-lari mevcut).
- **Onerimiz:** Demo-iceren her tablo icin RLS-e/RPC-ye standart bir `is_demo = false` filtresi ekle (veya prod kullaniciya gosterilen view-larda `WHERE is_demo = false` zorla); finansal/komisyon RPC-lerinin demo satirlari atladigini test et; `app_config`-te global `demo_mode_enabled` bayragi ile demo-uretim yetenegini lansmanda kapat.

### Soru 10 — FK Index ve 100k+ Olcek Performans Auditi
**Soru:** `20260701000001_performance_rls_and_fk_indexes` migration-inin tum sicak FK-leri ve RLS-de kullanilan sutunlari kapsadigini mi dogrulayalim, yoksa eksik index-leri tespit icin sistematik bir tarama mi yapalim?
- **Neden soruyoruz:** Master 9.1 "100k+ olcek" hedefi; index-siz FK-ler `DELETE`/`UPDATE` cascade-lerinde ve RLS alt-sorgularinda sekansiyel tarama yaratip panelin yavaslamasina yol acar.
- **Guncel durum:** `20260701000001_performance_rls_and_fk_indexes.sql` mevcut (ama timestamp-i bir baska dosyayla cakisiyor — Soru 18); FK-lerin tam kapsanip kapsanmadigi dogrulanmadi.
- **Onerimiz:** `pg_indexes` ve `pg_constraint` ile index-siz FK-leri programatik tara (`SELECT` ile cikar); RLS politikalarinda gecen sutunlari (`admin_audit_log.admin_id`, `target_id` vb.) index-le; `get_advisors` (Supabase) ile "unindexed foreign keys" ve "unused index" uyarilarini calistirip eksikleri tek bir `add_missing_indexes` migration-inda kapat.

## 📦 Grup 2 — Veritabani: Audit, Ayarlar & Migration Hijyeni (Soru 11–20)

### Soru 11 — Eksik 18 RPC-de Audit Kapsamini %100-e Cikarmak
**Soru:** Audit yazmayan ~18 durum-degistiren admin RPC-sine `admin_audit_log` INSERT-i RPC govdesine mi gomelim, yoksa ortak bir `log_admin_action(...)` yardimci fonksiyonu uzerinden mi standartlastiralim?
- **Neden soruyoruz:** Master 8.6 "HER kritik islem audit-lenir"; audit yazmayan durum-degistiren RPC-ler bu ilkeyi acikca ihlal ediyor ve bir tartismada (dispute) "kim yapti" sorusu cevapsiz kalir.
- **Guncel durum:** Audit YAZMAYAN RPC-ler dogrulandi: `admin_delete_goalkeeper`, `admin_delete_referee`, `admin_update_goalkeeper`, `admin_update_referee`, `admin_toggle_user_pro`, `admin_delete_promo_code`, `admin_set_promo_code_active`, `admin_review_provider_application`, `admin_release_service_payout` (ve digerleri, ~18). Kanonik tablo `admin_audit_log` ve SECURITY DEFINER INSERT yolu hazir.
- **Onerimiz:** Tek bir `log_admin_action(p_action, p_target_type, p_target_id, p_target_identifier, p_old_value, p_new_value)` SECURITY DEFINER yardimci fonksiyonu yaz (admin_id/name/ip/ua-yi context-ten alir); 18 RPC-yi tek tek bu cagri ile guncelle; eksiksizligi `pg_proc` tarayip "durum degistiren ama `log_admin_action` cagirmayan" RPC-leri listeleyen bir test ile dogrula (promo RPC-leri kapsam-disi ise once arsivlenmeli — Soru 8).

### Soru 12 — Audit Log Immutability (Degistirilemezlik)
**Soru:** `admin_audit_log` satirlarinin UPDATE/DELETE-e karsi DB seviyesinde degistirilemez (append-only) oldugunu nasil garanti edecegiz?
- **Neden soruyoruz:** Master 8.6 audit-in anlami "guvenilir kanit"; bir admin (hatta SUPER_ADMIN) kendi izini silebiliyorsa audit log adli-tibbi degerini kaybeder.
- **Guncel durum:** RLS: yalniz adminler SELECT; INSERT yalniz SECURITY DEFINER RPC ile. Ancak UPDATE/DELETE-in DB seviyesinde bloklandigi dogrulanmadi (RLS-te UPDATE/DELETE politikasi olmamasi cogu rol icin engeller ama tablo-sahibi/servis-rolu icin acik olabilir).
- **Onerimiz:** Tabloya `BEFORE UPDATE OR DELETE` trigger ekle (`RAISE EXCEPTION 'audit log is append-only'`); ayrica `REVOKE UPDATE, DELETE ON admin_audit_log FROM PUBLIC, authenticated, service_role` (INSERT yalniz tanimli RPC-ler uzerinden); silme yerine sadece okuma+arsiv yolu birak.

### Soru 13 — Audit Retention, Partition ve Buyume Stratejisi
**Soru:** `admin_audit_log` buyumesini yonetmek icin aylik `RANGE` partition + retention politikasi mi uygulayalim, yoksa tek tablo + arsiv-disari-tasima isi mi kuralim?
- **Neden soruyoruz:** Master 9.1 "100k+ olcek" ve "yedekleme"; her admin islemi log-landiginda tablo siniSurli buyur, partition-suz tek tablo zamanla SELECT/index bakimini yavaslatir ve retention-suz log sonsuz buyur.
- **Guncel durum:** `admin_audit_log` tek tablo, partition yok, tanimli retention yok. IP/UA dahil genis satirlar.
- **Onerimiz:** `created_at`-e gore aylik `RANGE` partition-a gecir (`pg_partman` veya manuel partition + `DEFAULT` partition); 12-24 ay sicak retention, otesini `archive` semasina/`COPY` ile cold storage-a tasi; partition-lari `pg_cron` ile otomatik olustur. Lansmanda hacim dusukse en azindan `created_at` BRIN index-i ile basla, partition-u esige bagla.

### Soru 14 — IP/User-Agent Dogrulugu ve KVKK/Gizlilik
**Soru:** `admin_audit_log.ip_address`/`user_agent` alanlari gercekten dolduruluyor mu ve KVKK acisindan ne kadar saklanmali — RPC context-ten guvenilir sekilde aliniyor mu?
- **Neden soruyoruz:** Master 8.6 audit; IP/UA alanlari semada var ama SECURITY DEFINER RPC-ler bu degerleri client-ten guvenli alamiyorsa ya bos kalir ya da sahte deger yazilir, bu da audit-i yaniltir. Ayrica IP kisisel veridir, sinirsiz saklama KVKK riski.
- **Guncel durum:** Sema `ip_address`, `user_agent` sutunlarini iceriyor; bu degerlerin Edge Function/RPC zincirinde gercekten set edilip edilmedigi dogrulanmadi.
- **Onerimiz:** IP/UA-yi yalniz Edge Function katmaninda (request header-larindan) yakalayip RPC-ye explicit parametre olarak gec — DB-nin client IP-sini guvenilir bilemeyecegini kabul et; doldurulmuyorsa `NULL` birak, sahte deger uretme; retention politikasinda (Soru 13) IP icin daha kisa saklama suresi tanimla veya belli sure sonra maskele.

### Soru 15 — `admin_update_settings` Coklu Tanim Temizligi ve Versiyon Disiplini
**Soru:** 3+ kez yeniden tanimlanan `admin_update_settings` RPC-sinin son kanonik halini tek bir migration-da `DROP FUNCTION ... CREATE` ile sabitleyip eski tanimlari gecmiste birakmayi mi standartlastiralim?
- **Neden soruyoruz:** Master 9.1 "tum RPC envanteri+deploy+test"; ayni fonksiyonun farkli imzalarla tekrar tanimlanmasi `CREATE OR REPLACE` ile imza degisirse iki overload birden var olabilir, hangisinin cagrildigi belirsizlesir.
- **Guncel durum:** `admin_update_settings` migration-larda 3+ kez yeniden tanimlanmis; alt-rol zorlamasi yalniz bu RPC-de var. Soru 1/2 ile semasi da degisecek.
- **Onerimiz:** Yeni snake_case settings semasiyla birlikte `DROP FUNCTION IF EXISTS admin_update_settings(...)` (tum bilinen imzalar icin) + tek `CREATE`; ileride imza degisecekse her zaman once `DROP`; eski overload-lari `pg_proc`-tan tarayip yetim imza kalmadigini dogrula.

### Soru 16 — RPC DROP+CREATE Disiplini ve Envanter Tek-Kaynagi
**Soru:** 74 admin RPC icin "her degisiklikte `DROP FUNCTION` + `CREATE` + grant" disiplinini ve kanonik bir RPC envanter belgesini (deploy/test durumu ile) zorunlu kilacak miyiz?
- **Neden soruyoruz:** Master 9.1 "tum RPC envanteri+deploy+test"; RPC-ler DROP olmadan yeniden tanimlandiginda eski grant-lar/imzalar artakalir, deploy edilmis canli hal ile migration kaynagi sapabilir.
- **Guncel durum:** 74 admin RPC var, `adminService.ts` cagrilari karsilaniyor (orphan yok). Ancak RPC-ler DROP olmadan yeniden tanimlaniyor; merkezi bir "ad / imza / yetki-rolu / deploy / test" envanteri yok.
- **Onerimiz:** Bir `docs/RPC_ENVANTER.md` (veya bir `admin_rpc_registry` tablosu) tut: RPC adi, beklenen rol, audit-li mi, son test tarihi; CI-de `pg_proc` ile bu envanteri karsilastirip sapma varsa fail et; tum gelecek RPC degisiklikleri `DROP FUNCTION IF EXISTS ... CASCADE`-siz + acik imza ile `CREATE` + `GRANT EXECUTE` uclusunu zorunlu kilsin.

### Soru 17 — Bos Migration Dosyasinin Temizligi
**Soru:** 0 bayt olan `20260603163744_consolidate_user_tables_and_security.sql` dosyasini silmek mi yoksa icerigi gercekten uygulanmis ikiz dosyadan kurtarmak mi gerekiyor?
- **Neden soruyoruz:** Master 9.1 migration hijyeni; 0 baytlik bir migration ya bir islemin asla uygulanmadigini gizliyor ya da `supabase_migrations` gecmisinde "uygulandi" isaretliyse yeni ortamda eksik sema yaratiyor — ikisi de PITR/yeniden kurulumu kirar.
- **Guncel durum:** Dogrulandi: `20260603163744_consolidate_user_tables_and_security.sql` = 0 bayt. Ayni isimde `20260603000001_consolidate_user_tables_and_security.sql` dolu bir dosya var (muhtemelen gercek icerik orada).
- **Onerimiz:** `20260603000001`-in gercek/uygulanmis icerik oldugunu teyit et; `20260603163744`-un Supabase migration gecmisinde "uygulandi" gorunup gorunmedigini `list_migrations` ile kontrol et — eger applied ise bos birakmak guvenli (no-op), degilse gecmisten temizle; karisikligi onlemek icin bos dosyaya aciklama yorumu ekle veya gecmisle uyumlu sekilde kaldir, asla sessizce silme.

### Soru 18 — Cift Timestamp Cakismasi Cozumu
**Soru:** Iki dosyada paylasilan `20260701000001` timestamp-ini hangi dosyayi yeni bir (daha sonraki) timestamp-e tasiyarak cozecegiz?
- **Neden soruyoruz:** Master 9.1 migration hijyeni; ayni timestamp-li iki migration-in calistirma sirasi belirsizdir, `fix_match_rpc` ile `performance_rls` arasinda bagimlilik varsa yeni ortamda yanlis sirayla calisip basarisiz olabilir.
- **Guncel durum:** Dogrulandi: `20260701000001_fix_match_rpc_and_add_player_rpcs.sql` ve `20260701000001_performance_rls_and_fk_indexes.sql` ayni timestamp-i tasiyor.
- **Onerimiz:** Henuz remote-a uygulanmamis olani `20260701000002`-ye yeniden adlandir (FK/index migration-i mantiken RPC-lerden sonra gelmeli); ikisi de uygulanmissa adlandirmayi degistirmeden CI-ye "duplicate timestamp" lint-i ekle ve gelecekte engelle; bagimlilik yonunu (match RPC once, sonra performans index-leri) belgeleyerek sirayi sabitle.

### Soru 19 — Yedekleme, PITR ve Geri-Yukleme Provasi
**Soru:** Supabase PITR-i acik mi, ve admin panelinin "felaket" senaryosu (yanlislikla toplu silme) icin dokumante edilmis bir geri-yukleme provasi yapacak miyiz?
- **Neden soruyoruz:** Master 9.1 acikca "yedekleme+PITR" istiyor; god-mode admin paneli yanlislikla toplu veri silebileceginden, denenmemis bir yedek "yedek yok" demektir.
- **Guncel durum:** PITR-in aktif olup olmadigi ve geri-yukleme provasinin yapilip yapilmadigi dogrulanmadi (Supabase proje ayarina bagli, migration-larda gorunmez).
- **Onerimiz:** Supabase proje plan-inda PITR-i etkinlestir (gunluk yedek + WAL); bir staging branch-te belirli bir zamana geri-yukleme provasi yap ve sureyi/adimlari `docs`-a yaz; ayrica yikici admin RPC-lerini (toplu silme) "soft-delete + onay" modeline cevirerek kurtarmayi audit (Soru 11) ve `deletion_requests` (Soru 20) ile destekle.

### Soru 20 — `deletion_requests` / Hesap-Silme Modeli Yeterliligi
**Soru:** Hesap-silme akisini (7 gun bekleme) tek bir kanonik `deletion_requests` tablosu uzerinden mi yurutecegiz ve bekleme suresini `app_config`-ten okuyacak sekilde mi modelleyelim?
- **Neden soruyoruz:** Master 8.6 god-mode + audit ve 9.1 veri butunlugu; 7 gunluk bekleme RPC-ye hardcode iken (Soru 4) ve silme talebi kanonik bir tabloda izlenmiyorsa, admin "kim/ne zaman silinecek" kuyrugunu goremez ve geri-alma (cancel) tutarsiz olur.
- **Guncel durum:** Hesap-silme 7g bekleme RPC-de hardcode; silme-talebi tablosunun kanonik modeli (durum, talep_tarihi, planlanan_silme, iptal) dogrulanmadi/eksik gorunuyor.
- **Onerimiz:** `deletion_requests(user_id, requested_at, scheduled_purge_at, status [PENDING/CANCELLED/PURGED], reason, processed_by)` kanonik tablosunu tanimla; bekleme suresini `app_config.account_deletion_wait_days`-ten turet; gunluk `pg_cron` job ile `scheduled_purge_at <= now()` olanlari isle; her talep/iptal/silme-yi `log_admin_action` (kullanici-tetiklilerde sistem aktoru) ile audit-le; admin panele "Silme Kuyrugu" ekrani ac.

## 📦 Grup 3 — Guvenlik: Kimlik Dogrulama, 2FA & RBAC (Soru 21–30)

### Soru 21 — Alt-rol sunucu-tarafi zorlamasi (`is_finance_admin` / `is_moderator`)
**Soru:** FINANS/OPERASYON alt-rol ayrimini sunucuda zorlamak icin `is_finance_admin()`, `is_moderator()`, `is_support()` gibi `SECURITY DEFINER` yardimci fonksiyonlari ekleyip ilgili RPC'lere (orn. `admin_process_withdrawal`, `admin_resolve_dispute`, `admin_ban_user`) tek tek tatbik mi edecegiz?
- **Neden soruyoruz:** Bugun `admin_team_members.admin_role` yazilsa da neredeyse tum RPC sadece `is_platform_admin()` kontrol ediyor; yani FINANS rolu de OPERASYON RPC'lerini, OPERASYON rolu de finans RPC'lerini cagirabilir. Master 8.6 yetki matrisi (FINANS=finans, OPERASYON=dogrulama/dispute) sunucuda hic uygulanmiyor — sadece `adminPermissions.ts` UI'da gizliyor.
- **Guncel durum:** `admin_set_platform_role` rolu `admin_team_members`'a yaziyor ama alt-rollerin hepsine `profiles.is_admin=true` veriyor. `is_platform_admin()` sadece `is_admin` bakiyor; rol ayrimi yapan tek RPC `admin_update_settings` (`subrole_rbac.sql`). Diger ~75 RPC alt-rol kontrolsuz.
- **Onerimiz:** `admin_team_members.admin_role` okuyan `current_admin_role()` ve uzerine `is_finance_admin()`/`is_moderator()` helper'lari yaz; finans RPC'lerine FINANS|SUPER_ADMIN, operasyon RPC'lerine MODERATOR|SUPER_ADMIN guard'i ekle. RPC envanterini bir matris dosyasinda (`docs/rpc_rbac_matrix.md`) izle ve CI'de eksik guard'i tara.

### Soru 22 — RPC Yetki-Karari Tek-Kapidan (`require_admin_role`) Zorlama
**Soru:** Alt-rol kontrolunu her RPC govdesine dagitmak yerine, tum durum-degistiren admin RPC-lerinin BASINDA cagrilan tek bir `require_admin_role(p_allowed text[])` "fail-closed" kapi fonksiyonuna mi baglayacagiz (eksik kapi = erisim reddi)?
- **Neden soruyoruz:** Master 9.1 SSOT; yetki kontrolu RPC'lere tek tek `IF NOT is_finance_admin() THEN ...` seklinde kopyalanirsa bir RPC'de unutulma riski yuksek ve hangi RPC'nin hangi rolu istedigi tek yerden gorulemez. Tek kapi fonksiyonu yetki kararini merkezilestirir ve eksik-guard'i tespit edilebilir kilar (Soru 21'in tatbiki bu kapidan gecer).
- **Guncel durum:** Soru 21'de saptandi: alt-rol kontrolu yalniz `admin_update_settings`'te elle var; ortak bir kapi fonksiyonu (`require_admin_role`) tanimli degil, her RPC kendi (cogunlukla eksik) kontrolunu yapiyor.
- **Onerimiz:** `require_admin_role(p_allowed text[])` SECURITY DEFINER fonksiyonu yaz: cagiranin `admin_team_members.admin_role`'u `p_allowed` icinde degilse `RAISE EXCEPTION`; tum finans/operasyon RPC-lerini bu cagriyla baslat; `pg_proc` taramasi ile durum-degistiren ama `require_admin_role` cagirmayan RPC-leri CI'da fail-et. Yetki modelini enum-SSOT'ta tut (kullanilmayan `permissions` JSONB konusu Soru 5'te ele alindi).

### Soru 23 — Ilk SUPER_ADMIN bootstrap ve sonradan atama guvenligi
**Soru:** Sistemde hic admin yokken ilk SUPER_ADMIN'i nasil guvenli olusturacagiz ve `admin_set_platform_role`'un "son SUPER_ADMIN'i dusurme" ya da "kendine yukseltme" senaryolarini nasil engelleyecegiz?
- **Neden soruyoruz:** `admin_set_platform_role` cagirani `is_super_admin()` ile koruyor — yani hic super_admin yoksa kimse atama yapamaz (chicken-egg). Ayrica son super_admin yanlislikla dusurulurse panel kilitlenir.
- **Guncel durum:** `admin_set_platform_role` (`subrole_rbac.sql`) yalniz SUPER_ADMIN cagirabilir; `admin_revoke_platform_role` mevcut. Son-super-admin korumasi ve idempotent bootstrap script'i dogrulanamadi (yok varsayiyoruz).
- **Onerimiz:** SQL seed migration ile tek seferlik, e-posta beyaz-listeli bootstrap SUPER_ADMIN olustur; `admin_revoke_platform_role` ve `admin_set_platform_role`'a "COUNT(super_admin)=1 ise son super_admin'i dusurmeyi RAISE EXCEPTION ile engelle" guard'i ekle; self-revoke ve kendini SUPER_ADMIN'e yukseltmeyi yasakla.

### Soru 24 — Admin oturum zaman asimi / idle-logout
**Soru:** Admin panelinde mutlak oturum suresi (orn. 8 saat) ve hareketsizlik (idle) zaman asimi (orn. 15 dk) zorunlu olsun mu, olursa nerede uygulanir (client timer + Supabase JWT exp)?
- **Neden soruyoruz:** GodView tam yetkili bir konsol; acik birakilan bir admin sekmesi god-mode'a fiziksel erisim riski yaratir. Master 8.6 "her kritik islem audit" der ama oturum hijyeni ayri bir kontroldur.
- **Guncel durum:** `AdminAuthGate.tsx`/`AdminMfaGate.tsx` aal2 zorunlu kiliyor; idle-logout veya mutlak oturum TTL kodu dogrulanamadi (yok varsayiyoruz). Supabase JWT default refresh suresiyle uzar.
- **Onerimiz:** Client'ta idle-timer (15 dk hareketsizlikte `signOut`) + mutlak oturum yasi kontrolu (token issued_at > 8 saat ise zorla cikis); kritik islemler oncesi son-MFA-zamani 30 dk'dan eskiyse re-challenge (step-up auth).

### Soru 25 — Brute-force / rate-limit + login alarmlari
**Soru:** Admin login ve MFA-challenge denemelerine sunucu-tarafi rate-limit + basarisiz deneme alarmi (e-posta/Slack) ekleyecek miyiz?
- **Neden soruyoruz:** 2FA parolayi koruyor ama yine de credential-stuffing ve MFA-fatigue saldirilarina karsi hiz siniri ve gorunurluk sart. Master 9.1 edge guvenligi ve olcek (100k+) baglaminda admin yuzeyi en yuksek deger hedefidir.
- **Guncel durum:** `signInAdmin` admin olmayani aninda cikis yaptiriyor; ozel rate-limit/alarm dogrulanamadi (Supabase Auth'un default brute-force korumasi disinda yok varsayiyoruz).
- **Onerimiz:** Admin login akisini bir edge function arkasina al, IP+email basina sayac (orn. Postgres veya Upstash) ile 5 basarisiz/15 dk'da kilitle; her basarili admin login ve her kilitlenmede `send-email`/webhook ile gercek-zamanli alarm gonder; tum denemeleri `admin_audit_log`'a yaz.

### Soru 26 — admin.html icin IP allowlist / ag kisiti
**Soru:** Admin panelini (admin.html + admin-* edge function'lar) belirli IP/CIDR veya VPN/WARP ag kisitiyla mi sinirlandiracagiz, yoksa salt 2FA+RBAC yeterli mi sayilacak?
- **Neden soruyoruz:** God-mode konsolu internete tamamen acik olmasi, RBAC bypass'i bulunduran herhangi bir bug'i kritige cevirir. Ag-katmani savunmasi (defense-in-depth) saldiri yuzeyini buyuk olcude daraltir.
- **Guncel durum:** admin paneli ayri bir Vite app (admin.html); ag-katmani IP kisiti dogrulanamadi (yok varsayiyoruz). `admin-create-user` sadece `ADMIN_ALLOWED_ORIGIN` (default `*`) kullaniyor.
- **Onerimiz:** Statik admin app'i Cloudflare Access/Zero Trust arkasina koy (e-posta + cihaz politikasi); admin-* edge function'larda gelen IP'yi izinli CIDR listesiyle dogrula. Ekip daginiksa sabit-IP VPN ya da WARP team policy uygula.

### Soru 27 — 2FA kurtarma kodlari + cihaz kaybi sureci
**Soru:** TOTP cihazini kaybeden bir admin icin recovery-code mekanizmasi mi sunacagiz, yoksa SUPER_ADMIN tarafindan denetlenen manuel MFA-reset RPC'si mi olacak?
- **Neden soruyoruz:** Bugun MFA zorunlu ve cihaz kaybinda admin tamamen kilitlenir; kurtarma yolu tanimsizsa ya panik-bypass (guvenlik delici) eklenir ya da operasyon durur.
- **Guncel durum:** `AdminMfaGate.tsx` TOTP enroll/challenge zorunlu; recovery code uretimi veya admin-reset RPC dogrulanamadi (yok varsayiyoruz). Bilinen dev-bypass yok (iyi).
- **Onerimiz:** Enroll aninda tek-kullanimlik 8-10 recovery kodu uret (hash'lenmis sakla); kullanilan kodu invalide et. Recovery kodu da yoksa, SUPER_ADMIN tarafindan cagrilabilen, audit-li `admin_reset_mfa(p_user_id)` RPC'si (self-reset yasak) tanimla.

### Soru 28 — Admin hesap olusturma / iptal yasam dongusu
**Soru:** Admin hesabi acma ve kapatma (offboarding) icin tek kanonik akis ne olacak: `admin-create-user` edge function mu, `admin_set_platform_role` RPC mi, ikisi de mi ve iptal aninda hangi adimlar zorunlu?
- **Neden soruyoruz:** Iki ayri yol (edge function + RPC) tutarsizlik ve eksik audit riski tasir. Master 9.1 SSOT ve "her kritik islem audit" ilkesi tek, izlenebilir bir yasam dongusu ister.
- **Guncel durum:** `admin-create-user` (auth user + profile yaratiyor, `is_platform_admin` + `ADMIN_ALLOWED_ORIGIN`); `admin_set_platform_role` rol veriyor; `admin_revoke_platform_role` rol aliyor. Birlesik bir offboarding (oturum iptali + rol revoke + ghost iptali) dogrulanamadi.
- **Onerimiz:** Tek bir "admin_offboard(p_user_id)" RPC tanimla: rol revoke + `is_admin=false` + tum refresh-token'lari iptal (admin signOut) + aktif ghost session sonlandir, hepsi tek transaction ve tek audit kaydiyla. Onboarding'i `admin-create-user` -> zorunlu MFA enroll -> `admin_set_platform_role` sirasina sabitle.

### Soru 29 — `SECURITY DEFINER` `search_path` sertligi denetimi
**Soru:** Tum admin/`SECURITY DEFINER` fonksiyonlarinda `SET search_path` sabitlemesini (orn. `'public', 'pg_temp'`) eksiksiz garanti etmek icin periyodik bir denetim/CI kontrolu kuracak miyiz?
- **Neden soruyoruz:** `search_path` sabitlenmeyen `SECURITY DEFINER` fonksiyon, schema-shadowing ile yetki yukseltmeye acik klasik bir guvenlik acigidir. Yetki zincirinin tamami bu helper'lara dayandigi icin tek istisna bile kritiktir.
- **Guncel durum:** Cogu kritik fonksiyon `SET search_path TO 'public'` iceriyor (orn. `process_match_payment` `'public','pg_temp'`, `join_public_match_slot` sadece `'public'`); tutarsiz (bazisi `pg_temp` icermiyor) ve tam kapsam dogrulanamadi.
- **Onerimiz:** Tum `SECURITY DEFINER` fonksiyonlari `pg_proc.proconfig`'ten tarayan bir SQL denetimi yaz; `search_path` eksik/`pg_temp`siz olanlari raporla ve hepsini `'public', 'pg_temp'`'e standardize et; `get_advisors` (security) ciktisini CI'de fail-on-warn yap.

### Soru 30 — Kalan public-read `USING(true)` politikalarinin gozden gecirilmesi
**Soru:** `profiles`, `pitches`, `matches`, `texts`, `tariffs` uzerindeki kalan `USING(true)` SELECT politikalarini kolon-bazli maskeleme ile mi daraltacagiz (orn. `profiles`'da telefon/e-posta gizleme), yoksa public-read olarak kabul mu edecegiz?
- **Neden soruyoruz:** `profiles` public `USING(true)` ile okunabiliyorsa, anon kullanici tum profillerin hassas alanlarini (e-posta, telefon, wallet_balance) cekebilir — bu hem KVKK hem guvenlik sorunudur. Master 9.1 "her tabloda RLS" der; mevcut "kabul edilebilir ama gozden gecir" notu acik birakilmis.
- **Guncel durum:** `matches/teams/settings/goalkeepers/referees` sertlestirildi; `profiles, pitches, matches, texts, tariffs` hala `USING(true)` public-read. Hangi kolonlarin sizdigi alan bazinda dogrulanmadi.
- **Onerimiz:** `profiles` icin public SELECT'i hassas kolonlardan ari bir `public_profiles` view'ine tasi; ham tabloda SELECT'i `auth.uid()=id OR is_platform_admin()` ile sinirla. `pitches/texts/tariffs` gercekten herkese acik veriyse `USING(true)` birak ama bunu acik bir yorum + advisor istisnasiyla belgele.

## 📦 Grup 4 — Guvenlik: RLS, Ghost Mode, Edge Function & Sirlar (Soru 31–40)

### Soru 31 — Ghost mode sure siniri + session TTL
**Soru:** Impersonation (ghost mode) oturumlarina katı bir sure siniri (orn. 30 dk) ve sunucu-tarafli aktif-session TTL'i ekleyecek miyiz?
- **Neden soruyoruz:** Bugun ghost mode'un sure siniri yok; `?ghost=userId` deep-link ile baslayan bir oturum suresiz devam edebilir. Master 8.6 "her kritik islem audit" der ama sure-siz impersonation, yetki kotuye kullanimini ve KVKK ihlal yuzeyini buyutur.
- **Guncel durum:** `admin_log_impersonation` SECURITY DEFINER ile audit'liyor AMA sure siniri/session TTL yok; tuketici app'te GHOST MODE banner var; `App.tsx ?ghost=userId` ile tetikleniyor.
- **Onerimiz:** Sunucu-tarafli `admin_ghost_sessions` tablosu (admin_id, target_id, started_at, expires_at, reason); baslatmayi `admin_start_ghost(p_target, p_reason)` RPC'sine bagla, expires_at=now()+30dk; suresi gecince RLS/uygulama erisimi reddetsin; banner expires_at'i gostersin.

### Soru 32 — Ghost mode zorunlu audit + read-only kapsam
**Soru:** Ghost mode'u best-effort client log'undan cikarip sunucu-tarafli ZORUNLU audit'e mi cevirecegiz, ve impersonation sirasinda yazma islemlerini read-only mi (ya da explicit-onayli) mi kisitlayacagiz?
- **Neden soruyoruz:** Audit log'u client try/catch ile best-effort olmasi, log atilmadan impersonation yapilabilmesi demek — yani inkar-edilemezlik (non-repudiation) yok. Ayrica ghost'ta admin'in kullanici adina para/rezervasyon islemi yapabilmesi en yuksek suistimal riski.
- **Guncel durum:** Client `adminService.ts:625` `admin_log_impersonation` cagiriyor ama best-effort try/catch (zorunlu degil); read-only kapsami yok — ghost'ta tum kullanici RPC'leri calisabilir.
- **Onerimiz:** Ghost baslangicini sunucuda zorunlu kil (banner/erisim ancak gecerli ghost-session kaydi varsa); impersonation context'inde default read-only — para/silme/rezervasyon mutasyonlarini blokla; istisnai yazma gerekirse ayrica audit'li "ghost_write" onayi iste.

### Soru 33 — Edge CORS production kisitlamasi (`ADMIN_ALLOWED_ORIGIN`)
**Soru:** Tum admin-* ve odeme edge function'larinda production'da `Access-Control-Allow-Origin: *`'i gercek admin origin'iyle (orn. `https://admin.oyna.app`) mi degistirecegiz?
- **Neden soruyoruz:** `*` origin, kullanici tarayicisindaki kotu niyetli bir siteden admin endpoint'lere CSRF/credential-leak yuzeyi acar. Kod yorumu zaten "prod'ta ayarla" diyor ama default hala `*`.
- **Guncel durum:** `admin-create-user/index.ts:8` `ADMIN_ALLOWED_ORIGIN ?? '*'`; `payment-webhook` CORS `*` (imza ile hafifletilmis); `void-payment`, `capture-payment`, `refund-payment`, `send-email`, `create-payment` corsHeaders sabit (origin dogrulanmadi).
- **Onerimiz:** Prod secret olarak `ADMIN_ALLOWED_ORIGIN=https://admin.oyna.app` zorunlu set et; tum admin/odeme function'larinda Origin'i izinli listeyle dogrula, eslesmezse 403; webhook'larda CORS gereksiz (tarayici cagrisi degil) — Origin header'i tamamen yok say, imzaya guven.

### Soru 34 — Webhook imza + replay/idempotency korumasi
**Soru:** `payment-webhook`'a imza dogrulamasinin yaninda replay koruma (timestamp tolerance) ve idempotency (event_id tekilligi) ekleyecek miyiz?
- **Neden soruyoruz:** Imza dogru olsa bile ayni gecerli istek tekrar gonderilirse (replay) cift cuzdan-kredisi/cift rezervasyon olusabilir. Master 9.1 "webhook imza" der ama imza tek basina idempotency saglamaz.
- **Guncel durum:** `payment-webhook` iyzico imzasini sunucuda dogruluyor (iyi); replay/idempotency dogrulanamadi (yok varsayiyoruz).
- **Onerimiz:** Webhook event'inin benzersiz id'sini `processed_webhook_events` tablosuna `UNIQUE` ile yaz; cakismada islemi atla (idempotent). Imza payload'inda timestamp varsa +/-5 dk tolerans uygula, eski olani reddet.

### Soru 35 — `admin-broadcast` secret rotasyonu ve auth modeli
**Soru:** `admin-broadcast`'un `x-admin-secret` static-secret modelini, kullanici-baglamli `is_platform_admin()` + MFA'ya mi tasiyacagiz, yoksa secret'i periyodik rotate eden bir politikaya mi baglayacagiz?
- **Neden soruyoruz:** Statik paylasilan secret, tek bir sizinti ile herhangi birinin tum kullanicilara push gondermesine izin verir ve kim gonderdigi belirsizdir (audit zayif). Diger admin function'lar (`admin-create-user`) zaten kullanici-baglamli `is_platform_admin()` kullaniyor — tutarsizlik var.
- **Guncel durum:** `admin-broadcast/index.ts:19` `x-admin-secret` header karsilastirmasi; rotasyon politikasi/kullanici-baglami dogrulanamadi.
- **Onerimiz:** `admin-broadcast`'i `admin-create-user` ile ayni modele tasi: caller JWT'sinden `is_platform_admin()` (tercihen `is_moderator()`/SUPER_ADMIN) dogrula, her broadcast'i gonderen admin id'siyle audit'le. Static secret kalacaksa 90 gunde bir rotasyon + sizinti-aninda iptal prosedurunu belgele.

### Soru 36 — Service-role kullanim envanteri
**Soru:** Service-role anahtarini kullanan tum kod yollarini (edge function'lar) envanterleyip her birinin RLS-bypass'i neden gerektigini belgeleyen bir kayit tutacak miyiz?
- **Neden soruyoruz:** Service-role RLS'i tamamen bypass eder; nerede kullanildigi gozden kacarsa, tek bir guard eksikligi tum veriye yetkisiz erisim demektir. Master 9.1 secret yonetimi ve olcek baglaminda en yuksek-ayricalikli anahtarin envanteri sart.
- **Guncel durum:** Service-role/iyzico/APNs/FCM/Resend edge secrets'te (iyi); client'ta yalniz anon key. Hangi function'larin service-role kullandigi ve her birinde admin-guard olup olmadigi tam envanterlenmedi.
- **Onerimiz:** Edge function'larda `SERVICE_ROLE` kullanan dosyalari tara; her biri icin "neden gerekli + onunde hangi auth guard var" satirini `docs/service_role_inventory.md`'ye yaz; service-role ile yapilan her mutasyonu mecburi audit'le; mumkun olan yerlerde caller-JWT + RLS modeline geri don.

### Soru 37 — Audit Log Tamper-Evidence (Hash-Zincir) ve Imzali Arsiv Butunlugu
**Soru:** Append-only kisitinin (Soru 12) otesinde, satir-silme/satir-degistirme girisimini KANITLANABILIR kilmak icin her audit kaydina onceki kaydin hash'ini iceren bir hash-zincir (tamper-evident chain) + periyodik imzali export butunluk-dogrulamasi ekleyecek miyiz?
- **Neden soruyoruz:** Master 8.6 audit'in degeri "inkar-edilemez kanit"; salt RLS/trigger ile UPDATE/DELETE bloklamak (Soru 12) DB-sahibi/servis-rolu duzeyinde bypass edilirse iz birakmaz. Hash-zincir, bir satirin sonradan degistirildigini/silindigini matematiksel olarak ortaya cikarir — bu DB-ici yasaklamadan farkli, tamamlayici bir savunma katmanidir.
- **Guncel durum:** `log_admin_action` ile kayit yaziliyor; ancak satirlar arasinda butunluk-zinciri (prev_hash/row_hash) veya export'ta checksum/imza dogrulamasi YOK — yalniz erisim-kontrolune guveniliyor.
- **Onerimiz:** `admin_audit_log`'a `row_hash` + `prev_hash` ekle; INSERT trigger'i `row_hash = sha256(prev_hash || satir-payload)` hesaplasin; periyodik bir dogrulama job'i zincirin kopmadigini kontrol edip kopukluk bulursa alarm uretsin; aylik export'u SHA256 checksum + imza ile ayri bir cold-storage bucket'a yaz (saklama/partition politikasi Soru 13'te, RLS append-only Soru 12'de tanimlandi — bu soru yalniz tamper-evidence katmanini ekler).

### Soru 38 — KVKK: impersonation ve admin erisim loglari
**Soru:** Impersonation ve hassas-veri goruntuleme islemlerini, etkilenen kullanicinin "verilerime kim eristi" talebine yanit verebilecek sekilde, gerekce-zorunlu ve sorgulanabilir mi loglayacagiz?
- **Neden soruyoruz:** KVKK (ve esdeger GDPR) admin'in kisisel veriye erisimini hesap-verebilir kilmayi gerektirir; "neden" alani olmadan log, denetim icin yetersiz. Master "her kritik islem audit" + KVKK uyumu birlikte gerekce-bazli erisim ister.
- **Guncel durum:** `admin_log_impersonation` impersonation'i kaydediyor (ama gerekce alani/zorunlulugu dogrulanmadi). Kullanici-bazli "bana kim eristi" sorgusu mevcut degil varsayiyoruz.
- **Onerimiz:** Her ghost baslatma ve hassas-PII goruntulemede zorunlu `reason` alani iste; `target_user_id` indeksli sakla; kullanicinin veri-erisim talebinde kendisini etkileyen admin erisimlerini donduren bir rapor/RPC hazirla; KVKK aydinlatma metnine admin-erisim maddesini ekle.

### Soru 39 — 18-alti / PII verisine admin erisim minimizasyonu
**Soru:** 18-yas-alti kullanici verisi ve yuksek-hassasiyet PII (TC kimlik, telefon, dogum tarihi, IBAN) icin admin panelinde varsayilan-maskeleme + "goster" aninda audit modelini uygulayacak miyiz?
- **Neden soruyoruz:** GodView tum profilleri gorebiliyorsa, gereksiz PII gorunurlugu hem KVKK veri-minimizasyon ilkesini ihlal eder hem de sizinti etkisini buyutur — ozellikle resit-olmayanlar icin ek hassasiyet var.
- **Guncel durum:** `admin_fetch_profiles` profilleri donuyor; alan-bazli maskeleme veya yas-bazli kisit dogrulanamadi (yok varsayiyoruz). `profiles` ayrica public `USING(true)`.
- **Onerimiz:** PII alanlarini panelde default maskele (orn. `+90 5** *** ** 34`); acik "goster" tiklamasi zorunlu audit yazsin; 18-alti kayitlar icin OPERASYON disindaki rollere PII'yi tamamen gizle; veri-minimizasyonunu RPC seviyesinde (rol bazli kolon donus) zorla.

### Soru 40 — Sir rotasyon politikasi ve sizinti mudahale plani
**Soru:** Tum edge secret'lar (service-role, iyzico, APNs/FCM, Resend, `x-admin-secret`) icin duzenli rotasyon takvimi ve sizinti-aninda hizli-iptal/yeniden-deploy runbook'u tanimlayacak miyiz?
- **Neden soruyoruz:** Secret'lar guvenli saklansa da rotasyon politikasi yoksa, eski/sizmis bir anahtar suresiz gecerli kalir. Master 9.1 secret yonetimi rotasyonu ve yedeklemeyi (operasyonel sureklilik) kapsar.
- **Guncel durum:** Secret'lar edge secrets'te, `.env` gitignore'da (iyi); rotasyon takvimi/runbook ve `github run_secret_scanning` gibi sizinti taramasi dogrulanamadi.
- **Onerimiz:** `docs/secret_rotation.md`'de her secret icin sahip + rotasyon araligi (orn. service-role 180g, webhook secret 90g) + iptal adimlarini belgele; repo'da gizli-tarama (secret scanning) ac; her rotasyonu audit'le ve rotasyon sonrasi `supabase functions deploy` checklist'ini sabitle.

## 📦 Grup 5 — UI/UX: Navigasyon, Tasarim Sistemi & Genel Cila (Soru 41–50)

### Soru 41 — Tasarim Token'larini Tek Kaynaga Cekme
**Soru:** Admin panelindeki renk/aralik/yari-cap degerlerini (orn. `#161B22`, `#39FF14`, `#0D1117`, `border-white/[0.06]`, `rounded-2xl`) merkezi bir tasarim-token katmanina (`adminTheme.ts` + Tailwind preset) tasiyip tum bilesenleri buradan beslemeli miyiz?
- **Neden soruyoruz:** Master 9.1 "tutarli isimlendirme/SSOT" ilkesinin gorsel karsiligi yok; ayni gri tonu ve kart arka plani onlarca dosyada elle tekrar ediliyor, tek bir renk degisikligi bile tüm sayfalarda manuel arama-degistirme gerektiriyor.
- **Guncel durum:** `Sidebar.tsx` (`bg-[#161B22]/90`), `DashboardPage.tsx` (`#39FF14`, `#161B22`), `FinancePage.tsx` (`border-white/[0.06]`) ve `MatchDetailDrawer.tsx` (`bg-[#0D1117]`) ayni hex degerlerini hardcode ediyor; ortak bir token dosyasi `design/` altinda YOK (`adminRoutes.ts` sadece accent ve route meta tutuyor).
- **Onerimiz:** `views/design/adminTheme.ts` icinde `surface/border/accent/danger/success` token'larini tanimla, Tailwind config'e CSS degisken tabanli preset ekle; hex literal kullanimini lint kuraliyla yasakla.

### Soru 42 — Accent Sistemi vs. Gercek Kullanim Tutarsizligi
**Soru:** `adminRoutes.ts` icindeki `ACCENT_STYLES` (her route'a accent atanmis) sayfalarda gercekten uygulaniyor mu, yoksa sayfalar kendi renklerini bagimsiz mi seciyor ve bu accent sistemini zorunlu kilmali miyiz?
- **Neden soruyoruz:** Tasarim sistemi tutarliligi icin route accent'i tek dogruluk kaynagi olmali; aksi halde "kirmizi/yesil/mor" renkler sayfa basina rastgele dagiliyor ve marka dili bozuluyor.
- **Guncel durum:** `adminRoutes.ts` `FINANCE: accent 'yellow'`, `MATCHES: accent 'red'` tanimliyor; ancak `MatchesPage.tsx` aksiyon butonu `bg-red-600/80`, fiyat `#39FF14` kullaniyor, `FinancePage.tsx` stat kartlari `text-[#39FF14]`/`text-blue-400` karisik kullaniyor — accent meta'si `PageShell` disinda yok sayiliyor.
- **Onerimiz:** Accent'i `PageShell` uzerinden CSS degiskenine (`--accent`) bagla, sayfa ici vurgu renkleri bu degiskenden türetilsin; "her sayfa kendi rengini secsin" pratigini kaldir.

### Soru 43 — Sidebar Bilgi Mimarisi & Kapsam-Disi Gruplari
**Soru:** Sidebar'daki "TOPLULUK YONETIMI" (Topluluklar/Takimlar/Turnuvalar) ve "PAZARLAMA" (Kampanyalar/Indirim Kodlari) gruplarini lansman kapsamindan cikarip varsayilan gizli (feature-flag arkasinda) hale getirmeli miyiz?
- **Neden soruyoruz:** Master "Topluluk/Promo lansmanda YOK" derken sidebar bu modulleri birinci sinif menü grubu olarak gosteriyor — kapsam kaymasi ve operatorde kafa karisikligi yaratiyor.
- **Guncel durum:** `Sidebar.tsx` `SIGEBAR_GROUPS` icinde `TOPLULUK YONETIMI` (`Topluluklar`, `Takimlar`, `Turnuvalar`) ve `PAZARLAMA` (`Kampanyalar`, `Indirim Kodlari`) gruplari tam gorünür; `Takimlar`/`Turnuvalar` badge bile almiyor (`badge: null`) yani icerigi de belirsiz.
- **Onerimiz:** Bu gruplari `FEATURE_FLAGS.community/promo` arkasina al, varsayilan kapali; lansman sonrasi acilacak sekilde tek satir flag ile geri getirilebilir yap.

### Soru 44 — Sidebar Yetkiye Gore Gizleme Kapsami
**Soru:** Sidebar'da bos kalan menü gruplarini (yetki filtresi tum öğeleri eledikten sonra) tamamen gizlemeli ve grup basligini da kaldirmali miyiz?
- **Neden soruyoruz:** Master 8.6 yetki matrisi (FINANS/OPERASYON) farkli rollere farkli görünüm vaat ediyor; ancak ogeleri elenmis bir grubun basligi yine de render ediliyorsa FINANS admini bos "OPERASYON" basligi görür.
- **Guncel durum:** `Sidebar.tsx` `group.items.filter(... canAccess(route))` ile öğeleri filtreliyor ama `SIDEBAR_GROUPS.map` grup basligini (`<p>{group.label}</p>`) kosulsuz render ediyor — tum ogeleri elenmis grup bos baslik olarak kalir.
- **Onerimiz:** Once grup ogelerini filtrele, `filtered.length === 0` ise grubun tamamini (baslik dahil) render etme.

### Soru 45 — Command Palette Kapsam & Aksiyon Eksikligi
**Soru:** Command Palette'i yalnizca sayfa navigasyonuyla sinirli tutmak yerine sik kullanilan aksiyonlari (orn. "Maci iptal et", "Payout tamamla", "Kullaniciyi banla", "Ghost giris") da icerecek sekilde genisletmeli miyiz?
- **Neden soruyoruz:** God-mode hizini palette saglar; sadece route listesi olmasi paletin degerini düsürür ve operator her aksiyon icin sayfaya gidip butonu aramak zorunda kalir.
- **Guncel durum:** `adminRoutes.ts` `COMMAND_PALETTE_ROUTES` SADECE 24 route navigasyon kaydi iceriyor; aksiyon (komut) tipinde giris yok ve yorum "sidebar ile senkron tutun" diyerek kapsami navigasyonla siniyor.
- **Onerimiz:** Palette'e `type: 'route' | 'action'` ayrimi ekle; `action` komutlari yetkiye gore filtrelensin ve dogrudan ilgili modal/RPC'yi tetiklesin.

### Soru 46 — Command Palette ile Sidebar/Route Senkronu Otomasyonu
**Soru:** `COMMAND_PALETTE_ROUTES`, `SIDEBAR_GROUPS` ve `ADMIN_ROUTE_META` ücüsünü tek kanonik route registry'den türetmeli miyiz (manuel senkron yerine)?
- **Neden soruyoruz:** Master 9.1 SSOT ilkesi; üç ayri yerde elle tutulan route listeleri birbirinden sapiyor (orn. `SEGMENTATION` palette'te yok ama meta'da var) ve yeni sayfa eklendiginde biri unutuluyor.
- **Guncel durum:** `adminRoutes.ts` `ADMIN_ROUTE_META` 26 route, `COMMAND_PALETTE_ROUTES` 24 route iceriyor (`SEGMENTATION` ve bazi öğeler palette'te yok); `Sidebar.tsx` ise label→route'u kendi `routeForLabel` map'iyle ücüncü kez elle tutuyor.
- **Onerimiz:** Tek `ADMIN_ROUTES` dizisi tanimla (route, label, icon, group, accent, permission, inPalette, inSidebar); sidebar/palette/meta bu diziden map'lensin.

### Soru 47 — Kapsam-Disi Sayfalarin (Community/Promo/Campaign/Segmentation) Yonetimi
**Soru:** Lansman kapsami disindaki `CommunitiesPage`, `PromoCodesPage`, `CampaignsPage`, `SegmentationPage` sayfalarini kodda tutup route/sidebar/palette girislerini kaldirarak mi (gizle) yoksa tamamen kaldirarak mi sadelestirelim?
- **Neden soruyoruz:** Master "Topluluk/Promo lansmanda YOK" derken bu 4 sayfa hem route hem sidebar hem palette'te aktif — celiski hem operatoru hem QA kapsamini sisiriyor.
- **Guncel durum:** `adminRoutes.ts` `TOPLULUKLAR`, `PROMO_CODES`, `NOTIFICATIONS` (Kampanyalar), `SEGMENTATION` meta'da; `Sidebar.tsx` `Topluluklar`/`Kampanyalar`/`Indirim Kodlari` menüde; `COMMAND_PALETTE_ROUTES` da bunlari listeliyor — üc giris noktasinda da canli.
- **Onerimiz:** Sayfalari sil yerine "gizle": tek `FEATURE_FLAGS` kapisi arkasina al, route registry'de `enabled:false` isaretle; kod kalsin, kullanici yüzeyinden tümüyle kalksin.

### Soru 48 — Mobil / Responsive Admin Davranisi
**Soru:** Sabit `w-56` sidebar ve `min-w-[640px]` tablolar dar ekranlarda kullanilamaz hale geldigi icin tablet/mobil icin collapse-edilebilir drawer sidebar + responsive tablo deseni eklemeli miyiz?
- **Neden soruyoruz:** Admin saha operasyonu (mac günü mudahalesi) sik sik telefondan yapilir; god-mode'un "her problem panelden cozulebilir" vaadi mobilde kirik.
- **Guncel durum:** `Sidebar.tsx` `aside className="w-56 ... shrink-0"` sabit genislik, mobil collapse yok; `DataTable.tsx` `min-w-[640px]` ile yatay kaydirma zorunlu, kart-görünüme düsme yok.
- **Onerimiz:** Sidebar'i `md:` altinda overlay drawer'a cevir (hamburger ile ac/kapa); `DataTable`'a `mobileCardRender` opsiyonu ekleyip dar ekranda satirlari kart olarak göster.

### Soru 49 — i18n Altyapisi (TR Sabit Stringler)
**Soru:** Su an tüm UI metinleri TR olarak JSX icine gömülü; ileride coklu dil icin merkezi bir `t()` / sozluk katmani altyapisini simdiden kurmali miyiz?
- **Neden soruyoruz:** Master ileri ölcek (100k+) ve büyüme hedefi; metinler dosyalara dagildikca sonradan i18n'e gecmek tüm bilesenleri yeniden dokunmayi gerektirir.
- **Guncel durum:** `Sidebar.tsx`, `SettingsPage.tsx`, `FinancePage.tsx` tüm etiketleri (`'Komuta Merkezi'`, `'Bekleyen Cekim'`, `'Tabloda ara...'`) dogrudan string literal olarak iceriyor; merkezi sozluk veya i18n kütüphanesi izi yok.
- **Onerimiz:** Hafif bir `adminStrings.ts` sozlügü + `t(key)` helper'i ile basla (su an sadece TR); literal metinleri kademeli olarak anahtara tasi, böylece ileride dil eklemek sadece sozluk genisletmesi olur.

### Soru 50 — Klavye Kisayollari & Global Arama Tutarliligi
**Soru:** Tüm modüllerde tutarli klavye kisayollari (orn. `Cmd/Ctrl+K` palette, `/` arama odagi, `Esc` drawer kapat, `g` ile route atlama) ve standart bir global arama girisini garanti etmeli miyiz?
- **Neden soruyoruz:** God-mode operasyon hizi klavye-öncelikli akisa baglidir; kisayollar tutarsizsa kas hafizasi olusmaz, palette'in degeri azalir.
- **Guncel durum:** `MatchesPage`/`FinancePage`/`AuditLogPage` her biri kendi `AdminSearchBar`'ini iceriyor ama ortak bir kisayol (`/` ile odak, `Esc` ile temizle) baglanmamis; `MatchDetailDrawer.tsx` drawer'i `Esc` ile kapatma dinleyicisi YOK (sadece overlay click + X).
- **Onerimiz:** Global bir `useAdminHotkeys` hook'u ekle; `Esc` drawer/modal kapatma, `/` arama odak, `Cmd/Ctrl+K` palette davranisini tek yerden zorla.

## 📦 Grup 6 — UI/UX: Mac Kontrol Kokpiti & Modul Derinligi (Soru 51–60)

### Soru 51 — Kokpitte Force Capture / Void / Refund Eksikligi
**Soru:** `MatchDetailDrawer`'a master 8.6'nin zorunlu kildigi force-capture, force-void ve force-refund aksiyonlarini (ilgili RPC + yikici onay deseniyle) eklemeli miyiz?
- **Neden soruyoruz:** Master 8.6 "force capture/void/refund" kokpitin olmazsa-olmazi; bu olmadan odeme sikismalari panelden cozulemez, god-mode vaadi kirik.
- **Guncel durum:** `MatchDetailDrawer.tsx` yalnizca kick/assign/referee/status/cancel aksiyonlarini iceriyor (`kickFromSlotAdmin`, `assignToSlotAdmin`, `assignMatchRefereeAdmin`, `setMatchStatusAdmin`, `cancelMatchAdmin`); capture/void/refund cagrisi veya butonu YOK.
- **Onerimiz:** Drawer'a "Odeme/Tahsilat" sekmesi ekle; `admin_force_capture/void/refund` RPC'lerini `ActionConfirmModal` "yaz-onayla" deseniyle bagla, sonuc denetim kaydina düssün.

### Soru 52 — Kokpitte Skor Override & Hizmet Saglayici Atamasi
**Soru:** Kokpite skor override (`admin_override_match_score`) ve kaleci/hakem ata-degistir-kaldir UI'lari eklemeli miyiz (su an yalnizca hakem secimi var, kaleci ve skor yok)?
- **Neden soruyoruz:** Master 8.6 "skor override" ve "kaleci/hakem ata/degistir/kaldir" kokpit gereksinimi; DB'de `admin_override_match_score` RPC VAR ama UI bunu hic sunmuyor.
- **Guncel durum:** `MatchDetailDrawer.tsx` sadece `<select>` ile hakem atiyor (`handleReferee`); kaleci atamasi YOK, skor girisi/override alani YOK; `admin_override_match_score` RPC UI'da hic cagrilmiyor.
- **Onerimiz:** Drawer'a "Sonuc & Kadro" bölümü ekle: ev/deplasman skor inputlari + `admin_override_match_score`, kaleci slotu icin ata/kaldir, hakem icin degistir/kaldir.

### Soru 53 — Force-Confirm & Payout Tetikleme Butonu
**Soru:** Kokpite force-confirm (slot/mac onayini zorla) ve maca bagli payout tetikleme aksiyonunu eklemeli miyiz?
- **Neden soruyoruz:** Master 8.6 "force-confirm" ve "payout tetik" kokpit gereksinimleri; mac tamamlandiginda saglayici odemesini panelden tetikleyememek operasyonu Finans sayfasina böler.
- **Guncel durum:** `MatchDetailDrawer.tsx` status butonlari (`DRAFT/ACTIVE/LIVE/COMPLETED/CANCELLED`) var ama "force-confirm" semantigi ve payout tetik butonu YOK; payout islemi yalnizca `FinancePage.tsx` `processPayout` ile ayri yapilabiliyor.
- **Onerimiz:** Mac `COMPLETED` olunca drawer icinde "Saglayici Payout'unu Tetikle" butonu göster; force-confirm icin ayri bir onayli aksiyon ekle, ikisi de audit'lensin.

### Soru 54 — Maca-Ozel Audit Timeline (Kokpit Ici)
**Soru:** `MatchDetailDrawer`'a o maca ait tüm admin aksiyonlarini kronolojik gosteren bir "audit timeline" sekmesi eklemeli miyiz?
- **Neden soruyoruz:** Master 8.6 "maca-ozel log" gereksinimi + "her kritik islem audit'lenir" ilkesi; operator kim ne zaman ne yapti'yi görmeden mudahale güvenli degil.
- **Guncel durum:** `MatchDetailDrawer.tsx` icinde herhangi bir log/timeline görünümü YOK; denetim kayitlari yalnizca ayri `AuditLogPage.tsx`'te global liste olarak var, maca filtreli görünüm sunulmuyor.
- **Onerimiz:** Drawer'a `target_id = match.id` ile filtreli audit log timeline sekmesi ekle; her kayit aktor + aksiyon + zaman + (varsa) eski/yeni deger göstersin.

### Soru 55 — Slot Kilit/Ac UI'si
**Soru:** Kokpite tek tek slot kilitleme/acma (lock/unlock) kontrolü eklemeli miyiz?
- **Neden soruyoruz:** Master 8.6 "slot kilit/ac" gereksinimi; admin bir pozisyonu rezerve etmek/dondurmak icin slotu kilitleyebilmeli, su an yalnizca ata/cikar var.
- **Guncel durum:** `MatchDetailDrawer.tsx` `renderSlots` her slot icin yalnizca `Kick`/`Ata` butonu sunuyor; slot durumu `OPEN`/`TAKEN` ile sinirli, `LOCKED` durumu veya kilit butonu UI'da YOK.
- **Onerimiz:** Slot satirina kilit ikonu ekle; `admin_set_slot_lock` benzeri RPC ile `LOCKED` durumu uygula, kilitli slotlar atama secimlerinde "rezerve" görünsün.

### Soru 56 — Kadroya Bildirim Gonderme (Kokpit Ici)
**Soru:** Kokpite "bu macin kadrosuna bildirim gonder" aksiyonu eklemeli miyiz (mudahale sonrasi oyunculari bilgilendirme)?
- **Neden soruyoruz:** Master 8.6 "kadroya bildirim" gereksinimi; admin skor degistirdiginde/maci iptal ettiginde kadroyu uyarmadan birakmak kullanici güvenini zedeler.
- **Guncel durum:** `MatchDetailDrawer.tsx` icinde bildirim gonderme aksiyonu YOK; toplu bildirim yalnizca `NOTIFICATIONS` (Kampanyalar) sayfasinda, maca özel hedefleme imkani sunulmuyor.
- **Onerimiz:** Drawer alt aksiyon barina "Kadroya Bildir" butonu ekle; hazir sablonlar (iptal/skor güncellendi/saha degisti) + serbest metin, RPC ile macin kayitli oyuncularina gonder.

### Soru 57 — Kokpit Tek-Drawer vs. Sekmeli Derin Görünüm
**Soru:** Kokpit aksiyonlari (kadro/sonuc/odeme/bildirim/audit) tek dikey scroll drawer'a sigmayacak kadar arttigi icin drawer ici sekmeli (tab) bir bilgi mimarisine gecmeli miyiz?
- **Neden soruyoruz:** Master 8.6 kokpitin "cok derin" olmasini istiyor; tek scroll'da 7+ aksiyon grubu yiginca operator yikici islemleri yanlislikla tetikleyebilir, görsel hiyerarsi kaybolur.
- **Guncel durum:** `MatchDetailDrawer.tsx` her seyi tek `overflow-y-auto` kolonda render ediyor (özet + hakem + status + A/B/deplasman slotlari + alt aksiyon bari); aksiyon eklendikce scroll uzayacak, gruplama yok.
- **Onerimiz:** Drawer'i `Kadro | Sonuc & Hakem | Odeme | Bildirim | Audit` sekmelerine böl; her sekmenin kendi yikici-onay sinirlari olsun.

### Soru 58 — Kullanici 360 Görünümü (Tek Ekran)
**Soru:** Kullanici icin cüzdan + fair-play + rol + ban gecmisi + impersonate (ghost giris) tek bir 360 panelinde toplanmali mi, yoksa bu veriler farkli sayfalara dagilmis halde mi kalsin?
- **Neden soruyoruz:** Master god-mode "her problem panelden dogrudan cozulebilir" diyor; bir kullaniciyi yönetmek icin Finans/Kullanicilar/Audit arasinda gezmek mudahale süresini uzatir.
- **Guncel durum:** Kullanici verisi parcali: cüzdan hareketleri `FinancePage.tsx` ledger'da `user_id` bazli, ban sayisi `DashboardPage.tsx` stat'inda, ghost/ban aksiyonlari `AuditLogPage.tsx` `a.includes('GHOST')` ile route ediliyor — birlesik bir kullanici drawer'i izine rastlanmadi.
- **Onerimiz:** `UsersPage`'e tiklaninca acilan "Kullanici 360" drawer'i ekle: profil, cüzdan ozeti/ledger, fair-play/rating, rol/PRO, ban toggle, ghost-giris butonu — hepsi tek ekranda, audit'li.

### Soru 59 — Dispute / Itiraz Cozum UX'i ve Mac Kokpitiyle Baglanti
**Soru:** Itiraz (DISPUTES) ve hizmet itirazi (SERVICE_DISPUTES) cozüm akisini, ilgili macin kokpitinden tek tikla acilan ve cozumü oraya geri yansiyan bir baglantili UX haline getirmeli miyiz?
- **Neden soruyoruz:** Master 8.6 kokpitte "dispute coz" gereksinimi; itiraz cozümü mactan kopuk ayri sayfada yapilinca operator baglami kaybediyor.
- **Guncel durum:** `MatchesPage.tsx` `onViewDisputes` ile `onNavigate('DISPUTES', { disputeMatchId })` cagiriyor ve drawer'da "Ihtilaflar" butonu var — yani disputes sayfasina derin-link MEVCUT; ancak cozümün kokpite geri donüsü (in-context resolve) yok, kullanici sayfa degistiriyor.
- **Onerimiz:** Disputes'i kokpit icinde bir sekme olarak inline coz (kazanan/iade/komisyon karari) ve karar audit + macin durumuna otomatik yansisin; ayri sayfa yalnizca toplu liste icin kalsin.

### Soru 60 — Birlesik Dogrulama Kuyrugu (Tek Ekran + Rozet Sayaci)
**Soru:** `PENDING_VERIFICATIONS`, `PROVIDER_IDENTITIES` ve `MODERATION` (tesis onaylari) kuyruklarini sekmeli tek "Dogrulama Merkezi" ekraninda toplayip sidebar'da tek birlesik rozet sayaci göstermeli miyiz?
- **Neden soruyoruz:** Üc ayri onay kuyrugu sidebar'da üc ayri satir ve üc ayri rozet üretiyor; operator hangisinde is var bilmek icin ücüne de bakmak zorunda — gunluk operasyon yavasliyor.
- **Guncel durum:** `Sidebar.tsx` `Onay Bekl.` (`pendingVerifCount`), `Kimlik Dogr.` (`providerIdentityCount`), `Tesis Onaylari` (`pendingPitches`) olarak üc ayri öğe ve üc ayri badge tutuyor; birlesik bir kuyruk ekrani yok.
- **Onerimiz:** Tek "Dogrulama Merkezi" sayfasi (sekmeler: GK/Hakem, Kimlik, Tesis) yap; sidebar'da toplam bekleyen sayisini tek rozette göster, alt kirilim sekme basliklarinda kalsin.

## 📦 Grup 7 — UI/UX: Dashboard/KPI, Bos-Yukleme-Hata & Erisilebilirlik (Soru 61–70)

### Soru 61 — Kuzey-Yildizi KPI "Basarili Oynatilan Mac" Eksik
**Soru:** Dashboard'un en üst KPI seridine master kuzey-yildizi metrigi olan "Basarili Oynatilan Mac" sayisini birinci kart olarak eklemeli ve digerlerinin önüne almali miyiz?
- **Neden soruyoruz:** Master kuzey-yildizi metrigi acikca "Basarili oynatilan mac"; dashboard bunu vurgulamiyorsa ekip yanlis metrige (gelir/kullanici) odaklanir.
- **Guncel durum:** `DashboardPage.tsx` üst dört kart: `TOPLAM KULLANICI`, `ONAY BEKLEYEN`, `SISTEM GELIRI`, `CANLI MACLAR` (`stats.total_matches`) — "basarili oynatilan/tamamlanan mac" KPI'si bu seritte YOK; `total_matches` ham toplam, basari degil.
- **Onerimiz:** En üste birincil "BASARILI MAC (tamamlanan)" kartini ekle (renk: kuzey-yildizi vurgu yesili), büyük puntoyla; mevcut kartlari ikincil seride birak.

### Soru 62 — Heuristik Durum Etiketleri vs. Gercek Metrik
**Soru:** Dashboard ve maclardaki "TAM KADRO / EKSIK KADRO" durumunu istemci tarafinda `missingPositions` heuristigiyle hesaplamak yerine DB'nin yetkili mac durumundan (gercek metrik) türetmeli miyiz?
- **Neden soruyoruz:** Master 9.1 SSOT; istemci-tarafi heuristik gercek mac yasam-döngüsüyle (tamamlandi/iptal/iade) celisebilir ve KPI güvenilirligini bozar.
- **Guncel durum:** `DashboardPage.tsx` "Son Maclar" tablosunda durum `m.missingPositions?.some(p => p.count > 0) ? 'EKSIK KADRO' : 'TAM KADRO'` ile FE'de türetiliyor; `MatchesPage.tsx` `statusChips` sayimlari da yine FE'deki `matches` dizisinden Map ile hesaplaniyor — sayfa basina yalnizca yüklü kayitlari sayiyor, toplam degil.
- **Onerimiz:** Durum ve sayaclari `admin_*` aggregate RPC'lerinden (gercek mac durumu) al; FE heuristigini yalnizca anlik gösterim için fallback olarak birak, KPI olarak kullanma.

### Soru 63 — Bos/Yukleme/Hata Durum Tutarliligi (Üc-Durum Standardi)
**Soru:** Tüm liste/sayfalarda bos, yükleniyor ve hata durumlari icin tek standart bir üc-durum deseni (ortak bilesen) zorunlu kilmali miyiz?
- **Neden soruyoruz:** Su an her sayfa bos/hata durumunu farkli sekilde isliyor; tutarsizlik hem cila hem güvenilirlik algisini bozuyor (operator hatayi bos veriyle karistirabilir).
- **Guncel durum:** `DataTable.tsx` bos için `EmptyState`, yükleme için `TableSkeleton` kullaniyor; ama hata durumu için ayri bir görünüm YOK — hatalar yalnizca `toastError` ile geciyor, `DashboardPage.tsx` trend bölümü ise kendi özel "RPC deploy edilmedi" panelini elle ciziyor (`AlertTriangle` + `code`).
- **Onerimiz:** `DataState` sarmalayici bileseni ekle (`loading | empty | error | ready`); hata durumunda tekrar-dene butonu + teknik detay (RPC adi) tek standart bilesende toplansin.

### Soru 64 — Pagination / Sonsuz Liste Tutarsizligi (Eski 500 Limit)
**Soru:** Sayfalama yaklasimini tüm modüllerde tek desende (sunucu-tarafi offset pagination) standartlastirmali ve "tümünü cek + FE filtrele" pratigini kaldirmali miyiz?
- **Neden soruyoruz:** Master 100k+ ölcek; bazi sayfalar 100 kayit cekip FE'de filtreliyor (ölcekte kirilir), bazilari sunucu pagination kullaniyor — tutarsiz ve büyük veride yavas.
- **Guncel durum:** `MatchesPage.tsx` `PAGE_SIZE=50` ile sunucu-tarafi offset pagination + arama parametresi (dogru desen); buna karsin `FinancePage.tsx` `PAGE_SIZE=100` cekip `filterRows` ile `JSON.stringify(row).includes(q)` seklinde FE'de filtreliyor, `AuditLogPage.tsx` ise sabit `fetchAdminAuditLogs(250)` cekip FE'de aRiyor — pagination yok.
- **Onerimiz:** Tüm büyük listeleri `MatchesPage` desenine getir (sunucu arama + offset/keyset pagination); FinancePage/AuditLogPage'in FE filtrelemesini sunucu sorgusuna tasi.

### Soru 65 — Tablo Yogunlugu, Sütun Secimi & CSV Tutarliligi
**Soru:** `DataTable`'a sütun göster/gizle secimi, yogunluk (kompakt/rahat) ayari ve modül-bagimsiz CSV export desteğini ortak bir özellik olarak eklemeli miyiz?
- **Neden soruyoruz:** CSV export su an yalnizca Finans'a özel ve elle yazilmis; her tabloya ayri ayri eklemek tutarsizlik üretir, operator yogun tablolarda sütun yönetemiyor.
- **Guncel durum:** `FinancePage.tsx` CSV export'u sayfaya özel `exportLedger/exportPayments/exportBilling` + `downloadCsv` ile elle yapiyor; `DataTable.tsx` ise CSV/sütun-secimi/yogunluk özelligi icermiyor (sadece kolon render + opsiyonel pagination).
- **Onerimiz:** `DataTable`'a `exportable`, `columnToggle`, `density` proplari ekle; CSV'yi kolon tanimlarindan otomatik türet, böylece her modül bedava export/sütun yönetimi kazanir.

### Soru 66 — Toplu Islem (Bulk Actions) Altyapisi
**Soru:** Listelere satir secimi (checkbox) + toplu islem barini (orn. toplu onay/ret, toplu ban, toplu bildirim) ortak bir desen olarak eklemeli miyiz?
- **Neden soruyoruz:** Dogrulama kuyruklari ve kullanici yönetimi tek tek islemde yavas; god-mode operasyon verimliligi toplu aksiyon gerektirir.
- **Guncel durum:** `DataTable.tsx` satir secimi/checkbox kolonu veya secili-satir state'i icermiyor; `PendingVerificationsPage`/`FinancePage`/`UsersPage` aksiyonlari yalnizca satir-bazli (orn. `handlePayout(r.id, ...)`) calisiyor.
- **Onerimiz:** `DataTable`'a `selectable` + `onSelectionChange` ekle; secim varken üstte "X secili" toplu-aksiyon bari göster, yikici toplu islemler `ActionConfirmModal`'dan gecsin.

### Soru 67 — Yikici Islemlerde "Yaz-Onayla" Deseninin Standartlasmasi
**Soru:** Tüm yikici islemleri (mac sil, payout reddet, kullanici banla, force-refund) tutarli bir sekilde `ActionConfirmModal` "yaz-onayla" (hedef adini yaz) deseninden gecirmeli, `window.confirm`/`window.prompt` kullanimini kaldirmali miyiz?
- **Neden soruyoruz:** Master "her kritik islem audit'lenir" + god-mode güvenligi; native `confirm/prompt` hem stilsiz hem yanlislikla onaylanmaya acik, denetim baglami tasimiyor.
- **Guncel durum:** `MatchesPage.tsx` mac silme dogru sekilde `ActionConfirmModal` (`actionType: 'BAN_USER'`, `targetName`) kullaniyor; ama `FinancePage.tsx` payout reddini `window.confirm(...)` ve referansi `window.prompt(...)` ile aliyor — tutarsiz ve riskli.
- **Onerimiz:** `FinancePage` ve diger native `confirm/prompt` kullanimlarini `ActionConfirmModal`'a tasi; tutar yüksek payout/refund'larda hedef adini/tutari yazdirarak onay zorla.

### Soru 68 — Realtime Canli Rozetler & Toast Geri-Bildirim Standardi
**Soru:** Sidebar bekleyen sayaclari ve dashboard kuyruklarini Supabase realtime ile canli güncellemeli ve toast geri-bildirimini tek standart (sure/aksiyon/geri-al) desenle mi sunmaliyiz?
- **Neden soruyoruz:** Master 8.6 "CANLI" Komuta Merkezi vaadi; sayaclar yalnizca yenilemede güncellenirse operator yeni bekleyen isi gec görür, "CANLI" rozeti yaniltici olur.
- **Guncel durum:** `Sidebar.tsx` `Komuta Merkezi` öğesi sabit `badge: 'CANLI'` gösteriyor ama rozet sayaclari (`pendingVerifCount`, `openDisputes`) store'dan, yalnizca manuel `onRefresh`/sayfa yüküyle güncelleniyor; realtime abonelik izi yok. Toast `useAdminToast` ile var ama geri-al (undo) eklentisi yok.
- **Onerimiz:** Kritik kuyruklara (`pending_verifications`, `payout_requests`, `disputes`) realtime subscription bagla; rozetler canli aksin. Toast'a opsiyonel "Geri Al" aksiyonu ve tutarli süre ekle.

### Soru 69 — Erisilebilirlik (Kontrast / Klavye / Odak / Ekran-Okuyucu)
**Soru:** Admin panelinde WCAG temelli erisilebilirligi (yeterli kontrast, klavye ile tam gezinme, görünür odak halkasi, ARIA etiketleri) bir kabul kriteri haline getirmeli miyiz?
- **Neden soruyoruz:** Cok küçük punto + düsük kontrast metinler ve eksik ARIA, hem erisilebilirligi hem genel okunabilirligi bozar; god-mode kritik aksiyonlarinda yanlis okuma riskini artirir.
- **Guncel durum:** `Sidebar.tsx` grup basliklari `text-[8.5px] text-gray-600`, rozetler `text-[8px]`, badge `text-gray-400` gibi cok düsük kontrast/punto degerleri iceriyor; `PageLoadingSkeleton.tsx` `aria-busy` kullaniyor (iyi) ama `MatchDetailDrawer.tsx` drawer'inda `role="dialog"`/`aria-modal`/odak-tuzaklama yok, `<select onChange>` ile yapilan atamalarda klavye-disi etiket eksik.
- **Onerimiz:** Minimum punto/kontrast esikleri belirle (orn. ≥11px gövde, AA kontrast); drawer/modallere `role`/`aria-modal`/focus-trap/`Esc` ekle, interaktif öğelere `aria-label` ver; CI'a a11y lint (jsx-a11y) ekle.

### Soru 70 — Ayarlar Sayfasi Kapsami & Audit Log Diff Görünümü
**Soru:** (a) Tüm admin-ayarli parametreleri (komisyon, esik, sure, min-oyuncu, payout esigi vb.) tek `SettingsPage`'te toplamali ve (b) `AuditLogPage`'e eski/yeni deger diff görünümü eklemeli miyiz?
- **Neden soruyoruz:** Master 9.1 SSOT; ayarlar dagilirsa "tek yerden yönet" bozulur. Ayrica "her kritik islem audit'lenir" ilkesi degisikligin NE'den NE'ye oldugunu görmeyi gerektirir — sadece aksiyon adi yetmez.
- **Guncel durum:** `SettingsPage.tsx` komisyon/payout modu/PRO fiyati/min-rating/günlük mac limiti/kayit/bakim/duyuru'yu iceriyor (iyi kapsam) ama her input `onBlur`'da sessizce kaydediyor — toplu kaydet/onay yok; komisyon detayi ise ayri `COMMISSION` sayfasinda, yani tek-yer kismen bozuk. `AuditLogPage.tsx` kolonlari `Aksiyon/Hedef/Detay/Admin` — eski→yeni diff kolonu YOK (`row.details` serbest metin).
- **Onerimiz:** (a) `SettingsPage`'i kategorili sekmelere böl ve `COMMISSION` esiklerini buraya entegre et, kritik ayar degisiminde onay iste; (b) audit kayitlarina `old_value/new_value` alani ekleyip log satirinda yan-yana diff göster, ayrica aktor/tarih/aksiyon filtrelerini güclendir.

## 📦 Grup 8 — Genel Sistemler: Ödeme/Finans Kontrolü & Payout (Soru 71–80)

### Soru 71 — `PAYMENT_PROVIDER` prod=IYZICO geçişi
**Soru:** Canlıya çıkışta `PAYMENT_PROVIDER` secret'ını `SIMULATION`'dan `IYZICO`'ya çevirmek için sözleşme/KYC tamamlanma kapısını ve kademeli rollout planını (önce %0, sonra kanarya) nasıl tanımlayacağız?
- **Neden soruyoruz:** Master 9.1 "edge function güvenliği + secret yönetimi" gereği; varsayılan `SIMULATION` ile gerçek tahsilat asla olmaz, yanlış bir anda `IYZICO`'ya geçiş ise sözleşme imzalanmadan gerçek para hareketi riski yaratır.
- **Güncel durum:** DOĞRULANMIŞ — `capture-payment`, `void-payment`, `refund-payment` fonksiyonlarının tümü `Deno.env.get('PAYMENT_PROVIDER') ?? 'SIMULATION'` okuyor; iyzico kodu GERÇEK ama bu secret prod'da set edilmemiş/`SIMULATION`. iyzico sandbox→canlı sözleşme/KYC go-live notu olarak açık.
- **Önerimiz:** Go-live checklist'ine "iyzico canlı sözleşme + KYC onayı → `supabase secrets set PAYMENT_PROVIDER=IYZICO` + `IYZICO_BASE_URL=https://api.iyzipay.com`" adımını tek-yönlü kapı olarak ekleyin; geçişten sonra ilk N işlemi düşük tutarlı kanarya rezervasyonlarıyla doğrulayın, panelde aktif provider rozetini gösterin.

### Soru 72 — Refund `paymentTransactionId` parametre netliği
**Soru:** `refund-payment` içinde iyzico iadesinin `provider_ref`'i `paymentTransactionId` olarak kullanması (pre-auth/capture akışında kalem-bazlı txn id) sözleşme entegrasyonunda netleşmeden go-live'a izin verecek miyiz, yoksa bu blokeleyici mi?
- **Neden soruyoruz:** Yanlış `paymentTransactionId` ile iade çağrısı iyzico'da başarısız olur; bu açık kalırsa müşteri iadeleri panelde "tamamlandı" görünüp gerçekte gerçekleşmeyebilir — finansal tutarsızlık ve şikayet riski.
- **Güncel durum:** DOĞRULANMIŞ — `refund-payment/index.ts` satır 36-38: go-live notu "iyzico iade `paymentTransactionId` (kalem bazlı) ister; pre-auth akışında `provider_ref`'in tutması gereken değer sözleşme entegrasyonunda netleşir" diyor; `iyzicoRefund(...)` çağrısı `intent.provider_ref`'i geçiyor (satır 81).
- **Önerimiz:** iyzico canlı dökümante test ortamında bir capture→refund turunu uçtan uca koşturarak `provider_ref` alanının `capture-payment` dönüşünde gerçekten `paymentTransactionId` olduğunu doğrulayın; gerekiyorsa `payment_intents`'a ayrı `payment_transaction_id` kolonu ekleyip refund bunu okusun. Bu netleşmeden `IYZICO` provider'a geçişi BLOKE edin.

### Soru 73 — Admin'den force capture/void/refund tetikleme + audit
**Soru:** "Her problem panelden doğrudan çözülebilir" ilkesi gereği SUPER_ADMIN/FINANS'ın bir `payment_intent` üzerinde force capture / void / refund'u panelden tek tıkla (sebep + audit zorunlu) tetikleyebileceği bir müdahale ekranı ekleyecek miyiz?
- **Neden soruyoruz:** Master 8.6 god-mode ilkesi her kritik finans operasyonunun panelden çözülebilmesini ister; bugün edge fonksiyonları var ama panelde tetikleyici yok, problemli ödemeyi çözmek için manuel curl/DB müdahalesi gerekiyor (audit'siz).
- **Güncel durum:** DOĞRULANMIŞ — `capture-payment`/`void-payment`/`refund-payment` GERÇEK ve `PAYMENT_EDGE_SECRET` header ile korunuyor (sistem/cron çağrısı). `FinancePage.tsx`'te ödeme görünür ama capture/void/refund tetikleyen buton YOK; sadece payout COMPLETED/FAILED butonları var.
- **Önerimiz:** FinancePage'e bir "Ödeme Müdahale" alt ekranı ekleyin: intent seçimi → force refund/void/capture; admin servisinden `PAYMENT_EDGE_SECRET` ile edge'i çağırın, her tetiklemede zorunlu `reason` + `admin_id` ile `audit_log`'a yazın.

### Soru 74 — Manuel payout işaretleme yerine gerçek iyzico payout API
**Soru:** `processPayout` ile payout'u manuel `COMPLETED`/`FAILED` işaretleme yerine gerçek iyzico "submerchant payout / para transferi" API'sine bağlayıp banka transferini otomatikleştirecek miyiz?
- **Neden soruyoruz:** Master 9.1 ölçek/SSOT gereği; manuel işaretleme operatörün gerçekten banka transferi yaptığına güvenir, panel ile banka arasında mutabakat kopukluğu ve insan hatası riski yaratır.
- **Güncel durum:** DOĞRULANMIŞ — `FinancePage.tsx` `handlePayout` sadece `processPayout(id, 'COMPLETED'|'FAILED', ref)` çağırıyor; `ref` operatörden `window.prompt` ile alınan opsiyonel metin. Gerçek bir iyzico payout/transfer çağrısı YOK; `iyzico_payout_ref` elle giriliyor.
- **Önerimiz:** Bir `iyzico-payout` edge fonksiyonu yazıp (submerchant/IBAN transfer), `processPayout`'u önce API çağrısı yapacak, dönen gerçek transfer referansını `iyzico_payout_ref`'e yazacak şekilde değiştirin; manuel işaretleme yalnız "API başarısız → elle düzelt" fallback'i olarak kalsın ve audit'lensin.

### Soru 75 — Owner 2-haftalık otomatik payout cron'u
**Soru:** Owner `OWNER_BIWEEKLY` payout'ları için 2 haftalık periyodik otomatik payout talebi üreten zamanlanmış bir iş (Supabase cron / `pg_cron`) kuracak mıyız, yoksa owner manuel mi talep edecek?
- **Neden soruyoruz:** Otomatik biweekly payout ödeme modelinin sözü; cron yoksa owner'lar elle talep açmak zorunda kalır, gecikmeler ve "param nerede" şikayetleri doğar; Master 9.1 zamanlanmış iş envanteri ister.
- **Güncel durum:** DOĞRULANMIŞ — `FinancePage.tsx`'te `payout_type === 'OWNER_BIWEEKLY'` "Saha Sahibi" olarak listeleniyor ve manuel işleniyor; payout talebini periyodik üreten bir cron/scheduled job envanterde görünmüyor.
- **Önerimiz:** `pg_cron` ile 2 haftada bir çalışan bir job kurun: hak edişi biriken her owner için net bakiyeyi hesaplayıp `PENDING` `payout_requests` satırı oluştursun; panelde "otomatik üretilen payout'lar" rozetiyle ayrıştırın ve job'ın son çalışma zamanını CommandCenter sağlık panosunda gösterin.

### Soru 76 — Kaleci/Hakem anında payout otomasyonu
**Soru:** `PROVIDER_INSTANT` (kaleci/hakem) payout'larını maç tamamlanır tamamlanmaz otomatik tetikleyecek bir olay-tabanlı akış mı kuracağız, yoksa bunlar da operatör onayından mı geçecek?
- **Neden soruyoruz:** "Anında payout" sözü gerçek-zamanlı tetik ister; her birini elle onaylamak ölçekte (100k+) operasyonel darboğaz yaratır ve "anında" vaadini bozar.
- **Güncel durum:** DOĞRULANMIŞ — `FinancePage.tsx` `PROVIDER_INSTANT`'ı "Kaleci/Hakem" olarak gösterip diğer payout'larla aynı manuel `Tamamla`/`Reddet` akışına sokuyor; maç-tamamlandı olayına bağlı otomatik bir tetik YOK.
- **Önerimiz:** Maç `COMPLETED` durumuna geçince (trigger/edge) kaleci/hakem için anında payout'u Soru 74'teki `iyzico-payout` üzerinden otomatik koşturun; yalnızca tutar eşiği üstü veya risk-işaretli olanları manuel onaya düşürün, geri kalanını fully-automated bırakın.

### Soru 77 — Komisyon ayarının canlı akışa bağlanması + ölü `commissionRate` temizliği
**Soru:** `store.ts`'teki `commissionRate=10` hardcode/ölü kodu kaldırıp `CommissionPage`'i tek kanonik kaynak olan `calculate_commission` RPC'sine bağlayacağımızı, ayarın UI'dan gerçekten canlı akışa etki etmesini garanti edecek miyiz?
- **Neden soruyoruz:** Master 9.1 SSOT ister; iki kaynak (ölü store sabiti + RPC) komisyon değerinde tutarsızlık ve "ayarı değiştirdim ama hesap değişmedi" hatası riski doğurur.
- **Güncel durum:** DOĞRULANMIŞ — `store.ts` satır 60/106: `commissionRate: 10` HARDCODE varsayılan, ölü kod; gerçek komisyon kaynağı `calculate_commission` RPC. UI'daki komisyon ayarı app davranışına bağlı değil.
- **Önerimiz:** `store.ts`'teki `commissionRate` alanını ve `appSettings` türevlerini silin; `CommissionPage`'i `calculate_commission`'ın okuduğu ayar tablosunu (oran/eşik) yazıp okuyacak şekilde bağlayın, değişiklik audit'lensin ve değişimden sonra bir örnek hesapla "etkili oran" doğrulaması gösterilsin.

### Soru 78 — Kademeli iade motorunun admin'den izlenmesi
**Soru:** `process_tiered_refund` ile uygulanan kademeli iade politikasının (maça kalan saate göre iade oranı) hangi kademenin uygulandığını ve sonuç tutarını panelde görünür kılacak bir izleme/günlük ekranı ekleyecek miyiz?
- **Neden soruyoruz:** Operatörün bir iadenin neden %X olduğunu açıklayabilmesi ve dispute çözmesi için kademe görünürlüğü şart; bugün karar mantığı edge+RPC içinde gömülü, panelde iz yok.
- **Güncel durum:** DOĞRULANMIŞ — `refund-payment/index.ts` `hoursToMatch` hesaplayıp `process_tiered_refund(p_intent_id, p_hours_to_match)` çağırıyor; dönen `data` istemciye veriliyor ama panelde bu kademe/sonuç için kalıcı izleme ekranı yok.
- **Önerimiz:** Her iadede uygulanan kademe, `hours_to_match`, iade oranı ve net tutarı `refund_log` benzeri tabloya yazın; FinancePage'e "İadeler" sekmesi ekleyip intent başına kademe + gerekçeyi gösterin (dispute çözümünde delil).

### Soru 79 — Finansal mutabakat/recon raporu
**Soru:** iyzico tarafındaki gerçek tahsilat/iade/payout kayıtları ile OYNA `payment_intents`/`payout_requests`/wallet ledger'ı eşleştiren günlük bir mutabakat (reconciliation) raporu üretecek miyiz?
- **Neden soruyoruz:** Master 9.1 ölçek/finansal bütünlük gereği; provider ile sistem arasındaki sapmaları (eksik iade, çift tahsilat) erken yakalamadan canlı para hareketi yönetilemez.
- **Güncel durum:** DOĞRULANMIŞ — `FinancePage.tsx` ledger/payments/billing/payouts sekmelerini gösteriyor ama hepsi yalnız OYNA-içi veriden besleniyor; iyzico mutabakatı/recon raporu YOK.
- **Önerimiz:** Günlük cron ile iyzico raporlama API'sinden çekilen kayıtları yerel tabloyla eşleştiren bir `reconciliation_report` üretin; FinancePage'e "Mutabakat" sekmesi ekleyip eşleşmeyen satırları (delta) kırmızı işaretleyin ve operatöre çözüm aksiyonu sunun.

### Soru 80 — Finans işlemlerinde zorunlu audit kapsamı
**Soru:** Tüm finans müdahalelerinin (capture/void/refund/payout/komisyon değişimi) istisnasız `audit_log`'a `admin_id`+sebep+öncesi/sonrası ile yazıldığını garanti eden bir kontrol (DB trigger veya servis katmanı) koyacak mıyız?
- **Neden soruyoruz:** Master 8.6 "HER kritik işlem audit-lenir" der; eksik audit, finansal anlaşmazlıkta sorumluluk boşluğu ve düzenleyici risk yaratır.
- **Güncel durum:** DOĞRULANMIŞ — payout işlemi `processPayout` üzerinden geçiyor ama capture/void/refund panelden tetiklenmiyor (Soru 73), komisyon değişimi store'da ölü. Finans aksiyonları için uçtan uca zorunlu audit garantisi envanterde net değil.
- **Önerimiz:** Finansı etkileyen RPC/edge'lerin tümünde audit yazımını zorunlu hale getirin (eksikse işlem reddedilsin); FinancePage'e işlem-başına audit geçmişi drawer'ı ekleyin ve "audit'siz finans aksiyonu" durumunu CI/lint kapısıyla yakalayın.

## 📦 Grup 9 — Genel Sistemler: Bildirim/Broadcast, Ayar→App & Demo Veri (Soru 81–90)

### Soru 81 — APNs/FCM/Resend kimliklerinin prod'a deploy'u
**Soru:** Push (APNs ES256 + FCM HTTP v1) ve e-posta (Resend) için gerçek prod kimlik bilgilerini `supabase secrets` üzerinden set edip `send-push`/`send-email` fonksiyonlarını canlıya alacağımız go-live adımını kim ve ne zaman yürütecek?
- **Neden soruyoruz:** Master 9.1 secret yönetimi gereği; kimlikler placeholder kaldıkça hiçbir gerçek bildirim/e-posta gitmez, lansman günü sessiz başarısızlık riski var.
- **Güncel durum:** DOĞRULANMIŞ — `send-push` GERÇEK APNs (ES256 JWT) + FCM (HTTP v1) ama APNs/FCM kimlikleri `.env`'de YORUM/placeholder; `send-email` `RESEND_API_KEY` yoksa SIMULATION'a düşüyor.
- **Önerimiz:** Go-live checklist'ine `supabase secrets set` ile APNS_KEY/APNS_KEY_ID/APNS_TEAM_ID/APNS_TOPIC, FCM service-account JSON ve `RESEND_API_KEY` adımlarını ekleyin; her birini bir test cihazına/adrese gerçek gönderimle doğrulayın ve secret varlığını CommandCenter sağlık panosunda yeşil/kırmızı gösterin.

### Soru 82 — Bildirim trigger/webhook deploy durumu doğrulaması
**Soru:** `notifications` insert → DB webhook → `send-push` zincirinin prod'da gerçekten deploy edilip tetiklendiğini doğrulayan uçtan uca bir kontrol (sentinel bildirim) ekleyecek miyiz?
- **Neden soruyoruz:** Zincir uzun (admin-broadcast → RPC → insert → webhook → send-push); herhangi bir halka deploy edilmezse bildirim sessizce kaybolur, bunu lansmandan önce yakalamak gerekir.
- **Güncel durum:** DOĞRULANMIŞ — Akış: `admin-broadcast` → `admin_broadcast_notification` → `notifications` insert → webhook → `send-push`. Mimari mevcut ama webhook'un prod'da bağlı/tetiklendiğine dair otomatik doğrulama görünmüyor.
- **Önerimiz:** Bir "sentinel test bildirimi" aksiyonu ekleyin: admin'in kendi cihazına test push'u gönderip webhook→send-push zincirinin çalıştığını uçtan uca doğrulasın; `push_log`'tan teslim durumunu okuyup panelde göstersin ve go-live checklist'ine koşum şartı yapın.

### Soru 83 — `notification_templates` admin editörü
**Soru:** `notification_templates` tablosunu admin'in panelden düzenleyebileceği (değişken/placeholder doğrulamalı, önizlemeli) bir şablon editörü ekleyecek miyiz?
- **Neden soruyoruz:** Master 8.6 "her problem panelden çözülebilir" ister; şablon metnini değiştirmek için DB'ye elle SQL atmak god-mode ilkesini bozar ve değişken hatası riskini artırır.
- **Güncel durum:** DOĞRULANMIŞ — `notification_templates` tablosu VAR; ancak admin panelinde bu şablonları okuyup düzenleyen bir editör ekranı görünmüyor.
- **Önerimiz:** CampaignsPage altına "Şablonlar" sekmesi ekleyin: şablon listesi, değişken `{{...}}` doğrulaması, canlı önizleme ve kayıtta audit; eksik/bozuk değişken içeren şablon kaydedilemesin.

### Soru 84 — Broadcast: kalıcı geçmiş + zamanlama + audit
**Soru:** Admin broadcast'leri için kalıcı bir kampanya geçmişi tablosu, ileri-tarih zamanlama ve gönderim audit'i ekleyecek miyiz?
- **Neden soruyoruz:** Bugün gönderilen kampanyanın kaydı kalmıyor; "ne gönderdik, kime, kim gönderdi" sorusu yanıtsız kalır — Master 8.6 audit ve operasyonel izlenebilirlik gereği kritik.
- **Güncel durum:** DOĞRULANMIŞ — `CampaignsPage.tsx` `broadcastNotification(title, body, segment)` çağırıp anında gönderiyor; kalıcı kampanya geçmişi tablosu YOK, zamanlama YOK.
- **Önerimiz:** `broadcast_campaigns` tablosu oluşturun (başlık/gövde/segment/gönderen/zaman/teslim sayısı/durum); `scheduled_at` ile ileri-tarih gönderimi cron'a bağlayın; CampaignsPage'e "Geçmiş" sekmesi + her gönderimde audit ekleyin.

### Soru 85 — Broadcast rate-limit + önizleme + segment doğruluğu
**Soru:** Broadcast göndermeden önce gönderim sıklığı rate-limit'i, zorunlu son-onay önizlemesi ve segment hedef sayısının gerçek alıcı sayısıyla bire bir eşleştiğinin doğrulanmasını ekleyecek miyiz?
- **Neden soruyoruz:** Yanlış segment veya kazara çift gönderim 100k+ kullanıcıya spam yollar (geri dönülmez itibar/maliyet hasarı); rate-limit ve önizleme bu kazaları engeller.
- **Güncel durum:** DOĞRULANMIŞ — `CampaignsPage.tsx` `fetchSegmentPreview(seg)` ile alıcı sayısını ÖN İZLİYOR (iyi), ama gönderim öncesi rate-limit/çift-gönderim koruması ve "bu N kişiye gönderilecek, onaylıyor musun" son-onay adımı görünmüyor.
- **Önerimiz:** Gönder butonuna "N kişiye gönderilecek — onayla" modalı koyun; aynı segmente kısa pencere içinde tekrar gönderimi backend'de rate-limit'leyin; segment sayısının `send-push`'ın gerçek hedef sorgusuyla aynı koşulu kullandığını test ile garanti edin.

### Soru 86 — Sessiz saatler + zorunlu kategori + tercih saygısı
**Soru:** Broadcast/push gönderiminin kullanıcı `notification_preferences`'ına ve sessiz saatlere saygı göstermesini, yalnız "zorunlu" kategorideki bildirimlerin bu kuralları aşmasını garanti edecek miyiz?
- **Neden soruyoruz:** Tercih/sessiz-saat ihlali kullanıcı güvenini ve app-store politikalarını zedeler; pazarlama push'unun gece 3'te gitmesi churn yaratır.
- **Güncel durum:** DOĞRULANMIŞ — `notification_preferences` tablosu VAR; ancak `admin-broadcast`/`send-push` zincirinin bu tercihleri ve sessiz saatleri uyguladığı net değil, kategori bazlı "zorunlu vs opsiyonel" ayrımı görünmüyor.
- **Önerimiz:** Bildirimlere `category` + `is_mandatory` ekleyin; `send-push` opsiyonel kategorilerde `notification_preferences` ve sessiz-saat penceresini filtrelesin (ya da kuyruğa atıp pencere sonrası göndersin), yalnız zorunlu (güvenlik/ödeme) bildirimler bypass etsin.

### Soru 87 — `app_config` Değişikliğinin Deploy'suz CANLI Etki Etmesi (Runtime SSOT Akışı)
**Soru:** `app_config` tablosu (Soru 4'te tanımlanan şema) kurulduğunda, paneldeki bir parametre değişikliğinin (örn. T-8sa, min-oyuncu) edge fonksiyonları ve mobil app dahil tüm tüketicilerde redeploy/yeniden-başlatma OLMADAN canlı yansımasını hangi okuma/önbellek-geçersizleştirme akışıyla garanti edeceğiz?
- **Neden soruyoruz:** Master 8.6 "panelden çözülebilir" ilkesi yalnız değer DB'ye yazılırsa değil, o değer çalışan sistemde anında etki ederse gerçek olur. Soru 4 tablonun ŞEMASINI/SSOT'unu kurar; bu soru DEĞİŞİKLİĞİN ÇALIŞMA-ZAMANINDA NASIL AKACAĞINI (stale-cache, edge cold-start, app cache TTL) sorar — farklı bir entegrasyon riski.
- **Güncel durum:** DOĞRULANMIŞ — `SettingsPage`/`appSettings` store'da çoğu tunable app davranışına BAĞLANMAMIŞ; bağlı olanlar (`maintenanceMode`) bile değişiklik sonrası ne kadar sürede yansıdığı (cache TTL/realtime) belgesiz; edge fonksiyonları config'i her çağrıda mı yoksa önbellekten mi okuyacağı tanımsız.
- **Önerimiz:** Edge/RPC tarafında `get_config(key)`'i kısa TTL'li (örn. 30sn) önbellekle ya da `config_version` damgasıyla geçersizleştir; mobil app config'i app-açılışında + push/realtime sinyaliyle yenilesin; panelde her ayarın "en geç N sn içinde etkili olur" notunu göster; kritik ayarlar (bakım modu) için realtime kanalla anında yay. (Tablo şeması/seed Soru 4'te.)

### Soru 88 — Demo Verisinin Finansal Toplamlara/Payout'a Sızmaması (Hesaplama İzolasyonu)
**Soru:** `is_demo=true` kayıtların yalnız listelerde değil, KOMİSYON/CİRO/PAYOUT hesaplamalarında, dashboard KPI'larında ve mutabakatta (Soru 79) sayılmadığını garanti eden hesaplama-katmanı izolasyonunu nasıl zorlayacağız?
- **Neden soruyoruz:** Master 9.1 finansal bütünlük; demo bir maç/rezervasyon listede gizlense (RLS izolasyonu Soru 9'da) bile, komisyon/ciro toplayan `admin_*` aggregate RPC'leri veya payout hesabı `is_demo` satırını sayarsa gelir raporu ve owner payout'u YANLIŞ çıkar — bu RLS görünürlüğünden ayrı, hesaplama-katmanı bir risktir.
- **Güncel durum:** DOĞRULANMIŞ — `is_demo` bayrakları + seed/purge RPC (admin-only) VAR; ancak komisyon/ciro/payout RPC'lerinin ve dashboard aggregate sorgularının `WHERE NOT is_demo` ile demo'yu dışladığı doğrulanmadı (Soru 9 RLS-görünürlüğü, bu soru finansal-toplam izolasyonunu kapsar).
- **Önerimiz:** Tüm finansal/KPI aggregate RPC'lerine zorunlu `AND NOT is_demo` (admin'in "demo dahil" özel görünümü hariç) ekleyin; bir test ile "demo satır eklemek toplam ciroyu/komisyonu/payout'u değiştirmiyor" iddiasını doğrulayın; `is_demo` sızması bulunursa mutabakat (Soru 79) bunu delta olarak yakalasın.

### Soru 89 — Lansman öncesi purge checklist + `is_demo` yanlış-karışma koruması
**Soru:** Lansman öncesi demo purge'ünün otomatik bir go-live kapısına bağlanmasını ve gerçek üretim verisinin yanlışlıkla `is_demo=true` ile damgalanmasını engelleyen bir korumayı ekleyecek miyiz?
- **Neden soruyoruz:** Elle çalıştırılan purge unutulabilir; ayrıca gerçek bir kaydın yanlışlıkla `is_demo` işaretlenmesi onu purge'de sildirir — geri dönülmez veri kaybı riski.
- **Güncel durum:** DOĞRULANMIŞ — purge RPC (admin-only) VAR ama lansman öncesi ELLE çalıştırılmalı; `is_demo`'nun yalnız seed yoluyla set edildiğine/gerçek akışlarda asla `true` olmadığına dair bir koruma görünmüyor.
- **Önerimiz:** `is_demo` default `false` olsun ve yalnız seed RPC'si `true` yazabilsin (normal insert path'lerinde yazımı kısıtlayın); go-live checklist'ine "demo purge çalıştırıldı + 0 demo satır doğrulandı" otomatik kontrolünü ekleyin, purge öncesi sayım raporu gösterilsin.

### Soru 90 — Ayar→App etki haritası ve ölü-kod denetimi
**Soru:** Her `appSettings` tunable'ının app davranışına gerçekten bağlı olup olmadığını gösteren bir "etki haritası" çıkarıp bağlı-olmayan/ölü ayarları temizleyecek miyiz?
- **Neden soruyoruz:** Operatör panelde bir ayarı değiştirip etkisiz kalırsa panele güveni biter; Master 8.6 "panelden çözülebilir" ilkesi ancak ayarlar gerçekten etki ederse anlamlı.
- **Güncel durum:** DOĞRULANMIŞ — `store.ts`'te `commissionRate` ölü kod; `maintenanceMode`/`announcementBanner` uygulanıyor; "çoğu tunable app davranışına BAĞLANMAMIŞ". Hangisinin bağlı olduğu belgesiz.
- **Önerimiz:** SettingsPage'teki her ayara "bağlı / bağlı değil / kısmen" durumu ekleyip bağlı-olmayanları ya bağlayın ya kaldırın; tek seferlik bir denetimle (Soru 77 `commissionRate` dahil) ölü ayarları temizleyin ve bağlamayı E2E test ile doğrulayın.

## 📦 Grup 10 — Genel Sistemler: Realtime, Doğrulama Kuyruğu, Test & Go-Live (Soru 91–100)

### Soru 91 — Realtime kapsamının ops-kuyruğu dışına genişletilmesi
**Soru:** CommandCenter'daki realtime+poll modelini maç/finans/kullanıcı sayfalarına da genişletip operatörün her kritik tabloda canlı güncelleme görmesini sağlayacak mıyız?
- **Neden soruyoruz:** Master 8.6 god-view gereği operatörün anlık durumu görmesi beklenir; realtime yalnız tek sayfada olursa diğer ekranlar bayatlar, operatör yenilemeyi unutursa yanlış karar verir.
- **Güncel durum:** DOĞRULANMIŞ — `CommandCenterPage.tsx` Supabase realtime + 30sn poll fallback + 2sn debounce ile İYİ çalışıyor; ancak bu kapsam diğer ana sayfalara (FinancePage manuel "Yenile" butonu kullanıyor) genişlememiş.
- **Önerimiz:** CommandCenter'daki realtime+poll+debounce kalıbını paylaşılan bir hook'a çıkarıp Finance/Matches/Users sayfalarına uygulayın; abonelik maliyetini düşürmek için sayfa-bazlı kanal filtreleri kullanın ve bağlantı kopunca poll fallback'i otomatik devreye girsin.

### Soru 92 — Doğrulama Kuyruğu SLA Takibi, Yaşlandırma ve Oto-Eskalasyon
**Soru:** Doğrulama taleplerine (kaleci/hakem/kimlik/tesis) bir SLA hedefi (örn. 24sa içinde sonuçlandır) tanımlayıp, yaşlanan/SLA aşan talepleri otomatik işaretleyen ve eskalasyon (alarm/öncelik) üreten bir sistem-katmanı kuracak mıyız?
- **Neden soruyoruz:** Master 8.6 operasyonel verimlilik; birleşik görünüm (DB view Soru 7, UI tek-ekran+rozet Soru 60) talepleri TEK YERDE gösterir ama hangi talebin GECİKTİĞİNİ ve ne zaman eskale edileceğini söylemez. SLA/yaşlandırma, kuyruk birleştirmeden ayrı bir operasyonel-olgunluk gereğidir — gecikmiş onaylar saha sahibi/oyuncu kaybına yol açar.
- **Güncel durum:** DOĞRULANMIŞ — Doğrulama PARÇALI (`pending_provider_verifications`, `provider_identities`, `community_creation_requests`); `submitted_at`/`created_at` damgaları olsa da bekleme süresine göre SLA-aşımı işaretleme, yaşlandırma metriği veya eskalasyon mekanizması YOK.
- **Önerimiz:** Birleşik kuyruğa (Soru 7/60) `age = now() - submitted_at` ve `sla_breached` türetilen alanları ekleyin; SLA aşan talepleri kırmızı işaretleyip sidebar rozetinde ayrı sayın; eşik aşımında OPERASYON rolüne alarm (Soru 95 analytics/alert ile) gönderin; ortalama-çözüm-süresi metriğini CommandCenter'da gösterin.

### Soru 93 — E2E test kapsamı (ödeme/maç/rezervasyon/payout)
**Soru:** Sadece ~6 admin smoke testi yerine ödeme, maç oluşturma, rezervasyon ve payout gibi kritik akışları kapsayan operasyonel E2E test paketi yazacak mıyız?
- **Neden soruyoruz:** Master kritik akışlarda E2E + CI gate ister; smoke testler regresyonu yakalamaz, finans/rezervasyon kırılması canlıda para/rezervasyon kaybına yol açar.
- **Güncel durum:** DOĞRULANMIŞ — Yalnız ~6 admin smoke Playwright testi var; ödeme/maç/rezervasyon/payout için operasyonel E2E YOK.
- **Önerimiz:** Playwright ile (gerektiğinde `SIMULATION` provider'da) capture→refund, maç oluştur→doldur→tamamla, rezervasyon→ödeme ve payout onay akışlarını kapsayan E2E senaryoları yazın; veritabanını seed/teardown ile izole edin.

### Soru 94 — CI gate (E2E + lint + migration kontrolü)
**Soru:** E2E ve lint'i ana branch'e merge için zorunlu bir CI kapısı (gate) yapıp, geçmeyen değişikliğin deploy edilememesini garanti edecek miyiz?
- **Neden soruyoruz:** Master CI gate ister; gate yoksa bir kişi kırık kodu canlıya gönderebilir; otomatik kapı, "her problem panelden çözülür" güveninin altyapısıdır.
- **Güncel durum:** DOĞRULANMIŞ — Test envanteri zayıf (~6 smoke); merge'i bloke eden bir CI gate (GitHub Actions required check) görünmüyor.
- **Önerimiz:** GitHub Actions'ta lint + tip-kontrol + admin E2E + migration-dry-run koşan bir workflow kurup main branch'te required status check yapın; başarısız ise merge/deploy bloke olsun.

### Soru 95 — Hata izleme (Sentry) + ürün analytics
**Soru:** Admin paneli ve edge fonksiyonlarına Sentry (veya muadili) hata izleme ile temel ürün analytics ekleyip canlı hataları proaktif yakalayacak mıyız?
- **Neden soruyoruz:** Hata izleme olmadan canlı sorunları ancak kullanıcı şikayetiyle öğreniriz; Master 9.1 ölçek/operasyon gereği proaktif gözlemlenebilirlik şart.
- **Güncel durum:** DOĞRULANMIŞ — Kod tabanında merkezi bir hata izleme/analytics entegrasyonu (Sentry vb.) envanterde görünmüyor; hatalar yalnız `toTurkishAdminError` ile toast'a düşüyor.
- **Önerimiz:** Admin Vite uygulamasına ve edge fonksiyonlarına Sentry ekleyin (DSN secret); admin aksiyonlarına minimal analytics olayları (payout işle, broadcast gönder) yerleştirin; CommandCenter'da son 24sa hata oranını gösterin.

### Soru 96 — RPO/RTO Hedefleri ve God-Mode Toplu-Silme Kurtarma Runbook'u
**Soru:** Yedekleme stratejisine somut RPO (kabul edilebilir veri kaybı, örn. ≤5dk) ve RTO (kabul edilebilir kesinti, örn. ≤1sa) hedefleri tanımlayıp, god-mode panelinden YANLIŞLIKLA yapılan toplu silmeyi PITR ile geri alma adımlarını yazılı bir runbook'a bağlayacak mıyız?
- **Neden soruyoruz:** Master 9.1 yedekleme+PITR; PITR'ın açık olup olmadığı/provası Soru 19'da DB-hijyeni açısından soruluyor. Bu soru OPERASYONEL hedefleri (RPO/RTO) ve god-mode'a özgü en olası felaketi — bir SUPER_ADMIN'in yıkıcı RPC ile yanlış kayıtları silmesini — hangi tam adımlarla geri alacağımızı sorar; bu bir hedef+runbook eksiği, salt "PITR açık mı" sorusundan farklıdır.
- **Güncel durum:** DOĞRULANMIŞ — Yıkıcı admin RPC'leri (toplu silme) mevcut; ancak yazılı RPO/RTO hedefi ve "yanlış silme → belirli zamana PITR restore" adım-adım runbook'u envanterde yok (Soru 19 PITR'ın varlığını/provasını kapsar).
- **Önerimiz:** RPO/RTO'yu yazılı hedefe bağlayın; "yanlışlıkla silme" senaryosu için adım-adım PITR restore runbook'u (etkilenen tabloları branch'e geri-yükle → diff al → yalnız silinen satırları geri yaz) yazın ve tatbik edin; yıkıcı RPC'leri soft-delete + onaya çevirerek (Soru 19/67) PITR'a olan bağımlılığı azaltın; son tatbikat tarihini CommandCenter sağlık panosunda gösterin.

### Soru 97 — "Her problem panelden çözülebilir" boşluk denetimi
**Soru:** Master 8.6 "her kritik problem panelden doğrudan çözülebilir" ilkesini uçtan uca denetleyip panelden çözülemeyen (DB/SQL müdahalesi gerektiren) müdahale noktalarının tam listesini çıkaracak mıyız?
- **Neden soruyoruz:** İlke ancak boşluklar kapatılırsa gerçektir; bugün force capture/void/refund (Soru 73), şablon düzenleme (Soru 83) gibi noktalar panelde yok — bunların envanteri çıkmadan god-mode iddiası doğrulanamaz.
- **Güncel durum:** DOĞRULANMIŞ — Tespit edilen boşluklar: panelden ödeme müdahalesi yok (Soru 73), gerçek payout API yok (Soru 74), şablon editörü yok (Soru 83), birleşik doğrulama yok (Soru 92), hardcode parametreler (Soru 87).
- **Önerimiz:** Tüm kritik varlık türleri (kullanıcı/maç/ödeme/payout/owner/bildirim/doğrulama) için "panelden çözülebilir aksiyon" matrisi çıkarın; eksik her hücreyi go-live öncesi backlog'a alın ve kapanışı checklist'e bağlayın.

### Soru 98 — Feature-flag tablosu + kapsam-dışı modül backend temizliği
**Soru:** Bir `feature_flags` tablosu kurup kapsam-dışı/yarım modüllerin backend'ini (ölü RPC/tablo/edge) temizleyerek yüzeyi daraltacak mıyız?
- **Neden soruyoruz:** Kapsam-dışı kod saldırı yüzeyi ve karışıklık yaratır; feature-flag riskli özellikleri deploy'suz aç/kapa imkânı verir (Master 8.6 esneklik).
- **Güncel durum:** DOĞRULANMIŞ — Kapsam-dışı/ölü kod izleri var (`store.ts` `commissionRate` ölü kod; appSettings'te bağlanmamış tunable'lar); merkezi feature-flag mekanizması görünmüyor.
- **Önerimiz:** `feature_flags` (key/enabled/açıklama) tablosu + admin toggle ekranı kurun; riskli/yarım özellikleri flag arkasına alın; kullanılmayan RPC/tablo/edge'lerin bir envanterini çıkarıp güvenli olanları kaldırın (drop'lardan önce audit).

### Soru 99 — Incident runbook + sağlık/uptime izleme
**Soru:** Ödeme arızası, bildirim zinciri kopması, DB erişilemezliği gibi senaryolar için bir incident runbook ve harici uptime/sağlık izleme (endpoint + edge health) kuracak mıyız?
- **Neden soruyoruz:** Master 9.1 operasyonel olgunluk gereği; runbook ve uptime izleme olmadan olay anında ne yapılacağı belirsiz kalır, çözüm süresi uzar.
- **Güncel durum:** DOĞRULANMIŞ — `CommandCenterPage` realtime gösteriyor ama harici uptime/health-check ve yazılı incident runbook envanterde yok; edge fonksiyon sağlığı izlenmiyor.
- **Önerimiz:** Kritik edge fonksiyonları ve API için harici uptime izleme (health endpoint + alert) kurun; senaryo bazlı (ödeme/bildirim/DB/payout) runbook yazıp her birine "panelden çözüm adımı"nı bağlayın; CommandCenter'a servis sağlık paneli ekleyin.

### Soru 100 — Sürdürülebilir migration/deploy süreci (`admin:deploy`)
**Soru:** Migration ve edge-function deploy'unu tek, tekrarlanabilir ve sıralı bir `admin:deploy` sürecine bağlayıp manuel/atlanan deploy hatalarını ortadan kaldıracak mıyız?
- **Neden soruyoruz:** Master 9.1 "tüm RPC envanteri + deploy + test" ister; bugün bazı özellikler "RPC henüz deploy edilmedi" durumuna düşüyor (panelde uyarı), bu da süreç kırılganlığını gösterir.
- **Güncel durum:** DOĞRULANMIŞ — `FinancePage.tsx` satır 183: owner billing RPC deploy edilmediğinde "npm run admin:deploy" uyarısı gösteriyor; yani deploy elle yapılmıyorsa özellik çalışmıyor — süreç manuel ve kırılgan.
- **Önerimiz:** `admin:deploy`'u migration apply + edge function deploy + secret doğrulama + smoke koşumunu sıralı yapan tek komuta dönüştürün; CI'da otomatik koşturun, deploy sonrası RPC envanterini fiilen var-mı diye doğrulayan bir kontrol ekleyin ve eksikleri panelde değil pipeline'da yakalayın.

---

## 🎯 Öne Çıkan Kesişen Temalar (öncelik sırası önerisi)

100 sorunun büyük kısmı birkaç kök temada kesişiyor. Yanıtlarken bu sırayı öneririz:

1. **Audit'i %100'e tamamla** (Soru 11, 12, 37, 80) — Master §8.6 "her kritik işlem audit'lenir" ilkesi bugün ~18 RPC'de kırık. Tek `log_admin_action` yardımcısı + append-only/tamper-evidence en yüksek öncelik.
2. **Alt-rol yetkisini sunucuda zorla** (Soru 21, 22) — FİNANS/OPERASYON ayrımı yalnız UI'da; tek `require_admin_role()` kapısı ile fail-closed hale getir.
3. **Config SSOT tablosu** (Soru 1, 4, 77, 87, 90) — `settings` şemasını resmileştir; hardcode parametreleri `app_config`'e taşı; değişikliğin deploy'suz canlı etki etmesini garanti et; ölü `commissionRate`'i temizle.
4. **Maç Kontrol Kokpitini master §8.6 derinliğine getir** (Soru 51–57) — force capture/void/refund, skor override, payout tetik, slot kilit, kadroya bildirim, maça-özel audit timeline.
5. **Ödeme/payout'u go-live'a hazırla** (Soru 71–76, 79) — `PAYMENT_PROVIDER=IYZICO` kapısı, refund param netliği, gerçek payout API + otomasyon, mutabakat raporu.
6. **Demo veri prod izolasyonu** (Soru 9, 88, 89) — RLS görünürlüğü + finansal toplam izolasyonu + lansman-öncesi purge kapısı.
7. **Birleşik doğrulama kuyruğu + SLA** (Soru 7, 60, 92) — tek tablo/tek ekran/tek rozet + yaşlandırma/eskalasyon.
8. **Kapsam-dışı modül temizliği** (Soru 8, 43, 47, 98) — Topluluk/Turnuva/Promo'yu feature-flag arkasına al/arşivle.
9. **Bildirim go-live** (Soru 81–86) — APNs/FCM/Resend kimlikleri, sentinel test, şablon editörü, broadcast geçmiş/rate-limit/tercih saygısı.
10. **Gözlemlenebilirlik & dayanıklılık** (Soru 19, 93–96, 99, 100) — E2E + CI gate, Sentry, PITR/RPO/RTO runbook, incident runbook, sürdürülebilir `admin:deploy`.

---

## ➡️ Sonraki Adım

1. Soruları **grup grup yanıtlayın** (her sorunun altına kısa kararınızı yazabilirsiniz; "Önerimiz" satırını onaylamak da bir yanıttır).
2. Yanıtlar netleştikçe kararlar `docs/OYNA_MASTER_PRENSIPLER.md` §8.6 / §9.1'e işlenecek.
3. Karara bağlanan maddeler **Faz 7 (Güvenlik, Bildirim, Altyapı & Store)** backlog'una somut görev olarak düşecek.
4. "Go-live" etiketli sorular (71, 72, 81, 89, 93, 94) **Lansman Checklist**'ine (`OYNA_MASTER_PRENSIPLER.md §11.2`) eklenmeli.

> **İlke:** Bu belge "neyi neden sormalıyız + bugün ne durumda + ne öneriyoruz" üçlüsüyle, admin panelini tahminle değil **kanıtla** son haline getirmek için bir yol haritasıdır.
