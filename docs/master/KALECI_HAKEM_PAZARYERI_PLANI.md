# 🧤⚖️ OYNA — Kaleci & Hakem Pazaryeri + Sosyal Vitrin Planı (Faz 8)

> **Durum:** ONAY BEKLİYOR — kod tabanı denetimiyle (4 alt sistem haritası + bağlayıcı doküman taraması) hazırlandı.
> **Kaynak:** Kurucu ile 20 soruluk pazaryeri/sosyal keşif turu (07.07.2026) + `OYNA_MASTER_PRENSIPLER.md` + `OYNA_YOL_HARITASI.md` + Faz 5 servis motoru kodu.
> **Amaç:** "Kaleci Bul" ve "Hakem Kirala" bölümlerini, kaleci ve hakemlerin **bulunmaktan memnun olacağı** bir pazaryerine dönüştürmek.
> **Bağlayıcılık:** Bu plan `OYNA_MASTER_PRENSIPLER.md`'ye tabidir; çeliştiği 4 noktada **revizyon kapısı** açar (Bölüm 2) — kurucu onayı olmadan o maddeler uygulanmaz.
> **Son güncelleme:** 07.07.2026

---

## 0. Amaç & İlkeler

**Ürün tezi (keşif turunda netleşen):** Önce **likidite**, sonra **vitrin**. Kaleciyi/hakemi mutlu eden şey süslü profil değil; (1) düzenli iş akışı, (2) adil itibar sistemi, (3) kazanç görünürlüğüdür. Sosyal katman bu üçünü güçlendirdiği ölçüde eklenir — OYNA bir sosyal ağ değildir (Prensipler §1), sosyal öğeler **pazaryeri güven sinyali** olarak sınırlanır.

**Uygulama ilkeleri (Prensipler §9.1 ile uyumlu):**
- Tüm yazma işlemleri **SECURITY DEFINER RPC** + `SET search_path = public, pg_temp` + `REVOKE PUBLIC/anon → GRANT authenticated` ev stiliyle.
- Tüm yeni admin RPC'leri `require_admin_role()` kapısıyla; mevcut `__core`+wrapper fonksiyonları `CREATE OR REPLACE` ile **ezilmez** (Wave 8 kuralı).
- Tüm eşik/oran/süre parametreleri **admin ayarlı** (`app_config`), kodda sabit değil.
- Yeni migration dosyaları **`20260714000000`'dan büyük** timestamp alır (mevcut en büyük: `20260713000000`; aynı-timestamp çakışması yaşanmış bir defter bu — tekrarlamayalım).
- `goalkeepers`/`referees` canlı kolonları **camelCase** (`"matchCount"`, `"isElite"`, `"preferredZones"`) — yeni SQL bu gerçeğe göre quoted yazılır; migration dosyalarındaki snake_case tanım canlıyı temsil etmiyor. Yeni migration'lar deploy öncesi **canlı şemaya karşı** doğrulanır (`SUPABASE_MIGRATION_RECONCILIATION.md` runbook'u).

---

## 1. Kod Gerçeği — Mevcut Temel

### 1.1 Sağlam çalışan çekirdek (üstüne inşa edilecek)
| Bileşen | Konum | Durum |
|---|---|---|
| Tek talep modeli `service_requests` (PENDING→ACCEPTED→CAPTURED→COMPLETED / REJECTED / CANCELLED / EXPIRED) | `20260706000006_faz5_service_engine.sql:100-144` | ✅ Canlı, 17 e2e test |
| `create_service_request` (fee DB'den, %10 komisyon SSOT, iyzico blokaj intenti, advisory lock) | aynı migration :511-600 | ✅ |
| `respond_service_request` / `capture_service_request` / maç CONFIRMED-CANCELLED trigger'ları | aynı migration :605-850 | ✅ |
| `find_providers_for_match` (approved + müsait + çakışmasız; rating→matchCount→fee sıralı) | aynı migration :427-505 | ✅ (sıralama dar — 8A.6) |
| Puanlama→anlık payout zinciri: `submit_service_rating` → `_recompute_provider_rating` + `_release_service_payout` | `20260706000007:145-162` | ✅ (tek eksen — 8B.1) |
| Onboarding: `provider_applications` + `provider-docs` private bucket + `provider_identities` (TC hash payout kapısı) | `20260706000006:29-94, 362-421` | ✅ |
| Komisyon SSOT: `commission_config` + `calculate_commission` (SERVICE_GK/REF %10, scope_id override kancası hazır) | `20260703000002` + `20260707000003` | ✅ |
| Bildirim altyapısı: `notifications` + `notification_templates` + `send-push` edge fn + sessiz saat/rate-limit `app_config` anahtarları | `20260708000013` + `notifications/` | ✅ (pazaryeri olaylarına bağlı değil — 8A.4) |
| Sosyal graf: `friendships` + `user_blocks` + `conversations`/`messages` (realtime, RPC'li) | `20260706000008` | ✅ |
| pg_cron desenleri (`auto_process_matches` */10dk vb.) | `20260704000001:170-173` | ✅ (TTL süpürücüye şablon) |

### 1.2 Kırık / yalancı yollar (Faz 8A'nın varlık sebebi — sosyal katmandan ÖNCE onarılmalı)
1. **Çift kiralama akışı:** `views/Marketplace.tsx`'teki "DİREKT KİRALA" `player_update_match` ile maçı doğrudan mutasyona uğratıyor (GK slotu player'sız `TAKEN`, ödeme/onay/bildirim/`service_request` YOK — `Marketplace.tsx:118-166`); "TEKLİF GÖNDER" ise **hiçbir şey yapmayan** `console.log` + sahte başarı ekranı (:146-148). Gerçek motor yalnız `MatchJoin.tsx:869-907`'de.
2. **Sağlayıcı kayıtları DB'ye ulaşmıyor:** müsaitlik/çalışma saati/ücret/ayarlar `admin_update_goalkeeper/referee` RPC'sine gidiyor; RPC `is_platform_admin()` istiyor (sağlayıcıda UNAUTHORIZED, `20260627000001:44`) ve gövdesi `working_hours`/`is_available`/`settings` alanlarını zaten içermiyor. `ServiceDashboard` "AKTİFLİK AYARLARI" modalı ve `ServiceSettings` toggle'ları **görsel olarak çalışıp sessizce kayboluyor**.
3. **Payout güvenlik açığı:** `ServiceDashboard.tsx:482-516` "HEMEN AKTAR" butonu `profiles.wallet_balance`'ı doğrudan 0'a çekip `request_payout` RPC'sinin **TC kimlik kapısını, bakiye kontrolünü ve bekleyen-payout engelini bypass ediyor**.
4. **EXPIRED ölü alan:** `expires_at` yazılıyor (sabit 24h) ama süresi geçen PENDING talebi EXPIRED'a çeviren hiçbir cron/trigger yok — blokajlı intent askıda kalıyor ve `_provider_has_conflict` PENDING'i saydığı için sağlayıcıyı bloke edebiliyor.
5. **Talep bildirimi yok:** `create_service_request` sağlayıcıya notification INSERT etmiyor; kokpitte realtime da yok (manuel yenileme) — sağlayıcı 24 saatlik talebi hiç görmeden kaçırabiliyor.
6. **Eski model kalıntıları:** `service_offers` (legacy, ödeme motorsuz doğrudan UPDATE) ve `matches.applicants` JSONB oku-değiştir-yaz akışı `service_requests` ile paralel yaşıyor.
7. **Cüzdanda çift kaynak:** `profiles.wallet_balance` ↔ `wallet_transactions`+`get_wallet_summary` çelişebiliyor.
8. **Küçük ama bulaşıcı:** `store.updateGoalkeeper/updateReferee` kısmi objeyle tüm kaydı eziyor (`store.ts:891-931`); `activeHours` `"18:00 - 23:00"` string'ine `includes('21:00')` filtresi yanlış sonuç üretebiliyor (`Marketplace.tsx:82`); kartta "2.4 KM" hardcoded fallback.

### 1.3 Hiç olmayanlar (bu planla kurulacak)
Takip (`provider_follows`), müsaitlik yayını, sağlayıcı vitrini (kaptanın gördüğü herkese açık profil sayfası **yok** — `ServiceProfile.tsx` sağlayıcının kendi düzenleme ekranı), otomatik maç kartı feed'i, hesaplanan kademe (yalnız `isElite` boolean), çok eksenli puan + "tekrar çalışırım", yoruma yanıt/itiraz, sağlayıcı analitiği, açık ihtiyaç ilanı, digest bildirimi, kullanıcı bazlı sessiz saat.

---

## 2. Master Prensipler Hizalaması — Revizyon Kapıları

| # | Konu | Prensip | Bu plan | Durum |
|---|---|---|---|---|
| **R1** | Pazarlık/teklif | §4.3 "sabit ücret, **pazarlık yok**" | Marketplace'teki BID arayüzü **kaldırılır**; tek yol "hızlı kirala". Kod dokümanla hizalanıyor. | ✅ Revizyon değil — hizalama |
| **R2** | Kademe & rozet | §2/§7 oyunlaştırma (rozetler) kapsam dışı | **Sınırlı istisna:** yalnız GK/REF sağlayıcıları için, pazaryeri güven sinyali olarak hesaplanan kademe (Çaylak→Elite) + kilometre taşları. Oyuncu tarafına oyunlaştırma **girmez**; ELMAS/lider tablosu geri gelmez. | 🔓 **Kurucu onayı** |
| **R3** | Kademeli komisyon | §4.6 "komisyon herkese aynı (admin ayarlı)" | %10→%8 performans indirimi yalnız Faz 8C'de, `commission_config` scope_id override'ı ile, admin panelden açılıp kapanabilir. | 🔓 **Kurucu onayı** |
| **R4** | Feed | §1 "sosyal ağ değil" | Genel timeline **kurulmaz**. Feed = sağlayıcının kendi profil duvarı (otomatik maç kartları) + takipçilere bildirim. | ✅ Uyumlu yorum (dar kapsam) |
| **R5** | Mesajlaşma | §8.4 "1-1 mesaj yalnız arkadaşlar" | Faz 8A/8B'de mesajlaşmaya **dokunulmaz** (talep akışı zaten yapılandırılmış). Kiralama bağlamı sohbeti (SERVICE kanal tipi) Faz 8C'de ayrı karar. | 🔓 **Kurucu onayı** (8C) |

> Onaylanan revizyonlar `OYNA_MASTER_PRENSIPLER.md` §14 Revizyon Notları'na işlenir — "tek kaynak" ilkesi gereği bu plan tek başına prensip değiştirmez.

---

## 3. Veri Modeli Kararı

### 3.1 Karar: Büyük patlama birleştirmesi YOK
Keşif turundaki "tek `provider_profiles` + `gk_details`/`ref_details`" önerisi kod gerçeğiyle test edildi ve **revize edildi**. Gerekçe:
- `goalkeepers`/`referees` tablolarına 10+ RPC, seed'ler, admin panel ve UI bağımlı; canlı kolonlar camelCase drift'li. Big-bang rename = yüksek risk, sıfır kullanıcı değeri.
- İhtiyacın özü "sosyal tabloları iki role tek şemayla bağlamak". Bunu `service_ratings` zaten çözmüş durumda: **`provider_id` = `profiles.id` + `provider_type` CHECK('GK','REF')** deseni.

**Karar:** Tüm yeni sosyal/pazaryeri tabloları `provider_id uuid REFERENCES profiles(id)` + `provider_type` deseniyle kurulur. `goalkeepers`/`referees` rol-özel detay tabloları olarak **yerinde kalır**. Okuma tarafında tek birleşik kaynak için `provider_directory` **view**'ı yazılır (iki tablonun UNION'ı + `provider_stats` join'i) ve frontend'te tek `Provider` tipi bu view'dan beslenir. Birleşik fiziksel tablo ihtiyacı doğarsa view zaten geçiş yolunu hazırlamış olur.

### 3.2 Yeni tablolar (özet DDL sözleşmesi)

| Tablo | Kolonlar (özet) | RLS | Faz |
|---|---|---|---|
| `provider_stats` | `provider_id` PK→profiles, `provider_type`, `tier` ('ROOKIE','EXPERIENCED','MASTER','ELITE'), `completed_count`, `avg_rating_recent` (son 20, ağırlıklı), `rehire_rate`, `response_avg_seconds`, `completion_rate`, `cancel_rate`, `updated_at` | Herkese SELECT; yazma yalnız sistem fonksiyonu (GUC bayraklı) | 8A |
| `provider_follows` | `(follower_id, provider_id)` PK, `provider_type`, `created_at` | `pitch_favorites` deseni: kendi satırına INSERT/DELETE, kendi takiplerine + sağlayıcının kendine SELECT | 8B |
| `availability_posts` | `id`, `provider_id`, `provider_type`, `starts_at`, `ends_at`, `zone_city`, `zone_district`, `note` (≤200), `status` ('ACTIVE','EXPIRED','CANCELLED'), `created_at` | Herkese (authenticated) SELECT; yazma RPC | 8B |
| `provider_feed_events` | `id`, `provider_id`, `provider_type`, `kind` ('MATCH_CARD','MILESTONE','TIER_CHANGE'), `match_id?`, `payload` jsonb, `created_at` | Herkese SELECT; yazma yalnız trigger/sistem | 8B |
| `service_rating_replies` | `rating_id` PK (1 yanıt kuralı UNIQUE ile), `provider_id`, `body` (≤500), `created_at` | Rating'i görebilen görür; yazma RPC (yalnız ilgili sağlayıcı) | 8B |
| `service_rating_disputes` | `id`, `rating_id` UNIQUE, `provider_id`, `reason`, `status` ('PENDING','UPHELD','DISMISSED'), `admin_notes`, `reviewed_by/at` | Taraflar + admin; çözüm RPC'si OPERASYON/MODERATOR | 8B |
| `provider_profile_views` | `(provider_id, day)` PK, `views` int — **günlük aggregate**, ham olay saklanmaz (KVKK veri minimizasyonu) | Sağlayıcı kendi satırlarını görür; artırma RPC | 8B |
| `open_service_listings` | `id`, `match_id`, `provider_type`, `fee`, `status` ('OPEN','CLAIMED','CANCELLED','EXPIRED'), `created_by`, `claimed_by?`, `claimed_at?`, `expires_at` | Bölge sağlayıcıları SELECT; claim atomik RPC | 8C |

`service_ratings`'e **additive** kolonlar (mevcut `score` ve payout zinciri korunur): `would_rehire boolean`, `axis_scores jsonb` (GK: refleks/iletişim/dakiklik; REF: adillik/otorite/dakiklik — anahtarlar `app_config`'ten).

### 3.3 Migration planı
| Dosya | İçerik |
|---|---|
| `20260714000000_faz8a_marketplace_repair.sql` | `provider_update_own_profile` RPC · dinamik TTL · `expire_service_requests` cron · talep/yanıt bildirimleri · `provider_stats` + hesap fonksiyonu + günlük cron · `find_providers_for_match` v2 (karma skor) |
| `20260714000001_faz8a_legacy_cleanup.sql` | `service_offers` deprecate (yazma kapatılır, 30 gün sonra DROP) · `settings.service_request_expiry_hours` → `app_config` TTL anahtarları |
| `20260715000000_faz8b_social_core.sql` | `provider_follows` · `availability_posts` · `provider_feed_events` · `provider_profile_views` · `provider_directory` view · fan-out bildirim fonksiyonları + şablon seed'leri |
| `20260715000001_faz8b_rating_depth.sql` | rating kolonları · `service_rating_replies` · `service_rating_disputes` · `_recompute_provider_rating` v2 (recency ağırlığı + çaylak koruması) · kademe hesabı + `TIER_CHANGE` feed olayı |
| `2026071600000x_faz8c_*.sql` | open listings + atomik claim · kademeli komisyon · KVKK retention (yalnız onaylanan 8C maddeleri) |

---

## 4. FAZ 8A — Onarım & Likidite 🔧 (iyzico beklemez, hemen başlanabilir)
**Amaç:** Tek ve dürüst kiralama akışı; sağlayıcının kayıtlarının gerçekten kaydolması; talebin sağlayıcıya anında ulaşması. **Önkoşul:** yok.

**8A.1 — Tek kiralama akışı: "Hızlı Kirala" bottom-sheet** 🔴
- 🔧 **Ne:** `Marketplace.tsx`'in BID/DIRECT/maç-seçim overlay yığını sökülür; yerine `components/Marketplace/HireSheet.tsx`: profil kartından tek dokunuş → maç önceden seçili (kaptanın tek aktif maçı varsa adım yok) → DB'den gelen sabit ücret + "sağlayıcının eline geçecek net" (mevcut `provider_amount`) şeffaf gösterilir → onay → `serviceRequestService.createServiceRequest` (MatchJoin'in kullandığı gerçek motor). Başarı ekranı "talep gönderildi, yanıt bekleniyor" der — "kiralama başarılı" **demez** (sağlayıcı onayı gerçek). `player_update_match` mutasyonu ve ölü state'ler (`showToast`, `isBidding`, `selectedGk/Ref` ölü prop zinciri) kaldırılır.
- 🎯 **Neden:** Bugün iki paralel akıştan biri sahte (1.2/1); kullanıcı ödemesiz "kiraladım" sanıyor, sağlayıcının haberi olmuyor — pazaryeri güveninin tam tersi. R1 gereği pazarlık yolu da kapanıyor.
- ✅ **Sonuç:** Kiralamanın tek yolu var, o yol gerçek; 2 dokunuşta talep.

**8A.2 — Sağlayıcı self-servis kayıt onarımı** 🔴
- 🔧 **Ne:** Yeni RPC `provider_update_own_profile(p_payload jsonb)`: `auth.uid()` kendi `goalkeepers`/`referees` satırını (bio, fee, style, avatar, `"preferredZones"`, coordinates, `working_hours`, `settings`) ve `profiles.is_available`'ı günceller; `rating`/`"isElite"`/`"matchCount"` alanları **reddedilir** (koruma trigger'ları zaten var). `ServiceProfile`, `ServiceSettings`, `ServiceDashboard` AKTİFLİK modalı bu RPC'ye bağlanır; `admin_update_*` çağrıları sağlayıcı akışından çıkar. Müsaitlik **tek kaynak** = `profiles.is_available` (eşleştirme zaten oradan okuyor); `working_hours` detay olarak kalır. `store.updateGoalkeeper/updateReferee` kısmi-obje ezmesi merge'e çevrilir; `activeHours` string'i `{start,end}` yapısına normalize edilir (filtre bug'ı kapanır).
- 🎯 **Neden:** Sağlayıcının müsaitlik/ücret/ayar kayıtları bugün DB'ye hiç ulaşmıyor (1.2/2) — "memnun sağlayıcı" hedefinin en temel ihlali; 8B'deki müsaitlik yayını bu yol onarılmadan kurulamaz.
- ✅ **Sonuç:** Sağlayıcı ne ayarlarsa o kaydolur; müsaitlik tek kaynaktan.

**8A.3 — Payout güvenlik onarımı** 🔴
- 🔧 **Ne:** `handleTransfer` doğrudan `wallet_balance` sıfırlaması silinir → `request_payout` RPC'sine bağlanır (TC kimlik kapısı, bakiye ve bekleyen-payout kontrolleri geri gelir); kokpit cüzdan görünümü tek kaynağa (`get_wallet_summary`) indirilir; "Bekleyen 800₺" gibi hardcoded değerler gerçek sorguya bağlanır; mock kart yönetimi modalları kaldırılır (iyzico go-live'a kadar "IBAN'a aktarım" tek yol).
- 🎯 **Neden:** Mevcut buton kimlik doğrulamasız para çekimi simüle ediyor (1.2/3) — canlıya böyle çıkılamaz.
- ✅ **Sonuç:** Çekim tek, kapılı, denetlenebilir yoldan.

**8A.4 — Talep bildirimleri + realtime** 🟡
- 🔧 **Ne:** `create_service_request` → sağlayıcıya `notifications` INSERT (`type_key='service_request_new'`, deep_link `oyna://service-request/<id>`); `respond_service_request` → kaptana `service_request_accepted/rejected`; süpürücü → `service_request_expired` (iki tarafa). Şablonlar `notification_templates`'e seed edilir (mevcut `gk_accepted/rejected` ailesinin yanına); `Notifications.tsx` ICON_MAP/kategori eşlemesi genişletilir. Kokpit "Gelen Talepler" `notifications` realtime kanalını dinleyip refetch eder (`service_requests`'i publication'a eklemeye gerek kalmaz). Push zaten `notifications` INSERT webhook'undan otomatik tetiklenir.
- 🎯 **Neden:** Talep şu an sessizce düşüyor (1.2/5); pazaryerinin kalbi "talep geldi" anıdır.
- ✅ **Sonuç:** Talep anında telefonda; kabul/ret anında kaptanda.

**8A.5 — Dinamik TTL + EXPIRED süpürücü + alternatif öneri** 🟡
- 🔧 **Ne:** `create_service_request` TTL hesabı: maça >24h ise `ttl_far` (varsayılan 4h), ≤24h ise `ttl_near` (varsayılan 60dk); her durumda `expires_at ≤ maç başlangıcı − 30dk` (anahtarlar `app_config`: `service_ttl_far_hours`, `service_ttl_near_minutes`, `service_ttl_floor_minutes`). Yeni pg_cron `expire_service_requests` (*/5dk): süresi geçen PENDING → EXPIRED + `void_preauth` + iki tarafa bildirim; kaptana giden bildirim deep-link ile `find_providers_for_match`'in bir sonraki 3 önerisini gösteren ekrana açılır. Profilde yanıt hızı kovası ("genellikle 15 dk içinde yanıtlar") `provider_stats.response_avg_seconds`'tan.
- 🎯 **Neden:** EXPIRED bugün ölü alan (1.2/4): blokaj askıda kalıyor, sağlayıcı sahte-çakışmayla bloke oluyor, kaptan eli boş bekliyor. Kaptanın eli boş kalmaması pazaryerinin bir numaralı görevi.
- ✅ **Sonuç:** Cevapsız talep kendini temizler, para serbest kalır, kaptana anında B planı sunulur.

**8A.6 — Karma sıralama v1 + `provider_stats`** 🟡
- 🔧 **Ne:** `provider_stats` tablosu + `refresh_provider_stats()` (günlük cron + rating/talep olaylarında hedefli güncelleme; yazarken `app.rating_recompute` GUC deseni). `find_providers_for_match` v2: skor = `w_dist*mesafe_norm + w_rating*puan_norm + w_resp*yanıt_norm + w_comp*tamamlama` (ağırlıklar `app_config`, başlangıç 0.35/0.30/0.20/0.15; mesafe `earthdistance` — `get_nearby_matches` deseni). `Marketplace.tsx` `filteredProfiles`'a aynı formülle `.sort()` + kullanıcıya manuel seçenekler (En yakın / En yüksek puan / En uygun ücret); karttaki "2.4 KM" fallback'i kaldırılıp gerçek mesafe (konum yoksa "Konumunu aç") gösterilir.
- 🎯 **Neden:** Bugün liste sırasız, öneri RPC'si mesafe/yanıt hızını hiç kullanmıyor — "en uygun kişi üstte" pazaryerinin temel vaadi (Prensipler §4.3 "müsait + en yakın + en yüksek puanlı" zaten karar).
- ✅ **Sonuç:** Sıralama açıklanabilir, admin ayarlı, her iki yüzeyde tutarlı.

**8A.7 — Legacy temizlik** 🟢
- 🔧 **Ne:** `service_offers` yazma yolları kapatılır (kokpit "Özel Teklifler" bölümü kaldırılır), 30 gün sonra DROP; `applyToMatch`'in `matches.applicants` oku-değiştir-yaz'ı RPC'ye alınır ya da JOBS başvurusu 8C açık ilana kadar gizlenir; kokpitteki erişilemeyen WALLET sekmesi alt nav'a bağlanır, ölü `renderPricingView` silinir; SOS mock kartı kaldırılır (8C'de gerçeğiyle döner).
- 🎯 **Neden:** Üç paralel iş-alma yolu (1.2/6) yeni gelen her özelliğin belirsizlik maliyetini büyütüyor; Prensipler §4.3 "tek talep modeli"ni zaten karara bağlamış.
- ✅ **Sonuç:** Tek model, sade kokpit.

**📦 Faz Sonu Çıktısı:** Kaptan 2 dokunuşta gerçek talep gönderir; sağlayıcı anında görür, ayarları kaydolur, süresi geçen talep kendini temizler, liste akıllı sıralanır. **Risk:** `Marketplace.tsx` söküm sırasında `MatchJoin` akışını bozmak → ortak `HireSheet` iki yüzeyden de kullanılıp tek e2e senaryoyla korunur.

---

## 5. FAZ 8B — İtibar & Bağ (Sosyal Vitrin) 🌟
**Amaç:** Sağlayıcının "bulunmaktan memnun olacağı" vitrin: adil çok eksenli itibar, takip, müsaitlik yayını, otomatik içerik, analitik. **Önkoşul:** 8A.

**8B.1 — Çok eksenli puan + "tekrar çalışırım" + çaylak koruması** 🔴
- 🔧 **Ne:** `service_ratings`'e `would_rehire` + `axis_scores` (additive). `submit_service_rating` imzası genişler (eski çağrılar çalışmaya devam eder — payout zinciri `score` üstünde kalır). `PostMatchEval` ServiceRatingCard yeniden: 3 eksen (yıldız) + "tekrar çalışır mısın?" toggle + yorum; ekrandaki persist edilmeyen alanlar (refRating, organizasyon yorumu) ya bağlanır ya kaldırılır. `_recompute_provider_rating` v2: son 20 değerlendirme ağırlıklı ortalama + `rehire_rate`. **Çaylak koruması gösterim katmanında:** `provider_directory` view'ı `completed_count < 5` iken `rating`/`rehire_rate` alanlarını NULL + `is_rookie=true` döner; kart "🌱 Yeni" rozeti gösterir (veri hesaplanır ama sergilenmez; eşik `app_config.rookie_shield_matches`).
- 🎯 **Neden:** Tek eksenli 1-10 hem az bilgi veriyor hem enflasyona açık; "tekrar çalışırım %X" en dürüst sinyal. Çaylak koruması arz tarafına katılımın önündeki en büyük psikolojik bariyeri kaldırır.
- ✅ **Sonuç:** Profilde "%92 tekrar çalışırım" + eksen kırılımı; yeni sağlayıcı ilk 5 maçında damgalanmaz; payout mekaniği bozulmaz.

**8B.2 — Yoruma yanıt + puana itiraz** 🟡
- 🔧 **Ne:** `reply_to_service_rating` (yalnız ilgili sağlayıcı, rating başına 1, ≤500 karakter) + `dispute_service_rating` → `service_rating_disputes` (PENDING) → admin panel Doğrulama/Moderasyon kuyruğuna yeni sekme (`admin_resolve_rating_dispute`, `require_admin_role(['SUPER_ADMIN','ADMIN','MODERATOR'])`; UPHELD ise puan `_recompute`'tan düşülür ama satır **görünür kalır** "hesaba katılmıyor" rozetiyle). Kokpitte "Değerlendirmelerim" bölümü (yanıtla/itiraz butonları); `PostMatchEval`'deki sahte "itiraz" toast'u gerçeğe bağlanır.
- 🎯 **Neden:** Haksız tek bir düşük puana cevap hakkı olmaması, sağlayıcı kaybettiren bir numaralı adalet sorunudur; admin RBAC ve kuyruk altyapısı hazır.
- ✅ **Sonuç:** Sağlayıcı sesi olan taraf; itiraz denetlenebilir süreçte.

**8B.3 — Takip (`provider_follows`)** 🟡
- 🔧 **Ne:** Tablo + `pitch_favorites` RLS deseni (yazma doğrudan tablo, RPC gerekmez); `MarketplaceCard` kalbi ve detay modalındaki ölü Heart butonu bağlanır; listede "Takip Ettiklerim" filtresi; kokpit ve vitrine takipçi sayısı. Arkadaşlıktan **ayrı** (asimetrik, onaysız); `SocialView` GROUPS'taki "Favorilerim" kavramıyla karışmaması için pazaryerinde adı "Takip Et".
- 🎯 **Neden:** Tekrar kiralama pazaryerinin en ucuz büyüme kanalı; bugün kalp butonu lokal state'te kayboluyor.
- ✅ **Sonuç:** Kaptan radarına aldığını kaybetmez; sağlayıcı kitle biriktirir.

**8B.4 — Müsaitlik yayını** 🔴
- 🔧 **Ne:** `create_availability_post` RPC (sağlayıcı; aktif yayın limiti `app_config.availability_post_max_active`=3; `working_hours` ile ön-dolu form kokpit HOME'a) + `cancel_availability_post`. Fan-out (admin_broadcast döngü deseni): takipçilere anında `provider_availability` bildirimi; aynı il/ilçede o saatte maçı olan kaptanlara **günlük tek digest** (`availability_digest` cron'u — spam önlenir). Marketplace üstüne "Bugün müsait" yatay şeridi (aktif yayınlar); süresi geçen yayınları EXPIRED'a çeviren süpürücü 8A.5 cron'una eklenir.
- 🎯 **Neden:** Prensipler §4.3 "kaleci/hakem müsaitlik açar" kararının sosyal karşılığı; arz tarafını aktif tutan ve talep yönünü tersine çeviren en ucuz mekanizma.
- ✅ **Sonuç:** "Perşembe 21:00 boşum" tek dokunuşla takipçilere ve doğru kaptanlara ulaşır.

**8B.5 — Sağlayıcı vitrini (kamu profili)** 🔴
- 🔧 **Ne:** Yeni `views/ProviderPublicProfile.tsx` (kaptanın gördüğü sayfa — bugün yok): kimlik + kademe + eksen kırılımlı puan + "%X tekrar çalışırım" + haftalık müsaitlik ızgarası (`working_hours`) + son maç kartları (`provider_feed_events`) + yorumlar & sağlayıcı yanıtları + "Takip Et" + "Hızlı Kirala" (8A.1 sheet'i). Veri tek çağrıyla `get_provider_public_profile(p_provider_id)` RPC'sinden; görüntülenme `log_provider_profile_view` ile günlük aggregate'e (+1). Görsel dil: GK kartları `FifaCard` oyunsu dili (mevcut Gold/Silver/Bronz teması kademeye bağlanır), REF için sade "kokart/lisans" varyantı — iki rol bilinçli ayrışır, ızgara ortak.
- 🎯 **Neden:** "Bulunmaktan memnun olmak" = sergilenecek bir sahnenin olması; bugün kaptan karar için yalnız kart + modal görüyor.
- ✅ **Sonuç:** Her sağlayıcının paylaşılabilir, güven veren vitrini var.

**8B.6 — Otomatik maç kartı (feed'in motoru)** 🟡
- 🔧 **Ne:** Maç COMPLETED olduğunda (mevcut finalize/cron zincirine AFTER UPDATE trigger) o maçın CAPTURED/COMPLETED `service_requests`'i için `provider_feed_events`'e `MATCH_CARD` INSERT (payload: saha, tarih, skor varsa, aldığı puan — puan çaylak korumasına tabi). Kilometre taşları (50./100. maç → `MILESTONE`) ve kademe değişimi (`TIER_CHANGE`) aynı tabloya. Takipçilere anlık push **yok** — kartlar vitrine düşer, haftalık özete girer (R4 dar kapsam).
- 🎯 **Neden:** Sıfır kullanıcı emeğiyle dolu vitrin — boş feed sorununu baştan çözer; manuel paylaşım (foto/metin) bilinçli olarak kapsam dışı (moderasyon maliyeti, §1 uyumu).
- ✅ **Sonuç:** Vitrin kendi kendini doldurur.

**8B.7 — Hesaplanan kademe (R2 onayına tabi)** 🟡
- 🔧 **Ne:** `provider_stats.tier` hesabı (günlük cron + maç tamamlanınca): ROOKIE <10 tamamlanmış iş; EXPERIENCED ≥10; MASTER ≥40 ∧ puan ≥8.0; ELITE ≥100 ∧ puan ≥8.5 ∧ iptal ≤%5 (eşikler `app_config.tier_*`, admin panelden). Düşüşte 30 gün tolerans (`tier_grace_days`). `"isElite"` boolean'ı **deprecated**: `admin_update_*`'ta kalır (elle override edilebilir), gösterim `tier`'dan. Kart/vitrin/`find_providers` çıktısı tier döner; kokpitteki hardcoded "LVL 8"/"A-CLASS" süslemeleri gerçeğe bağlanır.
- 🎯 **Neden:** Elle atanan `isElite` ölçeklenmez ve keyfî algılanır; şeffaf formül sağlayıcıya kariyer merdiveni verir. Oyunlaştırma taşması yok: yalnız sağlayıcı, yalnız güven sinyali.
- ✅ **Sonuç:** Kademe kazanılır, formülü herkes bilir, admin ayarlar.

**8B.8 — Sağlayıcı analitiği + haftalık özet** 🟢
- 🔧 **Ne:** Kokpit HOME "GÜNLÜK ÖZET" kartı gerçek veriye bağlanır: bu hafta görüntülenme (`provider_profile_views`), yeni takipçi, yanıt hızı kovası, bölge ücret konumu ("bölge medyanının %10 altındasın"). Pazar 20:00 `weekly_summary` cron'u: şablon **zaten seed'li** (`notification_templates`), üretici fonksiyon yazılır; kullanıcı bazlı sessiz saat için `notification_preferences.quiet_hours {start,end}` eklenir ve `send-push` global saatten önce onu okur.
- 🎯 **Neden:** Arz tutundurmasının en ucuz aracı; altyapının yarısı (şablon, tercih JSONB, edge fn) hazır.
- ✅ **Sonuç:** Sağlayıcı her hafta "görülüyorum" sinyali alır; bildirim saygılı.

**📦 Faz Sonu Çıktısı:** Sağlayıcının takipçisi, vitrini, adil ve derin itibarı, otomatik içeriği ve analitiği var. **Risk:** Bildirim enflasyonu → availability digest + haftalık özet dışında yeni push eklenmez; her yeni type_key tercih matrisine `can_user_disable=true` girer.

---

## 6. FAZ 8C — Derinlik & Para 💰 (tamamı onay kapılı, likidite kanıtı sonrası)

**8C.1 — Açık ihtiyaç ilanı ("ilk kabul eden kazanır")** 🔴
- 🔧 **Ne:** `open_service_listings` (Bölüm 3.2) + `create_open_listing` (kaptan; ücret sabit listelenir) + bölge sağlayıcılarına fan-out bildirim + `claim_open_listing`: **tek atomik** `UPDATE open_service_listings SET status='CLAIMED', claimed_by=auth.uid() WHERE id=$1 AND status='OPEN' RETURNING *` — satır dönmezse "ilan doldu". Claim sonrası sistem normal `create_service_request`'i CLAIMED sağlayıcıyla üretir (mevcut `uq_service_requests_active_per_match` index'i **değişmeden** korunur — yarış listings tablosunda çözülür, talep tablosuna tek kayıt düşer). Geç kalanlara "doldu" bildirimi; kokpit JOBS sekmesi ve SOS kartı bu gerçek akışa bağlanır.
- 🎯 **Neden:** Kaptan her zaman seçmek istemez; "maçıma kaleci lazım" diye bağırmak ikinci doğal yol. Index kısıtı (1.2/6) bu tasarımla ihlal edilmez.
- ✅ **Sonuç:** İki yayın modeli yan yana; çakışma DB'de deterministik çözülür.

**8C.2 — Kademeli komisyon (R3 onayına tabi)** 🟡
- 🔧 **Ne:** Tier cron'u ELITE/MASTER sağlayıcılar için `commission_config`'e `(scope='SERVICE_GK'/'SERVICE_REF', scope_id=provider_id, MODEL_A, rate_pct=8)` satırı yazar/siler; `create_service_request`'teki `calculate_commission` çağrısına `p_scope_id := p_provider_id` geçirilir (motor en-özel kapsamı zaten seçiyor — `20260707000003` fallback zinciri). SERVICE_* kapsamında MODEL_A kuralı korunur. Kokpit kazanç ekranında "Elite avantajı: %8" rozeti.
- 🎯 **Neden:** "Elite olmak para kazandırır" — kademe sistemine iktisadi diş; motor değişikliği neredeyse sıfır.
- ✅ **Sonuç:** Komisyon SSOT bozulmadan performans indirimi.

**8C.3 — Kiralama bağlamı mesajlaşması (R5 onayına tabi)** 🟡
- 🔧 **Ne:** `conversations`'a `kind` ('FRIEND' varsayılan, 'SERVICE') + `service_request_id?`; `get_or_create_service_conversation(p_request_id)` yalnız aktif (PENDING/ACCEPTED/CAPTURED) talebin iki tarafına açılır; `send_message`'ın NOT_FRIENDS kontrolü SERVICE kanalında atlanır, blok kontrolü kalır. Talep öncesi yalnız şablonlu sorular (serbest metin yok). Telefon/IBAN regex maskesi caydırıcı olarak eklenir.
- 🎯 **Neden:** Kiralama öncesi tek soru ("ekipmanın var mı?") bugün platform dışına kaçışın ana bahanesi.
- ✅ **Sonuç:** Sohbet talep bağlamında, denetlenebilir, arkadaşlık şartı pazaryerinde esnetilmiş ama sosyal tarafta korunmuş.

**8C.4 — KVKK sıkılaştırma** 🟡
- 🔧 **Ne:** (a) Retention: `app_config.provider_docs_retention_days` (öneri 90) — onaylanan başvuruların `id_photo_path` dosyası + kolonu cron'la silinir (karar kaydı kalır); (b) `admin_process_account_deletion`'a `provider_applications`/`provider_identities`/`provider-docs`/`provider_follows`/`availability_posts` temizliği eklenir; yorumlar "Ayrılmış kullanıcı" imzasıyla kalır (pazaryeri bütünlüğü), aggregate istatistik kalır; (c) `tc_no_hash` pepper'lı HMAC'e göç (tuzsuz sha256 11 haneli TC uzayında brute-force'lanabilir — mevcut denetim bulgusu); (d) `ServiceProfile` base64 avatar yazımı storage bucket'a taşınır.
- 🎯 **Neden:** Veri minimizasyonu (§9.1/KVKK) + bilinen hash zafiyeti + silme akışının sağlayıcı verisini kapsamaması.
- ✅ **Sonuç:** Kimlik verisi süreli, silme eksiksiz, hash dirençli.

---

## 7. Bildirim Matrisi (özet)

| Olay | type_key | In-app | Push | Digest | Kapatılabilir |
|---|---|---|---|---|---|
| Yeni talep (sağlayıcıya) | `service_request_new` | ✅ | ✅ | — | ❌ (işin kendisi) |
| Kabul/Ret (kaptana) | `service_request_accepted/rejected` | ✅ | ✅ | — | ❌ |
| Talep süresi doldu (+alternatifler) | `service_request_expired` | ✅ | ✅ | — | ❌ |
| Takip edilen sağlayıcı müsaitlik açtı | `provider_availability` | ✅ | takipçiye ✅ | bölge kaptanına günlük | ✅ |
| İlan doldu / açık ilan (8C) | `open_listing_*` | ✅ | ✅ | — | ✅ |
| Puan geldi / yanıt geldi | `service_rating_received/replied` | ✅ | ❌ | haftalık | ✅ |
| Kademe değişti (8B.7) | `tier_changed` | ✅ | ✅ | — | ✅ |
| Haftalık özet | `weekly_summary` (şablon mevcut) | ✅ | ✅ Pazar 20:00 | kendisi digest | ✅ |

Kural: her yeni type_key = `notification_templates` seed + `Notifications.tsx` ICON_MAP/kategori + tercih matrisi kaydı. Kullanıcı bazlı sessiz saat (8B.8) kritik-olmayanları erteler.

---

## 8. RPC & RLS Envanteri Ekleri
`RPC_YETKI_ENVANTERI.md`'ye eklenecek satırlar:

| RPC | Çağıran | Kapı |
|---|---|---|
| `provider_update_own_profile` | Sağlayıcı | `auth.uid()` = satır sahibi; hassas alan reddi |
| `get_provider_public_profile`, `log_provider_profile_view` | Authenticated | herkese; view günlük aggregate |
| `create_availability_post`, `cancel_availability_post` | Sağlayıcı | sahiplik + aktif limit |
| `reply_to_service_rating`, `dispute_service_rating` | Sağlayıcı | rating'in sahibi olduğu doğrulanır |
| `admin_resolve_rating_dispute` | Admin | `require_admin_role(['SUPER_ADMIN','ADMIN','MODERATOR'])` |
| `create_open_listing`, `claim_open_listing`, `cancel_open_listing` (8C) | Kaptan / Sağlayıcı | maç sahipliği / approved sağlayıcı; claim atomik |
| `get_or_create_service_conversation` (8C) | Talep tarafları | aktif talep şartı |
| `refresh_provider_stats`, `expire_service_requests`, `availability_digest`, `weekly_provider_summary` | cron/service_role | `service_role` kilidi (capture_service_request deseni) |

RLS: yeni tabloların tümü RLS-on; yazma RPC-üzerinden deseni (Bölüm 0). Ayrıca canlıda `notifications` INSERT politikasının (`20260531_rls_complete.sql` "System can insert" — herkese açık görünüyor) hâlâ geçerli olup olmadığı **pg_policies'ten teyit edilip** gerekirse kapatılır (haritalama bulgusu).

---

## 9. Test Planı (konvansiyon: `tests/integration/faz*_*.sql` + vitest + Playwright)
- `faz8a_marketplace_repair.sql`: talep→bildirim INSERT'i · dinamik TTL hesabı (uzak/yakın maç) · süpürücü EXPIRED + void · `provider_update_own_profile` yetki matrisi (sağlayıcı ✓, başkası ✗, hassas alan ✗) · `request_payout` TC kapısı regresyonu · karma skor sıralama determinizmi.
- `faz8b_social.sql`: follow/unfollow RLS · availability limit + fan-out sayısı · çaylak koruması (4. maçta NULL, 5.'te görünür) · recency ağırlıklı ortalama · yanıt 1-kez kuralı · UPHELD itirazın ortalamadan düşmesi ama satırın kalması · MATCH_CARD trigger'ı · tier hesabı + grace.
- `faz8c_open_listings.sql`: **eşzamanlı claim yarışı** (iki transaction, tek kazanan) · claim→service_request üretimi · kademeli komisyon override'ı (%8 seçimi + scope fallback).
- Vitest: `HireSheet` akışı, `activeHours` normalize, Provider mapper. Playwright: kirala→kabul→puanla→payout mutlu yolu.
- Her faz sonunda `/verify` ile uçtan uca akış gerçek uygulamada sürülür (Prensipler test izleği: "test fazlara yayılır").

---

## 10. Sıralama, Efor & Bağımlılık

| Sıra | İş | Efor | Bağımlılık |
|---|---|---|---|
| 1 | 8A.2 kayıt onarımı + 8A.3 payout | 🔴 | — (güvenlik: en önce) |
| 2 | 8A.1 HireSheet + 8A.4 bildirim/realtime | 🔴 | 8A.2 |
| 3 | 8A.5 TTL + 8A.6 sıralama/stats + 8A.7 temizlik | 🟡 | 8A.4 |
| 4 | 8B.1 puan derinliği + 8B.2 yanıt/itiraz | 🔴 | 8A |
| 5 | 8B.3 takip + 8B.5 vitrin + 8B.6 maç kartı | 🔴 | 8A.6 (stats) |
| 6 | 8B.4 müsaitlik yayını + 8B.8 analitik/özet | 🟡 | 8B.3 |
| 7 | 8B.7 kademe | 🟡 | **R2 onayı** |
| 8 | 8C.* | 🔴 | 8B + likidite kanıtı + R3/R5 onayları |

Tamamı iyzico sözleşmesini **beklemez** (para akışı SIMULATION'da uçtan uca çalışıyor); go-live bağlamaları `OYNA_GO_LIVE_IYZICO.md`'deki 3 HTTP bağlamasından ibaret kalır.

---

## 11. Açık Kararlar (kurucu onayı bekleyen)
1. **R2 — Sağlayıcı kademe/rozet istisnası** (Bölüm 2): onaylanırsa Prensipler §2/§7'ye "sağlayıcı güven sinyali istisnası" revizyon notu düşülür.
2. **R3 — Kademeli komisyon** (§4.6 revizyonu, 8C.2).
3. **R5 — SERVICE mesaj kanalı** (§8.4 esnetmesi, 8C.3).
4. `service_offers` DROP zamanı (8A.7 — 30 gün öneri) ve kokpit JOBS sekmesinin 8C'ye kadar gizlenmesi.
5. Vitrindeki puan/yorumların yalnız giriş yapmış kullanıcıya görünmesi (mevcut varsayılan) — herkese açık web profili şimdilik **yok**.
