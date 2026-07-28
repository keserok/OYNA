import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, devices } from '@playwright/test';

const buDizin = path.dirname(fileURLToPath(import.meta.url));

// ─── Görsel Regresyon yapılandırması ─────────────────────────────────────────
// Hermetik: canlı backend YOK, ağ YOK (tests/visual/harness.ts hepsini keser).
// Kendi dev sunucusunu 4020'de yönetir; 4010'daki hermetik E2E ile çakışmaz.
//
// Çalıştırma:  npm run test:visual
// Referans güncelleme:  npm run test:visual:update

const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_PATH || '/opt/pw-browsers/chromium';
const PORT = Number(process.env.VISUAL_PORT || 4020);

export default defineConfig({
  testDir: './tests/visual',
  testMatch: /.*\.visual\.spec\.ts$/,
  timeout: 90_000,
  // Sıra dışı paralellik ekran görüntülerini kırılganlaştırmaz ama CPU
  // dalgalanması render zamanlamasını etkileyebilir — tek işçi ile koş.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],

  // Referanslar: tests/visual/__baseline__/<proje>/<ad>-<platform>.png
  // Platform eki ŞART: font rasterizasyonu işletim sistemine göre değişir.
  snapshotPathTemplate: '{testDir}/__baseline__/{projectName}/{arg}-{platform}{ext}',

  expect: {
    toHaveScreenshot: {
      // Anti-aliasing gürültüsüne tolerans; gerçek görsel bozukluk bunu aşar.
      maxDiffPixelRatio: 0.002,
      threshold: 0.2,
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
      stylePath: path.resolve(buDizin, 'tests/visual/screenshot.css'),
    },
  },

  use: {
    baseURL: process.env.VISUAL_BASE_URL || `http://localhost:${PORT}`,
    launchOptions: { executablePath: chromiumPath },
    locale: 'tr-TR',
    timezoneId: 'Europe/Istanbul',
    colorScheme: 'dark',
    // reducedMotion bu Playwright sürümünde yalnız contextOptions altında geçerli.
    contextOptions: { reducedMotion: 'reduce' },
    deviceScaleFactor: 1,
    trace: 'retain-on-failure',
  },

  projects: [
    {
      name: 'telefon',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: false },
    },
    {
      name: 'kucuk-telefon',
      use: { ...devices['Desktop Chrome'], viewport: { width: 360, height: 640 }, deviceScaleFactor: 1, isMobile: false },
    },
  ],

  webServer: {
    command: `npx vite --host --strictPort --port ${PORT}`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
