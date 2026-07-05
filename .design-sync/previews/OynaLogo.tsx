import React from 'react';
import { OynaLogo } from 'oyna-app';

// The brand emblem is a gold/amber stroke SVG designed for the dark surface.
// Explicit width/height keep it from rendering as a thin/zero-size floor card.
// `ds-preview` forces framer-motion's frozen enter state to its final opaque render.
const Surface: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    className="ds-preview"
    style={{
      background: '#0A0E14',
      padding: 28,
      borderRadius: 20,
      display: 'flex',
      flexWrap: 'wrap',
      gap: 32,
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    {children}
  </div>
);

export const Emblem = () => (
  <Surface>
    <OynaLogo width={200} height={200} />
  </Surface>
);

export const Sizes = () => (
  <Surface>
    <OynaLogo width={72} height={72} />
    <OynaLogo width={120} height={120} />
    <OynaLogo width={200} height={200} />
  </Surface>
);

export const Lockup = () => (
  <Surface>
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <OynaLogo width={88} height={88} />
      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
        <span style={{ fontSize: 34, fontWeight: 900, letterSpacing: '0.06em', color: '#FFFFFF' }}>
          OYNA
        </span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: '0.28em',
            textTransform: 'uppercase',
            color: '#FFC107',
            marginTop: 4,
          }}
        >
          Halı Saha
        </span>
      </div>
    </div>
  </Surface>
);
