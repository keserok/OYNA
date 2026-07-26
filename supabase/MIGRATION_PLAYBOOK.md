# 🗃️ OYNA Migration Playbook — Ledger Drift'i Bir Daha Yaşamamak İçin

> Bağlam: 2026-07-21'de production ledger'ı (`supabase_migrations.schema_migrations`)
> ile repo dosyaları arasında büyük bir sürüklenme (drift) tespit edildi ve
> "tam ayna sıfırlaması" ile onarıldı (yedekler: `schema_migrations_backup_*`).
> Kök neden: migration'ların bir kısmının MCP/dashboard'dan uygulanması
> (ledger'a uygulanma-anı versiyonuyla yazılır) + dosyaların sonradan yeniden
> numaralandırılması. Bu kurallar nüksü önler.

## Altın Kurallar

1. **Migration'lar YALNIZ repo dosyası + PR + otomatik deploy ile canlıya gider.**
   `mcp apply_migration` / dashboard SQL editor ile production'a DDL uygulamak
   YASAK. (Acil durumda uygulandıysa: aynı gün birebir SQL repo dosyası olarak
   eklenir VE ledger'daki versiyon repo dosya adıyla eşitlenir.)

2. **Var olan migration dosyası ASLA yeniden adlandırılmaz, numaralandırılmaz,
   düzenlenmez veya silinmez.** Dosya adı = ledger sözleşmesidir. Düzeltme
   gerekiyorsa YENİ bir migration eklenir. (CI'daki `migration-immutability`
   kontrolü bunu otomatik reddeder.)

3. **Yeni dosyanın versiyonu her zaman en son dosyadan BÜYÜK olmalı**
   (pratikte: bugünün tarihi ile `YYYYMMDDHHMMSS_isim.sql`). Geriye tarihli
   dosya eklemek `db push`'ta out-of-order hatası üretir.

   > **Versiyon formatı TAM 14 hanedir** (`YYYYMMDDHHMMSS`). 8/11/15 haneli
   > sürümlerin dolu-remote karşılaştırmasını bozduğu 2026-07-21'de kanıtlandı
   > (Probe A/B deneyi) ve mevcut 5 dosya bir defalık normalize edildi:
   > `20260529→20260529000000`, `20260531000→20260531000000`,
   > `20260531001→20260531000001`, `20260608→20260608000000`,
   > `202607130000155→20260712235959` (bağımlılık gereği sosyal serinin önüne
   > alındı; dosyanın kendi başlığındaki konum şartı korunur). Bu istisna
   > `migration-immutability` bekçisinde sabit beş çift olarak tanımlıdır —
   > yeni rename affı YOKTUR.

4. **Her migration idempotent yazılır** (`IF NOT EXISTS`, `CREATE OR REPLACE`,
   `DROP ... IF EXISTS`, `ON CONFLICT DO NOTHING`) — sıfırdan replay (preview
   branch) ve olası tekrar-uygulama güvenli olsun.

5. **Doğrulama sırası:** PR açılır → Supabase Preview (sıfırdan replay) YEŞİL
   olmadan merge edilmez → merge sonrası `main` branch'inin Supabase durumunun
   yeşil kaldığı kontrol edilir (`MIGRATIONS_FAILED` görülürse hemen incelenir,
   üstüne yeni migration bindirilmez).

## Drift Şüphesinde Hızlı Teşhis (salt-okunur)

```sql
-- Ledger'ın son 10 kaydı repo'nun son 10 dosyasıyla birebir aynı mı?
select version, name from supabase_migrations.schema_migrations
order by version desc limit 10;
```

Repo tarafı: `ls supabase/migrations | tail`. Versiyonlar birebir eşleşmiyorsa
drift başlamıştır — büyümeden bu playbook'taki kurallarla düzeltin
(eksik dosyayı repoya al / ledger versiyonunu dosya adıyla eşitle).

## Onarım Yedekleri

- `supabase_migrations.schema_migrations_backup_20260721` — drift onarımı
  öncesi tam ledger kopyaları. Onarım doğrulandıktan ~30 gün sonra
  düşürülebilir (`drop table`).

## AI Ajanları İçin Zorunlu Kurallar

> Bağlam: 2026-07-25'te bir AI ajanının hazırladığı 4 SQL dosyası
> (`20260813000001..4`, "phase1-5") dashboard SQL Editor'den elle uygulandı;
> ledger'a düşmediği için 2 gün görünmez kaldı ve mevcut sertleştirmeyi
> birkaç noktada geri aldı (anon'a açık yıkıcı fonksiyon, payout stub'ı,
> gevşetilmiş RLS, SUPER_ADMIN'siz role kısıtı). Tamamı
> `20260814000000_revert_phase1_5_regressions.sql` ile geri alındı.
> Bu bölüm nüksü önlemek içindir — OYNA reposunda DB'ye dokunan HER ajan
> aşağıdaki kurallara tabidir.

1. **DDL yalnız migration dosyasıyla.** Dashboard SQL Editor / MCP
   `apply_migration` / `execute_sql` ile production'a şema değişikliği
   uygulamak YASAK (Altın Kural 1). Ürettiğin raporlara/talimatlara
   "Supabase SQL Editor üzerinde çalıştırılmalıdır" gibi adımlar yazmak
   da yasaktır.

2. **`CREATE OR REPLACE` / `DROP` öncesi mevcudu oku.** Var olan bir
   fonksiyonu değiştirmeden önce canlı tanımı (`pg_get_functiondef`) ve
   repodaki son sürümünü oku; kaldırdığın her davranışı (kapı, kontrol,
   dönüş tipi) tek tek gerekçelendir. `DROP FUNCTION`, CHECK kısıtı
   değişikliği ve RLS politikası değişikliği insan onayı olmadan yapılmaz.

3. **SECURITY DEFINER şablonu zorunlu.** Her yeni/değişen fonksiyonda:
   `SET search_path = public, pg_temp` + dosyanın sonunda
   `REVOKE ALL ON FUNCTION ... FROM PUBLIC, anon;` +
   `GRANT EXECUTE ON FUNCTION ... TO authenticated;`
   (bkz. `20260809000001_harden_revoke_anon_definer_fns.sql`).

4. **Para/ledger SSOT'u baypas edilmez.** `wallet_transactions` yazımı,
   bakiye hesabı ve komisyon için mevcut kanonik fonksiyonlar kullanılır
   (`wallet_spend_balance`, `get_wallet_summary`, `_wallet_bucket_balances`,
   `commission_config`). Bunların "paralel kopyasını" yazmak yasaktır;
   davranış değişikliği kanonik fonksiyonun üzerinde yapılır. Komisyon
   oranı hard-code edilmez. Özellik kapatma `app_config` anahtarlarıyla
   yapılır (örn. `cashout_kapisi`), fonksiyon stub'a çevrilerek değil.

5. **"Bağlandı/entegre edildi" iddiası kanıt ister.** Bir RPC'nin
   istemciye bağlandığını raporlamadan önce çağıran `dosya:satır`
   gösterilmek zorundadır. Çağıranı olmayan fonksiyon "tamamlandı"
   sayılmaz.

6. **Versiyon:** TAM 14 hane, son dosyadan büyük. Mevcut seri ileri
   tarihli olduğundan sıradaki dosya en az `20260815000000` olmalıdır
   (bugünün tarihi DEĞİL — Altın Kural 3'ün monotonluk şartı önceliklidir).

## Bekçi Denetimi (salt-okunur, her ajan çalışması sonrası)

Aşağıdaki sorgu SQL Editor'e kayıtlı snippet olarak eklenmiştir
(`00 - Bekçi Denetimi`). **9 satırın hepsi ✅ dönmelidir**; herhangi bir ❌
= phase1-5 regresyonlarından biri geri gelmiş demektir.

```sql
WITH kontroller AS (
  SELECT 1 AS sira, 'Revert migration kaydı ledger''da' AS kontrol,
    EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations
            WHERE name LIKE '%revert_phase1_5_regressions%') AS tamam
  UNION ALL
  SELECT 2, '5 tehlikeli/bozuk fonksiyon yok',
    NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname IN ('cleanup_expired_slot_locks',
        'player_create_booking_with_lock','admin_adjust_wallet',
        'wallet_pay_with_balance','admin_settle_owner_payout'))
  UNION ALL
  SELECT 3, 'Para çekme: stub değil, dönüş tipi payout_requests',
    EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='request_payout_with_method'
        AND p.prorettype::regtype::text = 'payout_requests'
        AND p.prosrc NOT ILIKE '%PAYOUT_DISABLED%')
  UNION ALL
  SELECT 4, 'owner_earnings_summary: SSOT sürümü',
    EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='owner_earnings_summary'
        AND p.prosrc ILIKE '%get_wallet_summary%' AND p.prosrc ILIKE '%month_other_net%')
  UNION ALL
  SELECT 5, 'Gevşetilmiş 3 RLS politikası yok',
    NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
      AND policyname IN ('No direct inserts by non-admins',
        'Kullanıcılar kendi işlemlerini görebilir',
        'Kullanıcılar kendi ödeme niyetlerini görebilir'))
  UNION ALL
  SELECT 6, 'wallet_no_direct_insert (false) yerinde',
    EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
      AND tablename='wallet_transactions'
      AND policyname='wallet_no_direct_insert' AND with_check='false')
  UNION ALL
  SELECT 7, 'profiles_role_check: SUPER_ADMIN + NULL var, USER yok',
    EXISTS (SELECT 1 FROM pg_constraint WHERE conname='profiles_role_check'
      AND pg_get_constraintdef(oid) LIKE '%SUPER_ADMIN%'
      AND pg_get_constraintdef(oid) LIKE '%IS NULL%'
      AND pg_get_constraintdef(oid) NOT LIKE '%''USER''%')
  UNION ALL
  SELECT 8, 'payment_intents_status_check: EXPIRED yok',
    EXISTS (SELECT 1 FROM pg_constraint WHERE conname='payment_intents_status_check'
      AND pg_get_constraintdef(oid) NOT LIKE '%EXPIRED%')
  UNION ALL
  SELECT 9, 'Kritik RPC''lerde anon EXECUTE yok',
    NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public'
        AND p.proname IN ('admin_ban_user','admin_verify_user',
          'request_payout_with_method','owner_earnings_summary')
        AND has_function_privilege('anon', p.oid, 'EXECUTE'))
)
SELECT sira, kontrol, CASE WHEN tamam THEN '✅ TAMAM' ELSE '❌ SORUN' END AS durum
FROM kontroller ORDER BY sira;
```

## Olay Kaydı

- **2026-07-21** — ledger drift'i; tam ayna sıfırlamasıyla onarıldı (üstteki bağlam).
- **2026-07-25/26** — "phase1-5" SQL'leri SQL Editor'den elle uygulandı, ledger'a
  düşmedi; `20260814000000_revert_phase1_5_regressions.sql` ile geri alındı ve
  ledger versiyonu Altın Kural 1'in acil-durum maddesi gereği dosya adıyla
  eşitlendi.
