#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
# iOS GÖNDERİM ÖN-UÇUŞU — Xcode'a oturmadan önce her şeyi yerine koy ve DOĞRULA
# ════════════════════════════════════════════════════════════════════════════
#
# NEDEN VAR (23 Ağustos 2026, ilk gönderim denemesi): tek bir gönderimde beş
# ayrı duvara çarpıldı ve her biri ancak çarptıktan SONRA görüldü —
#
#   1. Podfile.lock 18 eklentiden 4'ünü taşıyordu (Apple ile Giriş yoktu).
#   2. Podfile'ın kendisi eskiydi; üç eklentiyi hiç listelemiyordu.
#   3. Derleme numarası, reddedilen gönderimdekiyle aynıydı.
#   4. Disk %96 doluydu; Xcode arşivi "DerivedData'ya yazamıyorum" diye düştü.
#   5. Düz `npm run build` admin panelini pakete koyuyordu.
#
# Hiçbiri zor değildi; hepsi GÖRÜNMEZDİ. Bu betik hepsini gönderimden ÖNCE ve
# tek seferde görünür kılar. Kural: bir şey eksikse BAĞIR ve DUR — yarım
# onarımla Xcode'a oturmak, 15 dakikayı çöpe atmaktır.
#
# Kullanım:
#   npm run ios:gonder                  → ön-uçuş (derleme numarasına dokunmaz)
#   npm run ios:gonder -- --numara-artir → derleme numarasını da +1 yapar
#   npm run ios:gonder -- --temizle     → Xcode önbelleğini de siler (yer açar)
# ════════════════════════════════════════════════════════════════════════════
set -euo pipefail

kirmizi=$'\033[31m'; yesil=$'\033[32m'; sari=$'\033[33m'
mavi=$'\033[36m'; kalin=$'\033[1m'; sifirla=$'\033[0m'

ADIM=0
TOPLAM=8
baslik() { ADIM=$((ADIM + 1)); printf '\n%s▸ %s/%s  %s%s\n' "$kalin" "$ADIM" "$TOPLAM" "$1" "$sifirla"; }
iyi()    { printf '  %s✓%s %s\n' "$yesil"   "$sifirla" "$1"; }
kotu()   { printf '  %s✗%s %s\n' "$kirmizi" "$sifirla" "$1"; }
bilgi()  { printf '  %s·%s %s\n' "$mavi"    "$sifirla" "$1"; }
uyari()  { printf '  %s!%s %s\n' "$sari"    "$sifirla" "$1"; }

dur() {
  printf '\n%s%sÖN-UÇUŞ DURDU.%s %s\n\n' "$kalin" "$kirmizi" "$sifirla" "$1"
  exit 1
}

KOK="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$KOK"

NUMARA_ARTIR=0
TEMIZLE=0
for a in "$@"; do
  case "$a" in
    --numara-artir) NUMARA_ARTIR=1 ;;
    --temizle)      TEMIZLE=1 ;;
    *) ;;
  esac
done

# Arşivin rahat çalışması için istenen boş alan (GB). Xcode arşiv sırasında
# geçici olarak birkaç GB yazıyor; sınıra yakın çalışmak yarım arşiv demek.
GEREKLI_GB=10

printf '\n%s%s  OYNA · iOS GÖNDERİM ÖN-UÇUŞU%s\n' "$kalin" "$mavi" "$sifirla"

# ─── 1. Ortam ───────────────────────────────────────────────────────────────
baslik "Ortam"
[[ "$(uname -s)" == "Darwin" ]] || dur "Bu betik macOS gerektirir (şu an: $(uname -s)). CocoaPods başka yerde çalışmaz."
iyi "macOS $(sw_vers -productVersion 2>/dev/null || echo '?')"

for arac in node npm; do
  command -v "$arac" >/dev/null 2>&1 || dur "$arac bulunamadı. https://nodejs.org üzerinden kur."
done
iyi "node $(node --version) · npm $(npm --version)"

command -v pod >/dev/null 2>&1 || dur "CocoaPods yok. Kur:  brew install cocoapods"
iyi "CocoaPods $(pod --version)"

xcode-select -p >/dev/null 2>&1 || dur "Xcode araçları yok. Kur:  xcode-select --install"
iyi "Xcode araçları hazır"

# ─── 2. Disk ────────────────────────────────────────────────────────────────
# NEDEN AYRI ADIM: Xcode disk dolduğunda anlaşılmaz bir hata veriyor
# ("Couldn't create workspace arena folder … Unable to write to info file").
# Kimse bunu "diskin dolu" diye okumuyor. Önce ölç, açıkça söyle.
baslik "Disk alanı"
BOS_GB=$(df -g /System/Volumes/Data 2>/dev/null | awk 'NR==2 {print $4}')
[[ -n "${BOS_GB:-}" ]] || BOS_GB=$(df -g / | awk 'NR==2 {print $4}')
bilgi "boş alan: ${BOS_GB} GB (gereken: ${GEREKLI_GB} GB)"

if [[ "$TEMIZLE" -eq 1 ]]; then
  ONCE="$BOS_GB"
  rm -rf "$HOME/Library/Developer/Xcode/DerivedData" 2>/dev/null || true
  rm -rf "$HOME/Library/Developer/Xcode/iOS DeviceSupport/"* 2>/dev/null || true
  BOS_GB=$(df -g /System/Volumes/Data 2>/dev/null | awk 'NR==2 {print $4}')
  iyi "Xcode önbelleği silindi: ${ONCE} GB → ${BOS_GB} GB"
fi

if [[ "${BOS_GB:-0}" -lt "$GEREKLI_GB" ]]; then
  kotu "yer yetersiz"
  echo
  echo "    Önce şunu dene:   npm run ios:gonder -- --temizle"
  echo "    Yetmezse en çok yeri tutanlar:"
  echo "      du -sh ~/Library/Caches ~/Library/Developer/CoreSimulator 2>/dev/null"
  dur "Xcode arşivi ${GEREKLI_GB} GB boş alan istiyor."
fi
iyi "yeterli yer var"

# ─── 3. Bağımlılıklar ───────────────────────────────────────────────────────
baslik "Bağımlılıklar"
# `npm ci` package-lock.json'a BİREBİR uyar. `npm install` sürümleri kaydırıp
# eklenti/Capacitor uyumsuzluğu doğurur — gönderim yolunda asla kullanma.
npm ci
iyi "node_modules kuruldu (npm ci)"

# ─── 4. Mobil paket ─────────────────────────────────────────────────────────
baslik "Mobil paket"
# DİKKAT: düz `npm run build` DEĞİL. build:mobile, OYNA_MOBILE=1 ile derler ve
# YÖNETİM PANELİNİ pakete koymaz. Düz build ile arşivlenirse admin yüzeyi
# oyuncunun telefonuna iner.
npm run build:mobile
iyi "dist üretildi — admin paneli hariç"

# ─── 5. iOS eşitleme ────────────────────────────────────────────────────────
baslik "iOS projesine eşitleme"
# `cap sync` Podfile'ı KENDİSİ yeniden yazar (kurulu eklentilere göre).
# Depodaki Podfile eskiyse burada düzelir — o yüzden doğrulama SONRA gelir.
npx cap sync ios
iyi "web paketi ve eklenti listesi iOS projesine yazıldı"

# ─── 6. Eklentiler ──────────────────────────────────────────────────────────
baslik "Eklentiler (pod install)"
( cd ios/App && pod install )
iyi "pod install bitti"

# ─── 7. Kilit doğrulama ─────────────────────────────────────────────────────
# Doğru soru "kaç tane?" DEĞİL: kilit geçişli bağımlılıkları da taşır
# (bildirim eklentisi arkasından Firebase'i getiriyor), yani Podfile'dan
# her zaman uzundur. Doğru soru: Podfile'da adı geçen HER eklenti kilitte mi?
baslik "Kilit doğrulama"
KILIT="ios/App/Podfile.lock"
[[ -f "$KILIT" ]] || dur "$KILIT üretilmemiş."

BEKLENEN=$(grep -c "^ *pod '" ios/App/Podfile)
BULUNAN=$(sed -n '/^PODS:/,/^DEPENDENCIES:/p' "$KILIT" | grep -c '^  - ' || true)
bilgi "Podfile: ${BEKLENEN} eklenti · kilit: ${BULUNAN} satır (geçişli bağımlılıklarla)"

eksik=0
while read -r ad; do
  grep -qE "^  - $ad[ (]" "$KILIT" || { kotu "kilitte yok: $ad"; eksik=$((eksik + 1)); }
done < <(grep -oE "pod '[^']*'" ios/App/Podfile | sed "s/pod '//;s/'//")
[[ "$eksik" -eq 0 ]] || dur "$eksik eklenti kilitte yok. Bu hâliyle arşivleme."
iyi "Podfile'daki ${BEKLENEN} eklentinin hepsi kilitte"

# Apple ile Giriş ayrıca ve açıkça: gönderimi TEK BAŞINA düşüren eklenti bu.
grep -q 'CapacitorCommunityAppleSignIn' "$KILIT" \
  || dur "APPLE İLE GİRİŞ kilitte yok — Guideline 4.8 reddi kesin."
iyi "Apple ile Giriş kilitte"

[[ "$BULUNAN" -ge "$BEKLENEN" ]] || dur "kilit Podfile'dan kısa — kurulum yarım kalmış."

# ─── 8. Sürüm ve mağaza denetimi ────────────────────────────────────────────
baslik "Sürüm ve mağaza denetimi"
if [[ "$NUMARA_ARTIR" -eq 1 ]]; then
  npm run surum:artir
fi

PBX="ios/App/App.xcodeproj/project.pbxproj"
SURUM=$(grep -m1 -E "MARKETING_VERSION" "$PBX" | sed 's/.*= *//;s/;//' | tr -d ' ')
DERLEME=$(grep -m1 -E "CURRENT_PROJECT_VERSION" "$PBX" | sed 's/.*= *//;s/;//' | tr -d ' ')
bilgi "sürüm ${SURUM} · derleme ${DERLEME}"
uyari "App Store Connect AYNI derleme numarasını iki kez kabul etmez."
uyari "${DERLEME} daha önce yüklendiyse:  npm run ios:gonder -- --numara-artir"

npm run magaza:denetim

# ─── Bitiş ──────────────────────────────────────────────────────────────────
printf '\n%s%sÖN-UÇUŞ TEMİZ — Xcode'\''a oturabilirsin.%s\n\n' "$kalin" "$yesil" "$sifirla"
cat <<BITIS
  Sıradaki adımlar (Xcode):

    1.  npx cap open ios
    2.  App → TARGETS → App → Signing & Capabilities → Team seçili mi?
    3.  Üstteki cihaz seçici → Any iOS Device (arm64)
        (simülatör seçiliyken Archive menüsü GRİ kalır)
    4.  Product → Archive                          ~5-15 dk
    5.  Organizer → Distribute App
          → App Store Connect → Upload
          → seçenekleri değiştirme, Next
          → Automatically manage signing, Next
          → Upload

  Yükleme bitince derlemenin "Processing"den çıkması 10-60 dk sürer.

  Değişiklikleri depoya yazmayı unutma:
    git add -A && git commit -m "iOS: gönderim ${SURUM} (${DERLEME})" && git push origin main
BITIS
