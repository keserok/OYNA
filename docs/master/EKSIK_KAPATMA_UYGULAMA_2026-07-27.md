# Eksik Kapatma Uygulaması — 2026-07-27

> Bu belge, altı bağımsız kod doğrulama ajanının bulgularıyla revize edilen
> eksik-kapatma planının **uygulanmış** halidir. Her madde kodda doğrulanarak
> (canlı DB gövdeleri `pg_get_functiondef` ile teyit edilerek) yazılmıştır.
>
> **Bağlayıcı kurallar:** mevcut migration dosyaları değiştirilemez (CI
> `migration-immutability`) → tüm düzeltmeler yeni `20260816*` dosyalarıdır;
> her `CREATE OR REPLACE` canlı gövdeden birebir kopyalanıp yalnız işaretli
> bloklar eklenmiştir.

## Doğrulamanın planı değiştirdiği yerler

| İddia | Doğrulama sonucu |
|---|---|
| "Admin MFA yok" | ❌ Yanlış — MFA uçtan uca yazılmış, `admin_mfa_required` anahtarı canlıda hiç yoktu (varsayılan false). Gerçek eksik: cihaz-kaybı kurtarma. |
| "Sağlayıcı bildirim tercihleri kaydedilmiyor" | ❌ Yanlış — kaydediliyor ama **yanlış depoya** (`goalkeepers.settings`); gönderici `profiles.notification_preferences` okuyor. |
| "Kick çok adımlı yazma" | ⚠️ Yanlış teşhis — tek çağrı, ama canlı `player_update_match` slot anahtarlarını yok saydığı için kick **sessiz no-op**'tu; ayrıca iade yok, kaptan kapısı yalnız UI'da. |
| "Bilet ekranına hiç erişilemiyor" | ⚠️ Kısmen — tek navigate vardı ama `switch`'in **ulaşılamaz** `default` dalındaydı. |
| "gameRules.ts hiç import edilmiyor" | ⚠️ Kısmen — birim testi import ediyordu; üretimden sıfır. |
| "Süresi dolmuş talep kabul ediliyor" | ⚠️ Kapsam kaydı — talepler için 5 dk'lık süpürücü zaten vardı; **gerçek kalıcı delik** `match_service_offers` (hiç süpürücü yok). |
| "Bakiye düzeltme RPC'si yok" | ❌ Yanlış — `admin_adjust_wallet_balance` FINANCE + 50k limit + audit ile canlıda hazır. |

## Doğrulamanın bulduğu, planda olmayan kritik sorunlar

1. `player_ratings.skill_score` CHECK'i 1-5, RPC/UI 1-10 gönderiyor → **3+ yıldızlı her değerlendirme patlardı**; FK de yanlış tabloya bakıyordu.
2. Kaptan oyuncu çıkarınca **iade yapılmıyordu** ve yetki "herhangi bir katılımcı"ydı.
3. Admin "Ödemeyi Serbest Bırak" iki-taraflı kapıya takılıp **sessizce hiçbir şey yapmıyor**, sahte başarı gösteriyordu.
4. Kartla fonlanan taleplerde cüzdan iadesi yazılmıyor (sağlayıcı iptalinde kurumsal davranışla hizalandı, belgelendi).
5. Stok Unsplash fotoğrafları **DB'ye gerçek avatar olarak** yazılıyordu (kimlik yanıltması + telif).
6. Saha sahibi onboarding'inde **canlı yanlış komisyon vaadi** (%10 → gerçek %15 / Model B %5+markup).
7. Kaptan onay butonu açılırken taraf koruması gerekiyordu (deplasman kaptanı ev sahibinin kalecisini onaylayabilirdi).

## Faz faz uygulananlar

### Faz 0 — Ön adımlar
- `20260816000012` — `skill_score` CHECK 1→10, FK `individual_matches`→`matches`, rating trigger'ı 10'luk skalaya uyarlandı. *(Önce …000 numarasıyla yazıldı; paralel bir çalışma aynı numarayı alıp canlıya uygulayınca sessiz atlanma riskine karşı boş numaraya taşındı.)*
- Dürüstlük hotfix'leri: sahte WhatsApp hattı kaldırıldı · "KAPTANA BİLDİRİLDİ" yalanı düzeltildi · onboarding komisyon oranı gerçeğe çekildi.
- `test:integration` script'i + CI işi (secret yoksa yeşil atlar).

### Faz 1 — Para güvenliği
| Migration | İçerik |
|---|---|
| `20260816000001` | `_release_service_payout`'a `matchCount` kancası + `GREATEST`'li backfill |
| `20260816000002` | `admin_release_service_payout__core`: sessiz no-op yerine audit'li override + `RELEASE_FAILED` |
| `20260816000003` | `auto_release_service_payouts()` — maç bitişi+3s+48s, **yalnız sağlayıcı onaylıysa** ve itiraz yoksa; kill-switch + saatlik pg_cron |
| `20260816000004` | `_tr_day_index` — kısa/tam Türkçe gün adları; bilinmeyen token defansif dahil |
| `20260816000005` | 3 kabul yoluna süre/çakışma kapıları + `expire_service_requests`'e teklif döngüsü |
| `20260816000006` | `admin_resolve_noshow_dispute` — iki dal (ceza kesinleşir / ledger tabanlı tam geri alma) |
| `20260816000007` | `provider_cancel_assignment` + `preview_provider_cancel` (>24s cezasız, geç iptalde %50 best-effort, maç başladıysa yasak) |
| `20260816000008` | `player_kick_slot` (kaptan kapısı + idempotent iade + yedek bildirimi) ve canlı `player_update_match` gövdesinin repo aynası |

Arayüz: kaptan onay kartı her talepte + taraf koruması + "Onayladın ✓" durumu · sağlayıcıya "İşi Bırak" (sunucu önizlemeli onay modalı) · admin Hizmet İtirazları kuyruğu statü tabanlı filtre + iki karar düğmesi.
Test: `tests/integration/f1_para_guvenligi.sql` (26 assert).

### Faz 2 — Değerlendirme döngüsü
- `20260816000009` — `match_completed_evaluate` şablonu · `finalize_match`'e katılımcı bildirimi (**son-7-gün filtresiyle**, cron toplu push atmasın) · `match_motm` görünümü + `get_player_motm_count`.
- Maçlarım'da "Maçı Değerlendir" kartı — **PostMatchEval'a repo tarihindeki ilk gerçek giriş yolu**; `oyna://match/<id>/eval` deep-link.
- MVP prensibe uygun **türetildi** (ayrı oy yok); profildeki hazır MVP hücresi bağlandı.
- Kaleci ölü 5 yıldız formu kaldırıldı; maç sonu modalı yalnız hakem skor girişi.

### Faz 3 — Yanıltıcı arayüz
- `20260816000010` — `service_requests.live_status` + `provider_set_live_status` (kaptana **gerçek** bildirim) · `notify_booking_events`'e tercih kapısı (`owner_new_booking` kritik → koşulsuz) · ölü `settings` anahtarlarının ve stok avatarların temizliği.
- Ölü fiyat görünümü + "%0 komisyon" bandı silindi · "Karşı Teklif" alanı salt-okunur sabit ücrete çevrildi · destek/harita/rozet bağlandı · "Mesafe: undefined", uydurma tesis özellikleri ve sahte diziliş kaldırıldı · `hidePhone` silindi · sağlayıcı bildirim tercihleri **çalışan** ekrana taşındı.

### Faz 4 — Oyuncu kopuklukları
- Rezervasyon kartına **Bilet** düğmesi; ulaşılamaz `default` dalı temizlendi; "turnikede okutulur" iddiası (README dahil) gerçeğe indirildi.
- Erişilemez `MatchCalendar` + `TeamBuilder` kaldırıldı (AppView birliği, route'lar, tek tüketicisi kalan servis dahil).
- `utils/gameRules.ts` silindi; 90dk/%70 kuralının tek kaynağı edge function olarak işaretlendi; sunucuda karşılığı olmayan iptal-cezası kuralı **prensipler belgesine** taşındı.

### Faz 5 — Admin & saha sahibi
- Payout **Geri Al** düğmesi (sebep zorunlu, audit) · payout + intent CSV'leri (**IBAN maskeli**, PII regresyon testi).
- Mükerrer "Tesis Onayları" menüsü tekilleştirildi — **önce rozet taşındı**, sonra sidebar'dan düşürüldü; route korunarak.
- Saha sahibi Destek Merkezi hazır `support_tickets` altyapısına bağlandı (OWNER kanalı).
- `20260816000011` — MFA kurtarma kodları (bcrypt hash, tek sefer gösterim), `admin_reset_mfa` (SUPER_ADMIN, self-reset yasak); **bayrak bilinçli olarak kapalı**.
- Go-Live paneline cashout hazırlık kartı (durum, kesinti, bekleyen talep, kimlik uyuşmazlığı + açılış ön koşulları).

## Merge öncesi doğrulama (2026-07-27)

- **Sürüm çakışması giderildi:** `20260816000000` numarası canlıda
  `reconcile_profiles_roles_bypass` tarafından kullanılıyordu; bu dosya
  `20260816000012`'ye taşındı. Çakışma kalsaydı `db push` CHECK düzeltmesini
  sessizce atlayacaktı.
- **12 migration canlıda kuru teste tabi tutuldu:** her biri `BEGIN … ROLLBACK`
  içinde gerçek şemaya uygulandı, altı parti de hatasız geçti ve sonrasında
  veritabanında hiçbir kalıntı kalmadığı tek tek doğrulandı (live_status,
  match_motm, mfa tablosu, CHECK, app_config anahtarları — hepsi eski hâlinde).
- **Ön koşullar teyit edildi:** app_config kolonları, notification_templates
  benzersizlik kısıtı, `require_admin_write`, sağlayıcı koruma trigger'ının
  `matchCount`'u engellemediği ve `player_ratings`'in boş olduğu.

## Açık kalan / karar bekleyen
- **`admin_mfa_required` bayrağı** — açmadan önce en az bir SUPER_ADMIN enroll olup kurtarma kodlarını indirmeli. Ayrıca `isAdminMfaRequired()` bugün *fail-open* (config okunamazsa MFA atlanır); bayrak açılırken bu davranış gözden geçirilmeli.
- **`wallet_cashout_enabled`** — kod hazır, otomatik havale yok (iyzico payout hiç yazılmadı). Açılış iyzico KYC + manuel havale SOP'una bağlı.
- **`matches.starts_at` trigger'ı** — `date`/`time` değişince güncellenmiyor; tarihsiz/eski maçlarda gün-saat ve çakışma kontrolleri sessizce atlanıyor (ayrı iş).
- **Çakışma penceresi ±2 saat** — arka arkaya maçlarda yanlış-pozitif verebilir; ürün onayına açık.
- **SQL entegrasyon testleri** CI'da `SUPABASE_TEST_DB_URL` secret'ı eklenene kadar atlanır.
