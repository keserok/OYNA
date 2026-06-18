import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  use: {
    baseURL: 'http://localhost:4005',
    channel: 'chrome',
  },
  webServer: {
    command: 'ADMIN_DEV=1 PORT=4005 npx vite --host --strictPort',
    url: 'http://localhost:4005/admin.html',
    reuseExistingServer: true,
    timeout: 120000,
  },
});
