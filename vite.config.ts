/// <reference types="vitest/config" />
import path from 'path';
import { readFileSync } from 'fs';
import type { Plugin } from 'vite';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const ADMIN_DEV = process.env.ADMIN_DEV === '1';
// Tek kaynak: tüm ekranlardaki sürüm rozetleri buradan (import.meta.env.VITE_APP_VERSION) okunur.
const APP_VERSION = (JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8')) as { version: string }).version;

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
  plugins: [adminDevRedirect(), react(), tailwindcss()],
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        admin: path.resolve(__dirname, 'admin-panel/admin.html'),
      },
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
