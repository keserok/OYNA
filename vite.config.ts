/// <reference types="vitest/config" />
import path from 'path';
import { readFileSync, existsSync, copyFileSync } from 'fs';
import type { Plugin } from 'vite';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const ADMIN_DEV = process.env.ADMIN_DEV === '1';
// Faz B (ayrıştırma): APP_TARGET ile tek build hedefi seçilir.
//   'app'   → yalnız index.html (mobil/Capacitor ve ana web domain'i; admin kodu SIFIR)
//   'admin' → yalnız admin-panel/admin.html (ayrı yönetim domain'i)
//   (tanımsız) → ikisi birden (geçiş dönemi / tek Vercel projesi)
const APP_TARGET = process.env.APP_TARGET as 'app' | 'admin' | undefined;
const MAIN_INPUT = path.resolve(__dirname, 'index.html');
const ADMIN_INPUT = path.resolve(__dirname, 'admin-panel/admin.html');
const BUILD_INPUT =
  APP_TARGET === 'app' ? { main: MAIN_INPUT }
  : APP_TARGET === 'admin' ? { admin: ADMIN_INPUT }
  : { main: MAIN_INPUT, admin: ADMIN_INPUT };
// Tek kaynak: tüm ekranlardaki sürüm rozetleri buradan (import.meta.env.VITE_APP_VERSION) okunur.
const APP_VERSION = (JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8')) as { version: string }).version;

// Faz B: admin hedefi derlenince, ayrık Vercel projesinin generic rewrite'ı
// (/(.*) → /index.html) çalışsın diye admin girişini kök index.html'e kopyala.
// Böylece Vercel'de Build Command'e dokunmaya gerek YOK — yalnız APP_TARGET=admin
// env değişkeni yeterli (default `vite build` bu plugin sayesinde finalize eder).
function adminIndexAlias(): Plugin {
  return {
    name: 'admin-index-alias',
    apply: 'build',
    closeBundle() {
      if (APP_TARGET !== 'admin') return;
      const dist = path.resolve(__dirname, 'dist');
      const src = path.join(dist, 'admin-panel', 'admin.html');
      const dest = path.join(dist, 'index.html');
      if (existsSync(src)) {
        copyFileSync(src, dest);
        // eslint-disable-next-line no-console
        console.log('\n✓ Admin girişi kök index.html olarak yayınlandı (dist/index.html).');
      }
    },
  };
}

function adminDevRedirect(): Plugin {
  return {
    name: 'admin-dev-root-redirect',
    configureServer(server) {
      if (!ADMIN_DEV) return;
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0] ?? '';
        if (url === '/admin.html') {
          req.url = `/admin-panel/admin.html${req.url?.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''}`;
          next();
          return;
        }
        if (url === '/' || url === '/index.html') {
          const qs = req.url?.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
          res.writeHead(302, { Location: `/admin.html${qs}` });
          res.end();
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  server: {
    port: Number(process.env.PORT) || (ADMIN_DEV ? 4005 : 4000),
    strictPort: ADMIN_DEV,
    host: '0.0.0.0',
    watch: {
      ignored: [
        '**/ios/**',
        '**/android/**',
        '**/arsiv/**',
        '**/node_modules/**',
        '**/node_modules_local/**',
        '**/node_modules_old/**',
        '**/dist/**',
        '**/.git/**',
        '**/.cursor/**',
        '**/.claude/**'
      ]
    }
  },
  optimizeDeps: {
    entries: ['index.html', 'admin-panel/admin.html']
  },
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(APP_VERSION),
  },
  plugins: [adminIndexAlias(), adminDevRedirect(), react(), tailwindcss()],
  build: {
    rollupOptions: {
      input: BUILD_INPUT,
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'supabase-vendor': ['@supabase/supabase-js'],
          'ui-vendor': ['framer-motion', 'lucide-react', 'recharts']
        }
      }
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    }
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    globals: true,
  },
});
