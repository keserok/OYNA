import React from 'react';
import { LoadingState } from 'oyna-app';

// The DS is a dark, neon theme — every preview sits on the brand surface so the
// neon spinner and muted label read correctly. `ds-preview` forces
// framer-motion's frozen enter state to its final opaque render.
const Surface: React.FC<{ children: React.ReactNode; width?: number }> = ({ children, width }) => (
  <div
    className="ds-preview"
    style={{
      background: '#0A0E14',
      padding: 24,
      borderRadius: 20,
      display: 'flex',
      flexWrap: 'wrap',
      gap: 8,
      alignItems: 'center',
      justifyContent: 'center',
      width: width ? width : undefined,
    }}
  >
    {children}
  </div>
);

export const Sizes = () => (
  <Surface>
    <LoadingState size="sm" message="Küçük" />
    <LoadingState size="md" message="Orta" />
    <LoadingState size="lg" message="Büyük" />
  </Surface>
);

export const Default = () => (
  <Surface width={360}>
    <LoadingState />
  </Surface>
);

export const CustomMessage = () => (
  <Surface width={360}>
    <LoadingState size="lg" message="Sahalar yükleniyor..." />
  </Surface>
);
