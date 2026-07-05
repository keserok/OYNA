import React from 'react';
import { Toast } from 'oyna-app';

// Toast renders position:fixed and enters with a framer-motion animation.
// `ds-preview` forces the enter animation to its final opaque state and
// `ds-flatten` neutralises the fixed positioning + translate so the toast
// renders in-flow, centred inside the card.
const Dock: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    className="ds-preview ds-flatten"
    style={{
      background: '#0A0E14',
      padding: 20,
      width: 360,
      borderRadius: 20,
      display: 'flex',
      justifyContent: 'center',
    }}
  >
    {children}
  </div>
);

export const Success = () => (
  <Dock>
    <Toast variant="success" message="Maç rezervasyonun onaylandı!" />
  </Dock>
);

export const Error = () => (
  <Dock>
    <Toast variant="error" message="İşlem tamamlanamadı, lütfen tekrar dene." />
  </Dock>
);
