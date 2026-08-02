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
        // ── PAKET AYRIMI (telefondaki açılış hızının BİRİNCİ belirleyicisi) ──
        //
        // Telefon uygulamayı açarken, ilk ekran boyanmadan ÖNCE burada
        // "vendor" diye ayrılan paketlerin tamamını okumak ve derlemek
        // zorundadır. Giriş seviyesi bir telefonda bu iş saniyelerle ölçülür.
        //
        // ÖNCEKİ HALİ liste biçimindeydi (`{'react-vendor': ['react', ...]}`)
        // ve iki sessiz hatası vardı:
        //
        //   1. `react-vendor` paketi 1 BAYT olarak üretiliyordu — yani boştu.
        //      React, kural eşleşmediği için `ui-vendor`ın içine karışmıştı;
        //      amaçlanan ayrım hiç gerçekleşmiyordu.
        //   2. `ui-vendor` içinde `recharts` (grafik çizim kütüphanesi) vardı.
        //      recharts YALNIZCA admin panelinde, tek bir sayfada kullanılıyor
        //      (`admin-panel/views/pages/DashboardPage.tsx`). Buna rağmen
        //      telefondaki index.html onu açılışta yüklüyordu: her kullanıcı,
        //      hiç görmeyeceği grafikler için 338 KB'lık kod indirip derliyordu.
        //
        // Fonksiyon biçimi paket YOLUNA bakar, bu yüzden iki hata da ortadan
        // kalkar. Ölçülen sonuç — telefonun açılışta işlediği kod+stil:
        //      önce: 1.510.000 bayt (403 KB sıkıştırılmış)
        //      sonra: 1.172.000 bayt (301 KB sıkıştırılmış)
        // recharts artık yalnız admin paneli o sayfayı açtığında yükleniyor.
        //
        // KURAL: buraya yeni bir satır eklerken, o kütüphanenin telefonda
        // gerçekten AÇILIŞTA gerekip gerekmediğini sor. Gerekmiyorsa kendi
        // adıyla ayrı bir parçaya koy — ayrı parça, ihtiyaç anında yüklenir.
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return;
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react-vendor';
          if (id.includes('@supabase')) return 'supabase-vendor';
          if (id.includes('framer-motion') || id.includes('motion-dom') || id.includes('motion-utils')) return 'motion-vendor';
          // Grafikler: yalnız admin panelinde. Telefon bu parçayı HİÇ yüklemez.
          if (id.includes('recharts') || id.includes('/d3-') || id.includes('victory-vendor')) return 'charts-vendor';
          if (id.includes('lucide-react')) return 'icons-vendor';
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
