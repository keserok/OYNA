#!/bin/bash
# ============================================================================
# OYNA Yönetim Paneli — Mac Tek-Tık Başlatıcı
#
# Bu dosyaya ÇİFT TIKLA → panel tarayıcında açılır. Teknik bilgi gerekmez.
# Panel yalnız BU bilgisayardan erişilir (dışarı/internete kapalı) → sana özel.
# Kapatmak için: açılan siyah pencereyi kapat.
# ============================================================================

# Bu betiğin bulunduğu klasöre geç (proje nerede olursa olsun çalışır)
cd "$(dirname "$0")" || exit 1

clear
echo "======================================"
echo "   OYNA Yönetim Paneli başlatılıyor"
echo "======================================"
echo ""

# 1) Node.js kurulu mu? (paneli çalıştıran motor — bir kerelik kurulum)
if ! command -v node >/dev/null 2>&1; then
  echo "⚠  Node.js kurulu değil. İndirme sayfasını açıyorum."
  osascript -e 'display alert "Bir kerelik kurulum gerekli" message "Paneli çalıştırmak için Node.js kurulmalı. Açılan sayfadan \"LTS\" sürümünü indir, kur; sonra bu simgeye yeniden çift tıkla." as critical' >/dev/null 2>&1
  open "https://nodejs.org/tr/download"
  echo ""
  echo "Node.js kurduktan sonra bu pencereyi kapat ve simgeye tekrar çift tıkla."
  read -r -p "Kapatmak için Enter'a bas..."
  exit 1
fi

# 2) En güncel kodu GitHub'dan çek (güvenli: yerel değişikliğe dokunmaz)
echo "→ Güncel sürüm kontrol ediliyor..."
git fetch origin --quiet 2>/dev/null || true
git merge --ff-only 2>/dev/null || true

# 3) Gerekli parçalar kurulu mu? (ilk sefer birkaç dakika sürebilir)
if [ ! -d node_modules ]; then
  echo "→ İlk kurulum yapılıyor (birkaç dakika sürebilir, lütfen bekle)..."
  npm install || { echo "Kurulum başarısız. İnternet bağlantını kontrol et."; read -r -p "Enter..."; exit 1; }
fi

# 4) Bağlantı ayarı yoksa oluştur (canlı veritabanına bağlanır — anahtar herkese açıktır, güvenlidir)
if [ ! -f .env ]; then
  echo "→ Bağlantı ayarı oluşturuluyor..."
  cat > .env <<'ENV'
VITE_SUPABASE_URL=https://iikvzgyccvgcybzdfwlv.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlpa3Z6Z3ljY3ZnY3liemRmd2x2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0NjM0NDAsImV4cCI6MjA5NTAzOTQ0MH0.T7P_7lYp07zcXrioKkMqZENoYoi-D9aPmjhNAfihMvM
ENV
fi

# 5) Paneli başlat — yalnız bu bilgisayardan erişilir (ADMIN_SOLO=1) ve tarayıcı otomatik açılır
echo "→ Panel açılıyor... (tarayıcı birazdan açılacak)"
echo ""
echo "Paneli KAPATMAK için bu pencereyi kapatman yeterli."
echo ""
ADMIN_SOLO=1 npm run dev:admin
