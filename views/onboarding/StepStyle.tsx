import React from 'react';
import { Flame, Brain, Leaf } from 'lucide-react';
import { PlayStyle, PLAY_STYLE_META } from './onboardingShared';

interface StepStyleProps {
  style: PlayStyle;
  onChange: (s: PlayStyle) => void;
}

interface StyleDef {
  key: Exclude<PlayStyle, ''>;
  name: string;
  desc: string;
  icon: React.ElementType;
  stats: { tempo: number; plan: number; keyif: number };
}

/** IP-09: renk artık burada tanımlanmıyor — `PLAY_STYLE_META` tek kaynak.
    Önceden bu dosya kendi paletini yazıyordu (Ciddi amber, Taktiksel açık mavi)
    ve bir sonraki ekran (PlayerCardReveal) başka renkler gösteriyordu; aynı
    etiket iki ekranda iki renkti. */
const STYLES: StyleDef[] = [
  { key: 'ciddi', name: 'Ciddi', desc: 'Kazanmak için oyna, her maç önemli.', icon: Flame, stats: { tempo: 95, plan: 70, keyif: 55 } },
  { key: 'taktiksel', name: 'Taktiksel', desc: 'Plan yap, pozisyonunu koru, akıllı oyna.', icon: Brain, stats: { tempo: 65, plan: 95, keyif: 70 } },
  { key: 'rahat', name: 'Rahat', desc: 'Keyif için oyna; önemli olan katılmak.', icon: Leaf, stats: { tempo: 55, plan: 50, keyif: 98 } },
];

const StatBar: React.FC<{ label: string; value: number; color: string; active: boolean }> = ({ label, value, color, active }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
    <span style={{ fontSize: 8, fontWeight: 900, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.5)', width: 32 }}>{label}</span>
    <div style={{ flex: 1, height: 4, borderRadius: 3, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
      <div style={{ height: '100%', borderRadius: 3, background: color, width: active ? `${value}%` : '0%', transition: 'width 0.6s cubic-bezier(0.22,1,0.36,1)' }} />
    </div>
  </div>
);

/** Adım 3 · Stil (3D kart yelpazesi). Bir stil seçimi zorunludur. */
const StepStyle: React.FC<StepStyleProps> = ({ style, onChange }) => {
  return (
    <div className="flex-1 flex items-center justify-center" style={{ perspective: '900px', animation: 'obStepIn 0.55s cubic-bezier(0.22,1,0.36,1) both' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        {STYLES.map((s, i) => {
          const sel = style === s.key;
          const offset = i - 1; // -1, 0, +1
          const Icon = s.icon;
          const color = PLAY_STYLE_META[s.key].color;
          return (
            <button
              key={s.key}
              onClick={() => onChange(s.key)}
              style={{
                position: 'relative', width: 108, minHeight: 220, borderRadius: 18, cursor: 'pointer',
                padding: 14, textAlign: 'left',
                background: 'linear-gradient(160deg, rgba(255,255,255,0.06), rgba(10,14,20,0.5))',
                /* IP-09: seçim bir ETKİLEŞİM durumudur (rol 2) → birincil renk.
                   Kategori rengi kartın içeriğinde kalır, çerçevede değil. */
                border: `1.5px solid ${sel ? '#39FF14' : 'rgba(255,255,255,0.1)'}`,
                boxShadow: sel ? '0 0 28px rgba(57,255,20,0.28), 0 20px 40px rgba(0,0,0,0.5)' : '0 10px 24px rgba(0,0,0,0.35)',
                transform: sel
                  ? 'rotateY(0deg) translateZ(18px) scale(1.05)'
                  : `rotateY(${offset * 12}deg) translateZ(-10px) scale(0.96)`,
                opacity: sel || style === '' ? 1 : 0.55,
                transition: 'transform 0.4s cubic-bezier(0.22,1,0.36,1), opacity 0.4s ease, box-shadow 0.4s ease, border-color 0.3s ease',
                transformStyle: 'preserve-3d',
              }}
            >
              <div style={{
                width: 40, height: 40, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: `${color}22`, marginBottom: 10,
              }}>
                <Icon size={22} color={color} />
              </div>
              <div style={{ fontSize: 14, fontWeight: 800, color: color, marginBottom: 4 }}>{s.name}</div>
              <div style={{ fontSize: 9.5, lineHeight: 1.4, color: 'rgba(255,255,255,0.6)', marginBottom: 12, minHeight: 40 }}>{s.desc}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <StatBar label="TEMPO" value={s.stats.tempo} color={color} active={sel} />
                <StatBar label="PLAN" value={s.stats.plan} color={color} active={sel} />
                <StatBar label="KEYİF" value={s.stats.keyif} color={color} active={sel} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default StepStyle;
