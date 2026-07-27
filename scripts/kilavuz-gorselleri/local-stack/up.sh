#!/usr/bin/env bash
# Yerel yığını ayağa kaldırır: PostgREST (3001) + geçit (54321) + Vite (5199/4005).
# Veritabanı önceden build-db.sh ile kurulmuş olmalı.
#
#   bash scripts/kilavuz-gorselleri/local-stack/up.sh        # başlat
#   bash scripts/kilavuz-gorselleri/local-stack/up.sh down   # durdur
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
RUN="${OYNA_LOCAL_RUN:-/tmp/oyna-local-run}"
PGRST_BIN="${PGRST_BIN:-/opt/oyna-local/postgrest}"
mkdir -p "$RUN"

stop_one() {
  local name=$1
  if [ -f "$RUN/$name.pid" ]; then
    local pid; pid=$(cat "$RUN/$name.pid")
    if kill -0 "$pid" 2>/dev/null; then kill "$pid" 2>/dev/null; sleep 1; kill -9 "$pid" 2>/dev/null; fi
    rm -f "$RUN/$name.pid"
    echo "  ✗ $name durduruldu"
  fi
}

if [ "${1:-up}" = "down" ]; then
  for n in vite-admin vite-app gateway postgrest; do stop_one "$n"; done
  exit 0
fi

start_one() {
  local name=$1; shift
  stop_one "$name" >/dev/null
  nohup "$@" > "$RUN/$name.log" 2>&1 &
  echo $! > "$RUN/$name.pid"
  echo "  ✓ $name (pid $(cat "$RUN/$name.pid"), log $RUN/$name.log)"
}

echo "» PostgREST"
start_one postgrest "$PGRST_BIN" "$HERE/postgrest.conf"
sleep 5

echo "» Geçit (auth + rest + storage)"
start_one gateway node "$HERE/gateway.mjs"
sleep 3

ANON=$(grep -oP 'ANON_KEY=\K.*' "$RUN/gateway.log" | head -1)
if [ -z "$ANON" ]; then echo "  ! geçit anahtarı okunamadı, $RUN/gateway.log'a bak"; exit 1; fi
echo "  anon anahtar: ${ANON:0:36}…"

export VITE_SUPABASE_URL="http://127.0.0.1:54321"
export VITE_SUPABASE_ANON_KEY="$ANON"

# Tek Vite sunucusu hem uygulamayı (/) hem admin panelini (/admin.html) veriyor.
echo "» Vite — uygulama (/) + admin paneli (/admin.html), port 5199"
cd "$REPO"
start_one vite-app npx vite --port 5199 --strictPort --host 127.0.0.1

sleep 10
echo
for u in "http://127.0.0.1:3001/" "http://127.0.0.1:54321/auth/v1/health" "http://127.0.0.1:5199/" "http://127.0.0.1:5199/admin.html"; do
  printf '  %-45s %s\n' "$u" "$(curl -sS --noproxy '*' -o /dev/null -w '%{http_code}' --max-time 10 "$u" 2>&1)"
done
echo
echo "Durdurmak için: bash $0 down"
