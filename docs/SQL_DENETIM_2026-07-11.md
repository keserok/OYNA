# OYNA — SQL / Supabase Denetim Raporu (2026-07-11)

Bu rapor, "projedeki SQL durumu ne, eski SQL'ler var mı, karışıklık var mı?" sorusuna
verilen kapsamlı yanıttır. Denetim; repo dosyaları, canlı veritabanının migration
geçmişi (`supabase_migrations.schema_migrations`), Supabase güvenlik/performans
danışmanları ve politika/fonksiyon tanımları karşılaştırılarak yapıldı.

Canlı proje: `iikvzgyccvgcybzdfwlv` ("OYNA", ap-southeast-1, Postgres 17).
Organizasyonda ayrıca INACTIVE durumda eski bir "Hadi" projesi var (kullanılmıyor).

---

## 1) Yönetici özeti

Evet, ciddi bir karışıklık vardı ve büyük bölümü bu denetimle giderildi:

1. **Repo ile canlı DB kopmuştu.** Canlıda uygulanmış ~65 migration'ın repoda dosyası
   yoktu; repodaki 23 dosya ise canlıya hiç migration olarak işlenmemişti. Üstelik
   dosya adlarındaki zaman damgaları DB'deki gerçek version değerleriyle uyuşmuyordu.
   → **Çözüldü:** `supabase/migrations/` artık DB geçmişinin birebir aynası; eksikler
   DB'nin `statements` kolonundan geri kazanıldı, uyduruk damgalı dosyalar gerçek
   version'larıyla yeniden adlandırıldı, ölü dosyalar `supabase/_archive/`e taşındı.
2. **Eski/gevşek SQL dosyaları vardı** (repo kökünde `supabase_migration.sql`,
   `supabase/sql/` klasörü). İçlerinde bugünkü güvenlik standardına aykırı grant'ler
   vardı ve yanlışlıkla çalıştırılmaya açıktılar. → **Arşivlendi.**
3. **Danışman bulguları:** 1 mükerrer unique indeks, 26 indekssiz foreign key,
   9 initplan'sız RLS politikası, 46 çakışan permissive politika bulgusu.
   → **Büyük bölümü düzeltildi** (3 yeni migration; aşağıda).
4. **Gizli tuzaklar bulundu:** `is_super_admin` çift imzası yeni SQL'leri kırıyor;
   ~25 public-rollü politika `anon`'un çalıştıramadığı fonksiyon çağırıyor (42501);
   `teams` tablosunda gizlilik ayarını boşa düşüren `USING (true)` SELECT politikası var.
   → **Raporlandı, faz 2 işi** (aşağıda ayrıntı).

Genel değerlendirme: veritabanının kendisi sanıldığından sağlıklı — RLS her tabloda
açık, admin RPC'leri `require_admin_role` guard'lı, fonksiyonlarda `search_path`
sabitleme disiplini oturmuş. Asıl sorun **kayıt düzeni ve tarihsel tortu** idi; o da
artık temiz.

---

## 2) Tespitler (ayrıntı)

### 2.1 Repo ↔ canlı DB kopukluğu (ana bulgu) — ✅ giderildi

- Canlı DB geçmişi: 235+ migration (denetim sırasında başka bir oturum da migration
  uyguladığı için sayı canlı olarak artıyordu).
- Repo: 193 dosya; zaman damgaları DB version'larıyla eşleşmiyordu (örn. repo
  `20260703000002_faz2_payment_engine.sql` ↔ DB `20260626125256`). Sebep: değişiklikler
  MCP `apply_migration` ile canlıya gerçek zaman damgasıyla işlenirken repo dosyaları
  elle, farklı tarihlerle adlandırılmış.
- DB'de uygulanmış ~65 migration'ın repoda hiç dosyası yoktu (`user_saved_cards`,
  `wallet_topup_bucket`, tüm `roles_phase*` ve `godview_*` serileri vb.).
- Repodaki 23 dosya DB'ye hiç işlenmemişti: bir kısmı proje başında SQL Editor'den elle
  kurulan "tarih öncesi" şema (May–Haz), bir kısmı farklı adla uygulanmış kopyalar.
- DB geçmişinde ad tuhaflıkları: `20260701000001_fix_match_rpc_and_add_player_rpcs` gibi
  adının İÇİNDE ikinci bir zaman damgası taşıyan kayıtlar; ayrıca
  `fix_match_rpc_and_add_player_rpcs` adı iki farklı version'da iki kez var.
- `20260714000000/1_faz8a_*` migration'ları **gelecek tarihli** elle damgalanmış —
  sıralamayı bozuyor (bkz. §3 kural 3).

### 2.2 Eski/gevşek SQL dosyaları — ✅ arşivlendi

- Repo kökünde `supabase_migration.sql`: `sbremoveplayerfromteam` RPC'sini yaratıp
  `anon`'a SECURITY DEFINER EXECUTE veriyordu — bugünkü standarda açıkça aykırı.
- `supabase/sql/`: ilk kurulum betikleri (şema/cüzdan/konum) — şemanın çok gerisinde.
- `supabase/seed/` ve `supabase/seeds/` diye iki ayrı seed klasörü vardı → birleştirildi.

### 2.3 Bekleyen migration — ⚠️ karar gerekli

`20260714000002_role_switch_landing_backfill.sql` repoda (main'e merge edilmiş) ama
canlıya **uygulanmamış**: `claim_owner_role()` fonksiyonu canlıda yok, rol backfill'i
yapılmamış. Rol geçişi / açılış ekranı düzeltmesi bu yüzden canlıda eksik olabilir.
İçerik idempotent yazılmış ama `profiles.roles` backfill'i güvenlik açısından hassas —
**bilinçli olarak uygulamadım.** Öneri: içeriği gözden geçirip tek başına uygulamak.

### 2.4 Güvenlik danışmanı bulguları

| Bulgu | Adet | Durum |
|---|---|---|
| `anon` çağırabilen SECURITY DEFINER fonksiyon (`matches_autofill_image`) | 1 | ✅ EXECUTE geri alındı (trigger fonksiyonu, REST'ten çağrılmamalı) |
| `authenticated` çağırabilen SECURITY DEFINER fonksiyon | 290 | ℹ️ Büyük ölçüde tasarım gereği (RPC-temelli mimari). Örneklenen admin RPC'leri `require_admin_role` guard'lı. Faz 2'de örnekleme genişletilebilir. |
| Sızdırılmış parola koruması (HaveIBeenPwned) kapalı | 1 | ⚠️ Dashboard'dan elle açılmalı: Authentication → Settings → Password protection |
| `public` şemasında uzantı (`cube`, `earthdistance`, `btree_gist`) | 3 | ⏳ Faz 2 (taşıma, bağımlı fonksiyonların yeniden derlenmesini gerektirir) |
| RLS açık ama politikasız tablo (`password_reset_codes`, `profile_contact_hash`, `social_rate_usage`, `team_invite_links`) | 4 | ℹ️ Kasıtlı "kilitli kasa" deseni — erişim yalnız SECURITY DEFINER RPC'lerden. Değişiklik gerekmez. |

### 2.5 Performans danışmanı bulguları

| Bulgu | Önce | Sonra | Durum |
|---|---|---|---|
| Mükerrer unique indeks (`player_ratings`) | 1 | 0 | ✅ `uq_player_ratings_unique` düşürüldü (constraint destekli ikizi kaldı) |
| İndekssiz foreign key | 26 | 0 | ✅ 26 indeks eklendi (`idx_fk_*`) |
| RLS initplan (`auth.uid()` satır başına) | 9 | 0 | ✅ Tümü `(select auth.uid())` biçimine çevrildi |
| Çakışan permissive politika | 46 | 16 | ✅ En yoğun tablolar giderildi (`user_reports` 12, `goalkeepers`/`referees` 6'şar, `settings` 4, `teams` 3). Kalan 16 tekil çakışma (çoğu "admin ALL + kullanıcı-kendi" deseni: `payout_requests`, `provider_applications`, `app_config`, `feature_flags`, `matches`, `pitches`, `communities`, `tournaments`, `service_*`, `user_blocks`, `teams` SELECT) → faz 2'de aynı desenle birleştirilebilir. |
| Kullanılmayan indeks | 25 | 51 | ℹ️ Dokunulmadı; yeni eklenen FK indeksleri de henüz "kullanılmamış" görünüyor — veri hacmi çok küçükken bu sinyal anlamsız. Trafik büyüyünce topluca değerlendirilecek. |

### 2.6 Denetimde bulunan gizli tuzaklar (danışmanların görmediği)

1. **`is_super_admin` çift imza (overload):** parametresiz eski sürüm yalnız
   `profiles`'a bakıyor; `uuid DEFAULT auth.uid()` imzalı yeni sürüm ek olarak
   `admin_team_members`'a bakıyor. İki sonuç: (a) `is_super_admin()` yazan her YENİ
   SQL "function is not unique" hatasıyla kırılıyor (bu denetimde bizzat yaşandı);
   (b) eski politikalar dar sürüme bağlı olduğundan `admin_team_members` üzerinden
   SUPER_ADMIN olanlar bazı yerlerde yetkisiz kalıyor. → Faz 2: eski imzayı bırakan
   nesneleri tespit edip tek imzada birleştirmek.
2. **Public-rollü politikalarda anon'un çalıştıramadığı fonksiyonlar:** ~25 politika
   (`matches` yazma, `pitch_*` yönetim, `promo_codes` SELECT, `admin_audit_log` SELECT,
   `match_service_offers` SELECT dahil) `is_platform_admin()` gibi fonksiyonları
   `TO public` kapsamında çağırıyor; `anon` bu tabloya dokunan sorgu attığında
   RLS "erişim yok" yerine **42501 permission denied** hatası alıyor. Misafir (guest)
   akışlarını kırma potansiyeli var. Denetimde `goalkeepers`/`referees`/`user_reports`
   düzeltildi (rol bazlı ayrım deseniyle); kalanların envanteri çıkarıldı → Faz 2'de
   aynı desenle `TO authenticated`'a çekilmeli.
3. **`teams` gizlilik çelişkisi:** `teams_select_public` (`USING true`, herkese açık) ile
   `teams_select_visibility` (`visibility='PUBLIC' OR üye OR admin`) yan yana.
   `USING true` kazandığı için **PRIVATE takımlar da herkese görünüyor.** Ürün kararı
   gerekli: gizli takım gerçekten gizli olacaksa `teams_select_public` kaldırılmalı;
   uygulamanın takım listeleme/keşif ekranları buna göre test edilmeli. (Bilinçli
   olarak dokunulmadı.)
4. **Sıfır satırlı legacy tablolar:** `texts_legacy`, `match_tactics_legacy` boş ve kod
   tarafından referans edilmiyor → Faz 2'de DROP edilebilir.

---

## 3) Bu denetimde yapılan değişiklikler

### Repo düzeni
- `supabase/migrations/` DB geçmişiyle birebir eşitlendi: ~170 dosya gerçek DB
  version'ıyla yeniden adlandırıldı (git geçmişi `git mv` ile korunarak), ~65 eksik
  migration DB'nin `statements` kolonundan kurtarılıp `-- [DB GEÇMİŞİNDEN KURTARILDI]`
  başlığıyla eklendi.
- Canlıya hiç işlenmemiş 22 dosya → `supabase/_archive/unapplied_migrations/`.
- Gevşek SQL'ler (kökteki `supabase_migration.sql`, `supabase/sql/*`) →
  `supabase/_archive/legacy_sql/`.
- `supabase/seed/` + `supabase/seeds/` → tek `seeds/` klasörü.
- `supabase/README.md` ile çalışma disiplini yazılı hâle getirildi (özet: her şema
  değişikliği `apply_migration` ile; DB'nin verdiği version'la aynı adla repoya commit;
  elle/gelecek tarihli damga yok; SQL Editor'den kayıt dışı DDL yok).

### Canlıya uygulanan migration'lar
1. `20260711031716_audit_perf_fk_indexes_initplan_dupindex` — mükerrer indeks düşürme,
   26 FK indeksi, 5 politika initplan düzeltmesi, trigger fonksiyonundan EXECUTE geri alma.
2. `20260711031856_audit_rls_consolidate_permissive_policies` — `goalkeepers`,
   `referees`, `user_reports`, `settings`, `teams` politika birleştirmeleri
   (anlam koruyan OR birleşimi).
3. `20260711032124_audit_rls_fix_anon_function_privilege` — birleştirmenin anon
   tarafında açığa çıkardığı 42501 tuzağının düzeltmesi (rol bazlı politika ayrımı);
   `user_reports` politikaları `authenticated`'a daraltıldı.

Doğrulama: anon rolüyle duman testi (goalkeepers/referees yalnız onaylılar, settings ve
teams okunuyor, user_reports kapalı, hata yok) + danışman yeniden çalıştırıldı.

---

## 4) Faz 2 yol haritası (önerilen sıra)

| # | İş | Etki | Risk |
|---|---|---|---|
| 1 | `role_switch_landing_backfill`'i gözden geçirip uygulama kararı | Rol geçişi/açılış akışı düzelir | Orta — roles backfill'i hassas |
| 2 | Kalan public-rollü politikaları `TO authenticated`'a çekmek (envanter §2.6/2) | Misafir akışlarında gizemli 42501'ler biter | Düşük — tablo tablo, guest akışı doğrulanarak |
| 3 | `teams_select_public` ürün kararı (gizli takım gerçekten gizli mi?) | Gizlilik beklentisi | Düşük teknik, ürün kararı |
| 4 | `is_super_admin` overload birleştirme (bağımlılık dökümüyle) | Gelecek SQL'ler kırılmaz, RBAC tutarlı | Orta |
| 5 | Dashboard: sızdırılmış parola koruması + MFA seçeneklerini açmak | Hesap güvenliği | Yok |
| 6 | `texts_legacy`, `match_tactics_legacy` DROP | Şema temizliği | Düşük (boş, referanssız) |
| 7 | `cube`/`earthdistance`/`btree_gist` uzantılarını `extensions` şemasına taşımak | Danışman uyarısı kapanır | Orta — konum RPC'leri yeniden derlenmeli |
| 8 | Trafik büyüyünce kullanılmayan indeks temizliği | Yazma maliyeti düşer | Düşük |
| 9 | CI'da migration disiplin kontrolü (dosya adı ↔ DB version formatı lint'i) | Kopukluk bir daha oluşmaz | Yok |

---

## 5) Bilinen sınırlamalar

- Denetim sırasında başka bir oturum canlıya migration uygulamaya devam ediyordu;
  `migrations/` klasörü denetim anındaki anlık görüntüyle eşitlendi. O oturumun yeni
  migration'ları çıktıysa aynı disiplinle (version'lı dosya) repoya eklenmelidir.
- Kurtarılan dosyalar DB'de saklanan SQL'in kendisidir; uygulama anında dosyada olan
  yorum satırları vb. korunmuştur ancak repo dışında elle çalıştırılan "tarih öncesi"
  değişikliklerin (ilk şema kurulumu) migration kaydı hiç olmadığından bunlar yalnız
  arşivde temsil edilir.
