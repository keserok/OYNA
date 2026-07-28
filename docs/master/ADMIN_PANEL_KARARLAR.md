# ✅ OYNA — Admin Panel 100 Soru: KARARLAR

> **Ne bu belge?** `docs/eski/ADMIN_PANEL_100_SORU.md`'deki 100 sorunun her biri için **alınan net karar** ve **güncel durumu**. Kurucu kararları ekibe devretti ("sistemimizle cevapla ve kararları al"); kararlar master prensipler + mevcut kod gerçeğine dayanır.
> **Son güncelleme:** 2026-06-27 · **Dal:** `admin-panel-son`

## 🌐 4 Global Karar (her soruya uygulanır)
1. **Canlıya alma:** Güvenli partiler (A: temel, B: kontrol) otomatik canlıya alınır; **para partisi (D) kurucu onayı bekler**; güvenlik partisi (C) dikkatli test + doğrulama ile.
2. **Ödeme & bildirim:** Şimdi **SIMULATION** modunda tam kurulur; gerçek sözleşme/anahtar gelince **tek ayarla** canlıya geçer.
3. **Otonomi:** Tam otonom ilerlenir; yalnız kurucu aksiyonu veya gerçek belirsizlik için durulur.
4. **Kapsam-dışı modüller** (Topluluk/Turnuva/İndirim Kodları): **kod silinmez, menüden gizlenir** (feature-flag).

## 🏷️ Durum etiketleri
- ✅ **Yapıldı** — kod hazır (dalda)
- 🔧 **Başlandı** — kısmen yapıldı
- ⏳ **Planlı** — ilgili Wave'de yapılacak
- 🙋 **Senin aksiyonun** — hesap/sözleşme/anahtar gerektirir (kod tarafını ben hazırlarım)
- ⚪ **Yapılmayacak** — görünür faydası yok, dokunulmaz

## 🌊 Wave eşlemesi (kısa)
1 Kontrol temeli ✅ · 2 Parametre ekranı ✅ · 3 Kuralları bağla · 4 Audit tamamla 🔧 · 5 Komisyon tek kaynak · 6 Kapsam-dışı gizle · 7 Demo izolasyon · 8 RBAC tatbik · 9 Maç kokpiti · 10 Güvenlik · 11 Ödeme (SIM) · 12 Bildirim (SIM) · 13 Dayanıklılık · 14 UI cila

---

## 📦 Grup 1 — Veritabanı: Şema, SSOT & İsimlendirme (Soru 1–10)

### Soru 1 — `settings` tablosuna resmi şema migration'ı
**Karar:** `settings` tablosunu tek bir migration ile açıkça tanımlıyoruz: her sütuna tip + NOT NULL + default, `id='main'` ile tek-satır (singleton) garantisi. Mevcut canlı satır korunur. Böylece tablo artık "hayalet" olmaktan çıkıp PITR/yeniden kurulumda yeniden üretilebilir olur.
**Durum:** ✅ Yapıldı (Wave 1)

### Soru 2 — Sütun adlarını snake_case'e çevirme
**Karar:** Yapmıyoruz. Sadece iç düzen için yeniden adlandırma; riskli ve kullanıcının göreceği bir faydası yok. Dokunmuyoruz.
**Durum:** ⚪ Yapılmayacak

### Soru 3 — Komisyonun tek kaynağı (`commission_config`)
**Karar:** Komisyon oranının tek doğru yeri `commission_config` olacak. `settings` içindeki ayrı komisyon alanını oradaki değeri taşıdıktan sonra kaldırıyoruz; panel global komisyonu hep `commission_config`'ten okur. İki yerde çelişki kalmaz.
**Durum:** ⏳ Planlı · Wave 5

### Soru 4 — Hardcode parametreler için `app_config` tablosu
**Karar:** RPC'lere gömülü operasyonel sayıları (onay penceresi, min-oyuncu %'si, fair-play eşikleri, silme bekleme süresi, oto-onay süresi) tek bir `app_config` tablosuna taşıdık. Artık her ayar panelden değiştirilebilir, yeni deploy gerekmez.
**Durum:** ✅ Yapıldı (Wave 1)

### Soru 5 — Kullanılmayan `permissions` alanı
**Karar:** Yapmıyoruz. Bu alan hiç kullanılmıyor; yetkiyi rol (`admin_role`) üzerinden yürütüyoruz. Boş alan bırakmamak için dokunmuyor, ileride gerçekten gerekirse ekleriz.
**Durum:** ⚪ Yapılmayacak

### Soru 6 — Tek admin-yetki kaynağı
**Karar:** Admin yetkisinin tek otoritesi `admin_team_members` (rol + aktiflik orada) olacak. Diğer admin bayrakları bundan türetilir; tüm admin RPC'leri tek bir yetki fonksiyonundan geçer. Böylece "birinde admin, diğerinde değil" çelişkisi kalkar.
**Durum:** ⏳ Planlı · Wave 8

### Soru 7 — Birleşik doğrulama kuyruğu
**Karar:** Dağınık sağlayıcı doğrulamalarını tek bir liste (view) altında birleştiriyoruz ki admin tek ekrandan onaylasın. Topluluk kapsam-dışı olduğu için bu listeye dahil edilmez.
**Durum:** ⏳ Planlı · Wave 14 (+ DB view)

### Soru 8 — Kapsam-dışı tabloların (Topluluk/Turnuva/Promo) durumu
**Karar:** Bu tabloları ve kodlarını SİLMİYORUZ. Yazma erişimini kapatıp menüden gizliyoruz (feature-flag); veri korunur, ileride geri açmak ucuz kalır.
**Durum:** ⏳ Planlı · Wave 6 (gizle, silme yok)

### Soru 9 — Demo verisinin (`is_demo`) prod izolasyonu
**Karar:** Demo kayıtların gerçek istatistik/komisyon/listelere sızmaması için tek-noktadan `is_demo=false` filtresi kuracağız; finansal RPC'lerin demo satırları atladığını test edeceğiz. Demo üretimini lansmanda tek anahtarla kapatırız.
**Durum:** ⏳ Planlı · Wave 7

### Soru 10 — Performans: eksik FK index'leri
**Karar:** Index'siz yabancı anahtarları ve RLS'te kullanılan sütunları sistematik tarayıp (Supabase advisor dahil) eksikleri tek bir migration'da kapatacağız. 100k+ ölçekte panelin yavaşlamasını önler.
**Durum:** ⏳ Planlı · Wave 13

## 📦 Grup 2 — Veritabanı: Audit, Ayarlar & Migration Hijyeni (Soru 11–20)

### Soru 11 — Eksik RPC'lerde audit kapsamını %100'e çıkarma
**Karar:** Audit yazmayan ~18 admin işlemini, ortak tek bir `log_admin_action(...)` yardımcı fonksiyonuna bağlayacağız; "kim yaptı" her kritik işlemde kayıtlı olacak. Temel hazır, kalan RPC'ler tamamlanacak.
**Durum:** 🔧 Başlandı · Wave 4

### Soru 12 — Audit kaydının değiştirilemezliği
**Karar:** Audit kayıtları değiştirilemez/silinemez (append-only): DB seviyesinde güncelleme/silme engellendi. SUPER_ADMIN bile kendi izini silemez.
**Durum:** ✅ Yapıldı (Wave 4)

### Soru 13 — Audit büyüme/saklama stratejisi
**Karar:** Audit tablosunu aya göre bölüp (partition) 12–24 ay sıcak saklama, ötesini arşive taşıma kuralı kuracağız; lansmanda hacim düşükse hafif index ile başlarız. Tablo zamanla yavaşlamaz.
**Durum:** ⏳ Planlı · Wave 13

### Soru 14 — IP/User-Agent doğruluğu ve KVKK
**Karar:** IP/cihaz bilgisini yalnız edge katmanında güvenilir yakalayıp kayda geçireceğiz; yakalanamıyorsa boş bırakırız, sahte değer yazmayız. IP için daha kısa saklama süresi koyarız.
**Durum:** ⏳ Planlı · Wave 10

### Soru 15 — Eski ayar fonksiyonu kopyalarının temizliği
**Karar:** Yapmıyoruz. Sırf iç temizlik; görünür faydası yok, dokunmuyoruz.
**Durum:** ⚪ Yapılmayacak

### Soru 16 — RPC değişiklik disiplini ve envanter
**Karar:** Her RPC değişikliğinde "önce sil + yeniden oluştur + yetki ver" disiplinini ve tek kanonik RPC envanter belgesini (rol/audit/test durumu ile) zorunlu kılacağız; CI sapmayı yakalar. Canlı hal ile kaynak ayrışmaz.
**Durum:** ⏳ Planlı · Wave 13

### Soru 17 — Boş migration dosyasının temizliği
**Karar:** 0 baytlık migration dosyasını sessizce silmiyoruz; önce uygulanmış mı diye kontrol edip, geçmişle uyumlu şekilde güvenli olarak temizleyeceğiz. Yeniden kurulum kırılmaz.
**Durum:** ⏳ Planlı · Wave 13

### Soru 18 — Çift timestamp çakışması
**Karar:** Aynı timestamp'i taşıyan iki migration'dan henüz uygulanmamış olanı bir sonraki sıraya kaydırıp çalışma sırasını netleştireceğiz; ileride çakışmayı CI lint'i ile engelleriz.
**Durum:** ⏳ Planlı · Wave 13

### Soru 19 — Yedekleme, PITR ve geri-yükleme provası
**Karar:** Supabase planında PITR (zamana göre geri-dönüş) açılacak; bir test ortamında geri-yükleme provası yapılıp adımlar yazılacak. PITR açma senin aksiyonun (Supabase plan ayarı); prova ve runbook bizde.
**Durum:** 🙋 Senin aksiyonun

### Soru 20 — Hesap-silme modeli ve silme kuyruğu
**Karar:** Hesap silmeyi tek kanonik tablo üzerinden yürüteceğiz; bekleme süresi `app_config`'ten okunur (zaten orada), günlük otomatik iş zamanı geleni siler ve her adım audit'lenir. Kalan iş: panele "Silme Kuyruğu" ekranını eklemek.
**Durum:** 🔧 Başlandı

# OYNA Admin Paneli — KARAR Belgesi (Soru 21–40: Güvenlik)

> Kurucu kararı: Aşağıdaki kararlar net ve bağlayıcıdır. Karar genelde belgedeki "Önerimiz" satırıdır.
> Global ilkeler: Güvenli partiler (A/B) otomatik canlıya, para partisi (D) onay bekler, güvenlik partisi (C) dikkatli test ile gider. Ödeme/bildirim SIMULATION'da kurulur. Sistem tam otonom çalışır. Kapsam-dışı modüller gizlenir, silinmez.

## 📦 Grup 3 — Güvenlik: Kimlik Doğrulama, 2FA & RBAC (Soru 21–30)

### Soru 21 — Alt-rol sunucu-tarafı zorlaması
**Karar:** FINANS/OPERASYON ayrımını sunucuda zorlayacağız. `current_admin_role()` üzerine `is_finance_admin()` / `is_moderator()` / `is_support()` yardımcıları yazılacak; finans RPC'lerine FINANS|SUPER_ADMIN, operasyon RPC'lerine MODERATOR|SUPER_ADMIN guard'ı eklenecek. Eksik guard CI'da taranacak. (Yardımcılar Wave4'te yapıldı; RPC'lere tatbik Wave8'de.)
**Durum:** 🔧 Başlandı · Wave 8

### Soru 22 — RPC yetki kararı tek kapıdan (`require_admin_role`)
**Karar:** Yetki kontrolünü her RPC'ye dağıtmak yerine tek bir `require_admin_role(p_allowed text[])` "fail-closed" kapı fonksiyonu kullanacağız (eksik kapı = erişim reddi). Tüm finans/operasyon RPC'leri bu çağrıyla başlayacak; CI bu çağrıyı yapmayan durum-değiştiren RPC'leri fail edecek.
**Durum:** 🔧 Başlandı · Wave 8

### Soru 23 — İlk SUPER_ADMIN bootstrap + son-admin koruması
**Karar:** Tek seferlik, e-posta beyaz-listeli seed migration ile ilk SUPER_ADMIN'i kuracağız. `admin_set_platform_role` ve `admin_revoke_platform_role`'a "son SUPER_ADMIN düşürülemez", "self-revoke yasak" ve "kendini SUPER_ADMIN'e yükseltemez" guard'ları eklenecek.
**Durum:** ⏳ Planlı · Wave 8

### Soru 24 — Admin oturum / idle timeout
**Karar:** Admin panelinde 15 dk hareketsizlikte otomatik çıkış + mutlak oturum yaşı 8 saat (aşılırsa zorla çıkış) uygulanacak. Kritik işlemler öncesi son MFA 30 dk'dan eskiyse yeniden doğrulama (step-up) istenecek.
**Durum:** ⏳ Planlı · Wave 10

### Soru 25 — Rate-limit + login alarmı
**Karar:** Admin login akışı edge function arkasına alınacak; IP+email başına 5 başarısız/15 dk'da kilit uygulanacak. Her başarılı admin login ve her kilitlenme gerçek-zamanlı alarmla (e-posta/webhook) bildirilecek; tüm denemeler audit'lenecek.
**Durum:** ⏳ Planlı · Wave 10

### Soru 26 — Admin paneline IP/ağ kısıtı
**Karar:** Statik admin app'i Cloudflare Access/Zero Trust arkasına koyacağız (e-posta + cihaz politikası); admin-* edge function'larda gelen IP izinli CIDR listesiyle doğrulanacak. Ağ/Access kurulumu senin aksiyonun; kod tarafı (IP doğrulama) bende.
**Durum:** 🙋 Senin aksiyonun

### Soru 27 — 2FA kurtarma kodları + cihaz kaybı
**Karar:** Enroll anında tek-kullanımlık 8-10 recovery kodu üretilecek (hash'li saklanır, kullanılan invalide edilir). Kod da yoksa SUPER_ADMIN tarafından çağrılabilen, audit'li `admin_reset_mfa(p_user_id)` RPC'si olacak (self-reset yasak).
**Durum:** ⏳ Planlı · Wave 10

### Soru 28 — Admin onboarding / offboarding yaşam döngüsü
**Karar:** Tek kanonik `admin_offboard(p_user_id)` RPC tanımlanacak: rol revoke + `is_admin=false` + tüm refresh-token iptali + aktif ghost session sonlandırma, hepsi tek transaction ve tek audit kaydıyla. Onboarding sırası: `admin-create-user` → zorunlu MFA enroll → `admin_set_platform_role`.
**Durum:** ⏳ Planlı · Wave 10

### Soru 29 — `SECURITY DEFINER` search_path denetimi
**Karar:** Tüm SECURITY DEFINER fonksiyonlar `'public', 'pg_temp'` search_path'ine standardize edilecek. `pg_proc.proconfig` taraması ile eksik/pg_temp'siz olanlar raporlanacak; advisor (security) çıktısı CI'da fail-on-warn olacak.
**Durum:** ⏳ Planlı · Wave 10

### Soru 30 — `profiles` public USING(true) → PII daraltma
**Karar:** `profiles` için public SELECT hassas kolonlardan arınmış `public_profiles` view'ine taşınacak; ham tabloda SELECT `auth.uid()=id OR is_platform_admin()` ile sınırlanacak. `pitches/texts/tariffs` gerçekten herkese açıksa USING(true) kalır ama açık yorum + advisor istisnasıyla belgelenir.
**Durum:** ⏳ Planlı · Wave 10

## 📦 Grup 4 — Güvenlik: RLS, Ghost Mode, Edge Function & Sırlar (Soru 31–40)

### Soru 31 — Ghost mode süre sınırı + session TTL
**Karar:** Sunucu-taraflı `admin_ghost_sessions` tablosu kurulacak (admin_id, target_id, started_at, expires_at, reason). Ghost başlatma `admin_start_ghost(p_target, p_reason)` RPC'sine bağlanacak; expires_at = now()+30 dk; süre dolunca erişim reddedilir; banner expires_at'i gösterir.
**Durum:** ⏳ Planlı · Wave 10

### Soru 32 — Ghost mode zorunlu audit + read-only
**Karar:** Ghost başlangıcı sunucuda zorunlu kılınacak (erişim ancak geçerli ghost-session kaydı varsa). Impersonation context'inde varsayılan read-only; para/silme/rezervasyon mutasyonları bloklanır. İstisnai yazma için ayrıca audit'li "ghost_write" onayı istenir.
**Durum:** ⏳ Planlı · Wave 10

### Soru 33 — Edge CORS production kısıtı
**Karar:** Prod secret olarak `ADMIN_ALLOWED_ORIGIN=https://admin.oyna.app` zorunlu set edilecek; tüm admin/ödeme function'larında Origin izinli listeyle doğrulanır, eşleşmezse 403. Webhook'larda CORS gereksiz — Origin yok sayılır, imzaya güvenilir.
**Durum:** ⏳ Planlı · Wave 10

### Soru 34 — Webhook idempotency / replay koruması
**Karar:** Webhook event'inin benzersiz id'si `processed_webhook_events` tablosuna UNIQUE ile yazılacak; çakışmada işlem atlanır (idempotent). Payload'da timestamp varsa +/-5 dk tolerans uygulanır, eski istek reddedilir.
**Durum:** ⏳ Planlı · Wave 10

### Soru 35 — `admin-broadcast` auth modeli
**Karar:** `admin-broadcast`, `admin-create-user` ile aynı modele taşınacak: caller JWT'sinden `is_platform_admin()` (tercihen `is_moderator()`/SUPER_ADMIN) doğrulanır, her broadcast gönderen admin id'siyle audit'lenir. Statik secret kalırsa 90 günde bir rotasyon + sızıntı iptal prosedürü belgelenir.
**Durum:** ⏳ Planlı · Wave 12

### Soru 36 — Service-role kullanım envanteri
**Karar:** Service-role kullanan tüm edge function'lar taranıp `docs/service_role_inventory.md`'ye "neden gerekli + önündeki auth guard" satırıyla yazılacak; her service-role mutasyonu zorunlu audit'lenir; mümkün olan yerde caller-JWT + RLS modeline dönülür.
**Durum:** ⏳ Planlı · Wave 13

### Soru 37 — Audit log hash-zincir (tamper-evidence)
**Karar:** `admin_audit_log`'a `row_hash` + `prev_hash` eklenecek; INSERT trigger'ı `row_hash = sha256(prev_hash || payload)` hesaplar. Periyodik doğrulama job'ı zincir kopukluğunda alarm üretir; aylık export SHA256 checksum + imza ile ayrı cold-storage'a yazılır. (Append-only kısıtının üstüne tamamlayıcı katman.)
**Durum:** ⏳ Planlı · Wave 13

### Soru 38 — KVKK: impersonation ve admin erişim logu
**Karar:** Her ghost başlatma ve hassas-PII görüntülemede zorunlu `reason` alanı istenir; `target_user_id` indeksli saklanır. Kullanıcının "verilerime kim erişti" talebine yanıt veren rapor/RPC hazırlanır; KVKK aydınlatma metnine admin-erişim maddesi eklenir.
**Durum:** ⏳ Planlı · Wave 10

### Soru 39 — PII maskeleme
**Karar:** PII alanları panelde varsayılan maskelenir (örn. `+90 5** *** ** 34`); açık "göster" tıklaması zorunlu audit yazar. 18-altı kayıtlarda PII OPERASYON dışındaki rollere tamamen gizlenir; veri-minimizasyonu RPC seviyesinde (rol bazlı kolon dönüşü) zorlanır.
**Durum:** ⏳ Planlı · Wave 10

### Soru 40 — Sır rotasyon takvimi + sızıntı müdahale
**Karar:** `docs/secret_rotation.md`'de her secret için sahip + rotasyon aralığı (örn. service-role 180g, webhook secret 90g) + iptal adımları belgelenir; repo'da secret scanning açılır; her rotasyon audit'lenir. Rotasyon takvimi/sahiplik senin aksiyonun; runbook + secret-scanning kurulumu bende.
**Durum:** 🙋 Senin aksiyonun

# OYNA Admin Panel — Karar Belgesi (Soru 41–70)

> UI/UX kararları. Genel kararlar: (1) Güvenli partiler A/B otomatik canlıya. (2) Ödeme/bildirim SIMULATION. (3) Tam otonom. (4) Kapsam-dışı modüller (Topluluk/Turnuva/İndirim Kodları) menüden gizlenir, kod silinmez.

## 📦 Grup 5 — UI/UX: Navigasyon, Tasarım Sistemi & Genel Cila (Soru 41–50)

### Soru 41 — Tasarım token'larını tek kaynağa çekme
**Karar:** Tüm renk/aralık/yarıçap değerlerini tek bir `adminTheme.ts` + Tailwind preset'e taşı. `surface/border/accent/danger/success` token'larını tanımla; hex literal kullanımını lint kuralıyla yasakla.
**Durum:** ⏳ Planlı · Wave 14

### Soru 42 — Accent tutarlılığı
**Karar:** Accent'i `PageShell` üzerinden CSS değişkenine (`--accent`) bağla; sayfa içi vurgu renkleri bu değişkenden türetilsin. "Her sayfa kendi rengini seçsin" pratiğini kaldır.
**Durum:** ⏳ Planlı · Wave 14

### Soru 43 — Sidebar kapsam-dışı grupları
**Karar:** "Topluluk Yönetimi" ve "Pazarlama" gruplarını feature-flag (`FEATURE_FLAGS.community/promo`) arkasına al, varsayılan kapalı. Kod silinmez, tek satır flag ile geri açılabilir.
**Durum:** ⏳ Planlı · Wave 6

### Soru 44 — Boş menü grubunu gizle
**Karar:** Önce grup öğelerini yetkiye göre filtrele; filtrelenmiş öğe sayısı 0 ise grubun tamamını (başlık dahil) render etme.
**Durum:** ⏳ Planlı · Wave 14

### Soru 45 — Command palette aksiyonları
**Karar:** Palette'e `type: 'route' | 'action'` ayrımı ekle. Aksiyon komutları (maç iptal, payout tamamla, ban, ghost giriş) yetkiye göre filtrelensin ve doğrudan ilgili modal/RPC'yi tetiklesin.
**Durum:** ⏳ Planlı · Wave 14

### Soru 46 — Route registry tek kaynak
**Karar:** Tek `ADMIN_ROUTES` dizisi tanımla (route, label, icon, group, accent, permission, inPalette, inSidebar). Sidebar/palette/meta bu diziden türetilsin.
**Durum:** ⏳ Planlı · Wave 14

### Soru 47 — Kapsam-dışı sayfaların yönetimi
**Karar:** `CommunitiesPage`, `PromoCodesPage`, `CampaignsPage`, `SegmentationPage` silinmez; tek `FEATURE_FLAGS` kapısı arkasına alınır, route registry'de `enabled:false`. Kod kalır, kullanıcı yüzeyinden tümüyle kalkar.
**Durum:** ⏳ Planlı · Wave 6

### Soru 48 — Mobil / responsive
**Karar:** Sidebar'ı `md:` altında overlay drawer'a çevir (hamburger). `DataTable`'a `mobileCardRender` opsiyonu ekle, dar ekranda satırlar kart olarak görünsün.
**Durum:** ⏳ Planlı · Wave 14

### Soru 49 — i18n altyapısı
**Karar:** Hafif `adminStrings.ts` sözlüğü + `t(key)` helper'ı ile başla (lansman TR). Literal metinleri kademeli olarak anahtara taşı. Düşük öncelik.
**Durum:** ⏳ Planlı · Wave 14

### Soru 50 — Klavye kısayolları
**Karar:** Global `useAdminHotkeys` hook'u ekle: `Esc` drawer/modal kapat, `/` arama odak, `Cmd/Ctrl+K` palette — tek yerden zorla.
**Durum:** ⏳ Planlı · Wave 14

## 📦 Grup 6 — UI/UX: Maç Kontrol Kokpiti & Modül Derinliği (Soru 51–60)

### Soru 51 — Force capture / void / refund
**Karar:** Drawer'a "Ödeme/Tahsilat" sekmesi ekle. `admin_force_capture/void/refund` RPC'lerini `ActionConfirmModal` "yaz-onayla" deseniyle bağla, sonuç audit'e düşsün.
**Durum:** ⏳ Planlı · Wave 9

### Soru 52 — Skor override + kaleci/hakem ata
**Karar:** Drawer'a "Sonuç & Kadro" bölümü ekle: skor inputları + `admin_override_match_score`, kaleci slotu ata/kaldır, hakem değiştir/kaldır.
**Durum:** ⏳ Planlı · Wave 9

### Soru 53 — Force-confirm + payout tetik
**Karar:** Maç `COMPLETED` olunca drawer içinde "Sağlayıcı Payout'unu Tetikle" butonu göster; force-confirm için ayrı onaylı aksiyon ekle. İkisi de audit'lensin.
**Durum:** ⏳ Planlı · Wave 9

### Soru 54 — Maça-özel audit timeline
**Karar:** Drawer'a `target_id = match.id` ile filtreli audit timeline sekmesi ekle; her kayıt aktör + aksiyon + zaman + (varsa) eski/yeni değer göstersin.
**Durum:** ⏳ Planlı · Wave 9

### Soru 55 — Slot kilit
**Karar:** Slot satırına kilit ikonu ekle; `admin_set_slot_lock` benzeri RPC ile `LOCKED` durumu uygula, kilitli slotlar atamada "rezerve" görünsün.
**Durum:** ⏳ Planlı · Wave 9

### Soru 56 — Kadroya bildirim
**Karar:** Drawer alt aksiyon barına "Kadroya Bildir" butonu ekle; hazır şablonlar (iptal/skor/saha) + serbest metin, RPC ile maçın kayıtlı oyuncularına gönder.
**Durum:** ⏳ Planlı · Wave 9

### Soru 57 — Sekmeli kokpit
**Karar:** Drawer'ı `Kadro | Sonuç & Hakem | Ödeme | Bildirim | Audit` sekmelerine böl; her sekmenin kendi yıkıcı-onay sınırları olsun.
**Durum:** ⏳ Planlı · Wave 9

### Soru 58 — Kullanıcı 360 ekranı
**Karar:** `UsersPage`'e tıklanınca açılan "Kullanıcı 360" drawer'ı ekle: profil, cüzdan özeti/ledger, fair-play/rating, rol/PRO, ban toggle, ghost-giriş — hepsi tek ekranda, audit'li.
**Durum:** ⏳ Planlı · Wave 9

### Soru 59 — Dispute kokpit-içi çözüm
**Karar:** Dispute'u kokpit içinde sekme olarak inline çöz (kazanan/iade/komisyon kararı); karar audit + maç durumuna otomatik yansısın. Ayrı sayfa yalnız toplu liste için kalsın.
**Durum:** ⏳ Planlı · Wave 9

### Soru 60 — Birleşik Doğrulama Merkezi + tek rozet
**Karar:** Tek "Doğrulama Merkezi" sayfası yap (sekmeler: GK/Hakem, Kimlik, Tesis); sidebar'da toplam bekleyen sayısını tek rozette göster, alt kırılım sekme başlıklarında kalsın.
**Durum:** ⏳ Planlı · Wave 14

## 📦 Grup 7 — UI/UX: Dashboard/KPI, Boş-Yükleme-Hata & Erişilebilirlik (Soru 61–70)

### Soru 61 — "Başarılı Maç" kuzey-yıldızı KPI
**Karar:** En üste birincil "BAŞARILI MAÇ (tamamlanan)" kartını ekle (kuzey-yıldızı vurgu yeşili, büyük punto); mevcut kartları ikincil seride bırak.
**Durum:** ⏳ Planlı · Wave 14

### Soru 62 — Gerçek metrik vs heuristik
**Karar:** Durum ve sayaçları `admin_*` aggregate RPC'lerinden (gerçek maç durumu) al; FE heuristiğini yalnız anlık gösterim fallback'i olarak bırak, KPI olarak kullanma.
**Durum:** ⏳ Planlı · Wave 14

### Soru 63 — Boş/yükleme/hata tek standart
**Karar:** `DataState` sarmalayıcı bileşeni ekle (`loading | empty | error | ready`); hata durumunda tekrar-dene butonu + teknik detay (RPC adı) tek standart bileşende toplansın.
**Durum:** ⏳ Planlı · Wave 14

### Soru 64 — Sayfalama tutarlılığı
**Karar:** Tüm büyük listeleri `MatchesPage` desenine getir (sunucu arama + offset/keyset pagination); FinancePage/AuditLogPage'in FE filtrelemesini sunucu sorgusuna taşı.
**Durum:** ⏳ Planlı · Wave 14

### Soru 65 — Tablo CSV / sütun / yoğunluk
**Karar:** `DataTable`'a `exportable`, `columnToggle`, `density` propları ekle; CSV'yi kolon tanımlarından otomatik türet, her modül bedava export/sütun yönetimi kazansın.
**Durum:** ⏳ Planlı · Wave 14

### Soru 66 — Toplu işlem
**Karar:** `DataTable`'a `selectable` + `onSelectionChange` ekle; seçim varken üstte "X seçili" toplu-aksiyon barı göster, yıkıcı toplu işlemler `ActionConfirmModal`'dan geçsin.
**Durum:** ⏳ Planlı · Wave 14

### Soru 67 — Yıkıcı işlemde "yaz-onayla"
**Karar:** FinancePage ve diğer native `confirm/prompt` kullanımlarını `ActionConfirmModal`'a taşı; yüksek tutarlı payout/refund'larda hedef adını/tutarı yazdırarak onay zorla.
**Durum:** ⏳ Planlı · Wave 14

### Soru 68 — Realtime rozet + toast
**Karar:** Kritik kuyruklara (`pending_verifications`, `payout_requests`, `disputes`) realtime subscription bağla; rozetler canlı aksın. Toast'a opsiyonel "Geri Al" aksiyonu ve tutarlı süre ekle.
**Durum:** ⏳ Planlı · Wave 14

### Soru 69 — Erişilebilirlik
**Karar:** Minimum punto/kontrast eşikleri belirle (≥11px gövde, AA kontrast); drawer/modallere `role`/`aria-modal`/focus-trap/`Esc` ekle, interaktif öğelere `aria-label` ver; CI'a a11y lint ekle.
**Durum:** ⏳ Planlı · Wave 14

### Soru 70 — Ayarlar sayfası kapsamı & audit diff görünümü
**Karar:** (a) Sistem Parametreleri tek ekranda toplandı; `COMMISSION` eşikleri entegre edilecek, kritik ayar değişiminde onay istenecek. (b) Audit kayıtlarına `old_value/new_value` alanı ekleyip log satırında yan-yana eski→yeni diff göster.
**Durum:** 🔧 Başlandı (a: Sistem Parametreleri ekranı yapıldı Wave 2) · ⏳ b: audit diff Wave 14

## 📦 Grup 8 — Genel Sistemler: Ödeme/Finans Kontrolü & Payout (Soru 71–80)

### Soru 71 — `PAYMENT_PROVIDER` prod=IYZICO geçişi
**Karar:** Ödeme kodu SIMULATION'da tam kurulur. Go-live checklist'ine tek-yönlü kapı eklenir: iyzico canlı sözleşme + KYC onayı gelince `PAYMENT_PROVIDER=IYZICO` + canlı URL secret'ı set edilir, geçişten sonra ilk işlemler düşük tutarlı kanarya ile doğrulanır, panelde aktif provider rozeti gösterilir. Secret'ı çevirmek senin aksiyonun.
**Durum:** 🙋 Senin aksiyonun (canlı sözleşme/KYC) · 🔧 kod SIMULATION'da · Wave 11

### Soru 72 — Refund `paymentTransactionId` parametre netliği
**Karar:** iyzico canlı test ortamında bir capture→refund turu uçtan uca koşulup `provider_ref`'in gerçekten `paymentTransactionId` olduğu doğrulanır; gerekirse ayrı `payment_transaction_id` kolonu eklenir. Bu netleşmeden gerçek IYZICO provider'a geçiş BLOKE edilir.
**Durum:** 🙋 Senin aksiyonun (sandbox iade testi) · 🔧 kod SIMULATION'da · Wave 11

### Soru 73 — Admin'den force capture/void/refund tetikleme + audit
**Karar:** FinancePage'e "Ödeme Müdahale" alt ekranı eklenir: intent seçimi → force refund/void/capture; her tetiklemede zorunlu sebep + admin_id ile audit_log'a yazılır. Manuel DB/curl müdahalesi gerekmez.
**Durum:** ⏳ Planlı · Wave 9

### Soru 74 — Gerçek iyzico payout API
**Karar:** `iyzico-payout` edge fonksiyonu yazılır (submerchant/IBAN transfer); `processPayout` önce API çağrısı yapıp gerçek transfer referansını yazar. Manuel işaretleme yalnız "API başarısız → elle düzelt" fallback'i olarak kalır ve audit'lenir. SIMULATION'da kurulur, go-live'da gerçek API'ye bağlanır.
**Durum:** ⏳ Planlı · 🙋 go-live'da gerçek payout · Wave 11

### Soru 75 — Owner 2-haftalık otomatik payout cron'u
**Karar:** `pg_cron` ile 2 haftada bir çalışan job kurulur: hak edişi biriken her owner için net bakiye hesaplanıp PENDING payout_requests satırı oluşturulur. Otomatik üretilenler rozetle ayrıştırılır, job'ın son çalışma zamanı CommandCenter sağlık panosunda gösterilir.
**Durum:** ⏳ Planlı · Wave 11

### Soru 76 — Kaleci/Hakem anında payout otomasyonu
**Karar:** Maç COMPLETED'a geçince kaleci/hakem anında payout'u `iyzico-payout` üzerinden otomatik koşar; yalnız tutar eşiği üstü veya risk-işaretli olanlar manuel onaya düşer, geri kalanı tam otomatik.
**Durum:** ⏳ Planlı · Wave 11

### Soru 77 — Komisyon ayarı canlı akışa bağlanması + ölü `commissionRate` temizliği
**Karar:** `store.ts`'teki ölü `commissionRate` alanı ve türevleri silinir; CommissionPage `calculate_commission`'ın okuduğu ayar tablosuna (oran/eşik) bağlanır — tek kaynak. Değişiklik audit'lenir, sonrasında örnek hesapla "etkili oran" doğrulaması gösterilir.
**Durum:** ⏳ Planlı · Wave 5

### Soru 78 — Kademeli iade motorunun admin'den izlenmesi
**Karar:** Her iadede uygulanan kademe, `hours_to_match`, iade oranı ve net tutar `refund_log` benzeri tabloya yazılır; FinancePage'e "İadeler" sekmesi eklenip intent başına kademe + gerekçe gösterilir (dispute delili).
**Durum:** ⏳ Planlı · Wave 11

### Soru 79 — Finansal mutabakat/recon raporu
**Karar:** Günlük cron ile iyzico raporlama API'sinden çekilen kayıtlar yerel tabloyla eşleştirilip `reconciliation_report` üretilir; FinancePage'e "Mutabakat" sekmesi eklenip eşleşmeyen satırlar (delta) kırmızı işaretlenir ve çözüm aksiyonu sunulur.
**Durum:** ⏳ Planlı · Wave 11

### Soru 80 — Finans işlemlerinde zorunlu audit kapsamı
**Karar:** Finansı etkileyen tüm RPC/edge'lerde audit yazımı zorunlu (eksikse işlem reddedilir); FinancePage'e işlem-başına audit geçmişi drawer'ı eklenir; "audit'siz finans aksiyonu" CI/lint kapısıyla yakalanır.
**Durum:** ⏳ Planlı · Wave 11

## 📦 Grup 9 — Genel Sistemler: Bildirim/Broadcast, Ayar→App & Demo Veri (Soru 81–90)

### Soru 81 — APNs/FCM/Resend kimliklerinin prod'a deploy'u
**Karar:** Bildirim kodu SIMULATION'da tam kurulur. Go-live checklist'ine `supabase secrets set` ile APNs (KEY/KEY_ID/TEAM_ID/TOPIC), FCM service-account JSON ve RESEND_API_KEY adımları eklenir; her biri gerçek test cihazına/adrese gönderimle doğrulanır; secret varlığı CommandCenter sağlık panosunda yeşil/kırmızı gösterilir. Anahtarları sağlamak senin aksiyonun.
**Durum:** 🙋 Senin aksiyonun (APNs/FCM/Resend anahtarları) · 🔧 kod SIMULATION'da · Wave 12

### Soru 82 — Bildirim trigger/webhook deploy doğrulaması
**Karar:** "Sentinel test bildirimi" aksiyonu eklenir: admin kendi cihazına test push'u gönderip webhook→send-push zincirini uçtan uca doğrular; `push_log`'tan teslim durumu okunup panelde gösterilir; go-live checklist'ine koşum şartı yapılır.
**Durum:** ⏳ Planlı · Wave 12

### Soru 83 — `notification_templates` admin editörü
**Karar:** CampaignsPage altına "Şablonlar" sekmesi eklenir: şablon listesi, `{{...}}` değişken doğrulaması, canlı önizleme ve kayıtta audit; bozuk/eksik değişkenli şablon kaydedilemez.
**Durum:** ⏳ Planlı · Wave 12

### Soru 84 — Broadcast: kalıcı geçmiş + zamanlama + audit
**Karar:** `broadcast_campaigns` tablosu kurulur (başlık/gövde/segment/gönderen/zaman/teslim sayısı/durum); `scheduled_at` ile ileri-tarih gönderim cron'a bağlanır; CampaignsPage'e "Geçmiş" sekmesi + her gönderimde audit eklenir.
**Durum:** ⏳ Planlı · Wave 12

### Soru 85 — Broadcast rate-limit + önizleme + segment doğruluğu
**Karar:** Gönder butonuna "N kişiye gönderilecek — onayla" modalı konur; aynı segmente kısa pencerede tekrar gönderim backend'de rate-limit'lenir; segment sayısının send-push'ın gerçek hedef sorgusuyla aynı koşulu kullandığı test ile garanti edilir.
**Durum:** ⏳ Planlı · Wave 12

### Soru 86 — Sessiz saatler + zorunlu kategori + tercih saygısı
**Karar:** Bildirimlere `category` + `is_mandatory` eklenir; send-push opsiyonel kategorilerde `notification_preferences` ve sessiz-saat penceresini filtreler (ya da pencere sonrası kuyruğa atar); yalnız zorunlu (güvenlik/ödeme) bildirimler bypass eder.
**Durum:** ⏳ Planlı · Wave 12

### Soru 87 — `app_config` deploy'suz canlı etki (Runtime SSOT)
**Karar:** Edge/RPC tarafında `get_config(key)` kısa TTL'li (örn. 30sn) önbellek ya da `config_version` damgasıyla geçersizlenir; mobil app config'i açılışta + push/realtime sinyaliyle yeniler; panelde her ayara "en geç N sn içinde etkili olur" notu konur; kritik ayarlar (bakım modu) realtime kanalla anında yayılır. Tablo şeması Wave1'de kuruldu.
**Durum:** 🔧 Başlandı (app_config Wave1) · çalışma-zamanı yansıma · Wave 3

### Soru 88 — Demo verisinin finansal toplamlara sızmaması
**Karar:** Tüm finansal/KPI aggregate RPC'lerine zorunlu `AND NOT is_demo` eklenir (admin'in "demo dahil" özel görünümü hariç); bir test "demo satır eklemek ciroyu/komisyonu/payout'u değiştirmiyor" iddiasını doğrular; sızma bulunursa mutabakat (Soru 79) bunu delta olarak yakalar.
**Durum:** ⏳ Planlı · Wave 7

### Soru 89 — Lansman öncesi purge kapısı + `is_demo` koruması
**Karar:** `is_demo` default `false` olur ve yalnız seed RPC'si `true` yazabilir (normal insert path'lerinde yazım kısıtlanır); go-live checklist'ine "demo purge çalıştırıldı + 0 demo satır doğrulandı" otomatik kontrolü eklenir, purge öncesi sayım raporu gösterilir.
**Durum:** ⏳ Planlı · Wave 7

### Soru 90 — Ayar→App etki haritası + ölü-kod denetimi
**Karar:** SettingsPage'teki her ayara "bağlı / bağlı değil / kısmen" durumu eklenip bağlı-olmayanlar ya bağlanır ya kaldırılır; tek seferlik denetimle (Soru 77 `commissionRate` dahil) ölü ayarlar temizlenir ve bağlama E2E test ile doğrulanır.
**Durum:** ⏳ Planlı · Wave 3

## 📦 Grup 10 — Genel Sistemler: Realtime, Doğrulama Kuyruğu, Test & Go-Live (Soru 91–100)

### Soru 91 — Realtime'ı diğer ekranlara genişletme
**Karar:** CommandCenter'daki realtime+poll+debounce kalıbı paylaşılan bir hook'a çıkarılıp Finance/Matches/Users sayfalarına uygulanır; sayfa-bazlı kanal filtreleriyle maliyet düşürülür; bağlantı kopunca poll fallback otomatik devreye girer.
**Durum:** ⏳ Planlı · Wave 14

### Soru 92 — Doğrulama kuyruğu SLA/yaşlandırma/oto-eskalasyon
**Karar:** Birleşik kuyruğa `age = now() - submitted_at` ve `sla_breached` türetilen alanları eklenir; SLA aşan talepler kırmızı işaretlenip sidebar rozetinde ayrı sayılır; eşik aşımında OPERASYON rolüne alarm (Soru 95 ile) gider; ortalama-çözüm-süresi CommandCenter'da gösterilir.
**Durum:** ⏳ Planlı · Wave 14

### Soru 93 — E2E test kapsamı
**Karar:** Playwright ile (gerektiğinde SIMULATION provider'da) capture→refund, maç oluştur→doldur→tamamla, rezervasyon→ödeme ve payout onay akışlarını kapsayan E2E senaryoları yazılır; veritabanı seed/teardown ile izole edilir.
**Durum:** ⏳ Planlı · Wave 13

### Soru 94 — CI gate
**Karar:** GitHub Actions'ta lint + tip-kontrol + admin E2E + migration-dry-run koşan workflow kurulup main branch'te required status check yapılır; başarısızsa merge/deploy bloke olur.
**Durum:** ⏳ Planlı · Wave 13

### Soru 95 — Hata izleme (Sentry) + ürün analytics
**Karar:** Admin Vite uygulamasına ve edge fonksiyonlarına Sentry eklenir (DSN secret); admin aksiyonlarına minimal analytics olayları yerleştirilir; CommandCenter'da son 24sa hata oranı gösterilir. Kod tarafını ekip kurar, Sentry hesabı senin aksiyonun.
**Durum:** 🙋 Senin aksiyonun (Sentry hesabı) · ⏳ kod planlı · Wave 13

### Soru 96 — RPO/RTO + god-mode toplu-silme kurtarma runbook'u
**Karar:** RPO/RTO yazılı hedefe bağlanır; "yanlışlıkla silme" için adım-adım PITR restore runbook'u yazılıp tatbik edilir; yıkıcı RPC'ler soft-delete + onaya çevrilerek PITR bağımlılığı azaltılır; son tatbikat tarihi CommandCenter'da gösterilir. Runbook'u ekip yazar, Supabase PITR planı senin aksiyonun.
**Durum:** 🙋 Senin aksiyonun (Supabase PITR planı) · ⏳ runbook planlı · Wave 13

### Soru 97 — "Her problem panelden çözülebilir" boşluk denetimi
**Karar:** Tüm kritik varlık türleri (kullanıcı/maç/ödeme/payout/owner/bildirim/doğrulama) için "panelden çözülebilir aksiyon" matrisi çıkarılır; eksik her hücre go-live öncesi backlog'a alınıp kapanışı checklist'e bağlanır.
**Durum:** ⏳ Planlı · Wave 9

### Soru 98 — Feature-flag tablosu + kapsam-dışı modül temizliği
**Karar:** `feature_flags` tablosu (Wave1'de yapıldı) + admin toggle ekranı kullanılır; riskli/yarım özellikler flag arkasına alınır; kullanılmayan RPC/tablo/edge envanteri çıkarılıp güvenli olanlar kaldırılır (drop öncesi audit). Kapsam-dışı menü gizleme Wave6'da.
**Durum:** 🔧 Başlandı (feature_flags Wave1) · menü gizleme · Wave 6

### Soru 99 — Incident runbook + uptime izleme
**Karar:** Kritik edge fonksiyonları ve API için harici uptime izleme (health endpoint + alert) kurulur; senaryo bazlı (ödeme/bildirim/DB/payout) runbook yazılıp her birine "panelden çözüm adımı" bağlanır; CommandCenter'a servis sağlık paneli eklenir. Runbook'u ekip yazar, uptime izleme hesabı senin aksiyonun.
**Durum:** 🙋 Senin aksiyonun (uptime izleme hesabı) · ⏳ runbook planlı · Wave 13

### Soru 100 — Tek-komut `admin:deploy`
**Karar:** `admin:deploy` migration apply + edge function deploy + secret doğrulama + smoke koşumunu sıralı yapan tek komuta dönüştürülür; CI'da otomatik koşar; deploy sonrası RPC envanteri fiilen var-mı diye doğrulanır ve eksikler pipeline'da yakalanır.
**Durum:** ⏳ Planlı · Wave 13

---

## 🟢 Canlı durum (bu belge yazılırken)

**Parti A — Güvenli Temel CANLIYA ALINDI** (OYNA prod veritabanı):
- `app_config` (13 kural) + `feature_flags` (5 anahtar) tabloları oluştu, RLS açık.
- `settings` resmi şemaya kavuştu.
- `admin_audit_log` artık **değiştirilemez** (append-only trigger).
- RBAC kapı yardımcıları (`require_admin_role`, `is_finance_admin`, `is_moderator`) hazır.
- Güvenlik danışmanı: yeni eklenen okuma yardımcıları `SECURITY INVOKER`'a çevrildi (advisor temiz).

> Not: Canlı veritabanı, bu dalın migration dosyalarından ~4 migration **ileride** (faz8 vb.). Bu yüzden davranış değiştiren sonraki dalgalarda (3,5,7,8…) fonksiyonların **canlı kaynağı** okunarak güncellenecek; eski dal kopyası körlemesine uygulanmayacak.

## ➡️ Sırada
- **Parti B — Kontrolü Bağla:** Wave 5 (komisyon tek kaynak) → Wave 3 (kuralları uygulamaya bağla) → Wave 6 (kapsam-dışı gizle) → Wave 20-parça (silme kuyruğu).
- Sonra Parti E'nin test/izleme kısmı → Parti C → Parti D (para — onay bekler).

> Her karar uygulandıkça bu belgedeki **Durum** etiketleri ✅'e döner. Para (Parti D) ve hesap/sözleşme gerektiren 🙋 maddeler senin onayını bekler.

---

## 🔄 REVİZYON — 2026-07-28: Beş rol → İki rol

**Bağlam:** Soru 22/23'te tanımlanan beş rollü model (SUPER_ADMIN / ADMIN /
MODERATOR / FINANCE / SUPPORT) pratikte hiç kullanılmadı — `admin_team_members`
tablosunda bu üç rolde tek bir satır bile açılmadı. Kurucu kararı: model ikiye
insin.

**Yeni model:**

| Rol | Kapsam |
|---|---|
| `SUPER_ADMIN` | Her şey. **Ekip ve yetki yönetimi yalnız onda.** |
| `ADMIN` | Ekipler & Yetkiler hariç her şey (finans, moderasyon, destek, içerik, ayarlar dahil). |

**Uygulama** (`20260828000003_admin_iki_rol_modeli.sql`):

1. `admin_team_members` CHECK kısıtı iki değere indi; kalkan rollerdeki satırlar
   (varsa) `ADMIN`'e devredildi.
2. `is_moderator()` / `is_finance_admin()` → `is_platform_admin()` diğer adı
   oldu. İmzalar korundu: 60+ RPC bunları çağırıyor ve SUPER_ADMIN/ADMIN zaten
   her iki listede de vardı, dolayısıyla çağrı davranışı değişmedi.
3. `require_admin_role(text[])` sadeleşti — iki rollü modelde liste anlamsız.

**Bu arada kapatılan üç güvenlik açığı** (hepsi mevcut koddaydı):

- `require_admin_role()` ADMIN'i **her listede** erken dönüşle geçiriyordu.
  Bu yüzden `admin_reset_mfa` (`ARRAY['SUPER_ADMIN']` çağırmasına rağmen) ve
  `admin_revoke_platform_role` ADMIN'e açıktı: atanan bir admin, süper adminin
  2FA'sını sıfırlayıp hesabını devralabilir ya da yetkisini kaldırabilirdi.
  → Yeni `require_super_admin()` eklendi; ikisi de ona bağlandı.
- `profiles_update` RLS politikasının admin dalında yetki alanı koruması yoktu:
  bir ADMIN doğrudan `update profiles set role='SUPER_ADMIN' where id=auth.uid()`
  ile kendini yükseltebiliyordu (`is_super_admin()` `profiles.role`'e de bakar).
  → Admin dalına `profile_privileges_unchanged` şartı eklendi. Panelin rol yazan
  tüm akışları SECURITY DEFINER RPC'lerinden geçtiği için ekranlar etkilenmedi.
- RPC'lerdeki e-posta maskelemesi doğrudan tablo okumasıyla baypas edilebiliyordu.
  → `profiles` SELECT/UPDATE/DELETE politikaları süper admin satırlarını normal
  ADMIN'e kapattı.

**Süper admin gizliliği (kurucu kararı):**

- `admin_reveal_pii` süper admin hedefini reddeder (hesabın sahibi hariç).
- `admin_fetch_profiles` süper admin satırlarında e-posta/telefonu `•••` döndürür
  ve e-posta araması bu satırları eşleştirmez.
- Süper admin hesabı oyuncu tarafındaki dört keşif yüzeyinden yapısal olarak
  çıkarıldı: `search_users`, `get_friend_suggestions`, `get_recent_teammates`,
  `match_contacts`. Yalnız gizlilik bayrağına güvenilmedi — bayrak ayarlar
  ekranından geri açılabilir; dışlama fonksiyonun içindedir.

**Ayrıca:** `admin_set_platform_role` artık `profiles.role`'ü ezmiyor, yalnız
`is_admin` bayrağını işaretliyor. Eskiden rolü `ADMIN`/`SUPER_ADMIN` yazıyor ve
kişinin oyuncu/saha sahibi kimliğini yok ediyordu (`shared/roles.ts` bu iki
değeri geçilebilir rol saymadığı için rol geçişi bozuluyordu).

**Panel tarafı:** `AdminRole` iki değere indi; `ACL` rotası `SUPER_ADMIN_ONLY`.
Rol okunamadığında varsayılan `SUPPORT` → **`ADMIN`** oldu: geçici bir okuma
hatası süper admini Destek rolüne düşürüp menülerinin çoğunu gizliyordu.
ACL ekranındaki "Platform admin yetkisi ver" kutusu kaldırıldı — ilgili RPC
parametresi (`p_grant_platform_admin`) hiçbir zaman okunmuyordu, ölü arayüzdü.

**Durum:** ✅ Uygulandı · canlı (OYNA prod)
