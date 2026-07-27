#!/usr/bin/env bash
# OYNA yerel veritabanı — sıfırdan kurar: küme → bootstrap → migration'lar → seed.
# Ağ gerektirmez; ekran görüntüsü çekimi için izole bir kopya üretir.
#
#   bash scripts/kilavuz-gorselleri/local-stack/build-db.sh
#
# Ortam değişkenleri: PGPORT (55432), PGDATA (/var/lib/postgresql/oynapg), DB (oyna)
set -uo pipefail

PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}
PGPORT=${PGPORT:-55432}
PGDATA=${PGDATA:-/var/lib/postgresql/oynapg}
DB=${DB:-oyna}
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
ADMIN_URL="postgresql://postgres@127.0.0.1:${PGPORT}/postgres"
DB_URL="postgresql://postgres@127.0.0.1:${PGPORT}/${DB}"

say() { printf '\n\033[1m» %s\033[0m\n' "$*"; }

# ---------------------------------------------------- 1) pg_cron/pg_net sahteleri
say "pg_cron / pg_net sahte eklentileri"
EXTDIR=$(${PGBIN}/pg_config --sharedir)/extension
if [ ! -f "$EXTDIR/pg_cron.control" ]; then
  cat > "$EXTDIR/pg_cron.control" <<'EOF'
comment = 'pg_cron yerel sahtesi (OYNA kılavuz görselleri)'
default_version = '1.6'
relocatable = false
schema = 'cron'
superuser = true
EOF
  echo "-- stub: nesneler 00-bootstrap.sql tarafindan olusturulur" > "$EXTDIR/pg_cron--1.6.sql"
fi
if [ ! -f "$EXTDIR/pg_net.control" ]; then
  cat > "$EXTDIR/pg_net.control" <<'EOF'
comment = 'pg_net yerel sahtesi (OYNA kılavuz görselleri)'
default_version = '0.14.0'
relocatable = false
schema = 'net'
superuser = true
EOF
  echo "-- stub: nesneler 00-bootstrap.sql tarafindan olusturulur" > "$EXTDIR/pg_net--0.14.0.sql"
fi

# ---------------------------------------------------------------- 2) küme
if ! ${PGBIN}/pg_isready -h 127.0.0.1 -p "${PGPORT}" >/dev/null 2>&1; then
  say "PostgreSQL kümesi başlatılıyor (:${PGPORT})"
  if [ ! -s "${PGDATA}/PG_VERSION" ]; then
    rm -rf "${PGDATA}"; mkdir -p "${PGDATA}"
    chown postgres:postgres "${PGDATA}"; chmod 700 "${PGDATA}"
    su postgres -c "${PGBIN}/initdb -D ${PGDATA} -U postgres --auth=trust --encoding=UTF8 --locale=C" >/dev/null
  fi
  su postgres -c "${PGBIN}/pg_ctl -D ${PGDATA} -o '-p ${PGPORT} -c listen_addresses=127.0.0.1' -l /tmp/oyna-pg.log start" >/dev/null
  sleep 3
fi
${PGBIN}/pg_isready -h 127.0.0.1 -p "${PGPORT}" || { echo "küme başlatılamadı"; exit 1; }

# ------------------------------------------------------------- 3) temiz db
say "Veritabanı yeniden oluşturuluyor: ${DB}"
psql "$ADMIN_URL" -q -c "DROP DATABASE IF EXISTS ${DB} WITH (FORCE);" >/dev/null 2>&1
psql "$ADMIN_URL" -q -c "CREATE DATABASE ${DB};" || exit 1

# ------------------------------------------------------------ 4) bootstrap
say "Supabase uyumluluk katmanı"
psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$HERE/00-bootstrap.sql" || exit 1

# --------------------------------------------------------- 5) migration'lar
say "Migration'lar uygulanıyor"
LOG=/tmp/oyna-mig.log; : > "$LOG"
FAILED=/tmp/oyna-mig-failed.txt; : > "$FAILED"
ok=0; bad=0
for f in "$REPO"/supabase/migrations/*.sql; do
  base=$(basename "$f")
  if psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$f" >>"$LOG" 2>&1; then
    ok=$((ok+1))
    psql "$DB_URL" -q -c "INSERT INTO supabase_migrations.schema_migrations(version,name) \
      VALUES ('${base%%_*}', '$(echo "${base#*_}" | sed 's/\.sql$//')') ON CONFLICT DO NOTHING;" >/dev/null 2>&1
  else
    bad=$((bad+1)); echo "$base" >> "$FAILED"
    { echo "=== FAIL: $base"; } >> "$LOG"
  fi
  # Sürüklenme telafisi: bu migration'dan hemen sonra uygulanacak yerel yama
  if [ -f "$HERE/patches/$base" ]; then
    psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$HERE/patches/$base" >>"$LOG" 2>&1 \
      && echo "  ~ yama: $base" || echo "  ! yama başarısız: $base"
  fi
done
echo "  başarılı: $ok   hatalı: $bad   (ayrıntı: $LOG)"

# ------------------------------------------------------------------ 6) seed
say "Demo verisi"
# Seed'ler `oyna_id = 'ORDU1001'` üretiyor; sonradan gelen
# profiles_oyna_id_format_check kısıtı yalnız küçük harf kabul ediyor
# (^[a-z0-9_]{3,20}$). Depodaki seed'e dokunmadan kopyada küçültüyoruz.
TMPSEED=$(mktemp -d)
for s in ordu_demo_seed.sql ordu_admin_demo_seed.sql player_card_demo_seed.sql; do
  [ -f "$REPO/supabase/seeds/$s" ] || continue
  # friendships.sender_id/receiver_id sonradan GENERATED ALWAYS oldu
  # (requester_id/addressee_id'nin takma adı); seed hâlâ eski adlara yazıyor.
  sed -E -e "s/'ORDU([0-9]+)'/'ordu\1'/g" \
         -e "s/INSERT INTO public\.friendships \(sender_id, receiver_id,/INSERT INTO public.friendships (requester_id, addressee_id,/" \
         "$REPO/supabase/seeds/$s" > "$TMPSEED/$s"
  if psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$TMPSEED/$s" >>"$LOG" 2>&1; then
    echo "  ✓ $s"
  else
    echo "  ✗ $s (bkz. $LOG)"
  fi
done
rm -rf "$TMPSEED"

say "Ekran görüntüsü verisi (roller, admin, örnek bildirim/bakiye)"
psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$HERE/10-gorsel-verisi.sql" >>"$LOG" 2>&1 \
  && echo "  ✓ 10-gorsel-verisi.sql" || echo "  ✗ 10-gorsel-verisi.sql (bkz. $LOG)"

say "Özet"
psql "$DB_URL" -tAc "select 'tablo: '||count(*) from information_schema.tables where table_schema='public'"
psql "$DB_URL" -tAc "select 'fonksiyon: '||count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'"
psql "$DB_URL" -tAc "select 'kullanıcı: '||count(*) from auth.users"
echo "DB_URL=$DB_URL"
