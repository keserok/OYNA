# Kılavuz Ekran Görüntüleri — Çekim Aracı

`docs/kilavuzlar/` altındaki kullanım kılavuzlarının 49 ekran görüntüsünü
**tekrar üretilebilir** şekilde çeker (elle çekim yok).

Çekim, canlı Supabase'e ihtiyaç duymadan **sandbox içinde kurulan yerel bir
yığına** karşı yapılır. Böylece üretim verisi hiç kirletilmez, kılavuzlarda
gerçek kullanıcı bilgisi görünmez ve ağ izni olmayan ortamlarda da çalışır.

## Hızlı başlangıç

```bash
# 1) Veritabanını sıfırdan kur (PostgreSQL + 330 migration + demo seed)
bash scripts/kilavuz-gorselleri/local-stack/build-db.sh

# 2) Servisleri başlat (PostgREST 3001 + geçit 54321 + Vite 5199)
bash scripts/kilavuz-gorselleri/local-stack/up.sh

# 3) Görselleri çek
node scripts/kilavuz-gorselleri/flows.mjs           # hepsi (49 kare)
node scripts/kilavuz-gorselleri/flows.mjs oyuncu    # tek rol

# 4) Depoya uygun boyuta indir (2x → 1.5x, palet PNG; ~%75 küçülme)
node scripts/kilavuz-gorselleri/optimize.mjs

# 5) Durdur
bash scripts/kilavuz-gorselleri/local-stack/up.sh down
```

Çıktı: `docs/kilavuzlar/gorseller/<rol>/<sıra>-<ad>.png`
Beklenen dosya listesi: `gorsel-manifest.txt` (49 görsel).

## Yerel yığın nelerden oluşuyor

| Parça | Ne işe yarıyor |
|---|---|
| PostgreSQL 16 | Sandbox'ta kurulu; `local-stack/build-db.sh` ayrı bir küme başlatır (:55432) |
| `00-bootstrap.sql` | Supabase uyumluluk katmanı: roller, `auth`/`storage` şemaları, `auth.uid()`, `supabase_realtime` yayını, `pg_cron`/`pg_net`/`vault` sahteleri |
| `patches/` | Depo migration'ı ile üretim şeması arasındaki sürüklenmeyi telafi eder (aşağıya bakın) |
| `10-gorsel-verisi.sql` | Demo kaleci/hakem hesaplarına sağlayıcı rolü verir, bir SUPER_ADMIN tanımlar, boş ekranlara örnek veri koyar |
| PostgREST 12.2.3 | `/rest/v1/*` — gerçek PostgREST, gerçek RLS |
| `gateway.mjs` | GoTrue yerine küçük kimlik sunucusu (`/auth/v1/token`, `/user`, …) + `/storage/v1` yer tutucu görsel; JWT'yi PostgREST ile aynı sırla imzalar |

PostgREST ikilisi `/opt/oyna-local/postgrest` altında beklenir; yoksa
[GitHub release](https://github.com/PostgREST/postgrest/releases) sayfasından
`postgrest-v12.2.3-linux-static-x64.tar.xz` indirilip oraya açılır.

## ⚠️ Bilinen sürüklenme (önemli)

Depodaki migration'lar üretim şemasını **sıfırdan üretemiyor**:

| Tablo | Depo migration'ı | Üretim |
|---|---|---|
| `goalkeepers`, `referees` | `match_count` | `"matchCount"` |
| `goalkeepers`, `referees` | `preferred_zones` | `"preferredZones"` |
| `goalkeepers`, `referees` | `recent_awards` | `"recentAwards"` |
| `goalkeepers`, `referees` | `is_elite` | `"isElite"` |

Bu kolonlar üretimde depo dışında yeniden adlandırılmış; sonraki 14 migration
camelCase adı kullandığı için temiz bir veritabanı depoyla ayağa kalkmıyor.
`patches/20260530000000_service_integration.sql` bunu **yalnız yerel kopyada**
telafi eder. Kalıcı çözüm depoya bir rename migration'ı eklemektir — bu
Supabase↔GitHub entegrasyonunun önizleme dallarında neden `MIGRATIONS_FAILED`
verdiğini de açıklıyor olabilir (önizleme veritabanları sıfırdan kurulur).

Ayrıca `supabase/seeds/ordu_demo_seed.sql` güncel şemayla uyumsuz:
`friendships.sender_id/receiver_id` artık `GENERATED ALWAYS` (requester_id /
addressee_id takma adı) ve `oyna_id` yalnız küçük harf kabul ediyor.
`build-db.sh` seed'i çalıştırırken bunları geçici kopyada düzeltir; depodaki
dosyaya dokunmaz.

## Canlıya karşı çekmek isterseniz

Ortamın ağ izin listesinde `iikvzgyccvgcybzdfwlv.supabase.co` bulunmalıdır.
Kontrol:

```bash
curl -s "$HTTPS_PROXY/__agentproxy/status"   # recentRelayFailures'a bakın
```

İzin varsa `sb-shim.mjs` köprüsünü başlatıp `OYNA_APP_URL` ile canlıya bakan
bir Vite sunucusuna yönlendirin. **Not:** ağ politikası konteyner başlarken
uygulanır; izni yeni eklediyseniz yeni bir oturum gerekir.

## Kurallar

1. **Üretimde yazma yapılmaz.** Yerel yığın zaten üretime hiç bağlanmaz.
2. Gezinme, kırılgan tıklama zincirleri yerine uygulamanın kendi store'u
   üzerinden yapılır: `import('/store.ts')` → `setView(...)`.
3. Admin akışı her karede sayfa başlığını doğrular; yanlış sayfa sessizce
   geçemez.
4. Türkçe **İ** (U+0130) JavaScript'in `/i/` bayrağıyla `i`ye katlanmaz —
   `/giriş yap/i` deseni "GİRİŞ YAP" metnini bulamaz. Seçicilerde birebir
   metin ya da `i` bayrağı olmayan regex kullanın.
5. Manifestte olup çekilemeyen bir görsel varsa, kılavuzdaki o referans satırı
   kaldırılır — kırık görsel bağlantısı bırakılmaz.
