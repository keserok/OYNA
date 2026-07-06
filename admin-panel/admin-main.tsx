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
const CHUNK_RELOAD_AT = 'oyna_admin_chunk_reload_at';
const CHUNK_RELOAD_N = 'oyna_admin_chunk_reload_n';
const CHUNK_RELOAD_MAX = 2;

/**
 * Bayat parça (chunk) hatası → BİR KEZ yenile. ÖNEMLİ: en fazla CHUNK_RELOAD_MAX
 * kez; sonra DUR ve kullanıcıya elle yenileme mesajı göster. Aksi hâlde (ör. CDN
 * eski index.html'i sunmaya devam ederse) sayfa "sürekli dönüyor" gibi sonsuz
 * yenilenme döngüsüne girerdi. Panel başarıyla açılınca sayaç sıfırlanır
 * (AdminApp içinde).
 */
function reloadForStaleChunk(reason: string): void {
  try {
    const now = Date.now();
    const last = Number(sessionStorage.getItem(CHUNK_RELOAD_AT) || '0');
    const count = Number(sessionStorage.getItem(CHUNK_RELOAD_N) || '0');
    if (now - last < 15000) return; // yakın zamanda yenilendi → çok hızlı döngüyü engelle
    if (count >= CHUNK_RELOAD_MAX) {
      console.error('[Admin] Güncel parça yüklenemedi; otomatik yenileme durduruldu:', reason);
      showStaleChunkNotice();
      return;
    }
    sessionStorage.setItem(CHUNK_RELOAD_AT, String(now));
    sessionStorage.setItem(CHUNK_RELOAD_N, String(count + 1));
    console.warn('[Admin] Güncel sürüm parçası yüklenemedi, sayfa yenileniyor:', reason);
    window.location.reload();
  } catch {
    /* sessionStorage erişilemezse sessiz geç */
  }
}

/** Otomatik yenileme döngüsü durdurulunca kullanıcıya elle yenileme kapısı. */
function showStaleChunkNotice(): void {
  if (typeof document === 'undefined' || document.getElementById('oyna-stale-chunk-notice')) return;
  const el = document.createElement('div');
  el.id = 'oyna-stale-chunk-notice';
  el.setAttribute('style', [
    'position:fixed', 'inset:0', 'z-index:99999', 'display:flex',
    'flex-direction:column', 'align-items:center', 'justify-content:center',
    'gap:20px', 'padding:24px', 'background:#050812', 'color:#fff',
    'font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif', 'text-align:center',
  ].join(';'));
  el.innerHTML =
    '<div style="font-size:20px;font-weight:900">Yeni sürüm yüklendi</div>' +
    '<div style="font-size:14px;color:#9aa4b2;max-width:340px;line-height:1.5">' +
    'Panelin güncel sürümüne geçmek için sayfayı yenile. Sorun sürerse tarayıcı ' +
    'önbelleğini temizleyip (Ctrl+Shift+R) tekrar dene.</div>';
  const btn = document.createElement('button');
  btn.textContent = 'Yenile';
  btn.setAttribute('style', [
    'height:52px', 'padding:0 32px', 'border:none', 'border-radius:16px',
    'background:#FACC15', 'color:#000', 'font-weight:900', 'font-size:14px',
    'letter-spacing:1px', 'text-transform:uppercase', 'cursor:pointer',
  ].join(';'));
  btn.onclick = () => {
    try {
      sessionStorage.removeItem(CHUNK_RELOAD_AT);
      sessionStorage.removeItem(CHUNK_RELOAD_N);
    } catch { /* yok say */ }
    // Önbelleği atlamak için sorgu parametresiyle taze yükle.
    window.location.href = window.location.pathname + '?_r=' + Date.now();
  };
  el.appendChild(btn);
  document.body.appendChild(el);
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
