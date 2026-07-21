import { defineConfig } from '@playwright/test';

// Tarayıcı seçimi ortama göre:
//  - PLAYWRIGHT_CHROMIUM_PATH set → o executable (yönetilen ortamlar)
//  - PLAYWRIGHT_CHANNEL=chrome → yereldeki Chrome kanalı
//  - varsayılan → Playwright'in bundled Chromium'u (CI: playwright install chromium)
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
const channel = process.env.PLAYWRIGHT_CHANNEL;

export default defineConfig({
  testDir: './tests',
  // Hermetik E2E'ler kendi config'iyle çalışır (playwright.hermetic.config.ts) —
  // bu (canlı) config onları çalıştırmaya kalkmasın.
  testIgnore: ['**/e2e/**'],
  use: {
    baseURL: 'http://localhost:4005',
    ...(chromiumPath
      ? { launchOptions: { executablePath: chromiumPath } }
      : channel
      ? { channel }
      : {}),
  },
  webServer: {
    command: 'ADMIN_DEV=1 PORT=4005 npx vite --host --strictPort',
    url: 'http://localhost:4005/admin.html',
    reuseExistingServer: true,
    timeout: 120000,
  },
});
