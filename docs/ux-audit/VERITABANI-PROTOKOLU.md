# OYNA — Veritabanı Bağlantı ve Doğrulama Protokolü

> **Kural:** Her iş paketinin başında ve sonunda veritabanı bağlantısı
> **ölçülerek** doğrulanır. "Bağlandım sandım" kabul edilmez.

**Belge tarihi:** 2026-07-29 · **Proje id:** `iikvzgyccvgcybzdfwlv`

---

## 1. Bu ortamda hangi kanal çalışıyor

| Kanal | Durum | Not |
|---|---|---|
| **Supabase MCP** (`mcp__Supabase__*`) | ✅ **Çalışıyor** | Tek güvenilir yol. Sandbox proxy'sinden geçmez. |
| Sandbox'tan doğrudan HTTPS (curl / Node / tarayıcı) | ❌ **Ağ politikasıyla kapalı** | Proxy CONNECT'e **403** döner. |

**Ölçüm (2026-07-29):**

```
github.com            → HTTP 400  (bağlantı kuruluyor, genel çıkış açık)
supabase.com          → HTTP 000  (403 connect_rejected)
<proje>.supabase.co   → HTTP 000  (403 connect_rejected)
```

Proxy tanısı: `curl -sS "$HTTPS_PROXY/__agentproxy/status"` →
`recentRelayFailures` içinde `connect_rejected … supabase.co:443`.

> ⚠️ `/root/.ccr/README.md` bu sınıfı açıkça tanımlar: *"403/407 → kuruluşun
> çıkış politikası. Yeniden deneme, etrafından dolaşma, raporla."*
> Bu yüzden `verify` skill'indeki **yerel şim (`sb-shim.mjs`) yolu bu oturumda
> geçersizdir** — CONNECT'in kendisi reddedildiği için tünel de kurulamaz.

### Bunun pratik sonucu

- ✅ Şema, RPC, veri, migration defteri, RLS → MCP ile tam doğrulanabilir.
- ❌ `npm run dev` + Playwright ile **canlı veriye karşı tarayıcı sürüşü
  yapılamaz.** Görsel testler (`npm run test:visual`) ağ gerektirmediği için
  çalışmaya devam eder.
- Bu kısıt oturuma özgüdür; ağ politikası değişirse yeniden ölçülmeli.

---

## 2. Her iş paketinde çalıştırılacak kontrol

`scripts/db-queries/saglik-kontrolu.sql` dosyasını MCP ile çalıştır:

```
mcp__Supabase__execute_sql(project_id: 'iikvzgyccvgcybzdfwlv', query: <dosya içeriği>)
```

Repo tarafı sürüklenme kontrolü (kabukta):

```bash
ls supabase/migrations/*.sql | xargs -n1 basename \
  | sed -E 's/^([0-9]+)_.*/\1/' | sort | paste -sd, - | tr -d '\n' | md5sum
```

Çıkan md5, sorgunun `defter_md5` satırıyla **birebir** aynı olmalı.
*(Henüz uygulanmamış yeni migration dosyalarını hariç tutarak karşılaştır.)*

### Taban değerler — 2026-07-29

| Kontrol | Değer |
|---|---|
| Bağlantı | `postgres / postgres / pg 17.6` |
| Defter kayıt sayısı | **373** |
| Defter son sürüm | `20260828000009` |
| Defter md5 | `660941836f38ce3dc0c01c9d265cc485` |
| Repo md5 (IP-04 hariç) | `660941836f38ce3dc0c01c9d265cc485` ✅ **sürüklenme yok** |
| `public` tablo sayısı | 111 |
| RLS kapalı tablo | **YOK — hepsi açık** |
| Veritabanı boyutu | 66 MB |
| 24 saatten eski asılı ödeme niyeti | 0 |

---

## 3. Şema değişikliği yaparken

`MIGRATION_PLAYBOOK.md` Altın Kural 1: **production'a MCP `apply_migration`
ile DDL uygulamak yasaktır.** Migration repo dosyası + PR + otomatik deploy
ile gider.

Peki yazdığın SQL'i uygulamadan nasıl doğrularsın? **Geri alınan işlem içinde:**

```sql
begin;
  <migration içeriği>
  <senaryo sınamaları — geçici tabloya yaz>
select * from _sonuclar;   -- sonuçları oku
rollback;                   -- HİÇBİR ŞEY KALMAZ
```

Ardından **sızıntı kontrolü zorunlu**:

```sql
select (select count(*) from pg_proc where proname='<yeni_fonksiyon>') as sizinti,
       (select pg_get_functiondef('public.<degistirilen>'::regprocedure) like '%<yeni_ifade>%') as canli_degisti_mi;
```

İkisi de `0` / `false` dönmeli. Bu yöntem IP-04'te kullanıldı: 7 senaryo
ölçüldü, canlıya tek satır yazılmadı.

> **Not:** MCP `execute_sql` işlem bloklarını onurlandırır — `rollback`
> gerçekten geri alır. Bu, kullanmadan önce boş bir tabloyla sınandı.

---

## 4. Bilinen açıklar (bu protokolün ürettiği)

| # | Bulgu | Durum |
|---|---|---|
| 1 | `_wallet_withdrawable`, `_wallet_cashout_restore` — alt çizgili yani **özel** olması gereken cüzdan fonksiyonları `anon` tarafından çalıştırılabiliyor | Açık; ayrı iş |
| 2 | `auth_leaked_password_protection` kapalı (sızmış parola kontrolü) | Açık; Supabase panelinden açılır |
| 3 | `public.public_profiles` view'ı SECURITY DEFINER (advisor ERROR) | Kasıtlı görünüyor; teyit edilmeli |
| 4 | IP-04 migration'ı (`20260829000000`) canlıda **yok** — sağlık kontrolü `para_rpc_eksik: _leave_match_quote` diyor | PR/deploy bekliyor |

Güvenlik danışmanı toplamı 427 bulgu; bunların 404'ü
`authenticated_security_definer_function_executable` — uygulamanın normal RPC
deseni, gürültü. 7 adet `rls_enabled_no_policy` ise **kasıtlı sertleştirme**
(`password_reset_codes`, `match_private_codes` vb. istemciye tümüyle kapalı,
yalnız SECURITY DEFINER fonksiyonlar dokunur).

---

## 5. Sıfırdan replay — yerel doğrulama (2026-07-29'da eklendi)

`bash scripts/maintenance/yerel-replay.sh`

Tüm migration zincirini **boş bir PostgreSQL kümesine** uygular ve hataları tek
seferde listeler. Supabase Preview her turda yalnız TEK hata gösterir, her tur
dakikalar sürer ve dalın veritabanı **durum tutar** (başarısız turun artık
verisi kalır, sonraki turu yanıltır). Yerel replay her çalıştırmada tertemiz
başlar.

Betik, Supabase'in migration'lardan önce sağladığı ortamı kurar: roller
(`anon`, `authenticated`, `service_role`…), `auth`/`storage` şemaları ve
yardımcıları (`auth.uid()` vb.), `supabase_realtime` publication'ı, eklentiler
(`extensions` ŞEMASINA — Supabase orada tutar) ve yerelde kurulamayan
`pg_cron`/`pg_net` için aynı imzalı taklitler.

**2026-07-29 taban ölçümü: 374/374 başarılı, 0 hata.**

### Bu doğrulamanın bulduğu beş kırılma

Hepsi geçmişin ORTASINDA oluşuyordu; sonraki hiçbir migration önleyemezdi.

| Dosya | Kırılma |
|---|---|
| `20260727124350` | `courts.min_capacity`'yi kolonu ekleyen dosyadan ÖNCE güncelliyor |
| `20260727154401` | aynı sınıf (`max_capacity` güncellemesi) |
| `20260530000000` | `goalkeepers`/`referees` `match_count` yaratıyor, üretim ve uygulama `"matchCount"` bekliyor |
| `20260803000003` | `get_current_tariff_price` — 4 argümanlı sürüm için `DROP` eksik (42P13) |
| `20260827000001` + `20260827000003` | `invite_friends_to_match` — dönüş tipi integer↔jsonb, `DROP` eksik |

**Kök hastalık:** Migration sürüm numaraları gerçek uygulama sırasını
yansıtmıyor. Üretimde dosyalar farklı sırayla uygulandığı için bu bağımlılıklar
görünmüyordu; sıfırdan replay sürüm sırasına uyduğu anda ortaya çıktılar.

## 6. Bilinen repo ↔ üretim şema sapması (AÇIK)

Replay'in ürettiği şema üretimle **birebir değil**: 115 tablonun ikisinde de
aynı, ama 4 tabloda 7 kolon farkı var. Replay'i engellemiyor; ayrı iş.

| Tablo | Üretimde var, replay'de yok | Replay'de var, üretimde yok |
|---|---|---|
| `goalkeepers` | `geohash`, `reviews`, `isElite`, `preferredZones`, `recentAwards` | `is_available`, `is_elite`, `preferred_zones`, `recent_awards` |
| `pitches` | `created_at` | `courts`, `is_approved` |
| `pitch_bookings` | — | `metadata` |
| `service_offers` | — | `offered_by`, `provider_type` |

`goalkeepers`/`referees` satırı önemli: uygulama camelCase sorguluyor
(`services/matchService.ts:279` → `"matchCount"`, `"isElite"`). Yani **üretim
doğru, repo yanlış**. `matchCount` replay'i kırdığı için düzeltildi; kalan
camelCase adlar replay'i kırmadığı için dokunulmadı — düzeltilmesi ayrı bir
doğrulama turu ister.
