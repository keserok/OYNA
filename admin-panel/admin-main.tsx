import React from 'react';
import ReactDOM from 'react-dom/client';
import AdminApp from './AdminApp';
import { ErrorBoundary } from '../components/ErrorBoundary';

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
