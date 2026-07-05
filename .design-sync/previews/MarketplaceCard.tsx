import React from 'react';
import { MarketplaceCard } from 'oyna-app';

// Self-contained silhouette avatar (no external image host in the render sandbox).
const AVATAR =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%23223047'/%3E%3Cstop offset='1' stop-color='%230a0e14'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='240' height='240' fill='url(%23g)'/%3E%3Ccircle cx='120' cy='94' r='44' fill='%232f3b4f'/%3E%3Cpath d='M44 232c0-44 34-72 76-72s76 28 76 72z' fill='%232f3b4f'/%3E%3C/svg%3E";

const goalkeeper: any = {
  id: 'gk1',
  name: 'Emre Yıldız',
  avatar: AVATAR,
  rating: 8.6,
  fee: 350,
  distance: '2.4',
  isElite: true,
  stats: { reflexes: 92, diving: 84, positioning: 88 },
};

const referee: any = {
  id: 'ref1',
  name: 'Canan Şahin',
  avatar: AVATAR,
  rating: 9.1,
  fee: 500,
  distance: '3.1',
  isElite: false,
  stats: { authority: 90, fitness: 78, communication: 85 },
};

// Capture freezes the clock → framer-motion enter animations stay at opacity:0.
// Force the final visible state (no scoped component uses decorative inline opacity).
const RESET = '[style*="opacity"]{opacity:1!important}';

const Surface: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ background: '#0A0E14', padding: 20, borderRadius: 20, width: 380 }}>
    <style>{RESET}</style>
    {children}
  </div>
);

export const GoalkeeperListing = () => (
  <Surface>
    <MarketplaceCard item={goalkeeper} type="GK" onClick={() => {}} />
  </Surface>
);

export const RefereeListing = () => (
  <Surface>
    <MarketplaceCard item={referee} type="REF" onClick={() => {}} />
  </Surface>
);
