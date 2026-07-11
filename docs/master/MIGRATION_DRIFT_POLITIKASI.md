# Migration Drift Politikası (İleri-Yönlü Düzen)

> **Amaç:** Repo'daki `supabase/migrations/` dosyaları ile canlı veritabanının
> `supabase_migrations.schema_migrations` geçmişi arasındaki kaymanın (drift)
> büyümesini durdurmak ve zamanla kapatmak.

## Mevcut durum (2026-07-10 tespiti)

1. **Repo dosya adları "dalga numarası"dır, gerçek tarih değildir.** Örn.
   `20260716*` dosyaları 2026-07-10 itibarıyla henüz gelecek tarihlidir ve
   canlı geçmişte YOKTUR (canlıdaki en yüksek dosya-stili sürüm: `20260714000001`).
2. **Canlı geçmişte repo'da olmayan sürümler var.** MCP `apply_migration` ile
   uygulanan migration'lar gerçek zaman damgasıyla kaydedilir (örn. `202607102230xx`).
3. **Aynı sürüm numaralı iki dosya vardı:** `20260716000001_escrow_match_lifecycle.sql`
   ve `20260716000001_provider_match_applications.sql`. Sürüm çakışması
   `schema_migrations` PK'sında (version) çakışmaya ve `db push`'ta belirsiz
   sıralamaya yol açar. **Çözüldü:** ikincisi `20260716000004`'e taşındı
   (bağımlılık taraması yapıldı; `20260716000002/3` bu dosyaya referans vermiyor,
   sıra değişikliği güvenli).

## Kurallar (bundan sonra)

1. **Tek uygulama yolu:** Şema değişikliği YALNIZ migration olarak uygulanır
   (MCP `apply_migration` veya `supabase db push`). Elle/SQL editöründen
   uygulanan ama geçmişe kaydedilmeyen değişiklik = drift; yasak.
2. **Repo = canlı geçmişin aynası:** `apply_migration` ile uygulanan her
   migration, canlının atadığı `<version>_<name>.sql` adıyla AYNI commit'te
   repoya eklenir. (Bu oturumda eklenen üç örnek: `20260710223038_admin_pitch_
   verification_request_notify`, `20260710223053_player_ratings_select_scoped`,
   `20260710223110_pgcrypto_guard_and_sla_seed`.)
3. **Sürüm tekilliği:** İki dosya asla aynı sürüm önekini taşıyamaz.
4. **Kayıtlı geçmişe dokunma:** Canlı geçmişte kaydı olan bir dosya asla
   yeniden numaralandırılmaz/silinmez. Henüz kaydedilmemiş dosyalar (bugün için
   `20260715*`–`20260717*`) gerekirse yeniden adlandırılabilir.
5. **Out-of-band içerik mutabakatı:** İçeriği canlıda mevcut olup geçmişte
   kaydı olmayan dosyalar tespit edilirse `supabase migration repair
   --status applied <version>` ile geçmişe işlenir; içerik zaten idempotent
   olduğundan yeniden uygulanmaları da güvenlidir (bu depo standardı korunmalı).
6. **Escrow/iyzico istisnası:** `20260716000001_escrow_match_lifecycle.sql`
   ödeme go-live çalışmasının parçasıdır; o akışın sahibi tarafından
   uygulanana kadar bu dosyaya dokunulmaz.
