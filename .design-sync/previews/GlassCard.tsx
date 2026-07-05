import React from 'react';
import { GlassCard } from 'oyna-app';

// GlassCard is a translucent glass container with no built-in padding, so every
// preview supplies real content in an inline-styled div (fixed width + padding).
// It reads correctly only on the dark brand surface — `ds-preview` also forces
// framer-motion's frozen enter state to its final opaque render.
const Surface: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    className="ds-preview"
    style={{
      background: '#0A0E14',
      padding: 24,
      borderRadius: 20,
      display: 'flex',
      flexWrap: 'wrap',
      gap: 16,
      alignItems: 'flex-start',
      justifyContent: 'center',
    }}
  >
    {children}
  </div>
);

const label: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  color: '#8B949E',
};

const Stat: React.FC<{ value: string; name: string; accent?: string }> = ({ value, name, accent }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
    <span style={{ fontSize: 22, fontWeight: 900, color: accent ?? '#FFFFFF', lineHeight: 1 }}>{value}</span>
    <span style={label}>{name}</span>
  </div>
);

export const MatchSummary = () => (
  <Surface>
    <GlassCard>
      <div style={{ padding: 20, width: 260 }}>
        <div style={label}>BUGÜN · 21:00</div>
        <div style={{ fontSize: 18, fontWeight: 900, color: '#FFFFFF', marginTop: 6 }}>
          Kadıköy Halı Saha
        </div>
        <div style={{ display: 'flex', gap: 28, marginTop: 18 }}>
          <Stat value="8/10" name="Kadro" />
          <Stat value="₺120" name="Kişi Başı" />
        </div>
      </div>
    </GlassCard>
  </Surface>
);

export const GlowHighlight = () => (
  <Surface>
    <GlassCard glow="#39FF14">
      <div style={{ padding: 20, width: 260 }}>
        <div style={{ ...label, color: '#39FF14' }}>● REZERVASYON ONAYLANDI</div>
        <div style={{ fontSize: 18, fontWeight: 900, color: '#FFFFFF', marginTop: 6 }}>
          Cuma · Ataşehir Arena
        </div>
        <div style={{ display: 'flex', gap: 28, marginTop: 18 }}>
          <Stat value="20:30" name="Başlangıç" />
          <Stat value="Saha 3" name="Konum" accent="#39FF14" />
        </div>
      </div>
    </GlassCard>
  </Surface>
);

export const Interactive = () => (
  <Surface>
    <GlassCard glow="#39FF14" onClick={() => {}}>
      <div
        style={{
          padding: 20,
          width: 260,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div>
          <div style={label}>SEVİYE 4 · ORTA SAHA</div>
          <div style={{ fontSize: 18, fontWeight: 900, color: '#FFFFFF', marginTop: 6 }}>
            Profilini Gör
          </div>
        </div>
        <span style={{ fontSize: 22, color: '#39FF14', fontWeight: 900 }}>›</span>
      </div>
    </GlassCard>
  </Surface>
);
