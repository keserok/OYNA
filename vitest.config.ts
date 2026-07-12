/// <reference types="vitest" />
import path from 'path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * Ayrı Vitest v4 yapılandırması.
 * @tailwindcss/vite eklentisi testlerde kasılmaya neden olduğu için dahil edilmez.
 * Tüm testler jsdom ortamında çalışır; bileşen testleri ve saf birim testleri
 * ikisi de jsdom'da sorunsuz çalışır.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    globals: true,
    // Tüm testler jsdom ortamında çalışır
    // (bileşen testleri için gereklidir; saf birim testleri de uyumludur)
    environment: 'jsdom',
    setupFiles: [path.resolve(__dirname, 'tests/setup.ts')],
    // CSS modül dönüşümünü devre dışı bırak
    css: false,
    // Timeout 15 saniye
    testTimeout: 15000,
    // Vitest v4 pool ayarı
    pool: 'forks',
  },
});
