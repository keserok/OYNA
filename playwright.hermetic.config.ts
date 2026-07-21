import { defineConfig } from '@playwright/test';

// Hermetik E2E — canlı backend YOK. Supabase çağrıları test içinde route ile
// stub'lanır; oturum localStorage'a tohumlanır. Sandbox'ta ve CI'da çalışır.
// Dev sunucusu ayrıca başlatılır (port 4010); bu config webServer yönetmez.
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:4010',
    // Yönetilen sandbox'ta önyüklü Chromium; CI'da PLAYWRIGHT_CHROMIUM_PATH ile
    // ya da bundled Chromium ile çalışır (env yoksa Playwright varsayılanı).
    ...(process.env.PLAYWRIGHT_CHROMIUM_PATH || '/opt/pw-browsers/chromium'
      ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || '/opt/pw-browsers/chromium' } }
      : {}),
  },
  // Dev sunucusunu kendisi yönetir (4010); zaten çalışıyorsa yeniden kullanır.
  webServer: {
    command: 'npx vite --host --strictPort --port 4010',
    url: 'http://localhost:4010/',
    reuseExistingServer: true,
    timeout: 120000,
  },
});
