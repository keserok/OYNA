# OYNA — Supabase Klasörü

Bu klasör, canlı Supabase projesinin (`iikvzgyccvgcybzdfwlv` / "OYNA") kod tarafındaki
karşılığıdır. **2026-07-11 SQL denetimiyle** yeniden düzenlenmiştir; denetimin tamamı için
`docs/SQL_DENETIM_2026-07-11.md` dosyasına bakınız.

## Klasör yapısı

| Yol | İçerik |
|---|---|
| `migrations/` | Canlı DB'nin migration geçmişinin birebir aynası. Her dosya `<version>_<ad>.sql` biçimindedir ve `<version>` canlı DB'deki `supabase_migrations.schema_migrations.version` değeriyle **aynıdır**. |
| `functions/` | Edge Functions kaynakları (canlıda deploy edilen 11 fonksiyon + `_shared`). |
| `seeds/` | Demo/örnek veri betikleri (Ordu pilotu demo seed/purge, super admin bootstrap örneği). Migration DEĞİLDİR, elle çalıştırılır. |
| `_archive/` | Tarihsel/artık dosyalar. Canlıya hiç migration olarak işlenmemiş eski dosyalar ve proje başındaki gevşek SQL'ler. **Asla çalıştırmayın.** |
| `config.toml` | Yerel geliştirme (supabase CLI) yapılandırması. |

## Çalışma disiplini (önemli)

Bu projede şema değişiklikleri **MCP `apply_migration`** aracıyla (Claude/AI oturumları
üzerinden) doğrudan canlıya uygulanır; `supabase db push` KULLANILMAZ. Bu nedenle:

1. **Her şema değişikliği bir migration'dır.** SQL Editor'den elle DDL çalıştırmayın —
   geçmişte böyle yapılan değişiklikler kayıt dışı kaldı ve denetimde DB geçmişinden
   geri kazanılmak zorunda kalındı.
2. **Uygulanan her migration repoya da yazılır:** uygulamadan sonra
   `select version from supabase_migrations.schema_migrations where name='...'` ile
   DB'nin verdiği version alınır ve SQL, `migrations/<version>_<ad>.sql` olarak commit edilir.
3. **Version'ı elle ileri tarihli damgalamayın.** (`20260714000000_faz8a_*` örneklerindeki
   gibi gelecek tarihli sürümler sıralamayı bozar; `apply_migration`'ın verdiği gerçek
   zaman damgası esastır.)
4. **`supabase db push` / `db reset` çalıştırmadan önce durun:** dosya adları DB ile eşitlense
   de CLI'nin yerel gölge veritabanı akışı bu projede hiç kullanılmadı; kullanılacaksa önce
   `supabase migration repair` ile senkron doğrulanmalıdır.

## Dosya türleri

- Başında `-- [DB GEÇMİŞİNDEN KURTARILDI ...]` notu olan dosyalar: repoda hiç dosyası
  olmayan ama canlıya uygulanmış migration'lar; SQL'leri DB'deki
  `schema_migrations.statements` kolonundan geri çıkarıldı.
- ~~`20260714000002_role_switch_landing_backfill.sql`~~: Bekleyen bu dosya 2026-07-11'de
  onay-şartlı sürümüyle (`20260711072525_role_switch_verified_backfill_and_guards`)
  değiştirilerek canlıya uygulandı; eski dosya kaldırıldı.
