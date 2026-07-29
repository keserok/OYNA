# Görsel Regresyon — Kullanım

**Neden var:** 623 birim testi mantığı doğrular, hiçbiri "ekran bozuldu mu?" sorusunu cevaplamaz.
Bu araç 12 ana ekranı 2 telefon genişliğinde render edip depodaki referans görüntülerle
**piksel piksel** karşılaştırır. "Sıfır görsel bozukluk" iddiası ancak bunun yeşil olmasıyla kanıtlanır.

| | |
|---|---|
| Yapılandırma | `playwright.visual.config.ts` |
| Testler | `tests/visual/screens.visual.spec.ts` |
| Koşum takımı | `tests/visual/harness.ts` |
| Referans görüntüler | `tests/visual/__baseline__/<proje>/<ad>-linux.png` (depoda) |
| Kapsam | 12 ekran × 2 viewport = **24 karşılaştırma** |

Ekranlar: Splash · Giriş · Ana Sayfa · Maç Lobisi · Maçlarım · Cüzdan · Ödeme · Saha Vitrini · Profil · Bildirimler · Ayarlar · Giriş Tanıtımı
Viewport'lar: `telefon` 390×844 · `kucuk-telefon` 360×640

---

## 1. Nasıl çalıştırılır

```bash
npm run test:visual
```

Dev sunucusunu (port 4020) kendisi başlatır, zaten çalışıyorsa yeniden kullanır.
Chromium önyüklü ortamda `/opt/pw-browsers/chromium` kullanılır; başka yolda ise
`PLAYWRIGHT_CHROMIUM_PATH` ile geçersiz kılınır. **`playwright install` gerekmez.**

Tek ekranı koşmak için:

```bash
npx playwright test --config playwright.visual.config.ts -g "03-ana-sayfa"
```

Bir test kırmızıya döndüğünde Playwright üç dosya bırakır:
`test-results/<test>/…-expected.png`, `…-actual.png`, `…-diff.png`.
**Önce `diff.png`'ye bak** — bozulan bölge kırmızı işaretlidir.

## 2. Referans görüntüler nasıl güncellenir

Referans yalnızca **kasıtlı** bir tasarım değişikliğinden sonra tazelenir.
Test kırmızı diye güncellemek, aracın tüm değerini yok eder.

```bash
npm run test:visual:update      # tümü
npx playwright test --config playwright.visual.config.ts -g "06-cuzdan" --update-snapshots   # tek ekran
```

Sonrasında **değişen PNG'leri gözle kontrol et**, sonra kod değişikliğiyle **aynı commit'te** ekle.
Commit mesajında hangi ekranların neden değiştiği tek cümleyle yazılmalı.

## 3. Bir paket sonrası nasıl doğrulanır

```bash
npx vitest run            # 61 dosya / 623 test — mantık
npm run test:visual       # 24 karşılaştırma — görüntü
```

Karar tablosu:

| Sonuç | Anlamı | Yapılacak |
|---|---|---|
| İkisi de yeşil | Paket ne mantığı ne görüntüyü bozdu | Devam |
| Görsel kırmızı, değişiklik **kasıtsız** | Regresyon yakalandı | Kodu düzelt, referansa dokunma |
| Görsel kırmızı, değişiklik **kasıtlı** | Tasarım değişti | `diff.png`'yi doğrula → `test:visual:update` → aynı commit |
| Birim kırmızı | Mantık bozuldu | Görsele bakmadan önce onu çöz |

## 4. Test neden kırılgan değil

| Risk | Önlem |
|---|---|
| Ağ / canlı Supabase | Yerel olmayan **her** istek `harness.ts` içinde route ile karşılanır. Ağ isteyen tek satır yok. Supabase REST/RPC deterministik **boş** sonuç döner → ekranlar boş-durumda render edilir. |
| Google Fonts | Dış istek boş 200 ile karşılanır; yazı tipi her ortamda aynı sistem yedeğine düşer. Font yüklemesi `document.fonts.status === 'loaded'` ile beklenir. |
| Zaman ("2 saat önce") | `page.clock.setFixedTime(2026-03-01T12:00:00Z)`. Oturum token'ının süresi de gerçek saatten değil bu sabit zamandan türetilir. |
| CSS animasyon / geçiş | `animations: 'disabled'` + `tests/visual/screenshot.css` (süre 0, imleç saydam, kaydırma çubuğu gizli). |
| framer-motion (`repeat: Infinity`) | CSS ile durdurulamaz. `MotionGlobalConfig.skipAnimations = true` — framer-motion'ın resmî test anahtarı; animasyon başlatılmaz, değer son kareye atlar. **Bu olmadan Ana Sayfa'da ardışık iki kare bile eşleşmiyordu (%19,6 piksel farkı).** |
| Yanlış ekranın referans kaydedilmesi | Her testte görüntüden **önce** ekrana özgü bir çapa metin görünür olmalı. |
| Sessiz JS hatası | `pageerror` toplanır; görüntü eşleşse bile test kırmızıya döner. |

**Doğrulandı:** `index.css`'e tek satır `letter-spacing: 0.6px` eklendiğinde her iki viewport'ta da
test kırmızıya döndü. Araç gerçekten ölçüyor.

## 5. Sınırlar (bilerek)

- **Viewport kadrajı**, tam sayfa değil. Katlama altındaki içerik kapsam dışıdır.
- **Boş-durum** ekranları karşılaştırılır (dolu liste/kart varyantları henüz yok).
  Kabuk, başlık, boşluk, tipografi ve renk regresyonlarını yakalar; veri yoğun düzenleri yakalamaz.
- **Yalnızca `vite dev` sunucusuna karşı çalışır.** Ekranlara gitmek için store'a
  `import('/store.ts')` ile erişilir; bu Vite'ın modül URL'lerine dayanır. Uygulama kodu değişmez.
- **Referanslar Linux + Chromium'a özgüdür** (`-linux.png`). Font rasterizasyonu işletim
  sistemine göre değişir; macOS'ta üretilen referans CI'da tutmaz. Referanslar CI ile aynı
  ortamda üretilmelidir.

## 6. Yeni ekran ekleme

`tests/visual/screens.visual.spec.ts` içindeki `EKRANLAR` dizisine bir kayıt ekle:

```ts
{
  ad: '13-yeni-ekran',                                  // referans dosya adı
  capa: /Ekranda görünen bir metin/i,                    // açıldığını doğrular
  ac: async (page) => { await hazirla(page); await ekranaGit(page, 'VIEW_ADI'); },
}
```

Ekran ek durum istiyorsa (ör. ödeme bağlamı) `harness.ts`'e `odemeBaglamiTohumla` gibi bir
tohumlayıcı ekle. Sonra `npm run test:visual:update` ile referansı üret ve **gözle doğrula**.
