import React from 'react';
import { BottomNav } from 'oyna-app';

// BottomNav renders position:fixed (bottom tab bar, full-width, max-w-lg centered)
// and its center action button sits raised above the bar (`-top-6`). `ds-preview`
// forces framer-motion's frozen enter animation to its final opaque state, and
// `ds-flatten` neutralises the fixed positioning + translate so the bar renders
// in-flow inside the card. Extra top padding gives the raised center button room.
const Dock: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    className="ds-preview ds-flatten"
    style={{
      background: '#0A0E14',
      padding: '48px 16px 20px',
      width: 420,
      borderRadius: 20,
    }}
  >
    {children}
  </div>
);

export const DashboardActive = () => (
  <Dock>
    <BottomNav currentView={'DASHBOARD' as any} onNavigate={() => {}} />
  </Dock>
);

export const SocialActive = () => (
  <Dock>
    <BottomNav currentView={'SOCIAL' as any} onNavigate={() => {}} />
  </Dock>
);

export const PitchDiscoveryActive = () => (
  <Dock>
    <BottomNav currentView={'PITCH_DISCOVERY' as any} onNavigate={() => {}} />
  </Dock>
);
