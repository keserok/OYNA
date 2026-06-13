#!/bin/bash
# Migration Oluşturma Yardımcısı
# Yeni bir migration dosyası oluşturur

set -e

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║     OYNA - Migration Oluşturma Yardımcısı                ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# Migration adı iste
read -p "Migration adı (örn: add_user_badges): " MIGRATION_NAME

if [ -z "$MIGRATION_NAME" ]; then
  echo "❌ Hata: Migration adı boş olamaz"
  exit 1
fi

# Supabase CLI ile migration oluştur
echo "📝 Migration dosyası oluşturuluyor..."
supabase migration new "$MIGRATION_NAME"

# Oluşturulan dosyayı bul
LATEST_MIGRATION=$(ls -t supabase/migrations/*.sql | head -1)

echo "✅ Migration dosyası oluşturuldu: $LATEST_MIGRATION"
echo ""
echo "Sonraki adımlar:"
echo "1. Dosyayı düzenle: $LATEST_MIGRATION"
echo "2. Local'de test et: ./scripts/migrations/test-migration.sh"
echo "3. Remote'a uygula: ./scripts/migrations/apply-migration.sh"
