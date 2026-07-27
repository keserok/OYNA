# Kılavuz Ekran Görüntüleri — Çekim Aracı

`docs/kilavuzlar/` altındaki kullanım kılavuzlarının ekran görüntülerini üretir.
Kılavuz metinleri görsellere referans veriyor; bu klasör o görselleri **tekrar
üretilebilir** şekilde çekmek içindir (elle çekim yok).

## Ön koşul: ağ izni

Çekim, uygulamayı gerçek Supabase'e karşı çalıştırır. Ortamın ağ izin listesinde
şu host **bulunmalıdır**:

```
iikvzgyccvgcybzdfwlv.supabase.co
```

Kontrol:

```bash
curl -s --noproxy '*' https://iikvzgyccvgcybzdfwlv.supabase.co/auth/v1/health
```

`{"date":...}` benzeri bir yanıt → izin var. `Host not in allowlist` → izin yok;
ortam ayarlarından eklenmeli (Claude Code on the web: ortamın *Network access*
bölümü). **Not:** ağ politikası konteyner başlarken uygulanır — izni yeni
eklediyseniz mevcut oturumda etkisiz kalabilir, yeni oturum gerekir.

## Çalıştırma

```bash
# 1) Yerel Supabase köprüsü (yalnız gerekiyorsa; canlıya bağlanılıyorsa atlanır)
node scripts/kilavuz-gorselleri/sb-shim.mjs &      # :54321

# 2) Uygulamalar
npm run dev -- --port 5199 --strictPort &          # oyuncu/kaleci/hakem/saha
npm run dev:admin &                                # admin paneli (:4005)

# 3) Çekim (rol bazlı)
node scripts/kilavuz-gorselleri/capture.mjs oyuncu
node scripts/kilavuz-gorselleri/capture.mjs kaleci
node scripts/kilavuz-gorselleri/capture.mjs hakem
node scripts/kilavuz-gorselleri/capture.mjs saha
OYNA_ADMIN_EMAIL=... OYNA_ADMIN_PASS=... \
  node scripts/kilavuz-gorselleri/capture.mjs admin
```

Çıktı: `docs/kilavuzlar/gorseller/<rol>/<sıra>-<ad>.png`
Beklenen dosya listesi: `gorsel-manifest.txt` (49 görsel).

- Mobil görünüm **390×844**, admin paneli **1440×900**, `deviceScaleFactor: 2`.
- Chromium hazır kurulu (`/opt/pw-browsers/chromium`) — `playwright install` çalıştırmayın.

## Kurallar

1. **Üretimde yazma yapılmaz.** Yalnız gezinme + ekran görüntüsü; onay/kaydet
   butonlarına basılmaz, veri değiştirilmez.
2. **Admin için geçici hesap** açılır (auth.users + admin_team_members
   SUPER_ADMIN), iş biter bitmez **silinir**.
3. Manifestte olup çekilemeyen bir görsel varsa, kılavuzdaki o referans satırı
   kaldırılır — kırık görsel bağlantısı bırakılmaz.
