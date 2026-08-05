
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { UygulamaKapisi } from './components/UygulamaKapisi';
import { initObservability } from './utils/observability';
import { installOynaScrollSystem } from './utils/scrollSystem';

// FAZ 7.4 — Sentry/PostHog cephesi (env yoksa no-op).
initObservability();

// Kaydırma davranışı (yaylanma + uç sınırları) TEK yerden kurulur; bundan
// sonra eklenen ekranlar da otomatik olarak doğru davranır.
installOynaScrollSystem();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      {/* ACİL DURUM FRENLERİ — uygulamanın EN DIŞI.
          Bakım modu ve zorunlu güncelleme burada durdurur; içerideki hiçbir
          ekran, hiçbir ödeme çizilmez. En dışta olması bilinçli: rol ayrımı
          yapmaz, oyuncu/tesis sahibi/kaleci/hakem hepsi aynı frene takılır
          (kurucu kararı 4).
          Kapı sorulamazsa HİÇBİR ŞEY yapmaz — uygulama normal açılır. */}
      <UygulamaKapisi>
        <App />
      </UygulamaKapisi>
    </ErrorBoundary>
  </React.StrictMode>
);
