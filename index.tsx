
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
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
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
