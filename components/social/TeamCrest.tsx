import React, { useId } from 'react';
import {
  Star, Zap, Flame, Crown, Swords, Trophy, Rocket, Anchor, Bird,
  PawPrint, Skull, Heart, Sun, Moon, Mountain, Waves, Target, Gem,
  Shield, CircleDot, type LucideIcon,
} from 'lucide-react';

// ================================================================
// TeamCrest — katmanlı SVG arma üreteci + görsel arma çizici (Spec J60)
// teams.crest_config jsonb'sini çizer:
//   { type: 'GENERATED', shape, pattern, symbol }  → şekil × desen × sembol × takım renkleri
//   { type: 'IMAGE', url }                          → yüklenen görsel
// Her boyutta keskin (SVG), depolama maliyeti sıfır (yalnız JSON).
// ================================================================

export interface CrestGenerated {
  type: 'GENERATED';
  shape: CrestShape;
  pattern: CrestPattern;
  symbol: CrestSymbol;
}
export interface CrestImage {
  type: 'IMAGE';
  url: string;
}
export type CrestConfig = CrestGenerated | CrestImage;

// ── Şekiller (8) — 100×100 viewBox içinde path'ler ──
export const CREST_SHAPES = {
  shield:   'M50 4 L92 16 V52 C92 74 74 92 50 97 C26 92 8 74 8 52 V16 Z',
  shieldModern: 'M14 8 H86 Q92 8 92 14 V56 Q92 82 50 96 Q8 82 8 56 V14 Q8 8 14 8 Z',
  circle:   'M50 5 A45 45 0 1 1 49.99 5 Z',
  hexagon:  'M50 4 L90 27 V73 L50 96 L10 73 V27 Z',
  badge:    'M50 4 L61 14 L76 12 L80 27 L94 34 L88 48 L94 62 L80 69 L76 84 L61 82 L50 92 L39 82 L24 84 L20 69 L6 62 L12 48 L6 34 L20 27 L24 12 L39 14 Z',
  diamond:  'M50 4 L94 50 L50 96 L6 50 Z',
  banner:   'M12 6 H88 V78 L50 96 L12 78 Z',
  round:    'M50 6 C74 6 92 22 92 46 C92 74 72 90 50 96 C28 90 8 74 8 46 C8 22 26 6 50 6 Z',
} as const;
export type CrestShape = keyof typeof CREST_SHAPES;

// ── Desenler (10) — şekle kırpılmış ikincil-renk katmanları ──
export const CREST_PATTERNS = [
  'solid', 'stripesV', 'stripesH', 'halfV', 'sash',
  'quarters', 'chevron', 'rays', 'border', 'innerCircle',
] as const;
export type CrestPattern = (typeof CREST_PATTERNS)[number];

// ── Semboller (20) — lucide ikonları, Türkçe etiketli ──
export const CREST_SYMBOLS: Record<string, { icon: LucideIcon; label: string }> = {
  star:     { icon: Star,      label: 'Yıldız' },
  zap:      { icon: Zap,       label: 'Şimşek' },
  flame:    { icon: Flame,     label: 'Alev' },
  crown:    { icon: Crown,     label: 'Taç' },
  swords:   { icon: Swords,    label: 'Kılıçlar' },
  trophy:   { icon: Trophy,    label: 'Kupa' },
  rocket:   { icon: Rocket,    label: 'Roket' },
  anchor:   { icon: Anchor,    label: 'Çapa' },
  bird:     { icon: Bird,      label: 'Kartal' },
  paw:      { icon: PawPrint,  label: 'Pençe' },
  skull:    { icon: Skull,     label: 'Kuru Kafa' },
  heart:    { icon: Heart,     label: 'Kalp' },
  sun:      { icon: Sun,       label: 'Güneş' },
  moon:     { icon: Moon,      label: 'Ay' },
  mountain: { icon: Mountain,  label: 'Dağ' },
  waves:    { icon: Waves,     label: 'Dalga' },
  target:   { icon: Target,    label: 'Hedef' },
  gem:      { icon: Gem,       label: 'Elmas' },
  shield:   { icon: Shield,    label: 'Kalkan' },
  ball:     { icon: CircleDot, label: 'Top' },
};
export type CrestSymbol = keyof typeof CREST_SYMBOLS | (string & {});

export const DEFAULT_CREST: CrestGenerated = {
  type: 'GENERATED', shape: 'shield', pattern: 'solid', symbol: 'star',
};

/** Rastgele hoş kombinasyon — sihirbazdaki 🎲 butonu (Spec J60). */
export const randomCrest = (): CrestGenerated => {
  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
  return {
    type: 'GENERATED',
    shape: pick(Object.keys(CREST_SHAPES) as CrestShape[]),
    pattern: pick(CREST_PATTERNS),
    symbol: pick(Object.keys(CREST_SYMBOLS)),
  };
};

/** Bilinmeyen/legacy config'i güvenli GENERATED'e indirger. */
export const normalizeCrest = (raw: unknown): CrestConfig => {
  const c = (raw ?? {}) as { type?: string; url?: string; shape?: string; pattern?: string; symbol?: string };
  if (c.type === 'IMAGE' && typeof c.url === 'string' && c.url) return { type: 'IMAGE', url: c.url };
  const shape: CrestShape = c.shape && c.shape in CREST_SHAPES ? (c.shape as CrestShape) : 'shield';
  const pattern: CrestPattern = c.pattern && (CREST_PATTERNS as readonly string[]).includes(c.pattern)
    ? (c.pattern as CrestPattern) : 'solid';
  const symbol = c.symbol && c.symbol in CREST_SYMBOLS ? c.symbol : 'star';
  return { type: 'GENERATED', shape, pattern, symbol };
};

// Sembol/kenar rengi: zemine göre otomatik kontrast (koyu zemin → beyaz)
const contrastOn = (hex: string): string => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '#FFFFFF';
  const n = parseInt(m[1], 16);
  const lum = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return lum > 150 ? '#0A0E14' : '#FFFFFF';
};

const PatternLayer: React.FC<{ pattern: CrestPattern; c2: string }> = ({ pattern, c2 }) => {
  switch (pattern) {
    case 'solid':      return null;
    case 'stripesV':   return <g fill={c2}>{[14, 38, 62, 86].map(x => <rect key={x} x={x - 6} y={0} width={12} height={100} />)}</g>;
    case 'stripesH':   return <g fill={c2}>{[20, 44, 68].map(y => <rect key={y} x={0} y={y - 5} width={100} height={10} />)}</g>;
    case 'halfV':      return <rect x={50} y={0} width={50} height={100} fill={c2} />;
    case 'sash':       return <polygon points="0,18 18,0 100,82 82,100" fill={c2} />;
    case 'quarters':   return <g fill={c2}><rect x={50} y={0} width={50} height={50} /><rect x={0} y={50} width={50} height={50} /></g>;
    case 'chevron':    return <polygon points="0,34 50,58 100,34 100,52 50,76 0,52" fill={c2} />;
    case 'rays':       return <g fill={c2}>{[0, 45, 90, 135].map(a => <rect key={a} x={46} y={-20} width={8} height={140} transform={`rotate(${a} 50 50)`} />)}</g>;
    case 'border':     return null; // kenarlık stroke olarak çizilir
    case 'innerCircle':return <circle cx={50} cy={46} r={26} fill={c2} />;
    default:           return null;
  }
};

interface TeamCrestProps {
  config?: unknown;      // teams.crest_config (jsonb) — normalize edilir
  color1?: string | null;
  color2?: string | null;
  size?: number;         // px — SVG her boyutta keskin
  className?: string;
}

const TeamCrest: React.FC<TeamCrestProps> = ({
  config, color1, color2, size = 44, className = '',
}) => {
  const uid = useId().replace(/[:]/g, '');
  const crest = normalizeCrest(config);
  const c1 = color1 || '#39FF14';
  const c2 = color2 || '#0A0E14';

  if (crest.type === 'IMAGE') {
    return (
      <img
        src={crest.url}
        alt="Takım arması"
        width={size}
        height={size}
        loading="lazy"
        className={`object-contain ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  const shapePath = CREST_SHAPES[crest.shape];
  const SymbolIcon = (CREST_SYMBOLS[crest.symbol] ?? CREST_SYMBOLS.star).icon;
  const symbolColor = crest.pattern === 'innerCircle' ? contrastOn(c2) : contrastOn(c1);

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="Takım arması"
    >
      <defs>
        <clipPath id={`crest-${uid}`}>
          <path d={shapePath} />
        </clipPath>
      </defs>
      {/* Zemin */}
      <path d={shapePath} fill={c1} />
      {/* Desen (şekle kırpılır) */}
      <g clipPath={`url(#crest-${uid})`}>
        <PatternLayer pattern={crest.pattern} c2={c2} />
      </g>
      {/* Kenarlık — 'border' deseni kalın, diğerleri ince */}
      <path
        d={shapePath}
        fill="none"
        stroke={crest.pattern === 'border' ? c2 : 'rgba(255,255,255,0.25)'}
        strokeWidth={crest.pattern === 'border' ? 7 : 2}
      />
      {/* Sembol — merkezde, hafif yukarıda */}
      <g transform="translate(30, 26)">
        <SymbolIcon width={40} height={40} color={symbolColor} strokeWidth={2.2} />
      </g>
    </svg>
  );
};

export default TeamCrest;
