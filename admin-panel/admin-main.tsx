import React from 'react';
import ReactDOM from 'react-dom/client';
import AdminApp from './AdminApp';
import { ErrorBoundary } from '../components/ErrorBoundary';

// ─── Deploy-sonrası "bayat parça" kendini iyileştirme ─────────────────────────
// SPA sekmesi açıkken yeni bir sürüm yayınlanınca eski hash'li JS parçaları silinir;
// panel yeni bir ekrana geçmeye çalışınca artık var olmayan o parçayı çekemez →
// "Failed to fetch". Çözüm: parça (dinamik-import) yükleme hatasını yakala ve sayfayı
// BİR KEZ yenile → güncel parçalar gelir, hata kaybolur. Kısa süreli kilit sonsuz
// döngüyü engeller. Genel ağ/Supabase hatalarını TETİKLEMEZ — yalnız chunk hataları.
function reloadForStaleChunk(reason: string): void {
  try {
    const KEY = 'oyna_admin_chunk_reload_at';
    const now = Date.now();
    const last = Number(sessionStorage.getItem(KEY) || '0');
    if (now - last < 15000) return; // yakın zamanda yenilendi → döngüye girme
    sessionStorage.setItem(KEY, String(now));
    console.warn('[Admin] Güncel sürüm parçası yüklenemedi, sayfa yenileniyor:', reason);
    window.location.reload();
  } catch {
    /* sessionStorage erişilemezse sessiz geç */
  }
}

// Vite'ın dinamik-import önyükleme hatası için resmi olay.
window.addEventListener('vite:preloadError', (e: Event) => {
  e.preventDefault();
  reloadForStaleChunk('vite:preloadError');
});

// Yedek: yakalanmamış import() reddi (yalnız chunk hatası kalıbında).
window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
  const reason = e.reason as { message?: string } | string | undefined;
  const msg = typeof reason === 'string' ? reason : reason?.message ?? '';
  if (/failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|loading chunk \S+ failed|chunkloaderror/i.test(msg)) {
    reloadForStaleChunk(msg.slice(0, 100));
  }
});

const rootElement = document.getElementById('admin-root');
if (!rootElement) {
  throw new Error('admin-root elementi bulunamadı');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AdminApp />
    </ErrorBoundary>
  </React.StrictMode>,
);
