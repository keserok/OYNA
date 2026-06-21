#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────
# OYNA — Telefon Önizleme Scripti
#
# Ne yapar: Vite dev sunucusunu başlatır + Cloudflare "quick tunnel" açar
# ve telefonundan açabileceğin herkese açık bir https://...trycloudflare.com
# adresi basar.
#
# ÖN KOŞUL: Bu oturumun ağ erişimi "Full" (veya Custom + *.trycloudflare.com
# ve *.argotunnel.com) olmalı. Aksi halde tünel "Host not in allowlist"
# hatası verir — o zaman ortam ayarından ağ iznini açıp YENİ oturum başlat.
#
# Kullanım:  bash scripts/preview.sh
# ─────────────────────────────────────────────────────────────────────────
set -euo pipefail

PORT="${PORT:-4000}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

CF_BIN="/tmp/cloudflared"
VITE_LOG="/tmp/oyna-vite.log"
CF_LOG="/tmp/oyna-cloudflared.log"

echo "▶ Vite dev sunucusu başlatılıyor (port $PORT)..."
pkill -9 -f "vite" 2>/dev/null || true
sleep 1
nohup npm run dev > "$VITE_LOG" 2>&1 &

# Sunucu ayağa kalkana kadar bekle
for i in $(seq 1 30); do
  if curl -s -m 3 -o /dev/null "http://localhost:$PORT/"; then
    echo "✓ Dev sunucusu hazır: http://localhost:$PORT/"
    break
  fi
  sleep 1
  [ "$i" -eq 30 ] && { echo "✗ Dev sunucusu başlamadı. Log:"; cat "$VITE_LOG"; exit 1; }
done

# cloudflared yoksa indir
if [ ! -x "$CF_BIN" ]; then
  echo "▶ cloudflared indiriliyor..."
  curl -sL -m 90 -o "$CF_BIN" \
    "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64"
  chmod +x "$CF_BIN"
fi

echo "▶ Cloudflare tüneli açılıyor..."
pkill -9 -f "cloudflared" 2>/dev/null || true
sleep 1
nohup "$CF_BIN" tunnel --url "http://localhost:$PORT" --no-autoupdate > "$CF_LOG" 2>&1 &

# Genel adres üretilene kadar bekle
URL=""
for i in $(seq 1 30); do
  URL="$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$CF_LOG" 2>/dev/null | head -1 || true)"
  [ -n "$URL" ] && break
  if grep -q "not in allowlist" "$CF_LOG" 2>/dev/null; then
    echo ""
    echo "✗ AĞ İZNİ KAPALI: Tünel adresi bu ortamın izin listesinde değil."
    echo "  Çözüm: Ortam ayarı → Network access → Full (veya Custom +"
    echo "  *.trycloudflare.com, *.argotunnel.com) yapıp YENİ oturum başlat."
    exit 2
  fi
  sleep 1
done

if [ -z "$URL" ]; then
  echo "✗ Tünel adresi alınamadı. Log:"; cat "$CF_LOG"; exit 1
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  📱 TELEFONDAN AÇ:"
echo "  $URL"
echo "═══════════════════════════════════════════════════════════"
echo "  (Sunucu ve tünel arka planda çalışıyor. Durdurmak için:"
echo "   pkill -f vite ; pkill -f cloudflared)"
