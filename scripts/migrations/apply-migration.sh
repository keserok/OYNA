#!/bin/bash
# Migration Uygulama (Remote)
# Migrations'ları remote Supabase veritabanına uygular

set -e

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║     OYNA - Remote Migration Uygulama                      ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# Project ref kontrolü
PROJECT_REF="iikvzgyccvgcybzdfwlv"

echo "🔍 Uygulanacak migrations kontrol ediliyor..."
supabase db remote list-changes --project-ref "$PROJECT_REF"

echo ""
read -p "⚠️  Bu migrations'ları PRODUCTION veritabanına uygulamak istiyor musunuz? (y/N): " CONFIRM

if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
  echo "❌ İşlem iptal edildi"
  exit 0
fi

echo "📤 Migrations uygulanıyor..."
supabase db push --project-ref "$PROJECT_REF"

echo "✅ Migrations başarıyla uygulandı!"
echo ""
echo "Migration durumunu kontrol edin:"
echo "supabase migration list --project-ref $PROJECT_REF"
