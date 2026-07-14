import React, { useRef, useState, useCallback } from 'react';
import { AGE_RANGES } from './onboardingShared';

interface StepAgeProps {
  index: number;
  onChange: (i: number) => void;
  onFirstTouch: () => void;
}

const ITEM_H = 54;
const clamp = (n: number) => Math.min(AGE_RANGES.length - 1, Math.max(0, n));

/**
 * Adım 1 · Yaş (3D dikey çark). Dikey sürükleme (54px = 1 adım), fare
 * tekeri ve dokunma (5px eşikli tap guard). Varsayılan 24-30 (index 2);
 * CTA ilk etkileşime kadar pasif (onFirstTouch).
 */
const StepAge: React.FC<StepAgeProps> = ({ index, onChange, onFirstTouch }) => {
  const [floatIdx, setFloatIdx] = useState(index);
  const [dragging, setDragging] = useState(false);
  const drag = useRef({ startY: 0, startIdx: index, moved: false, active: false });

  const cur = dragging ? floatIdx : index;

  const beginDrag = useCallback((clientY: number) => {
    drag.current = { startY: clientY, startIdx: index, moved: false, active: true };
    setDragging(true);
    setFloatIdx(index);
    onFirstTouch();
  }, [index, onFirstTouch]);

  const moveDrag = useCallback((clientY: number) => {
    if (!drag.current.active) return;
    const dy = clientY - drag.current.startY;
    if (Math.abs(dy) > 5) drag.current.moved = true;
    const f = clamp(drag.current.startIdx - dy / ITEM_H);
    setFloatIdx(f);
    onChange(Math.round(f));
  }, [onChange]);

  const endDrag = useCallback(() => {
    if (!drag.current.active) return;
    const idx = clamp(Math.round(floatIdx));
    drag.current.active = false;
    setDragging(false);
    setFloatIdx(idx);
    onChange(idx);
  }, [floatIdx, onChange]);

  const onWheel = useCallback((e: React.WheelEvent) => {
    const dir = e.deltaY > 0 ? 1 : -1;
    onFirstTouch();
    onChange(clamp(index + dir));
  }, [index, onChange, onFirstTouch]);

  return (
    <div
      className="flex-1 relative select-none"
      style={{ touchAction: 'none', animation: 'obStepIn 0.55s cubic-bezier(0.22,1,0.36,1) both' }}
      onWheel={onWheel}
      onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); beginDrag(e.clientY); }}
      onPointerMove={(e) => moveDrag(e.clientY)}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {/* merkez seçim bandı */}
      <div
        style={{
          position: 'absolute', left: 16, right: 16, top: '50%', height: ITEM_H, marginTop: -ITEM_H / 2,
          borderRadius: 16, background: 'rgba(57,255,20,0.06)', border: '1.5px solid rgba(57,255,20,0.35)',
          pointerEvents: 'none',
        }}
      />
      <div style={{ position: 'absolute', inset: 0, perspective: '720px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ position: 'relative', width: '100%', height: ITEM_H, transformStyle: 'preserve-3d' }}>
          {AGE_RANGES.map((label, i) => {
            const d = i - cur;
            const ad = Math.abs(d);
            const opacity = ad > 2.2 ? 0 : Math.max(0, 1 - 0.34 * ad);
            const selected = Math.round(cur) === i;
            return (
              <div
                key={label}
                onClick={() => { if (!drag.current.moved) { onFirstTouch(); onChange(i); } }}
                style={{
                  position: 'absolute', left: 0, right: 0, height: ITEM_H,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transform: `translateY(${d * ITEM_H}px) rotateX(${-26 * d}deg) translateZ(${36 - 16 * ad}px) scale(${1 - 0.09 * ad})`,
                  opacity,
                  transition: dragging ? 'none' : 'transform 0.35s cubic-bezier(0.22,1,0.36,1), opacity 0.35s ease',
                  cursor: 'pointer',
                  fontStyle: 'italic',
                  fontWeight: 900,
                  fontSize: selected ? 28 : 22,
                  color: selected ? '#39FF14' : 'rgba(255,255,255,0.75)',
                  textShadow: selected ? '0 0 22px rgba(57,255,20,0.55)' : 'none',
                  pointerEvents: opacity < 0.1 ? 'none' : 'auto',
                }}
              >
                {label.replace('-', '–')}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default StepAge;
