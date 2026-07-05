import React from 'react';
import { ErrorState } from 'oyna-app';

// The capture harness freezes the clock, so framer-motion enter animations
// (initial opacity:0) never advance. Force elements to their final visible
// state — no scoped component uses intentional inline opacity for decoration.
const RESET = '[style*="opacity"]{opacity:1!important}';

const Surface: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ background: '#0A0E14', padding: 24, borderRadius: 20 }}>
    <style>{RESET}</style>
    {children}
  </div>
);

export const Default = () => (
  <Surface>
    <ErrorState onRetry={() => {}} />
  </Surface>
);

export const WithoutRetry = () => (
  <Surface>
    <ErrorState
      title="Bağlantı Kurulamadı"
      message="Sunucuya ulaşılamıyor. İnternet bağlantını kontrol edip tekrar dene."
    />
  </Surface>
);

export const CustomLabel = () => (
  <Surface>
    <ErrorState
      title="Ödeme Başarısız"
      message="Kart bilgilerin doğrulanamadı. Farklı bir yöntemle tekrar deneyebilirsin."
      retryLabel="Yeniden Öde"
      onRetry={() => {}}
    />
  </Surface>
);
