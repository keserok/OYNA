/// <reference types="vitest/config" />
import path from 'path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const ADMIN_DEV = process.env.ADMIN_DEV === '1';
const OWNER_DEV = process.env.OWNER_DEV === '1';

function ownerDevRedirect(): Plugin {
  return {
    name: 'owner-dev-root-redirect',
    configureServer(server) {
      if (!OWNER_DEV) return;
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0] ?? '';
        const qs = req.url?.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
        if (url === '/owner.html' || url === '/tesis') {
          req.url = `/owner-panel/owner.html${qs}`;
          next();
          return;
        }
        if (url === '/' || url === '/index.html') {
          res.writeHead(302, { Location: `/owner.html${qs}` });
          res.end();
          return;
        }
        next();
      });
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
    port: Number(process.env.PORT) || (ADMIN_DEV ? 4005 : OWNER_DEV ? 4006 : 4000),
    strictPort: ADMIN_DEV || OWNER_DEV,
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
    entries: ['index.html', 'admin-panel/admin.html', 'owner-panel/owner.html']
  },
  plugins: [ownerDevRedirect(), adminDevRedirect(), react(), tailwindcss()],
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        admin: path.resolve(__dirname, 'admin-panel/admin.html'),
        owner: path.resolve(__dirname, 'owner-panel/owner.html'),
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
