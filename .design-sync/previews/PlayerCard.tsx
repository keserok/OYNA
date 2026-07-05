import React from 'react';
import { PlayerCard } from 'oyna-app';

// Self-contained silhouette used as the hero photo (no external image host here).
const PHOTO =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%23223047'/%3E%3Cstop offset='1' stop-color='%230a0e14'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='240' height='240' fill='url(%23g)'/%3E%3Ccircle cx='120' cy='94' r='44' fill='%232f3b4f'/%3E%3Cpath d='M44 232c0-44 34-72 76-72s76 28 76 72z' fill='%232f3b4f'/%3E%3C/svg%3E";

// Builds a PlayerCardData payload; each stat is { value, videoUrl:null }.
const makeCard = (
  tier: 'gold' | 'silver' | 'bronze',
  overall: number,
  s: [number, number, number, number, number, number],
  wins: number,
  total: number,
  diamond: number,
) =>
  ({
    overall,
    tier,
    isStatsVerified: true,
    diamondValue: diamond,
    winCount: wins,
    totalMatches: total,
    stats: {
      pace: { value: s[0], videoUrl: null },
      shooting: { value: s[1], videoUrl: null },
      passing: { value: s[2], videoUrl: null },
      dribbling: { value: s[3], videoUrl: null },
      defense: { value: s[4], videoUrl: null },
      physical: { value: s[5], videoUrl: null },
    },
  } as any);

// Dark brand surface. `ds-preview` forces framer-motion frozen enter animations
// (holo shimmer / sweep / share button) to their final opaque state.
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
  <div style={{ width: 240 }}>{children}</div>
);

// Gold tier — holographic shimmer, green stat bars for the high values.
export const GoldTier = () => (
  <Surface>
    <Cell>
      <PlayerCard
        name="Yusuf Kılıç"
        photo={PHOTO}
        position="ST"
        cardData={makeCard('gold', 88, [90, 89, 84, 91, 42, 83], 74, 96, 1250)}
        onShare={() => {}}
      />
    </Cell>
  </Surface>
);

// Silver tier — cool metallic theme, mid-band amber stat bars.
export const SilverTier = () => (
  <Surface>
    <Cell>
      <PlayerCard
        name="Emre Şahin"
        photo={PHOTO}
        position="OS"
        cardData={makeCard('silver', 75, [76, 71, 78, 74, 68, 73], 41, 82, 540)}
        onShare={() => {}}
      />
    </Cell>
  </Surface>
);

// Bronze tier — warm copper theme, orange lower-band stat bars.
export const BronzeTier = () => (
  <Surface>
    <Cell>
      <PlayerCard
        name="Berkay Doğan"
        photo={PHOTO}
        position="STP"
        cardData={makeCard('bronze', 64, [61, 52, 60, 58, 66, 64], 19, 55, 180)}
        onShare={() => {}}
      />
    </Cell>
  </Surface>
);
