#!/usr/bin/env bash
# ============================================================================
# OYNA — Tam yedek alma aracı
#
# Ne yapar: Supabase veritabanının tamamını (yapı + veri + roller + migration
# defteri) ve Storage'daki tüm dosyaları `yedek/<tarih>/` klasörüne indirir.
#
# Ne zaman kullanılır: Uygulamayı rafa kaldırmadan (projeyi duraklatmadan)
# önce, ya da düzenli arşiv için.
#
# Kullanım:  bash scripts/maintenance/yedek-al.sh
#
# Rehber: docs/master/runbook/RAFA_KALDIRMA_VE_GERI_ACMA.md
#
# ⚠️ Çıkan klasörde gerçek kullanıcıların kişisel verisi vardır.
#    Depoya (GitHub'a) ASLA yükleme — .gitignore'da `yedek/` zaten kapalı.
# ============================================================================

set -euo pipefail

KOK="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TARIH="$(date +%Y-%m-%d_%H%M)"
HEDEF="$KOK/yedek/$TARIH"

kirmizi() { printf '\033[31m%s\033[0m\n' "$*"; }
yesil()   { printf '\033[32m%s\033[0m\n' "$*"; }
sari()    { printf '\033[33m%s\033[0m\n' "$*"; }
baslik()  { printf '\n\033[1m── %s ──\033[0m\n' "$*"; }

# ─── 0. Ön kontroller ───────────────────────────────────────────────────────
baslik "Ön kontrol"

if ! command -v node >/dev/null 2>&1; then
  kirmizi "Node.js bulunamadı. https://nodejs.org adresinden kurup tekrar dene."
  exit 1
fi
yesil "✓ Node.js var ($(node --version))"

if [ ! -d "$KOK/node_modules/@supabase/supabase-js" ]; then
  kirmizi "Proje bağımlılıkları kurulu değil."
  kirmizi "Önce şunu çalıştır:  npm install"
  exit 1
fi
yesil "✓ Proje bağımlılıkları kurulu"

DOCKER_VAR=1
if ! command -v docker >/dev/null 2>&1 || ! docker info >/dev/null 2>&1; then
  DOCKER_VAR=0
  sari "! Docker çalışmıyor. Veritabanı dökümü Docker gerektiriyor."
  sari "  Docker Desktop'ı kurup AÇIK bırakıp tekrar çalıştır."
  sari "  Şimdilik sadece Storage dosyaları indirilecek."
fi
[ "$DOCKER_VAR" = "1" ] && yesil "✓ Docker çalışıyor"

mkdir -p "$HEDEF"
yesil "✓ Yedek klasörü: $HEDEF"

# ─── 1. Veritabanı dökümü ───────────────────────────────────────────────────
if [ "$DOCKER_VAR" = "1" ]; then
  baslik "1/2 · Veritabanı"

  if [ -z "${SUPABASE_DB_URL:-}" ]; then
    echo "Supabase Dashboard → projeyi aç → üstteki 'Connect' düğmesi →"
    echo "'Session pooler' bağlantı adresini kopyala ve [YOUR-PASSWORD] yerine"
    echo "veritabanı şifreni yaz. (Şifreyi bilmiyorsan:"
    echo " Project Settings → Database → Reset database password)"
    echo
    read -r -s -p "Bağlantı adresi (yazarken görünmez): " SUPABASE_DB_URL || true
    echo
  fi

  if [ -z "${SUPABASE_DB_URL:-}" ]; then
    kirmizi "Bağlantı adresi boş — veritabanı yedeği atlanıyor."
  else
    echo "Döküm alınıyor, ilk seferde Docker imajı indirileceği için birkaç dakika sürebilir…"

    echo "  • roller"
    npx --yes supabase db dump --db-url "$SUPABASE_DB_URL" -f "$HEDEF/roles.sql" --role-only

    echo "  • tablo yapısı"
    npx --yes supabase db dump --db-url "$SUPABASE_DB_URL" -f "$HEDEF/schema.sql"

    echo "  • veri (en uzun adım)"
    npx --yes supabase db dump --db-url "$SUPABASE_DB_URL" -f "$HEDEF/data.sql" \
      --use-copy --data-only \
      -x "storage.buckets_vectors" -x "storage.vector_indexes"

    echo "  • migration defteri"
    npx --yes supabase db dump --db-url "$SUPABASE_DB_URL" \
      -f "$HEDEF/migration-gecmisi-schema.sql" --schema supabase_migrations
    npx --yes supabase db dump --db-url "$SUPABASE_DB_URL" \
      -f "$HEDEF/migration-gecmisi-data.sql" --use-copy --data-only --schema supabase_migrations

    yesil "✓ Veritabanı dökümü tamam"
  fi
fi

# ─── 2. Storage dosyaları ───────────────────────────────────────────────────
baslik "2/2 · Storage dosyaları"

if [ -z "${SUPABASE_URL:-}" ]; then
  read -r -p "Proje adresi [https://iikvzgyccvgcybzdfwlv.supabase.co]: " SUPABASE_URL || true
  SUPABASE_URL="${SUPABASE_URL:-https://iikvzgyccvgcybzdfwlv.supabase.co}"
fi

if [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  echo "Project Settings → API Keys → 'service_role' anahtarını kopyala."
  read -r -s -p "service_role anahtarı (yazarken görünmez): " SUPABASE_SERVICE_ROLE_KEY || true
  echo
fi

if [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  kirmizi "Anahtar boş — Storage yedeği atlanıyor."
else
  SUPABASE_URL="$SUPABASE_URL" \
  SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
  HEDEF_KLASOR="$HEDEF/dosyalar" \
    node "$KOK/scripts/maintenance/storage-yedekle.mjs"
fi

# ─── 3. Geri yükleme notu ───────────────────────────────────────────────────
cat > "$HEDEF/GERI-YUKLEME.md" <<'NOT'
# Bu yedeği yeni bir Supabase projesine yükleme

> Bu dosya `scripts/maintenance/yedek-al.sh` tarafından otomatik yazıldı.
> Ayrıntılı anlatım: `docs/master/runbook/RAFA_KALDIRMA_VE_GERI_ACMA.md`

## 1. Yeni proje aç
https://database.new → yeni proje. Bölge olarak eskisiyle aynısını seç.

## 2. Bağlantı adresini al
Dashboard → **Connect** → "Session pooler" adresini kopyala,
`[YOUR-PASSWORD]` yerine yeni projenin veritabanı şifresini yaz.

## 3. Veritabanını yükle
Bu klasörün içinde, terminalde:

```bash
psql \
  --single-transaction \
  --variable ON_ERROR_STOP=1 \
  --file roles.sql \
  --file schema.sql \
  --command 'SET session_replication_role = replica' \
  --file data.sql \
  --dbname "<BAGLANTI_ADRESI>"
```

Migration defterini de taşımak için:

```bash
psql \
  --single-transaction \
  --variable ON_ERROR_STOP=1 \
  --file migration-gecmisi-schema.sql \
  --file migration-gecmisi-data.sql \
  --dbname "<BAGLANTI_ADRESI>"
```

## 4. Dosyaları yükle
`dosyalar/` klasöründeki her alt klasör bir Storage kovasıdır. Dashboard →
Storage → aynı isimde kova aç → dosyaları sürükle-bırak yükle.

## 5. Sunucu fonksiyonlarını yükle
Proje klasöründe:

```bash
npx supabase functions deploy --project-ref <YENI_PROJE_REF>
```

Gizli anahtarları da yeniden gir (`.env.example` listesine bak).

## 6. Uygulama kodunu yeni adrese çevir
- `supabaseClient.ts` → `PROD_SUPABASE_URL` ve `PROD_SUPABASE_ANON_KEY`
- Vercel → Environment Variables → `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- iyzico paneli → webhook adresi (`.../functions/v1/payment-webhook`)
NOT

baslik "Bitti"
yesil "Yedek hazır: $HEDEF"
echo
sari "⚠️ Bu klasörde gerçek kullanıcı verisi var."
sari "   Güvenli bir yere (şifreli klasör / bulut sürücü) kopyala."
sari "   GitHub'a yükleme — .gitignore zaten engelliyor."
echo
ls -la "$HEDEF"
