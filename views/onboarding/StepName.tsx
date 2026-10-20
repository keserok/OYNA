import React from 'react';
import { Gender, OnboardingPosition, POSITION_ABBR, POSITION_LABEL, trUpper } from './onboardingShared';

interface StepNameProps {
  firstName?: string;
  lastName?: string;
  gender?: Gender;
  position: OnboardingPosition;
  onFirst?: (v: string) => void;
  onLast?: (v: string) => void;
  onGender?: (g: Gender) => void;
  onPosition: (p: OnboardingPosition) => void;
  error?: string | null;
}

const SPHERE = 'radial-gradient(circle at 32% 28%, #C8FFB0, #4DFF2A 45%, #17B356 72%, #075B2C)';

const POSITIONS: [Exclude<OnboardingPosition, ''>, string, string][] = [
  ['kaleci', POSITION_ABBR.kaleci, POSITION_LABEL.kaleci],
  ['defans', POSITION_ABBR.defans, POSITION_LABEL.defans],
  ['orta', POSITION_ABBR.orta, POSITION_LABEL.orta],
  ['forvet', POSITION_ABBR.forvet, POSITION_LABEL.forvet],
];

const POSITION_DETAILS: Record<Exclude<OnboardingPosition, ''>, { role: string; desc: string; zoneIndex: number }> = {
  kaleci: {
    role: 'SON KALE · REFLEKS & OYUN KURMA',
    desc: 'Ceza sahası hakimiyeti, bire bir kurtarışlar ve geriden oyun başlatma.',
    zoneIndex: 0,
  },
  defans: {
    role: 'SAVUNMA HATTI · TOP KESME & DENGE',
    desc: 'Rakip atakları karşılama, ikili mücadele ve güvenli pas bağlantısı.',
    zoneIndex: 1,
  },
  orta: {
    role: 'MERKEZ KOMUTA · TEMPO & PAS TRAFİĞİ',
    desc: 'Savunma ile hücum arasındaki köprü, oyun görüşü ve saha içi liderlik.',
    zoneIndex: 2,
  },
  forvet: {
    role: 'HÜCUM HATTI · BİTİRİCİLİK & PRES',
    desc: 'Gol vuruşları, savunma arkası koşular ve ön alan baskısı.',
    zoneIndex: 3,
  },
};

/**
 * Adım 2 · Mevki ("Sahne senin."):
 * Apple Guideline 4 (Sign in with Apple) ve Guideline 5.1.1(v) (Data Minimization)
 * gereği oturum açmış kullanıcıdan tekrar ad/soyad veya cinsiyet istenmez.
 * Kullanıcı 3B taktik küre ve interaktif saha önizlemesiyle yalnızca dilerse
 * mevkisini seçer (POZİSYON · OPSİYONEL).
 */
const StepName: React.FC<StepNameProps> = ({ firstName = '', lastName = '', position, onPosition }) => {
  const orbitWord = trUpper((lastName.trim() || firstName.trim() || 'OYNA').slice(0, 10));
  const letters = orbitWord.split('');
  const initials =
    (trUpper(firstName.trim()).charAt(0) || '') + (trUpper(lastName.trim()).charAt(0) || '') || 'OY';
  const activeDetail = position ? POSITION_DETAILS[position] : null;

  return (
    <div
      className="flex-1 flex flex-col justify-between gap-4 overflow-y-auto custom-scrollbar"
      style={{ animation: 'obStepIn 0.55s cubic-bezier(0.22,1,0.36,1) both' }}
    >
      {/* 3B Taktik Küre + Yörünge Halkası */}
      <div style={{ position: 'relative', height: 156, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ position: 'relative', width: 176, height: 156, perspective: '520px' }}>
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              width: 132,
              height: 132,
              margin: '-66px 0 0 -66px',
              borderRadius: '50%',
              border: position ? '1.5px solid rgba(57,255,20,0.38)' : '2px dashed rgba(255,255,255,0.18)',
              boxShadow: position ? '0 0 28px rgba(57,255,20,0.18)' : 'none',
              transition: 'border-color 0.35s ease, box-shadow 0.35s ease',
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              width: 0,
              height: 0,
              transformStyle: 'preserve-3d',
              animation: 'obSpinY 12s linear infinite',
            }}
          >
            {letters.map((ch, i) => (
              <span
                key={i}
                style={{
                  position: 'absolute',
                  left: -9,
                  top: -14,
                  width: 18,
                  textAlign: 'center',
                  fontSize: 20,
                  fontWeight: 900,
                  color: position ? 'rgba(57,255,20,0.72)' : 'rgba(255,255,255,0.48)',
                  transform: `rotateY(${(360 / letters.length) * i}deg) translateZ(90px)`,
                }}
              >
                {ch}
              </span>
            ))}
          </div>
          {/* Merkez küre */}
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              width: 60,
              height: 60,
              margin: '-30px 0 0 -30px',
              borderRadius: '50%',
              background: SPHERE,
              boxShadow:
                'inset -6px -8px 14px rgba(0,0,0,0.35), inset 4px 4px 8px rgba(255,255,255,0.25), 0 0 28px rgba(57,255,20,0.45)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#06210A',
              fontWeight: 900,
              fontSize: 18,
              letterSpacing: '-0.02em',
            }}
          >
            {initials}
          </div>
        </div>
      </div>

      {/* İnteraktif Taktik Saha Önizlemesi */}
      <div
        style={{
          borderRadius: 18,
          padding: '14px 16px',
          background: 'rgba(255,255,255,0.04)',
          border: position ? '1px solid rgba(57,255,20,0.32)' : '1px solid rgba(255,255,255,0.08)',
          transition: 'all 0.3s ease',
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6, marginBottom: 12 }}>
          {POSITIONS.map(([p, abbr]) => {
            const active = position === p;
            return (
              <div
                key={p}
                style={{
                  height: 8,
                  borderRadius: 999,
                  background: active ? '#39FF14' : 'rgba(255,255,255,0.1)',
                  boxShadow: active ? '0 0 12px rgba(57,255,20,0.65)' : 'none',
                  transition: 'all 0.25s ease',
                }}
                title={abbr}
              />
            );
          })}
        </div>
        <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.14em', color: position ? '#39FF14' : 'rgba(255,255,255,0.45)' }}>
          {activeDetail ? activeDetail.role : 'SERBEST ROL · İSTEDİĞİN ZAMAN DEĞİŞTİREBİLİRSİN'}
        </div>
        <div style={{ fontSize: 12.5, lineHeight: 1.45, color: 'rgba(255,255,255,0.72)', marginTop: 4 }}>
          {activeDetail
            ? activeDetail.desc
            : 'Maç kadrolarında tercih ettiğin bölgeyi seçebilir veya doğrudan devam edebilirsin.'}
        </div>
      </div>

      {/* Pozisyon (opsiyonel) */}
      <div>
        <div
          style={{
            fontSize: 10,
            fontWeight: 900,
            letterSpacing: '0.14em',
            color: 'rgba(255,255,255,0.4)',
            marginBottom: 8,
          }}
        >
          POZİSYON · OPSİYONEL
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
          {POSITIONS.map(([p, abbr, label]) => {
            const sel = position === p;
            return (
              <button
                key={p}
                type="button"
                onClick={() => onPosition(sel ? '' : p)}
                style={{
                  height: 62,
                  borderRadius: 14,
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 3,
                  background: sel ? 'rgba(57,255,20,0.14)' : 'rgba(255,255,255,0.05)',
                  border: sel ? '1px solid #39FF14' : '1px solid rgba(255,255,255,0.1)',
                  color: sel ? '#39FF14' : 'rgba(255,255,255,0.75)',
                  boxShadow: sel ? '0 0 18px rgba(57,255,20,0.28)' : 'none',
                  transition: 'all 0.2s ease',
                }}
              >
                <span style={{ fontSize: 15, fontWeight: 900 }}>{abbr}</span>
                <span style={{ fontSize: 9, fontWeight: 700, opacity: 0.85 }}>{label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default StepName;
