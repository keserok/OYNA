import React from 'react';
import { Dices } from 'lucide-react';
import TeamCrest, {
  CrestGenerated, CREST_SHAPES, CREST_PATTERNS, CREST_SYMBOLS,
  randomCrest, CrestShape, CrestPattern,
} from './TeamCrest';

// ================================================================
// CrestKitEditor — arma üreteci + forma renkleri (Spec J60-61)
// Takım Oluştur ②. adımın ve Takım Ayarları KİMLİK bölümünün ortak
// çekirdeği; iki yüzey aynı editörü paylaşır (tek makine ilkesi).
// ================================================================

// Küratörlü forma paleti (J61)
export const KIT_COLORS = [
  '#39FF14', '#E11D2E', '#7A0930', '#0B2A5B', '#1E6FD9', '#59C3F0',
  '#0E7A3C', '#F2C500', '#F97316', '#7C3AED', '#0A0E14', '#FFFFFF',
  '#94A3B8', '#14B8A6', '#EC4899', '#A16207',
];

// Hazır uyumlu ikililer
export const KIT_PAIRS: [string, string][] = [
  ['#E11D2E', '#FFFFFF'], ['#F2C500', '#0B2A5B'], ['#7A0930', '#1E6FD9'],
  ['#0A0E14', '#FFFFFF'], ['#0E7A3C', '#FFFFFF'], ['#59C3F0', '#0B2A5B'],
  ['#39FF14', '#0A0E14'], ['#7C3AED', '#F2C500'],
];

// İki renk çok yakınsa arma okunmaz — kontrast bekçisi (J61)
export const tooClose = (a: string, b: string): boolean => {
  const p = (h: string) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(h); if (!m) return null;
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const ca = p(a), cb = p(b);
  if (!ca || !cb) return false;
  const d = Math.sqrt((ca[0]-cb[0])**2 + (ca[1]-cb[1])**2 + (ca[2]-cb[2])**2);
  return d < 70;
};

export interface CrestKitPatch {
  crest?: CrestGenerated;
  color1?: string;
  color2?: string;
}

interface CrestKitEditorProps {
  crest: CrestGenerated;
  color1: string;
  color2: string;
  onChange: (patch: CrestKitPatch) => void;
}

const CrestKitEditor: React.FC<CrestKitEditorProps> = ({ crest, color1, color2, onChange }) => {
  const contrastWarn = tooClose(color1, color2);

  return (
    <div className="space-y-4">
      <button
        onClick={() => onChange({ crest: randomCrest() })}
        className="w-full min-h-[44px] rounded-2xl bg-white/5 border border-white/10 text-sm font-bold text-white/80 flex items-center justify-center gap-2 active:scale-[0.98]"
      >
        <Dices size={16} className="text-[#39FF14]" /> Rastgele Arma
      </button>

      <div>
        <div className="text-[0.625rem] font-extrabold uppercase tracking-widest text-ink-4 mb-2">Şekil</div>
        <div className="grid grid-cols-8 gap-1.5">
          {(Object.keys(CREST_SHAPES) as CrestShape[]).map(s => (
            <button
              key={s}
              onClick={() => onChange({ crest: { ...crest, shape: s } })}
              className={`aspect-square rounded-xl border flex items-center justify-center ${
                crest.shape === s ? 'border-[#39FF14] bg-[#39FF14]/10' : 'border-white/10 bg-white/4'
              }`}
            >
              <TeamCrest
                config={{ type: 'GENERATED', shape: s, pattern: 'solid', symbol: crest.symbol }}
                color1={color1} color2={color2} size={26}
              />
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="text-[0.625rem] font-extrabold uppercase tracking-widest text-ink-4 mb-2">Desen</div>
        <div className="grid grid-cols-5 gap-1.5">
          {CREST_PATTERNS.map(p => (
            <button
              key={p}
              onClick={() => onChange({ crest: { ...crest, pattern: p as CrestPattern } })}
              className={`aspect-square rounded-xl border flex items-center justify-center ${
                crest.pattern === p ? 'border-[#39FF14] bg-[#39FF14]/10' : 'border-white/10 bg-white/4'
              }`}
            >
              <TeamCrest
                config={{ ...crest, pattern: p as CrestPattern }}
                color1={color1} color2={color2} size={30}
              />
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="text-[0.625rem] font-extrabold uppercase tracking-widest text-ink-4 mb-2">Sembol</div>
        <div className="grid grid-cols-7 gap-1.5">
          {Object.entries(CREST_SYMBOLS).map(([key, { icon: Icon, label }]) => (
            <button
              key={key}
              title={label}
              onClick={() => onChange({ crest: { ...crest, symbol: key } })}
              className={`aspect-square rounded-xl border flex items-center justify-center ${
                crest.symbol === key ? 'border-[#39FF14] bg-[#39FF14]/10 text-white' : 'border-white/10 bg-white/4 text-white/50'
              }`}
            >
              <Icon size={17} />
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="text-[0.625rem] font-extrabold uppercase tracking-widest text-ink-4 mb-2">Hazır İkililer</div>
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
          {KIT_PAIRS.map(([a, b], i) => (
            <button
              key={i}
              onClick={() => onChange({ color1: a, color2: b })}
              className={`shrink-0 w-12 h-9 rounded-xl border overflow-hidden flex ${
                color1 === a && color2 === b ? 'border-[#39FF14]' : 'border-white/15'
              }`}
            >
              <span className="flex-1" style={{ backgroundColor: a }} />
              <span className="flex-1" style={{ backgroundColor: b }} />
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {(['color1', 'color2'] as const).map(ck => (
          <div key={ck}>
            <div className="text-[0.625rem] font-extrabold uppercase tracking-widest text-ink-4 mb-2">
              {ck === 'color1' ? 'Ana Renk' : 'İkincil Renk'}
            </div>
            <div className="grid grid-cols-8 gap-1">
              {KIT_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => onChange({ [ck]: c })}
                  aria-label={c}
                  className={`aspect-square rounded-lg border ${
                    (ck === 'color1' ? color1 : color2) === c ? 'border-white scale-110' : 'border-white/15'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      {contrastWarn && (
        <p className="text-[0.6875rem] text-amber-400/90">
          ⚠️ Renkler birbirine çok yakın — arma zor okunur. Farklı bir ikili dene.
        </p>
      )}
    </div>
  );
};

export default CrestKitEditor;
