import React, { useEffect, useRef } from 'react';

type Phase = 'idle' | 'scanning' | 'found';

interface StepLocationProps {
  phase: Phase;
  onScan: () => void;      // "Konumu Aç" — CTA'dan da tetiklenebilir
  onSkip: () => void;
}

/**
 * Adım 0 · Konum (3D radar).
 * idle → scanning (1.6s) → found (onay rozeti) → orkestratör 1.0s sonra
 * otomatik adım 1'e geçer (autoAdvance). "Şimdilik atla" doğrudan geçer.
 */
const StepLocation: React.FC<StepLocationProps> = ({ phase, onSkip }) => {
  const sweepDur = phase === 'scanning' ? '1.1s' : '3.4s';
  const foundRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (phase === 'found' && foundRef.current) {
      foundRef.current.animate(
        [{ transform: 'scale(0)', opacity: 0 }, { transform: 'scale(1.15)', opacity: 1, offset: 0.6 }, { transform: 'scale(1)', opacity: 1 }],
        { duration: 600, easing: 'cubic-bezier(0.34,1.56,0.64,1)', fill: 'forwards' },
      );
    }
  }, [phase]);

  return (
    <div
      className="flex-1 flex flex-col items-center justify-center gap-[18px]"
      style={{ animation: 'obStepIn 0.55s cubic-bezier(0.22,1,0.36,1) both' }}
    >
      <div style={{ position: 'relative', width: 260, height: 216 }}>
        <div
          style={{
            position: 'absolute', left: '50%', top: '54%', width: 230, height: 230,
            margin: '-115px 0 0 -115px', transform: 'perspective(640px) rotateX(58deg)',
          }}
        >
          <div
            style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              border: '1.5px solid rgba(57,255,20,0.3)',
              background: 'radial-gradient(circle, rgba(57,255,20,0.06), rgba(10,14,20,0.2) 70%)',
              overflow: 'hidden',
            }}
          >
            <div style={{ position: 'absolute', inset: '15%', borderRadius: '50%', border: '1px solid rgba(57,255,20,0.22)' }} />
            <div style={{ position: 'absolute', inset: '32%', borderRadius: '50%', border: '1px solid rgba(57,255,20,0.16)' }} />
            <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'rgba(57,255,20,0.14)' }} />
            <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: 'rgba(57,255,20,0.14)' }} />
            <div
              style={{
                position: 'absolute', inset: '-12%',
                animation: `obRadarSweep ${sweepDur} linear infinite`,
                background: 'conic-gradient(from 0deg, transparent 0deg, transparent 295deg, rgba(57,255,20,0.55) 344deg, rgba(57,255,20,0) 360deg)',
              }}
            />
            <div style={{ position: 'absolute', left: '50%', top: '50%', width: 8, height: 8, margin: -4, borderRadius: '50%', background: '#39FF14', boxShadow: '0 0 12px #39FF14' }} />
          </div>
          <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '1.5px solid rgba(57,255,20,0.3)', animation: 'obPulseRing 2.4s ease-out infinite' }} />
        </div>

        {phase === 'found' && (
          <div
            ref={foundRef}
            style={{
              position: 'absolute', left: '50%', top: '54%', width: 92, height: 92, margin: '-46px 0 0 -46px',
              borderRadius: '50%', background: 'rgba(57,255,20,0.14)', border: '2px solid #39FF14',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 40px rgba(57,255,20,0.45)',
            }}
          >
            <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="#39FF14" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </div>
        )}
      </div>

      <div style={{ textAlign: 'center', minHeight: 22 }}>
        <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.62)' }}>
          {phase === 'scanning' ? 'Çevren taranıyor…' : phase === 'found' ? 'Konumun onaylandı' : 'Yakınındaki sahaları ve maçları göster'}
        </p>
      </div>

      {phase === 'idle' && (
        <button
          onClick={onSkip}
          className="text-[13px]"
          style={{ color: 'rgba(255,255,255,0.45)', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          Konumsuz devam et
        </button>
      )}
    </div>
  );
};

export default StepLocation;
