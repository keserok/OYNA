import React from 'react';
import { FifaCard } from 'oyna-app';

// Self-contained silhouette (no external image host in the render sandbox).
const AVATAR =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%23223047'/%3E%3Cstop offset='1' stop-color='%230a0e14'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='240' height='240' fill='url(%23g)'/%3E%3Ccircle cx='120' cy='94' r='44' fill='%232f3b4f'/%3E%3Cpath d='M44 232c0-44 34-72 76-72s76 28 76 72z' fill='%232f3b4f'/%3E%3C/svg%3E";

// Dark brand surface — the card themes (glass/neon/metallic) only read on #0A0E14.
// `ds-preview` forces framer-motion frozen enter animations to their opaque state.
const Surface: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    className="ds-preview"
    style={{
      background: '#0A0E14',
      padding: 28,
      borderRadius: 20,
      display: 'flex',
      flexWrap: 'wrap',
      gap: 20,
      alignItems: 'flex-start',
      justifyContent: 'center',
    }}
  >
    {children}
  </div>
);

const Cell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ width: 250 }}>{children}</div>
);

// Elite gold striker — rating on the 0-5 scale renders as *20 (4.55 -> 91).
export const EliteStriker = () => (
  <Surface>
    <Cell>
      <FifaCard
        rating={4.55}
        role="ST"
        name="Mert Aslan"
        avatar={AVATAR}
        isElite
        clubName="OYNA FC"
        stats={
          {
            label1: 'HIZ', val1: 92,
            label2: 'ŞUT', val2: 90,
            label3: 'PAS', val3: 84,
            label4: 'DRİ', val4: 89,
            label5: 'DEF', val5: 45,
            label6: 'FİZ', val6: 82,
          } as any
        }
      />
    </Cell>
  </Surface>
);

// Silver midfielder — rating 3.9 -> 78, lands in the silver tier band.
export const SilverMidfielder = () => (
  <Surface>
    <Cell>
      <FifaCard
        rating={3.9}
        role="CM"
        name="Kaan Yılmaz"
        avatar={AVATAR}
        clubName="OYNA FC"
        stats={
          {
            label1: 'HIZ', val1: 74,
            label2: 'ŞUT', val2: 71,
            label3: 'PAS', val3: 82,
            label4: 'DRİ', val4: 79,
            label5: 'DEF', val5: 70,
            label6: 'FİZ', val6: 76,
          } as any
        }
      />
    </Cell>
  </Surface>
);

// Goalkeeper role forces the neon-green keeper theme regardless of rating.
export const Goalkeeper = () => (
  <Surface>
    <Cell>
      <FifaCard
        rating={4.3}
        role="GOALKEEPER"
        name="Ozan Kaya"
        avatar={AVATAR}
        isElite
        clubName="OYNA FC"
        stats={
          {
            label1: 'REF', val1: 88,
            label2: 'POZ', val2: 85,
            label3: 'ELE', val3: 83,
            label4: 'DAL', val4: 87,
            label5: 'UZA', val5: 80,
            label6: 'FİZ', val6: 84,
          } as any
        }
      />
    </Cell>
  </Surface>
);

// Referee role forces the neon-blue official theme.
export const Referee = () => (
  <Surface>
    <Cell>
      <FifaCard
        rating={4.4}
        role="REFEREE"
        name="Deniz Şahin"
        avatar={AVATAR}
        clubName="OYNA HAKEM"
        stats={
          {
            label1: 'OTO', val1: 90,
            label2: 'KON', val2: 86,
            label3: 'KAR', val3: 88,
            label4: 'GÖR', val4: 85,
            label5: 'DEN', val5: 82,
            label6: 'FİZ', val6: 84,
          } as any
        }
      />
    </Cell>
  </Surface>
);
