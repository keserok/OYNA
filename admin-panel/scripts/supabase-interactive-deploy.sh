#!/usr/bin/env bash
# OYNA — Supabase admin migration + edge function (interaktif)
# Terminal'de çalıştırın: bash admin-panel/scripts/supabase-interactive-deploy.sh
set -euo pipefail
cd "$(dirname "$0")/../.."

echo "🚀 OYNA OS — Supabase Deploy"
echo ""

# .env'den token yükle
if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source <(grep -E '^(SUPABASE_ACCESS_TOKEN|SUPABASE_DB_PASSWORD)=' .env | sed 's/^/export /')
  set +a
fi

if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  echo "📎 Access token gerekli."
  echo "   1. https://supabase.com/dashboard/account/tokens"
  echo "   2. Generate new token → .env dosyasına ekleyin:"
  echo "      SUPABASE_ACCESS_TOKEN=sbp_..."
  echo ""
  read -r -p "Token'ı buraya yapıştırın (veya Enter = supabase login): " TOKEN_INPUT
  if [[ -n "$TOKEN_INPUT" ]]; then
    export SUPABASE_ACCESS_TOKEN="$TOKEN_INPUT"
    if ! grep -q '^SUPABASE_ACCESS_TOKEN=' .env 2>/dev/null; then
      echo "SUPABASE_ACCESS_TOKEN=$TOKEN_INPUT" >> .env
      echo "✅ Token .env dosyasına kaydedildi"
    fi
  else
    echo "🔐 Supabase login (tarayıcı açılacak)..."
    supabase login
  fi
fi

echo ""
npm run admin:deploy
echo ""
echo "✅ Tamamlandı. Doğrulama: npm run admin:verify"
read -r -p "Kapatmak için Enter..."
