import path from 'path';
import { readFileSync } from 'fs';
import type { Plugin } from 'vite';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const ADMIN_DEV = process.env.ADMIN_DEV === '1';
// MOBİL PAKET DERLEMESİ (npm run build:mobile → sync:ios / sync:android).
// Admin paneli AYRI bir giriş noktasıdır ve `dist/` içine kendi HTML+JS'iyle
// yazılır; `npx cap sync` ise dist'in TAMAMINI native pakete kopyalar. Yani
// oyuncunun telefonuna yönetim panelinin tüm ekranları da iniyordu: yaklaşık
// 1 MB ölü ağırlık ve mağaza paketinde hiç bulunmaması gereken bir yüzey.
// Bu bayrak açıkken admin girişi derlemeye HİÇ alınmaz.
const MOBIL_PAKET = process.env.OYNA_MOBILE === '1';
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

/**
 * MOBİL PAKET BEKÇİSİ — mağazaya yanlış ayarla derlenmiş paket gitmesin.
 *
 * İki gerçek tuzak var ve ikisi de sessizdir; paket derlenir, imzalanır,
 * yüklenir ve hata ancak kullanıcıda görülür:
 *
 *   1. `VITE_DEMO_ACCOUNTS=true` — demo hesap kataloğu ve ORTAK ŞİFRE paketin
 *      JS'ine harfi harfine girer. Katalogda gerçek saha sahibi hesapları var;
 *      paketi açan biri kimlikleri okuyup web üzerinden o hesaplara girebilir.
 *   2. `VITE_SUPABASE_URL` yerel bir adres (localhost / 127.0.0.1) — test için
 *      bırakılmış bir `.env` ile derlenen uygulama telefonda HİÇBİR ŞEYE
 *      bağlanamaz; açılış ekranında kalır. Mağaza incelemesi "uygulama
 *      çalışmıyor" diye reddeder.
 *
 * Bekçi yalnız MOBİL derlemede (npm run build:mobile) çalışır ve derlemeyi
 * DURDURUR. Uyarı yazıp devam etmek işe yaramaz — kimse okumaz.
 */
function mobilPaketBekcisi(): Plugin {
  return {
    name: 'oyna-mobil-paket-bekcisi',
    apply: 'build',
    config(_config, { mode }) {
      if (!MOBIL_PAKET) return;
      const env = loadEnv(mode, process.cwd(), '');
      const hatalar: string[] = [];

      if (env.VITE_DEMO_ACCOUNTS === 'true') {
        hatalar.push(
          'VITE_DEMO_ACCOUNTS=true — demo hesap kataloğu ve ortak şifre pakete girer. ' +
          '.env dosyasında false yap (ya da satırı sil).',
        );
      }

      const url = env.VITE_SUPABASE_URL || '';
      if (/localhost|127\.0\.0\.1|0\.0\.0\.0/.test(url)) {
        hatalar.push(
          `VITE_SUPABASE_URL yerel adrese bakıyor (${url}) — telefonda hiçbir veri gelmez. ` +
          'Canlı proje adresini yaz.',
        );
      }

      if (hatalar.length > 0) {
        throw new Error(
          '\n\n  MOBİL PAKET DERLEMESİ DURDURULDU\n' +
          hatalar.map(h => `   · ${h}`).join('\n') +
          '\n\n  (Bu bekçi yalnız `npm run build:mobile` sırasında çalışır.)\n',
        );
      }
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
  plugins: [mobilPaketBekcisi(), adminDevRedirect(), react(), tailwindcss()],
  build: {
    rollupOptions: {
      input: MOBIL_PAKET
        ? { main: path.resolve(__dirname, 'index.html') }
        : {
            main: path.resolve(__dirname, 'index.html'),
            admin: path.resolve(__dirname, 'admin-panel/admin.html'),
          },
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'supabase-vendor': ['@supabase/supabase-js'],
          // [P-7] 'recharts' BU LİSTEDEN ÇIKARILDI.
          // Sebep: framer-motion App.tsx:2'de statik import edildiği için
          // ui-vendor ilk yükte iniyor. recharts'ın tek kullanıcısı ise
          // admin-panel/views/pages/DashboardPage.tsx — yani grafik kütüphanesi
          // her oyuncunun telefonuna gereksiz iniyordu.
          // Listeden çıkarılınca Vite onu kendi lazy chunk'ına ayırır ve
          // yalnız admin paneli açılınca iner.
          'ui-vendor': ['framer-motion', 'lucide-react']
        }
      }
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    }
  },

});
