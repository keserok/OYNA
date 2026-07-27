# Migration Defteri Mutabakatı — 2026-07-27

Bu belge, üretim veritabanının migration defteri (`supabase_migrations.schema_migrations`)
ile depo (`supabase/migrations/`) arasındaki uyumsuzluğun nasıl kapatıldığını ve
kapatılamayan sürüklenmelerin ne olduğunu kayda geçirir.

## Sorun

Depoda 340 migration dosyası vardı; bunlardan **11'i defterde kayıtlı değildi**:

```
20260818000000_kort_araligi_takim_basi_model
20260826000001_tek_lobi_p1_guvenlik_yapi
20260826000002_tek_lobi_p2_slot_yasam_dongusu
20260826000003_tek_lobi_p5_admin_ve_legacy_sokum
20260826000004_tek_lobi_p6_kanonik_dizilis
20260827000001_mac_kur_atomik_yayin
20260827000002_mac_kur_inceleme_duzeltmeleri
20260827000003_mac_kur_kadro_ve_saglayici
20260827000004_kick_slot_birlestirme
20260828000001_kart_islem_bedeli
20260828000002_kart_bedeli_rapor_ayrimi
```

Sebep: bu değişiklikler üretime `execute_sql` ile elle uygulanmış (defterde
`20260727124350`…`20260727200123` gibi farklı sürüm numaralarıyla kayıtlı),
depoya ise `20260818…20260828` adlarıyla girmiş. Aynı SQL iki farklı kimlikle
duruyordu.

### Neden tehlikeliydi

`supabase db push` (ve Supabase–GitHub entegrasyonu) defterde olmayan dosyaları
"hiç uygulanmamış" sayıp yeniden çalıştırır. Bu 11 dosya yeniden çalıştırılsaydı
**`20260826000001` kesin hata verip duracaktı**:

```sql
-- 27. satır
INSERT INTO match_private_codes (match_id, code)
SELECT id, private_code FROM matches WHERE private_code IS NOT NULL;
-- 124. satır
ALTER TABLE matches DROP COLUMN IF EXISTS private_code;
```

Kolon üretimde zaten düşürülmüş durumda → ikinci çalıştırmada 27. satır
`column "private_code" does not exist` verir. Yani `db push` bugün patlıyordu.

## Uygulanan çözüm

11 dosyanın **her biri için** ürettiği nesnelerin üretimde var olduğu tek tek
doğrulandı (11/11 `true`), ardından defter kaydı geriye dönük eklendi.
`created_by = 'claude-ledger-reconcile-2026-07-27'`.

| Dosya | Üretimde doğrulanan kanıt |
|---|---|
| kort_araligi_takim_basi_model | `courts.size_label`, `trg_matches_format_range_guard`, kapasite ≤ 11 |
| tek_lobi_p1_guvenlik_yapi | `match_private_codes` tablosu, `matches.private_code` düşmüş, `match_participants.is_buyer`+`bought_slots` |
| tek_lobi_p2_slot_yasam_dongusu | `player_buy_slots_v2`, `_match_refund_partial`, `_notify_first_reserve` |
| tek_lobi_p5_admin_ve_legacy_sokum | `matches.is_platform`, eski 3 fonksiyon silinmiş, `admin_create_match__core` |
| tek_lobi_p6_kanonik_dizilis | `_default_formation_slots` |
| mac_kur_atomik_yayin | `create_match_atomic`, `_resolve_court_quote` |
| mac_kur_inceleme_duzeltmeleri | `_format_allowed_for_pitch` |
| mac_kur_kadro_ve_saglayici | `invite_friends_to_match` → `jsonb`, `list_bookable_providers` |
| kick_slot_birlestirme | `player_kick_slot` |
| kart_islem_bedeli | `payment_intents.card_fee_amount`, `get_card_fee_quote`, `app_config.card_fee_pct` |
| kart_bedeli_rapor_ayrimi | `owner_finance_report`, `admin_finance_report`, `admin_reconciliation_summary` |

**Sonuç:** 340 depo dosyasının tamamı defterde. `db push` artık hiçbir şey
uygulamaz (tam no-op). Defterde 15 fazla kayıt var — bunlar aynı SQL'in eski
kimlikleri ve depoda karşılığı olmayan geçmiş kayıtlar; `db push` onları yok
sayar, zararsızdır.

## ⚠️ Kapatılmayan sürüklenmeler

Depodaki 340 migration'la boş bir PostgreSQL 16 kümesine sıfırdan kurulum
yapıldı ve sonuç üretimle karşılaştırıldı. **115 tablonun 109'u birebir aynı.**
Kalan farklar:

### 1. Depo kendi kendini kuramıyor — `20260827000003`

```
ERROR: cannot change return type of existing function
HINT: Use DROP FUNCTION invite_friends_to_match(uuid,uuid[]) first.
```

`20260827000001` fonksiyonu `RETURNS integer`, `20260827000003` onu
`RETURNS jsonb` yapmaya çalışıyor. PostgreSQL `CREATE OR REPLACE` ile dönüş tipi
değişimine izin vermez. Üretime uygulanan sürümde dosyanın başında
`DROP FUNCTION IF EXISTS public.invite_friends_to_match(uuid, uuid[]);` satırı
**vardı** (defterdeki `20260727160543` kaydının SQL'inde görünüyor); depoya
alınırken düşmüş.

**Etkisi:** temiz kurulum (yeni ortam, önizleme dalı, yedekten dönüş) çalışmaz.
**Çözüm:** depoya bu DROP'u ekleyen yeni bir migration.

### 2. Kolon adı/tipi farkları (21 adet, 6 tabloda)

**Üretimde var, depo hiç oluşturmuyor:**

| Kolon | Not |
|---|---|
| `goalkeepers.geohash`, `referees.geohash` | depoda yok |
| `goalkeepers.reviews`, `referees.reviews` | depoda yok |
| `pitches.created_at` | depoda yok |
| `goalkeepers.fee`, `referees.fee` | üretimde `numeric`, depo `integer` üretiyor |
| `pending_provider_verifications.gk_fee` / `ref_fee` | üretimde `numeric`, depo `integer` |

**Depo oluşturuyor, üretimde yok:**
`pitches.courts`, `pitches.is_approved`, `pitch_bookings.metadata`,
`goalkeepers.is_available`, `referees.is_available`, `referees.auth_uid`,
`service_offers.offered_by`, `service_offers.provider_type`

### 3. camelCase / snake_case ayrışması

`goalkeepers` ve `referees` tablolarında dört kolon depoda snake_case
oluşuyor, üretimde camelCase:

| Depo | Üretim |
|---|---|
| `match_count` | `"matchCount"` |
| `preferred_zones` | `"preferredZones"` |
| `recent_awards` | `"recentAwards"` |
| `is_elite` | `"isElite"` |

Depoda bu kolonları yeniden adlandıran **hiçbir migration yok**, ama 15
migration camelCase adı kullanıyor. Üretimde kolonlar depo dışında yeniden
adlandırılmış olmalı.

### 4. Demo seed dosyası güncel şemayla uyumsuz

`supabase/seeds/ordu_demo_seed.sql` bugün üretimde de çalışmaz:
- `friendships.sender_id` / `receiver_id` artık `GENERATED ALWAYS`
  (`requester_id` / `addressee_id` takma adı) — seed hâlâ onlara yazıyor
- `profiles_oyna_id_format_check` yalnız küçük harf kabul ediyor
  (`^[a-z0-9_]{3,20}$`) — seed `'ORDU1001'` yazıyor

`scripts/kilavuz-gorselleri/local-stack/build-db.sh` bunları geçici kopyada
düzeltir; depodaki dosyaya dokunmaz.

## Yeniden üretim

Yukarıdaki karşılaştırmanın tamamı şu komutlarla tekrarlanabilir (ağ gerekmez):

```bash
bash scripts/kilavuz-gorselleri/local-stack/build-db.sh   # depodan sıfırdan kur
# sonra yerel şema ile üretim şeması karşılaştırılır
```

Sürüklenme telafileri `scripts/kilavuz-gorselleri/local-stack/patches/`
altındadır ve **yalnız yerel kopya içindir** — üretime uygulanacak düzeltme
değildir.

## Sıradaki adımlar (yapılmadı)

1. `20260827000003`'ün eksik `DROP FUNCTION` satırını ekleyen migration → depo
   sıfırdan kurulabilir hale gelir
2. Yukarıdaki 21 kolon farkını kapatan migration serisi
3. `supabase/seeds/ordu_demo_seed.sql` güncellemesi
4. Supabase–GitHub entegrasyonunun onarımı (`MIGRATIONS_FAILED`, 2026-05-29'dan
   beri). 1 ve 2 kapanmadan entegrasyonu açmak önerilmez.
