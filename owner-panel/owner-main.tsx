import React from 'react';
import ReactDOM from 'react-dom/client';
import OwnerApp from './OwnerApp';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { initObservability } from '../utils/observability';

// FAZ 7.4 — Sentry/PostHog cephesi (env yoksa no-op).
initObservability();

const rootElement = document.getElementById('owner-root');
if (!rootElement) {
  throw new Error('owner-root elementi bulunamadı');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <OwnerApp />
    </ErrorBoundary>
  </React.StrictMode>,
);
