#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
# iOS PAKET ONARIMI — Podfile.lock'u sıfırdan üret ve DOĞRULA
# ════════════════════════════════════════════════════════════════════════════
#
# NEDEN VAR: `ios/App/Podfile.lock` 15 eklentiden yalnız 4'ünü taşıyordu.
# Eksikler arasında CapacitorCommunityAppleSignIn (Apple ile Giriş) de vardı —
# o hâliyle arşivlenen paketde Apple düğmesi ÇALIŞMAZ ve bu tek başına
# App Store reddidir (Guideline 4.8 + 2.1). Kilit dosyası yalnız macOS'ta
# üretilebilir, bu yüzden bu adım kurucunun Mac'inde çalışmak zorunda.
#
# NİYE BETİK: sıra önemli (web paketi → cap sync → pod install) ve en kritik
# kısım SONDAKİ DOĞRULAMA. Elle yapılırken `pod install` sessizce yarım
# kalabiliyor ve kimse fark etmeden arşive gidiliyor. Bu betik yarım kalırsa
# BAĞIRIR ve sıfırdan farklı bir çıkış kodu döner.
#
# Çalıştırma:  bash scripts/ios-paket-onar.sh      (ya da: npm run ios:onar)
# ════════════════════════════════════════════════════════════════════════════
set -euo pipefail

kirmizi=$'\033[31m'; yesil=$'\033[32m'; sari=$'\033[33m'; kalin=$'\033[1m'; sifirla=$'\033[0m'
baslik() { printf '\n%s▸ %s%s\n' "$kalin" "$1" "$sifirla"; }
iyi()    { printf '  %s✓%s %s\n' "$yesil" "$sifirla" "$1"; }
kotu()   { printf '  %s✗%s %s\n' "$kirmizi" "$sifirla" "$1"; }
uyari()  { printf '  %s!%s %s\n' "$sari" "$sifirla" "$1"; }

# Depo kökü — betik nereden çağrılırsa çağrılsın doğru yerde çalış.
KOK="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$KOK"

# Podfile'daki eklenti sayısı beklenen sayıdır: kilit ona uymak zorunda.
BEKLENEN=$(grep -c "^  pod '" ios/App/Podfile)

# ─── 0. Ortam ───────────────────────────────────────────────────────────────
baslik "Ortam denetimi"

if [[ "$(uname -s)" != "Darwin" ]]; then
  kotu "Bu betik macOS gerektirir (şu an: $(uname -s))."
  echo  "    CocoaPods yalnız Mac'te çalışır; Podfile.lock başka yerde üretilemez."
  exit 2
fi
iyi "macOS"

for arac in node npm; do
  command -v "$arac" >/dev/null 2>&1 || { kotu "$arac bulunamadı. https://nodejs.org üzerinden kur."; exit 2; }
done
iyi "node $(node --version) · npm $(npm --version)"

if ! command -v pod >/dev/null 2>&1; then
  kotu "CocoaPods (pod) bulunamadı."
  echo  "    Kur:  brew install cocoapods"
  echo  "    Homebrew yoksa:  sudo gem install cocoapods"
  exit 2
fi
iyi "CocoaPods $(pod --version)"

if ! xcode-select -p >/dev/null 2>&1; then
  kotu "Xcode komut satırı araçları kurulu değil."
  echo  "    Kur:  xcode-select --install"
  exit 2
fi
iyi "Xcode araçları: $(xcode-select -p)"

# ─── 1. Bağımlılıklar ───────────────────────────────────────────────────────
baslik "Bağımlılıklar (npm ci)"
# `npm ci` package-lock.json'a BİREBİR uyar. `npm install` sürümleri kaydırıp
# eklenti/Capacitor uyumsuzluğu doğurabilir — burada asla kullanma.
npm ci
iyi "node_modules kuruldu"

# ─── 2. Web paketi ──────────────────────────────────────────────────────────
baslik "Mobil paket (npm run build:mobile)"
# DİKKAT: düz `npm run build` DEĞİL. build:mobile, OYNA_MOBILE=1 ile derler ve
# admin panelini pakete KOYMAZ. Düz build ile arşivlersen yönetim yüzeyi
# oyuncunun telefonuna iner.
#
# `npm run sync:ios` de kullanılabilirdi ama araya `assets:generate` giriyor:
# o adım simgeleri sharp/libvips ile YENİDEN üretiyor. Simgeler zaten depoda,
# üretilmiş ve mağaza denetiminden geçmiş durumda — yani gereksiz. Gereksiz
# olduğu gibi, en kırılgan adım da o (yerel görüntü kütüphanesi, yeni Node
# sürümlerinde takılabiliyor). Kilidi onarmak için gereken şey değil,
# bu yüzden yolun dışında bırakıldı.
npm run build:mobile
iyi "dist üretildi (admin paneli hariç)"

# ─── 2b. Native eşitleme ────────────────────────────────────────────────────
baslik "iOS projesine eşitleme (npx cap sync ios)"
npx cap sync ios
iyi "web paketi ve eklenti listesi iOS projesine yazıldı"

# ─── 3. Eklentiler ──────────────────────────────────────────────────────────
baslik "Eklenti kurulumu (pod install)"
# cap sync zaten pod install çağırır; kilit bozuk olduğu için AÇIKÇA ve
# tek başına tekrar çalıştırıyoruz.
( cd ios/App && pod install )
iyi "pod install bitti"

# ─── 4. DOĞRULAMA — asıl mesele ─────────────────────────────────────────────
baslik "Doğrulama"

KILIT="ios/App/Podfile.lock"
[[ -f "$KILIT" ]] || { kotu "$KILIT üretilmemiş."; exit 1; }

# Yalnız PODS: bölümündeki en üst düzey satırları say (DEPENDENCIES ve
# SPEC CHECKSUMS bölümleri de aynı girintiyi kullanıyor).
BULUNAN=$(sed -n '/^PODS:/,/^DEPENDENCIES:/p' "$KILIT" | grep -c '^  - ' || true)

hata=0

if [[ "$BULUNAN" -eq "$BEKLENEN" ]]; then
  iyi "eklenti sayısı $BULUNAN/$BEKLENEN"
else
  kotu "eklenti sayısı $BULUNAN/$BEKLENEN — EKSİK"
  hata=1
fi

# Podfile'da adı geçen her eklenti kilitte de olmalı; hangisinin düştüğünü söyle.
while read -r ad; do
  if grep -q "  - $ad " "$KILIT" || grep -q "  - $ad (" "$KILIT"; then :; else
    kotu "kilitte yok: $ad"
    hata=1
  fi
done < <(grep -o "pod '[^']*'" ios/App/Podfile | sed "s/pod '//;s/'//")

# Apple ile Giriş ayrıca ve açıkça: gönderimi tek başına düşüren eklenti bu.
if grep -q 'CapacitorCommunityAppleSignIn' "$KILIT"; then
  iyi "Apple ile Giriş kilitte"
else
  kotu "APPLE İLE GİRİŞ KİLİTTE YOK — bu hâliyle arşivleme"
  hata=1
fi

if [[ "$hata" -ne 0 ]]; then
  printf '\n%s%sONARIM TAMAMLANMADI.%s Yukarıdaki çıktıyı olduğu gibi paylaş.\n' \
    "$kalin" "$kirmizi" "$sifirla"
  exit 1
fi

printf '\n%s%sPAKET ONARILDI.%s\n\n' "$kalin" "$yesil" "$sifirla"
echo "Sıradaki iki adım:"
echo
echo "  1) Kilidi depoya yaz — bir daha aynı duvara çarpma:"
echo "       git add ios/App/Podfile.lock"
echo "       git commit -m 'iOS: Podfile.lock $BEKLENEN eklentiyle yeniden uretildi'"
echo "       git push origin main"
echo
echo "  2) Xcode'da imzala ve arşivle:"
echo "       npx cap open ios"
echo "       Signing & Capabilities → Team seç"
echo "       Cihaz: Any iOS Device (arm64) → Product → Archive"
