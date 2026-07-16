import React from 'react';
import { Gender, OnboardingPosition, POSITION_ABBR, POSITION_LABEL, trUpper } from './onboardingShared';

interface StepNameProps {
  firstName: string;
  lastName: string;
  gender: Gender;
  position: OnboardingPosition;
  onFirst: (v: string) => void;
  onLast: (v: string) => void;
  onGender: (g: Gender) => void;
  onPosition: (p: OnboardingPosition) => void;
}

const SPHERE = 'radial-gradient(circle at 32% 28%, #C8FFB0, #4DFF2A 45%, #17B356 72%, #075B2C)';

const GENDERS: [Gender, string, string][] = [
  ['kadin', 'Kadın', '♀'],
  ['erkek', 'Erkek', '♂'],
];
const POSITIONS: [OnboardingPosition, string, string][] = [
  ['kaleci', POSITION_ABBR.kaleci, POSITION_LABEL.kaleci],
  ['defans', POSITION_ABBR.defans, POSITION_LABEL.defans],
  ['orta', POSITION_ABBR.orta, POSITION_LABEL.orta],
  ['forvet', POSITION_ABBR.forvet, POSITION_LABEL.forvet],
];

const inputBase: React.CSSProperties = {
  height: 52, borderRadius: 14, width: '100%', padding: '0 16px',
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
  color: '#fff', fontSize: 15, fontWeight: 600, outline: 'none',
};

/** Adım 2 · İsim ("Sahne senin."): ad/soyad + soyadı halkası + küre avatar
 *  + opsiyonel cinsiyet ve pozisyon. */
const StepName: React.FC<StepNameProps> = ({ firstName, lastName, gender, position, onFirst, onLast, onGender, onPosition }) => {
  const lastUpper = trUpper(lastName.trim());
  const letters = lastUpper.split('');
  const initials = (trUpper(firstName.trim()).charAt(0) || '') + (lastUpper.charAt(0) || '');

  return (
    <div className="flex-1 flex flex-col gap-4 overflow-y-auto custom-scrollbar" style={{ animation: 'obStepIn 0.55s cubic-bezier(0.22,1,0.36,1) both' }}>
      {/* Soyadı halkası sahnesi */}
      <div style={{ position: 'relative', height: 150, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ position: 'relative', width: 170, height: 150, perspective: '520px' }}>
          {letters.length === 0 ? (
            <div style={{
              position: 'absolute', left: '50%', top: '50%', width: 128, height: 128, margin: '-64px 0 0 -64px',
              borderRadius: '50%', border: '2px dashed rgba(255,255,255,0.18)', animation: 'obSpinY 14s linear infinite',
            }} />
          ) : (
            <div style={{
              position: 'absolute', left: '50%', top: '50%', width: 0, height: 0,
              transformStyle: 'preserve-3d', animation: 'obSpinY 11s linear infinite',
            }}>
              {letters.map((ch, i) => (
                <span key={i} style={{
                  position: 'absolute', left: -9, top: -14, width: 18, textAlign: 'center',
                  fontSize: 22, fontWeight: 900, color: 'rgba(255,255,255,0.55)',
                  transform: `rotateY(${(360 / letters.length) * i}deg) translateZ(92px)`,
                }}>{ch}</span>
              ))}
            </div>
          )}
          {/* merkez küre */}
          <div style={{
            position: 'absolute', left: '50%', top: '50%', width: 54, height: 54, margin: '-27px 0 0 -27px',
            borderRadius: '50%', background: SPHERE,
            boxShadow: 'inset -6px -8px 14px rgba(0,0,0,0.35), inset 4px 4px 8px rgba(255,255,255,0.25), 0 0 24px rgba(57,255,20,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 900, fontSize: 18, textShadow: '0 1px 3px rgba(0,0,0,0.4)',
          }}>{initials}</div>
        </div>
      </div>

      {/* Girişler */}
      <input style={inputBase} placeholder="Adın" value={firstName} maxLength={24} onChange={(e) => onFirst(e.target.value)} />
      <input style={inputBase} placeholder="Soyadın" value={lastName} maxLength={24} onChange={(e) => onLast(e.target.value)} />

      {/* Cinsiyet (opsiyonel) */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.14em', color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>CİNSİYET · OPSİYONEL</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {GENDERS.map(([g, label, sym]) => {
            const sel = gender === g;
            return (
              <button key={g} onClick={() => onGender(sel ? '' : g)} style={{
                flex: 1, height: 46, borderRadius: 14, cursor: 'pointer',
                background: sel ? 'rgba(57,255,20,0.12)' : 'rgba(255,255,255,0.05)',
                border: sel ? '1px solid #39FF14' : '1px solid rgba(255,255,255,0.1)',
                color: sel ? '#39FF14' : 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: 700,
                boxShadow: sel ? '0 0 18px rgba(57,255,20,0.25)' : 'none',
              }}>{sym} {label}</button>
            );
          })}
        </div>
      </div>

      {/* Pozisyon (opsiyonel) */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.14em', color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>POZİSYON · OPSİYONEL</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
          {POSITIONS.map(([p, abbr, label]) => {
            const sel = position === p;
            return (
              <button key={p} onClick={() => onPosition(sel ? '' : p)} style={{
                height: 54, borderRadius: 14, cursor: 'pointer', display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 2,
                background: sel ? 'rgba(57,255,20,0.12)' : 'rgba(255,255,255,0.05)',
                border: sel ? '1px solid #39FF14' : '1px solid rgba(255,255,255,0.1)',
                color: sel ? '#39FF14' : 'rgba(255,255,255,0.7)',
                boxShadow: sel ? '0 0 18px rgba(57,255,20,0.25)' : 'none',
              }}>
                <span style={{ fontSize: 15, fontWeight: 900 }}>{abbr}</span>
                <span style={{ fontSize: 8.5, fontWeight: 700, opacity: 0.8 }}>{label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default StepName;
