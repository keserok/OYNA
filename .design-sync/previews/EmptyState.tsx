import React from 'react';
import { EmptyState } from 'oyna-app';

// The DS is a dark, neon theme — every preview sits on the brand surface so the
// muted icon and light title read correctly. `ds-preview` forces
// framer-motion's frozen enter state to its final opaque render.
const Surface: React.FC<{ children: React.ReactNode; width?: number }> = ({ children, width }) => (
  <div
    className="ds-preview"
    style={{ background: '#0A0E14', padding: 24, borderRadius: 20, width: width ? width : 360 }}
  >
    {children}
  </div>
);

export const Default = () => (
  <Surface>
    <EmptyState />
  </Surface>
);

export const NoMatches = () => (
  <Surface>
    <EmptyState
      title="Henüz Maçın Yok"
      message="Yakınındaki maçları keşfet ve hemen katıl."
    />
  </Surface>
);

export const NoResults = () => (
  <Surface>
    <EmptyState
      title="Saha Bulunamadı"
      message="Seçtiğin filtrelere uygun saha yok. Filtreleri değiştirip tekrar dene."
    />
  </Surface>
);
