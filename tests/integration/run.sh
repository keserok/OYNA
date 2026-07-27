#!/usr/bin/env bash
# SQL entegrasyon testlerini toplu çalıştırır (bkz. tests/integration/README.md).
# Her dosya kendi BEGIN…ROLLBACK bloğunu taşır — hedef DB'de kalıntı bırakmaz;
# yine de ÜRETİM yerine test/branch veritabanı kullanın.
set -uo pipefail

: "${DATABASE_URL:?DATABASE_URL gerekli (test/branch veritabanı bağlantısı)}"

dir="$(cd "$(dirname "$0")" && pwd)"
fail=0

for f in "$dir"/*.sql; do
  name="$(basename "$f")"
  echo "===== $name"
  if ! out="$(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -qAt -F' | ' -f "$f" 2>&1)"; then
    echo "$out" | tail -20
    echo "HATA: $name çalıştırılamadı"
    fail=1
    continue
  fi
  echo "$out"
  if grep -qE '(^|\| *)FAIL( *\||$)' <<<"$out"; then
    echo "FAIL: $name içinde başarısız assert var"
    fail=1
  fi
done

if [ "$fail" -ne 0 ]; then
  echo "SONUÇ: KIRMIZI — yukarıdaki FAIL/HATA satırlarına bakın"
else
  echo "SONUÇ: YEŞİL — tüm entegrasyon testleri geçti"
fi
exit "$fail"
